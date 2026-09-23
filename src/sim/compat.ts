/**
 * 시설 능력치 합산 (trim: 콤보 12·옛 자리 보너스 12를 걷어내고 명당 24 + 세트만 남겼다).
 *
 * 인기 = 기본 + 강화 아이템 + 손님 효과 + 명당 + 세트 배수 → 상한 40 → 증축 Lv 가산 − 노후.
 * 요금% = 기본 + 강화 아이템 + 증축 Lv + 명소 Lv + 명당.
 */
import type { GameState, PlacedObject, SetDef, ActiveSet, ObjectStats, ComboTarget } from './types.ts';
import { objectDef, SETS, guestTags, targetMatches } from '../data/index.ts';
import { objectScenery, itemScenery, sizeOf } from './grid.ts';
import { layoutSig } from './layoutRev.ts';
import { checkCodexTickets } from './mileage.ts';
import { seasonOf } from './clock.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { levelOf, LEVEL_POPULARITY, LEVEL_SCENERY, LEVEL_FEE_PCT, LEVEL_MENU_PCT } from './upgrade.ts';
import { wearOf, upkeepMultOf } from './cleanliness.ts';
import { isStopped } from './effects.ts'; // stakes: 설비 고장으로 멈춘 시설은 인기 0
import { spotFeePct } from './spots.ts';
import { cornerBonusAt, cornerPickMult, cornerSatisfactionAt, discoverCorners } from './corners.ts';

/** ObjectDef에 popularity·feePct가 없을 때 (v1 objects.json) */
export const BASE_POPULARITY = 10;
export const BASE_FEE_PCT = 100;
/** 인기 상한 (마스터 GDD §2.2). 증축 Lv 가산(+4/+8)은 이 상한과 별도로 더해져 최대 48. */
export const POPULARITY_CAP = 40;
/** 손님층 고르기 배수 상한 (명당 태그 배수 누적) */
export const PICK_MULT_CAP = 2.0;

/** 종류별 색인 항목: 발자국 크기를 같이 들어 거리 계산에서 objectDef 조회를 피한다 */
interface Entry { o: PlacedObject; w: number; h: number }
type ByType = Map<string, Entry[]>;
function entryOf(o: PlacedObject): Entry {
  const { w, h } = sizeOf(o); // 본관 증축 w/h (y-indoor)
  return { o, w, h };
}
/** 두 오브젝트 발자국 사이의 체비쇼프 거리 (가장 가까운 칸끼리). 겹치면 0. */
function dist(a: Entry, b: Entry): number {
  const dx = Math.max(0, a.o.x - (b.o.x + b.w - 1), b.o.x - (a.o.x + a.w - 1));
  const dy = Math.max(0, a.o.y - (b.o.y + b.h - 1), b.o.y - (a.o.y + a.h - 1));
  return Math.max(dx, dy);
}
/** 오브젝트를 종류별로 묶는다 (한 번 만들어 여러 판정에 재사용).
 *  같은 틱·같은 오브젝트 집합이면 캐시를 쓴다 — 배치·제거는 count나 nextId를 바꾸고, 이동은 참조가 같아 좌표를 그대로 읽는다. */
const INDEX_CACHE = new WeakMap<GameState, { key: string; by: ByType }>();
function indexByType(state: GameState): ByType {
  const key = layoutSig(state); // 배치 서명 (layoutRev.ts): 스텝(tick)이 아니라 배치가 바뀔 때만 다시 묶는다
  const hit = INDEX_CACHE.get(state);
  if (hit && hit.key === key) return hit.by;
  const by: ByType = new Map();
  for (const o of Object.values(state.objects)) {
    const arr = by.get(o.type);
    const e = entryOf(o);
    if (arr) arr.push(e); else by.set(o.type, [e]);
  }
  INDEX_CACHE.set(state, { key, by });
  return by;
}

/** 손님층이 이 시설을 고를 확률 배수: 반경 안 명당 중 태그가 맞는 것마다 ×tagMult, 최대 ×2.0. — guests.ts(E) pickVisit 훅용 */
export function guestPickMult(state: GameState, objId: string, typeId: string): number {
  const obj = state.objects[objId];
  if (!obj) return 1;
  return Math.min(PICK_MULT_CAP, cornerPickMult(state, obj, typeId));
}
/** 명당 만족 가산 (태그가 맞으면 +5, 전체 대상 명당은 +3). — guests.ts(E) 만족 판정 훅용 */
export function cornerSatisfaction(state: GameState, objId: string, typeId: string): number {
  const obj = state.objects[objId];
  return obj ? cornerSatisfactionAt(state, obj, typeId) : 0;
}

/** 반경 안(자기 포함) 필요 시설 개수로 세트 레벨. 1배 → 1, 2배 → 2, 3배 → 3. 레벨 0은 뺀다. */
export function setLevels(state: GameState, objId: string, sets: SetDef[] = SETS): ActiveSet[] {
  const obj = state.objects[objId];
  return obj ? setLevelsOf(entryOf(obj), sets, indexByType(state)) : [];
}
function setLevelsOf(obj: Entry, sets: SetDef[], by: ByType): ActiveSet[] {
  const out: ActiveSet[] = [];
  for (const st of sets) {
    let level = st.levelMult.length;
    for (const req of st.requires) {
      const cands = by.get(req.objectId);
      if (!cands || cands.length < req.count) { level = 0; break; }
      let n = 0;
      for (const e of cands) if (dist(obj, e) <= st.radius) n++;
      level = Math.min(level, Math.floor(n / req.count));
      if (level === 0) break;
    }
    if (level > 0) out.push({ id: st.id, name: st.name, level, target: st.target, mult: st.levelMult[level - 1] ?? 1 });
  }
  return out;
}

function setMult(sets: ActiveSet[], pick: (target: ComboTarget) => boolean): number {
  return sets.reduce((m, s) => (pick(s.target) ? m * s.mult : m), 1);
}
function clampPop(n: number): number {
  return Math.max(0, Math.min(POPULARITY_CAP, Math.round(n)));
}

/** 아이템·손님 효과(시설 인기)·명당을 더한 인기(세트 배수 전)와 요금 %(Lv +10%/+20%, 좌석형은 +5%/+10%, 명소 Lv +2%/+5%) */
function rawStats(state: GameState, obj: PlacedObject): { pop: number; feePct: number } {
  const def = objectDef(obj.type);
  const item = state.itemBonus[obj.type] ?? { popularity: 0, feePct: 0 };
  const level = levelOf(obj);
  const corner = cornerBonusAt(state, obj); // 반경 안 완성 명당 인기 +5·요금 +5% (합산 상한)
  const pop = (def.popularity ?? BASE_POPULARITY) + item.popularity + (state.visitBonus[obj.type] ?? 0) + corner.pop;
  const feePct = (def.feePct ?? BASE_FEE_PCT) + item.feePct + ((def.fee !== undefined ? LEVEL_FEE_PCT[level] : LEVEL_MENU_PCT[level]) ?? 0)
    + spotFeePct(state, def.category) + corner.feePct; // 명소 Lv3 +2%·Lv5 +5%
  return { pop, feePct };
}
/** 상한(40) 뒤에 더하는 인기: 증축 Lv(+4/+8) − 노후(−1~−6). 0 아래로는 안 간다. */
function finalPop(state: GameState, obj: PlacedObject, capped: number): number {
  if (isStopped(state, obj)) return 0; // stakes: 고장 나 멈춘 시설은 손님을 안 부른다
  return Math.max(0, capped + (LEVEL_POPULARITY[levelOf(obj)] ?? 0) - wearOf(state, obj));
}

/** 기본(ObjectDef) + 아이템 + 명당 + 전체 대상 세트 배수 + 계절 경치. 손님층별 값은 popularityFor. */
export function objectStats(state: GameState, objId: string, sets: SetDef[] = SETS): ObjectStats {
  const obj = state.objects[objId];
  if (!obj) throw new Error(`unknown object: ${objId}`);
  const def = objectDef(obj.type);
  const by = indexByType(state);
  const e = entryOf(obj);
  const activeSets = setLevelsOf(e, sets, by);
  const raw = rawStats(state, obj);
  const level = levelOf(obj);
  return {
    popularity: finalPop(state, obj, clampPop(raw.pop * setMult(activeSets, (t) => t === 'all'))),
    feePct: raw.feePct,
    scenery: objectScenery(def, seasonOf(state.clock.month), itemScenery(state, obj.type)) + (LEVEL_SCENERY[level] ?? 0),
    noise: def.noise,
    upkeep: Math.round(def.upkeep * upkeepMultOf(state, obj)),
    sets: activeSets,
    corner: cornerBonusAt(state, obj),
    level,
    wear: wearOf(state, obj),
  };
}

/** 손님층이 보는 인기 = (기본 + 아이템 + 명당) × 그 태그에 맞는 세트 배수, 상한 40 */
export function popularityFor(state: GameState, objId: string, typeId: string, sets: SetDef[] = SETS): number {
  const obj = state.objects[objId];
  if (!obj) return BASE_POPULARITY;
  const by = indexByType(state);
  const e = entryOf(obj);
  const pop = rawStats(state, obj).pop;
  const tags = guestTags(typeId);
  return finalPop(state, obj, clampPop(pop * setMult(setLevelsOf(e, sets, by), (t) => targetMatches(t, tags))));
}

/** 배치·이동·완공 뒤: 처음 완성한 세트·명당을 도감에 올린다. */
export function discoverPlacement(state: GameState, sets: SetDef[] = SETS): void {
  const before = state.codex.sets.length;
  const by = indexByType(state);
  for (const arr of by.values()) for (const obj of arr) {
    for (const st of setLevelsOf(obj, sets, by)) {
      if (state.codex.sets.includes(st.id)) continue;
      state.codex.sets.push(st.id);
      pushNotice(state, `세트 완성! ${st.name}`);
      pushFx(state, { kind: 'scene', title: '세트 완성', text: `${st.name} 세트 완성! 도감에 올랐어요`, tick: state.tick });
    }
  }
  if (state.codex.sets.length !== before) checkCodexTickets(state);
  discoverCorners(state); // 처음 완성한 명당 → 도감·장면 창·팻말 반짝
}

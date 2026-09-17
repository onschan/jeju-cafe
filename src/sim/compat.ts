import type { GameState, PlacedObject, ComboDef, SetDef, ActiveCombo, ActiveSet, ObjectStats, ComboTarget } from './types.ts';
import { objectDef, COMBOS, SETS, COMBO_META, GUEST_TYPES, guestTags, targetMatches } from '../data/index.ts';
import { objectScenery } from './grid.ts';
import { seasonOf } from './clock.ts';
import { pushNotice } from './staff.ts';

/** ObjectDef에 popularity·feePct가 없을 때 (v1 objects.json) */
export const BASE_POPULARITY = 10;
export const BASE_FEE_PCT = 100;
/** 인기 상한 (마스터 GDD §2.2) */
export const POPULARITY_CAP = 40;

/** 'table_*'처럼 끝이 *면 접두 일치 */
function typeMatches(type: string, pattern: string): boolean {
  return pattern.endsWith('*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern;
}
function isB(type: string, combo: ComboDef): boolean {
  return combo.bIds.some((p) => typeMatches(type, p));
}

/** 종류별 색인 항목: 발자국 크기를 같이 들어 거리 계산에서 objectDef 조회를 피한다 */
interface Entry { o: PlacedObject; w: number; h: number }
type ByType = Map<string, Entry[]>;
function entryOf(o: PlacedObject): Entry {
  const d = objectDef(o.type);
  return { o, w: d.w, h: d.h };
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
  const key = `${state.tick}/${Object.keys(state.objects).length}/${state.nextId}`;
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
function* ofPattern(by: ByType, pattern: string): Iterable<Entry> {
  if (!pattern.endsWith('*')) { yield* by.get(pattern) ?? []; return; }
  const prefix = pattern.slice(0, -1);
  for (const [type, arr] of by) if (type.startsWith(prefix)) yield* arr;
}

/** 오브젝트 종류마다 관련 있는 콤보만 (콤보 목록별로 캐시) */
const RELEVANT = new WeakMap<ComboDef[], Map<string, ComboDef[]>>();
function relevantCombos(type: string, combos: ComboDef[]): ComboDef[] {
  let m = RELEVANT.get(combos);
  if (!m) { m = new Map(); RELEVANT.set(combos, m); }
  let list = m.get(type);
  if (!list) { list = combos.filter((c) => c.a === type || isB(type, c)); m.set(type, list); }
  return list;
}

/** A 오브젝트 주변(반경) B가 bCount 이상인가 */
function comboActiveAt(a: Entry, combo: ComboDef, by: ByType): boolean {
  let n = 0;
  const seen = combo.bIds.length > 1 ? new Set<string>() : null;
  for (const p of combo.bIds) for (const e of ofPattern(by, p)) {
    if (e.o.id === a.o.id || seen?.has(e.o.id)) continue;
    seen?.add(e.o.id);
    if (dist(a, e) <= combo.radius && ++n >= combo.bCount) return true;
  }
  return false;
}

function activeCombosOf(obj: Entry, combos: ComboDef[], by: ByType): ActiveCombo[] {
  const out: ActiveCombo[] = [];
  for (const c of relevantCombos(obj.o.type, combos)) {
    if (obj.o.type === c.a && c.applyTo !== 'b' && comboActiveAt(obj, c, by)) {
      out.push({ id: c.id, name: c.name, strength: c.strength, side: 'a', hidden: c.hidden, target: c.target, effectText: c.effectText });
      continue;
    }
    if (c.applyTo !== 'a' && isB(obj.o.type, c)) {
      const anchored = (by.get(c.a) ?? []).some((a) => a.o.id !== obj.o.id && dist(a, obj) <= c.radius && comboActiveAt(a, c, by));
      if (anchored) out.push({ id: c.id, name: c.name, strength: c.strength, side: 'b', hidden: c.hidden, target: c.target, effectText: c.effectText });
    }
  }
  return out;
}

/** 이 오브젝트가 지금 받고 있는 상성 목록. A쪽이면 B가 충분히 가까울 때, B쪽이면 발동 중인 A가 반경 안에 있을 때. */
export function activeCombos(state: GameState, objId: string, combos: ComboDef[] = COMBOS): ActiveCombo[] {
  const obj = state.objects[objId];
  return obj ? activeCombosOf(entryOf(obj), combos, indexByType(state)) : [];
}

function comboDelta(strength: ActiveCombo['strength']): { pop: number; feePct: number } {
  return strength === 'none' ? { pop: 0, feePct: 0 } : COMBO_META[strength];
}

/** 대상 손님층 콤보 → 손님층 id별 가산 인기 (±3). 대상이 전체인 콤보는 안 들어간다. */
export function segmentBonus(state: GameState, objId: string, combos: ComboDef[] = COMBOS): Record<string, number> {
  return segmentBonusOf(activeCombos(state, objId, combos));
}
function segmentBonusOf(active: ActiveCombo[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of active) {
    if (c.target === 'all' || c.strength === 'none') continue;
    const sign = c.strength === 'down' ? -1 : 1;
    for (const t of GUEST_TYPES) if (targetMatches(c.target, guestTags(t.id))) out[t.id] = (out[t.id] ?? 0) + sign * COMBO_META.segmentPopularity;
  }
  return out;
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

/** 상성·아이템·손님 효과(시설 인기, +10 상한)를 더한 인기(세트 배수 전)와 요금 % */
function rawStats(state: GameState, obj: PlacedObject, active: ActiveCombo[]): { pop: number; feePct: number } {
  const def = objectDef(obj.type);
  const item = state.itemBonus[obj.type] ?? { popularity: 0, feePct: 0 };
  let pop = (def.popularity ?? BASE_POPULARITY) + item.popularity + (state.visitBonus[obj.type] ?? 0);
  let feePct = (def.feePct ?? BASE_FEE_PCT) + item.feePct;
  for (const c of active) {
    const d = comboDelta(c.strength);
    pop += d.pop;
    feePct += d.feePct;
  }
  return { pop, feePct };
}

/** 기본(ObjectDef) + 상성 + 아이템 + 전체 대상 세트 배수 + 계절 경치. 손님층별 값은 popularityFor. */
export function objectStats(state: GameState, objId: string, combos: ComboDef[] = COMBOS, sets: SetDef[] = SETS): ObjectStats {
  const obj = state.objects[objId];
  if (!obj) throw new Error(`unknown object: ${objId}`);
  const def = objectDef(obj.type);
  const by = indexByType(state);
  const e = entryOf(obj);
  const active = activeCombosOf(e, combos, by);
  const activeSets = setLevelsOf(e, sets, by);
  const raw = rawStats(state, obj, active);
  return {
    popularity: clampPop(raw.pop * setMult(activeSets, (t) => t === 'all')),
    feePct: raw.feePct,
    scenery: objectScenery(def, seasonOf(state.clock.month)),
    noise: def.noise,
    upkeep: def.upkeep,
    combos: active,
    sets: activeSets,
    segmentBonus: segmentBonusOf(active),
  };
}

/** 손님층이 보는 인기 = (기본 + 상성 + 아이템 + 손님층 가산) × 그 태그에 맞는 세트 배수, 상한 40 */
export function popularityFor(state: GameState, objId: string, typeId: string, combos: ComboDef[] = COMBOS, sets: SetDef[] = SETS): number {
  const obj = state.objects[objId];
  if (!obj) return BASE_POPULARITY;
  const by = indexByType(state);
  const e = entryOf(obj);
  const active = activeCombosOf(e, combos, by);
  const pop = rawStats(state, obj, active).pop + (segmentBonusOf(active)[typeId] ?? 0);
  const tags = guestTags(typeId);
  return clampPop(pop * setMult(setLevelsOf(e, sets, by), (t) => targetMatches(t, tags)));
}

/** 배치·이동 뒤: 처음 발동한 상성·세트를 도감에 올린다. 히든 상성·세트 완성은 알림. */
export function discoverCombos(state: GameState, combos: ComboDef[] = COMBOS, sets: SetDef[] = SETS): void {
  const by = indexByType(state);
  for (const arr of by.values()) for (const obj of arr) {
    for (const c of activeCombosOf(obj, combos, by)) {
      if (state.codex.combos.includes(c.id)) continue;
      state.codex.combos.push(c.id);
      if (c.hidden) pushNotice(state, `숨은 상성 발견! ${c.name}`);
    }
    for (const st of setLevelsOf(obj, sets, by)) {
      if (state.codex.sets.includes(st.id)) continue;
      state.codex.sets.push(st.id);
      pushNotice(state, `세트 완성! ${st.name}`);
    }
  }
}

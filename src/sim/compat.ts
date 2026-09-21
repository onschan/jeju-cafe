import type { GameState, PlacedObject, ComboDef, SetDef, SpotEffectDef, ActiveCombo, ActiveSet, ActiveSpotEffect, ObjectStats, ComboTarget } from './types.ts';
import { objectDef, COMBOS, SETS, SPOT_EFFECTS, COMBO_META, GUEST_TYPES, guestTags, targetMatches } from '../data/index.ts';
import { objectScenery, itemScenery, sizeOf } from './grid.ts';
import { layoutSig } from './layoutRev.ts';
import { addMileage, checkCodexMileage } from './mileage.ts';
import { seasonOf } from './clock.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { levelOf, LEVEL_POPULARITY, LEVEL_SCENERY, LEVEL_FEE_PCT, LEVEL_MENU_PCT, LEVEL_COMBO_MULT } from './upgrade.ts';
import { wearOf, upkeepMultOf } from './cleanliness.ts';
import { spotFeePct } from './spots.ts';

/** ObjectDef에 popularity·feePct가 없을 때 (v1 objects.json) */
export const BASE_POPULARITY = 10;
export const BASE_FEE_PCT = 100;
/** 인기 상한 (마스터 GDD §2.2). 증축 Lv 가산(+4/+8)은 이 상한과 별도로 더해져 최대 48. */
export const POPULARITY_CAP = 40;
/** 콤보 누적 상한 (스펙 §3.1-3): 상승 합계 인기 +12 / 요금 +20%, 하락 합계 −9 / −15%. 상승·하락은 따로 합산한 뒤 더한다. */
export const COMBO_UP_CAP = { pop: 12, feePct: 20 };
export const COMBO_DOWN_CAP = { pop: -9, feePct: -15 };
/** 손님층 콤보: 그 태그 손님이 이 시설을 고를 확률 ×1.3(콤보 1개당, 최대 ×2.0) + 만족 +5. 전체 대상은 만족 +3. */
export const COMBO_PICK_MULT = 1.3;
export const COMBO_PICK_CAP = 2.0;
export const COMBO_SATISFACTION = 5;
export const COMBO_SATISFACTION_ALL = 3;
/** 히든 콤보 첫 발견 응모권 */
export const HIDDEN_COMBO_TICKETS = 1;

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

/** A 오브젝트 주변(반경) B 개체 수 → 발동 횟수 (bCount마다 1회). 같은 콤보는 상대가 다른 개체일 때마다 다시 센다 (스펙 §3.1-2). */
function comboCountAt(a: Entry, combo: ComboDef, by: ByType): number {
  let n = 0;
  const seen = combo.bIds.length > 1 ? new Set<string>() : null;
  for (const p of combo.bIds) for (const e of ofPattern(by, p)) {
    if (e.o.id === a.o.id || seen?.has(e.o.id)) continue;
    seen?.add(e.o.id);
    if (dist(a, e) <= combo.radius) n++;
  }
  return Math.floor(n / Math.max(1, combo.bCount));
}
function comboActiveAt(a: Entry, combo: ComboDef, by: ByType): boolean {
  return comboCountAt(a, combo, by) > 0;
}

function activeCombosOf(obj: Entry, combos: ComboDef[], by: ByType): ActiveCombo[] {
  const out: ActiveCombo[] = [];
  for (const c of relevantCombos(obj.o.type, combos)) {
    if (obj.o.type === c.a && c.applyTo !== 'b') {
      const count = comboCountAt(obj, c, by);
      if (count > 0) { out.push({ id: c.id, name: c.name, strength: c.strength, side: 'a', hidden: c.hidden, target: c.target, effectText: c.effectText, count }); continue; }
    }
    if (c.applyTo !== 'a' && isB(obj.o.type, c)) {
      const anchors = (by.get(c.a) ?? []).filter((a) => a.o.id !== obj.o.id && dist(a, obj) <= c.radius && comboActiveAt(a, c, by)).length;
      if (anchors > 0) out.push({ id: c.id, name: c.name, strength: c.strength, side: 'b', hidden: c.hidden, target: c.target, effectText: c.effectText, count: anchors });
    }
  }
  return out;
}

/** 손님층이 이 시설을 고를 확률 배수: 그 태그 대상 콤보 1개(발동 횟수 포함)당 ×1.3, 최대 ×2.0. 명당이면 ×1.5 추가. — guests.ts(E) pickVisit 훅용 */
export function comboPickMult(state: GameState, objId: string, typeId: string, combos: ComboDef[] = COMBOS): number {
  const obj = state.objects[objId];
  if (!obj) return 1;
  const tags = guestTags(typeId);
  let n = 0;
  for (const c of activeCombos(state, objId, combos)) if (c.target !== 'all' && c.strength !== 'down' && c.strength !== 'none' && targetMatches(c.target, tags)) n += c.count;
  const spot = spotEffectOf(entryOf(obj), SPOT_EFFECTS, indexByType(state));
  return Math.min(COMBO_PICK_CAP, Math.pow(COMBO_PICK_MULT, n)) * (spot && targetMatches(spot.target, tags) ? spot.guestMult : 1);
}
/** 콤보 만족 가산: 손님층 대상 콤보가 맞으면 +5, 전체 대상 콤보는 +3 (가장 큰 것 하나). — guests.ts(E) 만족 판정 훅용 */
export function comboSatisfaction(state: GameState, objId: string, typeId: string, combos: ComboDef[] = COMBOS): number {
  const tags = guestTags(typeId);
  let best = 0;
  for (const c of activeCombos(state, objId, combos)) {
    if (c.strength === 'down' || c.strength === 'none') continue;
    if (c.target === 'all') best = Math.max(best, COMBO_SATISFACTION_ALL);
    else if (targetMatches(c.target, tags)) best = Math.max(best, COMBO_SATISFACTION);
  }
  return best;
}

/** 명당 (스펙 §3.1): 중심 시설 종류가 맞고 반경 안에 필요 시설이 다 있으면. 시설 1개당 1종 — 표 순서대로 처음 만족한 것. */
function spotEffectOf(obj: Entry, spots: SpotEffectDef[], by: ByType): ActiveSpotEffect | null {
  if (obj.o.build) return null;
  for (const sp of spots) {
    if (sp.center !== obj.o.type) continue;
    let ok = true;
    for (const req of sp.requires) {
      let n = 0;
      for (const e of by.get(req.objectId) ?? []) if (e.o.id !== obj.o.id && !e.o.build && dist(obj, e) <= sp.radius) n++;
      if (n < req.count) { ok = false; break; }
    }
    if (ok) return { id: sp.id, name: sp.name, target: sp.target, guestMult: sp.guestMult, popularity: sp.popularity };
  }
  return null;
}
/** 이 시설에 걸린 명당 (없으면 null) */
export function spotEffectAt(state: GameState, objId: string, spots: SpotEffectDef[] = SPOT_EFFECTS): ActiveSpotEffect | null {
  const obj = state.objects[objId];
  return obj ? spotEffectOf(entryOf(obj), spots, indexByType(state)) : null;
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

/** 콤보 합계: 상승·하락을 따로 합산(발동 횟수 × 등급 × Lv 계수) → 각각 상한 → 더한다 */
export function comboTotal(active: ActiveCombo[], level = 1): { pop: number; feePct: number } {
  const mult = LEVEL_COMBO_MULT[level] ?? 1;
  let up = { pop: 0, feePct: 0 };
  let down = { pop: 0, feePct: 0 };
  for (const c of active) {
    const d = comboDelta(c.strength);
    const n = c.count ?? 1;
    if (c.strength === 'down') { down.pop += d.pop * n; down.feePct += d.feePct * n; } else { up.pop += d.pop * n; up.feePct += d.feePct * n; }
  }
  up = { pop: Math.min(COMBO_UP_CAP.pop, Math.round(up.pop * mult)), feePct: Math.min(COMBO_UP_CAP.feePct, Math.round(up.feePct * mult)) };
  down = { pop: Math.max(COMBO_DOWN_CAP.pop, Math.round(down.pop * mult)), feePct: Math.max(COMBO_DOWN_CAP.feePct, Math.round(down.feePct * mult)) };
  return { pop: up.pop + down.pop, feePct: up.feePct + down.feePct };
}

/** 상성(누적 상한·Lv 계수)·아이템·손님 효과(시설 인기, +10 상한)·명당(+5)을 더한 인기(세트 배수 전)와 요금 %(Lv +10%/+20%, 좌석형은 +5%/+10%, 명소 Lv +2%/+5%) */
function rawStats(state: GameState, obj: PlacedObject, active: ActiveCombo[], spot: ActiveSpotEffect | null): { pop: number; feePct: number } {
  const def = objectDef(obj.type);
  const item = state.itemBonus[obj.type] ?? { popularity: 0, feePct: 0 };
  const level = levelOf(obj);
  const total = comboTotal(active, level);
  const pop = (def.popularity ?? BASE_POPULARITY) + item.popularity + (state.visitBonus[obj.type] ?? 0) + total.pop + (spot?.popularity ?? 0);
  const feePct = (def.feePct ?? BASE_FEE_PCT) + item.feePct + total.feePct + ((def.fee !== undefined ? LEVEL_FEE_PCT[level] : LEVEL_MENU_PCT[level]) ?? 0)
    + spotFeePct(state, def.category); // 트랙 C: 명소 Lv3 +2%·Lv5 +5%
  return { pop, feePct };
}
/** 상한(40) 뒤에 더하는 인기: 증축 Lv(+4/+8) − 노후(−1~−6). 0 아래로는 안 간다. */
function finalPop(state: GameState, obj: PlacedObject, capped: number): number {
  return Math.max(0, capped + (LEVEL_POPULARITY[levelOf(obj)] ?? 0) - wearOf(state, obj));
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
  const spot = spotEffectOf(e, SPOT_EFFECTS, by);
  const raw = rawStats(state, obj, active, spot);
  const level = levelOf(obj);
  return {
    popularity: finalPop(state, obj, clampPop(raw.pop * setMult(activeSets, (t) => t === 'all'))),
    feePct: raw.feePct,
    scenery: objectScenery(def, seasonOf(state.clock.month), itemScenery(state, obj.type)) + (LEVEL_SCENERY[level] ?? 0),
    noise: def.noise,
    upkeep: Math.round(def.upkeep * upkeepMultOf(state, obj)),
    combos: active,
    sets: activeSets,
    spot,
    level,
    wear: wearOf(state, obj),
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
  const spot = spotEffectOf(e, SPOT_EFFECTS, by);
  const pop = rawStats(state, obj, active, spot).pop + (segmentBonusOf(active)[typeId] ?? 0);
  const tags = guestTags(typeId);
  const spotMult = spot && targetMatches(spot.target, tags) ? spot.guestMult : 1;
  return finalPop(state, obj, clampPop(pop * setMult(setLevelsOf(e, sets, by), (t) => targetMatches(t, tags)) * spotMult));
}

/** 배치·이동·완공 뒤: 처음 발동한 상성·세트·명당을 도감에 올린다. 히든 상성은 알림 + 응모권 1, 명당은 장면 대사 + 응모권 2. */
export function discoverCombos(state: GameState, combos: ComboDef[] = COMBOS, sets: SetDef[] = SETS, spots: SpotEffectDef[] = SPOT_EFFECTS): void {
  const before = state.codex.combos.length + state.codex.sets.length + state.codex.spots.length;
  const by = indexByType(state);
  for (const arr of by.values()) for (const obj of arr) {
    for (const c of activeCombosOf(obj, combos, by)) {
      if (state.codex.combos.includes(c.id)) continue;
      state.codex.combos.push(c.id);
      if (c.hidden) { pushNotice(state, `숨은 상성 발견! ${c.name}`); state.tickets += HIDDEN_COMBO_TICKETS; }
      else pushNotice(state, `상성 발견! ${c.name} ◎ — ${objectDef(obj.o.type).name}`); // game-feel: 처음 발동한 상성은 전부 메시지 줄에 (선택의 결과가 바로 보이게)
      if (state.codex.combos.length === 1) { addMileage(state, 1); pushFx(state, { kind: 'scene', title: '첫 상성', text: `${c.name} ◎ 발동! 시설을 짝지어 놓으면 손님이 더 좋아해요. 콤보 도감에 올랐어요`, tick: state.tick }); }
      else if (c.hidden) pushFx(state, { kind: 'scene', title: '숨은 상성', text: `${c.name} ◎ — 응모권 +${HIDDEN_COMBO_TICKETS}`, tick: state.tick });
    }
    const sp = spotEffectOf(obj, spots, by);
    if (sp && !state.codex.spots.includes(sp.id)) {
      state.codex.spots.push(sp.id);
      const def = spots.find((x) => x.id === sp.id)!;
      state.tickets += def.tickets;
      pushNotice(state, `명당 발견! ${sp.name} — 응모권 +${def.tickets}`);
      pushFx(state, { kind: 'scene', title: '명당', text: `${def.line} ${sp.name}: ${objectDef(obj.o.type).name}`, tick: state.tick });
    }
    for (const st of setLevelsOf(obj, sets, by)) {
      if (state.codex.sets.includes(st.id)) continue;
      state.codex.sets.push(st.id);
      pushNotice(state, `세트 완성! ${st.name}`);
      pushFx(state, { kind: 'scene', title: '세트 완성', text: `${st.name} 세트 완성! 도감에 올랐어요`, tick: state.tick }); // game-feel: 세트는 장면 창으로
      if (state.codex.sets.length === 1) addMileage(state, 1);
    }
  }
  if (state.codex.combos.length + state.codex.sets.length + state.codex.spots.length !== before) checkCodexMileage(state);
}

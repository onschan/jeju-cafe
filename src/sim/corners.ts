/**
 * 명당 (fun-reset 스펙 §3, fun-corner): 서로 다른 시설 3~4종이 반경 2 안에 모이면 이름 있는 명당이 된다.
 *
 * - 판정: corners.json의 pieces[0] 종류 오브젝트를 "닻"으로 삼고, 나머지 조각이 닻 발자국에서 체비쇼프 거리 radius 안에
 *   count개 이상(서로 다른 개체) 있으면 완성. 같은 명당은 한 번만(맨 처음 만족한 닻) — 같은 시설을 더 놓아도 효과는 1회.
 * - 효과: 명당 중심(닻)에서 radius 안의 시설에 요금 +feePct%·인기 +popularity (합산 상한 CORNER_CAP),
 *   대상 태그 손님이 그 시설을 고를 확률 ×tagMult (compat.guestPickMult 훅), 손님이 명당을 찾아와 사진(photo 확률).
 * - 결정적: state.rng만 쓰고, 판정은 배치 서명(layoutRev.ts)으로 캐시한다.
 */
import type { GameState, PlacedObject, ComboTarget, Guest } from './types.ts';
import cornersJson from '../data/corners.json' with { type: 'json' };
import { guestTags, targetMatches } from '../data/index.ts';
import { sizeOf } from './grid.ts';
import { parcelAt } from './parcels.ts';
import { walkableNeighborsOf } from './path.ts';
import { layoutCached } from './layoutRev.ts';
import { monthIndex, DAYS_PER_MONTH } from './clock.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { nextRandom } from './rng.ts';
import { addTickets } from './mileage.ts';

export interface CornerPiece { type: string; count: number }
export interface CornerEffect { feePct: number; popularity: number; target: ComboTarget; tagMult: number; photo: number }
export interface CornerDef {
  id: string;
  name: string;
  pieces: CornerPiece[];   // 서로 다른 시설 종류 (pieces[0] = 닻)
  radius: number;          // 체비쇼프 (기본 2)
  effect: CornerEffect;
  line: string;            // 완성 장면 대사
  guestLine: string;       // 손님 말풍선
  hint: string;            // 도감 미완성 힌트 ("돌담 근처에 감귤나무")
}
/** 완성된 명당: 닻 오브젝트와 조각 id */
export interface CompletedCorner { id: string; anchorId: string; x: number; y: number; pieceIds: string[] }
/** 명당 진행 상황 (짓기 「명당」 탭·도감): 조각별 필요/보유 */
export interface CornerProgress { def: CornerDef; done: boolean; anchor: PlacedObject | null; pieces: { type: string; need: number; have: number }[]; missing: CornerPiece[] }

const TARGETS = new Set<ComboTarget>(['all', 'female', 'male', 'youth', 'adult', 'senior', 'group']);
export const CORNERS: CornerDef[] = (cornersJson as CornerDef[]).map((c) => ({
  ...c,
  radius: c.radius ?? 2,
  effect: { ...c.effect, target: TARGETS.has(c.effect.target) ? c.effect.target : 'all' },
}));
const CORNER = new Map(CORNERS.map((c) => [c.id, c]));
export function cornerDef(id: string): CornerDef {
  const c = CORNER.get(id);
  if (!c) throw new Error(`unknown corner: ${id}`);
  return c;
}
/** 이 시설 종류가 조각인 명당들 */
export function cornersWithPiece(type: string): CornerDef[] {
  return CORNERS.filter((c) => c.pieces.some((p) => p.type === type));
}

/** 시설 하나가 받는 명당 효과 합산 상한 (trim: 콤보·옛 자리 보너스를 걷어낸 만큼 명당이 그 몫을 받는다) */
export const CORNER_CAP = { pop: 10, feePct: 14 };
/** 명당 만족 가산: 태그가 맞는 명당이 반경 안에 있으면 +5, 전체 대상 명당은 +3 (가장 큰 것 하나) */
export const CORNER_SATISFACTION = 5;
export const CORNER_SATISFACTION_ALL = 3;
/** 손님이 명당을 찾아갈 가중치 (시설 대비 ×3) · 명당별 하루 방문 상한 */
export const CORNER_VISIT_WEIGHT = 3;
export const CORNER_VISITS_PER_DAY = 8;
/** 명당 완성 보상: 첫 명당 마일리지 +1 */
export const FIRST_CORNER_TICKETS = 1;

// ---------- 거리 ----------
interface Foot { x: number; y: number; w: number; h: number }
function footOf(o: PlacedObject): Foot {
  const { w, h } = sizeOf(o);
  return { x: o.x, y: o.y, w, h };
}
/** 두 발자국 사이 체비쇼프 거리 (겹치면 0) — compat.ts와 같은 규칙 */
export function footDist(a: Foot, b: Foot): number {
  const dx = Math.max(0, a.x - (b.x + b.w - 1), b.x - (a.x + a.w - 1));
  const dy = Math.max(0, a.y - (b.y + b.h - 1), b.y - (a.y + a.h - 1));
  return Math.max(dx, dy);
}

/** 명당 조각이 될 수 있는 오브젝트: 공사가 끝났고 내 필지 위 (안 산 필지의 옛 밭담·감귤밭은 안 센다). building=true면 공사 중도 센다(진행 표시용). */
function isPiece(state: GameState, o: PlacedObject, building = false): boolean {
  return (building || !o.build) && !!parcelAt(state, o.x, o.y)?.owned;
}
/** 조각 후보를 종류별로 (판정 한 번당 한 번 만든다) */
function byType(state: GameState, ignoreId?: string, extra?: PlacedObject, building = false): Map<string, PlacedObject[]> {
  const by = new Map<string, PlacedObject[]>();
  const add = (o: PlacedObject) => { const arr = by.get(o.type); if (arr) arr.push(o); else by.set(o.type, [o]); };
  for (const o of Object.values(state.objects)) if (o.id !== ignoreId && isPiece(state, o, building)) add(o);
  if (extra) add(extra);
  return by;
}

/** 닻 주변 조각 판정: 조각마다 (닻 제외) 반경 안 개체 수 → 완성이면 조각 id 목록, 아니면 null */
function piecesAround(def: CornerDef, anchor: PlacedObject, by: Map<string, PlacedObject[]>): { ids: string[]; have: number[] } {
  const foot = footOf(anchor);
  const ids: string[] = [anchor.id];
  const have: number[] = [];
  def.pieces.forEach((p, i) => {
    let n = i === 0 ? 1 : 0; // 닻 자신이 첫 조각 1개
    for (const o of by.get(p.type) ?? []) {
      if (o.id === anchor.id) continue;
      if (footDist(foot, footOf(o)) <= def.radius) { n++; if (n <= p.count) ids.push(o.id); }
    }
    have.push(Math.min(n, p.count));
  });
  return { ids, have };
}
function isComplete(def: CornerDef, have: number[]): boolean {
  return def.pieces.every((p, i) => (have[i] ?? 0) >= p.count);
}

/** 이 명당의 닻 후보 중 처음 완성되는 것 (오브젝트 등록 순 — 결정적) */
function completedOf(def: CornerDef, by: Map<string, PlacedObject[]>): CompletedCorner | null {
  for (const anchor of by.get(def.pieces[0]!.type) ?? []) {
    const r = piecesAround(def, anchor, by);
    if (isComplete(def, r.have)) return { id: def.id, anchorId: anchor.id, x: anchor.x, y: anchor.y, pieceIds: r.ids };
  }
  return null;
}

const CACHE = new WeakMap<GameState, { key: string; value: CompletedCorner[] }>();
/** 지금 완성된 명당 목록 (명당당 최대 1개). 배치가 바뀔 때만 다시 센다. */
export function completedCorners(state: GameState): CompletedCorner[] {
  return layoutCached(state, CACHE, () => {
    const by = byType(state);
    const out: CompletedCorner[] = [];
    for (const def of CORNERS) { const c = completedOf(def, by); if (c) out.push(c); }
    return out;
  });
}
/** 이 오브젝트가 조각인 완성 명당 (없으면 null) */
export function cornerOfPiece(state: GameState, objId: string): CompletedCorner | null {
  return completedCorners(state).find((c) => c.pieceIds.includes(objId)) ?? null;
}

/** 명당 진행 상황 전부 (짓기 탭·도감). 미완성은 조각을 가장 많이 모은 닻 기준. 공사 중인 조각도 "있는 것"으로 센다(짓는 중이면 done=false·missing=[]). */
export function cornerProgress(state: GameState): CornerProgress[] {
  const by = byType(state, undefined, undefined, true);
  const done = new Map(completedCorners(state).map((c) => [c.id, c]));
  return CORNERS.map((def) => {
    const d = done.get(def.id);
    let best: { anchor: PlacedObject | null; have: number[] } = { anchor: null, have: def.pieces.map(() => 0) };
    if (d) best = { anchor: state.objects[d.anchorId] ?? null, have: def.pieces.map((p) => p.count) };
    else {
      let bestSum = -1;
      for (const anchor of by.get(def.pieces[0]!.type) ?? []) {
        const r = piecesAround(def, anchor, by);
        const sum = r.have.reduce((a, b) => a + b, 0);
        if (sum > bestSum) { bestSum = sum; best = { anchor, have: r.have }; }
      }
    }
    const pieces = def.pieces.map((p, i) => ({ type: p.type, need: p.count, have: best.have[i] ?? 0 }));
    return { def, done: !!d, anchor: best.anchor, pieces, missing: pieces.filter((p) => p.have < p.need).map((p) => ({ type: p.type, count: p.need - p.have })) };
  });
}

/** 이 종류를 (x, y)에 놓으면 완성되는 명당 (짓기 고스트 배지 "이걸 놓으면 꽃길 완성"). 공사 중인 조각도 센다(완공되면 완성). 이미 완성된 명당은 뺀다. */
export function cornerIfPlaced(state: GameState, type: string, x: number, y: number, ignoreId?: string): CornerDef | null {
  const done = new Set(completedCorners(state).map((c) => c.id));
  const ghost: PlacedObject = { id: '__ghost', type, x, y, placedMonth: 0 };
  const by = byType(state, ignoreId, ghost, true);
  for (const def of cornersWithPiece(type)) {
    if (done.has(def.id)) continue;
    const c = completedOf(def, by);
    if (c && c.pieceIds.includes('__ghost')) return def;
  }
  return null;
}

// ---------- 효과 훅 ----------
/** 시설 하나가 받는 명당 인기·요금 (반경 안 완성 명당 합산, 상한) — compat.rawStats 훅 */
export function cornerBonusAt(state: GameState, obj: PlacedObject): { pop: number; feePct: number } {
  let pop = 0, feePct = 0;
  const foot = footOf(obj);
  for (const c of completedCorners(state)) {
    const def = cornerDef(c.id);
    const anchor = state.objects[c.anchorId];
    if (!anchor || footDist(foot, footOf(anchor)) > def.radius) continue;
    pop += def.effect.popularity;
    feePct += def.effect.feePct;
  }
  return { pop: Math.min(CORNER_CAP.pop, pop), feePct: Math.min(CORNER_CAP.feePct, feePct) };
}
/** 손님층이 이 시설을 고를 확률 배수: 반경 안 명당 중 태그가 맞는 것마다 ×tagMult — compat.guestPickMult 훅 */
export function cornerPickMult(state: GameState, obj: PlacedObject, typeId: string): number {
  const tags = guestTags(typeId);
  const foot = footOf(obj);
  let m = 1;
  for (const c of completedCorners(state)) {
    const def = cornerDef(c.id);
    const anchor = state.objects[c.anchorId];
    if (!anchor || footDist(foot, footOf(anchor)) > def.radius) continue;
    if (targetMatches(def.effect.target, tags)) m *= def.effect.tagMult;
  }
  return m;
}
/** 명당 만족 가산: 반경 안 완성 명당 중 태그가 맞으면 +5, 전체 대상이면 +3 (가장 큰 것 하나) — compat.cornerSatisfaction 훅 */
export function cornerSatisfactionAt(state: GameState, obj: PlacedObject, typeId: string): number {
  const tags = guestTags(typeId);
  const foot = footOf(obj);
  let best = 0;
  for (const c of completedCorners(state)) {
    const def = cornerDef(c.id);
    const anchor = state.objects[c.anchorId];
    if (!anchor || footDist(foot, footOf(anchor)) > def.radius) continue;
    if (def.effect.target === 'all') best = Math.max(best, CORNER_SATISFACTION_ALL);
    else if (targetMatches(def.effect.target, tags)) best = Math.max(best, CORNER_SATISFACTION);
  }
  return best;
}

// ---------- 손님 방문 ----------
function todayIndex(state: GameState): number {
  return monthIndex(state.clock) * DAYS_PER_MONTH + (state.clock.day - 1);
}
function visitsToday(state: GameState): Record<string, number> {
  const day = todayIndex(state);
  if (!state.cornerVisits || state.cornerVisits.day !== day) state.cornerVisits = { day, counts: {} };
  return state.cornerVisits.counts;
}
/** 오늘 아직 상한이 안 찬 명당마다 손님이 찾아갈 조각 하나 — 걷는 칸(올렛길·마을 길)이 옆에 붙은 첫 조각 (guests.pickVisit 후보에 섞는다, 가중치 ×3). 붙은 길이 없는 명당은 못 간다. */
export function cornerVisitTargets(state: GameState, typeId: string): PlacedObject[] {
  const done = completedCorners(state);
  if (done.length === 0) return [];
  const counts = visitsToday(state);
  const tags = guestTags(typeId);
  const out: PlacedObject[] = [];
  for (const c of done) {
    if ((counts[c.id] ?? 0) >= CORNER_VISITS_PER_DAY) continue;
    const def = cornerDef(c.id);
    if (def.effect.target !== 'all' && !targetMatches(def.effect.target, tags)) continue;
    const piece = c.pieceIds.map((id) => state.objects[id]).find((o) => o && reachableSide(state, o));
    if (piece) out.push(piece);
  }
  return out;
}
function reachableSide(state: GameState, o: PlacedObject): boolean {
  const { w, h } = sizeOf(o);
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) if (walkableNeighborsOf(state, o.x + dx, o.y + dy).length > 0) return true;
  return false;
}
/** 손님이 명당 조각에 도착: 방문 수 +1, photo 확률로 카메라 플래시 fx + 말풍선. 요금은 없다(장식). */
export function visitCorner(state: GameState, g: Guest, piece: PlacedObject): void {
  const c = cornerOfPiece(state, piece.id);
  if (!c) return;
  const def = cornerDef(c.id);
  const counts = visitsToday(state);
  counts[c.id] = (counts[c.id] ?? 0) + 1;
  state.stats.cornerVisits = (state.stats.cornerVisits ?? 0) + 1;
  g.say = def.guestLine;
  if (nextRandom(state) < def.effect.photo) pushFx(state, { kind: 'flash', x: piece.x, y: piece.y, guestId: g.id, text: def.guestLine, tick: state.tick });
}

// ---------- 완성 발견 (도감·연출) ----------
/** 배치·완공 뒤 (compat.discoverPlacement에서 부른다): 처음 완성한 명당을 도감에 올리고 장면 창·팻말 반짝·메시지 줄. */
export function discoverCorners(state: GameState): void {
  const codex = (state.codex.corners ??= []);
  for (const c of completedCorners(state)) {
    if (codex.includes(c.id)) continue;
    codex.push(c.id);
    const def = cornerDef(c.id);
    pushNotice(state, `${def.name} 완성! 손님이 사진 찍으러 와요`);
    pushFx(state, { kind: 'scene', title: `${def.name} 완성`, text: def.line, tick: state.tick });
    pushFx(state, { kind: 'corner', id: c.id, x: c.x, y: c.y, tick: state.tick });
    if (codex.length === 1) addTickets(state, FIRST_CORNER_TICKETS, '첫 명당');
  }
}
/** 도감에 오른(한 번이라도 만든) 명당 수 — 목표·도전 corners(n) */
/** 손님 요청(트랙 G tagCorner)용 명당 태그: photo = 사진 확률 ≥ 0.6, rest = 쉬는 명당 */
const REST_CORNERS = new Set(['corner_haenyeo_rest', 'corner_spring_rest', 'corner_rainy_eaves', 'corner_hackberry_shade', 'corner_cedar_walk', 'corner_reading_garden']);
export function cornerTags(id: string): string[] {
  const def = CORNERS.find((c) => c.id === id);
  if (!def) return [];
  const tags: string[] = [];
  if ((def.effect.photo ?? 0) >= 0.6) tags.push('photo');
  if (REST_CORNERS.has(id)) tags.push('rest');
  return tags;
}

export function cornersMade(state: GameState): number {
  return state.codex.corners?.length ?? 0;
}

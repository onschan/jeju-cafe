import type { GameState, Pt, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { layoutCached, layoutSig } from './layoutRev.ts';
import { inBounds, cellAt, objectAt, isRoomFloor, doorOf, doorFrontOf } from './grid.ts';
import { ENTRY_CELLS } from './layout.ts';
import { HOUR_MS } from './clock.ts';

const WALKABLE_KINDS = new Set(['path', 'gate', 'busstop']);

/** 길·정낭·정류장·도로, 그리고 가구가 없는 방 바닥(실내)은 걸을 수 있다 */
export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  if (isRoomFloor(state, x, y)) return true;
  const obj = objectAt(state, x, y);
  if (obj) return WALKABLE_KINDS.has(objectDef(obj.type).kind);
  return cellAt(state, x, y).terrain === 'road';
}

/** 방 경계를 넘는 걸음은 방 쪽 칸이 문일 때만. 같은 방 안·둘 다 바깥이면 자유. */
export function canStep(state: GameState, from: Pt, to: Pt): boolean {
  const a = cellAt(state, from.x, from.y).roomId;
  const b = cellAt(state, to.x, to.y).roomId;
  if (a === b) return true;
  const isDoor = (roomId: string, p: Pt) => { const d = doorOf(state.objects[roomId]!); return d.x === p.x && d.y === p.y; };
  if (a !== null && !isDoor(a, from)) return false;
  if (b !== null && !isDoor(b, to)) return false;
  return true;
}

const BUS_CACHE = new WeakMap<GameState, { key: string; value: Pt }>();
export function busStopPos(state: GameState): Pt {
  return layoutCached(state, BUS_CACHE, () => { // 배치 서명 캐시 — 스텝마다 오브젝트 전체를 훑지 않는다
    const bus = Object.values(state.objects).find((o) => o.type === 'busstop');
    if (!bus) throw new Error('정류장이 없어요');
    return { x: bus.x, y: bus.y };
  });
}

const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function walkableNeighborsOf(state: GameState, x: number, y: number): Pt[] {
  if (!inBounds(state, x, y)) return [];
  return DIRS.map((d) => ({ x: x + d.x, y: y + d.y })).filter((p) => isWalkable(state, p.x, p.y) && canStep(state, { x, y }, p));
}

export const cellKey = (state: GameState, p: Pt) => p.y * state.grid.w + p.x;

/** from에서 닿는 모든 걷기 칸까지의 거리와 직전 칸. 한 번 계산해 여러 목적지에 재사용. */
export interface Reach { from: Pt; dist: Map<number, number>; prev: Map<number, number> }

/** solver: 배치 서명(layoutRev.ts)이 같으면 같은 출발점의 BFS를 다시 하지 않는다 — 시간마다 스폰이 정류장 BFS를 새로 돌려 하루 tick의 1/4을 먹었다. 결과는 읽기 전용. */
const REACH_CACHE = new WeakMap<GameState, { key: string; byFrom: Map<number, Reach> }>();
export function reachMap(state: GameState, from: Pt): Reach {
  const key = layoutSig(state);
  let c = REACH_CACHE.get(state);
  if (!c || c.key !== key) { c = { key, byFrom: new Map() }; REACH_CACHE.set(state, c); }
  const fk = cellKey(state, from);
  const hit = c.byFrom.get(fk);
  if (hit) return hit;
  const r = computeReach(state, from);
  c.byFrom.set(fk, r);
  return r;
}
function computeReach(state: GameState, from: Pt): Reach {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const queue: Pt[] = [from];
  dist.set(cellKey(state, from), 0);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]!;
    const pk = cellKey(state, p);
    for (const n of walkableNeighborsOf(state, p.x, p.y)) {
      const nk = cellKey(state, n);
      if (dist.has(nk)) continue;
      dist.set(nk, dist.get(pk)! + 1);
      prev.set(nk, pk);
      queue.push(n);
    }
  }
  return { from, dist, prev };
}

/** reach.from → to 경로 (양 끝 포함). 닿지 않으면 null. */
export function pathFromReach(state: GameState, reach: Reach, to: Pt): Pt[] | null {
  const toKey = cellKey(state, to);
  if (!reach.dist.has(toKey)) return null;
  const out: Pt[] = [];
  let k: number | undefined = toKey;
  while (k !== undefined) {
    out.unshift({ x: k % state.grid.w, y: Math.floor(k / state.grid.w) });
    k = reach.prev.get(k);
  }
  return out;
}

/** 손님이 들어올 수 있는 칸: 정류장(놓인 자리) + 걷기 칸이 된 주차장·올레 진입 칸.
 *  정류장을 맨 앞에 둔다 — 거의 모든 경우 첫 칸에서 끝나 캐시된 BFS 하나만 쓴다. */
export function entryPoints(state: GameState): Pt[] {
  const out: Pt[] = [];
  const bus = Object.values(state.objects).find((o) => o.type === 'busstop');
  if (bus) out.push({ x: bus.x, y: bus.y });
  for (const e of Object.values(ENTRY_CELLS)) {
    if (bus && bus.x === e.x && bus.y === e.y) continue;
    if (isWalkable(state, e.x, e.y)) out.push({ x: e.x, y: e.y });
  }
  return out;
}

/** 걸어서 방 문 앞까지 닿나 (문 앞 칸이 올렛길로 이어졌는지). 실내 좌석 안내용.
 *  정류장만 보면 주차장·올레로만 이어진 카페를 「손님이 못 온다」고 잘못 말했다 — 열린 진입 칸을 다 본다. */
export function isDoorReachable(state: GameState, room: PlacedObject): boolean {
  const f = doorFrontOf(room);
  if (!isWalkable(state, f.x, f.y)) return false;
  const k = cellKey(state, f);
  return entryPoints(state).some((p) => reachMap(state, p).dist.has(k));
}

/** 단발 경로. 스폰처럼 목적지가 여러 개면 reachMap + pathFromReach를 쓸 것. */
export function findPath(state: GameState, from: Pt, to: Pt): Pt[] | null {
  return pathFromReach(state, reachMap(state, from), to);
}

/** 걷는 속도. pace: 「게임 시간 1시간에 몇 칸」으로 적는다 — 시계가 빨라져도 손님이 한 시간에 가는 거리가 같아야
 *  자리 회전율(=하루 매출)이 안 바뀐다. 6칸/시 = HOUR_MS 2000일 때의 3칸/초. */
export const GUEST_CELLS_PER_HOUR = 6;
export const GUEST_SPEED_CELLS_PER_S = (GUEST_CELLS_PER_HOUR * 1000) / HOUR_MS;

/** 경로를 따라 걷는다. 손님·직원 공용. 목적지에 닿으면 true. */
/** 활력 화분(walkSpeedPct) 합산 이동 속도 배수 (최대 +30%). 손님·직원 moveAlong의 dtMs에 곱한다. */
export const WALK_SPEED_CAP_PCT = 30;
const WALK_CACHE = new WeakMap<GameState, { key: string; value: number }>();
export function walkSpeedMult(state: GameState): number {
  return layoutCached(state, WALK_CACHE, () => { // 배치 서명 캐시 (완공은 날·액션이 키를 바꾼다)
    let pct = 0;
    for (const o of Object.values(state.objects)) { const p = objectDef(o.type).walkSpeedPct; if (p && !o.build) pct += p; }
    return 1 + Math.min(WALK_SPEED_CAP_PCT, pct) / 100;
  });
}
export function moveAlong(g: { x: number; y: number; path: Pt[] }, dtMs: number): boolean {
  let budget = (dtMs / 1000) * GUEST_SPEED_CELLS_PER_S;
  while (budget > 0 && g.path.length) {
    const next = g.path[0]!;
    const dx = next.x - g.x;
    const dy = next.y - g.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= budget) {
      g.x = next.x;
      g.y = next.y;
      g.path.shift();
      budget -= dist;
    } else {
      // 경로는 4방향 인접이라 보통 dx·dy 중 하나만 0이 아니다 (BFS 보장). 좌석 칸→옆 칸처럼 살짝 비스듬한 첫걸음만 축별로 잘라 걷는다.
      g.x += Math.sign(dx) * Math.min(Math.abs(dx), budget);
      g.y += Math.sign(dy) * Math.min(Math.abs(dy), budget);
      budget = 0;
    }
  }
  return g.path.length === 0;
}

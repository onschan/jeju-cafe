import type { GameState, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { inBounds, cellAt, objectAt } from './grid.ts';

const WALKABLE_KINDS = new Set(['path', 'gate', 'busstop']);

export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const obj = objectAt(state, x, y);
  if (obj) return WALKABLE_KINDS.has(objectDef(obj.type).kind);
  return cellAt(state, x, y).terrain === 'road';
}

export function busStopPos(state: GameState): Pt {
  const bus = Object.values(state.objects).find((o) => o.type === 'busstop');
  if (!bus) throw new Error('정류장이 없어요');
  return { x: bus.x, y: bus.y };
}

const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export function walkableNeighborsOf(state: GameState, x: number, y: number): Pt[] {
  return DIRS.map((d) => ({ x: x + d.x, y: y + d.y })).filter((p) => isWalkable(state, p.x, p.y));
}

export const cellKey = (state: GameState, p: Pt) => p.y * state.grid.w + p.x;

/** from에서 닿는 모든 걷기 칸까지의 거리와 직전 칸. 한 번 계산해 여러 목적지에 재사용. */
export interface Reach { from: Pt; dist: Map<number, number>; prev: Map<number, number> }

export function reachMap(state: GameState, from: Pt): Reach {
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

/** 단발 경로. 스폰처럼 목적지가 여러 개면 reachMap + pathFromReach를 쓸 것. */
export function findPath(state: GameState, from: Pt, to: Pt): Pt[] | null {
  return pathFromReach(state, reachMap(state, from), to);
}

export const GUEST_SPEED_CELLS_PER_S = 3;

/** 경로를 따라 걷는다. 손님·직원 공용. 목적지에 닿으면 true. */
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

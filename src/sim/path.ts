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

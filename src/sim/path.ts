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

/** 4방향 A*. 시작점 포함, 끝점 포함. 없으면 null. */
export function findPath(state: GameState, from: Pt, to: Pt): Pt[] | null {
  const key = (p: Pt) => p.y * state.grid.w + p.x;
  const h = (p: Pt) => Math.abs(p.x - to.x) + Math.abs(p.y - to.y);
  const open: { p: Pt; f: number }[] = [{ p: from, f: h(from) }];
  const g = new Map<number, number>([[key(from), 0]]);
  const came = new Map<number, Pt>();
  const closed = new Set<number>();
  while (open.length) {
    open.sort((a, b) => a.f - b.f);
    const { p } = open.shift()!;
    const k = key(p);
    if (p.x === to.x && p.y === to.y) {
      const out: Pt[] = [p];
      let cur = k;
      while (came.has(cur)) {
        const prev = came.get(cur)!;
        out.unshift(prev);
        cur = key(prev);
      }
      return out;
    }
    if (closed.has(k)) continue;
    closed.add(k);
    for (const n of walkableNeighborsOf(state, p.x, p.y)) {
      const nk = key(n);
      const ng = (g.get(k) ?? 0) + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, p);
        open.push({ p: n, f: ng + h(n) });
      }
    }
  }
  return null;
}

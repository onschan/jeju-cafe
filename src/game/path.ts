import type { GameState, Pt } from './types.ts';
import { walkable, DIRS, BUS_STOP } from './world.ts';
/** 정류장에서 걷는 칸 전부까지의 거리·이전 칸 (BFS). 배치가 바뀔 때마다 새로 센다 — 맵이 1,080칸이라 싸다. */
export function reachFrom(s: GameState, from: Pt): { dist: Map<number, number>; prev: Map<number, number> } {
  const key = (p: Pt) => p.y * s.grid.w + p.x;
  const dist = new Map<number, number>(); const prev = new Map<number, number>();
  const q: Pt[] = [from]; dist.set(key(from), 0);
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!; const d = dist.get(key(p))!;
    for (const v of DIRS) {
      const n = { x: p.x + v.x, y: p.y + v.y };
      if (!walkable(s, n.x, n.y) || dist.has(key(n))) continue;
      dist.set(key(n), d + 1); prev.set(key(n), key(p)); q.push(n);
    }
  }
  return { dist, prev };
}
export function pathTo(s: GameState, reach: ReturnType<typeof reachFrom>, to: Pt): Pt[] | null {
  const w = s.grid.w;
  let k = to.y * w + to.x;
  if (!reach.dist.has(k)) return null;
  const out: Pt[] = [];
  while (true) { out.push({ x: k % w, y: Math.floor(k / w) }); const p = reach.prev.get(k); if (p === undefined) break; k = p; }
  return out.reverse();
}
export function busReach(s: GameState) { return reachFrom(s, BUS_STOP); }

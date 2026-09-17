/** mulberry32. state.rng를 제자리에서 갱신하고 [0,1)을 돌려준다. */
export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(state: { rng: number }, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}

export function pickWeighted<T>(state: { rng: number }, items: T[], weightOf: (t: T) => number): T | null {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  if (total <= 0) return null;
  let r = nextRandom(state) * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items[items.length - 1] ?? null;
}

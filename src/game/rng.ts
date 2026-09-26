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
  return pickFrom(items, weightOf, nextRandom(state));
}
/** 미리 뽑은 난수 r(0~1)로 가중 선택 — 보조 스트림(sideRandom)과 같이 쓴다 */
export function pickFrom<T>(items: T[], weightOf: (t: T) => number, r01: number): T | null {
  const w = (t: T) => Math.max(0, weightOf(t));
  const total = items.reduce((s, it) => s + w(it), 0);
  if (total <= 0) return null;
  let r = r01 * total;
  for (const it of items) {
    r -= w(it);
    if (r < 0) return it;
  }
  return items[items.length - 1] ?? null;
}

/** 보조 스트림 (staff-luck): 주 rng(state.rng) 순서를 건드리지 않는 결정적 난수. seed·tick·연번(state.luckSeq)을 해시한다.
 *  서빙 판정(주문마다)·칭호·대박/쪽박 굴림이 쓴다 — 주 스트림에 끼어들면 봇 KPI 밴드가 rng 한 번에 크게 흔들려서다. 리플레이·솔버 롤아웃도 같은 값을 얻는다. */
export function sideRandom(state: { seed: number; tick: number; luckSeq?: number }): number {
  const n = (state.luckSeq = (state.luckSeq ?? 0) + 1);
  let t = (Math.imul(state.seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(state.tick + 1, 0xc2b2ae35) ^ Math.imul(n, 0x27d4eb2f)) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 맵 밖 제주 풍경 — 렌더 전용 순수 계산(픽시 없음). 옛 GameView에서 가져와 새 코어(길 한 줄·정류장 하나)에 맞췄다.
 * - 맵 둘레 링 타일 종류(북 바다·서 마을·동 감귤밭+해안 도로·남 풀밭, 길 이어짐)
 * - 시간대별 하늘 색
 * - 마을 버스·렌터카 위치
 */

/** 맵 밖으로 몇 칸까지 장식 타일을 까나 */
export const RING_DEPTH = 8;
/** 링 타일 한 장이 덮는 칸 수(2×2 매크로) */
export const RING_STEP = 2;
export type RingKind =
  | 'sea' | 'shore'
  | 'village_a' | 'village_b' | 'village_c'
  | 'orchard_a' | 'orchard_b'
  | 'grass_a' | 'grass_b'
  | 'road_x' | 'road_y' | 'road_xy' | 'path_x';

/** 동쪽 감귤밭 사이를 남북으로 지나는 해안 도로의 x(맵 오른쪽 가장자리에서 3칸 밖). 렌터카가 오간다. */
export function coastRoadX(gridW: number): number { return gridW + 3; }

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 매크로 타일 원점 (mx, my)의 종류. 북(y<0) 바다 — 맵과 닿는 줄은 물가. 서 마을, 동 감귤밭 + 해안 도로, 남 오름 기슭 풀밭. roadY 줄은 길이 서·동으로 이어진다. */
export function ringKind(mx: number, my: number, gridW: number, gridH: number, roadY: number): RingKind {
  const has = (v: number, o: number) => v <= o && o < v + RING_STEP;
  if (my < 0) return my + RING_STEP === 0 ? 'shore' : 'sea';
  const h = hash2(mx, my);
  if (mx < 0) {
    if (my >= gridH) return h % 3 === 0 ? 'grass_b' : 'grass_a';
    if (has(my, roadY)) return 'road_x';
    return (['village_a', 'village_b', 'village_c'] as const)[h % 3]!;
  }
  if (mx >= gridW) {
    if (my >= gridH) return h % 4 === 0 ? 'grass_b' : 'grass_a';
    const coast = has(mx, coastRoadX(gridW));
    if (coast && has(my, roadY)) return 'road_xy';
    if (coast) return 'road_y';
    if (has(my, roadY)) return 'road_x';
    return h % 3 === 0 ? 'orchard_b' : 'orchard_a';
  }
  return h % 4 === 0 ? 'grass_b' : 'grass_a';
}

/** 링 매크로 타일 원점 목록 — 맵 밖 RING_DEPTH칸, 깊이(x+y) 순. 맵 안은 제외. */
export function ringCells(gridW: number, gridH: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = -RING_DEPTH; y < gridH + RING_DEPTH; y += RING_STEP) {
    for (let x = -RING_DEPTH; x < gridW + RING_DEPTH; x += RING_STEP) {
      if (x >= 0 && y >= 0 && x + RING_STEP <= gridW && y + RING_STEP <= gridH) continue;
      out.push({ x, y });
    }
  }
  return out.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
}

/** 시각별 하늘 색 키(시, 0xRRGGBB). 사이는 선형 보간. */
const SKY_KEYS: [number, number][] = [
  [0, 0x1a2447], [5, 0x2b3a6e], [5.5, 0xc98a8a], [6, 0xf2b07a], [7, 0xf6d5b0], [8, 0xb9d8f5], [9, 0x8ec1f0], [16, 0x8ec1f0],
  [17, 0xb9d0e8], [17.5, 0xf3c9a0], [18, 0xf7a25a], [19, 0xc46a5a], [20, 0x3a4a8a], [22, 0x1a2447], [24, 0x1a2447],
];
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export function skyColor(hour: number): number {
  const h = Math.min(24, Math.max(0, hour));
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const [h0, c0] = SKY_KEYS[i - 1]!, [h1, c1] = SKY_KEYS[i]!;
    if (h <= h1) return mix(c0, c1, h1 === h0 ? 0 : (h - h0) / (h1 - h0));
  }
  return SKY_KEYS[SKY_KEYS.length - 1]![1];
}

/** 마을 버스 한 바퀴(ms): 서쪽에서 들어와 정류장에 서고 동쪽으로 나간다 */
export const BUS_PERIOD_MS = 40_000;
export const BUS_IN_MS = 5_000;
export const BUS_STOP_MS = 5_000;
export const BUS_OUT_MS = 7_000;
export function busPose(t: number, stopX: number, gridW: number): { x: number; moving: boolean; visible: boolean } {
  const k = ((t % BUS_PERIOD_MS) + BUS_PERIOD_MS) % BUS_PERIOD_MS;
  const x0 = -RING_DEPTH, x1 = gridW + RING_DEPTH - RING_STEP;
  if (k < BUS_IN_MS) return { x: x0 + (stopX - x0) * (k / BUS_IN_MS), moving: true, visible: true };
  if (k < BUS_IN_MS + BUS_STOP_MS) return { x: stopX, moving: false, visible: true };
  if (k < BUS_IN_MS + BUS_STOP_MS + BUS_OUT_MS) return { x: stopX + (x1 - stopX) * ((k - BUS_IN_MS - BUS_STOP_MS) / BUS_OUT_MS), moving: true, visible: true };
  return { x: x1, moving: false, visible: false };
}

/** 해안 도로 렌터카: 남쪽 끝에서 북쪽 물가까지 달리고 사라졌다 다시 온다. 2대는 위상만 다르다. */
export const CAR_PERIOD_MS = 24_000;
export const CAR_RUN_MS = 14_000;
export function carPose(t: number, phaseMs: number, gridH: number): { y: number; visible: boolean } {
  const k = (((t + phaseMs) % CAR_PERIOD_MS) + CAR_PERIOD_MS) % CAR_PERIOD_MS;
  if (k >= CAR_RUN_MS) return { y: 0, visible: false };
  const y0 = gridH + RING_DEPTH - 1, y1 = 0;
  return { y: y0 + (y1 - y0) * (k / CAR_RUN_MS), visible: true };
}

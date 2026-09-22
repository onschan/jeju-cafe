/**
 * 트랙 E 제주 풍경 — 렌더 전용 순수 계산(픽시 없음, 테스트 가능).
 * - 맵 둘레 링 타일 종류(북 바다·서 마을·동 감귤밭·남 풀밭, 길 이어짐)
 * - 시간대별 하늘 색
 * - 미소유 필지 풍경 데이터(parcel_scenery.json)·팻말 문구
 * - 필지 경계 돌담선(내 땅 범위·미소유 경계)
 * sim은 건드리지 않는다. 좌표는 sim 격자(셀) 기준.
 */
import sceneryJson from '../data/parcel_scenery.json' with { type: 'json' };

export interface SceneryProp { type: string; x: number; y: number; w?: number; h?: number; keep?: boolean }
export type SceneryFill = 'orchard' | 'canola' | 'pampas' | 'stone';
export interface ParcelScenery { feature: string; fill: SceneryFill; props: SceneryProp[] }

const SCENERY = sceneryJson as unknown as Record<string, ParcelScenery | string>;

/** 필지 풍경 데이터. 없으면 null. */
export function parcelScenery(id: string): ParcelScenery | null {
  const s = SCENERY[id];
  return s && typeof s === 'object' ? s : null;
}
/** 데이터가 있는 필지 id 목록(테스트용) */
export function sceneryIds(): string[] {
  return Object.keys(SCENERY).filter((k) => typeof SCENERY[k] === 'object');
}

/** 팻말 두 줄: 이름 / ₩가격 · 특징. 가격은 만 단위(300만). */
export function parcelSignLines(name: string, price: number, feature: string): [string, string] {
  const man = Math.round(price / 10_000);
  const won = man >= 10_000 ? `${(man / 10_000).toFixed(man % 10_000 === 0 ? 0 : 1)}억` : `${man}만`;
  return [name, `₩${won} · ${feature}`];
}

// ---------- 링 타일 ----------

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

export interface RingRoads {
  /** 마을 길 y(정류장·주차장 진입: 서·동으로 이어진다) */
  villageRoadY: number;
  /** 올레길 진입점 y(서쪽 흙길) */
  olleY: number;
  /** 공항 셔틀 진입점 x(남쪽으로 이어지는 길) */
  shuttleX: number;
}
/** 동쪽 감귤밭 사이를 남북으로 지나는 해안 도로의 x(맵 오른쪽 가장자리에서 3칸 밖). 렌터카가 오간다. */
export function coastRoadX(gridW: number): number {
  return gridW + 3;
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 매크로 타일 원점 (mx, my)(RING_STEP 배수, [mx, mx+2)×[my, my+2) 덮음)의 종류.
 *  북(y<0) 바다 — 맵·마을·밭과 닿는 줄은 물가. 서(x<0) 마을(y<gridH), 동(x≥gridW) 감귤밭 + 해안 도로, 남(y≥gridH) 오름 기슭 풀밭. */
export function ringKind(mx: number, my: number, gridW: number, gridH: number, roads: RingRoads): RingKind {
  const has = (v: number, o: number) => v <= o && o < v + RING_STEP;
  if (my < 0) return my + RING_STEP === 0 ? 'shore' : 'sea';
  const h = hash2(mx, my);
  if (mx < 0) {
    if (my >= gridH) return h % 3 === 0 ? 'grass_b' : 'grass_a';
    if (has(my, roads.villageRoadY)) return 'road_x';
    if (has(my, roads.olleY)) return 'path_x';
    return (['village_a', 'village_b', 'village_c'] as const)[h % 3]!;
  }
  if (mx >= gridW) {
    if (my >= gridH) return h % 4 === 0 ? 'grass_b' : 'grass_a';
    const coast = has(mx, coastRoadX(gridW));
    if (coast && has(my, roads.villageRoadY)) return 'road_xy';
    if (coast) return 'road_y';
    if (has(my, roads.villageRoadY)) return 'road_x';
    return h % 3 === 0 ? 'orchard_b' : 'orchard_a';
  }
  // 남쪽
  if (has(mx, roads.shuttleX)) return 'road_y';
  return h % 4 === 0 ? 'grass_b' : 'grass_a';
}

/** 링 매크로 타일 원점 목록 — 맵 밖 RING_DEPTH칸, 깊이(x+y) 순(뒤부터 그린다). 맵 안은 제외. */
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

// ---------- 하늘 ----------

/** 시각별 하늘 색 키(시, 0xRRGGBB). 사이는 선형 보간. 밤 오버레이(NIGHT_COLOR)가 위에 더 얹힌다. */
const SKY_KEYS: [number, number][] = [
  // 주황↔파랑을 바로 섞으면 탁한 갈색이 되므로 사이에 연한 복숭아·연파랑을 둔다
  [0, 0x1a2447], [5, 0x2b3a6e], [5.5, 0xc98a8a], [6, 0xf2b07a], [7, 0xf6d5b0], [8, 0xb9d8f5], [9, 0x8ec1f0], [16, 0x8ec1f0],
  [17, 0xb9d0e8], [17.5, 0xf3c9a0], [18, 0xf7a25a], [19, 0xc46a5a], [20, 0x3a4a8a], [22, 0x1a2447], [24, 0x1a2447],
];
function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
/** 시각(0~24)의 하늘 색 */
export function skyColor(hour: number): number {
  const h = Math.min(24, Math.max(0, hour));
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const [h0, c0] = SKY_KEYS[i - 1]!, [h1, c1] = SKY_KEYS[i]!;
    if (h <= h1) return mix(c0, c1, h1 === h0 ? 0 : (h - h0) / (h1 - h0));
  }
  return SKY_KEYS[SKY_KEYS.length - 1]![1];
}

// ---------- 필지 경계 돌담선 ----------

export interface WallEdge { x: number; y: number; axis: 'ne' | 'nw' }
export interface WallParcel { x: number; y: number; w: number; h: number; owned: boolean }

/** 필지 경계에 놓을 돌담선 조각. 'ne'는 셀 (x,y)의 y=const 위 변(화면 우상), 'nw'는 x=const 위 변(화면 좌상).
 *  맵 아래·오른쪽 가장자리는 가상 셀 (x, gridH)·(gridW, y)의 위 변으로 표현한다.
 *  규칙: 두 셀의 필지가 다르거나 한쪽이 맵 밖이면 긋는다. 둘 다 내 땅이면 안 긋는다(내 땅끼리는 트여 있다). 길이 지나가면 그 칸은 비운다. */
export function wallEdges(gridW: number, gridH: number, parcels: WallParcel[], isRoad: (x: number, y: number) => boolean): WallEdge[] {
  const at = (x: number, y: number): WallParcel | null => parcels.find((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h) ?? null;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < gridW && y < gridH;
  const out: WallEdge[] = [];
  const consider = (x: number, y: number, axis: 'ne' | 'nw') => {
    const [bx, by] = axis === 'ne' ? [x, y - 1] : [x - 1, y];
    const a = inside(x, y) ? at(x, y) : null;
    const b = inside(bx, by) ? at(bx, by) : null;
    if (!a && !b) return;
    if (a && b && a === b) return;
    if (a?.owned && b?.owned) return;
    const roadA = inside(x, y) && isRoad(x, y);
    const roadB = inside(bx, by) && isRoad(bx, by);
    if ((roadA && roadB) || (roadA && !b) || (roadB && !a)) return;
    out.push({ x, y, axis });
  };
  for (let y = 0; y <= gridH; y++) for (let x = 0; x <= gridW; x++) {
    if (x < gridW) consider(x, y, 'ne');
    if (y < gridH) consider(x, y, 'nw');
  }
  return out;
}

// ---------- 진입점 미리 보기 라벨 ----------

/** 잠긴 경로 진입점 위 팻말(두 줄, 각 ≤22자): 어디 자리인지 + 무엇을 하면 열리는지 */
export const ROUTE_PREVIEW: Record<string, [string, string]> = {
  parking: ['주차장 자리', '좌석 6개면 열려요'],
  cruise: ['항구 자리', '북쪽 땅을 사면 열려요'],
  olle: ['올레길 입구', '서쪽 땅을 사면 열려요'],
  shuttle: ['공항 셔틀 자리', '남쪽 땅을 사면 열려요'],
};

// ---------- 버스·렌터카 애니 ----------

/** 마을 버스 한 바퀴(ms): 서쪽에서 들어와 정류장에 5초 서고 동쪽으로 나간다 */
export const BUS_PERIOD_MS = 40_000;
export const BUS_IN_MS = 5_000;
export const BUS_STOP_MS = 5_000;
export const BUS_OUT_MS = 7_000;
/** 링 밖에서 시작·끝나는 x(맵 밖 RING_DEPTH칸) */
export function busPose(t: number, stopX: number, gridW: number): { x: number; moving: boolean; visible: boolean } {
  const k = ((t % BUS_PERIOD_MS) + BUS_PERIOD_MS) % BUS_PERIOD_MS;
  const x0 = -RING_DEPTH, x1 = gridW + RING_DEPTH - RING_STEP;
  if (k < BUS_IN_MS) return { x: x0 + (stopX - x0) * (k / BUS_IN_MS), moving: true, visible: true };
  if (k < BUS_IN_MS + BUS_STOP_MS) return { x: stopX, moving: false, visible: true };
  if (k < BUS_IN_MS + BUS_STOP_MS + BUS_OUT_MS) return { x: stopX + (x1 - stopX) * ((k - BUS_IN_MS - BUS_STOP_MS) / BUS_OUT_MS), moving: true, visible: true };
  return { x: x1, moving: false, visible: false };
}
/** 정류장에 선 뒤 손님 내리는 반짝임을 띄우는 시각(사이클 안 ms) */
export const BUS_DROP_AT_MS = BUS_IN_MS + 600;

/** 해안 도로 렌터카: 남쪽 끝에서 북쪽 물가까지 달리고(period ms) 사라졌다 다시 온다. 2대는 위상만 다르다. */
export const CAR_PERIOD_MS = 24_000;
export const CAR_RUN_MS = 14_000;
export function carPose(t: number, phaseMs: number, gridH: number): { y: number; visible: boolean } {
  const k = (((t + phaseMs) % CAR_PERIOD_MS) + CAR_PERIOD_MS) % CAR_PERIOD_MS;
  if (k >= CAR_RUN_MS) return { y: 0, visible: false };
  const y0 = gridH + RING_DEPTH - 1, y1 = 0;
  return { y: y0 + (y1 - y0) * (k / CAR_RUN_MS), visible: true };
}

import { describe, it, expect } from 'vitest';
import { ringCells, ringKind, RING_DEPTH, RING_STEP, coastRoadX, skyColor, parcelScenery, sceneryIds, parcelSignLines, wallEdges, ROUTE_PREVIEW, busPose, carPose, BUS_IN_MS, BUS_STOP_MS, BUS_PERIOD_MS, CAR_RUN_MS } from '../scenery';
import { PARCELS } from '../../data/index.ts';
import { makeParcels } from '../../sim/parcels.ts';
import { GRID_W, GRID_H, VILLAGE_ROAD_Y } from '../../sim/layout.ts';
import { ENTRY_ROUTES } from '../../sim/entry.ts';

const ROADS = { villageRoadY: VILLAGE_ROAD_Y, olleY: ENTRY_ROUTES.olle.entry.y, shuttleX: -1 };

describe('링 타일(맵 둘레 제주 풍경)', () => {
  it('2×2 매크로 타일 280장 — 배경 스프라이트 예산 400 안', () => {
    const cells = ringCells(GRID_W, GRID_H);
    expect(cells.length).toBe(280);
    expect(cells.length).toBeLessThanOrEqual(400);
    // 맵 안은 없다, 모두 RING_STEP 배수, 깊이 순
    for (const c of cells) {
      expect(c.x >= 0 && c.y >= 0 && c.x + RING_STEP <= GRID_W && c.y + RING_STEP <= GRID_H).toBe(false);
      expect(Math.abs(c.x % RING_STEP)).toBe(0); expect(Math.abs(c.y % RING_STEP)).toBe(0);
      expect(c.x).toBeGreaterThanOrEqual(-RING_DEPTH); expect(c.y).toBeGreaterThanOrEqual(-RING_DEPTH);
    }
    for (let i = 1; i < cells.length; i++) expect(cells[i]!.x + cells[i]!.y).toBeGreaterThanOrEqual(cells[i - 1]!.x + cells[i - 1]!.y);
  });

  it('북쪽은 바다(맵과 닿는 줄은 물가), 서쪽 마을, 동쪽 감귤밭, 남쪽 풀밭', () => {
    expect(ringKind(10, -2, GRID_W, GRID_H, ROADS)).toBe('shore');
    expect(ringKind(10, -8, GRID_W, GRID_H, ROADS)).toBe('sea');
    expect(ringKind(-4, -4, GRID_W, GRID_H, ROADS)).toBe('sea');
    expect(ringKind(-4, 4, GRID_W, GRID_H, ROADS)).toMatch(/^village_/);
    expect(ringKind(GRID_W, 4, GRID_W, GRID_H, ROADS)).toMatch(/^orchard_/);
    expect(ringKind(10, GRID_H, GRID_W, GRID_H, ROADS)).toMatch(/^grass_/);
    expect(ringKind(-4, GRID_H + 2, GRID_W, GRID_H, ROADS)).toMatch(/^grass_/);
  });

  it('길이 이어진다: 마을 길은 서·동으로, 올레 흙길은 서로, 셔틀 길은 남으로, 해안 도로는 동쪽 감귤밭 사이로', () => {
    const roadRow = VILLAGE_ROAD_Y - (VILLAGE_ROAD_Y % RING_STEP);
    expect(ringKind(-2, roadRow, GRID_W, GRID_H, ROADS)).toBe('road_x');
    expect(ringKind(GRID_W, roadRow, GRID_W, GRID_H, ROADS)).toBe('road_x');
    const cx = coastRoadX(GRID_W) - (coastRoadX(GRID_W) % RING_STEP);
    expect(ringKind(cx, roadRow, GRID_W, GRID_H, ROADS)).toBe('road_xy');
    expect(ringKind(cx, 4, GRID_W, GRID_H, ROADS)).toBe('road_y');
    const olleRow = ROADS.olleY - (ROADS.olleY % RING_STEP);
    expect(ringKind(-2, olleRow, GRID_W, GRID_H, ROADS)).toBe('path_x');
  });
});

describe('하늘 색', () => {
  it('낮은 맑은 파랑, 밤은 짙은 남색, 새벽·저녁은 탁한 갈색이 아니다', () => {
    expect(skyColor(12)).toBe(0x8ec1f0);
    expect(skyColor(23)).toBe(0x1a2447);
    for (const h of [7, 7.5, 8.5, 17.25, 17.5]) {
      const c = skyColor(h);
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      // 주황과 파랑을 바로 섞은 어두운 갈색(예: 0xc0b8b5보다 어두운 탁색)이 아니라 밝은 복숭아·연파랑을 지난다
      expect(Math.min(r, g, b), `hour ${h}`).toBeGreaterThan(0x88);
    }
  });
  it('시각은 0~24로 잘린다', () => {
    expect(skyColor(-3)).toBe(skyColor(0));
    expect(skyColor(30)).toBe(skyColor(24));
  });
});

describe('미소유 필지 풍경 데이터', () => {
  it('9개 필지 모두 있고 특징 문구는 22자 이하, 소품은 필지 안', () => {
    for (const p of PARCELS) {
      const sc = parcelScenery(p.id);
      expect(sc, p.id).not.toBeNull();
      expect(sc!.feature.length).toBeLessThanOrEqual(22);
      expect(['orchard', 'canola', 'pampas', 'stone']).toContain(sc!.fill);
      for (const pr of sc!.props) {
        expect(pr.x + (pr.w ?? 1)).toBeLessThanOrEqual(p.w);
        expect(pr.y + (pr.h ?? 1)).toBeLessThanOrEqual(p.h);
      }
    }
    expect(sceneryIds().length).toBe(PARCELS.length);
  });
  it('팻말 두 줄: 이름 / ₩만 단위 · 특징 (각 22자 이하)', () => {
    const [a, b] = parcelSignLines('해안 도로변', 3_000_000, '바다가 보여요');
    expect(a).toBe('해안 도로변');
    expect(b).toBe('₩300만 · 바다가 보여요');
    for (const p of PARCELS) {
      const lines = parcelSignLines(p.name, p.price * 10, parcelScenery(p.id)!.feature);
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(22);
    }
    expect(parcelSignLines('x', 120_000_000, 'y')[1]).toBe('₩1.2억 · y');
  });
});

describe('필지 경계 돌담선', () => {
  const parcels = makeParcels();
  const road = (x: number, y: number) => y === VILLAGE_ROAD_Y;
  it('시작 필지 둘레에 담이 있고, 마을 길이 지나는 칸은 비어 있다', () => {
    const edges = wallEdges(GRID_W, GRID_H, parcels, road);
    const home = parcels.find((p) => p.no === 1)!;
    const has = (x: number, y: number, axis: 'ne' | 'nw') => edges.some((e) => e.x === x && e.y === y && e.axis === axis);
    expect(has(home.x, home.y, 'ne')).toBe(true);            // 위 변
    expect(has(home.x, home.y, 'nw')).toBe(true);            // 왼 변
    expect(has(home.x + home.w, home.y, 'nw')).toBe(true);   // 오른 변(이웃 칸의 왼 변)
    expect(has(home.x, home.y + home.h, 'ne')).toBe(true);   // 아래 변
    expect(has(home.x, VILLAGE_ROAD_Y, 'nw')).toBe(false);   // 마을 길 칸은 비운다
    expect(has(home.x + home.w, VILLAGE_ROAD_Y, 'nw')).toBe(false);
    // 필지 안쪽(같은 필지)엔 없다
    expect(has(home.x + 3, home.y + 3, 'ne')).toBe(false);
  });
  it('둘 다 내 땅이면 사이 담이 사라진다', () => {
    const before = wallEdges(GRID_W, GRID_H, parcels, road).length;
    const home = parcels.find((p) => p.no === 1)!;
    const east = parcels.find((p) => p.x === home.x + home.w && p.y === home.y)!;
    const bought = parcels.map((p) => (p === east ? { ...p, owned: true } : p));
    const edges = wallEdges(GRID_W, GRID_H, bought, road);
    expect(edges.some((e) => e.x === east.x && e.y === home.y + 2 && e.axis === 'nw')).toBe(false);
    expect(edges.length).toBeLessThan(before);
    // 맵 가장자리(길 제외)와 미소유 경계는 그대로
    expect(edges.some((e) => e.x === 0 && e.y === 0 && e.axis === 'nw')).toBe(true);
  });
  it('맵 가장자리 진입점(길)엔 담이 없다', () => {
    const edges = wallEdges(GRID_W, GRID_H, parcels, road);
    expect(edges.some((e) => e.x === 0 && e.y === VILLAGE_ROAD_Y && e.axis === 'nw')).toBe(false);
    expect(edges.some((e) => e.x === GRID_W && e.y === VILLAGE_ROAD_Y && e.axis === 'nw')).toBe(false);
  });
});

describe('진입점 미리 보기·버스·렌터카', () => {
  it('잠긴 경로 4종 팻말 두 줄, 각 22자 이하, 정류장은 없다', () => {
    for (const r of ['parking', 'cruise', 'olle', 'shuttle']) {
      const t = ROUTE_PREVIEW[r];
      expect(t, r).toBeDefined();
      for (const l of t!) expect(l.length).toBeLessThanOrEqual(22);
    }
    expect(ROUTE_PREVIEW.bus).toBeUndefined();
  });
  it('버스: 서쪽 밖에서 들어와 정류장에 5초 서고 동쪽으로 나가 사라진다', () => {
    const stop = 9;
    expect(busPose(0, stop, GRID_W).x).toBe(-RING_DEPTH);
    const mid = busPose(BUS_IN_MS + BUS_STOP_MS / 2, stop, GRID_W);
    expect(mid).toEqual({ x: stop, moving: false, visible: true });
    expect(busPose(BUS_IN_MS + BUS_STOP_MS + 1, stop, GRID_W).moving).toBe(true);
    expect(busPose(BUS_PERIOD_MS - 1, stop, GRID_W).visible).toBe(false);
    expect(busPose(BUS_PERIOD_MS + 10, stop, GRID_W).x).toBeCloseTo(-RING_DEPTH + (stop + RING_DEPTH) * (10 / BUS_IN_MS), 5);
  });
  it('렌터카: 남쪽 끝에서 북쪽(y=0)으로 달리고 그 뒤엔 안 보인다', () => {
    expect(carPose(0, 0, GRID_H)).toEqual({ y: GRID_H + RING_DEPTH - 1, visible: true });
    expect(carPose(CAR_RUN_MS - 1, 0, GRID_H).y).toBeLessThan(0.1);
    expect(carPose(CAR_RUN_MS + 1, 0, GRID_H).visible).toBe(false);
  });
});

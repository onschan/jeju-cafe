import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { STEPS, recommendedMainCells } from '../tutorial.ts';
import { siteOf, seatScore } from '../site.ts';
import { canPlace, doorFrontOf } from '../grid.ts';
import { mainBuilding } from '../rooms.ts';
import { reachMap, busStopPos, walkableNeighborsOf, cellKey } from '../path.ts';
import { activeCombos } from '../compat.ts';
import { parkingSites } from '../entry.ts';
import {
  bestMainCells, bestSeatCells, bestWallCell, bestComboCells, combosIfPlaced, bestIndoorSeats, bestParkingCells, bestSpotToInvest,
  openingBuild, nextMove, strategyVars, fillTemplate, wallSheltered, TREE_TYPE,
} from '../strategy.ts';
import type { GameState, Pt } from '../types.ts';

/** 맨땅 → 본관(추천 1순위) → 마을 길에서 문 앞까지 올렛길 */
function yardWithPath(seed = 1): GameState {
  const s = createInitialState(seed, 'local', 0, 'tutorial');
  expect(apply(s, { type: 'placeMain', ...recommendedMainCells(s)[0]! }).ok).toBe(true);
  const [start, door] = STEPS[3]!.cells(s) as [Pt, Pt];
  for (let x = Math.min(start.x, door.x); x <= Math.max(start.x, door.x); x++) apply(s, { type: 'place', objectType: 'path', x, y: door.y });
  return s;
}
function allEmptyOwned(s: GameState, type: string): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) if (canPlace(s, type, x, y).ok) out.push({ x, y });
  return out;
}

describe('프로 삼춘의 정석 (strategy.ts): 글로우 칸은 실제 수치로 고른 최적 칸', () => {
  it('bestMainCells: 바람 최소 → 정낭과 문 앞 거리 최소. tutorial.recommendedMainCells와 같다', () => {
    const s = createInitialState(1, 'local', 0, 'tutorial');
    const rec = bestMainCells(s);
    expect(rec).toHaveLength(3);
    expect(rec).toEqual(recommendedMainCells(s));
    const winds = rec.map((p) => siteOf(s, p.x, p.y).wind);
    expect(winds[0]).toBeLessThanOrEqual(winds[1]!);
    expect(winds[1]).toBeLessThanOrEqual(winds[2]!);
    apply(s, { type: 'placeMain', ...rec[0]! });
    expect(bestMainCells(s)).toEqual([]);
  });

  it('bestSeatCells: 정류장에서 걸어 닿는 칸 중 seatScore 최고 — 놓을 수 있는 모든 칸을 훑어도 더 높은 점수는 없다', () => {
    const s = yardWithPath();
    const best = bestSeatCells(s, 1)[0]!;
    const reach = reachMap(s, busStopPos(s));
    const reachable = (p: Pt) => walkableNeighborsOf(s, p.x, p.y).some((nb) => reach.dist.has(cellKey(s, nb)));
    expect(reachable(best)).toBe(true);
    const top = seatScore(s, best.x, best.y);
    for (const p of allEmptyOwned(s, 'table_out')) if (reachable(p)) expect(seatScore(s, p.x, p.y)).toBeLessThanOrEqual(top);
    // 놓고 나면 다음 최적 칸으로 옮겨 가고, 좋은 순서다
    const three = bestSeatCells(s, 3);
    expect(seatScore(s, three[0]!.x, three[0]!.y)).toBeGreaterThanOrEqual(seatScore(s, three[2]!.x, three[2]!.y));
    apply(s, { type: 'place', objectType: 'table_out', ...best });
    expect(bestSeatCells(s, 1)[0]).not.toEqual(best);
  });

  it('bestWallCell: 테이블 북서 쐐기의 칸이라 놓으면 그 테이블 바람이 1 준다. 테이블이 없으면 null', () => {
    const s = yardWithPath();
    expect(bestWallCell(s)).toBeNull();
    const seat = bestSeatCells(s, 1)[0]!;
    apply(s, { type: 'place', objectType: 'table_out', ...seat });
    const wind0 = siteOf(s, seat.x, seat.y).wind;
    const w = bestWallCell(s)!;
    expect(w).not.toBeNull();
    expect(seat.x - w.x).toBeGreaterThanOrEqual(1);
    expect(seat.y - w.y).toBeGreaterThanOrEqual(1);
    expect(wallSheltered(s)).toBe(false);
    apply(s, { type: 'place', objectType: 'stonewall', ...w });
    expect(wallSheltered(s)).toBe(true);
    expect(siteOf(s, seat.x, seat.y).wind).toBe(Math.max(0, wind0 - 1));
  });

  it('bestComboCells: 감귤나무를 놓으면 콤보가 가장 많이 나는 칸 — combosIfPlaced가 실제 activeCombos와 맞고, 다른 어떤 칸도 더 많지 않다', () => {
    const s = yardWithPath();
    const seat = bestSeatCells(s, 1)[0]!;
    apply(s, { type: 'place', objectType: 'table_out', ...seat });
    apply(s, { type: 'place', objectType: 'stonewall', ...bestWallCell(s)! });
    const best = bestComboCells(s, TREE_TYPE, 1)[0]!;
    const n = combosIfPlaced(s, TREE_TYPE, best.x, best.y);
    expect(n).toBeGreaterThanOrEqual(2); // 귤밭 뷰 + 밭담 귤 수확
    for (const p of allEmptyOwned(s, TREE_TYPE)) expect(combosIfPlaced(s, TREE_TYPE, p.x, p.y)).toBeLessThanOrEqual(n);
    const r = apply(s, { type: 'place', objectType: TREE_TYPE, ...best });
    expect(r.ok).toBe(true);
    const tree = Object.values(s.objects).find((o) => o.type === TREE_TYPE)!;
    const ids = new Set<string>();
    for (const id of Object.keys(s.objects)) for (const c of activeCombos(s, id)) ids.add(c.id);
    expect(ids.has('cb_tangerine_view') && ids.has('cb_wall_harvest')).toBe(true);
    expect(tree.type).toBe(TREE_TYPE);
  });

  it('bestIndoorSeats: 본관 빈 바닥 중 벽에 붙은 칸(북쪽 벽 우선)', () => {
    const s = yardWithPath();
    const m = mainBuilding(s)!;
    const cells = bestIndoorSeats(s, 3);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]!.y).toBe(m.y); // 북쪽 벽 = 바다 방향
    for (const p of cells) expect(p.x === m.x || p.y === m.y || p.x === m.x + m.w! - 1 || p.y === m.y + m.h! - 1).toBe(true);
    s.main.work = { kind: 'expand', to: 2, days: 3 } as never;
    expect(bestIndoorSeats(s, 3)).toEqual([]);
  });

  it('bestParkingCells: 마을 길에 접한 놓을 수 있는 자리 중 문 앞과 가장 가까운 것', () => {
    const s = yardWithPath();
    s.unlocked.objects.push('parking_lot');
    const best = bestParkingCells(s, 1)[0]!;
    expect(parkingSites(s)).toContainEqual(best);
    expect(canPlace(s, 'parking_lot', best.x, best.y).ok).toBe(true);
    const f = doorFrontOf(mainBuilding(s)!);
    const d = (p: Pt) => Math.max(Math.abs(p.x - f.x), Math.abs(p.y - f.y));
    for (const p of parkingSites(s)) if (canPlace(s, 'parking_lot', p.x, p.y).ok) expect(d(p)).toBeGreaterThanOrEqual(d(best) - 1); // 발자국 4칸 중 가장 가까운 칸 기준이라 원점 거리는 1 차이까지
    expect(apply(s, { type: 'place', objectType: 'parking_lot', ...best }).ok).toBe(true);
    expect(bestParkingCells(s, 1)).toEqual([]);
  });

  it('bestSpotToInvest: 지금 투자할 수 있는 명소 중 손님층 인기 최고 → 싼 순. 시작엔 유채꽃밭·올레길 등 Lv1 후보', () => {
    const s = yardWithPath();
    const spot = bestSpotToInvest(s)!;
    expect(spot).not.toBeNull();
    expect(spot.cost).toBeGreaterThan(0);
    expect(spot.name).not.toMatch(/[a-z_]/);
  });

  it('openingBuild: 3~12월 열 줄, 각 줄에 무엇·왜', () => {
    const rows = openingBuild();
    expect(rows.map((r) => r.month)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const r of rows) { expect(r.what.length).toBeGreaterThan(0); expect(r.why.length).toBeGreaterThan(0); expect(r.title.length).toBeLessThanOrEqual(8); }
  });

  it('nextMove: 상태에 따라 정석 다음 수 — 본관 → 길 → 테이블 → 메뉴 → 채용 → 돌담 → … 완성 시작 상태는 증축/저축 쪽', () => {
    const s = createInitialState(1, 'local', 0, 'tutorial');
    expect(nextMove(s)!.text).toContain('본관');
    expect(nextMove(s)!.cells).toEqual([recommendedMainCells(s)[0]]);
    apply(s, { type: 'placeMain', ...recommendedMainCells(s)[0]! });
    expect(nextMove(s)!.text).toContain('올렛길');
    const [start, door] = STEPS[3]!.cells(s) as [Pt, Pt];
    for (let x = Math.min(start.x, door.x); x <= Math.max(start.x, door.x); x++) apply(s, { type: 'place', objectType: 'path', x, y: door.y });
    const m = nextMove(s)!;
    expect(m.text).toContain('테이블');
    expect(m.cells).toEqual(bestSeatCells(s, 1));
    apply(s, { type: 'place', objectType: 'table_out', ...m.cells[0]! });
    expect(nextMove(s)!.text).toContain('메뉴');
    apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }); apply(s, { type: 'setSlot', slot: 1, menuId: 'tangerine_juice' });
    expect(nextMove(s)!.text).toContain('채용');
    const starter = createInitialState(1);
    const sm = nextMove(starter);
    expect(sm === null || sm.text.length > 0).toBe(true);
  });

  it('strategyVars·fillTemplate: 토큰이 입지 배지와 같은 숫자로 채워지고 모르는 토큰은 그대로', () => {
    const s = yardWithPath();
    const v = strategyVars(s);
    const seat = bestSeatCells(s, 1)[0]!;
    expect(v.seatScore).toBe(String(seatScore(s, seat.x, seat.y)));
    expect(v.mainWind).toBe(String(siteOf(s, doorFrontOf(mainBuilding(s)!).x, doorFrontOf(mainBuilding(s)!).y).wind));
    expect(fillTemplate('입지 {seatScore}/10 · {nope}', v)).toBe(`입지 ${v.seatScore}/10 · {nope}`);
    for (const k of Object.keys(v)) expect(k).not.toContain('_'); // noIdLeak: 토큰 키에 밑줄 없음
  });
});

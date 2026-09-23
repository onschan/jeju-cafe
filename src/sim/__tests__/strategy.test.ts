import { describe, it, expect } from 'vitest';
import { createInitialState, VILLAGE_ROAD_Y } from '../state.ts';
import { apply } from '../actions.ts';
import { recommendedMainCells } from '../tutorial.ts';
import { siteOf, seatScore } from '../site.ts';
import { canPlace, doorFrontOf } from '../grid.ts';
import { mainBuilding } from '../rooms.ts';
import { reachMap, busStopPos, walkableNeighborsOf, cellKey, isDoorReachable } from '../path.ts';
import { parkingSites } from '../entry.ts';
import {
  bestMainCells, bestSeatCells, bestWallCell, bestCornerCells, cornerScoreIfPlaced, bestIndoorSeats, bestParkingCells, bestSpotToInvest,
  nextMove, strategyVars, fillTemplate, wallSheltered, TREE_TYPE,
} from '../strategy.ts';
import type { GameState, Pt } from '../types.ts';

/** 본관 + 마을 길에서 문 앞까지 올렛길 = fun-start 새 게임 시작 모습 */
function yardWithPath(seed = 1): GameState {
  const s = createInitialState(seed, 'local', 0, 'tutorial');
  expect(mainBuilding(s)).not.toBeNull();
  expect(isDoorReachable(s, mainBuilding(s)!)).toBe(true);
  return s;
}
/** 옛 맨땅(bare) → 본관(추천 1순위) → 문 앞에서 마을 길까지 곧은 올렛길 (콤보 자리 테스트용 넓은 마당) */
function bareYardWithPath(seed = 1): GameState {
  const s = createInitialState(seed, 'local', 0, 'bare');
  expect(apply(s, { type: 'placeMain', ...recommendedMainCells(s)[0]! }).ok).toBe(true);
  const door = doorFrontOf(mainBuilding(s)!);
  const gate = Object.values(s.objects).find((o) => o.type === 'gate')!; // 옛 맨땅엔 정낭이 마을 길 옆에 있다 — 문 앞에서 정낭까지 가로로
  for (let x = Math.min(gate.x, door.x); x <= Math.max(gate.x, door.x); x++) apply(s, { type: 'place', objectType: 'path', x, y: door.y });
  expect(isDoorReachable(s, mainBuilding(s)!)).toBe(true);
  return s;
}
function allEmptyOwned(s: GameState, type: string): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) if (canPlace(s, type, x, y).ok) out.push({ x, y });
  return out;
}

describe('할망의 정석 (strategy.ts): 글로우 칸은 실제 수치로 고른 최적 칸', () => {
  it('bestMainCells: 정낭과 문 앞 거리 최소 → 자리 점수 최고. tutorial.recommendedMainCells와 같다 (옛 맨땅 bare)', () => {
    const s = createInitialState(1, 'local', 0, 'bare');
    const rec = bestMainCells(s);
    expect(rec).toHaveLength(3);
    expect(rec).toEqual(recommendedMainCells(s));
    for (const p of rec) { const sc = seatScore(s, p.x, p.y); expect(sc).toBeGreaterThanOrEqual(0); expect(sc).toBeLessThanOrEqual(10); }
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

  it('bestWallCell: 테이블 북서 쐐기의 칸 — 돌담을 놓으면 wallSheltered. 테이블이 없으면 null', () => {
    const s = yardWithPath();
    expect(bestWallCell(s)).toBeNull();
    const seat = bestSeatCells(s, 1)[0]!;
    apply(s, { type: 'place', objectType: 'table_out', ...seat });
    const w = bestWallCell(s)!;
    expect(w).not.toBeNull();
    expect(seat.x - w.x).toBeGreaterThanOrEqual(1);
    expect(seat.y - w.y).toBeGreaterThanOrEqual(1);
    expect(wallSheltered(s)).toBe(false);
    apply(s, { type: 'place', objectType: 'stonewall', ...w });
    expect(wallSheltered(s)).toBe(true);
  });

  it('bestCornerCells: 감귤나무를 놓으면 명당 조각이 가장 많이 모이는 칸 — 다른 어떤 칸도 더 높지 않다', () => {
    const s = bareYardWithPath();
    const seat = bestSeatCells(s, 1)[0]!;
    apply(s, { type: 'place', objectType: 'table_out', ...seat });
    apply(s, { type: 'place', objectType: 'stonewall', ...bestWallCell(s)! });
    const best = bestCornerCells(s, TREE_TYPE, 1)[0]!;
    const n = cornerScoreIfPlaced(s, TREE_TYPE, best.x, best.y);
    expect(n).toBeGreaterThanOrEqual(1); // 돌담이 곁에 있으면 밭담 명당 조각
    for (const p of allEmptyOwned(s, TREE_TYPE)) expect(cornerScoreIfPlaced(s, TREE_TYPE, p.x, p.y)).toBeLessThanOrEqual(n);
    const r = apply(s, { type: 'place', objectType: TREE_TYPE, ...best });
    expect(r.ok).toBe(true);
    const tree = Object.values(s.objects).find((o) => o.type === TREE_TYPE)!;
    expect(tree.type).toBe(TREE_TYPE);
  });

  it('bestIndoorSeats: 본관 빈 바닥 중 벽에 붙은 칸(북쪽 벽 우선)', () => {
    const s = yardWithPath();
    const m = mainBuilding(s)!;
    const cells = bestIndoorSeats(s, 3);
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]!.y).toBe(m.y); // 북쪽 벽 = 바다 방향
    // fix-indoor 뒤 통로·고정 설비 검사로 벽 칸이 모자랄 수 있다 — 벽 칸이 앞에 오고(내림차순), 첫 칸은 벽
    const onWall = (p: { x: number; y: number }) => p.x === m.x || p.y === m.y || p.x === m.x + m.w! - 1 || p.y === m.y + m.h! - 1;
    expect(onWall(cells[0]!)).toBe(true);
    for (let i = 1; i < cells.length; i++) expect(Number(onWall(cells[i]!))).toBeLessThanOrEqual(Number(onWall(cells[i - 1]!)));
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


  it('nextMove: 상태에 따라 다음 수 — 본관 → 길 → 테이블 → 메뉴 → 채용 → … 완성 시작 상태는 증축/저축 쪽. 문구는 「무엇 — 왜」', () => {
    const s = createInitialState(1, 'local', 0, 'bare');
    expect(nextMove(s)!.text).toContain('본관');
    expect(nextMove(s)!.cells).toEqual([recommendedMainCells(s)[0]]);
    apply(s, { type: 'placeMain', ...recommendedMainCells(s)[0]! });
    const door = doorFrontOf(mainBuilding(s)!);
    if (!isDoorReachable(s, mainBuilding(s)!)) expect(nextMove(s)!.text).toContain('올렛길');
    const start = { x: door.x, y: VILLAGE_ROAD_Y - 1 };
    for (let y = Math.min(start.y, door.y); y <= Math.max(start.y, door.y); y++) apply(s, { type: 'place', objectType: 'path', x: door.x, y });
    const m = nextMove(s)!;
    expect(m.text).toContain(' — ');
    expect(m.text).not.toMatch(/시뮬|정석|→ 지금|굴려 보니/);
    expect(m.text).toContain('테이블');
    expect(m.cells).toEqual(bestSeatCells(s, 1));
    apply(s, { type: 'place', objectType: 'table_out', ...m.cells[0]! });
    expect(nextMove(s)!.text).toContain('메뉴');
    apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }); apply(s, { type: 'setSlot', slot: 1, menuId: 'tangerine_juice' });
    expect(nextMove(s)!.text).toContain('직원');
    const starter = createInitialState(1);
    const sm = nextMove(starter);
    expect(sm === null || sm.text.length > 0).toBe(true);
  });

  it('strategyVars·fillTemplate: 토큰이 입지 배지와 같은 숫자로 채워지고 모르는 토큰은 그대로', () => {
    const s = yardWithPath();
    const v = strategyVars(s);
    const seat = bestSeatCells(s, 1)[0]!;
    expect(v.seatScore).toBe(String(seatScore(s, seat.x, seat.y)));
    expect(v.mainScore).toBe(String(seatScore(s, doorFrontOf(mainBuilding(s)!).x, doorFrontOf(mainBuilding(s)!).y)));
    expect(fillTemplate('입지 {seatScore}/10 · {nope}', v)).toBe(`입지 ${v.seatScore}/10 · {nope}`);
    for (const k of Object.keys(v)) expect(k).not.toContain('_'); // noIdLeak: 토큰 키에 밑줄 없음
  });
});

import { bareState, X, Y } from '../../sim/__tests__/helpers.ts';
import { apply } from '../../sim/actions.ts';
import { objectAt } from '../../sim/grid.ts';
import { demolishTargets, rectCells, nextGhostAfterPlace } from '../placing.ts';
import { objectDef } from '../../data/index.ts';

const WALL = 'stonewall';

test('rectCells: 어느 방향으로 끌어도 같은 칸 집합', () => {
  expect(rectCells({ x0: 2, y0: 3, x1: 0, y1: 1 }).length).toBe(9);
  expect(rectCells({ x0: 1, y0: 1, x1: 1, y1: 1 })).toEqual([{ x: 1, y: 1 }]);
});

test('demolishTargets: 사각형 안 시설만, 정류장·본관·샘은 제외 (정낭은 w-free부터 철거 가능)', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  apply(s, { type: 'place', objectType: WALL, x: X(1), y: Y(0) });
  apply(s, { type: 'place', objectType: WALL, x: X(5), y: Y(5) });
  const ids = demolishTargets(s, { x0: X(0), y0: Y(0), x1: X(2), y1: Y(2) });
  expect(ids).toEqual([objectAt(s, X(0), Y(0))!.id, objectAt(s, X(1), Y(0))!.id]);
  // 맵 전체를 골라도 보호 시설은 빠진다
  const all = demolishTargets(s, { x0: 0, y0: 0, x1: s.grid.w - 1, y1: s.grid.h - 1 });
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop')!;
  const home = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  expect(all).not.toContain(bus.id);
  expect(all).not.toContain(home.id);
  expect(all).toContain(objectAt(s, X(5), Y(5))!.id);
  expect(all.every((id) => !['busstop', 'warehouse', 'spring'].includes(s.objects[id]!.type))).toBe(true);
  expect(all).toContain(Object.values(s.objects).find((o) => o.type === 'gate')!.id);
});

test('연속 배치: 놓은 뒤 옆 빈 칸으로 고스트가 옮겨지고, 돈이 모자라면 종료', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  const nx = nextGhostAfterPlace(s, WALL, { x: X(0), y: Y(0), rot: 0 });
  expect(nx.done).toBe(false);
  if (!nx.done) expect(nx.ghost).toEqual({ x: X(1), y: Y(0), rot: 0 });
  s.money = objectDef(WALL).cost - 1;
  const end = nextGhostAfterPlace(s, WALL, { x: X(0), y: Y(0), rot: 0 });
  expect(end.done).toBe(true);
  if (end.done) expect(end.reason).toContain('돈이 모자라');
});

test('연속 배치: 사방이 막혀 있으면 제자리에 남는다', () => {
  const s = bareState(1);
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) apply(s, { type: 'place', objectType: WALL, x: X(3) + dx, y: Y(3) + dy });
  apply(s, { type: 'place', objectType: WALL, x: X(3), y: Y(3) });
  const nx = nextGhostAfterPlace(s, WALL, { x: X(3), y: Y(3), rot: 0 });
  expect(nx.done).toBe(false);
  if (!nx.done) expect(nx.ghost).toEqual({ x: X(3), y: Y(3), rot: 0 });
});

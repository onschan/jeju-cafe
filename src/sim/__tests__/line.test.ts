import { bareState, X, Y, at } from './helpers.ts';
import { apply } from '../actions.ts';
import { canUndo } from '../undo.ts';
import { objectAt } from '../grid.ts';
import { placeCost } from '../cafe.ts';
import { lineCells, planLine, isLineType } from '../line.ts';

test('lineCells: 직선(가로·세로)·같은 칸·ㄱ자(먼저 x → y, ↻ 방향이면 먼저 y → x), 시작·끝 포함', () => {
  expect(lineCells({ x: 2, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }]);
  expect(lineCells({ x: 5, y: 5 }, { x: 2, y: 5 }).map((p) => p.x)).toEqual([5, 4, 3, 2]); // 거꾸로도 된다
  expect(lineCells({ x: 1, y: 3 }, { x: 1, y: 1 }).map((p) => p.y)).toEqual([3, 2, 1]);
  expect(lineCells({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual([{ x: 4, y: 4 }]); // 한 칸 = 같은 칸 두 번 탭
  expect(lineCells({ x: 0, y: 0 }, { x: 2, y: 2 }, 'xy')).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }]);
  expect(lineCells({ x: 0, y: 0 }, { x: 2, y: 2 }, 'yx')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }]);
  expect(isLineType('path')).toBe(true);
  expect(isLineType('stonewall')).toBe(true);
  expect(isLineType('table_out')).toBe(false);
});

test('planLine: 이미 같은 종류가 있는 칸·시설 칸은 건너뛰고 비용에서 빠진다, 놓을 칸이 없거나 돈이 모자라면 ok:false', () => {
  const s = bareState(1);
  const per = placeCost(s, 'path');
  apply(s, { type: 'place', objectType: 'path', ...at(2, 4) }); // 줄 가운데 이미 길
  apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }); // 줄 가운데 테이블
  const plan = planLine(s, 'path', at(0, 4), at(5, 4));
  expect(plan.ok).toBe(true);
  expect(plan.cells).toEqual([at(0, 4), at(1, 4), at(4, 4), at(5, 4)]);
  expect(plan.skipped).toEqual(expect.arrayContaining([at(2, 4), at(3, 4)]));
  expect(plan.cost).toBe(per * 4);
  // 전부 이미 있으면 놓을 게 없다
  expect(planLine(s, 'path', at(2, 4), at(2, 4)).ok).toBe(false);
  expect(planLine(s, 'path', at(2, 4), at(2, 4)).reason).toContain('이미');
  // 남의 땅으로 나가면 그 칸은 막힘(이유), 내 땅 칸만 놓는다
  const out = planLine(s, 'path', at(0, 0), { x: X(0) - 2, y: Y(0) });
  expect(out.cells).toEqual([at(0, 0)]);
  expect(out.blocked).toHaveLength(2);
  expect(out.reason).toBe('아직 내 땅이 아니에요');
  // 마을 길 칸은 못 놓는다
  expect(planLine(s, 'path', at(0, 7), at(3, 7)).ok).toBe(false);
  s.money = per * 3;
  expect(planLine(s, 'path', at(0, 4), at(5, 4)).reason).toBe('돈이 모자라요');
});

test('placeLine: 확정 때만 돈이 나가고, 되돌리기 1회로 그 줄 전체가 되돌아온다', () => {
  const s = bareState(1);
  const per = placeCost(s, 'stonewall');
  const money = s.money;
  expect(apply(s, { type: 'placeLine', objectType: 'table_out', from: at(0, 0), to: at(2, 0) }).ok).toBe(false); // 길·담만
  expect(apply(s, { type: 'placeLine', objectType: 'stonewall', from: at(0, 0), to: at(2, 2), order: 'yx' }).ok).toBe(true);
  for (const p of [at(0, 0), at(0, 1), at(0, 2), at(1, 2), at(2, 2)]) expect(objectAt(s, p.x, p.y)?.type).toBe('stonewall');
  expect(objectAt(s, X(1), Y(0))).toBeNull(); // xy 순서가 아니다
  expect(s.money).toBe(money - per * 5);
  expect(s.undo?.kind).toBe('placeMany');
  expect(canUndo(s).ok).toBe(true);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  for (const p of [at(0, 0), at(0, 1), at(0, 2), at(1, 2), at(2, 2)]) expect(objectAt(s, p.x, p.y)).toBeNull();
  expect(s.money).toBe(money);
  // 같은 줄을 다시 놓되 가운데는 이미 있음 → 4칸만 새로, 되돌리면 새로 놓은 4칸만
  apply(s, { type: 'place', objectType: 'stonewall', ...at(1, 0) });
  const m2 = s.money;
  expect(apply(s, { type: 'placeLine', objectType: 'stonewall', from: at(0, 0), to: at(4, 0) }).ok).toBe(true);
  expect(s.money).toBe(m2 - per * 4);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  expect(objectAt(s, X(1), Y(0))?.type).toBe('stonewall');
  expect(objectAt(s, X(0), Y(0))).toBeNull();
  expect(s.money).toBe(m2);
});

import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { isWalkable, findPath, walkableNeighborsOf, busStopPos, reachMap, pathFromReach, cellKey } from '../path.ts';

test('도로·올렛길·정낭·정류장은 걷기 가능, 흙·밭·건물은 불가', () => {
  const s = createInitialState(1);
  expect(isWalkable(s, X(5), Y(7))).toBe(true);  // 도로
  expect(isWalkable(s, X(0), Y(7))).toBe(true);  // 정류장
  expect(isWalkable(s, X(4), Y(6))).toBe(true);  // 정낭
  expect(isWalkable(s, X(5), Y(5))).toBe(false); // 흙
  expect(isWalkable(s, X(3), Y(1))).toBe(true);  // 폐창고 바닥(실내, 가구 없음)은 걷는다
  placeObject(s, 'field', X(0), Y(0));
  expect(isWalkable(s, X(0), Y(0))).toBe(false); // 밭
  placeObject(s, 'path', X(5), Y(5));
  expect(isWalkable(s, X(5), Y(5))).toBe(true);
});

test('정류장 → 정낭 경로가 있다', () => {
  const s = createInitialState(1);
  const p = findPath(s, busStopPos(s), { x: X(4), y: Y(6) });
  expect(p).not.toBeNull();
  expect(p![0]).toEqual({ x: X(0), y: Y(7) });
  expect(p![p!.length - 1]).toEqual({ x: X(4), y: Y(6) });
  expect(p!.length).toBe(6); // 4칸 오른쪽 + 1칸 위 + 시작점
});

test('끊긴 곳으로는 경로가 없다', () => {
  const s = createInitialState(1);
  expect(findPath(s, busStopPos(s), { x: X(8), y: Y(2) })).toBeNull();
});

test('좌석 옆 걷기 가능 칸', () => {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', X(4), Y(5)); // 정낭(4,6) 바로 위
  expect(walkableNeighborsOf(s, seat.x, seat.y)).toEqual([{ x: X(4), y: Y(6) }]);
});

test('reachMap은 거리와 경로를 한 번에 준다', () => {
  const s = createInitialState(1);
  placeObject(s, 'path', X(4), Y(5));
  const r = reachMap(s, busStopPos(s));
  expect(r.dist.get(cellKey(s, { x: X(4), y: Y(6) }))).toBe(5);
  expect(r.dist.get(cellKey(s, { x: X(4), y: Y(5) }))).toBe(6);
  expect(r.dist.has(cellKey(s, { x: X(8), y: Y(2) }))).toBe(false);
  const p = pathFromReach(s, r, { x: X(4), y: Y(5) })!;
  expect(p[0]).toEqual({ x: X(0), y: Y(7) });
  expect(p[p.length - 1]).toEqual({ x: X(4), y: Y(5) });
  expect(p.length).toBe(7);
  expect(pathFromReach(s, r, { x: X(8), y: Y(2) })).toBeNull();
});

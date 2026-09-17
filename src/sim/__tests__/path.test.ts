import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { isWalkable, findPath, walkableNeighborsOf, busStopPos, reachMap, pathFromReach, cellKey } from '../path.ts';

test('도로·올렛길·정낭·정류장은 걷기 가능, 흙·밭·건물은 불가', () => {
  const s = createInitialState(1);
  expect(isWalkable(s, 5, 7)).toBe(true);  // 도로
  expect(isWalkable(s, 0, 7)).toBe(true);  // 정류장
  expect(isWalkable(s, 4, 6)).toBe(true);  // 정낭
  expect(isWalkable(s, 5, 5)).toBe(false); // 흙
  expect(isWalkable(s, 3, 1)).toBe(false); // 폐창고
  placeObject(s, 'path', 5, 5);
  expect(isWalkable(s, 5, 5)).toBe(true);
});

test('정류장 → 정낭 경로가 있다', () => {
  const s = createInitialState(1);
  const p = findPath(s, busStopPos(s), { x: 4, y: 6 });
  expect(p).not.toBeNull();
  expect(p![0]).toEqual({ x: 0, y: 7 });
  expect(p![p!.length - 1]).toEqual({ x: 4, y: 6 });
  expect(p!.length).toBe(6); // 4칸 오른쪽 + 1칸 위 + 시작점
});

test('끊긴 곳으로는 경로가 없다', () => {
  const s = createInitialState(1);
  expect(findPath(s, busStopPos(s), { x: 8, y: 2 })).toBeNull();
});

test('좌석 옆 걷기 가능 칸', () => {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', 4, 5); // 정낭(4,6) 바로 위
  expect(walkableNeighborsOf(s, seat.x, seat.y)).toEqual([{ x: 4, y: 6 }]);
});

test('reachMap은 거리와 경로를 한 번에 준다', () => {
  const s = createInitialState(1);
  placeObject(s, 'path', 4, 5);
  const r = reachMap(s, busStopPos(s));
  expect(r.dist.get(cellKey(s, { x: 4, y: 6 }))).toBe(5);
  expect(r.dist.get(cellKey(s, { x: 4, y: 5 }))).toBe(6);
  expect(r.dist.has(cellKey(s, { x: 8, y: 2 }))).toBe(false);
  const p = pathFromReach(s, r, { x: 4, y: 5 })!;
  expect(p[0]).toEqual({ x: 0, y: 7 });
  expect(p[p.length - 1]).toEqual({ x: 4, y: 5 });
  expect(p.length).toBe(7);
  expect(pathFromReach(s, r, { x: 8, y: 2 })).toBeNull();
});

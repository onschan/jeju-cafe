import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { placeObject, doorFrontOf } from '../grid.ts';
import { mainBuilding } from '../rooms.ts';
import { ENTRY_CELLS } from '../layout.ts';
import { isWalkable, findPath, walkableNeighborsOf, busStopPos, reachMap, pathFromReach, cellKey, isDoorReachable, entryPoints } from '../path.ts';

test('도로·올렛길·정류장·본관 빈 바닥은 걷기 가능, 흙·당근밭·카운터는 불가', () => {
  const s = bareState(1);
  expect(isWalkable(s, X(5), Y(9))).toBe(true);  // 도로
  expect(isWalkable(s, X(0), Y(9))).toBe(true);  // 정류장
  expect(isWalkable(s, X(4), Y(6))).toBe(true);  // 어귀 올렛길
  expect(isWalkable(s, X(5), Y(5))).toBe(false); // 흙
  expect(isWalkable(s, X(5), Y(0))).toBe(false); // 본관 뒷벽 줄은 카운터·주방
  expect(isWalkable(s, X(5), Y(2))).toBe(true);  // 본관 빈 바닥 (zero-base: 안에도 앉는다)
  placeObject(s, 'carrot_field', X(0), Y(0));
  expect(isWalkable(s, X(0), Y(0))).toBe(false); // 당근밭
  placeObject(s, 'path', X(5), Y(5));
  expect(isWalkable(s, X(5), Y(5))).toBe(true);
});

test('정류장 → 어귀 올렛길 경로가 있다', () => {
  const s = bareState(1);
  const p = findPath(s, busStopPos(s), { x: X(4), y: Y(6) });
  expect(p).not.toBeNull();
  expect(p![0]).toEqual({ x: X(0), y: Y(9) });
  expect(p![p!.length - 1]).toEqual({ x: X(4), y: Y(6) });
  expect(p!.length).toBe(8); // 4칸 오른쪽 + 3칸 위 + 시작점
});

test('끊긴 곳으로는 경로가 없다', () => {
  const s = bareState(1);
  expect(findPath(s, busStopPos(s), { x: X(8), y: Y(2) })).toBeNull();
});

test('좌석 옆 걷기 가능 칸', () => {
  const s = bareState(1);
  const seat = placeObject(s, 'table_out', X(4), Y(5)); // 어귀 올렛길(4,6) 바로 위
  expect(walkableNeighborsOf(s, seat.x, seat.y)).toEqual([{ x: X(4), y: Y(6) }]);
});

test('reachMap은 거리와 경로를 한 번에 준다', () => {
  const s = bareState(1);
  placeObject(s, 'path', X(4), Y(5));
  const r = reachMap(s, busStopPos(s));
  expect(r.dist.get(cellKey(s, { x: X(4), y: Y(6) }))).toBe(7);
  expect(r.dist.get(cellKey(s, { x: X(4), y: Y(5) }))).toBe(8);
  expect(r.dist.has(cellKey(s, { x: X(8), y: Y(2) }))).toBe(false);
  const p = pathFromReach(s, r, { x: X(4), y: Y(5) })!;
  expect(p[0]).toEqual({ x: X(0), y: Y(9) });
  expect(p[p.length - 1]).toEqual({ x: X(4), y: Y(5) });
  expect(p.length).toBe(9);
  expect(pathFromReach(s, r, { x: X(8), y: Y(2) })).toBeNull();
});

test('올레길로만 이어진 카페도 「문 앞까지 닿는다」 (정류장만 보던 false negative)', () => {
  const s = bareState(1);
  const main = mainBuilding(s)!;
  const f = doorFrontOf(main);
  // 마을 길(정류장)로는 아직 길이 없다 — 예전엔 여기서 끝나 「손님이 못 온다」가 떴다
  expect(isDoorReachable(s, main)).toBe(false);
  // 올레 진입 칸에서 문 앞까지만 올렛길을 깐다 (마을 길에는 닿지 않는다)
  const e = ENTRY_CELLS.olle;
  expect(e.y).toBe(f.y); // 같은 줄이라 한 줄로 이을 수 있다
  for (let x = e.x; x <= f.x; x++) if (!isWalkable(s, x, e.y)) placeObject(s, 'path', x, e.y);
  expect(isWalkable(s, e.x, e.y)).toBe(true);
  expect(entryPoints(s).some((p) => p.x === e.x && p.y === e.y)).toBe(true);
  expect(isDoorReachable(s, main)).toBe(true);
});

test('진입 칸은 걷기 칸일 때만 센다 — 정류장은 늘 맨 앞', () => {
  const s = bareState(1);
  const pts = entryPoints(s);
  expect(pts[0]).toEqual(busStopPos(s));
  expect(pts.some((p) => p.x === ENTRY_CELLS.olle.x && p.y === ENTRY_CELLS.olle.y)).toBe(false); // 흙이라 아직 아니다
});

import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, freeSeats, GUEST_SPEED_CELLS_PER_S, SEAT_MS } from '../guests.ts';

/** 정낭(4,6) 바로 위 (4,5)에 테이블 → 정낭이 테이블의 걷기 이웃 */
function cafe() {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', 4, 5);
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 10;
  return { s, seat };
}

test('빈 좌석과 경로가 있어야 스폰', () => {
  const s = createInitialState(1);
  expect(spawnGuests(s, 3)).toBe(0); // 좌석 없음
  const { s: s2 } = cafe();
  expect(freeSeats(s2).length).toBe(1);
  expect(spawnGuests(s2, 3)).toBe(2); // 테이블 1개 = 2석 → 2명
  expect(s2.guests[0]!.phase).toBe('walking');
  expect(s2.guests[0]!.seatId).toBeDefined();
});

test('가까운 좌석부터 배정한다', () => {
  const { s } = cafe();
  // 멀리 있는 두 번째 테이블: 정낭 (4,6) → 올렛길 (5,6),(6,6) → 테이블 (7,6)
  placeObject(s, 'path', 5, 6);
  placeObject(s, 'path', 6, 6);
  const far = placeObject(s, 'table_out', 7, 6);
  spawnGuests(s, 3);
  expect(s.guests.map((g) => g.seatId === far.id)).toEqual([false, false, true]);
});

test('걸어가서 앉고, 주문하고, 돈과 연구가 오른다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  const money0 = s.money;
  // 경로 길이 5칸 → 5/속도 초
  updateGuests(s, (6 / GUEST_SPEED_CELLS_PER_S) * 1000);
  expect(g.phase).toBe('seated');
  expect(g.menuId).toBe('carrot_juice');
  expect(g.mood).not.toBeNull();
  expect(s.money).toBe(money0 + 2500);
  expect(s.storage['carrot']).toBe(9);
});

test('좋아하는 메뉴가 없으면 😐, 돈 없음', () => {
  const { s } = cafe();
  s.storage['carrot'] = 0;
  spawnGuests(s, 1);
  const money0 = s.money;
  updateGuests(s, 10_000);
  const g = s.guests[0]!;
  expect(g.mood).toBe('meh');
  expect(s.money).toBe(money0);
});

test('앉은 시간이 지나면 나가고, 정류장에 닿으면 사라진다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  updateGuests(s, 6000);
  expect(s.guests[0]!.phase).toBe('seated');
  updateGuests(s, SEAT_MS);
  expect(s.guests[0]!.phase).toBe('leaving');
  updateGuests(s, 10_000);
  expect(s.guests.length).toBe(0);
});

test('😊이면 연구 +1, 게이지가 타입 방향으로 움직인다', () => {
  const { s } = cafe();
  // 삼춘만 오게 강제
  s.rng = 3;
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  g.type = 'local';
  updateGuests(s, 6000);
  expect(g.mood).toBe('happy'); // local minScenery 0
  expect(s.research).toBe(1);
  expect(s.popularity).toBe(-2);
});

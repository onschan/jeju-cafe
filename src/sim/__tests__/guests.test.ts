import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, freeSeats, hasReachableSeat, GUEST_SPEED_CELLS_PER_S, SEAT_MS } from '../guests.ts';

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
  const seat = Object.values(s2.objects).find((o) => o.type === 'table_out')!;
  expect(spawnGuests(s2, 3)).toBe(2); // 테이블 1개 = 2석 → 2명
  expect(s2.guests[0]!.phase).toBe('walking');
  expect(s2.guests[0]!.seatId).toBe(seat.id);
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
  // 경로 5칸, 속도 3칸/초 → 2초면 충분
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
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  g.type = 'local';
  updateGuests(s, 6000);
  expect(g.mood).toBe('happy'); // local minScenery 0
  expect(s.research).toBe(1);
  expect(s.popularity).toBe(-2);
});

test('100ms 스텝으로도 17스텝째에 정확히 자리에 도착한다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  for (let i = 0; i < 16; i++) updateGuests(s, 100);
  expect(g.phase).toBe('walking');
  updateGuests(s, 100);
  expect(g.phase).toBe('seated');
  expect([g.x, g.y]).toEqual([4, 6]);
});

test('관광객은 경치가 모자라면 😐, 돌담을 두면 😊', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  s.guests[0]!.type = 'tourist'; // minScenery 2, 자리 (4,5) 경치 1(정낭)
  updateGuests(s, 6000);
  expect(s.guests[0]!.mood).toBe('meh');
  const { s: s2 } = cafe();
  placeObject(s2, 'stonewall', 5, 4); // scenery +1 → 2
  spawnGuests(s2, 1);
  s2.guests[0]!.type = 'tourist';
  updateGuests(s2, 6000);
  expect(s2.guests[0]!.mood).toBe('happy');
});

test('hasReachableSeat: 좌석 없음 → false, 정낭 옆 좌석 → true, 길 없는 좌석 → false', () => {
  const s = createInitialState(1);
  expect(hasReachableSeat(s)).toBe(false);
  placeObject(s, 'table_out', 4, 5);
  expect(hasReachableSeat(s)).toBe(true);
  spawnGuests(s, 2); // 좌석이 다 차도 길은 이어져 있으므로 true
  expect(hasReachableSeat(s)).toBe(true);
  const s2 = createInitialState(1);
  placeObject(s2, 'table_out', 8, 2); // 사방이 흙이라 정류장에서 못 닿음
  expect(hasReachableSeat(s2)).toBe(false);
});

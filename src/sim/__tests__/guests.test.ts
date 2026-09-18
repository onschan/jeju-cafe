import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, freeSeats, hasReachableSeat, dailyGuestCount, popularityGuestBase, popularitySum, facilityPopularitySum, resetWaiting, totalSeats, hourShare, typeWeight, GUEST_SPEED_CELLS_PER_S, SEAT_MS, PREP_MS, MAX_GUESTS, MIN_DAILY_GUESTS, MAX_DAILY_GUESTS, GUESTS_PER_SEAT, BASE_DAILY_GUESTS, POP_SUM_PER_GUEST, WAIT_MAX, SEASON_GUEST_MULT } from '../guests.ts';
import { moveAlong } from '../path.ts';
import { tick } from '../tick.ts';
import { HOUR_MS, START_HOUR, END_HOUR } from '../clock.ts';
import { guestDialogue } from '../../data/index.ts';

/** 정낭(4,6) 바로 위 (4,5)에 테이블 → 정낭이 테이블의 걷기 이웃 */
function cafe() {
  const s = bareState(1);
  const seat = placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 10;
  return { s, seat };
}

test('빈 좌석과 경로가 있어야 스폰', () => {
  const s = bareState(1);
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
  placeObject(s, 'path', X(5), Y(6));
  placeObject(s, 'path', X(6), Y(6));
  const far = placeObject(s, 'table_out', X(7), Y(6));
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
  expect(g.mood).toBeNull(); // 조리 중
  expect(s.money).toBe(money0 + 4000); // 당근주스 4000
  expect(s.storage['carrot']).toBe(9);
  expect(s.monthGuests).toBe(1); // 도착 시 센다
  updateGuests(s, PREP_MS);
  expect(g.mood).not.toBeNull();
});

test('좋아하는 메뉴가 없으면 meh, 돈 없음', () => {
  const { s } = cafe();
  setSlot(s, 0, null); // v3: 창고가 비어도 재료는 사서 쓰므로 메뉴판을 비워야 "메뉴 없음"
  spawnGuests(s, 1);
  const money0 = s.money;
  updateGuests(s, 2000);
  const g = s.guests[0]!;
  expect(g.mood).toBe('meh'); // 메뉴가 없으면 기다리지 않고 바로
  expect(g.moodReason).toBe('no_menu');
  expect(s.money).toBe(money0);
  expect(s.monthGuests).toBe(1);
});

test('앉은 시간이 지나면 나가고, 정류장에 닿으면 사라진다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  updateGuests(s, 6000);
  expect(s.guests[0]!.phase).toBe('seated');
  updateGuests(s, PREP_MS);
  expect(s.guests[0]!.phase).toBe('seated'); // 앉은 시간은 조리가 끝난 뒤부터
  updateGuests(s, SEAT_MS);
  expect(s.guests[0]!.phase).toBe('leaving');
  updateGuests(s, 10_000);
  expect(s.guests.length).toBe(0);
});

test('나가는 손님이 정류장까지 길이 없으면 옆 칸까지만 가고 사라진다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  updateGuests(s, 6000); updateGuests(s, PREP_MS);
  const g = s.guests[0]!;
  expect(g.phase).toBe('seated');
  g.approachCell = { x: X(9), y: Y(0) }; // 걷기 칸이 아니라 정류장으로 가는 길이 없다
  updateGuests(s, SEAT_MS);
  expect(g.phase).toBe('leaving');
  expect(g.path).toEqual([{ x: X(9), y: Y(0) }]);
  updateGuests(s, 10_000);
  expect(s.guests.length).toBe(0);
});

test('동시 손님은 MAX_GUESTS까지', () => {
  const s = bareState(1);
  // 필지 1·7에 걸쳐 4줄·6줄 테이블, 5줄 올렛길 (placeObject는 소유 검사를 안 한다). 정낭(4,6)은 남긴다.
  for (let x = 0; x < 20; x++) { placeObject(s, 'table_out', X(x), Y(4)); if (x !== 4) placeObject(s, 'table_out', X(x), Y(6)); }
  for (let x = 0; x < 20; x++) placeObject(s, 'path', X(x), Y(5));
  expect(freeSeats(s).length).toBe(39); // 78석
  expect(spawnGuests(s, MAX_GUESTS + 10)).toBe(MAX_GUESTS);
  expect(s.guests.length).toBe(MAX_GUESTS);
  expect(spawnGuests(s, 1)).toBe(0);
});

test('moveAlong은 path.ts에 살고 guests.ts는 재수출한다', async () => {
  const guests = await import('../guests.ts');
  expect(guests.moveAlong).toBe(moveAlong);
  const g = { x: X(0), y: Y(0), path: [{ x: X(1), y: Y(0) }, { x: X(1), y: Y(1) }] };
  expect(moveAlong(g, 500)).toBe(false); // 1.5칸
  expect(g).toMatchObject({ x: X(1), y: Y(0) + 0.5 });
  expect(moveAlong(g, 500)).toBe(true);
  expect(g.path).toEqual([]);
});

test('happy이면 연구 진행 +1(5명마다 연구 1), 게이지가 타입 방향으로 움직인다', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  g.type = 'local_auntie';
  updateGuests(s, 6000); updateGuests(s, PREP_MS);
  expect(g.mood).toBe('happy'); // local minScenery 0
  expect(s.research).toBe(0);
  expect(s.researchAcc).toBe(1);
  expect(s.popularity).toBe(-2);
});

test('100ms 스텝으로도 17스텝째에 정확히 자리에 도착한다', () => {
  const { s, seat } = cafe();
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  for (let i = 0; i < 16; i++) updateGuests(s, 100);
  expect(g.phase).toBe('walking');
  updateGuests(s, 100);
  expect(g.phase).toBe('seated');
  expect(g.approachCell).toEqual({ x: X(4), y: Y(6) });
  expect([Math.round(g.x), Math.round(g.y)]).toEqual([seat.x, seat.y]);
});

test('앉으면 좌석 칸 위(자리별 오프셋), 나갈 땐 다가갔던 옆 칸에서 출발, 빈 자리 번호부터 다시 쓴다', () => {
  const { s, seat } = cafe();
  spawnGuests(s, 2);
  updateGuests(s, 6000);
  const [a, b] = s.guests as [typeof s.guests[0], typeof s.guests[0]];
  expect(a.phase).toBe('seated'); expect(b.phase).toBe('seated');
  expect([a.seatSlot, b.seatSlot]).toEqual([0, 1]);
  expect([Math.round(a.x), Math.round(a.y)]).toEqual([seat.x, seat.y]);
  expect([Math.round(b.x), Math.round(b.y)]).toEqual([seat.x, seat.y]);
  expect(a.x).toBeCloseTo(seat.x - 0.25); expect(b.x).toBeCloseTo(seat.x + 0.25);
  expect(freeSeats(s).length).toBe(0);
  updateGuests(s, PREP_MS); updateGuests(s, SEAT_MS);
  expect(a.phase).toBe('leaving');
  expect(a.path[0]).toEqual({ x: X(4), y: Y(6) });
  expect(a.approachCell).toBeNull();
  expect(freeSeats(s).length).toBe(1);
  spawnGuests(s, 1);
  const c = s.guests[2]!;
  expect(c.seatSlot).toBe(0); // a가 비운 0번
  updateGuests(s, 10_000);
  expect(s.guests.map((g) => g.id)).toEqual([c.id]); // a·b는 정류장까지 걸어가 사라짐
  expect(c.phase).toBe('seated');
  expect(c.x).toBeCloseTo(seat.x - 0.25);
});

test('관광객은 경치가 모자라면 meh, 돌담을 두면 happy', () => {
  const { s } = cafe();
  spawnGuests(s, 1);
  s.guests[0]!.type = 'student'; // minScenery 2, 자리 (4,5) 경치 1(정낭)
  updateGuests(s, 6000); updateGuests(s, PREP_MS);
  expect(s.guests[0]!.mood).toBe('meh');
  expect(s.guests[0]!.moodReason).toBe('scenery');
  const { s: s2 } = cafe();
  placeObject(s2, 'stonewall', X(5), Y(4)); // scenery +1 → 2
  spawnGuests(s2, 1);
  s2.guests[0]!.type = 'student';
  updateGuests(s2, 6000); updateGuests(s2, PREP_MS);
  expect(s2.guests[0]!.mood).toBe('happy');
});

test('대사: 30%쯤은 말풍선 텍스트, 손님층·기분·이유에 맞는 문장', () => {
  let said = 0, total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = bareState(seed);
    placeObject(s, 'table_out', X(4), Y(5));
    if (seed % 2 === 0) { setSlot(s, 0, 'carrot_juice'); s.storage['carrot'] = 10; }
    spawnGuests(s, 1);
    const g = s.guests[0]!;
    updateGuests(s, 6000); updateGuests(s, PREP_MS);
    total++;
    if (g.say === null) continue;
    said++;
    const d = guestDialogue(g.type);
    const pool = g.mood === 'happy' ? d.happy : d.meh[g.moodReason as 'no_menu' | 'scenery' | 'wait'];
    expect(pool).toContain(g.say);
  }
  expect(said).toBeGreaterThan(total * 0.15);
  expect(said).toBeLessThan(total * 0.45);
});

test('하루 손님 수 = min(좌석×6, (4 + 인기 합/17 + 시설 인기 합/12 + 명소 매력도/12) × 계절·라이벌·평판 배수), 2~300 (§4.2 #1)', () => {
  const s = bareState(1);
  s.clock.month = 4; // 계절 배수 1
  s.segmentPopularity = { local_auntie: 0, student: 0, village_head: 0 }; // 시작 해금 3타입
  expect(dailyGuestCount(s)).toBe(MIN_DAILY_GUESTS); // 좌석 0 → 상한 0 → 최소 2
  placeObject(s, 'table_out', X(4), Y(5)); // 2석 → 상한 12
  expect(popularityGuestBase(s)).toBe(BASE_DAILY_GUESTS);
  expect(dailyGuestCount(s)).toBe(BASE_DAILY_GUESTS); // 평판 50 → ×1
  s.segmentPopularity = { local_auntie: 80, student: 80, village_head: 80 }; // 인기 합 240 → +14 → 18 > 상한 12
  expect(popularitySum(s)).toBe(240);
  expect(popularityGuestBase(s)).toBe(BASE_DAILY_GUESTS + Math.floor(240 / POP_SUM_PER_GUEST));
  expect(dailyGuestCount(s)).toBe(2 * GUESTS_PER_SEAT);
  placeObject(s, 'table_out', X(5), Y(5)); // 4석 → 상한 24
  expect(dailyGuestCount(s)).toBe(18);
  placeObject(s, 'tangerine_tree', X(6), Y(5)); placeObject(s, 'tangerine_tree', X(6), Y(6)); // 시설 인기 10×2 → 합 20 → +1
  expect(facilityPopularitySum(s)).toBe(20);
  expect(popularityGuestBase(s)).toBe(19);
  s.clock.month = 1; // 비수기 0.8
  expect(dailyGuestCount(s)).toBe(Math.round(19 * SEASON_GUEST_MULT[1]!));
  s.clock.month = 4;
  s.rivals.push({ id: 'r1', rivalId: 'rv_local_cafe', openedMonthIndex: 0, penaltyPct: 0, stolen: [], lastChallengeMonth: -1 }); // 라이벌 1곳 −5%
  expect(dailyGuestCount(s)).toBe(Math.round(19 * 0.95));
  s.rivals = [];
  s.reputation = 100; // 평판 ×1.5
  expect(dailyGuestCount(s)).toBe(Math.min(24, Math.round(19 * 1.5)));
  s.reputation = 50;
  s.rivals = [];
  s.effects.push({ kind: 'spawnMult', mult: 40, untilDay: 9999, source: 't' });
  for (let x = 10; x < 30; x++) for (const y of [1, 2, 3]) placeObject(s, 'table_out', x, y); // 124석 → 상한 744 → 전체 상한 300
  expect(totalSeats(s)).toBe(124);
  expect(dailyGuestCount(s)).toBe(MAX_DAILY_GUESTS);
});

test('대기열: 빈 자리가 없으면 3명까지 줄을 서고 자리가 나면 먼저 앉는다, 넘치면 돌아간다(이탈 수·만족 −10)', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5)); // 2석
  expect(spawnGuests(s, 2)).toBe(2);
  expect(spawnGuests(s, 5)).toBe(0);
  expect(s.waiting).toHaveLength(WAIT_MAX);
  expect(s.monthGuestsLeft).toBe(2);
  const walked = Object.values(s.guestTypes).filter((t) => t.unlocked);
  for (const t of walked) t.satisfaction = 20;
  expect(spawnGuests(s, 1)).toBe(0);
  expect(s.monthGuestsLeft).toBe(3);
  expect(walked.some((t) => t.satisfaction === 10)).toBe(true); // 돌아간 손님층 만족 −10
  // 자리가 비면 대기열이 먼저
  s.guests = [];
  const t = s.waiting[0]!;
  expect(spawnGuests(s, 0)).toBe(2);
  expect(s.guests.every((g) => g.type === t)).toBe(true);
  expect(s.waiting).toHaveLength(1);
  resetWaiting(s);
  expect(s.waiting).toHaveLength(0);
});

test('시간대 분배: 시간 비중 합 1, 정오 피크, 저녁 절반, 아침 삼춘·낮 관광객 가중', () => {
  let sum = 0;
  for (let h = START_HOUR; h < END_HOUR; h++) sum += hourShare(h);
  expect(sum).toBeCloseTo(1);
  expect(hourShare(12)).toBeGreaterThan(hourShare(10));
  expect(hourShare(20)).toBeCloseTo(hourShare(10) / 2);
  const s = bareState(1);
  expect(typeWeight(s, 'local_auntie', 7)).toBeCloseTo(typeWeight(s, 'local_auntie', 12) * 2);
  expect(typeWeight(s, 'student', 13)).toBeCloseTo(typeWeight(s, 'student', 7) * 2);
  expect(typeWeight(s, 'local_auntie', 12)).toBeCloseTo(5 * (1 + 30 / 50));
});

test('손님은 하루에 걸쳐 시간마다 나뉘어 오고, 하루 합은 dailyGuestCount와 같다', () => {
  const s = bareState(1);
  for (let i = 0; i < 6; i++) placeObject(s, 'table_out', X(2 + i), Y(5)); // 12석
  for (const x of [2, 3, 5, 6, 7]) placeObject(s, 'path', X(x), Y(6)); // (4,6)은 정낭
  s.clock.month = 4;
  s.segmentPopularity = { local_auntie: 0, student: 0, village_head: 0 }; // 평균 배수 1 → 하루 6명: 점심 피크에도 좌석(12)이 안 막힌다
  const n = dailyGuestCount(s);
  expect(n).toBe(BASE_DAILY_GUESTS);
  const ids = new Set<string>();
  const firstHourIds: string[] = [];
  for (let h = 0; h < 18; h++) {
    tick(s, HOUR_MS);
    for (const g of s.guests) ids.add(g.id);
    if (h === 0) firstHourIds.push(...s.guests.map((g) => g.id));
  }
  expect(ids.size).toBe(n);
  expect(firstHourIds.length).toBeLessThan(n);
});

test('hasReachableSeat: 좌석 없음 → false, 정낭 옆 좌석 → true, 길 없는 좌석 → false', () => {
  const s = bareState(1);
  expect(hasReachableSeat(s)).toBe(false);
  placeObject(s, 'table_out', X(4), Y(5));
  expect(hasReachableSeat(s)).toBe(true);
  spawnGuests(s, 2); // 좌석이 다 차도 길은 이어져 있으므로 true
  expect(hasReachableSeat(s)).toBe(true);
  const s2 = bareState(1);
  placeObject(s2, 'table_out', X(8), Y(2)); // 사방이 흙이라 정류장에서 못 닿음
  expect(hasReachableSeat(s2)).toBe(false);
});

import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { setSlot } from '../menu.ts';
import { tick, STEP_MS } from '../tick.ts';
import { LOAN_MAX } from '../failure.ts';
import { DAY_MS } from '../clock.ts';
import { dailyGuestCount } from '../guests.ts';
import { HOUR_MS } from '../clock.ts';
import { staffWith } from './staff.test.ts';

function cafe() {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(5) });
  setSlot(s, 0, 'carrot_juice'); // 아직 해금 전이라도 setSlot은 직접 호출로 검증 없이 올릴 수 있다
  s.storage['carrot'] = 50;
  return s;
}

test('하루가 지나면 손님이 온다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  expect(s.guests.length).toBeGreaterThan(0);
});

test('테이블 1개(2석)면 동시에 2명까지, 하루 총원은 dailyGuestCount 이하', () => {
  const s = cafe();
  s.segmentPopularity = { local: 99, tourist: 99 }; // 하루 4명 → 2석에 몰린다
  const ids = new Set<string>();
  let maxAtOnce = 0;
  for (let i = 0; i < 18; i++) {
    tick(s, DAY_MS / 18);
    for (const g of s.guests) ids.add(g.id);
    maxAtOnce = Math.max(maxAtOnce, s.guests.filter((g) => g.phase !== 'leaving').length);
  }
  expect(maxAtOnce).toBeLessThanOrEqual(2);
  expect(maxAtOnce).toBeGreaterThanOrEqual(1);
  expect(ids.size).toBeGreaterThanOrEqual(2);
  expect(ids.size).toBeLessThanOrEqual(dailyGuestCount(s));
});

test('한 달 지나면 정산 카드가 생기고 월 누적이 리셋된다', () => {
  const s = cafe();
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(4);
  expect(s.lastMonthCard?.month).toBe(3);
  expect(s.lastMonthCard!.income).toBeGreaterThan(0);
  expect(s.monthIncome).toBe(0);
});

test('프레임 길이가 달라도 결과가 같다 (고정 스텝)', () => {
  const a = cafe();
  const b = cafe();
  for (let i = 0; i < 100; i++) tick(a, 700);
  for (let i = 0; i < 700; i++) tick(b, 100);
  expect(a.tick).toBe(b.tick);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('speed 3이면 같은 실시간에 3배 스텝', () => {
  const s = cafe();
  apply(s, { type: 'setSpeed', speed: 3 });
  tick(s, 1000);
  expect(s.tick).toBe((1000 * 3) / STEP_MS); // STEP_MS는 HOUR_MS에 묶여 있다 (게임 시간 3분)
});

test('speed 0이면 손님도 안 움직인다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  const t0 = s.tick;
  apply(s, { type: 'setSpeed', speed: 0 });
  tick(s, 1000);
  expect(s.tick).toBe(t0);
});

test('24시→6시 경계: 밤 회복이 6시 기력 소모보다 먼저다', () => {
  const s = cafe();
  const st = staffWith({}, 'hall');
  s.staff.push(st);
  tick(s, 17 * HOUR_MS); // 23시
  expect(s.clock.hour).toBe(23);
  st.energy = 100;
  tick(s, HOUR_MS); // 24시 → 다음 날 6시
  expect(s.clock.hour).toBe(6);
  expect(st.energy).toBe(98); // +40(상한 100) 뒤 −2. 반대 순서면 100
});

test('달이 바뀌는 날: 월급 정산(퇴사)이 먼저고, 그 다음 농원 수확이 창고에 들어온다 (놓은 달은 제외)', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'place', objectType: 'tangerine_tree', x: X(6), y: Y(6) }).ok).toBe(true); // 감귤 6/월
  const st = staffWith({ strength: 30 }, 'hall');
  st.salary = 10000;
  st.unpaidMonths = 1; // 이번 월급도 못 주면 퇴사
  s.staff.push(st);
  s.money = 0;
  s.loan.count = LOAN_MAX; // 삼춘 대출로 월급이 나가지 않도록
  for (let i = 0; i < 29; i++) tick(s, DAY_MS);
  expect(s.storage['tangerine'] ?? 0).toBe(0); // 놓은 달엔 안 나온다
  tick(s, DAY_MS);
  expect(s.clock).toMatchObject({ month: 4, day: 1 });
  expect(s.staff.length).toBe(0);
  expect(s.lastMonthCard!.harvested).toEqual({}); // 3월 카드: 3월 1일 수확은 없었다
  expect(s.storage['tangerine']).toBe(6); // 4월 1일 수확
  expect(s.monthHarvest.harvested).toEqual({ tangerine: 6 });
});

test('한 번에 너무 긴 dt는 MAX_STEPS_PER_TICK에서 끊고 잔여를 버린다', () => {
  const s = cafe();
  tick(s, 1_000_000);
  expect(s.tick).toBe(600);
  expect(s.clock.carryMs).toBe(0);
});

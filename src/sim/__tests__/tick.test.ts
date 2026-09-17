import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';

function cafe() {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: 4, y: 5 });
  apply(s, { type: 'setSlot', slot: 0, menuId: 'carrot_juice' });
  s.storage['carrot'] = 50;
  return s;
}

test('하루가 지나면 손님이 온다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  expect(s.guests.length).toBeGreaterThan(0);
});

test('테이블 1개(2석)면 하루에 2명 온다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  expect(s.guests.length).toBe(2);
});

test('한 달 지나면 정산 카드가 생기고 월 누적이 리셋된다', () => {
  const s = cafe();
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(2);
  expect(s.lastMonthCard?.month).toBe(1);
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
  expect(s.tick).toBe(30);
});

test('speed 0이면 손님도 안 움직인다', () => {
  const s = cafe();
  tick(s, DAY_MS);
  const t0 = s.tick;
  apply(s, { type: 'setSpeed', speed: 0 });
  tick(s, 1000);
  expect(s.tick).toBe(t0);
});

test('한 번에 너무 긴 dt는 MAX_STEPS_PER_TICK에서 끊고 잔여를 버린다', () => {
  const s = cafe();
  tick(s, 1_000_000);
  expect(s.tick).toBe(600);
  expect(s.clock.carryMs).toBe(0);
});

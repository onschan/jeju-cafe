import { test, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { startRushNow, stepRush, rushState, weekdayOf, RUSH_WEEKDAY, RUSH_START_HOUR } from '../rush.ts';
/** 결과 카드에서 「온 손님 7 · 받은 1 · 놓친 1」처럼 숫자가 안 맞아 보인 적이 있어 불변식으로 걸어 둔다. */
test('온 손님 = 받은 손님 + 놓친 손님', () => {
  const s = createInitialState(1, 'local', 0, 'starter');
  while (weekdayOf(s.clock.day) !== RUSH_WEEKDAY) s.clock.day++;
  s.clock.hour = RUSH_START_HOUR;
  startRushNow(s);
  const r = rushState(s);
  for (let i = 0; i < 400 && r.phase === 'run'; i++) stepRush(s);
  expect(r.served + r.left).toBe(r.arrived);
});

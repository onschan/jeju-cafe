import type { GameState } from './types.ts';
import { advanceClock } from './clock.ts';
import { growOneDay } from './farm.ts';
import { spawnGuests, updateGuests, freeSeats } from './guests.ts';

export const STEP_MS = 100;        // 고정 스텝 (게임 ms)
export const DAILY_SPAWN_CAP = 3;
const MAX_STEPS_PER_TICK = 600;    // 백그라운드 복귀 등 폭주 방지 (60초 게임 시간)

function onNewDay(state: GameState): void {
  growOneDay(state);
  const n = Math.min(DAILY_SPAWN_CAP, freeSeats(state).length);
  spawnGuests(state, n);
}

function onNewMonth(state: GameState, prevMonth: number, prevYear: number): void {
  state.lastMonthCard = { income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear };
  state.monthIncome = 0;
  state.monthGuests = 0;
}

/** 고정 스텝 하나. 결정적. 리플레이는 이 함수만 호출한다. */
export function step(state: GameState): void {
  const prevMonth = state.clock.month;
  const prevYear = state.clock.year;
  const days = advanceClock(state, STEP_MS);
  for (let i = 0; i < days; i++) onNewDay(state);
  if (state.clock.month !== prevMonth) onNewMonth(state, prevMonth, prevYear);
  updateGuests(state, STEP_MS);
  state.tick++;
}

/** 실시간 dtMs를 speed로 환산해 STEP_MS 단위로 step을 돌린다. 잔여는 clock.carryMs에 보관. */
export function tick(state: GameState, dtMs: number): GameState {
  const c = state.clock;
  c.carryMs += dtMs * c.speed;
  let steps = 0;
  while (c.carryMs >= STEP_MS && steps < MAX_STEPS_PER_TICK) {
    c.carryMs -= STEP_MS;
    step(state);
    steps++;
  }
  if (steps === MAX_STEPS_PER_TICK) c.carryMs = 0;
  return state;
}

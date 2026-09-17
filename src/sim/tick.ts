import type { GameState } from './types.ts';
import { advanceClock, END_HOUR, START_HOUR } from './clock.ts';
import { growOneDay, staffFarmWork } from './farm.ts';
import { hourlySpawn, updateGuests } from './guests.ts';
import { upkeep, closeMonth } from './economy.ts';
import { payroll, expireCandidates, hourlyEnergy, nightlyRecovery, moveStaff } from './staff.ts';

export const STEP_MS = 100;        // 고정 스텝 (게임 ms)
const MAX_STEPS_PER_TICK = 600;    // 백그라운드 복귀 등 폭주 방지 (60초 게임 시간)
const HOURS_PER_DAY = END_HOUR - START_HOUR;

/** 시간이 한 칸 지날 때마다 (새 시각 = state.clock.hour) */
function onNewHour(state: GameState): void {
  hourlyEnergy(state);
  hourlySpawn(state);
}

/** 새 날: 밤 회복 → 생육 → 밭 일꾼 */
function onNewDay(state: GameState): void {
  nightlyRecovery(state);
  growOneDay(state);
  staffFarmWork(state);
}

/** 월 바뀜: 월급 → 유지비 → 정산 → 후보 만료 */
function onNewMonth(state: GameState, prevMonth: number, prevYear: number): void {
  payroll(state);
  upkeep(state);
  closeMonth(state, prevMonth, prevYear);
  expireCandidates(state);
}

/** 고정 스텝 하나. 결정적. 리플레이는 이 함수만 호출한다. */
export function step(state: GameState): void {
  const prevMonth = state.clock.month;
  const prevYear = state.clock.year;
  const prevHour = state.clock.hour;
  const days = advanceClock(state, STEP_MS);
  const hours = days * HOURS_PER_DAY + (state.clock.hour - prevHour);
  // 스텝(100ms) < 시간(200ms)이라 한 스텝에 시간은 최대 한 칸 지난다. 날이 바뀌는 시각이면 하루 처리 뒤 시간 처리.
  for (let i = 0; i < hours; i++) onNewHour(state);
  for (let i = 0; i < days; i++) onNewDay(state);
  if (state.clock.month !== prevMonth) onNewMonth(state, prevMonth, prevYear);
  updateGuests(state, STEP_MS);
  moveStaff(state, STEP_MS);
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

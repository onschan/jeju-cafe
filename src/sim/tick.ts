import type { GameState } from './types.ts';
import { advanceClock, END_HOUR, START_HOUR } from './clock.ts';
import { growOneDay, staffFarmWork } from './farm.ts';
import { hourlySpawn, updateGuests } from './guests.ts';
import { upkeep, closeMonth } from './economy.ts';
import { payroll, expireCandidates, hourlyEnergy, nightlyRecovery, moveStaff } from './staff.ts';
import { expirePromotions } from './promotions.ts';
import { SETTLE_GRANT, SETTLE_GRANT_THRESHOLD } from './state.ts';
import { pushNotice } from './staff.ts';

export const STEP_MS = 100;        // 고정 스텝 (게임 ms)
const MAX_STEPS_PER_TICK = 600;    // 백그라운드 복귀 등 폭주 방지 (60초 게임 시간)
const HOURS_PER_DAY = END_HOUR - START_HOUR;

/** 시간이 한 칸 지날 때마다 (새 시각 = state.clock.hour) */
function onNewHour(state: GameState): void {
  hourlyEnergy(state);
  hourlySpawn(state);
}

/** 새 날 (6시의 시간 처리보다 먼저): 밤 회복 → 생육 → 밭 일꾼 */
function onNewDay(state: GameState): void {
  nightlyRecovery(state);
  growOneDay(state);
  staffFarmWork(state);
}

/** 월 바뀜 (1일의 날 처리보다 먼저): 월급 → 홍보 만료·인기 감소 → 유지비 → 정산 → 후보 만료 */
function onNewMonth(state: GameState, prevMonth: number, prevYear: number): void {
  payroll(state);
  expirePromotions(state);
  upkeep(state);
  closeMonth(state, prevMonth, prevYear);
  expireCandidates(state);
}

/** 정착지원금: 잔고가 40만 아래로 떨어지면 딱 한 번 300만 (GDD §1 비상금) */
export function settleGrant(state: GameState): boolean {
  if (state.settleGrantUsed || state.money >= SETTLE_GRANT_THRESHOLD) return false;
  state.settleGrantUsed = true;
  state.money += SETTLE_GRANT;
  pushNotice(state, `정착지원금 ₩${SETTLE_GRANT.toLocaleString()}을 받았어요`);
  return true;
}

/** 고정 스텝 하나. 결정적. 리플레이는 이 함수만 호출한다. */
export function step(state: GameState): void {
  const prevMonth = state.clock.month;
  const prevYear = state.clock.year;
  const prevHour = state.clock.hour;
  const days = advanceClock(state, STEP_MS);
  const hours = days * HOURS_PER_DAY + (state.clock.hour - prevHour);
  // 스텝(100ms) < 시간(2000ms)이라 한 스텝에 시간은 최대 한 칸 지난다.
  // 24시→6시 경계에서는 큰 단위부터: 월(월급·정산) → 날(밤 회복·생육·밭 일) → 시간(6시 기력 소모·스폰).
  if (state.clock.month !== prevMonth) onNewMonth(state, prevMonth, prevYear);
  for (let i = 0; i < days; i++) onNewDay(state);
  for (let i = 0; i < hours; i++) onNewHour(state);
  updateGuests(state, STEP_MS);
  moveStaff(state, STEP_MS);
  settleGrant(state);
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

import type { Clock, GameState, Season } from './types.ts';

export const DAY_MS = 2000;
export const DAYS_PER_MONTH = 30;

export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** 1년 1월 = 0 */
export function monthIndex(c: Clock): number {
  return (c.year - 1) * 12 + (c.month - 1);
}

/** 누적 시간을 반영해 며칠이 지났는지 돌려준다. 달·해 넘김 처리 포함.
 *  dtMs는 이미 게임 시간(ms)이어야 한다 — speed 변환은 호출자(tick)의 몫. */
export function advanceClock(state: GameState, dtMs: number): number {
  const c = state.clock;
  c.accMs += dtMs;
  let days = 0;
  while (c.accMs >= DAY_MS) {
    c.accMs -= DAY_MS;
    days++;
    c.day++;
    if (c.day > DAYS_PER_MONTH) {
      c.day = 1;
      c.month++;
      if (c.month > 12) {
        c.month = 1;
        c.year++;
      }
    }
  }
  return days;
}

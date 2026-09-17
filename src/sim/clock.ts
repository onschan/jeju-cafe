import type { Clock, GameState, Season } from './types.ts';

export const HOUR_MS = 200;      // 게임 시간 1시간
export const DAY_MS = 18 * HOUR_MS; // 1일 = 18시간(6시~24시) = 3600ms
export const DAYS_PER_MONTH = 30;
export const START_HOUR = 6;
export const END_HOUR = 24;

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

/** 누적 시간을 반영해 시간을 진행시킨다. hour가 24에 닿으면 다음 날 6시로 순환.
 *  달·해 넘김 처리 포함. 반환값은 지난 "일 수"(하위 호환 — 시간 수가 아니다).
 *  dtMs는 이미 게임 시간(ms)이어야 한다 — speed 변환은 호출자(tick)의 몫. */
export function advanceClock(state: GameState, dtMs: number): number {
  const c = state.clock;
  c.accMs += dtMs;
  let days = 0;
  while (c.accMs >= HOUR_MS) {
    c.accMs -= HOUR_MS;
    c.hour++;
    if (c.hour >= END_HOUR) {
      c.hour = START_HOUR;
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
  }
  return days;
}

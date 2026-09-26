import type { Clock, GameState, Season } from './types.ts';

export const DAYS_PER_MONTH = 30;
/** 한 주 7일. 러시가 없어진 뒤에도 주 리듬은 남긴다 — 주말엔 손님이 더 온다 (guests.ts WEEKEND_GUEST_MULT). */
export const WEEK_DAYS = 7;
/** 그 달 며칠(1~30)이 주의 몇째 날인가 (0 = 월요일, 5·6 = 토·일) */
export function weekdayOf(day: number): number { return (day - 1) % WEEK_DAYS; }
export function isWeekend(day: number): boolean { return weekdayOf(day) >= 5; }
export const START_HOUR = 6;
export const END_HOUR = 24;
/** 게임 시간 1시간이 흐르는 데 걸리는 시간(1배속 ms).
 *  pace: 2000 → 1200 — 하루 21.6초 · 한 달 10.8분 · 1년 2시간 10분. 엔딩(5년차 3월)까지 1배속 8.6시간 / 3배속 2.9시간.
 *  이 값은 시계 속도만 바꾼다. 손님이 앉아 있는 시간·조리 시간·걷는 속도는 모두 HOUR_MS로 환산해 두어(guests.SEAT_MS·PREP_MS·VISIT_MS,
 *  rooms.MS_PER_HOUR, path.GUEST_SPEED_CELLS_PER_S) **게임 시간 기준 흐름은 그대로다** — 하루 매출·월 순이익 곡선이 바뀌지 않는다. */
export const HOUR_MS = 1200;
export const DAY_MS = (END_HOUR - START_HOUR) * HOUR_MS; // 1일 = 18시간(6시~24시) = 21,600ms

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

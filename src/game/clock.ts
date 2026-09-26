import type { Clock, Season, GameState } from './types.ts';
/** 1시간 = 1,500ms (1×). 하루 6~24시(18시간) = 27초, 한 달 30일 ≈ 13.5분. */
export const HOUR_MS = 1500;
export const START_HOUR = 6;
export const END_HOUR = 24;
export const DAY_MS = HOUR_MS * (END_HOUR - START_HOUR);
export const DAYS_PER_MONTH = 30;
export const STEP_MS = 100;

export function newClock(): Clock { return { year: 1, month: 3, day: 1, hour: START_HOUR, ms: 0, speed: 1 }; }
export function monthIndex(c: Clock): number { return (c.year - 1) * 12 + (c.month - 1); }
export function dayIndex(c: Clock): number { return monthIndex(c) * DAYS_PER_MONTH + (c.day - 1); }
export function seasonOf(month: number): Season { return month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'; }
export function isNight(c: Clock): boolean { return c.hour >= 19; }

/** ms만큼 시계를 민다. 넘어간 시간·날·달·해를 돌려준다 (tick이 훅을 돈다). */
export function advance(state: GameState, ms: number): { hours: number; days: number; months: number; years: number } {
  const c = state.clock;
  const out = { hours: 0, days: 0, months: 0, years: 0 };
  c.ms += ms;
  while (c.ms >= HOUR_MS) {
    c.ms -= HOUR_MS;
    c.hour++;
    out.hours++;
    if (c.hour >= END_HOUR) {
      c.hour = START_HOUR;
      c.day++;
      out.days++;
      if (c.day > DAYS_PER_MONTH) {
        c.day = 1; c.month++; out.months++;
        if (c.month > 12) { c.month = 1; c.year++; out.years++; }
      }
    }
  }
  return out;
}

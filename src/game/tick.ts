/** 고정 스텝. 시간이 흐르며 손님이 오고, 시간·날·달·해 훅이 돈다. */
import type { GameState } from './types.ts';
import { advance, STEP_MS } from './clock.ts';
import { hourlySpawn, updateGuests, FAME_DECAY } from './guests.ts';
import { monthEnd } from './economy.ts';
import { refreshCandidates } from './staff.ts';
import { evaluate } from './evaluate.ts';
import { checkObjectives } from './objectives.ts';

export function step(s: GameState, ms = STEP_MS): void {
  s.tick++;
  updateGuests(s, ms);
  const t = advance(s, ms);
  for (let i = 0; i < t.hours; i++) hourlySpawn(s);
  if (t.days > 0) { s.todayGuests = 0; s.fame = Math.floor(s.fame * FAME_DECAY); checkObjectives(s); }
  if (t.months > 0) { monthEnd(s); refreshCandidates(s); if (s.clock.month === 1) evaluate(s); }
}
/** 총 ms만큼 고정 스텝으로 (헤드리스·테스트) */
export function run(s: GameState, ms: number): void { for (let t = 0; t < ms; t += STEP_MS) step(s, STEP_MS); }

/** 동네 대항전 균형 측정 (rushall): 봇 3년 동안 몇 승 몇 패인지, 점수 폭이 어떤지. */
import { createInitialState, tick, DAY_MS } from '../src/sim/index.ts';
import { monthlyPlan, dailyPlan } from '../src/sim/bot.ts';

const years = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1);
const s = createInitialState(seed);
let wins = 0, losses = 0, lastMi = -1, month = -1, played = 0;
const rows: string[] = [];
for (let d = 0; d < years * 360; d++) {
  if (s.clock.month !== month) { month = s.clock.month; played++; monthlyPlan(s, played); }
  dailyPlan(s);
  tick(s, DAY_MS);
  const r = s.battle?.round;
  if (r?.done && s.battle!.lastMonthIndex !== lastMi) {
    lastMi = s.battle!.lastMonthIndex;
    if (r.myScore >= r.theirScore) wins++; else losses++;
    rows.push(`${s.clock.year}-${String(s.clock.month).padStart(2, '0')} ${String(r.myScore).padStart(4)} vs ${String(r.theirScore).padStart(4)} ${r.myScore >= r.theirScore ? '승' : '패'}`);
  }
}
console.log(rows.join('\n'));
const g = s.rushGrades ?? { S: 0, A: 0, B: 0, C: 0 };
console.log(`seed ${seed}: ${wins}승 ${losses}패 (승률 ${Math.round((wins / Math.max(1, wins + losses)) * 100)}%) · 순위점 ${s.battle?.rankPoints ?? 0} · 챔프 ${s.battle?.champion} · 러시 S${g.S}/A${g.A}/B${g.B}/C${g.C} · 자금 ${s.money.toLocaleString()}`);

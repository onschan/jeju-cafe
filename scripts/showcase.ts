/** 쇼케이스용: 봇으로 n년 돌려 "다 자란 카페" 세이브 JSON을 만든다. pnpm tsx scripts/showcase.ts <years> <seed> <out> */
import { createInitialState, tick, apply, DAY_MS, serialize } from '../src/sim/index.ts';
import { monthlyPlan, dailyPlan } from '../src/sim/bot.ts';
import { writeFileSync } from 'node:fs';

const years = Number(process.argv[2] ?? 4), seed = Number(process.argv[3] ?? 1);
const s = createInitialState(seed);
let lastMonth = -1, months = 0;
for (let d = 0; d < years * 12 * 30; d++) {
  if (s.clock.month !== lastMonth) { lastMonth = s.clock.month; months++; monthlyPlan(s, months); }
  dailyPlan(s);
  tick(s, DAY_MS);
  if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' });
}
writeFileSync(process.argv[4] ?? 'showcase.json', serialize(s));
console.error(`${s.clock.year}년 ${s.clock.month}월 · 자금 ${s.money.toLocaleString()} · 등급 ${s.grade} · ★${s.star} · 시설 ${Object.keys(s.objects).length} · 직원 ${s.staff.length} · 목표 ${s.goals.claimed.length} · 평판 ${Math.round(s.reputation)} · 단골 ${(s.regulars ?? []).length}`);

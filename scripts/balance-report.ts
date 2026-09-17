/** 봇 N년 밸런스 표 (seed별): pnpm tsx scripts/balance-report.ts [years] [seeds...] */
import { runBot } from '../src/sim/bot.ts';
const years = Number(process.argv[2] ?? 2);
const seeds = process.argv.slice(3).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3]) {
  const rows = runBot(years, seed);
  console.log(`seed ${seed}`);
  for (const r of rows) console.log(`  ${r.year}년 ${String(r.month).padStart(2)}월 net ${String(Math.round(r.net / 10000)).padStart(6)}만 money ${String(Math.round(r.money / 10000)).padStart(6)}만 guests ${String(r.guests).padStart(4)} staff ${r.staff} research ${String(r.research).padStart(4)} mileage ${r.mileage} rank ${r.rank} star ${r.star} custom ${r.customMenus}`);
  const y1 = rows.filter((r) => r.year === 1).reduce((s, r) => s + r.net, 0);
  const y2 = rows.filter((r) => r.year === 2).reduce((s, r) => s + r.net, 0);
  console.log(`  1년차 합 ${Math.round(y1 / 10000)}만 · 2년차 합 ${Math.round(y2 / 10000)}만 · 2년차 적자 달 ${rows.filter((r) => r.year === 2 && r.net <= 0).map((r) => r.month).join(',') || '없음'}`);
}

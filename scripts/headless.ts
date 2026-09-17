/**
 * 봇이 N년을 자동 플레이하고 월별 CSV를 stdout에 찍는다. 봇 로직은 src/sim/bot.ts.
 * 사용: pnpm headless [years=3] [seed=1] > out.csv
 */
import { runBot } from '../src/sim/bot.ts';

const years = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1);

console.log('year,month,money,minMoney,research,popularity,net,staff,promos,guests');
for (const r of runBot(years, seed)) {
  console.log([r.year, r.month, r.money, r.minMoney, r.research, r.popularity, r.net, r.staff, r.promos, r.guests].join(','));
}

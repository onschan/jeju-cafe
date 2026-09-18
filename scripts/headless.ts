/**
 * 봇이 N년을 자동 플레이하고 월별 CSV를 stdout에 찍는다. 봇 로직은 src/sim/bot.ts.
 * 사용: pnpm headless [years=3] [seed=1] > out.csv
 * 마지막 줄(stderr)에 요약: 달성 목표 수·파산 여부·연차별 자금.
 */
import { runBot } from '../src/sim/bot.ts';

const years = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1);

console.log('year,month,money,minMoney,research,popularity,net,staff,promos,guests,customMenus,rank,star,mileage,goals,events');
const rows = runBot(years, seed);
for (const r of rows) {
  console.log([r.year, r.month, r.money, r.minMoney, r.research, r.popularity, r.net, r.staff, r.promos, r.guests, r.customMenus, r.rank, r.star, r.mileage, r.goals, r.events].join(','));
}
const last = rows[rows.length - 1];
const minMoney = Math.min(...rows.map((r) => r.minMoney));
const byYear = rows.filter((r) => r.month === 12).map((r) => `${r.year}년차 말 ₩${r.money.toLocaleString('en-US')}`).join(' · ');
console.error(`요약: 목표 ${last?.goals ?? 0}개 달성 · 최저 잔고 ₩${minMoney.toLocaleString('en-US')}${minMoney < 0 ? ' (파산!)' : ''} · ${byYear} · 랭크 ${last?.rank} ★${last?.star}`);

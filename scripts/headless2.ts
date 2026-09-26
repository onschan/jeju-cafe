/** 새 코어 헤드리스: npx tsx scripts/headless2.ts <years> <seed> */
import { runBot, newGame } from '../src/game/index.ts';
const years = Number(process.argv[2] ?? 3), seed = Number(process.argv[3] ?? 1);
const rows = runBot(years, seed, newGame);
console.log('year,month,money,fame,research,guests,income,facilities,staff,rank');
for (const r of rows) console.log([r.year, r.month, r.money, r.fame, r.research, r.guests, r.income, r.facilities, r.staff, r.rank ?? ''].join(','));
const min = Math.min(...rows.map((r) => r.money));
const last = rows.at(-1)!;
console.log(`요약: 최저 잔고 ₩${min.toLocaleString('en-US')} · 끝 ₩${last.money.toLocaleString('en-US')} · 명성 ${last.fame} · 시설 ${last.facilities} · 직원 ${last.staff} · 누적 손님 ${rows.reduce((n, r) => n + r.guests, 0)} · 마지막 순위 ${last.rank ?? '-'}`);

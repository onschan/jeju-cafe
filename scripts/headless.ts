/**
 * 봇이 N년을 자동 플레이하고 월별 CSV를 stdout에 찍는다. 봇 로직은 src/sim/bot.ts.
 * 사용: pnpm headless [years=3] [seed=1] [--solver] > out.csv
 *   --solver  정석 봇 대신 solver 정책(며칠마다 bestMoves 1위 수 하나, 14일 롤아웃 — src/sim/solver.ts). 3년에 몇 분.
 * 마지막 줄(stderr)에 요약: 달성 목표 수·파산 여부·연차별 자금.
 */
import { runBot } from '../src/sim/bot.ts';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const policy = process.argv.includes('--solver') ? 'solver' : 'heuristic';
const years = Number(args[0] ?? 3);
const seed = Number(args[1] ?? 1);

console.log('year,month,money,minMoney,research,popularity,net,staff,promos,guests,customMenus,rank,star,mileage,goals,events,unreachable,grade,corners,reputation,totalGuests');
const t0 = performance.now();
const rows = runBot(years, seed, policy);
for (const r of rows) {
  console.log([r.year, r.month, r.money, r.minMoney, r.research, r.popularity, r.net, r.staff, r.promos, r.guests, r.customMenus, r.rank, r.star, r.tickets, r.goals, r.events, r.unreachable, r.grade, r.corners, r.reputation, r.totalGuests].join(','));
}
const last = rows[rows.length - 1];
const minMoney = Math.min(...rows.map((r) => r.minMoney));
const byYear = rows.filter((r) => r.month === 12).map((r) => `${r.year}년차 말 ₩${r.money.toLocaleString('en-US')}`).join(' · ');
const ending = rows.find((r) => r.ending)?.ending; // z-ending: 10년차 3월 엔딩 최종 점수
const maxUnreach = Math.max(0, ...rows.map((r) => r.unreachable)); // botfix: 손님이 못 가는 시설
console.error(`요약(${policy} 봇, ${((performance.now() - t0) / 1000).toFixed(0)}s): 목표 ${last?.goals ?? 0}개 달성 · 최저 잔고 ₩${minMoney.toLocaleString('en-US')}${minMoney < 0 ? ' (파산!)' : ''} · ${byYear} · 랭크 ${last?.rank} ★${last?.star} · 못 가는 시설 ${last?.unreachable ?? 0}개(최대 ${maxUnreach}개)${ending ? ` · 엔딩 ${ending.total}점 「${ending.title}」` : ''}`);
// trim: 5년 KPI 표 (목표 60개 사슬 기준 ≥50 · 직원 ≥7 · 자금 ≤2억) — 연차별 자금·목표·직원·월 손님·★
if (years >= 5) {
  const y5 = rows.filter((r) => r.month === 12 && r.year <= 5).map((r) => `${r.year}년차 자금 ₩${r.money.toLocaleString('en-US')} · 목표 ${r.goals} · 직원 ${r.staff} · 월 손님 ${r.guests} · ★${r.star} · 등급 ${r.grade} · 명당 ${r.corners} · 평판 ${r.reputation} · 누적 손님 ${r.totalGuests}`);
  const l5 = rows.filter((r) => r.year <= 5).at(-1);
  const ok = l5 && l5.goals >= 50 && l5.staff >= 7 && l5.money <= 200_000_000;
  console.error(`5년 KPI(목표 ≥50·직원 ≥7·자금 ≤2억): ${ok ? '통과' : '미달'}\n  ${y5.join('\n  ')}`);
}

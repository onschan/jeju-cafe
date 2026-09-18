import { bareState } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { closeMonth, emptyMonthCosts } from '../economy.ts';
import { monthlyFailure, takeLoan, repayLoan, checkLoan, loanRewardMult, crisis, LOAN_AMOUNT, LOAN_MAX, LOAN_DEFICIT_MONTHS, WARN_DEFICIT_MONTHS, LOAN_REPAY_RATIO, CRISIS_MONEY, CRISIS_MONTHS, LOAN_REWARD_MULT } from '../failure.ts';
import { ownedParcels } from '../parcels.ts';
import { objectDef } from '../../data/index.ts';

/** 월말 정산을 income·costs로 흉내 내고 실패 상태 판정까지 */
function closeWith(s: ReturnType<typeof bareState>, income: number, salary: number): void {
  s.monthIncome = income;
  s.monthCosts = { ...emptyMonthCosts(), salary };
  s.money += income - salary;
  closeMonth(s, s.clock.month, s.clock.year);
  monthlyFailure(s);
  s.clock.month = (s.clock.month % 12) + 1;
  if (s.clock.month === 1) s.clock.year++;
}

test('경고: 3개월 연속 적자면 삼춘 경고 알림·장면, 카드 deficitStreak 배지', () => {
  const s = bareState(1);
  for (let i = 0; i < WARN_DEFICIT_MONTHS - 1; i++) closeWith(s, 100_000, 200_000);
  expect(s.deficitMonths).toBe(2);
  expect(s.alerts.some((a) => a.type === 'failure' && a.stage === 'warn')).toBe(false);
  closeWith(s, 100_000, 200_000);
  expect(s.deficitMonths).toBe(3);
  expect(s.lastMonthCard!.deficitStreak).toBe(3);
  expect(s.alerts.some((a) => a.type === 'failure' && a.stage === 'warn')).toBe(true); // 트랙 B 실패 대화
  expect(s.notices.some((n) => n.includes('적자 3개월'))).toBe(true);
  closeWith(s, 300_000, 200_000); // 흑자면 리셋
  expect(s.deficitMonths).toBe(0);
});

test('대출: 6개월 연속 적자면 300만 (한 달 1회·최대 3회), 대출 중 목표 보상 절반, 흑자 달 순이익 30% 자동 상환', () => {
  const s = bareState(1);
  s.money = 50_000_000; // 잔고 부족 대출이 끼지 않게
  for (let i = 0; i < LOAN_DEFICIT_MONTHS; i++) closeWith(s, 100_000, 200_000);
  expect(s.loan.count).toBe(1);
  expect(s.loan.balance).toBe(LOAN_AMOUNT);
  expect(loanRewardMult(s)).toBe(LOAN_REWARD_MULT);
  // 7개월째도 적자면 또 (한 달에 한 번)
  closeWith(s, 100_000, 200_000);
  expect(s.loan.count).toBe(2);
  // 흑자 달: 순이익 30% 상환, 카드에 loanRepay 줄
  const m0 = s.money;
  closeWith(s, 1_200_000, 200_000); // 순이익 100만 → 30만
  const card = s.lastMonthCard!;
  expect(card.costs.loanRepay).toBe(Math.round(1_000_000 * LOAN_REPAY_RATIO));
  expect(card.net).toBe(1_000_000 - 300_000);
  expect(card.loanBalance).toBe(LOAN_AMOUNT * 2 - 300_000);
  expect(s.money).toBe(m0 + 1_000_000 - 300_000);
  expect(s.loan.balance).toBe(LOAN_AMOUNT * 2 - 300_000);
  // 다 갚으면 배수 1
  s.loan.balance = 100_000;
  closeWith(s, 1_200_000, 200_000);
  expect(s.loan.balance).toBe(0);
  expect(loanRewardMult(s)).toBe(1);
  expect(s.notices.some((n) => n.includes('다 갚았어요'))).toBe(true);
});

test('대출 한도: 3회까지, 같은 달엔 한 번만; 잔고 < 40만이면 checkLoan이 받는다', () => {
  const s = bareState(1);
  expect(takeLoan(s, 'x')).toBe(true);
  expect(takeLoan(s, 'x')).toBe(false); // 같은 달
  s.clock.month++;
  expect(takeLoan(s, 'x')).toBe(true);
  s.clock.month++;
  expect(takeLoan(s, 'x')).toBe(true);
  expect(s.loan.count).toBe(LOAN_MAX);
  s.clock.month++;
  expect(takeLoan(s, 'x')).toBe(false);
  const t = bareState(2);
  t.money = 399_999;
  expect(checkLoan(t)).toBe(true);
  expect(t.money).toBe(399_999 + LOAN_AMOUNT);
  expect(t.monthLoan).toBe(LOAN_AMOUNT);
});

test('위기: 잔고 < −500만이 3개월이면 마지막에 산 필지를 강제 매각(시설 철거·50% 환불)하고 라이벌이 즉시 생긴다', () => {
  const s = createInitialState(1);
  const p = s.parcels.find((x) => !x.owned)!;
  p.owned = true;
  const objs = Object.values(s.objects).filter((o) => o.x >= p.x && o.x < p.x + p.w && o.y >= p.y && o.y < p.y + p.h);
  const objRefund = objs.reduce((n, o) => n + Math.round(objectDef(o.type).cost * 0.5), 0);
  s.money = CRISIS_MONEY - 1;
  s.loan.count = LOAN_MAX; // 대출이 끼지 않게
  for (let i = 0; i < CRISIS_MONTHS - 1; i++) closeWith(s, 0, 0);
  expect(s.crisisMonths).toBe(2);
  expect(ownedParcels(s)).toHaveLength(2);
  closeWith(s, 0, 0);
  expect(s.crisisMonths).toBe(0);
  expect(p.owned).toBe(false);
  expect(ownedParcels(s)).toHaveLength(1); // 시작 필지는 안 판다
  expect(s.money).toBe(CRISIS_MONEY - 1 + Math.round(p.price * 0.5) + objRefund);
  for (const o of objs) expect(s.objects[o.id]).toBeUndefined();
  expect(s.rivals).toHaveLength(1);
  expect(s.alerts.some((a) => a.type === 'failure' && a.stage === 'crisis')).toBe(true); // 트랙 B 실패 대화
  // 팔 필지가 없으면 라이벌만
  const t = bareState(3);
  crisis(t);
  expect(t.rivals).toHaveLength(1);
  expect(ownedParcels(t)).toHaveLength(1);
});

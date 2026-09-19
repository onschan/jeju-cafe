/**
 * 실패 상태 (스펙 §4.4) — 게임 오버 없이 지연·손실. 대화 텍스트는 트랙 B가 붙인다(여기서는 알림·장면 창만).
 * - 경고: 3개월 연속 적자 → 삼춘 경고 + 카드 "적자 3개월" 배지(MonthCard.deficitStreak).
 * - 대출: 6개월 연속 적자 또는 잔고 < 40만 → 삼춘 무이자 300만(최대 3회, 한 달 1회). 대출 중 목표 보상 절반(loanRewardMult — goals.ts가 곱한다).
 *   상환 = 흑자 달마다 순이익 30% 자동(카드 loanRepay 줄).
 * - 위기: 잔고 < −500만이 3개월 → 필지 1개 강제 매각(구매가 50% 환불, 시설 철거·건설비 50% 환불) + 라이벌 1곳 즉시 등장.
 * - 강등(★ 유지 심사)은 guidebook.ts starReview.
 */
import type { GameState, MonthCard, Parcel } from './types.ts';
import { RIVALS, objectDef } from '../data/index.ts';
import { pushNotice } from './staff.ts';
import { fmtNum } from './format.ts';
import { josa } from './josa.ts';
import { monthIndex } from './clock.ts';
import { removeObject } from './grid.ts';
import { ownedParcels, parcelAt } from './parcels.ts';
import { spawnRival, RIVAL_MAX } from './rivals.ts';
import { pickWeighted } from './rng.ts';

export const LOAN_AMOUNT = 3_000_000;
export const LOAN_MAX = 3;
/** 잔고가 이 아래로 떨어지면 대출 (옛 정착지원금 문턱) */
export const LOAN_THRESHOLD = 400_000;
export const WARN_DEFICIT_MONTHS = 3;
export const LOAN_DEFICIT_MONTHS = 6;
/** 흑자 달 순이익 중 자동 상환 비율 */
export const LOAN_REPAY_RATIO = 0.3;
/** 대출 중 목표 보상(money·tickets·mileage) 배수 */
export const LOAN_REWARD_MULT = 0.5;
export const CRISIS_MONEY = -5_000_000;
export const CRISIS_MONTHS = 3;
/** 강제 매각 환불 비율 (필지 구매가·시설 건설비) */
export const CRISIS_REFUND = 0.5;

export function hasLoan(state: GameState): boolean {
  return state.loan.balance > 0;
}
/** 목표 보상 배수 — 트랙 B goals.ts grantReward가 money·tickets·mileage에 곱한다 */
export function loanRewardMult(state: GameState): number {
  return hasLoan(state) ? LOAN_REWARD_MULT : 1;
}
export function canTakeLoan(state: GameState): boolean {
  return state.loan.count < LOAN_MAX && state.loan.lastMonthIndex !== monthIndex(state.clock);
}

/** 삼춘 대출 300만. 횟수·월 1회 제한에 걸리면 false. */
export function takeLoan(state: GameState, reason: string): boolean {
  if (!canTakeLoan(state)) return false;
  state.loan.count++;
  state.loan.balance += LOAN_AMOUNT;
  state.loan.lastMonthIndex = monthIndex(state.clock);
  state.money += LOAN_AMOUNT;
  state.monthLoan += LOAN_AMOUNT;
  pushNotice(state, `삼춘이 ${josa(`₩${fmtNum(LOAN_AMOUNT)}`, '을/를')} 빌려줬어요 (${reason}, ${state.loan.count}/${LOAN_MAX}회) — 흑자 달마다 순이익 30%로 갚아요`);
  state.alerts.push({ type: 'failure', stage: 'loan' }); // 트랙 B 대화(data/dialogue/failure.json)
  return true;
}

/** 매 스텝: 잔고가 40만 아래면 대출 (옛 settleGrant 자리). 받았으면 true. */
export function checkLoan(state: GameState): boolean {
  if (state.money >= LOAN_THRESHOLD) return false;
  return takeLoan(state, '잔고 부족');
}

/** 흑자 달 자동 상환: 카드 순이익의 30% (잔액 한도). 카드의 loanRepay·net·loanBalance를 고친다. */
export function repayLoan(state: GameState, card: MonthCard): number {
  if (!hasLoan(state) || card.net <= 0) return 0;
  const repay = Math.min(state.loan.balance, Math.round(card.net * LOAN_REPAY_RATIO));
  if (repay <= 0) return 0;
  state.loan.balance -= repay;
  state.money -= repay;
  card.costs.loanRepay += repay;
  card.net -= repay;
  card.loanBalance = state.loan.balance;
  pushNotice(state, `삼춘 대출 ₩${fmtNum(repay)} 상환${state.loan.balance === 0 ? ' — 다 갚았어요!' : ` (남은 ₩${fmtNum(state.loan.balance)})`}`);
  return repay;
}

/** 강제 매각할 필지: 시작 필지가 아닌 소유 필지 중 가장 나중에 산 것(번호 큰 것) */
function parcelToSell(state: GameState): Parcel | null {
  const owned = ownedParcels(state).filter((p) => p.no !== 1);
  return owned.length ? owned.reduce((a, b) => (b.no > a.no ? b : a)) : null;
}

/** 정착 실패 위기: 필지 1개 강제 매각(시설 철거·50% 환불) + 라이벌 즉시 등장 */
export function crisis(state: GameState): void {
  const p = parcelToSell(state);
  let refund = 0;
  if (p) {
    for (const o of Object.values(state.objects)) {
      if (parcelAt(state, o.x, o.y)?.id !== p.id) continue;
      refund += Math.round(objectDef(o.type).cost * CRISIS_REFUND);
      removeObject(state, o.id);
    }
    refund += Math.round(p.price * CRISIS_REFUND);
    p.owned = false;
    state.money += refund;
    pushNotice(state, `정착 실패 위기: ${p.name} 필지를 팔았어요 (₩${fmtNum(refund)} 환불)`);
  }
  if (state.rivals.length < RIVAL_MAX) {
    const def = pickWeighted(state, RIVALS, () => 1);
    if (def) spawnRival(state, def.id);
  }
  state.alerts.push({ type: 'failure', stage: 'crisis' }); // 트랙 B 대화(data/dialogue/failure.json)
}

/** 월말(closeMonth 뒤): 경고 → 6개월 적자 대출 → 상환 → 위기 판정 */
export function monthlyFailure(state: GameState): void {
  const card = state.lastMonthCard;
  if (!card) return;
  if (state.deficitMonths === WARN_DEFICIT_MONTHS) {
    pushNotice(state, `적자 ${WARN_DEFICIT_MONTHS}개월째 — 삼춘: "비용부터 줄여보라"`);
    state.alerts.push({ type: 'failure', stage: 'warn' }); // 트랙 B 대화
  }
  if (state.deficitMonths >= LOAN_DEFICIT_MONTHS) takeLoan(state, `적자 ${state.deficitMonths}개월`);
  repayLoan(state, card);
  state.crisisMonths = state.money < CRISIS_MONEY ? state.crisisMonths + 1 : 0;
  if (state.crisisMonths >= CRISIS_MONTHS) {
    state.crisisMonths = 0;
    crisis(state);
  }
}

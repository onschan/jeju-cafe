/**
 * 평판(reputation)·부정 피드백 (트랙 E 추가 범위)
 * - 손님이 겪은 불만을 사유(ComplaintReason)별로 기록한다(guests.ts의 이탈·불만 판정 지점에서 addComplaint 한 줄). 최근 30일 롤링.
 * - 매일 밤: reputation += (만족 손님 − 불만 손님 × 2) ÷ 총손님 × 3 (±2/일 상한). 청결 < 40 이면 −0.5/일, 노후 시설 3개 이상 −0.3/일. 0~100.
 * - 효과: 하루 손님 배수 0.5 + 평판/100 (guests.dailyGuestCount), 가이드북 심사 "평판" 항목, 평판 < 30이면 관광객 스폰 ×0.5·단골★ 월 10% 이탈,
 *   평판 ≥ 80이면 팁 +10%·단골★ 등장 확률 ×1.5.
 * - 월말: 그달 불만 상위 3개 → 후기 문장(state.reviews 최대 8개), 카드 reputationDelta·topComplaints. 20 아래로 떨어지면 삼춘 경고 알림.
 * - 회복: 원인 해결 + 홍보 "사과 이벤트"(apology_event, 월 1회 +8) + 선물(C의 giveGift가 있으면 addReputation(state, 1)).
 */
import type { GameState, Guest, ComplaintReason, Complaint, Review, MonthCard } from './types.ts';
import { canonicalGuestId, NAMED_TYPE } from '../data/index.ts';
import { dayIndex, filterMatches } from './effects.ts';
import { isAged } from './economy.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { nextRandom, pickWeighted } from './rng.ts';
import { regularIds, namedGuestState } from './popup.ts';

export const REPUTATION_START = 50;
export const REPUTATION_MAX = 100;
/** 일일 평판 변화 = (만족 − 불만×2)/총손님 × 3, 상한 ±2 */
export const REP_DAILY_RATE = 3;
export const REP_DAILY_CAP = 2;
export const REP_COMPLAINT_WEIGHT = 2;
/** 청결 < 40 → −0.5/일 (트랙 A state.clean.value), 노후 시설 ≥ 3 → −0.3/일 */
export const REP_DIRTY_THRESHOLD = 40;
export const REP_DIRTY_PENALTY = 0.5;
export const REP_WORN_COUNT = 3;
export const REP_WORN_PENALTY = 0.3;
/** 효과 문턱 */
export const REP_LOW = 30;
export const REP_HIGH = 80;
export const REP_ALERT = 20;
export const LOW_REP_TOURIST_MULT = 0.5;
export const LOW_REP_REGULAR_LEAVE = 0.1;
export const HIGH_REP_TIP_MULT = 1.1;
export const HIGH_REP_NAMED_MULT = 1.5;
/** 불만 기록 보관 일수, 후기 보관 수, 카드에 싣는 불만 사유 수 */
export const COMPLAINT_WINDOW_DAYS = 30;
export const MAX_REVIEWS = 8;
export const TOP_COMPLAINTS = 3;
/** 사과 이벤트(promotions.json apology_event) 평판 +8 */
export const APOLOGY_REPUTATION = 8;

export const COMPLAINT_REASONS: ComplaintReason[] = ['no_menu', 'wait_long', 'no_seat', 'dirty', 'worn', 'noise', 'expensive', 'cold_hot', 'rude'];
export const COMPLAINT_LABEL: Record<ComplaintReason, string> = {
  no_menu: '원하는 메뉴 없음', wait_long: '오래 기다림', no_seat: '자리 없음', dirty: '지저분함', worn: '낡은 시설',
  noise: '시끄러움', expensive: '비쌈', cold_hot: '춥거나 더움', rude: '불친절',
};
/** 후기 문장 (detail = 메뉴·시설 이름 등) */
export const COMPLAINT_REVIEW: Record<ComplaintReason, (detail?: string) => string> = {
  no_menu: (d) => d ? `${d}가 자주 품절이래요` : '먹고 싶은 메뉴가 없대요',
  wait_long: () => '너무 오래 기다렸대요',
  no_seat: () => '자리가 없어서 그냥 갔대요',
  dirty: () => '카페가 지저분하대요',
  worn: (d) => d ? `${d}가 낡았대요` : '시설이 낡았대요',
  noise: () => '자리가 너무 시끄럽대요',
  expensive: (d) => d ? `${d}가 너무 비싸대요` : '값이 너무 비싸대요',
  cold_hot: (d) => d === 'winter' ? '겨울 야외 자리가 너무 춥대요' : '여름 야외 자리가 너무 덥대요',
  rude: () => '직원이 지쳐서 불친절하대요',
};
const GOOD_REVIEWS = ['또 오고 싶은 카페래요', '경치가 좋고 편하대요', '직원이 친절하대요', '메뉴가 맛있대요'];

// ---------- 기록 ----------

/** 불만 한 건 기록 (guests.ts 판정 지점에서 호출). 오늘 불만 손님 수도 센다. */
export function addComplaint(state: GameState, reason: ComplaintReason, guest: Guest | string, detail?: string): void {
  const type = typeof guest === 'string' ? guest : guest.type;
  const c: Complaint = { day: dayIndex(state.clock), reason, guestType: type === NAMED_TYPE ? type : canonicalGuestId(type) };
  if (detail) c.detail = detail;
  state.complaints.push(c);
  state.monthComplaints[reason] = (state.monthComplaints[reason] ?? 0) + 1;
  state.dayStats.complained++;
}
/** 오늘 온 손님(주문 시점) */
export function noteGuest(state: GameState): void {
  state.dayStats.total++;
}
/** 오늘 만족한 손님 */
export function noteSatisfied(state: GameState): void {
  state.dayStats.satisfied++;
}
export function addReputation(state: GameState, delta: number): number {
  const before = state.reputation;
  state.reputation = Math.max(0, Math.min(REPUTATION_MAX, Math.round((state.reputation + delta) * 100) / 100));
  state.monthReputationDelta += state.reputation - before;
  return state.reputation - before;
}

/** 최근 30일 불만을 사유별로 센다 (많은 순) */
export function complaintCounts(state: GameState, counts: Partial<Record<ComplaintReason, number>> = countBy(state.complaints)): { reason: ComplaintReason; count: number }[] {
  return COMPLAINT_REASONS.map((reason) => ({ reason, count: counts[reason] ?? 0 })).filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
}
function countBy(cs: Complaint[]): Partial<Record<ComplaintReason, number>> {
  const out: Partial<Record<ComplaintReason, number>> = {};
  for (const c of cs) out[c.reason] = (out[c.reason] ?? 0) + 1;
  return out;
}
/** 그달 불만 상위 N */
export function topComplaints(state: GameState, n = TOP_COMPLAINTS): { reason: ComplaintReason; count: number }[] {
  return complaintCounts(state, state.monthComplaints).slice(0, n);
}

// ---------- 효과 ----------

/** 하루 손님 배수 = 0.5 + 평판/100 (50 → 1.0, 100 → 1.5, 20 → 0.7) */
export function reputationGuestMult(state: GameState): number {
  return 0.5 + state.reputation / 100;
}
/** 평판 < 30이면 관광객(육지 손님) 스폰 ×0.5 */
export function reputationTypeMult(state: GameState, typeId: string): number {
  return state.reputation < REP_LOW && typeId !== NAMED_TYPE && filterMatches('tourist', canonicalGuestId(typeId)) ? LOW_REP_TOURIST_MULT : 1;
}
/** 평판 ≥ 80이면 팁 +10% */
export function reputationTipMult(state: GameState): number {
  return state.reputation >= REP_HIGH ? HIGH_REP_TIP_MULT : 1;
}
/** 평판 ≥ 80이면 단골★ 등장 확률 ×1.5 (popup.ts 단골 방문 판정에 곱한다) */
export function reputationNamedMult(state: GameState): number {
  return state.reputation >= REP_HIGH ? HIGH_REP_NAMED_MULT : 1;
}
/** 가이드북 심사 "평판" 0~100 */
export function reputationScore(state: GameState): number {
  return Math.round(state.reputation);
}

// ---------- 일일·월간 ----------

/** 노후 시설 수 (트랙 A가 PlacedObject.aged를 채우면) */
export function wornCount(state: GameState): number {
  return Object.values(state.objects).filter((o) => isAged(state, o)).length;
}
/** 청결값 훅: 트랙 A의 state.clean.value (없으면 100) */
export function cleanValue(state: GameState): number {
  return state.clean.value;
}

/** 매일 밤: 평판 변화 → 오래된 불만 정리 → 일일 카운터 리셋. 변화량을 돌려준다. */
export function nightlyReputation(state: GameState): number {
  const d = state.dayStats;
  let delta = 0;
  if (d.total > 0) delta = Math.max(-REP_DAILY_CAP, Math.min(REP_DAILY_CAP, ((d.satisfied - d.complained * REP_COMPLAINT_WEIGHT) / d.total) * REP_DAILY_RATE));
  if (cleanValue(state) < REP_DIRTY_THRESHOLD) delta -= REP_DIRTY_PENALTY;
  if (wornCount(state) >= REP_WORN_COUNT) delta -= REP_WORN_PENALTY;
  const applied = addReputation(state, delta);
  const today = dayIndex(state.clock);
  state.complaints = state.complaints.filter((c) => today - c.day < COMPLAINT_WINDOW_DAYS);
  state.dayStats = { satisfied: 0, complained: 0, total: 0 };
  return applied;
}

/** 후기 점수 1~5 = 평판 20당 1 */
export function reviewScore(reputation: number): number {
  return Math.max(1, Math.min(5, Math.ceil(reputation / 20)));
}
/** 그달 불만 상위 3개로 후기를 만든다 (불만이 없으면 좋은 후기 1줄). 결정적(seed rng). */
export function makeReviews(state: GameState, month: number): Review[] {
  const top = topComplaints(state);
  const score = reviewScore(state.reputation);
  if (top.length === 0) return [{ month, score: Math.max(score, 3), text: pickWeighted(state, GOOD_REVIEWS, () => 1)! }];
  return top.map((t) => {
    const last = [...state.complaints].reverse().find((c) => c.reason === t.reason);
    return { month, score, text: COMPLAINT_REVIEW[t.reason](last?.detail), reason: t.reason };
  });
}

/** 월말(closeMonth 뒤): 후기 생성·카드 줄·저평판 경고·단골 이탈(평판 < 30, 월 10%). */
export function monthlyReputation(state: GameState, card: MonthCard | null = state.lastMonthCard): void {
  const month = card?.month ?? state.clock.month;
  const reviews = makeReviews(state, month);
  state.reviews = [...reviews, ...state.reviews].slice(0, MAX_REVIEWS);
  if (card) {
    card.reputationDelta = Math.round(state.monthReputationDelta * 10) / 10;
    card.topComplaints = topComplaints(state);
    card.reputation = state.reputation;
  }
  if (state.reputation < REP_LOW && nextRandom(state) < LOW_REP_REGULAR_LEAVE) {
    const id = pickWeighted(state, regularIds(state), () => 1);
    if (id) { namedGuestState(state, id).regular = false; pushNotice(state, `평판이 나빠 단골이 발길을 끊었어요`); }
  }
  if (state.reputation < REP_ALERT && !state.reputationWarned) {
    state.reputationWarned = true;
    const worst = card?.topComplaints[0];
    const why = worst ? ` 제일 많은 불만은 "${COMPLAINT_LABEL[worst.reason]}"이에요.` : '';
    state.alerts.push({ type: 'reputation', text: `카페 평판이 바닥이에요(♥${Math.round(state.reputation)}).${why} 원인을 고치고 사과 이벤트도 해 보세요.` });
    pushFx(state, { kind: 'scene', title: '악평', text: `평판 ♥${Math.round(state.reputation)} — 나쁜 후기가 퍼지고 있어요.`, tick: state.tick });
  }
  if (state.reputation >= REP_LOW) state.reputationWarned = false;
  state.monthComplaints = {};
  state.monthReputationDelta = 0;
}

/** 사과 이벤트 홍보(promotions.ts special 'apology'): 평판 +8, 월 1회 */
export function applyApology(state: GameState): void {
  addReputation(state, APOLOGY_REPUTATION);
  pushNotice(state, `사과 이벤트 — 평판 +${APOLOGY_REPUTATION} (♥${Math.round(state.reputation)})`);
}

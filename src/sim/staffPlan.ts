/** 채용 판단 자료 (staff2): 「지금 필요해요」 병목 · 후보를 뽑았을 때의 예상 변화 3줄 · 후보 비교표 한 줄.
 *  전부 지금 상태에서 바로 계산하는 순수 함수다 — 롤아웃을 돌리지 않아 창을 열 때 바로 뜨고, 같은 상태면 늘 같은 답이 나온다.
 *  수치는 실제로 쓰는 공식(guests.prepTimeMs·servingCapacity·serviceBonus·waitCapOf, cleanliness.seatDirt, staff.cleanPowerOf)에서 뽑는다. */
import type { GameState, Candidate, RoleId, Stats, Staff } from './types.ts';
import { roleDef } from '../data/index.ts';
import { wonText } from '../data/labels.ts';
import {
  roleHeads, roleHeadsWith, staffInRole, salaryOf, salaryDue, staffCapacity, HEAD_STAT, HEAD_MAX, DIMINISH_FROM,
} from './staff.ts';
import {
  PREP_MS, PREP_CUT_PER_HEAD, MAX_PREP_CUT, SERVICE_PER_HEAD, SERVICE_MAX, WAIT_PER_HALL_HEAD, WAIT_EXTRA_MAX, WAIT_MAX,
  OWNER_DRINKS_PER_DAY, DRINKS_PER_BARISTA, FOOD_PER_COOK, ordersToday, servingCapacity, waitCapOf, serviceBonus, dailyGuestCount,
} from './guests.ts';
import { seatDirt, dailyCleanRecovery, CLEAN_LOW, CLEAN_FREE_SEATS } from './cleanliness.ts';

const ROLE_ORDER: RoleId[] = ['barista', 'cook', 'hall', 'clean'];
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 한 직종을 한 줄로: 지금 몇 인분인지 + 그 직종이 지금 카페에서 하는 일 */
export function roleEffectText(state: GameState, role: RoleId): string {
  const h = roleHeads(state, role);
  const one = (v: number) => Math.round(v * 10) / 10;
  switch (role) {
    case 'barista': return h <= 0 ? `주인이 하루 ${OWNER_DRINKS_PER_DAY}잔까지 혼자 내요` : `음료 대기 −${pct(Math.min(MAX_PREP_CUT, PREP_CUT_PER_HEAD * h))} · 하루 ${Math.round(OWNER_DRINKS_PER_DAY + DRINKS_PER_BARISTA * h)}잔`;
    case 'cook': return h <= 0 ? '디저트·식사는 요리사가 있어야 나가요' : `하루 ${Math.round(FOOD_PER_COOK * h)}접시까지 제때 · 재료비 절약`;
    case 'hall': return h <= 0 ? '줄이 3자리뿐이라 손님이 돌아가요' : `손님 만족 +${serviceBonus(state)} · 줄 ${waitCapOf(state)}자리`;
    default: return seatDirt(state) <= 0 ? `자리가 ${CLEAN_FREE_SEATS}개를 넘으면 필요해요` : `하루 청결 +${one(dailyCleanRecovery(state))} · 자리에서 −${one(seatDirt(state))}`;
  }
}

export interface RoleNeed { role: RoleId; why: string; urgency: number }
/** 지금 모자란 직종 — 매력도 패널의 서비스 항목과 같은 데이터(주문 적체·줄·청결)를 본다. 급한 순. */
export function roleNeeds(state: GameState): RoleNeed[] {
  const out: RoleNeed[] = [];
  const guests = dailyGuestCount(state);

  const drinkCap = servingCapacity(state, 'drink');
  const drinks = Math.max(ordersToday(state, 'drink'), Math.round(guests * 0.6)); // 오늘 아직 안 받았으면 예상 주문으로 본다
  if (drinkCap < drinks) out.push({ role: 'barista', why: `음료가 밀려요 (하루 ${drinks}잔, 지금 ${Math.round(drinkCap)}잔)`, urgency: drinks / Math.max(1, drinkCap) });

  if (roleHeads(state, 'cook') <= 0) out.push({ role: 'cook', why: '요리사가 없어 디저트·식사를 못 내요', urgency: 3 });
  else {
    const foodCap = servingCapacity(state, 'meal');
    const food = Math.max(ordersToday(state, 'dessert') + ordersToday(state, 'meal'), Math.round(guests * 0.3));
    if (foodCap < food) out.push({ role: 'cook', why: `음식이 밀려요 (하루 ${food}접시, 지금 ${Math.round(foodCap)}접시)`, urgency: food / Math.max(1, foodCap) });
  }

  if (state.monthGuestsLeft > 0) out.push({ role: 'hall', why: `줄이 차서 이달 ${state.monthGuestsLeft}명이 돌아갔어요`, urgency: 1 + state.monthGuestsLeft / 20 });
  else if (serviceBonus(state) < SERVICE_MAX && roleHeads(state, 'hall') < 1) out.push({ role: 'hall', why: '홀이 비어 손님 기분을 못 챙겨요', urgency: 1.2 });

  const dirt = seatDirt(state);
  if (state.clean.value < CLEAN_LOW) out.push({ role: 'clean', why: `청결 ${Math.round(state.clean.value)} — 손님이 줄고 있어요`, urgency: 3 });
  else if (dirt > dailyCleanRecovery(state)) out.push({ role: 'clean', why: `자리가 ${CLEAN_FREE_SEATS}개를 넘어 매일 더러워져요`, urgency: 1.5 });

  return out.sort((a, b) => b.urgency - a.urgency);
}
/** 그 직종이 지금 필요한가 (후보 카드 「지금 필요해요」 칩) */
export function needOf(state: GameState, role: RoleId): RoleNeed | null {
  return roleNeeds(state).find((n) => n.role === role) ?? null;
}

export interface HireForecast {
  role: RoleId;
  /** 「우리 카페에 오면」 3줄 (≤22자) */
  lines: string[];
  salary: number;
  /** 뽑은 뒤 다음 달 인건비 합계 */
  payrollAfter: number;
  /** 세 번째 사람부터 몫이 절반이라 효과가 덜한가 */
  diminished: boolean;
  /** 비교표 한 칸: 그 직종의 대표 수치가 얼마나 좋아지나 */
  gain: string;
}

/** 이 후보를 이 직종으로 뽑으면 무엇이 얼마나 달라지나. 지금 공식 그대로 계산한다. */
export function hireForecast(state: GameState, who: { stats: Stats; baseSalary: number; level: number; title?: string }, role: RoleId): HireForecast {
  const before = roleHeads(state, role);
  const after = roleHeadsWith(state, role, who.stats);
  const salary = salaryOf(who, state.salaryRaisePct);
  const payrollAfter = state.staff.reduce((n, st) => n + salaryDue(st), 0) + salary;
  const lines: string[] = [];
  let gain = '';

  if (role === 'barista') {
    const cut0 = Math.min(MAX_PREP_CUT, PREP_CUT_PER_HEAD * before);
    const cut1 = Math.min(MAX_PREP_CUT, PREP_CUT_PER_HEAD * after);
    const cap0 = OWNER_DRINKS_PER_DAY + DRINKS_PER_BARISTA * before;
    const cap1 = OWNER_DRINKS_PER_DAY + DRINKS_PER_BARISTA * after;
    gain = `음료 대기 −${pct(cut1 - cut0)}`;
    lines.push(cut1 > cut0 ? `음료 대기 −${pct(cut1 - cut0)}` : '음료 대기는 이미 가장 짧아요');
    lines.push(`하루 ${Math.round(cap0)}잔 → ${Math.round(cap1)}잔까지 제때`);
  } else if (role === 'cook') {
    const cap0 = FOOD_PER_COOK * before;
    const cap1 = FOOD_PER_COOK * after;
    gain = `음식 +${Math.round(cap1 - cap0)}접시`;
    lines.push(before <= 0 ? '디저트·식사를 낼 수 있어요' : `하루 ${Math.round(cap0)}접시 → ${Math.round(cap1)}접시`);
    lines.push(`재료비가 ${pct(Math.min(0.3, who.stats.skill / 500))}쯤 줄어요`);
  } else if (role === 'hall') {
    const sv0 = Math.min(SERVICE_MAX, Math.round(SERVICE_PER_HEAD * before));
    const sv1 = Math.min(SERVICE_MAX, Math.round(SERVICE_PER_HEAD * after));
    const q0 = WAIT_MAX + Math.min(WAIT_EXTRA_MAX, Math.round(WAIT_PER_HALL_HEAD * before));
    const q1 = WAIT_MAX + Math.min(WAIT_EXTRA_MAX, Math.round(WAIT_PER_HALL_HEAD * after));
    gain = `만족 +${sv1 - sv0} · 줄 +${q1 - q0}`;
    lines.push(`손님 만족 +${sv1 - sv0} (지금 +${sv0})`);
    lines.push(q1 > q0 ? `줄이 ${q0}자리 → ${q1}자리, 덜 돌아가요` : '줄은 이미 넉넉해요');
  } else {
    const add = who.stats.skill / 5 + who.stats.strength / 10;
    const share = staffInRole(state, role).length >= DIMINISH_FROM ? 0.5 : 1;
    const gainClean = Math.round(add * share * 10) / 10;
    gain = `청결 +${gainClean}/일`;
    lines.push(`하루 청결 +${gainClean} (자리 오염 ${Math.round(seatDirt(state) * 10) / 10})`);
    lines.push(state.clean.value < CLEAN_LOW ? '지저분해서 손님이 줄고 있어요' : '넓어져도 청결을 지켜요');
  }

  lines.push(`월급 ${wonText(salary)} · 인건비 합계 ${wonText(payrollAfter)}`);
  return { role, lines: lines.slice(0, 3), salary, payrollAfter, diminished: staffInRole(state, role).length >= DIMINISH_FROM, gain };
}

/** 후보를 뽑을 수 있는 직종 중 지금 가장 도움이 되는 직종 (후보 카드 기본 선택) */
export function suggestRole(state: GameState, open: RoleId[]): RoleId | null {
  if (open.length === 0) return null;
  const needs = roleNeeds(state);
  for (const n of needs) if (open.includes(n.role)) return n.role;
  return ROLE_ORDER.find((r) => open.includes(r)) ?? open[0]!;
}

/** 정원·인건비 한 줄 (채용 탭 머리) */
export interface StaffBudget { count: number; cap: number; payroll: number; nextMonth: number }
export function staffBudget(state: GameState): StaffBudget {
  const payroll = state.staff.reduce((n, st) => n + salaryDue(st), 0);
  return { count: state.staff.length, cap: staffCapacity(state), payroll, nextMonth: payroll };
}

/** 후보 한 명이 이 직종에서 몇 인분인지 (비교표) */
export function headsOfCandidate(c: Pick<Candidate, 'stats'>, role: RoleId): number {
  return Math.min(HEAD_MAX, c.stats[roleDef(role).stat] / HEAD_STAT);
}
/** 우리 직원 한 명이 그 직종에서 몇 인분인지 */
export function headsOfStaff(st: Staff, role: RoleId): number {
  return Math.min(HEAD_MAX, st.stats[roleDef(role).stat] / HEAD_STAT);
}

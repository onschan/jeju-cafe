/**
 * 경제 (트랙 E, 스펙 §4.2 자금 곡선 레버)
 * - 유지비 2.5%/월 (데이터의 upkeep은 건설비 1.5% 기준이라 배율로 환산). 노후 ×1.5·증축 Lv 배수는 objectStats().upkeep(트랙 A upkeepMultOf)에 이미 들어 있다.
 * - 급여 공식 salaryOf(§3.6.3): 기본급 × (1 + 0.15 × (Lv − 1)) × (1 + 인상%) + 스탯 합 × 1,000. 매년 3월 1일 +5% 누적 인상.
 * - 소득세: 매년 3월 1일 전년 순이익 × 10% (적자면 0). 투어 버스 월 50만 고정비(선택).
 * - 월말 카드에 세금·대출·라이벌 손실·대기 이탈 줄.
 */
import type { GameState, MonthCosts, PlacedObject, Stats } from './types.ts';
import { ingredientDef } from '../data/index.ts';
import { menuOf, toppingCost, costMult } from './craft.ts';
import { parcelAt, ownedParcels } from './parcels.ts';
import { objectStats } from './compat.ts';
import { isWorn } from './cleanliness.ts';
import { effectMult } from './effects.ts';
import { pushNotice, STAT_KEYS } from './staff.ts';
import { fmtNum } from './format.ts';
import { monthIndex } from './clock.ts';
import { addReputation, topComplaints } from './reputation.ts';
import type { MonthGrade } from './types.ts';

/** 유지비: 건설비의 2.5%/월. 데이터(objects/facilities)의 upkeep 값은 1.5% 기준이라 배율로 환산한다. */
export const UPKEEP_RATE = 0.025;
export const DATA_UPKEEP_RATE = 0.015;
/** 급여: 기본급(채용 등급별, 없으면 40만) × Lv 계수 + 스탯 합 × 1,000 */
export const BASE_SALARY_DEFAULT = 400_000;
export const SALARY_LEVEL_STEP = 0.15;
export const SALARY_PER_STAT_POINT = 1000;
/** 매년 3월 1일 급여 인상 % (누적) */
export const ANNUAL_RAISE_PCT = 12;
/** 소득세율 (전년 순이익 기준) */
export const TAX_RATE = 0.1;
export const TAX_MONTH = 3;
/** 투어 버스 월 고정비 */

/** 재료 원가 합 + 토핑 원가 (창고 재고는 보지 않는 정가 — UI 표시·개발 비용용). 운반·절약 스킬·콤보·세련미만큼 할인. */
export function ingredientCost(state: GameState, menuId: string): number {
  let sum = toppingCost(state, menuId);
  for (const [id, n] of Object.entries(menuOf(state, menuId).ingredients)) sum += ingredientDef(id).cost * n;
  return Math.round(sum * costMult(state, menuId));
}

export function emptyMonthCosts(): MonthCosts {
  return { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0, tax: 0, loanRepay: 0, shuttle: 0, rent: 0, contest: 0 };
}
export function totalCosts(c: MonthCosts): number {
  return c.ingredients + c.salary + c.ads + c.upkeep + c.recruit + c.tax + c.loanRepay + c.shuttle + (c.rent ?? 0) + (c.contest ?? 0);
}

// ---------- 임대료 (stakes) ----------

/** 소유 필지 1개당 월 임대료 — 내 땅이어도 마을에 내는 관리비 명목. 땅을 넓힐수록 고정비가 늘어 「이번 달에 뭘 살지」가 고민이 된다. */
export const RENT_PER_PARCEL = 80_000;
/** 이달 임대료 (소유 필지 수 × RENT_PER_PARCEL) */
export function rentOf(state: GameState): number {
  return ownedParcels(state).length * RENT_PER_PARCEL;
}
/** 매월 1일: 임대료를 낸다 (카드 「마을 관리비」 줄) */
export function rent(state: GameState): number {
  const sum = rentOf(state);
  if (sum <= 0) return 0;
  state.money -= sum;
  state.monthCosts.rent = (state.monthCosts.rent ?? 0) + sum;
  return sum;
}

// ---------- 대출 상환 기한 (stakes) ----------

/** 삼춘 대출 상환 기한 (개월). 기한을 넘기면 평판이 깎이고, 목표 보상 50%가 그대로 이어진다. */
export const LOAN_DUE_MONTHS = 12;
/** 기한을 넘겼을 때 평판 */
export const LOAN_OVERDUE_REPUTATION = -5;
/** 매월 1일(정산 전): 기한이 지났는데 아직 남았으면 평판 −5, 기한을 12개월 더 준다. 깎인 평판(0이면 없음). */
export function loanDue(state: GameState): number {
  const due = state.loan.dueMonthIndex;
  if (state.loan.balance <= 0 || due === undefined) return 0;
  const mi = monthIndex(state.clock);
  if (mi < due) return 0;
  state.loan.dueMonthIndex = mi + LOAN_DUE_MONTHS;
  state.loan.overdueCount = (state.loan.overdueCount ?? 0) + 1;
  addReputation(state, LOAN_OVERDUE_REPUTATION);
  pushNotice(state, `삼춘 대출 기한을 넘겼어요 — 평판 ${LOAN_OVERDUE_REPUTATION} (남은 ₩${fmtNum(state.loan.balance)})`);
  return LOAN_OVERDUE_REPUTATION;
}

// ---------- 유지비 ----------

/** 노후 시설인가 (트랙 A: 완공·증축·수리 뒤 24개월) */
export function isAged(state: GameState, obj: PlacedObject): boolean {
  return isWorn(state, obj);
}
/** 오브젝트 하나의 월 유지비 (2.5%/월 · objectStats().upkeep에 Lv·노후 ×1.5 배수 포함) */
export function upkeepOf(state: GameState, obj: PlacedObject): number {
  return Math.round(objectStats(state, obj.id).upkeep * (UPKEEP_RATE / DATA_UPKEEP_RATE));
}

/** 소유 필지에 놓인 오브젝트의 월 유지비 합(× 이벤트 유지비 배수)을 차감한다 (아직 안 산 필지의 돌담 등은 제외). 월말에 closeMonth보다 먼저 호출한다. */
export function upkeep(state: GameState): void {
  let sum = 0;
  for (const obj of Object.values(state.objects)) if (parcelAt(state, obj.x, obj.y)?.owned) sum += upkeepOf(state, obj);
  sum = Math.round(sum * effectMult(state, 'upkeepMult'));
  state.money -= sum;
  state.monthCosts.upkeep += sum;
}

// ---------- 급여 ----------

/** 급여 공식 (§3.6.3). 트랙 D의 staff.ts가 채용·승급 때 이 함수로 salary를 정한다. raisePct = state.salaryRaisePct. */
export function salaryOf(staff: { stats: Stats; level: number; baseSalary?: number }, raisePct = 0): number {
  const base = (staff.baseSalary ?? BASE_SALARY_DEFAULT) * (1 + SALARY_LEVEL_STEP * (staff.level - 1)) * (1 + raisePct / 100);
  const stats = STAT_KEYS.reduce((n, k) => n + staff.stats[k], 0);
  return Math.round(base + stats * SALARY_PER_STAT_POINT);
}

/** 매년 3월 1일(2년차부터): 전 직원 급여 +5% 누적 인상 */
export function annualRaise(state: GameState): void {
  state.salaryRaisePct += ANNUAL_RAISE_PCT;
  for (const st of state.staff) st.salary = Math.round(st.salary * (1 + ANNUAL_RAISE_PCT / 100));
  if (state.staff.length > 0) pushNotice(state, `새해 급여 인상: 전 직원 월급 +${ANNUAL_RAISE_PCT}% (누적 ${state.salaryRaisePct}%)`);
}

// ---------- 세금·고정비 ----------

/** 전년 순이익 기준 소득세 (적자면 0) */
export function incomeTaxOf(lastYearNet: number): number {
  return Math.max(0, Math.round(lastYearNet * TAX_RATE));
}
/** 매년 3월 1일: 소득세를 걷는다 (카드 "세금" 줄) */
export function incomeTax(state: GameState): number {
  const tax = incomeTaxOf(state.lastYearNet);
  if (tax <= 0) return 0;
  state.money -= tax;
  state.monthCosts.tax += tax;
  pushNotice(state, `소득세 ₩${fmtNum(tax)} (전년 순이익의 ${Math.round(TAX_RATE * 100)}%)`);
  return tax;
}
// ---------- 월말 평가 등급 (stakes: 「결과 피드백이 약하다」) ----------

/** 4항목 × 25점 = 0~100. 잘한 달과 못한 달이 한눈에 갈리게. */
export const GRADE_ITEM_MAX = 25;
/** 등급 문턱 */
export const GRADE_S = 85;
export const GRADE_A = 70;
export const GRADE_B = 50;
/** 이만큼 연속 C면 삼춘이 찾아온다 */
export const COACH_BAD_MONTHS = 3;
/** 만점을 주는 순이익률 / 손님 증가율 / 평판 / 불만율 */
export const GRADE_FULL_MARGIN = 0.3;
export const GRADE_FULL_GUEST_GROWTH = 0.2;
export const GRADE_GUEST_FLOOR = -0.1;
export const GRADE_REP_FLOOR = 30;
export const GRADE_REP_FULL = 80;
export const GRADE_FULL_COMPLAINT_RATE = 0.2;

export type GradeItemKey = 'profit' | 'guests' | 'reputation' | 'complaints';
export interface GradeItem { key: GradeItemKey; label: string; score: number }
export interface GradeResult { grade: MonthGrade; score: number; items: GradeItem[]; summary: string }

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
export function gradeOfScore(score: number): MonthGrade {
  return score >= GRADE_S ? 'S' : score >= GRADE_A ? 'A' : score >= GRADE_B ? 'B' : 'C';
}

/** 총평 한 줄 (가장 낮은 항목 기준, 한 줄 ≤ 22자) */
function summaryOf(state: GameState, grade: MonthGrade, worst: GradeItemKey): string {
  if (grade === 'S') return '흠잡을 데 없는 달이에요';
  switch (worst) {
    case 'profit': return '버는 것보다 나간 게 많아요';
    case 'guests': return '손님이 줄고 있어요';
    case 'reputation': return '평판을 먼저 올려야 해요';
    case 'complaints': {
      const top = topComplaints(state, 1)[0];
      if (top?.reason === 'no_seat') return '자리가 모자라 손님을 놓쳤어요';
      if (top?.reason === 'wait_long') return '손님을 너무 기다리게 했어요';
      if (top?.reason === 'expensive') return '값이 비싸다는 말이 많아요';
      if (top?.reason === 'dirty') return '가게가 지저분하대요';
      return '손님 불만을 줄여 보세요';
    }
  }
}

/** 이달 평가: 순이익·손님 증감·평판·불만 4항목. prevGuests가 null(첫 달)이면 손님 항목은 중간 점수. */
export function gradeMonth(state: GameState, net: number, prevGuests: number | null): GradeResult {
  const income = Math.max(1, state.monthIncome);
  const guests = state.monthGuests;
  const margin = net / income;
  const profit = clamp01(margin / GRADE_FULL_MARGIN) * GRADE_ITEM_MAX;
  const growth = prevGuests === null ? null : (guests - prevGuests) / Math.max(1, prevGuests);
  const guestScore = growth === null
    ? GRADE_ITEM_MAX * 0.6
    : clamp01((growth - GRADE_GUEST_FLOOR) / (GRADE_FULL_GUEST_GROWTH - GRADE_GUEST_FLOOR)) * GRADE_ITEM_MAX;
  const rep = clamp01((state.reputation - GRADE_REP_FLOOR) / (GRADE_REP_FULL - GRADE_REP_FLOOR)) * GRADE_ITEM_MAX;
  const complained = Object.values(state.monthComplaints).reduce((a, b) => a + (b ?? 0), 0);
  const complaintRate = complained / Math.max(1, guests);
  const complaints = clamp01(1 - complaintRate / GRADE_FULL_COMPLAINT_RATE) * GRADE_ITEM_MAX;
  const items: GradeItem[] = [
    { key: 'profit', label: '순이익', score: Math.round(profit) },
    { key: 'guests', label: '손님 증감', score: Math.round(guestScore) },
    { key: 'reputation', label: '평판', score: Math.round(rep) },
    { key: 'complaints', label: '불만', score: Math.round(complaints) },
  ];
  const score = items.reduce((a, b) => a + b.score, 0);
  const grade = gradeOfScore(score);
  const worst = items.reduce((a, b) => (b.score < a.score ? b : a));
  return { grade, score, items, summary: summaryOf(state, grade, worst.key) };
}

/** 3달 연속 C — 삼춘이 들고 오는 구체 제안 한 줄 (가장 아픈 곳 하나만). */
export function coachAdvice(state: GameState): string {
  const c = state.lastMonthCard;
  const top = c?.topComplaints[0] ?? topComplaints(state, 1)[0];
  if (top?.reason === 'no_seat') return '자리를 두 개만 더 놓아 보라';
  if (top?.reason === 'wait_long') return '홀 직원을 한 명 더 두라';
  if (top?.reason === 'dirty') return '낡은 시설부터 고치라';
  if (top?.reason === 'expensive') return '값싼 메뉴를 한 칸 올려 보라';
  if (state.reputation < GRADE_REP_FLOOR) return '사과 이벤트로 평판부터 올리라';
  if ((c?.net ?? 0) < 0) return '쉬는 직원 급여부터 줄이라';
  return '홍보를 한 번 해서 손님을 부르라';
}

// ---------- 월말 정산 ----------

/** 월말 정산 카드를 만들고 월 누적치를 리셋한다. 농원 수확·절감(monthHarvest)과 최다 판매 메뉴도 카드로 옮긴다.
 *  연속 적자·연 순이익(세금용)도 여기서 갱신한다. 대출 상환은 failure.ts가 카드를 보고 한다(카드 costs.loanRepay·net을 고친다). */
export function closeMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const costs = { ...state.monthCosts };
  const net = state.monthIncome - totalCosts(costs);
  let topMenu: string | null = null;
  for (const [id, n] of Object.entries(state.monthMenuSold)) if (topMenu === null || n > state.monthMenuSold[topMenu]!) topMenu = id;
  const prevGuests = state.lastMonthCard?.guests ?? null; // stakes: 등급의 「손님 증감」 항목
  const evalResult = gradeMonth(state, net, prevGuests);
  state.deficitMonths = net < 0 ? state.deficitMonths + 1 : 0;
  state.yearNet += net;
  if (prevMonth === 12) { state.lastYearNet = state.yearNet; state.yearNet = 0; }
  state.lastMonthCard = {
    income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear, costs, net,
    harvested: { ...state.monthHarvest.harvested }, ingredientSaved: state.monthHarvest.ingredientSaved, topMenu,
    deficitStreak: state.deficitMonths, loanTaken: state.monthLoan, loanBalance: state.loan.balance,
    guestsLeft: state.monthGuestsLeft,
    reputation: state.reputation, reputationDelta: 0, topComplaints: [],
    greatServes: state.monthGreatServes ?? 0, // staff-luck 서빙 대박 횟수
    // ---- stakes: 월말 평가 등급 ----
    grade: evalResult.grade,
    gradeScore: evalResult.score,
    prevGrade: state.lastGrade ?? null,
    gradeSummary: evalResult.summary,
    guestsDelta: prevGuests === null ? 0 : state.monthGuests - prevGuests,
    trendCategory: state.trend?.category,
  };
  state.lastGrade = evalResult.grade;
  state.badGradeMonths = evalResult.grade === 'C' ? (state.badGradeMonths ?? 0) + 1 : 0;
  if (state.badGradeMonths >= COACH_BAD_MONTHS) {
    state.badGradeMonths = 0;
    state.alerts.push({ type: 'coach' }); // 삼춘이 찾아와 구체 제안 1개
  }
  state.lastMonthIncome = state.monthIncome;
  state.monthIncome = 0;
  state.monthGuests = 0;
  state.monthGuestsLeft = 0;
  state.monthLoan = 0;
  state.monthCosts = emptyMonthCosts();
  state.monthHarvest = { harvested: {}, ingredientSaved: 0 };
  state.monthMenuSold = {};
  state.monthGreatServes = 0;
}

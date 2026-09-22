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
import { parcelAt } from './parcels.ts';
import { objectStats } from './compat.ts';
import { isWorn } from './cleanliness.ts';
import { effectMult } from './effects.ts';
import { pushNotice, STAT_KEYS } from './staff.ts';
import { fmtNum } from './format.ts';
import { rivalGuestLossPct } from './rivals.ts';

/** 유지비: 건설비의 2.5%/월. 데이터(objects/facilities)의 upkeep 값은 1.5% 기준이라 배율로 환산한다. */
export const UPKEEP_RATE = 0.025;
export const DATA_UPKEEP_RATE = 0.015;
/** 급여: 기본급(채용 등급별, 없으면 40만) × Lv 계수 + 스탯 합 × 1,000 */
export const BASE_SALARY_DEFAULT = 400_000;
export const SALARY_LEVEL_STEP = 0.15;
export const SALARY_PER_STAT_POINT = 1000;
/** 매년 3월 1일 급여 인상 % (누적) */
export const ANNUAL_RAISE_PCT = 5;
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
  return { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0, tax: 0, loanRepay: 0, tourBus: 0 };
}
export function totalCosts(c: MonthCosts): number {
  return c.ingredients + c.salary + c.ads + c.upkeep + c.recruit + c.tax + c.loanRepay + c.tourBus;
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
// ---------- 월말 정산 ----------

/** 월말 정산 카드를 만들고 월 누적치를 리셋한다. 농원 수확·절감(monthHarvest)과 최다 판매 메뉴도 카드로 옮긴다.
 *  연속 적자·연 순이익(세금용)도 여기서 갱신한다. 대출 상환은 failure.ts가 카드를 보고 한다(카드 costs.loanRepay·net을 고친다). */
export function closeMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const costs = { ...state.monthCosts };
  const net = state.monthIncome - totalCosts(costs);
  let topMenu: string | null = null;
  for (const [id, n] of Object.entries(state.monthMenuSold)) if (topMenu === null || n > state.monthMenuSold[topMenu]!) topMenu = id;
  state.deficitMonths = net < 0 ? state.deficitMonths + 1 : 0;
  state.yearNet += net;
  if (prevMonth === 12) { state.lastYearNet = state.yearNet; state.yearNet = 0; }
  state.lastMonthCard = {
    income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear, costs, net,
    harvested: { ...state.monthHarvest.harvested }, ingredientSaved: state.monthHarvest.ingredientSaved, topMenu,
    deficitStreak: state.deficitMonths, loanTaken: state.monthLoan, loanBalance: state.loan.balance,
    rivalLossPct: rivalGuestLossPct(state), guestsLeft: state.monthGuestsLeft,
    reputation: state.reputation, reputationDelta: 0, topComplaints: [],
    greatServes: state.monthGreatServes ?? 0, // staff-luck 서빙 대박 횟수
  };
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

import type { GameState } from './types.ts';
import { menuDef, ingredientDef, objectDef } from '../data/index.ts';

/** bought 재료의 원가 합. farm 재료는 0으로 친다 (창고에서 직접 소비).
 *  운반·절약 스킬 할인은 staff.ts 완성 후 적용한다 (Task 3 전까지는 할인 0). */
export function ingredientCost(state: GameState, menuId: string): number {
  const disc = 0;
  let sum = 0;
  for (const [id, n] of Object.entries(menuDef(menuId).ingredients)) {
    const ing = ingredientDef(id);
    if (ing.kind === 'bought') sum += ing.cost * n;
  }
  return Math.round(sum * (1 - disc));
}

/** 놓인 오브젝트의 월 유지비 합을 차감한다. 월말에 closeMonth보다 먼저 호출한다. */
export function upkeep(state: GameState): void {
  let sum = 0;
  for (const obj of Object.values(state.objects)) sum += objectDef(obj.type).upkeep;
  state.money -= sum;
  state.monthCosts.upkeep += sum;
}

/** 월말 정산 카드를 만들고 월 누적치를 리셋한다. */
export function closeMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const costs = { ...state.monthCosts };
  const net = state.monthIncome - costs.ingredients - costs.salary - costs.ads - costs.upkeep;
  state.lastMonthCard = { income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear, costs, net };
  state.monthIncome = 0;
  state.monthGuests = 0;
  state.monthCosts = { ingredients: 0, salary: 0, ads: 0, upkeep: 0 };
}

import type { GameState, MonthCosts } from './types.ts';
import { menuDef, ingredientDef } from '../data/index.ts';
import { ingredientDiscount } from './staff.ts';
import { parcelAt } from './parcels.ts';
import { objectStats } from './compat.ts';
import { effectMult } from './effects.ts';

/** bought 재료의 원가 합. farm 재료는 0으로 친다 (창고에서 직접 소비). 운반·절약 스킬만큼 할인. */
export function ingredientCost(state: GameState, menuId: string): number {
  const disc = ingredientDiscount(state);
  let sum = 0;
  for (const [id, n] of Object.entries(menuDef(menuId).ingredients)) {
    const ing = ingredientDef(id);
    if (ing.kind === 'bought') sum += ing.cost * n;
  }
  return Math.round(sum * (1 - disc));
}

export function emptyMonthCosts(): MonthCosts {
  return { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0 };
}

/** 소유 필지에 놓인 오브젝트의 월 유지비 합(× 이벤트 유지비 배수)을 차감한다 (아직 안 산 필지의 돌담 등은 제외). 월말에 closeMonth보다 먼저 호출한다. */
export function upkeep(state: GameState): void {
  let sum = 0;
  for (const obj of Object.values(state.objects)) if (parcelAt(state, obj.x, obj.y)?.owned) sum += objectStats(state, obj.id).upkeep;
  sum = Math.round(sum * effectMult(state, 'upkeepMult'));
  state.money -= sum;
  state.monthCosts.upkeep += sum;
}

/** 월말 정산 카드를 만들고 월 누적치를 리셋한다. */
export function closeMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const costs = { ...state.monthCosts };
  const net = state.monthIncome - costs.ingredients - costs.salary - costs.ads - costs.upkeep - costs.recruit;
  state.lastMonthCard = { income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear, costs, net };
  state.monthIncome = 0;
  state.monthGuests = 0;
  state.monthCosts = emptyMonthCosts();
}

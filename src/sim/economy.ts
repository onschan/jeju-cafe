import type { GameState, MonthCosts } from './types.ts';
import { ingredientDef } from '../data/index.ts';
import { menuOf, toppingCost, costMult } from './craft.ts';
import { parcelAt } from './parcels.ts';
import { objectStats } from './compat.ts';
import { effectMult } from './effects.ts';

/** 재료 원가 합 + 토핑 원가 (창고 재고는 보지 않는 정가 — UI 표시·개발 비용용). 운반·절약 스킬·콤보·세련미만큼 할인. */
export function ingredientCost(state: GameState, menuId: string): number {
  let sum = toppingCost(state, menuId);
  for (const [id, n] of Object.entries(menuOf(state, menuId).ingredients)) sum += ingredientDef(id).cost * n;
  return Math.round(sum * costMult(state, menuId));
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

/** 월말 정산 카드를 만들고 월 누적치를 리셋한다. 농원 수확·절감(monthHarvest)과 최다 판매 메뉴도 카드로 옮긴다. */
export function closeMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const costs = { ...state.monthCosts };
  const net = state.monthIncome - costs.ingredients - costs.salary - costs.ads - costs.upkeep - costs.recruit;
  let topMenu: string | null = null;
  for (const [id, n] of Object.entries(state.monthMenuSold)) if (topMenu === null || n > state.monthMenuSold[topMenu]!) topMenu = id;
  state.lastMonthCard = {
    income: state.monthIncome, guests: state.monthGuests, month: prevMonth, year: prevYear, costs, net,
    harvested: { ...state.monthHarvest.harvested }, ingredientSaved: state.monthHarvest.ingredientSaved, topMenu,
  };
  state.lastMonthIncome = state.monthIncome;
  state.monthIncome = 0;
  state.monthGuests = 0;
  state.monthCosts = emptyMonthCosts();
  state.monthHarvest = { harvested: {}, ingredientSaved: 0 };
  state.monthMenuSold = {};
}

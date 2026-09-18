import type { GameState } from './types.ts';
import { ingredientDef } from '../data/index.ts';

/** 창고에 있는 재료 개수 */
export function stockOf(state: GameState, id: string): number {
  return state.storage[id] ?? 0;
}

/** 재료 하나를 n개 쓴다: 창고에 있는 만큼은 창고에서(절감액 monthHarvest.ingredientSaved에 기록), 모자란 만큼은 자동 구매. 사야 하는 원가(할인 전)를 돌려준다. */
export function takeIngredient(state: GameState, id: string, n: number, mult = 1): number {
  const stock = stockOf(state, id);
  const fromStock = Math.min(stock, n);
  const cost = ingredientDef(id).cost;
  if (fromStock > 0) {
    state.storage[id] = stock - fromStock;
    if (state.storage[id] === 0) delete state.storage[id];
    state.monthHarvest.ingredientSaved += Math.round(cost * fromStock * mult);
  }
  return cost * (n - fromStock);
}

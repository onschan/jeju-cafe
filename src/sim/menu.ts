import type { GameState, ApplyResult } from './types.ts';
import { menuDef, ingredientDef } from '../data/index.ts';
import { ingredientCost } from './economy.ts';

export function canSetSlot(state: GameState, slot: number, menuId: string | null): ApplyResult {
  if (slot < 0 || slot >= state.menuSlots.length) return { ok: false, reason: '없는 칸' };
  if (menuId !== null && !state.unlocked.menus.includes(menuId)) return { ok: false, reason: '아직 모르는 메뉴' };
  if (menuId !== null && state.menuSlots.some((m, i) => m === menuId && i !== slot)) return { ok: false, reason: '이미 메뉴판에 있어요' };
  return { ok: true };
}

export function setSlot(state: GameState, slot: number, menuId: string | null): void {
  state.menuSlots[slot] = menuId;
}

/** bought 재료는 창고 없이 항상 준비돼 있다(돈으로 즉시 산다). farm 재료만 창고를 확인한다. */
export function isMenuAvailable(state: GameState, menuId: string): boolean {
  const m = menuDef(menuId);
  return Object.entries(m.ingredients).every(([id, n]) => {
    if (ingredientDef(id).kind === 'bought') return true;
    return (state.storage[id] ?? 0) >= n;
  });
}

/** 슬롯에 있고 재료도 있는 메뉴 id 목록 */
export function availableMenus(state: GameState): string[] {
  return state.menuSlots.filter((id): id is string => id !== null && isMenuAvailable(state, id));
}

/** farm 재료는 창고에서 차감하고, bought 재료는 재료비만큼 돈이 나가며 이달 재료비에 더해진다. */
export function consumeIngredients(state: GameState, menuId: string): void {
  for (const [id, n] of Object.entries(menuDef(menuId).ingredients)) {
    if (ingredientDef(id).kind === 'farm') state.storage[id] = (state.storage[id] ?? 0) - n;
  }
  const cost = ingredientCost(state, menuId);
  state.money -= cost;
  state.monthCosts.ingredients += cost;
}

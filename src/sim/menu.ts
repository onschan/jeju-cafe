import type { GameState, ApplyResult } from './types.ts';
import { menuDef } from '../data/index.ts';

export function canSetSlot(state: GameState, slot: number, menuId: string | null): ApplyResult {
  if (slot < 0 || slot >= state.menuSlots.length) return { ok: false, reason: '없는 칸' };
  if (menuId !== null && !state.unlocked.menus.includes(menuId)) return { ok: false, reason: '아직 모르는 메뉴' };
  return { ok: true };
}

export function setSlot(state: GameState, slot: number, menuId: string | null): void {
  state.menuSlots[slot] = menuId;
}

export function isMenuAvailable(state: GameState, menuId: string): boolean {
  const m = menuDef(menuId);
  return Object.entries(m.ingredients).every(([cropId, n]) => (state.storage[cropId] ?? 0) >= n);
}

/** 슬롯에 있고 재료도 있는 메뉴 id 목록 */
export function availableMenus(state: GameState): string[] {
  return state.menuSlots.filter((id): id is string => id !== null && isMenuAvailable(state, id));
}

export function consumeIngredients(state: GameState, menuId: string): void {
  for (const [cropId, n] of Object.entries(menuDef(menuId).ingredients)) {
    state.storage[cropId] = (state.storage[cropId] ?? 0) - n;
  }
}

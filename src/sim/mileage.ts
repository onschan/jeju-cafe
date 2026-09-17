import type { GameState } from './types.ts';
import { pushNotice } from './staff.ts';

/** 도감(상성·세트·히든 레시피·재료 콤보) 10개마다 마일리지 1 */
export const CODEX_PER_MILEAGE = 10;

export function addMileage(state: GameState, n: number, reason?: string): void {
  if (n <= 0) return;
  state.mileage += n;
  if (reason) pushNotice(state, `${reason} — 마일리지 +${n}`);
}

export function codexCount(state: GameState): number {
  const c = state.codex;
  return c.combos.length + c.sets.length + c.recipes.length + c.ingredientCombos.length;
}

/** 도감이 늘어난 뒤 호출: 처음 발견한 상성·세트 1, 10개마다 1 (한 번 준 단계는 다시 안 준다) */
export function checkCodexMileage(state: GameState): void {
  const tier = Math.floor(codexCount(state) / CODEX_PER_MILEAGE);
  if (tier > state.codexMileage) {
    addMileage(state, tier - state.codexMileage, `도감 ${tier * CODEX_PER_MILEAGE}개`);
    state.codexMileage = tier;
  }
}

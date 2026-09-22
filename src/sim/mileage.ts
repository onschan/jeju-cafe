import type { GameState } from './types.ts';
import { pushNotice } from './staff.ts';

/** trim: 마일리지를 없애고 재화를 응모권 하나로 합쳤다 (마일리지 10 = 응모권 1 환산). */
/** 도감(코너·세트·히든 레시피·재료 콤보) 10개마다 응모권 1 */
export const CODEX_PER_TICKET = 10;
/** 월 결산 손님 600명마다 응모권 1 */
export const GUESTS_PER_TICKET = 600;

/** 월말(closeMonth 전): 이달 손님 수로 응모권. 준 개수를 돌려준다. */
export function monthlyTickets(state: GameState): number {
  const n = Math.floor(state.monthGuests / GUESTS_PER_TICKET);
  if (n > 0) addTickets(state, n, `이달 손님 ${state.monthGuests}명`);
  return n;
}

export function addTickets(state: GameState, n: number, reason?: string): void {
  if (n <= 0) return;
  state.tickets += n;
  if (reason) pushNotice(state, `${reason} — 응모권 +${n}`);
}

export function codexCount(state: GameState): number {
  const c = state.codex;
  return (c.corners?.length ?? 0) + c.sets.length + c.recipes.length + c.ingredientCombos.length;
}

/** 도감이 늘어난 뒤 호출: 10개마다 응모권 1 (한 번 준 단계는 다시 안 준다) */
export function checkCodexTickets(state: GameState): void {
  const tier = Math.floor(codexCount(state) / CODEX_PER_TICKET);
  if (tier > state.codexTickets) {
    addTickets(state, tier - state.codexTickets, `도감 ${tier * CODEX_PER_TICKET}개`);
    state.codexTickets = tier;
  }
}

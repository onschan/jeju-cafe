import type { GameState, FxEvent } from './types.ts';

/** 연출 큐 상한 */
export const FX_CAP = 50;

export function pushFx(state: GameState, e: FxEvent): void {
  state.fx.push(e);
  if (state.fx.length > FX_CAP) state.fx.splice(0, state.fx.length - FX_CAP);
}

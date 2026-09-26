import type { GameState } from './types.ts';
import { SAVE_VERSION } from './state.ts';
export function serialize(s: GameState): string { return JSON.stringify(s); }
export function deserialize(json: string): GameState {
  const o = JSON.parse(json) as GameState;
  if (!o || typeof o !== 'object' || o.version !== SAVE_VERSION) throw new Error(`save version mismatch: ${o?.version} (expected ${SAVE_VERSION})`);
  return o;
}

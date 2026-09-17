import type { GameState, ApplyResult, UnlockDef } from './types.ts';
import { UNLOCKS } from '../data/index.ts';

export function nextUnlock(state: GameState): UnlockDef | null {
  return UNLOCKS[state.unlockedIndex] ?? null;
}

export function canUnlock(state: GameState): ApplyResult {
  const u = nextUnlock(state);
  if (!u) return { ok: false, reason: '다 열었어요' };
  if (state.research < u.cost) return { ok: false, reason: '연구 포인트가 모자라요' };
  return { ok: true };
}

export function unlock(state: GameState): UnlockDef | null {
  if (!canUnlock(state).ok) return null;
  const u = nextUnlock(state)!;
  state.research -= u.cost;
  state.unlockedIndex++;
  const bucket = u.kind === 'object' ? state.unlocked.objects : u.kind === 'menu' ? state.unlocked.menus : state.unlocked.crops;
  if (!bucket.includes(u.ref)) bucket.push(u.ref);
  return u;
}

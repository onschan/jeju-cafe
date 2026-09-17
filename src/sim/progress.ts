import type { GameState, ApplyResult, UnlockDef, RoleId } from './types.ts';
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
  switch (u.kind) {
    case 'object':
      if (!state.unlocked.objects.includes(u.ref)) state.unlocked.objects.push(u.ref);
      break;
    case 'menu':
      if (!state.unlocked.menus.includes(u.ref)) state.unlocked.menus.push(u.ref);
      break;
    case 'crop':
      if (!state.unlocked.crops.includes(u.ref)) state.unlocked.crops.push(u.ref);
      break;
    case 'slot':
      state.slots[u.ref as RoleId]++;
      break;
    case 'role':
      if (!state.unlocked.roles.includes(u.ref as RoleId)) state.unlocked.roles.push(u.ref as RoleId);
      break;
  }
  return u;
}

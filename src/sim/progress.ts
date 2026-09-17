import type { GameState, ApplyResult, UnlockDef, RoleId } from './types.ts';
import { UNLOCKS } from '../data/index.ts';
import { skillTotal } from './staff.ts';

/** 만족 손님 5명 = 연구 1 (QA 1차 #10: 손님 1명당 +1은 6개월에 1,145로 해금 트리(총 140)가 무의미했다) */
export const HAPPY_PER_RESEARCH = 5;
/** 취향(스탯)이 맞은 만족 손님은 2명 몫 */
export const TASTE_MATCH_WEIGHT = 2;

/** 연구 진행을 n(만족 손님 몫)만큼 쌓고 5마다 연구 +1. 연구원 스킬(researchBonus)만큼 더 쌓인다. 소수 누적은 결정적(IEEE). */
export function addResearchProgress(state: GameState, n: number): number {
  state.researchAcc += n * (1 + skillTotal(state, 'researchBonus'));
  const gained = Math.floor(state.researchAcc / HAPPY_PER_RESEARCH + 1e-9);
  if (gained > 0) {
    state.researchAcc -= gained * HAPPY_PER_RESEARCH;
    state.research += gained;
  }
  return gained;
}

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

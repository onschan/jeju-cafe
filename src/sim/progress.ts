/** 연구 포인트 (v3: 해금 트리는 목표 체인으로 흡수됐고, 연구는 레시피 개발·메뉴 레벨업 전용) */
import type { GameState } from './types.ts';
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

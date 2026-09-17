/**
 * 카페 랭크 (2B-2 Task 7): 랭크 점수 = 누적 손님/50 + 시설 수×2 + 해금 손님층×5. 문턱표를 넘으면 랭크 업 (내려가지 않는다).
 * segments.evaluateUnlocks가 부르므로 여기서는 segments를 import하지 않는다.
 */
import type { GameState } from './types.ts';
import { objectDef } from '../data/index.ts';
import { parcelAt } from './parcels.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './farm.ts';

export const GUESTS_PER_POINT = 50;
export const POINTS_PER_FACILITY = 2;
export const POINTS_PER_GUEST_TYPE = 5;
/** 랭크 r이 되려면 점수 ≥ RANK_THRESHOLDS[r−1] */
export const RANK_THRESHOLDS = [0, 50, 120, 220, 360, 550, 800, 1100, 1500, 2000];
export const MAX_RANK = RANK_THRESHOLDS.length;
/** 점수에 세는 시설: 길·돌담·정류장·정낭·본관·처음부터 있던 것은 제외 */
const NOT_FACILITY = new Set(['path', 'stonewall', 'busstop', 'gate', 'warehouse', 'bush_wild', 'spring']);

export function facilityCount(state: GameState): number {
  let n = 0;
  for (const o of Object.values(state.objects)) {
    if (NOT_FACILITY.has(o.type) || objectDef(o.type).kind === 'path' || objectDef(o.type).kind === 'wall') continue;
    if (parcelAt(state, o.x, o.y)?.owned) n++;
  }
  return n;
}

export function unlockedGuestTypeCount(state: GameState): number {
  return Object.values(state.guestTypes).filter((t) => t.unlocked).length;
}

export function rankScore(state: GameState): number {
  return Math.floor(state.totalGuests / GUESTS_PER_POINT) + facilityCount(state) * POINTS_PER_FACILITY + unlockedGuestTypeCount(state) * POINTS_PER_GUEST_TYPE;
}

export function rankForScore(score: number): number {
  let r = 1;
  for (let i = 1; i < RANK_THRESHOLDS.length; i++) if (score >= RANK_THRESHOLDS[i]!) r = i + 1;
  return r;
}

/** 다음 랭크 문턱 (최고면 null) */
export function nextRankThreshold(state: GameState): number | null {
  return state.rank >= MAX_RANK ? null : RANK_THRESHOLDS[state.rank]!;
}

/** 점수로 랭크를 올린다 (내려가지 않는다). 올랐으면 true. */
export function updateRank(state: GameState): boolean {
  const r = Math.max(state.rank, rankForScore(rankScore(state)));
  if (r === state.rank) return false;
  state.rank = r;
  pushNotice(state, `카페 랭크 ${r}!`);
  pushFx(state, { kind: 'scene', title: '랭크 업', text: `카페 랭크 ${r}! 더 많은 손님과 시설이 열려요`, tick: state.tick });
  return true;
}

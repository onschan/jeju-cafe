/**
 * 카페 랭크 (2B-2 Task 7): 랭크 점수 = 누적 손님/50 + 시설 수×2 + 해금 손님층×5. 문턱표를 넘으면 랭크 업 (내려가지 않는다).
 * segments.evaluateUnlocks가 부르므로 여기서는 segments를 import하지 않는다.
 */
import type { GameState, GoalReward } from './types.ts';
import { objectDef } from '../data/index.ts';
import { parcelAt } from './parcels.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { applyRewards } from './goals.ts';
import { checkGrade } from './grade.ts'; // fun-rank: 카페 등급 판정 훅 (evaluateUnlocks가 매일 부른다)

export const GUESTS_PER_POINT = 50;
export const POINTS_PER_FACILITY = 2;
export const POINTS_PER_GUEST_TYPE = 2; // game-feel P1: 손님층 해금이 3배로 늘어(3년 17 → 50종+) 5점이면 3년 안에 랭크 10이 찬다 → 2점
/** 랭크 r이 되려면 점수 ≥ RANK_THRESHOLDS[r−1] */
export const RANK_THRESHOLDS = [0, 50, 120, 220, 360, 550, 800, 1100, 1500, 2000];
export const MAX_RANK = RANK_THRESHOLDS.length;
/** 점수에 세는 시설: 길·돌담·정류장·정낭·본관·처음부터 있던 것은 제외 */
const NOT_FACILITY = new Set(['path', 'stonewall', 'busstop', 'gate', 'warehouse', 'spring']);

export function facilityCount(state: GameState, builtOnly = false): number {
  let n = 0;
  for (const o of Object.values(state.objects)) {
    if (builtOnly && o.build) continue; // 목표·과제 보상은 완공 기준 (알려진 정도는 그대로 공사 중도 센다)
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

/** 랭크 업 보상: 응모권 2장(랭크 5부터 3장) — 장면 창 뒤에 보상 상자 */
export const RANK_UP_TICKETS_HIGH_FROM = 5;
export function rankUpRewards(rank: number): GoalReward[] {
  return [{ type: 'tickets', n: rank >= RANK_UP_TICKETS_HIGH_FROM ? 3 : 2 }];
}

/** 점수로 랭크를 올린다 (내려가지 않는다). 올랐으면 true. */
export function updateRank(state: GameState): boolean {
  checkGrade(state); // fun-rank: 등급(누적 손님·명당·평판·★)은 랭크와 같은 주기로 본다
  const r = Math.max(state.rank, rankForScore(rankScore(state)));
  if (r === state.rank) return false;
  state.rank = r;
  // 용어 정리: 랭크(1~10) 숫자는 플레이어에게 안 보인다 — 진척 지표는 등급과 ★ 둘뿐. 알림은 「무엇이 열렸는지」로 말한다.
  pushNotice(state, '새 시설이 열렸어요');
  pushFx(state, { kind: 'scene', title: '새 시설이 열렸다', text: '카페가 알려졌어요. 새 손님과 시설이 열려요', tick: state.tick });
  applyRewards(state, rankUpRewards(r), { source: 'rank', refId: `rank${r}`, title: '새로 열린 것' });
  return true;
}

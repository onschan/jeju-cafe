import type { GameState, ApplyResult, RivalDef, RivalState, RivalSize, ChallengeResult, MenuStats, MenuStatKey } from './types.ts';
import { RIVALS, rivalDef, namedGuestDef, MENU_STAT_KEYS } from '../data/index.ts';
import { nextRandom, pickWeighted } from './rng.ts';
import { monthIndex } from './clock.ts';
import { pushNotice } from './staff.ts';
import { menuOf, menuStatsOf } from './craft.ts';
import { addMileage } from './mileage.ts';
import { regularIds, namedGuestState } from './popup.ts';
import { josa } from './josa.ts';

/**
 * 라이벌 카페 (스펙 §15.3, 계획 2B-4 Task 3)
 * - 3년차부터 매월 10%로 하나 생긴다(동시 최대 2). 매월 단골★ 1명을 빼앗고 우리 메뉴 양·보기를 5%씩 누적으로 깎는다(합 −50% 상한, craft.rivalStatPenaltyPct).
 * - 카페 대결: 메뉴 하나로 심사(라이벌 가중치 × 메뉴 스탯 + 운 0~4) vs 라이벌 점수(규모 × 년차). 이기면 철수·마일리지 2·단골 회수, 지면 인기 −5. 라이벌당 한 달 한 번.
 * - 대형은 매월 15% 자체 파산. 12개월 뒤 자진 철수. 철수하면 빼앗긴 단골은 돌아온다.
 */
export const RIVAL_START_YEAR = 3;
export const RIVAL_MONTHLY_CHANCE = 0.1;
export const RIVAL_MAX = 2;
export const RIVAL_LEAVE_MONTHS = 12;
export const CHALLENGE_WIN_MILEAGE = 2;
export const CHALLENGE_LOSE_POPULARITY = 5;
export const JUDGE_LUCK = 4;
export const SIZE_POWER: Record<RivalSize, number> = { small: 6, medium: 8, large: 10 };
export const POWER_PER_YEAR = 0.1;

export function rivalState(state: GameState, id: string): RivalState | undefined {
  return state.rivals.find((r) => r.id === id);
}
export function rivalMonths(state: GameState, r: RivalState): number {
  return monthIndex(state.clock) - r.openedMonthIndex;
}
/** 라이벌 점수 = 규모(소 6·중 8·대 10) × (1 + (년차 − 1) × 0.1) */
export function rivalPower(def: RivalDef, year: number): number {
  return Math.round(SIZE_POWER[def.size] * (1 + (year - 1) * POWER_PER_YEAR) * 10) / 10;
}
/** 심사 항목별 점수 = 가중치 × 메뉴 스탯 (운 제외) */
export function judgeBreakdown(def: RivalDef, stats: MenuStats): { breakdown: Partial<MenuStats>; total: number } {
  const breakdown: Partial<MenuStats> = {};
  let total = 0;
  for (const k of MENU_STAT_KEYS as MenuStatKey[]) {
    const w = def.judge[k];
    if (!w) continue;
    const v = Math.round(w * stats[k] * 10) / 10;
    breakdown[k] = v;
    total += v;
  }
  return { breakdown, total: Math.round(total * 10) / 10 };
}
/** UI용: 운을 빼고 본 승산 (0~1). 운이 0~4 균등이라 부족분이 4 이상이면 0. */
export function challengeOdds(state: GameState, rivalStateId: string, menuId: string): number {
  const r = rivalState(state, rivalStateId);
  if (!r) return 0;
  const def = rivalDef(r.rivalId);
  const need = rivalPower(def, state.clock.year) - judgeBreakdown(def, menuStatsOf(state, menuId)).total;
  return Math.max(0, Math.min(1, 1 - need / JUDGE_LUCK));
}

function spawnRival(state: GameState, rivalId: string): RivalState {
  const def = rivalDef(rivalId);
  const r: RivalState = { id: `r${state.nextId++}`, rivalId, openedMonthIndex: monthIndex(state.clock), penaltyPct: 0, stolen: [], lastChallengeMonth: -1 };
  state.rivals.push(r);
  pushNotice(state, `근처에 라이벌 카페가 생겼어요: ${def.name} — “${def.line}”`);
  return r;
}

/** 철수: 목록에서 빼고 빼앗긴 단골★을 돌려준다 */
export function rivalLeave(state: GameState, r: RivalState, reason: string): void {
  state.rivals = state.rivals.filter((x) => x.id !== r.id);
  for (const id of r.stolen) namedGuestState(state, id).regular = true;
  const back = r.stolen.length > 0 ? ` (단골 ${r.stolen.length}명이 돌아왔어요)` : '';
  pushNotice(state, `${rivalDef(r.rivalId).name}${josa(reason, '이/가')}${back}`);
}

/** 매월: 라이벌마다 12개월 철수 → 대형 파산 → 단골 뺏기·스탯 페널티. 그 뒤 3년차부터 10%로 새 라이벌(동시 최대 2). */
export function monthlyRivals(state: GameState): void {
  for (const r of [...state.rivals]) {
    const def = rivalDef(r.rivalId);
    if (rivalMonths(state, r) >= RIVAL_LEAVE_MONTHS) { rivalLeave(state, r, '자진 철수했어요'); continue; }
    if (def.bankruptMonthly > 0 && nextRandom(state) * 100 < def.bankruptMonthly) { rivalLeave(state, r, '유지비를 못 버티고 파산했어요'); continue; }
    for (let i = 0; i < def.stealPerMonth; i++) {
      const pick = pickWeighted(state, regularIds(state), () => 1);
      if (!pick) break;
      namedGuestState(state, pick).regular = false;
      r.stolen.push(pick);
      pushNotice(state, `${josa(namedGuestDef(pick).name, '을/를')} ${def.name}에 빼앗겼어요`);
    }
    r.penaltyPct += def.statPenalty;
  }
  if (state.clock.year >= RIVAL_START_YEAR && state.rivals.length < RIVAL_MAX && nextRandom(state) < RIVAL_MONTHLY_CHANCE) {
    const def = pickWeighted(state, RIVALS, () => 1);
    if (def) spawnRival(state, def.id);
  }
}

export function canChallenge(state: GameState, rivalStateId: string, menuId: string): ApplyResult {
  const r = rivalState(state, rivalStateId);
  if (!r) return { ok: false, reason: '없는 라이벌이에요' };
  if (!state.unlocked.menus.includes(menuId) && !state.customMenus.some((m) => m.id === menuId)) return { ok: false, reason: '모르는 메뉴예요' };
  if (r.lastChallengeMonth === monthIndex(state.clock)) return { ok: false, reason: '이달엔 이미 대결했어요' };
  return { ok: true };
}

/** 카페 대결. 호출 전 canChallenge. 결과는 state.lastChallenge에도 남는다. */
export function challenge(state: GameState, rivalStateId: string, menuId: string): ChallengeResult {
  const r = rivalState(state, rivalStateId)!;
  const def = rivalDef(r.rivalId);
  r.lastChallengeMonth = monthIndex(state.clock);
  const { breakdown, total } = judgeBreakdown(def, menuStatsOf(state, menuId));
  const luck = Math.round(nextRandom(state) * JUDGE_LUCK * 10) / 10;
  const score = Math.round((total + luck) * 10) / 10;
  const power = rivalPower(def, state.clock.year);
  const win = score > power;
  const result: ChallengeResult = { rivalStateId, rivalId: r.rivalId, menuId, menuName: menuOf(state, menuId).name, breakdown, score, luck, power, win };
  if (win) {
    addMileage(state, CHALLENGE_WIN_MILEAGE, `${def.name}과의 대결 승리`);
    rivalLeave(state, r, '대결에 져서 철수했어요');
  } else {
    state.popularity = Math.max(-100, Math.min(100, state.popularity - CHALLENGE_LOSE_POPULARITY));
    pushNotice(state, `${def.name}과의 대결에서 졌어요 — 인기 −${CHALLENGE_LOSE_POPULARITY}`);
  }
  state.lastChallenge = result;
  return result;
}

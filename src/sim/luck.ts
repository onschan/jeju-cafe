/** 작업 확률 결과 — 대박 / 중박 / 쪽박 (staff-luck).
 *  직원에게 뭘 시키면 그냥 되는 게 아니라 작업별 기본 확률표(OUTCOME_TABLE)에 직원 스탯·특기(행운아)·칭호·기력·청결·평판 수정치를 더해 굴린다.
 *  대박 = 기본 효과 ×2 + 보너스(응모권·평판 +3…) / 중박 = 기본 / 쪽박 = 효과 0~절반 + 페널티(평판 −2·기력 −20…). 실패에도 경험치 +1.
 *  확률은 시키기 전에 outcomeChances로 미리 볼 수 있다("성공 68% · 대박 12%"). 결정적 — 보조 스트림(rng.ts sideRandom)을 써서 주 rng 순서를 바꾸지 않는다(봇 KPI 밴드·리플레이 안정). */
import type { GameState, Staff, StatKey, Outcome, LuckTask, OutcomeResult } from './types.ts';
import { sideRandom } from './rng.ts';
import { skillDef } from '../data/index.ts';
import { staffTitleEffect, isWorking } from './titles.ts';
import { dayIndex } from './effects.ts';

export interface Chances { great: number; success: number; fail: number }
/** 작업별 기본 확률 (%) */
export const OUTCOME_TABLE: Record<LuckTask, Chances> = {
  promo: { great: 15, success: 65, fail: 20 },
  develop: { great: 10, success: 60, fail: 30 },
  training: { great: 20, success: 70, fail: 10 },
  tour: { great: 15, success: 65, fail: 20 },
  challenge: { great: 10, success: 60, fail: 30 }, // 이기고 지는 건 스탯 비교가 정하고, 대박이면 운 최대·쪽박이면 운 0
  gift: { great: 15, success: 70, fail: 15 },
  serve: { great: 5, success: 91, fail: 4 },       // 손님 주문마다 작은 판정: 대박 = 팁, 쪽박 = 불친절 불만 (봇 3년 밴드 ×1.0 근처가 되게 낮춰 둔 값)
};
export const TASK_NAME: Record<LuckTask, string> = { promo: '홍보', develop: '레시피 개발', training: '연수', tour: '투어 개최', challenge: '카페 대결', gift: '선물', serve: '서빙' };
/** 작업마다 보는 직원 스탯 */
export const TASK_STAT: Record<LuckTask, StatKey> = { promo: 'smile', develop: 'skill', training: 'stamina', tour: 'smile', challenge: 'skill', gift: 'smile', serve: 'smile' };
export const OUTCOME_NAME: Record<Outcome, string> = { great: '대박', success: '성공', fail: '쪽박' };

/** 수정치 (확률 0~1 단위) */
export const STAT_GREAT_PER_100 = 0.10;   // 관련 스탯 100마다 대박 +10%p
export const STAT_FAIL_PER_100 = 0.10;    // 관련 스탯 100마다 쪽박 −10%p
export const LOW_ENERGY_FAIL = 0.15;      // 기력 30 미만이면 쪽박 +15%p
export const LOW_ENERGY = 30;
export const LUCK_SKILL_GREAT = 0.25;     // 행운아(luck 0.2) → 대박 +5%p
export const REPUTATION_FAIL = 0.05;      // 평판 100이면 쪽박 −5%p, 0이면 +5%p (50이 중립)
export const DIRTY_FAIL = 0.05;           // 청결 50 미만이면 쪽박 +5%p
export const CLEAN_LOW = 50;
export const GREAT_MIN = 0.01;
export const GREAT_MAX = 0.6;
export const SUCCESS_MIN = 0.05;
/** 결과별 효과 배수 (기본 효과에 곱한다) */
export const OUTCOME_MULT: Record<Outcome, number> = { great: 2, success: 1, fail: 0.5 };
export const GREAT_REPUTATION = 3;
export const FAIL_REPUTATION = 2;
export const FAIL_ENERGY = 20;
export const GREAT_TICKETS = 1;
export const FAIL_EXP = 1;

export interface LuckMods { base?: Chances; great?: number; fail?: number }

/** 행운아 특기 값 합 (그 직원 것만) */
export function luckSkill(staff: Staff | null | undefined): number {
  if (!staff) return 0;
  let v = 0;
  for (const id of [staff.skill, ...(staff.extraSkills ?? [])]) { try { const e = skillDef(id).effect; if (e.type === 'luck') v += e.value; } catch { /* noop */ } }
  return v;
}

/** 시키기 전에 보는 확률 (0~1, 합 1). staff가 없으면 기본표에 카페 상태만 반영. */
export function outcomeChances(state: GameState, task: LuckTask, staff?: Staff | null, mods: LuckMods = {}): Chances {
  const base = mods.base ?? OUTCOME_TABLE[task];
  let great = base.great / 100 + (mods.great ?? 0);
  let fail = base.fail / 100 + (mods.fail ?? 0);
  if (staff) {
    const s = staff.stats[TASK_STAT[task]] / 100;
    great += s * STAT_GREAT_PER_100;
    fail -= s * STAT_FAIL_PER_100;
    great += staffTitleEffect(staff, 'great') + luckSkill(staff) * LUCK_SKILL_GREAT;
    fail *= 1 - Math.min(1, staffTitleEffect(staff, 'safe'));
    if (staff.energy < LOW_ENERGY) fail += task === 'serve' ? LOW_ENERGY_FAIL / 2 : LOW_ENERGY_FAIL; // 서빙은 주문마다 굴려서 절반만
  }
  fail -= ((state.reputation - 50) / 50) * REPUTATION_FAIL;
  if (state.clean.value < CLEAN_LOW) fail += DIRTY_FAIL;
  great = Math.max(GREAT_MIN, Math.min(GREAT_MAX, great));
  fail = Math.max(0, Math.min(1 - great - SUCCESS_MIN, fail));
  const success = Math.max(SUCCESS_MIN, 1 - great - fail);
  return { great: round3(great), success: round3(success), fail: round3(fail) };
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 굴린다. 결정적 — 보조 스트림 sideRandom (opts.r을 주면 그 난수로: 레시피 개발처럼 원래 주 스트림을 쓰던 곳). */
export function rollOutcome(state: GameState, opts: { task: LuckTask; staff?: Staff | null; mods?: LuckMods; r?: number }): Outcome {
  const c = outcomeChances(state, opts.task, opts.staff, opts.mods);
  const r = opts.r ?? sideRandom(state);
  if (r < c.great) return 'great';
  if (r < c.great + c.success) return 'success';
  return 'fail';
}

/** 그 작업을 맡기면 대박 확률이 가장 높은 일하는 직원 (없으면 null) */
export function bestStaffFor(state: GameState, task: LuckTask, pool = state.staff.filter((st) => isWorking(state, st))): Staff | null {
  let best: Staff | null = null;
  let bestV = -1;
  for (const st of pool) {
    const c = outcomeChances(state, task, st);
    const v = c.great * 2 + c.success; // 기대값 (대박 ×2·성공 ×1·쪽박 0)
    if (v > bestV) { bestV = v; best = st; }
  }
  return best;
}

/** "성공 68% · 대박 12%" */
export function chanceText(c: Chances): string {
  return `성공 ${Math.round(c.success * 100)}% · 대박 ${Math.round(c.great * 100)}%`;
}

/** 결과를 남긴다 (UI 룰렛 팝업). 실패면 직원 경험치 +1 — 완전 헛수고는 아니다. */
export function recordOutcome(state: GameState, r: Omit<OutcomeResult, 'day'>): OutcomeResult {
  const res: OutcomeResult = { ...r, day: dayIndex(state.clock) };
  state.lastOutcome = res;
  if (r.outcome === 'fail' && r.staffId) { const st = state.staff.find((s) => s.id === r.staffId); if (st) st.exp += FAIL_EXP; }
  return res;
}

/**
 * 도전 과제 2슬롯 + 월간 과제 (§7.3). 결정적 (state.rng·state.clock만).
 * - 목록: offeredChallenges(state) = 풀 40 중 수락 가능한 것 6개 (아직 안 한 것·잠기지 않은 것·requires ≤ goals.index). 달마다 순서가 돈다.
 * - 수락: acceptChallenge → active[{ id, startDay, endDay, base, progress }] (최대 2). delta 조건은 수락 시점 값(base)과의 차로 판정.
 * - 판정: checkChallenges(state) — 달성이면 applyRewards(보상 상자) + done, 기한이 지나면 실패(페널티 없음, tier ≥ 4는 90일 잠김).
 * - 월간 과제: 매월 1일 자동 1개 (monthIndex가 바뀌면 만든다). 난이도 자동 (지난달 손님 ×1.3 등). 보상은 응모권·마일리지.
 */
import type { GameState, ChallengeDef, GoalCondition, GoalReward, MonthlyState, ApplyResult } from './types.ts';
import { CHALLENGES, challengeDef } from '../data/index.ts';
import { dayIndex } from './effects.ts';
import { monthIndex, DAYS_PER_MONTH } from './clock.ts';
import { conditionProgress, applyRewards, type Progress } from './goals.ts';
import { pushNotice } from './staff.ts';

export const CHALLENGE_SLOTS = 2;
export const CHALLENGE_OFFERS = 6;
/** 실패하면 잠기는 tier 하한과 잠금 기간 (3개월) */
export const CHALLENGE_LOCK_TIER = 4;
export const CHALLENGE_LOCK_DAYS = DAYS_PER_MONTH * 3;
/** 도전 과제가 열리는 메인 목표 순번 (튜토리얼 8단계에서 첫 수락을 하므로 처음부터 열려 있다) */
export const CHALLENGE_MIN_GOAL_INDEX = 0;

export function initChallenges(): GameState['challenges'] {
  return { active: [], done: [], failed: [] };
}

export function isChallengeLocked(state: GameState, id: string): boolean {
  const today = dayIndex(state.clock);
  return state.challenges.failed.some((f) => f.id === id && f.until > today);
}
export function challengeLockDaysLeft(state: GameState, id: string): number {
  const today = dayIndex(state.clock);
  return Math.max(0, ...state.challenges.failed.filter((f) => f.id === id).map((f) => f.until - today));
}

/** 수락할 수 있는 후보 (6개). 달마다 시작 위치가 돌아 같은 것만 보이지 않는다. */
export function offeredChallenges(state: GameState): ChallengeDef[] {
  const pool = CHALLENGES.filter((c) =>
    !state.challenges.done.includes(c.id)
    && !state.challenges.active.some((a) => a.id === c.id)
    && !isChallengeLocked(state, c.id)
    && (c.requires ?? 0) <= state.goals.index);
  if (pool.length <= CHALLENGE_OFFERS) return pool;
  const start = monthIndex(state.clock) % pool.length;
  const out: ChallengeDef[] = [];
  for (let i = 0; i < CHALLENGE_OFFERS; i++) out.push(pool[(start + i) % pool.length]!);
  return out.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}

export function canAcceptChallenge(state: GameState, id: string): ApplyResult {
  if (state.goals.index < CHALLENGE_MIN_GOAL_INDEX) return { ok: false, reason: '도전 과제는 아직 잠겨 있어요' };
  const def = CHALLENGES.find((c) => c.id === id);
  if (!def) return { ok: false, reason: '없는 도전 과제예요' };
  if (state.challenges.active.length >= CHALLENGE_SLOTS) return { ok: false, reason: `도전은 ${CHALLENGE_SLOTS}개까지만 동시에 할 수 있어요` };
  if (state.challenges.active.some((a) => a.id === id)) return { ok: false, reason: '이미 하고 있는 도전이에요' };
  if (state.challenges.done.includes(id)) return { ok: false, reason: '이미 이룬 도전이에요' };
  if (isChallengeLocked(state, id)) return { ok: false, reason: `실패한 도전이라 ${challengeLockDaysLeft(state, id)}일 뒤에 다시 고를 수 있어요` };
  if ((def.requires ?? 0) > state.goals.index) return { ok: false, reason: '아직 고를 수 없는 도전이에요' };
  return { ok: true };
}

/** 조건의 현재 값 (delta면 base 기준) */
function baseOf(state: GameState, c: GoalCondition, delta: boolean | undefined): number {
  return delta ? conditionProgress(state, c).cur : 0;
}

export function acceptChallenge(state: GameState, id: string): void {
  const def = challengeDef(id);
  const today = dayIndex(state.clock);
  state.challenges.active.push({ id, startDay: today, endDay: today + def.days, base: baseOf(state, def.condition, def.delta), progress: 0 });
  pushNotice(state, `도전 수락: ${def.title} (${def.days}일 안에)`);
}

/** 진행 중인 도전의 진행도 */
export function challengeProgress(state: GameState, id: string): Progress {
  const a = state.challenges.active.find((x) => x.id === id);
  const def = challengeDef(id);
  const p = conditionProgress(state, def.condition);
  const cur = a ? Math.max(0, p.cur - a.base) : p.cur;
  return { cur: Math.min(p.max, cur), max: p.max };
}
export function challengeDaysLeft(state: GameState, id: string): number {
  const a = state.challenges.active.find((x) => x.id === id);
  return a ? Math.max(0, a.endDay - dayIndex(state.clock)) : 0;
}

/** 달성·실패 판정. 달성한 id 목록. */
export function checkChallenges(state: GameState): string[] {
  const done: string[] = [];
  const today = dayIndex(state.clock);
  for (const a of [...state.challenges.active]) {
    const def = challengeDef(a.id);
    const p = challengeProgress(state, a.id);
    a.progress = p.cur;
    if (p.cur >= p.max) {
      state.challenges.active = state.challenges.active.filter((x) => x !== a);
      state.challenges.done.push(a.id);
      applyRewards(state, def.reward, { source: 'challenge', refId: a.id, title: def.title, line: `도전 「${def.title}」 성공! 골라서 받은 만큼 값지다.`, speaker: 'samchun' });
      pushNotice(state, `도전 성공: ${def.title}`);
      done.push(a.id);
    } else if (today >= a.endDay) {
      state.challenges.active = state.challenges.active.filter((x) => x !== a);
      if (def.tier >= CHALLENGE_LOCK_TIER) state.challenges.failed.push({ id: a.id, until: today + CHALLENGE_LOCK_DAYS });
      state.alerts.push({ type: 'challengeFailed', id: a.id });
      pushNotice(state, `도전 실패: ${def.title} — 기한이 지났어요`);
    }
  }
  checkMonthly(state);
  return done;
}

// ---------- 월간 과제 ----------

type MonthlyKind = 'guests' | 'sales' | 'satisfied' | 'seats';
const MONTHLY_KINDS: MonthlyKind[] = ['guests', 'sales', 'satisfied', 'seats'];

/** 이달 과제를 만든다 (결정적: monthIndex로 종류를 고른다). 난이도 = 현재 수치 기준 자동. */
export function makeMonthly(state: GameState): MonthlyState {
  const mi = monthIndex(state.clock);
  const kind = MONTHLY_KINDS[mi % MONTHLY_KINDS.length]!;
  const lastGuests = Math.max(30, state.lastMonthCard?.guests ?? state.monthGuests);
  const lastIncome = Math.max(500_000, state.lastMonthIncome);
  let condition: GoalCondition; let title: string; let base = 0; let reward: GoalReward[];
  switch (kind) {
    case 'guests': {
      const n = Math.ceil(lastGuests * 1.3 / 10) * 10;
      condition = { type: 'monthGuests', n }; title = `이달 손님 ${n}명`; reward = [{ type: 'tickets', n: 2 }, { type: 'mileage', n: 10 }];
      break;
    }
    case 'sales': {
      const n = Math.ceil(lastIncome * 1.2 / 100_000) * 100_000;
      condition = { type: 'monthSales', n }; title = `이달 매출 ₩${(n / 10_000).toLocaleString('en-US')}만`; reward = [{ type: 'tickets', n: 3 }];
      break;
    }
    case 'satisfied': {
      const n = Math.max(10, Math.ceil(lastGuests * 0.8 / 10) * 10);
      condition = { type: 'satisfied', n }; base = state.stats.satisfiedTotal; title = `만족 손님 ${n}명 더`; reward = [{ type: 'mileage', n: 20 }];
      break;
    }
    case 'seats': {
      const cur = conditionProgress(state, { type: 'seats', n: 1 }).cur;
      const n = cur + 2;
      condition = { type: 'seats', n }; title = `좌석 시설 ${n}개`; reward = [{ type: 'tickets', n: 2 }];
      break;
    }
  }
  return { id: `m_${mi}_${kind}`, monthIndex: mi, title, condition, base, reward, status: 'active' };
}

export function monthlyProgress(state: GameState): Progress {
  const m = state.monthly;
  if (!m) return { cur: 0, max: 0 };
  const p = conditionProgress(state, m.condition);
  return { cur: Math.min(p.max, Math.max(0, p.cur - m.base)), max: p.max };
}

/** 월이 바뀌면 지난 과제를 정리(미달이면 실패)하고 새 과제를 만든다. 달성하면 보상. */
export function checkMonthly(state: GameState): void {
  const mi = monthIndex(state.clock);
  if (!state.monthly || state.monthly.monthIndex !== mi) {
    if (state.monthly && state.monthly.status === 'active') state.monthly.status = 'failed';
    state.monthly = makeMonthly(state);
    pushNotice(state, `이달의 과제: ${state.monthly.title}`);
  }
  const m = state.monthly;
  if (m.status !== 'active') return;
  const p = monthlyProgress(state);
  if (p.cur >= p.max) {
    m.status = 'done';
    applyRewards(state, m.reward, { source: 'monthly', refId: m.id, title: m.title, line: `이달의 과제 「${m.title}」 달성! 다음 달도 이 기세로.`, speaker: 'halmang' });
    pushNotice(state, `이달의 과제 달성: ${m.title}`);
  }
}

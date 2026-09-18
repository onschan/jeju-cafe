import type { GameState, GoalDef, Alert } from '../sim/index.ts';
import { currentGoal as simCurrentGoal, activeGoals as simActiveGoals, goalClaimed, goalProgress, goalConditionText, goalRewardText as simRewardText, challengeProgress, challengeDaysLeft, monthlyProgress } from '../sim/index.ts';
import { GOALS, challengeDef } from '../data/index.ts';
import { dayIndex } from '../sim/effects.ts';
import { DAYS_PER_MONTH } from '../sim/clock.ts';

/** 트랙 A(sim)의 목표·알림 API를 UI가 한 곳에서만 참조하도록 감싼다. (v3 통합: 스텁 없음) */

export interface Goal {
  id: string;
  title: string;
  desc: string;
  cur: number;
  max: number;
  rewardText: string;
}

/** GoalDef → UI 목표 (진행도는 상태에서). 지난 목표는 cur=max로 채운다. */
export function toGoal(s: GameState, g: GoalDef, done: boolean): Goal {
  const p = done ? { cur: 1, max: 1 } : goalProgress(s, g);
  return {
    id: g.id,
    title: g.title,
    desc: g.desc || goalConditionText(g.condition),
    cur: done ? p.max : p.cur,
    max: p.max,
    rewardText: g.reward.length > 0 ? g.reward.map(simRewardText).join(' · ') : '없음',
  };
}

/** 지금 목표 (다 끝났으면 null) */
export function currentGoal(s: GameState): Goal | null {
  const g = simCurrentGoal(s);
  return g ? toGoal(s, g, false) : null;
}
/** 동시 진행 중인 메인 목표 (최대 2) */
export function activeGoals(s: GameState): Goal[] {
  return simActiveGoals(s).map((g) => toGoal(s, g, false));
}

/** 이룬 목표 (goals.json 순서대로) */
export function pastGoals(s: GameState): Goal[] {
  return GOALS.filter((g) => goalClaimed(s, g.id)).map((g) => toGoal(s, g, true));
}

/** 달성한 목표 수 */
export function goalsAchieved(s: GameState): number {
  return s.goals.claimed.length;
}

/** 목표 줄 두 번째 줄: 가장 급한 도전(남은 날이 적은 것), 없으면 이달의 과제 */
export interface UrgentTask { kind: 'challenge' | 'monthly'; id: string; title: string; cur: number; max: number; daysLeft: number }
export function urgentChallenge(s: GameState): UrgentTask | null {
  const list = s.challenges.active.map((a) => {
    const p = challengeProgress(s, a.id);
    return { kind: 'challenge' as const, id: a.id, title: challengeDef(a.id).title, cur: p.cur, max: p.max, daysLeft: challengeDaysLeft(s, a.id) };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
  if (list[0]) return list[0];
  const m = s.monthly;
  if (m && m.status === 'active') {
    const p = monthlyProgress(s);
    const daysLeft = Math.max(0, (m.monthIndex + 1) * DAYS_PER_MONTH - dayIndex(s.clock));
    return { kind: 'monthly', id: m.id, title: m.title, cur: p.cur, max: p.max, daysLeft };
  }
  return null;
}

/** 대화창으로 보여 줄 sim 알림 큐 (앞에서부터). UI가 하나 띄울 때마다 dismissNotice로 뺀다. */
export function pendingNotices(s: GameState): Alert[] {
  return s.alerts;
}

export { guestSay, staffSay } from '../sim/index.ts';

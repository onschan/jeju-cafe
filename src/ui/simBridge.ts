import type { GameState, GoalDef, Alert } from '../sim/index.ts';
import { currentGoal as simCurrentGoal, goalProgress, goalConditionText, goalRewardText as simRewardText } from '../sim/index.ts';
import { GOALS } from '../data/index.ts';

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
  const p = done ? { cur: 1, max: 1 } : goalProgress(s);
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

/** 이룬 목표 (순서대로) */
export function pastGoals(s: GameState): Goal[] {
  return GOALS.slice(0, s.goals.index).map((g) => toGoal(s, g, true));
}

/** 달성한 목표 수 (튜토리얼 ⑥ 조건) */
export function goalsAchieved(s: GameState): number {
  return s.goals.index;
}

/** 대화창으로 보여 줄 sim 알림 큐 (앞에서부터). UI가 하나 띄울 때마다 dismissNotice로 뺀다. */
export function pendingNotices(s: GameState): Alert[] {
  return s.alerts;
}

export { guestSay, staffSay } from '../sim/index.ts';

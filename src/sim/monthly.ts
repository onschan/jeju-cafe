/**
 * 월간 과제 (trim: 도전 과제 46을 걷어내고 이달의 과제 하나만 남겼다). 결정적 (state.rng·state.clock만).
 * - 매월 1일 자동 1개 (monthIndex가 바뀌면 만든다). 난이도 = 지난달 실적 × MONTHLY_TARGET_RATIO.
 * - 보상은 응모권·마일리지. 미달이면 실패 한 줄 + 다음 과제 예고.
 */
import type { GameState, GoalCondition, GoalReward, MonthlyState } from './types.ts';
import { monthIndex } from './clock.ts';
import { conditionProgress, applyRewards, type Progress } from './goals.ts';
import { pushNotice } from './staff.ts';

type MonthlyKind = 'guests' | 'sales' | 'satisfied' | 'seats' | 'corner' | 'hidden';
/** 종류 순환. 테마·숨은 레시피는 2년차부터 끼어든다 — 그 전엔 손님·매출로 대신 */
const MONTHLY_KINDS: MonthlyKind[] = ['guests', 'sales', 'satisfied', 'seats', 'corner', 'guests', 'sales', 'hidden'];
export const MONTHLY_CODEX_YEAR = 2;

/** 월간 과제 목표치 = 지난달 실적의 이 비율 (달 중반에 닿게) */
export const MONTHLY_TARGET_RATIO = 0.6;
/** 이달 과제를 만든다 (결정적: monthIndex로 종류를 고른다). */
export function makeMonthly(state: GameState): MonthlyState {
  const mi = monthIndex(state.clock);
  let kind = MONTHLY_KINDS[mi % MONTHLY_KINDS.length]!;
  if ((kind === 'corner' || kind === 'hidden') && state.clock.year < MONTHLY_CODEX_YEAR) kind = kind === 'corner' ? 'guests' : 'sales';
  const lastGuests = Math.max(30, state.lastMonthCard?.guests ?? state.monthGuests);
  const lastIncome = Math.max(500_000, state.lastMonthIncome);
  let condition: GoalCondition; let title: string; let base = 0; let reward: GoalReward[];
  switch (kind) {
    case 'guests': {
      const n = Math.max(20, Math.ceil(lastGuests * MONTHLY_TARGET_RATIO / 10) * 10);
      condition = { type: 'monthGuests', n }; title = `이달 손님 ${n}명`; reward = [{ type: 'tickets', n: 2 }, { type: 'tickets', n: 1 }];
      break;
    }
    case 'sales': {
      const n = Math.max(300_000, Math.ceil(lastIncome * MONTHLY_TARGET_RATIO / 100_000) * 100_000);
      condition = { type: 'monthSales', n }; title = `이달 매출 ₩${(n / 10_000).toLocaleString('en-US')}만`; reward = [{ type: 'tickets', n: 3 }];
      break;
    }
    case 'satisfied': {
      const n = Math.max(10, Math.ceil(lastGuests * MONTHLY_TARGET_RATIO * 0.7 / 10) * 10);
      condition = { type: 'satisfied', n }; base = state.stats.satisfiedTotal; title = `만족 손님 ${n}명 더`; reward = [{ type: 'tickets', n: 2 }];
      break;
    }
    case 'seats': {
      const cur = conditionProgress(state, { type: 'seats', n: 1 }).cur;
      const n = cur + 1;
      condition = { type: 'seats', n }; title = `좌석 시설 ${n}개`; reward = [{ type: 'tickets', n: 2 }];
      break;
    }
    case 'corner': {
      condition = { type: 'corners', n: 1 }; base = state.codex.corners?.length ?? 0; title = '테마 하나 더'; reward = [{ type: 'tickets', n: 3 }, { type: 'tickets', n: 1 }];
      break;
    }
    case 'hidden': {
      condition = { type: 'hiddenRecipes', n: 1 }; base = state.codex.recipes.length; title = '숨은 레시피 하나'; reward = [{ type: 'tickets', n: 3 }, { type: 'research', n: 20 }];
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
    const failed = state.monthly && state.monthly.status === 'active' ? state.monthly : null;
    if (failed) failed.status = 'failed';
    state.monthly = makeMonthly(state);
    pushNotice(state, `이달의 과제: ${state.monthly.title}`);
    if (failed) state.alerts.push({ type: 'monthlyFailed', title: failed.title, next: state.monthly.title });
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

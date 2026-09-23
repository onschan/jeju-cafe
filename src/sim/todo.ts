/**
 * 「할 일」 — 지금 동시에 굴러가는 도전거리를 **한 화면에 전부** 모은다.
 *
 * 사용자 판단: "해야 할 도전거리를 숨겨 놓지 마." 지금까지 목표는 한 번에 1~2개만 보였고
 * 나머지는 목표 창을 뒤져야 나왔다. 코어 원칙 #1(다음 단계가 코앞)은 「다음 하나」가 아니라
 * **동시에 여러 개가 보이는 것**이다 — 하나가 막혀도 다른 줄이 코앞에 있다.
 *
 * 줄 구성 (5~7개):
 *   메인 목표 2 (지금·다음) + 등급 승급 1 + 이달의 과제 1 + 경쟁 2 = 6
 * 각 줄에 진행 막대(cur/max)·보상·**「가는 법」 한 줄**이 붙는다.
 *
 * 결정적·순수 — 상태를 바꾸지 않는다.
 */
import type { GameState, GoalReward, RivalAxis } from './types.ts';
import { activeGoals, goalProgress, goalRewardText, goalConditionText } from './goals.ts';
import { gradeOf, gradeName, gradeProgress, gradeUpRewards, MAX_GRADE } from './grade.ts';
import { monthlyProgress } from './monthly.ts';
import { rivalsState, scoreboard, rankGap, activeSteal, stealTitle, myAxes, RIVAL_AXES, RIVAL_AXIS_LABEL, RIVAL_COUNTER_COST, RIVAL_BOARD_DAY, endgameOpen, RIVAL_DEAL_LEAD_MONTHS } from './rival.ts';
import { contestUnlocked, signupOpen, daysToContest, nextContest } from './contest.ts';
import { fmtNum } from './format.ts';
import { GOALS } from '../data/index.ts';

export type TodoKind = 'goal' | 'grade' | 'monthly' | 'rival' | 'contest';
export interface TodoRow {
  key: string;
  kind: TodoKind;
  /** 제목 (≤ 22자) */
  title: string;
  cur: number;
  max: number;
  /** 진행 숫자를 어떻게 읽어 주나 ("1,240/1,500") */
  valueText: string;
  /** 보상 한 줄 (없으면 빈 문자열) */
  rewardText: string;
  /** 「가는 법」 한 줄 — 무엇을 하면 이 줄이 차나 */
  how: string;
  done: boolean;
}

const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.min(1, cur / max));
const rewardsText = (rs: GoalReward[]) => rs.map(goalRewardText).join(' · ');

/** 메인 목표 2줄 (지금·다음) */
export function goalRows(state: GameState): TodoRow[] {
  return activeGoals(state).map((g) => {
    const p = goalProgress(state, g);
    return {
      key: `goal:${g.id}`,
      kind: 'goal' as const,
      title: g.title,
      cur: p.cur,
      max: p.max,
      valueText: `${fmtNum(Math.min(p.cur, p.max))}/${fmtNum(p.max)}`,
      rewardText: rewardsText(g.reward),
      how: g.desc || goalConditionText(g.condition),
      done: p.max > 0 && p.cur >= p.max,
    };
  });
}

/** 등급 승급 1줄 — 네 조건 중 몇 개를 채웠나. 「가는 법」은 가장 덜 찬 조건. */
export function gradeRow(state: GameState): TodoRow | null {
  const next = gradeOf(state) + 1;
  if (next > MAX_GRADE) return null;
  const rows = gradeProgress(state, next);
  if (!rows) return null;
  const met = rows.filter((r) => r.met).length;
  const worst = [...rows].filter((r) => !r.met).sort((a, b) => pct(a.cur, a.need) - pct(b.cur, b.need))[0];
  return {
    key: `grade:${next}`,
    kind: 'grade',
    title: `「${gradeName(next)}」 승급`,
    cur: met,
    max: rows.length,
    valueText: `${met}/${rows.length}`,
    rewardText: rewardsText(gradeUpRewards(next)),
    how: worst
      ? `${worst.label} ${fmtNum(Math.min(worst.cur, worst.need))}/${fmtNum(worst.need)} — 여기가 제일 모자라요`
      : '조건을 다 채웠어요. 내일 아침에 올라요',
    done: met >= rows.length,
  };
}

/** 이달의 과제 1줄 */
export function monthlyRow(state: GameState): TodoRow | null {
  const m = state.monthly;
  if (!m) return null;
  const p = monthlyProgress(state);
  return {
    key: `monthly:${m.id}`,
    kind: 'monthly',
    title: `${state.clock.month}월 과제 · ${m.title}`,
    cur: p.cur,
    max: p.max,
    valueText: `${fmtNum(p.cur)}/${fmtNum(p.max)}`,
    rewardText: rewardsText(m.reward),
    how: m.status === 'failed' ? '이번 달은 놓쳤어요. 다음 달 과제를 기다려요' : `${goalConditionText(m.condition)} — 난이도는 지난달 기준이에요`,
    done: m.status === 'done',
  };
}

/** 경쟁 2줄: ① 동네 순위 ② 이달 경쟁 거리(뺏기 대응 / 대회 접수 / 1위 지키기) */
export function rivalRows(state: GameState): TodoRow[] {
  const st = rivalsState(state);
  const rows = scoreboard(state);
  const me = rows.find((r) => r.me)!;
  const { above, gap } = rankGap(rows);
  const total = rows.length;
  const out: TodoRow[] = [];
  out.push({
    key: 'rival:rank',
    kind: 'rival',
    title: above ? `이번 달 ${me.rank}위 → ${me.rank - 1}위로` : `동네 1위 지키기`,
    // 순위는 「위에서부터 몇 계단 올랐나」로 센다 (6위 → 0, 1위 → 5)
    cur: total - me.rank,
    max: total - 1,
    valueText: `${me.rank}/${total}위`,
    rewardText: above ? '응모권' : '손님 +10%',
    how: above
      ? `${above.name}와 ${gap}점 차 · ${weakestText(state)}`
      : `${RIVAL_BOARD_DAY}일 발표까지 1위면 손님이 10% 늘어요`,
    done: me.rank === 1,
  });
  const steal = activeSteal(state);
  if (steal && steal.answer === 'none') {
    out.push({
      key: 'rival:steal',
      kind: 'rival',
      title: stealTitle(state),
      cur: 0,
      max: 1,
      valueText: '답하기 전',
      rewardText: '손님 −10% 막기',
      how: `맞불 홍보 ₩${fmtNum(RIVAL_COUNTER_COST)} · 메뉴 개발 · 무시 중에 골라요`,
      done: false,
    });
  } else if (contestUnlocked(state) && signupOpen(state) && !state.contest?.entry) {
    const next = nextContest(state);
    out.push({
      key: 'rival:contest',
      kind: 'contest',
      title: next.month === 6 ? '제주 바리스타 대회' : '제주 카페 경연',
      cur: 0,
      max: 1,
      valueText: `${daysToContest(state)}일 남음`,
      rewardText: '상금 · 트로피',
      how: '동네 카페 3곳과 겨뤄요 — 직원과 메뉴를 내요',
      done: false,
    });
  } else if (endgameOpen(state)) {
    out.push({
      key: 'rival:endgame',
      kind: 'rival',
      title: '동네 카페 인수·제휴',
      cur: st.leadMonths,
      max: RIVAL_DEAL_LEAD_MONTHS,
      valueText: `1위 ${st.leadMonths}달째`,
      rewardText: '손님 흡수 · 시설',
      how: '평가 탭에서 한 곳을 고를 수 있어요',
      done: true,
    });
  } else {
    out.push({
      key: 'rival:axis',
      kind: 'rival',
      title: `우리 ${weakestAxisLabel(state)} 올리기`,
      cur: Math.round(myAxes(state)[weakestAxis(state)]),
      max: 100,
      valueText: `${Math.round(myAxes(state)[weakestAxis(state)])}/100`,
      rewardText: '순위 점수',
      how: AXIS_HOW[weakestAxis(state)],
      done: false,
    });
  }
  return out;
}

const AXIS_HOW: Record<RivalAxis, string> = {
  pop: '홍보와 시설로 손님층 인기를 올려요',
  view: '자리 둘레에 경관 시설을 놓아요',
  service: '직원을 늘리고 대기를 줄여요',
  sales: '메뉴 값과 자리 수를 늘려요',
};
export function weakestAxis(state: GameState): RivalAxis {
  const a = myAxes(state);
  return [...RIVAL_AXES].sort((x, y) => a[x] - a[y])[0]!;
}
function weakestAxisLabel(state: GameState): string {
  return RIVAL_AXIS_LABEL[weakestAxis(state)];
}
function weakestText(state: GameState): string {
  return `우리는 ${weakestAxisLabel(state)}가 제일 약해요`;
}

/** 지금 할 일 전부 (5~7줄). 아직 안 이룬 것부터, 다 채운 줄은 뒤로. */
export function todoRows(state: GameState): TodoRow[] {
  const out = [...goalRows(state)];
  const g = gradeRow(state);
  if (g) out.push(g);
  const m = monthlyRow(state);
  if (m) out.push(m);
  out.push(...rivalRows(state));
  return out;
}

/** [앞으로] 탭 — 남은 목표를 **잠금 없이 전부**. 조건·보상을 그대로 보여 주고 순서만 매긴다.
 *  숨기지 않는 것이 이 창의 요점이다 (사용자 판단: "해야 할 도전거리를 숨겨 놓지 마"). */
export interface UpcomingRow { no: number; id: string; title: string; conditionText: string; rewardText: string; active: boolean }
export function upcomingGoals(state: GameState): UpcomingRow[] {
  const active = new Set(activeGoals(state).map((g) => g.id));
  const out: UpcomingRow[] = [];
  GOALS.forEach((g, i) => {
    if (state.goals.claimed.includes(g.id)) return;
    out.push({ no: i + 1, id: g.id, title: g.title, conditionText: g.desc || goalConditionText(g.condition), rewardText: rewardsText(g.reward), active: active.has(g.id) });
  });
  return out;
}

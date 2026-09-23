/**
 * 하루 성장 기록 (성장 체감): 하루가 끝날 때 어제 하루치 손님·매출·새 단골·등급을 한 줄 남긴다.
 *
 * - 「오늘의 성장 요약」 카드(하단 3초)와 경영 현황 「자세히」의 최근 30일 막대 그래프가 같은 데이터를 본다.
 * - 최근 DAY_LOG_CAP일만 보관한다 (세이브가 커지지 않게).
 * - 매출은 월 누적(monthIncome)의 하루 차이로 센다. 달이 바뀐 날은 monthIncome이 0으로 리셋된 뒤라
 *   지난달 마감값(lastMonthIncome)으로 이어 붙인다 — closeMonth가 onNewDay보다 먼저 돈다(tick.step).
 * - 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState } from './types.ts';
import { dayIndex } from './effects.ts';
import { gradeOf } from './grade.ts';

/** 보관하는 날 수 = 그래프 칸 수 */
export const DAY_LOG_CAP = 30;

export interface DayLogRow {
  day: number;      // dayIndex (끝난 날)
  guests: number;   // 그날 다녀간 손님
  income: number;   // 그날 매출
  regulars: number; // 그날 새로 생긴 단골
  grade: number;    // 그날 끝의 카페 등급 (그래프 승급 세로선)
}

function markOf(state: GameState): { income: number; regulars: number } {
  return (state.dayLogMark ??= { income: state.monthIncome, regulars: state.regulars?.length ?? 0 });
}

/** 어제 하루치 한 줄. tick.onNewDay에서 평판 정산(dayStats 리셋)보다 먼저 부른다. */
export function closeDay(state: GameState): DayLogRow {
  const mark = markOf(state);
  const raw = state.monthIncome >= mark.income
    ? state.monthIncome - mark.income
    : state.lastMonthIncome - mark.income + state.monthIncome; // 달이 바뀐 날
  const regulars = state.regulars?.length ?? 0;
  const row: DayLogRow = {
    day: dayIndex(state.clock) - 1,
    guests: state.dayStats.total,
    income: Math.max(0, Math.round(raw)),
    regulars: Math.max(0, regulars - mark.regulars),
    grade: gradeOf(state),
  };
  const log = (state.dayLog ??= []);
  log.push(row);
  while (log.length > DAY_LOG_CAP) log.shift();
  mark.income = state.monthIncome;
  mark.regulars = regulars;
  return row;
}

/** 최근 n일 (오래된 것부터). 기록이 모자라면 있는 만큼. */
export function recentDays(state: GameState, n = DAY_LOG_CAP): DayLogRow[] {
  const log = state.dayLog ?? [];
  return log.slice(Math.max(0, log.length - n));
}

/** 오늘의 성장 요약: 방금 끝난 하루와 그 전날 (어제 대비 증감용). 기록이 없으면 null. */
export interface DaySummary { today: DayLogRow; prev: DayLogRow | null }
export function daySummary(state: GameState): DaySummary | null {
  const log = state.dayLog ?? [];
  const today = log[log.length - 1];
  if (!today) return null;
  return { today, prev: log[log.length - 2] ?? null };
}

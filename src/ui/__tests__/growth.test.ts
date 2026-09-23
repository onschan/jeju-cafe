/** 성장 체감 3종: 오늘의 성장 요약 카드 문구 · 30일 그래프의 승급 세로선 · 「오늘 할 일」 한 줄. */
import { describe, it, expect } from 'vitest';
import { bareState } from '../../sim/__tests__/helpers.ts';
import { closeDay, DAY_LOG_CAP } from '../../sim/index.ts';
import type { DayLogRow } from '../../sim/index.ts';
import { deltaText, summaryParts, DAY_CARD_MS } from '../DaySummaryCard.tsx';
import { gradeUps } from '../GrowthChart.tsx';
import { GOAL_BAR_H, GOAL_LINE_H, CHALLENGE_LINE_H } from '../GoalBar.tsx';
import { todoItems, TODO_LINE_H } from '../TodoLine.tsx';
import { hasIdToken } from '../../data/labels.ts';

const row = (o: Partial<DayLogRow>): DayLogRow => ({ day: 0, guests: 0, income: 0, regulars: 0, grade: 1, ...o });

describe('오늘의 성장 요약 카드', () => {
  it('어제 대비 증감: 늘면 ▲, 줄면 ▼, 같으면 안 쓴다', () => {
    expect(deltaText(42, 36, 'guests')).toBe('▲6');
    expect(deltaText(36, 42, 'guests')).toBe('▼6');
    expect(deltaText(42, 42, 'guests')).toBe('');
    expect(deltaText(42, null, 'guests')).toBe(''); // 첫날은 견줄 어제가 없다
    expect(deltaText(380_000, 340_000, 'money')).toBe('▲4만');
  });
  it('세 줄: 손님·매출 + (있을 때만) 새 단골. 영문 id·상투구 없음', () => {
    const parts = summaryParts(row({ guests: 42, income: 380_000, regulars: 1 }), row({ guests: 36, income: 340_000 }));
    expect(parts.map((p) => p.label)).toEqual(['손님', '매출', '새 단골']);
    expect(parts[0]!.value).toBe('42명');
    expect(parts[0]!.delta).toBe('▲6');
    expect(parts[1]!.value).toBe('₩38만');
    expect(parts[1]!.delta).toBe('▲4만');
    expect(parts[2]!.value).toBe('1명');
    for (const p of parts) { expect(hasIdToken(p.value)).toBe(false); expect(`${p.label}${p.value}${p.delta}`).not.toMatch(/→|정석|시뮬/); }
  });
  it('새 단골이 없으면 그 줄은 안 나온다, 카드는 3초', () => {
    expect(summaryParts(row({ guests: 5 }), null).map((p) => p.label)).toEqual(['손님', '매출']);
    expect(DAY_CARD_MS).toBe(3000);
  });
});

describe('성장 그래프', () => {
  it('등급이 오른 날에 세로선 하나씩 (첫 줄은 기준이라 제외)', () => {
    const rows = [row({ grade: 1 }), row({ grade: 1 }), row({ grade: 2 }), row({ grade: 2 }), row({ grade: 3 })];
    expect(gradeUps(rows)).toEqual([{ i: 2, grade: 2 }, { i: 4, grade: 3 }]);
    expect(gradeUps([row({ grade: 2 })])).toEqual([]); // 줄이 하나면 없음
  });
  it('30칸까지만 본다 (하루 기록 상한과 같다)', () => {
    const s = bareState(1);
    for (let i = 0; i < DAY_LOG_CAP + 5; i++) closeDay(s);
    expect(s.dayLog!.length).toBe(DAY_LOG_CAP);
  });
});

describe('오늘 할 일 줄', () => {
  it('한 줄이 늘 있다 — 시작 상태에서는 다음 수, 문구에 영문 id·상투구 없음', () => {
    const s = bareState(1);
    const items = todoItems(s);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.text.length).toBeGreaterThan(0);
      expect(hasIdToken(it.text)).toBe(false);
      expect(it.text).not.toMatch(/→|정석|시뮬|공략|굴려 보니/);
    }
  });
  it('할 일 줄은 목표 줄과 따로 — 한 화면에 「오늘 할 일」은 하나뿐', () => {
    expect(GOAL_BAR_H).toBe(GOAL_LINE_H + CHALLENGE_LINE_H); // 목표 줄 안에는 할 일 줄이 없다
    expect(TODO_LINE_H).toBeGreaterThanOrEqual(20);
  });
});

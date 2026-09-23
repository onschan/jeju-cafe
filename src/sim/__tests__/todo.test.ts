/** 「할 일」 줄 모음 (todo.ts) — 도전거리를 숨기지 않는다: 동시 5~7줄 · [앞으로] 전체 공개. */
import { describe, test, expect } from 'vitest';
import type { GameState } from '../types.ts';
import { bareState } from './helpers.ts';
import { todoRows, goalRows, gradeRow, monthlyRow, rivalRows, upcomingGoals, weakestAxis } from '../todo.ts';
import { rivalsState, activeSteal, rollSteal, RIVAL_STEAL_DAY, RIVAL_EFFECT_YEAR, RIVAL_AXES } from '../rival.ts';
import { activeGoals, CONCURRENT_GOALS } from '../goals.ts';
import { gradeProgress, MAX_GRADE } from '../grade.ts';
import { GOALS } from '../../data/index.ts';

function s0(seed = 1): GameState {
  return bareState(seed);
}

describe('지금 할 일', () => {
  test('한 화면에 5~7줄이 동시에 보인다 (하나만 보여 주지 않는다)', () => {
    const rows = todoRows(s0());
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.length).toBeLessThanOrEqual(7);
  });
  test('메인 목표 2 + 등급 + 이달의 과제 + 경쟁이 모두 들어 있다', () => {
    const kinds = todoRows(s0()).map((r) => r.kind);
    expect(kinds.filter((k) => k === 'goal')).toHaveLength(CONCURRENT_GOALS);
    expect(kinds).toContain('grade');
    expect(kinds).toContain('monthly');
    expect(kinds.filter((k) => k === 'rival' || k === 'contest').length).toBeGreaterThanOrEqual(1);
  });
  test('줄마다 진행 막대 범위·보상·「가는 법」이 있다', () => {
    for (const r of todoRows(s0())) {
      expect(r.max).toBeGreaterThan(0);
      expect(r.cur).toBeGreaterThanOrEqual(0);
      expect(r.cur).toBeLessThanOrEqual(r.max);
      expect(r.how.length).toBeGreaterThan(0);
      expect(r.rewardText.length).toBeGreaterThan(0);
      expect(r.valueText.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
    }
  });
  test('줄 키는 서로 겹치지 않는다 (리스트 렌더 키)', () => {
    const keys = todoRows(s0()).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  test('메인 목표 줄은 activeGoals와 같은 것을 가리킨다', () => {
    const s = s0();
    expect(goalRows(s).map((r) => r.key)).toEqual(activeGoals(s).map((g) => `goal:${g.id}`));
  });
  test('등급 줄은 네 조건 중 몇 개를 채웠나 · 최고 등급이면 줄이 없다', () => {
    const s = s0();
    const row = gradeRow(s)!;
    expect(row.max).toBe(gradeProgress(s, 2)!.length);
    expect(row.max).toBe(4);
    s.grade = MAX_GRADE;
    expect(gradeRow(s)).toBeNull();
  });
  test('이달의 과제 줄은 과제가 없으면 안 그린다', () => {
    const s = s0();
    expect(monthlyRow(s)).not.toBeNull();
    s.monthly = null;
    expect(monthlyRow(s)).toBeNull();
    expect(todoRows(s).every((r) => r.kind !== 'monthly')).toBe(true);
  });
  test('경쟁 첫 줄은 「몇 위 → 몇 위로」, 1위면 지키기', () => {
    const s = s0();
    const rows = rivalRows(s);
    expect(rows[0]!.title).toMatch(/위로$/);
    for (const d of Object.keys(rivalsState(s).cafes)) rivalsState(s).cafes[d]!.acquired = true; // 나 혼자 = 1위
    expect(rivalRows(s)[0]!.title).toContain('1위');
  });
  test('답을 기다리는 뺏기 이벤트가 있으면 경쟁 둘째 줄이 대응으로 바뀐다', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.clock.day = RIVAL_STEAL_DAY;
    rollSteal(s);
    expect(activeSteal(s)).not.toBeNull();
    const steal = rivalRows(s).find((r) => r.key === 'rival:steal');
    expect(steal).toBeDefined();
    expect(steal!.how).toContain('맞불');
  });
  test('가장 약한 항목을 집어 준다', () => {
    const s = s0();
    expect(RIVAL_AXES).toContain(weakestAxis(s));
  });
});

describe('앞으로', () => {
  test('남은 목표를 잠금 없이 전부 보여 준다 — 조건·보상 공개', () => {
    const s = s0();
    const list = upcomingGoals(s);
    expect(list).toHaveLength(GOALS.length);
    for (const g of list) {
      expect(g.conditionText.length).toBeGreaterThan(0);
      expect(g.rewardText.length).toBeGreaterThan(0);
      expect(g.no).toBeGreaterThan(0);
    }
  });
  test('이룬 목표는 빠지고 순서 번호는 원래 자리를 지킨다', () => {
    const s = s0();
    s.goals.claimed.push(GOALS[0]!.id);
    s.goals.index = 1;
    const list = upcomingGoals(s);
    expect(list).toHaveLength(GOALS.length - 1);
    expect(list.some((g) => g.id === GOALS[0]!.id)).toBe(false);
    expect(list[0]!.no).toBe(2);
  });
  test('지금 진행 중인 목표에 표가 붙는다', () => {
    const s = s0();
    const marked = upcomingGoals(s).filter((g) => g.active).map((g) => g.id);
    expect(marked).toEqual(activeGoals(s).map((g) => g.id));
  });
});

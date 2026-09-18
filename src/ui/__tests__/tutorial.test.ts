import { describe, it, expect } from 'vitest';
import { createInitialState, apply } from '../../sim/index.ts';
import { TUTORIAL_STEPS, checkTutorial, getTutorial, resetTutorial, skipTutorial, currentStep, stepLines } from '../tutorial';
import { tick, DAY_MS } from '../../sim/index.ts';
import { X, Y, bareState } from '../../sim/__tests__/helpers';

describe('tutorial steps', () => {
  it('12단계이고 id가 1..12 순서', () => {
    expect(TUTORIAL_STEPS.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (const t of TUTORIAL_STEPS) expect(t.lines).toHaveLength(2);
  });

  it('메뉴판 아메리카노 → 테이블 순으로 넘어간다', () => {
    resetTutorial();
    const s = bareState(1, 'p', 0); // v3 시작 상태(메뉴·테이블 있음) 대신 빈 마당 — 구 튜토리얼은 셸 트랙이 대화창 6단계로 바꾼다
    checkTutorial(s);
    expect(getTutorial().step).toBe(1);
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    checkTutorial(s);
    expect(getTutorial().step).toBe(2);
    expect(apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(5) }).ok).toBe(true); // 시작 필지 기준 좌표 (3×3 필지)
    checkTutorial(s);
    expect(getTutorial().step).toBe(3);
    // 3단계(첫 손님 착석)는 아직
    checkTutorial(s);
    expect(getTutorial().step).toBe(3);
  });

  it('건너뛰기는 끝으로, 7·11·12단계는 조건 없이 버튼으로 넘긴다', () => {
    resetTutorial();
    skipTutorial();
    expect(getTutorial().done).toBe(true);
    expect(currentStep()).toBeNull();
    // 7단계: 당근은 9~11월에만 심을 수 있어 3월 시작 게임에서 조건을 걸면 가을까지 막힌다
    expect(TUTORIAL_STEPS[6]!.done).toBeUndefined();
    expect(TUTORIAL_STEPS[10]!.done).toBeUndefined();
    expect(TUTORIAL_STEPS[11]!.done).toBeUndefined();
  });

  it('3단계: 길이 안 이어졌으면 올렛길 안내로 바뀐다', () => {
    const s = bareState(1, 'p', 0);
    const step3 = TUTORIAL_STEPS[2]!;
    apply(s, { type: 'place', objectType: 'table_out', x: X(6), y: Y(2) }); // 길과 떨어진 자리
    expect(stepLines(step3, s)[1]).toContain('올렛길');
    apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(5) });
    apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(4) });
    apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(3) });
    apply(s, { type: 'place', objectType: 'path', x: X(5), y: Y(3) });
    apply(s, { type: 'place', objectType: 'path', x: X(6), y: Y(3) });
    expect(stepLines(step3, s)).toEqual(step3.lines);
  });

  it('10단계: 달이 넘어가고 결산 카드를 닫으면 끝난다 (dismissMonthCard는 로그에 안 남는다)', () => {
    const s = createInitialState(1, 'p', 0);
    const step10 = TUTORIAL_STEPS[9]!;
    expect(step10.done!(s)).toBe(false);
    for (let d = 0; d < 30; d++) tick(s, DAY_MS);
    expect(s.lastMonthCard).not.toBeNull();
    expect(step10.done!(s)).toBe(false);
    expect(apply(s, { type: 'dismissMonthCard' }).ok).toBe(true);
    expect(s.actionLog.some((a) => a.action.type === 'dismissMonthCard')).toBe(false);
    expect(step10.done!(s)).toBe(true);
  });
});

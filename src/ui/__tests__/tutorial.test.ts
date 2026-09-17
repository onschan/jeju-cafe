import { describe, it, expect } from 'vitest';
import { createInitialState, apply } from '../../sim/index.ts';
import { TUTORIAL_STEPS, checkTutorial, getTutorial, resetTutorial, skipTutorial, currentStep } from '../tutorial';
import { X, Y } from '../../sim/__tests__/helpers';

describe('tutorial steps', () => {
  it('12단계이고 id가 1..12 순서', () => {
    expect(TUTORIAL_STEPS.map((t) => t.id)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (const t of TUTORIAL_STEPS) expect(t.lines).toHaveLength(2);
  });

  it('메뉴판 아메리카노 → 테이블 순으로 넘어간다', () => {
    resetTutorial();
    const s = createInitialState(1, 'p', 0);
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

  it('건너뛰기는 끝으로, 11·12단계는 조건 없이 버튼으로 넘긴다', () => {
    resetTutorial();
    skipTutorial();
    expect(getTutorial().done).toBe(true);
    expect(currentStep()).toBeNull();
    expect(TUTORIAL_STEPS[10]!.done).toBeUndefined();
    expect(TUTORIAL_STEPS[11]!.done).toBeUndefined();
  });
});

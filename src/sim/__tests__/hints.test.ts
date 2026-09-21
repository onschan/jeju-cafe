import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { idleDays, idleHint, IDLE_DAYS, IDLE_REPEAT_DAYS } from '../hints.ts';
import { TUTORIAL_STEPS } from '../tutorial.ts';

describe('삼춘 힌트 (game-feel: 3일 무행동)', () => {
  it('idleDays는 마지막 액션 뒤 지난 날수, 힌트는 도전 과제가 비었으면 도전을 권한다', () => {
    const s = createInitialState(1);
    expect(idleDays(s)).toBe(0);
    for (let d = 0; d < 2; d++) { tick(s, DAY_MS); while (s.alerts.length) apply(s, { type: 'dismissAlert' }); }
    expect(idleDays(s)).toBe(2);
    expect(idleHint(s)).toContain('도전 과제');
    expect(apply(s, { type: 'renameCafe', name: '감귤 카페' }).ok).toBe(true); // 액션이 있으면 리셋 (dismissAlert는 로그에 없다)
    expect(idleDays(s)).toBe(0);
  });

  it('튜토리얼이 끝난 뒤 IDLE_DAYS일째 아침에 메시지 줄 한 줄, 그 뒤 IDLE_REPEAT_DAYS마다 한 번', () => {
    const s = createInitialState(1);
    expect(s.tutorial.step).toBe(TUTORIAL_STEPS); // starter 레이아웃은 튜토리얼 끝
    const hints = () => s.notices.filter((n) => n.startsWith('삼춘:')).length;
    for (let d = 0; d < IDLE_DAYS; d++) { tick(s, DAY_MS); while (s.alerts.length) apply(s, { type: 'dismissAlert' }); }
    expect(hints()).toBe(1); // IDLE_DAYS일째 아침
    for (let d = 0; d < IDLE_REPEAT_DAYS; d++) { tick(s, DAY_MS); while (s.alerts.length) apply(s, { type: 'dismissAlert' }); }
    expect(hints()).toBe(2);
  });
});

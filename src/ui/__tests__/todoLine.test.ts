import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { solveSync } from '../../sim/solver.ts';
import { setSolverResult } from '../../sim/solverCache.ts';
import { REP_LOW } from '../../sim/reputation.ts';
import { WARN_DEFICIT_MONTHS, LOAN_THRESHOLD } from '../../sim/failure.ts';
import { hasIdToken } from '../../data/labels.ts';
import type { GameState } from '../../sim/types.ts';
import { todoItems, gainText, TODO_MAX } from '../TodoLine.tsx';

function starter(seed = 1): GameState { return createInitialState(seed); }
/** 경고가 없는 평온한 상태 */
function calm(seed = 1): GameState {
  const s = starter(seed);
  s.reputation = 60;
  s.money = 20_000_000;
  s.deficitMonths = 0;
  return s;
}

beforeEach(() => { setSolverResult(null); });

describe('오늘 할 일 (§3.4)', () => {
  it('정확히 3줄을 넘지 않는다', () => {
    const s = calm();
    solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
    expect(todoItems(s).length).toBeLessThanOrEqual(TODO_MAX);
  });

  it('경고가 solver보다 앞선다 — 평판이 낮으면 첫 줄이 경고', () => {
    const s = calm();
    solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
    s.reputation = REP_LOW - 2;
    const items = todoItems(s);
    expect(items[0]!.kind).toBe('warn');
    expect(items[0]!.text).toContain(`평판 ${Math.round(s.reputation)}`);
  });

  it('적자·잔고 경고도 첫 줄로 올라온다', () => {
    const s = calm();
    s.deficitMonths = WARN_DEFICIT_MONTHS;
    expect(todoItems(s)[0]!.kind).toBe('warn');
    const t = calm();
    t.money = LOAN_THRESHOLD - 1;
    expect(todoItems(t)[0]!.kind).toBe('warn');
  });

  it('경고가 없으면 첫 줄이 다음 수 (solver 캐시가 없어도 휴리스틱으로 채운다)', () => {
    const s = calm();
    const items = todoItems(s);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.kind).toBe('move');
  });

  it('목표 줄이 들어가고, 탭하면 목표 창을 연다', () => {
    const s = calm();
    const goal = todoItems(s).find((i) => i.kind === 'goal');
    expect(goal).toBeTruthy();
    expect(goal!.opens).toBe('goal');
  });

  it('예상 이득은 만 단위 — 1만 미만이면 빈 문자열', () => {
    expect(gainText(420_000)).toBe('+42만');
    expect(gainText(4_999)).toBe('');
    expect(gainText(0)).toBe('');
  });

  it('모든 줄에 영문 id가 없다', () => {
    const s = calm();
    solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
    for (const it of todoItems(s)) expect(hasIdToken(it.text), it.text).toBe(false);
  });

  it('문구에 지시 화살표가 없다 (문구 규칙 §6)', () => {
    const s = calm();
    solveSync(s, { horizon: 4, maxCandidates: 12, maxRollouts: 12 });
    for (const it of todoItems(s)) expect(/→|정석|시뮬|공략/.test(it.text), it.text).toBe(false);
  });
});

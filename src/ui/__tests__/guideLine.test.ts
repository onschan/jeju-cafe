/** 안내 한 줄 (teardown §3 「합친다」): 같은 말이 세 줄로 나오지 않게, 줄 하나에 우선순위 하나. */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { apply } from '../../sim/actions.ts';
import { placeObject } from '../../sim/grid.ts';
import { X, Y } from '../../sim/__tests__/helpers.ts';
import { TUTORIAL_STEPS } from '../../sim/tutorial.ts';
import { CHAPTERS } from '../../sim/chapter.ts';
import { guideOf } from '../GuideLine.tsx';
import type { GameState } from '../../sim/types.ts';

/** 새 게임(빈 마당) — 튜토리얼 1단계부터 */
function fresh(): GameState {
  return createInitialState(1, 'local', 0, 'open');
}
/** 튜토리얼을 건너뛴 상태 */
function noTutorial(s: GameState): GameState {
  s.tutorial.step = TUTORIAL_STEPS;
  return s;
}
/** 문을 열 수 있게: 자리 하나 + 메뉴판 세 칸 (시작 메뉴판은 비어 있다 — 메뉴도 직접 올린다) */
function openable(s: GameState): GameState {
  placeObject(s, 'table_parasol', X(3), Y(4));
  s.menuSlots = ['americano', 'latte', 'tangerine_juice'];
  return s;
}

describe('안내 한 줄', () => {
  it('튜토리얼이 돌고 있으면 그 줄이 먼저다 — 문 열기 막힘·막이 같이 뜨지 않는다', () => {
    const g = guideOf(fresh())!;
    expect(g.kind).toBe('tutorial');
    expect(g.text).toBe('테이블 하나 놓기');
  });

  it('튜토리얼이 끝났고 문이 안 열리면 그 까닭', () => {
    const g = guideOf(noTutorial(fresh()))!;
    expect(g.kind).toBe('blocker');
    expect(g.text).toContain('자리');
  });

  it('문이 열리면 이번 막 — 진행도까지 한 줄에', () => {
    const s = openable(noTutorial(fresh()));
    const g = guideOf(s)!;
    expect(g.kind).toBe('chapter');
    expect(g.title).toContain('1막');
    expect(g.tail).toBe(`0/${CHAPTERS[0]!.need}`);
  });

  it('할 말이 없으면 줄도 없다', () => {
    const s = openable(noTutorial(fresh()));
    s.chapter = { idx: 5 }; // 다섯 막을 다 지났다
    expect(guideOf(s)).toBeNull();
  });

  it('메뉴판은 비어 있다 — 자리처럼 메뉴도 직접 올린다', () => {
    expect(fresh().menuSlots.every((m) => m === null)).toBe(true);
  });

  it('이미 해 둔 단계는 대사 없이 조용히 넘어간다 (P0-5) — 메뉴를 먼저 채워 두면 그 단계는 안 시킨다', () => {
    const s = fresh();
    s.menuSlots = ['americano', 'latte', 'tangerine_juice']; // 시키기 전에 벌써 채워 뒀다
    s.tutorial.seen.push('dlg:1'); // 1단계 대사를 봤다
    expect(apply(s, { type: 'place', objectType: 'table_out', x: X(3), y: Y(4) }).ok).toBe(true);
    // 2단계(메뉴판 채우기)는 이미 참이라 대사 없이 넘어간다 — 3분 전에 한 일을 다시 시키지 않는다
    expect(s.tutorial.step).toBe(2); // 0-based: 3단계(첫 손님)가 차례
  });

  it('3단계는 손님을 기다리는 단계 — 줄 얘기가 아니라 「첫 손님 받기」', () => {
    const s = openable(fresh());
    s.tutorial.step = 2;
    const g = guideOf(s)!;
    expect(g.kind).toBe('tutorial');
    expect(g.text).toBe('첫 손님 받기');
  });
});

describe('시간이 흘러야 되는 튜토리얼 단계', () => {
  it('「첫 손님 받기」는 손님이 돈을 내면 액션 없이도 넘어간다', async () => {
    const { tick } = await import('../../sim/tick.ts');
    const { HOUR_MS } = await import('../../sim/clock.ts');
    const s = openable(fresh());
    s.tutorial.step = 2;
    s.tutorial.seen.push('act:1', 'dlg:1', 'dlg:2', 'dlg:3');
    let hours = 0;
    while (hours < 120 && s.tutorial.step === 2) { tick(s, HOUR_MS); hours++; }
    expect(Object.values(s.menuSold).reduce((a, b) => a + b, 0)).toBeGreaterThan(0); // 팔긴 팔았고
    expect(s.tutorial.step).toBe(3); // 아무것도 안 눌러도 넘어갔다
  });
});

/** 안내 한 줄 (teardown §3 「합친다」): 같은 말이 세 줄로 나오지 않게, 줄 하나에 우선순위 하나. */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { apply } from '../../sim/actions.ts';
import { placeObject } from '../../sim/grid.ts';
import { X, Y } from '../../sim/__tests__/helpers.ts';
import { TUTORIAL_STEPS } from '../../sim/tutorial.ts';
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
    const s = noTutorial(fresh());
    placeObject(s, 'table_parasol', X(3), Y(4));
    const g = guideOf(s)!;
    expect(g.kind).toBe('chapter');
    expect(g.title).toContain('1막');
    expect(g.tail).toBe('0/2');
  });

  it('할 말이 없으면 줄도 없다', () => {
    const s = noTutorial(fresh());
    placeObject(s, 'table_parasol', X(3), Y(4));
    s.chapter = { idx: 5 }; // 다섯 막을 다 지났다
    expect(guideOf(s)).toBeNull();
  });

  it('이미 해 둔 단계는 대사 없이 조용히 넘어간다 (P0-5) — 자리를 놓으면 메뉴 단계를 건너뛰고 러시로', () => {
    const s = fresh();
    expect(s.menuSlots).toContain('americano'); // 시작 메뉴판에 이미 올라가 있다
    s.tutorial.seen.push('dlg:1'); // 1단계 대사를 봤다
    expect(apply(s, { type: 'place', objectType: 'table_out', x: X(3), y: Y(4) }).ok).toBe(true);
    const g = guideOf(s)!;
    expect(g.kind).toBe('tutorial');
    // 2단계(아메리카노 올리기)는 이미 참이라 대사 없이 넘어간다 — 3분 전에 한 일을 다시 시키지 않는다
    expect(g.text).toBe('줄에서 손님 둘 앉히기');
  });
});

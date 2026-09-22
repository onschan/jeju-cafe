import { noteBlockedClick, resetBlockedHint, BLOCKED_HINT, BLOCKED_DOUBLE_TAP_MS } from '../tutorialHighlight.ts';
import { getMessages, clearMessages } from '../store.ts';

beforeEach(() => { clearMessages(); resetBlockedHint(); });

test('스포트라이트 차단 중 셸을 두 번 연속 탭하면 「튜토리얼 밖 조작은 📖에서 끌 수 있어요」를 세션에 한 번만 (ease)', () => {
  expect(noteBlockedClick(1000)).toBe(false); // 첫 탭
  expect(noteBlockedClick(1000 + BLOCKED_DOUBLE_TAP_MS + 1)).toBe(false); // 너무 늦은 두 번째
  expect(noteBlockedClick(1000 + BLOCKED_DOUBLE_TAP_MS + 500)).toBe(true); // 연속 두 번
  expect(getMessages()[0]!.text).toBe(BLOCKED_HINT);
  expect(noteBlockedClick(1000 + BLOCKED_DOUBLE_TAP_MS + 800)).toBe(false); // 한 번만
  expect(getMessages()).toHaveLength(1);
});

test('fix-indoor: 맵 칸이 빛나는 튜토리얼 단계는 전부 칸 라벨 문구가 있고, 튜토리얼이 끝나면 칸·라벨이 비어 글로우가 남지 않는다', async () => {
  const { CELL_LABEL, tutorialTargets } = await import('../tutorialHighlight.ts');
  const { STEPS, TUTORIAL_STEPS } = await import('../../sim/tutorial.ts');
  const { createInitialState, fillStarterLayout } = await import('../../sim/state.ts');
  const s = createInitialState(1, 'local', 0, 'tutorial');
  fillStarterLayout(s, false);
  const none = () => [];
  for (const st of STEPS) {
    if (st.cells.toString() === none.toString()) continue; // cells: none
    expect(CELL_LABEL[st.key], `${st.id} ${st.key}`).toBeTruthy();
  }
  s.tutorial.step = 4; // 5단계 좌석: 길 옆 빈 칸 글로우 + 「여기에 자리 놓기」
  const t = tutorialTargets(s);
  expect(t.cells.length).toBeGreaterThan(0);
  expect(t.label).toBe(CELL_LABEL['seat_view']);
  s.tutorial.step = TUTORIAL_STEPS;
  expect(tutorialTargets(s)).toEqual({ targets: [], cells: [], label: '' });
});

test('solver: 공략 노트 추천 행동 포커스(setGuideFocus)는 같은 상태 키에서만 타깃·칸을 덮어쓰고(어둠 없이 guide 표식), 대사에는 롤아웃 근거 줄이 「→ 지금:」 앞에 끼워진다', async () => {
  const { tutorialTargets, setGuideFocus } = await import('../tutorialHighlight.ts');
  const { fillTutorialStep, STEP_DELTA_TOKEN, TUTORIAL_DIALOGUES } = await import('../tutorialDialogue.ts');
  const { createInitialState, fillStarterLayout } = await import('../../sim/state.ts');
  const { solverKey, setSolverResult } = await import('../../sim/solverCache.ts');
  const s = createInitialState(1, 'local', 0, 'tutorial');
  fillStarterLayout(s, false);
  s.tutorial.step = 4;
  const seat = { x: 12, y: 10 };
  const move = { action: { type: 'place' as const, objectType: 'table_out', x: seat.x, y: seat.y }, score: 420_000, delta: { money: 420_000, reputation: 0, goals: 0 }, why: '14일 굴려 보니 자금 +₩42만, 2위보다 ₩9만 더', label: '야외 테이블 (12,10)', cells: [seat], targets: ['nav:build', 'tab:rest', 'build:table_out'], horizon: 14 };
  setSolverResult({ key: solverKey(s), moves: [move], horizon: 14, rollouts: 10, ms: 1 });
  // 대사: 5단계(seat_view) 3줄 → 근거 줄이 끼워져 4줄, 마지막은 여전히 「→ 지금:」
  const step5 = TUTORIAL_DIALOGUES[4]!;
  expect(STEP_DELTA_TOKEN[step5.key]).toBe('seatDelta');
  const filled = fillTutorialStep(step5, s);
  expect(filled.lines).toHaveLength(step5.lines.length + 1);
  expect(filled.lines[filled.lines.length - 2]).toBe('시뮬 14일 굴려 보니 자금 +₩42만');
  expect(filled.lines[filled.lines.length - 1]!.startsWith('→ 지금: ')).toBe(true);
  // 포커스: 키가 맞으면 덮어쓴다
  setGuideFocus({ key: solverKey(s), targets: move.targets, cells: move.cells, label: '야외 테이블 · 시뮬 +₩42만' });
  const t = tutorialTargets(s);
  expect(t.guide).toBe(true);
  expect(t.cells).toEqual([seat]);
  expect(t.targets).toEqual(move.targets);
  // 키가 바뀌면(돈이 크게 바뀜) 튜토리얼 단계 타깃으로 돌아간다
  s.money += 1_000_000;
  const t2 = tutorialTargets(s);
  expect(t2.guide).toBeUndefined();
  expect(t2.targets).toEqual(['nav:build', 'tab:rest', 'build:table_out']);
  setGuideFocus(null);
  setSolverResult(null);
  expect(fillTutorialStep(step5, s).lines).toHaveLength(step5.lines.length);
});

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

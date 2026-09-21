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

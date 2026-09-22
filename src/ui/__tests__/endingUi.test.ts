import { describe, it, expect, beforeEach } from 'vitest';
import { hasIdToken } from '../../data/labels.ts';
import { ENDING_DIALOGUES } from '../../data/dialogue/index.ts';
import { alertToDialogue, checkAlerts, isPopupAlert } from '../alertDialogue.ts';
import { getDialogue, clearDialogues } from '../dialogue.ts';
import { createInitialState, computeScore, carryText, makeCarry, SCORE_TITLES, type Alert } from '../../sim/index.ts';

/** z-ending: 엔딩 대사와 점수 카드 문구에 영문 id가 없고, 알림 분기(대화창 vs EndingScreen)가 맞다 */
describe('z-ending UI 문구·알림 분기', () => {
  beforeEach(() => clearDialogues());

  it('엔딩 대사에 영문 id가 없다', () => {
    const d = ENDING_DIALOGUES;
    const texts = [d.ending.title, ...d.ending.lines.map((l) => l.line), ...SCORE_TITLES.map((t) => t.title)];
    expect(d.ending.lines).toHaveLength(3);
    for (const t of texts) expect(hasIdToken(t), t).toBe(false);
  });

  it('점수 카드·이월 문구', () => {
    const s = createInitialState(1, 'p', 0, 'tutorial');
    const sc = computeScore(s);
    for (const t of [sc.title, ...sc.items.map((i) => i.label)]) expect(hasIdToken(t), t).toBe(false);
    for (const t of carryText(makeCarry(s))) expect(hasIdToken(t), t).toBe(false);
  });

  it('ending은 EndingScreen(팝업 알림)이 맡고, 나머지 알림은 대화창', () => {
    expect(isPopupAlert({ type: 'ending' })).toBe(true);
    expect(isPopupAlert({ type: 'monthlyFailed', title: 'A', next: 'B' })).toBe(false);
    expect(alertToDialogue({ type: 'monthlyFailed', title: 'A', next: 'B' }).lines).toHaveLength(2);
    // checkAlerts: ending은 건너뛰고(false), 월간 실패는 대화창을 띄운다
    const s = createInitialState(1, 'p', 0, 'tutorial');
    s.alerts = [{ type: 'ending' } as Alert];
    let dismissed = 0;
    expect(checkAlerts(s, () => dismissed++)).toBe(false);
    expect(getDialogue()).toBeNull();
    s.alerts = [{ type: 'monthlyFailed', title: 'A', next: 'B' }];
    expect(checkAlerts(s, () => dismissed++)).toBe(true);
    expect(getDialogue()?.lines.length).toBe(2);
    expect(dismissed).toBe(0);
  });
});

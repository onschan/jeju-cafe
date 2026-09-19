import { describe, it, expect, beforeEach } from 'vitest';
import { hasIdToken } from '../../data/labels.ts';
import { ENDING_DIALOGUES, villageReviewLine } from '../../data/dialogue/index.ts';
import { alertToDialogue, checkAlerts, isPopupAlert } from '../alertDialogue.ts';
import { getDialogue, clearDialogues } from '../dialogue.ts';
import { createInitialState, computeScore, carryText, makeCarry, villageReview, VILLAGE_GRADE_NAME, SCORE_TITLES, type Alert } from '../../sim/index.ts';

/** z-ending: 엔딩·마을 대사와 점수 카드 문구에 영문 id가 없고, 알림 분기(대화창 vs EndingScreen)가 맞다 */
describe('z-ending UI 문구·알림 분기', () => {
  beforeEach(() => clearDialogues());

  it('엔딩·100주년·마을 대사에 영문 id가 없다', () => {
    const d = ENDING_DIALOGUES;
    const texts = [d.ending.title, d.centennial.title, d.village.title, ...d.ending.lines.map((l) => l.line), ...d.ending.chief.map((l) => l.line), ...d.centennial.success.map((l) => l.line), ...d.centennial.fail.map((l) => l.line), ...d.village.review.flatMap((r) => [r.up, r.same]), ...d.village.festivalOffer.lines, ...SCORE_TITLES.map((t) => t.title), ...VILLAGE_GRADE_NAME];
    expect(d.ending.lines).toHaveLength(3);
    expect(d.ending.chief).toHaveLength(3);
    for (const t of texts) expect(hasIdToken(t), t).toBe(false);
    for (let g = 1; g <= 5; g++) expect(villageReviewLine(g).grade).toBe(g);
  });

  it('점수 카드·이월·정착 심사 문구', () => {
    const s = createInitialState(1, 'p', 0, 'tutorial');
    const sc = computeScore(s);
    for (const t of [sc.title, ...sc.items.map((i) => i.label)]) expect(hasIdToken(t), t).toBe(false);
    for (const t of carryText(makeCarry(s))) expect(hasIdToken(t), t).toBe(false);
    for (const it of villageReview(s).items) for (const t of [it.label, it.hint]) expect(hasIdToken(t), t).toBe(false);
  });

  it('ending·100주년 성공은 EndingScreen(팝업 알림), 마을·마을제·100주년 실패는 대화창', () => {
    expect(isPopupAlert({ type: 'ending' })).toBe(true);
    expect(isPopupAlert({ type: 'centennial', success: true })).toBe(true);
    expect(isPopupAlert({ type: 'centennial', success: false })).toBe(false);
    expect(isPopupAlert({ type: 'village', grade: 2, up: true })).toBe(false);
    expect(isPopupAlert({ type: 'festivalOffer' })).toBe(false);
    const v = alertToDialogue({ type: 'village', grade: 4, up: true });
    expect(v.lines).toHaveLength(2);
    expect(v.lines[0]).toContain(VILLAGE_GRADE_NAME[4]);
    expect(alertToDialogue({ type: 'village', grade: 2, up: false }).lines[1]).toBe(villageReviewLine(2).same);
    expect(alertToDialogue({ type: 'festivalOffer' }).lines.length).toBeGreaterThan(0);
    expect(alertToDialogue({ type: 'centennial', success: false }).lines).toHaveLength(1);
    // checkAlerts: ending은 건너뛰고(false), village는 대화창을 띄운다
    const s = createInitialState(1, 'p', 0, 'tutorial');
    s.alerts = [{ type: 'ending' } as Alert];
    let dismissed = 0;
    expect(checkAlerts(s, () => dismissed++)).toBe(false);
    expect(getDialogue()).toBeNull();
    s.alerts = [{ type: 'village', grade: 2, up: true }];
    expect(checkAlerts(s, () => dismissed++)).toBe(true);
    expect(getDialogue()?.lines[1]).toBe(villageReviewLine(2).up);
    expect(dismissed).toBe(0);
  });
});

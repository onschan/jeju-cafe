import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showDialogue, getDialogue, getDialoguePage, nextPage, closeDialogue, clearDialogues, isLastPage, pageCount, pageLines, queuedCount, LINES_PER_PAGE } from '../dialogue.ts';

const halmang = { name: '할망', portrait: 'halmang' as const };

describe('dialogue queue', () => {
  beforeEach(() => clearDialogues());

  it('빈 대사는 무시하고, 첫 대화가 바로 뜬다', () => {
    showDialogue({ speaker: halmang, lines: [] });
    expect(getDialogue()).toBeNull();
    showDialogue({ speaker: halmang, lines: ['안녕'] });
    expect(getDialogue()?.lines).toEqual(['안녕']);
    expect(getDialoguePage()).toBe(0);
  });

  it('여러 개를 넣으면 순서대로 뜨고, 닫으면 다음이 온다', () => {
    showDialogue({ speaker: halmang, lines: ['1'] });
    showDialogue({ speaker: halmang, lines: ['2'] });
    showDialogue({ speaker: halmang, lines: ['3'] });
    expect(getDialogue()?.lines).toEqual(['1']);
    expect(queuedCount()).toBe(2);
    closeDialogue();
    expect(getDialogue()?.lines).toEqual(['2']);
    closeDialogue();
    expect(getDialogue()?.lines).toEqual(['3']);
    closeDialogue();
    expect(getDialogue()).toBeNull();
    expect(queuedCount()).toBe(0);
  });

  it('2줄씩 페이지를 넘기고 마지막 페이지에서는 더 안 넘어간다', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    showDialogue({ speaker: halmang, lines });
    const req = getDialogue()!;
    expect(pageCount(req)).toBe(3);
    expect(pageLines(req, 0)).toEqual(['a', 'b']);
    expect(pageLines(req, 2)).toEqual(['e']);
    expect(LINES_PER_PAGE).toBe(2);
    expect(isLastPage()).toBe(false);
    expect(nextPage()).toBe(true);
    expect(nextPage()).toBe(true);
    expect(isLastPage()).toBe(true);
    expect(nextPage()).toBe(false);
    expect(getDialoguePage()).toBe(2);
    // 닫으면 페이지가 0으로 돌아간다
    showDialogue({ speaker: halmang, lines: ['x'] });
    closeDialogue();
    expect(getDialoguePage()).toBe(0);
  });

  it('선택지를 고르면 그 콜백이 불리고 onClose도 불린다', () => {
    const yes = vi.fn();
    const no = vi.fn();
    const onClose = vi.fn();
    showDialogue({ speaker: halmang, lines: ['도와줄래?'], choices: [{ label: '네', onPick: yes }, { label: '아니요', onPick: no }], onClose });
    const req = getDialogue()!;
    closeDialogue(req.choices![0]);
    expect(yes).toHaveBeenCalledTimes(1);
    expect(no).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getDialogue()).toBeNull();
  });

  it('선택지 콜백 안에서 새 대화를 띄우면 그것이 바로 다음에 온다', () => {
    showDialogue({ speaker: halmang, lines: ['첫째'], choices: [{ label: '더', onPick: () => showDialogue({ speaker: halmang, lines: ['둘째'] }) }] });
    showDialogue({ speaker: halmang, lines: ['셋째'] });
    closeDialogue(getDialogue()!.choices![0]);
    // 콜백에서 넣은 대화는 큐 뒤에 붙는다 (현재가 비어 있는 순간이라 바로 current가 된다)
    expect(getDialogue()?.lines).toEqual(['둘째']);
    closeDialogue();
    expect(getDialogue()?.lines).toEqual(['셋째']);
  });

  it('clearDialogues는 큐까지 비운다', () => {
    showDialogue({ speaker: halmang, lines: ['1'] });
    showDialogue({ speaker: halmang, lines: ['2'] });
    clearDialogues();
    expect(getDialogue()).toBeNull();
    expect(queuedCount()).toBe(0);
  });
});

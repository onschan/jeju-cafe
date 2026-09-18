import { describe, it, expect, beforeEach } from 'vitest';
import { BIG_EVENTS, GOALS } from '../../data/index.ts';
import { eventDialogue } from '../../data/dialogue/index.ts';
import { hasIdToken } from '../../data/labels.ts';
import { EVENT_TEXT_ID, eventStartDialogue, eventEndDialogue } from '../eventText.ts';
import { alertToDialogue, checkAlerts } from '../alertDialogue.ts';
import { getDialogue, closeDialogue, clearDialogues, queuedCount } from '../dialogue.ts';
import { createInitialState, apply } from '../../sim/index.ts';

describe('eventText: sim 이벤트 ↔ 대화 데이터 연결', () => {
  it('매핑 표의 대상 id는 전부 dialogue/events.json에 있다', () => {
    for (const [a, b] of Object.entries(EVENT_TEXT_ID)) {
      if (a === b) continue; // 같은 id면 B에 없어도 A의 dialogue로 폴백
      expect(eventDialogue(b), `${a} → ${b}`).toBeDefined();
    }
  });
  it('모든 빅 이벤트가 시작·종료 대사를 가지며 영문 id가 새지 않는다', () => {
    for (const e of BIG_EVENTS) {
      const start = eventStartDialogue(e.id);
      const end = eventEndDialogue(e.id);
      expect(start.lines.length).toBeGreaterThanOrEqual(2);
      expect(end.lines).toHaveLength(1);
      for (const l of [...start.lines, ...end.lines, start.speaker.name]) expect(hasIdToken(l), `${e.id}: ${l}`).toBe(false);
    }
  });
});

describe('alertDialogue: state.alerts → 대화창', () => {
  beforeEach(() => clearDialogues());

  it('목표 알림은 제목·축하 대사·보상 줄로 뜬다', () => {
    const g = GOALS[0]!;
    const d = alertToDialogue({ type: 'goal', goalId: g.id });
    expect(d.lines[0]).toContain(g.title);
    expect(d.lines[1]).toMatch(/^보상: /);
    for (const l of d.lines) expect(hasIdToken(l)).toBe(false);
  });

  it('여러 알림은 순서대로 하나씩 뜨고, 닫으면 dismissAlert로 빠진다', () => {
    const s = createInitialState(1, 'p', 0);
    const dismiss = () => apply(s, { type: 'dismissAlert' });
    s.alerts.push({ type: 'goal', goalId: 'g01' }, { type: 'event', id: BIG_EVENTS[0]!.id }, { type: 'eventEnd', id: BIG_EVENTS[0]!.id });
    expect(checkAlerts(s, dismiss)).toBe(true);
    expect(getDialogue()?.lines[0]).toContain(GOALS[0]!.title);
    // 같은 알림은 다시 띄우지 않는다
    expect(checkAlerts(s, dismiss)).toBe(false);
    expect(queuedCount()).toBe(0);
    closeDialogue();
    expect(s.alerts).toHaveLength(2);
    expect(checkAlerts(s, dismiss)).toBe(true);
    expect(getDialogue()?.lines[0]).toContain('【');
    closeDialogue();
    expect(checkAlerts(s, dismiss)).toBe(true);
    closeDialogue();
    expect(s.alerts).toHaveLength(0);
    expect(checkAlerts(s, dismiss)).toBe(false);
    expect(getDialogue()).toBeNull();
  });
});

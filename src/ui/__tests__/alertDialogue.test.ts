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

describe('alertDialogue: 보상 상자·도전 실패·실패 상태 알림', () => {
  beforeEach(() => clearDialogues());
  it('맨 앞이 { type: "reward" }면 대화창은 기다리고(RewardPopup 몫) false, 뒤의 goal 알림은 보상 상자가 닫힌 뒤 이어진다', () => {
    const s = createInitialState(1, 'p', 0);
    const dismiss = () => apply(s, { type: 'dismissAlert' });
    s.alerts.push({ type: 'reward', source: 'goal', refId: 'g01', title: GOALS[0]!.title, items: [{ type: 'money', amount: 300_000 }] }, { type: 'goal', goalId: 'g01' });
    expect(checkAlerts(s, dismiss)).toBe(false);
    expect(getDialogue()).toBeNull();
    dismiss(); // RewardPopup이 닫히면
    expect(checkAlerts(s, dismiss)).toBe(true);
    expect(getDialogue()?.lines[0]).toContain(GOALS[0]!.title);
  });
  it('도전·월간 보상 알림의 축하 대사(line)는 alertToDialogue로 뽑히고, 도전 실패·실패 상태 4단계 대사는 영문 id가 없다', () => {
    const d = alertToDialogue({ type: 'reward', source: 'challenge', refId: 'c01', title: '자리 4개', items: [], line: '도전 성공!', speaker: 'samchun' });
    expect(d.lines).toEqual(['도전 성공!']);
    expect(d.speaker.name).toBe('삼춘');
    expect(alertToDialogue({ type: 'reward', source: 'tutorial', refId: '1', title: '1', items: [] }).lines).toEqual([]);
    const f = alertToDialogue({ type: 'challengeFailed', id: 'c01' });
    expect(f.lines[0]).toContain('기한');
    for (const stage of ['warn', 'loan', 'crisis', 'demote'] as const) {
      const x = alertToDialogue({ type: 'failure', stage });
      expect(x.lines.length).toBeGreaterThanOrEqual(3);
      for (const l of x.lines) expect(hasIdToken(l), l).toBe(false);
    }
  });
});

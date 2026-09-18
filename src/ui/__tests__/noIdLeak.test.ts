import { describe, it, expect } from 'vitest';
import { createInitialState, goalConditionText, goalRewardText, checkFeature, FEATURE_OF_ACTION, type Action } from '../../sim/index.ts';
import { GOALS, OBJECTS, MENUS, BIG_EVENTS, ROLES } from '../../data/index.ts';
import { hasIdToken, unlockText } from '../../data/labels.ts';
import { lockedText } from '../windows/BuildWindow.tsx';
import { toGoal, currentGoal, pastGoals } from '../simBridge';
import { alertToDialogue } from '../alertDialogue.ts';
import { TUTORIAL_STEPS } from '../tutorialDialogue';

/** 스펙 §7-4: 어떤 화면에도 영문 id가 보이지 않는다. 창·카드·대화가 그리는 문자열을 sim·데이터에서 뽑아 훑는다. */
function expectClean(texts: string[], where: string) {
  const bad = texts.filter((t) => hasIdToken(t));
  expect(bad, `${where}: ${bad.slice(0, 5).join(' | ')}`).toEqual([]);
}

describe('영문 id 노출 없음 (창·카드·대화)', () => {
  const s = createInitialState(1, 'p', 0);

  it('목표 창: 60개 제목·설명·조건·보상', () => {
    expectClean(GOALS.flatMap((g) => [g.title, g.desc, goalConditionText(g.condition), ...g.reward.map(goalRewardText), g.line ?? '']), '목표');
    expectClean(GOALS.flatMap((g) => { const x = toGoal(s, g, false); return [x.title, x.desc, x.rewardText]; }), 'toGoal');
    const cur = currentGoal(s);
    expect(cur).not.toBeNull();
    expectClean([cur!.title, cur!.desc, cur!.rewardText, ...pastGoals(s).map((g) => g.title)], 'currentGoal');
  });

  it('짓기 창: 모든 시설의 이름·설명·잠김 문구', () => {
    expectClean(OBJECTS.flatMap((o) => [o.name, o.desc ?? '', o.effectText ?? '', lockedText(o), unlockText(o)]), '짓기');
  });

  it('메뉴판: 이름·재료·직종', () => {
    expectClean(MENUS.map((m) => m.name), '메뉴');
    expectClean(ROLES.map((r) => r.name), '직종');
  });

  it('잠긴 기능 토스트: 어느 목표에서 열리는지 한글로', () => {
    for (const type of Object.keys(FEATURE_OF_ACTION) as Action['type'][]) {
      const r = checkFeature(s, type);
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/목표 「[^」]+」[을를] 이루면 열려요/);
      expectClean([r.reason ?? ''], type);
    }
  });

  it('대화창: 목표 달성·이벤트 시작·끝·튜토리얼', () => {
    expectClean(GOALS.flatMap((g) => { const d = alertToDialogue({ type: 'goal', goalId: g.id }); return [d.speaker.name, ...d.lines]; }), '목표 대화');
    expectClean(BIG_EVENTS.flatMap((e) => [...alertToDialogue({ type: 'event', id: e.id }).lines, ...alertToDialogue({ type: 'eventEnd', id: e.id }).lines]), '이벤트 대화');
    expectClean(TUTORIAL_STEPS.flatMap((t) => [t.title, t.button, ...t.lines]), '튜토리얼');
  });
});

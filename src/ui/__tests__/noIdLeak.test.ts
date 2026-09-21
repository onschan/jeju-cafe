import { describe, it, expect } from 'vitest';
import { createInitialState, goalConditionText, goalRewardText, checkFeature, FEATURE_OF_ACTION, openingBuild, nextMove, type Action } from '../../sim/index.ts';
import { apply } from '../../sim/actions.ts';
import { GOALS, OBJECTS, MENUS, BIG_EVENTS, ROLES, SPOTS, MILEAGE_SHOP, TICKET_SHOP, GIFTS, SPECIAL_ITEM_IDS, SPECIAL_ITEM_EFFECT, itemDef } from '../../data/index.ts';
import { spotRequirements, VISITOR_PRIZES } from '../../sim/index.ts';
import { hasIdToken, unlockText } from '../../data/labels.ts';
import { lockedText } from '../windows/BuildWindow.tsx';
import { toGoal, currentGoal, pastGoals } from '../simBridge';
import { alertToDialogue } from '../alertDialogue.ts';
import { TUTORIAL_DIALOGUES as TUTORIAL_STEPS, fillTutorialStep } from '../tutorialDialogue';

/** 스펙 §7-4: 어떤 화면에도 영문 id가 보이지 않는다. 창·카드·대화가 그리는 문자열을 sim·데이터에서 뽑아 훑는다. */
function expectClean(texts: string[], where: string) {
  const bad = texts.filter((t) => hasIdToken(t));
  expect(bad, `${where}: ${bad.slice(0, 5).join(' | ')}`).toEqual([]);
}

describe('영문 id 노출 없음 (창·카드·대화)', () => {
  const s = createInitialState(1, 'p', 0, 'tutorial'); // 빈 마당(기능 전부 잠김) — 완성 시작 상태는 튜토리얼 보상 기능이 열려 있다

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

  it('투자 창·상점·도감: 명소 이름·조건·Lv5 특수·상품, 상점 상품명·설명, 특수 아이템·선물 (트랙 C)', () => {
    expectClean(SPOTS.flatMap((d) => [d.name, d.categoryName, d.lv5Special?.text ?? '', ...spotRequirements(s, d.id).map((r) => r.text)]), '명소');
    expectClean(VISITOR_PRIZES.map((p) => p.text), '방문객 상품');
    expectClean([...MILEAGE_SHOP, ...TICKET_SHOP].flatMap((m) => [m.name, m.description]), '상점');
    expectClean(GIFTS.flatMap((g) => [g.name, g.sourceText]), '선물');
    expectClean(SPECIAL_ITEM_IDS.flatMap((id) => [itemDef(id).name, itemDef(id).sourceText, SPECIAL_ITEM_EFFECT[id] ?? '']), '특수 아이템');
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

  it('공략 노트(pro-guide): 월별 정석 표·지금 추천 행동·토큰을 채운 튜토리얼 대사', () => {
    expectClean(openingBuild().flatMap((r) => [r.title, r.what, r.why]), '정석 빌드 표');
    const texts: string[] = [];
    const t = createInitialState(1, 'p', 0, 'tutorial');
    for (let i = 0; i < 6; i++) { const m = nextMove(t); if (!m) break; texts.push(m.text); if (m.cells[0] && !Object.values(t.objects).some((o) => o.type === 'warehouse')) apply(t, { type: 'placeMain', ...m.cells[0] }); else break; }
    texts.push(...TUTORIAL_STEPS.flatMap((st) => { const f = fillTutorialStep(st, t); return [f.title, ...f.lines]; }));
    expectClean(texts, '추천 행동·채운 대사');
    const starter = createInitialState(1);
    const sm = nextMove(starter);
    if (sm) expectClean([sm.text], '완성 시작 상태 추천 행동');
  });
});

import { describe, it, test, expect } from 'vitest';
import { MENUS, OBJECTS, INGREDIENTS, GUEST_TYPES, QUESTS, ITEMS, SPOTS, ROLES, SKILLS, PROMOTIONS, FACILITIES } from '../../data/index.ts';
import { label, hasIdToken, requireText, ingredientsText, unlockText, unlockCondText, conditionText, rewardText, humanize, ifClause, wonText } from '../../data/labels.ts';
import { TUTORIAL_STEPS, GOAL_LINES, EVENT_DIALOGUES, SAMCHUN, goalLine, eventDialogue, samchunDef } from '../../data/dialogue/index.ts';
import { createInitialState, strategyVars, fillTemplate } from '../../sim/index.ts';

const ID_ONLY = /^[a-z0-9_]+$/;

describe('label(kind, id)', () => {
  it('메뉴·시설·재료·손님·부탁·아이템·관광지·직종·스킬·홍보 전부 한글 이름을 찾는다', () => {
    const cases: [Parameters<typeof label>[0], { id: string }[]][] = [
      ['menu', MENUS], ['facility', OBJECTS], ['ingredient', INGREDIENTS], ['guest', GUEST_TYPES], ['quest', QUESTS],
      ['item', ITEMS], ['spot', SPOTS], ['role', ROLES], ['skill', SKILLS], ['promotion', PROMOTIONS],
    ];
    for (const [kind, xs] of cases) {
      expect(xs.length).toBeGreaterThan(0);
      for (const x of xs) {
        const l = label(kind, x.id);
        expect(l, `${kind}:${x.id}`).not.toMatch(ID_ONLY);
        expect(hasIdToken(l), `${kind}:${x.id} → ${l}`).toBe(false);
      }
    }
  });

  it('스탯·분류도 한글', () => {
    expect(label('stat', 'stamina')).toBe('체력');
    expect(label('stat', 'smile')).toBe('미소');
    expect(label('stat', 'taste')).toBe('맛');
    expect(label('category', 'drink')).toBe('음료');
    expect(label('category', 'rest')).toBe('쉼');
    expect(label('category', 'coffee')).toBe('커피');
  });

  it('구 손님 id(local·tourist)도 새 이름으로', () => {
    expect(label('guest', 'local')).toBe(label('guest', 'local_auntie'));
    expect(label('guest', 'tourist')).toBe(label('guest', 'student'));
  });

  it('종류가 틀려도 다른 표에서 찾고, 모르는 id는 읽을 수 있는 형태로 폴백한다 (? 아님)', () => {
    expect(label('item', 'americano')).toBe('아메리카노');
    expect(label('menu', 'no_such_thing_xyz')).toBe('no such thing xyz');
    expect(label('quest', 'q_nobody')).toBe('nobody');
    expect(humanize('감귤')).toBe('감귤');
  });
});

describe('메뉴 문구', () => {
  it('재료·직원 조건이 한글', () => {
    const latte = MENUS.find((m) => m.id === 'latte')!;
    expect(ingredientsText(latte)).toBe('원두 1 · 우유 1');
    expect(requireText(latte)).toBe('바리스타 필요');
    expect(requireText(MENUS.find((m) => m.id === 'americano')!)).toBeNull();
    for (const m of MENUS) expect(hasIdToken(ingredientsText(m))).toBe(false);
  });
});

describe('해금 문구', () => {
  it('v2 시설 109종 전부 영문 id 없이 문장이 된다', () => {
    for (const f of FACILITIES) {
      const t = unlockText(f);
      expect(hasIdToken(t), `${f.id}: ${t}`).toBe(false);
      expect(t, `${f.id}: ${t}`).toMatch(/(열려요|있어요|없어요)$/);
    }
  });
  it('조건 종류별 문장', () => {
    expect(unlockText({ unlock: { type: 'rank', rank: 2 } })).toBe('카페가 더 알려지면 열려요'); // 랭크 숫자는 안 보여 준다
    expect(unlockText({ unlockText: '랭크 3' })).toBe('카페가 더 알려지면 열려요');
    expect(unlockText({ unlock: { type: 'star', star: 3 } })).toBe('★3이면 열려요');
    expect(unlockText({ unlock: { type: 'count', objectId: 'table_out', count: 2 } })).toBe('테이블 2개면 열려요');
    expect(unlockText({ unlock: { type: 'segmentPop', guestId: 'olle_walker', popularity: 30 } })).toContain('손님 인지도 30');
    expect(unlockText({ unlock: { type: 'start' } })).toBe('처음부터 열려 있어요');
    expect(unlockText({})).toBe('목표를 이루면 열려요');
    expect(unlockCondText({ type: 'all', conditions: [] })).toBe('아직 열 수 없음');
    expect(ifClause('완료')).toBe('완료면');
    expect(ifClause('월')).toBe('월이면');
  });
});

describe('부탁·목표 조건/보상', () => {
  it('quests.json 103개의 조건·보상을 다시 만들면 영문 id 토큰이 없다', () => {
    for (const q of QUESTS) {
      const c = conditionText(q.condition);
      const r = rewardText(q.rewards);
      expect(hasIdToken(c), `${q.id} cond: ${c}`).toBe(false);
      expect(hasIdToken(r), `${q.id} reward: ${r}`).toBe(false);
      expect(c).not.toMatch(ID_ONLY);
    }
  });
  it('부탁 조건 예시', () => {
    expect(conditionText({ type: 'menuSold', params: { menuId: 'americano', count: 20 } })).toBe('아메리카노 20잔 팔기');
    expect(conditionText({ type: 'objectPlaced', params: { objectId: 'flower_bed', count: 1 } })).toBe('꽃밭 1개 놓기');
    expect(rewardText([{ type: 'item', itemId: 'honey' }])).toBe(label('item', 'honey'));
    expect(rewardText([{ type: 'money', amount: 200000 }, { type: 'research', amount: 20 }])).toBe('₩200,000 · 연구 20');
    expect(rewardText([])).toBe('없음');
  });
  it('목표(스펙 §2) 조건·보상 스키마', () => {
    expect(conditionText({ type: 'guests', n: 5 })).toBe('손님 5명 맞이하기');
    expect(conditionText({ type: 'menuSold', params: { menuId: 'tangerine_juice', count: 10 } })).toBe('감귤주스 10잔 팔기');
    expect(conditionText({ type: 'money', n: 7_000_000 })).toBe('자금 ₩7,000,000 모으기');
    expect(conditionText({ type: 'facilities', cat: 'rest', n: 5 })).toBe('쉼 시설 5개 짓기');
    expect(conditionText({ type: 'facilities', n: 5 })).toBe('시설 5개 짓기');
    expect(conditionText({ type: 'rank', n: 8 })).toBe('랭크 8위 오르기');
    expect(conditionText({ type: 'custom', id: 'first_promo', text: '홍보 1회 하기' })).toBe('홍보 1회 하기');
    expect(rewardText([{ type: 'unlockFacility', id: 'stonewall' }])).toBe('돌담 해금');
    expect(rewardText([{ type: 'unlockMenu', id: 'tangerine_juice' }])).toBe('감귤주스 해금');
    expect(rewardText([{ type: 'tickets', amount: 1 }, { type: 'builder', amount: 1 }, { type: 'staffSlot', amount: 1 }])).toBe('응모권 1장 · 건축가 +1 · 직원 자리 +1');
    expect(hasIdToken(conditionText({ type: 'whatever_new', n: 1 }))).toBe(false);
  });
});

describe('대화 데이터 (src/data/dialogue)', () => {
  const SPEAKERS = new Set(['halmang', 'samchun', 'hero', 'haenyeo', 'jangnim']);
  const BANNED = /술|맥주|소주|막걸리|와인|칵테일|\{[a-z]+\}|이\(가\)|을\(를\)|은\(는\)/;
  // pro-guide: 튜토리얼 대사의 {seatScore} 같은 토큰은 표시 때 strategyVars로 채워지므로 채운 뒤 검사한다 (안 채워진 {템플릿}은 BANNED에 걸린다)
  const VARS = strategyVars(createInitialState(1, 'local', 0, 'tutorial'));
  const allTexts = (): string[] => [
    ...TUTORIAL_STEPS.flatMap((t) => [t.title, ...t.lines, ...(t.linesIfNoWhy ?? []), t.button, t.done ?? ''].map((l) => fillTemplate(l, VARS))),
    ...GOAL_LINES.map((g) => g.line),
    ...EVENT_DIALOGUES.flatMap((e) => [e.title, ...e.lines, e.endLine]),
    ...SAMCHUN.flatMap((s) => [s.name, s.job, s.intro, s.rewardText, ...s.chain.flatMap((c) => [c.ask, ...c.lines, c.doneLine])]),
  ];

  it('튜토리얼 1막 5단계, 단계당 2~3줄·한 줄 ≤ 22자, 화자는 전부 할망, 단계마다 done 조건 문구와 막 번호', () => {
    expect(TUTORIAL_STEPS.map((t) => t.id)).toEqual(Array.from({ length: 5 }, (_, i) => i + 1));
    expect([...new Set(TUTORIAL_STEPS.map((t) => t.act))]).toEqual([1]);
    for (const t of TUTORIAL_STEPS) {
      expect(t.lines.length).toBeGreaterThanOrEqual(2);
      expect(t.lines.length).toBeLessThanOrEqual(3);
      for (const l of [...t.lines, ...(t.linesIfNoWhy ?? [])]) expect(fillTemplate(l, VARS).length, l).toBeLessThanOrEqual(22);
      expect(t.speaker).toBe('halmang');
      expect(t.button.length).toBeGreaterThan(0);
      expect(t.done).not.toBeNull();
    }
  });
  it('목표 축하 대사 60개 g01~g60, 화자 로테이션, 순서·id 둘 다로 찾는다', () => {
    expect(GOAL_LINES).toHaveLength(60);
    expect(GOAL_LINES.map((g) => g.id)).toEqual(Array.from({ length: 60 }, (_, i) => `g${String(i + 1).padStart(2, '0')}`));
    expect(new Set(GOAL_LINES.map((g) => g.speaker)).size).toBeGreaterThanOrEqual(3);
    expect(goalLine('g07').line).toBe(GOAL_LINES[6]!.line);
    expect(goalLine(6).line).toBe(GOAL_LINES[6]!.line);
    expect(goalLine('goal_12').line).toBe(GOAL_LINES[11]!.line);
    expect(goalLine(60).line).toBe(GOAL_LINES[0]!.line);
  });
  it('사건 대화: 요청된 26가지 소재가 다 있고 3~5줄', () => {
    const ids = EVENT_DIALOGUES.map((e) => e.id);
    for (const id of ['ev_baekjungwon_shoot', 'ev_yori_minbak', 'ev_yuai_guest', 'ev_visa_free', 'ev_dondon_waiting', 'ev_tangerine_fest', 'ev_canola', 'ev_typhoon', 'ev_snow', 'ev_cherry', 'ev_olle_walk_fest', 'ev_haenyeo_fest', 'ev_cruise', 'ev_flight_sale', 'ev_school_trip', 'ev_drama_rumor', 'ev_influencer', 'ev_workation', 'ev_golf', 'ev_marathon', 'ev_ev_fest', 'ev_peanut_icecream', 'ev_black_pork_fest', 'ev_sea_fog']) {
      expect(ids, id).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EVENT_DIALOGUES) {
      expect(e.lines.length, e.id).toBeGreaterThanOrEqual(3);
      expect(e.lines.length, e.id).toBeLessThanOrEqual(5);
      expect(e.endLine.length).toBeGreaterThan(0);
      expect(eventDialogue(e.id)).toBe(e);
    }
  });
  it('삼춘 6명, 각 6단계 체인 + 보상 문구', () => {
    expect(SAMCHUN).toHaveLength(6);
    for (const s of SAMCHUN) {
      expect(s.chain.map((c) => c.step)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(s.rewardText.length).toBeGreaterThan(0);
      expect(samchunDef(s.id)).toBe(s);
    }
  });
  it('모든 대사: 화자 키가 초상과 맞고, 영문 id·조사 병기·{name} 템플릿·술 언급이 없다', () => {
    for (const sp of [...TUTORIAL_STEPS, ...GOAL_LINES, ...EVENT_DIALOGUES].map((x) => x.speaker)) expect(SPEAKERS.has(sp), sp).toBe(true);
    for (const s of SAMCHUN) expect(SPEAKERS.has(s.portrait), s.portrait).toBe(true);
    for (const t of allTexts()) {
      expect(hasIdToken(t), t).toBe(false);
      expect(t, t).not.toMatch(BANNED);
    }
  });
});

describe('hasIdToken', () => {
  it('영문 id 토큰 판정', () => {
    expect(hasIdToken('손님 olle_walker 인기 30')).toBe(true);
    expect(hasIdToken('americano')).toBe(true);
    expect(hasIdToken('아이템 honey')).toBe(false); // 밑줄 없는 단어 하나는 id로 보지 않는다 (SNS·LP판 같은 표기 허용)
    expect(hasIdToken('감귤주스 10잔 팔기')).toBe(false);
  });
});

describe('wonText (UX §5.4 돈 표기 단일화)', () => {
  test('카드·목록: 천 단위 구분, 음수는 −₩', () => {
    expect(wonText(1_240_000)).toBe('₩1,240,000');
    expect(wonText(-3_500)).toBe('−₩3,500');
    expect(wonText(0)).toBe('₩0');
  });
  test('short: 1만 이상 만 단위 내림, 1억 이상 억', () => {
    expect(wonText(1_240_000, true)).toBe('₩124만');
    expect(wonText(9_900, true)).toBe('₩9,900');
    expect(wonText(123_456_789, true)).toBe('₩1.2억');
    expect(wonText(-20_000, true)).toBe('−₩2만');
  });
});

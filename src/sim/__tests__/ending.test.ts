import { bareState } from './helpers.ts';
import { createInitialState, START_ORIGIN } from '../state.ts';
import { apply } from '../actions.ts';
import { tick, step } from '../tick.ts';
import { serialize, deserialize } from '../save.ts';
import { DAY_MS } from '../clock.ts';
import { objectAt } from '../grid.ts';
import {
  computeScore, scoreTier, endingDue, endingMonthly, makeCarry, applyCarry, carryText, carryDolhareubangCells, centennialMonthly, centennialConditions, canSetSpeed,
  SCORE_TITLES, SCORE_ITEMS, CHIEF_BONUS, CHIEF_PREFIX, ENDING_YEAR, ENDING_MONTH, CENTENNIAL_YEAR, CENTENNIAL_MONTH, MILLENNIUM_TREE, CARRY_RATIO, FAST_SPEED,
} from '../ending.ts';

/** 10년차 3월 1일 직전(2월 30일 23시)으로 시계를 맞춘다 */
function beforeEnding(s: ReturnType<typeof bareState>) {
  s.clock.year = ENDING_YEAR; s.clock.month = ENDING_MONTH - 1; s.clock.day = 30; s.clock.hour = 23; s.clock.accMs = 0;
}

describe('최종 점수', () => {
  test('항목 9·가중치·상한·칭호 5단계', () => {
    const s = bareState(1);
    s.money = 50_000_000; s.totalGuests = 12_345; s.star = 3; s.rank = 6; s.reputation = 70; s.goals.claimed = Array.from({ length: 60 }, (_, i) => `g${i}`);
    s.codex.combos = ['a', 'b', 'c']; s.spots = { x: 5, y: 3 };
    const sc = computeScore(s);
    expect(sc.items.map((i) => i.key)).toEqual(SCORE_ITEMS.map((i) => i.key));
    const pt = Object.fromEntries(sc.items.map((i) => [i.key, i.points]));
    expect(pt).toMatchObject({ money: 50, guests: 123, star: 60, rank: 60, reputation: 35, goals: 60, combos: 3, spots: 4, regulars: 0 });
    expect(sc.total).toBe(50 + 123 + 60 + 60 + 35 + 60 + 3 + 4);
    expect(sc.tier).toBe(scoreTier(sc.total));
    expect(sc.title).toBe(SCORE_TITLES[sc.tier - 1]!.title);
    // 상한: 자금 3억 → 300점, 그 이상도 300
    s.money = 9_000_000_000;
    expect(computeScore(s).items.find((i) => i.key === 'money')!.points).toBe(300);
    // 칭호 문턱
    expect(scoreTier(0)).toBe(1); expect(scoreTier(199)).toBe(1); expect(scoreTier(200)).toBe(2); expect(scoreTier(800)).toBe(5);
    expect(SCORE_TITLES[0]!.title).toBe('올레길 커피 노점'); expect(SCORE_TITLES[4]!.title).toBe('제주의 전설 카페');
  });

  test('촌장 후보(정착 등급 5)면 보너스 + 칭호 접두', () => {
    const s = bareState(1);
    const base = computeScore(s).total;
    s.village.grade = 5;
    const sc = computeScore(s);
    expect(sc.total).toBe(base + CHIEF_BONUS);
    expect(sc.title.startsWith(CHIEF_PREFIX)).toBe(true);
  });
});

describe('10년차 엔딩', () => {
  test('10년차 3월 1일 결산 카드 뒤 alerts에 ending 1회, 점수 저장, 그 뒤로도 게임은 이어진다', () => {
    const s = bareState(2);
    expect(endingDue(s)).toBe(false);
    beforeEnding(s);
    expect(s.ending.reached).toBe(false);
    tick(s, 2000 * 2); // 2월 30일 23시 → 3월 1일 6시
    expect(s.clock.year).toBe(ENDING_YEAR); expect(s.clock.month).toBe(ENDING_MONTH); expect(s.clock.day).toBe(1);
    expect(s.lastMonthCard).not.toBeNull(); // 결산 카드가 먼저
    expect(s.ending.reached).toBe(true);
    expect(s.ending.score).not.toBeNull();
    expect(s.alerts.filter((a) => a.type === 'ending')).toHaveLength(1);
    // 다시 월초 훅이 돌아도 두 번 안 뜬다
    endingMonthly(s);
    expect(s.alerts.filter((a) => a.type === 'ending')).toHaveLength(1);
    // 계속하기 → 빠른 모드
    expect(canSetSpeed(s, FAST_SPEED).ok).toBe(false);
    expect(apply(s, { type: 'setSpeed', speed: 4 }).ok).toBe(false);
    while (s.alerts.length && s.alerts[0]!.type !== 'ending') apply(s, { type: 'dismissAlert' });
    expect(apply(s, { type: 'continueEnding' }).ok).toBe(true);
    expect(s.ending.continued).toBe(true); expect(s.ending.fastMode).toBe(true);
    expect(apply(s, { type: 'setSpeed', speed: 4 }).ok).toBe(true);
    expect(s.clock.speed).toBe(4);
    expect(apply(s, { type: 'continueEnding' }).ok).toBe(false); // 엔딩 알림이 없으면 거부
    // 게임은 계속 (한 달 더)
    s.clock.speed = 1;
    for (let d = 0; d < 31; d++) tick(s, DAY_MS);
    expect(s.clock.month).toBe(ENDING_MONTH + 1);
  });

  test('저장 왕복: ending·village·carry 유지, v18 세이브(필드 없음)는 backfill', () => {
    const s = bareState(3);
    beforeEnding(s);
    tick(s, 4000);
    const back = deserialize(serialize(s));
    expect(back.ending).toEqual(s.ending);
    expect(back.village).toEqual(s.village);
    const obj = JSON.parse(serialize(bareState(3))) as Record<string, unknown>;
    delete obj.ending; delete obj.village; delete obj.carry;
    const old = deserialize(JSON.stringify(obj));
    expect(old.ending).toEqual({ reached: false, score: null, continued: false, fastMode: false, centennial: 'none' });
    expect(old.village.grade).toBe(1);
    expect(old.carry).toBeNull();
  });

  test('결정성: 같은 seed로 엔딩까지 돌리면 점수가 같다', () => {
    const run = () => { const s = bareState(5); beforeEnding(s); for (let i = 0; i < 40; i++) step(s); return s; };
    const a = run(), b = run();
    expect(a.ending.score).toEqual(b.ending.score);
    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('이월', () => {
  test('makeCarry: 콤보 도감·명소 Lv·유니폼·돌하르방(최대 2)·마일리지 20%·손님 인기 20%', () => {
    const s = bareState(4);
    s.codex.combos = ['cb1', 'cb2']; s.spots = { a: 3, b: 0 }; s.uniforms = ['uf_galot']; s.mileage = 57; s.segmentPopularity = { student: 40, local_auntie: 7, x: 0 };
    s.unlocked.objects.push('dolhareubang'); s.builders = 3; // 동시 건설 3
    for (const [x, y] of [[3, 4], [5, 4], [5, 5]] as const) expect(apply(s, { type: 'place', objectType: 'dolhareubang', x: START_ORIGIN.x + x, y: START_ORIGIN.y + y }).ok).toBe(true); // 시작 좌석 자리(빈 마당)
    const c = makeCarry(s);
    expect(c.combos).toEqual(['cb1', 'cb2']);
    expect(c.spots).toEqual({ a: 3 });
    expect(c.uniforms).toEqual(['uf_galot']);
    expect(c.dolhareubang).toBe(2);
    expect(c.mileage).toBe(Math.floor(57 * CARRY_RATIO));
    expect(c.guestPopularity).toEqual({ student: 8, local_auntie: 1 });
    expect(c.millennium).toBe(false);
    expect(carryText(c).length).toBeGreaterThanOrEqual(6);
  });

  test('createInitialState(carry): 새 게임에 적용 — 돌하르방은 정낭 양옆, 튜토리얼 빈 마당에도', () => {
    const s0 = bareState(4);
    s0.codex.combos = ['cb1']; s0.spots = { a: 2 }; s0.uniforms = ['uf_galot']; s0.mileage = 100; s0.segmentPopularity = { student: 50 };
    s0.unlocked.objects.push('dolhareubang');
    expect(apply(s0, { type: 'place', objectType: 'dolhareubang', x: START_ORIGIN.x + 3, y: START_ORIGIN.y + 4 }).ok).toBe(true);
    s0.ending.centennial = 'done';
    const carry = makeCarry(s0);
    const s = createInitialState(7, 'local', 0, 'tutorial', carry);
    expect(s.carry).toEqual(carry);
    expect(s.codex.combos).toContain('cb1');
    expect(s.spots.a).toBe(2);
    expect(s.uniforms).toContain('uf_galot');
    expect(s.mileage).toBe(createInitialState(7, 'local', 0, 'tutorial').mileage + 20);
    expect(s.segmentPopularity.student).toBeGreaterThanOrEqual(10);
    expect(s.unlocked.objects).toContain('dolhareubang');
    expect(s.unlocked.objects).toContain(MILLENNIUM_TREE);
    expect(objectAt(s, START_ORIGIN.x + 3, START_ORIGIN.y + 6)?.type).toBe('dolhareubang');
    expect(objectAt(s, START_ORIGIN.x + 5, START_ORIGIN.y + 6)).toBeNull();
    // w-free: 정낭이 없으면 문 앞 양옆, 본관도 없으면 기본 좌표
    expect(carryDolhareubangCells(s)).toEqual([{ x: START_ORIGIN.x + 3, y: START_ORIGIN.y + 6 }, { x: START_ORIGIN.x + 5, y: START_ORIGIN.y + 6 }]);
    expect(Object.values(s.objects).some((o) => o.type === 'gate')).toBe(false); // fun-start: 새 게임 시작 맵엔 정낭이 없다
    const b = createInitialState(7, 'local', 0, 'bare', carry); // 옛 맨땅: 정낭 있음·본관 없음
    const gate = Object.values(b.objects).find((o) => o.type === 'gate')!;
    apply(b, { type: 'remove', objectId: gate.id });
    expect(carryDolhareubangCells(b)).toEqual([{ x: START_ORIGIN.x + 3, y: START_ORIGIN.y + 6 }, { x: START_ORIGIN.x + 5, y: START_ORIGIN.y + 6 }]); // 본관 없음 → 기본 좌표
    apply(b, { type: 'placeMain', x: START_ORIGIN.x + 3, y: START_ORIGIN.y + 1 });
    expect(carryDolhareubangCells(b)).toEqual([{ x: START_ORIGIN.x + 3, y: START_ORIGIN.y + 6 }, { x: START_ORIGIN.x + 5, y: START_ORIGIN.y + 6 }]); // 마을 어귀가 비어 있으면 거기
    expect(apply(b, { type: 'place', objectType: 'table_out', x: START_ORIGIN.x + 5, y: START_ORIGIN.y + 6 }).ok).toBe(true); // (3,6)엔 이월 돌하르방이 이미 있다
    expect(carryDolhareubangCells(b)).toEqual([{ x: START_ORIGIN.x + 2, y: START_ORIGIN.y + 3 }, { x: START_ORIGIN.x + 4, y: START_ORIGIN.y + 3 }]); // 막히면 문 앞 (3,3) 양옆
    // 이월 없는 새 게임은 그대로
    const plain = createInitialState(7, 'local', 0, 'tutorial');
    expect(plain.carry).toBeNull();
    expect(plain.unlocked.objects).not.toContain(MILLENNIUM_TREE);
    // 두 번 적용해도 중복 없음
    applyCarry(s, carry);
    expect(s.codex.combos.filter((c) => c === 'cb1')).toHaveLength(1);
  });
});

describe('100주년 감귤축제', () => {
  test('계속하기 뒤 20년차 11월 1회: 조건(★5·가이드북 1위·평판 80) 충족이면 천년 팽나무 해금 + 알림', () => {
    const s = bareState(6);
    s.ending.continued = true;
    s.clock.year = CENTENNIAL_YEAR; s.clock.month = CENTENNIAL_MONTH;
    s.star = 5; s.reputation = 85;
    expect(centennialConditions(s)).toEqual({ star: true, rank: false, reputation: true });
    centennialMonthly(s);
    expect(s.ending.centennial).toBe('failed');
    expect(s.alerts.at(-1)).toEqual({ type: 'centennial', success: false });
    expect(s.unlocked.objects).not.toContain(MILLENNIUM_TREE);
    // 실패는 1회로 끝 — 조건을 채워도 다시 안 뜬다
    s.guidebooks[Object.keys(s.guidebooks)[0]!]!.best = 1;
    centennialMonthly(s);
    expect(s.ending.centennial).toBe('failed');
    // 성공 케이스
    const t = bareState(6);
    t.ending.continued = true; t.clock.year = CENTENNIAL_YEAR; t.clock.month = CENTENNIAL_MONTH; t.star = 5; t.reputation = 80;
    t.guidebooks[Object.keys(t.guidebooks)[0]!]!.best = 1;
    centennialMonthly(t);
    expect(t.ending.centennial).toBe('done');
    expect(t.unlocked.objects).toContain(MILLENNIUM_TREE);
    expect(t.inventory.millennium_seed).toBe(1);
    expect(t.alerts.at(-1)).toEqual({ type: 'centennial', success: true });
    expect(makeCarry(t).millennium).toBe(true);
    // 계속하기를 안 골랐으면(엔딩 전) 안 뜬다
    const u = bareState(6);
    u.clock.year = CENTENNIAL_YEAR; u.clock.month = CENTENNIAL_MONTH; u.star = 5; u.reputation = 80;
    centennialMonthly(u);
    expect(u.ending.centennial).toBe('none');
  });
});

/** staff-luck: 작업 확률 결과(대박/중박/쪽박) — 확률표·수정치 방향·결정성·1,000회 근사·결과별 효과와 페널티·서빙 판정·팝업 결과·봇 선택 */
import { bareState } from './helpers.ts';
import { apply } from '../actions.ts';
import { createInitialState } from '../state.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { OUTCOME_TABLE, outcomeChances, rollOutcome, bestStaffFor, chanceText, OUTCOME_MULT, GREAT_REPUTATION, FAIL_REPUTATION, FAIL_ENERGY, GREAT_TICKETS, LOW_ENERGY_FAIL, STAT_GREAT_PER_100 } from '../luck.ts';
import { promoChances } from '../promotions.ts';
import { tourChances, TOUR_YEAR, TOUR_SUCCESS_SCORE, TOUR_MONEY_PER_SCORE, TOUR_FAIL_MONEY, tourScore } from '../spots.ts';
import { challengeChances, spawnRival, JUDGE_LUCK } from '../rivals.ts';
import { developChances } from '../craft.ts';
import { sideRandom, nextRandom } from '../rng.ts';
import { staffWith } from './staff.test.ts';
import { RIVALS, promotionDef } from '../../data/index.ts';
import type { GameState, Outcome, Staff } from '../types.ts';

function withStaff(seed = 1, smile = 10): { s: GameState; st: Staff } {
  const s = bareState(seed);
  const st = staffWith({ smile }, 'hall');
  s.staff.push(st);
  s.research = 1000;
  s.money = 1e8;
  return { s, st };
}

test('확률표: 작업별 합 100, 기본표만 보면(직원 없음·평판 50·청결 정상) 표 그대로', () => {
  const s = bareState(1);
  s.reputation = 50;
  for (const [task, c] of Object.entries(OUTCOME_TABLE)) {
    expect(c.great + c.success + c.fail).toBe(100);
    const r = outcomeChances(s, task as keyof typeof OUTCOME_TABLE);
    expect(r.great).toBeCloseTo(c.great / 100, 3);
    expect(r.fail).toBeCloseTo(c.fail / 100, 3);
    expect(r.great + r.success + r.fail).toBeCloseTo(1, 2);
  }
  expect(chanceText({ great: 0.12, success: 0.68, fail: 0.2 })).toBe('성공 68% · 대박 12%');
});

test('수정치 방향: 관련 스탯 ↑ → 대박 ↑·쪽박 ↓, 기력 < 30 → 쪽박 +15%p, 행운아 → 대박 +5%p, 칭호 great/safe, 평판·청결', () => {
  const { s, st } = withStaff(1, 0);
  s.reputation = 50;
  const base = outcomeChances(s, 'promo', st);
  st.stats.smile = 100;
  const hi = outcomeChances(s, 'promo', st);
  expect(hi.great).toBeCloseTo(base.great + STAT_GREAT_PER_100, 3);
  expect(hi.fail).toBeLessThan(base.fail);
  st.stats.smile = 0;
  st.energy = 10;
  expect(outcomeChances(s, 'promo', st).fail).toBeCloseTo(base.fail + LOW_ENERGY_FAIL, 3);
  st.energy = 100;
  st.skill = 'lucky';
  expect(outcomeChances(s, 'promo', st).great).toBeCloseTo(base.great + 0.05, 3);
  st.skill = 'coffee_lover';
  st.title = 'tt_fortune_child'; // 대박 +25%p · 쪽박 절반
  const fc = outcomeChances(s, 'promo', st);
  expect(fc.great).toBeCloseTo(base.great + 0.25, 3);
  expect(fc.fail).toBeCloseTo(base.fail / 2, 3);
  st.title = undefined;
  s.reputation = 100;
  expect(outcomeChances(s, 'promo', st).fail).toBeCloseTo(base.fail - 0.05, 3);
  s.reputation = 0;
  expect(outcomeChances(s, 'promo', st).fail).toBeCloseTo(base.fail + 0.05, 3);
  s.reputation = 50;
  s.clean.value = 10;
  expect(outcomeChances(s, 'promo', st).fail).toBeCloseTo(base.fail + 0.05, 3);
});

test('결정성: 같은 seed·tick·연번이면 같은 결과, 보조 스트림은 주 rng(state.rng)를 바꾸지 않는다; 1,000회 근사는 확률표 ±5%p', () => {
  const a = withStaff(7); const b = withStaff(7);
  const seq = (x: GameState, st: Staff) => { const out: Outcome[] = []; for (let i = 0; i < 30; i++) { x.tick = i; out.push(rollOutcome(x, { task: 'promo', staff: st })); } return out; };
  expect(seq(a.s, a.st)).toEqual(seq(b.s, b.st));
  const rng0 = a.s.rng;
  for (let i = 0; i < 100; i++) sideRandom(a.s);
  expect(a.s.rng).toBe(rng0);
  expect(nextRandom(a.s)).toBe(nextRandom(b.s));
  // 근사
  const s = bareState(11);
  s.reputation = 50;
  const n: Record<Outcome, number> = { great: 0, success: 0, fail: 0 };
  for (let i = 0; i < 1000; i++) { s.tick = i; n[rollOutcome(s, { task: 'promo' })]++; }
  expect(Math.abs(n.great / 1000 - 0.15)).toBeLessThan(0.05);
  expect(Math.abs(n.fail / 1000 - 0.2)).toBeLessThan(0.05);
  // 보조 스트림 자체도 고르게
  const buckets = [0, 0, 0, 0];
  const t = bareState(5);
  for (let i = 0; i < 2000; i++) buckets[Math.floor(sideRandom(t) * 4)]!++;
  for (const bkt of buckets) { expect(bkt).toBeGreaterThan(400); expect(bkt).toBeLessThan(600); }
});

/** 그 결과가 나올 때까지 tick을 바꿔 가며 새 상태로 굴린다 (보조 스트림은 seed·tick·연번에 달렸다) */
function findTick<T extends { s: GameState }>(make: () => T, want: Outcome, act: (x: T) => void, read: (x: T) => Outcome | undefined): T {
  for (let i = 0; i < 400; i++) {
    const x = make();
    x.s.tick += i;
    act(x);
    if (read(x) === want) return x;
  }
  throw new Error(`no ${want}`);
}

test('홍보: 대박 = 인기 ×2 + 응모권 +1 + 평판 +3, 중박 = 표대로, 쪽박 = ×0.5 + 평판 −2 + 기력 −20 + 경험치 +1; 확률은 버튼에 미리 (promoChances), 사과 이벤트는 안 굴린다', () => {
  const d = promotionDef('flyer');
  const delta = (d.segmentDelta['local_auntie'] ?? 0) + (d.allDelta ?? 0);
  for (const want of ['great', 'success', 'fail'] as Outcome[]) {
    const make = () => { const x = withStaff(3); x.s.reputation = 50; x.s.segmentPopularity = { local_auntie: 10 }; x.s.guestTypes['local_auntie']!.unlocked = true; return x; };
    const tickets0 = make().s.tickets;
    const { s, st } = findTick(make, want, (x) => apply(x.s, { type: 'promote', staffId: x.st.id, promotionId: 'flyer' }), (x) => x.s.lastOutcome?.outcome);
    const exp0 = 0;
    const r = s.lastOutcome!;
    expect(r.task).toBe('promo');
    expect(r.staffId).toBe(st.id);
    expect(r.chances.great + r.chances.success + r.chances.fail).toBeCloseTo(1, 2);
    expect(s.segmentPopularity['local_auntie']).toBeCloseTo(10 + Math.round(delta * OUTCOME_MULT[want] * 10) / 10, 3);
    if (want === 'great') { expect(s.tickets).toBeGreaterThanOrEqual(tickets0 + GREAT_TICKETS); expect(s.reputation).toBe(50 + GREAT_REPUTATION); } // 목표 보상 응모권이 겹칠 수 있어 ≥
    if (want === 'fail') { expect(s.reputation).toBe(50 - FAIL_REPUTATION); expect(st.energy).toBe(100 - d.energy - FAIL_ENERGY); expect(st.exp).toBe(exp0 + 1); }
    if (want === 'success') expect(s.reputation).toBe(50);
    expect(apply(s, { type: 'dismissOutcome' }).ok).toBe(true);
    expect(s.lastOutcome).toBeNull();
  }
  const { s, st } = withStaff(2);
  expect(promoChances(s, st.id, 'flyer')).toEqual(outcomeChances(s, 'promo', st));
  expect(promoChances(s, st.id, 'apology_event')).toBeNull();
  s.reputation = 30;
  apply(s, { type: 'promote', staffId: st.id, promotionId: 'apology_event' });
  expect(s.lastOutcome).toBeNull();
});

test('투어: 대박 = 돈·방문객 ×2 + 응모권·평판 +3, 쪽박 = ×0.5 + 평판 −2 (안내 직원 = 대박 기대값 최고)', () => {
  for (const want of ['great', 'fail'] as Outcome[]) {
    const make = () => { const x = withStaff(4, 80); x.s.clock.year = TOUR_YEAR; x.s.reputation = 50; x.s.spots['canola_field'] = 1; return x; };
    const probe = make();
    const score = tourScore(probe.s, 'canola_field');
    const baseMoney = score >= TOUR_SUCCESS_SCORE ? score * TOUR_MONEY_PER_SCORE : TOUR_FAIL_MONEY;
    const money0 = probe.s.money;
    expect(tourChances(probe.s).staff?.id).toBe(probe.s.staff[0]!.id);
    const { s } = findTick(make, want, (x) => apply(x.s, { type: 'hostTour', spotId: 'canola_field' }), (x) => x.s.lastOutcome?.outcome);
    expect(s.lastOutcome!.task).toBe('tour');
    expect(s.money - money0).toBe(Math.round(baseMoney * OUTCOME_MULT[want]));
    expect(s.lastTour!.money).toBe(Math.round(baseMoney * OUTCOME_MULT[want]));
    expect(s.reputation).toBe(50 + (want === 'great' ? GREAT_REPUTATION : -FAIL_REPUTATION));
    if (want === 'great') expect(s.tickets).toBeGreaterThanOrEqual(probe.s.tickets + GREAT_TICKETS);
  }
});

test('카페 대결: 대박이면 운 4 확정, 쪽박이면 운 0 (이기고 지는 건 스탯 비교)', () => {
  for (const want of ['great', 'fail'] as Outcome[]) {
    const make = () => { const x = withStaff(6); x.s.clock.year = 2; const r = spawnRival(x.s, RIVALS[0]!.id); return { ...x, r }; };
    expect(challengeChances(make().s).chances.great).toBeGreaterThan(0);
    const { s } = findTick(make, want, (x) => apply(x.s, { type: 'challenge', rivalId: x.r.id, menuId: x.s.unlocked.menus[0]! }), (x) => x.s.lastOutcome?.outcome);
    expect(s.lastChallenge!.luck).toBe(want === 'great' ? JUDGE_LUCK : 0);
    expect(s.lastOutcome!.task).toBe('challenge');
  }
});

test('연수 복귀: 대박 = 스탯 ×2, 쪽박 = ×0.5 + 기력 −20, 결과 팝업(lastOutcome.task = training)', () => {
  for (const want of ['great', 'fail'] as Outcome[]) {
    const make = () => { const x = withStaff(8); x.s.rank = 3; x.st.stats.skill = 10; return x; };
    const { st } = findTick(make, want, (x) => { apply(x.s, { type: 'train', staffId: x.st.id, trainingId: 'tr_barista' }); for (let d = 0; d < 3; d++) tick(x.s, DAY_MS); }, (x) => (x.s.lastOutcome?.task === 'training' ? x.s.lastOutcome.outcome : undefined));
    expect(st.stats.skill).toBe(10 + Math.round(6 * OUTCOME_MULT[want]));
    if (want === 'fail') expect(st.energy).toBeLessThanOrEqual(100 - FAIL_ENERGY);
  }
});

test('레시피 개발 확률: 미슐랑 셰프는 대성공 2배, 행운아 +5%p; 합 1', () => {
  const s = bareState(1);
  s.reputation = 50;
  const chef = staffWith({ skill: 50 }, 'cook');
  s.staff.push(chef);
  const base = developChances(s, 'drink', {}, chef);
  expect(base.great).toBeCloseTo(0.1, 3);
  chef.title = 'tt_michelin_chef';
  expect(developChances(s, 'drink', {}, chef).great).toBeCloseTo(0.2, 3);
  chef.title = undefined; chef.skill = 'lucky';
  expect(developChances(s, 'drink', {}, chef).great).toBeCloseTo(0.15, 3);
  const c = developChances(s, 'drink', {}, chef);
  expect(c.great + c.success + c.fail).toBeCloseTo(1, 2);
});

test('서빙 판정: 손님이 오는 동안 대박(팁·「최고!」·이달 횟수)과 쪽박(불친절 불만)이 생기고, 월말 카드에 대박 횟수가 실린다', () => {
  const s = createInitialState(12); // 완성 시작 상태(좌석·길·메뉴)에 홀 직원 하나
  s.tutorial.step = 99;
  const st = staffWith({ smile: 50 }, 'hall');
  s.staff.push(st);
  s.money = 1e7;
  s.segmentPopularity = { local_auntie: 60, student: 60 };
  st.energy = 100;
  let great = 0;
  let sawSay = false;
  for (let d = 0; d < 20; d++) {
    tick(s, DAY_MS);
    great = Math.max(great, s.monthGreatServes ?? 0);
    if (s.guests.some((g) => g.say === '최고!')) sawSay = true;
    if (s.lastMonthCard) { expect(s.lastMonthCard.greatServes).toBeGreaterThanOrEqual(0); apply(s, { type: 'dismissMonthCard' }); }
  }
  expect(great + (s.lastMonthCard?.greatServes ?? 0)).toBeGreaterThan(0);
  expect(sawSay || great > 0).toBe(true);
  expect(s.lastOutcome).toBeNull(); // 서빙은 팝업을 띄우지 않는다
});

test('bestStaffFor: 미소·기력·칭호로 대박 기대값이 가장 높은 직원, 일하는 직원만', () => {
  const s = bareState(1);
  const a = staffWith({ smile: 10 }, 'hall');
  const b = staffWith({ smile: 90 }, 'hall');
  b.id = 'b';
  s.staff.push(a, b);
  expect(bestStaffFor(s, 'promo')?.id).toBe('b');
  b.energy = 5; // 지친 직원은 쪽박 +15%p
  a.stats.smile = 80;
  expect(bestStaffFor(s, 'promo')?.id).toBe(a.id);
  b.role = null;
  expect(bestStaffFor(s, 'promo')?.id).toBe(a.id);
  a.role = null;
  expect(bestStaffFor(s, 'promo')).toBeNull();
});

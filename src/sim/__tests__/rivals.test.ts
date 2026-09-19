import { bareState } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, monthIndex } from '../clock.ts';
import { menuStatsOf, rivalStatPenaltyPct, RIVAL_PENALTY_CAP } from '../craft.ts';
import { namedGuestState, regularIds } from '../popup.ts';
import {
  monthlyRivals, rivalPower, judgeBreakdown, challengeOdds, canChallenge, challenge, rivalLeave, rivalState,
  RIVAL_MAX, RIVAL_LEAVE_MONTHS, RIVAL_MONTHLY_CHANCE, CHALLENGE_WIN_MILEAGE, CHALLENGE_LOSE_POPULARITY, JUDGE_LUCK, SIZE_POWER,
} from '../rivals.ts';
import { serialize, deserialize } from '../save.ts';
import { RIVALS, rivalDef, menuDef } from '../../data/index.ts';
import type { RivalState } from '../types.ts';

function year(s: ReturnType<typeof createInitialState>, y: number) {
  s.clock.year = y;
  s.clock.month = 1;
  s.clock.day = 1;
  return s;
}
function addRival(s: ReturnType<typeof createInitialState>, rivalId: string, opened = monthIndex(s.clock)): RivalState {
  const r: RivalState = { id: `r${s.nextId++}`, rivalId, openedMonthIndex: opened, penaltyPct: 0, stolen: [], lastChallengeMonth: -1 };
  s.rivals.push(r);
  return r;
}
/** 여러 seed로 monthlyRivals를 돌려 생긴 횟수 */
function spawnRate(y: number, n = 400): number {
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) {
    const s = year(bareState(seed), y);
    monthlyRivals(s);
    if (s.rivals.length > 0) hits++;
  }
  return hits / n;
}

test('데이터: 라이벌 6종 — 규모·유지비·심사 가중치(합 1)·대형만 파산 15%', () => {
  expect(RIVALS).toHaveLength(6);
  expect(RIVALS.map((r) => r.id)).toEqual(['rv_local_cafe', 'rv_franchise', 'rv_truck_cafe', 'rv_dessert_shop', 'rv_big_brand', 'rv_sns_cafe']);
  for (const r of RIVALS) {
    expect(Object.values(r.judge).reduce((n, w) => n + (w ?? 0), 0)).toBeCloseTo(1);
    expect(r.bankruptMonthly).toBe(r.size === 'large' ? 15 : 0);
    expect(r.statPenalty).toBe(5);
    expect(r.stealPerMonth).toBe(1);
  }
  expect(rivalDef('rv_sns_cafe')).toMatchObject({ size: 'medium', judge: { look: 0.5, jeju: 0.3, aroma: 0.2 } });
  expect(() => rivalDef('nope')).toThrow();
});

test('생성: 2년차부터 월 10%(seed 통계), 1년차엔 안 생기고 동시 2까지', () => {
  expect(spawnRate(1)).toBe(0);
  const p = spawnRate(2);
  expect(p).toBeGreaterThan(RIVAL_MONTHLY_CHANCE - 0.05);
  expect(p).toBeLessThan(RIVAL_MONTHLY_CHANCE + 0.05);
  const s = year(bareState(1), 3);
  addRival(s, 'rv_local_cafe');
  addRival(s, 'rv_truck_cafe');
  for (let i = 0; i < 50; i++) { s.rng = i * 7919; monthlyRivals(s); }
  expect(s.rivals.length).toBeLessThanOrEqual(RIVAL_MAX);
  // tick으로도 생긴다: 3년차 첫 달들을 seed 몇 개로 돌려 하나라도
  let any = false;
  for (let seed = 1; seed <= 12 && !any; seed++) {
    const t = bareState(seed);
    t.clock.year = 3; t.clock.month = 1; t.clock.day = 30; t.clock.hour = 23;
    for (let m = 0; m < 6; m++) for (let d = 0; d < 30; d++) tick(t, DAY_MS);
    any = t.actionLog.length >= 0 && t.notices.some((n) => n.includes('라이벌 카페'));
  }
  expect(any).toBe(true);
});

test('효과: 매월 단골★ 1명 이탈(랜덤), 양·보기 −5% 누적, 합 −50% 상한', () => {
  const s = year(bareState(1), 2); // 2년차: 새 라이벌이 끼어들지 않는다
  for (const id of ['ng01', 'ng02', 'ng03']) { namedGuestState(s, id).regular = true; namedGuestState(s, id).rewardsTaken = 1; }
  const r = addRival(s, 'rv_local_cafe');
  const cheesecakeLook = menuDef('cheesecake').stats.look; // 6, volume 14
  monthlyRivals(s);
  expect(regularIds(s)).toHaveLength(2);
  expect(r.stolen).toHaveLength(1);
  expect(r.penaltyPct).toBe(5);
  expect(rivalStatPenaltyPct(s)).toBe(5);
  expect(menuStatsOf(s, 'cheesecake').volume).toBe(Math.round(14 * 0.95));
  expect(menuStatsOf(s, 'cheesecake').look).toBe(Math.round(cheesecakeLook * 0.95));
  expect(menuStatsOf(s, 'cheesecake').taste).toBe(13); // 다른 스탯은 그대로
  for (let i = 0; i < 4; i++) monthlyRivals(s);
  expect(regularIds(s)).toHaveLength(0); // 3명 다 빼앗김, 더는 없음
  expect(r.stolen).toHaveLength(3);
  const r2 = addRival(s, 'rv_dessert_shop');
  r.penaltyPct = 40;
  r2.penaltyPct = 30;
  expect(rivalStatPenaltyPct(s)).toBe(RIVAL_PENALTY_CAP);
  expect(menuStatsOf(s, 'cheesecake').volume).toBe(7);
  expect(menuStatsOf(s, 'cheesecake').look).toBe(3);
});

test('대결 심사: 가중치 × 스탯 + 운(0~4) vs 규모 × 년차. 승리: 철수·마일리지 2·단골 회수 / 패배: 인기 −5. 한 달 한 번', () => {
  const s = year(bareState(1), 3);
  namedGuestState(s, 'ng01').regular = true;
  const r = addRival(s, 'rv_local_cafe'); // 맛 0.5·향 0.3·제주 0.2, 소 → 6 × 1.2 = 7.2
  expect(rivalPower(rivalDef('rv_local_cafe'), 3)).toBe(7.2);
  expect(rivalPower(rivalDef('rv_big_brand'), 1)).toBe(SIZE_POWER.large);
  const bd = judgeBreakdown(rivalDef('rv_local_cafe'), menuDef('americano').stats); // 맛 6·향 8·제주 0 → 3 + 2.4 + 0 = 5.4
  expect(bd).toEqual({ breakdown: { taste: 3, aroma: 2.4, jeju: 0 }, total: 5.4 });
  expect(challengeOdds(s, r.id, 'americano')).toBeCloseTo(1 - (7.2 - 5.4) / JUDGE_LUCK);
  expect(canChallenge(s, 'nope', 'americano').ok).toBe(false);
  expect(s.unlocked.menus.includes('carrot_juice')).toBe(false);
  expect(canChallenge(s, r.id, 'carrot_juice').ok).toBe(false); // 아직 모르는 메뉴
  // 개발 메뉴(최고 스탯)로 확실히 이긴다
  s.customMenus.push({ id: 'm_custom_1', name: '한라산 라떼', category: 'drink', price: 6000, ingredients: { beans: 1 }, stats: { taste: 20, aroma: 15, look: 10, health: 5, volume: 8, jeju: 12 } });
  const mileage0 = s.mileage;
  namedGuestState(s, 'ng02').regular = false;
  r.stolen.push('ng02');
  expect(apply(s, { type: 'challenge', rivalId: r.id, menuId: 'm_custom_1' }).ok).toBe(true);
  const res = s.lastChallenge!;
  expect(res).toMatchObject({ rivalId: 'rv_local_cafe', menuId: 'm_custom_1', menuName: '한라산 라떼', power: 7.2, win: true });
  expect(res.score).toBeGreaterThan(res.power);
  expect(res.breakdown).toEqual({ taste: 10, aroma: 4.5, jeju: 2.4 });
  expect(s.rivals).toHaveLength(0);
  expect(s.mileage).toBe(mileage0 + CHALLENGE_WIN_MILEAGE);
  expect(namedGuestState(s, 'ng02').regular).toBe(true); // 회수
  expect(apply(s, { type: 'dismissChallenge' }).ok).toBe(true);
  expect(s.lastChallenge).toBeNull();
  // 패배: 대형(10 × 1.2 = 12)에 쿠키(맛 7·양 7·보기 1 → 2.1 + 2.8 + 0.3 = 5.2)로는 운 4를 더해도 못 이긴다
  const big = addRival(s, 'rv_franchise');
  s.unlocked.menus.push('cookie'); // v3 시작 메뉴는 3종뿐
  const pop0 = s.popularity;
  expect(apply(s, { type: 'challenge', rivalId: big.id, menuId: 'cookie' }).ok).toBe(true);
  expect(s.lastChallenge).toMatchObject({ win: false, power: 12 });
  expect(s.popularity).toBe(pop0 - CHALLENGE_LOSE_POPULARITY);
  expect(s.rivals).toHaveLength(1);
  expect(apply(s, { type: 'challenge', rivalId: big.id, menuId: 'cookie' })).toMatchObject({ ok: false, reason: '이달엔 이미 대결했어요' });
  s.clock.month = 2;
  expect(canChallenge(s, big.id, 'cookie').ok).toBe(true);
});

test('파산·자진 철수: 대형은 월 15%(seed 통계)로 파산, 12개월 지나면 철수, 철수하면 단골이 돌아온다', () => {
  let bankrupt = 0;
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const s = year(bareState(seed), 2);
    addRival(s, 'rv_big_brand');
    monthlyRivals(s);
    if (s.rivals.length === 0) bankrupt++;
  }
  expect(bankrupt / N).toBeGreaterThan(0.10);
  expect(bankrupt / N).toBeLessThan(0.20);
  // 소형은 파산하지 않는다
  for (let seed = 1; seed <= 50; seed++) {
    const s = year(bareState(seed), 1); // 1년차: 새 라이벌은 안 생긴다
    addRival(s, 'rv_truck_cafe');
    monthlyRivals(s);
    expect(s.rivals).toHaveLength(1);
  }
  const s = year(bareState(1), 2);
  const r = addRival(s, 'rv_truck_cafe', monthIndex(s.clock) - RIVAL_LEAVE_MONTHS + 1);
  namedGuestState(s, 'ng07').regular = false;
  r.stolen.push('ng07');
  monthlyRivals(s);
  expect(s.rivals).toHaveLength(1);
  s.clock.month = 2;
  monthlyRivals(s);
  expect(s.rivals).toHaveLength(0);
  expect(namedGuestState(s, 'ng07').regular).toBe(true);
  expect(s.notices.some((n) => n.includes('자진 철수'))).toBe(true);
  const s2 = year(bareState(2), 3);
  const r2 = addRival(s2, 'rv_sns_cafe');
  rivalLeave(s2, r2, '떠났어요');
  expect(rivalState(s2, r2.id)).toBeUndefined();
});

test('세이브: 라이벌·대결 결과가 저장·복원된다', () => {
  const s = year(bareState(1), 3);
  addRival(s, 'rv_sns_cafe');
  apply(s, { type: 'challenge', rivalId: s.rivals[0]!.id, menuId: 'americano' });
  const c = deserialize(serialize(s));
  expect(c.rivals).toEqual(s.rivals);
  expect(c.lastChallenge).toEqual(s.lastChallenge);
});

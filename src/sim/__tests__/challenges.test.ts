import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, DAYS_PER_MONTH, monthIndex } from '../clock.ts';
import { CHALLENGES, challengeDef } from '../../data/index.ts';
import { offeredChallenges, canAcceptChallenge, acceptChallenge, checkChallenges, challengeProgress, challengeDaysLeft, isChallengeLocked, makeMonthly, monthlyProgress, checkMonthly, CHALLENGE_SLOTS, CHALLENGE_OFFERS, CHALLENGE_LOCK_TIER, CHALLENGE_LOCK_DAYS } from '../challenges.ts';
import { conditionProgress, goalConditionText, goalRewardText } from '../goals.ts';
import { dayIndex } from '../effects.ts';
import { bareState, at } from './helpers.ts';

describe('challenges.json', () => {
  it('46개(40 + 명당·숨은 레시피·콤보·세트 6), id 유일, tier 1~5, 제목 14자 이내, 기한·보상이 있고 조건이 전부 판정된다', () => {
    expect(CHALLENGES).toHaveLength(46);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(46);
    expect(CHALLENGES.filter((c) => c.condition.type === 'spotEffects' || c.condition.type === 'hiddenRecipes')).toHaveLength(4); // game-feel P1: 있지만 못 만나는 컨텐츠를 도전 풀에
    const s = createInitialState(1);
    for (const c of CHALLENGES) {
      expect(c.title.length, c.id).toBeLessThanOrEqual(14);
      expect(c.tier).toBeGreaterThanOrEqual(1);
      expect(c.tier).toBeLessThanOrEqual(5);
      expect(c.days).toBeGreaterThan(0);
      expect(c.reward.length).toBeGreaterThan(0);
      const p = conditionProgress(s, c.condition);
      expect(p.max, c.id).toBeGreaterThan(0);
      expect(goalConditionText(c.condition).length).toBeGreaterThan(0);
      for (const r of c.reward) expect(goalRewardText(r).length).toBeGreaterThan(0);
    }
    expect(challengeDef('c01').tier).toBe(1);
    expect(CHALLENGES.filter((c) => c.tier >= CHALLENGE_LOCK_TIER).length).toBeGreaterThan(5);
  });
});

describe('도전 과제 2슬롯 (§7.3)', () => {
  it('목록은 6개, 아직 안 한 것·requires ≤ goals.index만, 달마다 시작 위치가 돈다 (결정적)', () => {
    const s = createInitialState(1);
    const a = offeredChallenges(s);
    expect(a).toHaveLength(CHALLENGE_OFFERS);
    for (const c of a) expect(c.requires ?? 0).toBeLessThanOrEqual(s.goals.index);
    expect(offeredChallenges(createInitialState(1)).map((c) => c.id)).toEqual(a.map((c) => c.id));
    s.clock.month += 1;
    const b = offeredChallenges(s);
    expect(b.map((c) => c.id)).not.toEqual(a.map((c) => c.id));
    s.goals.index = 50;
    expect(offeredChallenges(s).some((c) => (c.requires ?? 0) > 0)).toBe(true);
  });

  it('수락: 2개까지, 같은 것 두 번 안 되고, requires가 높으면 안 되고, delta 조건은 수락 시점 값이 base', () => {
    const s = createInitialState(1);
    s.totalGuests = 100;
    expect(apply(s, { type: 'acceptChallenge', id: 'c02' }).ok).toBe(true); // 손님 +30 (delta)
    const a = s.challenges.active[0]!;
    expect(a).toMatchObject({ id: 'c02', base: 100, startDay: dayIndex(s.clock), endDay: dayIndex(s.clock) + 15 });
    expect(challengeProgress(s, 'c02')).toEqual({ cur: 0, max: 30 });
    s.totalGuests = 120;
    expect(challengeProgress(s, 'c02')).toEqual({ cur: 20, max: 30 });
    expect(apply(s, { type: 'acceptChallenge', id: 'c02' }).ok).toBe(false);
    expect(canAcceptChallenge(s, 'c29').ok).toBe(false); // requires 40
    expect(apply(s, { type: 'acceptChallenge', id: 'c01' }).ok).toBe(true);
    expect(s.challenges.active).toHaveLength(CHALLENGE_SLOTS);
    const r = apply(s, { type: 'acceptChallenge', id: 'c05' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('2개');
    expect(challengeDaysLeft(s, 'c02')).toBe(15);
  });

  it('달성: 보상 상자 알림 + done, 목록에서 빠진다. 액션 직후에도 판정된다', () => {
    const s = createInitialState(1);
    acceptChallenge(s, 'c01'); // 좌석 4개 (시작 좌석 3)
    const tickets = s.tickets;
    expect(checkChallenges(s)).toEqual([]);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6, 3) }).ok).toBe(true);
    expect(s.challenges.done).toContain('c01');
    expect(s.challenges.active).toHaveLength(0);
    expect(s.tickets).toBe(tickets + 2);
    expect(s.alerts.some((a) => a.type === 'reward' && a.source === 'challenge' && a.refId === 'c01')).toBe(true);
    expect(offeredChallenges(s).some((c) => c.id === 'c01')).toBe(false);
    expect(canAcceptChallenge(s, 'c01').ok).toBe(false);
  });

  it('기한: 지나면 실패(페널티 없음, 다시 고를 수 있음). tier 4 이상은 3개월 잠김 → 그 뒤 다시 고를 수 있다', () => {
    const s = bareState(1);
    s.goals.index = 50;
    acceptChallenge(s, 'c03'); // tier 1, 30일
    acceptChallenge(s, 'c29'); // tier 4, 90일
    const today = dayIndex(s.clock);
    s.clock.day += 1; // 하루 뒤: 아직
    checkChallenges(s);
    expect(s.challenges.active).toHaveLength(2);
    // 30일 뒤: c03 실패, 잠기지 않음
    for (let d = 0; d < 30; d++) tick(s, DAY_MS);
    expect(s.challenges.active.map((a) => a.id)).toEqual(['c29']);
    expect(s.challenges.failed).toEqual([]);
    expect(s.alerts.some((a) => a.type === 'challengeFailed' && a.id === 'c03')).toBe(true);
    expect(canAcceptChallenge(s, 'c03').ok).toBe(true);
    // 90일 뒤: c29 실패 → 잠김
    for (let d = 0; d < 60; d++) tick(s, DAY_MS);
    expect(s.challenges.active).toHaveLength(0);
    expect(s.challenges.failed).toHaveLength(1);
    expect(s.challenges.failed[0]!.id).toBe('c29');
    expect(s.challenges.failed[0]!.until).toBe(today + 90 + CHALLENGE_LOCK_DAYS);
    expect(isChallengeLocked(s, 'c29')).toBe(true);
    expect(canAcceptChallenge(s, 'c29').reason).toContain('일 뒤');
    expect(offeredChallenges(s).some((c) => c.id === 'c29')).toBe(false);
    for (let d = 0; d < CHALLENGE_LOCK_DAYS; d++) tick(s, DAY_MS);
    expect(isChallengeLocked(s, 'c29')).toBe(false);
    expect(canAcceptChallenge(s, 'c29').ok).toBe(true);
  });
});

describe('월간 과제 (§7.3)', () => {
  it('새 게임에 이달 과제가 있고, 종류는 monthIndex로 정해지며(결정적) 난이도는 지난달 기준', () => {
    const s = createInitialState(1);
    expect(s.monthly).not.toBeNull();
    expect(s.monthly!.monthIndex).toBe(monthIndex(s.clock));
    expect(s.monthly!.status).toBe('active');
    expect(makeMonthly(s).id).toBe(s.monthly!.id);
    const p = monthlyProgress(s);
    expect(p.max).toBeGreaterThan(0);
    s.lastMonthCard = { income: 3_000_000, guests: 200, month: 3, year: 1, costs: { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0 }, net: 1 } as never;
    s.lastMonthIncome = 3_000_000;
    s.clock.month = 4; // monthIndex % 8 → 종류 순환 (guests·sales·satisfied·seats·spot·guests·sales·hidden). 1년차엔 spot·hidden 대신 guests·sales
    const kinds = [4, 5, 6, 7, 8, 9, 10, 11].map((m) => { s.clock.month = m; return makeMonthly(s); });
    expect(new Set(kinds.map((k) => k.condition.type)).size).toBe(4);
    expect(kinds.some((k) => k.condition.type === 'spotEffects' || k.condition.type === 'hiddenRecipes')).toBe(false); // 1년차
    const guestsTask = kinds.find((k) => k.condition.type === 'monthGuests')!;
    expect((guestsTask.condition as { n: number }).n).toBe(120); // 200 × 0.6 (game-feel P1: 달 중반 달성)
    const sales = kinds.find((k) => k.condition.type === 'monthSales')!;
    expect((sales.condition as { n: number }).n).toBe(1_800_000); // 300만 × 0.6
    s.clock.year = 2;
    const kinds2 = [4, 5, 6, 7, 8, 9, 10, 11].map((m) => { s.clock.month = m; return makeMonthly(s); });
    expect(kinds2.some((k) => k.condition.type === 'spotEffects')).toBe(true); // 2년차부터 명당·숨은 레시피 과제
    expect(kinds2.some((k) => k.condition.type === 'hiddenRecipes')).toBe(true);
  });

  it('달성하면 보상 상자·done, 월이 바뀌면 미달은 failed로 두고 새 과제를 만든다', () => {
    const s = createInitialState(1);
    const m = s.monthly!;
    if (m.condition.type === 'monthGuests') s.monthGuests = (m.condition as { n: number }).n;
    else if (m.condition.type === 'monthSales') s.monthIncome = (m.condition as { n: number }).n;
    else if (m.condition.type === 'satisfied') s.stats.satisfiedTotal = m.base + (m.condition as { n: number }).n;
    else for (let i = 0; i < 2; i++) expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6 + i, 3) }).ok).toBe(true);
    checkMonthly(s);
    expect(s.monthly!.status).toBe('done');
    expect(s.alerts.some((a) => a.type === 'reward' && a.source === 'monthly')).toBe(true);
    checkMonthly(s);
    expect(s.alerts.filter((a) => a.type === 'reward' && a.source === 'monthly')).toHaveLength(1); // 두 번 안 준다
    // 다음 달
    const t = createInitialState(2);
    const first = t.monthly!.id;
    for (let d = 0; d < DAYS_PER_MONTH; d++) tick(t, DAY_MS);
    expect(t.monthly!.id).not.toBe(first);
    expect(t.monthly!.monthIndex).toBe(monthIndex(t.clock));
    expect(['active', 'done']).toContain(t.monthly!.status);
  });
});

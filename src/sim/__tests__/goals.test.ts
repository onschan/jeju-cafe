import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { GOALS, goalDef, objectDef, menuDef, roleDef, FACILITIES } from '../../data/index.ts';
import { currentGoal, goalProgress, checkGoals, goalMet, goalForFacility, goalForFeature, checkFeature, grantReward, FEATURE_IDS, goalConditionText, goalRewardText } from '../goals.ts';
import { bareState, at } from './helpers.ts';

describe('goals.json 데이터', () => {
  it('60개 순차 목표, id 유일, 제목 14자 이내, 참조 id가 전부 존재한다', () => {
    expect(GOALS.length).toBe(60);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(60);
    for (const g of GOALS) {
      expect(g.title.length, g.id).toBeLessThanOrEqual(14);
      expect(g.desc.length).toBeGreaterThan(0);
      expect(g.reward.length).toBeGreaterThan(0);
      if (g.condition.type === 'menuSold') menuDef(g.condition.menuId);
      for (const r of g.reward) {
        if (r.type === 'unlockFacility') objectDef(r.id);
        if (r.type === 'unlockMenu') menuDef(r.id);
        if (r.type === 'unlockRole') roleDef(r.id);
        if (r.type === 'staffSlot') roleDef(r.role);
        if (r.type === 'unlockFeature') expect(FEATURE_IDS).toContain(r.id);
      }
      expect(goalConditionText(g.condition).length).toBeGreaterThan(0);
      for (const r of g.reward) expect(goalRewardText(r).length).toBeGreaterThan(0);
    }
    expect(goalDef('g01').id).toBe('g01');
  });

  it('기능 6종은 각각 정확히 한 목표에서 열리고, 그 기능이 필요한 목표는 그 뒤에 온다', () => {
    const idx = (id: string) => GOALS.findIndex((g) => g.id === id);
    for (const f of FEATURE_IDS) {
      const openers = GOALS.filter((g) => g.reward.some((r) => r.type === 'unlockFeature' && r.id === f));
      expect(openers.length, f).toBe(1);
    }
    expect(idx(goalForFeature('promote')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'promotions')!.id));
    expect(idx(goalForFeature('parcel')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'parcels')!.id));
    expect(idx(goalForFeature('clearRock')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'rocks')!.id));
    expect(idx(goalForFeature('craft')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'recipes')!.id));
    expect(idx(goalForFeature('popup')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'namedGuest')!.id));
    expect(idx(goalForFeature('challenge')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'rivalWins')!.id));
  });

  it('v2 표에서 시작(start)이었다가 목표 보상으로 바뀐 시설은 전부 어떤 목표가 연다', () => {
    const goalGated = FACILITIES.filter((f) => f.unlock?.type === 'goal');
    expect(goalGated.length).toBeGreaterThan(10);
    for (const f of goalGated) expect(goalForFacility(f.id), f.id).not.toBeNull();
  });
});

describe('목표 체인 진행', () => {
  it('새 게임: 첫 목표는 g01, 진행도 0/1, 기능은 전부 잠겨 있다', () => {
    const s = createInitialState(1);
    expect(currentGoal(s)?.id).toBe('g01');
    expect(goalProgress(s)).toEqual({ cur: 0, max: 1 });
    for (const f of FEATURE_IDS) expect(s.features[f]).toBe(false);
    expect(checkFeature(s, 'buyParcel').ok).toBe(false);
    expect(checkFeature(s, 'place').ok).toBe(true);
  });

  it('조건을 채우면 checkGoals가 보상을 주고 index·claimed·alerts가 는다. 여러 개가 연달아 달성돼도 순서대로', () => {
    const s = createInitialState(1);
    const money = s.money;
    s.menuSold['americano'] = 1;
    s.totalGuests = 5;
    expect(checkGoals(s)).toEqual(['g01', 'g02']);
    expect(s.goals.index).toBe(2);
    expect(s.goals.claimed).toEqual(['g01', 'g02']);
    expect(s.money).toBe(money + 300_000 + 500_000);
    expect(s.alerts).toEqual([{ type: 'goal', goalId: 'g01' }, { type: 'goal', goalId: 'g02' }]);
    expect(currentGoal(s)?.id).toBe('g03');
    expect(goalProgress(s)).toEqual({ cur: 3, max: 4 }); // 시작 좌석 3개
    expect(apply(s, { type: 'dismissAlert' }).ok).toBe(true);
    expect(s.alerts).toHaveLength(1);
  });

  it('액션 직후에도 판정된다: 테이블을 놓아 쉼 시설 4개가 되면 테라스 좌석이 열린다', () => {
    const s = createInitialState(1);
    s.goals.index = 2; // g03 자리 4개
    expect(s.unlocked.objects).not.toContain('terrace_seat');
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6, 3) }).ok).toBe(true);
    expect(s.goals.claimed).toContain('g03');
    expect(s.unlocked.objects).toContain('terrace_seat');
  });

  it('기능 보상: unlockFeature가 열리기 전엔 액션이 거부되고 이유에 목표 이름이 들어간다', () => {
    const s = createInitialState(1);
    const r = apply(s, { type: 'buyParcel', id: s.parcels.find((p) => !p.owned)!.id });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(goalForFeature('parcel')!.title);
    s.goals.index = GOALS.findIndex((g) => g.id === 'g11');
    s.money = 7_000_000;
    checkGoals(s);
    expect(s.features.parcel).toBe(true);
    expect(checkFeature(s, 'buyParcel').ok).toBe(true);
  });

  it('보상 종류: 돈·시설·메뉴·직종·응모권·마일리지·슬롯·연구·일꾼', () => {
    const s = bareState(1);
    s.goals.index = 999;
    const before = { money: s.money, tickets: s.tickets, mileage: s.mileage, research: s.research, builders: s.builders, barista: s.slots.barista };
    grantReward(s, { type: 'money', amount: 10 });
    grantReward(s, { type: 'unlockFacility', id: 'restroom' });
    grantReward(s, { type: 'unlockMenu', id: 'toast' });
    grantReward(s, { type: 'unlockRole', id: 'guide' });
    grantReward(s, { type: 'tickets', n: 2 });
    grantReward(s, { type: 'mileage', n: 3 });
    grantReward(s, { type: 'staffSlot', role: 'barista', n: 1 });
    grantReward(s, { type: 'research', n: 4 });
    grantReward(s, { type: 'builder', n: 1 });
    expect(s.money).toBe(before.money + 10);
    expect(s.unlocked.objects).toContain('restroom');
    expect(s.unlocked.menus).toContain('toast');
    expect(s.unlocked.roles).toContain('guide');
    expect(s.tickets).toBe(before.tickets + 2);
    expect(s.mileage).toBe(before.mileage + 3);
    expect(s.slots.barista).toBe(before.barista + 1);
    expect(s.research).toBe(before.research + 4);
    expect(s.builders).toBe(before.builders + 1);
  });

  it('rank 목표는 가이드북 최고 순위 ≤ n, 진행도는 0/1', () => {
    const s = bareState(1);
    s.goals.index = GOALS.findIndex((g) => g.condition.type === 'rank');
    expect(goalMet(s, { type: 'rank', n: 5 })).toBe(false);
    expect(goalProgress(s)).toEqual({ cur: 0, max: 1 });
    s.guidebooks['gb_local_map'] = { unlocked: true, lastRank: 4, best: 4 };
    expect(goalMet(s, { type: 'rank', n: 5 })).toBe(true);
    expect(goalMet(s, { type: 'rank', n: 3 })).toBe(false);
  });

  it('새 게임을 그냥 두면 3일 안에 목표 2개(아메리카노·손님 5명)가 달성된다 (§7.3)', () => {
    const s = createInitialState(1);
    for (let d = 0; d < 3; d++) tick(s, DAY_MS);
    expect(s.goals.index).toBeGreaterThanOrEqual(2);
    expect(s.goals.claimed.slice(0, 2)).toEqual(['g01', 'g02']);
  });
});

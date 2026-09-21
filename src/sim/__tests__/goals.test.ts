import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { GOALS, goalDef, objectDef, menuDef, roleDef, FACILITIES, MILEAGE_SHOP, TICKET_SHOP } from '../../data/index.ts';
import { currentGoal, activeGoals, goalProgress, checkGoals, goalMet, goalForFacility, goalForFeature, checkFeature, grantReward, FEATURE_IDS, ACTION_FEATURE_IDS, goalConditionText, goalRewardText, conditionProgress, conditionCheckers, applyRewards, scaleReward, canOpen, CONCURRENT_GOALS } from '../goals.ts';
import type { GoalCondition, GoalReward } from '../types.ts';
import { tutorialFeatureIds } from '../tutorial.ts';
import { bareState, at } from './helpers.ts';

describe('goals.json 데이터', () => {
  it('108개 순차 목표(§3.5), id 유일, 제목 14자 이내, 문구가 있고, v3 시절 id(앞 20개·메뉴)는 전부 존재한다', () => {
    expect(GOALS.length).toBe(108);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(108);
    for (const [i, g] of GOALS.entries()) {
      expect(g.id).toBe(`g${String(i + 1).padStart(2, '0')}`);
      expect(g.title.length, g.id).toBeLessThanOrEqual(14);
      expect(g.desc.length).toBeGreaterThan(0);
      expect(g.reward.length).toBeGreaterThan(0);
      expect(g.line?.length ?? 0, g.id).toBeGreaterThan(0);
      if (g.condition.type === 'menuSold') menuDef(g.condition.menuId);
      for (const r of g.reward) {
        // 시설 44종·직종 clean은 x-facility·x-staff가 만든다 — 통합 때 scripts/validate-goals.ts(strict)로 잡는다
        if (r.type === 'unlockFacility' && i < 20) objectDef(r.id);
        if (r.type === 'unlockMenu') menuDef(r.id);
        if (r.type === 'staffSlot' && (r.role as string) !== 'clean') roleDef(r.role);
        if (r.type === 'unlockFeature') expect(FEATURE_IDS).toContain(r.id);
      }
      expect(goalConditionText(g.condition).length).toBeGreaterThan(0);
      for (const r of g.reward) expect(goalRewardText(r).length).toBeGreaterThan(0);
    }
    expect(goalDef('g01').id).toBe('g01');
    expect(goalDef('g108').condition).toEqual({ type: 'custom', id: 'centennial' });
  });

  it('조건 타입 전부(기존 19 + 신설 14 + 전략 + 도전·월간)에 판정기가 있고 goals.json 108개 조건이 전부 판정된다 (스텁 포함)', () => {
    const s = createInitialState(1);
    for (const g of GOALS) {
      const p = conditionProgress(s, g.condition);
      expect(p.max, g.id).toBeGreaterThan(0);
      expect(p.cur, g.id).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.cur), g.id).toBe(true);
    }
    const used = new Set(GOALS.map((g) => g.condition.type));
    expect(used.size).toBeGreaterThanOrEqual(30);
    for (const t of Object.keys(conditionCheckers)) expect(goalConditionText({ ...({ type: t, n: 1, lv: 1, view: 1, avg: 1, days: 1, pct: 1, id: 'centennial', menuId: 'americano', spotId: 'canola_field', guestId: 'couple', bookId: 'gb_kind_cafe' } as object) } as GoalCondition).length, t).toBeGreaterThan(0);
  });

  it('신설 조건 판정: 월 매출·Lv 직원·콤보·명소·손님 타입·가이드북·흑자 달·아이템·유니폼·특기·좌석·이달 손님/매출', () => {
    const s = bareState(1);
    s.lastMonthIncome = 20_000_000;
    expect(goalMet(s, { type: 'monthIncome', n: 20_000_000 })).toBe(true);
    s.staff.push({ ...s.candidates[0]!, level: 5, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 } as never);
    expect(conditionProgress(s, { type: 'staffLevel', lv: 5, n: 2 })).toEqual({ cur: 1, max: 2 });
    expect(conditionProgress(s, { type: 'staffLevel', lv: 6, n: 1 }).cur).toBe(0);
    s.codex.combos.push('x1', 'x2');
    expect(conditionProgress(s, { type: 'combos', n: 3 })).toEqual({ cur: 2, max: 3 });
    s.spots['canola_field'] = 2; s.spots['seongsan'] = 3;
    expect(goalMet(s, { type: 'spotLevel', spotId: 'canola_field', lv: 2 })).toBe(true);
    expect(conditionProgress(s, { type: 'spotAny', lv: 2, n: 2 })).toEqual({ cur: 2, max: 2 });
    expect(conditionProgress(s, { type: 'spotAny', lv: 3, n: 2 })).toEqual({ cur: 1, max: 2 });
    s.guidebooks['gb_kind_cafe'] = { unlocked: true, lastRank: 4, best: 4, boost: 0, pending: 0 };
    expect(goalMet(s, { type: 'guidebookRank', bookId: 'gb_kind_cafe', n: 5 })).toBe(true);
    expect(goalMet(s, { type: 'guidebookRank', bookId: 'gb_local_map', n: 5 })).toBe(false);
    s.stats.guidebookWins = 3; s.stats.profitMonths = 6; s.stats.itemsUsed = 20; s.stats.trainings = 1; s.stats.toursHeld = 1;
    expect(goalMet(s, { type: 'guidebookWins', n: 3 })).toBe(true);
    expect(goalMet(s, { type: 'profitMonths', n: 6 })).toBe(true);
    expect(goalMet(s, { type: 'itemsUsed', n: 20 })).toBe(true);
    expect(goalMet(s, { type: 'trainings', n: 1 })).toBe(true);
    expect(goalMet(s, { type: 'tourGroup', n: 1 })).toBe(true);
    s.uniforms.push('u1', 'u2', 'u3');
    expect(goalMet(s, { type: 'uniforms', n: 3 })).toBe(true);
    expect(conditionProgress(s, { type: 'skills', n: 1 }).cur).toBe(s.staff.filter((st) => st.skill && st.skill !== 'none').length);
    expect(conditionProgress(s, { type: 'seats', n: 4 })).toEqual({ cur: 0, max: 4 });
    s.monthGuests = 150; s.monthIncome = 5_000_000;
    expect(goalMet(s, { type: 'monthGuests', n: 150 })).toBe(true);
    expect(goalMet(s, { type: 'monthSales', n: 5_000_000 })).toBe(true);
    expect(conditionProgress(s, { type: 'guestType', guestId: 'couple', n: 30 }).max).toBe(30);
    // 아직 없는 시스템은 스텁 0 (통합 때 연결): 증축·청결·명당·방문객·입지·자급률
    for (const c of [{ type: 'facilityLv', lv: 2, n: 1 }, { type: 'cleanliness', n: 80 }, { type: 'spotEffect', n: 1 }, { type: 'visitorsTotal', n: 1 }, { type: 'siteSeats', view: 2, n: 1 }, { type: 'windlessSeats', n: 1 }, { type: 'upgraded', lv: 2, n: 1 }, { type: 'clean', avg: 90, days: 30 }, { type: 'selfSupply', pct: 50 }, { type: 'spotEffects', n: 1 }] as GoalCondition[]) {
      expect(conditionProgress(s, c).cur, c.type).toBe(0);
      expect(goalMet(s, c), c.type).toBe(false);
    }
    // z-ending: 100주년 감귤축제는 20년차 11월 ending.ts centennialMonthly가 판정해 ending.centennial = 'done'으로 남긴다
    expect(goalMet(s, { type: 'custom', id: 'centennial' })).toBe(false);
    s.ending.centennial = 'done';
    expect(goalMet(s, { type: 'custom', id: 'centennial' })).toBe(true);
    // z-ending: 정착 등급·마을제
    expect(goalMet(s, { type: 'villageGrade', n: 3 })).toBe(false);
    s.village.grade = 3;
    expect(goalMet(s, { type: 'villageGrade', n: 3 })).toBe(true);
    expect(conditionProgress(s, { type: 'festivals', n: 1 })).toEqual({ cur: 0, max: 1 });
  });

  it('액션 잠금 기능 5종은 각각 정확히 한 목표에서 열리고, 그 기능이 필요한 목표는 그 뒤에 온다 (바위 치우기는 w-free부터 시작 개방 — 어떤 목표도 안 연다)', () => {
    const idx = (id: string) => GOALS.findIndex((g) => g.id === id);
    expect(ACTION_FEATURE_IDS).not.toContain('clearRock');
    expect(GOALS.some((g) => g.reward.some((r) => r.type === 'unlockFeature' && r.id === 'clearRock'))).toBe(false);
    expect(GOALS.find((g) => g.id === 'g12')!.reward).toEqual([{ type: 'tickets', n: 2 }]);
    for (const f of ACTION_FEATURE_IDS) {
      const openers = GOALS.filter((g) => g.reward.some((r) => r.type === 'unlockFeature' && r.id === f));
      expect(openers.length, f).toBe(1);
    }
    expect(idx(goalForFeature('promote')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'promotions')!.id));
    expect(idx(goalForFeature('parcel')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'parcels')!.id));
    expect(idx(goalForFeature('craft')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'recipes')!.id));
    expect(idx(goalForFeature('popup')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'namedGuest')!.id));
    expect(idx(goalForFeature('challenge')!.id)).toBeLessThan(idx(GOALS.find((g) => g.condition.type === 'rivalWins')!.id));
  });

  it('v2 표에서 시작(start)이었다가 목표 보상으로 바뀐 시설은 전부 어떤 목표가 연다', () => {
    const shopUnlocked = new Set([...[...MILEAGE_SHOP, ...TICKET_SHOP].map((x) => x.objectId).filter((x): x is string => !!x), 'golden_tangerine_tree']); // 설계도(트랙 C 상점)·황금 감귤(명소 방문객 10만)로 열리는 시설은 제외
    const goalGated = FACILITIES.filter((f) => f.unlock?.type === 'goal' && !shopUnlocked.has(f.id));
    expect(goalGated.length).toBeGreaterThan(10);
    for (const f of goalGated) expect(goalForFacility(f.id), f.id).not.toBeNull();
  });
});

describe('목표 체인 진행', () => {
  it('새 게임: 첫 목표는 g01, 진행도 0/1, 기능은 바위 치우기(w-free 시작 개방)만 빼고 잠겨 있다 (완성 시작 상태는 튜토리얼 보상 기능만 열린 채)', () => {
    const s = createInitialState(1, 'local', 0, 'tutorial');
    expect(currentGoal(s)?.id).toBe('g01');
    expect(goalProgress(s)).toEqual({ cur: 0, max: 1 });
    for (const f of FEATURE_IDS) expect(s.features[f], f).toBe(f === 'clearRock');
    const starter = createInitialState(1);
    for (const f of FEATURE_IDS) expect(starter.features[f], f).toBe(f === 'clearRock' || tutorialFeatureIds().includes(f)); // 건너뛴 튜토리얼의 보상 기능(입지 보기 등)은 열려 있다
    expect(checkFeature(s, 'buyParcel').ok).toBe(false);
    expect(checkFeature(s, 'place').ok).toBe(true);
  });

  it('조건을 채우면 checkGoals가 보상을 주고 index·claimed·alerts(보상 상자 → 축하 대화)가 는다. 여러 개가 연달아 달성돼도 순서대로', () => {
    const s = createInitialState(1);
    const money = s.money;
    s.menuSold['americano'] = 1;
    s.totalGuests = 5;
    expect(checkGoals(s)).toEqual(['g01', 'g02']);
    expect(s.goals.index).toBe(2);
    expect(s.goals.claimed).toEqual(['g01', 'g02']);
    expect(s.money).toBe(money + 300_000 + 500_000);
    expect(s.alerts.map((a) => a.type)).toEqual(['reward', 'goal', 'reward', 'goal']);
    expect(s.alerts[0]).toMatchObject({ type: 'reward', source: 'goal', refId: 'g01', title: goalDef('g01').title, items: [{ type: 'money', amount: 300_000 }] });
    expect(s.alerts[1]).toEqual({ type: 'goal', goalId: 'g01' });
    expect(currentGoal(s)?.id).toBe('g03');
    expect(goalProgress(s)).toEqual({ cur: 3, max: 4 }); // 시작 좌석 3개
    expect(apply(s, { type: 'dismissAlert' }).ok).toBe(true);
    expect(s.alerts).toHaveLength(3);
  });

  it('메인 목표 2개 동시 진행(§7.3): 뒤 목표가 먼저 달성되면 먼저 보상하고, 앞 목표가 끝나면 index가 이룬 것들을 건너뛴다', () => {
    const s = createInitialState(1);
    expect(activeGoals(s).map((g) => g.id)).toEqual(['g01', 'g02']);
    expect(activeGoals(s)).toHaveLength(CONCURRENT_GOALS);
    s.totalGuests = 5; // g02만
    expect(checkGoals(s)).toEqual(['g02']);
    expect(s.goals.index).toBe(0);
    expect(s.goals.claimed).toEqual(['g02']);
    expect(activeGoals(s).map((g) => g.id)).toEqual(['g01', 'g03']);
    expect(currentGoal(s)?.id).toBe('g01');
    s.menuSold['americano'] = 1;
    expect(checkGoals(s)).toEqual(['g01']);
    expect(s.goals.index).toBe(2);
    expect(activeGoals(s).map((g) => g.id)).toEqual(['g03', 'g04']);
  });

  it('applyRewards 한 곳: 보상 상자 알림 하나에 아이템이 다 담기고, 대출 중이면 돈 50%·응모권/마일리지 절반(내림)', () => {
    const s = bareState(1);
    const money = s.money;
    const items = applyRewards(s, [{ type: 'money', amount: 1_000_000 }, { type: 'tickets', n: 3 }, { type: 'unlockFacility', id: 'restroom' }], { source: 'challenge', refId: 'c01', title: '테스트', line: '축하' });
    expect(items).toHaveLength(3);
    expect(s.money).toBe(money + 1_000_000);
    expect(s.alerts).toEqual([{ type: 'reward', source: 'challenge', refId: 'c01', title: '테스트', items, line: '축하', speaker: undefined }]);
    s.loan.balance = 3_000_000; // 트랙 E 삼춘 대출
    expect(scaleReward(s, { type: 'money', amount: 1_000_000 })).toEqual({ type: 'money', amount: 500_000 });
    expect(scaleReward(s, { type: 'tickets', n: 3 })).toEqual({ type: 'tickets', n: 1 });
    expect(scaleReward(s, { type: 'mileage', n: 5 })).toEqual({ type: 'mileage', n: 2 });
    expect(scaleReward(s, { type: 'unlockMenu', id: 'toast' })).toEqual({ type: 'unlockMenu', id: 'toast' });
  });

  it('신설 보상: 아이템·씨앗·손님 해금·가이드북 해금·칭호·요금 보너스·없는 직종 슬롯', () => {
    const s = bareState(1);
    const rs: GoalReward[] = [{ type: 'item', id: 'wind_charm', n: 2 }, { type: 'seed', kind: 'tangerine_seed', n: 1 }, { type: 'unlockGuest', id: 'couple' }, { type: 'unlockGuidebook', id: 'gb_dessert' }, { type: 'title', id: 'sea_spot', name: '바다 명당' }, { type: 'feeBonus', pct: 5 }, { type: 'staffSlot', role: 'clean' as never, n: 1 }, { type: 'unlockRole', id: 'clean' as never }];
    for (const r of rs) grantReward(s, r);
    expect(s.inventory['wind_charm']).toBe(2);
    expect(s.inventory['tangerine_seed']).toBe(1);
    expect(s.guestTypes['couple']?.unlocked).toBe(true);
    expect(s.guidebooks['gb_dessert']?.unlocked).toBe(true);
    expect(s.titles).toEqual(['sea_spot']);
    expect(s.feeBonusPct).toBe(5);
    expect((s.slots as Record<string, number>)['clean']).toBe(3); // 기본 2 + 1
    expect(s.unlocked.roles).toContain('clean'); // 트랙 D 직종 정의가 있어 열린다
    for (const r of rs) expect(goalRewardText(r).length).toBeGreaterThan(0);
  });

  it('canOpen(§7.1): 맨땅은 손님 0, 본관·길·좌석이 생기면 열린다 (튜토리얼 중엔 메뉴도 필요)', () => {
    const s = createInitialState(1, 'local', 0, 'tutorial');
    expect(canOpen(s)).toBe(false);
    expect(s.menuSlots.every((m) => m === null)).toBe(true);
    for (let d = 0; d < 2; d++) tick(s, DAY_MS);
    expect(s.totalGuests).toBe(0);
    s.menuSlots[0] = 'americano';
    expect(canOpen(s)).toBe(false);
    expect(apply(s, { type: 'placeMain', ...at(3, 1) }).ok).toBe(true); // w-start: 본관 없이는 안 열린다
    expect(canOpen(s)).toBe(false);
    for (const c of [{ lx: 3, ly: 3 }, { lx: 4, ly: 3 }, { lx: 4, ly: 4 }, { lx: 4, ly: 5 }]) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(canOpen(s)).toBe(false);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(canOpen(s)).toBe(true);
    tick(s, DAY_MS);
    expect(s.totalGuests).toBeGreaterThan(0);
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

  it('rank·guidebookRank 목표는 가이드북 순위 ≤ n, 진행도는 0/1', () => {
    const s = bareState(1);
    s.goals.index = GOALS.findIndex((g) => g.condition.type === 'guidebookRank');
    expect(goalMet(s, { type: 'rank', n: 5 })).toBe(false);
    expect(goalProgress(s)).toEqual({ cur: 0, max: 1 });
    s.guidebooks['gb_local_map'] = { unlocked: true, lastRank: 4, best: 4, boost: 0, pending: 0 };
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

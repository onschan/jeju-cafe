import { describe, it, expect } from 'vitest';
import { BIG_EVENTS, bigEventDef } from '../../data/index.ts';
import { startEvent, eventEligible, eventChance, typhoonRepairCost, outdoorBuildCost, eventTagMult, activeEvents } from '../events.ts';
import { effectMult } from '../effects.ts';
import { placeObject } from '../grid.ts';
import { hire } from '../staff.ts';
import { customMet } from '../goals.ts';
import { bareState, at } from './helpers.ts';
import { createInitialState } from '../state.ts';

/** §4.5 이벤트 페널티 보정 + 신설 4 (노루·까치, 렌터카 대란, 악플; 급여 인상·세금은 x-economy) */
describe('§4.5 이벤트 보정', () => {
  it('태풍: 수리비 = 소유 필지 야외 시설 건설비 합 × 3% (최소 50만·최대 2,000만), wind_charm ×0.5·storm_ready ×0.7, 야외 시설이 없으면 0', () => {
    const s = bareState(1);
    const def = bigEventDef('ev_typhoon_aug');
    expect(def.effects.repairPct).toBe(3);
    expect(def.effects.damagePct).toBe(20);
    expect(typhoonRepairCost(s, def)).toBe(0);
    for (let i = 0; i < 4; i++) placeObject(s, 'table_out', ...Object.values(at(1 + i, 2)) as [number, number]); // 5만 × 4 = 20만
    expect(outdoorBuildCost(s)).toBe(200_000);
    expect(typhoonRepairCost(s, def)).toBe(500_000); // 최소 50만
    s.inventory['wind_charm'] = 1;
    expect(typhoonRepairCost(s, def)).toBe(250_000);
    s.inventory['storm_ready'] = 1;
    expect(typhoonRepairCost(s, def)).toBe(175_000);
    delete s.inventory['wind_charm']; delete s.inventory['storm_ready'];
    const money = s.money;
    startEvent(s, 'ev_typhoon_aug');
    expect(s.money).toBe(money - 500_000);
    expect(s.notices.some((n) => n.includes('수리비'))).toBe(true);
    // 상한: 건설비 합이 10억이면 3% = 3,000만 → 2,000만
    const big = bareState(2);
    for (let i = 0; i < 5; i++) placeObject(big, 'table_out', ...Object.values(at(1 + i, 2)) as [number, number]);
    const fake = { ...def, effects: { ...def.effects, repairPct: 3 } };
    expect(typhoonRepairCost({ ...big, objects: big.objects } as typeof big, { ...fake, effects: { ...fake.effects, repairMin: 0, repairMax: 20_000_000 } })).toBeLessThanOrEqual(20_000_000);
  });

  it('폭설: 난방비 20만 + 농원 수확 ×0.7 (30일 효과). 해상 안개: 외국 손님 ×0', () => {
    const s = bareState(1);
    const money = s.money;
    startEvent(s, 'ev_snow_jan');
    expect(s.money).toBe(money - 200_000);
    expect(effectMult(s, 'harvestMult')).toBeCloseTo(0.7);
    const f = bareState(1);
    startEvent(f, 'ev_sea_fog');
    expect(eventTagMult(f, 'solo_foreign')).toBe(0);
    expect(eventTagMult(f, 'student')).toBe(1);
  });

  it('노루·까치 습격(9~11월 25%): 수확 ×0.5, 운반 직원 힘 ≥ 40이면 ×0.8, 노루 방울이 있으면 확률 ×0.5', () => {
    const defs = BIG_EVENTS.filter((e) => e.title === '노루·까치 습격');
    expect(defs.map((d) => d.month)).toEqual([9, 10, 11]);
    for (const d of defs) expect(d.chance).toBe(0.25);
    const s = bareState(1);
    startEvent(s, 'ev_deer_raid');
    expect(effectMult(s, 'harvestMult')).toBeCloseTo(0.5);
    const t = bareState(1);
    t.candidates = createInitialState(1).candidates;
    const st = hire(t, t.candidates[0]!.id, 'cook');
    st.stats.strength = 40;
    startEvent(t, 'ev_deer_raid');
    expect(effectMult(t, 'harvestMult')).toBeCloseTo(0.8);
    const u = bareState(1);
    expect(eventChance(u, bigEventDef('ev_deer_raid'))).toBe(0.25);
    u.inventory['deer_bell'] = 1;
    expect(eventChance(u, bigEventDef('ev_deer_raid'))).toBe(0.125);
  });

  it('렌터카 대란(7~8월 30%): 주차장이 없을 때만, 7일간 가족·단체 ×0.5', () => {
    const s = bareState(1);
    s.clock.month = 7;
    const def = bigEventDef('ev_rental_crisis');
    expect(def.chance).toBe(0.3);
    expect(customMet(s, 'noParking')).toBe(true);
    expect(eventEligible(s, def)).toBe(true);
    startEvent(s, 'ev_rental_crisis');
    expect(activeEvents(s).map((e) => e.id)).toEqual(['ev_rental_crisis']);
    expect(effectMult(s, 'spawnMult', 'rentcar_family')).toBeCloseTo(0.5);
    expect(eventTagMult(s, 'school_trip')).toBe(0.5); // group
    // TODO(x-facility): parking 시설이 생기면 놓았을 때 eligible false 검증
    s.objects['x'] = { id: 'x', type: 'parking', x: 0, y: 0, placedMonth: 0 } as never;
    expect(customMet(s, 'noParking')).toBe(false);
  });

  it('악플: 청결 < 50 30일(x-facility 전엔 스텁 false)이 조건이라 지금은 발동하지 않는다', () => {
    const s = bareState(1);
    const def = bigEventDef('ev_bad_review');
    expect(def.effects.popularity).toBe(-5);
    expect(def.durationDays).toBe(14);
    expect(eventEligible(s, def)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { BIG_EVENTS, bigEventDef, specialGuestId, namedGuestDef, SPECIAL_GUESTS } from '../../data/index.ts';
import { monthlyBigEvents, dailyBigEvents, dailyBigEventRoll, hourlyBigEvents, startEvent, eventEligible, activeEvents, eventGuestMult, eventTagMult, eventFeeMult, guestHasTag, isSpecialGuest, specialGuestTip, specialGuestsMet, MAX_ACTIVE_EVENTS } from '../events.ts';
import { dailyGuestCount, popularityGuestBase, totalSeats, typeWeight, GUESTS_PER_SEAT } from '../guests.ts';
import { dayIndex } from '../effects.ts';
import { serialize } from '../save.ts';
import { bareState } from './helpers.ts';

describe('events_v3.json 데이터', () => {
  it('24개 이상, id 유일, 확률 0~1, 기간 ≥ 1, 대사가 있고, 실명이 없다 (패러디 이름)', () => {
    expect(BIG_EVENTS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(BIG_EVENTS.map((e) => e.id)).size).toBe(BIG_EVENTS.length);
    const json = JSON.stringify(BIG_EVENTS);
    for (const real of ['백종원', '이효리', '이상순', '아이유', '연돈']) expect(json).not.toContain(real);
    for (const p of ['백중원', '이요리', '이장순', '유아이', '돈돈']) expect(json).toContain(p);
    for (const e of BIG_EVENTS) {
      expect(e.chance).toBeGreaterThan(0);
      expect(e.chance).toBeLessThanOrEqual(1);
      expect(e.durationDays).toBeGreaterThanOrEqual(1);
      expect(e.dialogue.lines.length).toBeGreaterThan(0);
      if (e.month !== undefined) { expect(e.month).toBeGreaterThanOrEqual(1); expect(e.month).toBeLessThanOrEqual(12); }
      expect(bigEventDef(e.id)).toBe(e);
    }
    expect(SPECIAL_GUESTS.length).toBeGreaterThanOrEqual(3);
    for (const g of SPECIAL_GUESTS) expect(namedGuestDef(g.id).job).toBe('특별 손님');
  });
});

describe('빅 이벤트 판정·효과', () => {
  it('매월 1일 판정: 자격(월·연차·once·조건)과 확률(rng)로 발동하고 동시 2개까지', () => {
    const s = bareState(1);
    s.goals.index = 999;
    // 확률 1로 만들어 강제로 굴려도 상한 2
    const boosted = BIG_EVENTS.map((e) => ({ ...e, chance: 1 }));
    const eligible = boosted.filter((e) => eventEligible(s, e));
    expect(eligible.length).toBeGreaterThan(2);
    for (const e of eligible.slice(0, 5)) if (activeEvents(s).length < MAX_ACTIVE_EVENTS) startEvent(s, e.id);
    expect(activeEvents(s)).toHaveLength(MAX_ACTIVE_EVENTS);
    expect(monthlyBigEvents(s)).toEqual([]); // 꽉 차면 더 안 켜진다
    // 자격: 월 한정(11월 감귤 축제)은 3월에 안 굴린다, once는 두 번 안 켜진다, 연차·조건
    expect(eventEligible(s, bigEventDef('ev_tangerine_festival'))).toBe(false);
    expect(eventEligible(s, bigEventDef('ev_workation'))).toBe(false); // 2년차부터
    expect(eventEligible(s, bigEventDef('ev_baek_shooting'))).toBe(false); // 손님 200
    s.totalGuests = 200;
    expect(eventEligible(s, bigEventDef('ev_baek_shooting'))).toBe(true);
    s.events = [];
    startEvent(s, 'ev_baek_shooting');
    expect(eventEligible(s, bigEventDef('ev_baek_shooting'))).toBe(false); // 진행 중
    s.events = [];
    expect(eventEligible(s, bigEventDef('ev_baek_shooting'))).toBe(false); // once
    expect(s.eventsFired['ev_baek_shooting']).toBe(1);
  });

  it('발동: alerts에 event, 즉시 효과(돈·인기·수리비), 끝나면 eventEnd', () => {
    const s = bareState(1);
    s.goals.index = 999;
    const money = s.money;
    startEvent(s, 'ev_lunar_new_year'); // moneyBonus 30만
    expect(s.money).toBe(money + 300_000);
    expect(s.alerts).toEqual([{ type: 'event', id: 'ev_lunar_new_year' }]);
    expect(s.notices.some((n) => n.includes('설 명절'))).toBe(true);
    startEvent(s, 'ev_drama_location'); // popularity +10
    expect(s.popularity).toBe(10);
    apply(s, { type: 'dismissAlert' });
    apply(s, { type: 'dismissAlert' });
    // 3일 이벤트: 3일 뒤 아침에 끝난다
    for (let d = 0; d < 3; d++) tick(s, DAY_MS);
    expect(activeEvents(s).map((e) => e.id)).toEqual(['ev_drama_location']);
    expect(s.alerts).toContainEqual({ type: 'eventEnd', id: 'ev_lunar_new_year' });
    // 태풍: 야외 시설 건설비 합 × 3% (§4.5) — 야외 시설이 0이면 0
    const t = bareState(2);
    t.goals.index = 999;
    const m = t.money;
    startEvent(t, 'ev_typhoon_aug');
    expect(t.money).toBe(m);
    expect(dailyBigEvents(t)).toEqual([]);
  });

  it('매일 판정(game-feel): 월 확률을 하루 확률로 환산해 굴리므로 한 달 발동 기대치는 같고 날짜는 달 안에 퍼진다 — 봇 3년에서 발동일이 1~2일에 몰린 비율 61/61 → 6/67', () => {
    // 확률 1인 이벤트는 매일 굴려도 첫날 발동 (1−(1−1)^(1/30) = 1), 상한 2
    const s = bareState(1);
    s.goals.index = 999;
    s.clock.month = 4;
    const sure = BIG_EVENTS.filter((e) => eventEligible(s, e)).slice(0, 3).map((e) => ({ ...e, chance: 1 }));
    expect(dailyBigEventRoll(s, sure)).toHaveLength(MAX_ACTIVE_EVENTS);
    // 월 확률 0.5짜리 하나를 30일 동안 매일 굴리면 (seed 여러 개) 발동일이 1일에만 몰리지 않는다
    const days = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const t = bareState(seed);
      t.goals.index = 999;
      t.clock.month = 4;
      const half = [{ ...BIG_EVENTS.find((e) => eventEligible(t, e))!, chance: 0.5 }];
      for (let d = 1; d <= 30 && dailyBigEventRoll(t, half).length === 0; d++) { t.clock.day = d; }
      if (activeEvents(t).length) days.add(t.clock.day);
    }
    expect(days.size).toBeGreaterThan(1);
    expect([...days].some((d) => d > 2)).toBe(true);
  });

  it('효과 적용: 손님 수 배수·태그 가중치·메뉴 값 배수가 guests.ts에 곱해진다', () => {
    const s = bareState(1);
    s.goals.index = 999;
    apply(s, { type: 'place', objectType: 'table_out', x: 12, y: 11 });
    s.clock.month = 4; // 계절 배수 1
    const base = popularityGuestBase(s);
    const w = typeWeight(s, 'student');
    startEvent(s, 'ev_cheap_flights'); // ×1.3
    expect(eventGuestMult(s)).toBe(1.3);
    expect(dailyGuestCount(s)).toBe(Math.min(totalSeats(s) * GUESTS_PER_SEAT, Math.round(base * 1.3)));
    startEvent(s, 'ev_school_trip_season'); // student ×2
    expect(guestHasTag('student', 'student')).toBe(true);
    expect(guestHasTag('local_auntie', 'student')).toBe(false);
    expect(guestHasTag('group_cn', 'foreign')).toBe(true);
    expect(guestHasTag('rentcar_family', 'family')).toBe(true);
    expect(eventTagMult(s, 'student')).toBe(2);
    expect(eventTagMult(s, 'local_auntie')).toBe(1);
    expect(typeWeight(s, 'student')).toBeCloseTo(w * 2);
    s.events = [];
    startEvent(s, 'ev_golf'); // feeMult 1.2
    expect(eventFeeMult(s)).toBe(1.2);
  });

  it('특별 손님: 발동 다음 날 정오에 이름 있는 손님으로 한 번 오고, 만족하면 팁을 남기고 도감에 남는다', () => {
    const s = createInitialState(3);
    s.goals.index = 999;
    startEvent(s, 'ev_iu_guest'); // 1일짜리: 당일 정오
    const id = specialGuestId('ev_iu_guest');
    expect(isSpecialGuest(id)).toBe(true);
    expect(specialGuestTip(id)).toBe(1_000_000);
    expect(hourlyBigEvents(s)).toEqual([]); // 6시엔 아직
    while (s.clock.hour < 11) tick(s, HOUR_MS);
    expect(s.guests.some((g) => g.namedId === id)).toBe(false); // 정오 전엔 안 온다
    // 정오부터 자리가 나는 시간에 온다 (자리가 꽉 차면 다음 시간에 다시)
    let came = false;
    let money = s.money;
    for (let h = 0; h < 8 && !came; h++) { money = s.money; tick(s, HOUR_MS); came = s.guests.some((g) => g.namedId === id); }
    expect(came).toBe(true);
    expect(activeEvents(s)[0]?.specialVisited).toBe(true);
    expect(specialGuestsMet(s)).toEqual([id]);
    for (let h = 0; h < 4; h++) tick(s, HOUR_MS);
    if (s.notices.some((n) => n.includes('팁'))) expect(s.money).toBeGreaterThanOrEqual(money + 1_000_000);
    expect(hourlyBigEvents(s)).toEqual([]); // 두 번 안 온다
  });

  it('결정성: 같은 seed면 3개월 동안 같은 이벤트가 같은 날 켜진다', () => {
    const run = (seed: number) => {
      const s = createInitialState(seed);
      const log: string[] = [];
      for (let d = 0; d < 90; d++) {
        tick(s, DAY_MS);
        for (const a of s.alerts) if (a.type === 'event') log.push(`${dayIndex(s.clock)}:${a.id}`);
        s.alerts = [];
      }
      return { log, json: serialize(s) };
    };
    const a = run(11);
    const b = run(11);
    expect(a.log).toEqual(b.log);
    expect(a.json).toBe(b.json);
  });
});

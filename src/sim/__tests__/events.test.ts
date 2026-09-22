import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { BIG_EVENTS, bigEventDef, specialGuestId, namedGuestDef, SPECIAL_GUESTS } from '../../data/index.ts';
import { monthlyBigEvents, dailyBigEvents, hourlyBigEvents, eventStartDelay, EVENT_START_SPREAD, scheduledEvents, startEvent, eventEligible, activeEvents, eventGuestMult, eventTagMult, eventFeeMult, guestHasTag, isSpecialGuest, specialGuestTip, specialGuestsMet, MAX_ACTIVE_EVENTS, weeklyMiniEvent, slotEvents } from '../events.ts';
import { dailyGuestCount, popularityGuestBase, totalSeats, typeWeight, GUESTS_PER_SEAT } from '../guests.ts';
import { dayIndex } from '../effects.ts';
import { serialize } from '../save.ts';
import { bareState } from './helpers.ts';

describe('events_v3.json 데이터', () => {
  it('15개, id 유일, 확률 0~1, 기간 ≥ 1, 대사가 있고, 실명이 없다 (패러디 이름)', () => {
    expect(BIG_EVENTS.length).toBe(15);
    expect(new Set(BIG_EVENTS.map((e) => e.id)).size).toBe(BIG_EVENTS.length);
    const json = JSON.stringify(BIG_EVENTS);
    for (const real of ['백종원', '이효리', '이상순', '아이유']) expect(json).not.toContain(real);
    for (const p of ['백중원', '이요리', '유아이']) expect(json).toContain(p);
    for (const e of BIG_EVENTS) {
      if (e.weekly) expect(e.chance).toBe(0); else expect(e.chance).toBeGreaterThan(0); // 주간 미니 사건은 매월 판정에서 빠진다 (weeklyMiniEvent가 고른다)
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
    expect(eligible.length).toBeGreaterThanOrEqual(1);
    for (const id of ['ev_cheap_flights', 'ev_lunar_new_year', 'ev_tangerine_festival']) if (activeEvents(s).length < MAX_ACTIVE_EVENTS) startEvent(s, id);
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

  it('발동일 분산(game-feel): 1일 판정은 그대로(rng 소비 동일), k번째 예약은 eventStartDelay일 뒤 아침에 발동 — 예약 중엔 효과·대화가 없다', () => {
    const s = bareState(1);
    s.goals.index = 999;
    s.clock.month = 4;
    const money = s.money;
    const e = startEvent(s, 'ev_lunar_new_year', 3); // moneyBonus 30만은 3일 뒤
    expect(s.money).toBe(money);
    expect(s.alerts).toEqual([]);
    expect(activeEvents(s)).toEqual([]);
    expect(scheduledEvents(s)).toHaveLength(1);
    expect(eventEligible(s, bigEventDef('ev_lunar_new_year'))).toBe(false); // 예약 중이면 다시 안 굴린다
    for (let d = 0; d < 3; d++) tick(s, DAY_MS);
    expect(activeEvents(s).map((x) => x.id)).toEqual([e.id]);
    expect(s.money).toBe(money + 300_000);
    expect(s.alerts).toContainEqual({ type: 'event', id: 'ev_lunar_new_year' });
    // 지연일은 달·순번에 따라 0~EVENT_START_SPREAD−1 사이에서 퍼진다
    const days = new Set<number>();
    for (let mi = 0; mi < 12; mi++) for (let k = 0; k < 2; k++) { const d = eventStartDelay(mi, k); expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThan(EVENT_START_SPREAD); days.add(d); }
    expect(days.size).toBeGreaterThan(3);
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
    startEvent(s, 'ev_iu_guest'); // youth ×2
    expect(guestHasTag('student', 'student')).toBe(true);
    expect(guestHasTag('local_auntie', 'student')).toBe(false);
    expect(guestHasTag('group_cn', 'foreign')).toBe(true);
    expect(guestHasTag('rentcar_family', 'family')).toBe(true);
    expect(eventTagMult(s, 'student')).toBe(2);
    expect(eventTagMult(s, 'local_auntie')).toBe(1);
    expect(typeWeight(s, 'student')).toBeCloseTo(w * 2);
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

// ---------- game-feel P1: 주간 미니 사건 ----------
describe('주간 미니 사건 (weekly)', () => {
  it('weekly 4종은 매월 판정에서 빠지고 동시 상한에 안 센다; 토요일 아침 40%로 하나 발동(하루), 끝나도 eventEnd 알림이 없다', () => {
    const weekly = BIG_EVENTS.filter((e) => e.weekly);
    expect(weekly.map((e) => e.id).sort()).toEqual(['ev_group_booking', 'ev_influencer_visit', 'ev_rainy_indoor', 'ev_weekend_rush']);
    const s = createInitialState(1);
    for (const e of weekly) expect(eventEligible(s, e)).toBe(false);
    // 토요일(6일)로 맞추고 rng를 여러 번 돌려 한 번은 발동
    let fired: string | null = null;
    for (let i = 0; i < 40 && !fired; i++) { s.clock.day = 6; fired = weeklyMiniEvent(s); }
    expect(fired).not.toBeNull();
    expect(bigEventDef(fired!).weekly).toBe(true);
    expect(s.alerts.some((a) => a.type === 'event' && a.id === fired)).toBe(true);
    expect(slotEvents(s)).toHaveLength(0); // 동시 상한에 안 센다
    expect(eventGuestMult(s)).toBeGreaterThan(1);
    s.alerts = [];
    s.clock.day = 7;
    const ended = dailyBigEvents(s);
    expect(ended).toContain(fired);
    expect(s.alerts.some((a) => a.type === 'eventEnd')).toBe(false);
    expect(weeklyMiniEvent(s)).toBeNull(); // 평일
  });
});

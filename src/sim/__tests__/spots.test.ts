/** 트랙 C (스펙 §3.3·§3.4): 명소 24 Lv5 조건·효과, 방문객 누적·상품 5단계, 투어 버스·투어 개최, 선물, 상점 */
import { bareState, forceNextOutcome } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { tourChances } from '../spots.ts';
import { giftChances } from '../items.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, monthIndex } from '../clock.ts';
import { placeObject, sceneryScore } from '../grid.ts';
import { objectStats } from '../compat.ts';
import { spawnGuests, spawnMultiplier } from '../guests.ts';
import { walletOf, isUnlocked, SAT_REGULAR } from '../segments.ts';
import {
  spotCost, spotRequirements, canInvestSpot, spotVisitors, totalSpotVisitors, dailyVisitors, totalDailyVisitors, spotGuestBonus, dailySpots, addVisitors, checkVisitorPrizes,
  spotSpawnMult, spotWalletMult, spotFeePct, spotSceneryBonus, tagPopularity, tourScore, canHostTour, hostTour, canSetTourBus, chargeTourBus, busSpots,
  SPOT_BASE_COST, SPOT_COST_MULT, SPOT_TAG_MULT, SPOT_TAG_MULT_CAP, SPOT_LV5_MILEAGE, VISITOR_PRIZES, GOLDEN_TANGERINE_VISITORS, VISITORS_PER_APPEAL, BUS_VISITOR_MULT, VISITOR_GUEST_RATE,
  TOUR_BUS_FEE, TOUR_BUS_GROUP_MULT, TOUR_SUCCESS_SCORE, TOUR_MONEY_PER_SCORE, TOUR_SUCCESS_VISITORS, TOUR_FAIL_MONEY, TOUR_FAIL_VISITORS, spotStarReq,
} from '../spots.ts';
import { grantItem, canGiveGift, giftFits, monthlyGifts, GIFT_POPULARITY, GIFT_SATISFACTION, GIFT_FIT_MULT } from '../items.ts';
import { HAMMER_MAX } from '../shop.ts';
import { SPOTS, spotDef, itemDef, objectDef, guestTypeDef, GIFTS, MILEAGE_SHOP, TICKET_SHOP, SPECIAL_ITEM_IDS, giftDef } from '../../data/index.ts';
import { hasIdToken } from '../../data/labels.ts';

/** Lv2~5 조건을 다 채운다 */
function meetAll(s: ReturnType<typeof bareState>, id: string) {
  s.spotVisitors[id] = 1e6; s.spotPrizes[id] = VISITOR_PRIZES.length; s.clock.year = 2; s.star = 5;
  const g = spotDef(id).lv2GuestId; if (g) s.segmentPopularity[g] = 99;
}
function rich(seed = 1) { const s = bareState(seed); s.money = 1e12; return s; }

describe('명소 24 데이터 (§3.4.1·§3.4.3)', () => {
  it('24곳 · 분류 4 × 순서 1~6 · 투자금 = B_k × (1, 2, 4.5, 8, 13) · 매력 Lv1 9~44 → Lv5 55~163', () => {
    expect(SPOTS).toHaveLength(24);
    for (const cat of ['sight', 'food', 'play', 'nature'] as const) expect(SPOTS.filter((d) => d.category === cat).map((d) => d.order).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const d of SPOTS) {
      expect(d.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
      for (const l of d.levels) expect(l.cost).toBe(spotCost(d.order, l.level));
      expect(d.levels[0]!.cost).toBe(SPOT_BASE_COST[d.order - 1]);
      expect(d.levels[4]!.cost).toBe(SPOT_BASE_COST[d.order - 1]! * SPOT_COST_MULT[4]);
      expect(d.levels[0]!.appeal).toBeGreaterThanOrEqual(9); expect(d.levels[4]!.appeal).toBeLessThanOrEqual(163);
    }
    // 24곳 전부 Lv5 = 8억 2,080만
    const total = SPOTS.reduce((n, d) => n + d.levels.reduce((m, l) => m + l.cost, 0), 0);
    expect(total).toBe(820_800_000);
  });

  it('Lv3 아이템은 전부 강화 아이템 표에 있고, Lv5 특수는 k=6 명소 4곳, 태그·시설 분류가 분류대로', () => {
    const TAG = { sight: 'female', food: 'group', play: 'youth', nature: 'senior' } as const;
    const FAC = { sight: 'rest', food: 'food', play: 'fun', nature: 'rest' } as const;
    for (const d of SPOTS) {
      expect(d.lv3ItemId).toBeTruthy();
      expect(itemDef(d.lv3ItemId!).value).toBeGreaterThan(0);
      expect(d.tag).toBe(TAG[d.category]);
      expect(d.facilityCategory).toBe(FAC[d.category]);
      expect(d.lv5Special !== null).toBe(d.order === 6);
      if (d.lv5Special) expect(hasIdToken(d.lv5Special.text)).toBe(false);
    }
    expect(spotDef('yacht_tour').lv5Special).toMatchObject({ type: 'walletMult', guestId: 'yacht_owner', mult: 1.5 });
    expect(spotDef('barley_brewery').lv5Special).toMatchObject({ type: 'popularity', guestId: 'golfer', n: 20 });
  });
});

describe('Lv별 조건 (§3.4.2)', () => {
  it('Lv2 방문객 1,000 / Lv3 5,000 + 2년차 / Lv4 15,000 + Lv2 손님 인기 40 / Lv5 40,000 + ★(k별 3·4·5)', () => {
    const s = rich();
    const id = 'canola_field';
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(true); // Lv1: 조건 없음
    expect(spotRequirements(s, id)).toEqual([{ text: '누적 방문객 1,000명', met: false }]);
    expect(canInvestSpot(s, id)).toMatchObject({ ok: false, reason: expect.stringContaining('방문객') });
    s.spotVisitors[id] = 1000;
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(true); // Lv2
    expect(isUnlocked(s, 'insta_traveler')).toBe(true);
    // Lv3: 방문객 5,000 + 2년차
    s.spotVisitors[id] = 5000; s.spotPrizes[id] = 2;
    expect(spotRequirements(s, id).map((r) => r.met)).toEqual([true, false]);
    expect(canInvestSpot(s, id).ok).toBe(false);
    s.clock.year = 2;
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(true); // Lv3
    expect(s.inventory['flower_poster']).toBe(1); // Lv3 아이템
    // Lv4: 15,000 + insta_traveler 인기 40
    s.spotVisitors[id] = 15000; s.spotPrizes[id] = 3;
    expect(canInvestSpot(s, id).ok).toBe(false);
    s.segmentPopularity['insta_traveler'] = 40;
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(true); // Lv4
    expect(s.board.quests['q_influencer']!.status).toBe('offered');
    // Lv5: 40,000 + ★3 (k=1)
    s.spotVisitors[id] = 40000; s.spotPrizes[id] = 3;
    expect(spotRequirements(s, id)).toEqual([{ text: '누적 방문객 40,000명', met: true }, { text: '★3 이상', met: false }]);
    s.star = 3;
    const m0 = s.mileage;
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(true); // Lv5
    expect(s.mileage).toBe(m0 + SPOT_LV5_MILEAGE);
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(false); // 최고
  });

  it('Lv5 ★ 조건: k=1·2 → 3, 3·4 → 4, 5·6 → 5', () => {
    expect([1, 2, 3, 4, 5, 6].map(spotStarReq)).toEqual([3, 3, 4, 4, 5, 5]);
    const s = rich(); s.rank = 9;
    for (const d of SPOTS) { s.spots[d.id] = 4; s.spotVisitors[d.id] = 1e6; s.spotPrizes[d.id] = 4; }
    s.clock.year = 2; s.star = 4;
    expect(canInvestSpot(s, 'canola_field').ok).toBe(true);   // k=1 ★3
    expect(canInvestSpot(s, 'seongsan').ok).toBe(true);       // k=4 ★4
    expect(canInvestSpot(s, 'bijarim').ok).toBe(false);       // k=5 ★5
    expect(canInvestSpot(s, 'manjanggul').ok).toBe(false);    // k=6 ★5
  });

  it('24곳 전부 Lv5까지 투자 가능 (조건을 채우면), 특수: 요트 오너 소지금 ×1.5 · 골퍼 인기 +20 · 한라산 정령 ×3 · 만장굴 손님 해금(없으면 안내)', () => {
    const s = rich(); s.rank = 9;
    const w0 = walletOf(s, 'yacht_owner');
    for (const cat of ['sight', 'food', 'play', 'nature'] as const) {
      for (const d of SPOTS.filter((x) => x.category === cat).sort((a, b) => a.order - b.order)) {
        meetAll(s, d.id);
        for (let lv = 1; lv <= 5; lv++) {
          const r = apply(s, { type: 'investSpot', id: d.id });
          expect(r.ok, `${d.id} Lv${lv}: ${r.reason}`).toBe(true);
        }
        expect(s.spots[d.id]).toBe(5);
        expect(s.inventory[d.lv3ItemId!]).toBeGreaterThanOrEqual(1);
        if (d.id === 'manjanggul') expect(s.notices.some((n) => n.includes('박물관장 가족'))).toBe(true); // 아직 없는 손님 → 안내
      }
    }
    expect(spotWalletMult(s, 'yacht_owner')).toBe(1.5);
    expect(walletOf(s, 'yacht_owner')).toBe(Math.round(w0 * 1.5));
    expect(s.mileage).toBeGreaterThanOrEqual(24 * SPOT_LV5_MILEAGE);
    // 골퍼 인기 +20 (Lv5 특수)는 따로: Lv2 손님(골퍼) 인기 조건 40에서 시작
    const s2 = rich(); s2.rank = 9; s2.spots['udo_peanut_village'] = 4; s2.spots['barley_brewery'] = 4; meetAll(s2, 'barley_brewery'); s2.segmentPopularity['golfer'] = 40;
    expect(apply(s2, { type: 'investSpot', id: 'barley_brewery' }).ok).toBe(true);
    expect(s2.segmentPopularity['golfer']).toBe(60);
  });
});

describe('Lv별 효과 (§3.4.2)', () => {
  it('태그 손님 유입 배수: Lv1 ×1.05 … Lv5 ×1.25, 같은 태그 합산 상한 ×2, 다른 태그는 1', () => {
    const s = bareState(1);
    s.spots['canola_field'] = 1; // sight → female
    const female = guestTypeDef('insta_traveler'); expect(female.tags.gender).toBe('female');
    expect(spotSpawnMult(s, 'insta_traveler')).toBeCloseTo(SPOT_TAG_MULT[1]);
    s.spots['canola_field'] = 5;
    expect(spotSpawnMult(s, 'insta_traveler')).toBeCloseTo(1.25);
    expect(spotSpawnMult(s, 'student')).toBe(1); // youth·any
    for (const d of SPOTS.filter((x) => x.category === 'sight')) s.spots[d.id] = 5;
    expect(spotSpawnMult(s, 'insta_traveler')).toBe(SPOT_TAG_MULT_CAP); // 1.25^6 = 3.8 → 상한 2
    expect(spawnMultiplier(s, 'insta_traveler')).toBeCloseTo(spawnMultiplier(bareState(1), 'insta_traveler') * SPOT_TAG_MULT_CAP);
    // 투어 버스: 단체 ×1.3
    s.tourBus = true;
    expect(spotSpawnMult(s, 'school_trip')).toBeCloseTo(TOUR_BUS_GROUP_MULT);
  });

  it('요금: 분류 대응 시설 Lv3 +2% · Lv5 +5% (objectStats에 반영), 경관: Lv4 +1 · Lv5 +2 전 좌석', () => {
    const s = bareState(1);
    const seat = placeObject(s, 'table_out', X(4), Y(5));
    const fee0 = objectStats(s, seat.id).feePct;
    const sc0 = sceneryScore(s, X(4), Y(5));
    expect(spotFeePct(s, 'rest')).toBe(0);
    s.spots['canola_field'] = 3; // sight → rest
    expect(spotFeePct(s, 'rest')).toBe(2);
    expect(spotFeePct(s, 'food')).toBe(0);
    s.spots['canola_field'] = 5; s.spots['dongmun_market'] = 4;
    expect(spotFeePct(s, 'rest')).toBe(5);
    expect(spotFeePct(s, 'food')).toBe(2);
    expect(spotSceneryBonus(s)).toBe(2 + 1);
    expect(sceneryScore(s, X(4), Y(5))).toBe(sc0 + 3);
    const cat = objectDef(seat.type).category;
    expect(objectStats(s, seat.id).feePct).toBe(fee0 + spotFeePct(s, cat));
    if (cat === 'rest') expect(objectStats(s, seat.id).feePct).toBe(fee0 + 5);
  });
});

describe('방문객 누적·상품 (§3.4.2·§3.4.4)', () => {
  it('방문객/일 = 매력 × 2 (투어 버스 ×1.3), 카페 유입 = Σ × 3%, 매일 누적', () => {
    const s = bareState(1);
    expect(dailyVisitors(s, 'canola_field')).toBe(0);
    s.spots['canola_field'] = 2; // 매력 20
    expect(dailyVisitors(s, 'canola_field')).toBe(20 * VISITORS_PER_APPEAL);
    s.tourBus = true;
    expect(dailyVisitors(s, 'canola_field')).toBe(Math.round(40 * BUS_VISITOR_MULT));
    s.tourBus = false;
    s.spots['dongmun_market'] = 5; // 55 → 110
    expect(totalDailyVisitors(s)).toBe(40 + 110);
    expect(spotGuestBonus(s)).toBe(Math.floor(150 * VISITOR_GUEST_RATE));
    dailySpots(s);
    expect(spotVisitors(s, 'canola_field')).toBe(40);
    expect(spotVisitors(s, 'dongmun_market')).toBe(110);
    expect(totalSpotVisitors(s)).toBe(150);
    // 틱으로도 (하루 지나면 한 번)
    const v0 = spotVisitors(s, 'canola_field');
    tick(s, DAY_MS);
    expect(spotVisitors(s, 'canola_field')).toBe(v0 + 40);
  });

  it('상품 5단계: 1,000 응모권 1 / 5,000 마일리지 3 / 20,000 감귤 씨앗 2 / 50,000 묶음팩(감귤 3·한라봉 2) / 전체 100,000 황금 감귤 1회', () => {
    const s = bareState(1);
    s.spots['canola_field'] = 1;
    addVisitors(s, 'canola_field', 999);
    expect(s.tickets).toBe(0);
    addVisitors(s, 'canola_field', 1);
    expect(s.tickets).toBe(1); expect(s.spotPrizes['canola_field']).toBe(1);
    addVisitors(s, 'canola_field', 4000);
    expect(s.mileage).toBe(3); expect(s.spotPrizes['canola_field']).toBe(2);
    addVisitors(s, 'canola_field', 15000);
    expect(s.inventory['tangerine_seed']).toBe(2);
    addVisitors(s, 'canola_field', 30000);
    expect(s.inventory['tangerine_seed']).toBe(5); expect(s.inventory['hallabong_seed']).toBe(2);
    expect(s.spotPrizes['canola_field']).toBe(VISITOR_PRIZES.length);
    expect(s.inventory['golden_tangerine']).toBeUndefined();
    // 한 번에 여러 단계를 건너뛰어도 전부 준다
    s.spots['oreum'] = 1;
    addVisitors(s, 'oreum', 25000);
    expect(s.spotPrizes['oreum']).toBe(3); expect(s.tickets).toBe(2); expect(s.mileage).toBe(6);
    // 전체 합산 10만 → 황금 감귤 1회
    addVisitors(s, 'oreum', GOLDEN_TANGERINE_VISITORS);
    expect(s.inventory['golden_tangerine']).toBe(1);
    expect(s.goldenTangerineGiven).toBe(true);
    checkVisitorPrizes(s, 'oreum');
    expect(s.inventory['golden_tangerine']).toBe(1);
  });
});

describe('투어 버스 (§3.4.5)', () => {
  it('열쇠가 있어야 계약, 계약 시 즉시 50만 원, 월초마다 50만 원(계약권 달은 무료), 해지', () => {
    const s = bareState(1); s.money = 10_000_000;
    expect(apply(s, { type: 'setTourBus', on: true })).toMatchObject({ ok: false, reason: expect.stringContaining('열쇠') });
    grantItem(s, 'tour_bus_key');
    expect(canSetTourBus(s, true).ok).toBe(true);
    expect(apply(s, { type: 'setTourBus', on: true }).ok).toBe(true);
    expect(s.tourBus).toBe(true);
    expect(s.money).toBe(10_000_000 - TOUR_BUS_FEE);
    expect(apply(s, { type: 'setTourBus', on: true }).ok).toBe(false); // 이미
    s.tourBusFreeMonths = 1;
    chargeTourBus(s);
    expect(s.money).toBe(10_000_000 - TOUR_BUS_FEE); expect(s.tourBusFreeMonths).toBe(0);
    chargeTourBus(s);
    expect(s.money).toBe(10_000_000 - 2 * TOUR_BUS_FEE);
    expect(apply(s, { type: 'setTourBus', on: false }).ok).toBe(true);
    chargeTourBus(s);
    expect(s.money).toBe(10_000_000 - 2 * TOUR_BUS_FEE);
  });

  it('버스가 오는 명소 = 계약 중 + Lv3 이상 + Lv2 손님, 월초 틱에서 요금이 나간다', () => {
    const s = bareState(1); s.money = 1e8;
    s.spots['canola_field'] = 3;
    expect(busSpots(s)).toEqual([]);
    s.tourBus = true;
    expect(busSpots(s).map((d) => d.id)).toEqual(['canola_field']);
    const m0 = s.money;
    const mi = monthIndex(s.clock);
    while (monthIndex(s.clock) === mi) tick(s, DAY_MS);
    expect(s.money).toBeLessThanOrEqual(m0 - TOUR_BUS_FEE);
  });
});

describe('투어 개최 (§3.4.5)', () => {
  it('점수 = 매력 + 30 × (태그 손님 인기 ÷ 100) + 콤보 수, 60 이상 성공: 점수 × 2만 원 + 방문객 2,000, 실패: 100만 원 + 500. 2년차부터 월 1회', () => {
    const s = bareState(1); s.money = 0;
    s.spots['canola_field'] = 2; // 매력 20
    for (const id of Object.keys(s.guestTypes)) s.segmentPopularity[id] = 0;
    expect(tagPopularity(s, 'female')).toBe(0);
    expect(tourScore(s, 'canola_field')).toBe(20);
    expect(canHostTour(s, 'canola_field')).toMatchObject({ ok: false, reason: expect.stringContaining('2년차') });
    s.clock.year = 2;
    expect(canHostTour(s, 'sangumburi').ok).toBe(false); // 미투자
    forceNextOutcome(s, 'success', tourChances(s).chances); // staff-luck: 판정 「성공(×1)」으로 고정 — 투어 공식 자체를 본다
    expect(apply(s, { type: 'hostTour', spotId: 'canola_field' }).ok).toBe(true);
    expect(s.lastTour).toMatchObject({ spotId: 'canola_field', score: 20, success: false, money: TOUR_FAIL_MONEY, visitors: TOUR_FAIL_VISITORS });
    expect(s.money).toBe(TOUR_FAIL_MONEY);
    expect(spotVisitors(s, 'canola_field')).toBe(TOUR_FAIL_VISITORS);
    expect(apply(s, { type: 'hostTour', spotId: 'canola_field' }).ok).toBe(false); // 월 1회
    expect(apply(s, { type: 'dismissTour' }).ok).toBe(true); expect(s.lastTour).toBeNull();
    // 다음 달, 성공 케이스: 매력 55 + 30 × 0.5 + 콤보 3 = 73
    s.tourMonth = -1; s.money = 0;
    s.spots['canola_field'] = 5;
    for (const id of Object.keys(s.guestTypes)) if (guestTypeDef(id).tags.gender === 'female') s.segmentPopularity[id] = 50;
    s.codex.combos = ['a', 'b', 'c'];
    const score = tourScore(s, 'canola_field');
    expect(score).toBe(55 + 15 + 3);
    expect(score).toBeGreaterThanOrEqual(TOUR_SUCCESS_SCORE);
    forceNextOutcome(s, 'success', tourChances(s).chances);
    const r = hostTour(s, 'canola_field');
    expect(r).toMatchObject({ success: true, money: score * TOUR_MONEY_PER_SCORE, visitors: TOUR_SUCCESS_VISITORS });
    expect(s.money).toBe(score * TOUR_MONEY_PER_SCORE);
    expect(spotVisitors(s, 'canola_field')).toBe(TOUR_FAIL_VISITORS + TOUR_SUCCESS_VISITORS);
    expect(s.tickets).toBeGreaterThanOrEqual(1); // 누적 2,500 → 1,000 상품 (+ 명소 Lv5로 열린 손님층·랭크 업 보상 응모권, game-feel P1)
  });
});

describe('손님 선물 (§3.3.5)', () => {
  function withGuest(seed = 1) {
    const s = bareState(seed);
    placeObject(s, 'table_out', X(4), Y(5));
    for (let x = 0; x < 4; x++) placeObject(s, 'path', X(x), Y(6));
    expect(spawnGuests(s, 1, 'student')).toBe(1);
    return { s, g: s.guests[0]! };
  }

  it('데이터: 선물 8, 잘 맞는 손님층·입수처, ITEMS에도 들어 있다', () => {
    expect(GIFTS).toHaveLength(8);
    for (const g of GIFTS) { expect(itemDef(g.id).name).toBe(g.name); expect(hasIdToken(g.sourceText)).toBe(false); }
    expect(giftDef('gift_tangerine_box').source).toMatchObject({ type: 'craft', ingredientId: 'tangerine', count: 10 });
    expect(giftFits(giftDef('gift_peanut_bag'), 'student')).toBe(true);   // youth
    expect(giftFits(giftDef('gift_tangerine_box'), 'student')).toBe(false); // senior
  });

  it('선물: 인기 +3 · 만족 +20, 잘 맞으면 ×2, 하루 1회, 재고 소모, 떠나는 손님·없는 선물 거부', () => {
    const { s, g } = withGuest();
    s.segmentPopularity['student'] = 10; s.guestTypes['student']!.satisfaction = 0;
    expect(apply(s, { type: 'giveGift', guestId: g.id, itemId: 'gift_peanut_bag' })).toMatchObject({ ok: false, reason: expect.stringContaining('없') });
    grantItem(s, 'gift_peanut_bag', 2); grantItem(s, 'gift_tangerine_box');
    expect(apply(s, { type: 'giveGift', guestId: g.id, itemId: 'jeju_salt' }).ok).toBe(false);
    forceNextOutcome(s, 'success', giftChances(s).chances); // staff-luck: 판정 「성공(×1)」으로 고정
    expect(apply(s, { type: 'giveGift', guestId: g.id, itemId: 'gift_peanut_bag' }).ok).toBe(true); // youth ×2
    expect(s.segmentPopularity['student']).toBe(10 + GIFT_POPULARITY * GIFT_FIT_MULT);
    expect(s.guestTypes['student']!.satisfaction).toBe(GIFT_SATISFACTION * GIFT_FIT_MULT);
    expect(s.inventory['gift_peanut_bag']).toBe(1);
    expect(g.mood).toBe('happy');
    expect(canGiveGift(s, g.id, 'gift_tangerine_box')).toMatchObject({ ok: false, reason: expect.stringContaining('하루') });
    tick(s, DAY_MS); // 다음 날 — 어제 손님은 떠났으니 새로 부른다
    s.guests = [];
    expect(spawnGuests(s, 1, 'student')).toBe(1);
    const g2 = s.guests[0]!;
    expect(canGiveGift(s, g2.id, 'gift_tangerine_box').ok).toBe(true);
    forceNextOutcome(s, 'success', giftChances(s).chances);
    expect(apply(s, { type: 'giveGift', guestId: g2.id, itemId: 'gift_tangerine_box' }).ok).toBe(true); // senior → 기본
    expect(s.segmentPopularity['student']).toBe(10 + GIFT_POPULARITY * GIFT_FIT_MULT + GIFT_POPULARITY);
    expect(s.guestTypes['student']!.satisfaction).toBe(GIFT_SATISFACTION * GIFT_FIT_MULT + GIFT_SATISFACTION);
    expect(s.guestTypes['student']!.regular).toBe(SAT_REGULAR <= 60 ? 'regular' : 'none'); // 만족 60 → 단골
    s.giftDay = -1;
    g2.phase = 'leaving';
    expect(canGiveGift(s, g2.id, 'gift_peanut_bag')).toMatchObject({ ok: false, reason: expect.stringContaining('가는 중') });
  });

  it('제작: 감귤 10개 → 감귤 한 상자, 시설 보유형 선물은 월초에 들어온다(없으면 0), 선물 상자는 랜덤 2개', () => {
    const s = bareState(1);
    expect(apply(s, { type: 'craftGift', itemId: 'gift_tangerine_box' }).ok).toBe(false);
    s.storage['tangerine'] = 12;
    expect(apply(s, { type: 'craftGift', itemId: 'gift_tangerine_box' }).ok).toBe(true);
    expect(s.storage['tangerine']).toBe(2); expect(s.inventory['gift_tangerine_box']).toBe(1);
    expect(apply(s, { type: 'craftGift', itemId: 'gift_peanut_bag' }).ok).toBe(false);
    expect(monthlyGifts(s)).toBe(0);
    s.mileage = 2;
    expect(apply(s, { type: 'buyMileage', id: 'ms_gift_box' }).ok).toBe(true);
    expect(GIFTS.reduce((n, g) => n + (s.inventory[g.id] ?? 0), 0)).toBe(1 + 2);
  });
});

describe('상점·아이템 (§3.3)', () => {
  it('마일리지 상점 21 · 응모권 상점 9 · 특수 아이템 20(18 + 도구 2) · 상점 itemId·objectId 참조', () => {
    expect(MILEAGE_SHOP.map((m) => m.id)).toEqual(expect.arrayContaining(['ms_pinball', 'ms_speed_plant', 'ms_repair_kit', 'ms_training_voucher', 'ms_bus_contract', 'ms_gift_box', 'ms_hammer']));
    expect(TICKET_SHOP.map((t) => t.id)).toEqual(expect.arrayContaining(['ts_large_plant', 'ts_seasonal_plant']));
    expect(SPECIAL_ITEM_IDS).toHaveLength(20);
    for (const id of ['tour_bus_key', 'hammer_bearing', 'little_guardian', 'clean_charm', 'rank_shield', 'golden_tangerine', 'repair_kit', 'training_voucher_discount']) expect(itemDef(id).value).toBe(0);
    for (const m of MILEAGE_SHOP) { if (m.itemId) expect(itemDef(m.itemId).id).toBe(m.itemId); expect(hasIdToken(m.name + m.description)).toBe(false); }
    for (const t of TICKET_SHOP) { if (t.itemId) expect(itemDef(t.itemId).id).toBe(t.itemId); expect(hasIdToken(t.name + t.description)).toBe(false); }
  });

  it('구매: 계약권 → 무료 달 +1, 수리 도구·연수 할인권·망치(최대 10) → 인벤토리, 설계도는 시설이 있으면 해금·없으면 안내만·중복 거부', () => {
    const s = bareState(1); s.mileage = 100; s.tickets = 100;
    expect(apply(s, { type: 'buyMileage', id: 'ms_bus_contract' }).ok).toBe(true);
    expect(s.tourBusFreeMonths).toBe(1);
    expect(apply(s, { type: 'buyMileage', id: 'ms_repair_kit' }).ok).toBe(true);
    expect(s.inventory['repair_kit']).toBe(1);
    expect(apply(s, { type: 'buyMileage', id: 'ms_training_voucher' }).ok).toBe(true);
    expect(s.inventory['training_voucher_discount']).toBe(1);
    s.inventory['hammer_bearing'] = HAMMER_MAX;
    expect(apply(s, { type: 'buyMileage', id: 'ms_hammer' }).ok).toBe(false);
    s.inventory['hammer_bearing'] = HAMMER_MAX - 1;
    expect(apply(s, { type: 'buyMileage', id: 'ms_hammer' }).ok).toBe(true);
    // 설계도: objects.json에 pinball이 있으면 짓기 목록에, 없으면 안내만 (트랙 A가 추가)
    const n0 = s.unlocked.objects.length;
    expect(apply(s, { type: 'buyMileage', id: 'ms_pinball' }).ok).toBe(true);
    const hasPinball = (() => { try { objectDef('pinball'); return true; } catch { return false; } })();
    expect(s.unlocked.objects.length).toBe(hasPinball ? n0 + 1 : n0);
    if (hasPinball) expect(apply(s, { type: 'buyMileage', id: 'ms_pinball' }).ok).toBe(false);
    expect(apply(s, { type: 'buyTicket', id: 'ts_large_plant' }).ok).toBe(true);
    expect(s.tickets).toBe(100 - 6);
    expect(s.mileage).toBe(100 - 3 - 2 - 2 - 4 - 3);
  });
});

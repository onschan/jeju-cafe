/** 트랙 C (trim): 명소 8 Lv1~3 조건·효과, 방문객 누적·상품 4단계, 선물, 상점 */
import { bareState, forceNextOutcome } from './helpers.ts';
import { X, Y } from './helpers.ts';
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
  spotSpawnMult, spotFeePct, spotSceneryBonus, tagPopularity,
  SPOT_BASE_COST, SPOT_COST_MULT, SPOT_MAX_LEVEL, SPOT_TAG_MULT, SPOT_TAG_MULT_CAP, SPOT_LV3_TICKETS, VISITOR_PRIZES, GOLDEN_TANGERINE_VISITORS, VISITORS_PER_APPEAL, VISITOR_GUEST_RATE,
} from '../spots.ts';
import { grantItem, canGiveGift, giftFits, monthlyGifts, GIFT_POPULARITY, GIFT_SATISFACTION, GIFT_FIT_MULT } from '../items.ts';
import { HAMMER_MAX } from '../shop.ts';
import { SPOTS, spotDef, itemDef, objectDef, guestTypeDef, GIFTS, SPECIAL_ITEM_IDS, giftDef } from '../../data/index.ts';
import { hasIdToken } from '../../data/labels.ts';

/** Lv2~3 조건을 다 채운다 */
function meetAll(s: ReturnType<typeof bareState>, id: string) {
  s.spotVisitors[id] = 1e6; s.spotPrizes[id] = VISITOR_PRIZES.length; s.clock.year = 2;
}
function rich(seed = 1) { const s = bareState(seed); s.money = 1e12; return s; }

describe('명소 8 데이터 (trim)', () => {
  it('8곳 · 분류 4 × 순서 1~2 · Lv1~3 · 투자금 = B_k × (1, 2, 4.5)', () => {
    expect(SPOTS).toHaveLength(8);
    for (const cat of ['sight', 'food', 'play', 'nature'] as const) expect(SPOTS.filter((d) => d.category === cat).map((d) => d.order).sort()).toEqual([1, 2]);
    for (const d of SPOTS) {
      expect(d.levels.map((l) => l.level)).toEqual([1, 2, 3]);
      for (const l of d.levels) expect(l.cost).toBe(spotCost(d.order, l.level));
      expect(d.levels[0]!.cost).toBe(SPOT_BASE_COST[d.order - 1]);
      expect(d.levels[2]!.cost).toBe(SPOT_BASE_COST[d.order - 1]! * SPOT_COST_MULT[2]);
      expect(d.lv4QuestId).toBeNull();
      expect(d.lv5Special).toBeNull();
    }
  });

  it('Lv3 아이템은 전부 강화 아이템 표에 있고, 태그·시설 분류가 분류대로', () => {
    const TAG = { sight: 'female', food: 'group', play: 'youth', nature: 'senior' } as const;
    const FAC = { sight: 'rest', food: 'food', play: 'fun', nature: 'rest' } as const;
    for (const d of SPOTS) {
      expect(d.lv3ItemId).toBeTruthy();
      expect(itemDef(d.lv3ItemId!).value).toBeGreaterThan(0);
      expect(d.tag).toBe(TAG[d.category]);
      expect(d.facilityCategory).toBe(FAC[d.category]);
    }
  });
});

describe('Lv별 조건 (trim)', () => {
  it('Lv2 방문객 1,000 / Lv3 5,000 + 2년차, Lv3이 최고', () => {
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
    const m0 = s.tickets;
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(true); // Lv3
    expect(s.inventory['flower_poster']).toBe(1); // Lv3 아이템
    expect(s.tickets).toBe(m0 + SPOT_LV3_TICKETS + 1); // Lv2 방문객 상품 응모권 1장
    expect(s.notices.some((n) => n.includes('산굼부리'))).toBe(true); // 다음 명소 개방 안내
    expect(apply(s, { type: 'investSpot', id }).ok).toBe(false); // 최고
  });

  it('8곳 전부 Lv3까지 투자할 수 있다 (조건을 채우면)', () => {
    const s = rich(); s.rank = 9;
    for (const cat of ['sight', 'food', 'play', 'nature'] as const) {
      for (const d of SPOTS.filter((x) => x.category === cat).sort((a, b) => a.order - b.order)) {
        meetAll(s, d.id);
        for (let lv = 1; lv <= SPOT_MAX_LEVEL; lv++) {
          const r = apply(s, { type: 'investSpot', id: d.id });
          expect(r.ok, `${d.id} Lv${lv}: ${r.reason}`).toBe(true);
        }
        expect(s.spots[d.id]).toBe(SPOT_MAX_LEVEL);
        expect(s.inventory[d.lv3ItemId!]).toBeGreaterThanOrEqual(1);
      }
    }
    expect(s.tickets).toBeGreaterThanOrEqual(8 * SPOT_LV3_TICKETS);
  });
});

describe('Lv별 효과 (trim)', () => {
  it('태그 손님 유입 배수: Lv1 ×1.05 … Lv3 ×1.15, 같은 태그 합산 상한 ×2, 다른 태그는 1', () => {
    const s = bareState(1);
    s.spots['canola_field'] = 1; // sight → female
    const female = guestTypeDef('insta_traveler'); expect(female.tags.gender).toBe('female');
    expect(spotSpawnMult(s, 'insta_traveler')).toBeCloseTo(SPOT_TAG_MULT[1]);
    s.spots['canola_field'] = 3;
    expect(spotSpawnMult(s, 'insta_traveler')).toBeCloseTo(1.15);
    expect(spotSpawnMult(s, 'student')).toBe(1); // youth·any
    for (const d of SPOTS.filter((x) => x.category === 'sight')) s.spots[d.id] = 3;
    expect(spotSpawnMult(s, 'insta_traveler')).toBeCloseTo(SPOT_TAG_MULT[3] * SPOT_TAG_MULT[3]);
    expect(spawnMultiplier(s, 'insta_traveler')).toBeCloseTo(spawnMultiplier(bareState(1), 'insta_traveler') * SPOT_TAG_MULT[3] * SPOT_TAG_MULT[3]);
    expect(SPOT_TAG_MULT_CAP).toBe(2);
  });

  it('요금: 분류 대응 시설 Lv3 +2% (objectStats에 반영), 경관: Lv3 +1 전 좌석', () => {
    const s = bareState(1);
    const seat = placeObject(s, 'table_out', X(4), Y(5));
    const fee0 = objectStats(s, seat.id).feePct;
    const sc0 = sceneryScore(s, X(4), Y(5));
    expect(spotFeePct(s, 'rest')).toBe(0);
    s.spots['canola_field'] = 3; // sight → rest
    expect(spotFeePct(s, 'rest')).toBe(2);
    expect(spotFeePct(s, 'food')).toBe(0);
    s.spots['oreum'] = 3; s.spots['dongmun_market'] = 3;
    expect(spotFeePct(s, 'rest')).toBe(4);
    expect(spotFeePct(s, 'food')).toBe(2);
    expect(spotSceneryBonus(s)).toBe(3);
    expect(sceneryScore(s, X(4), Y(5))).toBe(sc0 + 3);
    const cat = objectDef(seat.type).category;
    expect(objectStats(s, seat.id).feePct).toBe(fee0 + spotFeePct(s, cat));
  });
});

describe('방문객 누적·상품', () => {
  it('방문객/일 = 매력 × 2, 카페 유입 = Σ × 3%, 매일 누적', () => {
    const s = bareState(1);
    expect(dailyVisitors(s, 'canola_field')).toBe(0);
    s.spots['canola_field'] = 2; // 매력 20
    expect(dailyVisitors(s, 'canola_field')).toBe(20 * VISITORS_PER_APPEAL);
    const dm = dailyVisitors(s, 'dongmun_market');
    s.spots['dongmun_market'] = 3;
    const dm3 = dailyVisitors(s, 'dongmun_market');
    expect(dm).toBe(0);
    expect(totalDailyVisitors(s)).toBe(40 + dm3);
    expect(spotGuestBonus(s)).toBe(Math.floor((40 + dm3) * VISITOR_GUEST_RATE));
    dailySpots(s);
    expect(spotVisitors(s, 'canola_field')).toBe(40);
    expect(totalSpotVisitors(s)).toBe(40 + dm3);
    const v0 = spotVisitors(s, 'canola_field');
    tick(s, DAY_MS);
    expect(spotVisitors(s, 'canola_field')).toBe(v0 + 40);
  });

  it('상품 4단계: 1,000 응모권 1 / 5,000 응모권 3 / 20,000 감귤 씨앗 2 / 50,000 묶음팩(감귤 3·한라봉 2) / 전체 100,000 황금 감귤 1회', () => {
    const s = bareState(1);
    s.spots['canola_field'] = 1;
    addVisitors(s, 'canola_field', 999);
    expect(s.tickets).toBe(0);
    addVisitors(s, 'canola_field', 1);
    expect(s.tickets).toBe(1); expect(s.spotPrizes['canola_field']).toBe(1);
    addVisitors(s, 'canola_field', 4000);
    expect(s.tickets).toBe(1 + 3); expect(s.spotPrizes['canola_field']).toBe(2);
    addVisitors(s, 'canola_field', 15000);
    expect(s.inventory['tangerine_seed']).toBe(2);
    addVisitors(s, 'canola_field', 30000);
    expect(s.inventory['tangerine_seed']).toBe(5); expect(s.inventory['hallabong_seed']).toBe(2);
    expect(s.spotPrizes['canola_field']).toBe(VISITOR_PRIZES.length);
    expect(s.inventory['golden_tangerine']).toBeUndefined();
    // 한 번에 여러 단계를 건너뛰어도 전부 준다
    s.spots['oreum'] = 1;
    addVisitors(s, 'oreum', 25000);
    expect(s.spotPrizes['oreum']).toBe(3); expect(s.tickets).toBe(4 + 1 + 3);
    // 전체 합산 10만 → 황금 감귤 1회
    addVisitors(s, 'oreum', GOLDEN_TANGERINE_VISITORS);
    expect(s.inventory['golden_tangerine']).toBe(1);
    expect(s.goldenTangerineGiven).toBe(true);
    checkVisitorPrizes(s, 'oreum');
    expect(s.inventory['golden_tangerine']).toBe(1);
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

  it('데이터: 선물 4, 잘 맞는 손님층·입수처, ITEMS에도 들어 있다', () => {
    expect(GIFTS).toHaveLength(4);
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
    expect(GIFTS.reduce((n, g) => n + (s.inventory[g.id] ?? 0), 0)).toBe(1);
  });
});

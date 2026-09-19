import { bareState } from './helpers.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { parcelPrice } from '../parcels.ts';
import { effectMult } from '../effects.ts';
import {
  villageReview, villageMonthly, festivalMonthly, canHoldFestival, canDonate, villageLocalMult, villageQuestOpen, villageParcelDiscount, nextGradeScore,
  VILLAGE_GRADE_SCORE, VILLAGE_REVIEW_MONTH, FESTIVAL_MONTH, FESTIVAL_COST, FESTIVAL_GUEST_MULT, FESTIVAL_REPUTATION, FESTIVAL_TICKETS, VILLAGE_DONATION, LOCAL_GUEST_MULT, PARCEL_DISCOUNT, ITEM_MAX,
} from '../village.ts';

/** 심사 점수를 높이는 손쉬운 방법: 기부 (₩50만 = 1점, 20점 상한) */
function donateTo(s: ReturnType<typeof bareState>, points: number) {
  s.money = 1_000_000_000;
  for (let i = 0; i < points; i++) expect(apply(s, { type: 'donateVillage' }).ok).toBe(true);
}

describe('정착 등급 심사', () => {
  test('항목 5 각 0~20점, 기부 ₩50만 = 1점, 소음은 감점', () => {
    const s = bareState(1);
    s.objects = {}; // 마당 비움 → 경관 0·소음 0
    const r0 = villageReview(s);
    expect(r0.items.map((i) => i.key)).toEqual(['localSat', 'quests', 'scenery', 'noise', 'donation']);
    expect(r0.items.find((i) => i.key === 'noise')!.points).toBe(ITEM_MAX);
    expect(r0.items.find((i) => i.key === 'donation')!.points).toBe(0);
    donateTo(s, 3);
    expect(s.village.donated).toBe(VILLAGE_DONATION * 3);
    expect(villageReview(s).items.find((i) => i.key === 'donation')!.points).toBe(3);
    donateTo(s, 40);
    expect(villageReview(s).items.find((i) => i.key === 'donation')!.points).toBe(ITEM_MAX);
    for (const it of villageReview(s).items) { expect(it.points).toBeGreaterThanOrEqual(0); expect(it.points).toBeLessThanOrEqual(ITEM_MAX); }
  });

  test('9월 1일 연 1회 심사, 등급은 한 번에 1단계만 오르고 내려가지 않는다', () => {
    const s = bareState(2);
    donateTo(s, 20); // 소음 20 + 기부 20 ≥ 40 → 등급 3 점수지만 한 번에 2까지만
    expect(villageReview(s).total).toBeGreaterThanOrEqual(VILLAGE_GRADE_SCORE[3]!);
    expect(nextGradeScore(s)).toBe(VILLAGE_GRADE_SCORE[2]);
    s.clock.month = VILLAGE_REVIEW_MONTH - 1; s.clock.day = 30; s.clock.hour = 23; s.clock.accMs = 0;
    tick(s, 4000);
    expect(s.clock.month).toBe(VILLAGE_REVIEW_MONTH);
    expect(s.village.grade).toBe(2);
    expect(s.village.lastReviewYear).toBe(s.clock.year);
    expect(s.alerts.some((a) => a.type === 'village' && a.grade === 2 && a.up)).toBe(true);
    villageMonthly(s); // 같은 해 두 번 안 한다
    expect(s.village.grade).toBe(2);
    s.clock.year++; s.village.donated = 0;
    const r = villageReview(s); // 기부 0 → 소음·경관만
    expect(r.total).toBeLessThan(VILLAGE_GRADE_SCORE[3]!);
    villageMonthly(s); // 등급 3 문턱(35) 미달, 유지 (내려가지 않는다)
    expect(s.village.grade).toBe(2);
    expect(s.alerts.at(-1)).toEqual({ type: 'village', grade: 2, up: false });
    donateTo(s, 20); s.clock.year++;
    villageMonthly(s);
    expect(s.village.grade).toBe(3);
    s.clock.month = 5; s.clock.year++;
    villageMonthly(s); // 9월이 아니면 안 한다
    expect(s.village.grade).toBe(3);
  });

  test('등급 보상: 2 동네 손님 ×1.1 · 3 삼춘 부탁 해금 · 4 필지 10% 할인', () => {
    const s = bareState(3);
    expect(villageLocalMult(s, 'local_auntie')).toBe(1);
    s.village.grade = 2;
    expect(villageLocalMult(s, 'local_auntie')).toBe(LOCAL_GUEST_MULT);
    expect(villageLocalMult(s, 'student')).toBe(1);
    expect(villageQuestOpen(s, 'local_auntie')).toBe(false);
    s.village.grade = 3;
    expect(villageQuestOpen(s, 'local_auntie')).toBe(true);
    expect(villageQuestOpen(s, 'student')).toBe(false);
    expect(villageParcelDiscount(s)).toBe(0);
    const p = s.parcels.find((x) => !x.owned)!;
    s.clock.month = 5;
    const full = parcelPrice(s, p);
    s.village.grade = 4;
    expect(villageParcelDiscount(s)).toBe(PARCEL_DISCOUNT);
    expect(parcelPrice(s, p)).toBe(Math.round(p.price * (1 - PARCEL_DISCOUNT)));
    expect(parcelPrice(s, p)).toBeLessThan(full);
  });
});

describe('마을제', () => {
  test('등급 4 이상·10월·₩200만·연 1회. 그날 손님 ×2·평판 +5·응모권 +3', () => {
    const s = bareState(4);
    s.money = 10_000_000; s.clock.month = FESTIVAL_MONTH;
    expect(canHoldFestival(s).ok).toBe(false); // 등급 1
    s.village.grade = 4;
    s.clock.month = 9;
    expect(canHoldFestival(s).ok).toBe(false); // 10월 아님
    s.clock.month = FESTIVAL_MONTH;
    s.money = FESTIVAL_COST - 1;
    expect(canHoldFestival(s).ok).toBe(false);
    s.money = 10_000_000;
    const rep = s.reputation, tk = s.tickets;
    expect(apply(s, { type: 'holdFestival' }).ok).toBe(true);
    expect(s.money).toBe(10_000_000 - FESTIVAL_COST);
    expect(s.village.festivals).toBe(1);
    expect(s.village.festivalYear).toBe(s.clock.year);
    expect(s.reputation).toBe(Math.min(100, rep + FESTIVAL_REPUTATION));
    expect(s.tickets).toBe(tk + FESTIVAL_TICKETS);
    expect(effectMult(s, 'spawnMult')).toBe(FESTIVAL_GUEST_MULT);
    expect(apply(s, { type: 'holdFestival' }).ok).toBe(false); // 올해는 이미
    tick(s, DAY_MS); // 다음 날엔 효과 끝
    expect(effectMult(s, 'spawnMult')).toBe(1);
  });

  test('10월 1일 안내 알림은 등급 4 이상이고 올해 안 열었을 때만', () => {
    const s = bareState(5);
    s.clock.month = FESTIVAL_MONTH;
    festivalMonthly(s);
    expect(s.alerts.some((a) => a.type === 'festivalOffer')).toBe(false);
    s.village.grade = 4;
    festivalMonthly(s);
    expect(s.alerts.filter((a) => a.type === 'festivalOffer')).toHaveLength(1);
    s.village.festivalYear = s.clock.year;
    festivalMonthly(s);
    expect(s.alerts.filter((a) => a.type === 'festivalOffer')).toHaveLength(1);
  });

  test('기부는 돈이 있을 때만', () => {
    const s = bareState(6);
    s.money = VILLAGE_DONATION - 1;
    expect(canDonate(s).ok).toBe(false);
    expect(apply(s, { type: 'donateVillage' }).ok).toBe(false);
    s.money = VILLAGE_DONATION;
    expect(apply(s, { type: 'donateVillage' }).ok).toBe(true);
    expect(s.money).toBe(0);
    expect(s.village.donated).toBe(VILLAGE_DONATION);
  });
});

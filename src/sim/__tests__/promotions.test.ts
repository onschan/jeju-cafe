import { bareState } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { dailyGuestCount, spawnMultiplier } from '../guests.ts';
import { effectivePopularity, expirePromotions, YOUTUBER_MONTHS, PARTTIME_MONEY } from '../promotions.ts';
import { monthIndex } from '../clock.ts';
import { staffWith } from './staff.test.ts';
import type { GameState, Staff } from '../types.ts';

function withStaff(seed = 1): { s: GameState; st: Staff } {
  const s = bareState(seed);
  const st = staffWith({}, 'hall');
  s.staff.push(st);
  s.research = 100;
  return { s, st };
}

test('홍보: 없는 직원·미배치·기력 부족·연구 부족·돈 부족은 거부', () => {
  const { s, st } = withStaff();
  expect(apply(s, { type: 'promote', staffId: 'nope', promotionId: 'flyer' }).ok).toBe(false);
  st.role = null;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' }).ok).toBe(false); // 배치된 직원만
  st.role = 'hall';
  st.energy = 19;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' }).ok).toBe(false); // 기력 20 필요
  st.energy = 100; s.research = 9;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' }).ok).toBe(false); // 연구 10 필요
  s.research = 100; s.money = 4_999_999;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'radio' }).ok).toBe(false); // 돈 500만 필요
});

test('전단 돌리기: 연구·기력 차감, 삼춘 인기 +3, 타깃이면 ×1.5', () => {
  const { s, st } = withStaff();
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' }).ok).toBe(true);
  expect(s.research).toBe(90);
  expect(st.energy).toBe(80);
  expect(s.segmentPopularity['local_auntie']).toBe(33);
  expect(s.segmentPopularity['rentcar_family']).toBeUndefined(); // 아직 없는 손님층은 건드리지 않는다
  expect(s.segmentPopularity['student']).toBe(20);
  expect(apply(s, { type: 'setTarget', segment: 'local_auntie' }).ok).toBe(true);
  apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' });
  expect(s.segmentPopularity['local_auntie']).toBe(33 + 4.5);
});

test('SNS 포스팅: 관광객 +5, 게이지 +5', () => {
  const { s, st } = withStaff();
  apply(s, { type: 'promote', staffId: st.id, promotionId: 'sns' });
  expect(s.research).toBe(80);
  expect(s.segmentPopularity['student']).toBe(25);
  expect(s.popularity).toBe(5);
});

test('기간형: 라디오는 돈이 들고 광고비에 잡히며, 활성 동안 인기가 오른 셈, 최대 2개, 중복 거부, 월말 만료', () => {
  const { s, st } = withStaff();
  s.money = 10_000_000;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'radio' }).ok).toBe(true);
  expect(s.money).toBe(5_000_000);
  expect(s.monthCosts.ads).toBe(5_000_000);
  expect(s.activePromotions).toEqual([{ promotionId: 'radio', remainingMonths: 2, delta: { local_auntie: 5, student: 5, village_head: 5 } }]);
  expect(effectivePopularity(s, 'local_auntie')).toBe(35);
  expect(effectivePopularity(s, 'student')).toBe(25);
  expect(s.segmentPopularity['local_auntie']).toBe(30); // 기본값은 그대로
  st.energy = 100; s.money = 10_000_000;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'radio' }).ok).toBe(false); // 중복
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'billboard' }).ok).toBe(true);
  expect(effectivePopularity(s, 'local_auntie')).toBe(38);
  const s2 = bareState(2);
  s2.activePromotions = [{ promotionId: 'radio', remainingMonths: 1, delta: {} }, { promotionId: 'billboard', remainingMonths: 1, delta: {} }];
  s2.staff.push(staffWith({}, 'hall')); s2.research = 100; s2.money = 1e8;
  expect(apply(s2, { type: 'promote', staffId: s2.staff[0]!.id, promotionId: 'flyer' }).ok).toBe(true); // 1회성은 개수 제한 없음
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.activePromotions).toEqual([{ promotionId: 'radio', remainingMonths: 1, delta: { local_auntie: 5, student: 5, village_head: 5 } }]);
  expect(s.lastMonthCard!.costs.ads).toBe(5_000_000);
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.activePromotions).toEqual([]);
});

test('아르바이트: 기력 40으로 돈 +15만, 직원당 한 달에 한 번', () => {
  const { s, st } = withStaff();
  const m0 = s.money;
  expect(PARTTIME_MONEY).toBe(150_000);
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok).toBe(true);
  expect(s.money).toBe(m0 + PARTTIME_MONEY);
  expect(s.monthIncome).toBe(PARTTIME_MONEY);
  expect(st.energy).toBe(60);
  expect(st.lastParttimeMonthIndex).toBe(monthIndex(s.clock));
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok).toBe(false); // 이달은 이미
  const other = staffWith({ smile: 11 }, 'hall'); s.staff.push(other);
  expect(apply(s, { type: 'promote', staffId: other.id, promotionId: 'parttime' }).ok).toBe(true); // 다른 직원은 가능
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  st.energy = 100;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'parttime' }).ok).toBe(true); // 다음 달은 다시
});

test('기간형 홍보의 타깃 ×1.5는 시작 시점에 굳고, 나중에 타깃을 바꿔도 안 변한다', () => {
  const { s, st } = withStaff();
  apply(s, { type: 'setTarget', segment: 'student' });
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'billboard' }).ok).toBe(true);
  expect(s.activePromotions[0]!.delta).toEqual({ local_auntie: 3, student: 4.5, village_head: 3 });
  expect(effectivePopularity(s, 'student')).toBe(20 + 4.5);
  apply(s, { type: 'setTarget', segment: 'local_auntie' });
  expect(effectivePopularity(s, 'student')).toBe(20 + 4.5);
  expect(effectivePopularity(s, 'local_auntie')).toBe(30 + 3);
  apply(s, { type: 'setTarget', segment: null });
  expect(effectivePopularity(s, 'student')).toBe(20 + 4.5);
});

test('유튜버: 성공하면 3개월 관광객 2배, 실패하면 아무 것도, 돈은 어쨌든 든다', () => {
  let ok = 0, fail = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { s, st } = withStaff(seed);
    s.money = 1e8;
    expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'youtuber' }).ok).toBe(true);
    expect(s.money).toBe(1e8 - 10_000_000);
    if (s.youtuberBoostMonths === YOUTUBER_MONTHS) {
      ok++;
      expect(spawnMultiplier(s, 'student')).toBeCloseTo(2 * (1 + 20 / 50));
      expect(spawnMultiplier(s, 'local_auntie')).toBeCloseTo(1 + 30 / 50);
    } else { fail++; expect(s.youtuberBoostMonths).toBe(0); }
  }
  expect(ok).toBeGreaterThan(10); expect(fail).toBeGreaterThan(3);
  const s = bareState(1); s.youtuberBoostMonths = 1;
  expirePromotions(s);
  expect(s.youtuberBoostMonths).toBe(0);
});

test('손님층 인기는 매월 −2, 0 하한, 99 상한', () => {
  const s = bareState(1);
  s.segmentPopularity = { local_auntie: 1, student: 20 };
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.segmentPopularity).toMatchObject({ local_auntie: 0, student: 18 }); // (4월에 육지 삼춘이 새로 열려 키가 하나 늘 수 있다)
  const { s: s2, st } = withStaff();
  s2.segmentPopularity['local_auntie'] = 98;
  apply(s2, { type: 'promote', staffId: st.id, promotionId: 'flyer' });
  expect(s2.segmentPopularity['local_auntie']).toBe(99);
});

test('홍보가 있으면 하루 손님이 는다', () => {
  const { s, st } = withStaff();
  for (let i = 0; i < 3; i++) placeObject(s, 'table_out', 2 + i, 5);
  s.segmentPopularity = { local_auntie: 15, student: 15, village_head: 15 }; // 평균 배수 1.3
  const base = dailyGuestCount(s);
  s.money = 1e8;
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'radio' }).ok).toBe(true); // 기력 30
  expect(dailyGuestCount(s)).toBe(base + 1); // 전 손님층 +5 → 평균 배수 1.4 → (0.4×10)=4, 전엔 3
  for (const id of ['sns', 'sns', 'flyer', 'flyer']) expect(apply(s, { type: 'promote', staffId: st.id, promotionId: id }).ok).toBe(true); // 기력 15+15+20+20
  expect(st.energy).toBe(0);
  expect(effectivePopularity(s, 'local_auntie')).toBe(26);
  expect(effectivePopularity(s, 'student')).toBe(30);
  expect(dailyGuestCount(s)).toBe(base + 2); // 평균 배수 1.56 → 5
});

test('setTarget: 아는 손님층만, null로 해제', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'setTarget', segment: 'martian' }).ok).toBe(false);
  expect(apply(s, { type: 'setTarget', segment: 'student' }).ok).toBe(true);
  expect(s.targetSegment).toBe('student');
  expect(apply(s, { type: 'setTarget', segment: null }).ok).toBe(true);
  expect(s.targetSegment).toBeNull();
});

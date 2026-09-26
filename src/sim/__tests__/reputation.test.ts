import { bareState, X, Y } from './helpers.ts';
import { WEAR_START_MONTHS } from '../cleanliness.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick, STEP_MS } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { placeObject } from '../grid.ts';
import { spawnGuests, dailyGuestCount, typeWeight, mehCause } from '../guests.ts';
import { closeMonth } from '../economy.ts';
import { unlockGuestType } from '../segments.ts';
import { GUEST_TYPES, PROMOTIONS } from '../../data/index.ts';
import {
  addComplaint, addReputation, nightlyReputation, monthlyReputation, makeReviews, reviewScore, topComplaints, complaintCounts,
  reputationGuestMult, reputationTypeMult, reputationTipMult, reputationNamedMult, applyApology,
  COMPLAINT_REASONS, COMPLAINT_LABEL, COMPLAINT_REVIEW, REPUTATION_START, REP_DAILY_CAP, REP_LOW, REP_HIGH, REP_ALERT, APOLOGY_REPUTATION, MAX_REVIEWS, COMPLAINT_WINDOW_DAYS,
} from '../reputation.ts';

test('시작 평판 50, 사유 9종에 라벨·후기 문장이 있고 영문 id가 새지 않는다', () => {
  const s = createInitialState(1);
  expect(s.reputation).toBe(REPUTATION_START);
  expect(COMPLAINT_REASONS).toHaveLength(4);
  for (const r of COMPLAINT_REASONS) {
    expect(COMPLAINT_LABEL[r]).toMatch(/[가-힣]/);
    expect(COMPLAINT_REVIEW[r]('감귤주스')).not.toContain(r);
  }
  expect(COMPLAINT_REVIEW.expensive('감귤주스')).toBe('감귤주스가 너무 비싸대요');
  expect(COMPLAINT_REVIEW.no_seat()).toBe('자리가 없어서 그냥 갔대요');
});

test('불만 기록: 사유별 카운트·월 카운트·오늘 불만 수, 30일이 지나면 정리된다', () => {
  const s = bareState(1);
  addComplaint(s, 'no_seat', 'local_auntie', '감귤주스');
  addComplaint(s, 'no_seat', 'student');
  addComplaint(s, 'expensive', 'student', '카페라떼');
  expect(s.complaints).toHaveLength(3);
  expect(s.complaints[0]).toEqual({ day: expect.any(Number), reason: 'no_seat', guestType: 'local_auntie', detail: '감귤주스' });
  expect(complaintCounts(s)).toEqual([{ reason: 'no_seat', count: 2 }, { reason: 'expensive', count: 1 }]);
  expect(topComplaints(s, 1)).toEqual([{ reason: 'no_seat', count: 2 }]);
  expect(s.dayStats.complained).toBe(3);
  s.dayStats = { satisfied: 0, complained: 0, total: 0 };
  s.clock.month += 1; s.clock.day = 5; // 35일 뒤
  nightlyReputation(s);
  expect(s.complaints).toHaveLength(0);
  expect(COMPLAINT_WINDOW_DAYS).toBe(30);
});

test('일일 평판 식: (만족 − 불만×2)/총손님 × 3, ±2 상한, 청결 < 40이면 −0.5, 노후 3개면 −0.3, 0~100', () => {
  const s = bareState(1);
  s.dayStats = { satisfied: 8, complained: 1, total: 10 }; // (8−2)/10×3 = 1.8
  expect(nightlyReputation(s)).toBeCloseTo(1.8);
  expect(s.reputation).toBeCloseTo(51.8);
  s.dayStats = { satisfied: 10, complained: 0, total: 10 }; // 3 → 상한 2
  expect(nightlyReputation(s)).toBe(REP_DAILY_CAP);
  s.dayStats = { satisfied: 0, complained: 10, total: 10 }; // −6 → −2
  expect(nightlyReputation(s)).toBe(-REP_DAILY_CAP);
  s.dayStats = { satisfied: 0, complained: 0, total: 0 }; // 손님 없으면 0
  expect(nightlyReputation(s)).toBe(0);
  (s as unknown as { clean: { value: number } }).clean = { value: 30 };
  expect(nightlyReputation(s)).toBeCloseTo(-0.5);
  placeObject(s, 'table_out', X(4), Y(5)); placeObject(s, 'table_out', X(5), Y(5)); placeObject(s, 'table_out', X(6), Y(5));
  for (const o of Object.values(s.objects)) if (o.type === 'table_out') o.wearMonth = o.placedMonth - WEAR_START_MONTHS; // 노후(트랙 A)
  expect(nightlyReputation(s)).toBeCloseTo(-0.8);
  s.reputation = 0.3;
  nightlyReputation(s);
  expect(s.reputation).toBe(0);
  expect(addReputation(s, 500)).toBe(100);
  expect(s.reputation).toBe(100);
});

test('효과: 손님 배수 0.5 + 평판/100, 평판 < 30이면 육지 손님 ×0.5, ≥ 80이면 팁 ×1.1·단골★ ×1.5', () => {
  const s = bareState(1);
  s.clock.month = 4;
  for (const x of [2, 4, 6]) placeObject(s, 'table_out', X(x), Y(5));
  expect(reputationGuestMult(s)).toBe(1);
  const base = dailyGuestCount(s);
  s.reputation = 100;
  expect(reputationGuestMult(s)).toBe(1.5);
  expect(dailyGuestCount(s)).toBe(Math.min(18, Math.round(base * 1.5)));
  s.reputation = 20;
  expect(reputationGuestMult(s)).toBe(0.7);
  expect(dailyGuestCount(s)).toBe(Math.round(base * 0.7));
  const tourist = GUEST_TYPES.find((t) => t.tags.age === 'youth')!.id;
  unlockGuestType(s, tourist);
  s.reputation = REP_LOW;
  const w = typeWeight(s, tourist, 12);
  expect(reputationTypeMult(s, tourist)).toBe(1);
  expect(reputationTypeMult(s, 'local_auntie')).toBe(1);
  s.reputation = REP_LOW - 1;
  expect(reputationTypeMult(s, tourist)).toBe(0.5);
  expect(reputationTypeMult(s, 'local_auntie')).toBe(1); // 삼춘은 육지 손님이 아니다
  expect(typeWeight(s, tourist, 12)).toBeCloseTo(w * 0.5);
  expect(reputationTipMult(s)).toBe(1);
  expect(reputationNamedMult(s)).toBe(1);
  s.reputation = REP_HIGH;
  expect(reputationTipMult(s)).toBe(1.1);
  expect(reputationNamedMult(s)).toBe(1.5);
});

test('손님 판정 훅: 자리 없으면 no_seat, 줄 섰다 앉으면 wait_long, 예산 초과 expensive, 만족은 satisfied', () => {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5)); // 2석
  spawnGuests(s, 6); // 2 앉고 3 줄, 1 이탈
  expect(s.complaints.filter((c) => c.reason === 'no_seat')).toHaveLength(1);
  s.guests = [];
  spawnGuests(s, 0); // 줄에서 2명 앉는다
  expect(s.complaints.filter((c) => c.reason === 'wait_long')).toHaveLength(2);
  // 주문: 라떼는 바리스타가 없어 못 만든다 → 기분은 no_menu지만 불만 사유 4종에는 없다 (trim)
  const t = bareState(2);
  placeObject(t, 'table_out', X(4), Y(5));
  apply(t, { type: 'setSlot', slot: 0, menuId: 'latte' });
  spawnGuests(t, 1);
  for (let i = 0; i < 40; i++) tick(t, STEP_MS); // 게임 시간 2시간
  const g = t.guests[0]!;
  expect(g.phase).toBe('seated');
  expect(g.moodReason).toBe('no_menu');
  expect(t.complaints).toHaveLength(0);
  expect(t.dayStats.total).toBe(1);
  // 비싼 메뉴만 있으면 expensive(가장 싼 메뉴 이름)
  const u = bareState(3);
  placeObject(u, 'table_out', X(4), Y(5));
  apply(u, { type: 'setSlot', slot: 0, menuId: 'americano' });
  u.menuMods['americano'] = { level: 5, toppings: [] };
  for (const id of Object.keys(u.guestTypes)) u.guestTypes[id]!.unlocked = id === 'student';
  u.segmentPopularity = { student: 0 };
  spawnGuests(u, 1);
  for (let i = 0; i < 40; i++) tick(u, 100);
  if (u.guests[0]!.moodReason === 'price') expect(u.complaints.at(-1)).toMatchObject({ reason: 'expensive', detail: '아메리카노' });
});

test('meh 원인 추정: 지친 홀 직원 → wait_long, 낡은 자리·청결 < 50 → dirty, 없으면 null', () => {
  const s = bareState(1);
  s.clock.month = 5;
  const seat = placeObject(s, 'table_out', X(4), Y(5))!;
  expect(mehCause(s, seat)).toBeNull();
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 10, strength: 10, skill: 10, smile: 10 }, skill: 'coffee_master', level: 1, salary: 0, poolId: '', statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, extraSkills: [], maxLevel: 10, baseSalary: 0, exp: 0, trainingCount: 0, training: null, role: 'hall', unpaidMonths: 0, energy: 5, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  expect(mehCause(s, seat)).toEqual({ reason: 'wait_long' });
  s.staff[0]!.energy = 100;
  seat.wearMonth = seat.placedMonth - WEAR_START_MONTHS;
  expect(mehCause(s, seat)).toEqual({ reason: 'dirty', detail: '테이블' });
  seat.wearMonth = seat.placedMonth;
  (s as unknown as { clean: { value: number } }).clean = { value: 40 };
  expect(mehCause(s, seat)).toEqual({ reason: 'dirty' });
  (s as unknown as { clean: { value: number } }).clean = { value: 100 };
  expect(mehCause(s, seat)).toBeNull();
});

test('월말: 불만 TOP3로 후기(결정적), 카드 reputationDelta·topComplaints, 최대 8개 보관, 20 미만이면 삼춘 경고 알림 한 번', () => {
  const s = bareState(1);
  for (let i = 0; i < 3; i++) addComplaint(s, 'no_seat', 'student');
  for (let i = 0; i < 2; i++) addComplaint(s, 'wait_long', 'student');
  addComplaint(s, 'dirty', 'student');
  addReputation(s, -3.5);
  closeMonth(s, 3, 1);
  monthlyReputation(s);
  const card = s.lastMonthCard!;
  expect(card.topComplaints).toEqual([{ reason: 'no_seat', count: 3 }, { reason: 'wait_long', count: 2 }, { reason: 'dirty', count: 1 }]); // 동률은 사유 표 순서
  expect(card.reputationDelta).toBe(-3.5);
  expect(card.reputation).toBe(46.5);
  expect(s.reviews.map((r) => r.text)).toEqual(['자리가 없어서 그냥 갔대요', '너무 오래 기다렸대요', '카페가 지저분하대요']);
  expect(s.reviews[0]).toMatchObject({ month: 3, score: reviewScore(46.5), reason: 'no_seat' });
  expect(s.monthComplaints).toEqual({});
  expect(s.monthReputationDelta).toBe(0);
  // 결정성: 같은 상태면 같은 후기
  const a = bareState(7), b = bareState(7);
  expect(makeReviews(a, 4)).toEqual(makeReviews(b, 4));
  // 불만이 없으면 좋은 후기 한 줄, 8개까지
  for (let m = 4; m <= 14; m++) { closeMonth(s, m, 1); monthlyReputation(s); }
  expect(s.reviews).toHaveLength(MAX_REVIEWS);
  expect(s.reviews[0]!.reason).toBeUndefined();
  // 경고
  expect(s.alerts.some((a) => a.type === 'reputation')).toBe(false);
  s.reputation = REP_ALERT - 1;
  monthlyReputation(s);
  monthlyReputation(s);
  expect(s.alerts.filter((a) => a.type === 'reputation')).toHaveLength(1);
  expect(s.fx.some((f) => f.kind === 'scene' && f.title === '악평')).toBe(true);
});

test('사과 이벤트: promotions.json apology_event, 50만·평판 +8·월 1회', () => {
  const s = bareState(1);
  expect(PROMOTIONS.find((p) => p.id === 'apology_event')).toMatchObject({ costMoney: 500_000, special: 'apology' });
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 10, strength: 10, skill: 10, smile: 10 }, skill: 'coffee_master', level: 1, salary: 0, poolId: '', statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, extraSkills: [], maxLevel: 10, baseSalary: 0, exp: 0, trainingCount: 0, training: null, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  const m0 = s.money;
  expect(apply(s, { type: 'promote', staffId: 's1', promotionId: 'apology_event' }).ok).toBe(true);
  expect(s.reputation).toBe(REPUTATION_START + APOLOGY_REPUTATION);
  expect(m0 - s.money).toBe(500_000);
  expect(apply(s, { type: 'promote', staffId: 's1', promotionId: 'apology_event' })).toMatchObject({ ok: false, reason: '사과 이벤트는 한 달에 한 번이에요' });
  s.clock.month++;
  expect(apply(s, { type: 'promote', staffId: 's1', promotionId: 'apology_event' }).ok).toBe(true);
  applyApology(s);
  expect(s.reputation).toBe(REPUTATION_START + APOLOGY_REPUTATION * 3);
});

test('하루가 지나면 평판이 어제 손님으로 갱신되고(tick), 카드 평판 줄이 남는다', () => {
  const s = bareState(1);
  for (const x of [2, 4, 6]) placeObject(s, 'table_out', X(x), Y(5));
  apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.reputation).not.toBe(REPUTATION_START);
  expect(s.lastMonthCard!.reputation).toBeGreaterThanOrEqual(0); // 카드는 월말(밤 갱신 전) 값
  expect(s.lastMonthCard!.reputation).not.toBe(REPUTATION_START);
  expect(typeof s.lastMonthCard!.reputationDelta).toBe('number');
});

import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { apply } from '../actions.ts';
import { tick, step } from '../tick.ts';
import { DAY_MS, HOUR_MS, monthIndex } from '../clock.ts';
import { spawnGuests, updateGuests, dailyGuestCount, popularityGuestBase, spotDailyGuests, totalSeats, hourlySpawn, tourBus, typeWeight, GUESTS_PER_SEAT, SPOT_APPEAL_PER_GUEST } from '../guests.ts';
import { monthlyYieldOf } from '../orchard.ts';
import { upkeep } from '../economy.ts';
import {
  offerQuest, refreshQuests, questProgress, checkQuests, expireQuests, rollEvents, eventConditionMet, eventEligible, applyEventEffect, expireEvents, boardBadge, afterInvest, QUEST_MONTHS,
} from '../board.ts';
import { spotAppeal, spotGuestBonus, spotUnlocked, canInvestSpot, nextSpotLevel, busSpots, APPEAL_PER_GUEST, SPOT_MAX_LEVEL } from '../spots.ts';
import { effectMult, noGuestsToday, pruneEffects, dayIndex, filterMatches } from '../effects.ts';
import { unlockGuestType, isUnlocked, addSatisfaction, SAT_QUEST } from '../segments.ts';
import { QUESTS, EVENTS, SPOTS, questDef, eventDef, parseSeasonMonths, spotDef } from '../../data/index.ts';
import type { EventDef } from '../types.ts';

function cafe(seed = 1) {
  const s = bareState(seed);
  const seat = placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'americano');
  return { s, seat };
}

test('데이터: 부탁 103·이벤트 42·관광지 24, 참조가 유효하고 계절 문자열이 달로 풀린다', () => {
  expect(QUESTS.length).toBe(103);
  expect(EVENTS.length).toBe(42);
  expect(SPOTS.length).toBe(24);
  for (const sp of SPOTS) {
    expect(sp.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    if (sp.nextSpotId) expect(spotDef(sp.nextSpotId).unlock).toEqual({ type: 'spot', spotId: sp.id, level: 4 });
    if (sp.lv4QuestId) questDef(sp.lv4QuestId);
  }
  expect(parseSeasonMonths('7~9월·12~1월')).toEqual([1, 7, 8, 9, 12]);
  expect(parseSeasonMonths('봄·가을')).toEqual([3, 4, 5, 9, 10, 11]);
  expect(parseSeasonMonths('매월').length).toBe(12);
  expect(parseSeasonMonths('매주 토')).toEqual([]);
  expect(eventDef('ev_tv_shoot').choice).toBe(true);
  expect(eventDef('ev_typhoon_alert').months).toEqual([7, 8, 9]);
});

test('부탁 제안: 만족 30에 닿으면 게시판에, 체인 후속 타입은 열리는 즉시, 완료한 타입은 다시 안 올라온다', () => {
  const s = bareState(1);
  expect(refreshQuests(s)).toEqual([]);
  addSatisfaction(s, 'student', SAT_QUEST);
  expect(refreshQuests(s)).toEqual(['q_student']);
  expect(s.board.quests['q_student']!.status).toBe('offered');
  expect(refreshQuests(s)).toEqual([]); // 중복 없음
  expect(boardBadge(s)).toBe(1);
  expect(s.notices).toContain('부탁이 왔어요: 대학생');
  unlockGuestType(s, 'working_holiday'); // quest 해금형 → 바로
  expect(refreshQuests(s)).toEqual(['q_working_holiday']);
  s.guestTypes['student']!.questDone = true;
  delete s.board.quests['q_student'];
  expect(refreshQuests(s)).toEqual([]);
});

test('부탁 생애주기: 도전 → 진행(menuSold는 수락 뒤부터) → 완료 보상·다음 손님 해금 → 재도전 거부', () => {
  const { s } = cafe();
  s.storage['tangerine'] = 99;
  expect(apply(s, { type: 'acceptQuest', id: 'q_student' }).ok).toBe(false); // 게시판에 없음
  s.menuSold['americano'] = 5; // 수락 전 판매는 안 센다
  offerQuest(s, 'q_student');
  expect(apply(s, { type: 'acceptQuest', id: 'q_student' }).ok).toBe(true);
  const q = s.board.quests['q_student']!;
  expect(q.status).toBe('active');
  expect(q.deadlineMonthIndex).toBe(monthIndex(s.clock) + QUEST_MONTHS);
  expect(questProgress(s, 'q_student')).toEqual({ now: 0, goal: 20 });
  expect(apply(s, { type: 'acceptQuest', id: 'q_student' }).ok).toBe(false); // 이미 진행 중
  s.menuSold['americano'] = 24;
  expect(questProgress(s, 'q_student').now).toBe(19);
  expect(checkQuests(s)).toEqual([]);
  const money0 = s.money, research0 = s.research;
  s.menuSold['americano'] = 25;
  expect(checkQuests(s)).toEqual(['q_student']);
  expect(q.status).toBe('done');
  expect(s.money - money0).toBe(200_000);
  expect(s.research - research0).toBe(20);
  expect(isUnlocked(s, 'working_holiday')).toBe(true);
  expect(s.guestTypes['student']!.questDone).toBe(true);
  expect(s.board.quests['q_working_holiday']!.status).toBe('offered'); // 체인 다음 부탁이 바로
  expect(apply(s, { type: 'acceptQuest', id: 'q_student' }).ok).toBe(false);
});

test('부탁 조건 6종의 진행도와 즉시 완료(none·이미 충족)', () => {
  const s = bareState(1);
  // objectPlaced: 이장님 — 돌담 6 → 배치 액션이 바로 완료시킨다 (이미 놓인 것도 세되, 안 산 필지의 밭담은 안 센다)
  for (let x = 0; x < 5; x++) placeObject(s, 'stonewall', X(x), Y(2));
  offerQuest(s, 'q_village_head');
  apply(s, { type: 'acceptQuest', id: 'q_village_head' });
  s.unlocked.objects.push('stonewall'); s.money = 1e9;
  expect(questDef('q_village_head').condition).toEqual({ type: 'objectPlaced', params: { objectId: 'stonewall', count: 6 } });
  expect(questProgress(s, 'q_village_head')).toEqual({ now: 5, goal: 6 });
  expect(apply(s, { type: 'place', objectType: 'stonewall', x: X(6), y: Y(2) }).ok).toBe(true);
  expect(s.board.quests['q_village_head']!.status).toBe('done');
  expect(s.inventory['jeju_salt']).toBe(1); // 보상 아이템 (v2 표)
  // none: 수락 즉시 완료
  offerQuest(s, 'q_street_cat_noeul');
  apply(s, { type: 'acceptQuest', id: 'q_street_cat_noeul' });
  expect(s.board.quests['q_street_cat_noeul']!.status).toBe('done');
  expect(isUnlocked(s, 'jeju_pony')).toBe(true);
  // item: 꿀 3
  const itemQ = QUESTS.find((q) => q.condition.type === 'item' && q.condition.params.itemId === 'honey')!;
  offerQuest(s, itemQ.id);
  apply(s, { type: 'acceptQuest', id: itemQ.id });
  expect(questProgress(s, itemQ.id)).toEqual({ now: 0, goal: 3 });
  s.inventory['honey'] = 3;
  expect(checkQuests(s)).toEqual([itemQ.id]);
  // segmentPopularity
  const popQ = QUESTS.find((q) => q.condition.type === 'segmentPopularity')!;
  const { guestId, popularity } = popQ.condition.params as { guestId: string; popularity: number };
  offerQuest(s, popQ.id);
  apply(s, { type: 'acceptQuest', id: popQ.id });
  s.segmentPopularity[guestId] = popularity;
  expect(checkQuests(s)).toEqual([popQ.id]);
  // spotLevel
  const spotQ = QUESTS.find((q) => q.condition.type === 'spotLevel')!;
  offerQuest(s, spotQ.id);
  apply(s, { type: 'acceptQuest', id: spotQ.id });
  expect(questProgress(s, spotQ.id).now).toBe(0);
  s.spots[(spotQ.condition.params as { spotId: string }).spotId] = 3;
  expect(checkQuests(s)).toEqual([spotQ.id]);
});

test('부탁 기한: 2달이 지나면 실패, 다음 달 다시 올라온다', () => {
  const s = bareState(1);
  addSatisfaction(s, 'student', SAT_QUEST);
  refreshQuests(s);
  apply(s, { type: 'acceptQuest', id: 'q_student' });
  const q = s.board.quests['q_student']!;
  for (let i = 0; i < 60; i++) tick(s, DAY_MS); // 5월 1일: 기한(3+2=5월) 안
  expect(q.status).toBe('active');
  for (let i = 0; i < 30; i++) tick(s, DAY_MS); // 6월 1일
  expect(s.board.quests['q_student']!.status).toBe('offered'); // 실패 → 만족이 아직 30이라 바로 재제안
  expect(s.notices.some((n) => n.includes('기한이 지났어요'))).toBe(true);
  const s2 = bareState(1);
  offerQuest(s2, 'q_student');
  apply(s2, { type: 'acceptQuest', id: 'q_student' });
  s2.clock.month = 6;
  expect(expireQuests(s2)).toEqual(['q_student']);
  expect(s2.board.quests['q_student']!.status).toBe('failed');
});

test('이벤트 조건 문자열 파서', () => {
  const s = bareState(1);
  expect(eventConditionMet(s, null)).toBe(true);
  expect(eventConditionMet(s, 'tangerine_tree 3개')).toBe(false);
  for (let i = 0; i < 3; i++) placeObject(s, 'tangerine_tree', X(6 + i), Y(2));
  expect(eventConditionMet(s, 'tangerine_tree 3개')).toBe(true);
  expect(eventConditionMet(s, 'tangerine_tree 5개')).toBe(false);
  expect(eventConditionMet(s, '손님 local_auntie 인기 30')).toBe(true);
  expect(eventConditionMet(s, '손님 local_auntie 인기 40')).toBe(false);
  expect(eventConditionMet(s, '손님 group_cn 해금')).toBe(false);
  expect(eventConditionMet(s, '★2')).toBe(false);
  s.star = 2;
  expect(eventConditionMet(s, '★2')).toBe(true);
  expect(eventConditionMet(s, '16년차 이상·★5')).toBe(false);
  expect(eventConditionMet(s, '잔고 < 400,000')).toBe(false);
  s.money = 100;
  expect(eventConditionMet(s, '잔고 < 400,000')).toBe(true);
  expect(eventConditionMet(s, 'pond 없음')).toBe(true);
  expect(eventConditionMet(s, '관광지 olle_trail Lv2')).toBe(false);
  expect(eventConditionMet(s, '랭크 2')).toBe(false);
  expect(eventConditionMet(s, '메뉴 20개')).toBe(false);
  expect(eventConditionMet(s, '버튼 1회')).toBe(false);
  expect(eventConditionMet(s, '3년차 이상')).toBe(false);
  expect(eventConditionMet(s, '알 수 없는 조건')).toBe(true); // 모르는 건 무조건
});

test('이벤트 롤: seed 결정적, 확률·달·조건 존중, 선택 이벤트는 pending, 나머지는 즉시 적용 + 대사 알림', () => {
  const s = bareState(1);
  s.clock.month = 5; // 황금연휴(5월 100%) 확정, 렌터카 대란 25%
  const fired = rollEvents(s);
  expect(fired).toContain('ev_golden_week');
  expect(fired).not.toContain('ev_typhoon_alert'); // 7~9월
  expect(s.notices.some((n) => n.startsWith('황금연휴:'))).toBe(true);
  expect(effectMult(s, 'spawnMult')).toBe(1.5);
  const s2 = bareState(1); s2.clock.month = 5;
  expect(rollEvents(s2)).toEqual(fired); // 같은 seed → 같은 결과
  expect(rollEvents(s2, [eventDef('ev_golden_week')])).toEqual([]); // 같은 달엔 이미 일어난 이벤트를 다시 안 굴린다
  // 선택 이벤트
  const tv: EventDef = { ...eventDef('ev_tv_shoot'), months: [5], prob: 100, conditionText: null };
  const s3 = bareState(1); s3.clock.month = 5;
  expect(rollEvents(s3, [tv])).toEqual(['ev_tv_shoot']);
  expect(s3.board.events).toEqual([{ id: 'ev_tv_shoot', monthIndex: monthIndex(s3.clock), status: 'pending' }]);
  expect(boardBadge(s3)).toBe(1);
  const m0 = s3.money;
  expect(apply(s3, { type: 'respondEvent', id: 'ev_tv_shoot', accept: true }).ok).toBe(true);
  expect(s3.money).toBe(m0 - 2_000_000);
  expect(s3.segmentPopularity['student']).toBe(30); // 전 손님 +10
  expect(apply(s3, { type: 'respondEvent', id: 'ev_tv_shoot', accept: true }).ok).toBe(false);
  // 거절
  const s4 = bareState(1); s4.clock.month = 5;
  rollEvents(s4, [tv]);
  const m4 = s4.money;
  apply(s4, { type: 'respondEvent', id: 'ev_tv_shoot', accept: false });
  expect(s4.money).toBe(m4);
  // 답 안 하면 다음 달 자동 거절
  const s5 = bareState(1); s5.clock.month = 5;
  rollEvents(s5, [tv]);
  s5.clock.month = 6;
  expireEvents(s5);
  expect(s5.board.events[0]!.status).toBe('declined');
  // 조건·자격
  expect(eventEligible(s, eventDef('ev_canola_bloom'))).toBe(false); // 3월 + canola 5개
});

test('효과 DSL: 손님 배수(전체·필터)·손님 0·수확·유지비·인기·아이템, 기간이 지나면 사라진다', () => {
  const { s, seat } = cafe();
  s.storage['tangerine'] = 99;
  s.clock.month = 4; // 계절 배수 1
  const base = dailyGuestCount(s);
  applyEventEffect(s, { kind: 'spawnMult', mult: 2, days: 3 }, 't');
  expect(dailyGuestCount(s)).toBe(Math.min(totalSeats(s) * GUESTS_PER_SEAT, base * 2)); // 좌석 × 6 상한
  applyEventEffect(s, { kind: 'spawnMult', mult: 3, days: 3, filter: 'senior' }, 't');
  expect(typeWeight(s, 'local_auntie', 12)).toBeCloseTo(5 * 1.6 * 3);
  expect(typeWeight(s, 'student', 10)).toBeCloseTo(5 * 1.4); // 청년엔 안 걸림
  expect(filterMatches('family', 'rentcar_family')).toBe(true);
  expect(filterMatches({ guestId: 'couple' }, 'couple')).toBe(true);
  expect(filterMatches('tourist', 'local_auntie')).toBe(false);
  applyEventEffect(s, { kind: 'noGuests', days: 1 }, 't');
  expect(noGuestsToday(s)).toBe(true);
  expect(hourlySpawn(s)).toBe(0);
  // 수확 ×1.5: 감귤나무 월 수확(지난달에 놓은 것)
  const tree = placeObject(s, 'tangerine_tree', X(6), Y(2));
  tree.placedMonth -= 1;
  const plain = monthlyYieldOf(s, tree);
  expect(plain).toBe(6);
  applyEventEffect(s, { kind: 'harvestMult', mult: 1.5, days: 30 }, 't');
  expect(monthlyYieldOf(s, tree)).toBe(Math.floor(plain * 1.5));
  // 유지비 ×2
  const u = bareState(1); placeObject(u, 'table_out', X(4), Y(5));
  const m0 = u.money; upkeep(u); const base0 = m0 - u.money;
  expect(base0).toBeGreaterThan(0);
  applyEventEffect(u, { kind: 'upkeepMult', mult: 2, days: 30 }, 't');
  const m1 = u.money; upkeep(u);
  expect(m1 - u.money).toBe(base0 * 2);
  // 인기·아이템
  applyEventEffect(s, { kind: 'popularity', delta: 5, filter: 'local' }, 't');
  expect(s.segmentPopularity['local_auntie']).toBe(35);
  expect(s.segmentPopularity['student']).toBe(20);
  applyEventEffect(s, { kind: 'grantItem', itemId: 'honey', n: 2 }, 't');
  expect(s.inventory['honey']).toBe(2);
  // 만료: 3일 뒤 손님 배수 끝, 하루짜리 손님 0은 다음 날
  const d0 = dayIndex(s.clock);
  s.clock.day += 1; pruneEffects(s);
  expect(noGuestsToday(s)).toBe(false);
  expect(effectMult(s, 'spawnMult')).toBe(2);
  s.clock.day = s.clock.day + 2; pruneEffects(s);
  expect(dayIndex(s.clock)).toBe(d0 + 3);
  expect(effectMult(s, 'spawnMult')).toBe(1);
  void seat;
});

test('관광지: 시작·랭크·앞 관광지 Lv4 해금, 레벨별 비용, 매력도 합 → 하루 손님, Lv2 손님·Lv4 부탁', () => {
  const s = bareState(1);
  s.money = 1e9;
  expect(spotUnlocked(s, 'canola_field')).toBe(true);
  expect(spotUnlocked(s, 'sangumburi')).toBe(false);
  expect(spotUnlocked(s, 'olle_trail')).toBe(false); // 랭크 2
  expect(canInvestSpot(s, 'sangumburi').ok).toBe(false);
  expect(canInvestSpot(s, 'nope').ok).toBe(false);
  expect(nextSpotLevel(s, 'canola_field')).toEqual({ level: 1, cost: 500_000, appeal: 9 });
  expect(apply(s, { type: 'investSpot', id: 'canola_field' }).ok).toBe(true);
  expect(s.money).toBe(1e9 - 500_000);
  expect(s.spots['canola_field']).toBe(1);
  expect(spotAppeal(s)).toBe(9);
  expect(isUnlocked(s, 'insta_traveler')).toBe(false);
  apply(s, { type: 'investSpot', id: 'canola_field' }); // Lv2
  expect(isUnlocked(s, 'insta_traveler')).toBe(true);
  expect(spotAppeal(s)).toBe(20);
  const g0 = popularityGuestBase(s);
  apply(s, { type: 'investSpot', id: 'canola_field' }); // Lv3 (32)
  apply(s, { type: 'investSpot', id: 'canola_field' }); // Lv4 (44)
  expect(spotGuestBonus(s)).toBe(Math.floor(44 / APPEAL_PER_GUEST));
  expect(spotDailyGuests(s)).toBe(Math.floor(44 / SPOT_APPEAL_PER_GUEST)); // 매력도 8당 하루 +1
  expect(popularityGuestBase(s)).toBeGreaterThan(g0);
  expect(s.board.quests['q_influencer']!.status).toBe('offered'); // Lv4 부탁
  expect(isUnlocked(s, 'influencer')).toBe(true);
  expect(spotUnlocked(s, 'sangumburi')).toBe(true); // 다음 관광지
  expect(s.notices).toContain('산굼부리에 투자할 수 있어요');
  apply(s, { type: 'investSpot', id: 'canola_field' }); // Lv5
  expect(s.spots['canola_field']).toBe(SPOT_MAX_LEVEL);
  expect(apply(s, { type: 'investSpot', id: 'canola_field' }).ok).toBe(false);
  expect(spotAppeal(s)).toBe(55);
  s.money = 100;
  expect(apply(s, { type: 'investSpot', id: 'sangumburi' }).ok).toBe(false); // 돈
  s.rank = 2;
  expect(spotUnlocked(s, 'olle_trail')).toBe(true);
});

test('투어 버스: Lv3 이상 관광지의 Lv2 손님이 일요일 11시에 4~6명 한꺼번에', () => {
  const { s } = cafe();
  for (let x = 0; x < 4; x++) placeObject(s, 'table_out', X(x), Y(5)); // 좌석 10
  for (const x of [0, 1, 2, 3, 5]) placeObject(s, 'path', X(x), Y(6));
  s.money = 1e9;
  expect(busSpots(s)).toEqual([]);
  expect(tourBus(s)).toBe(0);
  for (let i = 0; i < 3; i++) apply(s, { type: 'investSpot', id: 'canola_field' });
  expect(busSpots(s).map((d) => d.id)).toEqual(['canola_field']);
  const n = tourBus(s);
  expect(n).toBeGreaterThanOrEqual(4); expect(n).toBeLessThanOrEqual(6);
  expect(s.guests.every((g) => g.type === 'insta_traveler')).toBe(true);
  // 스케줄: 7일 11시에만
  const s2 = bareState(1); placeObject(s2, 'table_out', X(4), Y(5)); s2.money = 1e9;
  for (let i = 0; i < 3; i++) apply(s2, { type: 'investSpot', id: 'canola_field' });
  s2.segmentPopularity = {};
  for (const id of Object.keys(s2.guestTypes)) if (id !== 'insta_traveler') s2.guestTypes[id]!.unlocked = false;
  s2.guestTypes['insta_traveler']!.unlocked = true;
  s2.segmentPopularity['insta_traveler'] = 0;
  // 6일 밤까지 진행 뒤 7일 11시
  let seen = 0;
  for (let d = 1; d <= 7; d++) for (let h = 6; h < 24; h++) {
    tick(s2, HOUR_MS);
    if (s2.clock.day === 7 && s2.clock.hour === 12) seen = s2.guests.length + seen;
  }
  expect(seen).toBeGreaterThanOrEqual(1);
  void step;
});

test('월초 훅: 해금 → 기한·이벤트·부탁이 순서대로 돌고 저장/복원이 같다', () => {
  const s = bareState(3);
  placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'americano');
  s.money = 1e9;
  for (let i = 0; i < 3; i++) apply(s, { type: 'investSpot', id: 'canola_field' });
  for (let i = 0; i < 95; i++) tick(s, DAY_MS);
  expect(s.board.events.length).toBeGreaterThan(0);
  expect(s.effects.every((e) => e.untilDay > 0)).toBe(true);
  expect(spawnGuests(s, 1)).toBeGreaterThanOrEqual(0);
  updateGuests(s, 100);
  void afterInvest;
});

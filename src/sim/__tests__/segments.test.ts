import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { MAX_RANK } from '../rank.ts';
import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { apply } from '../actions.ts';
import { spawnGuests, updateGuests, typeWeight, affordableMenus, PREP_MS } from '../guests.ts';
import {
  evaluateUnlocks, unlockCondMet, unlockGuestType, isUnlocked, unlockedTypeIds, addSatisfaction, onHappyVisit, onAngryVisit, walletOf, regularFreqMult, guestFace, updateRank,
  SAT_HAPPY, SAT_TARGET, SAT_REGULAR, SAT_VIP, REGULAR_FREQ, REGULAR_WALLET, VIP_FREQ, VIP_WALLET, MAX_TARGETS, TARGET_SPAWN_MULT, UNLOCK_POPULARITY, TIP_RATE, VISIT_BONUS_CAP,
} from '../segments.ts';
import { objectStats, BASE_POPULARITY } from '../compat.ts';
import { GUEST_TYPES, GUEST_CHAINS, guestTypeDef, guestTags, canonicalGuestId, QUESTS } from '../../data/index.ts';
import type { Guest } from '../types.ts';

function cafe(seed = 1) {
  const s = bareState(seed);
  const seat = placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 50;
  return { s, seat };
}
/** 앉아서 주문까지 마친 손님 하나 */
function seated(s: ReturnType<typeof createInitialState>, type: string): Guest {
  spawnGuests(s, 1);
  const g = s.guests[s.guests.length - 1]!;
  g.type = type;
  updateGuests(s, 6000);
  return g;
}

test('손님 100종: v2 103타입, 시작 해금 3, 구 id 별칭(local·tourist), 체인·부탁 참조가 모두 유효', () => {
  expect(GUEST_TYPES.length).toBe(103);
  const s = bareState(1);
  expect(unlockedTypeIds(s).sort()).toEqual(['local_auntie', 'student', 'village_head']);
  expect(guestTypeDef('local').id).toBe('local_auntie');
  expect(guestTypeDef('tourist').id).toBe('student');
  expect(canonicalGuestId('local')).toBe('local_auntie');
  expect(guestTags('local').age).toBe('senior');
  expect(guestTypeDef('local_auntie')).toMatchObject({ minScenery: 0, popularityShift: -2, effect: 'item', wallet: 6000 });
  expect(guestTypeDef('student')).toMatchObject({ minScenery: 2, popularityShift: 2, effect: 'ad', unlock: { type: 'start' } });
  expect(guestTypeDef('couple').minScenery).toBe(3); // 경치를 바라는 타입
  for (const t of GUEST_TYPES) {
    if (t.questId) expect(QUESTS.some((q) => q.id === t.questId)).toBe(true);
    if (t.nextGuest) expect(GUEST_TYPES.some((x) => x.id === t.nextGuest)).toBe(true);
    expect(t.likes).toContain('drink');
  }
  expect(GUEST_CHAINS.length).toBe(30);
  for (const c of GUEST_CHAINS) for (const e of c.edges) expect(QUESTS.find((q) => q.id === e.quest)!.unlockGuestId).toBe(e.to);
});

test('해금 조건 8형', () => {
  const s = bareState(1);
  expect(unlockCondMet(s, { type: 'start' })).toBe(true);
  expect(unlockCondMet(s, { type: 'rank', rank: 2 })).toBe(false);
  s.rank = 2;
  expect(unlockCondMet(s, { type: 'rank', rank: 2 })).toBe(true);
  expect(unlockCondMet(s, { type: 'star', star: 2 })).toBe(false);
  s.star = 3;
  expect(unlockCondMet(s, { type: 'star', star: 2 })).toBe(true);
  expect(unlockCondMet(s, { type: 'segment', guestId: 'local', satisfaction: 30 })).toBe(false);
  s.guestTypes['local_auntie']!.satisfaction = 30;
  expect(unlockCondMet(s, { type: 'segment', guestId: 'local', satisfaction: 30 })).toBe(true);
  expect(unlockCondMet(s, { type: 'quest', questId: 'q_student' })).toBe(false);
  s.board.quests['q_student'] = { id: 'q_student', status: 'done', offeredMonthIndex: 0, deadlineMonthIndex: null, progress: 0 };
  expect(unlockCondMet(s, { type: 'quest', questId: 'q_student' })).toBe(true);
  expect(unlockCondMet(s, { type: 'spot', spotId: 'canola_field', level: 2 })).toBe(false);
  s.spots['canola_field'] = 2;
  expect(unlockCondMet(s, { type: 'spot', spotId: 'canola_field', level: 2 })).toBe(true);
  expect(unlockCondMet(s, { type: 'date', year: 1, month: 4 })).toBe(false); // 1년 3월 시작
  s.clock.month = 4;
  expect(unlockCondMet(s, { type: 'date', year: 1, month: 4 })).toBe(true);
  expect(unlockCondMet(s, { type: 'count', objectId: 'tangerine_tree', count: 3 })).toBe(false);
  for (let i = 0; i < 3; i++) placeObject(s, 'tangerine_tree', X(6 + i), Y(2));
  expect(unlockCondMet(s, { type: 'count', objectId: 'tangerine_tree', count: 3 })).toBe(true);
  expect(unlockCondMet(s, { type: 'all', conditions: [{ type: 'rank', rank: 2 }, { type: 'star', star: 9 }] })).toBe(false);
  expect(unlockCondMet(s, { type: 'all', conditions: [{ type: 'rank', rank: 2 }, { type: 'star', star: 3 }] })).toBe(true);
});

test('evaluateUnlocks: 조건이 맞는 타입을 열고 알림·시작 인기, 이미 열린 것은 다시 열지 않는다', () => {
  const s = bareState(1);
  expect(evaluateUnlocks(s)).toEqual([]);
  for (let i = 0; i < 3; i++) placeObject(s, 'tangerine_tree', X(6 + i), Y(2)); // 까치: 감귤나무 3
  s.clock.month = 4; // 육지 삼춘: 1년 4월
  expect(evaluateUnlocks(s).sort()).toEqual(['magpie_thief', 'mainlander_auntie']);
  expect(isUnlocked(s, 'magpie_thief')).toBe(true);
  expect(s.segmentPopularity['mainlander_auntie']).toBe(UNLOCK_POPULARITY);
  expect(s.notices).toContain('새 손님: 육지 삼춘');
  expect(evaluateUnlocks(s)).toEqual([]);
  expect(unlockGuestType(s, 'magpie_thief')).toBe(false);
  // 부탁 완료 → 체인 다음 타입
  s.board.quests['q_student'] = { id: 'q_student', status: 'done', offeredMonthIndex: 0, deadlineMonthIndex: null, progress: 0 };
  expect(evaluateUnlocks(s)).toEqual(['working_holiday']);
});

test('랭크: 점수(누적 손님/50 + 시설×2 + 해금 손님층×5)가 문턱을 넘으면 오르고 내려가지 않는다', () => {
  const s = bareState(1);
  updateRank(s);
  expect(s.rank).toBe(1);
  const ids = GUEST_TYPES.map((t) => t.id);
  for (const id of ids.slice(0, 10)) unlockGuestType(s, id); // 시작 타입 포함 10 → 50점 = 랭크 2
  updateRank(s);
  expect(s.rank).toBe(2);
  s.totalGuests = 100_000; // 2000점 → 최고 랭크
  updateRank(s);
  expect(s.rank).toBe(MAX_RANK);
  s.totalGuests = 0;
  updateRank(s);
  expect(s.rank).toBe(MAX_RANK);
});

test('타깃: 최대 3, 토글, null로 전부 해제, 잠긴 타입 거부, targetSegment는 첫 타깃', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'setTarget', segment: 'couple' }).ok).toBe(false); // 잠김
  expect(apply(s, { type: 'setTarget', segment: 'local' }).ok).toBe(true);
  expect(s.targets).toEqual(['local_auntie']);
  expect(s.targetSegment).toBe('local_auntie');
  expect(apply(s, { type: 'setTarget', segment: 'student' }).ok).toBe(true);
  expect(apply(s, { type: 'setTarget', segment: 'village_head' }).ok).toBe(true);
  expect(s.targets.length).toBe(MAX_TARGETS);
  unlockGuestType(s, 'couple');
  expect(apply(s, { type: 'setTarget', segment: 'couple' }).ok).toBe(false); // 3개 초과
  expect(apply(s, { type: 'setTarget', segment: 'student' }).ok).toBe(true); // 토글 해제
  expect(s.targets).toEqual(['local_auntie', 'village_head']);
  expect(apply(s, { type: 'setTarget', segment: null }).ok).toBe(true);
  expect(s.targets).toEqual([]);
  expect(s.targetSegment).toBeNull();
});

test('스폰: 잠긴 타입은 가중치 0, 해금되면 온다', () => {
  const s = bareState(1);
  expect(typeWeight(s, 'couple', 10)).toBe(0);
  unlockGuestType(s, 'couple');
  expect(typeWeight(s, 'couple', 10)).toBeCloseTo(5 * (1 + UNLOCK_POPULARITY / 50));
  expect(typeWeight(s, 'couple', 12)).toBeCloseTo(5 * (1 + UNLOCK_POPULARITY / 50) * 2); // 청년 낮 ×2
  const { s: s2 } = cafe();
  s2.guestTypes['student']!.unlocked = false;
  s2.guestTypes['village_head']!.unlocked = false;
  spawnGuests(s2, 2);
  expect(s2.guests.map((g) => g.type)).toEqual(['local_auntie', 'local_auntie']);
});

test('예산: 지갑보다 비싼 메뉴는 주문하지 않고 price로 meh, 지갑 0(동물)은 주문 없이 바로 기분', () => {
  const { s } = cafe();
  setSlot(s, 1, 'tangerine_ade'); // 5000 (사온 재료 없음 → 창고만)
  s.storage['tangerine'] = 50;
  expect(affordableMenus(s, 'student')).toEqual(['carrot_juice', 'tangerine_ade']); // 지갑 6000
  expect(affordableMenus(s, 'taxi_driver')).toEqual(['carrot_juice']); // 지갑 4000
  expect(affordableMenus(s, 'kid_pocketmoney')).toEqual([]); // 용돈 초등학생 지갑 2000: 아무것도 못 산다
  unlockGuestType(s, 'kid_pocketmoney');
  const g = seated(s, 'kid_pocketmoney');
  expect(g.mood).toBe('meh');
  expect(g.moodReason).toBe('price');
  expect(g.menuId).toBeNull();
  unlockGuestType(s, 'magpie_thief');
  const d = seated(s, 'magpie_thief'); // 지갑 0 (까치)
  expect(d.menuId).toBeNull();
  expect(d.mood).toBeNull(); // 조리 대기 없이 다음 스텝에 기분
  updateGuests(s, 100);
  expect(d.mood).toBe('happy'); // minScenery 0
});

test('만족 게이지: happy +2, 타깃 +3, angry −1, 50 단골(빈도 ×1.5·예산 ×1.3), 80 VIP(×2·×1.6)', () => {
  const { s } = cafe();
  const g = seated(s, 'local_auntie');
  updateGuests(s, PREP_MS);
  expect(g.mood).toBe('happy');
  expect(s.guestTypes['local_auntie']!.satisfaction).toBe(SAT_HAPPY);
  apply(s, { type: 'setTarget', segment: 'local_auntie' });
  onHappyVisit(s, g);
  expect(s.guestTypes['local_auntie']!.satisfaction).toBe(SAT_HAPPY + SAT_TARGET);
  onAngryVisit(s, g);
  expect(s.guestTypes['local_auntie']!.satisfaction).toBe(SAT_HAPPY + SAT_TARGET - 1);
  expect(regularFreqMult(s, 'local_auntie')).toBe(1);
  addSatisfaction(s, 'local_auntie', SAT_REGULAR);
  expect(s.guestTypes['local_auntie']!.regular).toBe('regular');
  expect(regularFreqMult(s, 'local_auntie')).toBe(REGULAR_FREQ);
  expect(walletOf(s, 'local_auntie')).toBe(Math.round(6000 * REGULAR_WALLET));
  expect(s.notices.some((n) => n.includes('단골'))).toBe(true);
  addSatisfaction(s, 'local_auntie', SAT_VIP);
  expect(s.guestTypes['local_auntie']!.regular).toBe('vip');
  expect(regularFreqMult(s, 'local_auntie')).toBe(VIP_FREQ);
  expect(walletOf(s, 'local_auntie')).toBe(Math.round(6000 * VIP_WALLET));
  expect(typeWeight(s, 'local_auntie', 12)).toBeCloseTo(5 * (1 + 30 / 50) * VIP_FREQ * TARGET_SPAWN_MULT); // 타깃 스폰 ×1.3 (y-ui)
  addSatisfaction(s, 'local_auntie', 999);
  expect(s.guestTypes['local_auntie']!.satisfaction).toBe(100);
});

test('효과 6종: 자금(팁 20%)·연구 진행(+2)·홍보(같은 태그 +1)·시설 인기(+1, 상한 10)·아이템(5%)·응모권(1%)', () => {
  const { s, seat } = cafe();
  // money: 팀장님 wallet 18000
  unlockGuestType(s, 'team_leader');
  const money0 = s.money;
  const g = seated(s, 'team_leader');
  expect(g.paid).toBe(4000);
  updateGuests(s, PREP_MS);
  expect(g.mood).toBe('happy'); // adult minScenery 1, 정낭 경치 1
  expect(s.money - money0).toBe(4000 + Math.round(4000 * TIP_RATE));
  // research: 은퇴 선생님(시니어, 경치 0) → 연구 진행 기본 1 + 효과 1 = 2명 몫
  unlockGuestType(s, 'retired_teacher');
  s.researchAcc = 0;
  const w = seated(s, 'retired_teacher');
  updateGuests(s, PREP_MS);
  expect(w.mood).toBe('happy');
  expect(s.researchAcc).toBe(2);
  // ad: 대학생(청년) happy → 해금된 청년 타입 인기 +1
  unlockGuestType(s, 'working_holiday');
  s.segmentPopularity['working_holiday'] = 10;
  const pop0 = s.segmentPopularity['student']!;
  onHappyVisit(s, { ...g, type: 'student', paid: 0 });
  expect(s.segmentPopularity['student']).toBe(pop0 + 1);
  expect(s.segmentPopularity['working_holiday']).toBe(11);
  expect(s.segmentPopularity['local_auntie']).toBe(30); // 시니어는 그대로
  expect(s.segmentPopularity['couple']).toBeUndefined(); // 잠긴 타입은 그대로
  // popularity: 커플 → 좌석 종류 인기 +1, 상한 10
  const c: Guest = { ...g, type: 'couple', seatId: seat.id };
  for (let i = 0; i < 15; i++) onHappyVisit(s, c);
  expect(s.visitBonus['table_out']).toBe(VISIT_BONUS_CAP);
  expect(objectStats(s, seat.id).popularity).toBe(BASE_POPULARITY + VISIT_BONUS_CAP);
  // item 5% / ticket 1%: seed 반복으로 확률 근사
  let items = 0, tickets = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const s2 = bareState(seed);
    s2.tickets = 0;
    onHappyVisit(s2, { ...g, type: 'village_head', seatId: null });
    if (Object.keys(s2.inventory).length > 0) items++;
    onHappyVisit(s2, { ...g, type: 'school_club', seatId: null });
    tickets += s2.tickets;
  }
  expect(items).toBeGreaterThan(8); expect(items).toBeLessThan(40);   // 5% ±
  expect(tickets).toBeGreaterThan(0); expect(tickets).toBeLessThan(15); // 1%
});

test('얼굴은 id로 결정적이고 시니어는 회색 머리', () => {
  expect(guestFace('couple')).toEqual(guestFace('couple'));
  expect(guestFace('couple')).not.toEqual(guestFace('student'));
  expect(guestFace('village_head').hair % 6).toBe(4);
  expect(guestFace('local')).toEqual(guestFace('local_auntie'));
});

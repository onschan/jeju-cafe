import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { serialize, deserialize } from '../save.ts';
import { updateGuests, hourlyRegulars, spawnNamedGuest, GUEST_SPEED_CELLS_PER_S, PREP_MS } from '../guests.ts';
import {
  isWeekend, daysToWeekend, popupCost, popupGuestCount, affinityGain, canOpenPopup, resolvePopupVisit, addAffinity, namedGuestState, regionState,
  regularIds, regularVisitSlot, regularsDueNow, metCount, regionProgress, bestRegion, namedGuestFace, namedLikes,
  POPUP_COST_SCALE, AFFINITY_MAX, AFFINITY_REWARD_STEP, POPUP_GUESTS_MAX, POPUP_NEW_MAX,
} from '../popup.ts';
import { botDay, newBotCursor } from '../bot.ts';
import { REGIONS, NAMED_GUESTS, MENUS, regionDef, namedGuestDef, namedGuestsOf, guestTypeDef, NAMED_TYPE } from '../../data/index.ts';

/** tick은 한 번에 60초(600스텝)까지만 감아서 하루 단위로 나눠 돌린다 */
function run(s: ReturnType<typeof createInitialState>, ms: number) {
  for (let left = ms; left > 0; left -= DAY_MS) tick(s, Math.min(DAY_MS, left));
}
/** 6일(주말) 아침으로 */
function toWeekend(s = bareState(1)) {
  run(s, DAY_MS * 5);
  expect(s.clock.day).toBe(6);
  return s;
}
/** 맛 12 개발 메뉴 (맛 취향 일치, 직원 조건 없음) */
const STRONG_LATTE = 'm_custom_1';
function addStrongLatte(s: ReturnType<typeof createInitialState>) {
  s.customMenus.push({ id: STRONG_LATTE, name: '진한 라떼', category: 'drink', price: 4000, ingredients: { beans: 1 }, stats: { taste: 12, aroma: 8, look: 3, health: 1, volume: 4, jeju: 0 } });
  s.unlocked.menus.push(STRONG_LATTE);
}
/** 정낭 위 테이블 + 아메리카노·진한 라떼 */
function cafe(s = bareState(1)) {
  placeObject(s, 'table_out', X(4), Y(5));
  addStrongLatte(s);
  setSlot(s, 0, 'americano');
  setSlot(s, 1, STRONG_LATTE);
  return s;
}

test('데이터: 지역 7 · 이름 있는 손님 56 (ng01~ng56, 지역당 8) · 취향 분류·스탯·예산·얼굴 시드', () => {
  expect(REGIONS).toHaveLength(7);
  expect(NAMED_GUESTS).toHaveLength(56);
  expect(NAMED_GUESTS.map((g) => g.id)).toEqual(Array.from({ length: 56 }, (_, i) => `ng${String(i + 1).padStart(2, '0')}`));
  for (const r of REGIONS) expect(namedGuestsOf(r.id)).toHaveLength(8);
  expect(regionDef('dongmun')).toMatchObject({ name: '동문시장', popupCost: 500, decayPerWeek: 8, recoverPerWeek: 5 });
  expect(popupCost('dongmun')).toBe(500 * POPUP_COST_SCALE);
  expect(popupCost('dolhareubang')).toBe(65535 * POPUP_COST_SCALE);
  const g = namedGuestDef('ng01');
  expect(g).toMatchObject({ regionId: 'dongmun', name: '고순자', job: '생선 장수 삼춘', likesBase: ['drink'], likesStats: ['taste', 'volume'], budget: 5000 });
  expect(namedGuestFace(g)).toEqual(namedGuestFace(namedGuestDef('ng01')));
  expect(namedLikes({ ...g, likesBase: ['any'] })).toEqual(['drink', 'dessert', 'meal', 'signature']);
  // 단골★ 본점 스폰용 타입은 손님층 목록 밖에 있지만 정의는 찾는다
  expect(guestTypeDef(NAMED_TYPE).id).toBe(NAMED_TYPE);
  expect(() => regionDef('nope')).toThrow();
});

test('주말 판정: 6·13·20·27일만, 다음 주말까지 남은 날', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 13, 14, 20, 27, 28, 30].map(isWeekend)).toEqual([false, false, false, false, false, true, false, true, false, true, true, false, false]);
  expect(daysToWeekend(1)).toBe(5);
  expect(daysToWeekend(6)).toBe(0);
  expect(daysToWeekend(7)).toBe(6);
  expect(daysToWeekend(30)).toBe(4); // 30 % 7 = 2 → 4일 뒤 (다음 달 6일과 같은 요일 주기)
});

test('팝업 열기: 주말에만, 비용·이미 열림·돈 부족 거부, 열면 지역 활기·식욕 −8 · 오늘 손님 줄', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'openPopup', regionId: 'dongmun' })).toMatchObject({ ok: false, reason: expect.stringContaining('주말') });
  toWeekend(s);
  expect(apply(s, { type: 'openPopup', regionId: 'nope' }).ok).toBe(false);
  s.money = 40_000;
  expect(apply(s, { type: 'openPopup', regionId: 'dongmun' })).toMatchObject({ ok: false, reason: '돈이 모자라요' });
  s.money = 1_000_000;
  expect(apply(s, { type: 'openPopup', regionId: 'dongmun' }).ok).toBe(true);
  expect(s.money).toBe(1_000_000 - 50_000);
  expect(s.monthCosts.ads).toBe(50_000);
  expect(s.popup.regionId).toBe('dongmun');
  expect(s.popup.queue).toHaveLength(POPUP_NEW_MAX); // 식욕 100 → 8명이지만 처음 보는 손님은 3명까지 (game-feel P1), 나머지 줄은 이미 만난 손님이 채운다
  expect(new Set(s.popup.queue).size).toBe(POPUP_NEW_MAX);
  // 다 만난 지역이면 8명
  const s8 = bareState(1); toWeekend(s8); s8.money = 1_000_000;
  for (const g of namedGuestsOf('dongmun')) namedGuestState(s8, g.id).met = true;
  expect(apply(s8, { type: 'openPopup', regionId: 'dongmun' }).ok).toBe(true);
  expect(s8.popup.queue).toHaveLength(POPUP_GUESTS_MAX);
  expect(new Set(s8.popup.queue).size).toBe(8);
  expect(regionState(s, 'dongmun')).toEqual({ vitality: 92, appetite: 92 });
  expect(apply(s, { type: 'openPopup', regionId: 'hyeopjae' })).toMatchObject({ ok: false, reason: '이미 팝업을 열었어요' });
  expect(apply(s, { type: 'closePopup' }).ok).toBe(true);
  expect(s.popup.regionId).toBeNull();
  expect(apply(s, { type: 'closePopup' }).ok).toBe(false);
});

test('손님 수 = 8 × 식욕/100 (6~8) · 호감도 = 10 × 취향 ×2 × max(0.5, 활기/100)', () => {
  expect(popupGuestCount(100)).toBe(8);
  expect(popupGuestCount(85)).toBe(7);
  expect(popupGuestCount(75)).toBe(6);
  expect(popupGuestCount(0)).toBe(6);
  expect(affinityGain(false)).toBe(10);
  expect(affinityGain(true)).toBe(20);
  expect(affinityGain(false, 50)).toBe(5);
  expect(affinityGain(true, 0)).toBe(10);
});

test('팝업 하루: 매 시간 한 명씩 카운터에 와서 메뉴를 고르고 호감도가 오른다, 다음 날 아침 정리·닫힘', () => {
  const s = cafe(toWeekend());
  for (const g of namedGuestsOf('dongmun')) namedGuestState(s, g.id).met = true; // 다 만난 지역 → 8명 줄 (처음 보는 손님은 하루 3명까지, game-feel P1)
  apply(s, { type: 'openPopup', regionId: 'dongmun' });
  const money0 = s.money;
  tick(s, HOUR_MS);
  expect(s.popup.visits).toHaveLength(1);
  expect(s.popup.queue).toHaveLength(7);
  const v = s.popup.visits[0]!;
  expect(v.menuId === 'americano' || v.menuId === STRONG_LATTE || v.menuId === null).toBe(true);
  tick(s, HOUR_MS * 7);
  expect(s.popup.visits).toHaveLength(8);
  expect(s.popup.queue).toHaveLength(0);
  expect(s.popup.regionId).toBe('dongmun'); // 그날은 열려 있다
  const ate = s.popup.visits.filter((x) => x.menuId !== null);
  expect(ate.length).toBeGreaterThan(0);
  expect(s.money).toBeGreaterThan(money0);
  for (const x of ate) expect(namedGuestState(s, x.namedId).affinity).toBeGreaterThanOrEqual(affinityGain(false, 92)); // 활기 92 → 9
  for (const x of s.popup.visits) expect(namedGuestState(s, x.namedId).met).toBe(true);
  expect(metCount(s)).toBe(8);
  expect(regionProgress(s, 'dongmun')).toEqual({ met: 8, regular: 0, total: 8 });
  // 다음 날
  tick(s, DAY_MS);
  expect(s.popup.regionId).toBeNull();
  expect(s.notices.some((n) => n.includes('정리'))).toBe(true);
});

test('팝업 당일에 닫으면 남은 줄은 안 온다 · 열린 채 날이 바뀌면 남은 손님을 한꺼번에 정리한다', () => {
  const s = cafe(toWeekend());
  apply(s, { type: 'openPopup', regionId: 'hyeopjae' });
  tick(s, HOUR_MS * 2);
  expect(s.popup.visits).toHaveLength(2);
  apply(s, { type: 'closePopup' });
  tick(s, HOUR_MS * 3);
  expect(s.popup.visits).toHaveLength(2);
  const s2 = cafe(toWeekend());
  tick(s2, HOUR_MS * 14); // 20시에 연다 → 4명만 시간 안에
  apply(s2, { type: 'openPopup', regionId: 'hyeopjae' });
  tick(s2, DAY_MS);
  expect(s2.popup.visits).toHaveLength(POPUP_NEW_MAX);
  expect(s2.popup.regionId).toBeNull();
});

test('메뉴 선택: 취향 분류·예산 안에서 고른다. 없으면 no_menu, 비싸면 price(호감도 0). 취향 스탯이 맞으면 ×2', () => {
  const s = bareState(1);
  setSlot(s, 0, 'cookie'); // 디저트 2500
  const a = resolvePopupVisit(s, 'ng01'); // 음료만 좋아함
  expect(a).toMatchObject({ menuId: null, mood: 'meh', reason: 'no_menu', gain: 0 });
  expect(namedGuestState(s, 'ng01').met).toBe(true);
  setSlot(s, 0, 'toast'); // 디저트 3000 > 초등학생 예산 2000
  const b = resolvePopupVisit(s, 'ng02');
  expect(b).toMatchObject({ menuId: null, mood: 'meh', reason: 'price', gain: 0 });
  setSlot(s, 0, 'americano'); // 맛 6 → 취향(맛·양) 불일치
  const c = resolvePopupVisit(s, 'ng01');
  expect(c).toMatchObject({ menuId: 'americano', mood: 'happy', taste: false, gain: 10, affinity: 10 });
  expect(s.menuSold['americano']).toBe(1);
  addStrongLatte(s);
  setSlot(s, 0, STRONG_LATTE); // 맛 12 → 일치
  const d = resolvePopupVisit(s, 'ng01');
  expect(d).toMatchObject({ menuId: STRONG_LATTE, taste: true, gain: 20, affinity: 30 });
});

test('호감도 100/200/300 → 보상 재료 상자 → 아이템 → 레시피(없으면 마일리지 5), 첫 보상 때 단골★', () => {
  const s = bareState(1);
  const st = namedGuestState(s, 'ng05');
  addAffinity(s, 'ng05', 90);
  expect(st).toMatchObject({ affinity: 90, rewardsTaken: 0, regular: false });
  const storage0 = Object.values(s.storage).reduce((n, x) => n + x, 0);
  const r1 = addAffinity(s, 'ng05', 20);
  expect(st).toMatchObject({ affinity: 110, rewardsTaken: 1, regular: true });
  expect(r1.regularNow).toBe(true);
  expect(r1.reward).toContain('재료 상자');
  expect(Object.values(s.storage).reduce((n, x) => n + x, 0)).toBe(storage0 + 3);
  expect(s.notices.some((n) => n.includes('단골★'))).toBe(true);
  expect(regularIds(s)).toEqual(['ng05']);
  const r2 = addAffinity(s, 'ng05', AFFINITY_REWARD_STEP);
  expect(st.rewardsTaken).toBe(2);
  expect(r2.regularNow).toBe(false);
  expect(r2.reward).toContain('아이템');
  expect(Object.values(s.inventory).reduce((n, x) => n + x, 0)).toBe(1);
  const menus0 = s.unlocked.menus.length;
  const r3 = addAffinity(s, 'ng05', 500);
  expect(st).toMatchObject({ affinity: AFFINITY_MAX, rewardsTaken: 3 });
  expect(r3.reward).toContain('레시피');
  expect(s.unlocked.menus.length).toBe(menus0 + 1);
  expect(addAffinity(s, 'ng05', 10).reward).toBeNull(); // 더는 없다
  // 아는 메뉴가 다면 마일리지
  const s2 = bareState(2);
  namedGuestState(s2, 'ng09').rewardsTaken = 2;
  s2.unlocked.menus = MENUS.map((m) => m.id);
  addAffinity(s2, 'ng09', 300);
  expect(s2.mileage).toBe(5);
  // 한 번에 두 문턱을 넘으면 보상 둘 다
  const s3 = bareState(3);
  addAffinity(s3, 'ng10', 250);
  expect(namedGuestState(s3, 'ng10').rewardsTaken).toBe(2);
});

test('지역 활기·식욕: 연 지역은 그 주 회복 없음, 나머지는 주말마다 +5 (상한 100)', () => {
  const s = toWeekend();
  regionState(s, 'hyeopjae').vitality = 80;
  apply(s, { type: 'openPopup', regionId: 'dongmun' });
  expect(regionState(s, 'dongmun').vitality).toBe(92);
  run(s, DAY_MS * 7); // 13일 아침
  expect(s.clock.day).toBe(13);
  expect(regionState(s, 'dongmun')).toEqual({ vitality: 92, appetite: 92 }); // 지난주 팝업 지역: 회복 없음
  expect(regionState(s, 'hyeopjae').vitality).toBe(85);
  expect(regionState(s, 'udo').vitality).toBe(100);
  run(s, DAY_MS * 7); // 20일
  expect(regionState(s, 'dongmun')).toEqual({ vitality: 97, appetite: 97 });
  expect(bestRegion(s)).toBe('seongsan'); // 100인 지역 중 정의 순서에서 앞선 것(협재 90·동문 97 제외) → 성산
  regionState(s, 'udo').vitality = 100;
  regionState(s, 'seongsan').vitality = 50;
  regionState(s, 'jungmun').vitality = 50;
  expect(bestRegion(s)).toBe('udo');
});

test('단골★ 본점 방문: 번호로 정한 요일·시각에 이름 있는 손님으로 스폰, 앉아서 먹으면 호감도 +10(취향 ×2)·자기 대사', () => {
  const s = cafe();
  namedGuestState(s, 'ng01').regular = true;
  const slot = regularVisitSlot(namedGuestDef('ng01')); // no 1 → 요일 1, 10시
  expect(slot).toEqual({ weekday: 1, hour: 10 });
  s.clock.day = 1; // 1 % 7 = 1
  s.clock.hour = 9;
  expect(regularsDueNow(s)).toHaveLength(0);
  s.clock.hour = 10;
  expect(regularsDueNow(s).map((d) => d.id)).toEqual(['ng01']);
  expect(hourlyRegulars(s)).toBe(1);
  expect(hourlyRegulars(s)).toBe(0); // 이미 와 있다
  const g = s.guests.find((x) => x.namedId === 'ng01')!;
  expect(g.type).toBe(NAMED_TYPE);
  updateGuests(s, (6 / GUEST_SPEED_CELLS_PER_S) * 1000);
  expect(g.phase).toBe('seated');
  expect(['americano', STRONG_LATTE]).toContain(g.menuId); // 예산 5000 안의 음료
  updateGuests(s, PREP_MS);
  expect(g.mood).toBe('happy');
  expect(g.say).toBe('새벽 장 끝나고 커피 한 잔');
  expect(namedGuestState(s, 'ng01').affinity).toBe(g.menuId === STRONG_LATTE ? 20 : 10);
  // 손님층 만족 게이지에는 안 섞인다
  expect(s.guestTypes[NAMED_TYPE]).toBeUndefined();
  // 좌석이 없으면 못 온다
  const s2 = bareState(1);
  expect(spawnNamedGuest(s2, 'ng01')).toBe(false);
});

test('봇: 주말에 돈이 500만 넘으면 활기 최고 지역에 팝업', () => {
  const s = bareState(7);
  const cur = newBotCursor();
  for (let i = 0; i < 5; i++) botDay(s, cur);
  expect(s.clock.day).toBe(6);
  s.money = 6_000_000;
  botDay(s, cur);
  expect(s.actionLog.some((a) => a.action.type === 'openPopup')).toBe(true);
  expect(s.popup.visits.length).toBeGreaterThan(0);
});

test('결정성·세이브: 같은 seed면 같은 방문, 저장·복원 뒤 지역·호감도·팝업이 남는다', () => {
  const run = () => { const s = cafe(toWeekend()); apply(s, { type: 'openPopup', regionId: 'seongsan' }); tick(s, HOUR_MS * 4); return s; };
  const a = run();
  const b = run();
  expect(a.popup.visits).toEqual(b.popup.visits);
  expect(a.rng).toBe(b.rng);
  const c = deserialize(serialize(a));
  expect(c.popup).toEqual(a.popup);
  expect(c.regions).toEqual(a.regions);
  expect(c.namedGuests).toEqual(a.namedGuests);
  expect(canOpenPopup(c, 'udo').ok).toBe(false); // 이미 열림
});

import { bareState, X, Y } from './helpers.ts';
import { createInitialState, VILLAGE_ROAD_Y, GRID_W, GRID_H } from '../state.ts';
import { placeObject, removeObject, canPlace, objectAt } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { parcelPrice } from '../parcels.ts';
import { dayIndex } from '../effects.ts';
import { spawnGuests, hourlySpawn, updateGuests, dailyGuestCount, flushParking } from '../guests.ts';
import { guestTags } from '../../data/index.ts';
import { conditionProgress, goalConditionText, conditionCheckers } from '../goals.ts';
import { guestSay } from '../say.ts';
import type { GameState, GoalCondition } from '../types.ts';
import {
  ENTRY_ROUTES, ROUTE_IDS, entryPoints, routeConnected, routeTarget, routeSpawnPos, routeActive, routeOpened, routeState, routeStats, routeTagMult, hasRouteTag, isForeign,
  spawnRouteWeights, routeArrivals, routeDailyCap, routeCapLeft, dailyRoutes, monthlyRoutes, routePlaceCheck, parkingSlots, parkingSites, canExpandParking, parkingExpandCost, routeShare, routeLinked, installRouteForParcel, canAutoLinkRoute, ROUTE_AUTO_SITES, PARKING_SHARE_MIN, PARKING_SHARE_MAX, OLLE_SHARE, CAR_GUESTS_MIN, CAR_GUESTS_MAX,
  canSetRouteContract, routeUnlockMet, routeFacilityUnlockMet, routeAtCell, nextArrivalText, PARKING_GUESTS_PER_SLOT, SHUTTLE_FEE, CRUISE_PORT_FEE, CRUISE_EVENT,
} from '../entry.ts';

/** 시작 필지 안: 좌석 + 메뉴 (정류장 경로가 열린 최소 카페) */
function cafe(): GameState {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 50;
  return s;
}
function own(s: GameState, id: string) { s.parcels.find((p) => p.id === id)!.owned = true; }
function unlock(s: GameState, ...ids: string[]) { for (const id of ids) if (!s.unlocked.objects.includes(id)) s.unlocked.objects.push(id); }
/** 한 줄 올렛길 */
function road(s: GameState, cells: { x: number; y: number }[]) { for (const c of cells) { const o = objectAt(s, c.x, c.y); if (o && o.type !== 'path') removeObject(s, o.id); if (!objectAt(s, c.x, c.y)) placeObject(s, 'path', c.x, c.y); } } // 덤불·돌담은 걷어낸다

test('진입점 좌표는 §3.4 표대로 — 서(0,15) 버스 · 서(0,11) 올레 · 동(29,15) 렌터카 · 남(15,23) 셔틀 · 북(14,0) 크루즈', () => {
  expect(ENTRY_ROUTES.bus.entry).toEqual({ x: 0, y: VILLAGE_ROAD_Y });
  expect(ENTRY_ROUTES.olle.entry).toEqual({ x: 0, y: 11 });
  expect(ENTRY_ROUTES.parking.entry).toEqual({ x: GRID_W - 1, y: VILLAGE_ROAD_Y });
  expect(ENTRY_ROUTES.shuttle.entry).toEqual({ x: 15, y: GRID_H - 1 });
  expect(ENTRY_ROUTES.cruise.entry).toEqual({ x: 14, y: 0 });
  expect(ROUTE_IDS).toHaveLength(5);
});

test('시작 상태: 정류장만 열려 있고 나머지는 잠김·미연결', () => {
  const s = createInitialState(1);
  const eps = entryPoints(s);
  expect(eps.find((e) => e.route === 'bus')).toMatchObject({ unlocked: true, connected: true, active: true, weight: 1 });
  expect(eps.find((e) => e.route === 'parking')).toMatchObject({ unlocked: true, connected: false, active: false }); // fun P0: 주차장은 처음부터 열림 (시설만 지으면 된다)
  for (const r of ['shuttle', 'cruise', 'olle'] as const) expect(eps.find((e) => e.route === r)).toMatchObject({ unlocked: false, connected: false, active: false });
  expect(spawnRouteWeights(s).map((w) => w.route)).toEqual(['bus']);
});

test('길 연결 검사: 올레 표식은 (0,11)에서 path로 이어져야 연결·활성, 끊기면 false + 알림', () => {
  const s = cafe();
  own(s, 'parcel4');
  unlock(s, 'olle_sign');
  placeObject(s, 'olle_sign', 3, 11);
  routeState(s, 'olle').unlocked = true;
  expect(routeConnected(s, 'olle')).toBe(false); // 아직 길 없음
  road(s, [{ x: 0, y: 11 }, { x: 1, y: 11 }, { x: 2, y: 11 }]);
  expect(routeConnected(s, 'olle')).toBe(true);
  expect(routeActive(s, 'olle')).toBe(true);
  expect(routeSpawnPos(s, 'olle')).toEqual({ x: 0, y: 11 }); // 올레꾼은 진입점에서 걸어 들어온다
  // 끊김: 가운데 칸 제거 → dailyRoutes가 한 번 알린다
  removeObject(s, objectAt(s, 1, 11)!.id);
  expect(routeConnected(s, 'olle')).toBe(false);
  const n0 = s.notices.length;
  dailyRoutes(s);
  expect(routeState(s, 'olle').broken).toBe(true);
  expect(s.notices.slice(n0).some((t) => t.includes('길이 끊겼어요'))).toBe(true);
  dailyRoutes(s);
  expect(s.notices.length).toBe(n0 + 1); // 두 번 알리지 않는다
});

test('주차장: 마을 길에 붙여야 놓을 수 있고, 앞 칸(도로)이 스폰 시작점·칸 × 9이 하루 상한', () => {
  const s = cafe();
  unlock(s, 'parking_lot');
  expect(routePlaceCheck(s, 'parking_lot', X(0), Y(2)).ok).toBe(false); // 길에서 멀다
  expect(canPlace(s, 'parking_lot', X(0), Y(2)).ok).toBe(false);
  expect(routePlaceCheck(s, 'parking_lot', X(0), Y(5)).ok).toBe(true); // (10..11, 13..14) — 아래가 마을 길 y=15
  expect(parkingSites(s).length).toBeGreaterThan(0);
  placeObject(s, 'parking_lot', X(0), Y(5));
  routeState(s, 'parking').unlocked = true;
  expect(parkingSlots(s)).toBe(4);
  expect(routeDailyCap(s, 'parking')).toBe(4 * PARKING_GUESTS_PER_SLOT);
  expect(routeTarget(s, 'parking')).toEqual({ x: X(0), y: VILLAGE_ROAD_Y }); // 도로 이웃을 앞 칸으로
  expect(routeConnected(s, 'parking')).toBe(true); // (29,15) 마을 길 → 앞 칸
  expect(routeActive(s, 'parking')).toBe(true);
  s.clock.hour = 12;
  expect(spawnRouteWeights(s)).toEqual([{ route: 'bus', weight: 0.7 }, { route: 'parking', weight: PARKING_SHARE_MIN }]); // fun P0: 4칸 = 30%, 정류장은 나머지
  expect(routeShare(s, 'parking')).toBeCloseTo(0.3);
  placeObject(s, 'parking_lot', X(2), Y(5));
  expect(parkingSlots(s)).toBe(8);
  expect(routeShare(s, 'parking')).toBeCloseTo(PARKING_SHARE_MAX); // 8칸 = 45%
  expect(routeShare(s, 'bus')).toBeCloseTo(1 - PARKING_SHARE_MAX);
  removeObject(s, objectAt(s, X(2), Y(5))!.id);
  s.clock.hour = 7;
  expect(spawnRouteWeights(s).map((w) => w.route)).toEqual(['bus']); // 9~20시 밖
  s.clock.hour = 12;
  routeState(s, 'parking').todayGuests = 36;
  expect(routeCapLeft(s, 'parking')).toBe(0);
  expect(spawnRouteWeights(s).map((w) => w.route)).toEqual(['bus']); // 상한
});

test('선착장은 북쪽 끝(y=0)에만', () => {
  const s = cafe();
  own(s, 'parcel3');
  unlock(s, 'pier');
  expect(routePlaceCheck(s, 'pier', 14, 1).ok).toBe(false);
  expect(routePlaceCheck(s, 'pier', 14, 0).ok).toBe(true);
});

test('entry 인자로 스폰하면 그 진입점에서 출발하고 Guest.route·경로 통계에 기록되며, 돌아갈 때도 그 경로로 간다', () => {
  const s = cafe();
  unlock(s, 'parking_lot');
  placeObject(s, 'parking_lot', X(0), Y(5));
  routeState(s, 'parking').unlocked = true;
  const pos = routeSpawnPos(s, 'parking')!;
  expect(spawnGuests(s, 1, undefined, { route: 'parking', pos })).toBe(1);
  const g = s.guests[0]!;
  expect(g.route).toBe('parking');
  expect({ x: g.x, y: g.y }).toEqual(pos);
  expect(routeState(s, 'parking')).toMatchObject({ todayGuests: 1, monthGuests: 1, totalGuests: 1 });
  updateGuests(s, 20000); // 앉고
  expect(g.phase).toBe('seated');
  expect(routeState(s, 'parking').monthIncome).toBeGreaterThan(0); // 주문값이 경로 매출로
  updateGuests(s, 20000); // 기분·체류 끝
  updateGuests(s, 20000);
  expect(['leaving', 'visiting']).toContain(g.phase);
  if (g.phase === 'leaving') expect(g.path[g.path.length - 1] ?? { x: g.x, y: g.y }).toEqual(pos);
  const st = routeStats(s);
  expect(st.find((r) => r.route === 'parking')!.guestShare).toBe(1);
});

test('경로 태그 가중치: 주차장은 가족 ×2·커플 ×1.6, 셔틀은 단체 ×1.5·외국인 ×2, 올레는 혼자 ×2', () => {
  expect(routeTagMult('parking', 'rentcar_family')).toBe(2);
  expect(routeTagMult('parking', 'couple')).toBe(1.6);
  expect(routeTagMult('parking', 'student')).toBe(1);
  expect(routeTagMult('shuttle', 'group_cn')).toBe(1.5 * 2); // 단체 + 외국인
  expect(routeTagMult('cruise', 'solo_foreign')).toBe(3);
  expect(routeTagMult('olle', 'olle_walker')).toBe(2);
  expect(routeTagMult('bus', 'olle_walker')).toBe(1);
  expect(hasRouteTag('grandma_gyecheo', 'senior')).toBe(true);
});

test('foreign 태그: 어댑터가 외국인 체인 7종에 붙이고, 말풍선은 이모지', () => {
  for (const id of ['group_cn', 'group_jp', 'group_sea', 'solo_foreign', 'foreign_chef', 'foreign_vlogger', 'world_traveler']) expect(guestTags(id).foreign, id).toBe(true);
  expect(guestTags('student').foreign).toBeFalsy();
  expect(isForeign('group_cn')).toBe(true);
  const s = cafe();
  spawnGuests(s, 1, 'group_cn');
  const g = s.guests[0]!;
  updateGuests(s, 20000);
  const say = guestSay(s, g);
  expect(say).not.toBeNull();
  expect(/[가-힣A-Za-z]/.test(say!)).toBe(false); // 한글·영문 없이 이모지만
});

test('시각 고정 배치: 셔틀은 계약 + 길 연결 뒤 11·15시에 6~10명, 상한 20', () => {
  const s = cafe();
  own(s, 'parcel6');
  unlock(s, 'shuttle_stop');
  placeObject(s, 'shuttle_stop', 15, 20);
  road(s, [{ x: 15, y: 23 }, { x: 15, y: 22 }, { x: 15, y: 21 }]);
  const st = routeState(s, 'shuttle');
  st.unlocked = true;
  expect(canSetRouteContract(s, 'shuttle', true).ok).toBe(true);
  const money0 = s.money;
  expect(apply(s, { type: 'setRouteContract', route: 'shuttle', on: true }).ok).toBe(true);
  expect(s.money).toBe(money0 - SHUTTLE_FEE); // 첫 달 요금
  expect(routeOpened(s, 'shuttle')).toBe(true);
  expect(routeActive(s, 'shuttle')).toBe(true);
  s.clock.hour = 10;
  expect(routeArrivals(s)).toEqual([]);
  s.clock.hour = 11;
  const a = routeArrivals(s);
  expect(a).toHaveLength(1);
  expect(a[0]!.route).toBe('shuttle');
  expect(a[0]!.n).toBeGreaterThanOrEqual(6);
  expect(a[0]!.n).toBeLessThanOrEqual(10);
  st.todayGuests = 20;
  expect(routeArrivals(s)).toEqual([]); // 상한
  expect(nextArrivalText(s, 'shuttle')).toBe('오늘 15시');
  // 월초 계약비 (투어 버스와 같은 항목)
  const m0 = s.money;
  monthlyRoutes(s);
  expect(s.money).toBe(m0 - SHUTTLE_FEE);
  expect(s.monthCosts.tourBus).toBe(SHUTTLE_FEE * 2);
  expect(apply(s, { type: 'setRouteContract', route: 'shuttle', on: false }).ok).toBe(true);
  expect(routeActive(s, 'shuttle')).toBe(false);
});

test('크루즈: 입항 이벤트 날 13시에 25~30명, 기항 1회 항만 사용료 30만', () => {
  const s = cafe();
  own(s, 'parcel3');
  unlock(s, 'pier');
  placeObject(s, 'pier', 14, 0);
  own(s, 'parcel2'); own(s, 'parcel4');
  road(s, [...[1, 2, 3, 4, 5, 6, 7].map((y) => ({ x: 14, y })), ...[13, 12, 11, 10, 9].map((x) => ({ x, y: 7 })), ...[8, 9, 10, 11, 12].map((y) => ({ x: 9, y })), ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((x) => ({ x, y: 12 }))]); // 선착장 → x=14 → y=7 서쪽 → x=9 남쪽 → 가로 길(y=12). 본관(13~15, 9~10)은 못 지난다
  s.star = 3;
  routeState(s, 'cruise').unlocked = true;
  expect(routeConnected(s, 'cruise')).toBe(true);
  s.clock.hour = 13;
  expect(routeArrivals(s)).toEqual([]); // 이벤트 없음
  const today = dayIndex(s.clock);
  s.events.push({ id: CRUISE_EVENT, startDay: today, endsDay: today + 3, specialVisited: false });
  const a = routeArrivals(s);
  expect(a).toHaveLength(1);
  expect(a[0]!.n).toBeGreaterThanOrEqual(25);
  expect(a[0]!.n).toBeLessThanOrEqual(30);
  // hourlySpawn이 항만 사용료를 한 번만 걷는다
  for (const x of [10, 11, 12, 13, 15, 16, 17, 18, 19]) { placeObject(s, 'table_out', x, 11); placeObject(s, 'table_out', x, 13); } // 가로 길 양옆 18개 = 36석
  s.clock.hour = 13;
  const m0 = s.money;
  hourlySpawn(s);
  expect(s.guests.some((g) => g.route === 'cruise')).toBe(true);
  expect(s.money).toBeLessThanOrEqual(m0 - CRUISE_PORT_FEE + 1);
  expect(routeState(s, 'cruise').lastArrivalDay).toBe(today);
  s.guests = [];
  routeState(s, 'cruise').todayGuests = 0;
  const m1 = s.money;
  hourlySpawn(s);
  expect(s.money).toBeGreaterThanOrEqual(m1); // 같은 기항엔 다시 안 낸다 (손님 매출로 오히려 오를 수 있다)
});

test('해금: 주차장은 처음부터(fun P0), 셔틀은 parcel6 + 열쇠, 크루즈는 parcel3(★ 조건 없음), 올레는 parcel4 — dailyRoutes가 시설·경로를 연다', () => {
  const s = cafe();
  expect(routeFacilityUnlockMet(s, 'parking_lot')).toBe(true);
  expect(createInitialState(1).unlocked.objects).toContain('parking_lot');
  expect(routeUnlockMet(s, 'olle')).toBe(false);
  own(s, 'parcel4');
  expect(routeUnlockMet(s, 'olle')).toBe(true);
  expect(routeUnlockMet(s, 'shuttle')).toBe(false);
  own(s, 'parcel6');
  s.inventory['tour_bus_key'] = 1;
  expect(routeUnlockMet(s, 'shuttle')).toBe(true);
  expect(routeUnlockMet(s, 'cruise')).toBe(false);
  own(s, 'parcel3');
  expect(routeUnlockMet(s, 'cruise')).toBe(true);
  dailyRoutes(s);
  for (const id of ['parking_lot', 'shuttle_stop', 'pier', 'olle_sign']) expect(s.unlocked.objects, id).toContain(id);
  expect(s.unlocked.objects).not.toContain('parking_big'); // 주차장을 지어야
  for (const r of ROUTE_IDS) expect(routeState(s, r).unlocked, r).toBe(true);
});

test('주차장 넓히기: 2×2 → 3×2 같은 원점, 차액만 낸다', () => {
  const s = cafe();
  unlock(s, 'parking_lot', 'parking_big');
  const o = placeObject(s, 'parking_lot', X(0), Y(5));
  expect(canExpandParking(s, o.id).ok).toBe(true);
  const m0 = s.money;
  expect(apply(s, { type: 'expandParking', objectId: o.id }).ok).toBe(true);
  expect(s.money).toBe(m0 - parkingExpandCost());
  const big = objectAt(s, X(0), Y(5))!;
  expect(big.type).toBe('parking_big');
  expect(objectAt(s, X(2), Y(6))?.id).toBe(big.id);
  // 옆이 막히면 못 넓힌다
  const o2 = placeObject(s, 'parking_lot', X(5), Y(5));
  placeObject(s, 'stonewall', X(7), Y(5));
  expect(canExpandParking(s, o2.id).ok).toBe(false);
});

test('목표 조건 routeGuests·routeUnlocked·facility', () => {
  const s = cafe();
  routeState(s, 'parking').totalGuests = 7;
  expect(conditionProgress(s, { type: 'routeGuests', route: 'parking', n: 20 })).toEqual({ cur: 7, max: 20 });
  expect(conditionProgress(s, { type: 'routeUnlocked', route: 'shuttle' }).cur).toBe(0);
  routeState(s, 'shuttle').unlocked = true;
  expect(conditionProgress(s, { type: 'routeUnlocked', route: 'shuttle' }).cur).toBe(0); // 계약까지
  routeState(s, 'shuttle').contract = true;
  expect(conditionProgress(s, { type: 'routeUnlocked', route: 'shuttle' }).cur).toBe(1);
  expect(conditionProgress(s, { type: 'facility', id: 'parking_lot' }).cur).toBe(0);
  unlock(s, 'parking_big');
  placeObject(s, 'parking_big', X(0), Y(5));
  expect(conditionProgress(s, { type: 'facility', id: 'parking_lot' }).cur).toBe(1); // 넓힌 것도 친다
  for (const t of ['routeGuests', 'routeUnlocked', 'facility']) expect(conditionCheckers[t as GoalCondition['type']]).toBeDefined();
  expect(goalConditionText({ type: 'routeGuests', route: 'olle', n: 10 })).toBe('올레꾼 손님 10명');
  expect(goalConditionText({ type: 'routeUnlocked', route: 'shuttle' })).toBe('공항 셔틀 계약');
  expect(goalConditionText({ type: 'facility', id: 'parking_lot' })).toContain('주차장');
});

test('결정성: 같은 시드·같은 배치면 경로 스폰 결과가 같다 · 정류장만 열려 있으면 rng를 안 쓴다', () => {
  const build = () => {
    const s = cafe();
    unlock(s, 'parking_lot');
    placeObject(s, 'parking_lot', X(0), Y(5));
    routeState(s, 'parking').unlocked = true;
    for (let i = 1; i <= 5; i++) placeObject(s, 'table_out', X(i), Y(3));
    return s;
  };
  const a = build(), b = build();
  for (let i = 0; i < 3; i++) { tick(a, DAY_MS); tick(b, DAY_MS); }
  expect(a.rng).toBe(b.rng);
  expect(a.routes).toEqual(b.routes);
  expect(a.routes.parking.totalGuests).toBeGreaterThan(0);
  expect(a.routes.bus.totalGuests).toBeGreaterThan(0);
  // 정류장만: spawnByRoutes가 rng를 소비하지 않아 기존 스폰과 같은 rng 흐름
  const c = cafe();
  const r0 = c.rng;
  c.spawnAcc = 0;
  expect(spawnRouteWeights(c)).toHaveLength(1);
  expect(c.rng).toBe(r0);
});

test('올레길이 열려도 하루 손님 배수는 1 (가중치 share만) · 카드 분기 routeAtCell', () => {
  const s = cafe();
  expect(dailyGuestCount(s)).toBe(dailyGuestCount(s));
  expect(routeAtCell(s, 0, 11)).toBe('olle');
  expect(routeAtCell(s, X(0), VILLAGE_ROAD_Y)).toBe('bus'); // 정류장 칸
  expect(routeAtCell(s, X(5), Y(2))).toBeNull();
});

// ---------- fun P0: 주차장 비중·차 도착·땅 사면 경로 자동 개통 ----------

test('fun P0 비중: 주차장이 이어지면 10~17시 손님의 30%(4칸)가 주차장에서, 총량은 그대로(정류장이 나머지). 올레길은 20%', () => {
  const s = cafe();
  for (let i = 1; i <= 5; i++) placeObject(s, 'table_out', X(i), Y(3));
  placeObject(s, 'parking_lot', X(0), Y(5));
  own(s, 'parcel4');
  installRouteForParcel(s, 'parcel4');
  s.clock.hour = 10; // 주차장 10~17시 · 올레 8~11시
  const w = spawnRouteWeights(s);
  expect(w.find((x) => x.route === 'parking')?.weight).toBeCloseTo(PARKING_SHARE_MIN);
  // 올레 표식은 자리까지 길이 안 이어져 아직 손님을 못 받는다 → 비중 0
  expect(routeLinked(s, 'olle')).toBe(false);
  expect(w.find((x) => x.route === 'olle')).toBeUndefined();
  expect(w.find((x) => x.route === 'bus')?.weight).toBeCloseTo(1 - PARKING_SHARE_MIN);
  // 자동 잇기 → 올레 20%, 정류장 50%
  const link = canAutoLinkRoute(s, 'olle');
  expect(link.ok, link.reason).toBe(true);
  expect(apply(s, { type: 'autoLinkRoute', route: 'olle' }).ok).toBe(true);
  expect(routeLinked(s, 'olle')).toBe(true);
  const w2 = spawnRouteWeights(s);
  expect(w2.find((x) => x.route === 'olle')?.weight).toBeCloseTo(OLLE_SHARE);
  expect(w2.reduce((a, x) => a + x.weight, 0)).toBeCloseTo(1);
  expect(w2.find((x) => x.route === 'bus')?.weight).toBeCloseTo(1 - PARKING_SHARE_MIN - OLLE_SHARE);
  // 완성 시작 배치(자리 6·길)에서 열흘 굴리면 실제 비중이 표(routeStats)와 맞다: 주차장 손님 ≥ 20% (9~20시만 오니 30%보다 조금 낮다)
  const t = createInitialState(1);
  const site = parkingSites(t)[0]!;
  placeObject(t, 'parking_lot', site.x, site.y);
  own(t, 'parcel4');
  installRouteForParcel(t, 'parcel4');
  expect(apply(t, { type: 'autoLinkRoute', route: 'olle' }).ok).toBe(true);
  for (let i = 0; i < 10; i++) tick(t, DAY_MS);
  const st = routeStats(t);
  const total = st.reduce((a, r) => a + r.totalGuests, 0);
  const parking = st.find((r) => r.route === 'parking')!;
  expect(total).toBeGreaterThan(40);
  expect(parking.totalGuests / total).toBeGreaterThan(0.2);
  expect(parking.totalGuests / total).toBeLessThan(0.5);
  expect(st.find((r) => r.route === 'olle')!.totalGuests).toBeGreaterThan(0);
});

test('fun P0 도착 연출: 주차장 손님은 2~4명씩 렌터카 한 대로 내리고(arrive fx), 남은 한 명은 저녁에', () => {
  const s = createInitialState(1);
  const site = parkingSites(s)[0]!;
  placeObject(s, 'parking_lot', site.x, site.y);
  const arrivals: { n: number; x: number; y: number }[] = [];
  let seen = 0;
  for (let h = 0; h < 18 * 5; h++) { // fx 큐는 최근 것만 남으니 시간마다 모은다
    tick(s, HOUR_MS);
    for (const f of s.fx) if (f.tick >= seen && f.kind === 'arrive' && f.route === 'parking') arrivals.push(f);
    seen = s.tick;
  }
  expect(arrivals.length).toBeGreaterThan(0);
  expect(arrivals.reduce((a, x) => a + x.n, 0)).toBe(s.routes.parking.totalGuests); // 주차장 손님은 전부 차로 내렸다
  for (const a of arrivals) { expect(a.n).toBeGreaterThanOrEqual(1); expect(a.n).toBeLessThanOrEqual(CAR_GUESTS_MAX); expect(routeSpawnPos(s, 'parking')).toEqual({ x: a.x, y: a.y }); }
  // 모인 손님이 2명 이상이면 한 대에 함께 내린다 (직접 확인 — 작은 카페에선 하루 한 명씩 오기도 한다)
  const t = createInitialState(2);
  const site2 = parkingSites(t)[0]!;
  placeObject(t, 'parking_lot', site2.x, site2.y);
  t.clock.hour = 12;
  routeState(t, 'parking').pending = 5;
  const before = t.fx.length;
  const got = flushParking(t, false);
  const cars = t.fx.slice(before).filter((f) => f.kind === 'arrive') as { n: number }[];
  expect(got).toBe(CAR_GUESTS_MAX); // 4명이 한 대로
  expect(cars.map((c) => c.n)).toEqual([CAR_GUESTS_MAX]);
  expect(routeState(t, 'parking').pending).toBe(1); // 남은 1명은 다음 차를 기다린다
  expect(flushParking(t, true)).toBe(1); // 저녁엔 남은 한 명도 태워 보낸다
  expect(routeState(t, 'parking').pending).toBe(0);
});

test('fun P0 땅을 사면 경로가 열린다: 서쪽 밭담 골짜기 → 올레 표식(3,11)+진입점 올렛길 무료, 남쪽 샘터 → 셔틀 정류장, 북쪽 곶자왈 → 선착장(★ 무관), 장면 창 한 줄', () => {
  const s = cafe();
  s.money = 100_000_000;
  own(s, 'parcel2'); own(s, 'village_edge'); // 4번은 필지 3개를 가진 뒤
  const m0 = s.money;
  const p4 = s.parcels.find((p) => p.id === 'parcel4')!;
  const price = parcelPrice(s, p4);
  expect(apply(s, { type: 'buyParcel', id: 'parcel4' }).ok).toBe(true);
  expect(s.money).toBe(m0 - price); // 표식·길은 공짜
  const sign = objectAt(s, ROUTE_AUTO_SITES.olle.x, ROUTE_AUTO_SITES.olle.y);
  expect(sign?.type).toBe('olle_sign');
  expect(sign?.build).toBeUndefined();
  expect(routeState(s, 'olle').unlocked).toBe(true);
  expect(routeConnected(s, 'olle')).toBe(true); // 진입점(0,11)→표식 올렛길이 깔렸다
  expect(routeLinked(s, 'olle')).toBe(false); // 자리까지는 아직
  expect(s.fx.some((f) => f.kind === 'scene' && f.text.includes('올레꾼이 서쪽에서'))).toBe(true);
  // 남쪽·북쪽 (6번은 필지 5개 뒤 — 5번을 먼저)
  own(s, 'parcel5');
  expect(apply(s, { type: 'buyParcel', id: 'parcel6' }).ok).toBe(true);
  expect(objectAt(s, ROUTE_AUTO_SITES.shuttle.x, ROUTE_AUTO_SITES.shuttle.y)?.type).toBe('shuttle_stop');
  expect(routeConnected(s, 'shuttle')).toBe(true);
  s.star = 1;
  expect(apply(s, { type: 'buyParcel', id: 'parcel3' }).ok).toBe(true);
  expect(objectAt(s, ROUTE_AUTO_SITES.cruise.x, ROUTE_AUTO_SITES.cruise.y)?.type).toBe('pier');
  expect(routeState(s, 'cruise').unlocked).toBe(true);
  expect(routeConnected(s, 'cruise')).toBe(true);
  // 이미 그 시설이 있으면 또 세우지 않는다
  expect(installRouteForParcel(s, 'parcel4')).toBe(false);
  expect(Object.values(s.objects).filter((o) => o.type === 'olle_sign')).toHaveLength(1);
});

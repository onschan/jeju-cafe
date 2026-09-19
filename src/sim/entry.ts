/**
 * 손님 유입 경로 5종 (트랙 H, UX 참고 §3): 정류장(버스, 기본)·주차장(렌터카)·공항 셔틀·항구(크루즈)·올레길.
 * - 각 경로는 맵 가장자리 진입점(§3.4) → 길(path/road/gate/정류장 kind) → 경로 시설까지 이어져야 손님이 온다(길 연결 검사 BFS).
 * - 기본 스폰(guests.ts hourlySpawn)은 활성 경로 가중치(정류장 1.0 / 주차장 칸당 0.15 / 올레 0.15)로 진입점을 나눠 뽑고,
 *   셔틀(11·15시)·크루즈(이벤트 날 13시)는 시각 고정으로 한꺼번에 온다(routeArrivals).
 * - 상태는 state.routes[route] (RouteState). 해금·길 끊김 판정은 하루 한 번(dailyRoutes), 월 정산은 monthlyRoutes.
 * 결정적: rng는 state.rng만 (rng.ts).
 */
import type { GameState, Guest, PlacedObject, Pt, RouteId, RouteState, ApplyResult } from './types.ts';
import { objectDef, guestTags, MENUS } from '../data/index.ts';
import { GRID_W, GRID_H, VILLAGE_ROAD_Y, PARCEL_LAYOUT, PARCEL_W, PARCEL_H } from './layout.ts';
import { footprint, cellAt, objectAt, inBounds } from './grid.ts';
import { reachMap, cellKey, isWalkable, walkableNeighborsOf, busStopPos } from './path.ts';
import { parcelById, parcelAt } from './parcels.ts';
import { pushNotice } from './staff.ts';
import { dayIndex } from './effects.ts';
import { randInt } from './rng.ts';
import { fmtNum } from './format.ts';
import { hasTourBusKey } from './spots.ts';

export const ROUTE_IDS: RouteId[] = ['bus', 'parking', 'shuttle', 'cruise', 'olle'];

/** 경로별 손님 태그 가중치 키 (§3.2 표) */
export type RouteTag = 'family' | 'couple' | 'group' | 'foreign' | 'senior' | 'solo' | 'youth';

export interface RouteDef {
  id: RouteId;
  name: string;
  icon: string;                       // 카드·표지 이모지 (버스·자동차·비행기·배·리본)
  entry: Pt;                          // 맵 가장자리 진입점 (§3.4)
  facilities: string[];               // 경로 시설 오브젝트 타입 (하나라도 완공돼 있으면 된다)
  parcelId: string | null;            // 필요한 필지
  tagMult: Partial<Record<RouteTag, number>>;
  walletMult: number;
  stayMult: number;
  hours: [number, number][];          // 오는 시간대 [시작, 끝) — 비어 있으면 상시. 셔틀·크루즈는 fixedHours
  fixedHours: number[];               // 시각 고정 배치 (셔틀 11·15, 크루즈 13)
  groupSize: [number, number];        // 1회 인원 (시각 고정 경로)
  dailyCap: number | null;            // 하루 상한 (null = 기본 상한 안에서 가중치만)
  weight: number;                     // 기본 스폰 가중치 (주차장은 칸당)
  cost: number;                       // 경로 시설 값 (안내용)
  needsContract: boolean;             // 셔틀: 월 계약이 있어야 온다
  unlockText: string;
}

/** 진입점 좌표 (§3.4). 서 (0,15) 버스 · 서 (0,11) 올레 · 동 (29,15) 렌터카 · 남 (15,23) 셔틀 · 북 (14,0) 크루즈 */
const P3 = PARCEL_LAYOUT.parcel3!, P4 = PARCEL_LAYOUT.parcel4!, P6 = PARCEL_LAYOUT.parcel6!;
export const ENTRY_ROUTES: Record<RouteId, RouteDef> = {
  bus: { id: 'bus', name: '정류장', icon: '🚌', entry: { x: 0, y: VILLAGE_ROAD_Y }, facilities: ['busstop'], parcelId: null, tagMult: {}, walletMult: 1, stayMult: 1, hours: [], fixedHours: [], groupSize: [1, 1], dailyCap: null, weight: 1, cost: 0, needsContract: false, unlockText: '시작' },
  parking: { id: 'parking', name: '주차장', icon: '🚗', entry: { x: GRID_W - 1, y: VILLAGE_ROAD_Y }, facilities: ['parking_lot', 'parking_big', 'parking', 'parking_large'], parcelId: null, tagMult: { family: 2, couple: 1.6 }, walletMult: 1.2, stayMult: 1.2, hours: [[10, 18]], fixedHours: [], groupSize: [2, 4], dailyCap: null, weight: 0.15, cost: 1_200_000, needsContract: false, unlockText: '쉼 시설 6개' },
  shuttle: { id: 'shuttle', name: '공항 셔틀', icon: '✈️', entry: { x: P6.col * PARCEL_W + 5, y: GRID_H - 1 }, facilities: ['shuttle_stop'], parcelId: 'parcel6', tagMult: { group: 1.5, foreign: 2, senior: 1.3 }, walletMult: 1, stayMult: 1, hours: [], fixedHours: [11, 15], groupSize: [6, 10], dailyCap: 20, weight: 0, cost: 800_000, needsContract: true, unlockText: '용천수 샘터 + 투어 버스 열쇠(또는 명소 Lv2 + 홍보 1회)' },
  cruise: { id: 'cruise', name: '항구', icon: '🚢', entry: { x: P3.col * PARCEL_W + 4, y: 0 }, facilities: ['pier'], parcelId: 'parcel3', tagMult: { foreign: 3, senior: 1.5, group: 1.3 }, walletMult: 1.5, stayMult: 0.7, hours: [], fixedHours: [13], groupSize: [25, 30], dailyCap: 30, weight: 0, cost: 3_000_000, needsContract: false, unlockText: '★3 + 곶자왈 가장자리' },
  olle: { id: 'olle', name: '올레길', icon: '🎗️', entry: { x: 0, y: P4.row * PARCEL_H + 3 }, facilities: ['olle_sign'], parcelId: 'parcel4', tagMult: { solo: 2, youth: 1.5, senior: 1.3 }, walletMult: 0.8, stayMult: 1, hours: [[8, 12], [16, 19]], fixedHours: [], groupSize: [1, 2], dailyCap: null, weight: 0.15, cost: 200_000, needsContract: false, unlockText: '밭담 골짜기' },
};

/** 주차 칸 수 (시설 타입별). 렌터카 1대 = 2~4명, 칸 × 3대/일 → 하루 상한 = 칸 × PARKING_GUESTS_PER_SLOT */
export const PARKING_SLOTS: Record<string, number> = { parking_lot: 4, parking_big: 6, parking: 4, parking_large: 6 };
export const PARKING_CARS_PER_SLOT = 3;
export const PARKING_GUESTS_PER_CAR = 3;
export const PARKING_GUESTS_PER_SLOT = PARKING_CARS_PER_SLOT * PARKING_GUESTS_PER_CAR;
/** 주차장 넓히기: 2×2 → 3×2 교체 (차액만 낸다) */
export const PARKING_EXPAND_FROM = 'parking_lot';
export const PARKING_EXPAND_TO = 'parking_big';
/** 셔틀 월 계약비 (투어 버스 계약과 같은 항목 monthCosts.tourBus) */
export const SHUTTLE_FEE = 500_000;
/** 크루즈 기항 1회 항만 사용료 */
export const CRUISE_PORT_FEE = 300_000;
/** 크루즈 입항 빅 이벤트 id (events_v3) */
export const CRUISE_EVENT = 'ev_cruise';
/** 크루즈 해금 ★ */
export const CRUISE_STAR = 3;
/** 셔틀 대체 해금: 명소 Lv2 1곳 + 홍보 1회 */
export const SHUTTLE_SPOT_LV = 2;
export const SHUTTLE_PROMOTIONS = 1;
/** 올레길이 열리면 하루 손님 배수. §3.2의 "+15%/일"은 스폰 가중치 0.15(share)로 이미 반영 — 둘 다 걸면 3년차 자금이 밴드(3,000~6,500만)를 넘어 1.0 */
export const OLLE_GUEST_MULT = 1.0;
/** 외국인: 요금 민감도 낮음(지갑 ×1.3)·사진 ×2(기본 확률 바닥)·감귤 계열 메뉴 선호 ×2 */
export const FOREIGN_WALLET_MULT = 1.3;
export const FOREIGN_PHOTO_BASE = 0.1;
export const FOREIGN_PHOTO_MULT = 2;
export const FOREIGN_MENU_MULT = 2;
export const FOREIGN_LIKED_INGREDIENTS = new Set(['tangerine', 'hallabong', 'black_pork']);
const COUPLE_IDS = new Set(['couple', 'newlyweds']);
const FAMILY_IDS = new Set(['rentcar_family', 'stroller_family', 'three_gen_family']);
const SOLO_IDS = new Set(['digital_nomad', 'working_holiday', 'monthly_stayer', 'olle_walker', 'oreum_hiker', 'van_lifer', 'solo_foreign', 'world_traveler', 'night_guest', 'stargazer', 'trail_runner', 'cyclist', 'cafe_tourer']);

export function routeDef(id: RouteId): RouteDef {
  return ENTRY_ROUTES[id];
}

export function initRoute(unlocked = false): RouteState {
  return { unlocked, contract: false, todayGuests: 0, monthGuests: 0, monthIncome: 0, totalGuests: 0, lastArrivalDay: -1, broken: false };
}
export function initRoutes(): Record<RouteId, RouteState> {
  return { bus: initRoute(true), parking: initRoute(), shuttle: initRoute(), cruise: initRoute(), olle: initRoute() };
}
/** 옛 저장(routes 없음)·테스트 픽스처용: 없으면 채운다 */
export function routeState(state: GameState, id: RouteId): RouteState {
  state.routes ??= initRoutes();
  return (state.routes[id] ??= initRoute(id === 'bus'));
}

// ---------- 태그 가중치 ----------

/** 손님 타입이 경로 태그에 해당하나 */
export function hasRouteTag(typeId: string, tag: RouteTag): boolean {
  const t = guestTags(typeId);
  switch (tag) {
    case 'family': return FAMILY_IDS.has(typeId);
    case 'couple': return COUPLE_IDS.has(typeId);
    case 'group': return t.group;
    case 'foreign': return !!t.foreign;
    case 'senior': return t.age === 'senior';
    case 'youth': return t.age === 'youth';
    case 'solo': return !t.group && SOLO_IDS.has(typeId);
  }
}
/** 경로별 손님층 가중치 배수 (§3.2 표). 정류장은 1. */
export function routeTagMult(route: RouteId, typeId: string): number {
  let m = 1;
  for (const [tag, mult] of Object.entries(ENTRY_ROUTES[route].tagMult)) if (mult !== undefined && hasRouteTag(typeId, tag as RouteTag)) m *= mult;
  return m;
}
export function isForeign(typeId: string): boolean {
  return !!guestTags(typeId).foreign;
}
/** 지갑 배수: 경로 × 외국인 */
export function routeWalletMult(g: Pick<Guest, 'type' | 'route'>): number {
  return ENTRY_ROUTES[g.route ?? 'bus'].walletMult * (isForeign(g.type) ? FOREIGN_WALLET_MULT : 1);
}
/** 체류 배수 (주차장 ×1.2, 크루즈 ×0.7) */
export function routeStayMult(g: Pick<Guest, 'route'>): number {
  return ENTRY_ROUTES[g.route ?? 'bus'].stayMult;
}
/** 외국인 사진 확률: 기본 확률(없으면 10%) ×2 */
export function foreignPhotoChance(typeId: string, base: number): number {
  return isForeign(typeId) ? Math.max(base, FOREIGN_PHOTO_BASE) * FOREIGN_PHOTO_MULT : base;
}
/** 외국인 메뉴 선호: 감귤·한라봉·흑돼지가 든 메뉴 ×2 */
export function foreignMenuMult(state: GameState, typeId: string, menuId: string): number {
  if (!isForeign(typeId)) return 1;
  const m = state.customMenus.find((x) => x.id === menuId) ?? MENUS.find((x) => x.id === menuId);
  return m && Object.keys(m.ingredients).some((i) => FOREIGN_LIKED_INGREDIENTS.has(i)) ? FOREIGN_MENU_MULT : 1;
}

// ---------- 시설·길 연결 ----------

/** 이 오브젝트 타입이 어느 경로의 시설인가 (정류장 → bus) */
export function routeOfFacility(type: string): RouteId | null {
  for (const id of ROUTE_IDS) if (ENTRY_ROUTES[id].facilities.includes(type)) return id;
  return null;
}
/** 완공된 경로 시설 (첫 번째). 없으면 null. */
export function routeFacility(state: GameState, route: RouteId): PlacedObject | null {
  const types = ENTRY_ROUTES[route].facilities;
  for (const o of Object.values(state.objects)) if (!o.build && types.includes(o.type)) return o;
  return null;
}
/** 주차 칸 합 (완공된 주차장 전부) */
export function parkingSlots(state: GameState): number {
  let n = 0;
  for (const o of Object.values(state.objects)) if (!o.build) n += PARKING_SLOTS[o.type] ?? 0;
  return n;
}
/** 마을 길(도로 지형) 칸과 변을 맞댄 발자국인가 (주차장 조건) */
export function touchesRoad(state: GameState, type: string, x: number, y: number): boolean {
  for (const p of footprint(type, x, y)) {
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = p.x + d[0], ny = p.y + d[1];
      if (inBounds(state, nx, ny) && cellAt(state, nx, ny).terrain === 'road') return true;
    }
  }
  return false;
}
/** 경로 시설 배치 규칙 (grid.canPlace 훅): 주차장은 마을 길에 1칸 이상 접해야, 선착장은 북쪽 끝(y=0)에 붙여야 한다 */
export function routePlaceCheck(state: GameState, type: string, x: number, y: number): ApplyResult {
  if (PARKING_SLOTS[type] !== undefined && !touchesRoad(state, type, x, y)) return { ok: false, reason: '마을 길에 붙여 지어요' };
  if (type === 'pier' && !footprint(type, x, y).some((p) => p.y === 0)) return { ok: false, reason: '북쪽 끝에 붙여 지어요' };
  return { ok: true };
}
/** 경로 시설의 걷기 목표 칸: 걷는 시설(정류장 kind)은 그 칸, 주차장은 발자국 옆 걷기 칸(주차장 앞 칸). 없으면 null. */
export function routeTarget(state: GameState, route: RouteId): Pt | null {
  const o = routeFacility(state, route);
  if (!o) return null;
  const def = objectDef(o.type);
  if (def.kind === 'busstop') return { x: o.x, y: o.y };
  const cells = footprint(o.type, o.x, o.y);
  const seen = new Set(cells.map((p) => cellKey(state, p)));
  // 앞 칸: 도로 이웃을 먼저, 없으면 아무 걷기 이웃
  let any: Pt | null = null;
  for (const p of cells) for (const nb of walkableNeighborsOf(state, p.x, p.y)) {
    if (seen.has(cellKey(state, nb))) continue;
    if (cellAt(state, nb.x, nb.y).terrain === 'road') return nb;
    any ??= nb;
  }
  return any;
}
/** 진입점 → 경로 시설이 길(path/road/gate/정류장)로 이어졌나. 정류장(기본)은 마을 길이라 항상 참. */
export function routeConnected(state: GameState, route: RouteId): boolean {
  if (route === 'bus') return routeFacility(state, 'bus') !== null;
  const target = routeTarget(state, route);
  if (!target) return false;
  const entry = ENTRY_ROUTES[route].entry;
  if (!isWalkable(state, entry.x, entry.y)) return false;
  return reachMap(state, entry).dist.has(cellKey(state, target));
}
/** 스폰 시작 칸: 올레는 진입점에서 걸어 들어오고, 나머지는 시설 앞(정류장·주차장 앞·셔틀 정류장·선착장) */
export function routeSpawnPos(state: GameState, route: RouteId): Pt | null {
  if (route === 'olle') return routeConnected(state, 'olle') ? ENTRY_ROUTES.olle.entry : null;
  return routeTarget(state, route);
}
/** 손님이 돌아갈 곳 (경로 시작 칸). 경로 시설이 사라졌으면 정류장. */
export function routeHome(state: GameState, g: Pick<Guest, 'route'>): Pt {
  return (g.route ? routeSpawnPos(state, g.route) : null) ?? busStopPos(state);
}

// ---------- 해금·활성 ----------

/** 해금 조건 (필지·★·시설 무관하게 "열릴 자격") */
export function routeUnlockMet(state: GameState, route: RouteId): boolean {
  const def = ENTRY_ROUTES[route];
  if (def.parcelId && !parcelById(state, def.parcelId)?.owned) return false;
  switch (route) {
    case 'bus': return true;
    case 'parking': return state.unlocked.objects.some((id) => PARKING_SLOTS[id] !== undefined) || parkingSlots(state) > 0;
    case 'shuttle': return hasTourBusKey(state) || (Object.values(state.spots).some((lv) => lv >= SHUTTLE_SPOT_LV) && state.stats.promotionsDone >= SHUTTLE_PROMOTIONS);
    case 'cruise': return state.star >= CRUISE_STAR;
    case 'olle': return true;
  }
}
/** 해금됐고, 시설이 있고, 길이 이어졌고, (셔틀은) 계약 중 — 손님이 실제로 오는 상태 */
export function routeActive(state: GameState, route: RouteId): boolean {
  const st = routeState(state, route);
  if (!st.unlocked) return false;
  if (ENTRY_ROUTES[route].needsContract && !st.contract) return false;
  return routeConnected(state, route);
}
/** 목표 routeUnlocked: 열림(셔틀은 계약까지) */
export function routeOpened(state: GameState, route: RouteId): boolean {
  const st = routeState(state, route);
  return st.unlocked && (!ENTRY_ROUTES[route].needsContract || st.contract);
}
/** 하루 상한: 주차장은 칸 × 9, 셔틀 20, 크루즈 30, 나머지 없음(null) */
export function routeDailyCap(state: GameState, route: RouteId): number | null {
  if (route === 'parking') return parkingSlots(state) * PARKING_GUESTS_PER_SLOT;
  return ENTRY_ROUTES[route].dailyCap;
}
export function routeCapLeft(state: GameState, route: RouteId): number {
  const cap = routeDailyCap(state, route);
  return cap === null ? Infinity : Math.max(0, cap - routeState(state, route).todayGuests);
}
/** 이 시각에 오는 경로인가 (hours 창 안) */
export function routeOpenAt(route: RouteId, hour: number): boolean {
  const h = ENTRY_ROUTES[route].hours;
  return h.length === 0 || h.some(([a, b]) => hour >= a && hour < b);
}

export interface EntryPoint { route: RouteId; pos: Pt; weight: number; connected: boolean; unlocked: boolean; active: boolean }
/** 경로별 진입점·가중치·연결 상태. 렌더(표지)·카드·스폰이 같이 쓴다. */
export function entryPoints(state: GameState): EntryPoint[] {
  return ROUTE_IDS.map((route) => {
    const def = ENTRY_ROUTES[route];
    const connected = routeConnected(state, route);
    const active = routeActive(state, route);
    const weight = route === 'parking' ? def.weight * parkingSlots(state) : def.weight;
    return { route, pos: def.entry, weight, connected, unlocked: routeState(state, route).unlocked, active };
  });
}
/** 기본 스폰(시간당)을 나눠 받는 경로와 가중치: 정류장 1.0 / 주차장 칸당 0.15 / 올레 0.15 (시간대·상한 안) */
export function spawnRouteWeights(state: GameState, hour = state.clock.hour): { route: RouteId; weight: number }[] {
  const out: { route: RouteId; weight: number }[] = [];
  for (const e of entryPoints(state)) {
    if (e.weight <= 0 || !e.active || !routeOpenAt(e.route, hour) || routeCapLeft(state, e.route) <= 0) continue;
    out.push({ route: e.route, weight: e.weight });
  }
  return out;
}
/** 올레길이 열려 있으면 하루 손님 ×1.15 (§3.2 "+15%/일") */
export function routeGuestMult(state: GameState): number {
  return routeActive(state, 'olle') ? OLLE_GUEST_MULT : 1;
}

/** 시각 고정 배치: 이 시각에 셔틀(11·15시, 6~10명)·크루즈(입항 이벤트 날 13시, 25~30명)가 오면 { route, n }. 상한 안. */
export function routeArrivals(state: GameState, hour = state.clock.hour): { route: RouteId; n: number }[] {
  const out: { route: RouteId; n: number }[] = [];
  for (const route of ['shuttle', 'cruise'] as RouteId[]) {
    const def = ENTRY_ROUTES[route];
    if (!def.fixedHours.includes(hour) || !routeActive(state, route)) continue;
    if (route === 'cruise' && !cruiseDocked(state)) continue;
    const left = routeCapLeft(state, route);
    if (left <= 0) continue;
    out.push({ route, n: Math.min(left, randInt(state, def.groupSize[0], def.groupSize[1])) });
  }
  return out;
}
/** 크루즈 입항 이벤트가 진행 중인가 */
export function cruiseDocked(state: GameState): boolean {
  const today = dayIndex(state.clock);
  return state.events.some((e) => e.id === CRUISE_EVENT && e.endsDay > today);
}
/** 다음 도착 안내 문구 (카드): 시각 고정 경로는 다음 fixedHour, 상시 경로는 시간대 */
export function nextArrivalText(state: GameState, route: RouteId): string {
  const def = ENTRY_ROUTES[route];
  const hour = state.clock.hour;
  if (def.fixedHours.length > 0) {
    if (route === 'cruise' && !cruiseDocked(state)) return '입항 이벤트 때';
    const next = def.fixedHours.find((h) => h > hour);
    return next !== undefined ? `오늘 ${next}시` : `내일 ${def.fixedHours[0]}시`;
  }
  if (def.hours.length === 0) return '상시';
  return def.hours.map(([a, b]) => `${a}~${b - 1}시`).join(' · '); // [10,18) → "10~17시"
}

// ---------- 손님 기록·정산 ----------

/** 스폰 때: 오늘·이달·누적 손님 +1 */
export function noteRouteGuest(state: GameState, route: RouteId): void {
  const st = routeState(state, route);
  st.todayGuests++;
  st.monthGuests++;
  st.totalGuests++;
  st.lastArrivalDay = dayIndex(state.clock);
}
/** 주문·시설 이용료: 이달 경로 매출에 더한다 */
export function noteRouteIncome(state: GameState, g: Pick<Guest, 'route'>, amount: number): void {
  routeState(state, g.route ?? 'bus').monthIncome += amount;
}
/** 크루즈 손님이 처음 내리는 날 항만 사용료 (기항 1회 30만) */
export function chargePortFee(state: GameState): void {
  const st = routeState(state, 'cruise');
  const today = dayIndex(state.clock);
  const ev = state.events.find((e) => e.id === CRUISE_EVENT && e.endsDay > today);
  if (!ev || st.lastArrivalDay >= ev.startDay) return; // 이번 기항엔 이미 냈다
  state.money -= CRUISE_PORT_FEE;
  state.monthCosts.upkeep += CRUISE_PORT_FEE;
  pushNotice(state, `크루즈 기항 — 항만 사용료 ₩${fmtNum(CRUISE_PORT_FEE)}`);
}

/** 경로별 이달 손님·매출과 비중 (장부 › 경영 "손님 경로" 표) */
export interface RouteStat { route: RouteId; name: string; icon: string; todayGuests: number; monthGuests: number; monthIncome: number; guestShare: number; incomeShare: number; active: boolean; unlocked: boolean }
export function routeStats(state: GameState): RouteStat[] {
  const totalG = ROUTE_IDS.reduce((n, r) => n + routeState(state, r).monthGuests, 0);
  const totalI = ROUTE_IDS.reduce((n, r) => n + routeState(state, r).monthIncome, 0);
  return ROUTE_IDS.map((route) => {
    const st = routeState(state, route);
    const def = ENTRY_ROUTES[route];
    return { route, name: def.name, icon: def.icon, todayGuests: st.todayGuests, monthGuests: st.monthGuests, monthIncome: st.monthIncome, guestShare: totalG > 0 ? st.monthGuests / totalG : 0, incomeShare: totalI > 0 ? st.monthIncome / totalI : 0, active: routeActive(state, route), unlocked: st.unlocked };
  });
}

// ---------- 계약·넓히기 (액션) ----------

export function canSetRouteContract(state: GameState, route: RouteId, on: boolean): ApplyResult {
  const def = ENTRY_ROUTES[route];
  if (!def.needsContract) return { ok: false, reason: '계약이 필요 없는 경로예요' };
  const st = routeState(state, route);
  if (on === st.contract) return { ok: false, reason: on ? '이미 계약 중이에요' : '계약 중이 아니에요' };
  if (on && !st.unlocked) return { ok: false, reason: '아직 열리지 않았어요' };
  if (on && !routeFacility(state, route)) return { ok: false, reason: `${objectDef(def.facilities[0]!).name}을 먼저 지어요` };
  if (on && state.money < SHUTTLE_FEE) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
/** 계약 시작(첫 달 요금 바로)/해지. 호출 전 canSetRouteContract. */
export function setRouteContract(state: GameState, route: RouteId, on: boolean): void {
  const st = routeState(state, route);
  st.contract = on;
  if (on) { chargeShuttle(state); pushNotice(state, `${ENTRY_ROUTES[route].name} 계약! 11시·15시에 셔틀이 와요`); }
  else pushNotice(state, `${ENTRY_ROUTES[route].name} 계약을 끝냈어요`);
}
/** 셔틀 월 계약비 50만 (투어 버스와 같은 결산 항목). 투어 버스 계약 중이면 같은 항목이라 무료. */
export function chargeShuttle(state: GameState): void {
  if (!routeState(state, 'shuttle').contract) return;
  if (state.tourBus) { pushNotice(state, '공항 셔틀: 투어 버스 계약에 포함 — 이달 무료'); return; }
  state.money -= SHUTTLE_FEE;
  state.monthCosts.tourBus += SHUTTLE_FEE;
  pushNotice(state, `공항 셔틀 월 계약비 ₩${fmtNum(SHUTTLE_FEE)}`);
}

/** 넓히기 비용 = 3×2 값 − 2×2 값 */
export function parkingExpandCost(): number {
  return Math.max(0, objectDef(PARKING_EXPAND_TO).cost - objectDef(PARKING_EXPAND_FROM).cost);
}
/** 2×2 주차장을 같은 자리에서 3×2로 바꿀 수 있나: 오른쪽 한 열이 비어 있고 내 땅·지형이 맞아야 한다 */
export function canExpandParking(state: GameState, objectId: string): ApplyResult {
  const o = state.objects[objectId];
  if (!o || o.type !== PARKING_EXPAND_FROM) return { ok: false, reason: '2×2 주차장이 아니에요' };
  if (o.build) return { ok: false, reason: '짓는 중이에요' };
  if (!state.unlocked.objects.includes(PARKING_EXPAND_TO)) return { ok: false, reason: '아직 못 넓혀요' };
  if (state.money < parkingExpandCost()) return { ok: false, reason: '돈이 모자라요' };
  const big = objectDef(PARKING_EXPAND_TO);
  for (const p of footprint(PARKING_EXPAND_TO, o.x, o.y)) {
    if (!inBounds(state, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    if (!parcelAt(state, p.x, p.y)?.owned) return { ok: false, reason: '옆 칸이 내 땅이 아니에요' };
    const other = objectAt(state, p.x, p.y);
    if (other && other.id !== o.id) return { ok: false, reason: '옆 칸이 비어 있어야 해요' };
    if (!big.terrain.includes(cellAt(state, p.x, p.y).terrain)) return { ok: false, reason: '옆 칸 바위를 먼저 치워요' };
  }
  if (!touchesRoad(state, PARKING_EXPAND_TO, o.x, o.y)) return { ok: false, reason: '마을 길에 붙여 지어요' };
  return { ok: true };
}

// ---------- 하루·월 처리 (tick.ts 훅) ----------

/** 경로 시설 해금(objects.json unlock)·경로 해금·길 끊김 알림. 새 날마다. */
export function dailyRoutes(state: GameState): void {
  state.routes ??= initRoutes();
  unlockRouteFacilities(state); // 시설이 먼저 열려야 경로(주차장) 해금 판정이 선다
  for (const route of ROUTE_IDS) {
    const st = routeState(state, route);
    st.todayGuests = 0;
    if (!st.unlocked && routeUnlockMet(state, route)) {
      st.unlocked = true;
      if (route !== 'bus') pushNotice(state, `${ENTRY_ROUTES[route].icon} ${ENTRY_ROUTES[route].name} 경로가 열렸어요 — ${objectDef(ENTRY_ROUTES[route].facilities[0]!).name}을 지어요`);
    }
    // 길 끊김: 시설은 있는데 진입점에서 닿지 않으면 한 번 알린다
    const broken = st.unlocked && routeFacility(state, route) !== null && !routeConnected(state, route);
    if (broken && !st.broken) pushNotice(state, `${ENTRY_ROUTES[route].name}: 길이 끊겼어요 — 진입점까지 올렛길을 이어요`);
    st.broken = broken;
  }
}
/** objects.json의 경로 시설 해금 조건을 본다 (segments.evaluateFacilityUnlocks는 v2 시설·랜드마크만 돌기 때문) */
export function unlockRouteFacilities(state: GameState): void {
  for (const id of ['parking_lot', 'parking_big', 'shuttle_stop', 'pier', 'olle_sign']) {
    if (state.unlocked.objects.includes(id)) continue;
    const def = objectDef(id);
    if (!routeFacilityUnlockMet(state, id)) continue;
    state.unlocked.objects.push(id);
    pushNotice(state, `새 시설: ${def.name}`);
  }
}
/** 시설별 해금: 주차장 = 쉼 시설 6개, 넓은 주차장 = 주차장 1개, 셔틀 정류장 = parcel6, 선착장 = ★3 + parcel3, 올레 표식 = parcel4 */
export function routeFacilityUnlockMet(state: GameState, id: string): boolean {
  switch (id) {
    case 'parking_lot': return countCategoryOwned(state, 'rest') >= 6;
    case 'parking_big': return Object.values(state.objects).some((o) => o.type === 'parking_lot');
    case 'shuttle_stop': return !!parcelById(state, 'parcel6')?.owned;
    case 'pier': return state.star >= CRUISE_STAR && !!parcelById(state, 'parcel3')?.owned;
    case 'olle_sign': return !!parcelById(state, 'parcel4')?.owned;
    default: return false;
  }
}
function countCategoryOwned(state: GameState, category: string): number {
  let n = 0;
  for (const o of Object.values(state.objects)) if (objectDef(o.type).category === category && parcelAt(state, o.x, o.y)?.owned) n++;
  return n;
}
/** 월초: 이달 손님·매출 리셋, 셔틀 계약비 */
export function monthlyRoutes(state: GameState): void {
  state.routes ??= initRoutes();
  for (const route of ROUTE_IDS) { const st = routeState(state, route); st.monthGuests = 0; st.monthIncome = 0; }
  chargeShuttle(state);
}

// ---------- 봇·UI 도우미 ----------

/** 주차장(2×2)을 놓을 수 있는 원점 후보: 소유 필지 안, 마을 길에 접하는 자리. canPlace는 호출자가 본다. */
export function parkingSites(state: GameState, type = PARKING_EXPAND_FROM): Pt[] {
  const def = objectDef(type);
  const out: Pt[] = [];
  for (let y = 0; y <= GRID_H - def.h; y++) for (let x = 0; x <= GRID_W - def.w; x++) {
    if (!touchesRoad(state, type, x, y)) continue;
    if (footprint(type, x, y).some((p) => !parcelAt(state, p.x, p.y)?.owned || objectAt(state, p.x, p.y) || !def.terrain.includes(cellAt(state, p.x, p.y).terrain))) continue;
    out.push({ x, y });
  }
  return out;
}
/** 진입점에서 시설 자리까지 잇는 최단 직선 경로 칸(올렛길을 깔 칸) — 봇용. 진입점 ⊥ 방향으로 한 줄. */
export function routePathCells(route: RouteId, target: Pt): Pt[] {
  const e = ENTRY_ROUTES[route].entry;
  const cells: Pt[] = [];
  if (e.x === 0 || e.x === GRID_W - 1) { // 서·동: 같은 y로 가로
    const step = e.x === 0 ? 1 : -1;
    for (let x = e.x; x !== target.x; x += step) cells.push({ x, y: e.y });
    for (let y = e.y; y !== target.y; y += Math.sign(target.y - e.y)) cells.push({ x: target.x, y });
  } else { // 남·북: 같은 x로 세로
    const step = e.y === 0 ? 1 : -1;
    for (let y = e.y; y !== target.y; y += step) cells.push({ x: e.x, y });
    for (let x = e.x; x !== target.x; x += Math.sign(target.x - e.x)) cells.push({ x, y: target.y });
  }
  return cells;
}
/** 진입점이나 경로 시설 칸을 탭했을 때의 경로 (카드 분기). 없으면 null. */
export function routeAtCell(state: GameState, x: number, y: number): RouteId | null {
  for (const id of ROUTE_IDS) { const e = ENTRY_ROUTES[id].entry; if (e.x === x && e.y === y) return id; }
  const o = objectAt(state, x, y);
  return o ? routeOfFacility(o.type) : null;
}

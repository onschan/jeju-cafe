import type { GameState, Guest, PlacedObject, Pt, MenuCategory, MenuStatKey, RoleId, GuestWant, ComplaintReason, RouteId } from './types.ts';
import { canOpen } from './goals.ts';
import { objectDef, guestTypeDef, guestTags, guestDialogue, canonicalGuestId, namedGuestDef, NAMED_TYPE } from '../data/index.ts';
import { pickWeighted, nextRandom, randInt } from './rng.ts';
import { sceneryScore, objectAt } from './grid.ts';
import { availableMenus, consumeIngredients, isMenuAvailable } from './menu.ts';
import { busStopPos, findPath, walkableNeighborsOf, reachMap, pathFromReach, cellKey, moveAlong, walkSpeedMult, GUEST_SPEED_CELLS_PER_S } from './path.ts';
import { roleEffect, skillTotal, pushNotice, staffInRole, addRoleExp, LOW_ENERGY } from './staff.ts';
import { effectivePopularity, youtuberMultiplier } from './promotions.ts';
import { START_HOUR, END_HOUR, seasonOf } from './clock.ts';
import { parcelBonusAt, parcelSpawnMult, parcelFeeMult, parcelAt } from './parcels.ts';
import { objectStats, popularityFor, comboPickMult, comboSatisfaction, BASE_POPULARITY } from './compat.ts';
import { cleanSatisfaction, CLEAN_LOW } from './cleanliness.ts';
import { isUnlocked, unlockedTypeIds, regularFreqMult, walletOf, onHappyVisit, addSatisfaction, VISIT_BONUS_CAP, targetSpawnMult } from './segments.ts';
import { rivalGuestMult } from './rivals.ts';
import { addComplaint, noteGuest, noteSatisfied, reputationGuestMult, reputationTypeMult, reputationTipMult } from './reputation.ts';
import { isAged } from './economy.ts';
import { recordUse, facilityFee } from './upgrade.ts'; // 트랙 A 훅: 이용 횟수·Lv 요금
import { addResearchProgress, TASTE_MATCH_WEIGHT } from './progress.ts';
import { effectMult, noGuestsToday } from './effects.ts';
import { spotGuestBonus, busSpots, isBusDay, BUS_HOUR, BUS_MIN, BUS_MAX, spotSpawnMult } from './spots.ts';
import type { ParcelBonus } from './types.ts';
import { seatsOf, isSeat } from './cafe.ts';
import { pushFx } from './fx.ts';
import { menuOf, priceOf, likesStatsMatch, statsMatchCount, guestEvalBonus, guestLikesCategory, seatTimeMult, dignityPct, photoChance, menuOrderWeight, LIKE_BONUS_CAP } from './craft.ts';
import { addAffinity, affinityGain, namedLikes, regularsDueNow, NAMED_MIN_SCENERY } from './popup.ts';
import { eventGuestMult, eventTagMult, eventFeeMult, isSpecialGuest, specialGuestTip } from './events.ts';
import { fmtNum } from './format.ts';
import { josa } from './josa.ts';
import { siteBonus } from './site.ts';
import { spawnRouteWeights, routeArrivals, routeSpawnPos, routeTagMult, routeWalletMult, routeStayMult, routeGuestMult, routeHome, noteRouteGuest, noteRouteIncome, foreignPhotoChance, foreignMenuMult, chargePortFee } from './entry.ts'; // 트랙 H 유입 경로

export { moveAlong, GUEST_SPEED_CELLS_PER_S }; // 하위 호환 재수출 (본체는 path.ts)
export const SEAT_MS = 3000;       // 기분이 정해진 뒤 앉아 있는 시간 (≈1.5시간)
export const PREP_MS = 3000;       // 직원 없을 때 조리 시간 (≈1.5시간)
export const MAX_PREP_CUT = 0.6;   // 직원 효과로 줄일 수 있는 최대 비율
export const MAX_SPEED_SKILL = 0.5;
export const SERVICE_PER_SCENERY = 30; // 홀 서비스 30당 경치 기준 −1
export const POP_PER_SCENERY = 3;      // 좌석 인기가 기본(10)에서 3 벗어날 때마다 경치 ±1
export const SAY_CHANCE = 0.3;     // §19 손님 대사 확률
export const MAX_GUESTS = 60;
export const MIN_DAILY_GUESTS = 2;
export const MAX_DAILY_GUESTS = 300;
/** 하루 손님 수 = min(좌석 × 6, 인기·명소 기반값) (확장 §4.2 #1).
 *  기반값 = 4 + 해금 손님층 유효 인기 합 ÷ 21 + 시설(좌석 제외) 인기 합 ÷ 16 + 명소 방문객 × 3%, × 평판 배수(0.5~1.5). 시작(6석, 인기 합 75, 평판 50)에 7명. 통합 튜닝: §4.6 밴드(3년차 손님 1,500~3,000·자금)에 맞춰 17/12 → 21/16. */
export const GUESTS_PER_SEAT = 6;
export const BASE_DAILY_GUESTS = 4;
export const POP_SUM_PER_GUEST = 21;
export const FACILITY_POP_PER_GUEST = 16;
/** 명소 하루 방문객(spots.dailyVisitors = 매력 × 2, 투어 버스 ×1.3) × VISITOR_GUEST_RATE(3%)가 하루 손님으로 유입 — 명소 투자가 손님 수의 큰 축 (§4.2 #1 "인기·명소 기반값") */
/** 대기열: 빈 자리가 없으면 3명까지 기다리고, 넘치면 돌아간다(그 손님층 만족 −10) — §4.3 웨이팅 */
export const WAIT_MAX = 3;
export const WAIT_LEAVE_SATISFACTION = 10;
/** 계절 배수: 1·2월 비수기 0.8, 12월 0.9, 3·11월 0.95, 7·8월 성수기 1.15, 5·10월 1.1 */
export const SEASON_GUEST_MULT: Record<number, number> = { 1: 0.8, 2: 0.8, 3: 0.95, 5: 1.1, 7: 1.15, 8: 1.15, 10: 1.1, 11: 0.95, 12: 0.9 };
/** 자리 주변 2칸 소음 합이 이 이상이면 불만 'noise' (§4.3 소음 ≥ 5) */
export const NOISE_COMPLAINT = 5;
/** 시설 순회: 앉았다 일어난 손님 40%가 시설 하나(포토존·기념품·자판기·서가·갤러리·공방…)에 들러 이용료를 내고 간다 */
export const VISIT_CHANCE = 0.4;
export const VISIT_MS = 1500;
/** 순회 대상: fee가 있는 시설 + 서가 */
export function isVisitable(type: string): boolean {
  const d = objectDef(type);
  return d.kind === 'facility' && (d.fee !== undefined || type === 'bookshelf');
}
/** 손님이 바라는 것과 맞는 시설인가 (fun → 즐길거리·포토존, convenience → 편의, scenery → 포토존). 바라는 게 없으면 다 좋다. */
const VISIT_WANTS: Record<string, GuestWant[]> = { photo_spot: ['fun', 'scenery'], souvenir: ['fun'], vending: ['convenience'], bookshelf: ['rest', 'fun'], gallery: ['fun', 'scenery'] };
export function likesFacility(typeId: string, objectType: string): boolean {
  const wants = guestTypeDef(typeId).wants;
  const need = VISIT_WANTS[objectType] ?? ['fun', 'food', 'convenience'];
  return wants.length === 0 || need.some((w) => wants.includes(w));
}

/** 좌석 오브젝트 (2층을 올리면 본관도 4석) */
function seatObjects(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => isSeat(state, o));
}

/** 좌석 오브젝트 안에서 쓰고 있는 자리 번호들 (나가는 손님 제외) */
function usedSlots(state: GameState, seatId: string): Set<number> {
  const used = new Set<number>();
  for (const g of state.guests) if (g.seatId === seatId && g.phase !== 'leaving') used.add(g.seatSlot);
  return used;
}

function firstFreeSlot(state: GameState, seat: PlacedObject): number {
  const used = usedSlots(state, seat.id);
  const n = seatsOf(state, seat);
  for (let i = 0; i < n; i++) if (!used.has(i)) return i;
  return n - 1;
}

/** 자리 번호 → 좌석 오브젝트 위 좌표. 가로로 n등분 (table_out 2석: x−0.25, x+0.25). */
export function seatSlotPos(seat: PlacedObject, slot: number, n = objectDef(seat.type).seats ?? 1): Pt {
  const def = objectDef(seat.type);
  return { x: seat.x + ((slot + 0.5) / n) * def.w - def.w / 2 + (def.w - 1) / 2, y: seat.y + (def.h - 1) / 2 };
}

/** 아직 손님이 배정되지 않은 좌석 오브젝트 */
export function freeSeats(state: GameState): PlacedObject[] {
  const taken = new Map<string, number>();
  for (const g of state.guests) if (g.seatId && g.phase !== 'leaving') taken.set(g.seatId, (taken.get(g.seatId) ?? 0) + 1);
  return seatObjects(state).filter((o) => (taken.get(o.id) ?? 0) < seatsOf(state, o));
}

/** 정류장에서 걸어서 닿는 좌석이 하나라도 있나. 점유 여부는 보지 않는다 (길이 이어졌는지 판정하는 안내용). */
export function hasReachableSeat(state: GameState): boolean {
  const reach = reachMap(state, busStopPos(state));
  return seatObjects(state).some((s) => walkableNeighborsOf(state, s.x, s.y).some((nb) => reach.dist.has(cellKey(state, nb))));
}

// ---------- 스폰 수·가중치 ----------

export function totalSeats(state: GameState): number {
  return seatObjects(state).reduce((n, o) => n + seatsOf(state, o), 0);
}

/** 손님층 유입 배수 = (1 + 유효 인기/50) × 유튜버 부스트 × (1 + 인기쟁이 스킬). 유효 인기 = 기본 + 활성 기간형 홍보. */
export function spawnMultiplier(state: GameState, typeId: string): number {
  return (1 + effectivePopularity(state, typeId) / 50) * youtuberMultiplier(state, typeId) * (1 + skillTotal(state, 'spawnBonus')) * spotSpawnMult(state, typeId); // 트랙 C: 명소 태그 배수·투어 버스
}

/** 시간대별 손님층 가중: 아침(6~9) 시니어(삼춘) 2배, 낮(11~17) 청년(관광객) 2배 */
function hourTypeMult(hour: number, typeId: string): number {
  const age = guestTags(typeId).age;
  if (age === 'senior' && hour >= 6 && hour <= 9) return 2;
  if (age === 'youth' && hour >= 11 && hour <= 17) return 2;
  return 1;
}

/** 스폰 시 손님층 선택 가중치 = 기본 × 유입 배수 × 시간대 × 필지(해안 ×1.3) × 단골 빈도 × 이벤트 효과. 잠긴 타입은 0. */
export function typeWeight(state: GameState, typeId: string, hour = state.clock.hour, bonus: ParcelBonus = 'none'): number {
  if (!isUnlocked(state, typeId)) return 0;
  // 투어 버스 단체 ×1.3은 spawnMultiplier 안의 spotSpawnMult(트랙 C)가 맡는다
  return guestTypeDef(typeId).weight * spawnMultiplier(state, typeId) * hourTypeMult(hour, typeId) * parcelSpawnMult(bonus, typeId)
    * regularFreqMult(state, typeId) * effectMult(state, 'spawnMult', typeId) * eventTagMult(state, typeId) * reputationTypeMult(state, typeId) * targetSpawnMult(state, typeId); // 타깃 손님층 ×1.3 (y-ui, UX §5.4)
}

/** 시간대별 손님 수 비중 (하루 합 1). 정오 피크 2배, 18시 이후 절반. */
export function hourShare(hour: number): number {
  const profile = (h: number) => (h >= 18 ? 0.5 : h === 12 || h === 13 ? 2 : 1);
  let total = 0;
  for (let h = START_HOUR; h < END_HOUR; h++) total += profile(h);
  return profile(hour) / total;
}

export function seasonGuestMult(month: number): number {
  return SEASON_GUEST_MULT[month] ?? 1;
}
/** 해금 손님층 유효 인기 합 (홍보·유튜버 부스트 포함) */
export function popularitySum(state: GameState): number {
  return unlockedTypeIds(state).reduce((s, id) => s + effectivePopularity(state, id), 0);
}
/** 소유 필지의 완공된 시설(좌석·길·돌담 제외) 인기 합 — 시설이 늘수록 손님이 는다 */
export function facilityPopularitySum(state: GameState): number {
  let sum = 0;
  for (const o of Object.values(state.objects)) {
    if (o.build || isSeat(state, o)) continue;
    const kind = objectDef(o.type).kind;
    if (kind === 'path' || kind === 'wall' || kind === 'busstop' || kind === 'gate') continue;
    if (objectDef(o.type).cost <= 0 || !parcelAt(state, o.x, o.y)?.owned) continue; // 처음부터 있던 덤불·샘은 제외
    sum += Math.max(0, objectStats(state, o.id).popularity);
  }
  return sum;
}
/** 명소 방문객 → 하루 손님 (트랙 C spots.spotGuestBonus: 방문객/일 × 3%) */
export function spotDailyGuests(state: GameState): number {
  return spotGuestBonus(state);
}
/** 인기·명소 기반 하루 손님 (좌석 상한 전): 4 + 인기 합/21 + 시설 인기 합/16 + 명소 방문객 × 3% */
export function popularityGuestBase(state: GameState): number {
  return BASE_DAILY_GUESTS + Math.floor(popularitySum(state) / POP_SUM_PER_GUEST) + Math.floor(facilityPopularitySum(state) / FACILITY_POP_PER_GUEST) + spotDailyGuests(state);
}
/** 하루 손님 수 = min(좌석 × 6, 기반값 × 이벤트 전체 배수 × 빅 이벤트 배수 × 메뉴 품격(+%) × 계절 × 라이벌(−5%/곳) × 청결 × 평판(0.5 + 평판/100)), 2~300 */
export function dailyGuestCount(state: GameState): number {
  const n = popularityGuestBase(state) * effectMult(state, 'spawnMult') * eventGuestMult(state) * (1 + dignityPct(state) / 100)
    * seasonGuestMult(state.clock.month) * rivalGuestMult(state) * reputationGuestMult(state) * routeGuestMult(state); // 트랙 H 올레길 +15% · 청결 배수(트랙 A)는 dailyCleanliness가 거는 하루짜리 spawnMult 효과로 effectMult에 들어 있다
  const cap = totalSeats(state) * GUESTS_PER_SEAT;
  return Math.max(MIN_DAILY_GUESTS, Math.min(MAX_DAILY_GUESTS, cap, Math.round(n)));
}

/** 새 날: 어제 대기열은 사라진다 */
export function resetWaiting(state: GameState): void {
  state.waiting = [];
}
/** 대기열이 찼을 때 돌아가는 손님: 이달 이탈 수 +1, 그 손님층 만족 −10 */
function walkAway(state: GameState, typeId: string): void {
  state.monthGuestsLeft++;
  if (typeId !== NAMED_TYPE) addSatisfaction(state, typeId, -WAIT_LEAVE_SATISFACTION);
  addComplaint(state, 'no_seat', typeId);
}

/** 매 시간: 하루 손님 수를 시간대 비중으로 나눠 소수 누적, 정수만큼 스폰. 손님 0 이벤트 날은 안 온다. 일요일 11시엔 투어 버스. */
export function hourlySpawn(state: GameState): number {
  if (noGuestsToday(state)) return 0;
  state.spawnAcc += dailyGuestCount(state) * hourShare(state.clock.hour);
  const n = Math.floor(state.spawnAcc + 1e-9);
  state.spawnAcc -= n;
  let spawned = n > 0 ? spawnByRoutes(state, n) : 0;
  if (state.clock.hour === BUS_HOUR && isBusDay(state.clock.day)) spawned += tourBus(state);
  // 트랙 H: 시각 고정 경로 — 공항 셔틀(11·15시)·크루즈(입항 날 13시)
  for (const a of routeArrivals(state)) {
    const pos = routeSpawnPos(state, a.route);
    if (!pos) continue;
    if (a.route === 'cruise') chargePortFee(state);
    spawned += spawnGuests(state, a.n, undefined, { route: a.route, pos });
  }
  return spawned;
}

/** 트랙 H: 기본 스폰 n명을 활성 경로 가중치(정류장 1.0 / 주차장 칸당 0.15 / 올레 0.15)로 나눠 진입점별로 스폰. 정류장만 열려 있으면 rng를 쓰지 않는다(결정성 유지). */
export function spawnByRoutes(state: GameState, n: number): number {
  const routes = spawnRouteWeights(state);
  if (routes.length <= 1 && (routes.length === 0 || routes[0]!.route === 'bus')) return spawnGuests(state, n);
  const counts = new Map<RouteId, number>();
  for (let i = 0; i < n; i++) {
    const r = pickWeighted(state, routes, (x) => x.weight)!.route;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let spawned = 0;
  for (const [route, k] of counts) {
    const pos = route === 'bus' ? undefined : routeSpawnPos(state, route);
    spawned += spawnGuests(state, k, undefined, route === 'bus' || !pos ? undefined : { route, pos });
  }
  return spawned;
}

/** 단골★(이름 있는 손님) 한 명을 본점에 스폰한다. 좌석·경로가 없으면 false. */
export function spawnNamedGuest(state: GameState, namedId: string): boolean {
  namedGuestDef(namedId);
  if (spawnGuests(state, 1, NAMED_TYPE) === 0) return false;
  state.guests[state.guests.length - 1]!.namedId = namedId;
  return true;
}

/** 매 시간: 오늘 이 시각에 오기로 한 단골★을 스폰한다 (popup.ts regularVisitSlot). 실제 스폰 수. */
export function hourlyRegulars(state: GameState): number {
  if (noGuestsToday(state)) return 0;
  let n = 0;
  for (const def of regularsDueNow(state)) if (spawnNamedGuest(state, def.id)) n++;
  return n;
}

/** 투어 버스: Lv3 이상 관광지마다 그곳의 Lv2 손님 타입 4~6명이 한꺼번에. 실제 스폰 수. */
export function tourBus(state: GameState): number {
  let n = 0;
  for (const spot of busSpots(state)) {
    if (!spot.lv2GuestId || !isUnlocked(state, spot.lv2GuestId)) continue;
    n += spawnGuests(state, randInt(state, BUS_MIN, BUS_MAX), spot.lv2GuestId);
  }
  return n;
}

/** 최대 n명 스폰. 진입점(기본 정류장, entry를 주면 그 경로 시작 칸)에서 가장 가까운 빈 좌석부터 — 대기열(waiting)에 있던 손님이 먼저 앉는다. forceType을 주면 그 타입만(투어 버스).
 *  entry(트랙 H)를 주면 그 경로의 태그 가중치로 손님층을 뽑고 Guest.route에 기록한다. 빈 자리가 없으면 대기열에 3명까지 서고, 넘치면 돌아간다(walkAway). 실제 앉힌(스폰된) 수를 돌려준다. */
export function spawnGuests(state: GameState, n: number, forceType?: string, entry?: { route: RouteId; pos: Pt }): number {
  if (!canOpen(state)) return 0; // §7.1 좌석·길·메뉴가 갖춰질 때까지 손님 0 (x-goals 훅)
  let spawned = 0;
  const route: RouteId = entry?.route ?? 'bus';
  const start = entry?.pos ?? busStopPos(state);
  const reach = reachMap(state, start); // 걷기 지형은 스폰 중 안 바뀌므로 한 번만
  const pickType = (bonus: ParcelBonus, force?: string) => force ? (force === NAMED_TYPE ? NAMED_TYPE : canonicalGuestId(force)) : pickWeighted(state, unlockedTypeIds(state), (id) => typeWeight(state, id, state.clock.hour, bonus) * (entry ? routeTagMult(route, id) : 1));
  const findSeat = (): { seat: PlacedObject; target: Pt; dist: number } | null => {
    let best: { seat: PlacedObject; target: Pt; dist: number } | null = null;
    for (const seat of freeSeats(state)) {
      for (const nb of walkableNeighborsOf(state, seat.x, seat.y)) {
        const d = reach.dist.get(cellKey(state, nb));
        if (d === undefined) continue;
        if (!best || d < best.dist) best = { seat, target: nb, dist: d };
      }
    }
    return best;
  };
  const seatGuest = (best: { seat: PlacedObject; target: Pt }, typeId: string) => {
    state.guests.push({
      id: `g${state.nextId++}`,
      type: typeId,
      phase: 'walking',
      x: start.x,
      y: start.y,
      path: pathFromReach(state, reach, best.target)!.slice(1),
      seatId: best.seat.id,
      seatSlot: firstFreeSlot(state, best.seat),
      approachCell: null,
      menuId: null,
      mood: null,
      moodReason: null,
      say: null,
      visitId: null,
      timerMs: 0,
      waitMs: 0,
      paid: 0,
      ...(entry ? { route } : {}),
    });
    if (entry) noteRouteGuest(state, route); else noteRouteGuest(state, 'bus');
    spawned++;
  };
  // 대기열부터 (n과 별도로 앉힌다). 단골★·투어 버스(forceType)는 줄과 상관없이 바로 자리를 찾는다.
  while (!forceType && state.waiting.length > 0 && state.guests.length < MAX_GUESTS) {
    const best = findSeat();
    if (!best) break;
    const t = state.waiting.shift()!;
    seatGuest(best, t);
    addComplaint(state, 'wait_long', t); // 줄을 섰다 앉은 손님은 오래 기다렸다고 한다
  }
  for (let i = 0; i < n && state.guests.length < MAX_GUESTS; i++) {
    const best = findSeat();
    if (!best) {
      if (forceType) break; // 투어 버스·단골★은 줄을 서지 않는다
      // 자리가 없으면 줄을 서고, 줄이 3명이면 돌아간다
      const t = pickType('none');
      if (!t) break;
      if (state.waiting.length < WAIT_MAX) state.waiting.push(t);
      else walkAway(state, t);
      continue;
    }
    const typeId = pickType(parcelBonusAt(state, best.seat.x, best.seat.y), forceType);
    if (!typeId) break;
    seatGuest(best, typeId);
  }
  return spawned;
}

// ---------- 주문·기분 ----------

function prepRole(category: MenuCategory): RoleId {
  return category === 'drink' ? 'barista' : 'cook';
}

/** 취향 보너스 = 취향 스탯 일치 수(최대 2) + 건강함·든든함 손님층 평가 */
export function tasteBonus(state: GameState, typeId: string, menuId: string | null): number {
  return Math.min(LIKE_BONUS_CAP, likesStatsMatch(state, typeId, menuId)) + guestEvalBonus(state, typeId, menuId);
}

/** 주문·만족 판정에 쓰는 손님 프로필. 단골★(namedId)은 NamedGuestDef의 취향·예산, 나머지는 손님층 정의. */
interface GuestProfile { likes: MenuCategory[]; likesStats: MenuStatKey[]; wallet: number; minScenery: number }
function profileOf(state: GameState, g: Guest): GuestProfile {
  if (g.namedId) {
    const d = namedGuestDef(g.namedId);
    return { likes: namedLikes(d), likesStats: d.likesStats, wallet: d.budget, minScenery: NAMED_MIN_SCENERY };
  }
  const t = guestTypeDef(g.type);
  return { likes: t.likes, likesStats: t.likesStats, wallet: Math.round(walletOf(state, g.type) * routeWalletMult(g)), minScenery: t.minScenery }; // 트랙 H: 경로·외국인 지갑 배수
}

/** 조리 시간 = 5초 × (1 − min(0.6, 담당 역할 효과/100)) × (1 − 속도 스킬) */
export function prepTimeMs(state: GameState, category: MenuCategory): number {
  const role = prepRole(category);
  const cut = Math.min(MAX_PREP_CUT, roleEffect(state, role) / 100);
  const speed = Math.min(MAX_SPEED_SKILL, skillTotal(state, 'speed', role));
  return PREP_MS * (1 - cut) * (1 - speed);
}

/** 홀 서비스가 경치 기준을 낮춘다 */
export function serviceBonus(state: GameState): number {
  return Math.floor(roleEffect(state, 'hall') / SERVICE_PER_SCENERY);
}

function maybeSay(state: GameState, g: Guest): void {
  if (nextRandom(state) >= SAY_CHANCE) return;
  const d = guestDialogue(g.type);
  const pool = g.mood === 'happy' ? d.happy : g.moodReason && g.moodReason !== 'price' ? d.meh[g.moodReason] : [];
  g.say = pickWeighted(state, pool, () => 1);
}

/** 좌석 인기(상성·아이템·세트 반영)가 경치 점수에 주는 보정 */
export function popularityBonus(popularity: number): number {
  return Math.floor((popularity - BASE_POPULARITY) / POP_PER_SCENERY);
}

/** 만족 판정 가산(경치 단위): 콤보(손님층 +5·전체 +3)·청결(80 이상 +3, 50 미만 −5)은 10으로 나눠 경치 단위로 (트랙 A) */
export function extraSatisfaction(state: GameState, g: Guest, seat: PlacedObject): number {
  return (comboSatisfaction(state, seat.id, g.type) + cleanSatisfaction(state)) / 10;
}
/** 저녁 손님 기준 시각 (특기 night_owl) */
export const NIGHT_HOUR = 18;
/** 만족 게이지 배수 (트랙 D 특기): 단골 전환 regularBonus + 단체 손님 groupSatisfaction + 18시 이후 nightSatisfaction */
export function skillSatMult(state: GameState, g: Guest): number {
  let m = 1 + skillTotal(state, 'regularBonus');
  if (guestTags(g.type).group) m += skillTotal(state, 'groupSatisfaction');
  if (state.clock.hour >= NIGHT_HOUR) m += skillTotal(state, 'nightSatisfaction');
  return m;
}

/** 조리가 끝났을 때 만족 판정. 경치 + 홀 서비스 + 좌석 인기 보정 + 메뉴 취향 + 콤보·청결 가산 ≥ 손님층 기준이면 happy → 연구 진행(5명당 1, 취향 일치는 2명 몫)·만족 게이지·타입 효과. 취향이 맞으면 호감도 ×2, 인생샷이면 사진. */
function resolveMood(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  const seat = state.objects[g.seatId!]!;
  const p = profileOf(state, g);
  const match = g.namedId ? statsMatchCount(state, p.likesStats, g.menuId) : likesStatsMatch(state, g.type, g.menuId);
  const taste = g.namedId ? Math.min(LIKE_BONUS_CAP, match) : tasteBonus(state, g.type, g.menuId);
  if (sceneryScore(state, seat.x, seat.y) + serviceBonus(state) + popularityBonus(popularityFor(state, seat.id, g.type)) + taste + extraSatisfaction(state, g, seat) + siteBonus(state, seat).satisfaction >= p.minScenery) { // 트랙 A 콤보·청결 + 트랙 F 입지
    g.mood = 'happy';
    g.moodReason = null;
    state.stats.satisfiedTotal++;
    noteSatisfied(state);
    const tasteMatch = match > 0;
    addResearchProgress(state, tasteMatch ? TASTE_MATCH_WEIGHT : 1);
    if (g.namedId) {
      g.say = namedGuestDef(g.namedId).line;
      if (isSpecialGuest(g.namedId)) {
        // 빅 이벤트 특별 손님: 만족하면 팁을 남긴다
        const tip = Math.round(specialGuestTip(g.namedId) * reputationTipMult(state));
        if (tip > 0) {
          state.money += tip;
          state.monthIncome += tip;
          state.totalIncome += tip;
          pushNotice(state, `${josa(namedGuestDef(g.namedId).name, '이/가')} 팁 ₩${fmtNum(tip)}을 남겼어요!`);
          pushFx(state, { kind: 'pop', x: seat.x, y: seat.y, n: tip, tick: state.tick });
        }
        return;
      }
      // 단골★: 본점에서도 호감도가 오른다 (손님층 만족·효과 대신). 만족하면 자기 대사를 한다.
      addAffinity(state, g.namedId, affinityGain(tasteMatch));
      return;
    }
    state.popularity = Math.max(-100, Math.min(100, state.popularity + type.popularityShift));
    onHappyVisit(state, g, (tasteMatch ? 2 : 1) * skillSatMult(state, g));
    const photo = foreignPhotoChance(g.type, photoChance(state, g.type, g.menuId)); // 트랙 H: 외국인 ×2
    if (photo > 0 && nextRandom(state) < photo) pushFx(state, { kind: 'photo', x: seat.x, y: seat.y, tick: state.tick });
  } else {
    g.mood = 'meh';
    g.moodReason = 'scenery';
    const why = mehCause(state, seat);
    if (why) addComplaint(state, why.reason, g, why.detail);
  }
  if (!g.namedId) maybeSay(state, g);
}

/** 불만 원인 추정 (경치 미달로 meh일 때): 지친 홀 직원 → rude, 낡은 자리 → worn, 청결 < 50 → dirty, 입지 만족이 음수인 야외 자리(겨울 바람·여름 그늘 없음, 트랙 F) → cold_hot, 주변 소음 ≥ 5 → noise. 없으면 null(불만 아님). */
export function mehCause(state: GameState, seat: PlacedObject): { reason: ComplaintReason; detail?: string } | null {
  const hall = staffInRole(state, 'hall');
  if (hall.length > 0 && hall.every((st) => st.energy < LOW_ENERGY)) return { reason: 'rude' };
  if (isAged(state, seat)) return { reason: 'worn', detail: objectDef(seat.type).name };
  if (state.clean.value < CLEAN_LOW) return { reason: 'dirty' };
  const season = seasonOf(state.clock.month);
  if ((season === 'winter' || season === 'summer') && siteBonus(state, seat).satisfaction < 0) return { reason: 'cold_hot', detail: season };
  let noise = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const o = objectAt(state, seat.x + dx, seat.y + dy); if (o && o.id !== seat.id) noise += objectDef(o.type).noise; }
  if (noise >= NOISE_COMPLAINT) return { reason: 'noise' };
  return null;
}
/** 손님이 좋아하는 종류인데 지금 못 만드는(직원 조건 미달) 메뉴판 메뉴 이름 — 후기 "OO가 자주 품절이래요" */
function unavailableLikedName(state: GameState, likes: MenuCategory[]): string | undefined {
  const id = state.menuSlots.find((m): m is string => m !== null && guestLikesCategory(likes, menuOf(state, m).category) && !isMenuAvailable(state, m));
  return id ? menuOf(state, id).name : undefined;
}

/** 예산(지갑) 안에서 주문할 수 있는 메뉴 */
export function affordableMenus(state: GameState, typeId: string): string[] {
  const type = guestTypeDef(typeId);
  const wallet = walletOf(state, typeId);
  return availableMenus(state).filter((id) => guestLikesCategory(type.likes, menuOf(state, id).category) && priceOf(state, id) <= wallet);
}

/** 자리에 앉는 순간: 메뉴 결정·재료·돈은 즉시, 기분은 조리(waitMs) 뒤에. 예산 초과면 주문 안 함(price). 지갑 0(동물·정령)은 주문 없이 바로 기분. */
function order(state: GameState, g: Guest): void {
  const p = profileOf(state, g);
  state.monthGuests++;
  state.totalGuests++;
  noteGuest(state);
  if (p.wallet <= 0) { g.waitMs = 0; return; }
  const liked = availableMenus(state).filter((id) => guestLikesCategory(p.likes, menuOf(state, id).category));
  const candidates = liked.filter((id) => priceOf(state, id) <= p.wallet);
  if (candidates.length === 0) {
    g.mood = 'meh';
    g.moodReason = liked.length > 0 ? 'price' : 'no_menu';
    g.timerMs = SEAT_MS;
    if (g.moodReason === 'price') addComplaint(state, 'expensive', g, menuOf(state, liked.sort((a, b) => priceOf(state, a) - priceOf(state, b))[0]!).name);
    else addComplaint(state, 'no_menu', g, unavailableLikedName(state, p.likes));
    maybeSay(state, g);
    return;
  }
  const menuId = pickWeighted(state, candidates, (id) => menuOrderWeight(state, id) * foreignMenuMult(state, g.type, id))!; // 트랙 H: 외국인 감귤 메뉴 선호
  const menu = menuOf(state, menuId);
  consumeIngredients(state, menuId);
  const seat = state.objects[g.seatId!]!;
  recordUse(seat); // 트랙 A: 증축 조건(누적 이용)
  const price = Math.round(priceOf(state, menuId) * parcelFeeMult(parcelBonusAt(state, seat.x, seat.y)) * (objectStats(state, seat.id).feePct / 100) * eventFeeMult(state) * siteBonus(state, seat).feeMult); // 트랙 F 입지 요금
  state.money += price;
  state.monthIncome += price;
  state.totalIncome += price;
  noteRouteIncome(state, g, price); // 트랙 H 경로 매출
  g.menuId = menuId;
  g.paid = price;
  g.waitMs = prepTimeMs(state, menu.category) * siteBonus(state, seat).serveMult; // 트랙 F: 주방 거리 서빙 시간
  addRoleExp(state, prepRole(menu.category)); addRoleExp(state, 'hall'); // 트랙 D: 조리·서빙 1건 경험치 +0.2
  state.menuSold[menuId] = (state.menuSold[menuId] ?? 0) + 1;
  state.monthMenuSold[menuId] = (state.monthMenuSold[menuId] ?? 0) + 1;
}

/** 자리에서 일어난 손님이 들를 시설을 고른다: 좋아하는 종류이고 걸어서 닿는 것 중 하나 (40%). 없으면 null. */
export function pickVisit(state: GameState, g: Guest, from: Pt): { obj: PlacedObject; path: Pt[] } | null {
  const candidates = Object.values(state.objects).filter((o) => !o.build && isVisitable(o.type) && likesFacility(g.type, o.type));
  if (candidates.length === 0 || nextRandom(state) >= VISIT_CHANCE) return null;
  const reach = reachMap(state, from);
  const reachable: { obj: PlacedObject; target: Pt }[] = [];
  for (const obj of candidates) {
    let best: { target: Pt; d: number } | null = null;
    for (const nb of walkableNeighborsOf(state, obj.x, obj.y)) {
      const d = reach.dist.get(cellKey(state, nb));
      if (d !== undefined && (!best || d < best.d)) best = { target: nb, d };
    }
    if (best) reachable.push({ obj, target: best.target });
  }
  const pick = pickWeighted(state, reachable, (r) => comboPickMult(state, r.obj.id, g.type)); // 트랙 A: 손님층 콤보 ×1.3/개(최대 ×2)·명당 ×1.5
  if (!pick) return null;
  return { obj: pick.obj, path: pathFromReach(state, reach, pick.target)! };
}

/** 시설 도착: 이용료를 내고 시설 인기 +1(상한), 숫자 팝업 연출 */
function useFacility(state: GameState, g: Guest, obj: PlacedObject): void {
  const fee = Math.round(facilityFee(state, obj) * (1 + skillTotal(state, 'feeBonus')) * siteBonus(state, obj).feeMult); // 트랙 A: Lv 요금 +10%/+20% · 트랙 D 특기 haggler +5% · 트랙 F 입지
  recordUse(obj);
  state.money += fee;
  state.monthIncome += fee;
  state.totalIncome += fee;
  noteRouteIncome(state, g, fee); // 트랙 H 경로 매출
  state.visitBonus[obj.type] = Math.min(VISIT_BONUS_CAP, (state.visitBonus[obj.type] ?? 0) + 1);
  pushFx(state, { kind: 'pop', x: obj.x, y: obj.y, n: 1, tick: state.tick });
}

/** 자리를 떠나 정류장으로 (또는 시설로) */
function leaveSeat(state: GameState, g: Guest, bus: Pt): void {
  // 좌석 칸은 걷기 칸이 아니라서 다가갔던 옆 칸으로 먼저 나간 뒤 정류장으로
  const from = g.approachCell ?? { x: Math.round(g.x), y: Math.round(g.y) };
  g.seatId = null;
  g.approachCell = null;
  const visit = g.mood !== null ? pickVisit(state, g, from) : null;
  if (visit) {
    g.phase = 'visiting';
    g.visitId = visit.obj.id;
    g.path = [from, ...visit.path.slice(1)];
    g.timerMs = VISIT_MS;
    return;
  }
  g.phase = 'leaving';
  const back = findPath(state, from, g.route ? routeHome(state, g) : bus); // 트랙 H: 온 경로로 돌아간다
  g.path = [from, ...(back ? back.slice(1) : [])];
}

export function updateGuests(state: GameState, dtMs: number): void {
  const bus = busStopPos(state);
  const walkMs = dtMs * walkSpeedMult(state); // 활력 화분 이동 속도
  for (const g of state.guests) {
    if (g.phase === 'walking') {
      if (moveAlong(g, walkMs)) {
        g.phase = 'seated';
        g.approachCell = { x: Math.round(g.x), y: Math.round(g.y) };
        const seat = state.objects[g.seatId!]!;
        const pos = seatSlotPos(seat, g.seatSlot, seatsOf(state, seat));
        g.x = pos.x;
        g.y = pos.y;
        order(state, g);
      }
    } else if (g.phase === 'visiting') {
      if (g.path.length > 0) {
        if (!moveAlong(g, walkMs)) continue;
        const obj = g.visitId ? state.objects[g.visitId] : undefined;
        if (obj) useFacility(state, g, obj);
        g.approachCell = { x: Math.round(g.x), y: Math.round(g.y) };
      }
      g.timerMs -= dtMs;
      if (g.timerMs <= 0) {
        g.visitId = null;
        g.phase = 'leaving';
        const from = g.approachCell ?? { x: Math.round(g.x), y: Math.round(g.y) };
        g.approachCell = null;
        const back = findPath(state, from, g.route ? routeHome(state, g) : bus); // 트랙 H
        g.path = back ? back.slice(1) : [];
      }
    } else if (g.phase === 'seated') {
      if (g.mood === null) {
        g.waitMs -= dtMs;
        if (g.waitMs <= 0) {
          g.waitMs = 0;
          resolveMood(state, g);
          g.timerMs = SEAT_MS * seatTimeMult(state, g.menuId) * routeStayMult(g); // 트랙 H: 주차장 ×1.2·크루즈 ×0.7
        }
        continue;
      }
      g.timerMs -= dtMs;
      if (g.timerMs <= 0) leaveSeat(state, g, bus);
    } else if (g.phase === 'leaving') {
      moveAlong(g, walkMs);
    }
  }
  state.guests = state.guests.filter((g) => !(g.phase === 'leaving' && g.path.length === 0));
}

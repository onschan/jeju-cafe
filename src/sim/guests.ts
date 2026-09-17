import type { GameState, Guest, PlacedObject, Pt, MenuCategory, RoleId, GuestWant } from './types.ts';
import { objectDef, guestTypeDef, guestTags, guestDialogue, canonicalGuestId } from '../data/index.ts';
import { pickWeighted, nextRandom, randInt } from './rng.ts';
import { sceneryScore } from './grid.ts';
import { availableMenus, consumeIngredients } from './menu.ts';
import { busStopPos, findPath, walkableNeighborsOf, reachMap, pathFromReach, cellKey, moveAlong, GUEST_SPEED_CELLS_PER_S } from './path.ts';
import { roleEffect, skillTotal } from './staff.ts';
import { effectivePopularity, youtuberMultiplier } from './promotions.ts';
import { START_HOUR, END_HOUR } from './clock.ts';
import { parcelBonusAt, parcelSpawnMult, parcelFeeMult } from './parcels.ts';
import { objectStats, popularityFor, BASE_POPULARITY } from './compat.ts';
import { isUnlocked, unlockedTypeIds, regularFreqMult, walletOf, onHappyVisit, VISIT_BONUS_CAP } from './segments.ts';
import { effectMult, noGuestsToday } from './effects.ts';
import { spotGuestBonus, busSpots, isBusDay, BUS_HOUR, BUS_MIN, BUS_MAX } from './spots.ts';
import type { ParcelBonus } from './types.ts';
import { seatsOf, isSeat } from './cafe.ts';
import { pushFx } from './farm.ts';
import { menuOf, priceOf, likesStatsMatch, guestEvalBonus, guestLikesCategory, seatTimeMult, dignityPct, photoChance, menuOrderWeight, LIKE_BONUS_CAP } from './craft.ts';

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
export const MAX_DAILY_GUESTS = 120;
/** 하루 손님 수 = 2 + 좌석 × 3 + (평균 유입 배수 − 1) × 10. 화폐 ×100 뒤 메뉴 가격은 그대로라 손님 수로 매출을 맞춘다 (GDD §1). */
export const GUESTS_PER_SEAT = 3;
export const GUESTS_PER_MULT = 10;
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
  return (1 + effectivePopularity(state, typeId) / 50) * youtuberMultiplier(state, typeId) * (1 + skillTotal(state, 'spawnBonus'));
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
  return guestTypeDef(typeId).weight * spawnMultiplier(state, typeId) * hourTypeMult(hour, typeId) * parcelSpawnMult(bonus, typeId)
    * regularFreqMult(state, typeId) * effectMult(state, 'spawnMult', typeId);
}

/** 시간대별 손님 수 비중 (하루 합 1). 정오 피크 2배, 18시 이후 절반. */
export function hourShare(hour: number): number {
  const profile = (h: number) => (h >= 18 ? 0.5 : h === 12 || h === 13 ? 2 : 1);
  let total = 0;
  for (let h = START_HOUR; h < END_HOUR; h++) total += profile(h);
  return profile(hour) / total;
}

/** 하루 손님 수 = (2 + 좌석 × 3 + (해금 타입 평균 유입 배수 − 1) × 10 + 관광지 매력도/40) × 이벤트 전체 배수 × 메뉴 품격(+%), 2~120 */
export function dailyGuestCount(state: GameState): number {
  const ids = unlockedTypeIds(state);
  const avgMult = ids.length > 0 ? ids.reduce((s, id) => s + spawnMultiplier(state, id), 0) / ids.length : 1;
  const n = MIN_DAILY_GUESTS + totalSeats(state) * GUESTS_PER_SEAT + Math.floor((avgMult - 1) * GUESTS_PER_MULT + 1e-9) + spotGuestBonus(state);
  return Math.max(MIN_DAILY_GUESTS, Math.min(MAX_DAILY_GUESTS, Math.round(n * effectMult(state, 'spawnMult') * (1 + dignityPct(state) / 100))));
}

/** 매 시간: 하루 손님 수를 시간대 비중으로 나눠 소수 누적, 정수만큼 스폰. 손님 0 이벤트 날은 안 온다. 일요일 11시엔 투어 버스. */
export function hourlySpawn(state: GameState): number {
  if (noGuestsToday(state)) return 0;
  state.spawnAcc += dailyGuestCount(state) * hourShare(state.clock.hour);
  const n = Math.floor(state.spawnAcc + 1e-9);
  state.spawnAcc -= n;
  let spawned = n > 0 ? spawnGuests(state, n) : 0;
  if (state.clock.hour === BUS_HOUR && isBusDay(state.clock.day)) spawned += tourBus(state);
  return spawned;
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

/** 최대 n명 스폰. 정류장에서 가장 가까운 빈 좌석부터. forceType을 주면 그 타입만(투어 버스). 실제 스폰된 수를 돌려준다. */
export function spawnGuests(state: GameState, n: number, forceType?: string): number {
  let spawned = 0;
  const start = busStopPos(state);
  const reach = reachMap(state, start); // 걷기 지형은 스폰 중 안 바뀌므로 한 번만
  for (let i = 0; i < n && state.guests.length < MAX_GUESTS; i++) {
    let best: { seat: PlacedObject; target: Pt; dist: number } | null = null;
    for (const seat of freeSeats(state)) {
      for (const nb of walkableNeighborsOf(state, seat.x, seat.y)) {
        const d = reach.dist.get(cellKey(state, nb));
        if (d === undefined) continue;
        if (!best || d < best.dist) best = { seat, target: nb, dist: d };
      }
    }
    if (!best) break;
    const path = pathFromReach(state, reach, best.target)!;
    const bonus = parcelBonusAt(state, best.seat.x, best.seat.y);
    const typeId = forceType ? canonicalGuestId(forceType) : pickWeighted(state, unlockedTypeIds(state), (id) => typeWeight(state, id, state.clock.hour, bonus));
    if (!typeId) break;
    state.guests.push({
      id: `g${state.nextId++}`,
      type: typeId,
      phase: 'walking',
      x: start.x,
      y: start.y,
      path: path.slice(1),
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
    });
    spawned++;
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

/** 조리가 끝났을 때 만족 판정. 경치 + 홀 서비스 + 좌석 인기 보정 + 메뉴 취향 ≥ 손님층 기준이면 happy → 만족 게이지·타입 효과. 취향이 맞으면 호감도 ×2, 인생샷이면 사진. */
function resolveMood(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  const seat = state.objects[g.seatId!]!;
  if (sceneryScore(state, seat.x, seat.y) + serviceBonus(state) + popularityBonus(popularityFor(state, seat.id, g.type)) + tasteBonus(state, g.type, g.menuId) >= type.minScenery) {
    g.mood = 'happy';
    g.moodReason = null;
    state.research += 1;
    state.popularity = Math.max(-100, Math.min(100, state.popularity + type.popularityShift));
    onHappyVisit(state, g, likesStatsMatch(state, g.type, g.menuId) > 0 ? 2 : 1);
    const photo = photoChance(state, g.type, g.menuId);
    if (photo > 0 && nextRandom(state) < photo) pushFx(state, { kind: 'photo', x: seat.x, y: seat.y, tick: state.tick });
  } else {
    g.mood = 'meh';
    g.moodReason = 'scenery';
  }
  maybeSay(state, g);
}

/** 예산(지갑) 안에서 주문할 수 있는 메뉴 */
export function affordableMenus(state: GameState, typeId: string): string[] {
  const type = guestTypeDef(typeId);
  const wallet = walletOf(state, typeId);
  return availableMenus(state).filter((id) => guestLikesCategory(type.likes, menuOf(state, id).category) && priceOf(state, id) <= wallet);
}

/** 자리에 앉는 순간: 메뉴 결정·재료·돈은 즉시, 기분은 조리(waitMs) 뒤에. 예산 초과면 주문 안 함(price). 지갑 0(동물·정령)은 주문 없이 바로 기분. */
function order(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  state.monthGuests++;
  if (type.wallet <= 0) { g.waitMs = 0; return; }
  const liked = availableMenus(state).filter((id) => guestLikesCategory(type.likes, menuOf(state, id).category));
  const candidates = affordableMenus(state, g.type);
  if (candidates.length === 0) {
    g.mood = 'meh';
    g.moodReason = liked.length > 0 ? 'price' : 'no_menu';
    g.timerMs = SEAT_MS;
    maybeSay(state, g);
    return;
  }
  const menuId = pickWeighted(state, candidates, (id) => menuOrderWeight(state, id))!;
  const menu = menuOf(state, menuId);
  consumeIngredients(state, menuId);
  const seat = state.objects[g.seatId!]!;
  const price = Math.round(priceOf(state, menuId) * parcelFeeMult(parcelBonusAt(state, seat.x, seat.y)) * (objectStats(state, seat.id).feePct / 100));
  state.money += price;
  state.monthIncome += price;
  state.totalIncome += price;
  g.menuId = menuId;
  g.paid = price;
  g.waitMs = prepTimeMs(state, menu.category);
  state.menuSold[menuId] = (state.menuSold[menuId] ?? 0) + 1;
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
  const pick = pickWeighted(state, reachable, () => 1);
  if (!pick) return null;
  return { obj: pick.obj, path: pathFromReach(state, reach, pick.target)! };
}

/** 시설 도착: 이용료를 내고 시설 인기 +1(상한), 숫자 팝업 연출 */
function useFacility(state: GameState, g: Guest, obj: PlacedObject): void {
  const def = objectDef(obj.type);
  const fee = def.fee ?? 0;
  state.money += fee;
  state.monthIncome += fee;
  state.totalIncome += fee;
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
  const back = findPath(state, from, bus);
  g.path = [from, ...(back ? back.slice(1) : [])];
}

export function updateGuests(state: GameState, dtMs: number): void {
  const bus = busStopPos(state);
  for (const g of state.guests) {
    if (g.phase === 'walking') {
      if (moveAlong(g, dtMs)) {
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
        if (!moveAlong(g, dtMs)) continue;
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
        const back = findPath(state, from, bus);
        g.path = back ? back.slice(1) : [];
      }
    } else if (g.phase === 'seated') {
      if (g.mood === null) {
        g.waitMs -= dtMs;
        if (g.waitMs <= 0) {
          g.waitMs = 0;
          resolveMood(state, g);
          g.timerMs = SEAT_MS * seatTimeMult(state, g.menuId);
        }
        continue;
      }
      g.timerMs -= dtMs;
      if (g.timerMs <= 0) leaveSeat(state, g, bus);
    } else if (g.phase === 'leaving') {
      moveAlong(g, dtMs);
    }
  }
  state.guests = state.guests.filter((g) => !(g.phase === 'leaving' && g.path.length === 0));
}

import type { GameState, Guest, PlacedObject, Pt, MenuCategory, RoleId } from './types.ts';
import { objectDef, menuDef, guestTypeDef, GUEST_TYPES, DIALOGUE } from '../data/index.ts';
import { pickWeighted, nextRandom } from './rng.ts';
import { sceneryScore } from './grid.ts';
import { availableMenus, consumeIngredients } from './menu.ts';
import { busStopPos, findPath, walkableNeighborsOf, reachMap, pathFromReach, cellKey, moveAlong, GUEST_SPEED_CELLS_PER_S } from './path.ts';
import { roleEffect, skillTotal } from './staff.ts';
import { effectivePopularity, youtuberMultiplier } from './promotions.ts';
import { START_HOUR, END_HOUR } from './clock.ts';

export { moveAlong, GUEST_SPEED_CELLS_PER_S }; // 하위 호환 재수출 (본체는 path.ts)
export const SEAT_MS = 6000;       // 기분이 정해진 뒤 앉아 있는 시간 (≈3시간)
export const PREP_MS = 5000;       // 직원 없을 때 조리 시간
export const MAX_PREP_CUT = 0.6;   // 직원 효과로 줄일 수 있는 최대 비율
export const MAX_SPEED_SKILL = 0.5;
export const SERVICE_PER_SCENERY = 30; // 홀 서비스 30당 경치 기준 −1
export const SAY_CHANCE = 0.3;     // §19 손님 대사 확률
export const MAX_GUESTS = 30;
export const MIN_DAILY_GUESTS = 1;
export const MAX_DAILY_GUESTS = 8;

function seatObjects(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'seat');
}

/** 좌석 오브젝트 안에서 쓰고 있는 자리 번호들 (나가는 손님 제외) */
function usedSlots(state: GameState, seatId: string): Set<number> {
  const used = new Set<number>();
  for (const g of state.guests) if (g.seatId === seatId && g.phase !== 'leaving') used.add(g.seatSlot);
  return used;
}

function firstFreeSlot(state: GameState, seat: PlacedObject): number {
  const used = usedSlots(state, seat.id);
  const n = objectDef(seat.type).seats ?? 1;
  for (let i = 0; i < n; i++) if (!used.has(i)) return i;
  return n - 1;
}

/** 자리 번호 → 좌석 오브젝트 위 좌표. 가로로 n등분 (table_out 2석: x−0.25, x+0.25). */
export function seatSlotPos(seat: PlacedObject, slot: number): Pt {
  const def = objectDef(seat.type);
  const n = def.seats ?? 1;
  return { x: seat.x + ((slot + 0.5) / n) * def.w - def.w / 2 + (def.w - 1) / 2, y: seat.y + (def.h - 1) / 2 };
}

/** 아직 손님이 배정되지 않은 좌석 오브젝트 */
export function freeSeats(state: GameState): PlacedObject[] {
  const taken = new Map<string, number>();
  for (const g of state.guests) if (g.seatId && g.phase !== 'leaving') taken.set(g.seatId, (taken.get(g.seatId) ?? 0) + 1);
  return seatObjects(state).filter((o) => (taken.get(o.id) ?? 0) < (objectDef(o.type).seats ?? 1));
}

/** 정류장에서 걸어서 닿는 좌석이 하나라도 있나. 점유 여부는 보지 않는다 (길이 이어졌는지 판정하는 안내용). */
export function hasReachableSeat(state: GameState): boolean {
  const reach = reachMap(state, busStopPos(state));
  return seatObjects(state).some((s) => walkableNeighborsOf(state, s.x, s.y).some((nb) => reach.dist.has(cellKey(state, nb))));
}

// ---------- 스폰 수·가중치 ----------

export function totalSeats(state: GameState): number {
  return seatObjects(state).reduce((n, o) => n + (objectDef(o.type).seats ?? 1), 0);
}

/** 손님층 유입 배수 = (1 + 유효 인기/50) × 유튜버 부스트 × (1 + 인기쟁이 스킬). 유효 인기 = 기본 + 활성 기간형 홍보. */
export function spawnMultiplier(state: GameState, typeId: string): number {
  return (1 + effectivePopularity(state, typeId) / 50) * youtuberMultiplier(state, typeId) * (1 + skillTotal(state, 'spawnBonus'));
}

/** 시간대별 손님층 가중: 아침(6~9) 삼춘 2배, 낮(11~17) 관광객 2배 */
function hourTypeMult(hour: number, typeId: string): number {
  if (typeId === 'local' && hour >= 6 && hour <= 9) return 2;
  if (typeId === 'tourist' && hour >= 11 && hour <= 17) return 2;
  return 1;
}

/** 스폰 시 손님층 선택 가중치 */
export function typeWeight(state: GameState, typeId: string, hour = state.clock.hour): number {
  return guestTypeDef(typeId).weight * spawnMultiplier(state, typeId) * hourTypeMult(hour, typeId);
}

/** 시간대별 손님 수 비중 (하루 합 1). 정오 피크 2배, 18시 이후 절반. */
export function hourShare(hour: number): number {
  const profile = (h: number) => (h >= 18 ? 0.5 : h === 12 || h === 13 ? 2 : 1);
  let total = 0;
  for (let h = START_HOUR; h < END_HOUR; h++) total += profile(h);
  return profile(hour) / total;
}

/** 하루 손님 수 = 1 + 좌석/4 + (평균 유입 배수 − 1) × 2, 1~8 */
export function dailyGuestCount(state: GameState): number {
  const avgMult = GUEST_TYPES.reduce((s, t) => s + spawnMultiplier(state, t.id), 0) / GUEST_TYPES.length;
  const n = 1 + Math.floor(totalSeats(state) / 4) + Math.floor((avgMult - 1) * 2);
  return Math.max(MIN_DAILY_GUESTS, Math.min(MAX_DAILY_GUESTS, n));
}

/** 매 시간: 하루 손님 수를 시간대 비중으로 나눠 소수 누적, 정수만큼 스폰. */
export function hourlySpawn(state: GameState): number {
  state.spawnAcc += dailyGuestCount(state) * hourShare(state.clock.hour);
  const n = Math.floor(state.spawnAcc + 1e-9);
  state.spawnAcc -= n;
  return n > 0 ? spawnGuests(state, n) : 0;
}

/** 최대 n명 스폰. 정류장에서 가장 가까운 빈 좌석부터. 실제 스폰된 수를 돌려준다. */
export function spawnGuests(state: GameState, n: number): number {
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
    const type = pickWeighted(state, GUEST_TYPES, (t) => typeWeight(state, t.id))!;
    state.guests.push({
      id: `g${state.nextId++}`,
      type: type.id,
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
      timerMs: 0,
      waitMs: 0,
    });
    spawned++;
  }
  return spawned;
}

// ---------- 주문·기분 ----------

function prepRole(category: MenuCategory): RoleId {
  return category === 'drink' ? 'barista' : 'cook';
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
  const d = DIALOGUE.guest[g.type];
  if (!d) return;
  const pool = g.mood === 'happy' ? d.happy : g.moodReason && g.moodReason !== 'price' ? d.meh[g.moodReason] : [];
  g.say = pickWeighted(state, pool, () => 1);
}

/** 조리가 끝났을 때 만족 판정. 경치 + 홀 서비스 ≥ 손님층 기준이면 happy. */
function resolveMood(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  const seat = state.objects[g.seatId!]!;
  if (sceneryScore(state, seat.x, seat.y) + serviceBonus(state) >= type.minScenery) {
    g.mood = 'happy';
    g.moodReason = null;
    state.research += 1;
    state.popularity = Math.max(-100, Math.min(100, state.popularity + type.popularityShift));
  } else {
    g.mood = 'meh';
    g.moodReason = 'scenery';
  }
  maybeSay(state, g);
}

/** 자리에 앉는 순간: 메뉴 결정·재료·돈은 즉시, 기분은 조리(waitMs) 뒤에. */
function order(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  state.monthGuests++;
  const candidates = availableMenus(state).filter((id) => type.likes.includes(menuDef(id).category));
  if (candidates.length === 0) {
    g.mood = 'meh';
    g.moodReason = 'no_menu';
    g.timerMs = SEAT_MS;
    maybeSay(state, g);
    return;
  }
  const menuId = pickWeighted(state, candidates, () => 1)!;
  const menu = menuDef(menuId);
  consumeIngredients(state, menuId);
  state.money += menu.price;
  state.monthIncome += menu.price;
  g.menuId = menuId;
  g.waitMs = prepTimeMs(state, menu.category);
}

export function updateGuests(state: GameState, dtMs: number): void {
  const bus = busStopPos(state);
  for (const g of state.guests) {
    if (g.phase === 'walking') {
      if (moveAlong(g, dtMs)) {
        g.phase = 'seated';
        g.approachCell = { x: Math.round(g.x), y: Math.round(g.y) };
        const pos = seatSlotPos(state.objects[g.seatId!]!, g.seatSlot);
        g.x = pos.x;
        g.y = pos.y;
        order(state, g);
      }
    } else if (g.phase === 'seated') {
      if (g.mood === null) {
        g.waitMs -= dtMs;
        if (g.waitMs <= 0) {
          g.waitMs = 0;
          resolveMood(state, g);
          g.timerMs = SEAT_MS;
        }
        continue;
      }
      g.timerMs -= dtMs;
      if (g.timerMs <= 0) {
        // 좌석 칸은 걷기 칸이 아니라서 다가갔던 옆 칸으로 먼저 나간 뒤 정류장으로
        g.phase = 'leaving';
        g.seatId = null;
        const from = g.approachCell ?? { x: Math.round(g.x), y: Math.round(g.y) };
        const back = findPath(state, from, bus);
        g.path = [from, ...(back ? back.slice(1) : [])];
        g.approachCell = null;
      }
    } else if (g.phase === 'leaving') {
      moveAlong(g, dtMs);
    }
  }
  state.guests = state.guests.filter((g) => !(g.phase === 'leaving' && g.path.length === 0));
}

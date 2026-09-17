import type { GameState, Guest, PlacedObject, Pt } from './types.ts';
import { objectDef, menuDef, guestTypeDef, GUEST_TYPES } from '../data/index.ts';
import { pickWeighted } from './rng.ts';
import { sceneryScore } from './grid.ts';
import { availableMenus, consumeIngredients } from './menu.ts';
import { busStopPos, findPath, walkableNeighborsOf, reachMap, pathFromReach, cellKey } from './path.ts';

export const GUEST_SPEED_CELLS_PER_S = 3;
export const SEAT_MS = 4000;
export const MAX_GUESTS = 30;

function seatObjects(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'seat');
}

/** 아직 손님이 배정되지 않은 좌석 오브젝트 */
export function freeSeats(state: GameState): PlacedObject[] {
  const taken = new Map<string, number>();
  for (const g of state.guests) if (g.seatId && g.phase !== 'leaving') taken.set(g.seatId, (taken.get(g.seatId) ?? 0) + 1);
  return seatObjects(state).filter((o) => (taken.get(o.id) ?? 0) < (objectDef(o.type).seats ?? 1));
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
    const type = pickWeighted(state, GUEST_TYPES, (t) => t.weight)!;
    state.guests.push({
      id: `g${state.nextId++}`,
      type: type.id,
      phase: 'walking',
      x: start.x,
      y: start.y,
      path: path.slice(1),
      seatId: best.seat.id,
      menuId: null,
      mood: null,
      timerMs: 0,
    });
    spawned++;
  }
  return spawned;
}

function moveAlong(g: Guest, dtMs: number): boolean {
  let budget = (dtMs / 1000) * GUEST_SPEED_CELLS_PER_S;
  while (budget > 0 && g.path.length) {
    const next = g.path[0]!;
    const dx = next.x - g.x;
    const dy = next.y - g.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= budget) {
      g.x = next.x;
      g.y = next.y;
      g.path.shift();
      budget -= dist;
    } else {
      g.x += Math.sign(dx) * budget;
      g.y += Math.sign(dy) * budget;
      budget = 0;
    }
  }
  return g.path.length === 0;
}

function order(state: GameState, g: Guest): void {
  const type = guestTypeDef(g.type);
  const seat = state.objects[g.seatId!]!;
  const candidates = availableMenus(state).filter((id) => type.likes.includes(menuDef(id).category));
  if (candidates.length === 0) {
    g.mood = 'meh';
    return;
  }
  const menuId = pickWeighted(state, candidates, () => 1)!;
  const menu = menuDef(menuId);
  consumeIngredients(state, menuId);
  state.money += menu.price;
  state.monthIncome += menu.price;
  state.monthGuests++;
  g.menuId = menuId;
  const scenery = sceneryScore(state, seat.x, seat.y);
  if (scenery >= type.minScenery) {
    g.mood = 'happy';
    state.research += 1;
    state.popularity = Math.max(-100, Math.min(100, state.popularity + type.popularityShift));
  } else {
    g.mood = 'meh';
  }
}

export function updateGuests(state: GameState, dtMs: number): void {
  const bus = busStopPos(state);
  for (const g of state.guests) {
    if (g.phase === 'walking') {
      if (moveAlong(g, dtMs)) {
        g.phase = 'seated';
        g.timerMs = SEAT_MS;
        order(state, g);
      }
    } else if (g.phase === 'seated') {
      g.timerMs -= dtMs;
      if (g.timerMs <= 0) {
        g.phase = 'leaving';
        g.seatId = null;
        const back = findPath(state, { x: Math.round(g.x), y: Math.round(g.y) }, bus);
        g.path = back ? back.slice(1) : [];
      }
    } else if (g.phase === 'leaving') {
      moveAlong(g, dtMs);
    }
  }
  state.guests = state.guests.filter((g) => !(g.phase === 'leaving' && g.path.length === 0));
}

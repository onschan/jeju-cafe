import type { GameState, Cell, PlacedObject, ApplyResult, ObjectDef, Season, Pt } from './types.ts';
import { objectDef, SEASON_SCENERY } from '../data/index.ts';
import { parcelAt, parcelSceneryBonus } from './parcels.ts';
import { seasonOf, monthIndex } from './clock.ts';

/** 바위 치우기 비용: 작은 바위 30만, 큰 바위(오름 능선) 100만, 곶자왈 덤불 5만. 곡괭이가 있으면 무료(1개 소모). */
export const ROCK_CLEAR_COST = 300_000;
export const BIG_ROCK_CLEAR_COST = 1_000_000;
export const BUSH_CLEAR_COST = 50_000;
export const PICKAXE_ITEM = 'pickaxe';

export const SHELTER_THRESHOLD = 3;
export const SCENERY_RADIUS = 2;
/** 경관 상한 (마스터 GDD §2.2) */
export const SCENERY_CAP = 30;

/** 오브젝트 자기 경치 + 계절 보너스 (정의의 seasonScenery, 없으면 SEASON_SCENERY 표) + 경관 씨앗 보너스, 상한 30 */
export function objectScenery(def: ObjectDef, season: Season, itemScenery = 0): number {
  const bonus = def.seasonScenery ? def.seasonScenery[season] ?? 0 : SEASON_SCENERY[def.id]?.[season] ?? 0;
  return Math.min(SCENERY_CAP, def.scenery + bonus + itemScenery);
}
/** 이 종류에 쓴 경관 씨앗 보너스 */
export function itemScenery(state: GameState, type: string): number {
  return state.itemBonus[type]?.scenery ?? 0;
}

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.grid.w && y < state.grid.h;
}

export function cellAt(state: GameState, x: number, y: number): Cell {
  if (!inBounds(state, x, y)) throw new Error(`cell out of bounds ${x},${y}`);
  const c = state.grid.cells[y * state.grid.w + x];
  if (!c) throw new Error(`cell out of bounds ${x},${y}`);
  return c;
}

export function objectAt(state: GameState, x: number, y: number): PlacedObject | null {
  if (!inBounds(state, x, y)) return null;
  const id = cellAt(state, x, y).objectId;
  return id ? state.objects[id] ?? null : null;
}

export function footprint(type: string, x: number, y: number): { x: number; y: number }[] {
  const def = objectDef(type);
  const cells = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) cells.push({ x: x + dx, y: y + dy });
  return cells;
}

// ---------- 실내 바닥(room) ----------

/** 방(room 오브젝트)의 문 칸 = 정면 왼쪽 (x, y+h−1). 밖에서 안으로는 이 칸으로만 드나든다. */
export function doorOf(room: PlacedObject): Pt {
  return { x: room.x, y: room.y + objectDef(room.type).h - 1 };
}

/** 문 앞 칸 = 문 바로 아래(바깥). 손님이 들어오려면 이 칸이 걷기 칸(올렛길)이어야 한다. */
export function doorFrontOf(room: PlacedObject): Pt {
  const d = doorOf(room);
  return { x: d.x, y: d.y + 1 };
}

/** 문 앞에 놓으면 출입을 막는 종류 (길·정낭·정류장은 걷기 칸이라 괜찮다; 실내 오브젝트는 방 안에만 놓인다) */
const DOOR_FRONT_FREE_KINDS = new Set(['path', 'gate', 'busstop']);
export function blocksDoorFront(def: ObjectDef): boolean {
  return !def.indoor && !DOOR_FRONT_FREE_KINDS.has(def.kind);
}

/** 이 칸이 어떤 방의 문 앞 칸이면 그 방 */
export function roomWithDoorFrontAt(state: GameState, x: number, y: number, ignoreId?: string): PlacedObject | null {
  for (const o of Object.values(state.objects)) {
    if (o.id === ignoreId || !objectDef(o.type).room) continue;
    const f = doorFrontOf(o);
    if (f.x === x && f.y === y) return o;
  }
  return null;
}

/** 이 칸을 바닥으로 삼는 방 */
export function roomAt(state: GameState, x: number, y: number): PlacedObject | null {
  if (!inBounds(state, x, y)) return null;
  const id = cellAt(state, x, y).roomId;
  return id ? state.objects[id] ?? null : null;
}

/** 실내 오브젝트가 없는 방 바닥 칸인가 (걸을 수 있다) */
export function isRoomFloor(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const c = cellAt(state, x, y);
  return c.roomId !== null && c.objectId === c.roomId;
}

/** 오브젝트가 발자국 칸을 차지한다. 방이면 roomId도 새긴다. 실내 오브젝트는 objectId만 덮어쓴다(roomId 유지). */
export function occupy(state: GameState, obj: PlacedObject): void {
  const def = objectDef(obj.type);
  for (const p of footprint(obj.type, obj.x, obj.y)) {
    const c = cellAt(state, p.x, p.y);
    c.objectId = obj.id;
    if (def.room) c.roomId = obj.id;
  }
}

/** 발자국 칸을 비운다. 실내 오브젝트였으면 그 칸은 다시 방 바닥(objectId = roomId)이 된다. */
export function vacate(state: GameState, obj: PlacedObject): void {
  const def = objectDef(obj.type);
  for (const p of footprint(obj.type, obj.x, obj.y)) {
    const c = cellAt(state, p.x, p.y);
    if (def.room) c.roomId = null;
    c.objectId = def.room ? null : c.roomId;
  }
}

/** 방 안에 놓인 실내 오브젝트들 */
export function objectsInRoom(state: GameState, roomId: string): PlacedObject[] {
  return Object.values(state.objects).filter((o) => o.id !== roomId && roomAt(state, o.x, o.y)?.id === roomId);
}

/** 필지 안에 랜드마크가 이미 있나 (필지당 1) */
export function parcelHasLandmark(state: GameState, parcelId: string, ignoreId?: string): boolean {
  return Object.values(state.objects).some((o) => o.id !== ignoreId && objectDef(o.type).kind === 'landmark' && parcelAt(state, o.x, o.y)?.id === parcelId);
}

/** ignoreId: 옮기는 중인 오브젝트는 자기 발자국을 비어 있는 것으로 본다 */
export function canPlace(state: GameState, type: string, x: number, y: number, ignoreId?: string): ApplyResult {
  const def = objectDef(type);
  const parcelIds = new Set<string>();
  const roomIds = new Set<string | null>();
  for (const p of footprint(type, x, y)) {
    if (!inBounds(state, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    const parcel = parcelAt(state, p.x, p.y);
    if (!parcel?.owned) return { ok: false, reason: '아직 내 땅이 아니에요' };
    parcelIds.add(parcel.id);
    const cell = cellAt(state, p.x, p.y);
    if (def.indoor) {
      // 실내 오브젝트: 방 바닥(비어 있는) 위에만, 문 칸은 비워 둔다
      const room = cell.roomId ? state.objects[cell.roomId] : null;
      if (!room) return { ok: false, reason: '실내에만 놓을 수 있어요' };
      if (cell.objectId !== cell.roomId && cell.objectId !== ignoreId) return { ok: false, reason: '이미 뭔가 있어요' };
      const door = doorOf(room);
      if (door.x === p.x && door.y === p.y) return { ok: false, reason: '문 앞은 비워 둬요' };
      roomIds.add(cell.roomId);
      continue;
    }
    if (cell.objectId && cell.objectId !== ignoreId) return { ok: false, reason: '이미 뭔가 있어요' };
    if (!def.terrain.includes(cell.terrain)) return { ok: false, reason: cell.terrain === 'rock' || cell.terrain === 'rock_big' ? '바위를 먼저 치워요' : '여기엔 못 놓아요' };
    // 방의 문 앞 칸은 손님 출입구라 길·정낭만 놓는다
    if (blocksDoorFront(def) && roomWithDoorFrontAt(state, p.x, p.y, ignoreId)) return { ok: false, reason: '문 앞은 비워 둬요' };
  }
  if (def.indoor && roomIds.size > 1) return { ok: false, reason: '한 방 안에 놓아요' };
  if (def.room) {
    // 새 방의 문 앞 칸이 막혀 있으면(다른 오브젝트·격자 밖) 손님이 못 들어온다
    const f = doorFrontOf({ id: '', type, x, y, placedMonth: 0 });
    if (!inBounds(state, f.x, f.y)) return { ok: false, reason: '문 앞이 격자 밖이에요' };
    const front = objectAt(state, f.x, f.y);
    if (front && front.id !== ignoreId && blocksDoorFront(objectDef(front.type))) return { ok: false, reason: '문 앞이 막혀 있어요' };
  }
  if (def.kind === 'landmark') {
    if (parcelIds.size > 1) return { ok: false, reason: '랜드마크는 한 필지 안에 놓아요' };
    for (const id of parcelIds) if (parcelHasLandmark(state, id, ignoreId)) return { ok: false, reason: '이 필지엔 이미 랜드마크가 있어요' };
  }
  return { ok: true };
}

/** 검사 없이 놓는다. 호출 전 canPlace로 확인할 것. */
export function placeObject(state: GameState, type: string, x: number, y: number, rot?: number): PlacedObject {
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, placedMonth: monthIndex(state.clock) };
  if (rot !== undefined) obj.rot = rot;
  state.objects[id] = obj;
  occupy(state, obj);
  return obj;
}

export function removeObject(state: GameState, objectId: string): void {
  const obj = state.objects[objectId];
  if (!obj) return;
  vacate(state, obj);
  delete state.objects[objectId];
}

/** 자리를 옮긴다 (검사 없이). 방향·놓은 달은 유지. */
export function relocateObject(state: GameState, obj: PlacedObject, x: number, y: number): void {
  vacate(state, obj);
  obj.x = x;
  obj.y = y;
  occupy(state, obj);
}

// ---------- 바위·덤불 치우기 ----------

/** 이 칸을 치우는 데 드는 돈 (곡괭이 없을 때). 치울 게 없으면 null. */
export function clearCost(state: GameState, x: number, y: number): number | null {
  if (!inBounds(state, x, y)) return null;
  const o = objectAt(state, x, y);
  if (o) return o.type === 'bush_wild' ? BUSH_CLEAR_COST : null;
  const t = cellAt(state, x, y).terrain;
  return t === 'rock' ? ROCK_CLEAR_COST : t === 'rock_big' ? BIG_ROCK_CLEAR_COST : null;
}

export function hasPickaxe(state: GameState): boolean {
  return (state.inventory[PICKAXE_ITEM] ?? 0) > 0;
}

export function canClearRock(state: GameState, x: number, y: number): ApplyResult {
  const cost = clearCost(state, x, y);
  if (cost === null) return { ok: false, reason: '치울 바위가 없어요' };
  if (!parcelAt(state, x, y)?.owned) return { ok: false, reason: '아직 내 땅이 아니에요' };
  if (!hasPickaxe(state) && state.money < cost) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

/** 바위·덤불을 치워 흙 칸으로 만든다. 곡괭이가 있으면 1개 쓰고 무료. 호출 전 canClearRock으로 확인할 것. 낸 돈을 돌려준다. */
export function clearRock(state: GameState, x: number, y: number): number {
  const cost = clearCost(state, x, y) ?? 0;
  const o = objectAt(state, x, y);
  if (o) removeObject(state, o.id);
  cellAt(state, x, y).terrain = 'soil';
  if (hasPickaxe(state)) { state.inventory[PICKAXE_ITEM]!--; return 0; }
  state.money -= cost;
  return cost;
}

/** 북서쪽 대각 띠(7칸)의 wind 합 */
export function windShelter(state: GameState, x: number, y: number): number {
  let sum = 0;
  const seen = new Set<string>();
  for (let dx = 1; dx <= 3; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const o = objectAt(state, x - dx, y - dy);
      if (!o || seen.has(o.id)) continue;
      seen.add(o.id);
      sum += objectDef(o.type).wind;
    }
  }
  return sum;
}

export function isSheltered(state: GameState, x: number, y: number): boolean {
  return windShelter(state, x, y) >= SHELTER_THRESHOLD;
}

/** 반경 2칸(체비쇼프)의 scenery(계절 보너스 포함) 합 − noise 합 + 필지 구역 보너스(오름 +2). 자기 자신은 제외. */
export function sceneryScore(state: GameState, x: number, y: number): number {
  const self = objectAt(state, x, y)?.id;
  const seen = new Set<string>();
  const season = seasonOf(state.clock.month);
  let score = parcelSceneryBonus(parcelAt(state, x, y)?.bonus ?? 'none');
  for (let dy = -SCENERY_RADIUS; dy <= SCENERY_RADIUS; dy++) {
    for (let dx = -SCENERY_RADIUS; dx <= SCENERY_RADIUS; dx++) {
      const o = objectAt(state, x + dx, y + dy);
      if (!o || o.id === self || seen.has(o.id)) continue;
      seen.add(o.id);
      const d = objectDef(o.type);
      score += objectScenery(d, season, itemScenery(state, o.type)) - d.noise;
    }
  }
  return score;
}

import type { GameState, Cell, PlacedObject, ApplyResult, ObjectDef, Season } from './types.ts';
import { objectDef, SEASON_SCENERY } from '../data/index.ts';
import { parcelAt, parcelSceneryBonus } from './parcels.ts';
import { seasonOf } from './clock.ts';

export const SHELTER_THRESHOLD = 3;
export const SCENERY_RADIUS = 2;
/** 경관 상한 (마스터 GDD §2.2) */
export const SCENERY_CAP = 30;

/** 오브젝트 자기 경치 + 계절 보너스 (정의의 seasonScenery, 없으면 SEASON_SCENERY 표), 상한 30 */
export function objectScenery(def: ObjectDef, season: Season): number {
  const bonus = def.seasonScenery ? def.seasonScenery[season] ?? 0 : SEASON_SCENERY[def.id]?.[season] ?? 0;
  return Math.min(SCENERY_CAP, def.scenery + bonus);
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

/** 필지 안에 랜드마크가 이미 있나 (필지당 1) */
export function parcelHasLandmark(state: GameState, parcelId: string, ignoreId?: string): boolean {
  return Object.values(state.objects).some((o) => o.id !== ignoreId && objectDef(o.type).kind === 'landmark' && parcelAt(state, o.x, o.y)?.id === parcelId);
}

/** ignoreId: 옮기는 중인 오브젝트는 자기 발자국을 비어 있는 것으로 본다 */
export function canPlace(state: GameState, type: string, x: number, y: number, ignoreId?: string): ApplyResult {
  const def = objectDef(type);
  const parcelIds = new Set<string>();
  for (const p of footprint(type, x, y)) {
    if (!inBounds(state, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    const parcel = parcelAt(state, p.x, p.y);
    if (!parcel?.owned) return { ok: false, reason: '아직 내 땅이 아니에요' };
    parcelIds.add(parcel.id);
    const cell = cellAt(state, p.x, p.y);
    if (cell.objectId && cell.objectId !== ignoreId) return { ok: false, reason: '이미 뭔가 있어요' };
    if (!def.terrain.includes(cell.terrain)) return { ok: false, reason: '여기엔 못 놓아요' };
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
  const obj: PlacedObject = { id, type, x, y, crop: null };
  if (rot !== undefined) obj.rot = rot;
  const def = objectDef(type);
  if (def.kind === 'tree' && def.cropId) {
    obj.crop = { cropId: def.cropId, daysGrown: 0, ready: false, harvestedYear: -1 };
  }
  state.objects[id] = obj;
  for (const p of footprint(type, x, y)) cellAt(state, p.x, p.y).objectId = id;
  return obj;
}

export function removeObject(state: GameState, objectId: string): void {
  const obj = state.objects[objectId];
  if (!obj) return;
  for (const p of footprint(obj.type, obj.x, obj.y)) cellAt(state, p.x, p.y).objectId = null;
  delete state.objects[objectId];
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
      score += objectScenery(d, season) - d.noise;
    }
  }
  return score;
}

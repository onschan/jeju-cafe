import type { GameState, Cell, PlacedObject, ApplyResult } from './types.ts';
import { objectDef } from '../data/index.ts';

export const SHELTER_THRESHOLD = 3;
export const SCENERY_RADIUS = 2;

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

export function canPlace(state: GameState, type: string, x: number, y: number): ApplyResult {
  const def = objectDef(type);
  for (const p of footprint(type, x, y)) {
    if (!inBounds(state, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    const cell = cellAt(state, p.x, p.y);
    if (cell.objectId) return { ok: false, reason: '이미 뭔가 있어요' };
    if (!def.terrain.includes(cell.terrain)) return { ok: false, reason: '여기엔 못 놓아요' };
  }
  return { ok: true };
}

/** 검사 없이 놓는다. 호출 전 canPlace로 확인할 것. */
export function placeObject(state: GameState, type: string, x: number, y: number): PlacedObject {
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, crop: null };
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

/** 반경 2칸(체비쇼프)의 scenery 합 − noise 합. 자기 자신은 제외. */
export function sceneryScore(state: GameState, x: number, y: number): number {
  const self = objectAt(state, x, y)?.id;
  const seen = new Set<string>();
  let score = 0;
  for (let dy = -SCENERY_RADIUS; dy <= SCENERY_RADIUS; dy++) {
    for (let dx = -SCENERY_RADIUS; dx <= SCENERY_RADIUS; dx++) {
      const o = objectAt(state, x + dx, y + dy);
      if (!o || o.id === self || seen.has(o.id)) continue;
      seen.add(o.id);
      const d = objectDef(o.type);
      score += d.scenery - d.noise;
    }
  }
  return score;
}

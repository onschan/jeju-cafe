/** 땅: 3×3 필지(12×10), 가운데가 내 땅. 남쪽 변이 마을 길, 정류장 하나. 칸엔 바닥(데크·타일·돌·올렛길)을 깐다. */
import type { GameState, Cell, Parcel, Pt, Floor, ApplyResult } from './types.ts';
import { facilityDef, isFloorDef } from './data.ts';

export const PARCEL_W = 12;
export const PARCEL_H = 10;
export const COLS = 3;
export const ROWS = 3;
export const GRID_W = PARCEL_W * COLS;
export const GRID_H = PARCEL_H * ROWS;
/** 내 시작 땅(가운데)의 왼쪽 위 */
export const HOME = { x: PARCEL_W, y: PARCEL_H } as const;
/** 마을 길: 가운데 줄 필지들의 맨 아랫줄 (맵 가로 전체) */
export const ROAD_Y = HOME.y + PARCEL_H - 1;
export const BUS_STOP: Pt = { x: HOME.x, y: ROAD_Y };

const PARCEL_DEFS: { id: string; name: string; col: number; row: number; price: number }[] = [
  { id: 'home', name: '우리 마당', col: 1, row: 1, price: 0 },
  { id: 'north', name: '곶자왈 숲', col: 1, row: 0, price: 1_500_000 },
  { id: 'west', name: '유채밭', col: 0, row: 1, price: 1_200_000 },
  { id: 'east', name: '마을 어귀', col: 2, row: 1, price: 1_000_000 },
  { id: 'south', name: '샘물 터', col: 1, row: 2, price: 1_800_000 },
  { id: 'nw', name: '오름 자락', col: 0, row: 0, price: 2_500_000 },
  { id: 'ne', name: '돌담 언덕', col: 2, row: 0, price: 2_200_000 },
  { id: 'sw', name: '옛 감귤밭', col: 0, row: 2, price: 2_000_000 },
  { id: 'se', name: '바닷가', col: 2, row: 2, price: 3_500_000 },
];
export function makeParcels(): Parcel[] {
  return PARCEL_DEFS.map((d) => ({ id: d.id, name: d.name, x: d.col * PARCEL_W, y: d.row * PARCEL_H, w: PARCEL_W, h: PARCEL_H, owned: d.id === 'home', price: d.price }));
}
export function makeCells(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) cells.push({ terrain: y === ROAD_Y ? 'road' : 'grass', floor: null, objectId: null });
  return cells;
}

export function inBounds(s: GameState, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < s.grid.w && y < s.grid.h; }
export function cellAt(s: GameState, x: number, y: number): Cell { return s.grid.cells[y * s.grid.w + x]!; }
export function parcelAt(s: GameState, x: number, y: number): Parcel | null { return s.parcels.find((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h) ?? null; }
export function owned(s: GameState, x: number, y: number): boolean { return !!parcelAt(s, x, y)?.owned; }
export function facilityAt(s: GameState, x: number, y: number) { const id = inBounds(s, x, y) ? cellAt(s, x, y).objectId : null; return id ? s.facilities[id] ?? null : null; }
export function footprint(x: number, y: number, w: number, h: number): Pt[] { const out: Pt[] = []; for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy }); return out; }
export function footOf(s: GameState, id: string): Pt[] { const f = s.facilities[id]!; const d = facilityDef(f.type); return footprint(f.x, f.y, d.w, d.h); }

/** 걷는 칸: 길·바닥·올렛길 중 시설이 안 앉은 칸 */
export function walkable(s: GameState, x: number, y: number): boolean {
  if (!inBounds(s, x, y)) return false;
  const c = cellAt(s, x, y);
  if (c.objectId) return false;
  return c.terrain === 'road' || c.floor !== null;
}
export const DIRS: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** 바닥을 깔 수 있나 (내 땅 잔디, 시설 없음) */
export function canLayFloor(s: GameState, floor: Floor, x: number, y: number): ApplyResult {
  if (!inBounds(s, x, y)) return { ok: false, reason: '격자 밖이에요' };
  if (!owned(s, x, y)) return { ok: false, reason: '아직 내 땅이 아니에요' };
  const c = cellAt(s, x, y);
  if (c.terrain === 'road') return { ok: false, reason: '마을 길엔 못 깔아요' };
  if (c.objectId) return { ok: false, reason: '시설이 있어요' };
  if (c.floor === floor) return { ok: false, reason: '이미 깔려 있어요' };
  return { ok: true };
}
export function layFloor(s: GameState, floor: Floor, x: number, y: number): void { cellAt(s, x, y).floor = floor; s.layoutRev++; }
export function clearFloor(s: GameState, x: number, y: number): ApplyResult {
  if (!inBounds(s, x, y)) return { ok: false, reason: '격자 밖이에요' };
  const c = cellAt(s, x, y);
  if (!c.floor) return { ok: false, reason: '바닥이 없어요' };
  if (c.objectId) return { ok: false, reason: '시설을 먼저 치워요' };
  c.floor = null;
  s.layoutRev++;
  return { ok: true };
}
/** 드래그 한 줄: from→to를 가로 먼저(L자)로 잇는 칸들. */
export function lineCells(from: Pt, to: Pt): Pt[] {
  const out: Pt[] = [];
  const sx = Math.sign(to.x - from.x), sy = Math.sign(to.y - from.y);
  let x = from.x, y = from.y;
  out.push({ x, y });
  while (x !== to.x) { x += sx; out.push({ x, y }); }
  while (y !== to.y) { y += sy; out.push({ x, y }); }
  return out;
}

/** 시설을 놓을 수 있나: 환경은 잔디에만, 자리·가게는 바닥 위에만(전부), 장식은 어디든. 내 땅, 빈 칸. 자리·가게는 걷는 칸에 붙어 있어야 한다. */
export function canPlace(s: GameState, id: string, x: number, y: number): ApplyResult {
  const d = facilityDef(id);
  if (isFloorDef(d)) return canLayFloor(s, d.floor!, x, y);
  const cells = footprint(x, y, d.w, d.h);
  for (const p of cells) {
    if (!inBounds(s, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    if (!owned(s, p.x, p.y)) return { ok: false, reason: '아직 내 땅이 아니에요' };
    const c = cellAt(s, p.x, p.y);
    if (c.terrain === 'road') return { ok: false, reason: '마을 길엔 못 놓아요' };
    if (c.objectId) return { ok: false, reason: '이미 뭔가 있어요' };
    if (d.tab === 'env' && d.sub !== 'deco' && c.floor) return { ok: false, reason: '나무·바위는 잔디에 심어요' };
    if ((d.tab === 'seat' || d.tab === 'shop') && !c.floor) return { ok: false, reason: '바닥을 먼저 깔아요' };
    if (c.floor === 'path' && d.tab !== 'env') return { ok: false, reason: '올렛길 위엔 못 놓아요' };
  }
  // 통로 보존: 놓은 뒤에도 (새것 포함) 자리·가게마다 정류장에서 걸어 닿는 옆 칸이 남아야 한다 — 카이로의 「복도에 붙어야 한다」
  const blocked = new Set(cells.map((p) => p.y * s.grid.w + p.x));
  const reach = reachExcluding(s, blocked);
  const ok = (foot: Pt[]) => foot.some((p) => DIRS.some((v) => reach.has((p.y + v.y) * s.grid.w + (p.x + v.x))));
  if ((d.tab === 'seat' || d.tab === 'shop') && !ok(cells)) return { ok: false, reason: '손님이 걸어올 통로가 옆에 없어요' };
  for (const f of Object.values(s.facilities)) {
    const fd = facilityDef(f.type);
    if ((fd.tab === 'seat' || fd.tab === 'shop') && !ok(footprint(f.x, f.y, fd.w, fd.h))) return { ok: false, reason: `${f.name ?? fd.name}으로 가는 통로가 막혀요` };
  }
  return { ok: true };
}
/** 정류장에서 걸어 닿는 칸 집합 (blocked 칸은 막힌 것으로) */
export function reachExcluding(s: GameState, blocked: Set<number>): Set<number> {
  const key = (x: number, y: number) => y * s.grid.w + x;
  const seen = new Set<number>([key(BUS_STOP.x, BUS_STOP.y)]);
  const q: Pt[] = [BUS_STOP];
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    for (const v of DIRS) {
      const n = { x: p.x + v.x, y: p.y + v.y }; const k = key(n.x, n.y);
      if (seen.has(k) || blocked.has(k) || !walkable(s, n.x, n.y)) continue;
      seen.add(k); q.push(n);
    }
  }
  return seen;
}

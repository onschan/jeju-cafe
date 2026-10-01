/** 땅: 3×3 필지(12×10), 가운데가 내 땅. 남쪽 변이 마을 길, 정류장 하나. 칸엔 바닥(데크·타일·돌·올렛길)을 깐다. */
import type { GameState, Cell, Parcel, Pt, Floor, ApplyResult } from './types.ts';
import { facilityDef, isFloorDef } from './data.ts';
import { josa } from './josa.ts';

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
/** 내 땅과 변이 붙은 필지인가 (모서리만 닿으면 안 된다) */
export function parcelAdjacent(s: GameState, p: Parcel): boolean {
  return s.parcels.some((q) => q.owned && ((Math.abs(q.x - p.x) === p.w && q.y === p.y) || (Math.abs(q.y - p.y) === p.h && q.x === p.x)));
}
export function owned(s: GameState, x: number, y: number): boolean { return !!parcelAt(s, x, y)?.owned; }
export function facilityAt(s: GameState, x: number, y: number) { const id = inBounds(s, x, y) ? cellAt(s, x, y).objectId : null; return id ? s.facilities[id] ?? null : null; }
export function footprint(x: number, y: number, w: number, h: number): Pt[] { const out: Pt[] = []; for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy }); return out; }
export function footOf(s: GameState, id: string): Pt[] { const f = s.facilities[id]!; const d = facilityDef(f.type); return footprint(f.x, f.y, d.w, d.h); }

// ---------- 변 벽 (칸을 안 먹고 변에 선다) ----------
export type WallSide = 'n' | 'w';
export interface WallEdge { x: number; y: number; side: WallSide }
/** 이웃한 두 칸 사이 변의 벽 종류 (없으면 null). a→b가 북이면 a.wn, 남이면 b.wn, 서면 a.ww, 동이면 b.ww. */
export function wallBetween(s: GameState, a: Pt, b: Pt): string | null {
  if (!inBounds(s, a.x, a.y) || !inBounds(s, b.x, b.y)) return null;
  if (b.y === a.y - 1) return cellAt(s, a.x, a.y).wn ?? null;
  if (b.y === a.y + 1) return cellAt(s, b.x, b.y).wn ?? null;
  if (b.x === a.x - 1) return cellAt(s, a.x, a.y).ww ?? null;
  if (b.x === a.x + 1) return cellAt(s, b.x, b.y).ww ?? null;
  return null;
}
/** 변 양쪽 칸 */
export function edgeCells(e: WallEdge): [Pt, Pt] { return e.side === 'n' ? [{ x: e.x, y: e.y - 1 }, { x: e.x, y: e.y }] : [{ x: e.x - 1, y: e.y }, { x: e.x, y: e.y }]; }
export function getWall(s: GameState, e: WallEdge): string | null { if (!inBounds(s, e.x, e.y)) return null; const c = cellAt(s, e.x, e.y); return (e.side === 'n' ? c.wn : c.ww) ?? null; }
export function setWall(s: GameState, e: WallEdge, kind: string | null): void { const c = cellAt(s, e.x, e.y); if (e.side === 'n') c.wn = kind; else c.ww = kind; s.layoutRev++; }
/** 네모(from~to) 둘레의 변들 */
export function rectEdges(from: Pt, to: Pt): WallEdge[] {
  const x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x), y0 = Math.min(from.y, to.y), y1 = Math.max(from.y, to.y);
  const out: WallEdge[] = [];
  for (let x = x0; x <= x1; x++) { out.push({ x, y: y0, side: 'n' }); out.push({ x, y: y1 + 1, side: 'n' }); }
  for (let y = y0; y <= y1; y++) { out.push({ x: x0, y, side: 'w' }); out.push({ x: x1 + 1, y, side: 'w' }); }
  return out;
}
/** 네모 둘레에 벽을 두른다: 되는 변만, 변마다 값. 하나도 못 세우면 실패. */
export function wallRect(s: GameState, kind: string, from: Pt, to: Pt): ApplyResult { return wallEdges(s, kind, rectEdges(from, to)); }
export type Side4 = 'n' | 'e' | 's' | 'w';
/** 칸의 네 방향 변 → 저장 변(북·서만 쓴다: 남은 아래 칸의 북, 동은 오른쪽 칸의 서) */
export function edgeOf(x: number, y: number, side: Side4): WallEdge { return side === 'n' ? { x, y, side: 'n' } : side === 'w' ? { x, y, side: 'w' } : side === 's' ? { x, y: y + 1, side: 'n' } : { x: x + 1, y, side: 'w' }; }
/** 칸 안 위치에서 가장 가까운 변 */
export function nearestSide(fx: number, fy: number): Side4 { const d: [number, Side4][] = [[fy, 'n'], [fx, 'w'], [1 - fy, 's'], [1 - fx, 'e']]; d.sort((a, b) => a[0] - b[0]); return d[0]![1]; }
/** 변 목록에 벽을 세운다: 되는 변만, 변마다 값. 하나도 못 세우면 실패. */
export function wallEdges(s: GameState, kind: string, edges: WallEdge[]): ApplyResult {
  const d = facilityDef(kind);
  if (d.sub !== 'wall') return { ok: false, reason: '벽이 아니에요' };
  let n = 0; let fail: string | undefined;
  const seen = new Set<string>();
  for (const e of edges) {
    const k = `${e.x},${e.y},${e.side}`; if (seen.has(k)) continue; seen.add(k);
    const r = canWall(s, kind, e);
    if (!r.ok) { fail = fail ?? r.reason; continue; }
    if (s.money < d.cost) { fail = '돈이 모자라요'; break; }
    s.money -= d.cost; s.month.spent += d.cost; setWall(s, e, kind); n++;
  }
  return n > 0 ? { ok: true } : { ok: false, reason: fail ?? '세울 변이 없어요' };
}
/** 칸 둘레 네 변 */
export function cellEdges(x: number, y: number): WallEdge[] { return [{ x, y, side: 'n' }, { x, y, side: 'w' }, { x, y: y + 1, side: 'n' }, { x: x + 1, y, side: 'w' }]; }
/** 변에 벽을 세울 수 있나: 양쪽 다 내 땅·길 아님, 올렛길에 닿으면 문이라 안 됨, 한 시설이 걸쳐 있으면 안 됨, 이미 벽이면 안 됨, 통로 보존. */
export function canWall(s: GameState, kind: string, e: WallEdge): ApplyResult {
  const [a, b] = edgeCells(e);
  if (!inBounds(s, a.x, a.y) || !inBounds(s, b.x, b.y)) return { ok: false, reason: '격자 밖이에요' };
  if (!owned(s, a.x, a.y) && !owned(s, b.x, b.y)) return { ok: false, reason: '아직 내 땅이 아니에요' }; // 내 땅 가장자리(한쪽만 내 땅)엔 세울 수 있다 — 울타리는 경계에 치는 것
  const ca = cellAt(s, a.x, a.y), cb = cellAt(s, b.x, b.y);
  if (ca.terrain === 'road' || cb.terrain === 'road') return { ok: false, reason: '마을 길엔 못 세워요' };
  if (ca.floor === 'path' || cb.floor === 'path') return { ok: false, reason: '올렛길 쪽은 문으로 비워요' };
  if (ca.objectId && ca.objectId === cb.objectId) return { ok: false, reason: '시설을 가로질러선 못 세워요' };
  if (getWall(s, e)) return { ok: false, reason: '이미 벽이 있어요' };
  // 통로 보존: 세운 뒤에도 자리·가게마다 정류장에서 걸어 닿는 옆 칸이 남아야 한다
  setWall(s, e, kind);
  const reach = reachExcluding(s, new Set());
  const ok = (foot: Pt[]) => foot.some((p) => DIRS.some((v) => reach.has((p.y + v.y) * s.grid.w + (p.x + v.x)) && !wallBetween(s, p, { x: p.x + v.x, y: p.y + v.y })));
  let fail: string | undefined;
  for (const f of Object.values(s.facilities)) { const fd = facilityDef(f.type); if ((fd.tab === 'seat' || fd.tab === 'shop') && !ok(footprint(f.x, f.y, fd.w, fd.h))) { fail = `${josa(f.name ?? fd.name, '으로/로')} 가는 통로가 막혀요`; break; } }
  setWall(s, e, null);
  return fail ? { ok: false, reason: fail } : { ok: true };
}

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

/** 실내인가: 시설의 바닥 칸에서 바닥(데크·타일·돌, 시설 없음)으로만 번져 나가 잔디·마을 길에 닿으면 바깥. 올렛길은 문(복도)이라 새지 않는다.
 *  벽·시설이 막은 칸은 못 지난다. 데크를 벽으로 둘러싸면(올렛길이 드나드는 입구만 남기고) 실내가 된다 — 겨울에 바깥 자리는 인기가 깎인다. */
export function isEnclosed(s: GameState, cells: Pt[]): boolean {
  const key = (p: Pt) => p.y * s.grid.w + p.x;
  const seen = new Set<number>(cells.map(key));
  const q = [...cells];
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    for (const v of DIRS) {
      const n = { x: p.x + v.x, y: p.y + v.y };
      if (wallBetween(s, p, n)) continue;          // 변 벽이 막았다 — 새지 않는다
      if (!inBounds(s, n.x, n.y)) return false;
      const c = cellAt(s, n.x, n.y);
      if (c.objectId) continue;                    // 시설이 막았다
      if (c.terrain === 'road' || !c.floor) return false; // 잔디·길 = 바깥 공기
      if (c.floor === 'path') continue;            // 올렛길은 문
      const k = key(n);
      if (seen.has(k)) continue;
      seen.add(k); q.push(n);
    }
  }
  return true;
}

/** 시설을 놓을 수 있나: 환경은 잔디에만, 자리·가게는 바닥 위에만(전부), 장식·벽은 어디든. 내 땅, 빈 칸. 자리·가게는 걷는 칸에 붙어 있어야 한다. */
export function canPlace(s: GameState, id: string, x: number, y: number): ApplyResult {
  const d = facilityDef(id);
  if (isFloorDef(d)) return canLayFloor(s, d.floor!, x, y);
  if (d.sub === 'wall') return { ok: false, reason: '벽은 바닥 위를 드래그해 둘러요' };
  const cells = footprint(x, y, d.w, d.h);
  for (const p of cells) for (const q of cells) if (Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1 && wallBetween(s, p, q)) return { ok: false, reason: '벽에 걸쳐요' };
  for (const p of cells) {
    if (!inBounds(s, p.x, p.y)) return { ok: false, reason: '격자 밖이에요' };
    if (!owned(s, p.x, p.y)) return { ok: false, reason: '아직 내 땅이 아니에요' };
    const c = cellAt(s, p.x, p.y);
    if (c.terrain === 'road') return { ok: false, reason: '마을 길엔 못 놓아요' };
    if (c.objectId) return { ok: false, reason: '이미 뭔가 있어요' };
    if (d.tab === 'env' && !d.sub && c.floor) return { ok: false, reason: '나무·바위는 잔디에 심어요' };
    if (d.station && !c.floor) return { ok: false, reason: '제조대는 바닥 위에 놓아요' };
    if ((d.tab === 'seat' || d.tab === 'shop') && !c.floor && !d.onGrass) return { ok: false, reason: '바닥을 먼저 깔아요' };
    if (c.floor === 'path' && d.tab !== 'env') return { ok: false, reason: '올렛길 위엔 못 놓아요' };
  }
  if (d.indoor && (!cells.every((p) => cellAt(s, p.x, p.y).floor && cellAt(s, p.x, p.y).floor !== 'path') || !isEnclosed(s, cells))) return { ok: false, reason: '벽으로 둘러싸인 실내 바닥에만 놓아요' };
  // 통로 보존: 놓은 뒤에도 (새것 포함) 자리·가게마다 정류장에서 걸어 닿는 옆 칸이 남아야 한다 — 카이로의 「복도에 붙어야 한다」
  const blocked = new Set(cells.map((p) => p.y * s.grid.w + p.x));
  const reach = reachExcluding(s, blocked);
  const ok = (foot: Pt[]) => foot.some((p) => DIRS.some((v) => reach.has((p.y + v.y) * s.grid.w + (p.x + v.x)) && !wallBetween(s, p, { x: p.x + v.x, y: p.y + v.y })));
  if ((d.tab === 'seat' || d.tab === 'shop') && !ok(cells)) return { ok: false, reason: '손님이 걸어올 통로가 옆에 없어요' };
  for (const f of Object.values(s.facilities)) {
    const fd = facilityDef(f.type);
    if ((fd.tab === 'seat' || fd.tab === 'shop') && !ok(footprint(f.x, f.y, fd.w, fd.h))) return { ok: false, reason: `${josa(f.name ?? fd.name, '으로/로')} 가는 통로가 막혀요` };
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
      if (seen.has(k) || blocked.has(k) || !walkable(s, n.x, n.y) || wallBetween(s, p, n)) continue;
      seen.add(k); q.push(n);
    }
  }
  return seen;
}

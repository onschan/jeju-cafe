/** 방: 벽으로 둘러싼 실내 바닥 덩어리. 안에 무엇이 있느냐로 종류가 정해지고, 바닥·벽·꾸밈·크기·마감으로 별 ★1~5이 붙는다.
 *  별은 그 방 안 자리의 인기·요금을 올리고 제조를 빠르게 한다 — 무엇을 놓느냐만큼 어떻게 방을 짜느냐가 중요해진다. */
import type { GameState, Pt, FacilityDef } from './types.ts';
import { facilityDef } from './data.ts';
import { cellAt, inBounds, edgeWall, edgeOf, getWall, isIndoorFloor, isDoor, DIRS, type Side4 } from './world.ts';

export type RoomKind = 'hall' | 'bar' | 'kitchen' | 'restroom' | 'staff' | 'storage' | 'empty';
export const ROOM_KO: Record<RoomKind, string> = { hall: '홀', bar: '바', kitchen: '주방', restroom: '화장실', staff: '직원실', storage: '창고', empty: '빈 방' };
export const ROOM_EFFECT: Record<RoomKind, string> = {
  hall: '이 방 자리 인기 +2/★ · 요금 +₩100/★',
  bar: '이 방 제조대가 ★마다 5% 빠름',
  kitchen: '이 방 제조대가 ★마다 7% 빠름',
  restroom: '모든 손님 점수 +★',
  staff: '직원 월급 ★마다 −2%',
  storage: '유지비 ★마다 −3%',
  empty: '시설을 놓으면 종류가 정해진다',
};

/** 바닥 품격 (칸마다) */
export const FLOOR_GRADE: Record<string, number> = { wood: 1, brick: 2, tile: 2, stone: 3, deck: 3 };
/** 벽 품격 (변마다) */
export const WALL_GRADE: Record<string, number> = { railing: 0, door_wood: 1, wall_wood: 1, wall: 2, wall_plaster: 2, wall_brick: 3, wall_window: 3, wall_glass: 4 };
/** 종류마다 알맞은 칸 수 */
export const ROOM_FIT: Record<RoomKind, [number, number]> = { hall: [6, 28], bar: [2, 9], kitchen: [2, 9], restroom: [1, 4], staff: [2, 9], storage: [1, 6], empty: [1, 999] };
export const COMFORT_IN_ROOM = 12;   // 방 안 아늑함 상한

export interface Room {
  id: string; kind: RoomKind; name: string;
  cells: Pt[]; facilities: string[]; size: number;
  floor: number; wall: number; comfort: number; fit: number; tidy: number; off: number;   // 점수 조각
  score: number; stars: number;
  doors: number;                      // 올렛길로 난 문
  tip: string | null;                 // 별을 더 올리려면
}

/** 이 방의 종류를 정한다 — 안에 든 것이 말해 준다 */
function kindOf(defs: FacilityDef[]): RoomKind {
  const am = new Set(defs.map((d) => d.amenity).filter(Boolean) as string[]);
  const seats = defs.filter((d) => d.tab === 'seat').length;
  const stations = defs.filter((d) => !!d.station).length;
  if (seats > 0) return 'hall';
  if (am.has('restroom')) return 'restroom';
  if (am.has('kitchen') || defs.some((d) => d.station === 'food')) return 'kitchen';
  if (stations > 0) return 'bar';
  if (am.has('staff') || am.has('locker')) return 'staff';
  if (am.has('storage') || am.has('cleaning')) return 'storage';
  return 'empty';
}
/** 그 종류에 안 어울리는 시설 (섞으면 점수가 깎인다) */
function offKind(kind: RoomKind, d: FacilityDef): boolean {
  if (kind === 'hall') return !!d.station || (!!d.amenity && d.amenity !== 'counter');
  if (kind === 'bar' || kind === 'kitchen') return d.tab === 'seat' || (!!d.amenity && d.amenity !== 'counter' && d.amenity !== 'kitchen');
  if (kind === 'restroom' || kind === 'staff' || kind === 'storage') return d.tab === 'seat' || !!d.station;
  return false;
}

/** DIRS 순서(+x, −x, +y, −y)에 맞춘 변 이름 */
const DIR_SIDE: Side4[] = ['e', 'w', 's', 'n'];
/** 한 덩어리를 방으로 재 본다 */
function measure(s: GameState, cells: Pt[], i: number): Room {
  const inside = new Set(cells.map((p) => p.y * s.grid.w + p.x));
  const fids: string[] = [];
  for (const p of cells) { const o = cellAt(s, p.x, p.y).objectId; if (o && !fids.includes(o)) fids.push(o); }
  const defs = fids.map((id) => facilityDef(s.facilities[id]!.type));
  const kind = kindOf(defs);

  let floorSum = 0;
  for (const p of cells) floorSum += FLOOR_GRADE[cellAt(s, p.x, p.y).floor as string] ?? 0;
  const floor = Math.round((floorSum / cells.length) * 2 * 10) / 10;        // 0~6

  const kinds: string[] = [];
  let doors = 0;
  for (const p of cells) for (let k = 0; k < 4; k++) {
    const v = DIRS[k]!, side = DIR_SIDE[k]!;
    const n = { x: p.x + v.x, y: p.y + v.y };
    if (inside.has(n.y * s.grid.w + n.x)) continue;
    const w = getWall(s, edgeOf(p.x, p.y, side));
    if (w) kinds.push(w); else doors++;
  }
  const wallAvg = kinds.length ? kinds.reduce((a, k) => a + (WALL_GRADE[k] ?? 1), 0) / kinds.length : 0;
  const wall = Math.round(wallAvg * 2 * 10) / 10;                            // 0~8
  const plain = kinds.filter((k) => !isDoor(k));
  const tidy = plain.length > 0 && new Set(plain).size === 1 ? 3 : 0;        // 한 가지 벽으로 깔끔히 마감 (문은 뺀다)

  let comfortSum = 0;
  for (const d of defs) comfortSum += d.comfort ?? 0;
  const comfort = Math.min(COMFORT_IN_ROOM, comfortSum);

  const [lo, hi] = ROOM_FIT[kind];
  const fit = cells.length >= lo && cells.length <= hi ? 4 : cells.length < lo ? 0 : 1;
  const off = defs.filter((d) => offKind(kind, d)).length * -2;

  const score = Math.max(0, floor + wall + comfort / 2 + fit + tidy + off);
  const stars = score >= 21 ? 5 : score >= 16 ? 4 : score >= 11 ? 3 : score >= 6 ? 2 : 1;

  let tip: string | null = null;
  if (off < 0) tip = `${ROOM_KO[kind]}에 안 어울리는 시설 ${-off / 2}개 — 벽으로 가르고 문을 달아 따로 내 주세요`;
  else if (fit === 0) tip = `${lo}칸부터 제값 — 지금 ${cells.length}칸`;
  else if (fit === 1) tip = `${hi}칸까지가 알맞아요 — 지금 ${cells.length}칸`;
  else if (tidy === 0 && kinds.length > 0) tip = '벽을 한 가지로 맞추면 +3';
  else if (wall < 6) tip = '더 좋은 벽으로 두르면 올라가요';
  else if (floor < 5) tip = '더 좋은 바닥을 깔면 올라가요';
  else if (comfort < COMFORT_IN_ROOM) tip = '아늑한 장식을 더 놓아 보세요';

  return { id: `r${i}`, kind, name: `${ROOM_KO[kind]} ${'★'.repeat(stars)}`, cells, facilities: fids, size: cells.length, floor, wall, comfort, fit, tidy, off, score: Math.round(score * 10) / 10, stars, doors, tip };
}

/** 지금 맵의 방 전부 — 벽이 가른 실내 바닥 덩어리 중 바깥으로 새지 않는 것 */
function scan(s: GameState): Room[] {
  const key = (x: number, y: number) => y * s.grid.w + x;
  const seen = new Set<number>();
  const out: Room[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (seen.has(key(x, y))) continue;
    if (!isIndoorFloor(cellAt(s, x, y).floor)) continue;
    const cells: Pt[] = [{ x, y }];
    seen.add(key(x, y));
    let open = false;
    for (let i = 0; i < cells.length; i++) {
      const p = cells[i]!;
      for (const v of DIRS) {
        const n = { x: p.x + v.x, y: p.y + v.y };
        if (edgeWall(s, p, n)) continue;                          // 벽·문이 방을 가른다
        if (!inBounds(s, n.x, n.y)) { open = true; continue; }
        const c = cellAt(s, n.x, n.y);
        if (c.floor === 'path') continue;                         // 올렛길은 문
        if (!isIndoorFloor(c.floor)) { open = true; continue; }   // 잔디·자갈·마을 길로 샌다
        if (seen.has(key(n.x, n.y))) continue;
        seen.add(key(n.x, n.y)); cells.push(n);
      }
    }
    if (!open) out.push(measure(s, cells, out.length));
  }
  return out;
}

const CACHE = new WeakMap<GameState, { rev: number; rooms: Room[]; byFac: Map<string, Room> }>();
function cache(s: GameState) {
  let c = CACHE.get(s);
  if (!c || c.rev !== s.layoutRev) {
    const rooms = scan(s);
    const byFac = new Map<string, Room>();
    for (const r of rooms) for (const id of r.facilities) byFac.set(id, r);
    c = { rev: s.layoutRev, rooms, byFac };
    CACHE.set(s, c);
  }
  return c;
}
export function rooms(s: GameState): Room[] { return cache(s).rooms; }
/** 이 시설이 든 방 */
export function roomOf(s: GameState, fid: string): Room | null { return cache(s).byFac.get(fid) ?? null; }
/** 그 종류의 방들 중 가장 좋은 별 (가게 전체에 걸리는 방) */
export function bestStars(s: GameState, kind: RoomKind): number {
  let n = 0;
  for (const r of rooms(s)) if (r.kind === kind) n = Math.max(n, r.stars);
  return n;
}

/** 자리가 든 방이 주는 인기·요금 */
export const HALL_POP = 2, HALL_FEE = 100;
export function roomPop(s: GameState, fid: string): number { const r = roomOf(s, fid); return r?.kind === 'hall' ? r.stars * HALL_POP : 0; }
export function roomFee(s: GameState, fid: string): number { const r = roomOf(s, fid); return r?.kind === 'hall' ? r.stars * HALL_FEE : 0; }
/** 제조대가 든 방이 주는 속도 (0~0.35) */
export function roomSpeed(s: GameState, fid: string): number {
  const r = roomOf(s, fid);
  if (!r) return 0;
  if (r.kind === 'bar') return r.stars * 0.05;
  if (r.kind === 'kitchen') return r.stars * 0.07;
  return 0;
}

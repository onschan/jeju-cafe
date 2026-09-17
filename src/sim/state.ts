import type { GameState, Cell, PlacedObject, Parcel, Terrain } from './types.ts';
import { INITIAL_UNLOCKED, ROLES } from '../data/index.ts';
import { START_HOUR } from './clock.ts';
import { makeParcels, PARCEL_COLS } from './parcels.ts';
import { nextRandom } from './rng.ts';
import { initGuestTypes, initSegmentPopularity } from './segments.ts';

/** 필지 한 장의 크기. 격자는 처음부터 3×2 필지 전체(30×16)다. */
export const PARCEL_W = 10;
export const PARCEL_H = 8;
export const GRID_W = PARCEL_W * PARCEL_COLS;
export const GRID_H = PARCEL_H * 2;
export const SAVE_VERSION = 7;
/** 시작 자금 500만 + 정착지원금(잔고 < 40만이면 1회 300만) — 마스터 GDD §1 */
export const START_MONEY = 5_000_000;
export const SETTLE_GRANT = 3_000_000;
export const SETTLE_GRANT_THRESHOLD = 400_000;
export const START_MONTH = 3;
export const MENU_SLOT_COUNT = 4;
/** 곶자왈 덤불 개수 */
const GOTJAWAL_BUSHES = 10;

/** 필지 안 상대 좌표 (lx, ly)의 지형. 결정적(seed rng). */
function terrainFor(p: Parcel, lx: number, ly: number, rng: { rng: number }): Terrain {
  const x = p.x + lx;
  const y = p.y + ly;
  // 맵 맨 아랫줄과 윗줄 필지들의 아래 변(마을 길)은 도로. 해안은 먼 변 2줄이 해안 도로.
  if (y === GRID_H - 1 || y === PARCEL_H - 1) return 'road';
  if (p.bonus === 'coast' && ly >= p.h - 2) return 'road';
  switch (p.bonus) {
    case 'oreum':
      // 바위가 많고, 3번째 줄에 바위 능선
      if (ly === 2 && lx >= 2 && lx <= 7) return 'rock';
      return nextRandom(rng) < 0.2 ? 'rock' : 'soil';
    case 'batdam':
    case 'gotjawal':
    case 'coast':
      return 'soil';
    case 'spring':
      return nextRandom(rng) < 0.08 ? 'rock' : 'soil';
    default:
      // 시작 필지: 기존 패턴 유지 (정낭 (4,6)이 바위 칸)
      return (x + y) % 7 === 3 ? 'rock' : 'soil';
  }
}

function makeCells(parcels: Parcel[], seed: number): Cell[] {
  const rng = { rng: seed };
  const cells: Cell[] = Array.from({ length: GRID_W * GRID_H }, () => ({ terrain: 'soil' as Terrain, objectId: null }));
  for (const p of parcels)
    for (let ly = 0; ly < p.h; ly++)
      for (let lx = 0; lx < p.w; lx++) cells[(p.y + ly) * GRID_W + (p.x + lx)] = { terrain: terrainFor(p, lx, ly, rng), objectId: null };
  return cells;
}

/** 시작 오브젝트를 격자에 직접 새긴다 (규칙 검사 없이). 이미 뭔가 있으면 건너뛰고 null. */
function stamp(state: GameState, type: string, x: number, y: number, w: number, h: number): PlacedObject | null {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) if (state.grid.cells[(y + dy) * state.grid.w + (x + dx)]!.objectId) return null;
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, crop: null };
  state.objects[id] = obj;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) state.grid.cells[(y + dy) * state.grid.w + (x + dx)]!.objectId = id;
  return obj;
}

/** 필지별 시작 오브젝트: 곶자왈 덤불, 밭담 돌담, 용천수 샘. 결정적(seed rng). */
function stampParcelObjects(state: GameState, p: Parcel, rng: { rng: number }): void {
  const soil = (lx: number, ly: number) => state.grid.cells[(p.y + ly) * state.grid.w + (p.x + lx)]!.terrain === 'soil';
  switch (p.bonus) {
    case 'gotjawal':
      for (let i = 0; i < GOTJAWAL_BUSHES; i++) {
        const lx = Math.floor(nextRandom(rng) * p.w);
        const ly = Math.floor(nextRandom(rng) * (p.h - 1));
        if (soil(lx, ly)) stamp(state, 'bush_wild', p.x + lx, p.y + ly, 1, 1);
      }
      break;
    case 'batdam':
      // 가로 돌담 두 줄 (밭담 골짜기)
      for (const [ly, xs] of [[2, [1, 2, 3, 4, 6, 7, 8]], [5, [1, 2, 3, 5, 6, 7, 8]]] as const)
        for (const lx of xs) if (soil(lx, ly)) stamp(state, 'stonewall', p.x + lx, p.y + ly, 1, 1);
      break;
    case 'spring':
      stamp(state, 'spring', p.x + 4, p.y + 3, 2, 1);
      break;
  }
}

export function createInitialState(seed: number, playerId = 'local', createdAt = 0): GameState {
  const parcels = makeParcels();
  const state: GameState = {
    version: SAVE_VERSION,
    playerId,
    createdAt,
    seed,
    rng: seed,
    clock: { day: 1, month: START_MONTH, year: 1, hour: START_HOUR, accMs: 0, carryMs: 0, speed: 1 },
    money: START_MONEY,
    research: 0,
    popularity: 0,
    grid: { w: GRID_W, h: GRID_H, cells: makeCells(parcels, seed) },
    parcels,
    settleGrantUsed: false,
    objects: {},
    storage: {},
    menuSlots: Array(MENU_SLOT_COUNT).fill(null),
    unlockedIndex: 0,
    unlocked: {
      objects: [...INITIAL_UNLOCKED.objects],
      menus: [...INITIAL_UNLOCKED.menus],
      crops: [...INITIAL_UNLOCKED.crops],
      roles: ROLES.filter((r) => r.unlockedAtStart).map((r) => r.id),
    },
    staff: [],
    candidates: [],
    slots: { barista: 1, cook: 1, hall: 2, field: 1, carry: 0, guide: 0 },
    activePromotions: [],
    youtuberBoostMonths: 0,
    segmentPopularity: initSegmentPopularity(),
    targetSegment: null,
    targets: [],
    guestTypes: initGuestTypes(),
    visitBonus: {},
    tickets: 0,
    mileage: 0,
    rank: 1,
    star: 1,
    board: { quests: {}, events: [] },
    spots: {},
    effects: [],
    menuSold: {},
    codex: { combos: [], sets: [] },
    inventory: {},
    itemBonus: {},
    notices: [],
    guests: [],
    spawnAcc: 0,
    nextId: 1,
    monthIncome: 0,
    monthGuests: 0,
    monthCosts: { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0 },
    lastMonthCard: null,
    tick: 0,
    actionLog: [],
  };
  // 시작 필지(1번, 왼쪽 위): 정류장은 필지 아래 변의 마을 길에
  stamp(state, 'busstop', 0, PARCEL_H - 1, 1, 1);
  stamp(state, 'warehouse', 3, 1, 3, 2);
  stamp(state, 'gate', 4, PARCEL_H - 2, 1, 1); // 정낭 칸은 gate kind라 걷기 가능(path.ts)
  const rng = { rng: seed ^ 0x5eed };
  for (const p of parcels) stampParcelObjects(state, p, rng);
  return state;
}

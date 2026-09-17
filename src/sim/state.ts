import type { GameState, Cell, PlacedObject, Parcel, Terrain } from './types.ts';
import { INITIAL_UNLOCKED, ROLES, FACILITY_START_IDS, objectDef, cropDef } from '../data/index.ts';
import { START_HOUR } from './clock.ts';
import { makeParcels } from './parcels.ts';
import { PARCEL_W, PARCEL_H, START_ORIGIN, GRID_W, GRID_H, VILLAGE_ROAD_Y } from './layout.ts';
import { occupy } from './grid.ts';
import { nextRandom } from './rng.ts';
import { initGuestTypes, initSegmentPopularity } from './segments.ts';
import { DEFAULT_CAFE_NAME } from './cafe.ts';
import { START_BUILDERS } from './build.ts';

export { PARCEL_W, PARCEL_H, START_ORIGIN, GRID_W, GRID_H, VILLAGE_ROAD_Y };
export const SAVE_VERSION = 11;
/** 시작 자금 500만 + 정착지원금(잔고 < 40만이면 1회 300만) — 마스터 GDD §1 */
export const START_MONEY = 5_000_000;
export const SETTLE_GRANT = 3_000_000;
export const SETTLE_GRANT_THRESHOLD = 400_000;
export const START_MONTH = 3;
export const MENU_SLOT_COUNT = 4;
/** 곶자왈 덤불 개수 */
const GOTJAWAL_BUSHES = 10;
/** 옛 감귤밭의 감귤나무 위치 (필지 상대) */
const ORCHARD_TREES = [{ lx: 2, ly: 2 }, { lx: 6, ly: 2 }, { lx: 2, ly: 5 }, { lx: 6, ly: 5 }];

/** 필지 안 상대 좌표 (lx, ly)의 지형. 결정적(seed rng). */
function terrainFor(p: Parcel, lx: number, ly: number, rng: { rng: number }): Terrain {
  const y = p.y + ly;
  // 마을 길(가운데 줄 아래 변)은 맵 가로 전체 도로. 해안은 먼 변 2줄이 해안 도로. 마을 어귀는 오른쪽 변이 마을로 나가는 길.
  if (y === VILLAGE_ROAD_Y) return 'road';
  if (p.bonus === 'coast' && ly >= p.h - 2) return 'road';
  if (p.bonus === 'village' && lx === p.w - 1) return 'road';
  switch (p.bonus) {
    case 'oreum':
      // 바위가 많고, 3번째 줄에 큰 바위 능선(치우는 데 100만)
      if (ly === 2 && lx >= 2 && lx <= 7) return 'rock_big';
      return nextRandom(rng) < 0.2 ? 'rock' : 'soil';
    case 'stonehill':
      return nextRandom(rng) < 0.15 ? 'rock' : 'soil';
    case 'spring':
      return nextRandom(rng) < 0.08 ? 'rock' : 'soil';
    case 'none':
      // 시작 필지: 필지 상대 패턴 (정낭 (4,6)이 바위 칸)
      return (lx + ly) % 7 === 3 ? 'rock' : 'soil';
    default:
      return 'soil';
  }
}

function makeCells(parcels: Parcel[], seed: number): Cell[] {
  const rng = { rng: seed };
  const cells: Cell[] = Array.from({ length: GRID_W * GRID_H }, () => ({ terrain: 'soil' as Terrain, objectId: null, roomId: null }));
  for (const p of parcels)
    for (let ly = 0; ly < p.h; ly++)
      for (let lx = 0; lx < p.w; lx++) cells[(p.y + ly) * GRID_W + (p.x + lx)] = { terrain: terrainFor(p, lx, ly, rng), objectId: null, roomId: null };
  return cells;
}

/** 시작 오브젝트를 격자에 직접 새긴다 (규칙 검사 없이). 이미 뭔가 있으면 건너뛰고 null. */
function stamp(state: GameState, type: string, x: number, y: number): PlacedObject | null {
  const def = objectDef(type);
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) if (state.grid.cells[(y + dy) * state.grid.w + (x + dx)]!.objectId) return null;
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, crop: null };
  if (def.kind === 'tree' && def.cropId) obj.crop = { cropId: def.cropId, daysGrown: 0, ready: false, harvestedYear: -1 };
  state.objects[id] = obj;
  occupy(state, obj);
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
        if (soil(lx, ly)) stamp(state, 'bush_wild', p.x + lx, p.y + ly);
      }
      break;
    case 'batdam':
      // 가로 돌담 두 줄 (밭담 골짜기)
      for (const [ly, xs] of [[2, [1, 2, 3, 4, 6, 7, 8]], [5, [1, 2, 3, 5, 6, 7, 8]]] as const)
        for (const lx of xs) if (soil(lx, ly)) stamp(state, 'stonewall', p.x + lx, p.y + ly);
      break;
    case 'stonehill':
      // 언덕을 따라 비스듬한 돌담 한 줄
      for (let lx = 1; lx <= 8; lx++) if (lx !== 4 && lx !== 5) stamp(state, 'stonewall', p.x + lx, p.y + 3); // 돌담은 바위 위에도 선다
      break;
    case 'orchard':
      // 옛 감귤밭: 다 자란 나무 4그루 (사면 그해 수확 철부터 열린다)
      for (const t of ORCHARD_TREES) {
        const tree = soil(t.lx, t.ly) ? stamp(state, 'tangerine_tree', p.x + t.lx, p.y + t.ly) : null;
        if (tree?.crop) tree.crop.daysGrown = cropDef(tree.crop.cropId).growDays;
      }
      break;
    case 'spring':
      stamp(state, 'spring', p.x + 4, p.y + 3);
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
      objects: [...INITIAL_UNLOCKED.objects, ...FACILITY_START_IDS],
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
    builders: START_BUILDERS,
    uniform: null,
    uniforms: [],
    uniformPieces: 0,
    freeDrawMonth: START_MONTH - 1, // 첫 달(monthIndex) 무료 추첨 1회
    lastDraw: null,
    freeRecruits: 0,
    codexMileage: 0,
    board: { quests: {}, events: [] },
    spots: {},
    effects: [],
    menuSold: {},
    codex: { combos: [], sets: [], recipes: [], ingredientCombos: [] },
    customMenus: [],
    menuMods: {},
    developing: null,
    lastDevelop: null,
    inventory: {},
    itemBonus: {},
    notices: [],
    fx: [],
    cafeName: DEFAULT_CAFE_NAME,
    totalIncome: 0,
    expansions: [],
    cosmetics: { wallColor: 0, sign: '' },
    praised: {},
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
  // 시작 필지(1번, 정중앙): 정류장은 필지 아래 변의 마을 길에 (첫날부터 손님이 온다)
  const { x: ox, y: oy } = START_ORIGIN;
  stamp(state, 'busstop', ox, oy + PARCEL_H - 1);
  stamp(state, 'warehouse', ox + 3, oy + 1); // 문 = 정면 왼쪽 (ox+3, oy+2), 그 앞 (ox+3, oy+3)이 창고 앞
  stamp(state, 'gate', ox + 4, oy + PARCEL_H - 2); // 정낭 칸은 gate kind라 걷기 가능(path.ts)
  const rng = { rng: seed ^ 0x5eed };
  for (const p of parcels) stampParcelObjects(state, p, rng);
  return state;
}

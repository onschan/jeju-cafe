import type { GameState, Cell, PlacedObject } from './types.ts';
import { INITIAL_UNLOCKED } from '../data/index.ts';
import { START_HOUR } from './clock.ts';

export const GRID_W = 10;
export const GRID_H = 8;
export const SAVE_VERSION = 2;
export const START_MONEY = 30000;
export const START_MONTH = 3;
export const MENU_SLOT_COUNT = 4;

function makeCells(): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const terrain = y === GRID_H - 1 ? 'road' : (x + y) % 7 === 3 ? 'rock' : 'soil';
      cells.push({ terrain, objectId: null });
    }
  }
  return cells;
}

/** 시작 오브젝트를 격자에 직접 새긴다 (규칙 검사 없이). */
function stamp(state: GameState, type: string, x: number, y: number, w: number, h: number) {
  const id = `o${state.nextId++}`;
  const obj: PlacedObject = { id, type, x, y, crop: null };
  state.objects[id] = obj;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) state.grid.cells[(y + dy) * state.grid.w + (x + dx)]!.objectId = id;
  return obj;
}

export function createInitialState(seed: number, playerId = 'local', createdAt = 0): GameState {
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
    grid: { w: GRID_W, h: GRID_H, cells: makeCells() },
    objects: {},
    storage: {},
    menuSlots: Array(MENU_SLOT_COUNT).fill(null),
    unlockedIndex: 0,
    unlocked: {
      objects: [...INITIAL_UNLOCKED.objects],
      menus: [...INITIAL_UNLOCKED.menus],
      crops: [...INITIAL_UNLOCKED.crops],
      roles: ['barista', 'cook', 'hall', 'field'],
    },
    staff: [],
    candidates: [],
    slots: { barista: 1, cook: 1, hall: 2, field: 1, gather: 0, carry: 0, guide: 0 },
    activePromotions: [],
    youtuberBoostMonths: 0,
    segmentPopularity: { local: 30, tourist: 20 },
    notices: [],
    guests: [],
    nextId: 1,
    monthIncome: 0,
    monthGuests: 0,
    monthCosts: { ingredients: 0, salary: 0, ads: 0, upkeep: 0 },
    lastMonthCard: null,
    tick: 0,
    actionLog: [],
  };
  stamp(state, 'busstop', 0, GRID_H - 1, 1, 1);
  stamp(state, 'warehouse', 3, 1, 3, 2);
  stamp(state, 'gate', 4, GRID_H - 2, 1, 1); // 정낭 칸은 gate kind라 걷기 가능(path.ts)
  return state;
}

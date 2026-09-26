import type { GameState } from './types.ts';
import { newClock } from './clock.ts';
import { makeCells, makeParcels, HOME, BUS_STOP } from './world.ts';
import { FACILITIES, MENUS, GUEST_TYPES } from './data.ts';
import { noteStartUnlocked } from './objectives.ts';
import { refreshCandidates } from './staff.ts';
import { layFloor } from './world.ts';
import { placeFacility } from './facility.ts';

export const SAVE_VERSION = 100; // 새 코어 (specs/2026-09-27-rebuild-kairo-core.md)
export const START_MONEY = 3_000_000;

/** 새 게임: 잔디 마당 + 정류장에서 마당 가운데까지 올렛길 + 데크 몇 칸 + 테이블 하나. 손님은 첫날부터 온다. */
export function newGame(seed: number): GameState {
  const s: GameState = {
    version: SAVE_VERSION, seed, rng: seed | 0, tick: 0,
    clock: newClock(),
    money: START_MONEY, research: 0, fame: 0,
    grid: { w: 36, h: 30, cells: makeCells() },
    parcels: makeParcels(),
    facilities: {}, layoutRev: 0, nextId: 1,
    guests: [], guestSeq: 0, spawnAcc: 0.5, todayGuests: 0,
    staff: [], candidates: [], candidatesMonth: -1,
    unlocked: { facilities: FACILITIES.filter((d) => d.unlock === 0).map((d) => d.id), menus: MENUS.filter((d) => d.unlock === 0).map((d) => d.id), guests: GUEST_TYPES.filter((d) => d.unlock === 0).map((d) => d.id) },
    menu: MENUS.filter((d) => d.unlock === 0).map((d) => d.id),
    target: null, invested: [], objectivesDone: [],
    receipts: [], receiptSeq: 0, fx: [],
    loan: { balance: 0, count: 0, lastYear: 0 },
    evaluations: [],
    month: { income: 0, spent: 0, guests: 0 }, lastMonth: null,
    stats: { guests: 0, happy: 0, angry: 0, income: 0, turnedAway: 0 },
    log: [],
  };
  // 정류장(길 위) → 마당 가운데로 올렛길 5칸, 그 끝에 데크 3×2, 데크 위에 테이블 하나
  const cx = HOME.x + 4;
  for (let y = BUS_STOP.y - 1; y >= HOME.y + 5; y--) layFloor(s, 'path', cx, y);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) layFloor(s, 'wood', cx + dx, HOME.y + 3 + dy);
  placeFacility(s, 'table_out', cx + 1, HOME.y + 3);
  noteStartUnlocked(s);
  refreshCandidates(s);
  return s;
}

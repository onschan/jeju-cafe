import type { GameState } from './types.ts';
import { newClock } from './clock.ts';
import { makeCells, makeParcels, HOME, BUS_STOP, wallRect, canPlace } from './world.ts';
import { FACILITIES, MENUS, GUEST_TYPES } from './data.ts';
import { noteStartUnlocked } from './objectives.ts';
import { layFloor } from './world.ts';
import { placeFacility } from './facility.ts';

export const SAVE_VERSION = 100; // 새 코어 (specs/2026-09-27-rebuild-kairo-core.md)
export const START_MONEY = 3_000_000;

/** 새 게임: 잔디 마당 + 정류장에서 마당 가운데까지 올렛길 + 데크 몇 칸 + 테이블 하나. 손님은 첫날부터 온다. */
export type Preset = 'blank' | 'starter' | 'tutorial';
export function newGame(seed: number, preset: Preset = 'blank'): GameState {
  const s: GameState = {
    version: SAVE_VERSION, cafeName: '우리 카페', seed, rng: seed | 0, tick: 0,
    clock: newClock(),
    money: START_MONEY, research: 0, fame: 0,
    grid: { w: 36, h: 30, cells: makeCells() },
    parcels: makeParcels(),
    facilities: {}, layoutRev: 0, nextId: 1,
    guests: [], guestSeq: 0, spawnAcc: 0.5, todayGuests: 0, todayIncome: 0, lastDay: null, orders: [], orderSeq: 0,
    staff: [], candidates: [], candidatesMonth: -1, hiring: null,
    unlocked: { facilities: FACILITIES.filter((d) => d.unlock === 0).map((d) => d.id), menus: MENUS.filter((d) => d.unlock === 0).map((d) => d.id), guests: GUEST_TYPES.filter((d) => d.unlock === 0).map((d) => d.id) },
    menu: MENUS.filter((d) => d.unlock === 0).map((d) => d.id),
    target: null, invested: [], objectivesDone: [], hints: [], tutorial: preset === 'tutorial' ? 0 : -1,
    receipts: [], receiptSeq: 0, fx: [],
    loan: { balance: 0, count: 0, lastYear: 0 },
    evaluations: [],
    month: { income: 0, spent: 0, guests: 0, happy: 0, fame0: 0 }, lastMonth: null,
    stats: { guests: 0, happy: 0, angry: 0, income: 0, turnedAway: 0 },
    log: [],
  };
  // 정류장(길 위) → 마당 가운데로 올렛길 5칸, 그 끝에 데크 3×2, 데크 위에 테이블 하나
  const cx = HOME.x + 4;
  for (let y = BUS_STOP.y - 1; y >= HOME.y + 5; y--) layFloor(s, 'path', cx, y);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) layFloor(s, 'wood', cx + dx, HOME.y + 3 + dy);
  placeFacility(s, 'table_out', cx + 1, HOME.y + 3);
  if (preset === 'starter') {
    // 기초 세팅: 장사가 바로 되는 한 벌 — 데크 6×4를 벽으로 두르고 자리 셋 · 카운터 · 제조대 · 나무 · 꽃
    const y0 = HOME.y + 2;
    for (let dy = 0; dy < 4; dy++) for (let dx = -1; dx < 5; dx++) layFloor(s, 'wood', cx + dx, y0 + dy);
    for (let y = BUS_STOP.y - 1; y >= y0 + 3; y--) layFloor(s, 'path', cx, y);   // 문이 되는 올렛길
    wallRect(s, 'wall_wood', { x: cx - 1, y: y0 }, { x: cx + 4, y: y0 + 3 });
    const put = (id: string, x: number, y: number) => { if (canPlace(s, id, x, y).ok) placeFacility(s, id, x, y); };
    put('table_out', cx - 1, y0); put('table_out', cx + 1, y0); put('table_out', cx + 3, y0);
    put('counter', cx + 3, y0 + 2);     // 2×2
    put('prep_bar', cx - 1, y0 + 2);
    put('tangerine_tree', cx + 6, y0 + 1); put('flower_bed', cx - 3, y0 + 2);
  }
  noteStartUnlocked(s);
  return s;
}

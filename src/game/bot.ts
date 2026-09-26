/** 헤드리스 봇: 사람처럼 한 달에 몇 번 판단한다 — 바닥을 늘리고, 자리·환경·가게를 놓고, 연구로 열고, 직원을 뽑고, 땅을 사고, 투자한다. 결정적. */
import type { GameState, Pt } from './types.ts';
import { apply } from './actions.ts';
import { FACILITIES, facilityDef } from './data.ts';
import { canPlace, cellAt, HOME, PARCEL_W, PARCEL_H, inBounds, owned } from './world.ts';
import { unlockables } from './research.ts';
import { INVESTS } from './data.ts';
import { step } from './tick.ts';
import { DAY_MS } from './clock.ts';
import { usables } from './facility.ts';

const RESERVE = 1_000_000;
function tryPlace(s: GameState, id: string): boolean {
  const d = facilityDef(id);
  if (!s.unlocked.facilities.includes(id) || s.money - d.cost < RESERVE) return false;
  // 내 땅을 위에서 아래로 훑어 첫 놓을 수 있는 칸 (자리·가게는 바닥 위, 환경은 잔디)
  for (const p of s.parcels) {
    if (!p.owned) continue;
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      if (!canPlace(s, id, x, y).ok) continue;
      // 자리·가게는 걷는 칸(올렛길·바닥) 옆이어야 하고, 환경은 자리 곁(경치가 닿게)
      if (d.tab === 'env' && d.sub !== 'deco' && !nearUsable(s, x, y)) continue;
      return apply(s, { type: 'place', id, x, y }).ok;
    }
  }
  return false;
}
function nearUsable(s: GameState, x: number, y: number): boolean {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const c = inBounds(s, x + dx, y + dy) ? cellAt(s, x + dx, y + dy) : null; if (c?.objectId && facilityDef(s.facilities[c.objectId]!.type).tab !== 'env') return true; }
  return false;
}
/** 데크를 한 줄 더 깐다: 기존 바닥에 붙여 오른쪽 또는 아래로 */
function extendFloor(s: GameState): boolean {
  if (s.money < 300_000 + RESERVE) return false;
  const cells: Pt[] = [];
  for (const p of s.parcels) if (p.owned) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (cellAt(s, x, y).floor && cellAt(s, x, y).floor !== 'path') cells.push({ x, y });
  if (cells.length === 0) return false;
  const maxX = Math.max(...cells.map((c) => c.x)), minY = Math.min(...cells.map((c) => c.y)), maxY = Math.max(...cells.map((c) => c.y)), minX = Math.min(...cells.map((c) => c.x));
  const tries: [Pt, Pt][] = [[{ x: maxX + 1, y: minY }, { x: maxX + 1, y: maxY }], [{ x: minX, y: maxY + 1 }, { x: maxX, y: maxY + 1 }], [{ x: minX - 1, y: minY }, { x: minX - 1, y: maxY }], [{ x: minX, y: minY - 1 }, { x: maxX, y: minY - 1 }]];
  for (const [a, b] of tries) if (owned(s, a.x, a.y) && owned(s, b.x, b.y) && apply(s, { type: 'placeLine', id: 'floor_wood', from: a, to: b }).ok) return true;
  return false;
}
export function monthlyPlan(s: GameState): void {
  // 자리 수 = 바닥 칸의 1/3까지, 부족하면 바닥부터
  const floorCells = s.grid.cells.filter((c) => c.floor && c.floor !== 'path').length;
  if (usables(s).length * 3 >= floorCells) extendFloor(s);
  // 연구: 싼 것부터 하나
  for (const u of unlockables(s)) if (!u.done && s.research >= u.cost) { apply(s, { type: 'unlock', id: u.id }); break; }
  // 자리 2, 가게 1, 환경 2
  const seats = FACILITIES.filter((d) => d.tab === 'seat' && s.unlocked.facilities.includes(d.id)).sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  const shops = FACILITIES.filter((d) => d.tab === 'shop' && s.unlocked.facilities.includes(d.id)).sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  const envs = FACILITIES.filter((d) => d.tab === 'env' && d.sub !== 'floor' && s.unlocked.facilities.includes(d.id)).sort((a, b) => (b.scenery ?? 0) - (a.scenery ?? 0));
  let n = 0; for (const d of seats) { if (n >= 2) break; if (tryPlace(s, d.id)) n++; }
  if (usables(s).filter((f) => facilityDef(f.type).tab === 'shop').length < Math.floor(usables(s).length / 4) + 1) for (const d of shops) if (tryPlace(s, d.id)) break;
  n = 0; for (const d of envs) { if (n >= 2) break; if (tryPlace(s, d.id)) n++; }
  // 직원: 자리 4개마다 1명
  if (s.staff.length < Math.min(6, Math.floor(usables(s).length / 4)) && s.candidates[0] && s.money > s.candidates[0].wage * 3 + RESERVE) apply(s, { type: 'hire', candidateId: [...s.candidates].sort((a, b) => b.service - a.service)[0]!.id });
  // 광고 타깃: 지갑 큰 열린 손님층
  const best = [...s.unlocked.guests].sort((a, b) => b.localeCompare(a))[0] ?? null; void best;
  // 땅: 여유가 크면 하나 (마당이 꽉 찼을 때)
  const p = s.parcels.find((x) => !x.owned && x.price + RESERVE * 3 < s.money);
  if (p && floorCells > PARCEL_W * PARCEL_H * 0.5) apply(s, { type: 'buyParcel', id: p.id });
  // 투자: 싼 것부터
  for (const i of INVESTS) if (!s.invested.includes(i.id) && s.money > i.cost + RESERVE * 3) { apply(s, { type: 'invest', id: i.id }); break; }
  // 메뉴는 열린 것 전부(5칸)
  for (const m of s.unlocked.menus) if (!s.menu.includes(m)) apply(s, { type: 'setMenu', menuId: m, on: true });
}
export interface BotRow { year: number; month: number; money: number; fame: number; research: number; guests: number; income: number; facilities: number; staff: number; rank: number | null }
export function runBot(years: number, seed: number, newGame: (seed: number) => GameState): BotRow[] {
  const s = newGame(seed);
  const rows: BotRow[] = [];
  let lastMonth = -1;
  for (let d = 0; d < years * 12 * 30; d++) {
    if (s.clock.month !== lastMonth) { lastMonth = s.clock.month; monthlyPlan(s); }
    for (let t = 0; t < DAY_MS; t += 100) step(s, 100);
    if (s.clock.day === 1 && s.lastMonth) rows.push({ year: s.clock.year, month: s.clock.month, money: s.money, fame: s.fame, research: s.research, guests: s.lastMonth.guests, income: s.lastMonth.income, facilities: Object.keys(s.facilities).length, staff: s.staff.length, rank: s.evaluations.at(-1)?.rank ?? null });
  }
  void HOME;
  return rows;
}

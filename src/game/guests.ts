/** 손님: 정류장에서 걸어 들어와 가장 마음에 드는 빈 시설을 쓰고, 돈을 내고, 영수증 한 줄을 남기고 나간다. */
import type { GameState, Guest, Facility, Mood, Pt } from './types.ts';
import { GUEST_TYPES, guestTypeDef, facilityDef, menuDef, INVESTS } from './data.ts';
import { nextRandom, pickWeighted, randInt } from './rng.ts';
import { HOUR_MS } from './clock.ts';
import { sheetOf, usables, approachCell, seatCapacity, popularitySum } from './facility.ts';
import { busReach, pathTo } from './path.ts';
import { BUS_STOP } from './world.ts';

export const BASE_DAILY_GUESTS = 3;
export const POP_PER_GUEST = 40;
/** 명성은 매일 이만큼 식는다 — 그래야 손님이 눈덩이처럼 안 불고, 놓은 것으로 명성을 「유지」해야 한다 */
export const FAME_DECAY = 0.97;
export const GUESTS_PER_SEAT = 4;
export const WALK_CELLS_PER_S = 3;
export const SEAT_USE_MS = HOUR_MS * 1.5;
export const SHOP_USE_MS = HOUR_MS * 0.5;
export const MAX_GUESTS = 40;
/** 시간대 비중 (6~23시) — 낮 12·13시가 가장 많다 */
const HOUR_SHARE = [2, 3, 4, 6, 8, 9, 10, 10, 8, 7, 6, 6, 6, 5, 4, 3, 2, 1];

export function fameOf(s: GameState): number { return s.fame; }
export function dailyGuests(s: GameState): number {
  const cap = seatCapacity(s) * GUESTS_PER_SEAT;
  const invest = INVESTS.filter((i) => s.invested.includes(i.id)).reduce((n, i) => n + (i.guests ?? 0), 0);
  const n = BASE_DAILY_GUESTS + Math.floor(popularitySum(s) / POP_PER_GUEST) + Math.floor(Math.sqrt(Math.max(0, s.fame)) * 0.7) + invest;
  return Math.max(0, Math.min(cap, n));
}
export function typeWeight(s: GameState, typeId: string): number {
  const d = guestTypeDef(typeId);
  if (!s.unlocked.guests.includes(typeId)) return 0;
  let w = d.weight > 0 ? d.weight : 15;
  if (s.target === typeId) w *= 2;
  for (const i of INVESTS) if (s.invested.includes(i.id) && i.typeMult?.[typeId]) w *= i.typeMult[typeId]!;
  return w;
}
function freeSlots(s: GameState, f: Facility): number {
  const cap = facilityDef(f.type).capacity ?? 1;
  return cap - s.guests.filter((g) => g.target === f.id && g.phase !== 'out').length;
}
/** 이 손님층이 이 시설을 얼마나 마음에 들어 하나 — 손익계산서 합계 + 좋아하는 시설이면 +10 */
export function appeal(s: GameState, f: Facility, typeId: string): number {
  const sh = sheetOf(s, f);
  return sh.total + (sh.likedBy.includes(typeId) ? 10 : 0);
}
/** 매 시간: 하루 몫을 시간대 비중으로 나눠 소수 누적, 정수만큼 스폰 */
export function hourlySpawn(s: GameState): number {
  const h = s.clock.hour - 6;
  const share = (HOUR_SHARE[h] ?? 0) / HOUR_SHARE.reduce((a, b) => a + b, 0);
  s.spawnAcc += dailyGuests(s) * share;
  let n = 0;
  while (s.spawnAcc >= 1) { s.spawnAcc -= 1; if (spawnOne(s)) n++; }
  return n;
}
export function spawnOne(s: GameState): boolean {
  if (s.guests.length >= MAX_GUESTS) return false;
  const type = pickWeighted(s, GUEST_TYPES, (t) => typeWeight(s, t.id));
  if (!type) return false;
  const reach = busReach(s);
  // 빈 시설 중 마음에 드는 순 (같은 값이면 가까운 순 — 결정적)
  const cands = usables(s).filter((f) => freeSlots(s, f) > 0).map((f) => ({ f, ap: approachCell(s, f) })).filter((c) => c.ap && reach.dist.has(c.ap.y * s.grid.w + c.ap.x));
  if (cands.length === 0) { s.stats.turnedAway++; return false; } // 자리 없음 — 돌아간다 (「만실」)
  cands.sort((a, b) => appeal(s, b.f, type.id) - appeal(s, a.f, type.id) || reach.dist.get(a.ap!.y * s.grid.w + a.ap!.x)! - reach.dist.get(b.ap!.y * s.grid.w + b.ap!.x)!);
  const pick = cands[Math.min(cands.length - 1, Math.floor(nextRandom(s) * Math.min(2, cands.length)))]!; // 1·2위 중 하나
  const path = pathTo(s, reach, pick.ap!)!;
  const g: Guest = {
    id: `g${s.guestSeq++}`, type: type.id, phase: 'in', x: BUS_STOP.x, y: BUS_STOP.y, path,
    target: pick.f.id, approach: pick.ap, timerMs: 0, mood: null,
    face: { hair: randInt(s, 0, 7), skin: randInt(s, 0, 2), top: randInt(s, 0, 7) },
  };
  s.guests.push(g);
  return true;
}
function moveAlong(g: Guest, ms: number): boolean {
  let budget = (ms / 1000) * WALK_CELLS_PER_S;
  while (budget > 0 && g.path.length > 0) {
    const next = g.path[0]!;
    const dx = next.x - g.x, dy = next.y - g.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist <= budget) { g.x = next.x; g.y = next.y; g.path.shift(); budget -= dist; }
    else { g.x += (dx / dist) * budget; g.y += (dy / dist) * budget; budget = 0; }
  }
  return g.path.length === 0;
}
function serviceBonus(s: GameState): number { return Math.min(30, s.staff.reduce((n, st) => n + st.service, 0) * 2); }
/** 이용을 마친다: 돈 · 명성 · 연구 · 영수증 */
function finishUse(s: GameState, g: Guest): void {
  const f = g.target ? s.facilities[g.target] : null;
  const t = guestTypeDef(g.type);
  let money = 0; let mood: Mood = 'meh';
  if (f) {
    const d = facilityDef(f.type);
    const sh = sheetOf(s, f);
    if (d.tab === 'seat') {
      const offered = s.menu.filter((m) => t.menu.includes(m) && menuDef(m).price <= t.wallet);
      const any = s.menu.filter((m) => menuDef(m).price <= t.wallet);
      const pick = offered[0] ?? any[0] ?? null;
      money = (pick ? menuDef(pick).price : 0) + sh.fee;
    } else money = Math.min(t.wallet, sh.fee);
    const score = sh.total + serviceBonus(s) / 3;
    mood = score >= t.expect ? 'happy' : score >= t.expect - 6 ? 'meh' : 'angry';
    f.uses++; f.sales += money;
  }
  const fame = mood === 'happy' ? 1 : mood === 'angry' ? -1 : 0;
  s.money += money; s.month.income += money; s.stats.income += money;
  s.fame = Math.max(0, s.fame + fame);
  s.research += mood === 'happy' ? 2 : 1;
  s.stats.guests++; s.month.guests++; s.todayGuests++;
  if (mood === 'happy') s.stats.happy++; else if (mood === 'angry') s.stats.angry++;
  g.mood = mood;
  s.receipts.push({ id: s.receiptSeq++, type: g.type, money, fame, mood, at: s.tick });
  if (s.receipts.length > 30) s.receipts.splice(0, s.receipts.length - 30);
  if (money > 0 && f) s.fx.push({ kind: 'money', x: f.x, y: f.y, won: money });
}
export function updateGuests(s: GameState, ms: number): void {
  for (const g of s.guests) {
    if (g.phase === 'in') {
      if (moveAlong(g, ms)) {
        const f = g.target ? s.facilities[g.target] : null;
        if (!f) { g.phase = 'out'; g.path = pathBack(s, g); continue; }
        g.phase = 'use';
        const d = facilityDef(f.type);
        g.timerMs = (d.tab === 'seat' ? SEAT_USE_MS : SHOP_USE_MS) * (1 - serviceBonus(s) / 100);
      }
    } else if (g.phase === 'use') {
      g.timerMs -= ms;
      if (g.timerMs <= 0) { finishUse(s, g); g.phase = 'out'; g.path = pathBack(s, g); }
    } else if (moveAlong(g, ms)) g.target = '__gone';
  }
  s.guests = s.guests.filter((g) => g.target !== '__gone');
}
function pathBack(s: GameState, g: Guest): Pt[] {
  const from = { x: Math.round(g.x), y: Math.round(g.y) };
  const reach = busReach(s);
  const p = pathTo(s, reach, from);
  return p ? p.reverse().slice(1) : [BUS_STOP];
}

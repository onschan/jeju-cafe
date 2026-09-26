/** 시설: 손익계산서 (기본 인기 · 상성 보너스 · 경치 · 합계 / 요금 · 유지비 · 누구에게 인기) + 놓기·치우기 + 상성 UP 묶음 연출 */
import type { GameState, Facility, Pt, ApplyResult } from './types.ts';
import { facilityDef, isFloorDef, isUsable, SYNERGIES, FACILITIES } from './data.ts';
import { canPlace, cellAt, footprint, footOf, inBounds, layFloor, DIRS } from './world.ts';

export const SCENERY_RADIUS = 2;
export const SCENERY_CAP = 20;
export const SYNERGY_POP = 4;      // 상성 짝 하나 = 인기 +4
export const SYNERGY_FEE = 200;    // 상성 짝 하나 = 요금 +200
export const SYNERGY_CAP = 4;      // 짝은 시설당 4개까지
export const LEVEL_POP = 3;        // 시설 Lv당 인기 +3 (연구로 올린다)

export interface Sheet {
  base: number; bonus: number; scenery: number; total: number;
  fee: number; upkeep: number; pairs: { with: string; name: string }[]; likedBy: string[];
}
function cheb(a: Pt[], b: Pt[]): number {
  let best = Infinity;
  for (const p of a) for (const q of b) best = Math.min(best, Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)));
  return best;
}
/** 이 시설과 짝이 되는 이웃(체비쇼프 1) 시설들 — 상성표 a↔b 어느 쪽이든 */
export function synergyPairs(s: GameState, f: Facility): { with: string; name: string }[] {
  const out: { with: string; name: string }[] = [];
  const foot = footOf(s, f.id);
  for (const o of Object.values(s.facilities)) {
    if (o.id === f.id) continue;
    if (cheb(foot, footOf(s, o.id)) > 1) continue;
    for (const sy of SYNERGIES) {
      const ab = sy.a.includes(f.type) && sy.b.includes(o.type);
      const ba = sy.b.includes(f.type) && sy.a.includes(o.type);
      if (ab || ba) { out.push({ with: o.id, name: sy.name }); break; }
    }
    if (out.length >= SYNERGY_CAP) break;
  }
  return out;
}
/** 반경 안 환경·장식의 경치 합 (자리·가게만 받는다) */
export function sceneryAt(s: GameState, f: Facility): number {
  const foot = footOf(s, f.id);
  let n = 0;
  for (const o of Object.values(s.facilities)) {
    if (o.id === f.id) continue;
    const d = facilityDef(o.type);
    if (!d.scenery) continue;
    if (cheb(foot, footOf(s, o.id)) <= SCENERY_RADIUS) n += d.scenery;
  }
  n += (s.invested.includes('flower_field') ? 2 : 0);
  return Math.min(SCENERY_CAP, n);
}
const SHEETS = new WeakMap<GameState, { rev: number; map: Map<string, Sheet>; popSum: number | null }>();
function cache(s: GameState) {
  let c = SHEETS.get(s);
  if (!c || c.rev !== s.layoutRev) { c = { rev: s.layoutRev, map: new Map(), popSum: null }; SHEETS.set(s, c); }
  return c;
}
export function sheetOf(s: GameState, f: Facility): Sheet {
  const c = cache(s);
  const hit = c.map.get(f.id);
  if (hit) return hit;
  const sh = computeSheet(s, f);
  c.map.set(f.id, sh);
  return sh;
}
function computeSheet(s: GameState, f: Facility): Sheet {
  const d = facilityDef(f.type);
  const pairs = synergyPairs(s, f);
  const usable = isUsable(d);
  const base = (d.pop ?? 0) + (usable ? LEVEL_POP * (f.level - 1) : 0);
  const bonus = pairs.length * SYNERGY_POP;
  const scenery = usable ? sceneryAt(s, f) : 0;
  return { base, bonus, scenery, total: base + bonus + scenery, fee: (d.fee ?? 0) + pairs.length * SYNERGY_FEE, upkeep: d.upkeep, pairs, likedBy: d.tags ?? [] };
}
/** 마당의 자리·가게 인기 합 — 하루 손님 수·평가 점수의 뿌리 */
export function popularitySum(s: GameState): number {
  const c = cache(s);
  if (c.popSum !== null) return c.popSum;
  let n = 0;
  for (const f of Object.values(s.facilities)) if (isUsable(facilityDef(f.type))) n += sheetOf(s, f).total;
  c.popSum = n;
  return n;
}
export function usables(s: GameState): Facility[] { return Object.values(s.facilities).filter((f) => isUsable(facilityDef(f.type))); }
export function seatCapacity(s: GameState): number { return usables(s).reduce((n, f) => n + (facilityDef(f.type).capacity ?? 1), 0); }

export function placeFacility(s: GameState, id: string, x: number, y: number): Facility {
  const d = facilityDef(id);
  const f: Facility = { id: `f${s.nextId++}`, type: id, x, y, level: 1, uses: 0, sales: 0 };
  s.facilities[f.id] = f;
  for (const p of footprint(x, y, d.w, d.h)) cellAt(s, p.x, p.y).objectId = f.id;
  s.layoutRev++;
  return f;
}
export function removeFacility(s: GameState, fid: string): ApplyResult {
  const f = s.facilities[fid];
  if (!f) return { ok: false, reason: '없어진 시설이에요' };
  if (s.guests.some((g) => g.target === fid && g.phase !== 'out')) return { ok: false, reason: '손님이 쓰고 있어요' };
  for (const p of footOf(s, fid)) cellAt(s, p.x, p.y).objectId = null;
  delete s.facilities[fid];
  s.layoutRev++;
  return { ok: true };
}
/** 놓기 액션의 본체: 바닥이면 깔고, 시설이면 앉히고, 새로 생긴 상성 짝마다 「상성 UP」을 우르르 띄운다. */
export function placeAndBurst(s: GameState, id: string, x: number, y: number): ApplyResult {
  const c = canPlace(s, id, x, y);
  if (!c.ok) return c;
  const d = facilityDef(id);
  if (s.money < d.cost) return { ok: false, reason: '돈이 모자라요' };
  s.money -= d.cost;
  s.month.spent += d.cost;
  if (isFloorDef(d)) { layFloor(s, d.floor!, x, y); return { ok: true }; }
  const before = new Map(Object.values(s.facilities).map((f) => [f.id, synergyPairs(s, f).length]));
  const f = placeFacility(s, id, x, y);
  let order = 0;
  const mine = synergyPairs(s, f);
  if (mine.length > 0) s.fx.push({ kind: 'synergy', x: f.x, y: f.y, name: mine[0]!.name, order: order++ });
  for (const o of Object.values(s.facilities)) {
    if (o.id === f.id) continue;
    const now = synergyPairs(s, o);
    if (now.length > (before.get(o.id) ?? 0)) s.fx.push({ kind: 'synergy', x: o.x, y: o.y, name: now[now.length - 1]!.name, order: order++ });
  }
  return { ok: true };
}
/** 시설 옆 걷는 칸 하나 (손님이 다가서는 칸) — 없으면 null */
export function approachCell(s: GameState, f: Facility): Pt | null {
  for (const p of footOf(s, f.id)) for (const v of DIRS) {
    const q = { x: p.x + v.x, y: p.y + v.y };
    if (inBounds(s, q.x, q.y) && !cellAt(s, q.x, q.y).objectId && (cellAt(s, q.x, q.y).floor !== null || cellAt(s, q.x, q.y).terrain === 'road')) return q;
  }
  return null;
}
export function catalog(): typeof FACILITIES { return FACILITIES; }

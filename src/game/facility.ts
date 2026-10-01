/** 시설: 손익계산서 (기본 인기 · 상성 보너스 · 경치 · 합계 / 요금 · 유지비 · 누구에게 인기) + 놓기·치우기 + 상성 UP 묶음 연출 */
import type { GameState, Facility, Pt, ApplyResult } from './types.ts';
import { facilityDef, isFloorDef, isUsable, SYNERGIES, FACILITIES } from './data.ts';
import { canPlace, cellAt, footprint, footOf, inBounds, layFloor, DIRS, isEnclosed, wallBetween } from './world.ts';
import { seasonOf } from './clock.ts';
import { dirtyPenalty } from './upkeep.ts';

export const SCENERY_RADIUS = 2;
export const SCENERY_CAP = 20;
export const YARD_CAP = 60;        // 마당 경치 합 상한
export const YARD_PER_GUEST = 6;   // 경치 이만큼마다 하루 손님 +1
export const SYNERGY_POP = 4;      // 상성 짝 하나 = 인기 +4
export const SYNERGY_FEE = 200;    // 상성 짝 하나 = 요금 +200
export const SYNERGY_CAP = 4;      // 짝은 시설당 4개까지
export const LEVEL_POP = 3;        // 시설 Lv당 인기 +3 (연구로 올린다)
export const INDOOR_BONUS = 2;
export const COMFORT_RADIUS = 3;
export const COMFORT_CAP = 20;
export const COUNTER_FEE = 300;   // 카운터가 있으면 자리 요금 +300
export const WINTER_OUTDOOR = -6;  // 겨울(12~2월)엔 바깥 자리·가게 인기가 이만큼 깎인다 — 벽으로 둘러싸면(실내) 안 깎인다

export interface Sheet {
  base: number; bonus: number; scenery: number; comfort: number; season: number; dirty: number; indoor: boolean; total: number;
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
/** 이 시설과 어울리는 짝: 상성표에서 반대쪽 목록 (카탈로그 안내용) */
export function synergyPartners(id: string): { name: string; with: string[] }[] {
  const out: { name: string; with: string[] }[] = [];
  for (const sy of SYNERGIES) {
    if (sy.a.includes(id)) out.push({ name: sy.name, with: sy.b });
    else if (sy.b.includes(id)) out.push({ name: sy.name, with: sy.a });
  }
  return out;
}
/** 마당 경치 합: 심어 둔 나무·꽃·바위·장식 전부 (자리별로 따지지 않는다 — 꾸미는 건 꾸미는 것). 손님이 더 오는 데만 쓰인다. */
export function yardScenery(s: GameState): number {
  let n = 0;
  for (const f of Object.values(s.facilities)) n += facilityDef(f.type).scenery ?? 0;
  n += s.invested.includes('flower_field') ? 4 : 0;
  return Math.min(YARD_CAP, n);
}
/** (옛 계산) 반경 안 경치 합 — 지금은 자리에 안 붙인다 */
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
/** 실내 반경 안 아늑함 합 (실내 자리·가게만 받는다) */
export function comfortAt(s: GameState, f: Facility): number {
  const foot = footOf(s, f.id);
  let n = 0;
  for (const o of Object.values(s.facilities)) {
    if (o.id === f.id) continue;
    const d = facilityDef(o.type);
    if (!d.comfort) continue;
    if (cheb(foot, footOf(s, o.id)) <= COMFORT_RADIUS) n += d.comfort;
  }
  return Math.min(COMFORT_CAP, n);
}
/** 놓인 편의 시설 (종류마다 하나만 센다) */
export function amenities(s: GameState): Set<string> { const out = new Set<string>(); for (const f of Object.values(s.facilities)) { const a = facilityDef(f.type).amenity; if (a) out.add(a); } return out; }
const SHEETS = new WeakMap<GameState, { rev: number; map: Map<string, Sheet>; popSum: number | null }>();
function cache(s: GameState) {
  let c = SHEETS.get(s);
  const rev = s.layoutRev * 13 + s.clock.month; // 계절이 바뀌면 시트도 바뀐다
  if (!c || c.rev !== rev) { c = { rev, map: new Map(), popSum: null }; SHEETS.set(s, c); }
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
  const scenery = 0; // 마당 경치는 자리에 안 붙는다 (가게 전체 손님 수로 간다)
  const indoor = usable && isEnclosed(s, footOf(s, f.id));
  const comfort = indoor ? comfortAt(s, f) : 0;
  const season = !usable ? 0 : indoor ? INDOOR_BONUS : seasonOf(s.clock.month) === 'winter' ? WINTER_OUTDOOR : 0; // 실내는 아늑해서 +2, 바깥은 겨울에 −6
  const counter = d.tab === 'seat' && amenities(s).has('counter') ? COUNTER_FEE : 0;
  const dirty = usable ? -dirtyPenalty(f) : 0;
  return { base, bonus, scenery, comfort, season, dirty, indoor, total: Math.max(0, base + bonus + scenery + comfort + season + dirty), fee: (d.fee ?? 0) + pairs.length * SYNERGY_FEE + counter, upkeep: d.upkeep, pairs, likedBy: d.tags ?? [] };
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
  const f: Facility = { id: `f${s.nextId++}`, type: id, x, y, level: 1, uses: 0, sales: 0, dirty: 0, dishes: 0 };
  s.facilities[f.id] = f;
  for (const p of footprint(x, y, d.w, d.h)) cellAt(s, p.x, p.y).objectId = f.id;
  s.layoutRev++;
  return f;
}
/** 시설을 옮긴다: 원래 자리를 비우고 새 자리에 놓아 본다. 안 되면 되돌린다. */
export function moveFacility(s: GameState, fid: string, x: number, y: number): ApplyResult {
  const f = s.facilities[fid];
  if (!f) return { ok: false, reason: '없는 시설' };
  if (s.guests.some((g) => g.target === fid && g.phase !== 'out')) return { ok: false, reason: '사용 중' };
  const ox = f.x, oy = f.y;
  if (ox === x && oy === y) return { ok: true };
  const d = facilityDef(f.type);
  for (const p of footprint(ox, oy, d.w, d.h)) cellAt(s, p.x, p.y).objectId = null;
  const c = canPlace(s, f.type, x, y);
  if (!c.ok) { for (const p of footprint(ox, oy, d.w, d.h)) cellAt(s, p.x, p.y).objectId = fid; return c; }
  f.x = x; f.y = y;
  for (const p of footprint(x, y, d.w, d.h)) cellAt(s, p.x, p.y).objectId = fid;
  s.layoutRev++;
  return { ok: true };
}
export function removeFacility(s: GameState, fid: string): ApplyResult {
  const f = s.facilities[fid];
  if (!f) return { ok: false, reason: '없는 시설' };
  if (s.guests.some((g) => g.target === fid && g.phase !== 'out')) return { ok: false, reason: '사용 중' };
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
  if (s.money < d.cost) return { ok: false, reason: '돈 부족' };
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
    if (inBounds(s, q.x, q.y) && !wallBetween(s, p, q) && !cellAt(s, q.x, q.y).objectId && (cellAt(s, q.x, q.y).floor !== null || cellAt(s, q.x, q.y).terrain === 'road')) return q;
  }
  return null;
}
export function catalog(): typeof FACILITIES { return FACILITIES; }

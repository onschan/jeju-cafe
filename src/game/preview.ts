/** 놓기 전에 기대효과: 상태를 복제해 실제로 놓아 보고 전후를 비교한다 (고스트가 움직일 때마다 한 번). */
import type { GameState, Pt } from './types.ts';
import { facilityDef, isFloorDef } from './data.ts';
import { canPlace, lineCells, isEnclosed, footprint, rectEdges, canWall, setWall, type WallEdge } from './world.ts';
import { placeFacility, sheetOf, popularitySum, usables } from './facility.ts';
import { dailyGuests } from './guests.ts';

export interface Preview {
  cells: number;                 // 놓이는 칸(줄이면 여러 개)
  cost: number;
  total?: number; base?: number; bonus?: number; scenery?: number; season?: number; fee?: number; indoor?: boolean; // 자리·가게 자신의 손익
  pairs: string[];               // 새로 생기는 상성 짝 이름 (내 것 + 이웃 것)
  popDelta: number;              // 시설 인기 합 변화
  sceneryTouched: number;        // 경치가 오르는 자리·가게 수 (환경)
  indoorGain: number;            // 새로 실내가 되는 자리·가게 수 (벽)
  guestsDelta: number;           // 하루 손님 변화
}
function indoorCount(s: GameState): number { return usables(s).filter((f) => { const d = facilityDef(f.type); return isEnclosed(s, footprint(f.x, f.y, d.w, d.h)); }).length; }
function pairKey(s: GameState): Set<string> { const out = new Set<string>(); for (const f of usables(s)) for (const p of sheetOf(s, f).pairs) out.add(`${f.id}:${p.with}`); return out; }

export function previewPlace(s: GameState, id: string, x: number, y: number, line?: { from: Pt; to: Pt }, edges?: WallEdge[]): Preview | null {
  const d = facilityDef(id);
  if (isFloorDef(d)) return null; // 바닥은 칸 수·값만 (띠가 따로 보여 준다)
  const c = structuredClone(s) as GameState;
  if (d.sub === 'wall') {
    // 벽 네모: 되는 변만 세워 보고 실내가 되는 자리·가게를 센다
    const indoorBefore = indoorCount(c), popBefore = popularitySum(c);
    let n = 0;
    for (const e of edges ?? rectEdges(line?.from ?? { x, y }, line?.to ?? { x, y })) if (canWall(c, id, e).ok) { setWall(c, e, id); n++; }
    if (n === 0) return null;
    return { cells: n, cost: n * d.cost, pairs: [], popDelta: popularitySum(c) - popBefore, sceneryTouched: 0, indoorGain: indoorCount(c) - indoorBefore, guestsDelta: dailyGuests(c) - dailyGuests(s) };
  }
  const cells = line ? lineCells(line.from, line.to) : [{ x, y }];
  const pairsBefore = pairKey(c), popBefore = popularitySum(c), indoorBefore = indoorCount(c), guestsBefore = dailyGuests(c);
  const placed: string[] = [];
  for (const p of cells) if (canPlace(c, id, p.x, p.y).ok) placed.push(placeFacility(c, id, p.x, p.y).id);
  if (placed.length === 0) return null;
  const pairs: string[] = [];
  const after = pairKey(c);
  for (const k of after) if (!pairsBefore.has(k)) { const [fid, withId] = k.split(':'); const f = c.facilities[fid!]!; const p = sheetOf(c, f).pairs.find((q) => q.with === withId); if (p && !pairs.includes(p.name)) pairs.push(p.name); }
  const out: Preview = { cells: placed.length, cost: placed.length * d.cost, pairs, popDelta: popularitySum(c) - popBefore, sceneryTouched: 0, indoorGain: indoorCount(c) - indoorBefore, guestsDelta: dailyGuests(c) - guestsBefore };
  const f = c.facilities[placed[0]!]!;
  if (d.tab === 'seat' || d.tab === 'shop') { const sh = sheetOf(c, f); Object.assign(out, { total: sh.total, base: sh.base, bonus: sh.bonus, scenery: sh.scenery, season: sh.season, fee: sh.fee, indoor: sh.indoor }); }
  else if (d.scenery) { for (const u of usables(s)) { const a = sheetOf(s, u).scenery, b = sheetOf(c, c.facilities[u.id]!).scenery; if (b > a) out.sceneryTouched++; } }
  return out;
}

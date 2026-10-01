/** 놓기 전에 기대효과: 상태를 복제해 실제로 놓아 보고 전후를 비교한다 (고스트가 움직일 때마다 한 번). */
import type { GameState, Pt } from './types.ts';
import { facilityDef, isFloorDef } from './data.ts';
import { canPlace, lineCells, isEnclosed, footprint, rectEdges, canWall, setWall, edgeCells, canLayFloor, layFloor, type WallEdge } from './world.ts';
import { placeFacility, sheetOf, popularitySum, usables, yardScenery } from './facility.ts';
import { dailyGuests } from './guests.ts';
import { rooms, ROOM_KO, type Room } from './rooms.ts';

/** 편의 시설 효과 한 줄 */
export const AMENITY_TEXT: Record<string, string> = { counter: '모든 자리 요금 +₩300', restroom: '모든 손님 점수 +4 (만족 쉬움)', staff: '직원마다 서비스 +1', kitchen: '자리 결제 +15%', cleaning: '모든 손님 점수 +2', locker: '월급 −10%', storage: '유지비 −10%' };
/** 카탈로그 한 줄용 짧은 말 */
export const AMENITY_GIST: Record<string, string> = { counter: '주문·계산 · 요금 +₩300', restroom: '점수 +4', staff: '서비스 +1', kitchen: '결제 +15%', cleaning: '점수 +2', locker: '월급 −10%', storage: '유지비 −10%' };
export interface Preview {
  cells: number;                 // 놓이는 칸(줄이면 여러 개)
  cost: number;
  total?: number; base?: number; bonus?: number; scenery?: number; comfort?: number; season?: number; fee?: number; indoor?: boolean; // 자리·가게 자신의 손익
  pairs: string[];               // 새로 생기는 상성 짝 이름 (내 것 + 이웃 것)
  popDelta: number;              // 시설 인기 합 변화
  sceneryTouched: number;        // 경치가 오르는 자리·가게 수 (환경)
  comfortTouched: number;        // 아늑함이 오르는 자리·가게 수 (실내 꾸밈)
  amenity?: string;              // 편의 시설이면 그 효과 설명
  indoorGain: number;            // 새로 실내가 되는 자리·가게 수 (벽)
  guestsDelta: number;           // 하루 손님 변화
  roomNote?: string;             // 방 변화 한 줄 (새 방 · 별 오름 · 방 풀림)
}
/** 놓은 자리를 품은 방이 어떻게 달라지나 */
function roomNote(before: Room[], after: Room[], at: Pt[]): string | undefined {
  const key = (p: Pt) => `${p.x},${p.y}`;
  const touched = new Set(at.map(key));
  const near = (rs: Room[]) => rs.find((r) => r.cells.some((c) => touched.has(key(c))));
  const b = near(before), a = near(after);
  if (!b && a) return `새 방 — ${a.name} (${a.size}칸)`;
  if (b && !a) return '방이 풀려요';
  if (b && a && a.stars !== b.stars) return `${ROOM_KO[a.kind]} ★${b.stars} → ★${a.stars}`;
  if (b && a && a.kind !== b.kind) return `${ROOM_KO[b.kind]} → ${a.name}`;
  if (after.length > before.length) return `방 ${after.length - before.length}개 생김`;
  if (after.length < before.length) return `방 ${before.length - after.length}개 풀림`;
  return undefined;
}
function indoorCount(s: GameState): number { return usables(s).filter((f) => { const d = facilityDef(f.type); return isEnclosed(s, footprint(f.x, f.y, d.w, d.h)); }).length; }
function pairKey(s: GameState): Set<string> { const out = new Set<string>(); for (const f of usables(s)) for (const p of sheetOf(s, f).pairs) out.add(`${f.id}:${p.with}`); return out; }

export function previewPlace(s: GameState, id: string, x: number, y: number, line?: { from: Pt; to: Pt }, edges?: WallEdge[]): Preview | null {
  const d = facilityDef(id);
  const c = structuredClone(s) as GameState;
  if (isFloorDef(d)) {
    // 바닥: 깔아 보고 방이 어떻게 되는지만 (칸 수·값은 띠가 보여 준다)
    const roomsBefore = rooms(s), popBefore = popularitySum(c), guestsBefore = dailyGuests(c);
    const at = (line ? lineCells(line.from, line.to) : [{ x, y }]).filter((p) => canLayFloor(c, d.floor!, p.x, p.y).ok);
    if (at.length === 0) return null;
    for (const p of at) layFloor(c, d.floor!, p.x, p.y);
    return { cells: at.length, cost: at.length * d.cost, pairs: [], popDelta: popularitySum(c) - popBefore, sceneryTouched: 0, comfortTouched: 0, indoorGain: 0, guestsDelta: dailyGuests(c) - guestsBefore, roomNote: roomNote(roomsBefore, rooms(c), at) };
  }
  if (d.sub === 'wall') {
    // 벽 네모: 되는 변만 세워 보고 실내가 되는 자리·가게를 센다
    const indoorBefore = indoorCount(c), popBefore = popularitySum(c), roomsBefore = rooms(s);
    let n = 0;
    const at: Pt[] = [];
    for (const e of edges ?? rectEdges(line?.from ?? { x, y }, line?.to ?? { x, y })) if (canWall(c, id, e).ok) { setWall(c, e, id); n++; at.push(...edgeCells(e)); }
    if (n === 0) return null;
    return { cells: n, cost: n * d.cost, pairs: [], popDelta: popularitySum(c) - popBefore, sceneryTouched: 0, comfortTouched: 0, indoorGain: indoorCount(c) - indoorBefore, guestsDelta: dailyGuests(c) - dailyGuests(s), roomNote: roomNote(roomsBefore, rooms(c), at) };
  }
  const cells = line ? lineCells(line.from, line.to) : [{ x, y }];
  const pairsBefore = pairKey(c), popBefore = popularitySum(c), indoorBefore = indoorCount(c), guestsBefore = dailyGuests(c), roomsBefore = rooms(s);
  const placed: string[] = [];
  for (const p of cells) if (canPlace(c, id, p.x, p.y).ok) placed.push(placeFacility(c, id, p.x, p.y).id);
  if (placed.length === 0) return null;
  const pairs: string[] = [];
  const after = pairKey(c);
  for (const k of after) if (!pairsBefore.has(k)) { const [fid, withId] = k.split(':'); const f = c.facilities[fid!]!; const p = sheetOf(c, f).pairs.find((q) => q.with === withId); if (p && !pairs.includes(p.name)) pairs.push(p.name); }
  const out: Preview = { cells: placed.length, cost: placed.length * d.cost, pairs, popDelta: popularitySum(c) - popBefore, sceneryTouched: 0, comfortTouched: 0, indoorGain: indoorCount(c) - indoorBefore, guestsDelta: dailyGuests(c) - guestsBefore, amenity: d.amenity ? AMENITY_TEXT[d.amenity] : undefined, roomNote: roomNote(roomsBefore, rooms(c), cells) };
  const f = c.facilities[placed[0]!]!;
  if (d.tab === 'seat' || d.tab === 'shop') { const sh = sheetOf(c, f); Object.assign(out, { total: sh.total, base: sh.base, bonus: sh.bonus, scenery: sh.scenery, comfort: sh.comfort, season: sh.season, fee: sh.fee, indoor: sh.indoor }); }
  else if (d.scenery) out.sceneryTouched = yardScenery(c) - yardScenery(s);   // 마당 경치가 얼마나 늘었나
  if (d.comfort) { for (const u of usables(s)) { const a = sheetOf(s, u).comfort, b = sheetOf(c, c.facilities[u.id]!).comfort; if (b > a) out.comfortTouched++; } }
  return out;
}

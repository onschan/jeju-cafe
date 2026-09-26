/**
 * 할망의 추천 (pro-guide → solver): 튜토리얼 글로우 칸·「할망의 추천」을 실제 수치로 고른다 — 고정 좌표 없음.
 * 모든 함수는 sim 상태만 읽고 결정적이다(rng·Date 없음). 튜토리얼(tutorial.ts cells)·추천 탭(TutorialWindow)·무행동 힌트(hints.ts)가 부른다.
 *
 * solver: `bestSeatCells` 같은 공개 함수는 휴리스틱(`*Heuristic`)으로 후보를 뽑은 뒤, 같은 상태의 롤아웃 결과(solverCache — 워커 또는 solveSync가 채운다)가
 * 있으면 그 점수순으로 다시 세운다. 결과가 없으면 휴리스틱 순서 그대로(동기·렌더 경로에서 롤아웃을 돌리지 않는다). nextMove도 결과가 있으면 solver 1위 수를 낸다.
 *
 * - bestMainCell     본관 원점: 바람 최소 → 정낭(정류장)과 문 앞 거리 최소 (tutorial.recommendedMainCells와 같은 순서)
 * - bestSeatCells    야외 테이블: 정류장에서 **걷는 칸 수**가 적은 순 (자리 점수 1점 = 걷는 칸 SEAT_SCORE_CELLS칸으로 상계) → 문 앞과 가까운 순.
 *                    verify(2026-09-24): 시작 필지는 전망·그늘이 거의 없어 자리 점수가 0~1뿐이고, 30일 롤아웃 1위와 꼴찌를 가르는 것은 동선이었다
 *                    (평판 −1 vs −32 · 30일 매출 ₩712,000 vs ₩560,000). 옛 순서(자리 점수 우선)는 꼴찌 칸을 1위로 내놓았다.
 * - bestWallCells    돌담: 테이블 북서 쐐기(site.ts windOf와 같은 띠) 빈 칸 중 가리는 테이블 수 최다 → 테이블과 가까운 순
 * - bestCornerCells  감귤나무 등: 놓으면 명당(corners.ts) 조각이 가장 많이 모이는 빈 칸 (완성되면 크게 친다)
 * - bestParkingCells 주차장: 마을 길에 접한 자리(entry.ts parkingSites) 중 본관 문 앞과 가까운 순
 * - bestSpotToInvest 명소: 지금 투자할 수 있는 것 중 그 태그 손님층 인기(spots.ts tagPopularity) 최고 → 싼 순
 * - nextMove         현재 상태에서 다음 수 한 줄 (+ 글로우 칸) — 튜토리얼이 끝난 뒤에도 남는 코치. 문구는 이유가 있는 한 줄(§6: 지시문·화살표 없음)
 * - strategyVars     대사 토큰 `{seatWhy}` 같은 것에 넣을 실제 수치·이유 (ui/tutorialDialogue.ts fillTutorialStep)
 */
import type { GameState, Pt, PlacedObject, RoleId } from './types.ts';
import { objectDef, SPOTS } from '../data/index.ts';
import { CORNERS, cornersWithPiece, cornerIfPlaced, pieceMatches, cornerIdsDoneIncludingWork } from './corners.ts';
import { siteOf, seatScore, scoreOf, siteFeeMult, SAT_SHADE_SUMMER } from './site.ts';
import { seasonOf } from './clock.ts';
import { canPlace, cellAt, objectAt, doorFrontOf, footprint } from './grid.ts';
import { parcelAt } from './parcels.ts';
import { reachMap, busStopPos, cellKey, walkableNeighborsOf, isDoorReachable } from './path.ts';
import { mainBuilding, MAIN_TYPE, MAIN_SIZE, canBuildMain, MAIN_RECOMMEND_GATE_DIST, freeFloorCells } from './rooms.ts';
import { START_ORIGIN } from './layout.ts';
import { parkingSites, PARKING_EXPAND_FROM, ENTRY_ROUTES } from './entry.ts';
import { spotUnlocked, nextSpotLevel, spotRequirements, tagPopularity } from './spots.ts';
import { staffInRole } from './staff.ts';
import { rankCellsByCache, cachedMoves, type SolverMove } from './solverCache.ts';

export const SEAT_TYPE = 'table_out';
export const WALL_TYPE = 'stonewall';
export const TREE_TYPE = 'tangerine_tree';
/** 주차장 해금 조건(entry.ts routeFacilityUnlockMet)과 같은 쉼 시설 수 */
export const PARKING_REST_COUNT = 6;
/** 권장 야외 좌석 수 (3월 4 → 여름 6) */
export const OPENING_SEATS = 4;
export const SUMMER_SEATS = 6;

const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const byPos = (a: Pt, b: Pt) => a.y - b.y || a.x - b.x;

function emptyOwnedSoil(s: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) return false;
  const c = cellAt(s, x, y);
  return c.terrain === 'soil' && !c.objectId && !c.roomId && !!parcelAt(s, x, y)?.owned;
}
function* ownedEmptyCells(s: GameState): Iterable<Pt> {
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) if (emptyOwnedSoil(s, x, y)) yield { x, y };
}
/** 정류장에서 이 거리 안은 자리 후보에서 뺀다 — 「정류장 맨 앞」은 손님이 몰리는 길목이지 자리가 아니다 (zero-base) */
export const BUS_FRONT_KEEP_OUT = 1;
/** 자리 후보 칸: 빈 흙 + 본관 빈 바닥(안팎을 같은 눈금으로 견준다), 정류장 곁은 뺀다 */
function* seatCandidateCells(s: GameState): Iterable<Pt> {
  const bus = busStopPos(s);
  for (const p of ownedEmptyCells(s)) if (cheb(p, bus) > BUS_FRONT_KEEP_OUT) yield p;
  const m = mainBuilding(s);
  if (m && !m.build) for (const p of freeFloorCells(s, m)) yield p;
}
function objectsOf(s: GameState, type: string): PlacedObject[] {
  return Object.values(s.objects).filter((o) => o.type === type);
}
function outdoorSeats(s: GameState): PlacedObject[] {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
}
function doorFront(s: GameState): Pt | null {
  const m = mainBuilding(s);
  return m ? doorFrontOf(m) : null;
}
function unlocked(s: GameState, type: string): boolean {
  return s.unlocked.objects.includes(type);
}

// ---------- 본관 ----------

/** 본관 원점 추천(정낭/정류장과 문 앞 거리 최소 → 자리 점수 최고 → 위·왼쪽). 본관이 있으면 []. tutorial.recommendedMainCells가 이걸 쓴다. */
export function bestMainCells(s: GameState, n = 3): Pt[] {
  if (mainBuilding(s)) return [];
  const g = busStopPos(s);
  const size = MAIN_SIZE;
  const out: { p: Pt; score: number; dist: number }[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!canBuildMain(s, x, y).ok) continue;
    const f = doorFrontOf({ type: MAIN_TYPE, x, y, w: size.w, h: size.h });
    const dist = cheb(g, f);
    if (dist > MAIN_RECOMMEND_GATE_DIST) continue;
    out.push({ p: { x, y }, score: seatScore(s, x, y), dist });
  }
  out.sort((a, b) => a.dist - b.dist || b.score - a.score || byPos(a.p, b.p));
  return out.slice(0, n).map((o) => o.p);
}
export function bestMainCell(s: GameState): Pt | null {
  return bestMainCells(s, 1)[0] ?? null;
}

// ---------- 야외 테이블 ----------

/** 손님이 들어오는 칸(정류장)에서 이 칸까지 걸어야 하는 칸 수. 걸어 닿지 않으면 Infinity (= 손님이 못 앉는 칸). */
export function walkFromEntry(s: GameState, reach: ReturnType<typeof reachMap>, x: number, y: number): number {
  let best = Infinity;
  for (const nb of walkableNeighborsOf(s, x, y)) {
    const d = reach.dist.get(cellKey(s, nb));
    if (d !== undefined && d < best) best = d;
  }
  return best;
}
/** 자리 점수 1점을 걷는 칸 몇 칸어치로 보나. 전망 1점 = 요금 +4%, 걷는 칸 1칸 ≈ 그만큼의 회전율 — verify 표에서 둘이 비슷했다. */
export const SEAT_SCORE_CELLS = 1;
/** 야외 테이블 후보 칸 n개 (좋아 보이는 순): 걸어 닿는 빈 흙 칸 중 「걷는 칸 − 자리 점수」가 작은 순 → 자리 점수 → 문 앞과 가까운 순.
 *  순위를 확정하는 것은 롤아웃(bestSeatCells)이고 이 함수는 롤아웃이 볼 후보를 고르는 데 쓴다. */
export function bestSeatCellsHeuristic(s: GameState, n = 3, type = SEAT_TYPE): Pt[] {
  const reach = reachMap(s, busStopPos(s));
  const anchor = doorFront(s) ?? busStopPos(s);
  const scored: { p: Pt; cost: number; score: number; d: number }[] = [];
  for (const p of seatCandidateCells(s)) {
    if (!canPlace(s, type, p.x, p.y).ok) continue;
    const walk = walkFromEntry(s, reach, p.x, p.y);
    if (!Number.isFinite(walk)) continue; // 손님이 걸어 닿지 않는 칸은 자리가 아니다
    const score = seatScore(s, p.x, p.y);
    scored.push({ p, cost: walk - score * SEAT_SCORE_CELLS, score, d: cheb(p, anchor) });
  }
  scored.sort((a, b) => a.cost - b.cost || b.score - a.score || a.d - b.d || byPos(a.p, b.p));
  return scored.slice(0, n).map((o) => o.p);
}
/** solver 후보 칸 수 (solver.ts candidateActions와 같은 k). verify(2026-09-24): 좌석 5칸만 보면 롤아웃이 좋은 칸을 아예 못 본다 — 창을 넓혔다. */
export const SOLVER_SEAT_K = 10;
export const SOLVER_CELL_K = 6;
/** 야외 테이블 최적 칸 n개: 휴리스틱 상위 후보를 solver 롤아웃 점수(캐시)로 다시 세운 것. 캐시가 없으면 휴리스틱 순서. */
export function bestSeatCells(s: GameState, n = 3, type = SEAT_TYPE): Pt[] {
  return rankCellsByCache(s, type, bestSeatCellsHeuristic(s, Math.max(n, SOLVER_SEAT_K), type)).slice(0, n);
}
export function bestSeatCell(s: GameState): Pt | null {
  return bestSeatCells(s, 1)[0] ?? null;
}

/** 튜토리얼 첫 테이블 추천 칸 — 본관 안 카운터 앞 (zero-base: 첫 자리는 실내). 못 놓는 자리면(막혔거나 이미 있으면) 계산 1위로 돌아간다. */
export const TUTORIAL_SEAT_CELL: Pt = { x: START_ORIGIN.x + 5, y: START_ORIGIN.y + 2 };
/** 1단계(첫 테이블)에서 실제로 빛낼 칸. 1단계를 끝낸 뒤에는 늘 계산 1위(bestSeatCell)다. */
export function recommendedSeatCell(s: GameState): Pt | null {
  if (s.tutorial.step < 1 && canPlace(s, SEAT_TYPE, TUTORIAL_SEAT_CELL.x, TUTORIAL_SEAT_CELL.y).ok) return TUTORIAL_SEAT_CELL;
  return bestSeatCell(s);
}

// ---------- 돌담 ----------

/** 북서 쐐기(반경 3, |dx−dy| ≤ 1) — site.ts windOf·grid.ts windShelter와 같은 띠 */
function inWindWedge(seat: Pt, x: number, y: number): boolean {
  const dx = seat.x - x, dy = seat.y - y;
  return dx >= 1 && dx <= 3 && dy >= 1 && dy <= 3 && Math.abs(dx - dy) <= 1;
}
/** 돌담 최적 칸 n개: 야외 테이블 북서 쐐기의 빈 흙 칸 중 가리는 테이블 수 최다 → (특정 테이블이면 그) 테이블과 가까운 순. 테이블이 없으면 []. */
export function bestWallCellsHeuristic(s: GameState, n = 3, seat?: Pt): Pt[] {
  const seats = seat ? [seat] : outdoorSeats(s).map((o) => ({ x: o.x, y: o.y }));
  if (seats.length === 0) return [];
  const all = outdoorSeats(s).map((o) => ({ x: o.x, y: o.y }));
  const cand = new Map<number, { p: Pt; covers: number; d: number }>();
  for (const st of seats) {
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const x = st.x - dx, y = st.y - dy;
      if (!emptyOwnedSoil(s, x, y) || !canPlace(s, WALL_TYPE, x, y).ok) continue;
      const k = cellKey(s, { x, y });
      if (cand.has(k)) continue;
      const covers = all.filter((t) => inWindWedge(t, x, y)).length;
      cand.set(k, { p: { x, y }, covers, d: Math.min(...seats.map((t) => cheb(t, { x, y }))) });
    }
  }
  return [...cand.values()].sort((a, b) => b.covers - a.covers || a.d - b.d || byPos(a.p, b.p)).slice(0, n).map((o) => o.p);
}
export function bestWallCells(s: GameState, n = 3, seat?: Pt): Pt[] {
  return rankCellsByCache(s, WALL_TYPE, bestWallCellsHeuristic(s, Math.max(n, SOLVER_CELL_K), seat)).slice(0, n);
}
export function bestWallCell(s: GameState, seat?: Pt): Pt | null {
  return bestWallCells(s, 1, seat)[0] ?? null;
}

// ---------- 콤보 ----------

function typeMatches(type: string, pattern: string): boolean {
  return pattern.endsWith('*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern;
}
/** 오브젝트 발자국과 칸의 체비쇼프 거리 (compat.ts dist와 같은 셈) */
function distToCell(o: PlacedObject, x: number, y: number): number {
  const w = o.w ?? objectDef(o.type).w ?? 1, h = o.h ?? objectDef(o.type).h ?? 1;
  return Math.max(Math.max(0, o.x - x, x - (o.x + w - 1)), Math.max(0, o.y - y, y - (o.y + h - 1)));
}
/** type을 (x,y)에 놓았을 때의 명당 점수: 완성되면 +10, 아니면 그 자리에서 반경 안에 모이는 다른 조각 종류 수. */
export function cornerScoreIfPlaced(s: GameState, type: string, x: number, y: number): number {
  if (cornerIfPlaced(s, type, x, y)) return 10;
  const objs = Object.values(s.objects);
  let best = 0;
  const made = cornerIdsDoneIncludingWork(s); // 공사만 남은 명당도 「이미 만든 것」 — 조각을 또 권하지 않는다
  for (const def of cornersWithPiece(type)) {
    if (made.has(def.id)) continue;
    let n = 0;
    for (const p of def.pieces) if (!pieceMatches(p.type, type) && objs.some((o) => pieceMatches(p.type, o.type) && distToCell(o, x, y) <= def.radius)) n++; // spot2: 조각은 종류로 센다
    best = Math.max(best, n);
  }
  return best;
}
/** 명당 후보 칸 n개: 빈 흙 칸 중 명당 점수 최다(1 이상) → 야외 테이블과 가까운 순.
 *  조각이 하나도 안 모이는 상태(=명당 점수 0뿐)면 **자리 점수가 높은 칸**을 넓게 준다 — verify(2026-09-24): 「테이블 옆 한 칸」으로 좁히면
 *  30일 롤아웃 1위 칸(자리 점수 1)이 후보에 아예 안 들어와 추천이 14위였다. */
export function bestCornerCellsHeuristic(s: GameState, type = TREE_TYPE, n = 3): Pt[] {
  const seats = outdoorSeats(s);
  const near = (p: Pt) => (seats.length ? Math.min(...seats.map((t) => cheb(t, p))) : 0);
  const scored: { p: Pt; n: number; d: number; site: number }[] = [];
  for (const p of ownedEmptyCells(s)) {
    if (!canPlace(s, type, p.x, p.y).ok) continue;
    scored.push({ p, n: cornerScoreIfPlaced(s, type, p.x, p.y), d: near(p), site: seatScore(s, p.x, p.y) });
  }
  scored.sort((a, b) => b.n - a.n || a.d - b.d || byPos(a.p, b.p));
  const best = scored[0];
  if (!best) return [];
  if (best.n > 0) return scored.filter((o) => o.n === best.n).slice(0, n).map((o) => o.p);
  return [...scored].sort((a, b) => b.site - a.site || a.d - b.d || byPos(a.p, b.p)).slice(0, n).map((o) => o.p);
}
export function bestCornerCells(s: GameState, type = TREE_TYPE, n = 3): Pt[] {
  return rankCellsByCache(s, type, bestCornerCellsHeuristic(s, type, Math.max(n, SOLVER_CELL_K))).slice(0, n);
}
export function bestCornerCell(s: GameState, type = TREE_TYPE): Pt | null {
  return bestCornerCells(s, type, 1)[0] ?? null;
}
/** 아직 못 만든 명당 중 이 시설이 조각인 것 하나 (추천 문구용). 공사만 남은 명당은 「만든 것」으로 친다. */
export function cornerNameForPiece(s: GameState, type: string): string {
  const done = cornerIdsDoneIncludingWork(s);
  return (CORNERS.find((c) => !done.has(c.id) && c.pieces.some((p) => pieceMatches(p.type, type)))?.name) ?? '명당';
}

// ---------- 주차장 ----------

/** 주차장 원점 n개: 마을 길에 접한 자리 중 놓을 수 있는 것, 본관 문 앞(없으면 정류장)과 가까운 순. 이미 주차장이 있으면 []. */
export function bestParkingCellsHeuristic(s: GameState, n = 3): Pt[] {
  if (hasParking(s)) return [];
  const anchor = doorFront(s) ?? busStopPos(s);
  const def = objectDef(PARKING_EXPAND_FROM);
  return parkingSites(s)
    .filter((p) => canPlace(s, PARKING_EXPAND_FROM, p.x, p.y).ok)
    .map((p) => ({ p, d: Math.min(...footprint(PARKING_EXPAND_FROM, p.x, p.y, def.w, def.h).map((q) => cheb(q, anchor))) }))
    .sort((a, b) => a.d - b.d || byPos(a.p, b.p))
    .slice(0, n).map((o) => o.p);
}
/** 주차장 시설이 (공사 중이라도) 있나 — entry.routeFacility는 완공된 것만 본다 */
export function hasParking(s: GameState): boolean {
  const types = ENTRY_ROUTES.parking.facilities;
  return Object.values(s.objects).some((o) => types.includes(o.type));
}
export function bestParkingCells(s: GameState, n = 3): Pt[] {
  return rankCellsByCache(s, PARKING_EXPAND_FROM, bestParkingCellsHeuristic(s, Math.max(n, SOLVER_CELL_K))).slice(0, n);
}
export function bestParkingCell(s: GameState): Pt | null {
  return bestParkingCells(s, 1)[0] ?? null;
}

// ---------- 명소 ----------

/** 지금 투자할 수 있는(해금·조건 충족, 돈은 안 본다) 명소 중 그 태그 손님층 인기 최고 → 싼 순. 없으면 null. */
export function bestSpotToInvest(s: GameState): { id: string; name: string; cost: number; tag: string; popularity: number } | null {
  const cands = SPOTS.flatMap((d) => {
    if (!spotUnlocked(s, d.id)) return [];
    const next = nextSpotLevel(s, d.id);
    if (!next || spotRequirements(s, d.id).some((r) => !r.met)) return [];
    return [{ id: d.id, name: d.name, cost: next.cost, tag: d.tag as string, popularity: tagPopularity(s, d.tag) }];
  });
  cands.sort((a, b) => b.popularity - a.popularity || a.cost - b.cost || a.id.localeCompare(b.id));
  return cands[0] ?? null;
}

// ---------- 1년차 월별 표 ----------


// ---------- 지금 추천 행동 ----------

export interface NextMove { text: string; cells: Pt[]; /** solver 결과에서 온 수면 그 수 (UI 글로우 타깃·예상 이득) */ move?: SolverMove }
/** solver 캐시의 1위 수를 NextMove로 (저축보다 나은 수가 있을 때만). 없으면 null. */
export function solverNextMove(s: GameState): NextMove | null {
  const m = cachedMoves(s, (x) => x.score > 0)[0];
  return m ? { text: `${m.label} — ${m.why}`, cells: m.cells, move: m } : null;
}
function hasRole(s: GameState, ...roles: RoleId[]): boolean {
  return roles.some((r) => staffInRole(s, r).length > 0);
}
/** 현재 상태에서 다음 수 한 줄 (+ 글로우 칸). 1년차 표와 같은 우선순위. 할 게 없으면 null. */
export function nextMove(s: GameState): NextMove | null {
  const sv = solverNextMove(s);
  if (sv) return sv;
  return heuristicNextMove(s);
}
/** 1년차 표 순서의 다음 수 — solver 결과가 없을 때의 대체. 문구는 「무엇 — 왜」 한 줄. */
export function heuristicNextMove(s: GameState): NextMove | null {
  const m = mainBuilding(s);
  if (!m) { const p = bestMainCell(s); return { text: '본관이 먼저여 — 빛나는 칸이 자리 점수가 제일 높아', cells: p ? [p] : [] }; }
  if (!isDoorReachable(s, m)) { const f = doorFrontOf(m); return { text: '마을 길에서 문 앞까지 올렛길 — 길이 없으면 손님이 못 와', cells: [f] }; }
  const seats = outdoorSeats(s).length;
  const menus = s.menuSlots.filter((x) => x !== null).length;
  if (seats < 1) return { text: `야외 테이블 하나 — ${seatWhy(s)}`, cells: bestSeatCells(s, 1) };
  if (menus < 2) return { text: '메뉴판에 아메리카노·감귤주스 — 둘이면 문을 열 수 있어', cells: [] };
  if (s.staff.length < 1) return { text: '홀 직원 한 명 — 서빙 기다리는 시간이 반으로 줄어', cells: [] };
  if (!wallSheltered(s)) { const w = bestWallCells(s, 1); if (w.length) return { text: '돌담 하나를 테이블 곁에 — 밭담 명당 조각이 돼', cells: w }; } // 쐐기가 내 필지 밖이면 놓을 칸이 없다 — 같은 줄을 영영 되풀이하지 않는다
  if (s.stats.promotionsDone < 1) return { text: '전단 홍보 한 번 — 타깃 손님층이면 1.5배로 와', cells: [] };
  if (unlocked(s, TREE_TYPE) && objectsOf(s, TREE_TYPE).length < 1) { const c = bestCornerCells(s, TREE_TYPE, 1); if (c.length) return { text: `감귤나무 한 그루 — 빛나는 칸이면 ${cornerNameForPiece(s, TREE_TYPE)} 조각이 모여`, cells: c }; }
  if (seats < OPENING_SEATS) return { text: `야외 테이블 ${seats}/${OPENING_SEATS} — 4개면 자리가 없어 돌아가는 손님이 없어`, cells: bestSeatCells(s, 1) };
  if (!hasRole(s, 'hall', 'clean')) return { text: '홀이나 청소 직원 배치 — 청결이 별점을 갈라', cells: [] };
  if (seats < SUMMER_SEATS) return { text: `야외 테이블 ${seats}/${SUMMER_SEATS} — 6개면 주차장이 열려`, cells: bestSeatCells(s, 1) };
  if (unlocked(s, PARKING_EXPAND_FROM) && !hasParking(s)) return { text: '렌터카 주차장을 마을 길 옆에 — 차로 온 손님은 더 써', cells: bestParkingCells(s, 1) };
  const spot = bestSpotToInvest(s);
  if (spot && s.money >= spot.cost) return { text: `명소 「${spot.name}」 투자(₩${spot.cost / 10_000}만) — 요즘 잘 오는 손님층이 좋아해`, cells: [] };
  const buyable = s.parcels.find((p) => !p.owned && s.money >= p.price);
  if (buyable) return { text: `필지 「${buyable.name}」 사기 — 넓어지는 길은 이제 이것뿐이여`, cells: [{ x: buyable.x, y: buyable.y }] };
  return null;
}
/** 야외 테이블 북서 쐐기에 돌담(또는 방풍 시설)이 하나라도 있나 — 첫 돌담 판정 */
export function wallSheltered(s: GameState): boolean {
  for (const seat of outdoorSeats(s)) {
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const o = objectAt(s, seat.x - dx, seat.y - dy);
      if (o && objectDef(o.type).kind === 'wall') return true;
    }
  }
  return false;
}

// ---------- 대사 토큰 ----------

/** solver 캐시에서 조건에 맞는 최고 수의 근거 한 줄 ("14일 뒤 자금 +₩42만 · 평판 +1" — 2위 비교는 뺀다). 결과가 없으면 ''. */
export function solverDeltaText(s: GameState, pick: (m: SolverMove) => boolean): string {
  const m = cachedMoves(s, pick)[0];
  return m ? m.why.split(',')[0]! : '';
}
/** 추천 칸의 강점 한 가지 (서로 다른 강점을 세 칸에 나눠 달 때 쓴다). 근거가 없으면 null. */
export type SeatStrength = 'view' | 'shade' | 'near' | 'door' | 'corner';
/** 강점 이름 한 마디 (배치 화면 「① 전망 ② 길 옆 ③ 주방 곁」) */
export const STRENGTH_LABEL: Record<SeatStrength, string> = { view: '전망', shade: '그늘', near: '길 옆', door: '주방 곁', corner: '명당' };

/** 이 칸의 강점을 센 순서대로 (근거 있는 것만). 전망·그늘은 실제 계수, 길 옆·주방 곁은 걷는 칸 수가 후보 중 최소일 때만. */
export function seatStrengths(s: GameState, cell: Pt, cands: Pt[] = [], type = SEAT_TYPE): SeatStrength[] {
  const out: SeatStrength[] = [];
  const site = siteOf(s, cell.x, cell.y);
  if (site.view >= 1) out.push('view');
  if (site.shade >= 1 && seasonOf(s.clock.month) === 'summer') out.push('shade'); // 봄·가을엔 그늘이 만족을 안 바꾼다(site.ts siteBonus)
  const reach = reachMap(s, busStopPos(s));
  const walk = (p: Pt) => walkFromEntry(s, reach, p.x, p.y);
  const pool = cands.length ? cands : [cell];
  if (walk(cell) <= Math.min(...pool.map(walk))) out.push('near');
  const anchor = doorFront(s);
  if (anchor && cheb(cell, anchor) <= Math.min(...pool.map((p) => cheb(p, anchor)))) out.push('door');
  if (cornerScoreIfPlaced(s, type, cell.x, cell.y) > 0) out.push('corner');
  return out;
}
/** 한 강점의 이유 한 줄 (≤ 22자, §6: 지시문·화살표 없음). 수치는 실제 계수에서 온다. 할망 말투라 어미는 반말(lines). */
export function strengthWhy(s: GameState, cell: Pt, k: SeatStrength): string {
  const site = siteOf(s, cell.x, cell.y);
  switch (k) {
    case 'view': return `바다가 보여 요금 +${Math.round((siteFeeMult(scoreOf(site)) - 1) * 100)}%`;
    case 'shade': return `그늘이라 여름 만족 +${SAT_SHADE_SUMMER}`;
    case 'near': return '길에서 가까워 빨리 앉아';
    case 'door': return '주방이 가까워 서빙이 빨라';
    case 'corner': return `${cornerNameForPiece(s, SEAT_TYPE)} 조각이 모여`;
  }
}
/** 대사 가운데 넣는 짧은 관형절 (「{seatWhyPhrase} 칸이 빛나고 있져」) — 토큰이 문장 끝에 붙어 말이 끊기지 않게. */
const STRENGTH_PHRASE: Record<SeatStrength, string> = { view: '바다가 보이는', shade: '그늘이 지는', near: '길에서 가까운', door: '주방이 가까운', corner: '명당이 될' };
/** 근거가 없을 때 쓰는 무난한 관형절 — 이 값이 나오면 튜토리얼은 대체 문장(linesIfNoWhy)을 쓴다. */
export const SEAT_WHY_FLAT = '지금 제일 나은';
/** 추천 테이블 칸의 가장 큰 강점 (근거가 없으면 null — 대사가 대체 문장을 고를 때 볼 것) */
export function seatWhyKind(s: GameState): SeatStrength | null {
  const cands = bestSeatCellsHeuristic(s, SOLVER_SEAT_K);
  const seat = recommendedSeatCell(s) ?? cands[0]; // 튜토리얼 1단계는 사용자가 고른 칸 기준으로 이유를 말한다
  if (!seat) return null;
  return seatStrengths(s, seat, cands)[0] ?? null;
}
/** 추천 테이블 칸이 왜 좋은지 한 줄 (「할망의 추천」 다음 수 문구). 근거가 없으면 담백하게. */
export function seatWhy(s: GameState): string {
  const cands = bestSeatCellsHeuristic(s, SOLVER_SEAT_K);
  const seat = recommendedSeatCell(s) ?? cands[0];
  const k = seat ? seatStrengths(s, seat, cands)[0] : undefined;
  return k && seat ? strengthWhy(s, seat, k) : '지금 가진 칸 중엔 제일 좋아';
}
/** 대사 토큰 `{seatWhyPhrase}` — 칸을 꾸미는 관형절. 근거가 없으면 SEAT_WHY_FLAT. */
export function seatWhyPhrase(s: GameState): string {
  const k = seatWhyKind(s);
  return k ? STRENGTH_PHRASE[k] : SEAT_WHY_FLAT;
}
const placing = (type: string) => (m: SolverMove) => m.action.type === 'place' && m.action.objectType === type;
/** 튜토리얼 대사 `{토큰}`에 넣을 실제 수치·이유. 계산이 안 되는 상황(본관 없음 등)엔 기본값. 키에 밑줄을 쓰지 않는다(noIdLeak).
 *  `seatWhyPhrase`는 1·4단계 대사 가운데에 들어가는 관형절(「{seatWhyPhrase} 칸이 빛나고 있져」), `seatWhy`는 「할망의 추천」 한 줄. solver 토큰(`seatDelta` 등)은 롤아웃 결과가 캐시에 있을 때만 채워지고 없으면 ''. */
export function strategyVars(s: GameState): Record<string, string> {
  const m = mainBuilding(s);
  const main = m ? doorFrontOf(m) : bestMainCell(s); // 본관이 있으면(다시 보기) 문 앞 칸의 자리 점수
  const mainScore = main ? seatScore(s, main.x, main.y) : 5;
  const seat = bestSeatCell(s);
  const seatSite = seat ? siteOf(s, seat.x, seat.y) : null;
  const tree = bestCornerCell(s);
  const cornerN = tree ? cornerScoreIfPlaced(s, TREE_TYPE, tree.x, tree.y) : 2;
  const spot = bestSpotToInvest(s);
  const cur = s.money;
  return {
    mainScore: String(mainScore),
    seatScore: seatSite ? String(seatScore(s, seat!.x, seat!.y)) : '5',
    seatView: seatSite ? String(seatSite.view) : '0',
    seatFee: seatSite ? String(Math.round((siteFeeMult(scoreOf(seatSite)) - 1) * 100)) : '0',
    seatWhy: seatWhy(s),
    seatWhyPhrase: seatWhyPhrase(s),
    cornerN: String(cornerN),
    cornerName: cornerNameForPiece(s, TREE_TYPE),
    spotName: spot?.name ?? '유채꽃밭',
    seats: String(outdoorSeats(s).length),
    seatDelta: solverDeltaText(s, placing(SEAT_TYPE)),
    wallDelta: solverDeltaText(s, placing(WALL_TYPE)),
    treeDelta: solverDeltaText(s, placing(TREE_TYPE)),
    parkingDelta: solverDeltaText(s, placing(PARKING_EXPAND_FROM)),
    solverDelta: solverDeltaText(s, () => true),
  };
}
/** `{키}`를 vars로 치환. 모르는 키는 그대로 둔다. */
export function fillTemplate(line: string, vars: Record<string, string>): string {
  return line.replace(/\{([A-Za-z]+)\}/g, (m, k: string) => vars[k] ?? m);
}

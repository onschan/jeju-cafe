/**
 * 할망의 추천 (pro-guide → solver): 튜토리얼 글로우 칸·「할망의 추천」을 실제 수치로 고른다 — 고정 좌표 없음.
 * 모든 함수는 sim 상태만 읽고 결정적이다(rng·Date 없음). 튜토리얼(tutorial.ts cells)·추천 탭(TutorialWindow)·무행동 힌트(hints.ts)가 부른다.
 *
 * solver: `bestSeatCells` 같은 공개 함수는 휴리스틱(`*Heuristic`)으로 후보를 뽑은 뒤, 같은 상태의 롤아웃 결과(solverCache — 워커 또는 solveSync가 채운다)가
 * 있으면 그 점수순으로 다시 세운다. 결과가 없으면 휴리스틱 순서 그대로(동기·렌더 경로에서 롤아웃을 돌리지 않는다). nextMove도 결과가 있으면 solver 1위 수를 낸다.
 *
 * - bestMainCell     본관 원점: 바람 최소 → 정낭(정류장)과 문 앞 거리 최소 (tutorial.recommendedMainCells와 같은 순서)
 * - bestSeatCells    야외 테이블: 정류장에서 걸어 닿는 길 옆 빈 칸 중 seatScore(입지 0~10) 최고 → 문 앞과 가까운 순
 * - bestWallCells    돌담: 테이블 북서 쐐기(site.ts windOf와 같은 띠) 빈 칸 중 가리는 테이블 수 최다 → 테이블과 가까운 순
 * - bestCornerCells  감귤나무 등: 놓으면 코너(corners.ts) 조각이 가장 많이 모이는 빈 칸 (완성되면 크게 친다)
 * - bestIndoorSeats  실내 테이블: 본관 빈 바닥 중 벽에 붙은 창가(북쪽 벽 우선) → 입지 점수 순
 * - bestParkingCells 주차장: 마을 길에 접한 자리(entry.ts parkingSites) 중 본관 문 앞과 가까운 순
 * - bestSpotToInvest 명소: 지금 투자할 수 있는 것 중 그 태그 손님층 인기(spots.ts tagPopularity) 최고 → 싼 순
 * - openingBuild     1년차 월별 표 (추천 탭)
 * - nextMove         현재 상태에서 다음 수 한 줄 (+ 글로우 칸) — 튜토리얼이 끝난 뒤에도 남는 코치. 문구는 이유가 있는 한 줄(§6: 지시문·화살표 없음)
 * - strategyVars     대사 토큰 `{seatWhy}` 같은 것에 넣을 실제 수치·이유 (ui/tutorialDialogue.ts fillTutorialStep)
 */
import type { GameState, Pt, PlacedObject, RoleId } from './types.ts';
import { objectDef, SPOTS } from '../data/index.ts';
import { CORNERS, cornersWithPiece, cornerIfPlaced } from './corners.ts';
import { siteOf, seatScore, FEE_PER_VIEW, SAT_WIND_WINTER } from './site.ts';
import { canPlace, cellAt, objectAt, doorFrontOf, footprint } from './grid.ts';
import { parcelAt } from './parcels.ts';
import { reachMap, busStopPos, cellKey, walkableNeighborsOf, isDoorReachable } from './path.ts';
import { mainBuilding, freeFloorCells, MAIN_TYPE, MAIN_SIZE, MAIN_EXPAND_COST, canBuildMain, MAIN_RECOMMEND_GATE_DIST } from './rooms.ts';
import { parkingSites, PARKING_EXPAND_FROM, ENTRY_ROUTES } from './entry.ts';
import { spotUnlocked, nextSpotLevel, spotRequirements, tagPopularity } from './spots.ts';
import { staffInRole } from './staff.ts';
import { rankCellsByCache, cachedMoves, type SolverMove } from './solverCache.ts';

export const SEAT_TYPE = 'table_out';
export const WALL_TYPE = 'stonewall';
export const TREE_TYPE = 'tangerine_tree';
export const INDOOR_SEAT_TYPE = 'table_in';
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
function objectsOf(s: GameState, type: string): PlacedObject[] {
  return Object.values(s.objects).filter((o) => o.type === type);
}
function outdoorSeats(s: GameState): PlacedObject[] {
  return Object.values(s.objects).filter((o) => { const d = objectDef(o.type); return d.kind === 'seat' && !d.indoor; });
}
function indoorSeats(s: GameState): PlacedObject[] {
  return Object.values(s.objects).filter((o) => { const d = objectDef(o.type); return d.kind === 'seat' && d.indoor; });
}
function doorFront(s: GameState): Pt | null {
  const m = mainBuilding(s);
  return m ? doorFrontOf(m) : null;
}
function unlocked(s: GameState, type: string): boolean {
  return s.unlocked.objects.includes(type);
}

// ---------- 본관 ----------

/** 본관 원점 추천(바람 최소 → 정낭/정류장과 문 앞 거리 최소 → 위·왼쪽). 본관이 있으면 []. tutorial.recommendedMainCells가 이걸 쓴다. */
export function bestMainCells(s: GameState, n = 3): Pt[] {
  if (mainBuilding(s)) return [];
  const g0 = objectsOf(s, 'gate')[0];
  const g = g0 ? { x: g0.x, y: g0.y } : busStopPos(s);
  const size = MAIN_SIZE[1]!;
  const out: { p: Pt; wind: number; dist: number }[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!canBuildMain(s, x, y).ok) continue;
    const f = doorFrontOf({ type: MAIN_TYPE, x, y, w: size.w, h: size.h });
    const dist = cheb(g, f);
    if (dist > MAIN_RECOMMEND_GATE_DIST) continue;
    out.push({ p: { x, y }, wind: siteOf(s, x, y).wind, dist });
  }
  out.sort((a, b) => a.wind - b.wind || a.dist - b.dist || byPos(a.p, b.p));
  return out.slice(0, n).map((o) => o.p);
}
export function bestMainCell(s: GameState): Pt | null {
  return bestMainCells(s, 1)[0] ?? null;
}

// ---------- 야외 테이블 ----------

/** 손님이 앉을 수 있는 칸인가: 4방향 이웃 중 정류장에서 걸어 닿는 걷기 칸이 있다 (guests.ts와 같은 규칙) */
function seatReachable(s: GameState, reach: ReturnType<typeof reachMap>, x: number, y: number): boolean {
  return walkableNeighborsOf(s, x, y).some((nb) => reach.dist.has(cellKey(s, nb)));
}
/** 야외 테이블 최적 칸 n개 (좋은 순): 걸어 닿는 빈 흙 칸 중 seatScore 최고 → 문 앞(없으면 정류장)과 가까운 순. 닿는 칸이 없으면(길이 아직 없다) 길·마을 길 옆 빈 칸으로 대신한다. */
export function bestSeatCellsHeuristic(s: GameState, n = 3, type = SEAT_TYPE): Pt[] {
  const reach = reachMap(s, busStopPos(s));
  const anchor = doorFront(s) ?? busStopPos(s);
  const scored: { p: Pt; score: number; d: number }[] = [];
  for (const p of ownedEmptyCells(s)) {
    if (!canPlace(s, type, p.x, p.y).ok || !seatReachable(s, reach, p.x, p.y)) continue;
    scored.push({ p, score: seatScore(s, p.x, p.y), d: cheb(p, anchor) });
  }
  scored.sort((a, b) => b.score - a.score || a.d - b.d || byPos(a.p, b.p));
  return scored.slice(0, n).map((o) => o.p);
}
/** solver 후보 칸 수 (solver.ts candidateActions와 같은 k: 좌석 5·그 밖 3) */
export const SOLVER_SEAT_K = 5;
export const SOLVER_CELL_K = 3;
/** 야외 테이블 최적 칸 n개: 휴리스틱 상위 후보를 solver 롤아웃 점수(캐시)로 다시 세운 것. 캐시가 없으면 휴리스틱 순서. */
export function bestSeatCells(s: GameState, n = 3, type = SEAT_TYPE): Pt[] {
  return rankCellsByCache(s, type, bestSeatCellsHeuristic(s, Math.max(n, SOLVER_SEAT_K), type)).slice(0, n);
}
export function bestSeatCell(s: GameState): Pt | null {
  return bestSeatCells(s, 1)[0] ?? null;
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
/** type을 (x,y)에 놓았을 때의 코너 점수: 완성되면 +10, 아니면 그 자리에서 반경 안에 모이는 다른 조각 종류 수. */
export function cornerScoreIfPlaced(s: GameState, type: string, x: number, y: number): number {
  if (cornerIfPlaced(s, type, x, y)) return 10;
  const objs = Object.values(s.objects);
  let best = 0;
  for (const def of cornersWithPiece(type)) {
    if (s.codex.corners?.includes(def.id)) continue;
    let n = 0;
    for (const p of def.pieces) if (p.type !== type && objs.some((o) => o.type === p.type && distToCell(o, x, y) <= def.radius)) n++;
    best = Math.max(best, n);
  }
  return best;
}
/** 코너 최적 칸 n개: 빈 흙 칸 중 코너 점수 최다(1 이상) → 야외 테이블과 가까운 순. 점수가 나는 칸이 없으면 테이블 옆 빈 칸. */
export function bestCornerCellsHeuristic(s: GameState, type = TREE_TYPE, n = 3): Pt[] {
  const seats = outdoorSeats(s);
  const near = (p: Pt) => (seats.length ? Math.min(...seats.map((t) => cheb(t, p))) : 0);
  const scored: { p: Pt; n: number; d: number }[] = [];
  for (const p of ownedEmptyCells(s)) {
    if (!canPlace(s, type, p.x, p.y).ok) continue;
    scored.push({ p, n: cornerScoreIfPlaced(s, type, p.x, p.y), d: near(p) });
  }
  scored.sort((a, b) => b.n - a.n || a.d - b.d || byPos(a.p, b.p));
  const best = scored[0];
  if (!best) return [];
  if (best.n > 0) return scored.filter((o) => o.n === best.n).slice(0, n).map((o) => o.p);
  return scored.filter((o) => o.d <= 1).slice(0, n).map((o) => o.p);
}
export function bestCornerCells(s: GameState, type = TREE_TYPE, n = 3): Pt[] {
  return rankCellsByCache(s, type, bestCornerCellsHeuristic(s, type, Math.max(n, SOLVER_CELL_K))).slice(0, n);
}
export function bestCornerCell(s: GameState, type = TREE_TYPE): Pt | null {
  return bestCornerCells(s, type, 1)[0] ?? null;
}
/** 아직 못 만든 코너 중 이 시설이 조각인 것 하나 (추천 문구용) */
export function cornerNameForPiece(s: GameState, type: string): string {
  const done = new Set(s.codex.corners ?? []);
  return (CORNERS.find((c) => !done.has(c.id) && c.pieces.some((p) => p.type === type))?.name) ?? '코너';
}

// ---------- 실내 ----------

/** 실내 테이블 최적 칸 n개: 본관 빈 바닥 중 벽에 붙은 창가(북쪽 벽 = 바다 방향 우선) → 입지 점수 → 위·왼쪽. 공사 중이면 []. */
export function bestIndoorSeatsHeuristic(s: GameState, n = 3): Pt[] {
  const m = mainBuilding(s);
  if (!m || s.main.work) return [];
  const w = m.w ?? objectDef(m.type).w, h = m.h ?? objectDef(m.type).h;
  const onWall = (p: Pt) => p.x === m.x || p.y === m.y || p.x === m.x + w - 1 || p.y === m.y + h - 1;
  const rank = (p: Pt) => (p.y === m.y ? 2 : onWall(p) ? 1 : 0);
  return freeFloorCells(s, m)
    .filter((p) => canPlace(s, 'table_in', p.x, p.y).ok) // fix-indoor: 고정 설비·통로 검사 통과 칸만
    .map((p) => ({ p, wall: rank(p), score: seatScore(s, p.x, p.y) }))
    .sort((a, b) => b.wall - a.wall || b.score - a.score || byPos(a.p, b.p))
    .slice(0, n).map((o) => o.p);
}
export function bestIndoorSeats(s: GameState, n = 3): Pt[] {
  return rankCellsByCache(s, INDOOR_SEAT_TYPE, bestIndoorSeatsHeuristic(s, Math.max(n, SOLVER_SEAT_K))).slice(0, n);
}
export function bestIndoorSeat(s: GameState): Pt | null {
  return bestIndoorSeats(s, 1)[0] ?? null;
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

export interface BuildPlanRow { month: number; title: string; what: string; why: string }
/** 1년차 월별 표 (추천 탭). 봇(bot.ts)의 실제 수순을 사람 말로 — 무엇을(what)과 왜(why) 한 줄씩. */
export function openingBuild(): BuildPlanRow[] {
  return [
    { month: 3, title: '개업', what: '야외 테이블 4개, 홀 직원 1명, 메뉴 2개', why: '자리가 4개면 손님이 안 돌아간다' },
    { month: 4, title: '홍보와 나무', what: '전단 홍보 한 번, 감귤나무 한 그루', why: '코너가 하나 생기면 인기가 오른다' },
    { month: 5, title: '증축 준비', what: `₩${MAIN_EXPAND_COST[2]! / 10_000}만을 모은다`, why: '5월에 쓰면 6월 증축이 늦어진다' },
    { month: 6, title: '본관 2층', what: '증축하고 문 앞 길을 다시 잇는다', why: '실내 자리는 비 오는 날 매출이다' },
    { month: 7, title: '실내 자리', what: '창가에 실내 테이블 2개, 야외 6개', why: '여름엔 손님이 몰려 자리가 모자란다' },
    { month: 8, title: '연수', what: '바리스타 연수 한 번', why: '손재주가 오르면 서빙이 빨라진다' },
    { month: 9, title: '가이드북', what: '청소 직원을 두고 청결 90을 지킨다', why: '9월 발표는 청결로 별점을 가른다' },
    { month: 10, title: '주차장', what: '쉼 시설 6개가 되면 렌터카 주차장', why: '차로 온 손님은 더 쓰고 더 머문다' },
    { month: 11, title: '감귤 축제', what: '감귤주스·감귤 메뉴를 앞줄에', why: '11월 축제엔 감귤 메뉴가 잘 팔린다' },
    { month: 12, title: '난로', what: '실내 난로와 돌담으로 바람을 막는다', why: `겨울 바람은 1당 만족 ${SAT_WIND_WINTER}` },
  ];
}

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
  if (!m) { const p = bestMainCell(s); return { text: '본관이 먼저다 — 빛나는 칸이 바람이 제일 적다', cells: p ? [p] : [] }; }
  if (!isDoorReachable(s, m)) { const f = doorFrontOf(m); return { text: '마을 길에서 문 앞까지 올렛길 — 길이 없으면 손님이 못 온다', cells: [f] }; }
  const seats = outdoorSeats(s).length;
  const menus = s.menuSlots.filter((x) => x !== null).length;
  if (seats < 1) return { text: `야외 테이블 하나 — ${seatWhy(s)}`, cells: bestSeatCells(s, 1) };
  if (menus < 2) return { text: '메뉴판에 아메리카노·감귤주스 — 둘이면 문을 열 수 있다', cells: [] };
  if (s.staff.length < 1) return { text: '홀 직원 한 명 — 서빙 기다리는 시간이 반으로 준다', cells: [] };
  if (!wallSheltered(s)) return { text: `돌담 하나를 테이블 북서쪽에 — 바람 1이 줄면 겨울 만족 +${-SAT_WIND_WINTER}`, cells: bestWallCells(s, 1) };
  if (s.stats.promotionsDone < 1) return { text: '전단 홍보 한 번 — 타깃 손님층이면 1.5배로 온다', cells: [] };
  if (unlocked(s, TREE_TYPE) && objectsOf(s, TREE_TYPE).length < 1) { const c = bestCornerCells(s, TREE_TYPE, 1); if (c.length) return { text: `감귤나무 한 그루 — 빛나는 칸이면 ${cornerNameForPiece(s, TREE_TYPE)} 조각이 모인다`, cells: c }; }
  if (seats < OPENING_SEATS) return { text: `야외 테이블 ${seats}/${OPENING_SEATS} — 4개면 자리가 없어 돌아가는 손님이 없다`, cells: bestSeatCells(s, 1) };
  if (!hasRole(s, 'hall', 'clean')) return { text: '홀이나 청소 직원 배치 — 청결이 별점을 가른다', cells: [] };
  if (s.main.level < 2 && !s.main.work) {
    const cost = MAIN_EXPAND_COST[2]!;
    return s.money >= cost
      ? { text: `본관 증축(₩${cost / 10_000}만) — 실내 자리가 생긴다`, cells: [] }
      : { text: `증축까지 ₩${Math.ceil((cost - s.money) / 10_000)}만 — 지금 쓰면 그만큼 늦어진다`, cells: [] };
  }
  if (s.main.level >= 2 && !s.main.work && indoorSeats(s).length < 2) return { text: `실내 테이블 ${indoorSeats(s).length}/2 — 창가 자리가 만족이 높다`, cells: bestIndoorSeats(s, 1) };
  if (seats < SUMMER_SEATS) return { text: `야외 테이블 ${seats}/${SUMMER_SEATS} — 6개면 주차장이 열린다`, cells: bestSeatCells(s, 1) };
  if (unlocked(s, PARKING_EXPAND_FROM) && !hasParking(s)) return { text: '렌터카 주차장을 마을 길 옆에 — 차로 온 손님은 더 쓴다', cells: bestParkingCells(s, 1) };
  const spot = bestSpotToInvest(s);
  if (spot && s.money >= spot.cost) return { text: `명소 「${spot.name}」 투자(₩${spot.cost / 10_000}만) — 요즘 잘 오는 손님층이 좋아한다`, cells: [] };
  if (s.main.level < 3 && !s.main.work) return { text: `다음은 본관 3층(₩${MAIN_EXPAND_COST[3]! / 10_000}만) — 모아 두면 된다`, cells: [] };
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
/** 추천 테이블 칸이 왜 좋은지 한 줄 (≤ 14자, 튜토리얼 1단계 `{seatWhy}`·다음 수 문구): 전망 → 요금, 주방 가까움 → 서빙, 바람 적음 → 겨울, 아니면 길 옆. */
export function seatWhy(s: GameState): string {
  const seat = bestSeatCell(s);
  if (!seat) return '길 옆이라 손님이 잘 앉는다';
  const site = siteOf(s, seat.x, seat.y);
  if (site.view >= 1) return `바다가 보여 요금 +${Math.round(site.view * FEE_PER_VIEW * 100)}%`;
  if (site.kitchen >= 3) return '주방이 가까워 서빙이 빠르다';
  if (site.wind <= 1) return '바람이 적어 겨울에도 좋다';
  return '길 옆이라 손님이 잘 앉는다';
}
const placing = (type: string) => (m: SolverMove) => m.action.type === 'place' && m.action.objectType === type;
/** 튜토리얼 대사 `{토큰}`에 넣을 실제 수치·이유. 계산이 안 되는 상황(본관 없음 등)엔 기본값. 키에 밑줄을 쓰지 않는다(noIdLeak).
 *  `seatWhy`는 1단계 「빛나는 칸은 {seatWhy}」. solver 토큰(`seatDelta` 등)은 롤아웃 결과가 캐시에 있을 때만 채워지고 없으면 ''. */
export function strategyVars(s: GameState): Record<string, string> {
  const m = mainBuilding(s);
  const main = m ? doorFrontOf(m) : bestMainCell(s); // 본관이 있으면(다시 보기) 문 앞 칸의 바람
  const mainWind = main ? siteOf(s, main.x, main.y).wind : 1;
  const seat = bestSeatCell(s);
  const seatSite = seat ? siteOf(s, seat.x, seat.y) : null;
  const firstSeat = outdoorSeats(s)[0];
  const wallWind = firstSeat ? siteOf(s, firstSeat.x, firstSeat.y).wind : 3;
  const tree = bestCornerCell(s);
  const cornerN = tree ? cornerScoreIfPlaced(s, TREE_TYPE, tree.x, tree.y) : 2;
  const spot = bestSpotToInvest(s);
  const cur = s.money;
  return {
    mainWind: String(mainWind),
    seatScore: seatSite ? String(seatScore(s, seat!.x, seat!.y)) : '5',
    seatView: seatSite ? String(seatSite.view) : '0',
    seatFee: seatSite ? String(Math.round(seatSite.view * FEE_PER_VIEW * 100)) : '0',
    seatWhy: seatWhy(s),
    wallWind: String(wallWind),
    wallAfter: String(Math.max(0, wallWind - 1)),
    cornerN: String(cornerN),
    cornerName: cornerNameForPiece(s, TREE_TYPE),
    spotName: spot?.name ?? '유채꽃밭',
    expandLeft: String(Math.max(0, Math.ceil((MAIN_EXPAND_COST[2]! - cur) / 10_000))),
    seats: String(outdoorSeats(s).length),
    seatDelta: solverDeltaText(s, placing(SEAT_TYPE)),
    wallDelta: solverDeltaText(s, placing(WALL_TYPE)),
    treeDelta: solverDeltaText(s, placing(TREE_TYPE)),
    indoorDelta: solverDeltaText(s, placing(INDOOR_SEAT_TYPE)),
    parkingDelta: solverDeltaText(s, placing(PARKING_EXPAND_FROM)),
    solverDelta: solverDeltaText(s, () => true),
  };
}
/** `{키}`를 vars로 치환. 모르는 키는 그대로 둔다. */
export function fillTemplate(line: string, vars: Record<string, string>): string {
  return line.replace(/\{([A-Za-z]+)\}/g, (m, k: string) => vars[k] ?? m);
}

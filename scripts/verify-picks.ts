/**
 * 추천 자리 검증 (verify): 「할망의 추천」이 진짜 최적인지 숫자로 확인한다.
 *
 * 방법 — 한 시점의 상태에서 **한 종류의 시설을 놓을 수 있는 모든 칸**에 하나씩 놓아 보고, 각각 H일 롤아웃(solver.ts evaluate)으로
 * 점수를 매겨 「진짜 순위표」를 만든다. 그 표와 지금 게임이 추천하는 칸(튜토리얼 ① 글로우 · bestSeatCells 상위 3 · 배치 화면 3칸)을 비교한다.
 *
 * 사용: pnpm tsx scripts/verify-picks.ts [--horizon 30] [--cap 100] [--json out.json] [--quiet]
 *
 * 출력: 시점 × 시설 종류마다
 *   - 진짜 상위 5칸 (좌표 · 점수 · 30일 자금 차)
 *   - 추천 1위가 진짜 몇 위인지 · 점수/자금 격차
 *   - 상위 3 적중률 (추천 3칸 중 진짜 상위 3에 든 수 / 3)
 *   - 최악 사례 (추천 칸 중 진짜 순위가 가장 낮은 것)
 *
 * 결정적: rng·Date를 쓰지 않는다. 같은 인자면 같은 표가 나온다(벽시계 예산 budgetMs를 쓰지 않는다).
 */
import { createInitialState, evaluate, metricsOf, canPlace, cellAt, parcelAt, objectAt, doorFrontOf, mainBuilding, parkingSites, solveSync, setSolverResult, bestSeatCells, bestWallCells, bestCornerCells, bestParkingCells, seatScore, siteOf, PARKING_EXPAND_FROM, DEFAULT_SOLVER_OPTIONS, TUTORIAL_STEP_DEFS, type GameState, type Pt, type Action, tick, apply, DAY_MS } from '../src/sim/index.ts';
import { reachMap, busStopPos, cellKey, walkableNeighborsOf } from '../src/sim/path.ts';
import { bestSeatCellsHeuristic, bestWallCellsHeuristic, bestCornerCellsHeuristic, bestParkingCellsHeuristic } from '../src/sim/strategy.ts';
import { monthlyPlan, dailyPlan } from '../src/sim/bot.ts';
import { objectDef } from '../src/data/index.ts';
import { writeFileSync } from 'node:fs';

const arg = (name: string, dflt: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const HORIZON = arg('horizon', DEFAULT_SOLVER_OPTIONS.horizon);
const CAP = arg('cap', 100);
const QUIET = process.argv.includes('--quiet');
const JSON_OUT = (() => { const i = process.argv.indexOf('--json'); return i >= 0 ? process.argv[i + 1] : null; })();

/** 점수가 이만큼 안에 들면 같은 자리로 본다 (롤아웃 잡음·동점) */
export const TIE_EPS = 1;
const key = (p: Pt) => `${p.x},${p.y}`;
const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// ---------- 시점 ----------

/** 새 게임(튜토리얼 레이아웃) — 본관·올렛길만 있고 좌석·메뉴가 없다 */
function startState(seed = 1): GameState {
  return createInitialState(seed, 'local', 0, 'tutorial');
}
/** 튜토리얼 2단계까지 끝낸 모습 — 새 게임에 메뉴 2종만 얹었다. 메뉴가 없으면 손님이 아예 안 와서 롤아웃이 자리를 못 가른다. */
function openedStart(seed = 1): GameState {
  const s = startState(seed);
  for (const id of ['americano', 'tangerine_juice']) { const i = s.menuSlots.indexOf(null); if (i >= 0 && !s.menuSlots.includes(id)) s.menuSlots[i] = id; }
  return s;
}
/** 1년차 중반: showcase.ts와 같은 봇 루프를 180일 돌린 상태 */
function midYear1(seed = 1, days = 180): GameState {
  const s = createInitialState(seed);
  let lastMonth = -1, months = 0;
  for (let d = 0; d < days; d++) {
    if (s.clock.month !== lastMonth) { lastMonth = s.clock.month; months++; monthlyPlan(s, months); }
    dailyPlan(s);
    tick(s, DAY_MS);
    if (s.lastMonthCard) apply(s, { type: 'dismissMonthCard' });
  }
  return s;
}

// ---------- 후보 칸 (모든 놓을 수 있는 칸) ----------

function ownedEmpty(s: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) return false;
  const c = cellAt(s, x, y);
  return c.terrain === 'soil' && !c.objectId && !c.roomId && !!parcelAt(s, x, y)?.owned;
}
/** 손님이 앉을 수 있는 칸인가 (strategy.seatReachable과 같은 규칙) */
function seatReachable(s: GameState, reach: ReturnType<typeof reachMap>, x: number, y: number): boolean {
  return walkableNeighborsOf(s, x, y).some((nb) => reach.dist.has(cellKey(s, nb)));
}

/** 이 종류를 놓을 수 있는 모든 칸 (문 앞과 가까운 순, 최대 CAP개). 좌석은 길에 닿는 칸만. */
function allCells(s: GameState, type: string): { cells: Pt[]; total: number } {
  const def = objectDef(type);
  const m = mainBuilding(s);
  const anchor = m ? doorFrontOf(m) : busStopPos(s);
  let out: Pt[] = [];
  if (type === PARKING_EXPAND_FROM) {
    out = parkingSites(s).filter((p) => canPlace(s, type, p.x, p.y).ok);
  } else {
    const reach = reachMap(s, busStopPos(s));
    const needReach = def.kind === 'seat';
    for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
      if (!ownedEmpty(s, x, y) || !canPlace(s, type, x, y).ok) continue;
      if (needReach && !seatReachable(s, reach, x, y)) continue;
      out.push({ x, y });
    }
  }
  const total = out.length;
  out.sort((a, b) => cheb(a, anchor) - cheb(b, anchor) || a.y - b.y || a.x - b.x);
  return { cells: out.slice(0, CAP), total };
}

// ---------- 진짜 순위표 ----------

export interface TrueRow { p: Pt; rank: number; score: number; money: number; seat: number; dist: number }
/** 모든 후보 칸을 H일 롤아웃으로 재서 순위표를 만든다. score·money는 「아무것도 안 함」 대비. */
function trueRanking(s: GameState, type: string): { rows: TrueRow[]; total: number; skipped: number } {
  const { cells, total } = allCells(s, type);
  const base = metricsOf(s);
  const noop = evaluate(s, null, HORIZON, base);
  const m = mainBuilding(s);
  const anchor = m ? doorFrontOf(m) : busStopPos(s);
  const rows: TrueRow[] = [];
  for (const p of cells) {
    const a: Action = { type: 'place', objectType: type, x: p.x, y: p.y };
    const ev = evaluate(s, a, HORIZON, base);
    if (!ev.ok) continue;
    rows.push({ p, rank: 0, score: ev.score - noop.score, money: ev.metrics.money - noop.metrics.money, seat: seatScore(s, p.x, p.y), dist: cheb(p, anchor) });
  }
  rows.sort((a, b) => b.score - a.score || a.p.y - b.p.y || a.p.x - b.p.x);
  // 동점 칸은 같은 순위 (경쟁 순위) — 롤아웃이 자리를 못 가르는 것을 「18위」로 부풀리지 않는다
  rows.forEach((r, i) => { const prev = rows[i - 1]; r.rank = prev && Math.abs(prev.score - r.score) < TIE_EPS ? prev.rank : i + 1; });
  return { rows, total, skipped: Math.max(0, total - cells.length) };
}

// ---------- 비교 ----------

export interface Verdict {
  when: string; type: string; label: string; source: string;
  picks: Pt[];
  /** 추천 1위의 진짜 순위 (후보 밖이면 0) */
  topRank: number;
  /** 진짜 1위와의 점수 차 · 30일 자금 차 */
  scoreGap: number; moneyGap: number;
  /** 추천 3칸 중 진짜 상위 3에 든 수 */
  hits: number;
  /** 추천 칸 중 가장 낮은 진짜 순위 */
  worstRank: number;
  candidates: number;
  /** 1위와 동점인 칸 수 (전부 동점이면 자리가 성과를 안 가른다는 뜻) */
  ties: number;
}
function judge(when: string, type: string, label: string, source: string, picks: Pt[], t: { rows: TrueRow[] }): Verdict {
  const byCell = new Map(t.rows.map((r) => [key(r.p), r]));
  const best = t.rows[0];
  const top = picks[0] ? byCell.get(key(picks[0])) : undefined;
  const top3 = new Set(t.rows.filter((r) => r.rank <= 3).map((r) => key(r.p)));
  const ties = t.rows.filter((r) => r.rank === 1).length;
  const ranks = picks.map((p) => byCell.get(key(p))?.rank ?? 0);
  return {
    when, type, label, source, picks,
    topRank: top?.rank ?? 0,
    scoreGap: best && top ? best.score - top.score : 0,
    moneyGap: best && top ? best.money - top.money : 0,
    hits: picks.slice(0, 3).filter((p) => top3.has(key(p))).length,
    worstRank: ranks.length ? Math.max(...ranks.map((r) => (r === 0 ? Infinity : r))) : 0,
    candidates: t.rows.length, ties,
  };
}

// ---------- 실행 ----------

const won = (n: number) => `${n < 0 ? '−' : '+'}₩${Math.round(Math.abs(n) / 10_000).toLocaleString('en-US')}만`;
const cellsText = (ps: Pt[]) => ps.map((p) => `(${p.x},${p.y})`).join(' ');

interface Target { type: string; label: string; heuristic: (s: GameState, n: number) => Pt[]; cached: (s: GameState, n: number) => Pt[] }
const TARGETS: Target[] = [
  { type: 'table_out', label: '야외 테이블', heuristic: (s, n) => bestSeatCellsHeuristic(s, n), cached: (s, n) => bestSeatCells(s, n) },
  { type: 'stonewall', label: '돌담(바람)', heuristic: (s, n) => bestWallCellsHeuristic(s, n), cached: (s, n) => bestWallCells(s, n) },
  { type: 'flower_bed', label: '꽃밭(명당)', heuristic: (s, n) => bestCornerCellsHeuristic(s, 'flower_bed', n), cached: (s, n) => bestCornerCells(s, 'flower_bed', n) },
  { type: PARKING_EXPAND_FROM, label: '주차장', heuristic: (s, n) => bestParkingCellsHeuristic(s, n), cached: (s, n) => bestParkingCells(s, n) },
];

const verdicts: Verdict[] = [];
const tables: string[] = [];

function run(when: string, s: GameState): void {
  if (!QUIET) console.log(`\n## ${when} — ${s.clock.year}년 ${s.clock.month}월 ${s.clock.day}일 · 자금 ₩${s.money.toLocaleString('en-US')} · 시설 ${Object.keys(s.objects).length} · 직원 ${s.staff.length}`);
  for (const t of TARGETS) {
    if (!s.unlocked.objects.includes(t.type) && t.type !== 'table_out') { if (!QUIET) console.log(`\n### ${t.label} — 아직 안 열림`); continue; }
    setSolverResult(null);
    const truth = trueRanking(s, t.type);
    if (truth.rows.length === 0) { if (!QUIET) console.log(`\n### ${t.label} — 놓을 칸 없음`); continue; }

    // 1) 휴리스틱만 (캐시 없음)
    setSolverResult(null);
    const heur = t.heuristic(s, 3);
    verdicts.push(judge(when, t.type, t.label, '휴리스틱', heur, truth));
    // 2) solver 캐시가 찬 뒤 (UI가 실제로 보여 주는 칸)
    solveSync(s, { horizon: HORIZON, top: 8 });
    const cached = t.cached(s, 3);
    verdicts.push(judge(when, t.type, t.label, 'solver 캐시', cached, truth));
    // 3) 튜토리얼 ① 글로우 (야외 테이블만)
    let tut: Pt[] = [];
    if (t.type === 'table_out') {
      setSolverResult(null);
      tut = TUTORIAL_STEP_DEFS[0]!.cells(s);
      verdicts.push(judge(when, t.type, t.label, '튜토리얼 ① 글로우', tut, truth));
    }
    setSolverResult(null);

    if (!QUIET) {
      console.log(`\n### ${t.label} (${t.type}) — 후보 ${truth.rows.length}칸${truth.skipped ? ` (먼 ${truth.skipped}칸 제외)` : ''}`);
      const tie1 = truth.rows.filter((r) => r.rank === 1).length;
      console.log(`1위 동점 ${tie1}칸 / ${truth.rows.length}칸${tie1 === truth.rows.length ? ' — **자리가 성과를 안 가른다**' : ''}`);
      console.log('');
      console.log('| 진짜 순위 | 칸 | 점수 | 30일 자금 | 자리 점수 | 문앞 거리 |');
      console.log('|---|---|---|---|---|---|');
      for (const r of truth.rows.slice(0, 5)) console.log(`| ${r.rank} | (${r.p.x},${r.p.y}) | ${Math.round(r.score).toLocaleString('en-US')} | ₩${Math.round(r.money).toLocaleString('en-US')} | ${r.seat} | ${r.dist} |`);
      const last = truth.rows[truth.rows.length - 1]!;
      console.log(`| 꼴찌 ${last.rank} | (${last.p.x},${last.p.y}) | ${Math.round(last.score).toLocaleString('en-US')} | ₩${Math.round(last.money).toLocaleString('en-US')} | ${last.seat} | ${last.dist} |`);
      console.log('');
      console.log('| 추천 출처 | 추천 3칸 | 1위의 진짜 순위 | 점수 격차 | 30일 자금 격차 | 상위3 적중 |');
      console.log('|---|---|---|---|---|---|');
      for (const v of verdicts.filter((x) => x.when === when && x.type === t.type)) {
        console.log(`| ${v.source} | ${cellsText(v.picks) || '없음'} | ${v.topRank || '—'}위 | ${Math.round(v.scoreGap).toLocaleString('en-US')} | ₩${Math.round(v.moneyGap).toLocaleString('en-US')} | ${v.hits}/3 |`);
      }
    }
    tables.push(`${when}/${t.label}`);
  }
}

const t0 = performance.now();
run('시작 상태', startState(1));
run('시작+메뉴', openedStart(1));
run('1년차 중반', midYear1(1));

// ---------- 요약 ----------
const sources = [...new Set(verdicts.map((v) => v.source))];
console.log('\n## 요약 (목표: 추천 1위가 진짜 상위 3 · 상위 3 적중률 ≥ 70%)\n');
console.log('| 추천 출처 | 1위가 상위3 안 | 평균 1위 순위 | 상위3 적중률 | 최악 1위 순위 | 최대 자금 격차 |');
console.log('|---|---|---|---|---|---|');
for (const src of sources) {
  const vs = verdicts.filter((v) => v.source === src && v.picks.length > 0);
  if (vs.length === 0) continue;
  const inTop3 = vs.filter((v) => v.topRank >= 1 && v.topRank <= 3).length;
  const avg = vs.reduce((a, v) => a + (v.topRank || v.candidates), 0) / vs.length;
  const hit = vs.reduce((a, v) => a + v.hits, 0) / vs.reduce((a, v) => a + Math.min(3, v.picks.length), 0);
  const worst = Math.max(...vs.map((v) => v.topRank || v.candidates));
  const maxGap = Math.max(...vs.map((v) => v.moneyGap));
  console.log(`| ${src} | ${inTop3}/${vs.length} | ${avg.toFixed(1)} | ${(hit * 100).toFixed(0)}% | ${worst}위 | ₩${Math.round(maxGap).toLocaleString('en-US')} |`);
}
console.error(`\n검증 ${tables.length}건 · 지평 ${HORIZON}일 · ${((performance.now() - t0) / 1000).toFixed(0)}s`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(verdicts, null, 2));

/**
 * 최적해 솔버 (pro-guide → solver): 「프로게이머가 있다면 이런 플레이를 했을 것」을 **결정적 sim을 실제로 굴려** 찾는다.
 * 입지 점수 같은 휴리스틱(strategy.ts)은 후보를 줄이는 데만 쓰고, 순위는 롤아웃(복제 상태에 행동을 적용하고 tick으로 H일)으로 매긴다.
 *
 * - cloneState        빠른 깊은 복제 (structuredClone — rng 포함, 캐시(WeakMap)는 새 상태에서 새로 시작)
 * - candidateActions  지금 할 수 있는 행동 후보를 유형별 상위 K개 (돈 부족·불가는 can*·apply로 걸러 낸다)
 * - evaluate          복제 → 행동 → H일 롤아웃 → 점수 (SOLVER_WEIGHTS: 자금 + 자산(철거 환불) + 평판 + 인기 + 목표 − 위험)
 * - bestMoves         빔 서치 (깊이 2 = 이번 수 + H/2일 뒤 다음 수 하나) 상위 3. 같은 상태·같은 옵션 → 같은 답.
 *                     anytime: maxRollouts(결정적)·budgetMs(벽시계, 결과가 시간에 따라 달라질 수 있어 UI에서만)로 후보 수를 줄인다.
 * - solveSync         결과를 solverCache에 넣는다 (헤드리스·테스트). UI는 ui/solverWorker.ts가 같은 일을 워커에서 한다.
 *
 * 성능(2026-09-22, M-series): 하루 tick ≈ 3ms(reachMap 캐시·layoutSig에서 nextId 제거 뒤; 그 전 6ms) → 14일 롤아웃 ≈ 45ms, 30일 ≈ 95ms.
 * 설계 목표였던 「30일 ≤ 8ms」는 손님 시뮬(시간당 스폰·이동·주문)이 비용의 대부분이라 닿지 않는다 — 대신 UI 기본 지평을 14일로 두고 워커에서 돌린다.
 */
import type { GameState, Action, Pt, RoleId, ObjectDef } from './types.ts';
import { objectDef, PROMOTIONS, ROLES, SPOTS, TRAININGS, roleDef, spotDef, menuDef, promotionDef, trainingDef, questDef } from '../data/index.ts';
import { tick } from './tick.ts';
import { DAY_MS } from './clock.ts';
import { apply, PROTECTED_TYPES } from './actions.ts';
import { canPlace } from './grid.ts';
import { placeCost } from './cafe.ts';
import { activeGoals, conditionProgress, checkFeature } from './goals.ts';
import { canHire, canPostJob, canAssign, canLevelUp, staffCapacity, salaryDue } from './staff.ts';
import { upkeepOf } from './economy.ts';
import { canTrain } from './training.ts';
import { canPromote } from './promotions.ts';
import { canInvestSpot, nextSpotLevel, tagPopularity } from './spots.ts';
import { canBuyParcel } from './parcels.ts';
import { canSetSlot, availableMenus, menuOf } from './menu.ts';
import { canAcceptQuest } from './board.ts';
import { canGiveGift } from './items.ts';
import { mainBuilding, freeFloorCells, canExpandMain, canBuildSecondFloor, canAutoConnectPath, MAIN_TYPE } from './rooms.ts';
import { canSetRouteContract, canExpandParking, PARKING_EXPAND_FROM, PARKING_SLOTS } from './entry.ts';
import { seatScore } from './site.ts';
import { dailyGuestCount } from './guests.ts';
import { bestMainCells, bestSeatCellsHeuristic, bestWallCellsHeuristic, bestCornerCellsHeuristic, bestIndoorSeatsHeuristic, bestParkingCellsHeuristic } from './strategy.ts';
import { setSolverResult, solverKey, type SolverMove, type SolverResult } from './solverCache.ts';

// ---------- 가중치 ----------

/** 점수 = Σ 가중치 × (H일 뒤 − 지금). 돈 단위(₩). */
export const SOLVER_WEIGHTS = {
  money: 1,
  /** 시설 자산(철거 환불 = 비용). 1보다 작게 — 짓는 것이 공짜가 아니게 (유지비·기회비용) */
  asset: 0.8,
  /** 평판 1점 */
  reputation: 50_000,
  /** 하루 손님 기반값(guests.dailyGuestCount — 손님층·시설 인기·명소·평판·좌석 상한) 1명/일 ≈ 한 달 매출 (state.popularity는 동네↔인기 게이지라 안 본다) */
  dailyGuests: 100_000,
  /** 메인 목표 1개 달성 */
  goal: 1_000_000,
  /** 진행 중 목표의 진행률(0~1) 1.0 */
  goalProgress: 400_000,
  /** 적자 달 1회 */
  deficitMonth: -1_500_000,
  /** 평판 20 아래로 떨어짐 */
  lowReputation: -3_000_000,
  /** 롤아웃 중 잔고가 0 아래로 (파산) */
  bankrupt: -20_000_000,
  /** 롤아웃 끝 무렵의 월 순이익 추정(runRate: 마지막 TAIL_DAYS일 매출 × 30/TAIL − 월급·유지비) 1개월분 — 지평 너머의 가치. 직원·좌석 같은 투자가 H일 안에 본전을 못 뽑아도 보이게 */
  runRate: 1,
} as const;
/** runRate를 재는 롤아웃 끝 구간(일) */
export const TAIL_DAYS = 7;
export const LOW_REPUTATION = 20;

export interface SolverOptions {
  /** 빔 폭 (깊이 2로 더 보는 상위 수) */
  beam: number;
  /** 1 = 이번 수만, 2 = 이번 수 + H/2일 뒤 다음 수 하나 */
  depth: number;
  /** 롤아웃 일수 */
  horizon: number;
  /** 깊이 1에서 평가하는 후보 수 상한 (우선순위 순) */
  maxCandidates: number;
  /** 깊이 2에서 보는 다음 수 후보 수 */
  second: number;
  /** 롤아웃 수 상한 (결정적 anytime) — 넘으면 남은 후보는 평가하지 않는다 */
  maxRollouts: number;
  /** 벽시계 예산(ms) — 지나면 남은 후보를 건너뛴다. 결과가 시간에 따라 달라질 수 있어 UI 워커에서만 쓴다 */
  budgetMs?: number;
  /** 시각 함수 (테스트용 주입). budgetMs가 있을 때만 쓴다 */
  now?: () => number;
  /** 돌려주는 수 */
  top: number;
}
export const DEFAULT_SOLVER_OPTIONS: SolverOptions = { beam: 3, depth: 2, horizon: 30, maxCandidates: 48, second: 4, maxRollouts: 200, top: 3 };
/** UI 워커 기본 (하루 안에 답이 나오게 지평을 줄인다) */
export const UI_SOLVER_OPTIONS: Partial<SolverOptions> = { horizon: 14, maxCandidates: 40, maxRollouts: 80, budgetMs: 4_000 };
/** 헤드리스 봇 정책 (bot.ts policy 'solver') */
export const BOT_SOLVER_OPTIONS: Partial<SolverOptions> = { horizon: 14, depth: 1, maxCandidates: 12, maxRollouts: 12, top: 1 };

// ---------- 복제 ----------

/** 깊은 복제 — rng 포함. 원본과 완전히 독립(WeakMap 캐시도 새 키). */
export function cloneState(s: GameState): GameState {
  return structuredClone(s);
}

// ---------- 후보 ----------

export interface SolverCandidate { action: Action; label: string; cells: Pt[]; targets: string[]; prio: number }

/** 시설이 짓기 창 어느 탭에 있나 (ui/windows/BuildWindow.tsx buildTabOf와 같은 규칙 — 글로우 타깃용) */
export function buildTabOf(def: ObjectDef): string {
  if (def.indoor) return 'indoor';
  if (def.kind === 'path') return 'path';
  if (def.kind === 'wall' || def.kind === 'gate') return 'wall';
  if (def.kind === 'tree' || def.yield || def.category === 'farm') return 'farm';
  if (def.category === 'rest' || def.category === 'convenience' || def.category === 'food' || def.category === 'fun') return def.category;
  if (def.kind === 'seat') return 'rest';
  return 'scenery';
}
const buildTargets = (def: ObjectDef) => ['nav:build', `tab:${buildTabOf(def)}`, `build:${def.id}`];
const cellLabel = (p: Pt) => `(${p.x},${p.y})`;

/** 시설 종류별 후보 칸 (휴리스틱 프루닝 — 순위는 롤아웃이 정한다) */
function cellsFor(s: GameState, def: ObjectDef, k: number): Pt[] {
  if (def.kind === 'path' || def.kind === 'gate' || def.kind === 'busstop' || def.room || def.kind === 'building') return [];
  if (PARKING_SLOTS[def.id] !== undefined) return def.id === PARKING_EXPAND_FROM ? bestParkingCellsHeuristic(s, k) : [];
  if (def.indoor) return def.kind === 'seat' ? bestIndoorSeatsHeuristic(s, k) : indoorCells(s, def.id, k);
  if (def.kind === 'seat') return bestSeatCellsHeuristic(s, k, def.id);
  if (def.kind === 'wall') return bestWallCellsHeuristic(s, k);
  return bestCornerCellsHeuristic(s, def.id, k);
}
function indoorCells(s: GameState, type: string, k: number): Pt[] {
  const m = mainBuilding(s);
  if (!m || s.main.work) return [];
  return freeFloorCells(s, m).filter((p) => canPlace(s, type, p.x, p.y).ok).slice(0, k);
}
/** 유형별 우선순위 (anytime 잘림·후보 상한에 쓴다). 큰 것부터. */
function placePrio(s: GameState, def: ObjectDef, p: Pt): number {
  if (def.kind === 'seat' && !def.indoor) return 80 + seatScore(s, p.x, p.y) / 10;
  if (def.kind === 'seat') return 62;
  if (def.kind === 'wall') return 60;
  if (def.kind === 'tree') return 50;
  if (PARKING_SLOTS[def.id] !== undefined) return 45;
  return 30 - Math.min(20, def.cost / 1_000_000); // 싼 것부터
}

/** 지금 할 수 있는 행동 후보 (유형별 상위 K개, 우선순위 내림차순, 결정적). 돈 부족·불가는 뺀다. 「아무것도 안 함」은 bestMoves가 따로 기준선으로 돌린다. */
export function candidateActions(s: GameState, k = 3): SolverCandidate[] {
  const out: SolverCandidate[] = [];
  const add = (c: SolverCandidate) => out.push(c);

  // 본관·길
  if (!mainBuilding(s)) {
    for (const p of bestMainCells(s, k)) add({ action: { type: 'placeMain', x: p.x, y: p.y }, label: `본관 ${cellLabel(p)}`, cells: [p], targets: ['nav:build', 'tab:building', `build:${MAIN_TYPE}`], prio: 100 });
    return out;
  }
  const auto = canAutoConnectPath(s);
  if (auto.ok && auto.route && s.money >= auto.route.cost) add({ action: { type: 'autoConnectPath' }, label: '문 앞까지 올렛길 잇기', cells: auto.route.route ?? [], targets: ['nav:build', 'tab:path', 'build:path'], prio: 95 });

  // 시설 배치: 열린 것 × 후보 칸
  for (const type of [...s.unlocked.objects].sort()) {
    const def = objectDef(type);
    const cost = placeCost(s, type);
    if (cost <= 0 || s.money < cost) continue;
    for (const p of cellsFor(s, def, def.kind === 'seat' ? k + 2 : k)) {
      if (!canPlace(s, type, p.x, p.y).ok) continue;
      add({ action: { type: 'place', objectType: type, x: p.x, y: p.y }, label: `${def.name} ${cellLabel(p)}`, cells: [p], targets: buildTargets(def), prio: placePrio(s, def, p) });
    }
  }

  // 메뉴: 빈 칸에 아직 없는 메뉴 (비싼 순 k개)
  const empty = s.menuSlots.findIndex((m) => m === null);
  if (empty >= 0) {
    const menus = availableMenus(s).filter((id) => !s.menuSlots.includes(id) && canSetSlot(s, empty, id).ok).sort((a, b) => menuOf(s, b).price - menuOf(s, a).price || a.localeCompare(b)).slice(0, k);
    for (const id of menus) add({ action: { type: 'setSlot', slot: empty, menuId: id }, label: `메뉴판에 ${menuDef(id).name}`, cells: [], targets: ['nav:cafe', 'tab:menu', 'menu-put'], prio: 75 });
  }

  // 직원: 채용(후보 × 열린 직종)·공고·배치·승급·연수
  const roles = ROLES.filter((r) => s.unlocked.roles.includes(r.id)).map((r) => r.id as RoleId);
  let hires = 0;
  for (const c of s.candidates) for (const role of roles) {
    if (hires >= k + 1 || !canHire(s, c.id, role).ok) continue;
    add({ action: { type: 'hire', candidateId: c.id, role }, label: `${c.name} ${roleDef(role).name}로 채용`, cells: [], targets: ['nav:people', 'tab:candidates', 'hire'], prio: 70 });
    hires++;
  }
  if (s.candidates.length === 0 && s.staff.length < staffCapacity(s) && canPostJob(s, 'flyer').ok) add({ action: { type: 'postJob', tier: 'flyer' }, label: '전단 공고 (후보 모으기)', cells: [], targets: ['nav:people', 'tab:candidates'], prio: 40 });
  for (const st of s.staff) {
    if (st.role === null) for (const role of roles) if (canAssign(s, st.id, role).ok) { add({ action: { type: 'assign', staffId: st.id, role }, label: `${st.name} ${roleDef(role).name}로 배치`, cells: [], targets: ['nav:people', 'tab:staff', 'assign'], prio: 68 }); break; }
    if (canLevelUp(s, st.id).ok) add({ action: { type: 'levelUp', staffId: st.id }, label: `${st.name} 승급`, cells: [], targets: ['nav:people', 'tab:staff'], prio: 32 });
  }
  let trains = 0;
  for (const st of s.staff) for (const t of TRAININGS) {
    if (trains >= k || !canTrain(s, st.id, t.id).ok) continue;
    add({ action: { type: 'train', staffId: st.id, trainingId: t.id }, label: `${st.name} ${trainingDef(t.id).name}`, cells: [], targets: ['nav:people', 'tab:staff', 'train', 'train-pick'], prio: 30 });
    trains++;
  }

  // 홍보 6종: 각각 기력이 가장 높은 직원 하나
  for (const pr of PROMOTIONS) {
    const st = [...s.staff].filter((x) => canPromote(s, x.id, pr.id).ok).sort((a, b) => b.energy - a.energy || a.id.localeCompare(b.id))[0];
    if (st) add({ action: { type: 'promote', staffId: st.id, promotionId: pr.id }, label: `홍보 「${promotionDef(pr.id).name}」 (${st.name})`, cells: [], targets: ['nav:cafe', 'tab:promo', 'promote'], prio: 55 });
  }

  // 도전·부탁 수락
  let q = 0;
  for (const qs of Object.values(s.board.quests).sort((a, b) => a.id.localeCompare(b.id))) { if (q >= k || qs.status !== 'offered' || !canAcceptQuest(s, qs.id).ok) continue; add({ action: { type: 'acceptQuest', id: qs.id }, label: `부탁 「${questDef(qs.id).description}」 수락`, cells: [], targets: ['nav:ledger', 'tab:invest'], prio: 35 }); q++; }

  // 본관 증축·2층
  if (canExpandMain(s).ok) add({ action: { type: 'expandMain' }, label: `본관 Lv${s.main.level + 1} 증축`, cells: [], targets: ['main-expand'], prio: 42 });
  if (canBuildSecondFloor(s).ok) add({ action: { type: 'buildSecondFloor' }, label: '본관 2층 올리기', cells: [], targets: ['main-expand'], prio: 36 });

  // 명소 투자 (손님층 인기 순 k개)
  const spots = SPOTS.filter((d) => canInvestSpot(s, d.id).ok).map((d) => ({ d, pop: tagPopularity(s, d.tag), cost: nextSpotLevel(s, d.id)?.cost ?? Infinity })).sort((a, b) => b.pop - a.pop || a.cost - b.cost || a.d.id.localeCompare(b.d.id)).slice(0, k);
  for (const { d, cost } of spots) add({ action: { type: 'investSpot', id: d.id }, label: `명소 「${spotDef(d.id).name}」 투자 (₩${Math.round(cost / 10_000)}만)`, cells: [], targets: ['nav:ledger', 'tab:spots', 'spot-invest'], prio: 38 });

  // 필지
  let parcels = 0;
  for (const p of s.parcels) { if (parcels >= 2 || p.owned || !canBuyParcel(s, p.id).ok) continue; add({ action: { type: 'buyParcel', id: p.id }, label: `필지 「${p.name}」 사기`, cells: [{ x: p.x, y: p.y }], targets: ['nav:ledger', 'tab:invest'], prio: 28 }); parcels++; }

  // 경로: 셔틀 계약·주차장 넓히기
  if (canSetRouteContract(s, 'shuttle', true).ok) add({ action: { type: 'setRouteContract', route: 'shuttle', on: true }, label: '공항 셔틀 계약', cells: [], targets: ['nav:ledger', 'tab:invest'], prio: 34 });
  for (const o of Object.values(s.objects)) if (o.type === PARKING_EXPAND_FROM && canExpandParking(s, o.id).ok) { add({ action: { type: 'expandParking', objectId: o.id }, label: '주차장 넓히기', cells: [{ x: o.x, y: o.y }], targets: ['nav:build', 'tab:convenience'], prio: 33 }); break; }

  // 선물: 지금 있는 손님 하나에게 가진 선물 하나
  outer: for (const [itemId, n] of Object.entries(s.inventory).sort(([a], [b]) => a.localeCompare(b))) {
    if (n <= 0) continue;
    for (const g of s.guests) if (canGiveGift(s, g.id, itemId).ok) { add({ action: { type: 'giveGift', guestId: g.id, itemId }, label: '손님에게 선물', cells: [], targets: ['gift'], prio: 20 }); break outer; }
  }

  // 기능 잠금(goals.ts 표 — 필지·홍보·개발 …)에 걸린 행동은 apply가 거부하므로 뺀다
  const open = out.filter((c) => checkFeature(s, c.action.type).ok);
  open.sort((a, b) => b.prio - a.prio || a.label.localeCompare(b.label));
  return open;
}
/** 후보의 유형 (다양성 유지용): 배치는 시설 종류(kind), 나머지는 행동 종류 */
export function candidateGroup(c: SolverCandidate): string {
  return c.action.type === 'place' ? `place:${objectDef(c.action.objectType).kind}` : c.action.type;
}
/** 상위 n개를 유형별로 돌아가며 뽑는다 (우선순위 순 유형 → 각 유형에서 하나씩, 다음 바퀴). 좌석 후보 열 개가 채용·홍보를 밀어내지 않게. */
export function pickDiverse(cands: SolverCandidate[], n: number): SolverCandidate[] {
  const groups = new Map<string, SolverCandidate[]>();
  for (const c of cands) { const g = candidateGroup(c); const arr = groups.get(g); if (arr) arr.push(c); else groups.set(g, [c]); }
  const queues = [...groups.values()];
  const out: SolverCandidate[] = [];
  for (let round = 0; out.length < n && queues.some((q) => q.length > round); round++) for (const q of queues) { if (out.length >= n) break; const c = q[round]; if (c) out.push(c); }
  return out;
}

// ---------- 평가 ----------

export interface Metrics { money: number; assets: number; reputation: number; dailyGuests: number; goals: number; goalProgress: number; deficit: number; minMoney: number; /** 롤아웃 뒤에만 (지금 상태는 0) */ runRate: number }
export interface RolloutStat { minMoney: number; tailIncome: number; tailDays: number }
/** 월 고정비 추정: 월급(미배치는 반값) + 시설 유지비 */
export function monthlyCosts(s: GameState): number {
  let c = 0;
  for (const st of s.staff) c += salaryDue(st);
  for (const o of Object.values(s.objects)) c += upkeepOf(s, o);
  return c;
}
export function metricsOf(s: GameState, r: RolloutStat = { minMoney: s.money, tailIncome: 0, tailDays: 0 }): Metrics {
  let assets = 0;
  for (const o of Object.values(s.objects)) { const d = objectDef(o.type); if (!PROTECTED_TYPES.has(o.type) && !d.removeCost && !d.room) assets += d.cost; }
  let goalProgress = 0;
  for (const g of activeGoals(s)) { const p = conditionProgress(s, g.condition); if (p.max > 0) goalProgress += Math.min(1, p.cur / p.max); }
  const runRate = r.tailDays > 0 ? r.tailIncome * (30 / r.tailDays) - monthlyCosts(s) : 0;
  return { money: s.money, assets, reputation: s.reputation, dailyGuests: dailyGuestCount(s), goals: s.goals.claimed.length, goalProgress, deficit: s.deficitMonths, minMoney: r.minMoney, runRate };
}
/** 지금(m0) → H일 뒤(m1) 점수 (돈 단위) */
export function scoreOf(m0: Metrics, m1: Metrics, W = SOLVER_WEIGHTS): number {
  let sc = W.money * (m1.money - m0.money) + W.asset * (m1.assets - m0.assets) + W.reputation * (m1.reputation - m0.reputation) + W.dailyGuests * (m1.dailyGuests - m0.dailyGuests)
    + W.goal * (m1.goals - m0.goals) + W.goalProgress * (m1.goalProgress - m0.goalProgress) + W.deficitMonth * Math.max(0, m1.deficit - m0.deficit) + W.runRate * (m1.runRate - m0.runRate);
  if (m1.reputation < LOW_REPUTATION && m0.reputation >= LOW_REPUTATION) sc += W.lowReputation;
  if (m1.minMoney < 0) sc += W.bankrupt;
  return sc;
}

/** 복제 상태를 days일 굴린다 (알림·월말 카드는 봇처럼 바로 닫는다). 최저 잔고와 끝 구간(TAIL_DAYS) 매출을 돌려준다. 원본은 건드리지 않는다. */
export function rolloutDays(s: GameState, days: number): RolloutStat {
  s.clock.speed = 1;
  s.clock.carryMs = 0;
  let min = s.money;
  const tailDays = Math.min(TAIL_DAYS, days);
  let incomeAtTail = s.totalIncome;
  for (let d = 0; d < days; d++) {
    if (d === days - tailDays) incomeAtTail = s.totalIncome;
    tick(s, DAY_MS);
    if (s.alerts.length) s.alerts.length = 0;
    if (s.lastMonthCard) s.lastMonthCard = null;
    if (s.money < min) min = s.money;
  }
  return { minMoney: min, tailIncome: s.totalIncome - incomeAtTail, tailDays };
}

export interface Evaluation { ok: boolean; score: number; metrics: Metrics; state: GameState }
/** 복제 상태에 action(없으면 아무것도 안 함)을 적용하고 H일 롤아웃 → 점수. 행동이 불가면 ok:false. */
export function evaluate(s0: GameState, action: Action | null, horizonDays = DEFAULT_SOLVER_OPTIONS.horizon, base: Metrics = metricsOf(s0)): Evaluation {
  const s = cloneState(s0);
  if (action && !apply(s, action).ok) return { ok: false, score: -Infinity, metrics: base, state: s };
  const m = metricsOf(s, rolloutDays(s, horizonDays));
  return { ok: true, score: scoreOf(base, m), metrics: m, state: s };
}

// ---------- 빔 서치 ----------

function fmtWon(n: number): string {
  const sign = n < 0 ? '−' : '+';
  const a = Math.abs(Math.round(n));
  return a >= 10_000 ? `${sign}₩${Math.round(a / 10_000).toLocaleString('en-US')}만` : `${sign}₩${a.toLocaleString('en-US')}`;
}
function whyOf(h: number, d: SolverMove['delta']): string {
  const parts = [`자금 ${fmtWon(d.money)}`];
  if (d.reputation !== 0) parts.push(`평판 ${d.reputation > 0 ? '+' : '−'}${Math.abs(Math.round(d.reputation * 10) / 10)}`);
  if (d.goals !== 0) parts.push(`목표 ${d.goals > 0 ? '+' : '−'}${Math.abs(d.goals)}`);
  return `${h}일 뒤 ${parts.join(' · ')}`; // 문구 규칙 §6: 「시뮬」·「굴려 보니」 없이
}

/** 빔 서치: 후보(우선순위 순) 각각 H일 롤아웃 → 상위 beam은 H/2일 뒤 다음 수 second개까지 보고 최댓값 → 상위 top. 점수·delta는 「아무것도 안 함」 대비. */
export function bestMoves(s0: GameState, opts: Partial<SolverOptions> = {}): SolverResult {
  const o: SolverOptions = { ...DEFAULT_SOLVER_OPTIONS, ...opts };
  const now = o.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const t0 = now();
  const over = () => (o.budgetMs !== undefined && now() - t0 > o.budgetMs);
  const base = metricsOf(s0);
  let rollouts = 0;
  const H = o.horizon, H1 = Math.ceil(H / 2), H2 = H - H1;

  // 기준선: 아무것도 안 함
  const noop = evaluate(s0, null, H, base); rollouts++;

  // 깊이 1
  const cands = pickDiverse(candidateActions(s0), o.maxCandidates);
  const scored: { c: SolverCandidate; score: number; ev: Evaluation }[] = [];
  for (const c of cands) {
    if (rollouts >= o.maxRollouts || over()) break;
    const ev = evaluate(s0, c.action, H, base); rollouts++;
    if (ev.ok) scored.push({ c, score: ev.score, ev });
  }
  scored.sort((a, b) => b.score - a.score || a.c.label.localeCompare(b.c.label));

  // 깊이 2: 상위 beam은 H/2일 뒤 다음 수까지 (최댓값이 그 수의 점수)
  if (o.depth >= 2 && H2 > 0) {
    for (const top of scored.slice(0, o.beam)) {
      if (rollouts + 1 + o.second > o.maxRollouts || over()) break;
      const mid = cloneState(s0);
      if (!apply(mid, top.c.action).ok) continue;
      const r1 = rolloutDays(mid, H1); rollouts++;
      const seconds = pickDiverse(candidateActions(mid), o.second);
      let best = top.score;
      for (const sc of seconds) {
        if (rollouts >= o.maxRollouts || over()) break;
        const s2 = cloneState(mid);
        if (!apply(s2, sc.action).ok) continue;
        const r2 = rolloutDays(s2, H2); rollouts++;
        best = Math.max(best, scoreOf(base, metricsOf(s2, { ...r2, minMoney: Math.min(r1.minMoney, r2.minMoney) })));
      }
      top.score = best;
    }
    scored.sort((a, b) => b.score - a.score || a.c.label.localeCompare(b.c.label));
  }

  const moves: SolverMove[] = scored.slice(0, o.top).map(({ c, score, ev }) => {
    const delta = { money: ev.metrics.money - noop.metrics.money, reputation: ev.metrics.reputation - noop.metrics.reputation, goals: ev.metrics.goals - noop.metrics.goals };
    return { action: c.action, score: score - noop.score, delta, why: whyOf(H, delta), label: c.label, cells: c.cells, targets: c.targets, horizon: H };
  });
  if (moves.length >= 2) {
    const gap = moves[0]!.score - moves[1]!.score;
    if (gap > 0) moves[0]!.why += `, 2위보다 ${fmtWon(gap).slice(1)} 더`;
  }
  return { key: solverKey(s0), moves, horizon: H, rollouts, ms: now() - t0 };
}

/** 동기 실행 + 캐시 저장 (헤드리스·테스트). 렌더 경로에서 부르지 말 것 — UI는 ui/solverClient.ts(워커). */
export function solveSync(s: GameState, opts: Partial<SolverOptions> = {}): SolverResult {
  const r = bestMoves(s, opts);
  setSolverResult(r);
  return r;
}

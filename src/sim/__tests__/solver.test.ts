import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { serialize } from '../save.ts';
import { TUTORIAL_SEAT_CELL } from '../strategy.ts';
import { STEPS, recommendedMainCells, currentTutorialStep, TUTORIAL_STEPS } from '../tutorial.ts';
import { cloneState, candidateActions, pickDiverse, candidateGroup, evaluate, bestMoves, solveSync, metricsOf, scoreOf, rolloutDays, SOLVER_WEIGHTS, DEFAULT_SOLVER_OPTIONS } from '../solver.ts';
import { solverKey, solverResult, setSolverResult, rankCellsByCache, cachedMoves } from '../solverCache.ts';
import { bestSeatCells, bestSeatCellsHeuristic, nextMove, strategyVars, heuristicNextMove, SOLVER_SEAT_K } from '../strategy.ts';
import { idleHint } from '../hints.ts';
import { seatScore } from '../site.ts';
import { canPlace } from '../grid.ts';
import { handleSolve } from '../../ui/solverProtocol.ts';
import type { GameState, Pt } from '../types.ts';

/** 본관 + 문 앞까지 올렛길 = fun-start 새 게임 시작 모습 (strategy.test와 같은 마당) */
function yardWithPath(seed = 1): GameState {
  return createInitialState(seed, 'local', 0, 'tutorial');
}
/** 완성 시작 상태(영업 중) — 롤아웃에 손님이 온다 */
function starter(seed = 1): GameState { return createInitialState(seed); }

describe('solver: 상태 복제', () => {
  it('cloneState는 독립적이고(원본 불변) 결정적이다 — 복제 둘을 같은 날수 굴리면 같은 결과, 원본은 그대로', () => {
    const s = starter();
    const before = serialize(s);
    const a = cloneState(s), b = cloneState(s);
    expect(a).not.toBe(s);
    expect(a.grid.cells).not.toBe(s.grid.cells);
    expect(serialize(a)).toBe(before);
    rolloutDays(a, 3); rolloutDays(b, 3);
    expect(serialize(a)).toBe(serialize(b));
    expect(a.tick).toBeGreaterThan(s.tick);
    expect(serialize(s)).toBe(before); // 원본은 안 움직였다 (rng·손님·돈 그대로)
  });
});

describe('solver: 후보 행동', () => {
  it('candidateActions는 불가·돈 부족 행동을 내지 않는다 — 모든 후보가 복제 상태에 apply 가능, 우선순위 내림차순, 결정적', () => {
    for (const s of [yardWithPath(), starter(), starter(2)]) {
      const cands = candidateActions(s);
      expect(cands.length).toBeGreaterThan(0);
      for (const c of cands) {
        const t = cloneState(s);
        expect(apply(t, c.action).ok, c.label).toBe(true);
        expect(c.label).not.toMatch(/[a-z]+_[a-z]+/); // 영문 id 노출 없음
        for (const p of c.cells) expect(p.x >= 0 && p.y >= 0 && p.x < s.grid.w && p.y < s.grid.h).toBe(true);
      }
      for (let i = 1; i < cands.length; i++) expect(cands[i]!.prio).toBeLessThanOrEqual(cands[i - 1]!.prio);
      expect(candidateActions(s)).toEqual(cands);
    }
  });

  it('돈이 없으면 짓기·투자 후보가 빠지고, 본관이 없으면 본관 자리 후보만', () => {
    const s = starter();
    s.money = 0;
    const cands = candidateActions(s);
    expect(cands.some((c) => c.action.type === 'place' || c.action.type === 'investSpot' || c.action.type === 'buyParcel')).toBe(false);
    const bare = createInitialState(1, 'local', 0, 'bare');
    const c0 = candidateActions(bare);
    expect(c0.length).toBeGreaterThan(0);
    expect(c0.every((c) => c.action.type === 'placeMain')).toBe(true);
    expect(c0.map((c) => c.cells[0])).toEqual(recommendedMainCells(bare));
  });

  it('좌석 후보 칸은 휴리스틱 상위 SOLVER_SEAT_K칸과 같고 놓을 수 있는 칸이다 (verify: 창이 좁으면 롤아웃이 좋은 칸을 못 본다)', () => {
    const s = starter();
    const seats = candidateActions(s).filter((c) => c.action.type === 'place' && c.action.objectType === 'table_out').map((c) => c.cells[0]!);
    const key = (p: Pt) => `${p.x},${p.y}`;
    expect(seats.map(key).sort()).toEqual(bestSeatCellsHeuristic(s, SOLVER_SEAT_K).map(key).sort());
    for (const p of seats) expect(canPlace(s, 'table_out', p.x, p.y).ok).toBe(true);
  });
});

describe('solver: 후보 다양성', () => {
  it('pickDiverse는 유형(좌석·나무·채용·홍보 …)별로 돌아가며 뽑아 좌석 후보 열 개가 채용을 밀어내지 않는다', () => {
    const s = starter();
    const all = candidateActions(s);
    const picked = pickDiverse(all, 12);
    expect(picked).toHaveLength(Math.min(12, all.length));
    const groups = new Set(picked.map(candidateGroup));
    expect(groups.size).toBeGreaterThan(3);
    expect(picked.some((c) => c.action.type === 'hire')).toBe(true);
    expect(picked.some((c) => c.action.type === 'place' && c.action.objectType === 'table_out')).toBe(true);
    expect(pickDiverse(all, 12)).toEqual(picked); // 결정적
    expect(new Set(picked).size).toBe(picked.length); // 중복 없음
  });
});

describe('solver: 평가', () => {
  it('evaluate는 원본을 바꾸지 않고, 불가 행동은 ok:false, 점수는 가중치 표(SOLVER_WEIGHTS)로 잰다', () => {
    const s = starter();
    const before = serialize(s);
    const ev = evaluate(s, null, 7);
    expect(ev.ok).toBe(true);
    expect(serialize(s)).toBe(before);
    expect(ev.state.tick).toBeGreaterThan(s.tick);
    const bad = evaluate(s, { type: 'place', objectType: 'table_out', x: 0, y: 0 }, 7);
    expect(bad.ok).toBe(false);
    expect(bad.score).toBe(-Infinity);
    const m0 = metricsOf(s);
    expect(scoreOf(m0, { ...m0, money: m0.money + 1000 })).toBe(1000 * SOLVER_WEIGHTS.money);
    expect(scoreOf(m0, { ...m0, goals: m0.goals + 1 })).toBe(SOLVER_WEIGHTS.goal);
    expect(scoreOf(m0, { ...m0, minMoney: -1 })).toBe(SOLVER_WEIGHTS.bankrupt);
    expect(scoreOf(m0, { ...m0, runRate: 100_000 })).toBe(100_000 * SOLVER_WEIGHTS.runRate);
    expect(scoreOf(m0, { ...m0, reputation: 10 })).toBeLessThan(0);
  });

  it('점수 단조성: 걸어 닿는 좋은 자리(입지 최고)의 야외 테이블이 닿지 않는·나쁜 자리보다 롤아웃 점수가 높다', () => {
    const s = yardWithPath(); // 자리 0 + 메뉴 2 → 닿는 자리를 놓아야 영업이 시작된다
    apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }); apply(s, { type: 'setSlot', slot: 1, menuId: 'tangerine_juice' });
    const good = bestSeatCellsHeuristic(s, 1)[0]!;
    // 나쁜 자리: 놓을 수는 있지만 정류장에서 걸어 닿지 않아 손님이 앉지 못하는 칸 (= 휴리스틱 후보에 아예 안 드는 칸)
    const all = bestSeatCellsHeuristic(s, 999);
    let bad: Pt | null = null;
    outer: for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
      if (!canPlace(s, 'table_out', x, y).ok) continue;
      if (!all.some((p) => p.x === x && p.y === y)) { bad = { x, y }; break outer; }
    }
    expect(bad).not.toBeNull();
    const H = 14;
    const evGood = evaluate(s, { type: 'place', objectType: 'table_out', ...good }, H);
    const evBad = evaluate(s, { type: 'place', objectType: 'table_out', ...bad! }, H);
    expect(evGood.ok && evBad.ok).toBe(true);
    expect(evGood.score).toBeGreaterThan(evBad.score);
  });
});

describe('solver: 빔 서치', () => {
  it('bestMoves는 결정적(같은 상태·옵션 → 같은 답)이고 상위 3을 점수 내림차순으로, 각 수에 저축 대비 delta·근거·타깃을 붙인다', () => {
    const s = starter();
    const o = { horizon: 7, maxCandidates: 8, maxRollouts: 20 };
    const a = bestMoves(s, o), b = bestMoves(s, o);
    expect(a.moves).toEqual(b.moves);
    expect(a.rollouts).toBe(b.rollouts);
    expect(a.moves.length).toBeGreaterThan(0);
    expect(a.moves.length).toBeLessThanOrEqual(DEFAULT_SOLVER_OPTIONS.top);
    for (let i = 1; i < a.moves.length; i++) expect(a.moves[i]!.score).toBeLessThanOrEqual(a.moves[i - 1]!.score);
    for (const m of a.moves) {
      expect(m.why).toMatch(/^7일 뒤 자금 [+−]₩/);
      expect(m.targets.length).toBeGreaterThan(0);
      expect(typeof m.delta.money).toBe('number');
      expect(m.horizon).toBe(7);
    }
    expect(a.key).toBe(solverKey(s));
  });

  it('예산 준수: maxRollouts를 넘지 않고(결정적 anytime), budgetMs(주입한 시계)가 다 되면 남은 후보를 건너뛴다', () => {
    const s = starter();
    const r = bestMoves(s, { horizon: 3, maxRollouts: 5 });
    expect(r.rollouts).toBeLessThanOrEqual(5);
    // 가짜 시계: 호출마다 100ms씩 흐른다 → 예산 250ms면 기준선 + 후보 한둘에서 끊긴다
    let t = 0;
    const r2 = bestMoves(s, { horizon: 3, budgetMs: 250, now: () => (t += 100) });
    expect(r2.rollouts).toBeLessThan(6);
    expect(r2.ms).toBeGreaterThan(0);
    // 깊이 2는 예산 안에서만 — 롤아웃 수가 상한을 넘지 않는다
    const r3 = bestMoves(s, { horizon: 4, maxCandidates: 4, maxRollouts: 9, depth: 2, beam: 2, second: 2 });
    expect(r3.rollouts).toBeLessThanOrEqual(9);
  });

  it('solveSync는 결과를 캐시에 넣고, strategy·hints가 같은 상태에서만 그 결과를 쓴다 — 상태 키가 바뀌면 휴리스틱으로 돌아간다', () => {
    setSolverResult(null);
    const s = starter();
    expect(solverResult(s)).toBeNull();
    expect(nextMove(s)).toEqual(heuristicNextMove(s));
    expect(strategyVars(s).solverDelta).toBe('');
    const r = solveSync(s, { horizon: 7, maxCandidates: 10, maxRollouts: 12 });
    expect(solverResult(s)).toBe(r);
    const top = cachedMoves(s, (m) => m.score > 0)[0];
    expect(top).toBeDefined(); // 완성 시작 상태에는 저축보다 나은 수가 있다
    expect(nextMove(s)!.move).toBe(top);
    expect(nextMove(s)!.text).toContain(top!.why);
    expect(idleHint(s)).toContain(`할망: ${top!.label}`);
    expect(strategyVars(s).solverDelta).toMatch(/^7일 뒤 자금/);
    expect(idleHint(s)).not.toMatch(/시뮬|정석|굴려 보니|→ 지금/); // 문구 규칙 §6
    // 하루 지나면(날이 키에 들어간다) 캐시는 안 맞는다
    tick(s, DAY_MS);
    expect(solverResult(s)).toBeNull();
    expect(strategyVars(s).solverDelta).toBe('');
    setSolverResult(null);
  });

  it('rankCellsByCache: 캐시의 배치 수 점수순으로 칸을 다시 세우고, 없는 칸은 원래 순서 뒤에 둔다', () => {
    const s = starter();
    const cells: Pt[] = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    const mv = (x: number, y: number, score: number) => ({ action: { type: 'place' as const, objectType: 'table_out', x, y }, score, delta: { money: 0, reputation: 0, goals: 0 }, why: '', label: '', cells: [{ x, y }], targets: [], horizon: 7 });
    setSolverResult({ key: solverKey(s), moves: [mv(3, 3, 10), mv(2, 2, 20)], horizon: 7, rollouts: 3, ms: 1 });
    expect(rankCellsByCache(s, 'table_out', cells)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 1, y: 1 }]);
    expect(rankCellsByCache(s, 'stonewall', cells)).toEqual(cells);
    setSolverResult(null);
    expect(rankCellsByCache(s, 'table_out', cells)).toEqual(cells);
  });
});

describe('solver: 튜토리얼 글로우·워커', () => {
  it('튜토리얼 1단계 글로우는 사용자가 고른 칸(15,11)이고 solver 캐시가 있어도 흔들리지 않는다 — 14단계 정의 전부 cells가 안전', () => {
    setSolverResult(null);
    const s = yardWithPath();
    apply(s, { type: 'tutorialNote', key: 'dlg:1' });
    expect(currentTutorialStep(s)!.id).toBe(1);
    const r = solveSync(s, { horizon: 7, maxCandidates: 12, maxRollouts: 14 });
    const seatMoves = r.moves.filter((m) => m.action.type === 'place' && m.action.objectType === 'table_out');
    const glow = STEPS[0]!.cells(s);
    expect(glow).toHaveLength(1);
    expect(glow[0]).toEqual(TUTORIAL_SEAT_CELL); // 사용자가 직접 고른 자리 — solver 1위와 같을 필요는 없다
    expect(canPlace(s, 'table_out', glow[0]!.x, glow[0]!.y).ok).toBe(true);
    expect(seatMoves.length).toBeGreaterThanOrEqual(0);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...glow[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(1);
    for (const st of STEPS) { const cells = st.cells(s); for (const p of cells) expect(p.x >= 0 && p.y >= 0).toBe(true); }
    expect(TUTORIAL_STEPS).toBe(14);
    setSolverResult(null);
  });

  it('워커 메시지 round-trip(순수 함수): 상태 JSON → handleSolve → 보낸 키 그대로·bestMoves와 같은 수', () => {
    const s = starter();
    const opts = { horizon: 5, maxCandidates: 6, maxRollouts: 8 };
    const res = handleSolve({ id: 7, key: solverKey(s), json: serialize(s), opts });
    expect(res.id).toBe(7);
    expect(res.result.key).toBe(solverKey(s));
    const direct = bestMoves(s, opts);
    expect(res.result.moves.map((m) => [m.label, Math.round(m.score)])).toEqual(direct.moves.map((m) => [m.label, Math.round(m.score)]));
    setSolverResult(res.result);
    expect(solverResult(s)).toBe(res.result);
    setSolverResult(null);
  });
});

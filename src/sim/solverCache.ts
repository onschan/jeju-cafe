/**
 * solver 결과 저장소 (pro-guide → solver): 롤아웃 탐색(solver.ts bestMoves)은 수백 ms가 들어 렌더 경로에서 직접 부를 수 없다.
 * 워커(ui/solverWorker.ts)나 동기 호출(solver.solveSync)이 결과를 여기 넣어 두면, strategy.ts(글로우 칸·nextMove·대사 토큰)·hints.ts가
 * 같은 상태 키(solverKey)일 때만 그 결과를 쓴다. 키가 다르면(배치·날·자금이 바뀜) 휴리스틱으로 돌아간다 — 결과는 항상 결정적.
 *
 * 상태 키 = 배치 서명(layoutRev) : 자금(10만 단위) : 직원 수 : 메뉴판 : 튜토리얼 단계. 손님의 순간 위치 같은 것은 안 본다(하루 안에서 같은 답).
 */
import type { GameState, Action, Pt } from './types.ts';
import { layoutSig } from './layoutRev.ts';

export interface SolverMove {
  action: Action;
  /** 아무것도 안 했을 때(저축)보다 얼마나 나은가 (evaluate 점수 차) */
  score: number;
  /** 롤아웃 H일 뒤 저축 대비 차이 */
  delta: { money: number; reputation: number; goals: number };
  /** 근거 한 줄 — 예상 수치로 ("14일 뒤 자금 +₩42만 · 평판 +1") */
  why: string;
  /** 행동 이름 (한글, id 노출 없음) */
  label: string;
  /** 맵 글로우 칸 (짓기·이동) */
  cells: Pt[];
  /** UI 글로우 타깃 (data-tut id: nav:build · tab:rest · build:table_out …) */
  targets: string[];
  /** 롤아웃 일수 */
  horizon: number;
}

export interface SolverResult { key: string; moves: SolverMove[]; horizon: number; rollouts: number; ms: number }

/** 자금 버킷: 1,000만 아래 10만 · 1억 아래 100만 · 그 위 1,000만 — 후반에 손님마다 결제로 키가 바뀌어 워커가 쉬지 못하는 것을 막는다 */
export function moneyBucket(money: number): number {
  const unit = money < 10_000_000 ? 100_000 : money < 100_000_000 ? 1_000_000 : 10_000_000;
  return Math.floor(money / unit);
}
/** 같은 답을 내는 상태 범위의 키 */
export function solverKey(s: GameState): string {
  return `${layoutSig(s)}:${moneyBucket(s.money)}:${s.staff.length}:${s.candidates.length}:${s.menuSlots.join(',')}:${s.tutorial.step}:${s.activePromotions.length}:${s.challenges.active.length}`;
}

let last: SolverResult | null = null;
const listeners = new Set<() => void>();

export function setSolverResult(r: SolverResult | null): void {
  last = r;
  for (const l of listeners) l();
}
/** 지금 상태와 키가 맞는 결과 (없으면 null) */
export function solverResult(s: GameState): SolverResult | null {
  return last && last.key === solverKey(s) ? last : null;
}
export function lastSolverResult(): SolverResult | null { return last; }
/** 결과가 바뀔 때 알림 (UI store가 리렌더를 깨운다) */
export function onSolverResult(l: () => void): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/** 캐시된 결과 중 조건에 맞는 수를 점수순으로 */
export function cachedMoves(s: GameState, pick: (m: SolverMove) => boolean = () => true): SolverMove[] {
  const r = solverResult(s);
  return r ? r.moves.filter(pick) : [];
}
/** 캐시된 결과에서 이 종류를 이 칸에 놓는 수 → 칸 순위. 결과가 없으면 heuristic 순서 그대로. */
export function rankCellsByCache(s: GameState, type: string, cells: Pt[]): Pt[] {
  const moves = cachedMoves(s, (m) => m.action.type === 'place' && m.action.objectType === type);
  if (moves.length === 0) return cells;
  const scoreOf = new Map<string, number>();
  for (const m of moves) if (m.action.type === 'place') scoreOf.set(`${m.action.x},${m.action.y}`, m.score);
  const k = (p: Pt) => `${p.x},${p.y}`;
  return [...cells].map((p, i) => ({ p, i, sc: scoreOf.get(k(p)) })).sort((a, b) => {
    if (a.sc !== undefined && b.sc !== undefined) return b.sc - a.sc || a.i - b.i;
    if (a.sc !== undefined) return -1;
    if (b.sc !== undefined) return 1;
    return a.i - b.i;
  }).map((o) => o.p);
}

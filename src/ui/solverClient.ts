/** solver 클라이언트: 상태 키(solverKey)가 바뀔 때마다 워커(solverWorker.ts)에 bestMoves를 시키고, 결과를 solverCache에 넣어 UI(공략 노트·글로우 칸·대사 토큰)가 쓰게 한다.
 *  메인 스레드는 막히지 않는다(직렬화 57KB ≈ 0.5ms). 한 번에 하나만 돌리고, 도는 동안 키가 또 바뀌면 마지막 상태만 이어서 보낸다. */
import { serialize, solverKey, setSolverResult, lastSolverResult, onSolverResult, UI_SOLVER_OPTIONS, type GameState, type SolverOptions } from '../sim/index.ts';
import type { SolveRequest, SolveResponse } from './solverProtocol.ts';
import { getState, subscribe, bumpVersion } from './store';

let worker: Worker | null = null;
let seq = 0;
let pending: { id: number; key: string } | null = null;
let queued: { key: string; json: string } | null = null;
let failed = false;

function ensureWorker(): Worker | null {
  if (worker || failed) return worker;
  if (typeof Worker === 'undefined') { failed = true; return null; }
  try {
    worker = new Worker(new URL('./solverWorker.ts', import.meta.url), { type: 'module' });
  } catch { failed = true; return null; }
  worker.onmessage = (e: MessageEvent<SolveResponse>) => {
    if (pending && e.data.id === pending.id) { pending = null; setSolverResult(e.data.result); }
    flush();
  };
  worker.onerror = () => { pending = null; failed = true; worker?.terminate(); worker = null; };
  return worker;
}
function flush(): void {
  const w = ensureWorker();
  if (!w || pending || !queued) return;
  const req: SolveRequest = { id: ++seq, key: queued.key, json: queued.json, opts: solverOpts };
  pending = { id: req.id, key: req.key };
  queued = null;
  w.postMessage(req);
}

let solverOpts: Partial<SolverOptions> = UI_SOLVER_OPTIONS;
export function setSolverOptions(o: Partial<SolverOptions>): void { solverOpts = o; }
/** 지금 상태의 답이 없으면 워커에 시킨다 (같은 키면 아무것도 안 한다) */
export function requestSolve(s: GameState = getState()): void {
  const key = solverKey(s);
  if (lastSolverResult()?.key === key || pending?.key === key || queued?.key === key) return;
  queued = { key, json: serialize(s) };
  flush();
}
/** 계산 중인가 (공략 노트 「계산 중…」) */
export function solverBusy(): boolean { return pending !== null || queued !== null; }

/** App에서 한 줄: 상태가 바뀔 때마다(키가 바뀔 때만 실제로) 워커에 시키고, 결과가 오면 React를 깨운다. 정리 함수를 돌려준다. */
export function startSolverLoop(): () => void {
  const off1 = subscribe(() => requestSolve());
  const off2 = onSolverResult(() => bumpVersion());
  requestSolve();
  return () => { off1(); off2(); worker?.terminate(); worker = null; pending = null; queued = null; };
}

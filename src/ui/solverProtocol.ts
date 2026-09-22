/** solver 워커 메시지 (순수 함수 — 워커 파일(solverWorker.ts)과 클라이언트(solverClient.ts)가 같이 쓰고, 테스트는 jsdom 없이 handleSolve만 부른다).
 *  상태 키(solverKey)는 layoutRev의 WeakMap rev를 포함해 **보낸 쪽(메인 스레드)에서** 계산해 실어 보낸다 — JSON을 다시 읽은 워커 상태는 rev가 0이라 키가 달라진다. */
import type { GameState } from '../sim/types.ts';
import { bestMoves, type SolverOptions } from '../sim/solver.ts';
import type { SolverResult } from '../sim/solverCache.ts';

export interface SolveRequest { id: number; key: string; json: string; opts: Partial<SolverOptions> }
export interface SolveResponse { id: number; result: SolverResult }

export function handleSolve(req: SolveRequest): SolveResponse {
  const s = JSON.parse(req.json) as GameState;
  const r = bestMoves(s, req.opts);
  return { id: req.id, result: { ...r, key: req.key } };
}

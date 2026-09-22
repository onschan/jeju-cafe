/// <reference lib="webworker" />
/** solver Web Worker: 메인 스레드가 보낸 상태(JSON)로 bestMoves를 돌려 돌려준다. sim은 순수라 그대로 import. Math.random·Date 없음(결정적). */
import { handleSolve, type SolveRequest } from './solverProtocol.ts';

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  (self as unknown as { postMessage(m: unknown): void }).postMessage(handleSolve(e.data));
};

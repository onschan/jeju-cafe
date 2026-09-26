import { START_ORIGIN } from '../layout.ts';

/** 시작 필지 상대 좌표 → 격자 좌표. 시작 필지가 정중앙(10,8)이라 테스트 고정값은 이 도우미로 옮긴다. */
export const X = (x: number) => START_ORIGIN.x + x;
export const Y = (y: number) => START_ORIGIN.y + y;
export const at = (x: number, y: number) => ({ x: X(x), y: Y(y) });

import type { GameState, FeatureId } from '../types.ts';
import { createInitialState, START_PATH, START_SEATS, START_ORIGIN as SO, START_DECOR } from '../state.ts';
import { removeObject, objectAt, placeObject } from '../grid.ts';
import { FEATURE_IDS } from '../goals.ts';

/** 모든 기능 잠금(홍보·필지·바위·개발·팝업·대결)을 연다 — 기능 자체를 검증하는 테스트용 */
export function openAllFeatures(s: GameState): GameState {
  for (const f of FEATURE_IDS as FeatureId[]) s.features[f] = true;
  return s;
}

/** 마당 어귀 올렛길 토막 (필지 상대 (4,6)·(4,7)·(4,8) — 마을 길 (4,9)에 닿는다).
 *  zero-base 전엔 정낭이 (4,6)에 있고 마을 길이 (4,7)이라 「정낭 옆 칸」이 곧 걸어 닿는 자리였다. 정낭을 없애고 필지를 12×10으로
 *  키우면서 그 구실을 이 토막이 한다 — 시작 올렛길(문 앞 (4,4)~(4,8))은 걷어내되 어귀 세 칸은 남긴다. */
export const BARE_STUB_PATH: { lx: number; ly: number }[] = [{ lx: 4, ly: 6 }, { lx: 4, ly: 7 }, { lx: 4, ly: 8 }];
/** v3 시작 상태(테이블 2·파라솔·올렛길·메뉴 3종·후보 2명·기능 잠금)를 걷어낸 "빈 마당" 상태.
 *  시작 상태 자체를 검증하는 테스트가 아니면 이걸 쓴다 (기존 테스트가 빈 마당·빈 메뉴판을 가정한다). */
export function bareState(seed = 1, playerId = 'local', createdAt = 0): GameState {
  const s = createInitialState(seed, playerId, createdAt);
  for (const c of [...START_SEATS, ...START_PATH, ...START_DECOR]) {
    const o = objectAt(s, SO.x + c.lx, SO.y + c.ly);
    if (o) removeObject(s, o.id);
  }
  for (const c of BARE_STUB_PATH) if (!objectAt(s, SO.x + c.lx, SO.y + c.ly)) placeObject(s, 'path', SO.x + c.lx, SO.y + c.ly);
  s.candidates = [];
  s.menuSlots = s.menuSlots.map(() => null);
  s.spawnAcc = 0;
  return openAllFeatures(s);
}

/** 어귀 올렛길 토막을 걷어낸다 — 유지비·오브젝트 수를 정확히 세는 테스트용 */
export function clearStubPath(s: GameState): GameState {
  for (const c of BARE_STUB_PATH) { const o = objectAt(s, SO.x + c.lx, SO.y + c.ly); if (o) removeObject(s, o.id); }
  return s;
}

// ---------- staff-luck ----------
import { sideRandom } from '../rng.ts';
import type { Outcome } from '../types.ts';
/** 다음 대박/중박/쪽박 굴림이 want가 되도록 보조 스트림 연번(luckSeq)을 맞춘다. chances는 그 작업의 outcomeChances(promoChances·tourChances…) 값.
 *  효과 자체를 검증하는 기존 테스트가 seed에 따라 대박·쪽박에 걸리지 않게 한다. */
export function forceNextOutcome(s: GameState, want: Outcome, chances: { great: number; success: number; fail: number }): void {
  for (let n = 0; n < 100_000; n++) {
    const r = sideRandom({ seed: s.seed, tick: s.tick, luckSeq: n });
    const o: Outcome = r < chances.great ? 'great' : r < chances.great + chances.success ? 'success' : 'fail';
    if (o === want) { s.luckSeq = n; return; }
  }
  throw new Error(`forceNextOutcome: ${want} 못 찾음`);
}

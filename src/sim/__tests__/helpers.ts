import { START_ORIGIN } from '../layout.ts';

/** 시작 필지 상대 좌표 → 격자 좌표. 시작 필지가 정중앙(10,8)이라 테스트 고정값은 이 도우미로 옮긴다. */
export const X = (x: number) => START_ORIGIN.x + x;
export const Y = (y: number) => START_ORIGIN.y + y;
export const at = (x: number, y: number) => ({ x: X(x), y: Y(y) });

import type { GameState, FeatureId } from '../types.ts';
import { createInitialState, START_PATH, START_SEATS, START_ORIGIN as SO } from '../state.ts';
import { removeObject, objectAt } from '../grid.ts';
import { FEATURE_IDS } from '../goals.ts';

/** 모든 기능 잠금(홍보·필지·바위·개발·팝업·대결)을 연다 — 기능 자체를 검증하는 테스트용 */
export function openAllFeatures(s: GameState): GameState {
  for (const f of FEATURE_IDS as FeatureId[]) s.features[f] = true;
  return s;
}

/** v3 시작 상태(테이블 2·파라솔·올렛길·메뉴 3종·후보 2명·기능 잠금)를 걷어낸 "빈 마당" 상태.
 *  시작 상태 자체를 검증하는 테스트가 아니면 이걸 쓴다 (기존 테스트가 빈 마당·빈 메뉴판을 가정한다). */
export function bareState(seed = 1, playerId = 'local', createdAt = 0): GameState {
  const s = createInitialState(seed, playerId, createdAt);
  for (const c of [...START_SEATS, ...START_PATH]) {
    const o = objectAt(s, SO.x + c.lx, SO.y + c.ly);
    if (o) removeObject(s, o.id);
  }
  s.candidates = [];
  s.menuSlots = s.menuSlots.map(() => null);
  s.spawnAcc = 0;
  return openAllFeatures(s);
}

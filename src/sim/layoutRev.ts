/**
 * 배치 서명 (y 통합 성능): 스텝마다 오브젝트 전체를 훑지 않도록, 배치가 바뀔 수 있는 순간에만 바뀌는 싼 키.
 *
 * - 액션(배치·철거·이동·회전·증축·되돌리기·주차장 넓히기 …)은 전부 actions.ts apply()를 지나므로 성공할 때 rev를 올린다.
 * - 날이 바뀔 때 일어나는 변화(공사 완공·본관 증축/이사 완료·경로 시설 해금)는 dayIndex가 덮는다.
 * - nextId는 apply를 거치지 않고 placeObject를 직접 부른 경우(테스트·초기 배치)를 덮는다.
 *
 * rev는 저장하지 않는다(WeakMap). 캐시도 전부 state 객체를 키로 한 WeakMap이라 새로 불러온 state는 새 캐시를 쓴다.
 */
import type { GameState } from './types.ts';
import { monthIndex, DAYS_PER_MONTH } from './clock.ts';

const REV = new WeakMap<GameState, number>();

/** 액션이 성공했을 때 부른다 (actions.ts). */
export function bumpLayoutRev(state: GameState): void {
  REV.set(state, (REV.get(state) ?? 0) + 1);
}

/** 배치 캐시 키. 같으면 오브젝트 배치·크기·공사 상태가 그대로라고 본다. */
export function layoutSig(state: GameState): string {
  const c = state.clock;
  return `${REV.get(state) ?? 0}:${monthIndex(c) * DAYS_PER_MONTH + (c.day - 1)}:${state.nextId}`;
}

/** layoutSig 기반 한 줄 캐시: `cached(state, CACHE, () => 계산)` */
export function layoutCached<T>(state: GameState, cache: WeakMap<GameState, { key: string; value: T }>, compute: () => T): T {
  const key = layoutSig(state);
  const hit = cache.get(state);
  if (hit && hit.key === key) return hit.value;
  const value = compute();
  cache.set(state, { key, value });
  return value;
}

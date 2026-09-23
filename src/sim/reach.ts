/**
 * 손님이 걸어서 닿나 (ui3, 사용자 피드백 「손님이 못 가는 곳이면 표시해 줘」).
 * 새 탐색을 만들지 않는다 — path.ts의 entryPoints(정류장·주차장·올레 진입 칸)와 reachMap(BFS)을 그대로 쓴다.
 * 배치 서명 캐시(layoutRev.ts)라 배치가 바뀌거나 날이 바뀔 때만 다시 센다 — 매 프레임 계산하지 않는다.
 *
 * 맵 위 시설만 본다. 관광 명소(spots.ts)는 맵 밖 투자 대상이라 올렛길 연결과 무관하다.
 */
import type { GameState, PlacedObject, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { layoutCached } from './layoutRev.ts';
import { entryPoints, reachMap, walkableNeighborsOf, cellKey, isWalkable } from './path.ts';
import { footprint, doorFrontOf, inBounds } from './grid.ts';
import { sizeOf } from './grid.ts';

/** 손님이 실제로 가서 쓰는 시설만 본다 — 담·꾸미기·나무는 못 가도 문제가 아니다 (layoutScore와 같은 기준) */
const GUEST_KINDS = new Set(['seat', 'facility', 'building', 'landmark']);

/** 진입점에서 닿는 걷기 칸 집합 (배치 서명 캐시) */
const REACH_SET = new WeakMap<GameState, { key: string; value: Set<number> }>();
function reachedCells(state: GameState): Set<number> {
  return layoutCached(state, REACH_SET, () => {
    const out = new Set<number>();
    for (const p of entryPoints(state)) for (const k of reachMap(state, p).dist.keys()) out.add(k);
    return out;
  });
}

/** 이 칸을 손님이 밟거나 옆에 설 수 있나 */
export function cellReachable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const set = reachedCells(state);
  if (isWalkable(state, x, y) && set.has(cellKey(state, { x, y }))) return true;
  return walkableNeighborsOf(state, x, y).some((n) => set.has(cellKey(state, n)));
}

/** 놓으려는 자리(발자국)에 손님이 올 수 있나 — 배치 고스트 경고용. 아직 없는 시설이라 발자국 둘레만 본다. */
export function spotReachable(state: GameState, type: string, x: number, y: number): boolean {
  const def = objectDef(type);
  if (!GUEST_KINDS.has(def.kind)) return true; // 길·담·나무는 손님이 갈 일이 없다
  if (def.kind === 'building') {
    const f = doorFrontOf({ type, x, y, w: def.w, h: def.h });
    return cellReachable(state, f.x, f.y);
  }
  return footprint(type, x, y).some((p) => cellReachable(state, p.x, p.y));
}

/** 놓인 시설에 손님이 갈 수 있나. 건물(본관·별관)은 문 앞 칸으로 본다 — 옆구리로는 못 들어간다. */
export function objectReachable(state: GameState, o: PlacedObject): boolean {
  const def = objectDef(o.type);
  if (!GUEST_KINDS.has(def.kind)) return true;
  const size = sizeOf(o);
  if (def.kind === 'building') {
    const f = doorFrontOf({ type: o.type, x: o.x, y: o.y, w: size.w, h: size.h });
    return cellReachable(state, f.x, f.y);
  }
  const set = reachedCells(state);
  const cells: Pt[] = footprint(o.type, o.x, o.y, size.w, size.h);
  return cells.some((p) => walkableNeighborsOf(state, p.x, p.y).some((n) => set.has(cellKey(state, n))));
}

/** 손님이 못 가는 시설 (배치 서명 캐시). 화면·카드·진단이 함께 쓴다. */
const UNREACH = new WeakMap<GameState, { key: string; value: PlacedObject[] }>();
export function unreachableObjects(state: GameState): PlacedObject[] {
  return layoutCached(state, UNREACH, () => Object.values(state.objects).filter((o) => !objectReachable(state, o)));
}
/** 손님이 못 가는 시설 id 집합 (맵 배지) */
const UNREACH_IDS = new WeakMap<GameState, { key: string; value: Set<string> }>();
export function unreachableIds(state: GameState): Set<string> {
  return layoutCached(state, UNREACH_IDS, () => new Set(unreachableObjects(state).map((o) => o.id)));
}
export function unreachableCount(state: GameState): number {
  return unreachableObjects(state).length;
}

/** 카드·배치 바에 쓰는 한 줄 (문구 규칙 §6: 지시문·화살표 없음) */
export const UNREACHABLE_TEXT = '손님이 못 와요 — 올렛길이 끊겼어요';
export const UNREACHABLE_GHOST_TEXT = '여기엔 손님이 못 와요';

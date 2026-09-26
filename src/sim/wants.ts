/**
 * 손님이 보는 것(want)과 「그 자리가 그 손님에게 맞나」.
 *
 * 카이로 방향(specs/2026-09-26-direction.md): 손으로 하는 건 배치뿐이고, 손님은 알아서 온다.
 * 그러면 배치가 곧 전략이 되려면 **손님이 자기 취향 자리를 골라 앉아야** 한다 — 조용함을 보는 손님은
 * 그늘 자리로, 귤밭을 보는 손님은 감귤나무 곁으로. 이 모듈이 그 「맞나」를 판정한다.
 * (러시 시절엔 rush.ts 안에 있었다. 러시는 걷어냈고 판정만 남았다.)
 *
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, PlacedObject, FacilityCategory } from './types.ts';
import { guestTypeDef, objectDef } from '../data/index.ts';
import { siteOf, seatShade } from './site.ts';
import { popularityFor, BASE_POPULARITY } from './compat.ts';

export type Want = 'scenery' | 'rest' | 'fun' | 'convenience' | 'food' | 'farm';
export const WANT_LABEL: Record<Want, string> = {
  scenery: '경치', rest: '조용함', fun: '즐길거리', convenience: '가까운 자리', food: '먹거리', farm: '귤밭',
};
export const WANT_ICON: Record<Want, string> = {
  scenery: 'view', rest: 'shade', fun: 'party', convenience: 'door', food: 'meal', farm: 'harvest',
};
/** 이 손님층이 제일 보는 것 (wants 첫 번째). 없으면 경치. */
export function wantOf(typeId: string): Want {
  try {
    const w = guestTypeDef(typeId).wants?.[0];
    return (w && w in WANT_LABEL ? w : 'scenery') as Want;
  } catch { return 'scenery'; }
}
/** 「조용함을 봐요」 같은 한 줄 */
export function wantLine(typeId: string): string {
  return `${WANT_LABEL[wantOf(typeId)]}을 봐요`;
}

/** 이 전망부터 「경치 자리」 */
export const FIT_VIEW = 2;
/** 이 분류 시설이 자리에서 몇 칸 안에 있으면 「그 곁 자리」인가 */
export const FIT_RADIUS = 3;
/** 문에서 이 안이면 「가까운 자리」 */
const NEAR_DOOR = 2;

/** 이 자리가 그 「보는 것」에 맞나. 손님 없이 자리만으로 묻는다 (chapter.ts가 「그런 자리가 아예 없다」를 말할 때도 쓴다). */
export function seatFitsWant(state: GameState, seat: PlacedObject, want: Want, typeId?: string): boolean {
  const site = siteOf(state, seat.x, seat.y);
  switch (want) {
    case 'scenery': return site.view >= FIT_VIEW;                                  // 바다·오름이 보이는 자리
    case 'rest': return seatShade(state, seat) >= 1 && site.view < FIT_VIEW;       // 그늘지고 조용한 구석 (파라솔은 제 그늘을 친다)
    case 'convenience': return nearDoor(state, seat);                               // 문에서 가까운 자리
    // 귤밭·먹거리·즐길거리는 「주변 인기」 같은 뭉뚱그린 값이 아니라 **그 분류 시설이 곁에 있나**로 가른다 —
    // 셋이 같은 판정이면 막이 서로 다른 배치 과제가 되지 못한다 (감귤나무 곁 ≠ 브런치 식당 곁).
    case 'farm': return nearCategory(state, seat, 'farm');
    case 'food': return nearCategory(state, seat, 'food');
    case 'fun': return nearCategory(state, seat, 'fun');
    default: return typeId === undefined || popularityFor(state, seat.id, typeId) > BASE_POPULARITY;
  }
}
/** 이 손님(타입)에게 이 자리가 맞나 */
export function seatFitsGuest(state: GameState, seat: PlacedObject, typeId: string): boolean {
  return seatFitsWant(state, seat, wantOf(typeId), typeId);
}
function nearCategory(state: GameState, seat: PlacedObject, category: FacilityCategory): boolean {
  for (const o of Object.values(state.objects)) {
    if (o.build || o.id === seat.id || objectDef(o.type).category !== category) continue;
    if (Math.max(Math.abs(o.x - seat.x), Math.abs(o.y - seat.y)) <= FIT_RADIUS) return true;
  }
  return false;
}
function nearDoor(state: GameState, seat: PlacedObject): boolean {
  const main = Object.values(state.objects).find((o) => o.type === 'warehouse');
  if (!main) return false;
  return Math.abs(seat.x - main.x) + Math.abs(seat.y - main.y) <= NEAR_DOOR + 2;
}

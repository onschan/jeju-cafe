/**
 * 특별 손님 (trim: 원정 팝업 스토어·지역 손님 56을 걷어내고, 빅 이벤트가 데려오는 특별 손님만 남겼다).
 * 특별 손님은 NamedGuestDef 한 줄(이름·대사·취향·예산)로 서며, 만난 적이 있는지만 state.namedGuests에 남는다.
 */
import type { GameState, NamedGuestState, NamedGuestDef, MenuCategory, Face } from './types.ts';
import { namedGuestDef } from '../data/index.ts';

/** 특별 손님이 본점에서 만족하는 경치 기준 (파츠 조합 손님과 같은 성인 기준) */
export const NAMED_MIN_SCENERY = 1;

export function initNamedGuests(): Record<string, NamedGuestState> {
  return {};
}
export function namedGuestState(state: GameState, namedId: string): NamedGuestState {
  namedGuestDef(namedId);
  return (state.namedGuests[namedId] ??= { met: false });
}
/** 특별 손님이 주문하는 분류 ('any'면 전부) */
export function namedLikes(def: NamedGuestDef): MenuCategory[] {
  return def.likesBase.includes('any') ? ['drink', 'dessert', 'meal', 'signature'] : (def.likesBase as MenuCategory[]);
}
/** 렌더·초상용 얼굴 파츠 인덱스 (face.seed로 결정) */
export function namedGuestFace(def: NamedGuestDef): Face {
  const s = def.face.seed;
  return { hair: (s * 7) % 48, skin: s % 3, top: (s * 5) % 8 };
}
/** 만난 특별 손님 수 */
export function metCount(state: GameState): number {
  return Object.values(state.namedGuests).filter((g) => g.met).length;
}

import type { GameState, ApplyResult, ItemDef, ObjectDef, ItemSlot, ObjectKind } from './types.ts';
import { ITEMS, itemDef, objectDef } from '../data/index.ts';

/** 같은 종류 시설에 누적되는 아이템 인기 보너스 상한 */
export const ITEM_POP_CAP = 30;
export const ITEM_FEE_CAP = 30;
const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i] as const));

const SLOT_OF: Record<ObjectKind, ItemSlot> = {
  seat: 'seat', field: 'farm', tree: 'farm', wall: 'env', path: 'env', deco: 'env', landmark: 'env',
  building: 'facility', busstop: 'facility', gate: 'facility',
};

/** 이 시설에 쓸 때의 효과. 잘 맞는 시설(id 일치 또는 v1 분류 3)은 ×2, v1 분류 0이면 0(못 씀). */
export function itemEffect(item: ItemDef, def: ObjectDef): number {
  if (item.fitIds.includes(def.id)) return item.value * 2;
  if (item.fitSlots) {
    const k = item.fitSlots[SLOT_OF[def.kind]] ?? 0;
    return k <= 0 ? 0 : k >= 3 ? item.value * 2 : item.value;
  }
  return item.value;
}

function findItem(itemId: string, items?: ItemDef[]): ItemDef | undefined {
  return items ? items.find((i) => i.id === itemId) : ITEM_BY_ID.get(itemId);
}

/** 나중 시스템(부탁 보상·추첨·상점)이 부른다 */
export function grantItem(state: GameState, itemId: string, n = 1): void {
  itemDef(itemId);
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) + n;
}

export function canUseItem(state: GameState, itemId: string, objectType: string, items?: ItemDef[]): ApplyResult {
  const item = findItem(itemId, items);
  if (!item) return { ok: false, reason: '없는 아이템이에요' };
  if ((state.inventory[itemId] ?? 0) <= 0) return { ok: false, reason: '아이템이 없어요' };
  let def: ObjectDef;
  try { def = objectDef(objectType); } catch { return { ok: false, reason: '없는 시설이에요' }; }
  if (itemEffect(item, def) <= 0) return { ok: false, reason: '이 시설엔 안 맞아요' };
  return { ok: true };
}

/** 하나를 소모해 같은 종류 시설 전체의 보너스에 더한다 (인기 +30, 요금 +30% 상한). 호출 전 canUseItem. */
export function useItem(state: GameState, itemId: string, objectType: string, items?: ItemDef[]): void {
  const item = findItem(itemId, items)!;
  const eff = itemEffect(item, objectDef(objectType));
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) - 1;
  const b = (state.itemBonus[objectType] ??= { popularity: 0, feePct: 0 });
  if (item.stat === 'popularity') b.popularity = Math.min(ITEM_POP_CAP, b.popularity + eff);
  else b.feePct = Math.min(ITEM_FEE_CAP, b.feePct + eff);
}

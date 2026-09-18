import type { GameState, ApplyResult, ItemDef, ObjectDef, ItemSlot, ObjectKind } from './types.ts';
import { pushFx } from './fx.ts';
import { ITEMS, itemDef, objectDef } from '../data/index.ts';

/** 같은 종류 시설에 누적되는 아이템 인기 보너스 상한 */
export const ITEM_POP_CAP = 30;
export const ITEM_FEE_CAP = 30;
const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i] as const));

const SLOT_OF: Record<ObjectKind, ItemSlot> = {
  seat: 'seat', tree: 'farm', wall: 'env', path: 'env', deco: 'env', landmark: 'env',
  building: 'facility', busstop: 'facility', gate: 'facility', facility: 'facility',
};

/** 경관 씨앗을 쓸 수 있는 종류: 경관이 있는 것(경관물·나무·랜드마크) */
const SCENERY_KINDS = new Set<ObjectKind>(['deco', 'tree', 'landmark']);
export const ITEM_SCENERY_CAP = 30;

/** 이 시설에 쓸 때의 효과. 잘 맞는 시설(id 일치 또는 v1 분류 3)은 ×2, v1 분류 0이면 0(못 씀). 경관 씨앗은 경관물에만.
 *  v1 분류가 없는 v2 아이템(안경·LP판·금박…)은 잘 맞는 시설(fitIds)에만 쓸 수 있다 — 밭에 "안경 쓰기"가 뜨지 않게 (QA 1차 P2 #24).
 *  잘 맞는 시설 목록도 분류도 없는 것(씨앗)은 어디에나 기본 효과. */
export function itemEffect(item: ItemDef, def: ObjectDef): number {
  if (item.stat === 'scenery') return SCENERY_KINDS.has(def.kind) || def.scenery > 0 ? item.value : 0;
  if (item.fitIds.includes(def.id)) return item.value * 2;
  if (item.fitSlots) {
    const k = item.fitSlots[def.yield ? 'farm' : SLOT_OF[def.kind]] ?? 0; // 농원 시설(당근밭 등)은 farm 칸
    return k <= 0 ? 0 : k >= 3 ? item.value * 2 : item.value;
  }
  return item.fitIds.length > 0 ? 0 : item.value;
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
  state.stats.itemsUsed++; // 목표 itemsUsed (x-goals 훅)
  const item = findItem(itemId, items)!;
  const eff = itemEffect(item, objectDef(objectType));
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) - 1;
  const b = (state.itemBonus[objectType] ??= { popularity: 0, feePct: 0 });
  if (item.stat === 'popularity') {
    const before = b.popularity;
    b.popularity = Math.min(ITEM_POP_CAP, b.popularity + eff);
    const gained = b.popularity - before;
    // 그 종류의 모든 오브젝트 위에 +N 팝업
    if (gained > 0) for (const o of Object.values(state.objects)) if (o.type === objectType) pushFx(state, { kind: 'pop', x: o.x, y: o.y, n: gained, tick: state.tick });
  } else if (item.stat === 'scenery') b.scenery = Math.min(ITEM_SCENERY_CAP, (b.scenery ?? 0) + eff);
  else b.feePct = Math.min(ITEM_FEE_CAP, b.feePct + eff);
}

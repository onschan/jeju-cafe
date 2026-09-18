import type { GameState, ApplyResult, ItemDef, ObjectDef, ItemSlot, ObjectKind, GiftDef } from './types.ts';
import { pushFx } from './fx.ts';
import { ITEMS, GIFTS, itemDef, objectDef, giftDef, isGiftId, guestTypeDef, ingredientDef, NAMED_TYPE } from '../data/index.ts';
import { pushNotice, skillTotal } from './staff.ts';
import { addSatisfaction } from './segments.ts';
import { addAffinity } from './popup.ts';
import { MAX_SEGMENT_POPULARITY } from './promotions.ts';
import { tagMatches } from './spots.ts';
import { dayIndex } from './effects.ts';
import { randInt } from './rng.ts';
import { josa } from './josa.ts';

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

// ---------- 손님 선물 (§3.3.5) ----------

/** 선물: 그 손님 타입 인기 +3, 만족 +20, (단골★이면 호감도 +10). 잘 맞는 손님층이면 ×2. 하루 1회. */
export const GIFT_POPULARITY = 3;
export const GIFT_SATISFACTION = 20;
export const GIFT_AFFINITY = 10;
export const GIFT_FIT_MULT = 2;
/** 제주 선물 상자(마일리지 상점): 랜덤 선물 2개 */
export const GIFT_BOX_COUNT = 2;

export function hasSpecial(state: GameState, itemId: string): boolean {
  return (state.inventory[itemId] ?? 0) > 0;
}

export function giftCount(state: GameState): number {
  let n = 0;
  for (const g of GIFTS) n += state.inventory[g.id] ?? 0;
  return n;
}

/** 오늘 이미 선물했나 */
export function giftedToday(state: GameState): boolean {
  return state.giftDay === dayIndex(state.clock);
}

/** 이 손님(개체)에게 이 선물이 잘 맞나 (단골★은 늘 기본 효과) */
export function giftFits(gift: GiftDef, typeId: string): boolean {
  if (typeId === NAMED_TYPE) return false;
  try { return tagMatches(guestTypeDef(typeId).tags, gift.fitTag); } catch { return false; }
}

export function canGiveGift(state: GameState, guestId: string, itemId: string): ApplyResult {
  if (!isGiftId(itemId)) return { ok: false, reason: '선물이 아니에요' };
  if ((state.inventory[itemId] ?? 0) <= 0) return { ok: false, reason: '선물이 없어요' };
  const g = state.guests.find((x) => x.id === guestId);
  if (!g) return { ok: false, reason: '손님이 떠났어요' };
  if (g.phase === 'leaving') return { ok: false, reason: '이미 가는 중이에요' };
  if (giftedToday(state)) return { ok: false, reason: '선물은 하루 한 번이에요' };
  return { ok: true };
}

/** 호출 전 canGiveGift. 효과 배수(1 또는 2)를 돌려준다. */
export function giveGift(state: GameState, guestId: string, itemId: string): number {
  const gift = giftDef(itemId);
  const g = state.guests.find((x) => x.id === guestId)!;
  const fit = giftFits(gift, g.type);
  const k = (fit ? GIFT_FIT_MULT : 1) * (1 + skillTotal(state, 'giftBonus')); // 트랙 D 특기 gift_hands ×1.5
  state.inventory[itemId] = (state.inventory[itemId] ?? 0) - 1;
  state.giftDay = dayIndex(state.clock);
  if (g.namedId) {
    addAffinity(state, g.namedId, GIFT_AFFINITY * k);
    pushNotice(state, `${josa(gift.name, '을/를')} 선물했어요 — 호감도 +${GIFT_AFFINITY * k}`);
  } else {
    state.segmentPopularity[g.type] = Math.min(MAX_SEGMENT_POPULARITY, (state.segmentPopularity[g.type] ?? 0) + GIFT_POPULARITY * k);
    addSatisfaction(state, g.type, GIFT_SATISFACTION * k);
    pushNotice(state, `${guestTypeDef(g.type).name}에게 ${josa(gift.name, '을/를')} 선물했어요${fit ? ' (잘 맞아요 ×2)' : ''} — 인기 +${GIFT_POPULARITY * k} · 만족 +${GIFT_SATISFACTION * k}`);
  }
  g.mood = 'happy';
  g.say = fit ? '이런 걸 다… 고마워요!' : '고마워요!';
  pushFx(state, { kind: 'pop', x: Math.round(g.x), y: Math.round(g.y), n: GIFT_POPULARITY * k, tick: state.tick });
  return k;
}

/** 제작형 선물(감귤 한 상자): 재료 n개 소모 */
export function canCraftGift(state: GameState, itemId: string): ApplyResult {
  if (!isGiftId(itemId)) return { ok: false, reason: '선물이 아니에요' };
  const src = giftDef(itemId).source;
  if (src.type !== 'craft') return { ok: false, reason: '만들 수 있는 선물이 아니에요' };
  if ((state.storage[src.ingredientId] ?? 0) < src.count) return { ok: false, reason: `${ingredientDef(src.ingredientId).name} ${src.count}개가 필요해요` };
  return { ok: true };
}

/** 호출 전 canCraftGift */
export function craftGift(state: GameState, itemId: string): void {
  const gift = giftDef(itemId);
  const src = gift.source as { type: 'craft'; ingredientId: string; count: number };
  state.storage[src.ingredientId] = (state.storage[src.ingredientId] ?? 0) - src.count;
  grantItem(state, itemId);
  pushNotice(state, `${josa(gift.name, '을/를')} 만들었어요`);
}

/** 월초: 시설 보유형 선물(잼 공방·기념품 가게·녹차밭·포토 스팟·양봉장)이 매달 들어온다. 준 개수. */
export function monthlyGifts(state: GameState): number {
  let n = 0;
  const types = new Set(Object.values(state.objects).map((o) => o.type));
  for (const g of GIFTS) {
    if (g.source.type !== 'facility' || !types.has(g.source.objectId)) continue;
    grantItem(state, g.id, g.source.perMonth);
    n += g.source.perMonth;
    pushNotice(state, `${g.name} ${g.source.perMonth}개가 들어왔어요`);
  }
  return n;
}

/** 제주 선물 상자: 랜덤 선물 2개 (결정적) */
export function openGiftBox(state: GameState): string[] {
  const out: string[] = [];
  for (let i = 0; i < GIFT_BOX_COUNT; i++) {
    const g = GIFTS[randInt(state, 0, GIFTS.length - 1)]!;
    grantItem(state, g.id);
    out.push(g.id);
  }
  return out;
}

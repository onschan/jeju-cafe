import type { SpotEffectDef, ObjectDef, MenuDef, GuestTypeDef, IngredientDef, FarmYield, GoalDef, ChallengeDef, BigEventDef, RoleDef, SkillDef, PromotionDef, GuestTags, ComboDef, ComboTarget, ComboStrength, ComboSide, SetDef, ItemDef, ItemSlot, Season, MenuCategory, GuestEffect, GuestWant, UnlockCond, QuestDef, QuestCondition, QuestReward, SpotDef, SpotCategory, SpotSpecial, SpotTag, GiftDef, EventDef, MenuStats, MenuStatKey, IngredientCategory, IngredientComboDef, ToppingDef, HiddenRecipeDef, FacilityCategory, MileageShopDef, TicketShopDef, UniformDef, GuidebookDef, DrawPrizeDef, DrawPrizeKind, JudgeKey, RegionDef, NamedGuestDef, RivalDef, StaffPoolDef, RecruitTierDef, TrainingDef, TitleDef } from '../sim/types.ts';
import objectsJson from './objects.json' with { type: 'json' };
import menusJson from './menus.json' with { type: 'json' };
import guestsJson from './generated/v2/guests.json' with { type: 'json' };
import questsJson from './generated/v2/quests.json' with { type: 'json' };
import chainsJson from './generated/v2/guest_chains.json' with { type: 'json' };
import spotsJson from './spots.json' with { type: 'json' };
import eventsJson from './generated/v2/events.json' with { type: 'json' };
import { EVENT_EFFECTS } from './event_effects.ts';
import goalsJson from './goals.json' with { type: 'json' };
import challengesJson from './challenges.json' with { type: 'json' };
import eventsV3Json from './events_v3.json' with { type: 'json' };
import ingredientsJson from './ingredients.json' with { type: 'json' };
import staffRolesJson from './staff_roles.json' with { type: 'json' };
import skillsJson from './skills.json' with { type: 'json' };
import staffPoolJson from './staff_pool.json' with { type: 'json' };
import recruitTiersJson from './recruit_tiers.json' with { type: 'json' };
import trainingsJson from './trainings.json' with { type: 'json' };
import titlesJson from './titles.json' with { type: 'json' };
import namesJson from './names.json' with { type: 'json' };
import promotionsJson from './promotions.json' with { type: 'json' };
import dialogueJson from './dialogue.json' with { type: 'json' };
import parcelsJson from './generated/parcels.json' with { type: 'json' };
import landmarksJson from './generated/landmarks.json' with { type: 'json' };
import aurasJson from './generated/auras.json' with { type: 'json' };
import itemsJson from './generated/items.json' with { type: 'json' };
import itemsV2Json from './generated/v2/items.json' with { type: 'json' };
import specialItemsJson from './special_items.json' with { type: 'json' };
import mileageShopJson from './mileage_shop.json' with { type: 'json' };
import ticketShopJson from './ticket_shop.json' with { type: 'json' };
import giftsJson from './gifts.json' with { type: 'json' };
import uniformsJson from './generated/v2/uniforms.json' with { type: 'json' };
import guidebooksJson from './generated/v2/guidebooks.json' with { type: 'json' };
import rouletteJson from './generated/roulette.json' with { type: 'json' };
import ranksJson from './generated/ranks.json' with { type: 'json' };
import compatMetaJson from './generated/compat_meta.json' with { type: 'json' };
import facilitiesJson from './generated/v2/facilities.json' with { type: 'json' };
import facilitiesXJson from './facilities_x.json' with { type: 'json' };
import facilitiesShopJson from './facilities_shop.json' with { type: 'json' }; // 상점 설계도·황금 감귤 시설 4종 (트랙 C 참조, 통합 때 추가)
import facilitiesIndoorJson from './facilities_indoor.json' with { type: 'json' }; // 실내 가구 7 + 별관 2 (트랙 G §8.2·8.3, y-indoor)
import combosJson from './combos.json' with { type: 'json' };
import spotEffectsJson from './spot_effects.json' with { type: 'json' };
import ingredientsV1Json from './generated/ingredients.json' with { type: 'json' };
import ingredientCombosJson from './generated/ingredient_combos.json' with { type: 'json' };
import toppingsJson from './generated/toppings.json' with { type: 'json' };
import hiddenRecipesJson from './generated/hidden_recipes.json' with { type: 'json' };
import regionsJson from './generated/regions.json' with { type: 'json' };
import namedGuestsJson from './generated/named_guests.json' with { type: 'json' };
import rivalsJson from './generated/v2/rivals.json' with { type: 'json' };

/** 시작부터 있는 특수 오브젝트 (필지 지형 생성용). ease: 곶자왈 덤불(bush_wild)은 없앴다 — 옛 세이브의 덤불은 로드 때 지운다. */
const TERRAIN_OBJECTS: ObjectDef[] = [
  { id: 'spring', name: '용천수', kind: 'deco', w: 2, h: 1, cost: 0, scenery: 2, noise: 0, wind: 0, upkeep: 0, terrain: ['soil'] },
];
/** 랜드마크 (§1.6). 데이터만 — 효과는 경치·요금 외 TODO. 비용은 화폐 리스케일 ×100. */
export const LANDMARK_COST_SCALE = 100;
/** 랜드마크 해금 조건은 v2 시설 표(부탁·명소 Lv)에서 가져온다 — 표에 없는 폭낭(hackberry)은 ★3 */
const LANDMARK_UNLOCK: Record<string, { unlock: Record<string, unknown>; unlockText?: string } | undefined> = Object.fromEntries((facilitiesJson as unknown as { id: string; category: string; unlock: Record<string, unknown>; unlockText?: string }[]).filter((r) => r.category === 'landmark').map((r) => [r.id, r]));
export const LANDMARKS: ObjectDef[] = (landmarksJson as { id: string; name: string; w: number; h: number; cost: number; effectText: string }[]).map((l) => {
  const v2 = LANDMARK_UNLOCK[l.id];
  const def: ObjectDef = {
    id: l.id, name: l.name, kind: 'landmark', category: 'landmark', w: l.w, h: l.h, cost: l.cost * LANDMARK_COST_SCALE, scenery: 3, noise: 0, wind: 1, upkeep: 0, terrain: ['soil'], effectText: l.effectText,
    unlock: v2 ? toUnlockCond(v2.unlock) : { type: 'star', star: 3 },
  };
  def.unlockText = v2?.unlockText ?? '★3';
  return def;
});

export interface ParcelDef { id: string; no: number; name: string; price: number; start: boolean; w: number; h: number; bonusText: string | null }
export const PARCELS = parcelsJson as ParcelDef[];

// ---------- 재료 32 (v1 §6.1 스탯·분류) + 기존 13종의 kind·cost ----------
export const MENU_STAT_KEYS: MenuStatKey[] = ['taste', 'aroma', 'look', 'health', 'volume', 'jeju'];
export const MENU_STAT_LABEL: Record<MenuStatKey, string> = { taste: '맛', aroma: '향', look: '보기', health: '건강', volume: '양', jeju: '제주' };
export const ZERO_STATS: MenuStats = { taste: 0, aroma: 0, look: 0, health: 0, volume: 0, jeju: 0 };
export function addStats(a: MenuStats, b: Partial<MenuStats>, mult = 1): MenuStats {
  const out = { ...a };
  for (const k of MENU_STAT_KEYS) out[k] += (b[k] ?? 0) * mult;
  return out;
}
export function statSum(s: MenuStats): number { return MENU_STAT_KEYS.reduce((n, k) => n + s[k], 0); }
type RawIngredientV1 = { id: string; name: string; category: string; categoryName: string; stats: MenuStats; cost: number; sourceText: string };
type RawIngredientV0 = { id: string; name: string; kind: 'bought' | 'farm'; cost: number };
const INGREDIENT_CATEGORIES = new Set<IngredientCategory>(['coffee', 'dairy', 'sweet', 'grain', 'protein', 'tea', 'fruit', 'water', 'spice', 'vegetable', 'nut', 'seafood']);
export const INGREDIENT_CATEGORY_NAME: Record<IngredientCategory, string> = { coffee: '커피', dairy: '유제품', sweet: '감미', grain: '곡물', protein: '단백', tea: '차', fruit: '과일', water: '물', spice: '향신', vegetable: '채소', nut: '견과', seafood: '해산물' };
/** v1 표에서 원가 0(밭·농원 산지)인 재료의 자동 구매 원가 (v3: 밭이 없어져 창고에 없으면 거래처에서 산다) */
const FARM_MARKET_COST: Record<string, number> = {
  buckwheat: 500, tea_jeju: 1200, hallabong: 1200, canola_flower: 600, peanut: 800, gosari: 900, mushroom: 900,
  seaweed: 800, abalone: 4000, garlic: 300, water_spring: 200,
};
/** 기존 ingredients.json(13: kind·cost — 밸런스 유지)에 v1 표의 스탯·분류를 붙이고, 표에만 있는 19종은 원가 0이면 farm(농원·창고 우선, 없으면 FARM_MARKET_COST로 구매), 아니면 bought. */
export const INGREDIENTS: IngredientDef[] = (() => {
  const legacy = new Map((ingredientsJson as RawIngredientV0[]).map((i) => [i.id, i]));
  return (ingredientsV1Json as RawIngredientV1[]).map((r) => {
    const old = legacy.get(r.id);
    const category = INGREDIENT_CATEGORIES.has(r.category as IngredientCategory) ? (r.category as IngredientCategory) : 'vegetable';
    const kind = old?.kind ?? (r.cost > 0 ? 'bought' : 'farm');
    const cost = old?.cost ?? (r.cost > 0 ? r.cost : FARM_MARKET_COST[r.id] ?? 500);
    return { id: r.id, name: old?.name ?? r.name, kind, cost, category, stats: { ...ZERO_STATS, ...r.stats }, sourceText: r.sourceText };
  });
})();
const INGREDIENT = indexBy(INGREDIENTS);
/** 재료 상자(인형뽑기·호감도 보상)에서 나오는 농원 재료: 기존 밭 작물 2종 (당근·감귤) + 녹찻잎 */
export const FARM_INGREDIENT_IDS = ['carrot', 'tangerine', 'tea'];
export const ingredientDef = (id: string) => must(INGREDIENT, id, 'ingredient');
/** 재료 스탯 합 (ingredientId → 개수) */
export function ingredientStats(ingredients: Record<string, number>): MenuStats {
  let out = { ...ZERO_STATS };
  for (const [id, n] of Object.entries(ingredients)) out = addStats(out, ingredientDef(id).stats, n);
  return out;
}
type RawMenu = Omit<MenuDef, 'stats'> & { stats?: MenuStats };
/** 기본 메뉴 18: 스탯은 재료 합으로 로드 시 계산 */
export const MENUS: MenuDef[] = (menusJson as unknown as RawMenu[]).map((m) => ({ ...m, stats: m.stats ?? ingredientStats(m.ingredients) }));
type RawIngredientCombo = { id: string; name: string; a: { category: string; ingredient?: string; minJeju?: number }; b: { category: string; ingredient?: string; minJeju?: number }; pairText: string; bonus: Record<string, number>; bonusText: string };
export const INGREDIENT_COMBOS: IngredientComboDef[] = (ingredientCombosJson as unknown as RawIngredientCombo[]).map((r) => ({
  id: r.id, name: r.name, a: r.a as IngredientComboDef['a'], b: r.b as IngredientComboDef['b'], pairText: r.pairText, bonus: r.bonus as IngredientComboDef['bonus'], bonusText: r.bonusText,
}));
export const TOPPINGS: ToppingDef[] = (toppingsJson as (ToppingDef & { costNote?: string })[]).map((t) => ({ id: t.id, name: t.name, cost: t.cost, stats: t.stats, skills: t.skills, skillText: t.skillText }));
export const HIDDEN_RECIPES: HiddenRecipeDef[] = hiddenRecipesJson as HiddenRecipeDef[];
const INGREDIENT_COMBO = indexBy(INGREDIENT_COMBOS);
const TOPPING = indexBy(TOPPINGS);
const HIDDEN_RECIPE = indexBy(HIDDEN_RECIPES);
export const ingredientComboDef = (id: string) => must(INGREDIENT_COMBO, id, 'ingredientCombo');
export const toppingDef = (id: string) => must(TOPPING, id, 'topping');
export const hiddenRecipeDef = (id: string) => must(HIDDEN_RECIPE, id, 'hiddenRecipe');

// ---------- 손님 100종 어댑터 (generated/v2/guests.json → GuestTypeDef) ----------
/** 구 2종 id → v2 id. 삼춘은 이름이 같은 동네 삼춘, 관광객은 시작부터 오는 청년 타입(대학생)으로. */
export const GUEST_ALIAS: Record<string, string> = { local: 'local_auntie', tourist: 'student' };
export const canonicalGuestId = (id: string): string => GUEST_ALIAS[id] ?? id;
export const GUEST_WEIGHT = 5;
type RawGuest = {
  id: string; name: string; tags: { gender: string | null; age: string | null; group: boolean };
  effect: string; money: number; likes: string[] | null; unlock: Record<string, unknown>;
  questId: string | null; nextGuestId: string | null; chain: string | null; line: string | null;
};
function toTags(t: RawGuest['tags']): GuestTags {
  const gender = t.gender === 'f' || t.gender === 'female' ? 'female' : t.gender === 'm' || t.gender === 'male' ? 'male' : 'any';
  const age = t.age === 'youth' || t.age === 'adult' || t.age === 'senior' ? t.age : 'none';
  return { gender, age, group: !!t.group };
}
/** v2 unlock 객체 → UnlockCond. 모르는 형은 start로 취급하지 않고 never(빈 all) — 데이터 오류가 조용히 해금되지 않게. */
export function toUnlockCond(u: Record<string, unknown> | string | null | undefined): UnlockCond {
  if (u === 'start' || u == null) return { type: 'start' };
  if (typeof u === 'string') return { type: 'all', conditions: [{ type: 'rank', rank: 99 }] };
  const n = (k: string) => Number(u[k] ?? 0);
  switch (u.type) {
    case 'start': return { type: 'start' };
    case 'rank': return { type: 'rank', rank: n('rank') };
    case 'star': return { type: 'star', star: n('star') };
    case 'segment': return { type: 'segment', guestId: canonicalGuestId(String(u.guestId)), satisfaction: n('satisfaction') || 30 };
    case 'quest': return { type: 'quest', questId: String(u.questId) };
    case 'spot': return { type: 'spot', spotId: String(u.spotId), level: n('level') || 1 };
    case 'date': return { type: 'date', year: n('year') || 1, month: n('month') || 1 };
    case 'count': return { type: 'count', objectId: String(u.objectId), count: n('count') || 1 };
    case 'all': return { type: 'all', conditions: (Array.isArray(u.conditions) ? u.conditions : []).map((c) => toUnlockCond(c as Record<string, unknown>)) };
    case 'any': return { type: 'any', conditions: (Array.isArray(u.conditions) ? u.conditions : []).map((c) => toUnlockCond(c as Record<string, unknown>)) };
    case 'goal': return { type: 'goal' };
    case 'shop': return { type: 'goal' }; // 마일리지 상점 구매로 열린다 (trackC shop.ts) — 짓기 창엔 '목표 보상'처럼 잠김 표시
    default: return { type: 'all', conditions: [{ type: 'rank', rank: 99 }] };
  }
}
const WANTS = new Set<GuestWant>(['rest', 'food', 'fun', 'scenery', 'convenience', 'farm']);
const EFFECTS = new Set<GuestEffect>(['item', 'money', 'ad', 'research', 'popularity', 'ticket']);
/** 메뉴 분류: 음료는 누구나. 먹거리 → 식사·디저트, 즐길거리·청년 → 디저트, 시니어 → 식사. */
function likesFromWants(wants: GuestWant[], tags: GuestTags): MenuCategory[] {
  const out: MenuCategory[] = ['drink'];
  if (wants.includes('food') || tags.age === 'senior') out.push('meal');
  if (wants.includes('food') || wants.includes('fun') || tags.age === 'youth') out.push('dessert');
  return out;
}
/** 취향 스탯 (스펙 §15.1 "선호 스탯 2~3개"): 쉼 → 향, 먹거리 → 맛·양, 즐길거리 → 보기, 경치 → 보기, 농사 → 건강·제주. 편의는 없음. */
const WANT_STATS: Record<GuestWant, MenuStatKey[]> = { rest: ['aroma'], food: ['taste', 'volume'], fun: ['look'], scenery: ['look'], convenience: [], farm: ['health', 'jeju'] };
export function likesStatsFromWants(wants: GuestWant[]): MenuStatKey[] {
  const out: MenuStatKey[] = [];
  for (const w of wants) for (const k of WANT_STATS[w]) if (!out.includes(k)) out.push(k);
  return out;
}
/** 경치 기준: 경치를 바라면 3, 청년 2, 성인 1, 시니어·동물 0 */
function minSceneryOf(wants: GuestWant[], tags: GuestTags): number {
  if (wants.includes('scenery')) return 3;
  return tags.age === 'youth' ? 2 : tags.age === 'adult' ? 1 : 0;
}
/** 외국인 손님 체인 (트랙 H §3.2 foreign 태그: 공항 셔틀 ×2·크루즈 ×3, 이모지 말풍선, 감귤 메뉴 선호) */
export const FOREIGN_CHAINS = new Set(['c18_group_foreign', 'c19_solo_foreign']);
// ---------- game-feel P1: 손님층 해금 단계화 (카이로식 「앞 손님 만족 30/50이면 다음 손님」) ----------
/** 원본 표(guests.json)의 체인은 머리(명소 Lv2)→부탁→부탁→… 이라 3년 봇이 19/103밖에 못 만났다. 어댑터에서만 조건을 바꾼다(표·생성 파일은 그대로):
 *  - 체인 머리(명소 Lv2): 「명소 Lv2 **또는** 랭크 r」 — r은 체인 순서대로 HEAD_RANK_GATE(3~10)로 흩어 랭크 업마다 새 손님층이 2~4종 열린다.
 *  - 2번째: 「앞 손님 만족 CHAIN_SAT_2(30) 또는 부탁 완료」. 부탁 완료(quest unlockGuestId)로도 여전히 바로 열린다.
 *  - 3번째부터는 원래대로 부탁 완료만 — 3번째부터는 지갑(평균 1.4만~5.8만)·팁 효과가 커서 앞당기면 3년 자금이 1억을 넘는다(§4.6 밴드). 깊은 컨텐츠도 남긴다.
 *  STAGE_MAX_POS = 앞당기는 마지막 위치. */
export const CHAIN_SAT_2 = 30;
export const STAGE_MAX_POS = 1;
export const HEAD_RANK_GATE = [3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 10, 10, 10];
const RAW_GUESTS = guestsJson as RawGuest[];
const PREV_GUEST = new Map<string, string>();
for (const r of RAW_GUESTS) if (r.nextGuestId) PREV_GUEST.set(canonicalGuestId(r.nextGuestId), canonicalGuestId(r.id));
/** 체인 안 위치 (머리 0) */
export function chainPosition(id: string): number {
  let p = 0;
  for (let cur = canonicalGuestId(id); PREV_GUEST.has(cur); cur = PREV_GUEST.get(cur)!) p++;
  return p;
}
const SPOT_HEAD_ORDER: string[] = RAW_GUESTS.filter((r) => r.unlock && (r.unlock as { type?: string }).type === 'spot' && chainPosition(r.id) === 0).map((r) => canonicalGuestId(r.id));
export function stagedUnlock(id: string, base: UnlockCond): UnlockCond {
  const cid = canonicalGuestId(id);
  const pos = chainPosition(cid);
  if (pos === 0 && base.type === 'spot') {
    const i = SPOT_HEAD_ORDER.indexOf(cid);
    return { type: 'any', conditions: [base, { type: 'rank', rank: HEAD_RANK_GATE[i] ?? HEAD_RANK_GATE[HEAD_RANK_GATE.length - 1]! }] };
  }
  const prev = PREV_GUEST.get(cid);
  if (prev && base.type === 'quest' && pos >= 1 && pos <= STAGE_MAX_POS) return { type: 'any', conditions: [{ type: 'segment', guestId: prev, satisfaction: CHAIN_SAT_2 }, base] }; // 부탁 완료 경로(evaluateUnlocks)도 그대로
  return base;
}

export function adaptGuest(r: RawGuest): GuestTypeDef {
  const tags = toTags(r.tags ?? { gender: null, age: null, group: false });
  const base = toUnlockCond(r.unlock);
  const staged = stagedUnlock(r.id, base);
  if (r.chain && FOREIGN_CHAINS.has(r.chain)) tags.foreign = true;
  const wants = (r.likes ?? []).filter((w): w is GuestWant => WANTS.has(w as GuestWant));
  return {
    id: canonicalGuestId(r.id),
    name: r.name,
    likes: likesFromWants(wants, tags),
    likesStats: likesStatsFromWants(wants),
    minScenery: minSceneryOf(wants, tags),
    popularityShift: tags.age === 'senior' ? -2 : tags.age === 'youth' ? 2 : 0,
    weight: GUEST_WEIGHT,
    tags,
    effect: EFFECTS.has(r.effect as GuestEffect) ? (r.effect as GuestEffect) : 'research',
    wallet: Math.max(0, Number(r.money) || 0),
    wants,
    unlock: staged,
    unlockBase: staged === base ? undefined : base, // 단계 해금으로 바뀐 타입만 (guests.ts stagedFull)
    questId: r.questId ?? null,
    nextGuest: r.nextGuestId ? canonicalGuestId(r.nextGuestId) : null,
    chain: r.chain ?? null,
    line: r.line ?? '',
  };
}
export const GUEST_TYPES: GuestTypeDef[] = (guestsJson as RawGuest[]).map(adaptGuest);
// ---------- 지역 7 · 이름 있는 손님 56 (2B-4, generated/regions.json·named_guests.json) ----------
export const REGIONS: RegionDef[] = regionsJson as RegionDef[];
export const NAMED_GUESTS: NamedGuestDef[] = namedGuestsJson as NamedGuestDef[];
export const namedGuestsOf = (regionId: string): NamedGuestDef[] => NAMED_GUESTS.filter((g) => g.regionId === regionId);
/** 라이벌 카페 타입 6 (v2 표 §15.3) */
export const RIVALS: RivalDef[] = rivalsJson as RivalDef[];
/** 단골★이 본점에 올 때 쓰는 손님 타입 id. GUEST_TYPES에는 없고(스폰·도감·해금 대상 아님) guestTypeDef로만 찾는다 — 취향·예산은 NamedGuestDef가 대신한다. */
export const NAMED_TYPE = 'named';
const NAMED_TYPE_DEF: GuestTypeDef = {
  id: NAMED_TYPE, name: '단골', likes: ['drink', 'dessert', 'meal'], likesStats: [], minScenery: 1, popularityShift: 0, weight: 0,
  tags: { gender: 'any', age: 'adult', group: false }, effect: 'research', wallet: 0, wants: [], unlock: { type: 'all', conditions: [{ type: 'rank', rank: 99 }] },
  questId: null, nextGuest: null, chain: null, line: '',
};
export interface GuestChainDef { chain: string; guests: string[]; edges: { from: string; to: string; quest: string }[] }
export const GUEST_CHAINS: GuestChainDef[] = (chainsJson as GuestChainDef[]).map((c) => ({
  chain: c.chain, guests: c.guests.map(canonicalGuestId), edges: c.edges.map((e) => ({ from: canonicalGuestId(e.from), to: canonicalGuestId(e.to), quest: e.quest })),
}));

// ---------- v2 시설 87 → ObjectDef (objects.json에 없는 것만) ----------
/** 실내 바닥이 있는 건물(방): 발자국 위에 indoor 오브젝트를 놓고 손님이 문(정면 왼쪽)으로 드나든다 */
export const ROOM_IDS = new Set(['warehouse', 'kitchen_ext', 'gallery', 'restroom', 'pottery_studio', 'vinyl_house_room', 'tangerine_hall', 'annex_cafe', 'greenhouse_cafe']);
/** 별관(§8.2): 본관이 아닌 손님용 방 — 올렛길로 이어져야 손님이 간다. 목표 「별관 짓기」·길 끊김 경고 대상. */
export const ANNEX_IDS = new Set(['annex_cafe', 'greenhouse_cafe', 'gallery', 'tangerine_hall', 'vinyl_house_room']);
/** 실내 전용 오브젝트 (방 바닥 위에만) */
export const INDOOR_IDS = new Set([
  'table_in', 'counter', 'sofa', 'bookshelf', 'vending', 'roaster',
  'deco_chalkboard', 'deco_cake_case', 'deco_coffee_machine', 'deco_lp_shelf', 'deco_bookshelf_small', 'deco_umbrella_stand', 'counter_bar', 'menu_board',
  'sofa_seat', 'bar_counter', 'fireplace', 'piano', 'aquarium', 'kids_corner', 'counter_ext', // 트랙 G 실내 가구 (facilities_indoor.json)
]);
/** 좌석 수: 소형 2, 중형 4, 대형 6 */
const SEATS_BY_TIER: Record<string, number> = { small: 2, medium: 4, large: 6 };
/** 건설 기간: 소 1일·중 3일·대 7일 (표에 buildDays가 있으면 그것) */
export const BUILD_DAYS_BY_TIER: Record<string, number> = { small: 1, medium: 3, large: 7 };
const FACILITY_CATEGORIES = new Set<FacilityCategory>(['rest', 'convenience', 'food', 'fun', 'farm', 'scenery', 'landmark']);
type RawFacility = {
  id: string; name: string; category: string; tier: string; w: number; h: number; cost: number; upkeep: number; buildDays?: number;
  popularity: number; feePct: number | null; fee: number | null; scenery: number; noise: number;
  seasonBonus: Record<string, number>; unlock: Record<string, unknown>; unlockText?: string; description: string | null;
  walkSpeedPct?: number; // 활력 화분: 손님·직원 이동 속도 +% (facilities_shop.json)
  seats?: number; // 좌석 정원 덮어쓰기 (facilities_indoor.json 소파석·바 3석) — 없으면 tier 표
};
/** v3: 밭은 없다. v2 표의 field 행은 버린다. */
const REMOVED_FACILITY_IDS = new Set(['field']);
/** 농원 시설의 월 수확 (v2 표에 없는 열 — 어댑터에서 덧씌운다). objects.json에 같은 id가 있으면 그쪽 yield가 우선. */
export const FARM_YIELDS: Record<string, FarmYield> = {
  tangerine_tree: { ingredientId: 'tangerine', perMonth: 6 },
  carrot_field: { ingredientId: 'carrot', perMonth: 8 },
  tea_field: { ingredientId: 'tea', perMonth: 4 },
};
/** v3 시작 시 열려 있는 시설 8종 (§2 해금 리듬). v2 표에서 unlock이 start인 나머지는 목표 보상으로만 열린다({ type: 'goal' }). */
export const START_OBJECT_IDS = ['table_out', 'table_in', 'table_parasol', 'deco_planter', 'deco_wood_bench', 'stonewall', 'path', 'tangerine_tree', 'gate', 'streetlight', 'garden_lamp', 'flower_bed', 'signboard', 'railing', 'shell_deco', 'telescope', 'cherry_tree', 'parking_lot']; // fun P0: 주차장은 처음부터 (₩120만) — 렌터카 손님이 동쪽에서 온다 // fix-indoor: 가로등·정원등은 처음부터 (밤 조명) // w-free: 정낭은 길·담 탭의 일반 시설(₩5만, 이동·철거·추가 가능)
/** v2 시설 표 → ObjectDef. 쉼 → seat, 편의·먹거리·즐길거리·농사 → facility, 경관 → deco, 랜드마크 → landmark. 방은 building. 농원은 경관(deco)+yield. */
export function adaptFacility(r: RawFacility): ObjectDef {
  const room = ROOM_IDS.has(r.id);
  const kind: ObjectDef['kind'] = room ? 'building' : r.category === 'rest' ? (typeof r.fee === 'number' ? 'facility' : 'seat') : r.category === 'scenery' || r.category === 'farm' ? 'deco' : r.category === 'landmark' ? 'landmark' : 'facility';
  const season: Partial<Record<Season, number>> = {};
  for (const k of ['spring', 'summer', 'autumn', 'winter'] as Season[]) if (typeof r.seasonBonus?.[k] === 'number') season[k] = r.seasonBonus[k];
  const def: ObjectDef = {
    id: r.id, name: r.name, kind, w: r.w, h: r.h, cost: r.cost, scenery: r.scenery, noise: Math.max(0, r.noise), wind: r.category === 'scenery' && r.h >= 1 && ['palm', 'cedar'].includes(r.id) ? 1 : 0,
    upkeep: r.upkeep, terrain: ['soil'], popularity: r.popularity, feePct: r.feePct ?? 100,
    desc: r.description ?? undefined, unlock: r.unlock?.type === 'start' && !START_OBJECT_IDS.includes(r.id) ? { type: 'goal' } : toUnlockCond(r.unlock),
    buildDays: typeof r.buildDays === 'number' ? r.buildDays : BUILD_DAYS_BY_TIER[r.tier] ?? 1,
  };
  if (FACILITY_CATEGORIES.has(r.category as FacilityCategory)) def.category = r.category as FacilityCategory;
  if (kind === 'seat') def.seats = typeof r.seats === 'number' ? r.seats : SEATS_BY_TIER[r.tier] ?? 2;
  if (typeof r.fee === 'number') def.fee = r.fee;
  if (Object.keys(season).length > 0) def.seasonScenery = season;
  if (room) def.room = true;
  if (INDOOR_IDS.has(r.id)) def.indoor = true;
  if (typeof r.unlockText === 'string') def.unlockText = def.unlock?.type === 'goal' ? '목표 보상' : r.unlockText;
  if (FARM_YIELDS[r.id]) def.yield = FARM_YIELDS[r.id];
  if (typeof r.walkSpeedPct === 'number') def.walkSpeedPct = r.walkSpeedPct;
  if (r.unlock?.type === 'shop' && typeof r.unlockText === 'string') def.unlockText = r.unlockText; // 상점 설계도는 '목표 보상' 대신 상점 이름
  return def;
}
const BASE_OBJECTS: ObjectDef[] = [...(objectsJson as ObjectDef[]), ...TERRAIN_OBJECTS, ...LANDMARKS].map((o) => (ROOM_IDS.has(o.id) ? { ...o, room: true as const } : o));
const BASE_IDS = new Set(BASE_OBJECTS.map((o) => o.id));
/** v2 시설 중 objects.json·랜드마크에 아직 없는 것 (시설 순회·실내 가구·증축용) */
/** v2 표 109 + HSS2 확장 44 (facilities_x.json, 스펙 §3.2.1). 쉼 분류라도 요금이 있으면(족욕탕 등) 순회 시설. */
const FACILITY_ROWS: RawFacility[] = [...(facilitiesJson as unknown as RawFacility[]), ...(facilitiesXJson as unknown as RawFacility[]), ...(facilitiesShopJson as unknown as RawFacility[]), ...(facilitiesIndoorJson as unknown as RawFacility[])];
/** 확장 44종 id (스펙 §3.2.1). 목표 해금(goal:gNN)은 트랙 B의 108 목표가 연다 — unlockRef에 목표 번호가 남아 있다. */
export const FACILITY_X_IDS = new Set((facilitiesXJson as { id: string }[]).map((f) => f.id));
export const FACILITY_X_GOAL_REFS: Record<string, string> = Object.fromEntries((facilitiesXJson as { id: string; unlockRef: string }[]).filter((f) => f.unlockRef.startsWith('goal:')).map((f) => [f.id, f.unlockRef.slice(5)]));
export const FACILITIES: ObjectDef[] = FACILITY_ROWS.filter((r) => !BASE_IDS.has(r.id) && !REMOVED_FACILITY_IDS.has(r.id)).map(adaptFacility);
/** 시작부터 열려 있는 v2 시설 (v3: START_OBJECT_IDS 중 v2 표에만 있는 것) */
export const FACILITY_START_IDS: string[] = FACILITIES.filter((f) => f.unlock?.type === 'start').map((f) => f.id);
export const OBJECTS: ObjectDef[] = [...BASE_OBJECTS, ...FACILITIES];

// ---------- 짓기 탭 카테고리 (v1·v2 오브젝트를 한 목록에서 묶어 보여준다) ----------
/** id → v2 시설 카테고리. v1과 id가 겹치는 것(table_out 등)도 v2 표엔 카테고리가 있어서 여기서 찾을 수 있다. */
const FACILITY_CATEGORY_BY_ID: Record<string, FacilityCategory> = {};
for (const r of FACILITY_ROWS) {
  if (FACILITY_CATEGORIES.has(r.category as FacilityCategory)) FACILITY_CATEGORY_BY_ID[r.id] = r.category as FacilityCategory;
}
/** 짓기 탭 하위 탭 7종 */
export type BuildGroup = 'indoor' | 'rest' | 'convenience' | 'food' | 'fun' | 'farm' | 'sceneryDeco' | 'pathWall';
export const BUILD_GROUPS: { key: BuildGroup; label: string }[] = [
  { key: 'indoor', label: '실내' }, { key: 'rest', label: '쉼' }, { key: 'convenience', label: '편의' }, { key: 'food', label: '먹거리' },
  { key: 'fun', label: '즐길거리' }, { key: 'farm', label: '농원' }, { key: 'sceneryDeco', label: '경관·장식' }, { key: 'pathWall', label: '길·담' },
];
/** 오브젝트 하나가 짓기 탭 어느 하위 탭에 속하는지. 길·담 타일은 카테고리가 없어 kind로 가른다. 경관·랜드마크·미분류는 경관·장식으로 묶는다. */
export function buildGroupOf(id: string): BuildGroup {
  const def = objectDef(id);
  if (def.kind === 'path' || def.kind === 'wall' || def.kind === 'gate' || id === 'streetlight') return 'pathWall'; // 가로등은 길·담 탭 (fix-indoor)
  if (def.indoor) return 'indoor'; // 트랙 G: 실내 가구는 「실내」 탭
  const cat = FACILITY_CATEGORY_BY_ID[id] ?? def.category;
  if (cat === 'rest' || cat === 'convenience' || cat === 'food' || cat === 'fun' || cat === 'farm') return cat;
  return 'sceneryDeco';
}

// ---------- 부탁 103 ----------
type RawQuest = { id: string; guestId: string; description: string; condition: { type: string; params?: Record<string, unknown> }; rewards: Record<string, unknown>[]; rewardText: string | null; unlockGuestId: string | null };
function toQuestCondition(c: RawQuest['condition']): QuestCondition {
  const p = c.params ?? {};
  const n = (k: string, d = 1) => Number(p[k] ?? d);
  switch (c.type) {
    case 'menuSold': return { type: 'menuSold', params: { menuId: String(p.menuId), count: n('count') } };
    case 'objectPlaced': return { type: 'objectPlaced', params: { objectId: String(p.objectId), count: n('count') } };
    case 'spotLevel': return { type: 'spotLevel', params: { spotId: String(p.spotId), level: n('level') } };
    case 'segmentPopularity': return { type: 'segmentPopularity', params: { guestId: canonicalGuestId(String(p.guestId)), popularity: n('popularity', 30) } };
    case 'item': return { type: 'item', params: { itemId: String(p.itemId), count: n('count') } };
    default: return { type: 'none', params: {} };
  }
}
function toQuestReward(r: Record<string, unknown>): QuestReward | null {
  const t = r.type;
  if (t === 'item') return typeof r.itemId === 'string' ? { type: 'item', itemId: r.itemId } : null;
  if (t === 'money' || t === 'research' || t === 'ticket' || t === 'mileage' || t === 'ad') return { type: t, amount: Number(r.amount ?? 0) };
  return null;
}
export const QUESTS: QuestDef[] = (questsJson as RawQuest[]).map((q) => ({
  id: q.id,
  guestId: canonicalGuestId(q.guestId),
  description: q.description,
  condition: toQuestCondition(q.condition),
  rewards: (q.rewards ?? []).map(toQuestReward).filter((r): r is QuestReward => r !== null),
  rewardText: q.rewardText ?? '',
  unlockGuestId: q.unlockGuestId ? canonicalGuestId(q.unlockGuestId) : null,
}));

// ---------- 관광지 24 ----------
type RawSpot = { id: string; name: string; category: string; categoryName: string; order: number; levels: { level: number; cost: number; appeal: number }[]; lv2GuestId: string | null; lv4QuestId: string | null; nextSpotId: string | null; unlock: Record<string, unknown>; tag?: string; facilityCategory?: string; lv3ItemId?: string | null; lv5Special?: SpotSpecial | null };
const SPOT_CATEGORIES = new Set<SpotCategory>(['sight', 'food', 'play', 'nature']);
/** 분류 → 태그·시설 분류 (§3.4.2): 볼거리 female·쉼 / 먹거리 group·먹거리 / 놀거리 youth·즐길거리 / 자연 senior·쉼 */
export const SPOT_TAG_OF: Record<SpotCategory, SpotTag> = { sight: 'female', food: 'group', play: 'youth', nature: 'senior' };
export const SPOT_FACILITY_OF: Record<SpotCategory, FacilityCategory> = { sight: 'rest', food: 'food', play: 'fun', nature: 'rest' };
export const SPOTS: SpotDef[] = (spotsJson as RawSpot[]).map((r) => {
  const category = SPOT_CATEGORIES.has(r.category as SpotCategory) ? (r.category as SpotCategory) : 'sight';
  return {
    id: r.id,
    name: r.name,
    category,
    categoryName: r.categoryName,
    order: r.order,
    levels: r.levels.map((l) => ({ level: l.level, cost: l.cost, appeal: l.appeal })),
    lv2GuestId: r.lv2GuestId ? canonicalGuestId(r.lv2GuestId) : null,
    lv4QuestId: r.lv4QuestId ?? null,
    nextSpotId: r.nextSpotId ?? null,
    unlock: toUnlockCond(r.unlock),
    tag: (r.tag as SpotTag | undefined) ?? SPOT_TAG_OF[category],
    facilityCategory: (r.facilityCategory as FacilityCategory | undefined) ?? SPOT_FACILITY_OF[category],
    lv3ItemId: r.lv3ItemId ?? null,
    lv5Special: r.lv5Special ?? null,
  };
});

// ---------- 이벤트 42 ----------
type RawEvent = { id: string; name: string; seasonText: string | null; prob: number; conditionText: string | null; effectText: string | null; line: string | null };
const SEASON_MONTHS: Record<string, number[]> = { '봄': [3, 4, 5], '여름': [6, 7, 8], '가을': [9, 10, 11], '겨울': [12, 1, 2] };
/** "7~9월·12~1월" / "봄·가을" / "매월" → 달 목록. "매주 토"·"밭 조성 시"처럼 달 단위가 아니면 빈 배열. */
export function parseSeasonMonths(text: string | null): number[] {
  if (!text) return [];
  if (text.includes('매월')) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const out = new Set<number>();
  for (const part of text.split('·')) {
    const p = part.trim();
    if (SEASON_MONTHS[p]) { for (const m of SEASON_MONTHS[p]!) out.add(m); continue; }
    const range = /^(\d+)\s*~\s*(\d+)월$/.exec(p);
    if (range) {
      const a = Number(range[1]), b = Number(range[2]);
      for (let m = a; ; m = (m % 12) + 1) { out.add(m); if (m === b) break; }
      continue;
    }
    const single = /^(\d+)월$/.exec(p);
    if (single) out.add(Number(single[1]));
  }
  return [...out].sort((a, b) => a - b);
}
export const EVENTS: EventDef[] = (eventsJson as RawEvent[]).map((r) => {
  const spec = EVENT_EFFECTS[r.id];
  return {
    id: r.id,
    name: r.name,
    months: parseSeasonMonths(r.seasonText),
    prob: Math.max(0, Math.min(100, Number(r.prob) || 0)),
    conditionText: r.conditionText,
    effectText: r.effectText ?? '',
    line: r.line ?? '',
    choice: spec?.choice ?? false,
    effects: spec?.effects ?? [],
    declineEffects: spec?.decline ?? [],
  };
});

/** 목표 체인 60 (v3 §2, 순차) */
export const GOALS: GoalDef[] = goalsJson as unknown as GoalDef[];
/** 도전 과제 풀 40 (§7.3) */
export const CHALLENGES: ChallengeDef[] = challengesJson as unknown as ChallengeDef[];
/** 제주 빅 이벤트 (v3 A5) */
export const BIG_EVENTS: BigEventDef[] = eventsV3Json as unknown as BigEventDef[];
/** 빅 이벤트 특별 손님의 지역 id (REGIONS에는 없다 — 팝업 대상이 아니다). namedId = 'special:<eventId>' */
export const SPECIAL_REGION = 'special';
export const specialGuestId = (eventId: string): string => `${SPECIAL_REGION}:${eventId}`;
/** 특별 손님 → NamedGuestDef (namedGuestDef로만 찾는다. NAMED_GUESTS·도감 56에는 안 들어간다) */
export const SPECIAL_GUESTS: NamedGuestDef[] = BIG_EVENTS.filter((e) => e.effects.specialGuest).map((e, i) => {
  const g = e.effects.specialGuest!;
  return { id: specialGuestId(e.id), regionId: SPECIAL_REGION, no: 100 + i, name: g.name, job: '특별 손님', line: g.line, likesBase: ['any'], likesStats: [], budget: g.budget, face: { seed: g.portraitSeed }, acc: [] };
});
export const ROLES = staffRolesJson as RoleDef[];
export const SKILLS = skillsJson as unknown as SkillDef[];
export const STAFF_POOL = staffPoolJson as StaffPoolDef[];
export const RECRUIT_TIERS = recruitTiersJson as RecruitTierDef[];
export const TRAININGS = trainingsJson as TrainingDef[];
export const TITLES = titlesJson as TitleDef[]; // 직원 칭호 30 (staff-luck)
export const NAMES = namesJson as { names: string[]; surnames: string[]; given: string[]; hair: number; skin: number; top: number }; // fun-guest: 성·이름 풀 추가
export const PROMOTIONS = promotionsJson as unknown as PromotionDef[];
export const DIALOGUE = dialogueJson as {
  guest: Record<string, { happy: string[]; meh: { no_menu: string[]; scenery: string[]; wait: string[] } }>;
};

// ---------- 인구 태그 (마스터 GDD §1) ----------
export function guestTags(typeId: string): GuestTags {
  return guestTypeDef(typeId).tags;
}
/** 손님 대사. 타입별 대사가 없으면 시니어는 삼춘, 나머지는 관광객(대학생) 말투를 빌린다. */
export function guestDialogue(typeId: string): { happy: string[]; meh: { no_menu: string[]; scenery: string[]; wait: string[] } } {
  const id = canonicalGuestId(typeId);
  return DIALOGUE.guest[id] ?? DIALOGUE.guest[guestTags(id).age === 'senior' ? 'local_auntie' : 'student']!;
}
/** 콤보·세트 대상이 이 태그의 손님에게 해당하나 */
export function targetMatches(target: ComboTarget, tags: GuestTags): boolean {
  switch (target) {
    case 'all': return true;
    case 'female': case 'male': return tags.gender === target;
    case 'youth': case 'adult': case 'senior': return tags.age === target;
    case 'group': return tags.group;
  }
}

// ---------- 상성·세트·아이템 어댑터 (v1 generated/*.json ↔ v2 generated/v2/*.json 둘 다 받는다) ----------
/** v1 표의 한글 손님층 → 인구 태그. v2는 이미 target 코드(all|female|…)라 그대로 통과. */
const TARGET_KO: Record<string, ComboTarget> = {
  '전체': 'all', '여성': 'female', '남성': 'male', '청년': 'youth', '성인': 'adult', '시니어': 'senior', '단체': 'group',
  '관광객': 'youth', '삼춘': 'senior', '가족': 'group', '유튜버': 'youth', '커플': 'youth', '한 달 살기': 'adult',
  '외국 여행자': 'adult', '밤 손님': 'adult', '러닝크루': 'youth', '올레꾼': 'youth',
};
const TARGET_CODES = new Set<ComboTarget>(['all', 'female', 'male', 'youth', 'adult', 'senior', 'group']);
function toTarget(v: unknown): ComboTarget {
  if (Array.isArray(v)) return toTarget(v[0]);
  if (typeof v !== 'string') return 'all';
  if (TARGET_CODES.has(v as ComboTarget)) return v as ComboTarget;
  const first = v.split(/[·,/]/)[0]!.trim();
  return TARGET_KO[first] ?? 'all';
}
/** v1 effectText에서 대상 손님층을 찾는다 ("관광객 ↑ …" → youth). 없으면 전체. */
function targetFromText(text: string): ComboTarget {
  for (const [ko, code] of Object.entries(TARGET_KO)) if (ko !== '전체' && text.includes(ko)) return code;
  return 'all';
}
const UPUP_NAMES = new Set(['정상 전망', '천년의 그늘', '저녁 한 상', '인생샷 기념품', '바리스타 쇼']);
/** v2 규칙: 이름에 소음·시끄러운 → ↓, 특정 5개 → ↑↑, 나머지 ↑. v1은 effectText의 화살표로. */
function toStrength(v: unknown, name: string, text: string): ComboStrength {
  if (v === 'up' || v === 'upup' || v === 'down' || v === 'none') return v;
  if (text.includes('↑↑')) return 'upup';
  if (text.includes('↑')) return 'up';
  if (text.includes('↓')) return 'down';
  if (name.includes('소음') || name.includes('시끄러운')) return 'down';
  if (UPUP_NAMES.has(name)) return 'upup';
  return text ? 'none' : 'up';
}
function toSide(v: unknown): ComboSide {
  if (v === 'a' || v === 'b' || v === 'both') return v;
  if (v === 'A') return 'a';
  if (v === 'B') return 'b';
  if (v === '둘 다') return 'both';
  return 'a';
}
function toBool(v: unknown): boolean { return v === true || v === '예' || v === 'true'; }
function toIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(/[/·,]/).map((x) => x.trim().split(' ')[0]!).filter(Boolean);
  return [];
}
/** v1 effectText의 따옴표 이름("귤밭 뷰") → 콤보 이름. 없으면 텍스트 그대로. */
function nameFromText(text: string, a: string, b: string): string {
  const m = /"([^"]+)"/.exec(text);
  return m?.[1] ?? (text || `${a}+${b}`);
}
const SIDE_WORDS = new Set(['A', 'B', '둘 다', 'a', 'b', 'both']);
type RawCombo = Record<string, unknown>;
export function adaptCombo(r: RawCombo): ComboDef {
  const a = String(r.a ?? r.objectA ?? '');
  const bIds = toIds(r.bIds ?? r.b);
  const text = typeof r.effectText === 'string' ? r.effectText : '';
  const name = typeof r.name === 'string' ? r.name : nameFromText(text, a, bIds[0] ?? '');
  // v2 표의 "효과" 열은 보너스를 받는 쪽(A/B/둘 다). v1엔 없어 A.
  const applyToRaw = r.applyTo ?? r.side ?? (typeof r.effect === 'string' && SIDE_WORDS.has(r.effect) ? r.effect : undefined);
  return {
    id: typeof r.id === 'string' ? r.id : `cb_${a}_${bIds[0] ?? 'x'}`,
    name,
    a,
    bIds,
    bCount: typeof r.bCount === 'number' ? r.bCount : 1,
    target: r.target !== undefined ? toTarget(r.target) : targetFromText(text),
    strength: toStrength(r.strength ?? r.grade, name, text),
    applyTo: toSide(applyToRaw),
    hidden: toBool(r.hidden),
    radius: typeof r.radius === 'number' ? r.radius : COMBO_META.radius,
    effectText: text || name,
  };
}
type RawSet = Record<string, unknown>;
export function adaptSet(r: RawSet): SetDef {
  const reqRaw = (r.requires ?? r.objects ?? []) as { objectId?: string | null; name?: string; count?: number; id?: string }[];
  const requires = reqRaw
    .map((q) => ({ objectId: q.objectId ?? q.id ?? (q.name === '용천수' ? 'spring' : null), count: q.count ?? 1 }))
    .filter((q): q is { objectId: string; count: number } => typeof q.objectId === 'string');
  return {
    id: String(r.id),
    name: String(r.name ?? r.id),
    requires,
    target: r.target !== undefined ? toTarget(r.target) : toTarget(r.targets),
    radius: typeof r.radius === 'number' ? r.radius : 3,
    levelMult: Array.isArray(r.levelMult) ? (r.levelMult as number[]) : [1.1, 1.2, 1.35],
    effectText: typeof r.effectText === 'string' ? r.effectText : undefined,
  };
}
type RawItem = Record<string, unknown>;
/** v2 효과 문자열 "인기 +5" / "가격 +10" → stat·value. v1(분류 0~3 표)은 인기 +5 기본. */
function parseItemEffect(v: unknown): { stat: ItemDef['stat']; value: number } {
  if (v && typeof v === 'object') { const o = v as { stat?: string; value?: number }; return { stat: o.stat === 'feePct' ? 'feePct' : 'popularity', value: o.value ?? 5 }; }
  if (typeof v === 'string') {
    const m = /([+-]?\d+)/.exec(v);
    return { stat: v.includes('가격') || v.includes('요금') ? 'feePct' : 'popularity', value: m ? Number(m[1]) : 5 };
  }
  return { stat: 'popularity', value: 5 };
}
export function adaptItem(r: RawItem): ItemDef {
  const eff = parseItemEffect(r.effect);
  const slots: Partial<Record<ItemSlot, number>> = {};
  for (const k of ['seat', 'facility', 'farm', 'env'] as ItemSlot[]) if (typeof r[k] === 'number') slots[k] = r[k] as number;
  return {
    id: String(r.id),
    name: String(r.name ?? r.id),
    stat: eff.stat,
    value: eff.value,
    fitIds: toIds(r.fitIds ?? r.fit ?? r.bestFacilities ?? r.fitText ?? []),
    fitSlots: Object.keys(slots).length > 0 ? slots : undefined,
    sourceText: String(r.sourceText ?? r.source ?? ''),
  };
}
export const COMBO_META = {
  radius: (compatMetaJson as { radius?: number }).radius ?? 2,
  up: (compatMetaJson as { up?: { pop: number; feePct: number } }).up ?? { pop: 3, feePct: 5 },
  upup: (compatMetaJson as { upup?: { pop: number; feePct: number } }).upup ?? { pop: 6, feePct: 10 },
  down: (compatMetaJson as { down?: { pop: number; feePct: number } }).down ?? { pop: -3, feePct: -5 },
  segmentPopularity: (compatMetaJson as { segmentPopularity?: number }).segmentPopularity ?? 3,
};
/** 상성 12 (combos.json, 스펙 §3.1 → fun-reset §3: 코너와 겹치거나 같은 시설 반복인 것은 코너 24종으로 옮겼다). */
export const COMBOS: ComboDef[] = (combosJson as RawCombo[]).map(adaptCombo);
/** 명당 12 (spot_effects.json, 스펙 §3.1): 중심 시설 1개 + 반경 2칸 안의 시설 조합 */
export const SPOT_EFFECTS: SpotEffectDef[] = (spotEffectsJson as { id: string; name: string; center: string; requires: { objectId: string; count: number }[]; target: string; radius: number; guestMult: number; popularity: number; tickets: number; line: string }[]).map((r) => ({
  id: r.id, name: r.name, center: r.center, requires: r.requires, target: toTarget(r.target), radius: r.radius, guestMult: r.guestMult, popularity: r.popularity, tickets: r.tickets, line: r.line,
}));
export const SETS: SetDef[] = (aurasJson as RawSet[]).map(adaptSet);
/** 강화 아이템 20(v2: 잘 맞는 시설 ×2) — v1 표에도 있는 것은 v1 분류(0~3)를 같이 갖는다 + v1에만 있는 것 + 특수 아이템 12(씨앗 3종만 효과) */
const ITEMS_V1: ItemDef[] = (itemsJson as RawItem[]).map(adaptItem);
const V1_BY_ID = new Map(ITEMS_V1.map((i) => [i.id, i] as const));
/** 강화 아이템 "잘 맞는 시설" 확장 매핑 (스펙 §3.2.1 끝): 새 시설 44종을 기존 20종에 편입. 해초 비료의 field는 밭 폐지로 뺀다. */
export const ITEM_FIT_EXTRA: Record<string, string[]> = {
  jeju_salt: ['sauna_hut', 'cauldron_footbath'], bean_sample: ['tea_house'], conch_shell: ['footbath', 'open_air_footbath'], galot_cushion: ['rest_pavilion', 'lie_footbath'],
  comic_book: ['pc_zone', 'lounge'], lp_record: ['yoga_class', 'vintage_shop'], sneakers: ['fitness_corner', 'pingpong', 'archery_range'], glasses: ['pc_zone', 'shooting_booth', 'archery_range'],
  folk_scroll: ['tea_house', 'flower_workshop', 'vintage_shop', 'fine_dining'], tv: ['lounge', 'retro_arcade', 'brunch_house'], pottery_jar: ['lounge'], gold_leaf: ['fine_dining', 'clothing_shop'],
  jeju_tea_set: ['tea_house', 'lounge'], honey: ['sweet_potato_cart', 'candy_shop'], flower_poster: ['flower_shop', 'hair_salon'], lantern: ['waterfall_shower'],
};
const ITEMS_V2: ItemDef[] = (itemsV2Json as RawItem[]).map((r) => {
  const def = adaptItem(r);
  const v1 = V1_BY_ID.get(def.id);
  const fitIds = [...def.fitIds.filter((id) => !REMOVED_FACILITY_IDS.has(id)), ...(ITEM_FIT_EXTRA[def.id] ?? [])];
  const out = { ...def, fitIds };
  return v1?.fitSlots ? { ...out, fitSlots: v1.fitSlots } : out;
});
const V2_IDS = new Set(ITEMS_V2.map((i) => i.id));
const ITEMS_V1_ONLY = ITEMS_V1.filter((i) => !V2_IDS.has(i.id));
/** 씨앗·열매는 시설(또는 손님층)에 쓸 수 있는 특수 아이템: 감귤 씨앗 인기 +5, 한라봉 씨앗 요금 +5%, 경관 씨앗 경관 +3. 나머지 특수 아이템은 효과 0(열쇠·부탁 보상). */
const SEED_EFFECT: Record<string, { stat: ItemDef['stat']; value: number }> = {
  tangerine_seed: { stat: 'popularity', value: 5 },
  hallabong_seed: { stat: 'feePct', value: 5 },
  scenery_seed: { stat: 'scenery', value: 3 },
};
export const POPULARITY_FRUIT = 'popularity_fruit';
export const POPULARITY_FRUIT_DELTA = 10;
const SPECIAL_ITEMS: ItemDef[] = (specialItemsJson as RawItem[]).map((r) => {
  const id = String(r.id);
  const eff = SEED_EFFECT[id] ?? { stat: 'popularity' as const, value: 0 };
  return { id, name: String(r.name ?? r.id), stat: eff.stat, value: eff.value, fitIds: [], sourceText: String(r.sourceText ?? '') };
});
/** 손님 선물 8 (§3.3.5): 시설·손님층에 쓰는 대신 손님 카드 「선물하기」로 쓴다. ITEMS에도 들어가 인벤토리·도감·라벨이 같은 표를 쓴다. */
export const GIFTS: GiftDef[] = giftsJson as GiftDef[];
const GIFT_ITEMS: ItemDef[] = GIFTS.map((g) => ({ id: g.id, name: g.name, stat: 'popularity' as const, value: 0, fitIds: [], sourceText: g.sourceText }));
export const SPECIAL_ITEM_IDS: string[] = SPECIAL_ITEMS.map((i) => i.id);
/** 특수 아이템 효과 문구 (도감 표시용) */
export const SPECIAL_ITEM_EFFECT: Record<string, string> = Object.fromEntries((specialItemsJson as RawItem[]).map((r) => [String(r.id), String(r.effectText ?? '')]));
export const ITEMS: ItemDef[] = [...ITEMS_V2, ...ITEMS_V1_ONLY, ...SPECIAL_ITEMS, ...GIFT_ITEMS];

// ---------- 마일리지 상점·응모권 상점·유니폼·인형뽑기·가이드북·★ (2B-2 Task 6·7) ----------
export const MILEAGE_SHOP: MileageShopDef[] = mileageShopJson as MileageShopDef[];
/** 응모권 상점 (추첨 항목은 drawTicket 액션이 따로 맡는다) */
export const TICKET_SHOP: TicketShopDef[] = (ticketShopJson as TicketShopDef[]).filter((t) => t.id !== 'ts_draw');
export const UNIFORMS: UniformDef[] = uniformsJson as UniformDef[];
/** 인형뽑기 상품: v1 roulette.json 8칸 가중치를 그대로 쓰고 라벨만 바꾼다 */
const DRAW_KIND_OF: Record<string, DrawPrizeKind> = { money: 'money', research: 'research', ingredient_box: 'ingredient_box', medal: 'mileage', item: 'item', samchun_visit: 'seed', free_promo: 'uniform_piece', miss: 'miss' };
const DRAW_LABEL: Record<DrawPrizeKind, string> = { money: '돈', research: '연구', ingredient_box: '재료 상자', mileage: '마일리지', item: '강화 아이템', seed: '씨앗', uniform_piece: '유니폼 조각', miss: '꽝' };
/** game-feel P2: 꽝이 5%라 3년 132회 중 3번 — 당첨이 당연해진다 → 꽝 15%, 4등(돈·연구)을 그만큼 줄인다 (표 roulette.json은 그대로, 어댑터에서 덧씌움) */
export const DRAW_PCT_OVERRIDE: Record<string, number> = { miss: 15, money: 20, research: 15 };
export const DRAW_PRIZES: DrawPrizeDef[] = (rouletteJson as { slots: { id: string; pct: number }[] }).slots.map((sl) => {
  const kind = DRAW_KIND_OF[sl.id] ?? 'miss';
  return { kind, label: DRAW_LABEL[kind], pct: DRAW_PCT_OVERRIDE[sl.id] ?? sl.pct };
});
/** 가이드북 심사 가중치(합 1)·라이벌 곡선은 guidebooks.json에 (트랙 E §3.7) */
type RawGuidebook = { id: string; name: string; unlock: Record<string, unknown>; unlockText: string; criteriaText: string; prize: number; research: number; seeds: { itemId: string; count: number }[]; weights: Partial<Record<JudgeKey, number>>; rivalTop: number; rivalGrowth: number; mileage?: number };
/** 가이드북 해금: count는 분류 개수, segment는 손님층 인기 */
function toGuidebookUnlock(u: Record<string, unknown>): UnlockCond {
  if (u.type === 'count' && typeof u.category === 'string') return { type: 'category', category: u.category as FacilityCategory, count: Number(u.count) || 1 };
  if (u.type === 'segment' && typeof u.popularity === 'number') return { type: 'segmentPop', guestId: canonicalGuestId(String(u.guestId)), popularity: u.popularity };
  return toUnlockCond(u);
}
/** 해금 문구의 손님 id를 이름으로 ("손님 insta_traveler 인기 30" → "인스타 여행자 인기 30") */
function guidebookUnlockText(u: UnlockCond, text: string): string {
  if (u.type !== 'segmentPop') return text;
  const name = GUEST_TYPES.find((t) => t.id === u.guestId)?.name ?? u.guestId;
  return `${name} 손님 인기 ${u.popularity}`;
}
export const GUIDEBOOKS: GuidebookDef[] = (guidebooksJson as RawGuidebook[]).map((g) => {
  const unlock = toGuidebookUnlock(g.unlock);
  return {
  id: g.id, name: g.name, unlock, unlockText: guidebookUnlockText(unlock, g.unlockText), criteriaText: g.criteriaText,
  weights: g.weights, rivalTop: g.rivalTop, rivalGrowth: g.rivalGrowth, prize: g.prize, research: g.research, seeds: g.seeds ?? [], mileage: g.mileage ?? 0, monthly: g.id === 'gb_coop_monthly',
  };
});
export interface StarDef { star: number; conditions: string[]; unlockText: string }
/** ★ 등급 조건 (ranks.json): 월초에 조건 문구를 해석해 검사한다 */
export const STARS: StarDef[] = (ranksJson as { star: number; conditions: string[]; unlockText: string }[]).map((r) => ({ star: r.star, conditions: r.conditions, unlockText: r.unlockText }));
/** 경관 계절 보너스 (v2 표 §13.1). ObjectDef.seasonScenery가 없을 때 id로 찾는다. */
export const SEASON_SCENERY: Record<string, Partial<Record<Season, number>>> = {
  canola: { spring: 12 }, hydrangea: { summer: 9 }, pampas: { autumn: 9 }, camellia: { winter: 11 },
  palm: { summer: 3 }, cedar: { winter: 2 }, pond: { summer: 18 }, hackberry_millennium: { summer: 10 },
};

function indexBy<T extends { id: string }>(xs: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const x of xs) {
    if (Object.prototype.hasOwnProperty.call(out, x.id)) throw new Error(`duplicate id: ${x.id}`);
    out[x.id] = x;
  }
  return out;
}
const OBJ = indexBy(OBJECTS);
const MENU = indexBy(MENUS);
const GUEST = indexBy([...GUEST_TYPES, NAMED_TYPE_DEF]);
const QUEST = indexBy(QUESTS);
const SPOT = indexBy(SPOTS);
const EVENT = indexBy(EVENTS);
const ROLE = indexBy(ROLES);
const SKILL = indexBy(SKILLS);
const STAFF_POOL_BY_ID = indexBy(STAFF_POOL);
const RECRUIT_TIER = indexBy(RECRUIT_TIERS);
const TRAINING = indexBy(TRAININGS);
const TITLE = indexBy(TITLES);
const PROMOTION = indexBy(PROMOTIONS);
const COMBO = indexBy(COMBOS);
const SET = indexBy(SETS);
const SPOT_EFFECT = indexBy(SPOT_EFFECTS);
const ITEM = indexBy(ITEMS);

function must<T>(map: Record<string, T>, id: string, what: string): T {
  const v = map[id];
  if (!v) throw new Error(`unknown ${what}: ${id}`);
  return v;
}
export const objectDef = (id: string) => must(OBJ, id, 'object');
export const comboDef = (id: string) => must(COMBO, id, 'combo');
export const setDef = (id: string) => must(SET, id, 'set');
export const spotEffectDef = (id: string) => must(SPOT_EFFECT, id, 'spotEffect');
export const itemDef = (id: string) => must(ITEM, id, 'item');
export const menuDef = (id: string) => must(MENU, id, 'menu');
export const guestTypeDef = (id: string) => must(GUEST, canonicalGuestId(id), 'guestType');
export const questDef = (id: string) => must(QUEST, id, 'quest');
export const spotDef = (id: string) => must(SPOT, id, 'spot');
export const eventDef = (id: string) => must(EVENT, id, 'event');
export const roleDef = (id: string) => must(ROLE, id, 'role');
export const skillDef = (id: string) => must(SKILL, id, 'skill');
export const staffPoolDef = (id: string) => must(STAFF_POOL_BY_ID, id, 'staffPool');
export const recruitTierDef = (id: string) => must(RECRUIT_TIER, id, 'recruitTier');
export const trainingDef = (id: string) => must(TRAINING, id, 'training');
export const titleDef = (id: string) => must(TITLE, id, 'title');
export const promotionDef = (id: string) => must(PROMOTION, id, 'promotion');
const MILEAGE_ITEM = indexBy(MILEAGE_SHOP);
const TICKET_ITEM = indexBy(TICKET_SHOP);
const UNIFORM = indexBy(UNIFORMS);
const GUIDEBOOK = indexBy(GUIDEBOOKS);
export const mileageShopDef = (id: string) => must(MILEAGE_ITEM, id, 'mileageShop');
export const ticketShopDef = (id: string) => must(TICKET_ITEM, id, 'ticketShop');
export const uniformDef = (id: string) => must(UNIFORM, id, 'uniform');
const GIFT = indexBy(GIFTS);
export const giftDef = (id: string) => must(GIFT, id, 'gift');
export const isGiftId = (id: string): boolean => id in GIFT;
export const guidebookDef = (id: string) => must(GUIDEBOOK, id, 'guidebook');
const GOAL = indexBy(GOALS);
const CHALLENGE = indexBy(CHALLENGES);
const BIG_EVENT = indexBy(BIG_EVENTS);
export const goalDef = (id: string) => must(GOAL, id, 'goal');
export const challengeDef = (id: string) => must(CHALLENGE, id, 'challenge');
export const bigEventDef = (id: string) => must(BIG_EVENT, id, 'bigEvent');
const REGION = indexBy(REGIONS);
const RIVAL = indexBy(RIVALS);
export const rivalDef = (id: string) => must(RIVAL, id, 'rival');
const NAMED_GUEST = indexBy([...NAMED_GUESTS, ...SPECIAL_GUESTS]);
export const regionDef = (id: string) => must(REGION, id, 'region');
export const namedGuestDef = (id: string) => must(NAMED_GUEST, id, 'namedGuest');

/** 게임 시작 시 이미 열려 있는 것 (v3 §2: 시설 8종·메뉴 3종. 나머지는 목표·랭크·부탁 보상) */
export const INITIAL_UNLOCKED = {
  objects: START_OBJECT_IDS,
  menus: ['americano', 'latte', 'tangerine_juice'],
};

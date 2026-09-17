import type { ObjectDef, CropDef, MenuDef, GuestTypeDef, UnlockDef, IngredientDef, RoleDef, SkillDef, PromotionDef, GuestTags, ComboDef, ComboTarget, ComboStrength, ComboSide, SetDef, ItemDef, ItemSlot, Season } from '../sim/types.ts';
import objectsJson from './objects.json' with { type: 'json' };
import cropsJson from './crops.json' with { type: 'json' };
import menusJson from './menus.json' with { type: 'json' };
import guestsJson from './guests.json' with { type: 'json' };
import unlocksJson from './unlocks.json' with { type: 'json' };
import ingredientsJson from './ingredients.json' with { type: 'json' };
import staffRolesJson from './staff_roles.json' with { type: 'json' };
import skillsJson from './skills.json' with { type: 'json' };
import namesJson from './names.json' with { type: 'json' };
import promotionsJson from './promotions.json' with { type: 'json' };
import dialogueJson from './dialogue.json' with { type: 'json' };
import parcelsJson from './generated/parcels.json' with { type: 'json' };
import landmarksJson from './generated/landmarks.json' with { type: 'json' };
import compatJson from './generated/compat.json' with { type: 'json' };
import aurasJson from './generated/auras.json' with { type: 'json' };
import itemsJson from './generated/items.json' with { type: 'json' };
import compatMetaJson from './generated/compat_meta.json' with { type: 'json' };

/** 시작부터 있는 특수 오브젝트 (필지 지형 생성용). 덤불은 곡괭이 대신 5만 원에 치운다. */
const TERRAIN_OBJECTS: ObjectDef[] = [
  { id: 'bush_wild', name: '곶자왈 덤불', kind: 'deco', w: 1, h: 1, cost: 0, scenery: 1, noise: 0, wind: 1, upkeep: 0, terrain: ['soil', 'rock'], removeCost: 50000 },
  { id: 'spring', name: '용천수', kind: 'deco', w: 2, h: 1, cost: 0, scenery: 2, noise: 0, wind: 0, upkeep: 0, terrain: ['soil', 'rock'] },
];
/** 랜드마크 (§1.6). 데이터만 — 효과는 경치·요금 외 TODO. 비용은 화폐 리스케일 ×100. */
export const LANDMARK_COST_SCALE = 100;
export const LANDMARKS: ObjectDef[] = (landmarksJson as { id: string; name: string; w: number; h: number; cost: number; effectText: string }[]).map((l) => ({
  id: l.id, name: l.name, kind: 'landmark', w: l.w, h: l.h, cost: l.cost * LANDMARK_COST_SCALE, scenery: 3, noise: 0, wind: 1, upkeep: 0, terrain: ['soil', 'rock'], effectText: l.effectText,
}));
export const OBJECTS: ObjectDef[] = [...(objectsJson as ObjectDef[]), ...TERRAIN_OBJECTS, ...LANDMARKS];
export interface ParcelDef { id: string; no: number; name: string; price: number; start: boolean; w: number; h: number; bonusText: string | null }
export const PARCELS = parcelsJson as ParcelDef[];
export const CROPS = cropsJson as CropDef[];
export const MENUS = menusJson as unknown as MenuDef[];
export const GUEST_TYPES = guestsJson as GuestTypeDef[];
export const UNLOCKS = unlocksJson as UnlockDef[];
export const INGREDIENTS = ingredientsJson as IngredientDef[];
export const ROLES = staffRolesJson as RoleDef[];
export const SKILLS = skillsJson as unknown as SkillDef[];
export const NAMES = namesJson as { names: string[]; hair: number; skin: number; top: number };
export const PROMOTIONS = promotionsJson as unknown as PromotionDef[];
export const DIALOGUE = dialogueJson as {
  guest: Record<string, { happy: string[]; meh: { no_menu: string[]; scenery: string[]; wait: string[] } }>;
};

// ---------- 인구 태그 (마스터 GDD §1) ----------
/** guests.json에 tags가 없을 때의 기본값. 삼춘은 성인·시니어 섞임 → 시니어, 관광객 → 청년. */
const DEFAULT_TAGS: Record<string, GuestTags> = {
  local: { gender: 'any', age: 'senior', group: false },
  tourist: { gender: 'any', age: 'youth', group: false },
};
export function guestTags(typeId: string): GuestTags {
  return guestTypeDef(typeId).tags ?? DEFAULT_TAGS[typeId] ?? { gender: 'any', age: 'adult', group: false };
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
    strength: toStrength(r.strength, name, text),
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
    fitIds: toIds(r.fitIds ?? r.fit ?? r.fitText ?? []),
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
export const COMBOS: ComboDef[] = (compatJson as RawCombo[]).map(adaptCombo);
export const SETS: SetDef[] = (aurasJson as RawSet[]).map(adaptSet);
export const ITEMS: ItemDef[] = (itemsJson as RawItem[]).map(adaptItem);
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
const CROP = indexBy(CROPS);
const MENU = indexBy(MENUS);
const GUEST = indexBy(GUEST_TYPES);
const INGREDIENT = indexBy(INGREDIENTS);
const ROLE = indexBy(ROLES);
const SKILL = indexBy(SKILLS);
const PROMOTION = indexBy(PROMOTIONS);
const COMBO = indexBy(COMBOS);
const SET = indexBy(SETS);
const ITEM = indexBy(ITEMS);

function must<T>(map: Record<string, T>, id: string, what: string): T {
  const v = map[id];
  if (!v) throw new Error(`unknown ${what}: ${id}`);
  return v;
}
export const objectDef = (id: string) => must(OBJ, id, 'object');
export const comboDef = (id: string) => must(COMBO, id, 'combo');
export const setDef = (id: string) => must(SET, id, 'set');
export const itemDef = (id: string) => must(ITEM, id, 'item');
export const cropDef = (id: string) => must(CROP, id, 'crop');
export const menuDef = (id: string) => must(MENU, id, 'menu');
export const guestTypeDef = (id: string) => must(GUEST, id, 'guestType');
export const ingredientDef = (id: string) => must(INGREDIENT, id, 'ingredient');
export const roleDef = (id: string) => must(ROLE, id, 'role');
export const skillDef = (id: string) => must(SKILL, id, 'skill');
export const promotionDef = (id: string) => must(PROMOTION, id, 'promotion');

/** 게임 시작 시 이미 열려 있는 것 */
export const INITIAL_UNLOCKED = {
  objects: ['field', 'path', 'table_out', 'tangerine_tree'],
  menus: [
    'americano', 'latte', 'green_tea', 'yuja_tea', 'iced_tea', 'hot_choco',
    'toast', 'scone', 'cheesecake', 'cookie', 'egg_sandwich', 'croissant',
  ],
  crops: ['carrot', 'tangerine'],
};

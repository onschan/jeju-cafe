/**
 * 메뉴 크래프팅 (2B-2 Task 5, 스펙 §15.1·데이터 표 §6~8)
 * - 재료 스탯 6종 합 + 재료 카테고리 콤보(같은 재료끼리는 발동 안 함) + 파라미터 보너스 + 직원 + 난수 → 새 메뉴
 * - 로스팅/추출 파라미터: 기본값에서 벗어난 축마다 성공률 −12%, 보너스 폭 +6 (하이리스크 하이리턴)
 * - 히든 레시피 조합이면 이름·품질 고정, 실패하지 않는다
 * - 토핑(최대 3) → 스탯·스킬 누적 → 스킬 티어(§15.1 표) 효과
 * - 메뉴 레벨업(재료 5 + 돈) → 판매가 +10%, 주문 가중치 +
 */
import type { GameState, ApplyResult, MenuDef, MenuStats, MenuStatKey, MenuBase, MenuMod, MenuQuality, BrewParams, ParamAxis, IngredientDef, IngredientComboDef, IngredientComboSide, DevelopOutcome, DevelopResult, Staff, MenuCategory, RoleId } from './types.ts';
import { menuDef, ingredientDef, toppingDef, INGREDIENT_COMBOS, HIDDEN_RECIPES, MENU_STAT_KEYS, ZERO_STATS, addStats, statSum, ingredientStats, GUEST_TYPES, guestTypeDef } from '../data/index.ts';
import { nextRandom, randInt } from './rng.ts';
import { findStaff, ingredientDiscount, pushNotice } from './staff.ts';
import { dayIndex } from './effects.ts';

// ---------- 상수 ----------
export const DEVELOP_DAYS = 3;
export const DEVELOP_RESEARCH = 20;
/** 기본 파라미터 성공/대성공/실패 (%) */
export const P_SUCCESS = 70;
export const P_GREAT = 10;
export const P_FAIL = 20;
/** 기본값에서 벗어난 축마다 성공률 −12%, 보너스 폭 +6 (§7) */
export const PARAM_PENALTY = 12;
export const PARAM_BONUS_WIDTH = 6;
export const BASE_BONUS_WIDTH = 4;
/** 직원 기술(요리 또는 감각) 1점당 성공률 +0.05% */
export const STAFF_SUCCESS_PER_STAT = 0.05;
/** 직원 기술 25점당 스탯 +1 (바리스타 감각 → 향, 요리사 요리 → 맛) */
export const STAFF_STAT_PER = 25;
export const MAX_SLOTS = 4;
export const MAX_SLOTS_STAR = 8;
export const SIGNATURE_STAR = 3;
export const MAX_TOPPINGS = 3;
export const MAX_MENU_LEVEL = 5;
export const LEVEL_UP_INGREDIENTS = 5;
export const LEVEL_UP_MONEY = 20_000;      // × 현재 레벨
export const LEVEL_PRICE_PCT = 10;         // 레벨당 판매가 +10%
/** 판매가 = 2,000 + 150 × (맛 + 보기 + 제주) — 아메리카노(6/2/0)가 3,200이 되는 식 */
export const PRICE_BASE = 2000;
export const PRICE_PER_STAT = 150;
/** 품질 경계 (스탯 합) */
export const QUALITY_GOOD = 45;
export const QUALITY_BEST = 80;
/** 손님 취향 스탯: 이 값 이상이면 "맞는다" (아메리카노 향 8은 못 미치고, 라떼 맛 10부터) */
export const LIKE_STAT_MIN = 10;
export const LIKE_BONUS_CAP = 2;

export const BASE_NAME: Record<MenuBase, string> = { drink: '음료', dessert: '디저트', meal: '식사', signature: '시그니처' };
/** 베이스별 최소 재료 수 (§7: 음료 2, 디저트 3, 식사 3, 시그니처 4). 최대는 maxSlots(state). */
export const BASE_MIN: Record<MenuBase, number> = { drink: 2, dessert: 3, meal: 3, signature: 4 };
export const PARAM_AXES: Record<MenuBase, ParamAxis[]> = { drink: ['grind', 'temp', 'time'], dessert: ['temp', 'time'], meal: ['heat', 'time'], signature: ['grind', 'temp', 'time'] };
export const PARAM_LABEL: Record<ParamAxis, { name: string; levels: [string, string, string] }> = {
  grind: { name: '굵기', levels: ['가늘', '보통', '굵'] },
  temp: { name: '온도', levels: ['낮', '보통', '높'] },
  time: { name: '시간', levels: ['짧', '보통', '길'] },
  heat: { name: '불 세기', levels: ['약', '보통', '강'] },
};
export const PARAM_DEFAULT = 1;
/** 개발 담당 직원의 기술 스탯: 음료·시그니처는 감각, 디저트·식사는 요리 */
export const BASE_STAT: Record<MenuBase, 'sense' | 'cooking'> = { drink: 'sense', dessert: 'cooking', meal: 'cooking', signature: 'sense' };
const BASE_REQUIRES: Record<MenuBase, { role: RoleId } | undefined> = { drink: undefined, dessert: { role: 'cook' }, meal: { role: 'cook' }, signature: { role: 'cook' } };

/** 재료 콤보 → 메뉴 스킬 (콤보마다 +1, 제주의 맛은 +2) */
export const COMBO_SKILL: Record<string, { skill: MenuSkill; level: number }> = {
  creamy: { skill: '맛있음', level: 1 }, nutty: { skill: '맛있음', level: 1 }, smooth: { skill: '목넘김', level: 1 }, sea_aroma: { skill: '향긋함', level: 1 },
  zesty: { skill: '향긋함', level: 1 }, fresh: { skill: '건강함', level: 1 }, hearty: { skill: '든든함', level: 1 }, light: { skill: '목넘김', level: 1 },
  jeju_taste: { skill: '제주다움', level: 2 }, bittersweet: { skill: '맛있음', level: 1 }, latte: { skill: '목넘김', level: 1 }, tea_latte: { skill: '향긋함', level: 1 },
  fruit_bomb: { skill: '인생샷', level: 1 }, baking: { skill: '든든함', level: 1 }, healthy_meal: { skill: '건강함', level: 1 }, fragrant_morning: { skill: '건강함', level: 1 },
  honey_combo: { skill: '맛있음', level: 1 }, spicy: { skill: '맛있음', level: 1 }, cool: { skill: '세련미', level: 1 }, warm: { skill: '품격', level: 1 },
};

// ---------- 메뉴 스킬 티어 (§15.1 표) ----------
export type MenuSkill = '맛있음' | '향긋함' | '건강함' | '든든함' | '목넘김' | '세련미' | '희귀함' | '품격' | '인생샷' | '제주다움';
export const MENU_SKILLS: MenuSkill[] = ['맛있음', '향긋함', '건강함', '든든함', '목넘김', '세련미', '희귀함', '품격', '인생샷', '제주다움'];
export const TIER_NAMES = ['', '초급', '중급', '상급', '특급'] as const;
/** 티어별 효과 값 [초급, 중급, 상급, 특급] */
export const SKILL_TIER_VALUES: Record<MenuSkill, [number, number, number, number]> = {
  '맛있음': [8, 24, 48, 80],   // 맛 +
  '향긋함': [8, 24, 48, 80],   // 향 +
  '건강함': [2, 4, 6, 10],     // 한 달 살기·가족 평가 +
  '든든함': [2, 4, 6, 10],     // 올레꾼·삼춘 평가 +
  '목넘김': [8, 12, 16, 24],   // 식사 시간 −%
  '세련미': [8, 16, 24, 48],   // 재료비 −%
  '희귀함': [8, 16, 24, 32],   // 판매가 +%
  '품격': [4, 8, 12, 16],      // 손님 방문 확률 +%
  '인생샷': [20, 40, 60, 80],  // 사진 확률 +%
  '제주다움': [5, 10, 15, 25], // 제주 스탯 +
};
export const SKILL_DESC: Record<MenuSkill, string> = {
  '맛있음': '맛', '향긋함': '향', '건강함': '한 달 살기·가족 평가', '든든함': '올레꾼·삼춘 평가', '목넘김': '식사 시간 −%', '세련미': '재료비 −%', '희귀함': '판매가 +%', '품격': '손님 방문 +%', '인생샷': '사진 확률 +%', '제주다움': '제주 스탯',
};
/** 누적 스킬 값 → 티어 0(없음)/1 초급(1~4)/2 중급(5~9)/3 상급(10~14)/4 특급(15~) */
export function skillTier(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value >= 15) return 4;
  if (value >= 10) return 3;
  if (value >= 5) return 2;
  if (value >= 1) return 1;
  return 0;
}
export function skillTierValue(skill: MenuSkill, value: number): number {
  const t = skillTier(value);
  return t === 0 ? 0 : SKILL_TIER_VALUES[skill][t - 1]!;
}
/** 건강함·든든함이 평가하는 손님 타입 (이름으로 판정) */
const HEALTH_GUESTS = new Set(GUEST_TYPES.filter((g) => g.name.includes('한 달 살기') || g.name.includes('가족')).map((g) => g.id));
const HEARTY_GUESTS = new Set(GUEST_TYPES.filter((g) => g.name.includes('올레') || g.name.includes('삼춘')).map((g) => g.id));
/** 인생샷 대상: 유튜버·관광객(청년 관광 손님층) */
const PHOTO_GUESTS = new Set(GUEST_TYPES.filter((g) => g.name.includes('유튜버') || g.name.includes('관광') || g.id === 'student').map((g) => g.id));

// ---------- 메뉴 조회 (기본 + 개발 메뉴) ----------
export function menuOf(state: GameState, menuId: string): MenuDef {
  const custom = state.customMenus.find((m) => m.id === menuId);
  return custom ?? menuDef(menuId);
}
export function isCustomMenu(state: GameState, menuId: string): boolean {
  return state.customMenus.some((m) => m.id === menuId);
}
export function menuMod(state: GameState, menuId: string): MenuMod {
  return state.menuMods[menuId] ?? { toppings: [], level: 1 };
}
function ensureMod(state: GameState, menuId: string): MenuMod {
  return (state.menuMods[menuId] ??= { toppings: [], level: 1 });
}
/** 메뉴 스킬 누적 (콤보 스킬 + 토핑 스킬) */
export function menuSkills(state: GameState, menuId: string): Record<string, number> {
  const out: Record<string, number> = { ...(menuOf(state, menuId).skills ?? {}) };
  for (const t of menuMod(state, menuId).toppings) for (const sk of toppingDef(t).skills) out[sk.name] = (out[sk.name] ?? 0) + sk.level;
  return out;
}
export interface SkillEffects { taste: number; aroma: number; jeju: number; healthEval: number; heartyEval: number; seatPct: number; costPct: number; pricePct: number; dignityPct: number; photoPct: number }
export function skillEffects(state: GameState, menuId: string): SkillEffects {
  const sk = menuSkills(state, menuId);
  const v = (s: MenuSkill) => skillTierValue(s, sk[s] ?? 0);
  return { taste: v('맛있음'), aroma: v('향긋함'), jeju: v('제주다움'), healthEval: v('건강함'), heartyEval: v('든든함'), seatPct: v('목넘김'), costPct: v('세련미'), pricePct: v('희귀함'), dignityPct: v('품격'), photoPct: v('인생샷') };
}
/** 메뉴 스탯 = 정의 스탯 + 토핑 스탯 + 스킬(맛있음·향긋함·제주다움) */
export function menuStatsOf(state: GameState, menuId: string): MenuStats {
  let s = { ...menuOf(state, menuId).stats };
  for (const t of menuMod(state, menuId).toppings) s = addStats(s, toppingDef(t).stats);
  const e = skillEffects(state, menuId);
  s.taste += e.taste;
  s.aroma += e.aroma;
  s.jeju += e.jeju;
  return s;
}
/** 스탯 기반 판매가 (개발 메뉴의 기본가) */
export function priceFromStats(stats: MenuStats): number {
  return PRICE_BASE + PRICE_PER_STAT * (stats.taste + stats.look + stats.jeju);
}
/** 판매가 = (기본가 + 토핑 스탯 가격) × 레벨(+10%/레벨) × 희귀함(+%). 기본 메뉴는 정의 가격, 개발 메뉴는 스탯 가격. */
export function priceOf(state: GameState, menuId: string): number {
  const def = menuOf(state, menuId);
  const mod = menuMod(state, menuId);
  let toppingStats = { ...ZERO_STATS };
  for (const t of mod.toppings) toppingStats = addStats(toppingStats, toppingDef(t).stats);
  const base = def.price + PRICE_PER_STAT * (toppingStats.taste + toppingStats.look + toppingStats.jeju);
  const e = skillEffects(state, menuId);
  return Math.round(base * (1 + (LEVEL_PRICE_PCT * (mod.level - 1)) / 100) * (1 + e.pricePct / 100));
}
/** 토핑 원가 합 (밭 토핑은 0) */
export function toppingCost(state: GameState, menuId: string): number {
  return menuMod(state, menuId).toppings.reduce((s, t) => s + toppingDef(t).cost, 0);
}
/** 원가 배수: 운반·절약 할인 × 콤보 원가 보정 × 세련미 (합쳐서 최대 −60%) */
export function costMult(state: GameState, menuId: string): number {
  const def = menuOf(state, menuId);
  const cut = ingredientDiscount(state) - (def.costPct ?? 0) / 100 + skillEffects(state, menuId).costPct / 100;
  return 1 - Math.min(0.6, cut);
}
/** 자리에 앉아 있는 시간 배수 (목넘김 −%) */
export function seatTimeMult(state: GameState, menuId: string | null): number {
  if (!menuId) return 1;
  return 1 - skillEffects(state, menuId).seatPct / 100;
}
/** 메뉴판(슬롯)에 있는 메뉴 중 가장 높은 품격 → 하루 손님 수 +% */
export function dignityPct(state: GameState): number {
  let best = 0;
  for (const id of state.menuSlots) if (id) best = Math.max(best, skillEffects(state, id).dignityPct);
  return best;
}
/** 인생샷: 유튜버·관광객이 만족했을 때 사진 확률 (0~1) */
export function photoChance(state: GameState, typeId: string, menuId: string | null): number {
  if (!menuId || !PHOTO_GUESTS.has(typeId)) return 0;
  return skillEffects(state, menuId).photoPct / 100;
}
/** 손님 타입 평가 보너스 (건강함·든든함, 경치 점수 단위로 3당 1) */
export function guestEvalBonus(state: GameState, typeId: string, menuId: string | null): number {
  if (!menuId) return 0;
  const e = skillEffects(state, menuId);
  let v = 0;
  if (HEALTH_GUESTS.has(typeId)) v += e.healthEval;
  if (HEARTY_GUESTS.has(typeId)) v += e.heartyEval;
  return Math.floor(v / 3);
}
/** 손님 취향 스탯 중 메뉴 스탯이 기준(8) 이상인 개수 */
export function likesStatsMatch(state: GameState, typeId: string, menuId: string | null): number {
  if (!menuId) return 0;
  const stats = menuStatsOf(state, menuId);
  return guestTypeDef(typeId).likesStats.filter((k) => stats[k] >= LIKE_STAT_MIN).length;
}
/** 손님이 이 분류를 주문하나 (시그니처는 누구나) */
export function guestLikesCategory(likes: MenuCategory[], category: MenuCategory): boolean {
  return category === 'signature' || likes.includes(category);
}
export function qualityOf(stats: MenuStats): MenuQuality {
  const n = statSum(stats);
  return n >= QUALITY_BEST ? '최고' : n >= QUALITY_GOOD ? '좋음' : '보통';
}
export function maxSlots(state: GameState): number {
  return state.star >= SIGNATURE_STAR ? MAX_SLOTS_STAR : MAX_SLOTS;
}
export function isStaffBusy(state: GameState, staffId: string): boolean {
  return state.developing?.staffId === staffId;
}

// ---------- 콤보 ----------
function sideMatches(side: IngredientComboSide, ing: IngredientDef): boolean {
  if (side.ingredient !== undefined) return ing.id === side.ingredient;
  if (side.category === 'any') return true;
  if (side.category === 'jeju') return ing.stats.jeju >= (side.minJeju ?? 6);
  return ing.category === side.category;
}
function comboFires(c: IngredientComboDef, x: IngredientDef, y: IngredientDef): boolean {
  return (sideMatches(c.a, x) && sideMatches(c.b, y)) || (sideMatches(c.a, y) && sideMatches(c.b, x));
}
/** 재료 목록에서 발동하는 콤보 id (중복 없이, 데이터 순서). 같은 재료끼리는 발동하지 않는다. */
export function activeIngredientCombos(ingredients: string[]): string[] {
  const defs = ingredients.map(ingredientDef);
  const out: string[] = [];
  for (const c of INGREDIENT_COMBOS) {
    let fired = false;
    for (let i = 0; i < defs.length && !fired; i++)
      for (let j = i + 1; j < defs.length && !fired; j++) {
        if (defs[i]!.id === defs[j]!.id) continue;
        if (comboFires(c, defs[i]!, defs[j]!)) fired = true;
      }
    if (fired) out.push(c.id);
  }
  return out;
}
export function comboBonus(comboIds: string[]): { stats: MenuStats; costPct: number; skills: Record<string, number> } {
  let stats = { ...ZERO_STATS };
  let costPct = 0;
  const skills: Record<string, number> = {};
  for (const id of comboIds) {
    const c = INGREDIENT_COMBOS.find((x) => x.id === id)!;
    stats = addStats(stats, c.bonus);
    costPct += c.bonus.costPct ?? 0;
    const sk = COMBO_SKILL[id];
    if (sk) skills[sk.skill] = (skills[sk.skill] ?? 0) + sk.level;
  }
  return { stats, costPct, skills };
}
/** 히든 레시피: 재료 집합(중복 무시)이 정확히 일치 */
export function matchHiddenRecipe(ingredients: string[]): string | null {
  const set = new Set(ingredients);
  for (const r of HIDDEN_RECIPES) if (r.ingredients.length === set.size && r.ingredients.every((i) => set.has(i))) return r.id;
  return null;
}

// ---------- 파라미터 ----------
export function normalizeParams(base: MenuBase, params?: BrewParams): BrewParams {
  const out: BrewParams = {};
  for (const ax of PARAM_AXES[base]) out[ax] = Math.max(0, Math.min(2, Math.round(params?.[ax] ?? PARAM_DEFAULT)));
  return out;
}
/** 기본값(1)에서 벗어난 축 수 */
export function paramDeviation(base: MenuBase, params: BrewParams): number {
  return PARAM_AXES[base].filter((ax) => (params[ax] ?? PARAM_DEFAULT) !== PARAM_DEFAULT).length;
}
/** 성공률 % = 70 − 12 × 벗어난 축 + 직원 기술 × 0.05 (대성공 10%는 고정, 나머지가 실패) */
export function successRate(base: MenuBase, params: BrewParams, staffStat = 0): number {
  return Math.max(0, Math.min(100 - P_GREAT, P_SUCCESS - PARAM_PENALTY * paramDeviation(base, params) + staffStat * STAFF_SUCCESS_PER_STAT));
}
export function bonusWidth(base: MenuBase, params: BrewParams): number {
  return BASE_BONUS_WIDTH + PARAM_BONUS_WIDTH * paramDeviation(base, params);
}
export function developStaffStat(staff: Staff | undefined, base: MenuBase): number {
  return staff ? staff.stats[BASE_STAT[base]] : 0;
}

// ---------- 개발 ----------
/** 재료 목록 → id별 개수 */
export function countIngredients(ingredients: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ingredients) out[id] = (out[id] ?? 0) + 1;
  return out;
}
/** 개발에 드는 구매 재료비 (bought 재료 원가 합) */
export function developCost(ingredients: string[]): number {
  return ingredients.reduce((s, id) => { const d = ingredientDef(id); return s + (d.kind === 'bought' ? d.cost : 0); }, 0);
}
export function canDevelop(state: GameState, base: MenuBase, ingredients: string[], staffId: string): ApplyResult {
  if (state.developing) return { ok: false, reason: '이미 개발 중이에요' };
  if (!(base in BASE_MIN)) return { ok: false, reason: '없는 베이스' };
  if (base === 'signature' && state.star < SIGNATURE_STAR) return { ok: false, reason: `시그니처는 ★${SIGNATURE_STAR}부터` };
  if (ingredients.length < BASE_MIN[base]) return { ok: false, reason: `재료가 ${BASE_MIN[base]}개는 있어야 해요` };
  if (ingredients.length > maxSlots(state)) return { ok: false, reason: `재료는 ${maxSlots(state)}개까지` };
  for (const id of ingredients) { try { ingredientDef(id); } catch { return { ok: false, reason: '없는 재료' }; } }
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (isStaffBusy(state, staffId)) return { ok: false, reason: '그 직원은 바빠요' };
  if (state.research < DEVELOP_RESEARCH) return { ok: false, reason: '연구 포인트가 모자라요' };
  const need = countIngredients(ingredients);
  for (const [id, n] of Object.entries(need)) if (ingredientDef(id).kind === 'farm' && (state.storage[id] ?? 0) < n) return { ok: false, reason: `${ingredientDef(id).name}이(가) 창고에 없어요` };
  if (state.money < developCost(ingredients)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
/** 재료·연구를 쓰고 3일짜리 개발을 시작한다. 담당 직원은 그동안 바쁘다(역할 효과에서 빠진다). */
export function develop(state: GameState, base: MenuBase, ingredients: string[], params: BrewParams | undefined, staffId: string): void {
  const cost = developCost(ingredients);
  state.money -= cost;
  state.monthCosts.ingredients += cost;
  state.research -= DEVELOP_RESEARCH;
  for (const [id, n] of Object.entries(countIngredients(ingredients))) if (ingredientDef(id).kind === 'farm') state.storage[id] = (state.storage[id] ?? 0) - n;
  const today = dayIndex(state.clock);
  state.developing = { base, ingredients: [...ingredients], params: normalizeParams(base, params), staffId, startDay: today, doneDay: today + DEVELOP_DAYS };
}
/** 남은 일수 (개발 중이 아니면 0) */
export function developDaysLeft(state: GameState): number {
  return state.developing ? Math.max(0, state.developing.doneDay - dayIndex(state.clock)) : 0;
}
/** 주재료(스탯 합이 가장 큰 재료, 같으면 앞) 이름 + 베이스 */
export function autoMenuName(base: MenuBase, ingredients: string[]): string {
  let best: IngredientDef | null = null;
  for (const id of ingredients) { const d = ingredientDef(id); if (!best || statSum(d.stats) > statSum(best.stats)) best = d; }
  return `${best?.name ?? ''} ${BASE_NAME[base]}`.trim();
}
function rollOutcome(state: GameState, rate: number): DevelopOutcome {
  const r = nextRandom(state) * 100;
  if (r < P_GREAT) return 'great';
  if (r < P_GREAT + rate) return 'success';
  return 'fail';
}
/** 보너스 점수를 무작위 스탯에 나눠 준다 */
function spreadBonus(state: GameState, stats: MenuStats, points: number): MenuStats {
  const out = { ...stats };
  for (let i = 0; i < points; i++) out[MENU_STAT_KEYS[randInt(state, 0, MENU_STAT_KEYS.length - 1)]!]++;
  return out;
}
/** 완료일이 되면 결과를 굴린다: 성공/대성공이면 customMenus에 추가하고 해금. 결과는 lastDevelop에 남긴다. */
export function resolveDevelop(state: GameState): DevelopResult | null {
  const dev = state.developing;
  if (!dev || dayIndex(state.clock) < dev.doneDay) return null;
  state.developing = null;
  const staff = findStaff(state, dev.staffId);
  const stat = developStaffStat(staff, dev.base);
  const hiddenId = matchHiddenRecipe(dev.ingredients);
  let outcome = rollOutcome(state, successRate(dev.base, dev.params, stat));
  if (hiddenId && outcome === 'fail') outcome = 'success';
  const combos = activeIngredientCombos(dev.ingredients);
  for (const c of combos) if (!state.codex.ingredientCombos.includes(c)) state.codex.ingredientCombos.push(c);
  const bonus = comboBonus(combos);
  let stats = addStats(ingredientStats(countIngredients(dev.ingredients)), bonus.stats);
  const width = bonusWidth(dev.base, dev.params);
  if (outcome === 'fail') {
    const result: DevelopResult = { outcome, menuId: null, name: autoMenuName(dev.base, dev.ingredients), base: dev.base, stats, quality: null, hidden: hiddenId !== null, combos };
    state.lastDevelop = result;
    pushNotice(state, `${result.name} 개발에 실패했어요`);
    return result;
  }
  stats = spreadBonus(state, stats, outcome === 'great' ? width + randInt(state, 0, width) : randInt(state, 0, width));
  const staffBonus = Math.floor(stat / STAFF_STAT_PER);
  if (BASE_STAT[dev.base] === 'sense') stats.aroma += staffBonus; else stats.taste += staffBonus;
  for (const k of MENU_STAT_KEYS) stats[k] = Math.max(0, stats[k]);
  let quality = qualityOf(stats);
  if (outcome === 'great' && quality !== '최고') quality = quality === '좋음' ? '최고' : '좋음';
  const hidden = hiddenId ? HIDDEN_RECIPES.find((r) => r.id === hiddenId)! : null;
  if (hidden) { quality = '최고'; if (!state.codex.recipes.includes(hidden.id)) state.codex.recipes.push(hidden.id); }
  const id = `m_custom_${state.customMenus.length + 1}`;
  const def: MenuDef = {
    id,
    name: hidden ? hidden.name : autoMenuName(dev.base, dev.ingredients),
    category: dev.base,
    price: priceFromStats(stats),
    ingredients: countIngredients(dev.ingredients),
    stats,
    skills: bonus.skills,
    quality,
  };
  if (BASE_REQUIRES[dev.base]) def.requires = BASE_REQUIRES[dev.base];
  if (bonus.costPct) def.costPct = bonus.costPct;
  if (hidden) def.hiddenId = hidden.id;
  state.customMenus.push(def);
  state.unlocked.menus.push(id);
  const result: DevelopResult = { outcome, menuId: id, name: def.name, base: dev.base, stats, quality, hidden: hidden !== null, combos };
  state.lastDevelop = result;
  pushNotice(state, `${outcome === 'great' ? '대성공! ' : ''}${def.name}을(를) 개발했어요 (${quality})`);
  return result;
}

// ---------- 토핑 ----------
export function canAddTopping(state: GameState, menuId: string, toppingId: string): ApplyResult {
  if (!state.unlocked.menus.includes(menuId)) return { ok: false, reason: '아직 모르는 메뉴' };
  try { toppingDef(toppingId); } catch { return { ok: false, reason: '없는 토핑' }; }
  const mod = menuMod(state, menuId);
  if (mod.toppings.includes(toppingId)) return { ok: false, reason: '이미 올린 토핑이에요' };
  if (mod.toppings.length >= MAX_TOPPINGS) return { ok: false, reason: `토핑은 ${MAX_TOPPINGS}개까지` };
  return { ok: true };
}
export function addTopping(state: GameState, menuId: string, toppingId: string): void {
  ensureMod(state, menuId).toppings.push(toppingId);
}
export function canRemoveTopping(state: GameState, menuId: string, toppingId: string): ApplyResult {
  if (!menuMod(state, menuId).toppings.includes(toppingId)) return { ok: false, reason: '그 토핑은 없어요' };
  return { ok: true };
}
export function removeTopping(state: GameState, menuId: string, toppingId: string): void {
  const mod = ensureMod(state, menuId);
  mod.toppings = mod.toppings.filter((t) => t !== toppingId);
}

// ---------- 레벨업 ----------
export function levelUpMenuCost(state: GameState, menuId: string): { money: number; ingredients: Record<string, number> } {
  const def = menuOf(state, menuId);
  const ingredients: Record<string, number> = {};
  let money = LEVEL_UP_MONEY * menuMod(state, menuId).level;
  for (const [id, n] of Object.entries(def.ingredients)) {
    const d = ingredientDef(id);
    if (d.kind === 'farm') ingredients[id] = n * LEVEL_UP_INGREDIENTS;
    else money += d.cost * n * LEVEL_UP_INGREDIENTS;
  }
  return { money, ingredients };
}
export function canLevelUpMenu(state: GameState, menuId: string): ApplyResult {
  if (!state.unlocked.menus.includes(menuId)) return { ok: false, reason: '아직 모르는 메뉴' };
  if (menuMod(state, menuId).level >= MAX_MENU_LEVEL) return { ok: false, reason: '최고 레벨이에요' };
  const cost = levelUpMenuCost(state, menuId);
  for (const [id, n] of Object.entries(cost.ingredients)) if ((state.storage[id] ?? 0) < n) return { ok: false, reason: `${ingredientDef(id).name}이(가) ${n}개 필요해요` };
  if (state.money < cost.money) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function levelUpMenu(state: GameState, menuId: string): void {
  const cost = levelUpMenuCost(state, menuId);
  state.money -= cost.money;
  state.monthCosts.ingredients += cost.money;
  for (const [id, n] of Object.entries(cost.ingredients)) state.storage[id] = (state.storage[id] ?? 0) - n;
  ensureMod(state, menuId).level++;
}
/** 주문 가중치: 레벨이 높을수록 잘 팔린다 */
export function menuOrderWeight(state: GameState, menuId: string): number {
  return menuMod(state, menuId).level;
}

import { bareState } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { serialize, deserialize } from '../save.ts';
import { ingredientCost } from '../economy.ts';
import { isMenuAvailable, setSlot, consumeIngredients } from '../menu.ts';
import { roleEffect } from '../staff.ts';
import { affordableMenus, dailyGuestCount, tasteBonus } from '../guests.ts';
import { placeObject } from '../grid.ts';
import {
  activeIngredientCombos, comboBonus, matchHiddenRecipe, successRate, bonusWidth, paramDeviation, normalizeParams,
  skillTier, skillTierValue, skillEffects, menuStatsOf, menuSkills, priceOf, priceFromStats, canDevelop, resolveDevelop, developDaysLeft,
  canAddTopping, canLevelUpMenu, levelUpMenuCost, developCost, costMult, autoMenuName, qualityOf, likesStatsMatch, seatTimeMult, dignityPct,
  DEVELOP_DAYS, DEVELOP_RESEARCH, P_SUCCESS, P_GREAT, PARAM_PENALTY, MAX_TOPPINGS, LIKE_STAT_MIN,
} from '../craft.ts';
import { menuDef, ingredientDef, toppingDef, MENUS, INGREDIENTS, HIDDEN_RECIPES, ingredientStats } from '../../data/index.ts';
import { staffWith } from './staff.test.ts';
import { X, Y } from './helpers.ts';
import type { GameState } from '../types.ts';

function withStaff(s: GameState) {
  const st = staffWith({ skill: 50 }, 'barista');
  s.staff.push(st);
  s.research = 100;
  return st;
}

// ---------- 데이터 ----------
test('재료 32종에 스탯·분류가 있고, 기존 13종의 원가(§4.2 #4)·kind가 맞다', () => {
  expect(INGREDIENTS.length).toBe(32);
  expect(ingredientDef('beans')).toMatchObject({ kind: 'bought', cost: 1500, category: 'coffee', stats: { taste: 6, aroma: 8 } });
  expect(ingredientDef('carrot').kind).toBe('farm');
  expect(ingredientDef('pork_black')).toMatchObject({ kind: 'bought', cost: 3000, category: 'protein' });
  expect(ingredientDef('tea_jeju').kind).toBe('farm');
});

test('기본 메뉴 18의 스탯은 재료 합으로 계산된다 (아메리카노 = 원두, 라떼 = 원두 + 우유)', () => {
  expect(MENUS.length).toBe(18);
  expect(menuDef('americano').stats).toEqual(ingredientDef('beans').stats);
  expect(menuDef('latte').stats).toEqual(ingredientStats({ beans: 1, milk: 1 }));
  expect(menuDef('egg_sandwich').stats.volume).toBe(ingredientDef('egg').stats.volume * 2 + ingredientDef('flour').stats.volume);
  // 스탯 가격 공식이 아메리카노 3,200과 맞는다
  expect(priceFromStats(menuDef('americano').stats)).toBe(3200);
});

// ---------- 콤보 ----------
test('콤보: 과일 × 유제품 = 크리미, 같은 재료끼리는 발동하지 않는다', () => {
  expect(activeIngredientCombos(['tangerine', 'milk'])).toContain('creamy');
  expect(activeIngredientCombos(['tangerine', 'tangerine'])).not.toContain('fruit_bomb');
  expect(activeIngredientCombos(['tangerine', 'hallabong'])).toContain('fruit_bomb');
  expect(activeIngredientCombos(['seaweed', 'seaweed'])).toEqual([]);
  expect(activeIngredientCombos(['seaweed', 'abalone'])).toContain('sea_aroma');
});

test('콤보: 특정 재료 조건·물×아무거나·제주≥6 끼리', () => {
  expect(activeIngredientCombos(['egg', 'carrot'])).toContain('fragrant_morning');
  expect(activeIngredientCombos(['pork_black', 'carrot'])).not.toContain('fragrant_morning'); // 달걀이 아니면 안 됨
  expect(activeIngredientCombos(['ice', 'beans'])).toContain('light');
  expect(activeIngredientCombos(['ice', 'tangerine'])).toEqual(expect.arrayContaining(['light', 'cool']));
  expect(activeIngredientCombos(['tangerine', 'peanut'])).toContain('jeju_taste'); // 제주 9 × 제주 8
  expect(activeIngredientCombos(['beans', 'milk'])).not.toContain('jeju_taste');
  expect(activeIngredientCombos(['beans', 'milk'])).toEqual(['latte']);
  // 콤보는 메뉴당 한 번만 센다
  expect(activeIngredientCombos(['tangerine', 'milk', 'hallabong', 'cream']).filter((c) => c === 'creamy').length).toBe(1);
});

test('콤보 보너스: 스탯 합 + 원가 % + 스킬', () => {
  const b = comboBonus(['creamy', 'light']);
  expect(b.stats).toMatchObject({ taste: 4 - 2, look: 2 });
  expect(b.costPct).toBe(-20);
  expect(b.skills).toEqual({ '맛있음': 1, '목넘김': 1 });
});

// ---------- 파라미터 ----------
test('파라미터: 축이 기본값에서 벗어날 때마다 성공률 −12%, 보너스 폭 +6', () => {
  expect(normalizeParams('drink')).toEqual({ grind: 1, temp: 1, time: 1 });
  expect(normalizeParams('dessert', { temp: 2, time: 5, grind: 0 })).toEqual({ temp: 2, time: 2 });
  expect(paramDeviation('drink', { grind: 1, temp: 1, time: 1 })).toBe(0);
  expect(paramDeviation('drink', { grind: 0, temp: 1, time: 2 })).toBe(2);
  expect(successRate('drink', { grind: 1, temp: 1, time: 1 })).toBe(P_SUCCESS);
  expect(successRate('drink', { grind: 0, temp: 2, time: 2 })).toBe(P_SUCCESS - 3 * PARAM_PENALTY);
  expect(successRate('drink', { grind: 1, temp: 1, time: 1 }, 40)).toBeCloseTo(P_SUCCESS + 2);
  expect(successRate('meal', { heat: 1, time: 1 }, 100_000)).toBe(100 - P_GREAT); // 상한
  expect(bonusWidth('drink', { grind: 1, temp: 1, time: 1 })).toBe(4);
  expect(bonusWidth('drink', { grind: 0, temp: 1, time: 1 })).toBe(10);
});

// ---------- 스킬 티어 ----------
test('스킬 티어 경계: 0 없음 / 1~4 초급 / 5~9 중급 / 10~14 상급 / 15~ 특급', () => {
  expect(skillTier(0)).toBe(0);
  expect(skillTier(1)).toBe(1);
  expect(skillTier(4)).toBe(1);
  expect(skillTier(5)).toBe(2);
  expect(skillTier(9)).toBe(2);
  expect(skillTier(10)).toBe(3);
  expect(skillTier(14)).toBe(3);
  expect(skillTier(15)).toBe(4);
  expect(skillTier(99)).toBe(4);
  expect(skillTierValue('맛있음', 4)).toBe(8);
  expect(skillTierValue('맛있음', 5)).toBe(24);
  expect(skillTierValue('희귀함', 15)).toBe(32);
  expect(skillTierValue('목넘김', 0)).toBe(0);
});

test('토핑 스킬이 티어 효과로: 금박(희귀함 3·품격 2) → 판매가 +8%, 방문 +4%', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'gold_leaf' }).ok).toBe(true);
  expect(menuSkills(s, 'americano')).toEqual({ '희귀함': 3, '품격': 2 });
  const e = skillEffects(s, 'americano');
  expect(e.pricePct).toBe(8);
  expect(e.dignityPct).toBe(4);
  // 판매가 = (3,200 + 금박 보기 5 × 150) × 1.08
  expect(priceOf(s, 'americano')).toBe(Math.round((3200 + 750) * 1.08));
  expect(menuStatsOf(s, 'americano').look).toBe(2 + 5);
  // 메뉴판에 있어야 품격이 손님 수에 붙는다
  expect(dignityPct(s)).toBe(0);
  setSlot(s, 0, 'americano');
  expect(dignityPct(s)).toBe(4);
});

test('토핑 2개로 같은 스킬을 쌓으면 중급: 땅콩 크럼블 + 휘핑 + 꿀 → 맛있음 3 (초급)… 치즈·달걀 → 든든함 5 (중급) 맛 +0, 시간 그대로', () => {
  const s = bareState(1);
  s.unlocked.menus.push('toast'); // v3 시작 메뉴는 3종뿐
  apply(s, { type: 'addTopping', menuId: 'toast', toppingId: 'cheese_extra' });
  apply(s, { type: 'addTopping', menuId: 'toast', toppingId: 'egg_extra' });
  expect(menuSkills(s, 'toast')['든든함']).toBe(5);
  expect(skillEffects(s, 'toast').heartyEval).toBe(4);
  apply(s, { type: 'addTopping', menuId: 'toast', toppingId: 'mint' }); // 세련미 2 → 재료비 −8%
  expect(costMult(s, 'toast')).toBeCloseTo(0.92);
  expect(seatTimeMult(s, 'toast')).toBe(1);
});

test('토핑은 3개까지, 중복 불가, 제거 가능. 재료비에 토핑 원가가 들어간다', () => {
  const s = bareState(1);
  const base = ingredientCost(s, 'americano');
  expect(base).toBe(1500);
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'whipped' });      // 200
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'cinnamon_dust' }); // 100
  expect(ingredientCost(s, 'americano')).toBe(1800);
  expect(apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'whipped' }).ok).toBe(false);
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'ice_cream' });     // 500
  expect(s.menuMods['americano']!.toppings.length).toBe(MAX_TOPPINGS);
  expect(canAddTopping(s, 'americano', 'mint').ok).toBe(false);
  expect(canAddTopping(s, 'carrot_juice', 'mint').ok).toBe(false); // 해금 안 된 메뉴
  expect(apply(s, { type: 'removeTopping', menuId: 'americano', toppingId: 'ice_cream' }).ok).toBe(true);
  expect(apply(s, { type: 'removeTopping', menuId: 'americano', toppingId: 'ice_cream' }).ok).toBe(false);
  expect(ingredientCost(s, 'americano')).toBe(1800);
  // 판매 시 토핑 원가가 돈에서 나간다
  const money = s.money;
  setSlot(s, 0, 'americano');
  placeObject(s, 'table_out', X(4), Y(5));
  expect(isMenuAvailable(s, 'americano')).toBe(true);
  s.money = money;
  consumeIngredients(s, 'americano');
  expect(money - s.money).toBe(1800);
  expect(s.monthCosts.ingredients).toBe(1800);
});

// ---------- 히든 레시피 ----------
test('히든 레시피: 재료 집합이 정확히 일치해야 (순서·중복 무시), 여분 재료가 있으면 안 됨', () => {
  expect(HIDDEN_RECIPES.length).toBe(10);
  expect(matchHiddenRecipe(['honey', 'milk_jeju', 'tea_jeju'])).toBe('jeju_matcha_latte');
  expect(matchHiddenRecipe(['tea_jeju', 'milk_jeju', 'honey', 'honey'])).toBe('jeju_matcha_latte');
  expect(matchHiddenRecipe(['tea_jeju', 'milk_jeju', 'honey', 'ice'])).toBeNull();
  expect(matchHiddenRecipe(['beans', 'milk'])).toBeNull();
});

test('히든 레시피 발견: 실패하지 않고 이름·품질(최고) 고정, 도감에 기록', () => {
  const s = bareState(7);
  withStaff(s);
  s.storage['tea_jeju'] = 1;
  const money0 = s.money;
  // tea_jeju는 창고에서 쓰고(절감액 기록), milk_jeju·honey는 원가로 산다
  const r = apply(s, { type: 'develop', base: 'drink', ingredients: ['tea_jeju', 'milk_jeju', 'honey'], params: { grind: 0, temp: 2, time: 2 }, staffId: s.staff[0]!.id });
  expect(r.ok).toBe(true);
  expect(s.storage['tea_jeju']).toBeUndefined(); // 0이 되면 키가 지워진다
  expect(s.monthHarvest.ingredientSaved).toBe(ingredientDef('tea_jeju').cost);
  expect(money0 - s.money).toBe(ingredientDef('milk_jeju').cost + ingredientDef('honey').cost);
  for (let i = 0; i < DEVELOP_DAYS; i++) tick(s, DAY_MS);
  expect(s.developing).toBeNull();
  expect(s.lastDevelop?.outcome).not.toBe('fail');
  expect(s.lastDevelop?.hidden).toBe(true);
  expect(s.lastDevelop?.name).toBe('제주 말차 라떼');
  expect(s.lastDevelop?.quality).toBe('최고');
  expect(s.codex.recipes).toEqual(['jeju_matcha_latte']);
  const m = s.customMenus[0]!;
  expect(m.id).toBe('m_custom_1');
  expect(m.hiddenId).toBe('jeju_matcha_latte');
  expect(s.unlocked.menus).toContain('m_custom_1');
});

// ---------- 개발 생명주기 ----------
test('개발 조건: 재료 수·베이스·직원·연구·돈, farm 재료는 창고 없으면 산다, 시그니처는 ★2부터, 진행 중엔 하나만', () => {
  const s = bareState(1);
  const id = 'nobody';
  expect(canDevelop(s, 'drink', ['beans', 'milk'], id).reason).toBe('없는 직원이에요');
  const st = withStaff(s);
  expect(canDevelop(s, 'drink', ['beans'], st.id).ok).toBe(false);            // 음료는 2개부터
  expect(canDevelop(s, 'dessert', ['flour', 'egg'], st.id).ok).toBe(false);   // 디저트는 3개부터
  expect(canDevelop(s, 'drink', ['beans', 'milk', 'ice', 'sugar', 'honey'], st.id).ok).toBe(false); // 4개까지
  expect(canDevelop(s, 'signature', ['beans', 'milk', 'ice', 'sugar'], st.id).ok).toBe(false);
  s.star = 2;
  expect(canDevelop(s, 'signature', ['beans', 'milk', 'ice', 'sugar'], st.id).ok).toBe(true);
  expect(canDevelop(s, 'drink', ['beans', 'milk', 'ice', 'sugar', 'honey', 'tea', 'flour', 'egg'], st.id).ok).toBe(true); // ★2면 8개
  s.star = 1;
  // v3: farm 재료도 창고에 없으면 원가로 산다 — "창고에 없어요" 거부는 없다
  expect(canDevelop(s, 'drink', ['beans', 'carrot'], st.id).ok).toBe(true);
  expect(developCost(['beans', 'carrot'], s)).toBe(1500 + 500);
  s.storage['carrot'] = 1;
  expect(developCost(['beans', 'carrot'], s)).toBe(1500); // 창고에 있으면 그만큼 안 산다
  s.research = DEVELOP_RESEARCH - 1;
  expect(canDevelop(s, 'drink', ['beans', 'milk'], st.id).ok).toBe(false);
  s.research = DEVELOP_RESEARCH;
  s.money = 100;
  expect(canDevelop(s, 'drink', ['beans', 'milk'], st.id).reason).toBe('돈이 모자라요');
  s.money = 1_000_000;
  expect(canDevelop(s, 'drink', ['beans', 'nope'], st.id).reason).toBe('없는 재료');
  expect(apply(s, { type: 'develop', base: 'drink', ingredients: ['beans', 'milk'], staffId: st.id }).ok).toBe(true);
  expect(s.money).toBe(1_000_000 - 1500 - 600);
  expect(s.research).toBe(0);
  expect(s.developing).toMatchObject({ base: 'drink', staffId: st.id, params: { grind: 1, temp: 1, time: 1 } });
  expect(developDaysLeft(s)).toBe(DEVELOP_DAYS);
  s.research = 100;
  expect(canDevelop(s, 'drink', ['beans', 'milk'], st.id).reason).toBe('이미 개발 중이에요');
  // 개발 중인 직원은 바쁘다: 역할 효과에서 빠지고, 해고·홍보 불가
  expect(roleEffect(s, 'barista')).toBe(0);
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(false);
  expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' }).ok).toBe(false);
  expect(isMenuAvailable(s, 'latte')).toBe(false);
});

test('개발 완료: 3일 뒤 결과가 나오고 새 메뉴가 해금·이름 자동, 스탯 = 재료 합 + 콤보 + 보너스', () => {
  const s = bareState(3);
  const st = withStaff(s);
  apply(s, { type: 'develop', base: 'drink', ingredients: ['beans', 'milk'], staffId: st.id });
  tick(s, DAY_MS); tick(s, DAY_MS);
  expect(s.developing).not.toBeNull();
  expect(s.lastDevelop).toBeNull();
  tick(s, DAY_MS);
  expect(s.developing).toBeNull();
  const r = s.lastDevelop!;
  expect(r).not.toBeNull();
  expect(r.combos).toEqual(['latte']);
  expect(r.name).toBe(autoMenuName('drink', ['beans', 'milk']));
  expect(autoMenuName('drink', ['beans', 'milk'])).toBe('원두 음료'); // 스탯 합이 큰 재료가 주재료
  const base = ingredientStats({ beans: 1, milk: 1 });
  const min = base.taste + 3, minLook = base.look + 2; // 라떼 콤보
  if (r.outcome === 'fail') {
    expect(r.menuId).toBeNull();
    expect(s.customMenus.length).toBe(0);
  } else {
    expect(r.menuId).toBe('m_custom_1');
    const m = s.customMenus[0]!;
    expect(m.stats.taste).toBeGreaterThanOrEqual(min);
    expect(m.stats.look).toBeGreaterThanOrEqual(minLook);
    expect(m.stats.aroma).toBeGreaterThanOrEqual(base.aroma + Math.floor(50 / 25)); // 감각 50 → 향 +2
    expect(m.skills).toEqual({ '목넘김': 1 });
    expect(m.price).toBe(priceFromStats(m.stats));
    if (r.outcome === 'success') expect(m.quality).toBe(qualityOf(m.stats));
    expect(s.unlocked.menus).toContain('m_custom_1');
    expect(roleEffect(s, 'barista')).toBe(50); // 직원 복귀
    // 메뉴판에 올리고 팔 수 있다
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'm_custom_1' }).ok).toBe(true);
    expect(isMenuAvailable(s, 'm_custom_1')).toBe(true);
    expect(priceOf(s, 'm_custom_1')).toBe(m.price);
    expect(ingredientCost(s, 'm_custom_1')).toBe(2100);
  }
  expect(apply(s, { type: 'dismissDevelop' }).ok).toBe(true);
  expect(s.lastDevelop).toBeNull();
});

test('개발은 결정적이고 저장/복원이 같다; 여러 seed 중 성공·실패가 둘 다 나온다', () => {
  const run = (seed: number) => {
    const s = bareState(seed);
    const st = withStaff(s);
    apply(s, { type: 'develop', base: 'dessert', ingredients: ['tangerine', 'cheese', 'flour', 'egg'], params: { temp: 2, time: 0 }, staffId: st.id });
    return s;
  };
  for (const seed of [1, 2]) {
    const a = run(seed), b = run(seed);
    const c = deserialize(serialize(a));
    for (let i = 0; i < DEVELOP_DAYS; i++) { tick(a, DAY_MS); tick(b, DAY_MS); tick(c, DAY_MS); }
    expect(a.lastDevelop).toEqual(b.lastDevelop);
    expect(c.lastDevelop).toEqual(a.lastDevelop);
    expect(serialize(a)).toBe(serialize(c));
  }
  const outcomes = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const s = bareState(seed);
    const st = withStaff(s);
    s.storage['tangerine'] = 1;
    // 감귤 치즈케이크 = 히든 → 실패 없음
    apply(s, { type: 'develop', base: 'dessert', ingredients: ['tangerine', 'cheese', 'flour', 'egg'], params: { temp: 2, time: 0 }, staffId: st.id });
    for (let i = 0; i < DEVELOP_DAYS; i++) tick(s, DAY_MS);
    outcomes.add(s.lastDevelop!.outcome);
    if (s.lastDevelop!.outcome !== 'fail') expect(s.lastDevelop!.name).toBe('감귤 치즈케이크');
  }
  expect(outcomes.has('fail')).toBe(false);
  const plain = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const s = bareState(seed);
    const st = withStaff(s);
    apply(s, { type: 'develop', base: 'drink', ingredients: ['beans', 'milk'], params: { grind: 0, temp: 2, time: 0 }, staffId: st.id }); // 성공률 34%
    for (let i = 0; i < DEVELOP_DAYS; i++) tick(s, DAY_MS);
    plain.add(s.lastDevelop!.outcome);
  }
  expect(plain.has('fail')).toBe(true);
  expect(plain.has('success')).toBe(true);
});

test('resolveDevelop은 완료일 전엔 아무것도 안 한다', () => {
  const s = bareState(1);
  const st = withStaff(s);
  apply(s, { type: 'develop', base: 'drink', ingredients: ['beans', 'milk'], staffId: st.id });
  expect(resolveDevelop(s)).toBeNull();
  expect(s.developing).not.toBeNull();
});

// ---------- 레벨업 ----------
test('메뉴 레벨업: 재료 5인분 + 돈 → 판매가 +10%/레벨, 5레벨까지', () => {
  const s = bareState(1);
  s.money = 10_000_000;
  const cost = levelUpMenuCost(s, 'americano');
  expect(cost).toEqual({ money: 20_000 + 1500 * 5, ingredients: {} });
  expect(apply(s, { type: 'levelUpMenu', menuId: 'americano' }).ok).toBe(true);
  expect(s.money).toBe(10_000_000 - cost.money);
  expect(s.menuMods['americano']!.level).toBe(2);
  expect(priceOf(s, 'americano')).toBe(Math.round(3200 * 1.1));
  expect(levelUpMenuCost(s, 'americano').money).toBe(40_000 + 1500 * 5);
  // farm 재료 5개: 창고에 있으면 창고에서 빠지고, 없으면 원가(당근 500)를 돈으로 낸다
  s.unlocked.menus.push('carrot_juice');
  expect(levelUpMenuCost(s, 'carrot_juice')).toEqual({ money: 20_000 + 500 * 5, ingredients: {} });
  expect(canLevelUpMenu(s, 'carrot_juice').ok).toBe(true);
  s.storage['carrot'] = 7;
  expect(levelUpMenuCost(s, 'carrot_juice')).toEqual({ money: 20_000, ingredients: { carrot: 5 } });
  const m1 = s.money;
  expect(apply(s, { type: 'levelUpMenu', menuId: 'carrot_juice' }).ok).toBe(true);
  expect(s.storage['carrot']).toBe(2);
  expect(m1 - s.money).toBe(20_000);
  for (let i = 0; i < 3; i++) apply(s, { type: 'levelUpMenu', menuId: 'americano' });
  expect(s.menuMods['americano']!.level).toBe(5);
  expect(canLevelUpMenu(s, 'americano').reason).toBe('최고 레벨이에요');
  expect(canLevelUpMenu(s, 'tangerine_ade').ok).toBe(false); // 해금 안 됨
});

// ---------- 손님 취향 ----------
test('손님 취향 스탯: 메뉴 스탯이 기준 이상이면 만족 보너스, 지갑 판정은 토핑·레벨 반영 가격', () => {
  const s = bareState(1);
  // student: rest·fun → aroma·look. 아메리카노 향 8 < 10 → 0, 라떼 맛 10 (taste는 취향 아님) → 0
  expect(likesStatsMatch(s, 'student', 'americano')).toBe(0);
  expect(tasteBonus(s, 'student', null)).toBe(0);
  // working_holiday: rest·food → aroma·taste·volume. 라떼 맛 10 ≥ 10 → 1
  expect(likesStatsMatch(s, 'working_holiday', 'latte')).toBe(1);
  expect(tasteBonus(s, 'working_holiday', 'latte')).toBe(1);
  // 토핑으로 향을 올리면 student도 맞는다
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'cinnamon_dust' }); // 향 +3 → 11, 향긋함 2 → 향 +8
  expect(menuStatsOf(s, 'americano').aroma).toBeGreaterThanOrEqual(LIKE_STAT_MIN);
  expect(likesStatsMatch(s, 'student', 'americano')).toBe(1);
  // 지갑: 금박 3개 얹은 비싼 메뉴는 못 산다
  setSlot(s, 0, 'americano');
  s.guestTypes['student']!.unlocked = true;
  expect(affordableMenus(s, 'student')).toEqual(['americano']);
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'gold_leaf' });
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'black_pork_bit' });
  s.money = 10_000_000;
  for (let i = 0; i < 4; i++) apply(s, { type: 'levelUpMenu', menuId: 'americano' });
  expect(priceOf(s, 'americano')).toBeGreaterThan(6000);
  expect(affordableMenus(s, 'student')).toEqual([]);
});

test('품격이 있는 메뉴가 메뉴판에 있으면 하루 손님 수가 늘고, 목넘김이면 앉는 시간이 준다', () => {
  const s = bareState(1);
  s.clock.month = 4; // 계절 배수 1
  for (const x of [2, 4, 6]) placeObject(s, 'table_out', X(x), Y(5)); // 6석 → 상한 36
  setSlot(s, 0, 'americano');
  const before = dailyGuestCount(s);
  apply(s, { type: 'addTopping', menuId: 'americano', toppingId: 'gold_leaf' }); // 품격 2 → +4%
  expect(dailyGuestCount(s)).toBe(Math.round((before) * 1.04));
  // 목넘김은 콤보 스킬로만 온다 (개발 메뉴)
  s.customMenus.push({ id: 'm_custom_1', name: 'x', category: 'drink', price: 3000, ingredients: { beans: 1 }, stats: menuDef('americano').stats, skills: { '목넘김': 5 } });
  expect(seatTimeMult(s, 'm_custom_1')).toBeCloseTo(0.88);
  expect(toppingDef('mint').skills[0]!.name).toBe('세련미');
});

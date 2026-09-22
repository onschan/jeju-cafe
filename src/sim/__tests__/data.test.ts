import {
  OBJECTS, MENUS, GUEST_TYPES, ROLES, INGREDIENTS, SKILLS, NAMES, PROMOTIONS, DIALOGUE, GOALS, FARM_INGREDIENT_IDS, guestDialogue,
  objectDef, menuDef, ingredientDef, roleDef, buildGroupOf,
} from '../../data/index.ts';
import { INITIAL_UNLOCKED } from '../../data/index.ts';

test('짓기 탭 카테고리: v1·v2 id 모두 카테고리를 찾는다 (경관·랜드마크·장식은 경관·장식으로 묶는다)', () => {
  expect(buildGroupOf('table_out')).toBe('rest'); // v1 id, v2 표에서 카테고리를 찾는다
  expect(buildGroupOf('restroom')).toBe('convenience');
  expect(buildGroupOf('brunch_house')).toBe('food');
  expect(buildGroupOf('cauldron_footbath')).toBe('fun');
  expect(buildGroupOf('tangerine_tree')).toBe('farm');
  expect(buildGroupOf('carrot_field')).toBe('farm');
  expect(buildGroupOf('canola')).toBe('sceneryDeco'); // v1 경관
  expect(buildGroupOf('observatory')).toBe('sceneryDeco'); // 랜드마크
  expect(buildGroupOf('deco_planter')).toBe('sceneryDeco'); // 새 장식 20종
  expect(buildGroupOf('counter')).toBe('indoor'); // y-indoor: 실내 전용은 「실내」 탭
  expect(buildGroupOf('table_in')).toBe('indoor');
  expect(buildGroupOf('window_seat')).toBe('indoor');
  expect(buildGroupOf('annex_cafe')).toBe('rest'); // 별관은 건물이라 쉼 탭
  expect(buildGroupOf('path')).toBe('pathWall');
  expect(buildGroupOf('stonewall')).toBe('pathWall');
});

test('밭(field)은 없다', () => {
  expect(OBJECTS.some((o) => o.id === 'field')).toBe(false);
  expect(() => objectDef('field')).toThrow();
});

test('모든 메뉴 재료는 존재하는 재료다', () => {
  for (const m of MENUS) {
    for (const id of Object.keys(m.ingredients)) {
      expect(INGREDIENTS.some((i) => i.id === id)).toBe(true);
    }
  }
});

test('목표 보상 ref는 존재하는 정의다 (시설·메뉴·직종)', () => {
  expect(GOALS.length).toBe(60);
  // 다른 트랙(x-facility 시설 44·x-staff 직종 clean)이 만드는 id는 통합 때 scripts/validate-goals.ts(strict)가 잡는다. 여기서는 v3에 있던 id만 본다.
  for (const g of GOALS.slice(0, 20)) for (const r of g.reward) {
    if (r.type === 'unlockFacility') expect(OBJECTS.some((d) => d.id === r.id)).toBe(true);
    else if (r.type === 'unlockMenu') expect(MENUS.some((d) => d.id === r.id)).toBe(true);
    else if (r.type === 'unlockRole' || r.type === 'staffSlot') expect(ROLES.some((d) => d.id === (r.type === 'unlockRole' ? r.id : r.role))).toBe(true);
  }
  for (const g of GOALS) for (const r of g.reward) if (r.type === 'unlockMenu') expect(MENUS.some((d) => d.id === r.id), r.id).toBe(true);
});

test('농원 오브젝트는 yield가 있고 그 재료는 존재한다 (감귤 6·당근 8·녹찻잎 4)', () => {
  const farm = OBJECTS.filter((o) => o.yield);
  expect(farm.map((o) => o.id).sort()).toEqual(['carrot_field', 'tangerine_tree', 'tea_field']);
  for (const o of farm) {
    expect(o.yield!.perMonth).toBeGreaterThan(0);
    expect(INGREDIENTS.some((i) => i.id === o.yield!.ingredientId)).toBe(true);
    expect(FARM_INGREDIENT_IDS).toContain(o.yield!.ingredientId);
    expect(buildGroupOf(o.id)).toBe('farm');
  }
  expect(objectDef('tangerine_tree').yield).toEqual({ ingredientId: 'tangerine', perMonth: 6 });
  expect(objectDef('carrot_field').yield).toEqual({ ingredientId: 'carrot', perMonth: 8 });
  expect(objectDef('tea_field').yield).toEqual({ ingredientId: 'tea', perMonth: 4 });
});

test('lookup 헬퍼', () => {
  expect(objectDef('tangerine_tree').kind).toBe('tree');
  expect(menuDef('tangerine_juice').category).toBe('drink');
  expect(GUEST_TYPES.length).toBeGreaterThanOrEqual(2);
});

test('표마다 id가 유일하다', () => {
  for (const table of [OBJECTS, MENUS, GUEST_TYPES, ROLES, INGREDIENTS, SKILLS, PROMOTIONS, GOALS]) {
    expect(new Set(table.map((d) => d.id)).size).toBe(table.length);
  }
});
test('가중치가 유효하다', () => {
  for (const g of GUEST_TYPES) expect(g.weight).toBeGreaterThanOrEqual(0);
});

test('모든 재료는 원가가 있다 (창고에 없으면 자동 구매)', () => {
  for (const ing of INGREDIENTS) expect(ing.cost).toBeGreaterThan(0);
  expect(ingredientDef('carrot').cost).toBe(500);
  expect(ingredientDef('tangerine').cost).toBe(900);
  expect(ingredientDef('tea').cost).toBe(1700);
});

test('시작 메뉴 3개(아메리카노·라떼·감귤주스)는 재료가 전부 존재한다', () => {
  const start = MENUS.filter((m) => INITIAL_UNLOCKED.menus.includes(m.id));
  expect(start.map((m) => m.id)).toEqual(['americano', 'latte', 'tangerine_juice']);
  for (const m of start) for (const id of Object.keys(m.ingredients)) expect(ingredientDef(id).cost).toBeGreaterThan(0);
});

test('메뉴 원가는 가격의 60% 미만 (§4.2 #4 원가 인상 후 크루아상 58%)', () => {
  for (const m of MENUS) {
    const cost = Object.entries(m.ingredients).reduce((s, [id, n]) => s + ingredientDef(id).cost * n, 0);
    expect(cost, m.id).toBeLessThan(m.price * 0.6);
  }
});

test('역할 4, 특기 10, 홍보 7(사과 이벤트 포함), 이름 60', () => {
  expect(ROLES.length).toBe(4);
  expect(SKILLS.length).toBe(10);
  expect(PROMOTIONS.length).toBe(7);
  expect(NAMES.names.length).toBeGreaterThanOrEqual(60);
});

test('역할 정의: id·stat이 유효하다', () => {
  for (const r of ROLES) {
    expect(roleDef(r.id).stat).toBe(r.stat);
  }
  expect(ROLES.filter((r) => r.unlockedAtStart).map((r) => r.id).sort()).toEqual(['barista', 'clean', 'cook', 'hall']);
});

test('대사 데이터: 손님 타입마다(없으면 삼춘·관광객 말투로 대체) happy·meh(no_menu/scenery/wait) 5개씩', () => {
  expect(DIALOGUE.guest['local_auntie']).toBeDefined();
  expect(DIALOGUE.guest['student']).toBeDefined();
  for (const g of GUEST_TYPES) {
    const d = guestDialogue(g.id);
    expect(d).toBeDefined();
    expect(d!.happy.length).toBe(5);
    expect(d!.meh.no_menu.length).toBe(5);
    expect(d!.meh.scenery.length).toBe(5);
    expect(d!.meh.wait.length).toBe(5);
  }
});

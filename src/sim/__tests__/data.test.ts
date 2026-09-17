import {
  OBJECTS, CROPS, MENUS, GUEST_TYPES, UNLOCKS, ROLES, INGREDIENTS, SKILLS, NAMES, PROMOTIONS, DIALOGUE,
  objectDef, cropDef, menuDef, ingredientDef, roleDef,
} from '../../data/index.ts';
import { INITIAL_UNLOCKED } from '../../data/index.ts';

test('모든 메뉴 재료는 존재하는 작물이거나 재료다', () => {
  for (const m of MENUS) {
    for (const id of Object.keys(m.ingredients)) {
      expect(INGREDIENTS.some((i) => i.id === id)).toBe(true);
    }
  }
});

test('모든 해금 ref는 존재하는 정의다 (slot·role은 RoleId)', () => {
  for (const u of UNLOCKS) {
    if (u.kind === 'object') expect(OBJECTS.some((d) => d.id === u.ref)).toBe(true);
    else if (u.kind === 'menu') expect(MENUS.some((d) => d.id === u.ref)).toBe(true);
    else if (u.kind === 'crop') expect(CROPS.some((d) => d.id === u.ref)).toBe(true);
    else expect(ROLES.some((r) => r.id === u.ref)).toBe(true); // slot | role
  }
});

test('tree 오브젝트는 cropId가 있고 그 작물은 harvestMonths가 있다', () => {
  for (const o of OBJECTS.filter((o) => o.kind === 'tree')) {
    expect(o.cropId).toBeDefined();
    expect(cropDef(o.cropId!).harvestMonths?.length).toBeGreaterThan(0);
  }
});

test('lookup 헬퍼', () => {
  expect(objectDef('field').kind).toBe('field');
  expect(menuDef('tangerine_juice').category).toBe('drink');
  expect(GUEST_TYPES.length).toBeGreaterThanOrEqual(2);
});

test('표마다 id가 유일하다', () => {
  for (const table of [OBJECTS, CROPS, MENUS, GUEST_TYPES, UNLOCKS, ROLES, INGREDIENTS, SKILLS, PROMOTIONS]) {
    expect(new Set(table.map((d) => d.id)).size).toBe(table.length);
  }
});
test('가중치와 달 범위가 유효하다', () => {
  for (const g of GUEST_TYPES) expect(g.weight).toBeGreaterThanOrEqual(0);
  for (const c of CROPS) for (const m of [...c.plantMonths, ...(c.harvestMonths ?? [])]) { expect(m).toBeGreaterThanOrEqual(1); expect(m).toBeLessThanOrEqual(12); }
});

test('harvestMonths는 창의 시작 달부터 순서대로 (해 넘김 허용)', () => {
  for (const c of CROPS) {
    const hm = c.harvestMonths ?? [];
    for (let i = 1; i < hm.length; i++) {
      const prev = hm[i - 1]!, cur = hm[i]!;
      expect(cur === prev + 1 || (prev === 12 && cur === 1)).toBe(true);
    }
  }
});

test('메뉴 재료는 전부 ingredients에 있고, farm 재료는 crop id와 같다', () => {
  for (const m of MENUS) for (const id of Object.keys(m.ingredients)) {
    const ing = ingredientDef(id);
    if (ing.kind === 'farm') expect(CROPS.some((c) => c.id === id)).toBe(true);
    else expect(ing.cost).toBeGreaterThan(0);
  }
});

test('시작 메뉴 12개는 bought 재료만 쓴다', () => {
  const start = MENUS.filter((m) => INITIAL_UNLOCKED.menus.includes(m.id));
  expect(start.length).toBe(12);
  for (const m of start) for (const id of Object.keys(m.ingredients)) expect(ingredientDef(id).kind).toBe('bought');
});

test('메뉴 원가는 가격의 50% 미만', () => {
  for (const m of MENUS) {
    const cost = Object.entries(m.ingredients).reduce((s, [id, n]) => s + (ingredientDef(id).kind === 'bought' ? ingredientDef(id).cost * n : 0), 0);
    expect(cost).toBeLessThan(m.price * 0.5);
  }
});

test('역할 7, 스킬 20, 홍보 6, 이름 60', () => {
  expect(ROLES.length).toBe(7);
  expect(SKILLS.length).toBe(20);
  expect(PROMOTIONS.length).toBe(6);
  expect(NAMES.names.length).toBeGreaterThanOrEqual(60);
});

test('역할 정의: id·stat이 유효하다', () => {
  for (const r of ROLES) {
    expect(roleDef(r.id).stat).toBe(r.stat);
  }
  expect(ROLES.filter((r) => r.unlockedAtStart).map((r) => r.id).sort()).toEqual(['barista', 'cook', 'field', 'hall']);
});

test('대사 데이터: 손님 타입마다 happy·meh(no_menu/scenery/wait) 5개씩', () => {
  for (const g of GUEST_TYPES) {
    const d = DIALOGUE.guest[g.id];
    expect(d).toBeDefined();
    expect(d!.happy.length).toBe(5);
    expect(d!.meh.no_menu.length).toBe(5);
    expect(d!.meh.scenery.length).toBe(5);
    expect(d!.meh.wait.length).toBe(5);
  }
});

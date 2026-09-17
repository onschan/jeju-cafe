import { OBJECTS, CROPS, MENUS, GUEST_TYPES, UNLOCKS, objectDef, cropDef, menuDef } from '../../data';

test('모든 메뉴 재료는 존재하는 작물', () => {
  for (const m of MENUS) {
    for (const cropId of Object.keys(m.ingredients)) {
      expect(CROPS.some((c) => c.id === cropId)).toBe(true);
    }
  }
});

test('모든 해금 ref는 존재하는 정의', () => {
  for (const u of UNLOCKS) {
    const pool = u.kind === 'object' ? OBJECTS : u.kind === 'menu' ? MENUS : CROPS;
    expect(pool.some((d) => d.id === u.ref)).toBe(true);
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

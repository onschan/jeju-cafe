import { OBJECTS, CROPS, MENUS, GUEST_TYPES, UNLOCKS, objectDef, cropDef, menuDef } from '../../data/index.ts';

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

test('표마다 id가 유일하다', () => {
  for (const table of [OBJECTS, CROPS, MENUS, GUEST_TYPES, UNLOCKS]) {
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

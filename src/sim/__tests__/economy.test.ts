import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { isMenuAvailable, consumeIngredients } from '../menu.ts';
import { ingredientCost, upkeep } from '../economy.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';

test('bought 재료 메뉴는 창고 없이도 available, 팔면 재료비가 빠진다', () => {
  const s = createInitialState(1);
  expect(isMenuAvailable(s, 'americano')).toBe(true);
  expect(ingredientCost(s, 'latte')).toBe(1900);
  const m0 = s.money;
  consumeIngredients(s, 'latte');
  expect(s.money).toBe(m0 - 1900);
  expect(s.monthCosts.ingredients).toBe(1900);
});

test('farm 재료 메뉴는 창고가 있어야 하고 재료비 0', () => {
  const s = createInitialState(1);
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(false);
  s.storage['carrot'] = 1;
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(true);
  expect(ingredientCost(s, 'carrot_juice')).toBe(0);
});

test('오브젝트 유지비가 이달 비용에서 빠진다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: 4, y: 5 }); // upkeep 2000
  const m0 = s.money;
  upkeep(s);
  expect(s.money).toBe(m0 - 2000);
  expect(s.monthCosts.upkeep).toBe(2000);
});

test('월말 카드에 수입·재료비·월급·광고·유지비·순이익이 있고 monthCosts가 리셋된다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'table_out', x: 4, y: 5 });
  apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  const c = s.lastMonthCard!;
  expect(c.income).toBeGreaterThan(0);
  expect(c.costs.ingredients).toBeGreaterThan(0);
  expect(c.costs.upkeep).toBeGreaterThan(0);
  expect(c.net).toBe(c.income - c.costs.ingredients - c.costs.salary - c.costs.ads - c.costs.upkeep - c.costs.recruit);
  expect(s.monthCosts).toEqual({ ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0 });
});

test('공고비·퇴직금은 카드의 recruit에 잡히고 순이익에서 빠진다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' }); // 10000
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  const severance = s.staff[0]!.salary;
  apply(s, { type: 'fire', staffId: s.staff[0]!.id });
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  const c = s.lastMonthCard!;
  expect(c.costs.recruit).toBe(10000 + severance);
  expect(c.net).toBe(c.income - c.costs.ingredients - c.costs.salary - c.costs.ads - c.costs.upkeep - 10000 - severance);
  expect(s.monthCosts.recruit).toBe(0);
});

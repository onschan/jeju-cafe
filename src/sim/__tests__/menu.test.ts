import { createInitialState } from '../state.ts';
import { canSetSlot, setSlot, isMenuAvailable, availableMenus, consumeIngredients, menuRequirementText } from '../menu.ts';
import { apply } from '../actions.ts';

test('해금된 메뉴만 슬롯에 올릴 수 있다', () => {
  const s = createInitialState(1);
  expect(canSetSlot(s, 0, 'carrot_juice').ok).toBe(false); // 아직 해금 안 됨
  expect(canSetSlot(s, 0, 'americano').ok).toBe(true);
  expect(canSetSlot(s, 9, 'americano').ok).toBe(false);
  setSlot(s, 0, 'americano');
  expect(s.menuSlots[0]).toBe('americano');
  setSlot(s, 0, null);
  expect(s.menuSlots[0]).toBeNull();
});

test('재료가 있어야 available (farm만)', () => {
  const s = createInitialState(1);
  setSlot(s, 0, 'carrot_juice');
  setSlot(s, 1, 'tangerine_juice');
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(false);
  s.storage['carrot'] = 1;
  expect(isMenuAvailable(s, 'carrot_juice')).toBe(true);
  expect(availableMenus(s)).toEqual(['carrot_juice']);
});

test('판매하면 재료가 줄어든다', () => {
  const s = createInitialState(1);
  s.storage['carrot'] = 3;
  consumeIngredients(s, 'carrot_cake');
  expect(s.storage['carrot']).toBe(1);
});

test('같은 메뉴를 두 칸에 올릴 수 없다', () => {
  const s = createInitialState(1);
  setSlot(s, 0, 'americano');
  expect(canSetSlot(s, 1, 'americano').ok).toBe(false);
  expect(canSetSlot(s, 0, 'americano').ok).toBe(true); // 같은 칸 재설정은 허용
});

test('직원 조건: 라떼는 바리스타가 배치돼 있어야 available, 빼면 다시 안 됨', () => {
  const s = createInitialState(1);
  expect(isMenuAvailable(s, 'americano')).toBe(true);
  expect(isMenuAvailable(s, 'latte')).toBe(false);
  expect(menuRequirementText('latte')).toBe('바리스타 필요');
  expect(menuRequirementText('americano')).toBeNull();
  apply(s, { type: 'postJob', tier: 'flyer' });
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'barista' });
  expect(isMenuAvailable(s, 'latte')).toBe(true);
  expect(isMenuAvailable(s, 'scone')).toBe(false); // 요리사 필요
  s.staff[0]!.energy = 0;
  expect(isMenuAvailable(s, 'latte')).toBe(false); // 기력 0
  s.staff[0]!.energy = 50;
  apply(s, { type: 'assign', staffId: s.staff[0]!.id, role: null });
  expect(isMenuAvailable(s, 'latte')).toBe(false);
});

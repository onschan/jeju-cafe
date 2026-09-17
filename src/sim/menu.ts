import type { GameState, ApplyResult } from './types.ts';
import { ingredientDef, roleDef, skillDef, menuDef } from '../data/index.ts';
import { ingredientCost } from './economy.ts';
import { menuOf, isStaffBusy } from './craft.ts';

export { menuOf };

export function canSetSlot(state: GameState, slot: number, menuId: string | null): ApplyResult {
  if (slot < 0 || slot >= state.menuSlots.length) return { ok: false, reason: '없는 칸' };
  if (menuId !== null && !state.unlocked.menus.includes(menuId)) return { ok: false, reason: '아직 모르는 메뉴' };
  if (menuId !== null && state.menuSlots.some((m, i) => m === menuId && i !== slot)) return { ok: false, reason: '이미 메뉴판에 있어요' };
  return { ok: true };
}

export function setSlot(state: GameState, slot: number, menuId: string | null): void {
  state.menuSlots[slot] = menuId;
}

/** 메뉴의 직원 조건(역할 또는 스킬)을 배치된 직원(기력 > 0, 개발 중이 아닌) 중 누군가 만족하나. 조건 없으면 true(주인이 만든다). */
export function hasMenuStaff(state: GameState, menuId: string): boolean {
  const req = menuOf(state, menuId).requires;
  if (!req) return true;
  return state.staff.some((st) => st.role !== null && st.energy > 0 && !isStaffBusy(state, st.id) && (req.role === undefined || st.role === req.role) && (req.skill === undefined || st.skill === req.skill));
}

/** UI용: "바리스타 필요" 같은 조건 문구. 조건 없으면 null. 개발 메뉴는 state를 넘겨야 찾는다. */
export function menuRequirementText(menuId: string, state?: GameState): string | null {
  const req = (state ? menuOf(state, menuId) : menuDef(menuId)).requires;
  if (!req) return null;
  const parts: string[] = [];
  if (req.role) parts.push(roleDef(req.role).name);
  if (req.skill) parts.push(skillDef(req.skill).name);
  return `${parts.join('·')} 필요`;
}

/** bought 재료는 창고 없이 항상 준비돼 있다(돈으로 즉시 산다). farm 재료만 창고를 확인한다. 직원 조건도 만족해야 한다. */
export function isMenuAvailable(state: GameState, menuId: string): boolean {
  if (!hasMenuStaff(state, menuId)) return false;
  const m = menuOf(state, menuId);
  return Object.entries(m.ingredients).every(([id, n]) => {
    if (ingredientDef(id).kind === 'bought') return true;
    return (state.storage[id] ?? 0) >= n;
  });
}

/** 슬롯에 있고 재료도 있는 메뉴 id 목록 */
export function availableMenus(state: GameState): string[] {
  return state.menuSlots.filter((id): id is string => id !== null && isMenuAvailable(state, id));
}

/** farm 재료는 창고에서 차감하고, bought 재료(+토핑)는 재료비만큼 돈이 나가며 이달 재료비에 더해진다. */
export function consumeIngredients(state: GameState, menuId: string): void {
  for (const [id, n] of Object.entries(menuOf(state, menuId).ingredients)) {
    if (ingredientDef(id).kind === 'farm') state.storage[id] = (state.storage[id] ?? 0) - n;
  }
  const cost = ingredientCost(state, menuId);
  state.money -= cost;
  state.monthCosts.ingredients += cost;
}

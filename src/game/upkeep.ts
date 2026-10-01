/** 치우기: 손님이 나간 자리는 더러워지고, 제조대엔 설거지가 쌓인다. 정리 담당이 걸어가 치운다 — 등급이 높을수록 빠르다. */
import type { GameState, Facility } from './types.ts';
import { facilityDef } from './data.ts';
import { HOUR_MS } from './clock.ts';
import { effSkill } from './staff.ts';

export const DIRTY_MAX = 5;
export const DIRTY_POP = 1.2;            // 더러움 1마다 인기 −1.2
export const DISH_PER_MAKE = 1;
export const DISH_MAX = 12;
export const DISH_SLOW = 0.04;           // 설거지 하나마다 제조 4% 느려짐 (상한 40%)
export const CLEAN_BASE_MS = HOUR_MS * 0.5;   // 한 번 치우는 기본 시간
/** 정리 등급이 높을수록 빨리 치운다 */
export function cleanMsOf(st: { clean: number; duty: string; burn?: number }): number {
  const eff = effSkill(st as never, 'clean');
  return CLEAN_BASE_MS * (1 - Math.min(0.7, eff * 0.06));
}
export function dirtyOf(f: Facility): number { return Math.min(DIRTY_MAX, f.dirty ?? 0); }
export function dishesOf(f: Facility): number { return Math.min(DISH_MAX, f.dishes ?? 0); }
/** 제조가 느려지는 비율 (설거지가 쌓일수록) */
export function dishSlow(f: Facility): number { return Math.min(0.4, dishesOf(f) * DISH_SLOW); }
/** 가게 전체 더러움 합 */
export function dirtTotal(s: GameState): number { let n = 0; for (const f of Object.values(s.facilities)) n += dirtyOf(f); return n; }
export function dishTotal(s: GameState): number { let n = 0; for (const f of Object.values(s.facilities)) n += dishesOf(f); return n; }

/** 치울 곳 하나 고르기: 설거지가 많이 쌓인 제조대 → 더러운 자리 순 */
export function cleanTarget(s: GameState): Facility | null {
  let best: Facility | null = null; let score = 0;
  for (const f of Object.values(s.facilities)) {
    const v = dishesOf(f) * 1.2 + dirtyOf(f);
    if (v > score) { score = v; best = f; }
  }
  return score >= 1 ? best : null;
}
/** 매 스텝: 정리 담당이 치운다. 담당이 없으면 사장이 하루에 한 번씩 조금 치운다(일 단위로 decay). */
export function updateCleaning(s: GameState, ms: number): void {
  for (const st of s.staff) {
    if (st.duty !== 'clean') { st.workMs = 0; st.workAt = undefined; continue; }
    const cur = st.workAt ? s.facilities[st.workAt] : null;
    const target = cur && (dirtyOf(cur) > 0 || dishesOf(cur) > 0) ? cur : cleanTarget(s);
    if (!target) { st.workAt = undefined; st.workMs = 0; continue; }
    if (st.workAt !== target.id) { st.workAt = target.id; st.workMs = 0; }
    st.workMs = (st.workMs ?? 0) + ms;
    const need = cleanMsOf(st);
    while ((st.workMs ?? 0) >= need) {
      st.workMs = (st.workMs ?? 0) - need;
      if (dishesOf(target) > 0) target.dishes = Math.max(0, (target.dishes ?? 0) - 3);
      else if (dirtyOf(target) > 0) target.dirty = Math.max(0, (target.dirty ?? 0) - 1);
      else break;
    }
  }
}
/** 하루 끝: 아무도 안 치웠어도 조금은 정리된다 (사장 몫) */
export function dailyTidy(s: GameState): void {
  for (const f of Object.values(s.facilities)) {
    if (f.dirty) f.dirty = Math.max(0, f.dirty - 2);
    if (f.dishes) f.dishes = Math.max(0, f.dishes - 4);
  }
}
/** 자리 더러움이 깎는 인기 */
export function dirtyPenalty(f: Facility): number { return Math.round(dirtyOf(f) * DIRTY_POP); }

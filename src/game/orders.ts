/** 주문 → 제조 → 서빙. 손님이 자리에 앉으면 주문이 뜨고, 제조대에서 바리스타가 만들고, 홀 직원이 가져다 준다.
 *  제조 시간은 바리스타(손놀림) 등급, 서빙 시간은 홀(접객) 등급이 줄인다. 제조대가 없으면 셀프 — 정성이 덜 들어가 값도 덜 받고 점수도 안 붙는다. */
import type { GameState, Guest, Order, OrderKind } from './types.ts';
import { facilityDef, menuDef, MENUS } from './data.ts';
import { HOUR_MS } from './clock.ts';
import { staffSkill } from './staff.ts';

/** 한 잔·한 접시 기본 시간 */
export const MAKE_MS: Record<OrderKind, number> = { drink: HOUR_MS * 0.5, food: HOUR_MS * 0.9 };
export const SERVE_MS = HOUR_MS * 0.35;
/** 셀프(홀 직원 없음)면 가지러 가는 데 더 걸린다 */
export const SELF_SERVE_MULT = 1.8;
/** 제조대에서 만든 것: 값 +15%, 만족 +2 */
export const MADE_MONEY = 1.15;
export const MADE_SCORE = 2;
/** 기다림: 이만큼 넘으면 만족이 깎인다 */
export const WAIT_OK_MS = HOUR_MS * 1.2;
export const WAIT_BAD_MS = HOUR_MS * 2;

/** 능력 합 → 시간 단축 비율 (0~0.6) */
export function speedUp(skill: number): number { return Math.min(0.6, skill * 0.05); }
/** 한 잔 만드는 데 걸리는 시간 (지금 바리스타 기준) */
export function makeMsOf(s: GameState, kind: OrderKind): number { return MAKE_MS[kind] * (1 - speedUp(staffSkill(s, 'speed'))); }
/** 한 번 서빙에 걸리는 시간 (홀 직원이 없으면 셀프) */
export function serveMsOf(s: GameState): number {
  const hall = staffSkill(s, 'service');
  return SERVE_MS * (1 - speedUp(hall)) * (s.staff.some((st) => st.duty === 'service') ? 1 : SELF_SERVE_MULT);
}
export function menuKind(id: string): OrderKind { return menuDef(id).kind ?? 'drink'; }
/** 그 갈래를 만들 수 있는 제조대들 */
export function stationsOf(s: GameState, kind: OrderKind) {
  return Object.values(s.facilities).filter((f) => { const st = facilityDef(f.type).station; return st === kind || st === 'both'; });
}
/** 이 손님이 고를 메뉴 (좋아하는 것 우선, 지갑 안에서) */
export function pickMenu(s: GameState, wallet: number, likes: string[]): string | null {
  const offered = s.menu.filter((m) => likes.includes(m) && menuDef(m).price <= wallet);
  const any = s.menu.filter((m) => menuDef(m).price <= wallet);
  return offered[0] ?? any[0] ?? null;
}
/** 자리에 앉은 손님의 주문을 만든다. 제조대가 없으면 바로 셀프로 내준다(주문 없음). */
export function order(s: GameState, g: Guest, wallet: number, likes: string[]): Order | null {
  const menu = pickMenu(s, wallet, likes);
  if (!menu) return null;
  const kind = menuKind(menu);
  if (stationsOf(s, kind).length === 0) return null;         // 제조대가 없으면 셀프
  const o: Order = { id: s.orderSeq++, guest: g.id, menu, kind, phase: 'wait', ms: 0, waited: 0 };
  s.orders.push(o);
  return o;
}
/** 매 스텝: 빈 제조대에 주문을 걸고, 만들고, 서빙한다 */
export function updateOrders(s: GameState, ms: number): void {
  if (s.orders.length === 0) return;
  const busy = new Set(s.orders.filter((o) => o.phase === 'make' && o.station).map((o) => o.station!));
  for (const o of s.orders) {
    o.waited += ms;
    if (o.phase === 'wait') {
      const free = stationsOf(s, o.kind).find((f) => !busy.has(f.id));
      if (!free) continue;
      busy.add(free.id);
      o.station = free.id; o.phase = 'make'; o.ms = makeMsOf(s, o.kind);
      free.uses++;
      continue;
    }
    o.ms -= ms;
    if (o.ms > 0) continue;
    if (o.phase === 'make') { o.phase = 'serve'; o.ms = serveMsOf(s); continue; }
    if (o.phase === 'serve') o.phase = 'done';
  }
  // 손님이 사라졌으면 주문도 지운다
  const alive = new Set(s.guests.map((g) => g.id));
  s.orders = s.orders.filter((o) => o.phase !== 'done' && alive.has(o.guest));
}
/** 그 손님의 주문 */
export function orderOf(s: GameState, id: string): Order | undefined { return s.orders.find((o) => o.guest === id); }
/** 주문 현황 (UI) */
export function orderStats(s: GameState): { wait: number; make: number; serve: number } {
  return { wait: s.orders.filter((o) => o.phase === 'wait').length, make: s.orders.filter((o) => o.phase === 'make').length, serve: s.orders.filter((o) => o.phase === 'serve').length };
}
void MENUS;

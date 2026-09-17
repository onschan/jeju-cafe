import type { GameState, ApplyResult, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { pushNotice } from './staff.ts';
import { dayIndex } from './effects.ts';

/** 카페 이름 기본값·길이 */
export const DEFAULT_CAFE_NAME = '제주 카페';
export const CAFE_NAME_MAX = 12;
/** 카페 레벨 1~5: 누적 매출 구간 (원) */
export const CAFE_LEVEL_INCOME = [0, 10_000_000, 50_000_000, 200_000_000, 500_000_000];
/** 증축 3종: 주방 증축(요리 슬롯 +1) · 2층(본관 위 실내 좌석 4) · 테라스(야외 좌석 건설비 −20%) */
export type ExpansionId = 'kitchen' | 'floor2' | 'terrace';
export interface ExpansionDef { id: ExpansionId; name: string; cost: number; desc: string }
export const EXPANSIONS: ExpansionDef[] = [
  { id: 'kitchen', name: '주방 증축', cost: 5_000_000, desc: '요리 직원 자리 +1' },
  { id: 'floor2', name: '2층 올리기', cost: 8_000_000, desc: '본관 2층에 실내 자리 4석' },
  { id: 'terrace', name: '테라스', cost: 3_000_000, desc: '야외 좌석 건설비 −20%' },
];
export const FLOOR2_SEATS = 4;
export const TERRACE_DISCOUNT = 0.2;
/** 외벽 색 3종 (스프라이트 tint) */
export const WALL_COLORS = [0xffffff, 0xf3d9a4, 0xa9d3e8];
export const SIGN_MAX = 10;
/** 칭찬하기: 기력 +10, 직원당 하루 한 번 */
export const PRAISE_ENERGY = 10;

/** 누적 매출 구간 → 레벨 1~5 */
export function cafeLevel(state: GameState): number {
  let lv = 1;
  for (let i = 1; i < CAFE_LEVEL_INCOME.length; i++) if (state.totalIncome >= CAFE_LEVEL_INCOME[i]!) lv = i + 1;
  return lv;
}
/** 다음 레벨까지 남은 매출 (최고 레벨이면 null) */
export function nextCafeLevelIncome(state: GameState): number | null {
  const lv = cafeLevel(state);
  return lv >= CAFE_LEVEL_INCOME.length ? null : CAFE_LEVEL_INCOME[lv]!;
}

export function hasExpansion(state: GameState, id: ExpansionId): boolean {
  return state.expansions.includes(id);
}

export function canRenameCafe(_state: GameState, name: string): ApplyResult {
  const t = name.trim();
  if (t.length === 0) return { ok: false, reason: '이름을 적어 주세요' };
  if (t.length > CAFE_NAME_MAX) return { ok: false, reason: `이름은 ${CAFE_NAME_MAX}자까지예요` };
  return { ok: true };
}
export function renameCafe(state: GameState, name: string): void {
  state.cafeName = name.trim();
}

export function canExpand(state: GameState, id: string): ApplyResult {
  const def = EXPANSIONS.find((e) => e.id === id);
  if (!def) return { ok: false, reason: '없는 증축이에요' };
  if (state.expansions.includes(def.id)) return { ok: false, reason: '이미 증축했어요' };
  if (state.money < def.cost) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
/** 검사 없이 증축한다. 주방은 요리 슬롯 +1. 본관 스프라이트는 렌더가 expansions 수로 lv2·lv3 변형을 고른다. */
export function expand(state: GameState, id: ExpansionId): void {
  const def = EXPANSIONS.find((e) => e.id === id)!;
  state.money -= def.cost;
  state.expansions.push(id);
  if (id === 'kitchen') state.slots.cook += 1;
  pushNotice(state, `${def.name} 완공! (₩${def.cost.toLocaleString()})`);
}

/** 짓는 값: 테라스가 있으면 야외 좌석(실내 아닌 seat) −20% */
export function placeCost(state: GameState, type: string): number {
  const def = objectDef(type);
  if (def.kind === 'seat' && !def.indoor && hasExpansion(state, 'terrace')) return Math.round(def.cost * (1 - TERRACE_DISCOUNT));
  return def.cost;
}

/** 2층을 올리면 본관이 실내 좌석 4석짜리 자리가 된다 (손님이 본관 위에 앉는다 = 2층) */
export function seatsOf(state: GameState, o: PlacedObject): number {
  if (o.build) return 0; // 건설 중엔 앉을 수 없다
  if (o.type === 'warehouse') return hasExpansion(state, 'floor2') ? FLOOR2_SEATS : 0;
  return objectDef(o.type).seats ?? (objectDef(o.type).kind === 'seat' ? 1 : 0);
}
export function isSeat(state: GameState, o: PlacedObject): boolean {
  return seatsOf(state, o) > 0;
}

export function canSetCosmetic(_state: GameState, c: { wallColor?: number; sign?: string }): ApplyResult {
  if (c.wallColor !== undefined && (!Number.isInteger(c.wallColor) || c.wallColor < 0 || c.wallColor >= WALL_COLORS.length)) return { ok: false, reason: '없는 색이에요' };
  if (c.sign !== undefined && c.sign.trim().length > SIGN_MAX) return { ok: false, reason: `간판은 ${SIGN_MAX}자까지예요` };
  return { ok: true };
}
export function setCosmetic(state: GameState, c: { wallColor?: number; sign?: string }): void {
  if (c.wallColor !== undefined) state.cosmetics.wallColor = c.wallColor;
  if (c.sign !== undefined) state.cosmetics.sign = c.sign.trim();
}

export function canPraise(state: GameState, staffId: string): ApplyResult {
  const st = state.staff.find((s) => s.id === staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (state.praised[staffId] === dayIndex(state.clock)) return { ok: false, reason: '오늘은 이미 칭찬했어요' };
  return { ok: true };
}
export function praise(state: GameState, staffId: string): void {
  const st = state.staff.find((s) => s.id === staffId)!;
  st.energy = Math.min(100, st.energy + PRAISE_ENERGY);
  state.praised[staffId] = dayIndex(state.clock);
}

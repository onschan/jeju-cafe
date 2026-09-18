/** 노후·청결 (스펙 §3.2.3, HSS2 Dirt → 제주 "청결").
 *  - 카페 청결 0~100: 매일 −(어제 손님 수 ÷ 20), 청소 직원 1명당 +(기술 ÷ 5) 회복(청소 도구실 있으면 ×1.5). 화장실·청소 도구실·창고는 감소 −20%씩(최대 −60%).
 *    50 미만이면 손님 수 ×0.8, 30 미만이면 ×0.6 — effects(spawnMult, source 'clean')로 하루짜리 효과를 매일 갱신해 guests.ts를 건드리지 않는다.
 *  - 시설 노후: 완공(증축·수리) 후 24개월부터 6개월마다 인기 −1(최대 −6). 수리 = 건설비 × 10%. 노후 시설은 유지비 ×1.5. */
import type { GameState, PlacedObject, ApplyResult, RoleId } from './types.ts';
import { objectDef, ROLES } from '../data/index.ts';
import { monthIndex } from './clock.ts';
import { addEffect } from './effects.ts';
import { parcelAt } from './parcels.ts';
import { placeCost } from './cafe.ts';
import { pushNotice } from './staff.ts';
import { levelOf, LEVEL_UPKEEP_MULT } from './upgrade.ts';

export const CLEAN_MAX = 100;
export const CLEAN_GUEST_DIV = 20;      // 매일 −(손님 수 ÷ 20)
export const CLEAN_STAFF_DIV = 5;       // 청소 직원 1명당 +(기술 ÷ 5)
export const CLEAN_ROOM_MULT = 1.5;     // 청소 도구실이 있으면 회복 ×1.5
export const CLEAN_REDUCE_PER_FACILITY = 0.2; // 화장실·청소 도구실·창고: 감소 −20%씩
export const CLEAN_REDUCE_CAP = 0.6;
export const CLEAN_FACILITY_IDS = ['restroom', 'cleaning_room', 'storage'];
export const CLEAN_HIGH = 80;           // 이상: 만족 +3
export const CLEAN_LOW = 50;            // 미만: 손님 ×0.8, 만족 −5
export const CLEAN_CRIT = 30;           // 미만: 손님 ×0.6, 가이드북 심사 −10
export const CLEAN_SOURCE = 'clean';
/** 청소 직종 id (트랙 D의 staff_roles.json에 있으면 그 직원, 없으면 홀 직원이 절반 효과) */
export const CLEAN_ROLE = 'clean';
export const HALL_CLEAN_FACTOR = 0.5;

export const WEAR_START_MONTHS = 24;
export const WEAR_STEP_MONTHS = 6;
export const WEAR_MAX = 6;
export const REPAIR_COST_PCT = 0.1;
export const WORN_UPKEEP_MULT = 1.5;

/** 완공된 내 필지 시설 중 이 종류가 있나 */
function hasBuilt(state: GameState, type: string): boolean {
  return Object.values(state.objects).some((o) => o.type === type && !o.build && parcelAt(state, o.x, o.y)?.owned);
}

/** 청결 감소 배수: 청결 시설 하나당 −20%, 최대 −60% */
export function cleanReduceMult(state: GameState): number {
  const n = CLEAN_FACILITY_IDS.filter((id) => hasBuilt(state, id)).length;
  return 1 - Math.min(CLEAN_REDUCE_CAP, n * CLEAN_REDUCE_PER_FACILITY);
}

/** 하루 회복량: 청소 직원(기술 ÷ 5) 합 × (청소 도구실 1.5). 직종 clean이 없으면 홀 직원 절반. */
export function dailyCleanRecovery(state: GameState): number {
  const hasCleanRole = ROLES.some((r) => (r.id as string) === CLEAN_ROLE);
  const role = (hasCleanRole ? CLEAN_ROLE : 'hall') as RoleId;
  const factor = hasCleanRole ? 1 : HALL_CLEAN_FACTOR;
  const sum = state.staff.filter((s) => s.role === role).reduce((n, s) => n + s.stats.skill / CLEAN_STAFF_DIV, 0) * factor;
  return sum * (hasBuilt(state, 'cleaning_room') ? CLEAN_ROOM_MULT : 1);
}

/** 매일 (새 날): 어제 손님만큼 더러워지고 청소 직원만큼 회복. 손님 수 배수는 하루짜리 효과로 갱신. */
export function dailyCleanliness(state: GameState): void {
  const c = state.clean;
  const guests = Math.max(0, state.totalGuests - c.lastGuests);
  c.lastGuests = state.totalGuests;
  const decay = (guests / CLEAN_GUEST_DIV) * cleanReduceMult(state);
  const before = c.value;
  c.value = Math.max(0, Math.min(CLEAN_MAX, c.value - decay + dailyCleanRecovery(state)));
  state.effects = state.effects.filter((e) => e.source !== CLEAN_SOURCE);
  const mult = cleanGuestMult(state);
  if (mult < 1) addEffect(state, { kind: 'spawnMult', mult, days: 1, source: CLEAN_SOURCE });
  if (before >= CLEAN_LOW && c.value < CLEAN_LOW) pushNotice(state, '카페가 지저분해요 — 청소가 필요해요');
}

/** 청결에 따른 하루 손님 수 배수 (50 미만 0.8, 30 미만 0.6) */
export function cleanGuestMult(state: GameState): number {
  const v = state.clean.value;
  return v < CLEAN_CRIT ? 0.6 : v < CLEAN_LOW ? 0.8 : 1;
}
/** 청결에 따른 만족 가산 (80 이상 +3, 50 미만 −5) — guests.ts 만족 판정 훅 */
export function cleanSatisfaction(state: GameState): number {
  const v = state.clean.value;
  return v >= CLEAN_HIGH ? 3 : v < CLEAN_LOW ? -5 : 0;
}
/** 가이드북 심사 감점 (30 미만 −10) — guidebook.ts(E) 훅 */
export function cleanJudgePenalty(state: GameState): number {
  return state.clean.value < CLEAN_CRIT ? -10 : 0;
}

// ---------- 노후 ----------
/** 노후 단계 0~6: 기준 달(완공·증축·수리)에서 24개월 지나면 1, 6개월마다 +1 */
export function wearOf(state: GameState, obj: PlacedObject): number {
  const months = monthIndex(state.clock) - (obj.wearMonth ?? obj.placedMonth);
  if (months < WEAR_START_MONTHS) return 0;
  return Math.min(WEAR_MAX, Math.floor((months - WEAR_START_MONTHS) / WEAR_STEP_MONTHS) + 1);
}
export function isWorn(state: GameState, obj: PlacedObject): boolean {
  return wearOf(state, obj) > 0;
}
/** 수리비 = 현재 건설비 × 10% */
export function repairCost(state: GameState, obj: PlacedObject): number {
  return Math.round(placeCost(state, obj.type) * REPAIR_COST_PCT);
}
export function canRepair(state: GameState, objId: string): ApplyResult {
  const obj = state.objects[objId];
  if (!obj) return { ok: false, reason: '없는 오브젝트' };
  if (!isWorn(state, obj)) return { ok: false, reason: '아직 멀쩡해요' };
  if (state.money < repairCost(state, obj)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
/** 수리: 돈 차감, 노후 0(기준 달 = 지금). 호출 전 canRepair. */
export function repair(state: GameState, objId: string): void {
  const obj = state.objects[objId]!;
  state.money -= repairCost(state, obj);
  obj.wearMonth = monthIndex(state.clock);
  pushNotice(state, `${objectDef(obj.type).name} 수리 완료`);
}

/** 유지비 배수 = 증축 Lv(×1.25/×1.5) × 노후(×1.5). objectStats().upkeep에 이미 곱해져 있다 — economy.ts(E)가 objectStats를 쓰면 다시 곱하지 말 것. */
export function upkeepMultOf(state: GameState, obj: PlacedObject): number {
  return (LEVEL_UPKEEP_MULT[levelOf(obj)] ?? 1) * (isWorn(state, obj) ? WORN_UPKEEP_MULT : 1);
}

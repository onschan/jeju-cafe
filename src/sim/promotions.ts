import type { GameState, ApplyResult, PromotionDef } from './types.ts';
import { promotionDef, GUEST_TYPES, guestTags, canonicalGuestId } from '../data/index.ts';
import { nextRandom } from './rng.ts';
import { findStaff } from './staff.ts';
import { monthIndex } from './clock.ts';
import { isTarget, isUnlocked } from './segments.ts';
export { canSetTarget, setTarget } from './segments.ts';

export const MAX_ACTIVE_PROMOTIONS = 2; // 동시에 진행하는 기간형 홍보
export const YOUTUBER_CHANCE = 0.6;     // §19
export const YOUTUBER_MONTHS = 3;
export const YOUTUBER_TOURIST_MULT = 2;
export const PARTTIME_MONEY = 150_000;
export const TARGET_MULT = 1.5;         // 타깃 손님층 홍보 효과
export const POPULARITY_DECAY = 2;      // 매월 자연 감소
export const MAX_SEGMENT_POPULARITY = 99;

function clampPop(v: number): number {
  return Math.max(0, Math.min(MAX_SEGMENT_POPULARITY, v));
}

/** 타깃 손님층이면 ×1.5 */
export function targetMult(state: GameState, typeId: string): number {
  return isTarget(state, typeId) ? TARGET_MULT : 1;
}

/** 홍보 하나가 손님층에 주는 인기 가산 (타깃 배수 포함) */
function deltaFor(state: GameState, def: PromotionDef, typeId: string): number {
  return ((def.segmentDelta[typeId] ?? 0) + (def.allDelta ?? 0)) * targetMult(state, typeId);
}

/** 활성 기간형 홍보가 지금 더해 주는 인기 (시작 시점에 구워 둔 delta) */
export function activeBonus(state: GameState, typeId: string): number {
  return state.activePromotions.reduce((s, a) => s + (a.delta[typeId] ?? 0), 0);
}

/** 손님층별 가산을 지금의 타깃 배수로 계산해 굳힌다. 아직 안 오는(잠긴) 타입은 건드리지 않는다. */
function bakeDelta(state: GameState, def: PromotionDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of GUEST_TYPES) {
    if (!isUnlocked(state, t.id)) continue;
    const d = deltaFor(state, def, t.id);
    if (d !== 0) out[t.id] = d;
  }
  return out;
}

/** 유효 인기 = 기본 인기 + 활성 홍보 */
export function effectivePopularity(state: GameState, typeId: string): number {
  const id = canonicalGuestId(typeId);
  return (state.segmentPopularity[id] ?? 0) + activeBonus(state, id);
}

/** 유튜버 부스트는 청년 손님(관광객층)에게 */
export function youtuberMultiplier(state: GameState, typeId: string): number {
  return state.youtuberBoostMonths > 0 && guestTags(typeId).age === 'youth' ? YOUTUBER_TOURIST_MULT : 1;
}

export function canPromote(state: GameState, staffId: string, promotionId: string): ApplyResult {
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (st.role === null) return { ok: false, reason: '배치된 직원만 할 수 있어요' };
  const def = promotionDef(promotionId);
  if (st.energy < def.energy) return { ok: false, reason: '기력이 모자라요' };
  if (def.special === 'parttime' && st.lastParttimeMonthIndex === monthIndex(state.clock)) return { ok: false, reason: '이달은 이미 했어요' };
  if (state.research < def.costResearch) return { ok: false, reason: '연구 포인트가 모자라요' };
  if (state.money < def.costMoney) return { ok: false, reason: '돈이 모자라요' };
  if (def.months > 0) {
    if (state.activePromotions.some((a) => a.promotionId === promotionId)) return { ok: false, reason: '이미 하고 있어요' };
    if (state.activePromotions.length >= MAX_ACTIVE_PROMOTIONS) return { ok: false, reason: '홍보는 동시에 2개까지' };
  }
  return { ok: true };
}

/** 비용 차감 뒤 즉시(1회성) 반영하거나 기간형으로 등록한다. */
export function promote(state: GameState, staffId: string, promotionId: string): void {
  const st = findStaff(state, staffId)!;
  const def = promotionDef(promotionId);
  st.energy -= def.energy;
  state.research -= def.costResearch;
  state.money -= def.costMoney;
  state.monthCosts.ads += def.costMoney;
  if (def.special === 'youtuber') {
    if (nextRandom(state) < YOUTUBER_CHANCE) state.youtuberBoostMonths = YOUTUBER_MONTHS;
    return;
  }
  if (def.special === 'parttime') {
    st.lastParttimeMonthIndex = monthIndex(state.clock);
    state.money += PARTTIME_MONEY;
    state.monthIncome += PARTTIME_MONEY;
    return;
  }
  if (def.popularityShift) state.popularity = Math.max(-100, Math.min(100, state.popularity + def.popularityShift));
  if (def.months > 0) {
    state.activePromotions.push({ promotionId, remainingMonths: def.months, delta: bakeDelta(state, def) });
    return;
  }
  for (const [t, d] of Object.entries(bakeDelta(state, def))) state.segmentPopularity[t] = clampPop((state.segmentPopularity[t] ?? 0) + d);
}


/** 월말: 기간형 홍보 한 달 소진, 유튜버 부스트 감소, 손님층 인기 −2 (0 하한). */
export function expirePromotions(state: GameState): void {
  for (const a of state.activePromotions) a.remainingMonths--;
  state.activePromotions = state.activePromotions.filter((a) => a.remainingMonths > 0);
  state.youtuberBoostMonths = Math.max(0, state.youtuberBoostMonths - 1);
  for (const k of Object.keys(state.segmentPopularity)) state.segmentPopularity[k] = clampPop(state.segmentPopularity[k]! - POPULARITY_DECAY);
}

import type { GameState, ApplyResult, PromotionDef } from './types.ts';
import { promotionDef, GUEST_TYPES, guestTags, canonicalGuestId } from '../data/index.ts';
import { nextRandom } from './rng.ts';
import { applyApology, addReputation } from './reputation.ts';
import { rollOutcome, recordOutcome, outcomeChances, OUTCOME_MULT, GREAT_REPUTATION, FAIL_REPUTATION, FAIL_ENERGY, GREAT_TICKETS, OUTCOME_NAME, type Chances } from './luck.ts'; // staff-luck
import { fmtNum } from './format.ts';
import { findStaff, promoBonusOf, promoEnergyFactorOf, pushNotice } from './staff.ts';
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
  return ((def.segmentDelta[typeId] ?? 0) + (def.allDelta ?? 0)) * targetMult(state, typeId) * promoBonusOf(state); // 홍보 담당(x-staff) ×1.2
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
  if (st.training) return { ok: false, reason: '연수 중이에요' };
  if (state.developing?.staffId === staffId) return { ok: false, reason: '메뉴 개발 중이에요' };
  const def = promotionDef(promotionId);
  if (st.energy < def.energy * promoEnergyFactorOf(state)) return { ok: false, reason: '기력이 모자라요' };
  if (def.special === 'parttime' && st.lastParttimeMonthIndex === monthIndex(state.clock)) return { ok: false, reason: '이달은 이미 했어요' };
  if (def.special === 'apology' && state.lastApologyMonthIndex === monthIndex(state.clock)) return { ok: false, reason: '사과 이벤트는 한 달에 한 번이에요' }; // 트랙 E reputation
  if (state.research < def.costResearch) return { ok: false, reason: '연구 포인트가 모자라요' };
  if (state.money < def.costMoney) return { ok: false, reason: '돈이 모자라요' };
  if (def.months > 0) {
    if (state.activePromotions.some((a) => a.promotionId === promotionId)) return { ok: false, reason: '이미 하고 있어요' };
    if (state.activePromotions.length >= MAX_ACTIVE_PROMOTIONS) return { ok: false, reason: '홍보는 동시에 2개까지' };
  }
  return { ok: true };
}

/** 이 직원에게 이 홍보를 시키면 (사과 이벤트는 굴리지 않는다 → null) */
export function promoChances(state: GameState, staffId: string, promotionId: string): Chances | null {
  if (promotionDef(promotionId).special === 'apology') return null;
  return outcomeChances(state, 'promo', findStaff(state, staffId));
}

/** 비용 차감 뒤 대박/중박/쪽박을 굴리고(staff-luck) 즉시(1회성) 반영하거나 기간형으로 등록한다.
 *  대박 = 효과 ×2 + 응모권 1 + 평판 +3 / 쪽박 = 효과 ×0.5 + 평판 −2 + 기력 −20 (유튜버: 대박 확정·쪽박 무산, 사과 이벤트는 안 굴린다). */
export function promote(state: GameState, staffId: string, promotionId: string): void {
  const st = findStaff(state, staffId)!;
  const def = promotionDef(promotionId);
  const chances = outcomeChances(state, 'promo', st); // 기력을 빼기 전 확률 = 버튼에 미리 보인 값
  const outcome = def.special === 'apology' ? null : rollOutcome(state, { task: 'promo', staff: st });
  st.energy -= def.energy * promoEnergyFactorOf(state); // 홍보 담당(x-staff) ×0.5
  state.research -= def.costResearch;
  state.money -= def.costMoney;
  state.monthCosts.ads += def.costMoney;
  if (outcome === null) { state.lastApologyMonthIndex = monthIndex(state.clock); applyApology(state); return; } // 사과 이벤트 (트랙 E reputation)
  const mult = OUTCOME_MULT[outcome];
  const lines: string[] = [];
  if (def.special === 'youtuber') {
    const r = nextRandom(state); // 주 스트림 소비는 원래대로 1회
    const hit = outcome === 'great' || (outcome === 'success' && r < YOUTUBER_CHANCE);
    if (hit) state.youtuberBoostMonths = YOUTUBER_MONTHS;
    lines.push(hit ? `유튜버 영상이 떴어요 — ${YOUTUBER_MONTHS}달 동안 관광객 2배` : '영상이 묻혔어요…');
  } else if (def.special === 'parttime') {
    st.lastParttimeMonthIndex = monthIndex(state.clock);
    const money = Math.round(PARTTIME_MONEY * mult);
    state.money += money;
    state.monthIncome += money;
    lines.push(`아르바이트비 ₩${fmtNum(money)}`);
  } else {
    if (def.popularityShift) state.popularity = Math.max(-100, Math.min(100, state.popularity + Math.round(def.popularityShift * mult)));
    const delta = bakeDelta(state, def);
    for (const t of Object.keys(delta)) delta[t] = Math.round(delta[t]! * mult * 10) / 10;
    if (def.months > 0) state.activePromotions.push({ promotionId, remainingMonths: def.months, delta });
    else for (const [t, d] of Object.entries(delta)) state.segmentPopularity[t] = clampPop((state.segmentPopularity[t] ?? 0) + d);
    lines.push(`손님층 인기 효과 ×${mult}`);
  }
  if (outcome === 'great') {
    state.tickets += GREAT_TICKETS;
    addReputation(state, GREAT_REPUTATION);
    lines.push(`응모권 +${GREAT_TICKETS} · 평판 +${GREAT_REPUTATION}`);
  } else if (outcome === 'fail') {
    addReputation(state, -FAIL_REPUTATION);
    st.energy = Math.max(0, st.energy - FAIL_ENERGY);
    lines.push(`평판 −${FAIL_REPUTATION} · ${st.name} 기력 −${FAIL_ENERGY} · 경험치 +1`);
  }
  recordOutcome(state, { task: 'promo', outcome, staffId: st.id, title: def.name, chances, lines });
  pushNotice(state, `${def.name} ${OUTCOME_NAME[outcome]}${outcome === 'great' ? '!!' : outcome === 'fail' ? '…' : ''} (${st.name})`);
}


/** 월말: 기간형 홍보 한 달 소진, 유튜버 부스트 감소, 손님층 인기 −2 (0 하한). */
export function expirePromotions(state: GameState): void {
  for (const a of state.activePromotions) a.remainingMonths--;
  state.activePromotions = state.activePromotions.filter((a) => a.remainingMonths > 0);
  state.youtuberBoostMonths = Math.max(0, state.youtuberBoostMonths - 1);
  for (const k of Object.keys(state.segmentPopularity)) state.segmentPopularity[k] = clampPop(state.segmentPopularity[k]! - POPULARITY_DECAY);
}

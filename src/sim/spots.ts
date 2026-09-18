/**
 * 관광 명소 24 (스펙 §3.4): Lv1~5 투자금·조건·효과, 누적 방문객·방문객 상품, 투어 버스 계약, 투어 개최.
 * - 방문객/일 = 매력 × 2 (투어 버스 ×1.3). 카페 유입 = Σ방문객/일 × 3% → 하루 손님 수에 가산.
 * - Lv별 조건: Lv2 방문객 1,000 / Lv3 5,000 + 2년차 / Lv4 15,000 + Lv2 손님 인기 40 / Lv5 40,000 + ★(k=1·2 → 3, 3·4 → 4, 5·6 → 5)
 * - Lv별 효과(누적): 분류 태그 손님 ×1.05/1.10/1.15/1.20/1.25(같은 태그 합산 상한 ×2), Lv3 요금 +2% · Lv5 +5%(분류 대응 시설), Lv4 좌석 경관 +1 · Lv5 +2
 * - 해금: Lv2 손님(evaluateUnlocks) · Lv3 강화 아이템 · Lv4 부탁·다음 명소(board.afterInvest) · Lv5 마일리지 10 + k=6 특수
 */
import type { GameState, ApplyResult, SpotDef, SpotTag, GuestTags, FacilityCategory, TourResult } from './types.ts';
import { SPOTS, spotDef, GUEST_TYPES, guestTypeDef, canonicalGuestId, itemDef } from '../data/index.ts';
import { unlockCondMet, isUnlocked, unlockGuestType, unlockedTypeIds } from './segments.ts';
import { pushNotice } from './staff.ts';
import { grantItem } from './items.ts';
import { addMileage } from './mileage.ts';
import { monthIndex } from './clock.ts';
import { MAX_SEGMENT_POPULARITY } from './promotions.ts';
import { josa } from './josa.ts';
import { fmtNum } from './format.ts';

export const SPOT_MAX_LEVEL = 5;
/** Lv2 손님 해금, Lv3 강화 아이템·요금, Lv4 부탁·다음 명소·경관, Lv5 마일리지·특수 */
export const SPOT_GUEST_LEVEL = 2;
export const SPOT_ITEM_LEVEL = 3;
export const SPOT_QUEST_LEVEL = 4;
/** 투어 버스(계약)가 오는 명소 최소 레벨 */
export const SPOT_BUS_LEVEL = 3;
/** 투어 버스: 매주 일요일(7·14·21·28일) 11시에 4~6명 */
export const BUS_HOUR = 11;
export const BUS_MIN = 4;
export const BUS_MAX = 6;
/** 투자금 기준 B_k (분류 안 순서 k = 1~6) × Lv 배수 */
export const SPOT_BASE_COST = [500_000, 750_000, 1_000_000, 1_300_000, 1_650_000, 2_000_000] as const;
export const SPOT_COST_MULT = [1, 2, 4.5, 8, 13] as const;
/** 방문객/일 = 매력 × 2, 투어 버스 ×1.3. 카페 유입 = 방문객/일 × 3% */
export const VISITORS_PER_APPEAL = 2;
export const BUS_VISITOR_MULT = 1.3;
export const VISITOR_GUEST_RATE = 0.03;
/** Lv별 추가 조건 (Lv2~5 누적 방문객) */
export const SPOT_VISITOR_REQ: Record<number, number> = { 2: 1_000, 3: 5_000, 4: 15_000, 5: 40_000 };
export const SPOT_YEAR_REQ_LV3 = 2;
export const SPOT_POP_REQ_LV4 = 40;
/** Lv5 ★ 조건: k=1·2 → ★3, 3·4 → ★4, 5·6 → ★5 */
export const spotStarReq = (k: number): number => (k <= 2 ? 3 : k <= 4 ? 4 : 5);
/** Lv별 태그 손님 유입 배수 (누적 아님 — 그 Lv의 값), 같은 태그 합산 상한 */
export const SPOT_TAG_MULT = [1, 1.05, 1.1, 1.15, 1.2, 1.25] as const;
export const SPOT_TAG_MULT_CAP = 2.0;
/** Lv3 요금 +2%, Lv5 +5% (분류 대응 시설) · Lv4 좌석 경관 +1, Lv5 +2 */
export const SPOT_FEE_PCT: Record<number, number> = { 3: 2, 4: 2, 5: 5 };
export const SPOT_SCENERY: Record<number, number> = { 4: 1, 5: 2 };
export const SPOT_LV5_MILEAGE = 10;
/** 방문객 상품 5단계 (§3.4.4): 명소별 1,000/5,000/20,000/50,000, 전체 합산 100,000 → 황금 감귤 1회 */
export const VISITOR_PRIZES: { visitors: number; text: string }[] = [
  { visitors: 1_000, text: '응모권 1' },
  { visitors: 5_000, text: '마일리지 3' },
  { visitors: 20_000, text: '감귤 씨앗 2' },
  { visitors: 50_000, text: '씨앗 5개 묶음팩' },
];
export const GOLDEN_TANGERINE_VISITORS = 100_000;
/** 투어 버스 계약: tour_bus_key 보유 후, 월초 50만 원. 단체 손님 ×1.3 */
export const TOUR_BUS_KEY = 'tour_bus_key';
export const TOUR_BUS_FEE = 500_000;
export const TOUR_BUS_GROUP_MULT = 1.3;
/** 투어 개최: 2년차부터 월 1회. 점수 = 매력 + 30 × (태그 손님 인기 ÷ 100) + 콤보 수. 60 이상 성공 */
export const TOUR_YEAR = 2;
export const TOUR_SUCCESS_SCORE = 60;
export const TOUR_MONEY_PER_SCORE = 20_000;
export const TOUR_SUCCESS_VISITORS = 2_000;
export const TOUR_FAIL_MONEY = 1_000_000;
export const TOUR_FAIL_VISITORS = 500;

// ---------- 레벨·투자금 ----------

export function spotLevel(state: GameState, id: string): number {
  return state.spots[id] ?? 0;
}

/** 투자금 표 (§3.4.1): B_k × (1, 2, 4.5, 8, 13) */
export function spotCost(k: number, level: number): number {
  return Math.round((SPOT_BASE_COST[k - 1] ?? SPOT_BASE_COST[5]) * (SPOT_COST_MULT[level - 1] ?? 1));
}

/** 투자할 수 있는 관광지인가: 시작 / 랭크 / 앞 관광지 Lv4 */
export function spotUnlocked(state: GameState, id: string): boolean {
  return unlockCondMet(state, spotDef(id).unlock);
}

/** 다음 레벨 (없으면 null = 최대) */
export function nextSpotLevel(state: GameState, id: string): { level: number; cost: number; appeal: number } | null {
  const def = spotDef(id);
  const lv = spotLevel(state, id);
  return def.levels.find((l) => l.level === lv + 1) ?? null;
}

export function spotAppealOf(def: SpotDef, level: number): number {
  return def.levels.find((l) => l.level === level)?.appeal ?? 0;
}

/** 투자한 관광지 매력도 합 */
export function spotAppeal(state: GameState): number {
  let sum = 0;
  for (const def of SPOTS) sum += spotAppealOf(def, spotLevel(state, def.id));
  return sum;
}

// ---------- 손님 태그 ----------

export function tagMatches(tags: GuestTags, tag: SpotTag | 'adult' | 'male'): boolean {
  switch (tag) {
    case 'female': return tags.gender === 'female';
    case 'male': return tags.gender === 'male';
    case 'group': return tags.group;
    case 'youth': return tags.age === 'youth';
    case 'adult': return tags.age === 'adult';
    case 'senior': return tags.age === 'senior';
  }
}

/** 해금된 태그 손님의 평균 인기 (0~99). 없으면 0. */
export function tagPopularity(state: GameState, tag: SpotTag): number {
  const ids = unlockedTypeIds(state).filter((id) => GUEST_TYPES.some((t) => t.id === id && tagMatches(t.tags, tag)));
  if (ids.length === 0) return 0;
  return ids.reduce((s, id) => s + (state.segmentPopularity[id] ?? 0), 0) / ids.length;
}

// ---------- Lv 조건 ----------

export function spotVisitors(state: GameState, id: string): number {
  return state.spotVisitors[id] ?? 0;
}

export function totalSpotVisitors(state: GameState): number {
  let sum = 0;
  for (const n of Object.values(state.spotVisitors)) sum += n;
  return sum;
}

export interface SpotRequirement { text: string; met: boolean }

/** 다음 레벨의 추가 조건 목록 (UI 카드·canInvestSpot 공용). 최대 레벨이면 []. */
export function spotRequirements(state: GameState, id: string): SpotRequirement[] {
  const def = spotDef(id);
  const next = spotLevel(state, id) + 1;
  if (next > SPOT_MAX_LEVEL) return [];
  const out: SpotRequirement[] = [];
  const need = SPOT_VISITOR_REQ[next];
  if (need) out.push({ text: `누적 방문객 ${fmtNum(need)}명`, met: spotVisitors(state, id) >= need });
  if (next === 3) out.push({ text: `${SPOT_YEAR_REQ_LV3}년차 이상`, met: state.clock.year >= SPOT_YEAR_REQ_LV3 });
  if (next === 4 && def.lv2GuestId) {
    const g = canonicalGuestId(def.lv2GuestId);
    out.push({ text: `${guestTypeDef(g).name} 인기 ${SPOT_POP_REQ_LV4}`, met: (state.segmentPopularity[g] ?? 0) >= SPOT_POP_REQ_LV4 });
  }
  if (next === 5) { const star = spotStarReq(def.order); out.push({ text: `★${star} 이상`, met: state.star >= star }); }
  return out;
}

export function canInvestSpot(state: GameState, id: string): ApplyResult {
  let def: SpotDef;
  try { def = spotDef(id); } catch { return { ok: false, reason: '없는 관광지예요' }; }
  if (!spotUnlocked(state, id)) return { ok: false, reason: '아직 투자할 수 없어요' };
  const next = nextSpotLevel(state, id);
  if (!next) return { ok: false, reason: `${josa(def.name, '은/는')} 최고 레벨이에요` };
  const unmet = spotRequirements(state, id).find((r) => !r.met);
  if (unmet) return { ok: false, reason: `${unmet.text} 조건이 필요해요` };
  if (state.money < next.cost) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

/** 다음 레벨로 투자. 호출 전 canInvestSpot. Lv3 아이템·Lv5 마일리지·특수는 여기서, Lv2 손님·Lv4 부탁·다음 명소는 board.afterInvest가. */
export function investSpot(state: GameState, id: string): number {
  const def = spotDef(id);
  const next = nextSpotLevel(state, id)!;
  state.money -= next.cost;
  state.spots[id] = next.level;
  pushNotice(state, `${def.name} Lv${next.level} 투자 완료`);
  if (next.level === SPOT_ITEM_LEVEL && def.lv3ItemId) {
    try { grantItem(state, def.lv3ItemId); pushNotice(state, `${def.name}에서 ${josa(itemName(def.lv3ItemId), '을/를')} 받았어요`); } catch { /* 표에만 있는 아이템 */ }
  }
  if (next.level === SPOT_MAX_LEVEL) {
    addMileage(state, SPOT_LV5_MILEAGE, `${def.name} Lv5`);
    if (def.lv5Special) applySpecial(state, def);
  }
  return next.level;
}

function itemName(id: string): string {
  try { return itemDef(id).name; } catch { return id; }
}

/** Lv5 특수 (k=6 명소): 손님 해금 / 인기 +n / 소지금 배수·상시 출현은 조회형(spotWalletMult·spotSpawnMult) */
function applySpecial(state: GameState, def: SpotDef): void {
  const sp = def.lv5Special!;
  switch (sp.type) {
    case 'unlockGuest':
      if (GUEST_TYPES.some((t) => t.id === sp.guestId)) { if (!isUnlocked(state, sp.guestId)) unlockGuestType(state, sp.guestId); }
      else pushNotice(state, `${def.name} Lv5: ${sp.text} (아직 오지 않는 손님)`);
      return;
    case 'popularity': {
      const g = canonicalGuestId(sp.guestId);
      state.segmentPopularity[g] = Math.min(MAX_SEGMENT_POPULARITY, (state.segmentPopularity[g] ?? 0) + sp.n);
      pushNotice(state, `${def.name} Lv5: ${sp.text}`);
      return;
    }
    case 'walletMult':
    case 'spawnMult':
      pushNotice(state, `${def.name} Lv5: ${sp.text}`);
      return;
  }
}

// ---------- 효과 조회 (다른 시스템이 부른다) ----------

/** 이 손님 타입의 명소 유입 배수: 태그 명소 Lv 배수 곱(상한 ×2) × 투어 버스 단체 ×1.3 × Lv5 상시 출현 */
export function spotSpawnMult(state: GameState, typeId: string): number {
  const id = canonicalGuestId(typeId);
  const def = GUEST_TYPES.find((t) => t.id === id);
  if (!def) return 1;
  let mult = 1;
  for (const spot of SPOTS) {
    const lv = spotLevel(state, spot.id);
    if (lv > 0 && tagMatches(def.tags, spot.tag)) mult *= SPOT_TAG_MULT[lv] ?? 1;
    if (lv === SPOT_MAX_LEVEL && spot.lv5Special?.type === 'spawnMult' && canonicalGuestId(spot.lv5Special.guestId) === id) mult *= spot.lv5Special.mult;
  }
  mult = Math.min(SPOT_TAG_MULT_CAP, mult);
  if (state.tourBus && def.tags.group) mult *= TOUR_BUS_GROUP_MULT;
  return mult;
}

/** Lv5 특수: 소지금 배수 (요트 투어 → 요트 오너 ×1.5) */
export function spotWalletMult(state: GameState, typeId: string): number {
  const id = canonicalGuestId(typeId);
  let mult = 1;
  for (const spot of SPOTS) {
    if (spotLevel(state, spot.id) === SPOT_MAX_LEVEL && spot.lv5Special?.type === 'walletMult' && canonicalGuestId(spot.lv5Special.guestId) === id) mult *= spot.lv5Special.mult;
  }
  return mult;
}

/** 이 분류 시설의 요금 보너스 %: 대응 명소 Lv3 +2, Lv5 +5 (명소마다 합산) */
export function spotFeePct(state: GameState, category: FacilityCategory | undefined): number {
  if (!category) return 0;
  let pct = 0;
  for (const spot of SPOTS) if (spot.facilityCategory === category) pct += SPOT_FEE_PCT[spotLevel(state, spot.id)] ?? 0;
  return pct;
}

/** 전 좌석 경관 보너스: 명소 Lv4 +1, Lv5 +2 (합산) */
export function spotSceneryBonus(state: GameState): number {
  let n = 0;
  for (const spot of SPOTS) n += SPOT_SCENERY[spotLevel(state, spot.id)] ?? 0;
  return n;
}

// ---------- 방문객 ----------

/** 이 명소의 하루 방문객 = 매력 × 2 (투어 버스 ×1.3) */
export function dailyVisitors(state: GameState, id: string): number {
  const appeal = spotAppealOf(spotDef(id), spotLevel(state, id));
  return Math.round(appeal * VISITORS_PER_APPEAL * (state.tourBus ? BUS_VISITOR_MULT : 1));
}

/** 전 명소 하루 방문객 합 */
export function totalDailyVisitors(state: GameState): number {
  let n = 0;
  for (const def of SPOTS) n += dailyVisitors(state, def.id);
  return n;
}

/** 명소가 더해 주는 하루 손님 수 = 방문객/일 × 3% */
export function spotGuestBonus(state: GameState): number {
  return Math.floor(totalDailyVisitors(state) * VISITOR_GUEST_RATE + 1e-9);
}

/** 방문객을 더하고 상품 단계를 확인한다 (투어 개최 보상도 이걸 쓴다) */
export function addVisitors(state: GameState, id: string, n: number): void {
  if (n <= 0) return;
  state.spotVisitors[id] = (state.spotVisitors[id] ?? 0) + n;
  checkVisitorPrizes(state, id);
}

/** 매일: 투자한 명소마다 방문객 누적 */
export function dailySpots(state: GameState): void {
  for (const def of SPOTS) {
    if (spotLevel(state, def.id) <= 0) continue;
    addVisitors(state, def.id, dailyVisitors(state, def.id));
  }
}

/** 방문객 상품 (§3.4.4): 명소별 4단계 + 전체 합산 10만 황금 감귤 1회 */
export function checkVisitorPrizes(state: GameState, id: string): void {
  const name = spotDef(id).name;
  const v = spotVisitors(state, id);
  let tier = state.spotPrizes[id] ?? 0;
  while (tier < VISITOR_PRIZES.length && v >= VISITOR_PRIZES[tier]!.visitors) {
    const p = VISITOR_PRIZES[tier]!;
    switch (tier) {
      case 0: state.tickets += 1; break;
      case 1: addMileage(state, 3); break;
      case 2: grantItem(state, 'tangerine_seed', 2); break;
      case 3: grantItem(state, 'tangerine_seed', 3); grantItem(state, 'hallabong_seed', 2); break;
    }
    tier++;
    state.spotPrizes[id] = tier;
    pushNotice(state, `${name} 방문객 ${fmtNum(p.visitors)}명 달성! ${p.text}`);
  }
  if (!state.goldenTangerineGiven && totalSpotVisitors(state) >= GOLDEN_TANGERINE_VISITORS) {
    state.goldenTangerineGiven = true;
    grantItem(state, 'golden_tangerine');
    pushNotice(state, `명소 방문객 ${fmtNum(GOLDEN_TANGERINE_VISITORS)}명! 황금 감귤을 받았어요`);
  }
}

// ---------- 투어 버스 ----------

export function hasTourBusKey(state: GameState): boolean {
  return (state.inventory[TOUR_BUS_KEY] ?? 0) > 0;
}

export function canSetTourBus(state: GameState, on: boolean): ApplyResult {
  if (on === state.tourBus) return { ok: false, reason: on ? '이미 계약 중이에요' : '계약 중이 아니에요' };
  if (on && !hasTourBusKey(state)) return { ok: false, reason: '투어 버스 열쇠가 필요해요' };
  return { ok: true };
}

/** 계약 시작/해지. 첫 달 요금은 바로 낸다(계약권이 있으면 무료). 호출 전 canSetTourBus. */
export function setTourBus(state: GameState, on: boolean): void {
  state.tourBus = on;
  if (on) { chargeTourBus(state); pushNotice(state, '투어 버스 계약! 명소 방문객 ×1.3 · 단체 손님 ×1.3'); }
  else pushNotice(state, '투어 버스 계약을 끝냈어요');
}

/** 월초(경제 upkeep 뒤): 계약 중이면 50만 원 (계약권 달은 무료). 돈이 모자라도 낸다(마이너스 → 실패 상태는 E 트랙). */
export function chargeTourBus(state: GameState): void {
  if (!state.tourBus) return;
  if (state.tourBusFreeMonths > 0) { state.tourBusFreeMonths -= 1; pushNotice(state, '투어 버스: 계약권으로 이달 무료'); return; }
  state.money -= TOUR_BUS_FEE;
  state.monthCosts.upkeep += TOUR_BUS_FEE;
  pushNotice(state, `투어 버스 월 계약비 ₩${fmtNum(TOUR_BUS_FEE)}`);
}

export function monthlySpots(state: GameState): void {
  chargeTourBus(state);
}

/** 투어 버스가 오는 관광지들 (계약 중 · Lv3 이상 · Lv2 손님 있음) */
export function busSpots(state: GameState): SpotDef[] {
  if (!state.tourBus) return [];
  return SPOTS.filter((d) => spotLevel(state, d.id) >= SPOT_BUS_LEVEL && d.lv2GuestId);
}

export function isBusDay(day: number): boolean {
  return day % 7 === 0;
}

// ---------- 투어 개최 ----------

export function tourScore(state: GameState, spotId: string): number {
  const def = spotDef(spotId);
  const appeal = spotAppealOf(def, spotLevel(state, spotId));
  return Math.round(appeal + 30 * (tagPopularity(state, def.tag) / 100) + state.codex.combos.length);
}

export function tourAvailable(state: GameState): boolean {
  return state.clock.year >= TOUR_YEAR && state.tourMonth !== monthIndex(state.clock);
}

export function canHostTour(state: GameState, spotId: string): ApplyResult {
  let def: SpotDef;
  try { def = spotDef(spotId); } catch { return { ok: false, reason: '없는 관광지예요' }; }
  if (state.clock.year < TOUR_YEAR) return { ok: false, reason: `투어 개최는 ${TOUR_YEAR}년차부터예요` };
  if (state.tourMonth === monthIndex(state.clock)) return { ok: false, reason: '이달 투어는 이미 열었어요' };
  if (spotLevel(state, spotId) <= 0) return { ok: false, reason: `${josa(def.name, '은/는')} 아직 투자하지 않았어요` };
  return { ok: true };
}

/** 월 1회 투어 개최: 점수 60 이상 성공 → 점수 × 2만 원 + 방문객 2,000, 실패 → 100만 원 + 방문객 500. 호출 전 canHostTour. */
export function hostTour(state: GameState, spotId: string): TourResult {
  const score = tourScore(state, spotId);
  const success = score >= TOUR_SUCCESS_SCORE;
  const money = success ? score * TOUR_MONEY_PER_SCORE : TOUR_FAIL_MONEY;
  const visitors = success ? TOUR_SUCCESS_VISITORS : TOUR_FAIL_VISITORS;
  state.money += money;
  state.monthIncome += money;
  state.tourMonth = monthIndex(state.clock);
  addVisitors(state, spotId, visitors);
  const result: TourResult = { spotId, score, success, money, visitors };
  state.lastTour = result;
  pushNotice(state, `${spotDef(spotId).name} 투어 ${success ? '성공' : '아쉬움'} (점수 ${score}) — ₩${fmtNum(money)} · 방문객 +${fmtNum(visitors)}`);
  return result;
}

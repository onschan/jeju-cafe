import type { GameState, ApplyResult, RegionState, NamedGuestState, NamedGuestDef, PopupVisit, MenuCategory, Face } from './types.ts';
import { REGIONS, NAMED_GUESTS, regionDef, namedGuestDef, namedGuestsOf, FARM_INGREDIENT_IDS, ingredientDef, ITEMS, MENUS, GOALS, menuDef } from '../data/index.ts';
import { randInt, pickWeighted } from './rng.ts';
import { availableMenus, consumeIngredients } from './menu.ts';
import { menuOf, priceOf, statsMatchCount, menuOrderWeight, guestLikesCategory } from './craft.ts';
import { grantItem } from './items.ts';
import { addMileage } from './mileage.ts';
import { pushNotice } from './staff.ts';
import { reputationNamedMult } from './reputation.ts';
import { dayIndex } from './effects.ts';
import { josa } from './josa.ts';
import { fmtNum } from './format.ts';
import { pushFx } from './fx.ts';

/**
 * 원정 팝업 스토어 (스펙 §15.2, 계획 2B-4 Task 2)
 * - 주말(매월 6·13·20·27일)에 지역 하나에 팝업을 낸다. 비용 = 지역 popupCost × 100(원 스케일).
 * - 열린 날 매 시간 그 지역의 이름 있는 손님이 한 명씩 온다(식욕에 비례해 6~8명). 메뉴판에서 취향 분류·예산에 맞는 메뉴를 고르고
 *   호감도 +10(취향 스탯 일치 ×2, 활기가 낮으면 최저 ×0.5). 다음 날 아침 남은 손님을 정리하고 닫는다.
 * - 활기·식욕: 팝업을 연 주 −8, 안 연 주 +5 (0~100). 주말 아침에 지난주 팝업 지역만 빼고 회복한다.
 * - 호감도 100/200/300 → 보상 1/2/3(재료 상자 → 강화 아이템 → 레시피·없으면 마일리지 5). 첫 보상 때 단골★ → 본점에 매주 한 번 온다(guests.ts hourlyRegulars).
 */
export const WEEKEND_DAYS = [6, 13, 20, 27] as const;
export const POPUP_COST_SCALE = 100;
export const POPUP_GUESTS_MIN = 6;
export const POPUP_GUESTS_MAX = 8;
/** 팝업 하루에 처음 만나는 손님 상한 (game-feel P1) */
export const POPUP_NEW_MAX = 3;
export const AFFINITY_PER_VISIT = 10;
export const AFFINITY_TASTE_MULT = 2;
export const AFFINITY_MAX = 300;
export const AFFINITY_REWARD_STEP = 100;
export const AFFINITY_REWARD_COUNT = 3;
/** 활기가 0이어도 호감도는 이 배수까지만 깎인다 */
export const VITALITY_MIN_MULT = 0.5;
export const POPUP_VISIT_CAP = 40;
export const REWARD_INGREDIENTS = 3;
export const RECIPE_FALLBACK_MILEAGE = 5;
/** 단골★ 본점 방문: 번호로 정한 요일(day % 7)·시각(9~17시)에 한 명씩 */
export const REGULAR_HOUR_MIN = 9;
export const REGULAR_HOUR_SPAN = 9;
/** 단골★이 본점에서 만족하면 경치 기준 1 (파츠 조합 손님과 같은 성인 기준) */
export const NAMED_MIN_SCENERY = 1;

export function isWeekend(day: number): boolean {
  return day % 7 === 6;
}
/** 다음 주말까지 남은 날 (오늘이 주말이면 0) */
export function daysToWeekend(day: number): number {
  return (6 - (day % 7) + 7) % 7;
}

export function initRegions(): Record<string, RegionState> {
  const out: Record<string, RegionState> = {};
  for (const r of REGIONS) out[r.id] = { vitality: r.vitality, appetite: r.appetite };
  return out;
}
export function initNamedGuests(): Record<string, NamedGuestState> {
  const out: Record<string, NamedGuestState> = {};
  for (const g of NAMED_GUESTS) out[g.id] = { affinity: 0, rewardsTaken: 0, regular: false, met: false };
  return out;
}
export function initPopup(): GameState['popup'] {
  return { regionId: null, openedDay: -1, lastRegionId: null, queue: [], visits: [] };
}

export function regionState(state: GameState, regionId: string): RegionState {
  const def = regionDef(regionId);
  return (state.regions[regionId] ??= { vitality: def.vitality, appetite: def.appetite });
}
export function namedGuestState(state: GameState, namedId: string): NamedGuestState {
  namedGuestDef(namedId);
  return (state.namedGuests[namedId] ??= { affinity: 0, rewardsTaken: 0, regular: false, met: false });
}

export function popupCost(regionId: string): number {
  return regionDef(regionId).popupCost * POPUP_COST_SCALE;
}
/** 하루 손님 수 = 8 × 식욕/100, 6~8 */
export function popupGuestCount(appetite: number): number {
  return Math.max(POPUP_GUESTS_MIN, Math.min(POPUP_GUESTS_MAX, Math.round((POPUP_GUESTS_MAX * appetite) / 100)));
}
/** 호감도 증가 = 10 × (취향 ×2) × max(0.5, 활기/100) */
export function affinityGain(taste: boolean, vitality = 100): number {
  return Math.round(AFFINITY_PER_VISIT * (taste ? AFFINITY_TASTE_MULT : 1) * Math.max(VITALITY_MIN_MULT, vitality / 100));
}
/** 이름 있는 손님이 주문하는 분류 ('any'면 전부) */
export function namedLikes(def: NamedGuestDef): MenuCategory[] {
  return def.likesBase.includes('any') ? ['drink', 'dessert', 'meal', 'signature'] : (def.likesBase as MenuCategory[]);
}
/** 렌더·초상용 얼굴 파츠 인덱스 (face.seed로 결정) */
export function namedGuestFace(def: NamedGuestDef): Face {
  const s = def.face.seed;
  return { hair: (s * 7) % 48, skin: s % 3, top: (s * 5) % 8 };
}

export function canOpenPopup(state: GameState, regionId: string): ApplyResult {
  try { regionDef(regionId); } catch { return { ok: false, reason: '없는 지역이에요' }; }
  if (!isWeekend(state.clock.day)) return { ok: false, reason: `팝업은 주말(${daysToWeekend(state.clock.day)}일 뒤)에 열어요` };
  if (state.popup.regionId) return { ok: false, reason: '이미 팝업을 열었어요' };
  if (state.money < popupCost(regionId)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

/** 호출 전 canOpenPopup. 비용을 내고 지역 활기·식욕 −8, 오늘 올 손님 줄(6~8명, 순서 랜덤)을 만든다. */
export function openPopup(state: GameState, regionId: string): void {
  const def = regionDef(regionId);
  const cost = popupCost(regionId);
  state.money -= cost;
  state.monthCosts.ads += cost;
  const r = regionState(state, regionId);
  r.vitality = Math.max(0, r.vitality - def.decayPerWeek);
  r.appetite = Math.max(0, r.appetite - def.decayPerWeek);
  const n = popupGuestCount(r.appetite + def.decayPerWeek); // 이번 주 식욕(깎기 전)으로 센다
  // game-feel P1: 처음 보는 손님은 한 번에 POPUP_NEW_MAX명까지 (한 달에 25명이 첫 등장하면 신선함이 한 달에 다 탄다) — 나머지 줄은 이미 만난 손님이 채운다
  const fresh = namedGuestsOf(regionId).map((g) => g.id).filter((id) => !namedGuestState(state, id).met);
  const known = namedGuestsOf(regionId).map((g) => g.id).filter((id) => namedGuestState(state, id).met);
  const queue: string[] = [];
  while (queue.length < Math.min(n, POPUP_NEW_MAX) && fresh.length > 0) queue.push(fresh.splice(randInt(state, 0, fresh.length - 1), 1)[0]!);
  while (queue.length < n && known.length > 0) queue.push(known.splice(randInt(state, 0, known.length - 1), 1)[0]!);
  state.popup = { regionId, openedDay: dayIndex(state.clock), lastRegionId: regionId, queue, visits: [] };
  pushNotice(state, `${def.name}에 팝업을 열었어요 (₩${fmtNum(cost)})`);
}

export function canClosePopup(state: GameState): ApplyResult {
  if (!state.popup.regionId) return { ok: false, reason: '열린 팝업이 없어요' };
  return { ok: true };
}
export function closePopup(state: GameState): void {
  state.popup.regionId = null;
  state.popup.queue = [];
}

/** 매 시간: 줄에서 한 명이 카운터로 온다 */
export function hourlyPopup(state: GameState): PopupVisit | null {
  if (!state.popup.regionId) return null;
  const id = state.popup.queue.shift();
  if (!id) return null;
  return resolvePopupVisit(state, id);
}

/** 새 날: 어제 연 팝업은 남은 손님을 정리하고 닫는다. 주말 아침엔 지난주 팝업 지역만 빼고 활기·식욕 +5. */
export function dailyPopup(state: GameState): void {
  const p = state.popup;
  if (p.regionId && dayIndex(state.clock) > p.openedDay) {
    while (p.queue.length > 0) resolvePopupVisit(state, p.queue.shift()!);
    pushNotice(state, `${regionDef(p.regionId).name} 팝업을 정리했어요`);
    closePopup(state);
  }
  if (isWeekend(state.clock.day)) {
    for (const def of REGIONS) {
      if (def.id === p.lastRegionId) continue;
      const r = regionState(state, def.id);
      r.vitality = Math.min(100, r.vitality + def.recoverPerWeek);
      r.appetite = Math.min(100, r.appetite + def.recoverPerWeek);
    }
    p.lastRegionId = null;
  }
}

/** 팝업 손님 한 명: 메뉴판(현재 슬롯)에서 취향 분류·예산에 맞는 메뉴를 고른다. 없으면 😐(no_menu), 예산 초과면 "비싸다"(price). 먹으면 매출·재료 소모·호감도. */
export function resolvePopupVisit(state: GameState, namedId: string): PopupVisit {
  const def = namedGuestDef(namedId);
  const st = namedGuestState(state, namedId);
  if (!st.met) pushFx(state, { kind: 'scene', title: '첫 만남', text: `${def.name}(${def.job}) — 「${def.line}」 손님 도감에 올랐어요`, tick: state.tick }); // game-feel P1: 첫 등장은 장면 창 + 도감 NEW
  st.met = true;
  const likes = namedLikes(def);
  const liked = availableMenus(state).filter((id) => guestLikesCategory(likes, menuOf(state, id).category));
  const candidates = liked.filter((id) => priceOf(state, id) <= def.budget);
  let visit: PopupVisit;
  if (candidates.length === 0) {
    visit = { namedId, menuId: null, mood: 'meh', reason: liked.length > 0 ? 'price' : 'no_menu', taste: false, gain: 0, affinity: st.affinity, reward: null, regularNow: false, tick: state.tick };
  } else {
    const menuId = pickWeighted(state, candidates, (id) => menuOrderWeight(state, id))!;
    consumeIngredients(state, menuId);
    const price = priceOf(state, menuId);
    state.money += price;
    state.monthIncome += price;
    state.totalIncome += price;
    state.menuSold[menuId] = (state.menuSold[menuId] ?? 0) + 1;
    state.monthGuests++;
    state.totalGuests++;
    const taste = statsMatchCount(state, def.likesStats, menuId) > 0;
    const vitality = state.popup.regionId ? regionState(state, state.popup.regionId).vitality : 100;
    const gain = affinityGain(taste, vitality);
    const r = addAffinity(state, namedId, gain);
    visit = { namedId, menuId, mood: 'happy', reason: null, taste, gain, affinity: st.affinity, reward: r.reward, regularNow: r.regularNow, tick: state.tick };
  }
  state.popup.visits.push(visit);
  if (state.popup.visits.length > POPUP_VISIT_CAP) state.popup.visits.splice(0, state.popup.visits.length - POPUP_VISIT_CAP);
  return visit;
}

/** 호감도를 더하고 100·200·300 문턱마다 보상. 첫 보상 때 단골★. */
export function addAffinity(state: GameState, namedId: string, gain: number): { reward: string | null; regularNow: boolean } {
  const def = namedGuestDef(namedId);
  const st = namedGuestState(state, namedId);
  st.met = true;
  st.affinity = Math.max(0, Math.min(AFFINITY_MAX, st.affinity + gain));
  const rewards: string[] = [];
  let regularNow = false;
  while (st.rewardsTaken < AFFINITY_REWARD_COUNT && st.affinity >= (st.rewardsTaken + 1) * AFFINITY_REWARD_STEP) {
    rewards.push(grantAffinityReward(state, st.rewardsTaken));
    st.rewardsTaken++;
    if (!st.regular) {
      st.regular = true;
      regularNow = true;
      pushNotice(state, `${josa(def.name, '이/가')} 단골★이 됐어요 — 본점에도 와요`);
    }
  }
  if (rewards.length > 0) pushNotice(state, `${def.name} 호감도 ${st.affinity}: ${rewards.join(' · ')}`);
  return { reward: rewards.length > 0 ? rewards.join(' · ') : null, regularNow };
}

/** 보상 단계: 0 재료 상자(작물 3) → 1 강화 아이템 → 2 레시피(아직 모르는 메뉴, 없으면 마일리지 5) */
export function grantAffinityReward(state: GameState, index: number): string {
  switch (index) {
    case 0: {
      const got: Record<string, number> = {};
      for (let i = 0; i < REWARD_INGREDIENTS; i++) {
        const id = FARM_INGREDIENT_IDS[randInt(state, 0, FARM_INGREDIENT_IDS.length - 1)]!;
        got[id] = (got[id] ?? 0) + 1;
        state.storage[id] = (state.storage[id] ?? 0) + 1;
      }
      return `재료 상자 (${Object.entries(got).map(([id, n]) => `${ingredientDef(id).name} ${n}`).join('·')})`;
    }
    case 1: {
      const pool = ITEMS.filter((i) => i.value > 0 && i.fitIds.length > 0);
      const item = pickWeighted(state, pool.length ? pool : ITEMS.filter((i) => i.value > 0), () => 1)!;
      grantItem(state, item.id);
      return `아이템 ${item.name}`;
    }
    default: {
      // 목표 보상으로 열리는 메뉴는 목표에 맡기고, 나머지 잠긴 메뉴를 먼저 준다
      const inTree = new Set(GOALS.flatMap((g) => g.reward.filter((r) => r.type === 'unlockMenu').map((r) => (r as { id: string }).id)));
      const locked = MENUS.filter((m) => !state.unlocked.menus.includes(m.id));
      const pool = locked.filter((m) => !inTree.has(m.id));
      const pick = pickWeighted(state, pool.length ? pool : locked, () => 1);
      if (!pick) { addMileage(state, RECIPE_FALLBACK_MILEAGE); return `마일리지 +${RECIPE_FALLBACK_MILEAGE}`; }
      state.unlocked.menus.push(pick.id);
      return `레시피 ${menuDef(pick.id).name}`;
    }
  }
}

/** 단골★ id 목록 (정의 순서) */
export function regularIds(state: GameState): string[] {
  return NAMED_GUESTS.filter((g) => state.namedGuests[g.id]?.regular).map((g) => g.id);
}
/** 단골★의 본점 방문 요일(day % 7)·시각 — 번호로 결정 */
export function regularVisitSlot(def: NamedGuestDef): { weekday: number; hour: number } {
  return { weekday: def.no % 7, hour: REGULAR_HOUR_MIN + (def.no % REGULAR_HOUR_SPAN) };
}
/** 지금 시각에 본점에 와야 하는 단골★ (아직 안 와 있는). 평판이 높으면(트랙 E reputationNamedMult > 1) 3일 뒤 요일에 한 번 더 온다. */
export function regularsDueNow(state: GameState): NamedGuestDef[] {
  const present = new Set(state.guests.map((g) => g.namedId).filter((x): x is string => !!x));
  const extra = reputationNamedMult(state) > 1;
  return regularIds(state).map(namedGuestDef).filter((d) => {
    const slot = regularVisitSlot(d);
    const wd = state.clock.day % 7;
    const due = wd === slot.weekday || (extra && wd === (slot.weekday + 3) % 7);
    return due && state.clock.hour === slot.hour && !present.has(d.id);
  });
}

/** 도감: 만난 손님 수 */
export function metCount(state: GameState): number {
  return NAMED_GUESTS.filter((g) => state.namedGuests[g.id]?.met).length;
}
export function regularCount(state: GameState): number {
  return regularIds(state).length;
}
/** 지역별 만난 손님 / 단골 수 */
export function regionProgress(state: GameState, regionId: string): { met: number; regular: number; total: number } {
  const gs = namedGuestsOf(regionId);
  return { met: gs.filter((g) => state.namedGuests[g.id]?.met).length, regular: gs.filter((g) => state.namedGuests[g.id]?.regular).length, total: gs.length };
}
/** 활기가 가장 높은 지역 (같으면 정의 순서) */
export function bestRegion(state: GameState): string {
  let best = REGIONS[0]!.id;
  for (const r of REGIONS) if (regionState(state, r.id).vitality > regionState(state, best).vitality) best = r.id;
  return best;
}

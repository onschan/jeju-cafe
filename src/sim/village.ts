/**
 * 정착 등급·마을제 (z-ending, GDD 마을 항목).
 * - 매년 9월 1일 마을 반상회에서 「정착 등급」 심사: 항목 5(동네 손님 만족·삼춘 부탁 완료·경관·소음·기부) 각 0~20점 → 100점.
 *   등급은 심사마다 최대 1단계씩 오르고 내려가지 않는다 (1 외지인 → 2 이웃 → 3 식구 → 4 삼춘 → 5 촌장 후보).
 * - 등급 보상: 2 동네(삼춘) 손님 +10% · 3 삼춘 부탁 해금(만족 조건 없이 올라온다) · 4 필지 할인 10% + 마을제 개최권 · 5 촌장 엔딩 분기.
 * - 마을제: 등급 4 이상, 10월에 1회 개최(₩200만). 그날 손님 ×2·평판 +5·응모권 3.
 * - 기부: ₩50만씩, 정착 등급 「기부」 항목(₩50만 = 1점).
 * 결정적 — rng를 쓰지 않는다.
 */
import type { GameState, ApplyResult, VillageState } from './types.ts';
import { GUEST_TYPES, objectDef } from '../data/index.ts';
import { effectivePopularity } from './promotions.ts';
import { addEffect } from './effects.ts';
import { addReputation } from './reputation.ts';
import { pushNotice } from './staff.ts';
import { fmtNum } from './format.ts';
import { canonicalGuestId } from '../data/index.ts';

export const VILLAGE_GRADE_MAX = 5;
export const VILLAGE_GRADE_NAME: readonly string[] = ['', '외지인', '이웃', '식구', '삼춘', '촌장 후보'];
/** 등급 n이 되려면 심사 점수가 이 이상 (index = 등급) */
export const VILLAGE_GRADE_SCORE: readonly number[] = [0, 0, 15, 35, 55, 75];
export const VILLAGE_REVIEW_MONTH = 9;
export const FESTIVAL_MONTH = 10;
export const FESTIVAL_GRADE = 4;
export const FESTIVAL_COST = 2_000_000;
export const FESTIVAL_GUEST_MULT = 2;
export const FESTIVAL_REPUTATION = 5;
export const FESTIVAL_TICKETS = 3;
export const VILLAGE_DONATION = 500_000;
/** 등급 2: 동네(삼춘) 손님 스폰 ×1.1 */
export const LOCAL_GUEST_GRADE = 2;
export const LOCAL_GUEST_MULT = 1.1;
/** 등급 3: 삼춘 부탁이 만족 조건 없이 올라온다 */
export const QUEST_GRADE = 3;
/** 등급 4: 필지 10% 할인 */
export const PARCEL_DISCOUNT_GRADE = 4;
export const PARCEL_DISCOUNT = 0.1;
/** 등급 5: 촌장 엔딩 */
export const CHIEF_GRADE = 5;
/** 항목 점수 상한 */
export const ITEM_MAX = 20;
/** 항목 환산: 부탁 1건 = 2점, 경관 합 10 = 1점, 소음 합 5 = −1점, 기부 ₩50만 = 1점 */
export const QUEST_POINTS = 2;
export const SCENERY_PER_POINT = 10;
export const NOISE_PER_POINT = 5;
export const DONATION_PER_POINT = VILLAGE_DONATION;

export type VillageKey = 'localSat' | 'quests' | 'scenery' | 'noise' | 'donation';
export interface VillageItem { key: VillageKey; label: string; value: number; points: number; hint: string }
export interface VillageReview { items: VillageItem[]; total: number; grade: number }

export const VILLAGE_ITEM_LABEL: Record<VillageKey, string> = { localSat: '동네 손님 만족', quests: '삼춘 부탁 완료', scenery: '경관', noise: '소음', donation: '기부' };

export function initVillage(): VillageState {
  return { grade: 1, lastReviewYear: 0, donated: 0, festivals: 0, festivalYear: 0 };
}

/** 동네(삼춘) 손님 타입: 연령 태그 senior (effects.ts 'local' 필터와 같은 규칙) */
export function isLocalGuestType(typeId: string): boolean {
  const def = GUEST_TYPES.find((t) => t.id === canonicalGuestId(typeId));
  return !!def && def.tags.age === 'senior';
}

/** 동네 손님 만족: 열린 동네 손님 타입의 인기(0~99) 평균 */
export function localSatisfaction(state: GameState): number {
  const ids = GUEST_TYPES.filter((t) => t.tags.age === 'senior' && state.guestTypes[t.id]?.unlocked).map((t) => t.id);
  if (ids.length === 0) return 0;
  return Math.round(ids.reduce((s, id) => s + effectivePopularity(state, id), 0) / ids.length);
}
export function questsDone(state: GameState): number {
  return Object.values(state.board.quests).filter((q) => q.status === 'done').length;
}
/** 마당 경관 합 (완공 오브젝트의 기본 경관) */
export function totalScenery(state: GameState): number {
  let n = 0;
  for (const o of Object.values(state.objects)) if (!o.build) n += Math.max(0, objectDef(o.type).scenery ?? 0);
  return n;
}
export function totalNoise(state: GameState): number {
  let n = 0;
  for (const o of Object.values(state.objects)) if (!o.build) n += Math.max(0, objectDef(o.type).noise ?? 0);
  return n;
}

const clampItem = (v: number) => Math.max(0, Math.min(ITEM_MAX, Math.round(v)));

/** 지금 심사하면 나오는 항목·점수 (등급은 현재 등급에서 최대 1단계 상승) */
export function villageReview(state: GameState): VillageReview {
  const sat = localSatisfaction(state);
  const q = questsDone(state);
  const sc = totalScenery(state);
  const no = totalNoise(state);
  const items: VillageItem[] = [
    { key: 'localSat', label: VILLAGE_ITEM_LABEL.localSat, value: sat, points: clampItem(sat / 5), hint: '인기 5=1점' },
    { key: 'quests', label: VILLAGE_ITEM_LABEL.quests, value: q, points: clampItem(q * QUEST_POINTS), hint: '1건=2점' },
    { key: 'scenery', label: VILLAGE_ITEM_LABEL.scenery, value: sc, points: clampItem(sc / SCENERY_PER_POINT), hint: '합 10=1점' },
    { key: 'noise', label: VILLAGE_ITEM_LABEL.noise, value: no, points: clampItem(ITEM_MAX - no / NOISE_PER_POINT), hint: '합 5=−1점' },
    { key: 'donation', label: VILLAGE_ITEM_LABEL.donation, value: state.village.donated, points: clampItem(state.village.donated / DONATION_PER_POINT), hint: '₩50만=1점' },
  ];
  const total = items.reduce((s, i) => s + i.points, 0);
  const cur = state.village.grade;
  const next = Math.min(VILLAGE_GRADE_MAX, cur + 1);
  const grade = total >= VILLAGE_GRADE_SCORE[next]! ? next : cur;
  return { items, total, grade };
}

/** 다음 등급에 필요한 점수 (최고 등급이면 null) */
export function nextGradeScore(state: GameState): number | null {
  const g = state.village.grade;
  return g >= VILLAGE_GRADE_MAX ? null : VILLAGE_GRADE_SCORE[g + 1]!;
}

/** 9월 1일 심사 (tick.ts onNewMonth 훅). 연 1회. */
export function villageMonthly(state: GameState): void {
  if (state.clock.month !== VILLAGE_REVIEW_MONTH || state.village.lastReviewYear === state.clock.year) return;
  state.village.lastReviewYear = state.clock.year;
  const r = villageReview(state);
  const up = r.grade > state.village.grade;
  state.village.grade = r.grade;
  state.alerts.push({ type: 'village', grade: r.grade, up });
  pushNotice(state, up ? `마을 반상회: 정착 등급이 「${VILLAGE_GRADE_NAME[r.grade]}」이 됐어요` : `마을 반상회: 정착 등급 「${VILLAGE_GRADE_NAME[r.grade]}」 유지 (${r.total}점)`);
  if (up && r.grade === FESTIVAL_GRADE) pushNotice(state, '마을제를 열 수 있어요 (10월, 장부 › 지역 › 마을)');
}

/** 10월 1일: 등급 4 이상이고 올해 아직 안 열었으면 개최 안내 (tick.ts onNewMonth 훅) */
export function festivalMonthly(state: GameState): void {
  if (state.clock.month !== FESTIVAL_MONTH || state.village.grade < FESTIVAL_GRADE || state.village.festivalYear === state.clock.year) return;
  state.alerts.push({ type: 'festivalOffer' });
}

// ---------- 등급 보상 훅 ----------

/** guests.ts 타입 가중치 훅: 등급 2 이상이면 동네 손님 ×1.1 */
export function villageLocalMult(state: GameState, typeId: string): number {
  return state.village.grade >= LOCAL_GUEST_GRADE && isLocalGuestType(typeId) ? LOCAL_GUEST_MULT : 1;
}
/** board.ts shouldOffer 훅: 등급 3 이상이면 삼춘 부탁이 만족 조건 없이 올라온다 */
export function villageQuestOpen(state: GameState, guestId: string): boolean {
  return state.village.grade >= QUEST_GRADE && isLocalGuestType(guestId);
}
/** parcels.ts parcelPrice 훅: 등급 4 이상이면 10% 할인 */
export function villageParcelDiscount(state: GameState): number {
  return state.village.grade >= PARCEL_DISCOUNT_GRADE ? PARCEL_DISCOUNT : 0;
}
export function isChiefCandidate(state: GameState): boolean {
  return state.village.grade >= CHIEF_GRADE;
}

// ---------- 액션 ----------

export function canDonate(state: GameState): ApplyResult {
  if (state.money < VILLAGE_DONATION) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function donate(state: GameState): void {
  state.money -= VILLAGE_DONATION;
  state.village.donated += VILLAGE_DONATION;
  pushNotice(state, `마을에 ₩${fmtNum(VILLAGE_DONATION)} 기부했어요 (누적 ₩${fmtNum(state.village.donated)})`);
}

export function canHoldFestival(state: GameState): ApplyResult {
  if (state.village.grade < FESTIVAL_GRADE) return { ok: false, reason: `정착 등급 「${VILLAGE_GRADE_NAME[FESTIVAL_GRADE]}」부터 열 수 있어요` };
  if (state.clock.month !== FESTIVAL_MONTH) return { ok: false, reason: '마을제는 10월에 열어요' };
  if (state.village.festivalYear === state.clock.year) return { ok: false, reason: '올해는 이미 열었어요' };
  if (state.money < FESTIVAL_COST) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function holdFestival(state: GameState): void {
  state.money -= FESTIVAL_COST;
  state.village.festivals++;
  state.village.festivalYear = state.clock.year;
  addEffect(state, { kind: 'spawnMult', mult: FESTIVAL_GUEST_MULT, days: 1, source: 'festival' });
  addReputation(state, FESTIVAL_REPUTATION);
  state.tickets += FESTIVAL_TICKETS;
  pushNotice(state, `마을제를 열었어요 — 오늘 손님 ×${FESTIVAL_GUEST_MULT}·평판 +${FESTIVAL_REPUTATION}·응모권 +${FESTIVAL_TICKETS}`);
}

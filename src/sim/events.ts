/**
 * 제주 빅 이벤트 (v3 A5): events_v3.json. 매월 1일 판정(rng) → 동시 최대 2개 → state.events에 활성.
 * 발동 시 alerts { type: 'event', id } (UI 대화창), 끝나면 { type: 'eventEnd', id }.
 * 효과: 하루 손님 수 배수(guestMult)·손님층 가중치 배수(tagMult)·메뉴 값 배수(feeMult)는 guests.ts가 곱한다.
 * 즉시 효과: moneyBonus·popularity·repairCost(시설당). specialGuest는 이름 있는 손님 흐름(spawnNamedGuest)으로 1회 방문 — 만족하면 tip.
 * 실명은 쓰지 않는다 (백중원·이요리·이장순·유아이·'돈돈').
 */
import type { GameState, BigEventDef, BigEventTag, ActiveBigEvent } from './types.ts';
import { BIG_EVENTS, bigEventDef, guestTypeDef, canonicalGuestId, SPECIAL_REGION, specialGuestId } from '../data/index.ts';
import { nextRandom } from './rng.ts';
import { dayIndex } from './effects.ts';
import { goalMet } from './goals.ts';
import { pushNotice, staffInRole, skillTotal } from './staff.ts';
import { isWorn, WEAR_START_MONTHS } from './cleanliness.ts';
import { monthIndex } from './clock.ts';
import { facilityCount } from './rank.ts';
import { addEffect } from './effects.ts';
import { objectDef } from '../data/index.ts';
import { parcelAt } from './parcels.ts';
import { spawnNamedGuest } from './guests.ts';
import { namedGuestState } from './popup.ts';
import { fmtNum } from './format.ts';
import { josa } from './josa.ts';

/** 동시에 진행되는 빅 이벤트 상한 */
export const MAX_ACTIVE_EVENTS = 2;
/** 특별 손님이 오는 시각 (발동 다음 날부터, 자리가 없으면 매 시간 다시 시도) */
export const SPECIAL_GUEST_HOUR = 12;

const STUDENT_IDS = new Set(['student', 'school_trip', 'school_club', 'college_club', 'art_student', 'teen_idol_fan', 'kid_pocketmoney']);
const SOLO_IDS = new Set(['digital_nomad', 'working_holiday', 'monthly_stayer', 'olle_walker', 'oreum_hiker', 'van_lifer', 'solo_foreign', 'world_traveler', 'night_guest', 'stargazer', 'trail_runner']);

/** 손님 타입이 이벤트 태그에 해당하나 */
export function guestHasTag(typeId: string, tag: BigEventTag): boolean {
  const id = canonicalGuestId(typeId);
  const d = guestTypeDef(id);
  switch (tag) {
    case 'youth': case 'adult': case 'senior': return d.tags.age === tag;
    case 'female': case 'male': return d.tags.gender === tag;
    case 'group': return d.tags.group;
    case 'foreign': return d.chain === 'c18_group_foreign' || d.chain === 'c19_solo_foreign';
    case 'student': return STUDENT_IDS.has(id);
    case 'solo': return SOLO_IDS.has(id);
    case 'family': return d.chain === 'c05_family';
  }
}

export function activeEvents(state: GameState): ActiveBigEvent[] {
  const today = dayIndex(state.clock);
  return state.events.filter((e) => e.endsDay > today);
}
export function isEventActive(state: GameState, id: string): boolean {
  return activeEvents(state).some((e) => e.id === id);
}
/** 남은 날 (오늘 포함) */
export function eventDaysLeft(state: GameState, e: ActiveBigEvent): number {
  return Math.max(0, e.endsDay - dayIndex(state.clock));
}

/** 하루 손님 수 배수 (활성 이벤트 guestMult의 곱) */
export function eventGuestMult(state: GameState): number {
  let m = 1;
  for (const e of activeEvents(state)) m *= bigEventDef(e.id).effects.guestMult ?? 1;
  return m;
}
/** 손님층 가중치 배수 (태그가 맞는 tagMult의 곱) */
export function eventTagMult(state: GameState, typeId: string): number {
  let m = 1;
  for (const e of activeEvents(state)) {
    const tm = bigEventDef(e.id).effects.tagMult;
    if (!tm) continue;
    for (const [tag, mult] of Object.entries(tm)) if (mult !== undefined && guestHasTag(typeId, tag as BigEventTag)) m *= mult;
  }
  return m;
}
/** 메뉴 값 배수 */
export function eventFeeMult(state: GameState): number {
  let m = 1;
  for (const e of activeEvents(state)) m *= bigEventDef(e.id).effects.feeMult ?? 1;
  return m;
}

/** 이 달에 이 이벤트를 굴릴 수 있나 (확률은 빼고) */
export function eventEligible(state: GameState, def: BigEventDef): boolean {
  if (isEventActive(state, def.id)) return false;
  if (def.once && (state.eventsFired[def.id] ?? 0) > 0) return false;
  if (def.month !== undefined && def.month !== state.clock.month) return false;
  if (def.year !== undefined && state.clock.year < def.year) return false;
  if (def.condition && !goalMet(state, def.condition)) return false;
  return true;
}

/** 야외 시설 (§4.5 태풍 수리비 대상): 경관·농원·야외 좌석·카트 — 실내 오브젝트·건물·길·정낭·정류장·돌담은 제외 */
export function isOutdoorFacility(type: string): boolean {
  const d = objectDef(type);
  if (d.indoor || d.room) return false;
  return d.kind === 'seat' || d.kind === 'deco' || d.kind === 'tree' || d.kind === 'facility' || d.kind === 'landmark';
}
/** 소유 필지 안 야외 시설 건설비 합 */
export function outdoorBuildCost(state: GameState): number {
  let sum = 0;
  for (const o of Object.values(state.objects)) if (isOutdoorFacility(o.type) && parcelAt(state, o.x, o.y)?.owned) sum += objectDef(o.type).cost;
  return sum;
}
/** §4.5 태풍 수리비: 야외 시설 건설비 합 × pct% (min~max), 아이템 할인(wind_charm ×0.5·storm_ready ×0.7) */
export function typhoonRepairCost(state: GameState, def: BigEventDef): number {
  const fx = def.effects;
  if (!fx.repairPct) return 0;
  const base = outdoorBuildCost(state);
  if (base <= 0) return 0; // 야외 시설이 없으면 수리할 게 없다
  let cost = Math.max(fx.repairMin ?? 0, Math.min(fx.repairMax ?? Infinity, base * fx.repairPct / 100));
  for (const d of fx.itemDiscount ?? []) if ((state.inventory[d.itemId] ?? 0) > 0) cost *= d.mult;
  cost *= Math.max(0, 1 - skillTotal(state, 'stormRepairDiscount')); // 트랙 D 특기 storm_ready −30%
  return Math.round(cost);
}
/** 이 이벤트의 이번 달 발동 확률 (deterItem이 있으면 배수) */
export function eventChance(state: GameState, def: BigEventDef): number {
  const d = def.effects.deterItem;
  return d && (state.inventory[d.itemId] ?? 0) > 0 ? def.chance * d.chanceMult : def.chance;
}

/** 이벤트를 발동한다 (판정 없이): 활성 목록 + 즉시 효과 + 알림·대화창. */
export function startEvent(state: GameState, id: string): ActiveBigEvent {
  const def = bigEventDef(id);
  const today = dayIndex(state.clock);
  const e: ActiveBigEvent = { id, startDay: today, endsDay: today + def.durationDays, specialVisited: !def.effects.specialGuest };
  state.events.push(e);
  state.eventsFired[id] = (state.eventsFired[id] ?? 0) + 1;
  const fx = def.effects;
  if (fx.moneyBonus) state.money += fx.moneyBonus;
  if (fx.popularity) state.popularity = Math.max(-100, Math.min(100, state.popularity + fx.popularity));
  if (fx.repairCost || fx.repairPct) {
    const cost = fx.repairPct ? typhoonRepairCost(state, def) : (fx.repairCost ?? 0) * facilityCount(state);
    state.money -= cost;
    state.monthCosts.upkeep += cost;
    if (cost > 0) pushNotice(state, `${def.title}: 시설 수리비 ₩${fmtNum(cost)}`);
    // fx.damagePct: 야외 시설이 그 확률로 파손 → 트랙 A 노후 1단계(인기 −1·유지비 ×1.5)로 표시, 시설 카드 「수리」로 고친다
    if (fx.damagePct) {
      let hit = 0;
      for (const o of Object.values(state.objects)) {
        if (o.build || !isOutdoorFacility(o.type) || !parcelAt(state, o.x, o.y)?.owned || isWorn(state, o)) continue;
        if (nextRandom(state) * 100 < fx.damagePct) { o.wearMonth = monthIndex(state.clock) - WEAR_START_MONTHS; hit++; }
      }
      if (hit > 0) pushNotice(state, `${def.title}: 야외 시설 ${hit}개가 낡았어요 — 시설 카드에서 수리하세요`);
    }
  }
  if (fx.heatingCost) {
    state.money -= fx.heatingCost;
    state.monthCosts.upkeep += fx.heatingCost;
    pushNotice(state, `${def.title}: 난방비 ₩${fmtNum(fx.heatingCost)}`);
  }
  if (fx.harvestMult !== undefined) {
    // 노루·까치: 운반 직원 힘 ≥ carryStrength면 완화
    const strong = fx.carryStrength !== undefined && staffInRole(state, 'carry').some((st) => st.stats.strength >= fx.carryStrength!);
    const mult = strong && fx.harvestMultCarry !== undefined ? fx.harvestMultCarry : fx.harvestMult;
    addEffect(state, { kind: 'harvestMult', mult, days: fx.harvestDays ?? 30, source: id });
  }
  if (fx.spawnFilter) addEffect(state, { kind: 'spawnMult', mult: fx.spawnFilter.mult, filter: fx.spawnFilter.filter, days: fx.spawnFilter.days, source: id });
  state.alerts.push({ type: 'event', id });
  pushNotice(state, `빅 이벤트: ${def.title}`);
  return e;
}

/** 매월 1일: 정의 순서대로 자격·확률을 굴려 동시 2개까지 발동한다. 발동한 id 목록. 결정적(state.rng). */
export function monthlyBigEvents(state: GameState): string[] {
  const started: string[] = [];
  for (const def of BIG_EVENTS) {
    if (activeEvents(state).length >= MAX_ACTIVE_EVENTS) break;
    if (!eventEligible(state, def)) continue;
    if (nextRandom(state) >= eventChance(state, def)) continue;
    startEvent(state, def.id);
    started.push(def.id);
  }
  return started;
}

/** 매일: 끝난 이벤트를 치우고 eventEnd 알림. 끝난 id 목록. */
export function dailyBigEvents(state: GameState): string[] {
  const today = dayIndex(state.clock);
  const ended = state.events.filter((e) => e.endsDay <= today);
  if (ended.length === 0) return [];
  state.events = state.events.filter((e) => e.endsDay > today);
  for (const e of ended) {
    const def = bigEventDef(e.id);
    state.alerts.push({ type: 'eventEnd', id: e.id });
    pushNotice(state, def.endDialogue ?? `${josa(def.title, '이/가')} 끝났어요`);
  }
  return ended.map((e) => e.id);
}

/** 매 시간: 특별 손님이 있는 활성 이벤트는 발동 다음 날 정오에 한 번 본점에 온다 (자리가 없으면 다음 시간에 다시). 온 손님 id 목록. */
export function hourlyBigEvents(state: GameState): string[] {
  const out: string[] = [];
  const today = dayIndex(state.clock);
  for (const e of activeEvents(state)) {
    if (e.specialVisited || state.clock.hour < SPECIAL_GUEST_HOUR) continue;
    const def = bigEventDef(e.id);
    if (!def.effects.specialGuest || (today === e.startDay && def.durationDays > 1)) continue;
    const id = specialGuestId(e.id);
    if (!spawnNamedGuest(state, id)) continue;
    e.specialVisited = true;
    namedGuestState(state, id).met = true;
    pushNotice(state, `특별 손님 ${josa(def.effects.specialGuest.name, '이/가')} 왔어요!`);
    out.push(id);
  }
  return out;
}

/** 특별 손님(빅 이벤트)인가 — 만족하면 tip을 남긴다 (guests.ts) */
export function isSpecialGuest(namedId: string): boolean {
  return namedId.startsWith(`${SPECIAL_REGION}:`);
}
/** 특별 손님이 만족했을 때 팁 (없으면 0) */
export function specialGuestTip(namedId: string): number {
  if (!isSpecialGuest(namedId)) return 0;
  const eventId = namedId.slice(SPECIAL_REGION.length + 1);
  return bigEventDef(eventId).effects.specialGuest?.tip ?? 0;
}
/** 도감: 만난 특별 손님 id 목록 */
export function specialGuestsMet(state: GameState): string[] {
  return Object.entries(state.namedGuests).filter(([id, st]) => isSpecialGuest(id) && st.met).map(([id]) => id);
}

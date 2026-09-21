/**
 * 제주 빅 이벤트 (v3 A5): events_v3.json. 매월 1일 판정(rng) → 동시 최대 2개 → state.events에 예약(startDay) → 그날 아침 발동(즉시 효과·대화창).
 * (game-feel 감사: 판정도 발동도 1일이라 보상 사건의 2/3가 매월 1~2일에 몰렸다 → 판정(rng 소비)은 1일 그대로 두고 발동일만 달 안에 퍼뜨린다:
 *  startDay = 1일 + eventStartDelay(monthIndex, k) (0~EVENT_START_SPREAD−1, rng 없이 결정적). 예약 중(startDay > 오늘)인 이벤트는 효과·특별 손님·대화가 없다.)
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
import { monthIndex, DAYS_PER_MONTH } from './clock.ts';
import { facilityCount } from './rank.ts';
import { addEffect } from './effects.ts';
import { objectDef } from '../data/index.ts';
import { parcelAt } from './parcels.ts';
import { spawnNamedGuest } from './guests.ts';
import { namedGuestState, isWeekend } from './popup.ts';
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
  return state.events.filter((e) => (e.startDay ?? 0) <= today && e.endsDay > today); // startDay가 없는 항목(테스트 스텁)은 시작한 것으로
}
/** 예약(아직 시작 전) + 진행 중 — 자격 판정용 */
export function scheduledEvents(state: GameState): ActiveBigEvent[] {
  const today = dayIndex(state.clock);
  return state.events.filter((e) => e.endsDay > today);
}
/** 1일 판정의 동시 상한용: 지연 없이 1일에 시작했더라면 아직 안 끝났을 이벤트. 발동일 분산이 다음 달 판정 슬롯을 잡아먹어 발동 수가 줄지 않게(예약 지연은 같은 달 안이라 startDay의 달 1일 = floor(startDay/30)×30) */
export function slotEvents(state: GameState): ActiveBigEvent[] {
  const today = dayIndex(state.clock);
  return state.events.filter((e) => !isWeeklyEvent(e.id) && e.endsDay - (e.startDay - Math.floor(e.startDay / DAYS_PER_MONTH) * DAYS_PER_MONTH) > today);
}
/** 주간 미니 사건인가 (events_v3.json weekly) */
export function isWeeklyEvent(id: string): boolean {
  return bigEventDef(id).weekly === true;
}
export function isEventActive(state: GameState, id: string): boolean {
  return scheduledEvents(state).some((e) => e.id === id);
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
  if (def.weekly) return false; // 주간 미니 사건은 weeklyMiniEvent가 따로 고른다
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

/** 발동일 분산 폭 (달 안 0~EVENT_START_SPREAD−1일 뒤). 1일 판정에서 k번째로 뽑힌 이벤트의 지연일 — rng 없이 결정적.
 *  폭 20·15로도 재봤지만 3년 자금 밴드(seed 1~3)가 흔들려(₩8,144만·1.04억) 8로 확정 — 봇 KPI는 rng 흐름에 민감하다. */
export const EVENT_START_SPREAD = 8;
export function eventStartDelay(mi: number, k: number): number {
  return (mi * 3 + k * 5) % EVENT_START_SPREAD;
}

/** 이벤트를 예약/발동한다 (판정 없이): delay 0이면 오늘 바로 발동(즉시 효과 + 알림·대화창), 아니면 startDay에 dailyBigEvents가 발동한다. */
export function startEvent(state: GameState, id: string, delay = 0): ActiveBigEvent {
  const def = bigEventDef(id);
  const today = dayIndex(state.clock);
  const e: ActiveBigEvent = { id, startDay: today + delay, endsDay: today + delay + def.durationDays, specialVisited: !def.effects.specialGuest };
  state.events.push(e);
  state.eventsFired[id] = (state.eventsFired[id] ?? 0) + 1;
  if (delay === 0) applyEventStart(state, e);
  else pushNotice(state, `${def.title} 소식이 들려요 — ${delay}일 뒤`);
  return e;
}

/** 발동 당일: 즉시 효과 + 알림·대화창 */
function applyEventStart(state: GameState, e: ActiveBigEvent): void {
  const id = e.id;
  const def = bigEventDef(id);
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
    // 감귤 수확철: 운반 담당 힘 ≥ carryStrength면 harvestMultCarry
    const strong = fx.carryStrength !== undefined && staffInRole(state, 'carry').some((st) => st.stats.strength >= fx.carryStrength!);
    const mult = strong && fx.harvestMultCarry !== undefined ? fx.harvestMultCarry : fx.harvestMult;
    addEffect(state, { kind: 'harvestMult', mult, days: fx.harvestDays ?? 30, source: id });
  }
  if (fx.spawnFilter) addEffect(state, { kind: 'spawnMult', mult: fx.spawnFilter.mult, filter: fx.spawnFilter.filter, days: fx.spawnFilter.days, source: id });
  state.alerts.push({ type: 'event', id });
  pushNotice(state, `빅 이벤트: ${def.title}`);
}

/** 매월 1일: 정의 순서대로 자격·확률을 굴려 동시 2개까지 예약한다 (k번째는 eventStartDelay만큼 뒤에 발동). 예약한 id 목록. 결정적(state.rng). */
export function monthlyBigEvents(state: GameState): string[] {
  const started: string[] = [];
  const mi = monthIndex(state.clock);
  for (const def of BIG_EVENTS) {
    if (slotEvents(state).length >= MAX_ACTIVE_EVENTS) break;
    if (!eventEligible(state, def)) continue;
    if (nextRandom(state) >= eventChance(state, def)) continue;
    startEvent(state, def.id, eventStartDelay(mi, started.length));
    started.push(def.id);
  }
  return started;
}

/** 주간 미니 사건 (game-feel P1: 달 중반에 sim이 스스로 주는 사건): 토요일 아침 WEEKLY_EVENT_CHANCE로 weekly 이벤트 중 조건이 맞는 것 하나(rng)를 그날 하루 발동.
 *  빅 이벤트 동시 상한에 안 세고, 끝날 때 eventEnd 알림도 없다(하루짜리). 결정적(state.rng — 토요일에만 소비). */
export const WEEKLY_EVENT_CHANCE = 0.4;
/** 이만큼 조용했으면 이번 토요일은 확정 — 1일(무료 뽑기·월간 과제)·15일(보름 응모권)과 합쳐 sim이 주는 사건 공백이 12일을 안 넘게 */
export const WEEKLY_EVENT_FORCE_DAYS = 14;
export function weeklyMiniEvent(state: GameState): string | null {
  if (!isWeekend(state.clock.day)) return null;
  const today = dayIndex(state.clock);
  const forced = today - (state.weeklyEventDay ?? 0) >= WEEKLY_EVENT_FORCE_DAYS;
  const r = nextRandom(state); // rng 한 번: 발동 여부 + 어떤 사건인지
  if (r >= WEEKLY_EVENT_CHANCE && !forced) return null;
  const pool = BIG_EVENTS.filter((d) => d.weekly && !isEventActive(state, d.id) && (!d.condition || goalMet(state, d.condition)));
  if (pool.length === 0) return null;
  const def = pool[Math.floor((r * 1000) % pool.length)]!;
  startEvent(state, def.id, 0);
  state.weeklyEventDay = today;
  return def.id;
}

/** 매일: 예약일이 된 이벤트를 발동하고, 끝난 이벤트를 치우고 eventEnd 알림(주간 미니 사건은 알림 없이). 끝난 id 목록. */
export function dailyBigEvents(state: GameState): string[] {
  const today = dayIndex(state.clock);
  for (const e of state.events) if (e.startDay === today && e.endsDay > today) applyEventStart(state, e);
  const ended = state.events.filter((e) => e.endsDay <= today);
  if (ended.length > 0) {
    state.events = state.events.filter((e) => e.endsDay > today);
    for (const e of ended) {
      const def = bigEventDef(e.id);
      if (!def.weekly) state.alerts.push({ type: 'eventEnd', id: e.id });
      pushNotice(state, def.endDialogue ?? `${josa(def.title, '이/가')} 끝났어요`);
    }
  }
  weeklyMiniEvent(state);
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

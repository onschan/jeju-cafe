/**
 * 손님과 놀기 (재미 리셋 §4, 트랙 G): 인사·추천 액션, 손님 이름, 요청 말풍선(requests.json 30), 단골 게이지·단골 등록.
 * 결정적 — rng 대신 손님 id 해시로 고른다(스폰·주문 rng 스트림을 흔들지 않는다). 상태 필드는 전부 optional이라 옛 저장은 처음 쓸 때 채운다.
 */
import type { GameState, Guest, ApplyResult, GuestRequestDef, GuestRequest, Regular, Face } from './types.ts';
import requestsJson from '../data/requests.json' with { type: 'json' };
import { NAMES, guestTypeDef, namedGuestDef, guestTags, objectDef, menuDef, NAMED_TYPE } from '../data/index.ts';
import { dayIndex } from './effects.ts';
import { hashOf } from './say.ts';
import { addSatisfaction } from './segments.ts';
import { addAffinity } from './popup.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { parcelAt } from './parcels.ts';
import { completedCorners, cornerTags } from './corners.ts'; // 트랙 C 코너 판정
import { availableMenus } from './menu.ts';
import { menuOf, statsMatchCount, guestLikesCategory } from './craft.ts';
import { namedLikes } from './popup.ts';
import { isForeign } from './entry.ts';
import { josa } from './josa.ts';

// ---------- 상수 ----------
/** 인사: 손님당 1회, 하루 10회 (노동 방지). 만족 +1 · 이름 있는 손님 호감 +2 · 단골 게이지 +1 */
export const GREET_DAY_MAX = 10;
export const GREET_SATISFACTION = 1;
export const GREET_AFFINITY = 2;
export const GREET_GAUGE = 1;
/** 추천: 손님당 1회, 하루 10회. 취향이 맞으면 주문을 바꾸고 팁 = 낸 돈 × 20% */
export const RECOMMEND_DAY_MAX = 10;
export const RECOMMEND_TIP_RATE = 0.2;
/** 요청: 앉은 손님 20%(id 해시), 하루 3건, 진행 중 5건까지, 60일 지나면 잊는다. 들어주면 단골 게이지 +2, 첫 3회는 응모권 1 */
export const REQUEST_CHANCE_DIV = 5;
export const REQUEST_DAY_MAX = 3;
export const REQUEST_PENDING_MAX = 5;
export const REQUEST_EXPIRE_DAYS = 60;
export const REQUEST_DONE_KEEP = 5;
export const REQUEST_GAUGE = 2;
export const REQUEST_TICKET_COUNT = 3;
/** 단골 게이지 0~5: 인사 +1 · 요청 해결 +2 · 만족 방문 +0.2. 5면 그 손님층에서 한 명이 단골로 등록된다 */
export const GAUGE_MAX = 5;
export const GAUGE_HAPPY_VISIT = 0.2;
/** 단골: 매주 정한 요일·시각(9~17시)에 오고, 주문 때 팁 +20% */
export const REGULAR_TIP_RATE = 0.2;
export const REGULAR_HOUR_MIN = 9;
export const REGULAR_HOUR_SPAN = 9;

export const REQUESTS: GuestRequestDef[] = requestsJson as GuestRequestDef[];
const REQUEST_BY_ID = new Map(REQUESTS.map((r) => [r.id, r]));
export function requestDef(id: string): GuestRequestDef {
  const d = REQUEST_BY_ID.get(id);
  if (!d) throw new Error(`unknown request: ${id}`);
  return d;
}

// ---------- 하루 카운터 ----------
function today(state: GameState): number { return dayIndex(state.clock); }
/** 오늘 카운터 (날이 바뀌면 0부터) */
function dayCounters(state: GameState): { greet: number; recommend: number } {
  const d = today(state);
  if (state.greetDay !== d) { state.greetDay = d; state.greetCount = 0; state.recommendCount = 0; }
  return { greet: state.greetCount ?? 0, recommend: state.recommendCount ?? 0 };
}
/** 튜토리얼 ③ 「인사」 조건: 오늘 한 번이라도 인사했나 */
export function greetedToday(state: GameState): boolean {
  return state.greetDay === today(state) && (state.greetCount ?? 0) > 0;
}
export function greetsLeftToday(state: GameState): number {
  return Math.max(0, GREET_DAY_MAX - dayCounters(state).greet);
}

// ---------- 이름·얼굴 ----------
/** 성+이름 — id 해시로 결정. 삼춘(senior)은 옛날식 이름 풀(given 끝 10개). */
export function guestNameFor(id: string, typeId: string): string {
  const h = hashOf(id);
  const surname = NAMES.surnames[h % NAMES.surnames.length] ?? '김';
  const given = NAMES.given;
  let tags: { age: string } = { age: 'none' };
  try { tags = guestTags(typeId); } catch { /* 이름 있는 손님·모르는 타입 */ }
  const oldStart = Math.max(0, given.length - 10);
  const name = tags.age === 'senior' ? given[oldStart + ((h >>> 8) % (given.length - oldStart))] : given[(h >>> 8) % given.length];
  return `${surname}${name ?? '손님'}`;
}
/** 스폰 직후: 일반 손님에게 이름을 준다 (이름 있는 손님·단골은 자기 이름) */
export function assignGuestName(g: Guest): void {
  if (g.namedId || g.name) return;
  g.name = guestNameFor(g.id, g.type);
}
/** 단골 고정 얼굴 (seed로 결정, 손님층 얼굴과 다르게) */
export function regularFace(seed: number): Face {
  return { hair: (seed * 7) % 24, skin: seed % 3, top: (seed * 5) % 8 };
}

// ---------- 인사 ----------
const GREET_LINES = ['안녕하세요!', '어, 사장님이네!', '오늘 날씨 좋죠?', '여기 자주 와요.', '반가워요!', '고마워요, 잘 있을게요.'];
const GREET_LINES_SENIOR = ['안녕하우꽈!', '어, 사장이네게.', '오늘 날 좋다게.', '자주 오주.', '반갑수다!', '고맙수다.'];
const GREET_LINES_FOREIGN = ['👋😊', '🙂☕', '😄👍', '🌞👋', '🙏😊', '💕'];
export function greetLine(state: GameState, g: Guest, index = state.greetCount ?? 0): string {
  const pool = isForeign(g.type) ? GREET_LINES_FOREIGN : (!g.namedId && guestTags(g.type).age === 'senior') ? GREET_LINES_SENIOR : GREET_LINES;
  return pool[index % pool.length]!;
}
export function canGreet(state: GameState, guestId: string): ApplyResult {
  const g = state.guests.find((x) => x.id === guestId);
  if (!g) return { ok: false, reason: '손님이 떠났어요' };
  if (g.phase === 'leaving') return { ok: false, reason: '가는 손님이에요' };
  if (g.greeted) return { ok: false, reason: '이미 인사했어요' };
  if (dayCounters(state).greet >= GREET_DAY_MAX) return { ok: false, reason: '오늘 인사는 여기까지' };
  return { ok: true };
}
/** 호출 전 canGreet. 만족 +1(이름 있는 손님은 호감 +2)·단골 게이지 +1, 반응 대사 6종 로테이션 + 하트. 그저 그렇던 손님은 기분이 풀린다. */
export function greetGuest(state: GameState, guestId: string): string {
  const g = state.guests.find((x) => x.id === guestId)!;
  const c = dayCounters(state);
  const line = greetLine(state, g, c.greet);
  state.greetCount = c.greet + 1;
  g.greeted = true;
  if (g.namedId) addAffinity(state, g.namedId, GREET_AFFINITY);
  else {
    addSatisfaction(state, g.type, GREET_SATISFACTION);
    addRegularGauge(state, g.type, GREET_GAUGE);
  }
  if (g.mood === 'meh') { g.mood = 'happy'; g.moodReason = null; }
  g.say = line;
  pushFx(state, { kind: 'react', guestId: g.id, text: line, icon: 'heart', tick: state.tick });
  return line;
}

// ---------- 추천 ----------
export function canRecommend(state: GameState, guestId: string, menuId?: string): ApplyResult {
  const g = state.guests.find((x) => x.id === guestId);
  if (!g) return { ok: false, reason: '손님이 떠났어요' };
  if (g.phase !== 'seated' || g.mood !== null || !g.menuId) return { ok: false, reason: '주문을 기다릴 때만 돼요' };
  if (g.recommended) return { ok: false, reason: '이미 추천했어요' };
  if (dayCounters(state).recommend >= RECOMMEND_DAY_MAX) return { ok: false, reason: '오늘 추천은 여기까지' };
  if (menuId !== undefined) {
    if (menuId === g.menuId) return { ok: false, reason: '이미 그걸 시켰어요' };
    if (!availableMenus(state).includes(menuId)) return { ok: false, reason: '지금 못 만드는 메뉴예요' };
  }
  return { ok: true };
}
/** 손님이 좋아할 메뉴인가 (분류 + 취향 스탯 하나 이상) — 추천 미리 보기·판정 공용 */
export function recommendFits(state: GameState, g: Guest, menuId: string): boolean {
  const menu = menuOf(state, menuId);
  if (g.namedId) {
    const d = namedGuestDef(g.namedId);
    return guestLikesCategory(namedLikes(d), menu.category) && statsMatchCount(state, d.likesStats, menuId) > 0;
  }
  const t = guestTypeDef(g.type);
  return guestLikesCategory(t.likes, menu.category) && statsMatchCount(state, t.likesStats, menuId) > 0;
}
/** 호출 전 canRecommend. 맞으면 주문이 바뀌고(낸 돈은 그대로) 팁 20%·"오 이거!"·하트, 틀리면 "음…"·땀 (만족은 안 깎는다). */
export function recommendMenu(state: GameState, guestId: string, menuId: string): { match: boolean; tip: number } {
  const g = state.guests.find((x) => x.id === guestId)!;
  const c = dayCounters(state);
  state.recommendCount = c.recommend + 1;
  g.recommended = true;
  if (!recommendFits(state, g, menuId)) {
    g.say = '음…';
    pushFx(state, { kind: 'react', guestId: g.id, text: '음…', icon: 'sweat', tick: state.tick });
    return { match: false, tip: 0 };
  }
  const old = g.menuId!;
  state.menuSold[old] = Math.max(0, (state.menuSold[old] ?? 0) - 1);
  state.monthMenuSold[old] = Math.max(0, (state.monthMenuSold[old] ?? 0) - 1);
  g.menuId = menuId;
  state.menuSold[menuId] = (state.menuSold[menuId] ?? 0) + 1;
  state.monthMenuSold[menuId] = (state.monthMenuSold[menuId] ?? 0) + 1;
  const tip = Math.round(g.paid * RECOMMEND_TIP_RATE);
  if (tip > 0) {
    state.money += tip;
    state.monthIncome += tip;
    state.totalIncome += tip;
    pushFx(state, { kind: 'pop', x: Math.round(g.x), y: Math.round(g.y), n: tip, tick: state.tick });
  }
  g.say = '오 이거!';
  pushFx(state, { kind: 'react', guestId: g.id, text: '오 이거!', icon: 'heart', tick: state.tick });
  return { match: true, tip };
}

// ---------- 요청 ----------
function requestList(state: GameState): GuestRequest[] { return (state.requests ??= []); }
export function pendingRequests(state: GameState): GuestRequest[] { return requestList(state).filter((r) => !r.done); }
export function doneRequests(state: GameState): GuestRequest[] { return requestList(state).filter((r) => r.done); }

/** 소유 필지에 완공된 그 시설이 있나 */
function hasFacility(state: GameState, type: string): boolean {
  for (const o of Object.values(state.objects)) if (o.type === type && !o.build && parcelAt(state, o.x, o.y)?.owned) return true;
  return false;
}
/** 요청을 들어줬나: 메뉴 → 메뉴판에 있다, 코너 → 트랙 C completedCorners(코너가 있으면 코너 우선, 없으면 대체 시설), 시설 → 소유 필지에 완공 */
export function isRequestMet(state: GameState, def: GuestRequestDef): boolean {
  const w = def.want;
  if (w.menu) return state.menuSlots.includes(w.menu);
  const corners = completedCorners(state);
  if (w.corner && corners.some((c) => c.id === w.corner)) return true;
  if (w.tagCorner && corners.some((c) => cornerTags(c.id).includes(w.tagCorner!))) return true;
  return w.facility ? hasFacility(state, w.facility) : false;
}
/** 카드의 「들어주기 힌트」: 어느 탭에 있는지 한 줄 (≤22자) */
export function requestHint(def: GuestRequestDef): string {
  const w = def.want;
  if (w.menu) { try { return `메뉴판에 ${menuDef(w.menu).name}`; } catch { return '메뉴판에 올리면 돼요'; } }
  if (w.corner || w.tagCorner) return '짓기 창 코너 탭에 있어요';
  if (w.facility) { try { return `짓기 창에 ${objectDef(w.facility).name}`; } catch { return '짓기 창에 있어요'; } }
  return '';
}
/** 지운다: 60일 넘은 진행 중 요청, 들어준 요청은 최근 5개만 */
function pruneRequests(state: GameState): void {
  const d = today(state);
  const list = requestList(state);
  const kept = list.filter((r) => r.done || d - r.day <= REQUEST_EXPIRE_DAYS);
  const done = kept.filter((r) => r.done);
  const drop = new Set(done.slice(0, Math.max(0, done.length - REQUEST_DONE_KEEP)));
  state.requests = kept.filter((r) => !drop.has(r));
}
/** 자리에 앉는 순간: 20%(id 해시)가 아직 안 들어준 요청 하나를 한다 (하루 3건·진행 중 5건·손님층당 1건). 요청했으면 그 정의. */
export function maybeRequest(state: GameState, g: Guest): GuestRequestDef | null {
  if (g.namedId || g.regularId || g.type === NAMED_TYPE) return null;
  const h = hashOf(`req:${g.id}`);
  if (h % REQUEST_CHANCE_DIV !== 0) return null;
  pruneRequests(state);
  const d = today(state);
  const pending = pendingRequests(state);
  if (pending.length >= REQUEST_PENDING_MAX) return null;
  if (requestList(state).filter((r) => r.day === d).length >= REQUEST_DAY_MAX) return null;
  if (pending.some((r) => r.guestType === g.type)) return null;
  const used = new Set(requestList(state).map((r) => r.id));
  const candidates = REQUESTS.filter((r) => !used.has(r.id) && !isRequestMet(state, r));
  const def = candidates[(h >>> 4) % candidates.length];
  if (!def) return null;
  requestList(state).push({ id: def.id, guestType: g.type, day: d, done: false });
  g.requestId = def.id;
  g.say = def.text;
  pushFx(state, { kind: 'react', guestId: g.id, text: def.text, icon: 'question', tick: state.tick });
  return def;
}
/** 자리에 앉는 순간: 이 손님층이 바랐던 걸 들어줬으면 "고마워요" + 단골 게이지 +2 + 응모권(첫 3회). 고마워한 요청 정의. */
export function thankIfDone(state: GameState, g: Guest): GuestRequestDef | null {
  if (g.namedId || g.type === NAMED_TYPE) return null;
  const r = pendingRequests(state).find((x) => x.guestType === g.type && isRequestMet(state, requestDef(x.id)));
  if (!r) return null;
  const def = requestDef(r.id);
  r.done = true;
  addRegularGauge(state, g.type, REQUEST_GAUGE);
  state.requestThanks = (state.requestThanks ?? 0) + 1;
  const ticket = state.requestThanks <= REQUEST_TICKET_COUNT;
  if (ticket) state.tickets += 1;
  g.say = def.thanks;
  pushFx(state, { kind: 'react', guestId: g.id, text: def.thanks, icon: 'heart', tick: state.tick });
  pushNotice(state, `${g.name ?? guestTypeDef(g.type).name}: 「${def.thanks}」${ticket ? ' 응모권 +1' : ''}`);
  pruneRequests(state);
  return def;
}

// ---------- 단골 게이지·등록 ----------
function gauges(state: GameState): Record<string, number> { return (state.regularsGauge ??= {}); }
function regularList(state: GameState): Regular[] { return (state.regulars ??= []); }
export function regularGauge(state: GameState, typeId: string): number {
  return Math.min(GAUGE_MAX, gauges(state)[typeId] ?? 0);
}
/** 카드 하트 5칸: 찬 칸 수 (게이지 내림) */
export function regularHearts(state: GameState, typeId: string): number {
  return Math.floor(regularGauge(state, typeId) + 1e-9);
}
export function regularOf(state: GameState, typeId: string): Regular | null {
  return regularList(state).find((r) => r.guestType === typeId) ?? null;
}
export function regularById(state: GameState, id: string): Regular | null {
  return regularList(state).find((r) => r.id === id) ?? null;
}
/** 게이지를 더한다. 이미 단골이 있는 손님층은 5에서 멈춘다. 5가 되면 단골 등록. */
export function addRegularGauge(state: GameState, typeId: string, delta: number): void {
  if (typeId === NAMED_TYPE) return;
  const gg = gauges(state);
  if (regularOf(state, typeId)) { gg[typeId] = GAUGE_MAX; return; }
  const v = Math.max(0, Math.min(GAUGE_MAX, (gg[typeId] ?? 0) + delta));
  gg[typeId] = Math.round(v * 10) / 10;
  if (gg[typeId]! >= GAUGE_MAX - 1e-9) registerRegular(state, typeId);
}
/** 단골 등록: 이름·얼굴 seed 고정, 도감, 매주 방문. 장면 창 + 알림. */
export function registerRegular(state: GameState, typeId: string): Regular {
  const id = `r${state.nextId++}`;
  const name = guestNameFor(id, typeId);
  const r: Regular = { id, guestType: typeId, name, seed: hashOf(id) % 1000, day: today(state) };
  regularList(state).push(r);
  gauges(state)[typeId] = GAUGE_MAX;
  const typeName = guestTypeDef(typeId).name;
  pushNotice(state, `${josa(name, '이/가')} 단골이 됐어요 — 매주 와요`);
  pushFx(state, { kind: 'scene', title: '단골이 생겼다', text: `${name}(${typeName}) — 매주 오고 팁을 더 내요`, tick: state.tick });
  return r;
}
/** 단골 방문 요일(day % 7)·시각 — id 해시로 결정 */
export function regularVisitSlot(r: Regular): { weekday: number; hour: number } {
  const h = hashOf(`visit:${r.id}`);
  return { weekday: h % 7, hour: REGULAR_HOUR_MIN + ((h >>> 3) % REGULAR_HOUR_SPAN) };
}
/** 지금 시각에 와야 하는 단골 (아직 안 와 있는) */
export function regularsDue(state: GameState): Regular[] {
  const present = new Set(state.guests.map((g) => g.regularId).filter((x): x is string => !!x));
  return regularList(state).filter((r) => {
    const slot = regularVisitSlot(r);
    return state.clock.day % 7 === slot.weekday && state.clock.hour === slot.hour && !present.has(r.id);
  });
}
/** 스폰된 손님을 단골로 꾸민다: 이름·얼굴 고정, "OO 왔다!" 메시지 + 손 흔들기 */
export function dressAsRegular(state: GameState, g: Guest, r: Regular): void {
  g.regularId = r.id;
  g.name = r.name;
  g.faceSeed = r.seed;
  pushNotice(state, `${r.name} 왔다!`);
  pushFx(state, { kind: 'react', guestId: g.id, text: '또 왔어요!', icon: 'wave', tick: state.tick });
}
/** 주문 때 단골 팁 (낸 돈 × 20%) */
export function regularTip(g: Guest, price: number): number {
  return g.regularId ? Math.round(price * REGULAR_TIP_RATE) : 0;
}

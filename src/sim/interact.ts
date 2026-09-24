/**
 * 손님과 놀기 (재미 리셋 §4, 트랙 G): 손님 이름, 요청 말풍선(requests.json 30), 단골 게이지·단골 등록.
 * 결정적 — rng 대신 손님 id 해시로 고른다(스폰·주문 rng 스트림을 흔들지 않는다). 상태 필드는 전부 optional이라 옛 저장은 처음 쓸 때 채운다.
 *
 * rush-battle §3·§6: **인사(greetGuest)·추천(recommendMenu)은 삭제**했다. 손님과의 상호작용은 러시 중 자리 배정·주문 처리로 대체하고,
 * 단골 게이지는 **러시 성적(rush.ts)과 요청 해결**로만 찬다.
 */
import type { GameState, Guest, GuestRequestDef, GuestRequest, Regular, Face } from './types.ts';
import requestsJson from '../data/requests.json' with { type: 'json' };
import { NAMES, guestTypeDef, guestTags, objectDef, menuDef, NAMED_TYPE } from '../data/index.ts';
import { dayIndex } from './effects.ts';
import { hashOf } from './say.ts';
import { regularVisitEveryOtherWeek } from './reputation.ts'; // stakes: 평판 < 50이면 단골이 2주에 한 번
import { pushNotice, roleHeads } from './staff.ts'; // staff2: 홀 직원이 많을수록 손님 부탁을 더 잘 듣는다
import { pushFx } from './fx.ts';
import { parcelAt } from './parcels.ts';
import { completedCorners, cornerTags } from './corners.ts'; // 트랙 C 명당 판정
import { josa } from './josa.ts';

// ---------- 상수 ----------
/** 요청: 앉은 손님 20%(id 해시), 하루 3건, 진행 중 5건까지, 60일 지나면 잊는다. 들어주면 단골 게이지 +2, 첫 3회는 응모권 1 */
export const REQUEST_CHANCE_DIV = 5;
/** staff2: 홀 직원이 손님 말을 듣는다 — 1인분당 나누는 수 −1 (5 → 4 → 3 = 20% → 25% → 33%) */
export const REQUEST_DIV_MIN = 3;
export function requestChanceDiv(state: GameState): number {
  return Math.max(REQUEST_DIV_MIN, REQUEST_CHANCE_DIV - Math.floor(roleHeads(state, 'hall')));
}
export const REQUEST_DAY_MAX = 3;
export const REQUEST_PENDING_MAX = 5;
export const REQUEST_EXPIRE_DAYS = 60;
export const REQUEST_DONE_KEEP = 5;
export const REQUEST_GAUGE = 2;
export const REQUEST_TICKET_COUNT = 3;
/** 단골 게이지 0~5: 요청 해결 +2 · 만족 방문 +0.2 · 러시에서 받은 손님 +0.2(등급 보너스는 rush.ts). 5면 그 손님층에서 한 명이 단골로 등록된다 */
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

// ---------- 요청 ----------
function requestList(state: GameState): GuestRequest[] { return (state.requests ??= []); }
export function pendingRequests(state: GameState): GuestRequest[] { return requestList(state).filter((r) => !r.done); }
export function doneRequests(state: GameState): GuestRequest[] { return requestList(state).filter((r) => r.done); }

/** 소유 필지에 완공된 그 시설이 있나 */
function hasFacility(state: GameState, type: string): boolean {
  for (const o of Object.values(state.objects)) if (o.type === type && !o.build && parcelAt(state, o.x, o.y)?.owned) return true;
  return false;
}
/** 요청을 들어줬나: 메뉴 → 메뉴판에 있다, 명당 → 트랙 C completedCorners(명당이 있으면 명당 우선, 없으면 대체 시설), 시설 → 소유 필지에 완공 */
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
  if (w.corner || w.tagCorner) return '짓기 창 명당 탭에 있어요';
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
  if (h % requestChanceDiv(state) !== 0) return null; // staff2: 홀 직원이 많으면 더 자주 듣는다
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
export function regularList(state: GameState): Regular[] { return (state.regulars ??= []); }
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
/** 단골 수 (엔딩 점수·목표) */
export function regularCount(state: GameState): number {
  return regularList(state).length;
}
/** 단골 하나가 발길을 끊는다 (평판이 낮을 때). 게이지도 같이 내린다. */
export function forgetRegular(state: GameState, id: string): Regular | null {
  const list = regularList(state);
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const [r] = list.splice(i, 1);
  if (r) gauges(state)[r.guestType] = 0;
  return r ?? null;
}
/** 단골 방문 요일(day % 7)·시각 — id 해시로 결정 */
export function regularVisitSlot(r: Regular): { weekday: number; hour: number } {
  const h = hashOf(`visit:${r.id}`);
  return { weekday: h % 7, hour: REGULAR_HOUR_MIN + ((h >>> 3) % REGULAR_HOUR_SPAN) };
}
/** 지금 시각에 와야 하는 단골 (아직 안 와 있는) */
export function regularsDue(state: GameState): Regular[] {
  const present = new Set(state.guests.map((g) => g.regularId).filter((x): x is string => !!x));
  const slow = regularVisitEveryOtherWeek(state); // stakes: 평판 < 50이면 2주에 한 번
  const week = Math.floor(dayIndex(state.clock) / 7);
  return regularList(state).filter((r) => {
    const slot = regularVisitSlot(r);
    if (slow && week % 2 !== hashOf(`week:${r.id}`) % 2) return false;
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

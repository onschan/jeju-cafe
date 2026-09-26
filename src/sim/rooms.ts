/**
 * 본관(카페 건물)과 마당 잇기.
 * zero-base(specs/2026-09-26-zero-base-start.md): 본관(`warehouse`)은 **지붕 없는 진짜 카페**다 — 타일 바닥·뒷벽 카운터·창.
 * - 안에도 자리를 놓는다 (grid.ts indoorPlaceable·indoorRouteCheck). 실내는 바닥 재질일 뿐 규칙은 마당과 같다(fee.ts → 등급).
 * - 증축 Lv1 4×3 → Lv2 5×3 → Lv3 6×4 (MAIN_SIZES). 5일 공사, 그동안 실내는 못 쓴다. 발자국은 오른쪽·아래로 커진다 —
 *   새 문 앞을 막은 것은 치우고 올렛길을 자동으로 잇는다.
 * - 2층·별관·본관 이사는 없다.
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, PlacedObject, ApplyResult, MainState, Guest, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { cellAt, objectAt, doorOf, doorFrontOf, footprint, footprintOf, canPlaceMain, canPlace, placeObject, removeObject, inBounds, occupy, vacate, roomAt, isFixedCell, objectsInRoom } from './grid.ts';
import { dayIndex } from './effects.ts';
import { fmtNum } from './format.ts';
import { isDoorReachable, isWalkable, reachMap, busStopPos, cellKey } from './path.ts';
import { HOUR_MS } from './clock.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { seatsOf } from './cafe.ts';
import { guestHasTag } from './events.ts';
import { layoutSig } from './layoutRev.ts';
import { josa } from './josa.ts';
import { parcelAt } from './parcels.ts';

// ---------- 상수 ----------

export const MAIN_TYPE = 'warehouse';
export const MAIN_MAX_LEVEL = 3;
/** 증축 단계별 발자국 (스프라이트 iso_obj_warehouse · _lv2 · _lv3) */
export const MAIN_SIZES: Record<number, { w: number; h: number }> = { 1: { w: 4, h: 3 }, 2: { w: 5, h: 3 }, 3: { w: 6, h: 4 } };
/** Lv1 발자국 — 새 본관을 지을 때·시작 배치 */
export const MAIN_SIZE: { w: number; h: number } = MAIN_SIZES[1]!;
/** 증축 비용 (다음 Lv 기준) · 공사 일수 */
export const MAIN_EXPAND_COST: Record<number, number> = { 2: 3_000_000, 3: 8_000_000 };
export const MAIN_EXPAND_DAYS = 5;
/** 첫 본관은 무료·즉시 완공 (w-start 맨땅 튜토리얼 2단계) */
export const MAIN_BUILD_COST = 0;
/** 본관 추천 자리(tutorial.ts recommendedMainCells): 문 앞 칸이 정낭에서 체비쇼프 거리 ≤ 5 인 자리 중 바람 적은 순 상위 3 (튜토리얼 2단계 글로우) */
export const MAIN_RECOMMEND_GATE_DIST = 5;
export const MAIN_RECOMMEND_N = 3;

/** 조명 따뜻 저녁 체류 +10% */
export const WARM_EVENING_STAY = 0.1;
/** BGM: 잔잔 senior / 재즈 adult(커플) / 민요 foreign·family +5%, 조명 밝게 youth +5% */
export const BGM_MULT = 1.05;
export const LIGHT_YOUTH_MULT = 1.05;
export const EVENING_HOUR = 18;
/** 체류: 좌석 기본(guests.ts SEAT_MS = 1.5시간) + 순회 시설당 +8분, 시설 3개 초과 시 둘러보기 확률 상승.
 *  pace: 1시간의 ms는 clock.HOUR_MS 하나만 본다 — 시계 속도를 바꿔도 「+8분」이 8분인 채로 남는다. */
export const MS_PER_HOUR = HOUR_MS;
export const STAY_PER_FACILITY_MS = Math.round((8 / 60) * MS_PER_HOUR);
export const STAY_FACILITY_CAP = 6;
export const BROWSE_FACILITIES = 3;
export const BROWSE_CHANCE_PER_FACILITY = 0.05;
export const BROWSE_CHANCE_CAP = 0.7;
/** 좌석 이용률: 80% 초과 3일 연속 → "자리가 모자라요" */
export const SEAT_FULL_PCT = 80;
export const SEAT_FULL_DAYS = 3;
export const SEAT_LOG_DAYS = 7;
export const SEAT_FULL_TEXT = '자리가 모자라요 — 마당에 자리를 더 놓거나 필지를 넓혀요';
export const DOOR_PATH_WARN = '문 앞에 올렛길을 이어 주세요';
export const CUT_TEXT = '길 끊김 ✕';

export function initMain(): MainState {
  return { level: 1, bgm: null, lighting: 'warm', seatLog: [], usedSeatMs: 0, openMs: 0 };
}

// ---------- 본관 찾기·크기 ----------

export function mainBuilding(state: GameState): PlacedObject | null {
  return Object.values(state.objects).find((o) => o.type === MAIN_TYPE) ?? null;
}
export function mainLevel(state: GameState): number {
  return state.main?.level ?? 1;
}
export function mainSize(state: GameState): { w: number; h: number } {
  return MAIN_SIZES[mainLevel(state)] ?? MAIN_SIZE;
}
/** 본관 공사 중(증축)인가 — 그동안 실내 자리는 못 쓴다 */
export function isMainClosed(state: GameState): boolean {
  return !!mainBuilding(state)?.build;
}

// ---------- 실내 칸·좌석 (zero-base) ----------

export function isIndoorCell(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && cellAt(state, x, y).roomId !== null;
}
export function isIndoorSeat(state: GameState, seat: PlacedObject): boolean {
  return cellAt(state, seat.x, seat.y).roomId !== null;
}
/** 실내 좌석 정원 (공사 중인 방 제외) */
export function indoorSeats(state: GameState): number {
  return Object.values(state.objects).filter((o) => objectDef(o.type).kind === 'seat' && !o.build && isIndoorSeat(state, o) && !roomAt(state, o.x, o.y)?.build).reduce((n, o) => n + seatsOf(state, o), 0);
}
/** 가구를 놓을 수 있는 빈 바닥 칸 (문 칸·카운터 칸 제외) */
export function freeFloorCells(state: GameState, room: PlacedObject): Pt[] {
  const door = doorOf(room);
  return footprintOf(room).filter((p) => { const c = cellAt(state, p.x, p.y); return c.objectId === room.id && !(p.x === door.x && p.y === door.y) && !isFixedCell(state, p.x, p.y); });
}

// ---------- 증축 ----------

export function nextMainLevel(state: GameState): number | null {
  const lv = mainLevel(state);
  return lv >= MAIN_MAX_LEVEL ? null : lv + 1;
}
export function expandCost(state: GameState): number {
  const next = nextMainLevel(state);
  return next ? MAIN_EXPAND_COST[next] ?? 0 : 0;
}
/** 확장될 칸(현재 발자국 밖) 미리보기 */
export function expandCells(state: GameState): Pt[] {
  const m = mainBuilding(state);
  const next = nextMainLevel(state);
  if (!m || !next) return [];
  const cur = new Set(footprintOf(m).map((p) => `${p.x},${p.y}`));
  const size = MAIN_SIZES[next]!;
  return footprint(MAIN_TYPE, m.x, m.y, size.w, size.h).filter((p) => !cur.has(`${p.x},${p.y}`));
}
export function canExpandMain(state: GameState): ApplyResult {
  const m = mainBuilding(state);
  if (!m) return { ok: false, reason: '본관이 없어요' };
  const next = nextMainLevel(state);
  if (!next) return { ok: false, reason: '이미 제일 큰 카페예요' };
  if (m.build) return { ok: false, reason: '공사 중이에요' };
  const cost = MAIN_EXPAND_COST[next]!;
  if (state.money < cost) return { ok: false, reason: '돈이 모자라요' };
  const size = MAIN_SIZES[next]!;
  const c = canPlaceMain(state, m.x, m.y, size.w, size.h, m.id);
  if (!c.ok) return c;
  return { ok: true };
}
/** 검사 없이 증축을 시작한다 (MAIN_EXPAND_DAYS일 공사, 그동안 실내는 못 쓴다). 호출 전 canExpandMain. */
export function expandMain(state: GameState): void {
  const m = mainBuilding(state)!;
  const next = nextMainLevel(state)!;
  const size = MAIN_SIZES[next]!;
  state.money -= MAIN_EXPAND_COST[next]!;
  clearPaths(state, footprint(MAIN_TYPE, m.x, m.y, size.w, size.h), m.id);
  // 발자국을 바로 넓힌다 (안의 가구는 그대로). 공사가 끝날 때까지 안엔 못 들어간다.
  for (const g of state.guests) if (g.seatId && isIndoorSeat(state, state.objects[g.seatId] ?? { x: -1, y: -1 } as PlacedObject) && g.phase !== 'leaving') { g.seatId = null; g.phase = 'leaving'; g.path = []; } // 안에 앉은 손님은 돌려보낸다
  vacate(state, m);
  m.w = size.w; m.h = size.h;
  occupy(state, m);
  reoccupyFurniture(state, m);
  state.main.level = next;
  m.build = { doneDay: dayIndex(state.clock) + MAIN_EXPAND_DAYS, days: MAIN_EXPAND_DAYS };
  clearDoorFront(state, m); // 커진 본관의 새 문 앞을 막은 시설은 치운다 (막히면 올렛길도 못 잇는다)
  const warn = noticeAutoConnect(state, autoConnectDoor(state, m));
  pushNotice(state, `카페 증축 Lv${next} 공사 시작 (${MAIN_EXPAND_DAYS}일·₩${fmtNum(MAIN_EXPAND_COST[next]!)})${warn}`);
}
/** 방을 다시 새긴 뒤 안의 가구 칸(objectId)을 되살린다 (occupy(room)가 바닥 전체를 방 id로 덮기 때문) */
function reoccupyFurniture(state: GameState, room: PlacedObject): void {
  for (const o of objectsInRoom(state, room.id)) for (const p of footprintOf(o)) cellAt(state, p.x, p.y).objectId = o.id;
}
/** 증축 직후: 새 문 앞 한 칸을 비운다. 치운 것의 이름 (없으면 null). */
function clearDoorFront(state: GameState, room: PlacedObject): string | null {
  const f = doorFrontOf(room);
  if (!inBounds(state, f.x, f.y)) return null;
  const o = objectAt(state, f.x, f.y);
  if (!o || o.id === room.id) return null;
  const def = objectDef(o.type);
  if (def.kind === 'path' || DOOR_FRONT_KEEP.has(o.type)) return null;
  for (const g of state.guests) if (g.seatId === o.id) { g.seatId = null; g.phase = 'leaving'; g.path = []; } // 치우는 자리에 매인 손님은 돌려보낸다
  removeObject(state, o.id);
  state.money += def.cost;
  pushNotice(state, `문 앞에 있던 ${josa(o.name ?? def.name, '을/를')} 치우고 값을 돌려줬어요`);
  return o.name ?? def.name;
}
/** 문 앞에서도 못 치우는 것 */
const DOOR_FRONT_KEEP = new Set(['busstop', 'warehouse', 'spring']);
/** 증축 직후: 자동 연결 결과를 알림 한 줄로 */
function noticeAutoConnect(state: GameState, r: ReturnType<typeof autoConnectDoor>): string {
  if (r.laid > 0) { pushNotice(state, `문 앞까지 올렛길 ${r.laid}칸을 자동으로 이었어요 (₩${fmtNum(r.cost)})`); return ''; }
  if (r.need > 0) return ` — ${DOOR_PATH_WARN} (₩${fmtNum(r.need)} 필요)`;
  if (r.blocked) return ` — 문 앞에 ${josa(r.blocked, '이/가')} 있어요. 치우면 올렛길을 이어요`;
  if (r.route === null) return ` — ${DOOR_PATH_WARN}`;
  return '';
}
/** 본관 문 앞 칸 (직원 대기·주방 거리 원점). 본관이 없으면 null. */
export function mainDoorFront(state: GameState): Pt | null {
  const m = mainBuilding(state);
  return m ? doorFrontOf(m) : null;
}

// ---------- 본관 짓기 (w-start: 맨땅 튜토리얼 — 첫 본관은 플레이어가 자리를 골라 짓는다) ----------

/** 본관을 (x,y)에 지을 수 있나: 아직 본관이 없고, 3×2 발자국이 전부 내 필지 흙이고(올렛길은 걷어낸다), 문 앞 칸이 내 필지 안. */
export function canBuildMain(state: GameState, x: number, y: number): ApplyResult {
  if (mainBuilding(state)) return { ok: false, reason: '이미 본관이 있어요' };
  const c = canPlaceMain(state, x, y, MAIN_SIZE.w, MAIN_SIZE.h);
  if (!c.ok) return c;
  const f = doorFrontOf({ type: MAIN_TYPE, x, y, w: MAIN_SIZE.w, h: MAIN_SIZE.h });
  if (!parcelAt(state, f.x, f.y)?.owned) return { ok: false, reason: '문 앞이 내 땅이어야 해요' };
  if (cellAt(state, f.x, f.y).terrain === 'road') return { ok: false, reason: '문 앞이 마을 길이면 안 돼요' };
  return { ok: true };
}
/** 검사 없이 짓는다 (무료·즉시 완공·공사 없음). 발자국 안 올렛길은 걷어내 환불. 길은 잇지 않는다 — 튜토리얼 4단계에서 직접 잇는다. 호출 전 canBuildMain. */
export function placeMain(state: GameState, x: number, y: number): PlacedObject {
  clearPaths(state, footprint(MAIN_TYPE, x, y, MAIN_SIZE.w, MAIN_SIZE.h), '');
  state.money -= MAIN_BUILD_COST;
  const m = placeObject(state, MAIN_TYPE, x, y);
  pushFx(state, { kind: 'complete', x: m.x, y: m.y, tick: state.tick });
  pushNotice(state, `카페 본관을 지었어요 — ${DOOR_PATH_WARN}`);
  return m;
}

// ---------- 길 끊김 ----------

/** 방(본관)의 문 앞이 정류장과 올렛길로 안 이어졌으면 true → 카드 "길 끊김 ✕" 빨간 줄 */
export function isRoomCut(state: GameState, room: PlacedObject): boolean {
  if (room.build) return false; // 공사 중엔 경고 안 함
  return !isDoorReachable(state, room);
}
/** 길이 끊긴 방들 (메시지 줄용) */
export function cutRooms(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => o.type === MAIN_TYPE && isRoomCut(state, o));
}

// ---------- 올렛길 자동 잇기 ----------

/** 발자국 안의 올렛길을 걷어내고 환불한다 */
function clearPaths(state: GameState, cells: Pt[], ignoreId: string): number {
  let refund = 0;
  for (const p of cells) {
    const o = objectAt(state, p.x, p.y);
    if (!o || o.id === ignoreId) continue;
    if (objectDef(o.type).kind === 'path') { refund += objectDef(o.type).cost; removeObject(state, o.id); }
  }
  state.money += refund;
  return refund;
}
/** 올렛길 한 칸 가격 (자동 연결 비용) */
export const AUTO_PATH_TYPE = 'path';
export function autoPathCellCost(): number { return objectDef(AUTO_PATH_TYPE).cost; }
/** 새 문 앞 칸까지 기존 길(정류장에서 닿는 칸)에서 가장 짧은 올렛길을 자동으로 잇는다.
 *  빈 흙(길을 놓을 수 있는 칸)만 지나며, 이미 있는 길은 그대로 쓴다. 돈이 모자라면 놓지 않고 필요한 칸 수·금액만 돌려준다. */
export interface AutoRoute {
  /** 문 앞→정류장과 이어진 첫 칸까지의 경로 (이미 이어져 있으면 [], 이을 길이 없으면 null) */
  route: Pt[] | null;
  /** 새로 놓아야 하는 빈 칸 (route 중 걷지 못하는 칸) */
  empty: Pt[];
  /** 놓는 데 드는 돈 */
  cost: number;
  /** 문 앞을 막은 시설 이름 */
  blocked?: string;
}
/** 자동 잇기 경로만 계산한다 (놓지 않음, ease 「마을 길까지 자동 잇기」 미리보기용): 문 앞에서 BFS — 정류장과 이어진 첫 칸을 만나면 그 경로가 최단. */
export function autoConnectRoute(state: GameState, room: PlacedObject): AutoRoute {
  const f = doorFrontOf(room);
  if (!inBounds(state, f.x, f.y)) return { route: null, empty: [], cost: 0 };
  if (isDoorReachable(state, room)) return { route: [], empty: [], cost: 0 };
  const front = objectAt(state, f.x, f.y);
  if (front && front.id !== room.id && objectDef(front.type).kind !== 'path') return { route: null, empty: [], cost: 0, blocked: objectDef(front.type).name }; // 문 앞에 시설이 있으면 못 잇는다
  return autoConnectFrom(state, f);
}
/** 칸 f에서 정류장과 이어진 첫 칸까지 최단 올렛길 (fun P0: 경로 시설 앞 칸 「자동 잇기」도 이걸 쓴다). f가 이미 이어져 있으면 route []. */
export function autoConnectFrom(state: GameState, f: Pt): AutoRoute {
  const reach = reachMap(state, busStopPos(state)).dist;
  const connected = (p: Pt) => isWalkable(state, p.x, p.y) && reach.has(cellKey(state, p));
  if (connected(f)) return { route: [], empty: [], cost: 0 };
  const passable = (p: Pt) => inBounds(state, p.x, p.y) && cellAt(state, p.x, p.y).roomId === null
    && (isWalkable(state, p.x, p.y) || canPlace(state, AUTO_PATH_TYPE, p.x, p.y).ok);
  if (!passable(f)) return { route: null, empty: [], cost: 0 };
  // f에서 BFS — 정류장과 이어진 첫 칸을 만나면 그 경로가 최단
  const prev = new Map<number, number>();
  const queue: Pt[] = [f];
  prev.set(cellKey(state, f), -1);
  let goal: Pt | null = null;
  for (let i = 0; i < queue.length && !goal; i++) {
    const p = queue[i]!;
    for (const d of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      const nk = cellKey(state, n);
      if (prev.has(nk) || !passable(n)) continue;
      prev.set(nk, cellKey(state, p));
      if (connected(n)) { goal = n; break; }
      queue.push(n);
    }
  }
  if (!goal) return { route: null, empty: [], cost: 0 };
  const route: Pt[] = [];
  for (let k: number = cellKey(state, goal); k !== -1; k = prev.get(k)!) route.push({ x: k % state.grid.w, y: Math.floor(k / state.grid.w) });
  const empty = route.filter((p) => !isWalkable(state, p.x, p.y));
  return { route, empty, cost: empty.length * autoPathCellCost() };
}
export function autoConnectDoor(state: GameState, room: PlacedObject): { laid: number; cost: number; need: number; route: Pt[] | null; blocked?: string } {
  const r = autoConnectRoute(state, room);
  if (r.route === null) return { laid: 0, cost: 0, need: 0, route: null, ...(r.blocked ? { blocked: r.blocked } : {}) };
  if (r.route.length === 0) return { laid: 0, cost: 0, need: 0, route: [] };
  if (state.money < r.cost) return { laid: 0, cost: 0, need: r.cost, route: r.route };
  for (const p of r.empty) placeObject(state, AUTO_PATH_TYPE, p.x, p.y);
  state.money -= r.cost;
  return { laid: r.empty.length, cost: r.cost, need: 0, route: r.route };
}
/** ease 「마을 길까지 자동 잇기」 (본관·정류장 카드 버튼): 미리보기 뒤 ✓ — 놓은 칸은 되돌리기 1회로 전부. */
export function canAutoConnectPath(state: GameState): ApplyResult & { route?: AutoRoute } {
  const m = mainBuilding(state);
  if (!m) return { ok: false, reason: '본관이 없어요' };
  const r = autoConnectRoute(state, m);
  if (r.route === null) return { ok: false, reason: r.blocked ? `문 앞에 ${josa(r.blocked, '이/가')} 있어요` : '이을 길이 없어요', route: r };
  if (r.route.length === 0 || r.empty.length === 0) return { ok: false, reason: '이미 이어져 있어요', route: r };
  if (state.money < r.cost) return { ok: false, reason: '돈이 모자라요', route: r };
  return { ok: true, route: r };
}
/** 호출 전 canAutoConnectPath. 놓은 올렛길 목록을 돌려준다. */
export function autoConnectPath(state: GameState): PlacedObject[] {
  const r = canAutoConnectPath(state).route!;
  const placed: PlacedObject[] = [];
  for (const p of r.empty) placed.push(placeObject(state, AUTO_PATH_TYPE, p.x, p.y));
  state.money -= r.cost;
  return placed;
}

// ---------- 매일·매 스텝 (tick 훅) ----------

/** 매일 아침: 어제 좌석 이용률 기록 */
export function dailyRooms(state: GameState): void {
  if (state.main.openMs > 0) {
    const pct = Math.round((state.main.usedSeatMs / state.main.openMs) * 100);
    state.main.seatLog.push(pct);
    if (state.main.seatLog.length > SEAT_LOG_DAYS) state.main.seatLog.splice(0, state.main.seatLog.length - SEAT_LOG_DAYS);
    const log = state.main.seatLog;
    const before = log[log.length - SEAT_FULL_DAYS - 1];
    if (seatsShort(state) && (before === undefined || before <= SEAT_FULL_PCT)) pushNotice(state, SEAT_FULL_TEXT); // 3일째 되는 날 한 번
  }
  state.main.usedSeatMs = 0;
  state.main.openMs = 0;
}
/** 매 스텝: 좌석 이용 누적 (이용률 = Σ앉은 손님·ms ÷ Σ정원·ms). 영업 시간(손님이 올 수 있는 시간)에만. */
export function accumulateSeatUse(state: GameState, dtMs: number): void {
  let cap = 0, used = 0;
  for (const o of Object.values(state.objects)) { const n = seatsOf(state, o); if (n > 0) cap += n; }
  if (cap === 0) return;
  for (const g of state.guests) if (g.seatId && g.phase !== 'leaving') used++;
  state.main.usedSeatMs += Math.min(used, cap) * dtMs;
  state.main.openMs += cap * dtMs;
}
/** 최근 SEAT_FULL_DAYS일 연속 80% 초과 → "자리가 모자라요" */
export function seatsShort(state: GameState): boolean {
  const log = state.main?.seatLog ?? [];
  if (log.length < SEAT_FULL_DAYS) return false;
  return log.slice(-SEAT_FULL_DAYS).every((p) => p > SEAT_FULL_PCT);
}
/** 어제 좌석 이용률 % (기록이 없으면 null) */
export function seatUsePct(state: GameState): number | null {
  const log = state.main?.seatLog ?? [];
  return log.length > 0 ? log[log.length - 1]! : null;
}

// ---------- 손님 훅 (guests.ts에서 한 줄씩 부른다) ----------

/** 순회 시설(이용료 시설) 수 — 체류 시간·둘러보기 확률 (같은 스텝 안에서는 캐시) */
function visitableCount(state: GameState): number {
  return facilityFlags(state).visitable;
}
/** 체류 시간(ms): 좌석 기본 + 시설당 +8분(상한 6개) × 따뜻한 조명 저녁 +10% */
export function stayMs(state: GameState, _g: Guest, baseMs: number): number {
  const ms = baseMs + Math.min(STAY_FACILITY_CAP, visitableCount(state)) * STAY_PER_FACILITY_MS;
  let mult = 1;
  if (state.main.lighting === 'warm' && state.clock.hour >= EVENING_HOUR) mult += WARM_EVENING_STAY;
  return Math.round(ms * mult);
}
/** 둘러보기 확률: 기본(VISIT_CHANCE) + 시설 3개 초과분 ×5% (상한 70%) */
export function browseChance(state: GameState, base: number): number {
  const extra = Math.max(0, visitableCount(state) - BROWSE_FACILITIES);
  return Math.min(BROWSE_CHANCE_CAP, base + extra * BROWSE_CHANCE_PER_FACILITY);
}
/** 시설 유무 플래그 — typeWeight가 손님·타입마다 부르므로 같은 tick 안에서는 한 번만 훑는다 */
interface FacilityFlags { key: string; visitable: number }
const FLAGS = new WeakMap<GameState, FacilityFlags>();
function facilityFlags(state: GameState): FacilityFlags {
  const key = layoutSig(state); // 배치 서명(액션 rev·날·nextId) — actionLog가 1,000개 캡에 닿아도 철거·이동·보충을 놓치지 않는다
  const hit = FLAGS.get(state);
  if (hit && hit.key === key) return hit;
  const f: FacilityFlags = { key, visitable: 0 };
  for (const o of Object.values(state.objects)) {
    if (o.build) continue;
    const d = objectDef(o.type);
    if (d.kind === 'facility' && d.fee !== undefined) f.visitable++;
  }
  FLAGS.set(state, f);
  return f;
}
/** 손님층 유입 배수 훅: BGM·조명 +5% */
export function cafeMoodSpawnMult(state: GameState, typeId: string): number {
  if (!state.main) return 1;
  let m = 1;
  const family = guestHasTag(typeId, 'family');
  const bgm = state.main.bgm;
  if (bgm === 'calm' && guestHasTag(typeId, 'senior')) m *= BGM_MULT;
  if (bgm === 'jazz' && guestHasTag(typeId, 'adult')) m *= BGM_MULT;
  if (bgm === 'folk' && (guestHasTag(typeId, 'foreign') || family)) m *= BGM_MULT;
  if (state.main.lighting === 'bright' && guestHasTag(typeId, 'youth')) m *= LIGHT_YOUTH_MULT;
  return m;
}

// ---------- 표시용 ----------

export const BGM_LABEL: Record<'calm' | 'jazz' | 'folk', string> = { calm: '잔잔', jazz: '재즈', folk: '제주 민요' };
export const LIGHT_LABEL: Record<'warm' | 'bright', string> = { warm: '따뜻', bright: '밝게' };
/** 본관 카드 요약 */
export function mainSummary(state: GameState): { usePct: number | null; cut: boolean; short: boolean } {
  const m = mainBuilding(state);
  return {
    usePct: seatUsePct(state),
    cut: m ? isRoomCut(state, m) : false,
    short: seatsShort(state),
  };
}

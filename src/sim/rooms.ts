/**
 * 실내 카페 증축·본관 이동·실내 분위기 (HSS2 확장 스펙 §8, UX 참고 §4 — 트랙 G+J, y-indoor).
 * - 본관(`warehouse`) 증축 Lv1 3×2 → Lv2 4×3 → Lv3 5×3 → Lv4 6×4 (원점 고정, 남동으로 자란다). PlacedObject.w/h를 덮어쓴다.
 * - 2층(Lv3 이상, footprint 그대로 실내 정원 +6), 본관 옮기기(월 1회·₩200만·3일+Lv), 같은 날 되돌리기 1회.
 * - 실내 요소: BGM·조명 — 액션으로 sim 상태에 저장(결정적).
 * - 손님: 겨울·비·태풍·폭설엔 실내 좌석 우선(preferIndoor), 체류 시간 = 좌석 기본 + 시설당 +8분, 좌석 이용률·"자리가 모자라요".
 * 결정적: rng·Date를 쓰지 않는다. 공사는 dayIndex로 끝난다.
 */
import type { GameState, PlacedObject, ApplyResult, MainState, MainWork, Guest, Pt } from './types.ts';
import { objectDef, ANNEX_IDS } from '../data/index.ts';
import { cellAt, objectAt, roomAt, doorFrontOf, doorOf, footprint, footprintOf, sizeOf, canPlaceMain, canPlace, placeObject, objectsInRoom, removeObject, occupy, vacate, inBounds, fixedCellsOf, isFixedCell } from './grid.ts';
import { isDoorReachable, isWalkable, reachMap, busStopPos, cellKey } from './path.ts';
import { seasonOf, monthIndex, HOUR_MS } from './clock.ts';
import { dayIndex } from './effects.ts';
import { activeEvents } from './events.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { seatsOf } from './cafe.ts';
import { guestHasTag } from './events.ts';
import { tutorialDone } from './tutorial.ts';
import { fmtNum } from './format.ts';
import { seatBonusOf } from './upgrade.ts';
import { layoutSig } from './layoutRev.ts';
import { josa } from './josa.ts';
import { parcelAt } from './parcels.ts';

// ---------- 상수 (§8.1·8.2·§4.1·§4.3) ----------

export const MAIN_TYPE = 'warehouse';
export const MAIN_MAX_LEVEL = 4;
/** 증축 단계별 발자국 */
export const MAIN_SIZE: Record<number, { w: number; h: number }> = { 1: { w: 3, h: 2 }, 2: { w: 4, h: 3 }, 3: { w: 5, h: 3 }, 4: { w: 6, h: 4 } };
/** 증축 비용 (다음 Lv 기준) */
export const MAIN_EXPAND_COST: Record<number, number> = { 2: 3_000_000, 3: 8_000_000, 4: 20_000_000 };
export const MAIN_EXPAND_DAYS = 7;
/** 2층: Lv3 이상, ₩1,500만, 실내 정원 +6, 전망 +1 */
export const FLOOR2_COST = 15_000_000;
export const FLOOR2_MIN_LEVEL = 3;
export const FLOOR2_SEATS = 6;
export const FLOOR2_DAYS = 7;
export const FLOOR2_VIEW = 1;
/** 옮기기: ₩200만 + 3일 (Lv2 이상은 Lv당 +1일), 월 1회, 같은 날 되돌리기 1회 */
export const MOVE_COST = 2_000_000;
export const MOVE_DAYS = 3;
/** 튜토리얼 앞 단계(둘러보기·본관 짓기·본관 보기·길 잇기)에서는 못 옮긴다 (§4.1 금지). w-start: 30단계 4 → 33단계 7 */
export const MOVE_TUTORIAL_MIN_STEP = 7;
/** 첫 본관은 무료·즉시 완공 (w-start 맨땅 튜토리얼 2단계) */
export const MAIN_BUILD_COST = 0;
/** 본관 추천 자리(tutorial.ts recommendedMainCells): 문 앞 칸이 정낭에서 체비쇼프 거리 ≤ 5 인 자리 중 바람 적은 순 상위 3 (튜토리얼 2단계 글로우) */
export const MAIN_RECOMMEND_GATE_DIST = 5;
export const MAIN_RECOMMEND_N = 3;
/** 본관 Lv2 증축 때 열리는 실내 가구 */
export const LV2_UNLOCK_IDS = ['counter_ext'];

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
export const SEAT_FULL_TEXT = '자리가 모자라요 — 좌석을 늘리거나 본관을 증축해요';
export const DOOR_PATH_WARN = '문 앞에 올렛길을 이어 주세요';
export const ANNEX_CUT_TEXT = '길 끊김 ✕';

export function initMain(): MainState {
  return { level: 1, floor2: false, work: null, movedMonth: -1, undo: null, bgm: null, lighting: 'warm', seatLog: [], usedSeatMs: 0, openMs: 0 };
}

// ---------- 본관 찾기·크기 ----------

export function mainBuilding(state: GameState): PlacedObject | null {
  return Object.values(state.objects).find((o) => o.type === MAIN_TYPE) ?? null;
}
export function mainLevel(state: GameState): number {
  return state.main?.level ?? 1;
}
export function mainSize(state: GameState): { w: number; h: number } {
  return MAIN_SIZE[mainLevel(state)] ?? MAIN_SIZE[1]!;
}
/** 본관 문 앞 칸 (직원 대기·주방 거리 원점). 본관이 없으면 null. */
export function mainDoorFront(state: GameState): Pt | null {
  const m = mainBuilding(state);
  return m ? doorFrontOf(m) : null;
}
/** 공사 중(증축·이동·2층)이면 본관 영업 정지 → 손님 스폰 0 */
export function isMainClosed(state: GameState): boolean {
  return !!state.main?.work;
}
export function mainWorkDaysLeft(state: GameState): number {
  const w = state.main?.work;
  return w ? Math.max(0, w.doneDay - dayIndex(state.clock)) : 0;
}

// ---------- 본관 짓기 (w-start: 맨땅 튜토리얼 — 첫 본관은 플레이어가 자리를 골라 짓는다) ----------

/** 본관을 (x,y)에 지을 수 있나: 아직 본관이 없고, Lv1 발자국(3×2) 규칙은 옮기기와 같고(내 필지·시설 없음, 올렛길은 걷어낸다), 문 앞 칸이 내 필지 안. */
export function canBuildMain(state: GameState, x: number, y: number): ApplyResult {
  if (mainBuilding(state)) return { ok: false, reason: '이미 본관이 있어요' };
  const size = MAIN_SIZE[1]!;
  const c = canPlaceMain(state, x, y, size.w, size.h);
  if (!c.ok) return c;
  const f = doorFrontOf({ type: MAIN_TYPE, x, y, w: size.w, h: size.h });
  if (!parcelAt(state, f.x, f.y)?.owned) return { ok: false, reason: '문 앞이 내 땅이어야 해요' };
  if (cellAt(state, f.x, f.y).terrain === 'road') return { ok: false, reason: '문 앞이 마을 길이면 안 돼요' };
  return { ok: true };
}
/** 검사 없이 짓는다 (무료·즉시 완공·공사 없음). 발자국 안 올렛길은 걷어내 환불. 길은 잇지 않는다 — 튜토리얼 4단계에서 직접 잇는다. 호출 전 canBuildMain. */
export function placeMain(state: GameState, x: number, y: number): PlacedObject {
  const size = MAIN_SIZE[1]!;
  clearPaths(state, footprint(MAIN_TYPE, x, y, size.w, size.h), '');
  state.money -= MAIN_BUILD_COST;
  const m = placeObject(state, MAIN_TYPE, x, y);
  state.main.level = 1;
  pushFx(state, { kind: 'complete', x: m.x, y: m.y, tick: state.tick });
  pushNotice(state, `카페 본관을 지었어요 — ${DOOR_PATH_WARN}`);
  return m;
}
// ---------- 실내 칸·좌석 ----------

/** 방(본관·별관) 바닥 칸인가 */
export function isIndoorCell(state: GameState, x: number, y: number): boolean {
  return inBounds(state, x, y) && cellAt(state, x, y).roomId !== null;
}
export function isIndoorSeat(state: GameState, seat: PlacedObject): boolean {
  return seat.type === MAIN_TYPE || cellAt(state, seat.x, seat.y).roomId !== null;
}
function roomSeatObjects(state: GameState, roomId: string): PlacedObject[] {
  return objectsInRoom(state, roomId).filter((o) => seatsOf(state, o) > 0);
}
/** 방 하나의 실내 좌석 정원 (본관이면 2층 포함) */
export function roomSeats(state: GameState, room: PlacedObject): number {
  let n = roomSeatObjects(state, room.id).reduce((a, o) => a + seatsOf(state, o), 0);
  if (room.type === MAIN_TYPE) n += seatsOf(state, room);
  return n;
}
/** 전체 실내 좌석 정원 (본관·별관 안 좌석 + 2층). 목표 「실내 좌석 6석」 */
export function indoorSeats(state: GameState): number {
  return Object.values(state.objects).filter((o) => objectDef(o.type).room && !o.build).reduce((n, r) => n + roomSeats(state, r), 0);
}
/** 방 안에서 지금 앉아 있는 손님 수 */
export function roomSeatsUsed(state: GameState, room: PlacedObject): number {
  const ids = new Set(roomSeatObjects(state, room.id).map((o) => o.id));
  ids.add(room.id);
  return state.guests.filter((g) => g.seatId && ids.has(g.seatId) && g.phase !== 'leaving').length;
}
/** 방의 고정 설비 칸(카운터+주방, 뒷벽 1줄) — 배치 불가·걷기 불가 (fix-indoor, grid.ts fixedCellsOf). 카운터 앞 1줄이 직원 대기·주문 칸. */
export function fixedCells(room: PlacedObject): Pt[] {
  return fixedCellsOf(room);
}
/** 실내 가구가 놓일 수 있는 빈 바닥 칸 (문 칸·고정 설비 칸 제외) */
export function freeFloorCells(state: GameState, room: PlacedObject): Pt[] {
  const door = doorOf(room);
  return footprintOf(room).filter((p) => { const c = cellAt(state, p.x, p.y); return c.objectId === room.id && !(p.x === door.x && p.y === door.y) && !isFixedCell(state, p.x, p.y); });
}

// ---------- 별관·길 끊김 (P1-13) ----------

export function isAnnex(o: PlacedObject): boolean {
  return ANNEX_IDS.has(o.type);
}
/** 완공된 별관 수 (목표 「별관 짓기」) */
export function annexCount(state: GameState): number {
  return Object.values(state.objects).filter((o) => isAnnex(o) && !o.build).length;
}
/** 방(본관·별관)의 문 앞이 정류장과 올렛길로 안 이어졌으면 true → 카드 "길 끊김 ✕" 빨간 줄 */
export function isRoomCut(state: GameState, room: PlacedObject): boolean {
  if (room.build || (room.type === MAIN_TYPE && state.main?.work)) return false; // 공사 중엔 경고 안 함
  return !isDoorReachable(state, room);
}
/** 길이 끊긴 방들 (메시지 줄용) */
export function cutRooms(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => objectDef(o.type).room && (o.type === MAIN_TYPE || isAnnex(o)) && isRoomCut(state, o));
}

// ---------- 증축 (§8.1) ----------

export function nextMainLevel(state: GameState): number | null {
  const lv = mainLevel(state);
  return lv >= MAIN_MAX_LEVEL ? null : lv + 1;
}
export function expandCost(state: GameState): number {
  const next = nextMainLevel(state);
  return next ? MAIN_EXPAND_COST[next] ?? 0 : 0;
}
/** 확장될 칸(현재 발자국 밖) 미리보기 — 고스트 다이아몬드 */
export function expandCells(state: GameState): Pt[] {
  const m = mainBuilding(state);
  const next = nextMainLevel(state);
  if (!m || !next) return [];
  const cur = new Set(footprintOf(m).map((p) => `${p.x},${p.y}`));
  const size = MAIN_SIZE[next]!;
  return footprint(MAIN_TYPE, m.x, m.y, size.w, size.h).filter((p) => !cur.has(`${p.x},${p.y}`));
}
export function canExpandMain(state: GameState): ApplyResult {
  const m = mainBuilding(state);
  if (!m) return { ok: false, reason: '본관이 없어요' };
  const next = nextMainLevel(state);
  if (!next) return { ok: false, reason: '이미 최고 단계예요' };
  if (state.main.work) return { ok: false, reason: '공사 중이에요' };
  const cost = MAIN_EXPAND_COST[next]!;
  if (state.money < cost) return { ok: false, reason: '돈이 모자라요' };
  const size = MAIN_SIZE[next]!;
  const c = canPlaceMain(state, m.x, m.y, size.w, size.h, m.id);
  if (!c.ok) return c;
  return { ok: true };
}
/** 발자국 안의 올렛길을 걷어내고 환불한다 (증축·이동 공통) */
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
/** 새 문 앞 칸까지 기존 길(정류장에서 닿는 칸)에서 가장 짧은 올렛길을 자동으로 잇는다 (증축·이사로 문이 옮겨졌을 때).
 *  빈 흙(길을 놓을 수 있는 칸)만 지나며, 이미 있는 길은 그대로 쓴다. 돈이 모자라면 놓지 않고 필요한 칸 수·금액만 돌려준다.
 *  반환: laid = 새로 놓은 칸 수, cost = 든 돈, need = 돈이 모자라 못 놓았을 때 필요한 금액(0이면 해결됨), route = null이면 이을 길이 없음. */
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
/** 증축·이사 직후: 문 앞 한 칸을 비운다 (mix 통합).
 *  본관이 커지면 문이 옮겨 가고, 그 자리에 있던 야외 시설이 문을 막아 버린다 — 그러면 올렛길을 이을 수도 없고,
 *  겨울처럼 실내 자리만 쓰는 날엔 손님이 0이 된다. 발자국 아래 올렛길을 걷어내듯(clearPaths) 문 앞 시설도 치우고 값을 돌려준다.
 *  정류장·본관·샘과 길은 건드리지 않는다. 치운 게 있으면 그 이름. */
function clearDoorFront(state: GameState, room: PlacedObject): string | null {
  const f = doorFrontOf(room);
  if (!inBounds(state, f.x, f.y)) return null;
  const o = objectAt(state, f.x, f.y);
  if (!o || o.id === room.id) return null;
  const def = objectDef(o.type);
  if (def.kind === 'path' || DOOR_FRONT_KEEP.has(o.type)) return null;
  removeObject(state, o.id);
  state.money += def.cost;
  pushNotice(state, `문 앞에 있던 ${josa(o.name ?? def.name, '을/를')} 치우고 값을 돌려줬어요`);
  return o.name ?? def.name;
}
/** 문 앞에서도 못 치우는 것 (정류장·본관·샘) */
const DOOR_FRONT_KEEP = new Set(['busstop', 'warehouse', 'spring']);

/** 증축·이사 직후: 자동 연결 결과를 알림 한 줄로 */
function noticeAutoConnect(state: GameState, r: ReturnType<typeof autoConnectDoor>): string {
  if (r.laid > 0) { pushNotice(state, `문 앞까지 올렛길 ${r.laid}칸을 자동으로 이었어요 (₩${fmtNum(r.cost)})`); return ''; }
  if (r.need > 0) return ` — ${DOOR_PATH_WARN} (₩${fmtNum(r.need)} 필요)`;
  if (r.blocked) return ` — 문 앞에 ${josa(r.blocked, '이/가')} 있어요. 치우면 올렛길을 이어요`;
  if (r.route === null) return ` — ${DOOR_PATH_WARN}`;
  return '';
}

/** 검사 없이 증축을 시작한다 (건축가 1명 7일, 공사 중 영업 정지). 호출 전 canExpandMain. */
export function expandMain(state: GameState): void {
  const m = mainBuilding(state)!;
  const next = nextMainLevel(state)!;
  const size = MAIN_SIZE[next]!;
  state.money -= MAIN_EXPAND_COST[next]!;
  clearPaths(state, footprint(MAIN_TYPE, m.x, m.y, size.w, size.h), m.id);
  // 발자국을 바로 넓힌다(실내 가구는 그대로). 공사가 끝날 때까지 손님은 안 온다.
  vacate(state, m);
  m.w = size.w; m.h = size.h;
  occupy(state, m);
  reoccupyFurniture(state, m);
  state.main.level = next as MainState['level'];
  state.main.work = { kind: 'expand', doneDay: dayIndex(state.clock) + MAIN_EXPAND_DAYS, days: MAIN_EXPAND_DAYS, toLevel: next };
  if (next >= 2) for (const id of LV2_UNLOCK_IDS) if (!state.unlocked.objects.includes(id)) { state.unlocked.objects.push(id); pushNotice(state, `새 시설: ${objectDef(id).name}`); }
  clearDoorFront(state, m); // 통합: 커진 본관의 새 문 앞을 막은 시설은 치운다 (막히면 올렛길도 못 잇는다)
  const warn = noticeAutoConnect(state, autoConnectDoor(state, m));
  pushNotice(state, `본관 증축 Lv${next} 공사 시작 (${MAIN_EXPAND_DAYS}일·₩${fmtNum(MAIN_EXPAND_COST[next]!)})${warn}`);
}
/** 방을 다시 새긴 뒤 안의 가구 칸(objectId)을 되살린다 (occupy(room)가 바닥 전체를 방 id로 덮기 때문) */
function reoccupyFurniture(state: GameState, room: PlacedObject): void {
  for (const o of Object.values(state.objects)) {
    if (o.id === room.id || !objectDef(o.type).indoor) continue;
    if (roomAt(state, o.x, o.y)?.id !== room.id) continue;
    for (const p of footprintOf(o)) cellAt(state, p.x, p.y).objectId = o.id;
  }
}

// ---------- 2층 (§8.2) ----------

export function canBuildSecondFloor(state: GameState): ApplyResult {
  if (!mainBuilding(state)) return { ok: false, reason: '본관이 없어요' };
  if (state.main.floor2) return { ok: false, reason: '이미 2층이 있어요' };
  if (state.main.work) return { ok: false, reason: '공사 중이에요' };
  if (mainLevel(state) < FLOOR2_MIN_LEVEL) return { ok: false, reason: `본관 Lv${FLOOR2_MIN_LEVEL}부터 올릴 수 있어요` };
  if (state.money < FLOOR2_COST) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function buildSecondFloor(state: GameState): void {
  state.money -= FLOOR2_COST;
  state.main.work = { kind: 'floor2', doneDay: dayIndex(state.clock) + FLOOR2_DAYS, days: FLOOR2_DAYS };
  pushNotice(state, `2층 올리기 공사 시작 (${FLOOR2_DAYS}일·₩${fmtNum(FLOOR2_COST)})`);
}

// ---------- 옮기기 (§4.1) ----------

export function moveDays(state: GameState): number {
  const lv = mainLevel(state);
  return MOVE_DAYS + Math.max(0, lv - 1);
}
export function canMoveThisMonth(state: GameState): boolean {
  return state.main.movedMonth !== monthIndex(state.clock);
}
/** 옮기기 버튼을 누를 수 있나 (자리와 무관한 조건: 월 1회·돈·공사·튜토리얼·빅 이벤트) */
export function canStartMoveMain(state: GameState): ApplyResult {
  if (!mainBuilding(state)) return { ok: false, reason: '본관이 없어요' };
  if (state.main.work) return { ok: false, reason: '공사 중이에요' };
  if (!canMoveThisMonth(state)) return { ok: false, reason: '이달엔 이미 옮겼어요' };
  if (!tutorialDone(state) && state.tutorial.step < MOVE_TUTORIAL_MIN_STEP) return { ok: false, reason: '튜토리얼을 먼저 끝내요' };
  if (activeEvents(state).length > 0) return { ok: false, reason: '이벤트 중엔 못 옮겨요' };
  if (state.money < MOVE_COST) return { ok: false, reason: '돈이 모자라요' };
  if (guestsBlockMain(state)) return { ok: false, reason: '본관에 손님이 있을 땐 못 옮겨요' };
  return { ok: true };
}
/** 본관·실내 가구에 앉았거나, 본관 발자국(옮길 자리 포함)을 지나가는 손님이 있나. 마당 손님은 상관없다 — 손님이 0명인 순간은 영업 중엔 사실상 안 온다. */
export function guestsBlockMain(state: GameState, to?: Pt): boolean {
  const m = mainBuilding(state);
  if (!m) return false;
  const { w, h } = sizeOf(m);
  const cells = new Set(footprint(MAIN_TYPE, m.x, m.y, w, h).map((p) => `${p.x},${p.y}`));
  if (to) for (const p of footprint(MAIN_TYPE, to.x, to.y, w, h)) cells.add(`${p.x},${p.y}`);
  const seats = new Set([m.id, ...objectsInRoom(state, m.id).map((o) => o.id)]);
  for (const g of state.guests) {
    if (g.seatId && seats.has(g.seatId)) return true;
    if (cells.has(`${Math.round(g.x)},${Math.round(g.y)}`)) return true;
    if (g.approachCell && cells.has(`${g.approachCell.x},${g.approachCell.y}`)) return true;
    if (g.path.some((p) => cells.has(`${p.x},${p.y}`))) return true;
  }
  return false;
}
export function canMoveMain(state: GameState, x: number, y: number): ApplyResult {
  const c = canStartMoveMain(state);
  if (!c.ok) return c;
  const m = mainBuilding(state)!;
  if (m.x === x && m.y === y) return { ok: false, reason: '지금 자리예요' };
  if (guestsBlockMain(state, { x, y })) return { ok: false, reason: '손님이 지나가는 자리예요' };
  const { w, h } = sizeOf(m);
  return canPlaceMain(state, x, y, w, h, m.id);
}
/** 검사 없이 옮긴다: 발자국 안 올렛길 철거·환불, 실내 가구는 같은 상대 위치로 따라간다, 건축가 3일(+Lv). 호출 전 canMoveMain. */
export function moveMain(state: GameState, x: number, y: number): void {
  const m = mainBuilding(state)!;
  const { w, h } = sizeOf(m);
  const dx = x - m.x, dy = y - m.y;
  const prev = { x: m.x, y: m.y };
  const furniture = objectsInRoom(state, m.id);
  state.money -= MOVE_COST;
  for (const o of furniture) vacate(state, o);
  vacate(state, m);
  clearPaths(state, footprint(MAIN_TYPE, x, y, w, h), m.id);
  m.x = x; m.y = y;
  occupy(state, m);
  for (const o of furniture) { o.x += dx; o.y += dy; occupy(state, o); }
  const days = moveDays(state);
  const today = dayIndex(state.clock);
  state.main.undo = { x: prev.x, y: prev.y, day: today, cost: MOVE_COST, prevMovedMonth: state.main.movedMonth };
  state.main.movedMonth = monthIndex(state.clock);
  state.main.work = { kind: 'move', doneDay: today + days, days };
  clearDoorFront(state, m); // 통합: 옮긴 본관의 새 문 앞을 막은 시설은 치운다 (막히면 올렛길도 못 잇는다)
  const warn = noticeAutoConnect(state, autoConnectDoor(state, m));
  pushNotice(state, `본관 옮기기 공사 시작 (${days}일·₩${fmtNum(MOVE_COST)})${warn}`);
}
export function canUndoMoveMain(state: GameState): ApplyResult {
  const u = state.main.undo;
  if (!u) return { ok: false, reason: '되돌릴 이동이 없어요' };
  if (u.day !== dayIndex(state.clock)) return { ok: false, reason: '되돌리기는 옮긴 날에만 돼요' };
  const m = mainBuilding(state)!;
  const { w, h } = sizeOf(m);
  const c = canPlaceMain(state, u.x, u.y, w, h, m.id);
  if (!c.ok) return { ok: false, reason: `원래 자리에 못 돌아가요 (${c.reason})` };
  return { ok: true };
}
/** 같은 날 되돌리기: 비용 환불·횟수 복구·공사 취소. 호출 전 canUndoMoveMain. */
export function undoMoveMain(state: GameState): void {
  const u = state.main.undo!;
  const m = mainBuilding(state)!;
  const { w, h } = sizeOf(m);
  const dx = u.x - m.x, dy = u.y - m.y;
  const furniture = objectsInRoom(state, m.id);
  for (const o of furniture) vacate(state, o);
  vacate(state, m);
  clearPaths(state, footprint(MAIN_TYPE, u.x, u.y, w, h), m.id);
  m.x = u.x; m.y = u.y;
  occupy(state, m);
  for (const o of furniture) { o.x += dx; o.y += dy; occupy(state, o); }
  state.money += u.cost;
  state.main.movedMonth = u.prevMovedMonth;
  state.main.work = null;
  state.main.undo = null;
  pushNotice(state, '본관 이동을 되돌렸어요 (비용 환불)');
}

// ---------- 매일·매달 (tick 훅) ----------

/** 매일 아침: 공사 완료 판정 + 어제 좌석 이용률 기록 + 난로 자동 ON(12~2월) */
export function dailyRooms(state: GameState): void {
  const w = state.main.work;
  const today = dayIndex(state.clock);
  if (w && w.doneDay <= today) {
    state.main.work = null;
    const m = mainBuilding(state);
    if (w.kind === 'floor2') state.main.floor2 = true;
    const title = w.kind === 'expand' ? `본관 증축 Lv${w.toLevel} 완공!` : w.kind === 'floor2' ? '2층 완공!' : '본관 이사 끝!';
    const hint = m && !isDoorReachable(state, m) ? ` — ${DOOR_PATH_WARN}` : '';
    pushNotice(state, `${title}${hint}`);
    if (m) pushFx(state, { kind: 'complete', x: m.x, y: m.y, tick: state.tick });
    pushFx(state, { kind: 'scene', title: '완공', text: `${title}${hint || ' 손님을 맞을 준비가 됐어요'}`, tick: state.tick });
  }
  if (state.main.undo && state.main.undo.day !== today) state.main.undo = null;
  // 어제 이용률
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

const BAD_WEATHER = /typhoon|snow|monsoon|rain/;
/** 겨울(12~2월)·비·태풍·폭설엔 실내 좌석 우선 (§8.1) */
export function preferIndoor(state: GameState): boolean {
  if (seasonOf(state.clock.month) === 'winter') return true;
  return activeEvents(state).some((e) => BAD_WEATHER.test(e.id));
}
/** 좌석 선택 훅: 실내 우선인 날엔 (문이 길로 이어진 방의) 빈 실내 좌석이 있으면 실내만 고른다 (야외는 실내가 찼을 때만 → 야외 이용률이 크게 준다) */
const REACH = new WeakMap<GameState, { key: string; rooms: Map<string, boolean> }>();
/** 방 문이 정류장과 이어졌나 — 같은 스텝 안에서는 한 번만 BFS (스폰이 손님마다 freeSeats를 부른다) */
function roomReachable(state: GameState, room: PlacedObject): boolean {
  const key = `${state.tick}:${state.nextId}:${state.actionLog.length}`;
  let c = REACH.get(state);
  if (!c || c.key !== key) { c = { key, rooms: new Map() }; REACH.set(state, c); }
  let r = c.rooms.get(room.id);
  if (r === undefined) { r = isDoorReachable(state, room); c.rooms.set(room.id, r); }
  return r;
}
export function filterSeatsForWeather(state: GameState, seats: PlacedObject[]): PlacedObject[] {
  if (!preferIndoor(state)) return seats;
  const indoor = seats.filter((s) => { const room = s.type === MAIN_TYPE ? s : roomAt(state, s.x, s.y); return !!room && roomReachable(state, room); });
  return indoor.length > 0 ? indoor : seats;
}
/** 순회 시설(이용료 시설) 수 — 체류 시간·둘러보기 확률 (같은 스텝 안에서는 캐시) */
function visitableCount(state: GameState): number {
  return indoorFlags(state).visitable;
}
/** 체류 시간(ms): 좌석 기본 + 시설당 +8분(상한 6개) × 소파 +20% × 책장 +15%(신간 +5%) × 따뜻한 조명 저녁 +10% (P1-12·§4.3) */
export function stayMs(state: GameState, g: Guest, baseMs: number): number {
  const seat = g.seatId ? state.objects[g.seatId] : undefined;
  let ms = baseMs + Math.min(STAY_FACILITY_CAP, visitableCount(state)) * STAY_PER_FACILITY_MS;
  let mult = 1;
  if (seat && isIndoorSeat(state, seat) && state.main.lighting === 'warm' && state.clock.hour >= EVENING_HOUR) mult += WARM_EVENING_STAY;
  return Math.round(ms * mult);
}
/** 둘러보기 확률: 기본(VISIT_CHANCE) + 시설 3개 초과분 ×5% (상한 70%) */
export function browseChance(state: GameState, base: number): number {
  const extra = Math.max(0, visitableCount(state) - BROWSE_FACILITIES);
  return Math.min(BROWSE_CHANCE_CAP, base + extra * BROWSE_CHANCE_PER_FACILITY);
}
/** 시설 유무 플래그 — typeWeight가 손님·타입마다 부르므로 같은 tick 안에서는 한 번만 훑는다 */
interface IndoorFlags { key: string; visitable: number }
const FLAGS = new WeakMap<GameState, IndoorFlags>();
function indoorFlags(state: GameState): IndoorFlags {
  const key = layoutSig(state); // 배치 서명(액션 rev·날·nextId) — actionLog가 1,000개 캡에 닿아도 철거·이동·보충을 놓치지 않는다
  const hit = FLAGS.get(state);
  if (hit && hit.key === key) return hit;
  const f: IndoorFlags = { key, visitable: 0 };
  for (const o of Object.values(state.objects)) {
    if (o.build) continue;
    const d = objectDef(o.type);
    if (d.kind === 'facility' && d.fee !== undefined) f.visitable++;
  }
  FLAGS.set(state, f);
  return f;
}
/** 손님층 유입 배수 훅: BGM·조명 +5% */
export function indoorSpawnMult(state: GameState, typeId: string): number {
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
/** 본관 카드 3줄용 요약 */
export function mainSummary(state: GameState): { level: number; seatsUsed: number; seats: number; work: MainWork | null; daysLeft: number; usePct: number | null; cut: boolean; short: boolean } {
  const m = mainBuilding(state);
  return {
    level: mainLevel(state),
    seatsUsed: m ? roomSeatsUsed(state, m) : 0,
    seats: m ? roomSeats(state, m) : 0,
    work: state.main?.work ?? null,
    daysLeft: mainWorkDaysLeft(state),
    usePct: seatUsePct(state),
    cut: m ? isRoomCut(state, m) : false,
    short: seatsShort(state),
  };
}

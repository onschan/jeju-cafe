/**
 * 본관(카페 건물)과 마당 잇기.
 * - 본관(`warehouse`)은 **주방과 카운터만 있는 3×2 상자로 고정**이다. 증축·2층·별관·이사는 없앴다(야외 중심 개편) —
 *   손님이 앉는 곳은 전부 마당이고, 넓어지는 축은 필지 구매 하나뿐이다.
 * - 남긴 것: 문·문 앞 칸·올렛길 자동 잇기, 카페 분위기(BGM·조명), 체류 시간, 좌석 이용률.
 * - 추위·비는 「실내냐 야외냐」가 아니라 시설이 가진 지붕(`shelter`) 속성으로 막는다 — site.ts.
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, PlacedObject, ApplyResult, MainState, Guest, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { cellAt, objectAt, doorFrontOf, footprint, canPlaceMain, canPlace, placeObject, removeObject, inBounds } from './grid.ts';
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
/** 본관 발자국 — 3×2 고정 */
export const MAIN_SIZE: { w: number; h: number } = { w: 3, h: 2 };
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
  return { bgm: null, lighting: 'warm', seatLog: [], usedSeatMs: 0, openMs: 0 };
}

// ---------- 본관 찾기·크기 ----------

export function mainBuilding(state: GameState): PlacedObject | null {
  return Object.values(state.objects).find((o) => o.type === MAIN_TYPE) ?? null;
}
export function mainSize(): { w: number; h: number } {
  return MAIN_SIZE;
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

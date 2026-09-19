/**
 * 실내 카페 증축·본관 이동·실내 요소 상호작용 (HSS2 확장 스펙 §8, UX 참고 §4 — 트랙 G+J, y-indoor).
 * - 본관(`warehouse`) 증축 Lv1 3×2 → Lv2 4×3 → Lv3 5×3 → Lv4 6×4 (원점 고정, 남동으로 자란다). PlacedObject.w/h를 덮어쓴다.
 * - 2층(Lv3 이상, footprint 그대로 실내 정원 +6), 본관 옮기기(월 1회·₩200만·3일+Lv), 같은 날 되돌리기 1회.
 * - 실내 요소: 난로·피아노·책장·수족관·키즈·바·BGM·조명 — 전부 액션으로 sim 상태에 저장(결정적).
 * - 손님: 겨울·비·태풍·폭설엔 실내 좌석 우선(preferIndoor), 체류 시간 = 좌석 기본 + 시설당 +8분, 좌석 이용률·"자리가 모자라요".
 * 결정적: rng·Date를 쓰지 않는다. 공사는 dayIndex로 끝난다.
 */
import type { GameState, PlacedObject, ApplyResult, MainState, MainWork, Guest, Pt } from './types.ts';
import { objectDef, ANNEX_IDS } from '../data/index.ts';
import { cellAt, objectAt, roomAt, doorFrontOf, doorOf, footprint, footprintOf, sizeOf, canPlaceMain, objectsInRoom, removeObject, occupy, vacate, inBounds } from './grid.ts';
import { isDoorReachable, isWalkable } from './path.ts';
import { seasonOf, monthIndex } from './clock.ts';
import { dayIndex } from './effects.ts';
import { activeEvents } from './events.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { seatsOf } from './cafe.ts';
import { guestHasTag } from './events.ts';
import { tutorialDone } from './tutorial.ts';
import { fmtNum } from './format.ts';
import { seatBonusOf } from './upgrade.ts';

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
/** 튜토리얼 1~4단계에서는 못 옮긴다 (§4.1 금지) */
export const MOVE_TUTORIAL_MIN_STEP = 4;
/** 본관 Lv2 증축 때 열리는 실내 가구 */
export const LV2_UNLOCK_IDS = ['counter_ext'];

/** 난로: 반경 2 실내 좌석 겨울 만족 +3(스펙 점수), 켜 두면 월 연료 ₩5만. 12~2월 자동 ON */
export const FIREPLACE_RADIUS = 2;
export const FIREPLACE_SAT = 3;
export const FIREPLACE_FUEL = 50_000;
/** 소파석 만족 +2·체류 +20%, 책장 체류 +15%(신간 +5%, 한 달), 조명 따뜻 저녁 체류 +10% */
export const SOFA_SAT = 2;
export const SOFA_STAY = 0.2;
export const BOOKSHELF_STAY = 0.15;
export const NEW_BOOKS_STAY = 0.05;
export const NEW_BOOKS_DAYS = 30;
export const NEW_BOOKS_MILEAGE = 1;
export const WARM_EVENING_STAY = 0.1;
/** 수족관: 먹이 하루 1회 → 청결 +2, 3일 안 주면 경관 0 */
export const AQUARIUM_CLEAN = 2;
export const AQUARIUM_HUNGRY_DAYS = 3;
/** 키즈 코너: 장난감 보충 ₩10만, 30일 유지 → 가족 +25% */
export const KIDS_RESTOCK_COST = 100_000;
export const KIDS_RESTOCK_DAYS = 30;
export const KIDS_FAMILY_MULT = 1.25;
export const AQUARIUM_FAMILY_MULT = 1.1;
export const BOOKSHELF_YOUTH_MULT = 1.1;
/** 피아노: 연주 시간대 손님 +10% (피아니스트 특기 직원이 있으면 +15%), 인기 +8은 시설 인기(popularity 18)로 */
export const PIANO_MULT = 1.1;
export const PIANO_HOURS: Record<'lunch' | 'evening', [number, number]> = { lunch: [12, 14], evening: [18, 20] };
/** 바 저녁 세트: 18시 이후 1인 손님 요금 +15% */
export const BAR_EVENING_HOUR = 18;
export const BAR_EVENING_FEE = 1.15;
/** BGM: 잔잔 senior / 재즈 adult(커플) / 민요 foreign·family +5%, 조명 밝게 youth +5% */
export const BGM_MULT = 1.05;
export const LIGHT_YOUTH_MULT = 1.05;
export const EVENING_HOUR = 18;
/** 체류: 좌석 기본(guests.ts SEAT_MS ≈ 1.5시간 = 3000ms → 1시간 2000ms) + 순회 시설당 +8분, 시설 3개 초과 시 둘러보기 확률 상승 */
export const MS_PER_HOUR = 2000;
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
  return { level: 1, floor2: false, work: null, movedMonth: -1, undo: null, bgm: null, lighting: 'warm', pianoTime: 'none', seatLog: [], usedSeatMs: 0, openMs: 0 };
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
/** 실내 가구가 놓일 수 있는 빈 바닥 칸 (문 칸 제외) */
export function freeFloorCells(state: GameState, room: PlacedObject): Pt[] {
  const door = doorOf(room);
  return footprintOf(room).filter((p) => { const c = cellAt(state, p.x, p.y); return c.objectId === room.id && !(p.x === door.x && p.y === door.y); });
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
  pushNotice(state, `본관 증축 Lv${next} 공사 시작 (${MAIN_EXPAND_DAYS}일·₩${fmtNum(MAIN_EXPAND_COST[next]!)})`);
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
  if (state.guests.length > 0) return { ok: false, reason: '손님이 있을 땐 못 옮겨요' };
  return { ok: true };
}
export function canMoveMain(state: GameState, x: number, y: number): ApplyResult {
  const c = canStartMoveMain(state);
  if (!c.ok) return c;
  const m = mainBuilding(state)!;
  if (m.x === x && m.y === y) return { ok: false, reason: '지금 자리예요' };
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
  const warn = isWalkable(state, doorFrontOf(m).x, doorFrontOf(m).y) ? '' : ` — ${DOOR_PATH_WARN}`;
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
  // 난로: 겨울 자동 ON (꺼 둔 것도 12월 1일에 켜진다)
  if (seasonOf(state.clock.month) === 'winter' && state.clock.day === 1) for (const o of fireplaces(state)) if (o.mode === undefined) o.mode = 'on';
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
/** 매달 1일: 켜 둔 난로 연료비 */
export function monthlyRooms(state: GameState): void {
  const on = fireplaces(state).filter((o) => isFireplaceOn(state, o)).length;
  if (on > 0) { const cost = on * FIREPLACE_FUEL; state.money -= cost; state.monthCosts.upkeep += cost; }
}

// ---------- 실내 요소 상호작용 (§4.3) ----------

function fireplaces(state: GameState): PlacedObject[] {
  return Object.values(state.objects).filter((o) => o.type === 'fireplace' && !o.build);
}
export function isFireplaceOn(state: GameState, o: PlacedObject): boolean {
  if (o.type !== 'fireplace' || o.build) return false;
  if (o.mode === 'off') return false;
  if (o.mode === 'on') return true;
  return seasonOf(state.clock.month) === 'winter'; // 미설정: 겨울 자동
}
export function canToggleFireplace(state: GameState, objectId: string): ApplyResult {
  const o = state.objects[objectId];
  if (!o || o.type !== 'fireplace') return { ok: false, reason: '난로가 아니에요' };
  if (o.build) return { ok: false, reason: '짓는 중이에요' };
  return { ok: true };
}
export function toggleFireplace(state: GameState, objectId: string): void {
  const o = state.objects[objectId]!;
  o.mode = isFireplaceOn(state, o) ? 'off' : 'on';
}
export function canSetPianoTime(state: GameState): ApplyResult {
  if (!Object.values(state.objects).some((o) => o.type === 'piano' && !o.build)) return { ok: false, reason: '피아노가 없어요' };
  return { ok: true };
}
export function isPianoPlaying(state: GameState, hour = state.clock.hour): boolean {
  const t = state.main?.pianoTime ?? 'none';
  if (t === 'none' || !indoorFlags(state).piano) return false;
  const [a, b] = PIANO_HOURS[t];
  return hour >= a && hour < b;
}
export function canAddBooks(state: GameState, objectId: string): ApplyResult {
  const o = state.objects[objectId];
  if (!o || o.type !== 'bookshelf') return { ok: false, reason: '책장이 아니에요' };
  if (o.build) return { ok: false, reason: '짓는 중이에요' };
  if (hasNewBooks(state, o)) return { ok: false, reason: '아직 신간이 있어요' };
  if (state.mileage < NEW_BOOKS_MILEAGE) return { ok: false, reason: '마일리지가 모자라요' };
  return { ok: true };
}
export function hasNewBooks(state: GameState, o: PlacedObject): boolean {
  return o.careDay !== undefined && dayIndex(state.clock) - o.careDay < NEW_BOOKS_DAYS;
}
export function addBooks(state: GameState, objectId: string): void {
  state.mileage -= NEW_BOOKS_MILEAGE;
  state.objects[objectId]!.careDay = dayIndex(state.clock);
}
export function canFeedAquarium(state: GameState, objectId: string): ApplyResult {
  const o = state.objects[objectId];
  if (!o || o.type !== 'aquarium') return { ok: false, reason: '수족관이 아니에요' };
  if (o.build) return { ok: false, reason: '짓는 중이에요' };
  if (o.careDay === dayIndex(state.clock)) return { ok: false, reason: '오늘은 이미 줬어요' };
  return { ok: true };
}
export function feedAquarium(state: GameState, objectId: string): void {
  const o = state.objects[objectId]!;
  o.careDay = dayIndex(state.clock);
  state.clean.value = Math.min(100, state.clean.value + AQUARIUM_CLEAN);
  pushFx(state, { kind: 'pop', x: o.x, y: o.y, n: AQUARIUM_CLEAN, tick: state.tick });
}
/** 3일 넘게 먹이를 안 주면 배고픈 수족관 (경관 0) */
export function isAquariumHungry(state: GameState, o: PlacedObject): boolean {
  return o.type === 'aquarium' && (o.careDay === undefined || dayIndex(state.clock) - o.careDay >= AQUARIUM_HUNGRY_DAYS);
}
export function canRestockKids(state: GameState, objectId: string): ApplyResult {
  const o = state.objects[objectId];
  if (!o || o.type !== 'kids_corner') return { ok: false, reason: '키즈 코너가 아니에요' };
  if (o.build) return { ok: false, reason: '짓는 중이에요' };
  if (isKidsStocked(state, o)) return { ok: false, reason: '장난감이 아직 넉넉해요' };
  if (state.money < KIDS_RESTOCK_COST) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function isKidsStocked(state: GameState, o: PlacedObject): boolean {
  return o.careDay !== undefined && dayIndex(state.clock) - o.careDay < KIDS_RESTOCK_DAYS;
}
export function restockKids(state: GameState, objectId: string): void {
  state.money -= KIDS_RESTOCK_COST;
  state.objects[objectId]!.careDay = dayIndex(state.clock);
}
export function canSetBarEvening(state: GameState, objectId: string): ApplyResult {
  const o = state.objects[objectId];
  if (!o || o.type !== 'bar_counter') return { ok: false, reason: '바 카운터가 아니에요' };
  if (o.build) return { ok: false, reason: '짓는 중이에요' };
  return { ok: true };
}
export function setBarEvening(state: GameState, objectId: string, on: boolean): void {
  state.objects[objectId]!.mode = on ? 'on' : 'off';
}
export function isBarEvening(o: PlacedObject): boolean {
  return o.type === 'bar_counter' && o.mode === 'on';
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
/** 만족 가산(경치 단위 = 스펙 점수 ÷ 10): 소파 +2, 난로 반경 2 겨울 +3 (실내 좌석만) */
export function indoorSatisfaction(state: GameState, seat: PlacedObject): number {
  if (!isIndoorSeat(state, seat)) return 0;
  let pts = 0;
  if (seat.type === 'sofa_seat') pts += SOFA_SAT;
  if (seasonOf(state.clock.month) === 'winter') {
    for (const f of fireplaces(state)) {
      if (!isFireplaceOn(state, f)) continue;
      if (Math.max(Math.abs(f.x - seat.x), Math.abs(f.y - seat.y)) <= FIREPLACE_RADIUS) { pts += FIREPLACE_SAT; break; }
    }
  }
  return pts / 10;
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
  if (seat) {
    if (seat.type === 'sofa_seat') mult += SOFA_STAY;
    if (isIndoorSeat(state, seat)) {
      const shelf = Object.values(state.objects).find((o) => o.type === 'bookshelf' && !o.build && roomAt(state, o.x, o.y)?.id === roomAt(state, seat.x, seat.y)?.id);
      if (shelf) mult += BOOKSHELF_STAY + (hasNewBooks(state, shelf) ? NEW_BOOKS_STAY : 0);
      if (state.main.lighting === 'warm' && state.clock.hour >= EVENING_HOUR) mult += WARM_EVENING_STAY;
    }
  }
  return Math.round(ms * mult);
}
/** 둘러보기 확률: 기본(VISIT_CHANCE) + 시설 3개 초과분 ×5% (상한 70%) */
export function browseChance(state: GameState, base: number): number {
  const extra = Math.max(0, visitableCount(state) - BROWSE_FACILITIES);
  return Math.min(BROWSE_CHANCE_CAP, base + extra * BROWSE_CHANCE_PER_FACILITY);
}
/** 시설 유무 플래그 — typeWeight가 손님·타입마다 부르므로 같은 tick 안에서는 한 번만 훑는다 */
interface IndoorFlags { key: string; piano: boolean; kids: boolean; aquarium: boolean; bookshelf: boolean; visitable: number }
const FLAGS = new WeakMap<GameState, IndoorFlags>();
function indoorFlags(state: GameState): IndoorFlags {
  const key = `${state.tick}:${state.nextId}:${state.actionLog.length}`; // 스텝·배치·액션(보충 등)이 바뀌면 다시 훑는다
  const hit = FLAGS.get(state);
  if (hit && hit.key === key) return hit;
  const f: IndoorFlags = { key, piano: false, kids: false, aquarium: false, bookshelf: false, visitable: 0 };
  for (const o of Object.values(state.objects)) {
    if (o.build) continue;
    const d = objectDef(o.type);
    if (d.kind === 'facility' && d.fee !== undefined) f.visitable++;
    if (o.type === 'piano') f.piano = true;
    else if (o.type === 'kids_corner' && isKidsStocked(state, o)) f.kids = true;
    else if (o.type === 'aquarium') f.aquarium = true;
    else if (o.type === 'bookshelf') f.bookshelf = true;
  }
  FLAGS.set(state, f);
  return f;
}
/** 손님층 유입 배수 훅: 피아노 시간대 +10%, 키즈(보충됨) 가족 +25%, 수족관 가족 +10%, 책장 청년 +10%, BGM·조명 +5% */
export function indoorSpawnMult(state: GameState, typeId: string): number {
  if (!state.main) return 1;
  let m = 1;
  const f = indoorFlags(state);
  if (f.piano && isPianoPlaying(state)) m *= PIANO_MULT;
  const family = guestHasTag(typeId, 'family');
  if (family && f.kids) m *= KIDS_FAMILY_MULT;
  if (family && f.aquarium) m *= AQUARIUM_FAMILY_MULT;
  if (guestHasTag(typeId, 'youth') && f.bookshelf) m *= BOOKSHELF_YOUTH_MULT;
  const bgm = state.main.bgm;
  if (bgm === 'calm' && guestHasTag(typeId, 'senior')) m *= BGM_MULT;
  if (bgm === 'jazz' && guestHasTag(typeId, 'adult')) m *= BGM_MULT;
  if (bgm === 'folk' && (guestHasTag(typeId, 'foreign') || family)) m *= BGM_MULT;
  if (state.main.lighting === 'bright' && guestHasTag(typeId, 'youth')) m *= LIGHT_YOUTH_MULT;
  return m;
}
/** 요금 훅: 바 카운터 저녁 세트 ON이면 18시 이후 1인 손님 +15% */
export function indoorFeeMult(state: GameState, seat: PlacedObject, typeId: string): number {
  if (isBarEvening(seat) && state.clock.hour >= BAR_EVENING_HOUR && guestHasTag(typeId, 'solo')) return BAR_EVENING_FEE;
  return 1;
}

// ---------- 표시용 ----------

export const BGM_LABEL: Record<'calm' | 'jazz' | 'folk', string> = { calm: '잔잔', jazz: '재즈', folk: '제주 민요' };
export const LIGHT_LABEL: Record<'warm' | 'bright', string> = { warm: '따뜻', bright: '밝게' };
export const PIANO_LABEL: Record<'lunch' | 'evening' | 'none', string> = { lunch: '점심 12~14', evening: '저녁 18~20', none: '안 함' };
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

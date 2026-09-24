/**
 * 러시 타임 (rush-battle 스펙 §1·§2·§5·§7) — 주간 리듬의 코어.
 *
 * 한 주(7일)는 「준비 1~5일 → 러시 6일차 → 마무리 7일차」로 돈다. 러시는 새 화면이 아니라 같은 마당 위에서
 * 문 앞에 **줄**이 서고, 플레이어가 자리 배정·직원 스킬·밀린 주문 처리 세 가지를 직접 조작하는 60~90초짜리 사건이다.
 *
 * ## 시간 축 (§7-1: 3배속 1주 사이클 2분 안, 그중 러시 60~90초)
 * 게임 시계로 러시가 차지하는 구간은 11:00~15:00(4시간 = 4,800 게임 ms)뿐이다. 그대로 3배속으로 흘리면 4초에 끝나므로
 * **실시간 환산만** 늦춘다 — tick()이 실시간 dt를 게임 ms로 바꿀 때 RUSH_*_SCALE을 곱한다(rushTimeScale).
 * 시뮬레이션 자체(고정 스텝 수·난수 흐름·하루 매출)는 그대로라 밸런스가 안 흔들리고, 봇·테스트처럼
 * `tick(s, DAY_MS)`로 하루를 한 번에 돌리는 쪽은 러시 밖(06시)에서 부르므로 영향이 없다.
 *
 * ## 손님 줄
 * 러시 중에는 평소 스폰을 멈추고(guests.hourlySpawn) 이 파일이 **3배 속도로 줄을 세운다**. 줄에 선 손님은 인내 게이지(20~40초)가
 * 0이 되면 떠난다(평판 −1·left++). 자리에 앉히면 그때 진짜 Guest가 되어 평소처럼 주문하고 돈을 낸다 — 경제는 기존 경로 그대로.
 *
 * ## 점수·등급
 * 받은 손님×10 + 팁 + 자리 보너스 + 콤보(연속 3명부터 ×1.5) − 떠난 손님×15.
 * 등급 문턱은 **지금 좌석·직원 규모에 맞춘 상대 평가**라 같은 규모면 조작 실력이 등급을 가른다.
 * 아무것도 안 하면 기존 착석 로직으로 자동 진행되지만 점수 계수가 0.6이라 C~B에 머문다.
 *
 * 결정적: state.rng만 쓴다 (Math.random·Date 없음). 상태는 전부 optional 필드라 옛 저장은 backfill로 채운다.
 */
import type { GameState, PlacedObject, RoleId, RouteId, RushState, RushGuest, RushGrade, RushPhase, ApplyResult } from './types.ts';
import { DAY_MS, HOUR_MS, END_HOUR } from './clock.ts';
import { dayIndex } from './effects.ts';
import { pickWeighted, randInt } from './rng.ts';
import { pushNotice, staffInRole } from './staff.ts';
import { pushFx } from './fx.ts';
import { addReputation, addComplaint, REPUTATION_START } from './reputation.ts';
import { addTickets } from './mileage.ts';
import { addEffect } from './effects.ts';
import { unlockedTypeIds, walletOf } from './segments.ts';
import { addRegularGauge } from './interact.ts';
import { siteOf } from './site.ts';
import { cornerOfPiece } from './corners.ts';
import { popularityFor, BASE_POPULARITY } from './compat.ts';
import { CLEAN_MAX } from './cleanliness.ts';
import { dailyGuestCount, hourShare, freeSeats, totalSeats, seatGuestFromQueue, typeWeight, updateGuests } from './guests.ts';
import { activeTipMult, instantOf, clearInstant } from './skillActive.ts'; // 직원 액티브 스킬 본체는 skillActive.ts — 러시는 즉발 효과(착석·인내)만 받아 먹는다
import { spawnRouteWeights, routeTagMult } from './entry.ts'; // 러시 줄도 경로 비중(정류장·주차장·올레)을 그대로 따른다

// ---------- 주·요일 ----------
/** 한 주 = 7일. 달마다 1일이 그 주의 첫날 (30일 = 4주 + 2일). */
export const WEEK_DAYS = 7;
/** 요일 0~6 (0 = 그 주 첫날 = 「월요일」, 5 = 「토요일」 러시, 6 = 「일요일」) */
export function weekdayOf(day: number): number {
  return (day - 1) % WEEK_DAYS;
}
/** 주 번호 (게임 시작부터 누적) — 같은 주에 러시가 두 번 열리지 않게 하는 열쇠 */
export function weekIndexOf(state: GameState): number {
  return Math.floor(dayIndex(state.clock) / WEEK_DAYS);
}

// ---------- 시간표 ----------
export const RUSH_WEEKDAY = 5;          // 러시는 그 주 6일차(토요일)
export const RUSH_NOTICE_WEEKDAY = 4;   // 예고는 하루 전(금요일) 아침
export const RUSH_READY_HOUR = 11;      // 11시 카운트다운 시작
export const RUSH_START_HOUR = 12;      // 12시 점심 러시
export const RUSH_RUN_HOURS = 3;        // 12:00~15:00
export const RUSH_READY_MS = HOUR_MS;                    // 카운트다운이 먹는 게임 시간 (11~12시)
export const RUSH_RUN_MS = RUSH_RUN_HOURS * HOUR_MS;     // 러시 본편이 먹는 게임 시간
/** §7-1 기준 배속 */
export const RUSH_TARGET_SPEED = 3;
/** 3배속에서 카운트다운·러시가 실제로 걸리는 시간(초) — 이 둘이 「러시 60~90초」다 */
export const RUSH_READY_SECONDS = 20;
export const RUSH_RUN_SECONDS = 45;
/** 실시간 → 게임 ms 환산 배수 (tick에서만 쓴다). 게임 구간 ÷ (배속 × 목표 실시간) */
export const RUSH_READY_SCALE = RUSH_READY_MS / (RUSH_TARGET_SPEED * RUSH_READY_SECONDS * 1000);
export const RUSH_RUN_SCALE = RUSH_RUN_MS / (RUSH_TARGET_SPEED * RUSH_RUN_SECONDS * 1000);

/** 3배속 1주 사이클 길이(초) — §7-1 측정용. 러시 구간만 늦춘 만큼 더해 준다. */
export function weekCycleSeconds(): number {
  const plain = (WEEK_DAYS * DAY_MS - RUSH_READY_MS - RUSH_RUN_MS) / RUSH_TARGET_SPEED;
  return (plain + (RUSH_READY_SECONDS + RUSH_RUN_SECONDS) * 1000) / 1000;
}
/** 러시 한 판 길이(초, 3배속) */
export function rushSeconds(): number {
  return RUSH_READY_SECONDS + RUSH_RUN_SECONDS;
}
/** 3배속에서 「실시간 sec초」에 해당하는 러시 중 게임 ms */
export function rushMsOfSeconds(sec: number): number {
  return Math.round(sec * 1000 * RUSH_TARGET_SPEED * RUSH_RUN_SCALE);
}

// ---------- 줄·인내 ----------
/** 러시 중 손님 스폰 배수 (평소의 3배) */
export const RUSH_SPAWN_MULT = 3;
/** 러시에서 한 명을 받을 때마다 그날 남은 스폰 몫에서 빼는 양 (0이면 러시가 손님 수를 늘린다 — 밴드가 깨진다) */
export const RUSH_SPAWN_REFUND = 1;
export const RUSH_QUEUE_BASE = 12;   // 문 앞 줄 기본 상한
export const RUSH_QUEUE_MAX = 20;    // 등급·평판이 오르면 여기까지
export const RUSH_QUEUE_PER_REP = 12; // 평판 12마다 줄 +1
/** 인내 게이지 20~40초 (3배속 실시간 기준) */
export const RUSH_PATIENCE_MIN_S = 20;
export const RUSH_PATIENCE_MAX_S = 40;
/** 등급이 오를수록 인내가 짧아진다 (등급 1단계당 −6%, 최대 −24%) */
export const RUSH_PATIENCE_PER_GRADE = 0.06;
export const RUSH_PATIENCE_MIN_MULT = 0.76;
/** 자동 착석 주기 — 「지금처럼」 한 시간에 한 번 줄을 훑어 빈 자리에 앉힌다(기존 hourlySpawn과 같은 박자).
 *  그 사이(3배속 15초)에 플레이어가 직접 고르면 제 점수(+자리 보너스·콤보)를 받는다. 이 박자 덕분에
 *  **무조작 러시는 평소 착석과 같은 회전율**이라 봇 KPI 밴드가 흔들리지 않는다. */
export const RUSH_AUTO_PERIOD_MS = HOUR_MS;
/** 줄이 감당할 수 있는 양보다 이만큼까지만 선다 — 아무리 잘해도 다 못 받는 정도(긴장)이되 절망은 아니게 */
export const RUSH_ARRIVAL_OVER = 1.3;

export function rushQueueCap(state: GameState): number {
  const grade = Math.max(1, state.grade ?? 1) - 1;
  const rep = Math.max(0, Math.round(state.reputation) - REPUTATION_START);
  return Math.min(RUSH_QUEUE_MAX, RUSH_QUEUE_BASE + grade + Math.floor(rep / RUSH_QUEUE_PER_REP));
}
export function rushPatienceMult(state: GameState): number {
  return Math.max(RUSH_PATIENCE_MIN_MULT, 1 - RUSH_PATIENCE_PER_GRADE * (Math.max(1, state.grade ?? 1) - 1));
}

// ---------- 점수 ----------
export const RUSH_SCORE_PER_GUEST = 10;
export const RUSH_LEFT_PENALTY = 15;
export const RUSH_FIT_BONUS = 8;        // 취향·명당·전망이 맞는 자리
export const RUSH_FIT_VIEW = 2;         // 이 전망부터 「좋은 자리」
export const RUSH_TIP_PER_POINT = 2000; // 지갑 2,000원당 팁 1점
export const RUSH_TIP_MAX = 8;
export const RUSH_COMBO_N = 3;          // 연속 3명부터
export const RUSH_COMBO_MULT = 1.5;
/** 자동으로 앉은 손님의 점수 계수 (§2 「자동 처리는 C~B」) */
export const RUSH_AUTO_COEF = 0.6;
/** 밀린 주문 우선 처리: 조리 남은 시간을 이만큼 깎고 점수 +5 (자리마다 한 번) */
export const RUSH_PRIORITY_CUT = 0.6;
export const RUSH_PRIORITY_SCORE = 5;

// ---------- 등급 (규모 보정 상대 평가) ----------
/** 「제대로 받았을 때」 한 명당 점수 — 자동(계수 0.6)이면 이 아래, 잘 고르고 스킬을 쓰면 이 위가 된다.
 *  자동 한 명 ≈ (10 + 팁 + 자리) × 콤보 1.5 × 0.6 ≈ 20점, 손으로 고르면 ≈ 33점. 그 사이에 둔다. */
export const RUSH_EXPECT_PER_GUEST = 27;
/** 러시 3시간 동안 자리 하나가 받는 손님 (좌석 규모 보정) */
export const RUSH_SEAT_TURNOVER = 0.5;
/** 일하는 직원 한 명이 더 받게 해 주는 손님 (직원 규모 보정) */
export const RUSH_STAFF_SERVES = 2;
export const RUSH_GRADE_S = 1.3;
export const RUSH_GRADE_A = 1.0;
export const RUSH_GRADE_B = 0.7;
export const RUSH_GRADES: RushGrade[] = ['S', 'A', 'B', 'C'];
const GRADE_RANK: Record<RushGrade, number> = { S: 4, A: 3, B: 2, C: 1 };

/** 지금 규모로 받을 수 있는 손님 수 — 좌석 회전 + 일하는 직원 */
export function rushCapacity(state: GameState): number {
  const staff = state.staff.filter((st) => st.role !== null && !st.training).length;
  return Math.max(1, Math.round(totalSeats(state) * RUSH_SEAT_TURNOVER + staff * RUSH_STAFF_SERVES));
}
/** 지금 규모·이번 줄 길이로 기대되는 점수. 온 손님보다 자리가 적으면 자리가, 자리가 남으면 온 손님이 기준 —
 *  그래서 같은 규모·같은 줄이면 **조작 실력만** 등급을 가른다. */
export function rushExpectedScore(state: GameState, arrived: number): number {
  return RUSH_EXPECT_PER_GUEST * Math.max(1, Math.min(Math.max(1, arrived), rushCapacity(state)));
}
export function rushGradeOf(state: GameState, score: number, arrived: number): RushGrade {
  const ratio = score / rushExpectedScore(state, arrived);
  if (ratio >= RUSH_GRADE_S) return 'S';
  if (ratio >= RUSH_GRADE_A) return 'A';
  if (ratio >= RUSH_GRADE_B) return 'B';
  return 'C';
}

/** 등급 보상 (§2) */
export interface RushReward { tickets: number; reputation: number; guestPct: number }
export const RUSH_REWARDS: Record<RushGrade, RushReward> = {
  S: { tickets: 3, reputation: 5, guestPct: 10 },
  A: { tickets: 2, reputation: 3, guestPct: 0 },
  B: { tickets: 1, reputation: 0, guestPct: 0 },
  C: { tickets: 0, reputation: -2, guestPct: 0 },
};
/** S 보상 「다음 주 손님 +10%」가 가는 날 수 */
export const RUSH_BOOST_DAYS = WEEK_DAYS;
export const RUSH_EFFECT_SOURCE = '러시 S등급';
/** 단골 게이지 (인사 삭제 대체 — 러시 성적·요청 해결로만 찬다) */
export const RUSH_GAUGE_PER_SERVE = 0.2;
export const RUSH_GAUGE_GRADE: Record<RushGrade, number> = { S: 2, A: 1, B: 0.5, C: 0 };
/** 떠난 손님 평판 −1, 한 판에 이만큼까지만 (작은 카페가 첫 러시에 평판을 잃고 무너지지 않게) */
export const RUSH_LEFT_REPUTATION = 1;
export const RUSH_LEFT_REPUTATION_MAX = 3;
export const RUSH_LEFT_COMPLAINT_MAX = 2;

// ---------- 상태 ----------
export function initRush(): RushState {
  return { phase: 'idle', startTick: 0, endTick: 0, queue: [], score: 0, combo: 0, served: 0, left: 0, arrived: 0, grade: null, week: -1, notified: -1, elapsedMs: 0, spawnAcc: 0, streak: 0, tips: 0, bonus: 0, manual: 0, autoAtMs: RUSH_AUTO_PERIOD_MS, done: [] };
}
export function rushState(state: GameState): RushState {
  return (state.rush ??= initRush());
}
export function rushPhase(state: GameState): RushPhase {
  return state.rush?.phase ?? 'idle';
}
export function isRushRunning(state: GameState): boolean {
  return rushPhase(state) === 'run';
}
export function isRushReady(state: GameState): boolean {
  return rushPhase(state) === 'ready';
}
/** 러시(카운트다운 포함) 중인가 — 시계 환산·UI 잠금 */
export function inRush(state: GameState): boolean {
  const p = rushPhase(state);
  return p === 'ready' || p === 'run';
}
/** 누적 등급 (§5 해금 조건) */
export function rushGrades(state: GameState): Record<RushGrade, number> {
  return (state.rushGrades ??= { S: 0, A: 0, B: 0, C: 0 });
}
/** grade 이상을 받은 횟수 (rushGrade 조건 판정) */
export function rushGradeCount(state: GameState, grade: RushGrade): number {
  const g = rushGrades(state);
  return RUSH_GRADES.filter((k) => GRADE_RANK[k] >= GRADE_RANK[grade]).reduce((n, k) => n + (g[k] ?? 0), 0);
}

/** 러시 감속을 걸어 줄 「실시간 한 프레임」의 최대 길이 (ui/store.ts가 dt를 100ms로 자른다).
 *  이보다 큰 dt는 봇·테스트가 하루치·한 시간치를 한 번에 밀어 넣는 것이라 감속하지 않는다 —
 *  감속은 화면이 흐르는 속도를 위한 것이지 시뮬레이션을 늦추는 게 아니다. */
export const RUSH_REALTIME_DT_MAX = 100;
/** tick()이 실시간 dt를 게임 ms로 바꿀 때 곱하는 배수 — 러시 구간만 늦춘다 (§7-1) */
export function rushTimeScale(state: GameState, dtMs = 0): number {
  if (dtMs > RUSH_REALTIME_DT_MAX) return 1;
  const p = rushPhase(state);
  if (p === 'ready') return RUSH_READY_SCALE;
  if (p === 'run') return RUSH_RUN_SCALE;
  return 1;
}

/** 오늘이 러시 날인가 */
export function isRushDay(state: GameState): boolean {
  return weekdayOf(state.clock.day) === RUSH_WEEKDAY;
}
/** 이번 주 러시를 이미 치렀나 */
export function rushDoneThisWeek(state: GameState): boolean {
  return (state.rush?.week ?? -1) === weekIndexOf(state);
}

// ---------- 예고 (금요일 아침) ----------
export function rushNotice(state: GameState): void {
  const r = rushState(state);
  const week = weekIndexOf(state);
  if (weekdayOf(state.clock.day) !== RUSH_NOTICE_WEEKDAY || r.notified === week) return;
  r.notified = week;
  pushNotice(state, '내일 점심엔 손님이 몰려요');
  pushFx(state, { kind: 'scene', title: '러시 예고', text: '내일 낮 열두 시, 문 앞에 줄이 서요', tick: state.tick });
}

// ---------- 줄 세우기 ----------
/** 오늘 남은 시간에 올 손님 수 — 러시로 미리 받은 만큼 여기서 뺀다(하루 총량 유지). 이보다 더는 못 뺀다. */
function restOfDayGuests(state: GameState): number {
  let share = 0;
  for (let h = state.clock.hour + 1; h < END_HOUR; h++) share += hourShare(h);
  return dailyGuestCount(state) * share;
}
/** 러시 구간(12~15시)이 하루 손님에서 차지하는 비중 */
function rushHourShare(): number {
  let s = 0;
  for (let h = RUSH_START_HOUR; h < RUSH_START_HOUR + RUSH_RUN_HOURS; h++) s += hourShare(h);
  return s;
}
/** 러시 한 판에 문 앞에 설 손님 수 — 평소 그 시간대의 RUSH_SPAWN_MULT배, 다만 지금 규모로 받을 수 있는 양의 RUSH_ARRIVAL_OVER배까지.
 *  (자리 여섯 개짜리 카페에 스무 명이 몰려 전부 돌아가는 일은 재미가 아니라 벌이다) */
export function rushArrivals(state: GameState): number {
  const plain = dailyGuestCount(state) * rushHourShare();
  return Math.max(1, Math.round(Math.min(plain * RUSH_SPAWN_MULT, rushCapacity(state) * RUSH_ARRIVAL_OVER)));
}

function pickRushRoute(state: GameState): RouteId {
  const w = spawnRouteWeights(state);
  return (w.length <= 1 ? w[0]?.route : pickWeighted(state, w, (x) => x.weight)?.route) ?? 'bus';
}
function pickRushType(state: GameState, route: RouteId): string | null {
  return pickWeighted(state, unlockedTypeIds(state), (id) => typeWeight(state, id, RUSH_START_HOUR) * (route === 'bus' ? 1 : routeTagMult(route, id))) ?? null;
}
function newRushGuest(state: GameState): RushGuest | null {
  const route = pickRushRoute(state);
  const typeId = pickRushType(state, route);
  if (!typeId) return null;
  const sec = randInt(state, RUSH_PATIENCE_MIN_S, RUSH_PATIENCE_MAX_S);
  const patienceMs = Math.max(1, Math.round(rushMsOfSeconds(sec) * rushPatienceMult(state)));
  return { id: `q${state.nextId++}`, type: typeId, patienceMs, waitedMs: 0, route };
}

// ---------- 상태기계 ----------
/** 고정 스텝마다 (tick.step). dtMs는 게임 ms. */
export function updateRush(state: GameState, dtMs: number): void {
  const r = rushState(state);
  if (r.phase === 'idle' || r.phase === 'done') { maybeStartRush(state, r); return; }
  if (r.phase === 'ready') {
    r.elapsedMs += dtMs;
    if (r.elapsedMs >= RUSH_READY_MS) { r.phase = 'run'; r.elapsedMs = 0; r.autoAtMs = RUSH_AUTO_PERIOD_MS; r.startTick = state.tick; pushNotice(state, '오늘 점심 손님이 몰린다!'); }
    return;
  }
  runRush(state, r, dtMs);
}

function maybeStartRush(state: GameState, r: RushState): void {
  if (!isRushDay(state) || state.clock.hour < RUSH_READY_HOUR || rushDoneThisWeek(state)) return;
  if (state.clock.hour >= RUSH_START_HOUR + RUSH_RUN_HOURS) return; // 지나간 시간대엔 안 연다 (세이브를 늦게 열었을 때)
  const week = weekIndexOf(state);
  Object.assign(r, initRush(), { phase: 'ready' as RushPhase, week, notified: r.notified, startTick: state.tick, elapsedMs: 0 });
  pushFx(state, { kind: 'scene', title: '러시 타임', text: '열두 시, 곧 줄이 서요', tick: state.tick });
}

function runRush(state: GameState, r: RushState, dtMs: number): void {
  r.elapsedMs += dtMs; // 러시 타이머는 여기서만 흐른다 (stepRush가 시계 없이 감을 때도 같은 눈금)
  arriveGuests(state, r, dtMs);
  tickPatience(state, r, dtMs);
  autoSeat(state, r);
  consumeInstant(state, r);
  if (r.elapsedMs >= RUSH_RUN_MS) finishRush(state, r);
}

/** 줄 세우기: 러시 전체 도착 수를 구간 길이로 나눠 소수 누적 */
function arriveGuests(state: GameState, r: RushState, dtMs: number): void {
  r.spawnAcc += (rushArrivals(state) * dtMs) / RUSH_RUN_MS;
  let n = Math.floor(r.spawnAcc + 1e-9);
  r.spawnAcc -= n;
  const cap = rushQueueCap(state);
  while (n-- > 0) {
    if (r.queue.length >= cap) continue; // 줄이 꽉 차면 그냥 지나간다 (불만 없음)
    const g = newRushGuest(state);
    if (!g) return;
    r.queue.push(g);
    r.arrived++;
  }
}

/** 인내 게이지 — 0이면 화내고 떠난다 */
function tickPatience(state: GameState, r: RushState, dtMs: number): void {
  const stay: RushGuest[] = [];
  for (const g of r.queue) {
    g.waitedMs += dtMs;
    g.patienceMs -= dtMs;
    if (g.patienceMs > 0) { stay.push(g); continue; }
    r.left++;
    r.streak = 0;
    if (r.left <= RUSH_LEFT_REPUTATION_MAX) addReputation(state, -RUSH_LEFT_REPUTATION);
    if (r.left <= RUSH_LEFT_COMPLAINT_MAX) addComplaint(state, 'no_seat', g.type);
    pushFx(state, { kind: 'react', guestId: g.id, text: '너무 오래 걸려요', icon: 'sweat', tick: state.tick });
  }
  r.queue = stay;
}

/** 자동 해결: 한 시간에 한 번(기존 착석 로직과 같은 박자) 줄 앞에서부터 빈 자리에 앉힌다 (점수 계수 0.6) */
function autoSeat(state: GameState, r: RushState): void {
  if (r.elapsedMs < r.autoAtMs) return;
  r.autoAtMs += RUSH_AUTO_PERIOD_MS;
  let guard = RUSH_QUEUE_MAX;
  while (guard-- > 0) {
    const g = r.queue[0];
    if (!g) return;
    if (!seatOne(state, r, g, null, false)) return; // 빈 자리가 없다
  }
}

/** 줄의 손님 하나를 자리에 앉힌다. seat이 null이면 가장 가까운 빈 자리. manual이면 제 점수. */
function seatOne(state: GameState, r: RushState, g: RushGuest, seat: PlacedObject | null, manual: boolean): boolean {
  const guest = seatGuestFromQueue(state, g.type, seat, g.route ?? 'bus');
  if (!guest) return false;
  const i = r.queue.indexOf(g);
  if (i >= 0) r.queue.splice(i, 1);
  const obj = guest.seatId ? state.objects[guest.seatId] : undefined;
  scoreServe(state, r, g.type, obj ?? null, manual);
  return true;
}

/** 자리가 손님에게 맞나 (전망·명당·상성) */
export function rushSeatFits(state: GameState, seat: PlacedObject | null, typeId: string): boolean {
  if (!seat) return false;
  if (siteOf(state, seat.x, seat.y).view >= RUSH_FIT_VIEW) return true;
  if (cornerOfPiece(state, seat.id)) return true;
  return popularityFor(state, seat.id, typeId) > BASE_POPULARITY;
}

function scoreServe(state: GameState, r: RushState, typeId: string, seat: PlacedObject | null, manual: boolean): void {
  const fit = rushSeatFits(state, seat, typeId);
  const tip = Math.min(RUSH_TIP_MAX, Math.floor(walletOf(state, typeId) / RUSH_TIP_PER_POINT)) * activeTipMult(state); // 「오늘의 특선」 팁 배수 (skillActive)
  let gain = RUSH_SCORE_PER_GUEST + tip + (fit ? RUSH_FIT_BONUS : 0);
  r.streak++;
  if (r.streak >= RUSH_COMBO_N) {
    gain *= RUSH_COMBO_MULT;
    if (r.streak % RUSH_COMBO_N === 0) r.combo++;
  }
  if (!manual) gain *= RUSH_AUTO_COEF; else r.manual++;
  r.tips += tip;
  if (fit) r.bonus += RUSH_FIT_BONUS;
  r.score += Math.round(gain);
  r.served++;
  r.done.push(typeId);
  addRegularGauge(state, typeId, RUSH_GAUGE_PER_SERVE); // 인사 삭제 대체: 게이지는 러시 성적·요청 해결로만 찬다
  // 러시는 하루 손님을 **늘리는** 게 아니라 **몰아치게** 하는 사건이다 — 받은 만큼 그날 남은 스폰 몫에서 뺀다
  // (hourlyRegulars가 단골을 그날 손님 수 안에서 받는 것과 같은 방식). 안 그러면 좌석 회전율이 올라 3년차 자금 밴드(§4.6)가 깨진다.
  state.spawnAcc = Math.max(-restOfDayGuests(state), state.spawnAcc - RUSH_SPAWN_REFUND);
}

// ---------- 액티브 스킬 즉발 효과 ----------
/** skillActive.ts가 적어 둔 「방금 쓴 즉발 스킬」을 러시가 받아 먹는다 (같은 것을 두 번 먹지 않게 표식을 지운다).
 *  능숙한 안내(seatFront) = 맨 앞 n명 즉시 착석, 여유 한 마디(patience) = 줄 선 모두의 인내 +n초. */
function consumeInstant(state: GameState, r: RushState): void {
  const seatN = Math.round(instantOf(state, 'seatFront'));
  if (seatN > 0) {
    clearInstant(state, 'seatFront');
    for (let i = 0; i < seatN; i++) {
      const g = r.queue[0];
      if (!g || !seatOne(state, r, g, null, true)) break;
    }
  }
  const patSec = instantOf(state, 'patience');
  if (patSec > 0) {
    clearInstant(state, 'patience');
    const add = rushMsOfSeconds(patSec);
    for (const g of r.queue) g.patienceMs += add;
  }
}

// ---------- 마무리·정산 ----------
function finishRush(state: GameState, r: RushState): void {
  // 남은 줄은 그대로 돌아간다 (이미 인내가 남아 있어도 러시가 끝나면 집에 간다 — 벌점은 없다)
  r.left += r.queue.length; // 문을 닫을 때까지 못 앉은 사람도 놓친 손님
  r.queue = [];
  r.phase = 'done';
  r.endTick = state.tick;
  r.score = Math.max(0, r.score - r.left * RUSH_LEFT_PENALTY);
  const grade = rushGradeOf(state, r.score, r.arrived);
  r.grade = grade;
  rushGrades(state)[grade]++;
  const rw = RUSH_REWARDS[grade];
  if (rw.tickets > 0) addTickets(state, rw.tickets, `러시 ${grade}등급`);
  if (rw.reputation !== 0) addReputation(state, rw.reputation);
  state.effects = state.effects.filter((e) => e.source !== RUSH_EFFECT_SOURCE); // 지난주 보너스는 겹치지 않게 갈아 끼운다
  if (rw.guestPct > 0) addEffect(state, { kind: 'spawnMult', mult: 1 + rw.guestPct / 100, days: RUSH_BOOST_DAYS, source: RUSH_EFFECT_SOURCE });
  const gauge = RUSH_GAUGE_GRADE[grade];
  const top = topServedType(r);
  if (gauge > 0 && top) addRegularGauge(state, top, gauge);
  pushNotice(state, `러시 ${grade}등급 — 받은 손님 ${r.served}명 · 놓친 손님 ${r.left}명`);
  pushFx(state, { kind: 'scene', title: `러시 ${grade}등급`, text: `${r.served}명을 받았어요 · ${r.score}점`, tick: state.tick });
}

function topServedType(r: RushState): string | null {
  const counts = new Map<string, number>();
  for (const t of r.done) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [t, c] of counts) if (c > n) { best = t; n = c; }
  return best;
}

// ---------- 액션 (actions.ts에서 부른다) ----------

/** 줄 → 자리 배정. guestId는 RushGuest.id, objectId는 좌석 오브젝트. */
export function canSeatFromQueue(state: GameState, guestId: string, objectId: string): ApplyResult {
  if (!isRushRunning(state)) return { ok: false, reason: '러시 때만 돼요' };
  const r = rushState(state);
  if (!r.queue.some((g) => g.id === guestId)) return { ok: false, reason: '그 손님은 갔어요' };
  const seat = state.objects[objectId];
  if (!seat) return { ok: false, reason: '없는 자리예요' };
  if (!freeSeats(state).some((o) => o.id === objectId)) return { ok: false, reason: '이미 손님이 있어요' };
  return { ok: true };
}
/** 호출 전 canSeatFromQueue. 앉히면 제 점수(취향·명당이면 보너스)와 콤보가 붙는다. */
export function seatFromQueue(state: GameState, guestId: string, objectId: string): boolean {
  const r = rushState(state);
  const g = r.queue.find((x) => x.id === guestId);
  const seat = state.objects[objectId];
  if (!g || !seat) return false;
  return seatOne(state, r, g, seat, true);
}

/** 밀린 주문 우선 처리: 그 자리의 조리를 앞당기고, 가장 가까운 직원을 그 자리로 보낸다 (자리마다 한 번) */
export function canRushPriority(state: GameState, objectId: string): ApplyResult {
  if (!isRushRunning(state)) return { ok: false, reason: '러시 때만 돼요' };
  const r = rushState(state);
  if ((r.priorityDone ??= []).includes(objectId)) return { ok: false, reason: '이미 부탁했어요' }; // 자리마다 한 번
  const seat = state.objects[objectId];
  if (!seat) return { ok: false, reason: '없는 자리예요' };
  if (!waitingGuestAt(state, objectId)) return { ok: false, reason: '기다리는 주문이 없어요' };
  return { ok: true };
}
function waitingGuestAt(state: GameState, objectId: string) {
  return state.guests.find((g) => g.seatId === objectId && g.phase === 'seated' && g.mood === null && g.waitMs > 0) ?? null;
}
/** 자리에서 가장 가까운 일하는 직원 (없으면 null) */
export function nearestStaff(state: GameState, seat: PlacedObject): string | null {
  let best: { id: string; d: number } | null = null;
  for (const role of ['hall', 'barista', 'cook', 'clean'] as RoleId[]) {
    for (const st of staffInRole(state, role)) {
      const d = Math.abs(st.x - seat.x) + Math.abs(st.y - seat.y);
      if (!best || d < best.d) best = { id: st.id, d };
    }
  }
  return best?.id ?? null;
}
/** 호출 전 canRushPriority. */
export function rushPriority(state: GameState, objectId: string): boolean {
  const r = rushState(state);
  const seat = state.objects[objectId];
  const g = waitingGuestAt(state, objectId);
  if (!seat || !g) return false;
  g.waitMs = Math.round(g.waitMs * (1 - RUSH_PRIORITY_CUT));
  (r.priorityDone ??= []).push(objectId);
  r.priority = { objectId, staffId: nearestStaff(state, seat) };
  r.score += RUSH_PRIORITY_SCORE;
  r.manual++;
  pushFx(state, { kind: 'pop', x: seat.x, y: seat.y, n: RUSH_PRIORITY_SCORE, tick: state.tick });
  return true;
}

// ---------- 봇·헤드리스 ----------
/** 시계를 돌리지 않고 러시만 한 걸음 감는다 (헤드리스·측정·조작 실험용). 줄·인내·자동 착석 + 앉은 손님 진행. */
export function stepRush(state: GameState): void {
  const r = rushState(state);
  if (r.phase !== 'run') return;
  runRush(state, r, RUSH_STEP_MS);
  updateGuests(state, RUSH_STEP_MS);
}
/** 카운트다운을 건너뛰고 바로 러시를 시작한다 (측정·테스트용) */
export function startRushNow(state: GameState): RushState {
  const r = rushState(state);
  if (r.phase !== 'run') { r.phase = 'run'; r.elapsedMs = 0; r.autoAtMs = RUSH_AUTO_PERIOD_MS; r.startTick = state.tick; r.week = weekIndexOf(state); }
  return r;
}
/** 조작 없이 러시를 끝까지 돌려 점수를 낸다 (결정적, UI 없음). 시계는 건드리지 않는다 — 러시 타이머만 감는다.
 *  러시 중이 아니면 null. 점수 계수 0.6이 걸린 자동 착석만 일어나므로 등급은 대개 C~B다. */
export function resolveRushAuto(state: GameState): RushState | null {
  const r = rushState(state);
  if (r.phase === 'ready') startRushNow(state);
  if (r.phase !== 'run') return null;
  let guard = Math.ceil(RUSH_RUN_MS / RUSH_STEP_MS) + 8;
  while (r.phase === 'run' && guard-- > 0) stepRush(state);
  return r;
}
/** resolveRushAuto가 감는 한 걸음 (고정 스텝과 같은 눈금) */
export const RUSH_STEP_MS = HOUR_MS / 20;

/** 「오늘 할 일」·진단용 한 줄 — 다음 러시까지 며칠인가 (오늘이면 0) */
export function daysToRush(state: GameState): number {
  const wd = weekdayOf(state.clock.day);
  if (wd === RUSH_WEEKDAY && !rushDoneThisWeek(state)) return 0;
  return (RUSH_WEEKDAY - wd + WEEK_DAYS) % WEEK_DAYS || WEEK_DAYS;
}
/** 마지막 러시 결과 (UI·진단) */
export function lastRushGrade(state: GameState): RushGrade | null {
  return state.rush?.grade ?? null;
}

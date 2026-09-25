/**
 * 러시 타임 다리 (rush-battle §2·§3) — **UI가 sim을 읽고 액션만 보내는 얇은 층**.
 *
 * 러시 본체는 `src/sim/rush.ts`(줄·인내·점수·등급·보상)에 있다.
 * 여기서는 화면이 쓰기 좋은 모양으로 바꿔 주고(남은 시간 초, 인내 비율, 스킬 카드), 탭을 액션으로 보낸다.
 * **상태를 따로 들고 있지 않는다** — 점수·평판·응모권은 모두 sim이 세이브에 적는다.
 *
 * 시간 단위: sim은 게임 ms로 적고, 화면은 「3배속 실시간 초」로 보여 준다. rushMsOfSeconds가 둘을 잇는다.
 */
import { useSyncExternalStore } from 'react';
import type { GameState, PlacedObject } from '../sim/index.ts';
import {
  isSeat, seatsOf, objectReachable, objectStats, totalSeats,
  rushState, rushPhase, rushGradeOf, rushArrivals, rushExpectedScore, rushSeatFits, rushQueueCap,
  canSeatFromQueue, canRushPriority,
  weekdayOf as simWeekdayOf, startRushNow, lastRushGrade,
  RUSH_WEEKDAY as SIM_RUSH_WEEKDAY, RUSH_NOTICE_WEEKDAY, RUSH_START_HOUR, RUSH_RUN_MS, RUSH_RUN_SECONDS,
  RUSH_SCORE_PER_GUEST, RUSH_LEFT_PENALTY, RUSH_PRIORITY_SCORE, RUSH_COMBO_N, RUSH_COMBO_MULT,
  RUSH_REWARDS, rushMsOfSeconds,
} from '../sim/index.ts';
import { dispatch, getState, subscribe, isPausedByUi } from './store';
import { noteTutorial } from './tutorialDialogue';

// ---------- 화면이 쓰는 모양 ----------

export type RushPhase = 'idle' | 'ready' | 'run' | 'done';
export type RushGrade = 'S' | 'A' | 'B' | 'C';
export interface RushQueueGuest {
  id: string;
  /** 손님층 id (guests.json) */
  type: string;
  /** 인내 전체(ms) */
  patience: number;
  /** 남은 인내(ms) */
  patienceLeft: number;
}
export interface RushState {
  phase: RushPhase;
  queue: RushQueueGuest[];
  score: number;
  combo: number;
  served: number;
  left: number;
  grade: RushGrade;
  endTick: number;
}

// ---------- 주간 리듬 (§1) ----------

/** 게임 날짜(1~30)를 요일 1~7로. 5 = 예고(금), 6 = 러시(토) */
export function weekdayOf(clock: GameState['clock']): number {
  return simWeekdayOf(clock.day) + 1;
}
export const NOTICE_WEEKDAY = RUSH_NOTICE_WEEKDAY + 1;
export const RUSH_WEEKDAY = SIM_RUSH_WEEKDAY + 1;
export const RUSH_HOUR = RUSH_START_HOUR;
/** 러시 한 판 길이 (3배속 실시간 ms) */
export const RUSH_LEN_MS = RUSH_RUN_SECONDS * 1000;
/** 몇 주째인가 (예고·결과를 주마다 한 번만 띄우는 열쇠) */
export function weekKeyOf(s: GameState): string {
  return `${s.clock.year}-${s.clock.month}-${Math.floor((s.clock.day - 1) / 7)}`;
}
/** 오늘이 예고하는 날인가 (금요일) */
export function isNoticeDay(s: GameState): boolean {
  return weekdayOf(s.clock) === NOTICE_WEEKDAY;
}
/** 지금이 러시가 시작될 때인가 (토요일 12시부터) */
export function isRushTime(s: GameState): boolean {
  return weekdayOf(s.clock) === RUSH_WEEKDAY && s.clock.hour >= RUSH_HOUR;
}

// ---------- 설정: 「러시 자동 진행」 ----------

const AUTO_KEY = 'jeju-cafe:rushAuto';
/** 자동으로 앉은 손님의 점수 계수 (§7-2 — 조작이 점수를 20% 넘게 바꾼다). sim의 RUSH_AUTO_COEF와 같은 값. */
export const AUTO_SCORE_MULT = 0.6;
let autoOn: boolean = (() => { try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; } })();
const autoListeners = new Set<() => void>();
export function rushAutoOn(): boolean { return autoOn; }
export function setRushAutoOn(v: boolean): void {
  autoOn = v;
  try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* noop */ }
  for (const l of autoListeners) l();
}
export function useRushAutoPref(): boolean {
  return useSyncExternalStore((l) => { autoListeners.add(l); return () => { autoListeners.delete(l); }; }, rushAutoOn, rushAutoOn);
}

// ---------- 점수·등급 (§2) ----------

export const SCORE_PER_GUEST = RUSH_SCORE_PER_GUEST;
export const SCORE_PER_LEFT = RUSH_LEFT_PENALTY;
export const SCORE_URGENT = RUSH_PRIORITY_SCORE;
export const SCORE_SKILL = RUSH_PRIORITY_SCORE;
/** 연속 이만큼부터 콤보 배수 */
export const COMBO_FROM = RUSH_COMBO_N;
export const COMBO_MULT = RUSH_COMBO_MULT;
/** 등급별 보상 한 줄 (결과 카드) — sim의 RUSH_REWARDS를 그대로 읽어 적는다 */
export const GRADE_REWARD_TEXT: Record<RushGrade, string> = {
  S: rewardText('S'), A: rewardText('A'), B: rewardText('B'), C: rewardText('C'),
};
function rewardText(g: RushGrade): string {
  const rw = RUSH_REWARDS[g];
  const parts: string[] = [];
  if (rw.tickets > 0) parts.push(`응모권 ${rw.tickets}`);
  if (rw.reputation !== 0) parts.push(`평판 ${rw.reputation > 0 ? '+' : ''}${rw.reputation}`);
  if (rw.guestPct > 0) parts.push(`다음 주 손님 +${rw.guestPct}%`);
  return parts.join(' · ');
}

/** 이번 판 기준 점수 (지금 규모로 「줄을 다 받았을 때」) */
export function rushPar(s: GameState = getState()): number {
  const r = s.rush;
  return Math.round(rushExpectedScore(s, r && r.arrived > 0 ? r.arrived : rushArrivals(s)));
}
/** 기준 점수 대비 등급 */
export function gradeFor(score: number, par: number): RushGrade {
  const s = getState();
  const arrived = par > 0 ? par / Math.max(1, rushExpectedScore(s, 1)) : 1;
  return rushGradeOf(s, score, Math.max(1, Math.round(arrived)));
}

// ---------- 지난 성적 (진단·오늘 할 일이 읽는다) ----------

export interface RushResult {
  weekKey: string;
  grade: RushGrade;
  score: number;
  par: number;
  served: number;
  left: number;
  tip: number;
  bestCombo: number;
  /** 가장 큰 놓친 까닭 */
  missKey: 'queue' | 'slow' | 'none';
  auto: boolean;
}
/** 마지막 러시 성적 — sim의 state.rush가 곧 성적표다 (저장·불러오기가 그대로 따라온다) */
export function lastRushResult(s: GameState = getState()): RushResult | null {
  const r = s.rush;
  if (!r || r.phase !== 'done' || !r.grade) return null;
  return {
    weekKey: weekKeyOf(s),
    grade: r.grade,
    score: r.score,
    par: rushPar(s),
    served: r.served,
    left: r.left,
    tip: r.tips,
    bestCombo: r.combo,
    missKey: r.left === 0 ? 'none' : freeSeatIds(s).length === 0 ? 'queue' : 'slow',
    auto: r.manual === 0,
  };
}
export function useLastRushResult(): RushResult | null {
  return useSyncExternalStore(subscribe, () => lastRushResult(getState()), () => null);
}

// ---------- 구독 ----------

/** 러시 상태가 바뀔 때마다 (sim 스토어 구독 한 줄) */
export function subscribeRush(l: () => void): () => void { return subscribe(l); }

/** 줄에 설 손님 수 (예고 카드 — 이번 주에 몇 명이 올 것 같은가) */
export function queueSizeFor(s: GameState): number {
  return Math.min(rushQueueCap(s), rushArrivals(s));
}

/** 러시를 시작한다 (카운트다운이 끝나면 RushShow가 부른다).
 *  평소엔 sim이 12시에 저절로 연다 — 여기서는 카운트다운을 본 직후 바로 줄이 서게 한 번 밀어 준다. */
export function startRush(s: GameState): void {
  if (rushPhase(s) === 'run') return;
  startRushNow(s);
}
/** 결과 카드를 닫는다 — sim 상태는 다음 주 러시가 알아서 갈아 끼운다 */
export function endRush(): void { /* sim이 상태를 들고 있어 따로 지울 게 없다 */ }

/** 한 프레임 진행 — sim의 tick이 러시를 굴린다. 화면은 다시 그리기만 하면 된다. */
export function rushTick(_dtMs: number): void { /* noop: sim tick이 굴린다 */ }

/** 주문이 이만큼 밀리면 말풍선이 빨개진다 (게임 ms) */
export const ORDER_URGENT_MS = rushMsOfSeconds(9);

/** 줄 맨 앞 손님 (없으면 null) */
export function frontGuest(s: GameState): RushQueueGuest | null {
  return rushOf(s)?.queue[0] ?? null;
}

function freeSeatIds(s: GameState): PlacedObject[] {
  return Object.values(s.objects).filter((o) => isSeat(s, o) && canSeatHere(s, o).ok);
}

/** 이 자리에 맨 앞 손님을 앉힐 수 있나. 못 앉히면 이유 한 줄. */
export function canSeatHere(s: GameState, o: PlacedObject): { ok: boolean; reason?: string } {
  if (!isSeat(s, o)) return { ok: false, reason: '앉을 수 있는 자리가 아니에요' };
  const taken = s.guests.filter((g) => g.seatId === o.id && g.phase !== 'leaving').length;
  if (taken >= seatsOf(s, o)) return { ok: false, reason: '이미 손님이 앉았어요' };
  if (!objectReachable(s, o)) return { ok: false, reason: '손님이 걸어갈 길이 없어요' };
  return { ok: true };
}

/** 밀린 주문이 있는 자리인가 (빨간 칸) */
function isUrgentSeat(s: GameState, o: PlacedObject): boolean {
  return canRushPriority(s, o.id).ok;
}

/** 러시 중 칠할 칸.
 *  `fit` 금색 = **줄 맨 앞 손님한테 잘 맞는 자리**(+8점) · `ok` 초록 = 앉힐 수는 있다 ·
 *  `no` 회색 = 못 앉힌다 · `urgent` 빨강 = 주문이 밀렸다.
 *  금색이 따로 없으면 어느 칸이 제일 나은지 알 길이 없어 「제일 가까운 초록 누르기」가 최적 플레이가 된다. */
export interface RushMark { x: number; y: number; w: number; h: number; kind: 'ok' | 'no' | 'urgent' | 'fit'; id: string }
export function rushMarks(s: GameState): RushMark[] {
  if (rushPhase(s) !== 'run') return [];
  const front = frontGuest(s);
  const out: RushMark[] = [];
  for (const o of Object.values(s.objects)) {
    if (!isSeat(s, o)) continue;
    const can = canSeatHere(s, o);
    const kind = isUrgentSeat(s, o) ? 'urgent'
      : !can.ok ? 'no'
      : front && rushSeatFits(s, o, front.type) ? 'fit'
      : 'ok';
    out.push({ x: o.x, y: o.y, w: o.w ?? 1, h: o.h ?? 1, id: o.id, kind });
  }
  return out;
}

/** 자리 하나가 「잘 맞는 자리」인가 — 맨 앞 손님 기준 (초록 칸 중 반짝이는 것) */
export function seatFits(s: GameState, o: PlacedObject): boolean {
  const front = frontGuest(s);
  if (!front) return false;
  try { return rushSeatFits(s, o, front.type); } catch { return objectStats(s, o.id).popularity >= 12; }
}

export interface SeatOutcome { ok: boolean; reason?: string; gained: number; combo: number; fit: boolean }

/** 줄 맨 앞 손님을 이 자리에 앉힌다. 성공하면 얻은 점수·콤보를 돌려준다 (fx용). */
export function seatFront(s: GameState, objectId: string): SeatOutcome {
  const front = frontGuest(s);
  if (!front) return { ok: false, reason: '줄에 선 손님이 없어요', gained: 0, combo: 0, fit: false };
  const can = canSeatFromQueue(s, front.id, objectId);
  if (!can.ok) return { ok: false, reason: can.reason, gained: 0, combo: 0, fit: false };
  const before = s.rush?.score ?? 0;
  const o = s.objects[objectId];
  const fit = !!o && rushSeatFits(s, o, front.type);
  const r = dispatch({ type: 'seatFromQueue', guestId: front.id, objectId });
  if (!r.ok) return { ok: false, reason: r.reason, gained: 0, combo: 0, fit: false };
  const now = getState().rush;
  return { ok: true, gained: Math.max(0, (now?.score ?? before) - before), combo: now?.combo ?? 0, fit };
}

/** 밀린 주문 긴급 처리 (빨개진 자리 탭) */
export function urgentAt(s: GameState, objectId: string): SeatOutcome {
  const can = canRushPriority(s, objectId);
  if (!can.ok) return { ok: false, reason: can.reason, gained: 0, combo: 0, fit: false };
  const before = s.rush?.score ?? 0;
  const r = dispatch({ type: 'rushPriority', objectId });
  if (!r.ok) return { ok: false, reason: r.reason, gained: 0, combo: 0, fit: false };
  const now = getState().rush;
  return { ok: true, gained: Math.max(0, (now?.score ?? before) - before), combo: now?.combo ?? 0, fit: false };
}

// ---------- 셀렉터 ----------

/** 지금 러시 상태 (sim 상태를 화면 모양으로) */
export function rushOf(s: GameState): RushState | null {
  const r = s.rush;
  if (!r) return null;
  const patienceFull = rushMsOfSeconds(40);
  return {
    phase: r.phase,
    queue: r.queue.map((g) => ({
      id: g.id, type: g.type,
      patience: Math.max(g.patienceMs + g.waitedMs, patienceFull),
      patienceLeft: Math.max(0, g.patienceMs),
    })),
    score: Math.max(0, r.score),
    combo: r.combo,
    served: r.served,
    left: r.left,
    grade: r.grade ?? rushGradeOf(s, Math.max(0, r.score), Math.max(1, r.arrived)),
    endTick: r.endTick,
  };
}
/** 남은 시간(3배속 실시간 ms) */
export function rushTimeLeftMs(s: GameState): number {
  const r = s.rush;
  if (!r || r.phase !== 'run') return 0;
  const leftGameMs = Math.max(0, RUSH_RUN_MS - r.elapsedMs);
  return Math.round((leftGameMs / rushMsOfSeconds(1)) * 1000);
}
/** 지금 등급 */
export function rushGradeNow(s: GameState): RushGrade {
  return rushOf(s)?.grade ?? lastRushGrade(s) ?? 'C';
}
/** 러시 결과 카드가 떠 있을 만한 때인가 — 그동안 보상 상자·알림 대화는 미뤄 둔다.
 *  안 그러면 결과 카드 위에 「한꺼번에! 보상 6개」와 「단골이 생겼다」가 쌓여 셋이 겹친다. */
export function rushResultOpen(s: GameState): boolean {
  return s.rush?.phase === 'done' && isRushTime(s);
}
/** 러시가 굴러가는 중인가 (HUD를 띄울 때) */
export function rushRunning(s: GameState): boolean {
  return rushPhase(s) === 'run';
}
/** 이번 판 팁·최고 콤보 (결과 카드) */
export function rushTally(s: GameState = getState()): { tip: number; bestCombo: number } {
  return { tip: s.rush?.tips ?? 0, bestCombo: s.rush?.combo ?? 0 };
}
/** 이번 판에 문 앞에 선 손님 수 (결과 카드·진단) */
export function rushArrived(s: GameState = getState()): number {
  return s.rush?.arrived ?? 0;
}
/** 좌석이 모자라 못 받았나 (준비 체크리스트) */
export function seatsShort(s: GameState): boolean {
  return totalSeats(s) < queueSizeFor(s);
}

// ---------- 튜토리얼 표식 (1막 「첫 러시」·2막 「직원 재주」) ----------

/** 줄에서 손님을 앉힐 때마다 한 번. 두 번째부터 `rushSeat2` — sim은 이 표식만 보고 단계를 끝낸다. */
export function noteRushSeat(): void {
  const seen = getState().tutorial.seen ?? [];
  noteTutorial(seen.includes('rushSeat1') ? 'rushSeat2' : 'rushSeat1');
}
/** 창·대화로 멈춰 있으면 러시도 멈춘다 (§2: 일시정지는 가능) */
export function rushPaused(s: GameState): boolean {
  return isPausedByUi() || s.clock.speed === 0;
}

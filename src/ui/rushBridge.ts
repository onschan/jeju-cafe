/**
 * 러시 타임 다리 (rush-battle §2·§3). **UI 트랙(rush2) 소유** — `src/sim/**`은 읽기만 한다.
 *
 * sim(`src/sim/rush.ts`)은 병렬 트랙 rush1이 만든다. 그 인터페이스(`state.rush`·`seatFromQueue`·
 * `useStaffSkill`·`rushPriority`·`rushTimeLeft`·`rushGradeNow`)를 그대로 가정하고,
 * 아직 없을 때는 **여기 임시 엔진**이 같은 모양을 만들어 화면·조작을 끝까지 굴린다.
 * sim이 들어오면 `hasSimRush()`가 참이 되어 임시 엔진은 저절로 잠든다 — 지울 곳은 `TODO(rush1)`.
 *
 * 임시 엔진은 sim 상태를 건드리지 않는다(점수·평판·응모권을 주지 않는다). 성적만 localStorage에 남겨
 * 진단 카드·오늘 할 일이 읽는다.
 */
import { useSyncExternalStore } from 'react';
import type { Action, GameState, PlacedObject } from '../sim/index.ts';
import { freeSeats, isSeat, objectStats, seatsOf, totalSeats, objectReachable } from '../sim/index.ts';
import { GUEST_TYPES } from '../data/index.ts';
import { dispatch, getState, isPausedByUi } from './store';
import { noteTutorial } from './tutorialDialogue';

// ---------- rush1이 만들 모양 ----------

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

/** sim이 러시를 맡고 있나 (rush1이 `state.rush`를 넣으면 참) */
export function hasSimRush(s: GameState): boolean {
  const r = (s as unknown as { rush?: { phase?: unknown } }).rush;
  return !!r && typeof r.phase === 'string';
}
function simRush(s: GameState): RushState | null {
  return hasSimRush(s) ? ((s as unknown as { rush: RushState }).rush) : null;
}

// ---------- 주간 리듬 (§1) ----------

/** 게임 날짜(1~30)를 요일 1~7로. 5 = 예고(금), 6 = 러시(토) */
export function weekdayOf(clock: GameState['clock']): number {
  return ((clock.day - 1) % 7) + 1;
}
export const NOTICE_WEEKDAY = 5;
export const RUSH_WEEKDAY = 6;
export const RUSH_HOUR = 12;
/** 러시 한 판 길이 (3배속 60~90초 사이) */
export const RUSH_LEN_MS = 75_000;
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
/** 자동 진행이면 점수 계수가 낮다 (§7.2 — 조작이 점수를 20% 넘게 바꾼다) */
export const AUTO_SCORE_MULT = 0.5;
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

export const SCORE_PER_GUEST = 10;
export const SCORE_PER_LEFT = 15;
export const SCORE_URGENT = 8;
export const SCORE_SKILL = 5;
/** 연속 이만큼부터 콤보 배수 */
export const COMBO_FROM = 3;
export const COMBO_MULT = 1.5;
const GRADE_CUT: { grade: RushGrade; ratio: number }[] = [
  { grade: 'S', ratio: 1.4 },
  { grade: 'A', ratio: 1.1 },
  { grade: 'B', ratio: 0.8 },
  { grade: 'C', ratio: -Infinity },
];
/** 기준 점수 대비 등급. par는 「줄에 선 손님을 다 받았을 때」 */
export function gradeFor(score: number, par: number): RushGrade {
  const r = par > 0 ? score / par : 0;
  return GRADE_CUT.find((g) => r >= g.ratio)!.grade;
}
export const GRADE_REWARD_TEXT: Record<RushGrade, string> = {
  S: '응모권 3 · 평판 +5 · 다음 주 손님 +10%',
  A: '응모권 2 · 평판 +3',
  B: '응모권 1',
  C: '평판 −2',
};

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
const LAST_KEY = 'jeju-cafe:rush:last';
let lastResult: RushResult | null = (() => {
  try { const raw = localStorage.getItem(LAST_KEY); return raw ? (JSON.parse(raw) as RushResult) : null; } catch { return null; }
})();
const resultListeners = new Set<() => void>();
export function lastRushResult(): RushResult | null { return lastResult; }
function setLastResult(r: RushResult | null): void {
  lastResult = r;
  try { if (r) localStorage.setItem(LAST_KEY, JSON.stringify(r)); else localStorage.removeItem(LAST_KEY); } catch { /* noop */ }
  for (const l of resultListeners) l();
}
export function useLastRushResult(): RushResult | null {
  return useSyncExternalStore((l) => { resultListeners.add(l); return () => { resultListeners.delete(l); }; }, lastRushResult, lastRushResult);
}
/** 테스트용 */
export function clearRushResult(): void { setLastResult(null); }

// ---------- 임시 엔진 (TODO(rush1): sim이 들어오면 통째로 지운다) ----------

/** 임시 엔진이 앉힌 손님 한 명 */
interface StubSeated { guestId: string; type: string; seatId: string; orderMs: number; done: boolean }
interface StubEngine {
  phase: RushPhase;
  weekKey: string;
  timeLeftMs: number;
  queue: (RushQueueGuest & { bonus: number })[];
  seated: StubSeated[];
  score: number;
  combo: number;
  bestCombo: number;
  served: number;
  left: number;
  tip: number;
  par: number;
  /** 직원 id → 남은 쿨다운(ms) */
  cooldown: Record<string, number>;
  /** 팁 ×2 남은 시간(요리사 「오늘의 특선」) */
  tipBoostMs: number;
  autoAccMs: number;
  auto: boolean;
}
let stub: StubEngine | null = null;
const stubListeners = new Set<() => void>();
function emitStub(): void { for (const l of stubListeners) l(); }
export function subscribeRush(l: () => void): () => void { stubListeners.add(l); return () => { stubListeners.delete(l); }; }

/** 결정적인 작은 난수 (UI 전용 — sim의 rng와 섞이지 않는다) */
function lcg(seed: number): () => number {
  let v = (seed | 0) || 1;
  return () => { v = (v * 1103515245 + 12345) & 0x7fffffff; return v / 0x7fffffff; };
}
function seedOf(key: string): number {
  let h = 7;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h;
}

/** 줄에 설 손님 수 (§2: 평소 3배, 최대 12) */
export function queueSizeFor(s: GameState): number {
  return Math.max(6, Math.min(12, Math.round(totalSeats(s) * 1.5) || 6));
}
/** 지금 열려 있는 손님층 (없으면 기본 손님층) */
function openGuestTypes(s: GameState): string[] {
  const open = GUEST_TYPES.filter((t) => s.guestTypes?.[t.id]).map((t) => t.id);
  return open.length > 0 ? open : GUEST_TYPES.slice(0, 3).map((t) => t.id);
}

/** 러시를 시작한다 (카운트다운이 끝나면 RushShow가 부른다) */
export function startRush(s: GameState): void {
  if (hasSimRush(s)) return; // sim이 맡는다
  const key = weekKeyOf(s);
  const rnd = lcg(seedOf(key));
  const types = openGuestTypes(s);
  const n = queueSizeFor(s);
  const queue = Array.from({ length: n }, (_, i) => {
    const patience = Math.round(20_000 + rnd() * 20_000);
    return {
      id: `rq${i + 1}`,
      type: types[Math.floor(rnd() * types.length)] ?? types[0]!,
      patience,
      // 뒤에 선 손님일수록 늦게 조급해진다 — 한꺼번에 다 떠나 버리지 않게
      patienceLeft: patience + i * 2_500,
      bonus: rnd() < 0.35 ? 1 : 0,
    };
  });
  stub = {
    phase: 'run', weekKey: key, timeLeftMs: RUSH_LEN_MS, queue, seated: [],
    score: 0, combo: 0, bestCombo: 0, served: 0, left: 0, tip: 0,
    par: n * SCORE_PER_GUEST, cooldown: {}, tipBoostMs: 0, autoAccMs: 0, auto: autoOn,
  };
  emitStub();
}

/** 임시 엔진을 끈다 (결과 카드를 닫을 때) */
export function endRush(): void { stub = null; emitStub(); }

/** 주문이 이만큼 밀리면 말풍선이 빨개진다 */
export const ORDER_URGENT_MS = 9_000;
/** 빨개진 주문을 이만큼 두면 팁이 깎인다 */
export const ORDER_ANGRY_MS = 18_000;
const AUTO_INTERVAL_MS = 3_500;

/** 한 프레임 진행 (RushHud의 rAF가 부른다). 멈춰 있으면 dt=0으로 온다. */
export function rushTick(dtMs: number): void {
  const st = stub;
  if (!st || st.phase !== 'run' || dtMs <= 0) return;
  const s = getState();
  st.timeLeftMs = Math.max(0, st.timeLeftMs - dtMs);
  st.tipBoostMs = Math.max(0, st.tipBoostMs - dtMs);
  for (const id of Object.keys(st.cooldown)) st.cooldown[id] = Math.max(0, (st.cooldown[id] ?? 0) - dtMs);
  // 줄: 인내가 다 되면 화내고 떠난다
  for (const g of st.queue) g.patienceLeft -= dtMs;
  const gone = st.queue.filter((g) => g.patienceLeft <= 0);
  if (gone.length > 0) {
    st.queue = st.queue.filter((g) => g.patienceLeft > 0);
    st.left += gone.length;
    st.score -= SCORE_PER_LEFT * gone.length;
    st.combo = 0;
  }
  // 앉은 손님: 주문이 밀리면 빨개지고, 더 두면 팁이 깎인다
  for (const t of st.seated) {
    if (t.done) continue;
    t.orderMs += dtMs;
    if (t.orderMs >= ORDER_ANGRY_MS) { t.done = true; st.tip = Math.max(0, st.tip - 3); st.combo = 0; }
  }
  // 자동 진행: 아무것도 안 해도 앉기는 한다 (점수 계수는 낮다)
  if (st.auto) {
    st.autoAccMs += dtMs;
    while (st.autoAccMs >= AUTO_INTERVAL_MS && st.queue.length > 0) {
      st.autoAccMs -= AUTO_INTERVAL_MS;
      const seat = freeSeats(s).find((o) => !st.seated.some((t) => t.seatId === o.id && !t.done));
      if (!seat) break;
      seatFront(s, seat.id, true);
    }
  }
  if (st.timeLeftMs <= 0) finishRush(s);
  emitStub();
}

/** 러시를 끝내고 성적을 남긴다 */
function finishRush(s: GameState): void {
  const st = stub;
  if (!st) return;
  st.phase = 'done';
  st.left += st.queue.length; // 끝까지 못 받은 줄도 놓친 손님
  st.score -= SCORE_PER_LEFT * st.queue.length;
  st.queue = [];
  const score = Math.max(0, Math.round(st.score + st.tip));
  setLastResult({
    weekKey: st.weekKey,
    grade: gradeFor(score, st.par),
    score, par: st.par, served: st.served, left: st.left, tip: st.tip, bestCombo: st.bestCombo,
    missKey: st.left === 0 ? 'none' : freeSeats(s).length === 0 ? 'queue' : 'slow',
    auto: st.auto,
  });
}

/** 줄 맨 앞 손님 (없으면 null) */
export function frontGuest(s: GameState): RushQueueGuest | null {
  return rushOf(s)?.queue[0] ?? null;
}

/** 이 자리에 맨 앞 손님을 앉힐 수 있나. 못 앉히면 이유 한 줄. */
export function canSeatHere(s: GameState, o: PlacedObject): { ok: boolean; reason?: string } {
  if (!isSeat(s, o)) return { ok: false, reason: '앉을 수 있는 자리가 아니에요' };
  const st = stub;
  const taken = s.guests.filter((g) => g.seatId === o.id && g.phase !== 'leaving').length
    + (st?.seated.filter((t) => t.seatId === o.id && !t.done).length ?? 0);
  if (taken >= seatsOf(s, o)) return { ok: false, reason: '이미 손님이 앉았어요' };
  if (!objectReachable(s, o)) return { ok: false, reason: '손님이 걸어갈 길이 없어요' };
  return { ok: true };
}

/** 러시 중 초록·회색·빨강으로 칠할 칸 */
export interface RushMark { x: number; y: number; w: number; h: number; kind: 'ok' | 'no' | 'urgent'; id: string }
export function rushMarks(s: GameState): RushMark[] {
  const r = rushOf(s);
  if (!r || r.phase !== 'run') return [];
  const out: RushMark[] = [];
  for (const o of Object.values(s.objects)) {
    if (!isSeat(s, o)) continue;
    const urgent = (stub?.seated ?? []).some((t) => t.seatId === o.id && !t.done && t.orderMs >= ORDER_URGENT_MS);
    const can = canSeatHere(s, o);
    out.push({ x: o.x, y: o.y, w: o.w ?? 1, h: o.h ?? 1, id: o.id, kind: urgent ? 'urgent' : can.ok ? 'ok' : 'no' });
  }
  return out;
}

/** 자리 하나가 「잘 맞는 자리」인가 (인기 상위) — 보너스 점수·팁 */
function seatBonus(s: GameState, o: PlacedObject): number {
  try { return objectStats(s, o.id).popularity >= 12 ? 1 : 0; } catch { return 0; }
}

export interface SeatOutcome { ok: boolean; reason?: string; gained: number; combo: number; fit: boolean }

/** 줄 맨 앞 손님을 이 자리에 앉힌다. 성공하면 얻은 점수·콤보를 돌려준다 (fx용). */
export function seatFront(s: GameState, objectId: string, auto = false): SeatOutcome {
  const o = s.objects[objectId];
  if (!o) return { ok: false, reason: '없어진 자리예요', gained: 0, combo: 0, fit: false };
  const can = canSeatHere(s, o);
  if (!can.ok) return { ok: false, reason: can.reason, gained: 0, combo: 0, fit: false };
  const front = frontGuest(s);
  if (!front) return { ok: false, reason: '줄에 선 손님이 없어요', gained: 0, combo: 0, fit: false };
  if (hasSimRush(s)) { // TODO(rush1): sim이 들어오면 이 갈래만 남는다
    dispatch({ type: 'seatFromQueue', guestId: front.id, objectId } as unknown as Action);
    const r = simRush(getState());
    return { ok: true, gained: SCORE_PER_GUEST, combo: r?.combo ?? 0, fit: false };
  }
  const st = stub;
  if (!st) return { ok: false, reason: '지금은 러시가 아니에요', gained: 0, combo: 0, fit: false };
  st.queue = st.queue.filter((g) => g.id !== front.id);
  st.seated.push({ guestId: front.id, type: front.type, seatId: objectId, orderMs: 0, done: false });
  st.served++;
  st.combo++;
  st.bestCombo = Math.max(st.bestCombo, st.combo);
  const fit = seatBonus(s, o) > 0;
  let gained = SCORE_PER_GUEST + (fit ? 5 : 0);
  if (st.combo >= COMBO_FROM) gained = Math.round(gained * COMBO_MULT);
  if (auto) gained = Math.round(gained * AUTO_SCORE_MULT);
  st.score += gained;
  st.tip += (fit ? 4 : 2) * (st.tipBoostMs > 0 ? 2 : 1);
  emitStub();
  return { ok: true, gained, combo: st.combo, fit };
}

/** 밀린 주문 긴급 처리 (빨개진 자리 탭) */
export function urgentAt(s: GameState, objectId: string): SeatOutcome {
  if (hasSimRush(s)) { // TODO(rush1)
    dispatch({ type: 'rushPriority', objectId } as unknown as Action);
    return { ok: true, gained: SCORE_URGENT, combo: simRush(getState())?.combo ?? 0, fit: false };
  }
  const st = stub;
  const t = st?.seated.find((x) => x.seatId === objectId && !x.done && x.orderMs >= ORDER_URGENT_MS);
  if (!st || !t) return { ok: false, reason: '아직 밀린 주문이 아니에요', gained: 0, combo: 0, fit: false };
  t.done = true;
  st.combo++;
  st.bestCombo = Math.max(st.bestCombo, st.combo);
  let gained = SCORE_URGENT;
  if (st.combo >= COMBO_FROM) gained = Math.round(gained * COMBO_MULT);
  st.score += gained;
  st.tip += 3 * (st.tipBoostMs > 0 ? 2 : 1);
  emitStub();
  return { ok: true, gained, combo: st.combo, fit: false };
}

// ---------- 직원 스킬 (§3) ----------

export type RushRole = 'barista' | 'cook' | 'hall' | 'clean';
export interface RushSkillDef { role: RushRole; name: string; text: string; cooldownMs: number; icon: string }
export const RUSH_SKILLS: Record<RushRole, RushSkillDef> = {
  barista: { role: 'barista', name: '속사 커피', text: '12초 동안 음료가 빨리 나와요', cooldownMs: 25_000, icon: 'coffee' },
  cook: { role: 'cook', name: '오늘의 특선', text: '10초 동안 팁이 두 배예요', cooldownMs: 30_000, icon: 'meal' },
  hall: { role: 'hall', name: '능숙한 안내', text: '맨 앞 3명을 빈 자리에 앉혀요', cooldownMs: 35_000, icon: 'guest' },
  clean: { role: 'clean', name: '번개 청소', text: '청결이 오르고 손님이 느긋해져요', cooldownMs: 40_000, icon: 'sparkle' },
};
export function rushSkillOf(role: string | null): RushSkillDef | null {
  return role && role in RUSH_SKILLS ? RUSH_SKILLS[role as RushRole] : null;
}
/** 하단 카드에 올릴 직원 3~6명 (일하는 직원 중 스킬이 있는 사람) */
export function rushSkillStaff(s: GameState) {
  return s.staff.filter((w) => !w.training && rushSkillOf(w.role)).slice(0, 6);
}
/** 남은 쿨다운(ms) */
export function skillCooldownMs(s: GameState, staffId: string): number {
  if (hasSimRush(s)) return 0; // TODO(rush1): sim이 쿨다운을 들고 있다
  return stub?.cooldown[staffId] ?? 0;
}

export interface SkillOutcome { ok: boolean; reason?: string; text: string; seated: number }

/** 스킬 발동 */
export function fireSkill(s: GameState, staffId: string): SkillOutcome {
  const w = s.staff.find((x) => x.id === staffId);
  const def = rushSkillOf(w?.role ?? null);
  if (!w || !def) return { ok: false, reason: '이 직원은 러시 스킬이 없어요', text: '', seated: 0 };
  if (hasSimRush(s)) { // TODO(rush1)
    dispatch({ type: 'useStaffSkill', staffId } as unknown as Action);
    return { ok: true, text: def.text, seated: 0 };
  }
  const st = stub;
  if (!st || st.phase !== 'run') return { ok: false, reason: '지금은 러시가 아니에요', text: '', seated: 0 };
  if ((st.cooldown[staffId] ?? 0) > 0) return { ok: false, reason: '아직 준비 중이에요', text: '', seated: 0 };
  st.cooldown[staffId] = def.cooldownMs;
  let seated = 0;
  if (def.role === 'hall') {
    for (let i = 0; i < 3; i++) {
      const seat = freeSeats(s).find((o) => canSeatHere(s, o).ok);
      if (!seat || !frontGuest(s)) break;
      if (seatFront(s, seat.id).ok) seated++;
    }
  } else if (def.role === 'cook') {
    st.tipBoostMs = 10_000;
  } else if (def.role === 'barista') {
    for (const t of st.seated) if (!t.done) t.orderMs = Math.max(0, t.orderMs - 6_000);
  } else {
    for (const g of st.queue) g.patienceLeft += 6_000;
  }
  st.score += SCORE_SKILL;
  emitStub();
  return { ok: true, text: def.text, seated };
}

// ---------- 셀렉터 ----------

/** 지금 러시 상태 (sim이 있으면 sim 것, 없으면 임시 엔진 것, 둘 다 없으면 null) */
export function rushOf(s: GameState): RushState | null {
  const sim = simRush(s);
  if (sim) return sim;
  const st = stub;
  if (!st) return null;
  return {
    phase: st.phase,
    queue: st.queue.map(({ id, type, patience, patienceLeft }) => ({ id, type, patience, patienceLeft })),
    score: Math.max(0, Math.round(st.score + st.tip)),
    combo: st.combo,
    served: st.served,
    left: st.left,
    grade: gradeFor(Math.max(0, Math.round(st.score + st.tip)), st.par),
    endTick: 0,
  };
}
/** 남은 시간(ms) */
export function rushTimeLeftMs(s: GameState): number {
  if (hasSimRush(s)) {
    const sel = (s as unknown as { rushTimeLeftMs?: number }).rushTimeLeftMs;
    return typeof sel === 'number' ? sel : 0;
  }
  return stub?.timeLeftMs ?? 0;
}
/** 지금 등급 */
export function rushGradeNow(s: GameState): RushGrade {
  return rushOf(s)?.grade ?? 'C';
}
/** 러시가 굴러가는 중인가 (HUD를 띄울 때) */
export function rushRunning(s: GameState): boolean {
  return rushOf(s)?.phase === 'run';
}
/** 이번 판 par 점수 (결과 카드) */
export function rushPar(): number { return stub?.par ?? 0; }
/** 이번 판 팁·최고 콤보 (결과 카드) */
export function rushTally(): { tip: number; bestCombo: number } {
  return { tip: stub?.tip ?? 0, bestCombo: stub?.bestCombo ?? 0 };
}

// ---------- 튜토리얼 표식 (1막 「첫 러시」·2막 「직원 스킬」) ----------

/** 줄에서 손님을 앉힐 때마다 한 번. 두 번째부터 `rushSeat2` — sim은 이 표식만 보고 단계를 끝낸다. */
export function noteRushSeat(): void {
  const seen = getState().tutorial.seen ?? [];
  noteTutorial(seen.includes('rushSeat1') ? 'rushSeat2' : 'rushSeat1');
}
/** 직원 스킬을 한 번 써 봤다 */
export function noteRushSkill(): void { noteTutorial('rushSkill'); }

/** 창·대화로 멈춰 있으면 러시도 멈춘다 (§2: 일시정지는 가능) */
export function rushPaused(s: GameState): boolean {
  return isPausedByUi() || s.clock.speed === 0;
}

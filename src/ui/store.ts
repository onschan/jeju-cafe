import { useSyncExternalStore } from 'react';
import { createInitialState, tick, apply, seasonOf, LocalSaveStore, type GameState, type Action, type ApplyResult, type Mood, type Season, type CarryOver, type FinalScore, type BestRecord } from '../sim/index.ts';
import { sfx, bgm, suspendAudio, resumeAudio, type SfxName } from './audio';
import { recordMonthCard } from './best';
import { resetTutorial } from './tutorialDialogue';
import { clearDialogues } from './dialogue.ts';

const SLOT_PREFIX = 'jeju-cafe:slot:';
const saveStore = new LocalSaveStore(SLOT_PREFIX);
export const AUTO_SLOT = 0;
/** 수동 슬롯 1~3 (0은 자동 저장) */
export const SLOT_COUNT = 3;
const PLAYER_ID_KEY = 'jeju-cafe:playerId';
/** 틱이 안 바뀌어도(일시정지 등) 이 간격으로는 React를 깨운다 — 메시지 줄 회색 전환 같은 시간 기반 UI용 */
const UI_EMIT_INTERVAL_MS = 250;
const SPEED_LOCK_KEY = 'jeju-cafe:speedLock';
/** 메시지 줄(§5.5): 최근 N개만 남긴다. 새 메시지가 오면 앞에 붙는다 */
export const MESSAGE_KEEP = 10;
/** 메시지가 이 시간 지나면 회색으로 남는다 */
export const MESSAGE_FRESH_MS = 3000;
export interface UiMessage { id: number; text: string; at: number }

/** localStorage에 저장된 플레이어 id를 읽거나, 없으면 새로 만들어 저장한다. */
function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, id);
    return id;
  } catch {
    return 'local';
  }
}

// 개발 중 sim 파일을 고쳐 이 모듈이 다시 실행돼도(HMR) 플레이 중인 상태를 잇는다 — 안 그러면 시작 마당(튜토리얼 건너뜀)으로 조용히 바뀐다.
// (import.meta.hot.data는 accept 경계 모듈에만 남아 여기선 못 쓴다 → 전역에 둔다. 프로덕션 빌드에선 빠진다)
const hotGlobal = import.meta.env.DEV ? (globalThis as { __jejuHotState?: GameState }) : null;
let state: GameState = hotGlobal?.__jejuHotState ?? createInitialState(Date.now() % 1_000_000, getOrCreatePlayerId(), Date.now());
/** state를 갈아 끼울 때는 이걸로 (HMR 전역도 같이) */
function setState(s: GameState): void { state = s; if (hotGlobal) hotGlobal.__jejuHotState = s; }
if (hotGlobal) hotGlobal.__jejuHotState = state;
let version = 0;
const listeners = new Set<() => void>();
let messages: UiMessage[] = [];
let messageSeq = 0;
let viewReset: (() => void) | null = null;
/** 월말 카드가 새로 떴을 때 UI가 반응하도록 (신기록 장면 창 등) */
let monthCardHook: ((s: GameState, rec: { monthRecord: boolean; yearRecord: boolean }) => void) | null = null;
/** sim이 fx 큐에 남긴 장면(완공·★ 승급·랭크 업·가이드북 1위)을 UI 장면 창으로 */
let sceneHook: ((s: GameState, title: string, text: string) => void) | null = null;

function emit() { version++; for (const l of listeners) l(); }
function save() {
  // 창·대화로 멈춘 동안 저장하면 사용자가 고른 속도로 남긴다 (다시 열었을 때 멈춰 있지 않게)
  if (pauseDepth > 0 && state.clock.speed === 0) {
    state.clock.speed = speedBeforePause;
    const p = saveStore.save(AUTO_SLOT, state);
    state.clock.speed = 0;
    p.catch(() => showMessage('저장에 실패했어요'));
    return;
  }
  saveStore.save(AUTO_SLOT, state).catch(() => showMessage('저장에 실패했어요'));
}

export function getState() { return state; }
/** 테스트용: 스토어의 상태를 통째로 갈아 끼운다 (UI 다리들이 getState를 쓰므로 sim 상태를 심어 준다) */
export function replaceStateForTest(s: GameState): void { setState(s); emit(); }
export function getVersion() { return version; }
/** 바깥 사건(solver 워커 결과 등)으로 React를 깨운다 (solverClient) */
export function bumpVersion(): void { emit(); }
/** 메시지 줄 목록 (최신이 앞). 하단 바 위 24px 줄이 [0]을 보여 주고, 탭하면 전부 */
export function getMessages(): UiMessage[] { return messages; }
/** 가장 최근 메시지가 아직 "새것"(3초 안)인가 */
export function isMessageFresh(m: UiMessage, now = performance.now()): boolean { return now - m.at < MESSAGE_FRESH_MS; }
/** UI 안내 문구를 메시지 줄에 남긴다 ("옮길 것을 골라 주세요" 등). 같은 문구가 연달아 오면 시각만 갱신 */
export function showMessage(text: string): void {
  const now = performance.now();
  if (messages[0]?.text === text) { messages = [{ ...messages[0], at: now }, ...messages.slice(1)]; emit(); return; }
  messages = [{ id: ++messageSeq, text, at: now }, ...messages].slice(0, MESSAGE_KEEP);
  emit();
}
/** @deprecated 옛 이름 — 다른 트랙 코드 호환용. showMessage와 같다 */
export const showToast = (text: string) => showMessage(text);
/** 테스트용: 메시지 줄 비우기 */
export function clearMessages(): void { messages = []; }

/** 액션이 성공했을 때 내는 효과음 */
const ACTION_SFX: Record<Action['type'], SfxName> = {
  place: 'place', placeLine: 'place', autoConnectPath: 'place', autoLinkRoute: 'place', remove: 'remove', skipTutorialStep: 'tap',
  setSlot: 'tap', setSpeed: 'tap', dismissAlert: 'tap', dismissMonthCard: 'tap',
  resolveRisk: 'tap', resolveEventChoice: 'tap', // stakes: 돌발 사고·빅 이벤트 선택지
  postJob: 'tap', hire: 'tap', fire: 'tap', assign: 'tap', setStaffZone: 'tap', setStaffNight: 'tap', levelUp: 'tap', train: 'unlock', promote: 'tap', setTarget: 'tap',
  move: 'place', rotate: 'tap', demolishMany: 'remove', undoLast: 'tap', renameObject: 'tap', setTargets: 'tap', upgradeObject: 'unlock', treeUpgrade: 'unlock', repairObject: 'place', buyParcel: 'unlock', useItem: 'unlock', renameCafe: 'tap', expand: 'unlock', setCosmetic: 'tap', praise: 'happy',
  acceptQuest: 'tap', respondEvent: 'tap', investSpot: 'unlock', giveGift: 'tap', craftGift: 'unlock',
  develop: 'unlock', dismissDevelop: 'tap', addTopping: 'tap', removeTopping: 'tap', levelUpMenu: 'unlock',
  drawTicket: 'tap', dismissDraw: 'tap', setUniform: 'tap', useGuestItem: 'unlock', dismissAnnouncement: 'tap',
  answerRival: 'tap', dismissRivalBoard: 'tap', allyRival: 'unlock', endAllyRival: 'tap', acquireRival: 'unlock', // 동네 경쟁 카페
  dismissOutcome: 'tap', skipTutorial: 'tap', skipTutorialChapter: 'tap', tutorialNote: 'tap',
  enterContest: 'unlock', cancelContest: 'tap', dismissContest: 'tap',
  expandParking: 'place', // 트랙 H
  reserveWork: 'tap', cancelWork: 'tap', doWorkNow: 'place', // seatfix: 손님이 앉은 시설 예약·취소·지금 바로
  placeMain: 'fanfare', expandMain: 'unlock', buildSecondFloor: 'unlock', moveMain: 'place', undoMoveMain: 'tap', setBgm: 'tap', setLighting: 'tap', // y-indoor
  continueEnding: 'fanfare', // z-ending
  seatFromQueue: 'happy', rushPriority: 'tap', // 러시 타임 훅 한 줄 (인사·추천은 삭제)
}; // 홍보·투어·대결·선물은 룰렛 팝업(OutcomePopup)이 drumroll → fanfare/coin/error를 낸다 (staff-luck)

export function dispatch(a: Action): ApplyResult {
  const r = apply(state, a);
  if (!r.ok && r.reason) showMessage(r.reason);
  sfx(r.ok ? ACTION_SFX[a.type] : 'error');
  if (r.ok) save();
  emit();
  return r;
}

export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

// ---------- 일시정지 (창·대화창·배치 중) ----------
/** 열려 있는 창/대화/배치의 수. 0→1이 될 때 속도를 기억하고 멈추고, 1→0이 될 때 되돌린다. */
let pauseDepth = 0;
let speedBeforePause: GameState['clock']['speed'] = 1;
/** 속도 잠금(§5.6): 잠기면 창을 열어도 멈추지 않고, 대화창·배치만 멈춘다. localStorage에 기억 */
let speedLocked = (() => { try { return localStorage.getItem(SPEED_LOCK_KEY) === '1'; } catch { return false; } })();
export function isSpeedLocked(): boolean { return speedLocked; }
export function setSpeedLocked(on: boolean): void {
  speedLocked = on;
  try { localStorage.setItem(SPEED_LOCK_KEY, on ? '1' : '0'); } catch { /* noop */ }
  emit();
}

/** 창이 열릴 때. 되돌릴 함수를 돌려주므로 useEffect 정리에 그대로 쓴다.
 *  kind='window'는 속도 잠금이 켜져 있으면 멈추지 않는다(no-op 반환). 'dialogue'·'place'는 항상 멈춘다. */
export function pauseGame(kind: 'window' | 'dialogue' | 'place' = 'window'): () => void {
  if (kind === 'window' && speedLocked) return () => {};
  if (pauseDepth++ === 0) {
    speedBeforePause = state.clock.speed;
    if (state.clock.speed !== 0) { apply(state, { type: 'setSpeed', speed: 0 }); emit(); }
  }
  let released = false;
  return () => { if (!released) { released = true; resumeGame(); } };
}

function resumeGame() {
  if (pauseDepth === 0) return;
  if (--pauseDepth === 0 && state.clock.speed === 0 && speedBeforePause !== 0) {
    apply(state, { type: 'setSpeed', speed: speedBeforePause });
    emit();
  }
}

export function isPausedByUi(): boolean { return pauseDepth > 0; }

/** 사용자가 속도 버튼을 눌렀을 때. 창에 가려 멈춘 동안이면 되돌릴 속도만 바꾼다. */
export function setUserSpeed(speed: GameState['clock']['speed']): void {
  if (pauseDepth > 0) { speedBeforePause = speed; emit(); return; }
  dispatch({ type: 'setSpeed', speed });
}
/** 속도 버튼 표시용: 창으로 멈춘 동안에도 사용자가 고른 속도를 보여 준다 */
export function userSpeed(): GameState['clock']['speed'] { return pauseDepth > 0 ? speedBeforePause : state.clock.speed; }

export function useGame(): GameState {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

/** 상태가 통째로 바뀔 때(새 게임) 렌더 노드 캐시를 비우도록 GameView.reset을 등록한다. */
export function setViewReset(fn: (() => void) | null) { viewReset = fn; }

export function setMonthCardHook(fn: typeof monthCardHook) { monthCardHook = fn; }
export function setSceneHook(fn: typeof sceneHook) { sceneHook = fn; }

/** 슬롯 목록에 보여 줄 요약. 비어 있거나 읽을 수 없으면 null. */
export interface SlotSummary { slot: number; year: number; month: number; day: number; money: number; stars: number; savedAt: number | null }

function summarize(slot: number, s: GameState): SlotSummary {
  // ★ 등급(star, 1~5). 랭크(rank, 1~10)와 다르다 — 랭크를 쓰면 랭크 5부터 ★5로 보였다.
  const stars = Math.max(1, Math.min(5, Number(s.star ?? 1)));
  let savedAt: number | null = null;
  try { savedAt = Number(localStorage.getItem(`${SLOT_PREFIX}at:${slot}`)) || null; } catch { /* noop */ }
  return { slot, year: s.clock.year, month: s.clock.month, day: s.clock.day, money: s.money, stars, savedAt };
}

export async function slotSummaries(): Promise<(SlotSummary | null)[]> {
  const out: (SlotSummary | null)[] = [];
  for (let n = 0; n <= SLOT_COUNT; n++) {
    const s = await saveStore.load(n).catch(() => null);
    out.push(s ? summarize(n, s) : null);
  }
  return out;
}

export async function hasAnySave(): Promise<boolean> {
  return (await slotSummaries()).some((x) => x !== null);
}

/** 슬롯 n에서 불러온다. 성공하면 true. */
export async function loadSlot(n: number): Promise<boolean> {
  const saved = await saveStore.load(n).catch(() => null);
  if (!saved) return false;
  setState(saved);
  viewReset?.();
  clearDialogues(); // 이전 게임의 대화(알림)가 남아 있으면 새 상태의 알림과 어긋난다
  if (n !== AUTO_SLOT) save(); // 자동 저장본도 이 게임으로 맞춘다
  emit();
  return true;
}

/** 지금 상태를 슬롯 n에 저장한다 (자동 저장과 별도). */
export async function saveSlot(n: number): Promise<boolean> {
  try {
    await saveStore.save(n, state);
    localStorage.setItem(`${SLOT_PREFIX}at:${n}`, String(Date.now()));
    return true;
  } catch {
    showMessage('저장에 실패했어요');
    return false;
  }
}

export function deleteSlot(n: number): void {
  try { localStorage.removeItem(`${SLOT_PREFIX}${n}`); localStorage.removeItem(`${SLOT_PREFIX}at:${n}`); } catch { /* noop */ }
}

/** 지금 상태를 자동 저장 슬롯에 바로 쓴다 (타이틀로 나갈 때·경영 현황 `저장`). */
export function autosaveNow(): void { save(); }

/** carry: 엔딩 뒤 「이월해서 새로 시작」(ending.ts makeCarry). 없으면 맨 처음부터. */
export function newGame(carry: CarryOver | null = null) {
  setState(createInitialState(Date.now() % 1_000_000, getOrCreatePlayerId(), Date.now(), 'tutorial', carry)); // §7.1 빈 마당 + 손으로 하는 튜토리얼
  viewReset?.();
  resetTutorial();
  clearDialogues();
  save();
  emit();
}

// ---------- z-ending: 최고 점수 슬롯 ----------
/** 엔딩 최종 점수를 최고 점수 슬롯에 기록한다. 갱신했으면 true (EndingScreen 「최고 점수 갱신!」). */
export function recordEnding(score: FinalScore): boolean {
  return saveStore.saveBest({ score, cafeName: state.cafeName, at: Date.now() });
}
export function getBestEnding(): BestRecord | null { return saveStore.loadBest(); }

/** rAF 루프. 렌더 콜백에 상태를 넘긴다. 반환값으로 정지. */
export function startLoop(render: (s: GameState) => void): () => void {
  let last = performance.now();
  let raf = 0;
  let pausedSpeed: GameState['clock']['speed'] | null = null;
  let lastEmitTick = -1;
  let lastEmitAt = 0;
  // 사운드 트리거용 이전 프레임 스냅샷
  let prevMoods = new Map<string, Mood | null>();
  let prevSeason: Season | null = null;
  let prevMonthCard: GameState['lastMonthCard'] = state.lastMonthCard;
  // 장면 fx: 지난 프레임의 state.tick 이상인 항목이 새것 (GameView.syncFx와 같은 규칙). 불러오기 직후 밀린 것은 건너뛴다.
  let sceneSeenTick = state.tick;
  const seenScenes = new WeakSet<object>(); // 멈춘 상태(speed 0)에서는 tick이 안 올라 같은 장면 fx가 매 프레임 다시 걸린다 — 한 번 띄운 항목은 건너뛴다 (staff-luck: 프로·전설 지원자 장면 창)

  const detectSounds = () => {
    const moods = new Map<string, Mood | null>();
    for (const g of state.guests) {
      moods.set(g.id, g.mood);
      const before = prevMoods.get(g.id) ?? null;
      if (g.mood !== before) {
        if (g.mood === 'happy') { sfx('coin'); sfx('happy'); }
        else if (g.mood === 'meh') sfx('meh');
      }
    }
    prevMoods = moods;
    if (!prevMonthCard && state.lastMonthCard) {
      sfx('month');
      const rec = recordMonthCard(state.playerId, state.lastMonthCard);
      monthCardHook?.(state, rec);
      save(); // 월말 자동 저장 (§5.6 P2-16)
      showMessage('월말 자동 저장했어요');
    }
    prevMonthCard = state.lastMonthCard;
    const since = sceneSeenTick;
    sceneSeenTick = state.tick;
    if (since <= state.tick) for (const e of state.fx ?? []) if (e.kind === 'scene' && e.tick >= since && !seenScenes.has(e)) { seenScenes.add(e); sceneHook?.(state, e.title, e.text); }
    const season = seasonOf(state.clock.month);
    if (season !== prevSeason) { prevSeason = season; void bgm(season); }
  };

  const frame = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    tick(state, dt);
    detectSounds();
    render(state);
    // React는 시뮬 틱이 바뀌었거나 일정 시간이 지났을 때만 깨운다 (매 프레임 리렌더 방지)
    if (state.tick !== lastEmitTick || now - lastEmitAt >= UI_EMIT_INTERVAL_MS) {
      lastEmitTick = state.tick;
      lastEmitAt = now;
      emit();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // 탭이 숨겨져 speed=0으로 멈춘 상태에서도 저장본에는 원래 속도를 남긴다 (다시 열면 멈춰 있지 않게)
  const saveEffective = () => {
    if (pausedSpeed !== null) apply(state, { type: 'setSpeed', speed: pausedSpeed });
    save();
    if (pausedSpeed !== null) apply(state, { type: 'setSpeed', speed: 0 });
  };
  const onVis = () => {
    if (document.hidden) {
      pausedSpeed = state.clock.speed;
      apply(state, { type: 'setSpeed', speed: 0 });
      saveEffective();
      suspendAudio();
    } else {
      resumeAudio();
      if (pausedSpeed !== null) {
        apply(state, { type: 'setSpeed', speed: pausedSpeed });
        pausedSpeed = null;
        last = performance.now();
      }
    }
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', saveEffective);
  return () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', saveEffective);
  };
}

// 개발 중 콘솔/자동화에서 상태를 들여다보고 액션을 보내기 위한 훅 (프로덕션 빌드에는 포함되지 않음)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  // advance(ms): 브라우저 자동화가 rAF 스로틀과 무관하게 게임 시간을 감는다 (speed 배수 무시)
  const advance = (ms: number) => { const sp = state.clock.speed; state.clock.speed = 1; tick(state, ms); state.clock.speed = sp; emit(); };
  (window as unknown as { __game: unknown }).__game = { getState, dispatch, newGame, resetGame: newGame, loadSlot, saveSlot, advance };
}

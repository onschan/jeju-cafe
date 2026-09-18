import { useSyncExternalStore } from 'react';
import { createInitialState, tick, apply, seasonOf, LocalSaveStore, type GameState, type Action, type ApplyResult, type Mood, type Season } from '../sim/index.ts';
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
/** 틱이 안 바뀌어도(일시정지 등) 이 간격으로는 React를 깨운다 — 토스트 만료 같은 시간 기반 UI용 */
const UI_EMIT_INTERVAL_MS = 250;

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

let state: GameState = createInitialState(Date.now() % 1_000_000, getOrCreatePlayerId(), Date.now());
let version = 0;
const listeners = new Set<() => void>();
let toast: { text: string; until: number } | null = null;
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
    p.catch(() => { toast = { text: '저장에 실패했어요', until: performance.now() + 2000 }; emit(); });
    return;
  }
  saveStore.save(AUTO_SLOT, state).catch(() => {
    toast = { text: '저장에 실패했어요', until: performance.now() + 2000 };
    emit();
  });
}

export function getState() { return state; }
export function getVersion() { return version; }
export function getToast() { return toast && toast.until > performance.now() ? toast.text : null; }
/** UI 안내 문구를 잠깐 띄운다 ("옮길 것을 골라 주세요" 등) */
export function showToast(text: string, ms = 1500) { toast = { text, until: performance.now() + ms }; emit(); }

/** 액션이 성공했을 때 내는 효과음 */
const ACTION_SFX: Record<Action['type'], SfxName> = {
  place: 'place', remove: 'remove',
  setSlot: 'tap', setSpeed: 'tap', dismissAlert: 'tap', dismissMonthCard: 'tap',
  postJob: 'tap', hire: 'tap', fire: 'tap', assign: 'tap', levelUp: 'tap', promote: 'tap', setTarget: 'tap',
  move: 'place', rotate: 'tap', upgradeObject: 'unlock', repairObject: 'place', buyParcel: 'unlock', useItem: 'unlock', clearRock: 'remove', renameCafe: 'tap', expand: 'unlock', setCosmetic: 'tap', praise: 'happy',
  acceptQuest: 'tap', respondEvent: 'tap', investSpot: 'unlock',
  develop: 'unlock', dismissDevelop: 'tap', addTopping: 'tap', removeTopping: 'tap', levelUpMenu: 'unlock',
  buyMileage: 'coin', buyTicket: 'coin', drawTicket: 'tap', dismissDraw: 'tap', setUniform: 'tap', useGuestItem: 'unlock', dismissAnnouncement: 'tap',
  openPopup: 'unlock', closePopup: 'tap', challenge: 'fanfare', dismissChallenge: 'tap',
};

export function dispatch(a: Action): ApplyResult {
  const r = apply(state, a);
  if (!r.ok && r.reason) toast = { text: r.reason, until: performance.now() + 1500 };
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

/** 창이 열릴 때. 되돌릴 함수를 돌려주므로 useEffect 정리에 그대로 쓴다. */
export function pauseGame(): () => void {
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
  state = saved;
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
    toast = { text: '저장에 실패했어요', until: performance.now() + 2000 };
    emit();
    return false;
  }
}

export function deleteSlot(n: number): void {
  try { localStorage.removeItem(`${SLOT_PREFIX}${n}`); localStorage.removeItem(`${SLOT_PREFIX}at:${n}`); } catch { /* noop */ }
}

/** 지금 상태를 자동 저장 슬롯에 바로 쓴다 (타이틀로 나갈 때). */
export function autosaveNow(): void { save(); }

export function newGame() {
  state = createInitialState(Date.now() % 1_000_000, getOrCreatePlayerId(), Date.now());
  viewReset?.();
  resetTutorial();
  clearDialogues();
  save();
  emit();
}

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
    }
    prevMonthCard = state.lastMonthCard;
    const since = sceneSeenTick;
    sceneSeenTick = state.tick;
    if (since <= state.tick) for (const e of state.fx ?? []) if (e.kind === 'scene' && e.tick >= since) sceneHook?.(state, e.title, e.text);
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

import { useSyncExternalStore } from 'react';
import { createInitialState, tick, apply, seasonOf, LocalSaveStore, type GameState, type Action, type ApplyResult, type Mood, type Season } from '../sim/index.ts';
import { sfx, bgm, suspendAudio, resumeAudio, type SfxName } from './audio';

const saveStore = new LocalSaveStore();
const AUTO_SLOT = 0;
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

function emit() { version++; for (const l of listeners) l(); }
function save() {
  saveStore.save(AUTO_SLOT, state).catch(() => {
    toast = { text: '저장에 실패했어요', until: performance.now() + 2000 };
    emit();
  });
}

export function getState() { return state; }
export function getVersion() { return version; }
export function getToast() { return toast && toast.until > performance.now() ? toast.text : null; }

/** 액션이 성공했을 때 내는 효과음 */
const ACTION_SFX: Record<Action['type'], SfxName> = {
  place: 'place', remove: 'remove', plant: 'plant', harvest: 'harvest',
  setSlot: 'tap', setSpeed: 'tap', unlock: 'unlock', dismissMonthCard: 'tap',
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

export function useGame(): GameState {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

/** 상태가 통째로 바뀔 때(새 게임) 렌더 노드 캐시를 비우도록 GameView.reset을 등록한다. */
export function setViewReset(fn: (() => void) | null) { viewReset = fn; }

export async function loadOrNew() {
  const saved = await saveStore.load(AUTO_SLOT);
  if (saved) { state = saved; viewReset?.(); emit(); }
}

export function resetGame() {
  state = createInitialState(Date.now() % 1_000_000, getOrCreatePlayerId(), Date.now());
  viewReset?.();
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
    if (!prevMonthCard && state.lastMonthCard) sfx('month');
    prevMonthCard = state.lastMonthCard;
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
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { getState, dispatch, resetGame };
}

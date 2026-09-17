import { useSyncExternalStore } from 'react';
import { createInitialState, tick, apply, LocalSaveStore, type GameState, type Action, type ApplyResult } from '../sim/index.ts';

const saveStore = new LocalSaveStore();
const AUTO_SLOT = 0;

let state: GameState = createInitialState(Date.now() % 1_000_000);
let version = 0;
const listeners = new Set<() => void>();
let lastMonthSaved = 0;
let toast: { text: string; until: number } | null = null;

function emit() { version++; for (const l of listeners) l(); }

export function getState() { return state; }
export function getVersion() { return version; }
export function getToast() { return toast && toast.until > performance.now() ? toast.text : null; }

export function dispatch(a: Action): ApplyResult {
  const r = apply(state, a);
  if (!r.ok && r.reason) toast = { text: r.reason, until: performance.now() + 1500 };
  emit();
  return r;
}

export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useGame(): GameState {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return state;
}

export async function loadOrNew() {
  const saved = await saveStore.load(AUTO_SLOT);
  if (saved) { state = saved; emit(); }
}

export function resetGame() {
  state = createInitialState(Date.now() % 1_000_000);
  emit();
}

/** rAF 루프. 렌더 콜백에 상태를 넘긴다. 반환값으로 정지. */
export function startLoop(render: (s: GameState) => void): () => void {
  let last = performance.now();
  let raf = 0;
  let pausedSpeed: GameState['clock']['speed'] | null = null;

  const frame = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    tick(state, dt);
    const monthKey = state.clock.year * 12 + state.clock.month;
    if (monthKey !== lastMonthSaved) { lastMonthSaved = monthKey; void saveStore.save(AUTO_SLOT, state); }
    render(state);
    emit();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const onVis = () => {
    if (document.hidden) { pausedSpeed = state.clock.speed; state.clock.speed = 0; }
    else if (pausedSpeed !== null) { state.clock.speed = pausedSpeed; pausedSpeed = null; last = performance.now(); }
  };
  document.addEventListener('visibilitychange', onVis);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
}

// 개발 중 콘솔/자동화에서 상태를 들여다보고 액션을 보내기 위한 훅 (프로덕션 빌드에는 포함되지 않음)
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { getState, dispatch, resetGame };
}

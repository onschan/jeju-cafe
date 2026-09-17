import { useSyncExternalStore } from 'react';
import { createInitialState, tick, apply, LocalSaveStore, type GameState, type Action, type ApplyResult } from '../sim/index.ts';

const saveStore = new LocalSaveStore();
const AUTO_SLOT = 0;
/** 틱이 안 바뀌어도(일시정지 등) 이 간격으로는 React를 깨운다 — 토스트 만료 같은 시간 기반 UI용 */
const UI_EMIT_INTERVAL_MS = 250;

let state: GameState = createInitialState(Date.now() % 1_000_000);
let version = 0;
const listeners = new Set<() => void>();
let toast: { text: string; until: number } | null = null;
let viewReset: (() => void) | null = null;

function emit() { version++; for (const l of listeners) l(); }
function save() { void saveStore.save(AUTO_SLOT, state); }

export function getState() { return state; }
export function getVersion() { return version; }
export function getToast() { return toast && toast.until > performance.now() ? toast.text : null; }

export function dispatch(a: Action): ApplyResult {
  const r = apply(state, a);
  if (!r.ok && r.reason) toast = { text: r.reason, until: performance.now() + 1500 };
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
  state = createInitialState(Date.now() % 1_000_000);
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

  const frame = (now: number) => {
    const dt = Math.min(100, now - last);
    last = now;
    tick(state, dt);
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
    if (pausedSpeed !== null) state.clock.speed = pausedSpeed;
    save();
    if (pausedSpeed !== null) state.clock.speed = 0;
  };
  const onVis = () => {
    if (document.hidden) {
      pausedSpeed = state.clock.speed;
      state.clock.speed = 0;
      saveEffective();
    } else if (pausedSpeed !== null) {
      state.clock.speed = pausedSpeed;
      pausedSpeed = null;
      last = performance.now();
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

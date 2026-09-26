/** 게임 상태 하나 + 루프 + 저장. React는 useGame()으로 읽는다. */
import { useSyncExternalStore } from 'react';
import { newGame, apply, step, serialize, deserialize, STEP_MS, DAY_MS, type GameState, type Action, type ApplyResult } from '../game/index.ts';

const KEY = 'jeju-cafe:v100:auto';
let state: GameState = load() ?? newGame((Date.now() % 1_000_000) | 0);
let rev = 0;
const subs = new Set<() => void>();
function emit(): void { rev++; for (const f of subs) f(); }
function load(): GameState | null { try { const j = localStorage.getItem(KEY); return j ? deserialize(j) : null; } catch { return null; } }
export function save(): void { try { localStorage.setItem(KEY, serialize(state)); } catch { /* 저장 못 해도 게임은 돈다 */ } }
export function getState(): GameState { return state; }
export function useGame(): GameState { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state); }
export function useRev(): number { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => rev, () => rev); }
export interface Toast { id: number; text: string; at: number }
export const toasts: Toast[] = [];
let toastSeq = 0;
/** 사림이 남긴 알림·신발매를 띠로 옮긴다 (그림은 상성·돈 연출만 가져간다) */
function drainToasts(): void {
  const keep = [];
  for (const fx of state.fx) { if (fx.kind === 'notice' || fx.kind === 'unlock') toasts.push({ id: toastSeq++, text: fx.text, at: performance.now() }); else keep.push(fx); }
  if (keep.length !== state.fx.length) state.fx = keep;
  while (toasts.length > 4) toasts.shift();
}
export function dispatch(a: Action): ApplyResult { const r = apply(state, a); drainToasts(); if (r.ok) emit(); return r; }
export function restart(seed?: number): void { state = newGame(seed ?? ((Date.now() % 1_000_000) | 0)); save(); emit(); }

let acc = 0; let last = 0; let lastDay = -1; let raf = 0;
export function startLoop(): () => void {
  last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(250, now - last); last = now;
    acc += dt * state.clock.speed;
    let n = 0;
    while (acc >= STEP_MS && n < 40) { step(state, STEP_MS); acc -= STEP_MS; n++; }
    if (n > 0) { drainToasts(); emit(); const day = Math.floor((state.tick * STEP_MS) / DAY_MS); if (day !== lastDay) { lastDay = day; save(); } }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

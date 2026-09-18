import { useEffect } from 'react';
import type { GameState, Pt } from '../sim/index.ts';
import { currentTutorialStep } from '../sim/index.ts';
import { useGame } from './store';

/** 튜토리얼 하이라이트 (스펙 §7.2): 현재 단계의 `data-tut` 타깃(하단 버튼·창 탭·창 안 버튼)에 글로우 클래스를 붙이고,
 *  맵 칸은 GameView.setHighlightCells로 빛낸다. 타깃 목록은 sim/tutorial.ts STEPS[].targets / cells.
 *  창이 열리고 닫히며 DOM이 바뀌므로 MutationObserver로 다시 칠한다. */

export const TUT_GLOW_CLASS = 'tut-glow';
const STYLE_ID = 'tut-glow-style';
const CSS = `@keyframes tut-glow { 0%, 100% { box-shadow: 0 0 0 3px #ffd54a, 0 0 10px 4px #ffb300aa; } 50% { box-shadow: 0 0 0 5px #fff176, 0 0 18px 8px #ffb300; } }
.${TUT_GLOW_CLASS} { animation: tut-glow 1s ease-in-out infinite !important; position: relative; z-index: 1; }`;

function ensureStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** 현재 단계의 DOM 타깃(data-tut 값)과 맵 칸 */
export function tutorialTargets(s: GameState): { targets: string[]; cells: Pt[] } {
  const step = currentTutorialStep(s);
  if (!step) return { targets: [], cells: [] };
  return { targets: step.targets, cells: step.cells(s) };
}

/** 문서 안의 [data-tut] 요소에 글로우를 맞춘다 (타깃에 없는 것은 뗀다). 칠한 요소 수. */
export function applyGlow(targets: string[], root: ParentNode = document): number {
  const want = new Set(targets);
  let n = 0;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-tut]'))) {
    const on = want.has(el.dataset.tut ?? '');
    el.classList.toggle(TUT_GLOW_CLASS, on);
    if (on) n++;
  }
  return n;
}

export interface HighlightView { setHighlightCells(cells: Pt[]): void }

/** App에서 한 줄: useTutorialHighlight(viewRef.current). 상태가 바뀌거나 DOM이 바뀔 때마다 글로우를 맞춘다. */
export function useTutorialHighlight(view: HighlightView | null): void {
  const s = useGame();
  const { targets, cells } = tutorialTargets(s);
  const key = targets.join('|') + '#' + cells.map((c) => `${c.x},${c.y}`).join('|');
  useEffect(() => {
    ensureStyle();
    applyGlow(targets);
    view?.setHighlightCells(cells);
    const mo = new MutationObserver(() => applyGlow(targets));
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); applyGlow([]); view?.setHighlightCells([]); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view]);
}

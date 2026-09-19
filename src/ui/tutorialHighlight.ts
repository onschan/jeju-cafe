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

/** 문서 안의 [data-tut] 요소에 글로우를 맞춘다 (타깃에 없는 것은 뗀다). 같은 타깃 값은 눌 수 있는 첫 요소 하나만 빛난다(채용·홍보 「실행」이 줄줄이 빛나지 않게).
 *  data-tut이 조건부로 떨어진 요소(.tut-glow만 남은 것)도 훑어 글로우를 뗀다. 칠한 요소 수. */
export function applyGlow(targets: string[], root: ParentNode = document): number {
  const want = new Set(targets);
  const lit = new Set<string>();
  let n = 0;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[data-tut], .${TUT_GLOW_CLASS}`))) {
    const v = el.dataset.tut ?? '';
    const on = want.has(v) && !(el as HTMLButtonElement).disabled && !lit.has(v); // 눌러도 안 되는 버튼(연구 부족 등)은 빛내지 않는다
    if (on) lit.add(v);
    const was = el.classList.contains(TUT_GLOW_CLASS);
    el.classList.toggle(TUT_GLOW_CLASS, on);
    if (on) n++;
    // 가로 스크롤 탭 줄(길·담)처럼 화면 밖에 있으면 보이게 끌어온다 (처음 빛날 때 한 번)
    if (on && !was && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    return () => { mo.disconnect(); applyGlow([]); try { view?.setHighlightCells([]); } catch { /* 뷰가 이미 파괴됨 */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view]);
}

import { useEffect, useSyncExternalStore } from 'react';
import type { GameState, Pt } from '../sim/index.ts';
import { currentTutorialStep, stepTargets, solverKey, footprint } from '../sim/index.ts';
import { useGame, showMessage } from './store';

/** 튜토리얼 하이라이트 (스펙 §7.2 + w-free 스포트라이트): 현재 단계의 `data-tut` 타깃(하단 버튼·창 탭·창 안 버튼)에 글로우 클래스를 붙이고,
 *  맵 칸은 GameView.setHighlightCells로 빛낸다. 타깃 목록은 sim/tutorial.ts STEPS[].targets / cells.
 *  추천 칸이 시설 원점만 가리키면(본관 3×2·주차장 2×3…) 여기서 발자국 전체(w×h)로 넓혀 빛낸다(expandFootprints) — 회전 가능한 시설(정낭·벤치·카운터)은 전부 1×1이라 회전은 발자국을 안 바꾼다.
 *  창이 열리고 닫히며 DOM이 바뀌므로 MutationObserver로 다시 칠한다 (requestAnimationFrame으로 한 프레임에 한 번만).
 *
 *  스포트라이트(w-free, 설정에서 끌 수 있음 · 기본 켬): 글로우 단계에서 **나머지를 어둡게** 한다.
 *  - DOM 타깃이 창(role=dialog) 밖(하단 바·목표 줄·카드)에 있으면 그 요소에 `tut-spot` — 사방 200vmax의 반투명 검정 box-shadow(SPOT_ALPHA)로
 *    그 요소보다 아래(먼저 그려지는) 모든 것이 어두워진다. 별도 오버레이 div를 깔면 하단 바(z 10) 같은 stacking context 안의 버튼 하나만
 *    오버레이 위로 올릴 수 없어서(부모가 가둔다) 이 방식으로 "그 버튼만 밝게"를 만든다. 대화창(40)·보상 상자(45)·팝업(50)·미니 카드(12)는 위라 밝다.
 *  - 타깃이 창 안 요소면 창은 밝고(전체 화면 창이라 밖은 안 보인다) 타깃만 글로우.
 *  - 맵 칸 타깃은 GameView.setSpotlightCells: 맵 전체 반투명 검정 + 타깃 칸 구멍 (타깃이 여러 개면 전부 구멍). DOM 타깃이 켜져 있으면 DOM 그림자가
 *    맵까지 덮으므로 맵 어둠은 DOM 타깃이 없을 때만 깐다.
 *  - 셸(상단 바·목표 줄·하단 바·홈 버튼)에서 탭할 수 있는 건 타깃뿐 — 그 밖의 셸 클릭은 document 캡처 단계에서 막는다.
 *    ✕/닫기·「건너뛰기」·튜토리얼 배지(📖)·대화창·창·팝업·카드·맵(캔버스)은 항상 허용.
 *  - 막힌 셸을 짧은 간격으로 두 번 연속 탭하면 「튜토리얼 밖 조작은 📖에서 끌 수 있어요」를 세션에 한 번 보여 준다 (ease). */

export const TUT_GLOW_CLASS = 'tut-glow';
/** 글로우 + 사방 어둠 (창 밖 타깃) */
export const TUT_SPOT_CLASS = 'tut-spot';
/** 스포트라이트 어둠 알파 (render/GameView.ts와 같은 값). fun-start: 0.55는 너무 어두워 게임 요소를 못 알아봤다 → 0.22, 맵은 타깃 주변 반경 3칸이 아예 안 어둡다. */
export const SPOT_ALPHA = 0.22;
/** 막힌 탭 두 번 연속 판정 간격(ms)과 안내 문구 (ease) */
export const BLOCKED_DOUBLE_TAP_MS = 1500;
export const BLOCKED_HINT = '튜토리얼 밖 조작은 📖에서 끌 수 있어요';
let blockedHintShown = false;
let lastBlockedAt = 0;
/** 막힌 셸 클릭을 세고, 두 번 연속이면 안내를 한 번 띄운다. 띄웠으면 true. (테스트용 export) */
export function noteBlockedClick(now = Date.now()): boolean {
  const twice = lastBlockedAt > 0 && now - lastBlockedAt <= BLOCKED_DOUBLE_TAP_MS;
  lastBlockedAt = now;
  if (!twice || blockedHintShown) return false;
  blockedHintShown = true;
  showMessage(BLOCKED_HINT);
  return true;
}
export function resetBlockedHint(): void { blockedHintShown = false; lastBlockedAt = 0; }
const STYLE_ID = 'tut-glow-style';
const CSS = `@keyframes tut-glow { 0%, 100% { box-shadow: 0 0 0 3px #ffd54a, 0 0 10px 4px #ffb300aa; } 50% { box-shadow: 0 0 0 5px #fff176, 0 0 18px 8px #ffb300; } }
@keyframes tut-glow-spot { 0%, 100% { box-shadow: 0 0 0 3px #ffd54a, 0 0 10px 4px #ffb300aa, 0 0 0 200vmax rgba(0,0,0,${SPOT_ALPHA}); } 50% { box-shadow: 0 0 0 5px #fff176, 0 0 18px 8px #ffb300, 0 0 0 200vmax rgba(0,0,0,${SPOT_ALPHA}); } }
.${TUT_GLOW_CLASS} { animation: tut-glow 1s ease-in-out infinite !important; position: relative; z-index: 1; }
.${TUT_GLOW_CLASS}.${TUT_SPOT_CLASS} { animation-name: tut-glow-spot !important; }`;

function ensureStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

// ---------- 설정: 스포트라이트 켜기/끄기 (localStorage, 기본 켬) ----------
const SPOT_KEY = 'jeju-cafe:spotlight';
let spotOn: boolean = (() => { try { return localStorage.getItem(SPOT_KEY) !== '0'; } catch { return true; } })();
const listeners = new Set<() => void>();
export function spotlightOn(): boolean { return spotOn; }
export function setSpotlightOn(v: boolean): void {
  spotOn = v;
  try { localStorage.setItem(SPOT_KEY, v ? '1' : '0'); } catch { /* noop */ }
  for (const l of listeners) l();
}
export function useSpotlightPref(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, spotlightOn, spotlightOn);
}

/** 맵 글로우 칸 위 말풍선 문구 (단계 key별). 빛나는 칸엔 반드시 왜 빛나는지 적는다 (fix-indoor). 표에 없는 단계는 기본 문구. */
export const CELL_LABEL: Record<string, string> = {
  seat: '이 자리가 좋아 보인다',
  greet: '손님이다, 탭해서 인사',
  corner: '여기 놓으면 테마가 된다',
};
export const CELL_LABEL_DEFAULT = '여기가 좋아 보인다';

/** 추천 칸을 시설 발자국(w×h)으로 넓힌다: `build:<type>` 타깃이 있으면 그 시설 크기, 없으면 그대로. 겹치는 칸은 한 번만. */
export function expandFootprints(cells: Pt[], targets: string[]): Pt[] {
  const type = targets.find((t) => t.startsWith('build:'))?.slice('build:'.length);
  if (!type) return cells;
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const c of cells) for (const p of footprint(type, c.x, c.y)) { const k = `${p.x},${p.y}`; if (!seen.has(k)) { seen.add(k); out.push(p); } }
  return out;
}

// ---------- solver 「지금 추천 행동」 탭 → 그 행동의 타깃 글로우 ----------
export interface GuideFocus { key: string; targets: string[]; cells: Pt[]; label: string }
let guideFocus: GuideFocus | null = null;
const focusListeners = new Set<() => void>();
/** 추천 탭에서 추천 행동을 탭하면 그 행동의 타깃(칸·창 버튼)을 빛낸다. 상태 키(solverKey)가 바뀌면(행동을 했거나 날·자금이 바뀜) 저절로 꺼진다. null이면 끔. */
export function setGuideFocus(f: GuideFocus | null): void {
  guideFocus = f;
  for (const l of focusListeners) l();
}
export function getGuideFocus(): GuideFocus | null { return guideFocus; }
export function useGuideFocus(): GuideFocus | null {
  return useSyncExternalStore((l) => { focusListeners.add(l); return () => { focusListeners.delete(l); }; }, getGuideFocus, getGuideFocus);
}
/** 현재 단계의 DOM 타깃(data-tut 값)과 맵 칸, 칸 라벨. solver 추천 행동 포커스가 지금 상태 것이면 그것이 우선(guide: true — 어둠·셸 차단 없이 글로우만). */
export function tutorialTargets(s: GameState): { targets: string[]; cells: Pt[]; label: string; guide?: boolean } {
  if (guideFocus && guideFocus.key === solverKey(s)) return { targets: guideFocus.targets, cells: expandFootprints(guideFocus.cells, guideFocus.targets), label: guideFocus.label, guide: true };
  const step = currentTutorialStep(s);
  if (!step) return { targets: [], cells: [], label: '' };
  const targets = stepTargets(step, s);
  return { targets, cells: expandFootprints(step.cells(s), targets), label: CELL_LABEL[step.key] ?? CELL_LABEL_DEFAULT };
}

/** 창 안(전체 화면 창·대화창·팝업)에 있으면 어둠을 안 깐다 — 창이 밝고 타깃만 글로우 */
const IN_WINDOW = '[role="dialog"], [data-testid="dialogue"]';
/** 스포트라이트 중 클릭을 막는 셸 (타깃·항상 허용 요소는 예외) */
const SHELL = '[data-testid="top-bar"], [data-testid="goal-bar"], [data-testid="bottom-bar"], [data-testid="place-bar"], [data-testid="home-btn"], [data-testid="message-line"]';
/** 항상 눌러도 되는 것: ✕/닫기·건너뛰기·튜토리얼 배지·대화창·창·팝업 */
const ALWAYS = `${IN_WINDOW}, [data-testid="tutorial-badge"], [data-testid="window-close"], [data-testid="window-close-bottom"], [aria-label="닫기"], [aria-label="건너뛰기"], [data-testid="tutorial-skip-chapter"]`;

export interface GlowResult { lit: number; spot: number }

/** 문서 안의 [data-tut] 요소에 글로우를 맞춘다 (타깃에 없는 것은 뗀다). 같은 타깃 값은 눌 수 있는 첫 요소 하나만 빛난다(채용·홍보 「실행」이 줄줄이 빛나지 않게).
 *  data-tut이 조건부로 떨어진 요소(.tut-glow만 남은 것)도 훑어 글로우를 뗀다. spotlight면 창 밖 타깃에 tut-spot(사방 어둠)도 붙인다.
 *  칠한 요소 수(lit)와 어둠을 깐 요소 수(spot). */
export function applyGlow(targets: string[], root: ParentNode = document, spotlight = false): GlowResult {
  const want = new Set(targets);
  const litSet = new Set<string>();
  let lit = 0, spot = 0;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[data-tut], .${TUT_GLOW_CLASS}`))) {
    const v = el.dataset.tut ?? '';
    const on = want.has(v) && !(el as HTMLButtonElement).disabled && !litSet.has(v); // 눌러도 안 되는 버튼(연구 부족 등)은 빛내지 않는다
    if (on) litSet.add(v);
    const was = el.classList.contains(TUT_GLOW_CLASS);
    el.classList.toggle(TUT_GLOW_CLASS, on);
    const dark = on && spotlight && !el.closest(IN_WINDOW);
    el.classList.toggle(TUT_SPOT_CLASS, dark);
    if (on) lit++;
    if (dark) spot++;
    // 가로 스크롤 탭 줄(길·담)처럼 화면 밖에 있으면 보이게 끌어온다 (처음 빛날 때 한 번)
    if (on && !was && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  return { lit, spot };
}

/** 스포트라이트 중 이 클릭을 막아야 하나: 셸 안이면서 타깃(글로우)·항상 허용 요소 밖 */
export function shouldBlockClick(target: Element | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest(`.${TUT_GLOW_CLASS}`) || target.closest(ALWAYS)) return false;
  return !!target.closest(SHELL);
}

export interface HighlightView { setHighlightCells(cells: Pt[], label?: string): void; setSpotlightCells?(cells: Pt[] | null): void }

/** App에서 한 줄: useTutorialHighlight(viewRef.current). 상태가 바뀌거나 DOM이 바뀔 때마다 글로우·스포트라이트를 맞춘다. */
export function useTutorialHighlight(view: HighlightView | null): void {
  const s = useGame();
  const pref = useSpotlightPref();
  useGuideFocus();
  const { targets, cells, label, guide } = tutorialTargets(s);
  const spotlight = pref && !guide; // solver 추천 포커스는 글로우만 (어둠·셸 차단 없음)
  const key = targets.join('|') + '#' + cells.map((c) => `${c.x},${c.y}`).join('|') + '#' + label;
  useEffect(() => {
    ensureStyle();
    let blocking = false;
    const paint = () => {
      const r = applyGlow(targets, document, spotlight);
      blocking = spotlight && r.spot > 0;
      view?.setHighlightCells(cells, label);
      // 맵 어둠: 스포트라이트가 켜져 있고 맵 칸 타깃이 있고, DOM 그림자가 맵을 덮고 있지 않을 때만
      view?.setSpotlightCells?.(spotlight && cells.length > 0 && r.spot === 0 ? cells : null);
    };
    paint();
    // DOM 변경(창 열림·닫힘·탭 전환)마다 한 프레임에 한 번만 다시 칠한다
    let raf = 0;
    const mo = new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-tut'] });
    // 셸의 다른 버튼 클릭 차단 (캡처 단계 — React 루트보다 먼저)
    const onClick = (e: Event) => { if (blocking && shouldBlockClick(e.target as Element | null)) { e.stopPropagation(); e.preventDefault(); noteBlockedClick(); } };
    document.addEventListener('click', onClick, true);
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('click', onClick, true);
      applyGlow([]);
      try { view?.setHighlightCells([]); view?.setSpotlightCells?.(null); } catch { /* 뷰가 이미 파괴됨 */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, view, spotlight]);
}

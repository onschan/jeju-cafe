/** 첫 열기 팁 (fun-start §2): 창·탭·모드를 처음 열 때 갈색 말풍선 한 줄. 한 번만(localStorage 기억), 탭하면 사라진다.
 *  옛 튜토리얼 8~33단계(증축·연수·명소·주차장·선물·추천·상점·랭킹·지역·도전·입지 보기·되돌리기…)의 내용이 여기로 흡수됐다 — 문구는 data/dialogue/tips.json.
 *  키는 App.tsx가 열린 창·탭·모드에서 만든다(tipKeyFor): `cafe:menu` 같은 창:탭, `mode:move`, `build:<시설>`, `guest`(손님 카드)…
 *  창 밖에서 일어나는 일(입지 보기·되돌리기·추천 탭)은 그 자리에서 showFirstTip(key) 한 줄.
 *  보이는 동안 키가 바뀌면(창을 닫음) 같이 사라진다 — 이미 본 것으로 남으니 다시 안 뜬다.
 *  React 컴포넌트지만 .ts라 createElement로 그린다. */
import { createElement, useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { FIRST_TIPS } from '../data/dialogue/index.ts';
import { PALETTE } from './frame';
import { getDialogue } from './dialogue.ts';

export const TIPS: Record<string, string> = FIRST_TIPS;
const STORE_KEY = 'jeju-cafe:tips';

function load(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
let seenTips: Set<string> = load();
let current: string | null = null;
const listeners = new Set<() => void>();
function notify(): void { for (const l of listeners) l(); }
function save(): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...seenTips])); } catch { /* noop */ }
}

/** 이 키의 팁 문구 (없으면 null) */
export function tipText(key: string | null): string | null {
  return key ? TIPS[key] ?? null : null;
}
export function tipSeen(key: string): boolean { return seenTips.has(key); }
/** 팁을 띄운다: 문구가 있고 아직 안 본 키면 지금 팁으로 삼고 본 것으로 기억한다. 띄웠으면 true. null이면 지금 팁을 내린다(창을 닫음). */
export function showFirstTip(key: string | null): boolean {
  if (key === current) return false;
  if (current !== null) { current = null; notify(); }
  if (key === null) return false;
  const text = tipText(key);
  if (!text || seenTips.has(key)) return false;
  if (getDialogue()) return false; // 튜토리얼 대화와 같은 화면에서 겹치지 않게 — 본 것으로 치지 않으니 다음에 다시 뜬다
  seenTips.add(key);
  save();
  current = key;
  notify();
  return true;
}
/** 탭해서 내린다 */
export function dismissTip(): void {
  if (current === null) return;
  current = null;
  notify();
}
export function currentTip(): string | null { return current; }
/** 지금 떠 있는 팁이 없을 때만 띄운다 (창 안 카드가 창 팁을 밀어내지 않게 — 카드 팁은 다음에 열 때 뜬다) */
export function showFirstTipIfIdle(key: string): boolean {
  return current === null ? showFirstTip(key) : false;
}
/** 테스트·설정 「팁 다시 보기」: 기억을 지운다 */
export function resetTips(): void {
  seenTips = new Set();
  current = null;
  save();
  notify();
}
export function useCurrentTip(): string | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, currentTip, currentTip);
}
/** 키가 바뀔 때마다 팁을 띄운다 (App.tsx 한 줄) */
export function useFirstTip(key: string | null): void {
  useEffect(() => { showFirstTip(key); }, [key]);
}

/** App.tsx의 열린 창·탭·모드 → 팁 키. 창이 열려 있으면 창(창:탭), 아니면 모드(build 모드는 시설별 `build:<type>`, 팁이 없는 시설은 없음), 손님 카드는 guest. */
export function tipKeyFor(win: { kind: string; tab?: string | null } | null, mode: { kind: string; objectType?: string }, guestOpen = false): string | null {
  if (guestOpen) return 'guest';
  if (win) {
    if (win.kind === 'build') return 'build';
    return win.tab ? `${win.kind}:${win.tab}` : win.kind === 'cafe' || win.kind === 'people' || win.kind === 'ledger' ? null : win.kind;
  }
  if (mode.kind === 'build') return mode.objectType ? `build:${mode.objectType}` : null;
  if (mode.kind !== 'idle') return `mode:${mode.kind}`;
  return null;
}

const bubble: CSSProperties = {
  position: 'absolute', left: 12, right: 12, zIndex: 35, // 창(30) 위, 대화창(40) 아래
  background: PALETTE.paper, color: PALETTE.ink, border: `3px solid ${PALETTE.wood}`, boxShadow: `inset 0 0 0 2px ${PALETTE.woodLight}, 0 3px 0 #0003`,
  borderRadius: 10, padding: '8px 12px', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, lineHeight: 1.35, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
};
const tailUp: CSSProperties = { position: 'absolute', left: 22, top: -12, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderBottom: `12px solid ${PALETTE.wood}` };
const tailDown: CSSProperties = { ...tailUp, top: undefined, bottom: -12, borderBottom: undefined, borderTop: `12px solid ${PALETTE.wood}` };

/** 갈색 말풍선 (App.tsx에서 한 줄: `<FirstTipBubble top={...} />` 또는 `bottom`). 맵 위에선 목표 줄 아래(top, 꼬리 위), 창 안에선 하단 닫기 줄 위(bottom, 꼬리 아래). 지금 팁이 없으면 아무것도 안 그린다. */
export function FirstTipBubble({ top, bottom }: { top?: number; bottom?: number }) {
  const key = useCurrentTip();
  const text = tipText(key);
  if (!key || !text) return null;
  return createElement('button', { 'data-testid': 'first-tip', 'data-tip': key, 'aria-label': `팁: ${text}`, onClick: dismissTip, style: { ...bubble, top, bottom } },
    createElement('span', { style: bottom !== undefined ? tailDown : tailUp }),
    createElement('span', { 'aria-hidden': true, style: { fontSize: 18 } }, '💡'),
    createElement('span', { style: { flex: 1 } }, `할망: ${text}`),
    createElement('span', { style: { color: PALETTE.inkSoft, fontSize: 13, fontWeight: 400 } }, '탭해서 닫기'),
  );
}

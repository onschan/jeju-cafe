/** 전체 화면 창(트랙 C의 Window 셸) 안에 들어가는 내용 컴포넌트가 함께 쓰는 것들.
 *  창 내용은 본문만 그린다 — 제목 바·닫기는 셸이 붙인다. 상태는 props로 받거나(우선) store의 useGame()으로. */
import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { GameState, Action, ApplyResult } from '../../sim/index.ts';
import { getState, getVersion, subscribe, dispatch as storeDispatch } from '../store';
import { PALETTE, brownBtn, brownBtnOn, brownBtnOff, NO_SCROLLBAR } from '../frame';
import { IconGrid } from '../IconGrid';

export type Dispatch = (a: Action) => ApplyResult;

/** 창 내용 컴포넌트 공통 props (트랙 C 계약). state·dispatch를 안 주면 store를 쓴다. */
export interface WindowProps {
  state?: GameState;
  dispatch?: Dispatch;
  onClose(): void;
  onPickBuild?(objectType: string): void;
}

/** props.state가 있으면 그것, 없으면 store. 훅 순서를 지키려고 항상 구독한다. */
export function useWindowState(props: { state?: GameState; dispatch?: Dispatch }): { s: GameState; dispatch: Dispatch } {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return { s: props.state ?? getState(), dispatch: props.dispatch ?? storeDispatch };
}

/** 창 본문 바탕: 종이색, 세로 스크롤은 셸이 맡는다 */
export const body: CSSProperties = { color: PALETTE.ink, fontSize: 14, lineHeight: 1.35 };

/** 하위 탭의 기본 픽셀 아이콘 이름 (키별). 없으면 menu */
const TAB_ICON: Record<string, string> = { main: 'target', challenge: 'flag', monthly: 'calendar', ours: 'staff', candidates: 'hire', now: 'guest', quests: 'quest', codex: 'book', rivals: 'rival', spots: 'map', events: 'mail', regions: 'wave', mileage: 'gift', draw: 'draw', ticket: 'ticket' };

/** 하위 탭 바 (UX §5.1): 5개 이하면 아이콘 셀(64px, 아이콘+한글) 한 줄, 그보다 많으면(짓기 카테고리) 가로 텍스트 탭. data-tut="tab:<key>" 유지. */
export function TabBar<K extends string>({ tabs, active, onPick, testId }: { tabs: { key: K; label: string; badge?: number; icon?: string; locked?: boolean }[]; active: K; onPick: (k: K) => void; testId?: string }) {
  if (tabs.length <= 5) {
    return <IconGrid items={tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon ?? TAB_ICON[t.key] ?? 'menu', badge: t.badge, locked: t.locked }))} active={active} onPick={onPick} cols={tabs.length} testId={testId} />;
  }
  return (
    <div data-testid={testId} className={NO_SCROLLBAR} style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 6, marginBottom: 6, borderBottom: `2px solid ${PALETTE.woodLight}`, scrollbarWidth: 'none' }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onPick(t.key)} aria-pressed={t.key === active} data-testid={testId ? `${testId}-${t.key}` : undefined} data-tut={`tab:${t.key}`}
          style={{ ...(t.key === active ? brownBtnOn : brownBtn), margin: 0, padding: '0 10px', fontSize: 14, whiteSpace: 'nowrap', flex: '0 0 auto', position: 'relative' }}>
          {t.label}
          {t.badge !== undefined && t.badge > 0 && <span style={{ marginLeft: 4, background: PALETTE.bad, color: '#fff', borderRadius: 9, fontSize: 12, padding: '0 5px' }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** 작은 필터 칩 (카테고리) — 36px, 스크롤 줄 */
export function Chips<K extends string>({ chips, active, onPick }: { chips: { key: K; label: string }[]; active: K; onPick: (k: K) => void }) {
  return (
    <div className={NO_SCROLLBAR} style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 8, scrollbarWidth: 'none' }}>
      {chips.map((c) => (
        <button key={c.key} onClick={() => onPick(c.key)} aria-pressed={c.key === active}
          style={{ ...(c.key === active ? brownBtnOn : brownBtn), minHeight: 44, margin: 0, padding: '0 10px', fontSize: 14, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** ★★★☆☆ */
export function Stars({ n, max = 5, size = 14, label }: { n: number; max?: number; size?: number; label?: string }) {
  const k = Math.max(0, Math.min(max, Math.round(n)));
  return (
    <span aria-label={label ?? `${k}/${max}`} title={label} style={{ fontSize: size, letterSpacing: 1, whiteSpace: 'nowrap', color: '#c9741a' }}>
      {'★'.repeat(k)}<span style={{ color: PALETTE.woodLight }}>{'☆'.repeat(max - k)}</span>
    </span>
  );
}

/** 가로 막대 (0~max). 라벨은 호출자가. */
export function Bar({ value, max, color = PALETTE.bar, height = 10 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span style={{ display: 'block', width: '100%', height, background: PALETTE.paperDark, border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
    </span>
  );
}

/** 항목 카드 (흰 배경, 갈색 프레임) */
export const rowCard: CSSProperties = { background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, padding: '8px 10px', marginBottom: 6 };
export const rowCardOn: CSSProperties = { ...rowCard, boxShadow: `0 0 0 3px ${PALETTE.btnOn}` };
export const rowCardLocked: CSSProperties = { ...rowCard, opacity: 0.55 };

/** 44px 작은 버튼 (행 안 오른쪽) */
export const rowBtn: CSSProperties = { ...brownBtn, margin: 0, padding: '0 10px', fontSize: 14, whiteSpace: 'nowrap', flex: '0 0 auto' };
export const rowBtnOn: CSSProperties = { ...rowBtn, background: PALETTE.btnOn, color: PALETTE.btnOnText };
export const rowBtnOff: CSSProperties = { ...rowBtn, ...brownBtnOff, margin: 0 };
export const rowBtnDanger: CSSProperties = { ...rowBtn, background: '#8a2a2a' };

export const soft: CSSProperties = { color: PALETTE.inkSoft, fontSize: 14 };

/** ui-bar: 한 줄로 자르는 글 (카드 설명·하단 고정 바) */
export const oneLine: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** 비어 있을 때 안내 */
export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ ...soft, padding: '16px 0', textAlign: 'center' }}>{children}</div>;
}

/** 두 번 눌러 확정하는 위험 버튼: 1번 → "정말?" 상태, 2번 → 실행. 다른 곳을 누르면 돌아간다. */
export function ConfirmRow({ text, yes, onYes, onNo }: { text: string; yes: string; onYes: () => void; onNo: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6, padding: 8, background: PALETTE.paperDark, borderRadius: 6 }}>
      <span style={{ flex: '1 1 140px', fontSize: 14 }}>{text}</span>
      <button style={rowBtnDanger} onClick={onYes}>{yes}</button>
      <button style={rowBtn} onClick={onNo}>아니요</button>
    </div>
  );
}

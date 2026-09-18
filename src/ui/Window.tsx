import { useEffect, type ReactNode } from 'react';
import { pauseGame } from './store';
import { brownBtn, brownBtnOn, PALETTE } from './frame';

export interface WindowTab<K extends string = string> { key: K; label: string; badge?: number }

/** 카이로식 전체 화면 창: 제목 띠 + 오른쪽 위 ✕(44px) + 상단 가로 하위 탭 바 + 스크롤 본문.
 *  열려 있는 동안 게임을 멈추고(pauseGame) 닫히면 이전 속도로 돌아간다. */
export function Window<K extends string>({ title, tabs, tab, onTab, onClose, children, testId }: {
  title: string;
  tabs?: WindowTab<K>[];
  tab?: K;
  onTab?: (k: K) => void;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => pauseGame(), []);
  return (
    <div data-testid={testId ?? 'window'} role="dialog" aria-label={title}
      style={{ position: 'absolute', inset: 0, zIndex: 30, background: PALETTE.paper, color: PALETTE.ink, display: 'flex', flexDirection: 'column', fontSize: 16 }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', background: PALETTE.title, color: PALETTE.titleText, borderBottom: `3px solid ${PALETTE.wood}`, paddingLeft: 12, minHeight: 44 }}>
        <b style={{ flex: 1, fontSize: 18 }}>{title}</b>
        <button aria-label="닫기" data-testid="window-close" onClick={onClose}
          style={{ width: 44, height: 44, border: 0, background: 'transparent', color: PALETTE.titleText, fontSize: 22, fontWeight: 700, fontFamily: 'inherit' }}>✕</button>
      </div>
      {tabs && tabs.length > 0 && (
        <div data-testid="window-tabs" style={{ flex: 'none', display: 'flex', gap: 4, padding: '6px 8px 0', borderBottom: `2px solid ${PALETTE.woodLight}`, background: PALETTE.paperDark, overflowX: 'auto' }}>
          {tabs.map((t) => (
            <button key={t.key} data-tab={t.label} aria-label={t.label} aria-selected={t.key === tab} onClick={() => onTab?.(t.key)}
              style={{ ...(t.key === tab ? brownBtnOn : brownBtn), margin: 0, marginBottom: -2, padding: '0 10px', fontSize: 15, flex: '1 0 auto', minWidth: 0, borderRadius: '8px 8px 0 0', borderBottom: t.key === tab ? `3px solid ${PALETTE.btnOn}` : undefined, position: 'relative', whiteSpace: 'nowrap' }}>
              {t.label}
              {t.badge ? <span style={{ position: 'absolute', top: -6, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: PALETTE.bad, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: '0 4px' }}>{t.badge}</span> : null}
            </button>
          ))}
        </div>
      )}
      <div data-testid="window-body" style={{ flex: 1, overflowY: 'auto', padding: '10px 12px calc(12px + env(safe-area-inset-bottom))', WebkitOverflowScrolling: 'touch' }}>
        {children}
      </div>
    </div>
  );
}

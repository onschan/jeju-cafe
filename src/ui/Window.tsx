import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { pauseGame } from './store';
import { brownBtn, PALETTE, NO_SCROLLBAR } from './frame';
import { IconGrid, type IconGridItem } from './IconGrid';

export type { IconGridItem } from './IconGrid';

/** ui3 창 공통: 창·탭마다 스크롤 위치를 기억한다 (세션). 다시 열면 보던 자리로. */
const SCROLL_MEMORY = new Map<string, number>();
export function resetWindowScrollMemory(): void { SCROLL_MEMORY.clear(); }
function useScrollMemory(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = SCROLL_MEMORY.get(key);
    if (saved) el.scrollTop = saved;
    const onScroll = () => SCROLL_MEMORY.set(key, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [key]);
  return ref;
}

/** 창 하단 고정 바 슬롯. 창 내용(짓기·메뉴판…)이 「고른 것」 상세와 주 버튼을 여기로 보내면
 *  본문은 그 위에서만 스크롤되고, 바는 「닫기」 줄 바로 위에 고정된다. 고른 게 없으면 바가 아예 없어 목록이 길어진다.
 *  창 셸 밖(미리보기·테스트)에서는 제자리에 그대로 그린다. */
const BAR_SLOT = createContext<HTMLElement | null>(null);

export function WindowBar({ children, testId }: { children?: ReactNode; testId?: string }) {
  const host = useContext(BAR_SLOT);
  const bar = (
    <div data-testid={testId ?? 'window-bar'}
      style={{ background: PALETTE.paper, borderTop: `3px solid ${PALETTE.wood}`, boxShadow: `inset 0 2px 0 ${PALETTE.woodLight}`, padding: '6px 10px' }}>{children}</div>
  );
  return host ? createPortal(bar, host) : bar;
}

/** 카이로식 전체 화면 창 (UX §5.1): 제목 띠 + 오른쪽 위 닫기 아이콘(44px) + 본문 + 하단 오른쪽 `닫기` 48px(§5.6 한 손 조작).
 *  `menu`(아이콘 그리드 항목)를 주면 tab이 없을 때 2열 아이콘 그리드를 본문에 그리고, tab이 있으면 제목이 `창 › 항목`이 되며 ◀로 그리드로 돌아간다.
 *  열려 있는 동안 게임을 멈추고(pauseGame — 속도 잠금이면 안 멈춤) 닫히면 이전 속도로 돌아간다. */
export function Window<K extends string>({ title, menu, tab, onTab, onClose, children, testId, footer }: {
  title: string;
  menu?: IconGridItem<K>[];
  tab?: K | null;
  onTab?: (k: K | null) => void;
  onClose: () => void;
  children?: ReactNode;
  testId?: string;
  /** 하단 줄 왼쪽에 놓을 주 버튼(확정 등). 닫기는 항상 오른쪽. */
  footer?: ReactNode;
}) {
  useEffect(() => pauseGame('window'), []);
  const item = menu && tab ? menu.find((m) => m.key === tab) : undefined;
  const showGrid = !!menu && !tab;
  const bodyRef = useScrollMemory(`${testId ?? title}:${tab ?? ''}`);
  const [barHost, setBarHost] = useState<HTMLDivElement | null>(null); // 하단 고정 바가 들어갈 자리 (본문 아래·닫기 줄 위)
  return (
    <div data-testid={testId ?? 'window'} role="dialog" aria-label={item ? `${title} ${item.label}` : title}
      style={{ position: 'absolute', inset: 0, zIndex: 30, background: PALETTE.paper, color: PALETTE.ink, display: 'flex', flexDirection: 'column', fontSize: 16 }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', background: PALETTE.title, color: PALETTE.titleText, borderBottom: `3px solid ${PALETTE.wood}`, paddingLeft: item ? 0 : 12, minHeight: 44 }}>
        {item && (
          <button aria-label="메뉴로" data-testid="window-back" onClick={() => onTab?.(null)}
            style={{ width: 44, height: 44, border: 0, background: 'transparent', color: PALETTE.titleText, fontSize: 20, fontWeight: 700, fontFamily: 'inherit' }}>◀</button>
        )}
        <b style={{ flex: 1, fontSize: 18, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}{item ? <span style={{ opacity: 0.85 }}> › <Icon name={item.icon} size={18} /> {item.label}</span> : null}</b>
        <button aria-label="닫기" data-testid="window-close" onClick={onClose}
          style={{ width: 44, height: 44, border: 0, background: 'transparent', color: PALETTE.titleText, fontSize: 22, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></button>
      </div>
      <div ref={bodyRef} data-testid="window-body" className={NO_SCROLLBAR} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '10px 12px 12px', WebkitOverflowScrolling: 'touch' }}>
        <BAR_SLOT.Provider value={barHost}>
          {showGrid ? <IconGrid items={menu!} onPick={(k) => onTab?.(k)} testId={testId ? `${testId}-grid` : 'window-grid'} /> : children}
        </BAR_SLOT.Provider>
      </div>
      <div ref={setBarHost} data-testid="window-bar-slot" style={{ flex: 'none' }} />
      <div data-testid="window-footer" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '6px 8px calc(6px + env(safe-area-inset-bottom))', borderTop: `2px solid ${PALETTE.woodLight}`, background: PALETTE.paperDark }}>
        <span style={{ flex: 1, display: 'flex', gap: 6, minWidth: 0 }}>{footer}</span>
        <button aria-label="닫기" data-testid="window-close-bottom" onClick={onClose}
          style={{ ...brownBtn, margin: 0, minHeight: 48, minWidth: 96, fontSize: 16 }}><Icon name="close" /> 닫기</button>
      </div>
    </div>
  );
}

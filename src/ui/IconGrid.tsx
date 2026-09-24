/** 카이로 Menu 관례(V2 f20)의 2열 아이콘 그리드 (UX §5.1): 셀 64×64, 아이콘 32 + 한글 2~3자.
 *  잠긴 셀은 `?` + 회색, 새 셀은 NEW 리본, 안 본 항목은 빨간 배지. 창의 하위 탭 바를 대신한다. */
import type { CSSProperties } from 'react';
import { PALETTE } from './frame';
import { Icon } from './Icon';

export interface IconGridItem<K extends string = string> {
  key: K;
  /** 한글 2~3자 */
  label: string;
  /** 창 메뉴에서 라벨 아래 한 줄 — 뒤에 무엇이 있는지 (fill일 때만 보인다, ≤ 14자) */
  desc?: string;
  /** 픽셀 아이콘 이름 (public/assets/icons/icon_<name>.png, 32px로 확대) */
  icon: string;
  /** 잠김: `?` + 회색. 잠긴 이유는 lockedText로 */
  locked?: boolean;
  lockedText?: string;
  /** NEW 리본 */
  isNew?: boolean;
  /** 안 본 항목 수 (0이면 없음) */
  badge?: number;
}

export const GRID_CELL = 64;

const cell: CSSProperties = {
  width: '100%', minHeight: GRID_CELL, padding: '6px 4px 4px', boxSizing: 'border-box', border: `3px solid ${PALETTE.wood}`, borderRadius: 8,
  background: PALETTE.btn, color: PALETTE.btnText, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, lineHeight: 1.1,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative',
};

/** 창 메뉴로 쓸 때 셀이 커지는 최대 높이 (uifix: 넉 장이 위쪽 150px만 쓰고 아래가 통째로 비던 것) */
export const GRID_FILL_MAX = 140;

/** cols 기본 2. 셀을 누르면 onPick(key). active면 노란 강조(탭으로 쓸 때).
 *  fill이면 창 본문 높이를 받아 셀을 키우고(최대 GRID_FILL_MAX) 위아래 가운데에 둔다 — 창 아래가 텅 비지 않게. */
export function IconGrid<K extends string>({ items, active, onPick, cols = 2, testId, tutPrefix = 'tab', fill }: {
  items: IconGridItem<K>[]; active?: K | null; onPick: (k: K) => void; cols?: number; testId?: string; tutPrefix?: string; fill?: boolean;
}) {
  return (
    <div data-testid={testId} role="tablist" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6, marginBottom: fill ? 0 : 8,
      ...(fill ? { height: '100%', gridAutoRows: `minmax(${GRID_CELL + 24}px, ${GRID_FILL_MAX}px)`, alignContent: 'center' } : null) }}>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button key={it.key} role="tab" aria-selected={on} aria-pressed={on} aria-label={it.locked ? `${it.label} (잠김)` : it.label} disabled={it.locked}
            data-tab={it.label} data-tut={`${tutPrefix}:${it.key}`} data-testid={testId ? `${testId}-${it.key}` : undefined} title={it.locked ? it.lockedText : undefined}
            onClick={() => { if (!it.locked) onPick(it.key); }}
            style={{ ...cell, ...(on ? { background: PALETTE.btnOn, color: PALETTE.btnOnText } : {}), ...(it.locked ? { background: '#9a8a74', color: '#e8dcc4', opacity: 0.8 } : {}) }}>
            <span aria-hidden style={{ fontSize: 28, lineHeight: '32px', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.locked ? <Icon name="lock" size={32} /> : <Icon name={it.icon} size={32} />}</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{it.label}</span>
            {fill && it.desc && !it.locked && <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{it.desc}</span>}
            {it.isNew && !it.locked && <span data-testid="ribbon-new" style={{ position: 'absolute', top: -2, left: -2, background: PALETTE.bad, color: '#fff', fontSize: 10, lineHeight: '14px', padding: '0 5px', borderRadius: '6px 0 6px 0', letterSpacing: 0.5 }}>NEW</span>}
            {!!it.badge && it.badge > 0 && !it.locked && <span data-testid="grid-badge" style={{ position: 'absolute', top: -6, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: PALETTE.bad, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: '0 4px' }}>{it.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

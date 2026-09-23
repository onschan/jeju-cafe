/** ui3 숏컷: 길게 누르기 방사형 메뉴 (맵 위 시설·빈 칸).
 *  화면 좌표(left·top)를 중심으로 위·오른쪽·아래·왼쪽 4버튼. 버튼은 56px(≥44px), 글자 14px.
 *  바깥을 누르면 닫힌다. 화면 가장자리에서는 중심을 안쪽으로 당긴다. */
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { PALETTE } from './frame';

export interface RadialItem {
  /** 원 안에 들어가는 짧은 말 (≤3자) */
  label: string;
  /** 읽어 주는 이름 (없으면 label) */
  aria?: string;
  icon: string;
  onPick: () => void;
  disabled?: boolean;
  /** 못 쓰는 이유 (눌러도 메시지만) */
  reason?: string;
}

const R = 62;      // 중심에서 버튼 중심까지
const BTN = 56;
const MARGIN = 12;

/** 4방향 배치: 0=위 1=오른쪽 2=아래 3=왼쪽 */
const DIR: { dx: number; dy: number }[] = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

export function RadialMenu({ left, top, items, onClose }: { left: number; top: number; items: RadialItem[]; onClose: () => void }) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const pad = R + BTN / 2 + MARGIN;
  const cx = Math.max(pad, Math.min(size.w - pad, left));
  const cy = Math.max(pad + 40, Math.min(size.h - pad - 60, top));
  return (
    <div data-testid="radial-menu" style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
      <button aria-label="닫기" onClick={onClose} style={{ position: 'absolute', inset: 0, background: '#0006', border: 0, padding: 0 }} />
      <span aria-hidden style={{ position: 'absolute', left: cx - 9, top: cy - 9, width: 18, height: 18, borderRadius: 9, background: PALETTE.paper, border: `3px solid ${PALETTE.wood}` }} />
      {items.slice(0, 4).map((it, i) => {
        const d = DIR[i]!;
        const x = cx + d.dx * R - BTN / 2;
        const y = cy + d.dy * R - BTN / 2;
        return (
          <button key={`${i}:${it.label}`} data-testid={`radial-${i}`} aria-label={it.aria ?? it.label} disabled={it.disabled}
            onClick={() => { onClose(); it.onPick(); }}
            style={{
              position: 'absolute', left: Math.round(x), top: Math.round(y), width: BTN, height: BTN, padding: 0,
              borderRadius: BTN / 2, border: `3px solid ${PALETTE.wood}`, background: it.disabled ? PALETTE.paperDark : PALETTE.paper,
              color: it.disabled ? PALETTE.inkSoft : PALETTE.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, lineHeight: 1.1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              boxShadow: '0 2px 0 #0004', opacity: it.disabled ? 0.6 : 1,
            }}>
            <Icon name={it.icon} size={18} />
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

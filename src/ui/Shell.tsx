import type { CSSProperties } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame, getToast } from './store';
import { seasonOf, boardBadge, type Season } from '../sim/index.ts';
import { Icon } from './Icon';
import { GoalBar, GOAL_BAR_H } from './GoalBar';
import { SpeedBar } from './SpeedBar';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, PALETTE } from './frame';

/** 상단 바 28px + 목표 줄 44px(목표 24 + 도전 20, §7.3). 기본 상태에서 맵을 가리는 건 이것과 하단 바 48px뿐. */
export const TOP_BAR_H = 28;
export const SHELL_TOP = TOP_BAR_H + GOAL_BAR_H;
export const BOTTOM_BAR_H = 48;

const SEASON_ICON: Record<Season, string> = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' };

export type WindowKind = 'build' | 'cafe' | 'people' | 'ledger';

const MAIN_TABS: { kind: WindowKind; icon: string; label: string }[] = [
  { kind: 'build', icon: 'build', label: '짓기' },
  { kind: 'cafe', icon: 'menu', label: '카페' },
  { kind: 'people', icon: 'local', label: '사람' },
  { kind: 'ledger', icon: 'money', label: '장부' },
];

/** 상단 바: 날짜 · 계절 · 자금 · ★. 탭하면 경영 현황 창. */
export function TopBar({ onOpen }: { onOpen: () => void }) {
  const s = useGame();
  const season = seasonOf(s.clock.month);
  return (
    <button data-testid="top-bar" onClick={onOpen} aria-label="경영 현황"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_H, padding: '0 10px', border: 0, borderBottom: `2px solid ${PALETTE.wood}`, background: PALETTE.paper, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, whiteSpace: 'nowrap', overflow: 'hidden', zIndex: 10 }}>
      <span>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
      <span aria-label={season}>{SEASON_ICON[season]}</span>
      <span title={wonText(s.money)}><Icon name="money" size={16} alt="돈" /> {wonText(s.money, true)}</span>
      <span aria-label={`평판 ${Math.round(s.reputation)}`} title="평판">♥{Math.round(s.reputation)}</span>
      <span aria-label={`별 ${s.star}`}>{'★'.repeat(Math.max(1, Math.min(5, s.star)))}<span style={{ color: PALETTE.inkSoft }}>{'☆'.repeat(5 - Math.max(1, Math.min(5, s.star)))}</span></span>
    </button>
  );
}

/** 상단 바 + 목표 줄 묶음 */
export function TopShell({ onStatus, onGoal }: { onStatus: () => void; onGoal: () => void }) {
  return (
    <>
      <TopBar onOpen={onStatus} />
      <GoalBar top={TOP_BAR_H} onOpen={onGoal} />
    </>
  );
}

const barStyle: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0, height: `calc(${BOTTOM_BAR_H}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)',
  boxSizing: 'border-box', background: PALETTE.paper, borderTop: `2px solid ${PALETTE.wood}`, display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', zIndex: 10,
};

/** 하단 바 48px: 짓기·카페·사람·장부 4버튼 + 오른쪽 속도. */
export function BottomBar({ onOpen }: { onOpen: (kind: WindowKind) => void }) {
  const s = useGame();
  const badge = boardBadge(s);
  return (
    <div data-testid="bottom-bar" style={barStyle}>
      {MAIN_TABS.map((t) => (
        <button key={t.kind} data-tab={t.label} data-tut={`nav:${t.kind}`} aria-label={t.label} onClick={() => onOpen(t.kind)}
          style={{ ...brownBtn, flex: 1, minWidth: 0, margin: 0, padding: 0, fontSize: 14, lineHeight: 1, height: 44, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, whiteSpace: 'nowrap', position: 'relative' }}>
          <Icon name={t.icon} size={16} /><span>{t.label}</span>
          {t.kind === 'people' && badge > 0 && <span data-testid="board-badge" style={{ position: 'absolute', top: -6, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: PALETTE.bad, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: '0 4px' }}>{badge}</span>}
        </button>
      ))}
      <SpeedBar />
    </div>
  );
}

/** 고스트 배치 확정 줄: 하단 바 자리에 `회전 · 확정 · 취소` 3버튼 1줄. text는 상태 문구(위에 작게). */
export interface PlaceBarProps {
  text: string;
  ok: boolean;
  canRotate: boolean;
  /** 확정 버튼 없이 취소만 (길·담 칠하기) */
  paint?: boolean;
  onConfirm: () => void;
  onRotate: () => void;
  onCancel: () => void;
}

export function PlaceBar({ text, ok, canRotate, paint, onConfirm, onRotate, onCancel }: PlaceBarProps) {
  const toast = getToast();
  return (
    <div data-testid="place-bar" style={barStyle}>
      <div style={{ position: 'absolute', left: 8, right: 8, bottom: `calc(100% + 4px)`, background: toast ? PALETTE.bad : PALETTE.paper, color: toast ? '#fff' : ok ? PALETTE.ok : PALETTE.bad, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{toast ?? text}</div>
      {canRotate && <button aria-label="회전" style={{ ...brownBtn, margin: 0, flex: 1, minWidth: 0, fontSize: 16 }} onClick={onRotate}>↻ 회전</button>}
      {paint
        ? <button aria-label="완료" style={{ ...brownBtnOn, margin: 0, flex: 2, minWidth: 0, fontSize: 16 }} onClick={onCancel}>✓ 완료</button>
        : <button aria-label="확정" style={{ ...(ok ? brownBtnOn : brownBtnOff), margin: 0, flex: 2, minWidth: 0, fontSize: 16 }} onClick={onConfirm}>✓ 확정</button>}
      <button aria-label="취소" style={{ ...dangerBtn, margin: 0, flex: 1, minWidth: 0, fontSize: 16 }} onClick={onCancel}>✗ 취소</button>
    </div>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { seasonOf, boardBadge, gradeOf, gradeName, type Season } from '../sim/index.ts';
import { GradeWindow } from './GradeWindow';
import { Icon } from './Icon';
import { GoalBar, GOAL_BAR_H } from './GoalBar';
import { MESSAGE_LINE_H } from './MessageLine';
import { SpeedBar } from './SpeedBar';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, PALETTE } from './frame';

/** 상단 바 28px + 목표 줄 44px(목표 24 + 도전 20, §7.3). 기본 상태에서 맵을 가리는 건 이것과 하단 바 48px뿐. */
export const TOP_BAR_H = 28;
export const SHELL_TOP = TOP_BAR_H + GOAL_BAR_H;
export const BOTTOM_BAR_H = 48;
/** 하단 바 48 + 메시지 줄 24 (§5.5). 미니카드·고스트 버튼은 이 위에 놓는다 */
export const SHELL_BOTTOM = BOTTOM_BAR_H + MESSAGE_LINE_H;

const SEASON_ICON: Record<Season, string> = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };
const SEASON_LABEL: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

export type WindowKind = 'build' | 'cafe' | 'people' | 'ledger';

const MAIN_TABS: { kind: WindowKind; icon: string; label: string }[] = [
  { kind: 'build', icon: 'build', label: '짓기' },
  { kind: 'cafe', icon: 'menu', label: '카페' },
  { kind: 'people', icon: 'local', label: '사람' },
  { kind: 'ledger', icon: 'money', label: '장부' },
];

/** 상단 바: 날짜 · 계절 · 자금 · 평판 · ★ (탭하면 경영 현황 창) + 오른쪽 끝 카페 등급 이름 (fun-rank: 탭하면 등급 창 — 조건 진행·「5년 뒤 우리 카페」 미리보기). */
export function TopBar({ onOpen }: { onOpen: () => void }) {
  const s = useGame();
  const season = seasonOf(s.clock.month);
  const bump = useMoneyBump(s.money);
  const [gradeOpen, setGradeOpen] = useState(false);
  const grade = gradeOf(s);
  return (
    <>
      <div data-testid="top-bar-row" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_H, borderBottom: `2px solid ${PALETTE.wood}`, background: PALETTE.paper, display: 'flex', alignItems: 'stretch', zIndex: 10 }}>
        <button data-testid="top-bar" onClick={onOpen} aria-label="경영 현황"
          style={{ flex: 1, minWidth: 0, height: TOP_BAR_H, padding: '0 4px 0 6px', border: 0, background: 'transparent', color: PALETTE.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
          <span aria-label={SEASON_LABEL[season]} title={SEASON_LABEL[season]}><Icon name={SEASON_ICON[season]} size={16} /></span>
          <span title={wonText(s.money)} style={{ display: 'inline-block', transition: 'transform 0.12s ease-out', transform: bump ? 'scale(1.18)' : 'scale(1)', color: bump ? PALETTE.btn : undefined }}><Icon name="money" size={16} alt="돈" /> {wonText(s.money, true)}</span>
          <span aria-label={`평판 ${Math.round(s.reputation)}`} title="평판"><Icon name="heart" size={14} />{Math.round(s.reputation)}</span>
          <span aria-label={`별 ${s.star}`} style={{ letterSpacing: -1 }}>{'★'.repeat(Math.max(1, Math.min(5, s.star)))}<span style={{ color: PALETTE.inkSoft }}>{'☆'.repeat(5 - Math.max(1, Math.min(5, s.star)))}</span></span>
        </button>
        <button data-testid="top-grade" data-tut="nav:grade" onClick={() => setGradeOpen(true)} aria-label={`카페 등급 ${gradeName(grade)}`} title="카페 등급"
          style={{ flex: 'none', height: TOP_BAR_H, padding: '0 6px 0 5px', border: 0, borderLeft: `2px solid ${PALETTE.woodLight}`, background: PALETTE.paperDark, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <Icon name="home_cafe" size={12} alt="" />{gradeName(grade).replace(' ', '')}
        </button>
      </div>
      {gradeOpen && <GradeWindow onClose={() => setGradeOpen(false)} />}
    </>
  );
}

/** 자금이 늘 때 숫자가 살짝 튀는 연출 (game-feel: 결제가 보이게). 줄어들 땐 안 튄다. 잦은 결제는 MONEY_BUMP_MS 동안 한 번으로 묶는다. */
const MONEY_BUMP_MS = 160;
function useMoneyBump(money: number): boolean {
  const prev = useRef(money);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    const up = money > prev.current;
    prev.current = money;
    if (!up) return;
    setBump(true);
    const t = setTimeout(() => setBump(false), MONEY_BUMP_MS);
    return () => clearTimeout(t);
  }, [money]);
  return bump;
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

/** 고스트 배치 확정 줄: 하단 바 자리에 `회전 · 확정 · 취소/완료` 3버튼 1줄. text는 상태 문구(메시지 줄 위에 작게). */
export interface PlaceBarProps {
  text: string;
  ok: boolean;
  canRotate: boolean;
  /** 회전 버튼 라벨 (기본 「회전」, 길·담 ㄱ자는 「방향」 — ease) */
  rotateLabel?: string;
  /** 확정 버튼 없이 완료만 (길·담 칠하기·철거·이동 대기) */
  paint?: boolean;
  /** 연속 배치 모드(§5.3): 취소 대신 `완료`로 나간다 */
  continuous?: boolean;
  /** 되돌리기 가능하면 ↶ 버튼 (§5.3) */
  onUndo?: (() => void) | null;
  onConfirm: () => void;
  onRotate: () => void;
  onCancel: () => void;
}

export function PlaceBar({ text, ok, canRotate, rotateLabel = '회전', paint, continuous, onUndo, onConfirm, onRotate, onCancel }: PlaceBarProps) {
  return (
    <div data-testid="place-bar" style={barStyle}>
      <div data-testid="place-text" style={{ position: 'absolute', left: 8, right: 8, bottom: `calc(100% + ${MESSAGE_LINE_H + 4}px)`, background: PALETTE.paper, color: ok ? PALETTE.ok : PALETTE.bad, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{text}</div>
      {onUndo !== undefined && <button aria-label="되돌리기" disabled={!onUndo} style={{ ...(onUndo ? brownBtn : brownBtnOff), margin: 0, flex: 1, minWidth: 0, fontSize: 15, padding: 0 }} onClick={() => onUndo?.()}><Icon name="undo" /> 되돌리기</button>}
      {canRotate && <button aria-label={rotateLabel} style={{ ...brownBtn, margin: 0, flex: 1, minWidth: 0, fontSize: 16, padding: 0 }} onClick={onRotate}>↻ {rotateLabel}</button>}
      {paint
        ? <button aria-label="완료" style={{ ...brownBtnOn, margin: 0, flex: 2, minWidth: 0, fontSize: 16 }} onClick={onCancel}><Icon name="check" /> 완료</button>
        : <button aria-label="확정" style={{ ...(ok ? brownBtnOn : brownBtnOff), margin: 0, flex: 2, minWidth: 0, fontSize: 16 }} onClick={onConfirm}><Icon name="check" /> 확정</button>}
      {!paint && (continuous
        ? <button aria-label="완료" style={{ ...brownBtn, margin: 0, flex: 1, minWidth: 0, fontSize: 15, padding: 0 }} onClick={onCancel}><Icon name="check" /> 완료</button>
        : <button aria-label="취소" style={{ ...dangerBtn, margin: 0, flex: 1, minWidth: 0, fontSize: 16, padding: 0 }} onClick={onCancel}><Icon name="close" /> 취소</button>)}
    </div>
  );
}

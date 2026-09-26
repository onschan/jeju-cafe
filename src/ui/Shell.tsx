import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { seasonOf, boardBadge, gradeOf, gradeName, hasFreeDraw, type Season } from '../sim/index.ts';
import { GradeWindow } from './GradeWindow';
import { Icon } from './Icon';
import { TodoLine, TODO_LINE_H } from './TodoLine'; // video-patch §3.4: 오늘 할 일 1줄
import { MESSAGE_LINE_H } from './MessageLine';
import { SpeedBar, SPEEDS } from './SpeedBar';
import { useShortcutsPref } from './shortcuts'; // ui3 숏컷
import { setUserSpeed, userSpeed, showMessage } from './store';
import { FAST_SPEED, type Speed } from '../sim/index.ts';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, PALETTE } from './frame';

/** uifix: 상시 표시는 **상단 2줄(28+28=56px)** 과 하단 1줄(48px)뿐.
 *  1줄 — 날짜·자금·평판·★ (응모권·등급은 아이콘 칸). 2줄 — 오늘 할 일 + 「할 일 n」 칩(목표·이달·경쟁을 여기 모았다).
 *  옛 목표 줄(24)·도전 줄(20)은 걷어 「할 일」 창으로 옮겼다 — 같은 것이 세 줄에 겹쳐 있던 것을 한 줄로. */
export const TOP_BAR_H = 28;
export const SHELL_TOP = TOP_BAR_H + TODO_LINE_H;
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

/** ui3 숏컷: 상단 바를 좌우로 스와이프하면 속도 한 단계 (버튼은 그대로 있다 — 보조 조작).
 *  왼쪽으로 밀면 느리게, 오른쪽으로 밀면 빠르게. 스와이프한 뒤의 탭(click)은 삼킨다. */
const SWIPE_PX = 44;
function useSpeedSwipe(enabled: boolean, speeds: readonly number[]) {
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => { startX.current = enabled ? e.clientX : null; swiped.current = false; };
  const onPointerUp = (e: React.PointerEvent) => {
    const x0 = startX.current;
    startX.current = null;
    if (x0 === null) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) < SWIPE_PX) return;
    swiped.current = true;
    const cur = userSpeed();
    const i = speeds.indexOf(cur);
    const next = speeds[Math.max(0, Math.min(speeds.length - 1, (i < 0 ? 1 : i) + (dx > 0 ? 1 : -1)))];
    if (next === undefined || next === cur) return;
    setUserSpeed(next as Speed);
    showMessage(next === 0 ? '잠시 멈췄어요' : `${next}배속`);
  };
  /** 스와이프 직후의 클릭이면 true (창을 안 연다) */
  const tookTap = () => { const v = swiped.current; swiped.current = false; return v; };
  return { onPointerDown, onPointerUp, onPointerCancel: () => { startX.current = null; }, tookTap };
}

/** uifix: 375px에서 글자가 서로 붙거나 잘리지 않게, **우선순위가 낮은 칸부터 통째로 숨긴다**.
 *  keys는 지킬 순서(앞이 높다). 잰 너비는 칸이 보일 때마다 새로 잰다 — 숨은 칸은 마지막에 잰 너비를 쓴다. */
function usePriorityFit(keys: string[], gap: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const widths = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      for (const k of keys) {
        const kid = el.querySelector<HTMLElement>(`[data-fit="${k}"]`);
        if (kid && kid.offsetWidth > 0) widths.current.set(k, kid.offsetWidth);
      }
      const avail = el.clientWidth;
      const next: string[] = [];
      let used = 0;
      let shown = 0;
      for (const k of keys) {
        const w = widths.current.get(k) ?? 0;
        const add = w + (shown > 0 ? gap : 0);
        if (used + add <= avail) { used += add; shown++; } else next.push(k);
      }
      setHidden((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return { ref, hidden: new Set(hidden) };
}

/** 칸 사이 최소 간격 (글자끼리 붙지 않게) */
const TOP_GAP = 6;
/** 지킬 순서: 자금 → 날짜 → ★ → 평판 → 계절. 폭이 모자라면 뒤에서부터 사라진다. */
const TOP_KEYS = ['money', 'date', 'star', 'rep', 'season'];

/** 상단 1줄: 날짜 · (계절) · 자금 · ♥평판 · ★ — 탭하면 경영 현황 창.
 *  오른쪽 끝에 응모권 칸(있을 때만)과 카페 등급 아이콘(탭하면 등급 창). 등급 이름은 잘리느니 창에서 읽게 뒀다. */
export function TopBar({ onOpen, onTickets }: { onOpen: () => void; onTickets?: () => void }) {
  const s = useGame();
  const season = seasonOf(s.clock.month);
  const bump = useMoneyBump(s.money);
  const [gradeOpen, setGradeOpen] = useState(false);
  const grade = gradeOf(s);
  const shortcuts = useShortcutsPref();
  const speeds = SPEEDS.filter((sp) => sp < FAST_SPEED || s.ending?.fastMode);
  const swipe = useSpeedSwipe(shortcuts, speeds);
  const showTickets = false; // 응모권·뽑기는 없앴다 (뭐에 쓰는지 아무도 몰랐다) — 보상은 전부 돈으로. 옛 세이브의 장수는 남아 있어도 안 보여 준다
  void onTickets;
  const fit = usePriorityFit(TOP_KEYS, TOP_GAP);
  const cell = (key: string): CSSProperties => ({ display: fit.hidden.has(key) ? 'none' : 'inline-flex', alignItems: 'center', gap: 2, flex: 'none', whiteSpace: 'nowrap' });
  const star = Math.max(1, Math.min(5, s.star));
  return (
    <>
      <div data-testid="top-bar-row" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: TOP_BAR_H, borderBottom: `2px solid ${PALETTE.wood}`, background: PALETTE.paper, display: 'flex', alignItems: 'stretch', zIndex: 10, touchAction: 'pan-y' }}>
        <button data-testid="top-bar" onClick={() => { if (!swipe.tookTap()) onOpen(); }} aria-label="경영 현황"
          onPointerDown={swipe.onPointerDown} onPointerUp={swipe.onPointerUp} onPointerCancel={swipe.onPointerCancel}
          style={{ flex: 1, minWidth: 0, height: TOP_BAR_H, padding: '0 6px', border: 0, background: 'transparent', color: PALETTE.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <span ref={fit.ref} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: TOP_GAP, overflow: 'hidden' }}>
            <span data-fit="date" style={cell('date')}>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
            <span data-fit="season" style={cell('season')} aria-label={SEASON_LABEL[season]} title={SEASON_LABEL[season]}><Icon name={SEASON_ICON[season]} size={16} /></span>
            <span data-fit="money" style={{ ...cell('money'), transition: 'transform 0.12s ease-out', transform: bump ? 'scale(1.18)' : 'scale(1)', color: bump ? PALETTE.btn : undefined }} title={wonText(s.money)}><Icon name="money" size={16} alt="돈" /> {wonText(s.money, true)}</span>
            <span data-fit="rep" style={cell('rep')} aria-label={`평판 ${Math.round(s.reputation)}`} title="평판"><Icon name="heart" size={14} />{Math.round(s.reputation)}</span>
            <span data-fit="star" style={{ ...cell('star'), letterSpacing: -1 }} aria-label={`별 ${s.star}`}>{'★'.repeat(star)}<span style={{ color: PALETTE.inkSoft }}>{'☆'.repeat(5 - star)}</span></span>
          </span>
        </button>
        {/* midgame: 응모권이 있으면 상단에 칸을 내준다 — 탭하면 뽑는 곳으로 (「이게 뭐 하는 건지」가 한 번에 보이게) */}
        {showTickets && (
          <button data-testid="top-tickets" onClick={onTickets} aria-label={`응모권 ${s.tickets}장${hasFreeDraw(s) ? ' · 무료 뽑기 1회' : ''}`} title={`응모권 — 뽑기 1회 = 1장${hasFreeDraw(s) ? ' · 이달 무료 뽑기 1회' : ''}`}
            style={{ flex: 'none', height: TOP_BAR_H, padding: '0 5px', border: 0, borderLeft: `2px solid ${PALETTE.woodLight}`, background: hasFreeDraw(s) ? '#fff6dc' : PALETTE.paper, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {/* uifix: 응모권이 0장인데 무료 뽑기가 있으면 「0!」로 읽혀 헷갈렸다 — 0장이면 숫자를 빼고 ! 만 */}
            <Icon name="ticket" size={14} />{s.tickets > 0 && s.tickets}{hasFreeDraw(s) && <span style={{ color: PALETTE.btn }}>!</span>}
          </button>
        )}
        <button data-testid="top-grade" data-tut="nav:grade" onClick={() => setGradeOpen(true)} aria-label={`카페 등급 ${gradeName(grade)}`} title={`카페 등급 — ${gradeName(grade)}`}
          style={{ flex: 'none', width: 30, height: TOP_BAR_H, padding: 0, border: 0, borderLeft: `2px solid ${PALETTE.woodLight}`, background: PALETTE.paperDark, color: PALETTE.ink, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="home_cafe" size={20} alt="" />
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

/** 상단 2줄 묶음 (uifix): 1줄 상태 · 2줄 오늘 할 일. 합쳐 56px을 넘지 않는다. */
export function TopShell({ onStatus, onGoal, onTickets }: { onStatus: () => void; onGoal: () => void; onTickets?: () => void }) {
  return (
    <>
      <TopBar onOpen={onStatus} onTickets={onTickets} />
    </>
  );
}

const barStyle: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 0, height: `calc(${BOTTOM_BAR_H}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)',
  boxSizing: 'border-box', background: PALETTE.paper, borderTop: `2px solid ${PALETTE.wood}`, display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px', zIndex: 10,
};

/** ui3 숏컷: 하단 바 버튼을 길게 누르면 바로 가기 (짓기=최근 시설 퀵바 · 카페=메뉴판 · 사람=채용) */
export const BAR_PRESS_MS = 500;

/** 하단 바 48px: 짓기·카페·사람·장부 4버튼 + 오른쪽 속도. */
export function BottomBar({ onOpen, onLongOpen }: { onOpen: (kind: WindowKind) => void; onLongOpen?: (kind: WindowKind) => void }) {
  const s = useGame();
  const badge = boardBadge(s);
  const shortcuts = useShortcutsPref();
  const timer = useRef(0);
  const fired = useRef(false);
  const down = (kind: WindowKind) => {
    if (!shortcuts || !onLongOpen) return;
    fired.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { fired.current = true; onLongOpen(kind); }, BAR_PRESS_MS);
  };
  const up = () => window.clearTimeout(timer.current);
  return (
    <div data-testid="bottom-bar" style={barStyle}>
      {MAIN_TABS.map((t) => (
        <button key={t.kind} data-tab={t.label} data-tut={`nav:${t.kind}`} aria-label={t.label}
          onClick={() => { if (fired.current) { fired.current = false; return; } onOpen(t.kind); }}
          onPointerDown={() => down(t.kind)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
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
  /** fun: 트레이드오프 두 줄 — 얻는 것(초록)·잃는 것(빨강) */
  tradeoff?: { gain: string; loss: string; cost?: string }; // cost = stakes 기회비용 한 줄
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

export function PlaceBar({ text, tradeoff, ok, canRotate, rotateLabel = '회전', paint, continuous, onUndo, onConfirm, onRotate, onCancel }: PlaceBarProps) {
  const hasTrade = !!(tradeoff && (tradeoff.gain || tradeoff.loss));
  return (
    <div data-testid="place-bar" style={barStyle}>
      <div data-testid="place-text" style={{ position: 'absolute', left: 8, right: 8, bottom: `calc(100% + ${MESSAGE_LINE_H + 4}px)`, background: PALETTE.paper, color: ok ? PALETTE.ok : PALETTE.bad, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '4px 8px', fontSize: 13, fontWeight: 700, pointerEvents: 'none' }}>
        <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.35 }}>{text}</div>{/* [코어만] 폰에서 한 줄로 자르면 「여기에 지을 …」처럼 끝이 날아간다 — 두 줄까지 접는다 */}
        {hasTrade && (
          <div data-testid="place-tradeoff" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 8px', fontSize: 12, fontWeight: 700, marginTop: 2, lineHeight: 1.35 }}>
            {tradeoff!.gain && <span style={{ color: PALETTE.ok }}>{tradeoff!.gain}</span>}
            {tradeoff!.loss && <span style={{ color: PALETTE.bad }}>{tradeoff!.loss}</span>}
          </div>
        )}
        {tradeoff?.cost && (
          <div data-testid="place-cost" style={{ fontSize: 12, fontWeight: 700, marginTop: 2, color: PALETTE.title, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>{tradeoff.cost}</div>
        )}
      </div>
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

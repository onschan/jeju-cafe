import { useState, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useGame, dispatch, getToast } from './store';
import { nextUnlock, canUnlock } from '../sim/index.ts';
import { objectDef, menuDef, cropDef, roleDef } from '../data/index.ts';
import { useGuideTop, setHudHeight } from './Guide';
import { Icon } from './Icon';
import { isMuted, setMuted } from './audio';

const SPEEDS = [0, 1, 2, 3] as const;
const SPEED_ICON: Record<(typeof SPEEDS)[number], string> = { 0: 'speed_pause', 1: 'speed_1', 2: 'speed_2', 3: 'speed_3' };

const iconBtn: CSSProperties = { width: 44, height: 44, padding: 0, border: 0, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

/** 돈을 짧게: 1만 이상은 '497만'처럼 만 단위(내림), 그 아래는 그대로. 375px 폰에서 HUD 한 줄에 들어가도록. */
export function compactMoney(n: number): string {
  const neg = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 10_000) return `${neg}${Math.floor(a / 10_000).toLocaleString()}만`;
  return `${neg}${a.toLocaleString()}`;
}

/** 연구 포인트를 짧게: 1만 이상은 '1.2만'(소수 1자리), 그 아래는 구분 기호 없이 그대로. */
export function compactNumber(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 10_000) return `${sign}${(Math.floor(a / 1000) / 10).toFixed(a % 10_000 >= 1000 ? 1 : 0)}만`;
  return `${sign}${a}`;
}

/** 6~23시 → 'AM 8:00' / 'PM 3:00' */
export function clockText(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 || hour >= 24 ? 'AM' : 'PM'} ${h12}:00`;
}

/** 밤 오버레이 알파: 18시 0 → 22시 0.55 */
export function nightAlpha(hour: number): number {
  return Math.max(0, Math.min(1, (hour - 18) / 4)) * 0.55;
}

/** 캔버스 위·HUD 아래에 깔리는 밤 어둠. 터치는 통과한다. */
export function NightOverlay() {
  const s = useGame();
  const a = nightAlpha(s.clock.hour);
  if (a <= 0) return null;
  return <div data-testid="night" style={{ position: 'absolute', inset: 0, background: `rgba(11,26,58,${a.toFixed(3)})`, pointerEvents: 'none' }} />;
}

function unlockName(u: NonNullable<ReturnType<typeof nextUnlock>>) {
  if (u.kind === 'object') return objectDef(u.ref).name;
  if (u.kind === 'menu') return menuDef(u.ref).name;
  if (u.kind === 'crop') return cropDef(u.ref).name;
  if (u.kind === 'slot') return `${roleDef(u.ref).name} 자리`;
  return roleDef(u.ref).name;
}

export function HUD({ onMenu }: { onMenu?: () => void } = {}) {
  const s = useGame();
  const u = nextUnlock(s);
  const toast = getToast();
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };
  const guideTop = useGuideTop();
  // 실제 높이를 재서 할망 안내·튜토리얼·토스트가 HUD 아래에 놓이게 한다 (토스트는 absolute라 높이에 안 잡힌다)
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setHudHeight(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHudHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={rootRef} data-testid="hud" style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 12px', color: '#fff', fontSize: 14, background: 'linear-gradient(#000a, #0000)', pointerEvents: 'none' }}>
      {/* 1행: 날짜·돈·연구·인기 (읽기 전용). 375px 한 줄에 맞게 압축 — 접히지 않고, 넘치면 오른쪽이 잘린다. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', columnGap: 5, whiteSpace: 'nowrap', flexWrap: 'nowrap', overflow: 'hidden', fontSize: 12, lineHeight: '20px' }}>
        <span style={{ flex: 'none' }}>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일 <span style={{ opacity: 0.85 }}>{clockText(s.clock.hour)}</span></span>
        <span style={{ flex: 'none' }} title={s.money.toLocaleString()}><Icon name="money" size={18} alt="돈" /> {compactMoney(s.money)}</span>
        <span style={{ flex: 'none' }} title={s.research.toLocaleString()}><Icon name="research" size={18} alt="연구" /> {compactNumber(s.research)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, flex: 'none' }}><Icon name="local" size={18} alt="동네 손님" /><meter min={-100} max={100} value={s.popularity} style={{ width: 36, verticalAlign: 'middle' }} /><Icon name="tourist" size={18} alt="관광객" /></span>
      </div>
      {/* 2행: 속도 버튼(44×44)과 해금·음소거 버튼 — 손가락으로 누르는 것만 모아 둔다 */}
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ pointerEvents: 'auto', display: 'flex', gap: 4 }}>
          {SPEEDS.map((sp) => (
            <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })} aria-label={sp === 0 ? '일시정지' : `${sp}배속`}
              style={{ ...iconBtn, background: s.clock.speed === sp ? '#ffd166' : '#333' }}>
              <Icon name={SPEED_ICON[sp]} size={32} />
            </button>
          ))}
        </span>
        <span style={{ pointerEvents: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
          {u ? (
            <button disabled={!canUnlock(s).ok} onClick={() => dispatch({ type: 'unlock' })}
              style={{ minHeight: 44, background: canUnlock(s).ok ? '#06d6a0' : '#444', color: '#fff', border: 0, borderRadius: 6, padding: '0 10px', whiteSpace: 'nowrap' }}>
              <Icon name="unlock" size={16} /> {unlockName(u)} ({Math.min(s.research, u.cost)}/{u.cost})
            </button>
          ) : <span>다 열었어요!</span>}
          {/* 메뉴가 있으면(게임 화면) 음소거는 메뉴 팝업 안으로 들어간다 — 375px 한 줄에 44px 버튼을 더 못 넣는다 */}
          {onMenu
            ? <button onClick={onMenu} aria-label="메뉴" data-testid="menu-btn" style={{ ...iconBtn, background: '#333', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>메뉴</button>
            : <button onClick={toggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} style={{ ...iconBtn, background: '#333' }}>
                <Icon name={muted ? 'sound_off' : 'sound_on'} size={32} />
              </button>}
        </span>
      </div>
      {/* 토스트는 할망 안내와 같은 자리를 불투명하게 덮는다 (HUD 높이를 늘려 안내와 겹치지 않도록) */}
      {toast && <div style={{ position: 'absolute', top: guideTop, left: 12, right: 12, background: '#c9184a', padding: '8px 10px', borderRadius: 8, fontSize: 16, fontWeight: 700 }}>{toast}</div>}
    </div>
  );
}

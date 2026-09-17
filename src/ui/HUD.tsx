import { useState, type CSSProperties } from 'react';
import { useGame, dispatch, getToast } from './store';
import { nextUnlock, canUnlock } from '../sim/index.ts';
import { objectDef, menuDef, cropDef, roleDef } from '../data/index.ts';
import { GUIDE_TOP } from './Guide';
import { Icon } from './Icon';
import { isMuted, setMuted } from './audio';

const SPEEDS = [0, 1, 2, 3] as const;
const SPEED_ICON: Record<(typeof SPEEDS)[number], string> = { 0: 'speed_pause', 1: 'speed_1', 2: 'speed_2', 3: 'speed_3' };

const iconBtn: CSSProperties = { width: 44, height: 44, padding: 0, border: 0, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

function unlockName(u: NonNullable<ReturnType<typeof nextUnlock>>) {
  if (u.kind === 'object') return objectDef(u.ref).name;
  if (u.kind === 'menu') return menuDef(u.ref).name;
  if (u.kind === 'crop') return cropDef(u.ref).name;
  if (u.kind === 'slot') return `${roleDef(u.ref).name} 자리`;
  return roleDef(u.ref).name;
}

export function HUD() {
  const s = useGame();
  const u = nextUnlock(s);
  const toast = getToast();
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 12px', color: '#fff', fontSize: 14, background: 'linear-gradient(#000a, #0000)', pointerEvents: 'none' }}>
      {/* 1행: 날짜·돈·연구·인기 (읽기 전용) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <span>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
        <span><Icon name="money" size={24} alt="돈" /> {s.money.toLocaleString()}</span>
        <span><Icon name="research" size={24} alt="연구" /> {s.research}</span>
        <span><Icon name="local" size={24} alt="동네 손님" /> <meter min={-100} max={100} value={s.popularity} style={{ width: 60, verticalAlign: 'middle' }} /> <Icon name="tourist" size={24} alt="관광객" /></span>
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
          <button onClick={toggleMute} aria-label={muted ? '소리 켜기' : '소리 끄기'} style={{ ...iconBtn, background: '#333' }}>
            <Icon name={muted ? 'sound_off' : 'sound_on'} size={32} />
          </button>
        </span>
      </div>
      {/* 토스트는 할망 안내와 같은 자리를 불투명하게 덮는다 (HUD 높이를 늘려 안내와 겹치지 않도록) */}
      {toast && <div style={{ position: 'absolute', top: GUIDE_TOP, left: 12, right: 12, background: '#c9184a', padding: '8px 10px', borderRadius: 8, fontSize: 16, fontWeight: 700 }}>{toast}</div>}
    </div>
  );
}

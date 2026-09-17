import { useGame, dispatch, getToast } from './store';
import { nextUnlock, canUnlock } from '../sim/index.ts';
import { objectDef, menuDef, cropDef } from '../data/index.ts';
import { GUIDE_TOP } from './Guide';

const SPEEDS = [0, 1, 2, 3] as const;

function unlockName(u: NonNullable<ReturnType<typeof nextUnlock>>) {
  return u.kind === 'object' ? objectDef(u.ref).name : u.kind === 'menu' ? menuDef(u.ref).name : cropDef(u.ref).name;
}

export function HUD() {
  const s = useGame();
  const u = nextUnlock(s);
  const toast = getToast();
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '8px 12px', color: '#fff', fontSize: 14, background: 'linear-gradient(#000a, #0000)', pointerEvents: 'none' }}>
      {/* 1행: 날짜·돈·연구·인기 (읽기 전용) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <span>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
        <span>💰 {s.money.toLocaleString()}</span>
        <span>🔬 {s.research}</span>
        <span>🧢 <meter min={-100} max={100} value={s.popularity} style={{ width: 60, verticalAlign: 'middle' }} /> 📷</span>
      </div>
      {/* 2행: 속도 버튼(44×44)과 해금 버튼 — 손가락으로 누르는 것만 모아 둔다 */}
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ pointerEvents: 'auto', display: 'flex', gap: 4 }}>
          {SPEEDS.map((sp) => (
            <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })}
              style={{ width: 44, height: 44, fontSize: 16, background: s.clock.speed === sp ? '#ffd166' : '#333', color: s.clock.speed === sp ? '#000' : '#fff', border: 0, borderRadius: 6 }}>
              {sp === 0 ? '⏸' : `×${sp}`}
            </button>
          ))}
        </span>
        {u ? (
          <button disabled={!canUnlock(s).ok} onClick={() => dispatch({ type: 'unlock' })}
            style={{ pointerEvents: 'auto', minHeight: 44, background: canUnlock(s).ok ? '#06d6a0' : '#444', color: '#fff', border: 0, borderRadius: 6, padding: '0 10px', whiteSpace: 'nowrap' }}>
            다음: {unlockName(u)} ({Math.min(s.research, u.cost)}/{u.cost})
          </button>
        ) : <span>다 열었어요!</span>}
      </div>
      {/* 토스트는 할망 안내와 같은 자리를 불투명하게 덮는다 (HUD 높이를 늘려 안내와 겹치지 않도록) */}
      {toast && <div style={{ position: 'absolute', top: GUIDE_TOP, left: 12, right: 12, background: '#c9184a', padding: '8px 10px', borderRadius: 8, fontSize: 16, fontWeight: 700 }}>{toast}</div>}
    </div>
  );
}

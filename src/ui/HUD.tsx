import { useGame, dispatch, getToast } from './store';
import { nextUnlock, canUnlock } from '../sim/index.ts';
import { objectDef, menuDef, cropDef } from '../data/index.ts';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{s.clock.year}년 {s.clock.month}월 {s.clock.day}일</span>
        <span>💰 {s.money.toLocaleString()}</span>
        <span>🔬 {s.research}</span>
        <span style={{ pointerEvents: 'auto' }}>
          {SPEEDS.map((sp) => (
            <button key={sp} onClick={() => dispatch({ type: 'setSpeed', speed: sp })}
              style={{ minWidth: 36, minHeight: 36, marginLeft: 4, background: s.clock.speed === sp ? '#ffd166' : '#333', color: s.clock.speed === sp ? '#000' : '#fff', border: 0, borderRadius: 6 }}>
              {sp === 0 ? '⏸' : `×${sp}`}
            </button>
          ))}
        </span>
      </div>
      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🧢 <meter min={-100} max={100} value={s.popularity} style={{ width: 80 }} /> 📷</span>
        {u ? (
          <button disabled={!canUnlock(s).ok} onClick={() => dispatch({ type: 'unlock' })}
            style={{ pointerEvents: 'auto', minHeight: 36, background: canUnlock(s).ok ? '#06d6a0' : '#444', color: '#fff', border: 0, borderRadius: 6, padding: '0 10px' }}>
            다음: {unlockName(u)} ({Math.min(s.research, u.cost)}/{u.cost})
          </button>
        ) : <span>다 열었어요!</span>}
      </div>
      {toast && <div style={{ marginTop: 6, background: '#ef476f', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>{toast}</div>}
    </div>
  );
}

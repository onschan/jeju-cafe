import { useRef, type CSSProperties } from 'react';
import { useGame, setUserSpeed, userSpeed, isSpeedLocked, setSpeedLocked, showMessage } from './store';
import { Icon } from './Icon';
import { PALETTE } from './frame';
import { FAST_SPEED } from '../sim/index.ts';

/** 4배속(빠른 모드)은 10년차 엔딩 뒤 「계속하기」로 열린다 (ending.ts) — 해금 전엔 버튼이 없다 */
export const SPEEDS = [0, 1, 2, 3, 4] as const;
const SPEED_ICON: Record<(typeof SPEEDS)[number], string> = { 0: 'speed_pause', 1: 'speed_1', 2: 'speed_2', 3: 'speed_3', 4: 'speed_3' };
const SPEED_LABEL: Record<(typeof SPEEDS)[number], string> = { 0: '일시정지', 1: '1배속', 2: '2배속', 3: '3배속', 4: '4배속' };
/** 길게 누르면 속도 잠금 토글 (§5.6) */
export const LOCK_PRESS_MS = 600;

const btn: CSSProperties = { width: 30, height: 44, padding: 0, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: PALETTE.btn, position: 'relative', touchAction: 'manipulation' };

/** 하단 바 오른쪽 속도 버튼 ⏸ ▶ ▶▶ ▶▶▶. 창으로 멈춘 동안에는 사용자가 고른 속도만 바꾼다(닫히면 그 속도로 돌아간다).
 *  600ms 길게 누르면 잠금: 창을 열어도 멈추지 않는다(대화창·배치는 멈춤). */
export function SpeedBar() {
  const s = useGame();
  const cur = userSpeed();
  const speeds = SPEEDS.filter((sp) => sp < FAST_SPEED || s.ending?.fastMode); // z-ending 빠른 모드
  const locked = isSpeedLocked();
  const timer = useRef(0);
  const longFired = useRef(false);
  const down = () => {
    longFired.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      longFired.current = true;
      const on = !isSpeedLocked();
      setSpeedLocked(on);
      showMessage(on ? '속도 잠금 — 창을 열어도 안 멈춰요' : '속도 잠금 해제');
    }, LOCK_PRESS_MS);
  };
  const up = () => window.clearTimeout(timer.current);
  return (
    <span data-testid="speed-bar" data-locked={locked ? '1' : '0'} style={{ display: 'flex', gap: 2, flex: 'none' }}>
      {speeds.map((sp) => (
        <button key={sp} onClick={() => { if (longFired.current) { longFired.current = false; return; } setUserSpeed(sp); }} aria-label={SPEED_LABEL[sp]} aria-pressed={cur === sp}
          onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
          style={{ ...btn, background: cur === sp ? PALETTE.btnOn : PALETTE.btn }}>
          <Icon name={SPEED_ICON[sp]} size={24} />
          {sp === FAST_SPEED && <span aria-hidden style={{ position: 'absolute', right: 1, bottom: 1, fontSize: 11, lineHeight: 1, fontWeight: 700, color: cur === sp ? PALETTE.btnOnText : PALETTE.btnText }}>4</span>}
          {locked && sp === cur && <span aria-label="속도 잠금" style={{ position: 'absolute', top: -7, right: -5, fontSize: 12, lineHeight: 1, display: 'flex' }}><Icon name="lock" size={12} /></span>}
        </button>
      ))}
    </span>
  );
}

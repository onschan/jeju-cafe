import type { CSSProperties } from 'react';
import { useGame, setUserSpeed, userSpeed } from './store';
import { Icon } from './Icon';
import { PALETTE } from './frame';

const SPEEDS = [0, 1, 2, 3] as const;
const SPEED_ICON: Record<(typeof SPEEDS)[number], string> = { 0: 'speed_pause', 1: 'speed_1', 2: 'speed_2', 3: 'speed_3' };
const SPEED_LABEL: Record<(typeof SPEEDS)[number], string> = { 0: '일시정지', 1: '1배속', 2: '2배속', 3: '3배속' };

const btn: CSSProperties = { width: 30, height: 44, padding: 0, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: PALETTE.btn };

/** 하단 바 오른쪽 속도 버튼 ⏸ ▶ ▶▶ ▶▶▶. 창으로 멈춘 동안에는 사용자가 고른 속도만 바꾼다(닫히면 그 속도로 돌아간다). */
export function SpeedBar() {
  useGame();
  const cur = userSpeed();
  return (
    <span data-testid="speed-bar" style={{ display: 'flex', gap: 2, flex: 'none' }}>
      {SPEEDS.map((sp) => (
        <button key={sp} onClick={() => setUserSpeed(sp)} aria-label={SPEED_LABEL[sp]} aria-pressed={cur === sp}
          style={{ ...btn, background: cur === sp ? PALETTE.btnOn : PALETTE.btn }}>
          <Icon name={SPEED_ICON[sp]} size={24} />
        </button>
      ))}
    </span>
  );
}

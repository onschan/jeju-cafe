/** 대항전 진행 중 상단 비교 바 (스펙 §4). 우리 점수와 상대 점수를 한 줄로 견준다.
 *  러시 화면 위쪽에 얹는 한 줄 훅 — TODO(rush2): Rush HUD에서 <BattleBar /> 한 줄만 그리면 된다.
 *  판이 없으면 아무것도 그리지 않는다. 계산은 sim/battle.ts battleHud가 한다. */
import { useGame } from './store';
import { battleHud } from '../sim/index.ts';
import { PALETTE } from './frame';

export function BattleBar() {
  const s = useGame();
  const hud = battleHud(s);
  if (!hud) return null;
  const total = Math.max(1, hud.myScore + hud.theirScore);
  const mine = Math.round((hud.myScore / total) * 100);
  return (
    <div data-testid="battle-bar" style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
      background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, fontSize: 14,
    }}>
      <b style={{ minWidth: 44, color: hud.leading ? PALETTE.ok : PALETTE.ink }}>{hud.myScore}</b>
      <div style={{ flex: 1, height: 12, borderRadius: 6, overflow: 'hidden', background: PALETTE.bad, border: `1px solid ${PALETTE.wood}` }}>
        <div style={{ width: `${mine}%`, height: '100%', background: PALETTE.ok }} />
      </div>
      <b style={{ minWidth: 44, textAlign: 'right' }}>{hud.theirScore}</b>
      <span style={{ fontSize: 13, color: PALETTE.inkSoft, whiteSpace: 'nowrap', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis' }}>{hud.rivalName}</span>
    </div>
  );
}

import { useGame } from './store';
import { currentGoal } from './simBridge';
import { PALETTE } from './frame';

export const GOAL_BAR_H = 24;

/** 상단 바 아래 목표 줄 24px: ▶ 목표: {제목} {cur}/{max} + 얇은 진행 바. 탭하면 목표 창. 다 채우면 반짝인다. */
export function GoalBar({ top, onOpen }: { top: number; onOpen: () => void }) {
  const s = useGame();
  const g = currentGoal(s);
  const done = g ? g.cur >= g.max : false;
  const pct = g && g.max > 0 ? Math.min(100, Math.round((g.cur / g.max) * 100)) : 0;
  return (
    <button data-testid="goal-bar" onClick={onOpen} aria-label="목표"
      style={{ position: 'absolute', top, left: 0, right: 0, height: GOAL_BAR_H, padding: '0 10px', border: 0, borderBottom: `2px solid ${PALETTE.wood}`, background: done ? PALETTE.btnOn : PALETTE.paperDark, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', zIndex: 10, animation: done ? 'goal-blink 1s ease-in-out infinite' : undefined }}>
      <style>{'@keyframes goal-blink { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }'}</style>
      <span style={{ color: PALETTE.title }}>▶</span>
      {g ? (
        <>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>목표: {g.title}</span>
          <span style={{ flex: 'none', color: done ? PALETTE.ink : PALETTE.inkSoft }}>{g.cur}/{g.max}</span>
          <span aria-hidden style={{ flex: 'none', width: 48, height: 6, background: '#fff8', border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: done ? PALETTE.ok : PALETTE.bar }} />
          </span>
        </>
      ) : <span style={{ flex: 1, color: PALETTE.inkSoft }}>목표: 모두 달성!</span>}
    </button>
  );
}

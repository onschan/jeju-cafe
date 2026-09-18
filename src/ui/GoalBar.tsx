import { useGame } from './store';
import { currentGoal, urgentChallenge } from './simBridge';
import { PALETTE } from './frame';

/** 목표 줄 24px + 도전 줄 20px (§7.3: 셸 높이 +20px) */
export const GOAL_LINE_H = 24;
export const CHALLENGE_LINE_H = 20;
export const GOAL_BAR_H = GOAL_LINE_H + CHALLENGE_LINE_H;

/** 상단 바 아래 목표 줄: ▶ 목표: {제목} {cur}/{max} + 얇은 진행 바. 아래 도전 줄: 가장 급한 도전(또는 이달의 과제) 진행·남은 날.
 *  탭하면 목표 창. 다 채우면 반짝인다. data-tut="goal-bar"(튜토리얼 8단계 글로우). */
export function GoalBar({ top, onOpen }: { top: number; onOpen: () => void }) {
  const s = useGame();
  const g = currentGoal(s);
  const c = urgentChallenge(s);
  const done = g ? g.cur >= g.max : false;
  const pct = g && g.max > 0 ? Math.min(100, Math.round((g.cur / g.max) * 100)) : 0;
  const cpct = c && c.max > 0 ? Math.min(100, Math.round((c.cur / c.max) * 100)) : 0;
  return (
    <button data-testid="goal-bar" data-tut="goal-bar" onClick={onOpen} aria-label="목표"
      style={{ position: 'absolute', top, left: 0, right: 0, height: GOAL_BAR_H, padding: 0, border: 0, borderBottom: `2px solid ${PALETTE.wood}`, background: done ? PALETTE.btnOn : PALETTE.paperDark, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left', display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap', overflow: 'hidden', zIndex: 10, animation: done ? 'goal-blink 1s ease-in-out infinite' : undefined }}>
      <style>{'@keyframes goal-blink { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }'}</style>
      <span style={{ height: GOAL_LINE_H, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, width: '100%', boxSizing: 'border-box' }}>
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
      </span>
      <span data-testid="challenge-line" style={{ height: CHALLENGE_LINE_H, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, width: '100%', boxSizing: 'border-box', fontSize: 13, fontWeight: 700, background: '#0000000c' }}>
        <span style={{ color: PALETTE.title }}>{c?.kind === 'monthly' ? '📅' : '🎯'}</span>
        {c ? (
          <>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.kind === 'monthly' ? '이달' : '도전'}: {c.title}</span>
            <span style={{ flex: 'none', color: PALETTE.inkSoft }}>{c.cur}/{c.max} · {c.daysLeft}일</span>
            <span aria-hidden style={{ flex: 'none', width: 36, height: 5, background: '#fff8', border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${cpct}%`, height: '100%', background: PALETTE.bar }} />
            </span>
          </>
        ) : <span style={{ flex: 1, color: PALETTE.inkSoft }}>도전: 목표 창에서 골라 받아요</span>}
      </span>
    </button>
  );
}

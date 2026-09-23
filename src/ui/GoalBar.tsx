import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from './store';
import { Icon } from './Icon';
import { fmtNum } from '../sim/format.ts';
import { TUTORIAL_STEPS, tutorialDone, mainBuilding, nextMove, solverNextMove, solverKey } from '../sim/index.ts';
import { setGuideFocus } from './tutorialHighlight';
import { currentGoal, urgentChallenge } from './simBridge';
import { PALETTE } from './frame';
import { TutorialWindow } from './TutorialWindow';

/** 목표 줄 24px + 도전 줄 20px (§7.3) + 「오늘 할 일」 줄 22px (성장 체감) */
export const GOAL_LINE_H = 24;
export const CHALLENGE_LINE_H = 20;
export const TODO_LINE_H = 22;
export const GOAL_BAR_H = GOAL_LINE_H + CHALLENGE_LINE_H + TODO_LINE_H;
/** 튜토리얼 배지 너비 (목표 줄 왼쪽 한 칸) */
export const TUT_BADGE_W = 60;

/** 목표 줄 왼쪽 「📖 n/7」 배지 (fun-start): 탭하면 튜토리얼 창(현재 단계 대사 다시 보기·7단계 목록·건너뛰기).
 *  튜토리얼이 끝나면 「📖 추천」 — 추천 탭(「할망의 추천」)은 다 배운 뒤에도 남는 코치라 배지도 남긴다.
 *  창은 #root에 포털로 띄운다 (목표 줄이 absolute라 그 안에 두면 갇힌다). */
function TutorialBadge() {
  const s = useGame();
  const [open, setOpen] = useState(false);
  const done = tutorialDone(s);
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
  return (
    <>
      <button data-testid="tutorial-badge" aria-label={done ? '할망의 추천' : `할망의 가르침 ${s.tutorial.step}/${TUTORIAL_STEPS}`} onClick={() => setOpen(true)}
        style={{ position: 'absolute', left: 0, top: 0, width: TUT_BADGE_W, height: GOAL_LINE_H, padding: 0, border: 0, borderRight: `2px solid ${PALETTE.wood}`, background: PALETTE.btnOn, color: PALETTE.btnOnText, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, zIndex: 11, whiteSpace: 'nowrap' }}>
        📖 {done ? '할 일' : `${s.tutorial.step}/${TUTORIAL_STEPS}`}
      </button>
      {open && root && createPortal(<TutorialWindow onClose={() => setOpen(false)} />, root)}
    </>
  );
}

/** 「오늘 할 일」 줄 (성장 체감): 지금 가장 이득인 행동 한 줄을 늘 보이게 둔다 — solver 1위 수(예상 이득 숫자 포함),
 *  solver 답이 아직 없으면 휴리스틱 다음 수. 탭하면 그 행동의 타깃·칸이 글로우(setGuideFocus) 한다. */
export const TODO_EMPTY_TEXT = '할 건 다 했다. 마음껏 꾸며 보라';
export function TodoLine() {
  const s = useGame();
  // solver가 다시 셈하는 동안(상태 키가 바뀔 때마다) 직전 답을 그대로 둔다 —
  // 그때만 쓰는 휴리스틱은 1년차 순서라 다 자란 카페에서 엉뚱한 줄("올렛길부터")을 내놓는다.
  const kept = useRef<ReturnType<typeof nextMove>>(null);
  const solved = solverNextMove(s);
  if (solved) kept.current = solved;
  const move = solved ?? kept.current ?? nextMove(s);
  const text = move ? move.text : TODO_EMPTY_TEXT;
  const focus = () => {
    if (!move) return;
    setGuideFocus({ key: solverKey(s), targets: move.move?.targets ?? [], cells: move.cells, label: move.text });
  };
  return (
    <button data-testid="todo-line" onClick={focus} aria-label={`오늘 할 일: ${text}`} disabled={!move}
      style={{ position: 'absolute', left: 0, right: 0, top: GOAL_LINE_H + CHALLENGE_LINE_H, height: TODO_LINE_H, padding: '0 8px', border: 0, borderBottom: `2px solid ${PALETTE.wood}`, background: PALETTE.paper, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5, width: '100%', boxSizing: 'border-box', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <span style={{ flex: 'none', color: PALETTE.title }}>할 일</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 400 }}>{text}</span>
    </button>
  );
}

/** 상단 바 아래 목표 줄: [📖 n/7] ▶ 목표: {제목} {cur}/{max} + 얇은 진행 바. 아래 도전 줄: 가장 급한 도전(또는 이달의 과제) 진행·남은 날.
 *  탭하면 목표 창. 다 채우면 반짝인다. data-tut="goal-bar"(튜토리얼 8단계 글로우). */
export function GoalBar({ top, onOpen }: { top: number; onOpen: () => void }) {
  const s = useGame();
  const g = currentGoal(s);
  const c = urgentChallenge(s);
  const done = g ? g.cur >= g.max : false;
  // 돈 목표(자금 1,200만)는 「3,495,720/12,000,000」이 제목을 밀어내 375px에서 「자금 1,…」로 잘린다 → 10만 이상이면 만 단위로 줄인다
  const num = (n: number, max: number) => (max >= 100_000 ? `${fmtNum(Math.round(n / 10_000))}만` : fmtNum(n));
  const pct = g && g.max > 0 ? Math.min(100, Math.round((g.cur / g.max) * 100)) : 0;
  const cpct = c && c.max > 0 ? Math.min(100, Math.round((c.cur / c.max) * 100)) : 0;
  const milestone = g ? (s.goals.milestones?.[g.id] ?? 0) : 0; // game-feel P1: 자금 목표 25/50/75% 마일스톤 — 단계가 바뀌면 key가 바뀌어 반짝임이 다시 돈다
  const badge = true; // 배지는 튜토리얼 뒤에도 남는다 (추천 탭)
  const noMain = !tutorialDone(s) && !mainBuilding(s); // 옛 맨땅 저장: 본관을 짓기 전엔 첫 목표(아메리카노)를 이룰 수 없다 → 문구로 안내
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, height: GOAL_BAR_H, zIndex: 10 }}>
      <TutorialBadge />
      <button data-testid="goal-bar" data-tut="goal-bar" onClick={onOpen} aria-label="목표"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: GOAL_LINE_H + CHALLENGE_LINE_H, padding: 0, border: 0, background: done ? PALETTE.btnOn : PALETTE.paperDark, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left', display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap', overflow: 'hidden', animation: done ? 'goal-blink 1s ease-in-out infinite' : undefined }}>
        <style>{'@keyframes goal-blink { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } } @keyframes goal-flash { 0%, 100% { box-shadow: 0 0 0 0 #ffd54a00; } 50% { box-shadow: 0 0 6px 3px #ffd54a; } }'}</style>
        <span style={{ height: GOAL_LINE_H, padding: '0 10px', paddingLeft: badge ? TUT_BADGE_W + 8 : 10, display: 'flex', alignItems: 'center', gap: 6, width: '100%', boxSizing: 'border-box' }}>
          <span style={{ color: PALETTE.title }}>▶</span>
          {g && noMain ? (
            <span data-testid="goal-no-main" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>목표: <span style={{ color: PALETTE.title }}>먼저 본관을 지어요</span> · {g.title}</span>
          ) : g ? (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>목표: {g.title}</span>
              <span style={{ flex: 'none', color: done ? PALETTE.ink : PALETTE.inkSoft }}>{num(g.cur, g.max)}/{num(g.max, g.max)}</span>
              <span key={`${g.id}:${milestone}`} data-testid="goal-progress" data-milestone={milestone} aria-hidden style={{ flex: 'none', width: 48, height: 6, background: '#fff8', border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden', animation: milestone > 0 ? 'goal-flash 0.9s ease-out 2' : undefined }}>
                <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: done ? PALETTE.ok : PALETTE.bar }} />
              </span>
            </>
          ) : <span style={{ flex: 1, color: PALETTE.inkSoft }}>목표: 모두 달성!</span>}
        </span>
        <span data-testid="challenge-line" style={{ height: CHALLENGE_LINE_H, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6, width: '100%', boxSizing: 'border-box', fontSize: 13, fontWeight: 700, background: '#0000000c' }}>
          <span style={{ color: PALETTE.title, display: 'flex' }}><Icon name={c?.kind === 'monthly' ? 'calendar' : 'target'} size={14} /></span>
          {c ? (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.kind === 'monthly' ? '이달' : '도전'}: {c.title}</span>
              <span style={{ flex: 'none', color: PALETTE.inkSoft }}>{num(c.cur, c.max)}/{num(c.max, c.max)} · {c.daysLeft}일</span>
              <span aria-hidden style={{ flex: 'none', width: 36, height: 5, background: '#fff8', border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${cpct}%`, height: '100%', background: PALETTE.bar }} />
              </span>
            </>
          ) : <span style={{ flex: 1, color: PALETTE.inkSoft }}>도전: 목표 창에서 골라 받아요</span>}
        </span>
      </button>
      <TodoLine />
    </div>
  );
}

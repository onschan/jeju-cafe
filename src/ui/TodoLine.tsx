/**
 * 「오늘 할 일」 (video-patch §3.4): 화면 맨 위 고정 1줄에 **지금 가장 이득인 행동 하나**.
 * 탭하면 3줄 시트 — solver 1위 / 가장 가까운 목표 / 경고(없으면 solver 2위). 3줄을 넘기지 않는다.
 * 우선순위 ①파산·평판 경고 → ②solver 1위 → ③목표 → ④solver 2위. 아무것도 없으면 줄 전체가 사라진다.
 *
 * 로직은 새로 만들지 않는다 — `hints.ts idleHint`가 쓰는 `cachedMoves`·`nextMove`를 상시 노출로 바꾼 것뿐이다.
 * 항목을 탭하면 그 수의 타깃(`SolverMove.targets`·`cells`)을 글로우한다 (tutorialHighlight.setGuideFocus).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState, Pt } from '../sim/index.ts';
import { cachedMoves, solverKey, heuristicNextMove, REP_LOW, WARN_DEFICIT_MONTHS, LOAN_THRESHOLD, activeSteal, stealTitle, rivalsState, scoreboard, rankGap, RIVAL_COUNTER_COST } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { currentGoal, urgentChallenge } from './simBridge';
import { setGuideFocus } from './tutorialHighlight';
import { Icon } from './Icon';
import { PALETTE, brownBtn } from './frame';

/** 오늘 할 일 줄 높이 */
export const TODO_LINE_H = 24;
/** 시트에 보여 주는 줄 수 상한 */
export const TODO_MAX = 3;

export type TodoKind = 'warn' | 'move' | 'goal' | 'rival';
export interface TodoItem {
  key: string;
  kind: TodoKind;
  /** 한 줄 (≤ 22자를 노려 쓴다) */
  text: string;
  /** 오른쪽 예상 이득 (없으면 빈 문자열) */
  gain: string;
  /** 탭하면 빛낼 UI 타깃·맵 칸 */
  targets: string[];
  cells: Pt[];
  /** 목표 줄은 할 일 창을, 경쟁 줄은 장부 › 평가를 연다 */
  opens?: 'goal' | 'rival';
}

/** 지금 급한 경고 (없으면 null) — 잃을 것이 먼저다 */
function warnOf(s: GameState): TodoItem | null {
  if (s.reputation < REP_LOW) return { key: 'warn:rep', kind: 'warn', text: `평판 ${Math.round(s.reputation)} — 이대로면 손님이 준다`, gain: '', targets: ['nav:ledger'], cells: [] };
  if ((s.deficitMonths ?? 0) >= WARN_DEFICIT_MONTHS) return { key: 'warn:deficit', kind: 'warn', text: `적자 ${s.deficitMonths}달째 — 나가는 돈을 줄여야 한다`, gain: '', targets: ['nav:ledger'], cells: [] };
  if (s.money < LOAN_THRESHOLD) return { key: 'warn:money', kind: 'warn', text: `잔고 ${wonText(s.money)} — 새로 짓기 전에 벌어야 한다`, gain: '', targets: [], cells: [] };
  return null;
}

/** 만 단위 예상 이득 (`+42만`). 1만에 못 미치면 빈 문자열 */
export function gainText(money: number): string {
  const wan = Math.round(money / 10_000);
  return wan >= 1 ? `+${wan}만` : '';
}

/** 가장 가까운 목표·이달의 과제 한 줄 */
function goalOf(s: GameState): TodoItem | null {
  const m = urgentChallenge(s);
  const g = currentGoal(s);
  const pick = m && g ? ((m.cur / Math.max(1, m.max)) >= (g.cur / Math.max(1, g.max)) ? m : g) : (m ?? g);
  if (!pick) return null;
  const left = Math.max(0, pick.max - pick.cur);
  const note = pick.note ? ` (${pick.note})` : ''; // 공사 중인 것은 「짓는 중 1」로 알려 같은 줄이 되풀이돼 보이지 않게
  return { key: `goal:${pick.id}`, kind: 'goal', text: `「${pick.title}」 ${left} 남았다${note}`, gain: '', targets: ['goal-bar'], cells: [], opens: 'goal' };
}

/** 동네 경쟁 한 줄 — 답을 기다리는 뺏기 이벤트가 먼저, 없으면 「몇 위 → 몇 위로」 */
function rivalOf(s: GameState): TodoItem | null {
  const steal = activeSteal(s);
  if (steal && steal.answer === 'none') {
    return { key: `rival:steal:${steal.monthIndex}`, kind: 'rival', text: `${stealTitle(s)} — 맞불 ${Math.round(RIVAL_COUNTER_COST / 10_000)}만`, gain: '', targets: ['nav:ledger'], cells: [], opens: 'rival' };
  }
  const st = rivalsState(s);
  if (st.myRank === null || st.myRank === 1) return null;
  const board = scoreboard(s);
  const { above, gap } = rankGap(board);
  if (!above) return null;
  return { key: `rival:rank:${st.myRank}`, kind: 'rival', text: `동네 ${st.myRank}위 — ${above.name}와 ${gap}점 차`, gain: '', targets: ['nav:ledger'], cells: [], opens: 'rival' };
}

/** 오늘 할 일 (최대 3줄, 우선순위 순). 할 게 없으면 빈 배열. */
export function todoItems(s: GameState): TodoItem[] {
  const out: TodoItem[] = [];
  const warn = warnOf(s);
  if (warn) out.push(warn);
  const moves = cachedMoves(s, (m) => m.score > 0).slice(0, 2);
  const asMove = (m: (typeof moves)[number], i: number): TodoItem => ({
    key: `move:${i}:${m.label}`, kind: 'move', text: m.label, gain: gainText(m.delta.money), targets: m.targets, cells: m.cells,
  });
  if (moves.length > 0) out.push(asMove(moves[0]!, 0));
  else {
    const h = heuristicNextMove(s);
    if (h) out.push({ key: 'move:h', kind: 'move', text: h.text, gain: '', targets: [], cells: h.cells });
  }
  const goal = goalOf(s);
  if (goal) out.push(goal);
  const rival = rivalOf(s); // 경쟁은 목표 다음 — 답을 기다리는 뺏기 이벤트면 목표보다 급하다
  if (rival) out.splice(rival.key.startsWith('rival:steal') ? 1 : out.length, 0, rival);
  if (moves.length > 1) out.push(asMove(moves[1]!, 1));
  return out.slice(0, TODO_MAX);
}

const KIND_ICON: Record<TodoKind, string> = { warn: 'warn', move: 'bulb', goal: 'target', rival: 'rival' };

/** 맨 위 1줄 + 탭하면 3줄 시트. 할 일이 없으면 아무것도 그리지 않는다 (빈 UI를 남기지 않는다). */
export function TodoLine({ top, onOpenGoal }: { top: number; onOpenGoal: () => void }) {
  const s = useGame();
  const [open, setOpen] = useState(false);
  const items = todoItems(s);
  const head = items[0];
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
  if (!head) return null;
  const rest = items.length - 1;
  const doItem = (it: TodoItem) => {
    setOpen(false);
    if (it.opens === 'goal') { onOpenGoal(); return; }
    setGuideFocus({ key: solverKey(s), targets: it.targets, cells: it.cells, label: it.text });
  };
  return (
    <>
      <button data-testid="todo-line" onClick={() => setOpen((v) => !v)} aria-label={`오늘 할 일: ${head.text}`} aria-expanded={open}
        style={{ position: 'absolute', top, left: 0, right: 0, height: TODO_LINE_H, zIndex: 10, padding: '0 8px', border: 0, borderBottom: `2px solid ${PALETTE.wood}`, background: head.kind === 'warn' ? '#f7d9d9' : PALETTE.paper, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box' }}>
        <span style={{ flex: 'none', color: PALETTE.title, display: 'flex' }}><Icon name={KIND_ICON[head.kind]} size={14} /></span>
        <span style={{ flex: 'none', color: PALETTE.inkSoft }}>오늘 할 일</span>
        <span data-testid="todo-head" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{head.text}</span>
        {head.gain && <span data-testid="todo-gain" style={{ flex: 'none', color: PALETTE.ok }}>{head.gain}</span>}
        {rest > 0 && <span data-testid="todo-rest" style={{ flex: 'none', minWidth: 20, textAlign: 'center', background: PALETTE.paperDark, border: `1px solid ${PALETTE.woodLight}`, borderRadius: 9, fontSize: 12, padding: '0 5px' }}>{rest}</span>}
      </button>
      {open && root && createPortal(
        <div data-testid="todo-sheet" role="dialog" aria-label="오늘 할 일" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 46, background: '#0006', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: top + TODO_LINE_H + 6 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(94vw, 420px)', background: PALETTE.paper, border: `4px solid ${PALETTE.wood}`, borderRadius: 8, padding: 8, boxSizing: 'border-box' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}><Icon name="bulb" size={16} /> 오늘 할 일</div>
            {items.map((it) => (
              <div key={it.key} data-testid="todo-item" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderTop: `1px solid ${PALETTE.woodLight}` }}>
                <span style={{ flex: 'none', color: it.kind === 'warn' ? PALETTE.bad : PALETTE.title, display: 'flex' }}><Icon name={KIND_ICON[it.kind]} size={14} /></span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.text}</span>
                {it.gain && <span style={{ flex: 'none', fontSize: 13, color: PALETTE.ok }}>{it.gain}</span>}
                <button style={{ ...brownBtn, flex: 'none', margin: 0, minWidth: 56, height: 44, padding: '0 10px', fontSize: 14 }} onClick={() => doItem(it)}>{it.opens === 'goal' ? '보기' : '하기'}</button>
              </div>
            ))}
            <button style={{ ...brownBtn, width: '100%', margin: '6px 0 0', height: 44, fontSize: 14 }} onClick={() => setOpen(false)}>닫기</button>
          </div>
        </div>, root)}
    </>
  );
}

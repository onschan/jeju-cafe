/**
 * 「오늘 할 일」 (video-patch §3.4 · uifix): 화면 **두 번째 줄**에 **지금 가장 이득인 행동 하나**.
 * 왼쪽 📖는 할망의 가르침, 오른쪽 「할 일 n」 칩은 목표·이달의 과제·경쟁을 다 모은 「할 일」 창을 연다.
 * 줄 맨 아래 가는 띠는 지금 목표의 진행도 — 줄을 하나 더 쓰지 않고도 목표가 어디쯤인지 보인다.
 * 우선순위 ①파산·평판 경고 → ②solver 1위 → ③목표 → ④solver 2위. 줄 자체는 늘 있다(맵 높이가 흔들리지 않게).
 *
 * 로직은 새로 만들지 않는다 — `hints.ts idleHint`가 쓰는 `cachedMoves`·`nextMove`를 상시 노출로 바꾼 것뿐이다.
 * 항목을 탭하면 그 수의 타깃(`SolverMove.targets`·`cells`)을 글로우한다 (tutorialHighlight.setGuideFocus).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState, Pt } from '../sim/index.ts';
import { cachedMoves, solverKey, heuristicNextMove, REP_LOW, WARN_DEFICIT_MONTHS, LOAN_THRESHOLD, activeSteal, stealTitle, rivalsState, scoreboard, rankGap, RIVAL_COUNTER_COST, shrinkingWarning, mainBuilding, tutorialDone, actsDone, TUTORIAL_ACTS, todoRows } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { currentGoal, urgentChallenge } from './simBridge';
import { setGuideFocus } from './tutorialHighlight';
import { Icon } from './Icon';
import { PALETTE } from './frame';
import { TutorialWindow } from './TutorialWindow';

/** 오늘 할 일 줄 높이 (상단 2줄 중 아래 한 줄) */
export const TODO_LINE_H = 28;
/** 시트에 보여 주는 줄 수 상한 */
export const TODO_MAX = 3;
/** 📖 배지 너비 (아이콘만 — 375px에서 글자를 넣으면 할 일 문구가 잘린다) */
export const TUT_BADGE_W = 30;

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
  if (!tutorialDone(s) && !mainBuilding(s)) return { key: 'warn:main', kind: 'warn', text: '먼저 본관을 지어요', gain: '', targets: ['nav:build'], cells: [] };
  if (s.reputation < REP_LOW) return { key: 'warn:rep', kind: 'warn', text: `평판 ${Math.round(s.reputation)} — 이대로면 손님이 준다`, gain: '', targets: ['nav:ledger'], cells: [] };
  if ((s.deficitMonths ?? 0) >= WARN_DEFICIT_MONTHS) return { key: 'warn:deficit', kind: 'warn', text: `적자 ${s.deficitMonths}달째 — 나가는 돈을 줄여야 한다`, gain: '', targets: ['nav:ledger'], cells: [] };
  if (s.money < LOAN_THRESHOLD) return { key: 'warn:money', kind: 'warn', text: `잔고 ${wonText(s.money)} — 새로 짓기 전에 벌어야 한다`, gain: '', targets: [], cells: [] };
  const shrink = shrinkingWarning(s); // stakes: 평판 탓에 손님이 줄고 있으면 경고를 맨 앞으로
  if (shrink) return { key: 'warn:shrink', kind: 'warn', text: shrink, gain: '', targets: ['nav:ledger'], cells: [] };
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
  return { key: `goal:${pick.id}`, kind: 'goal', text: `「${pick.title}」 ${left} 남았다${note}`, gain: '', targets: ['todo-all'], cells: [], opens: 'goal' };
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

/** 📖 배지 (fun-start): 탭하면 튜토리얼 창(현재 단계 대사 다시 보기·5막 진행도·막 건너뛰기).
 *  튜토리얼이 끝나도 남는다 — 할망의 추천은 다 배운 뒤에도 쓰는 코치다.
 *  창은 #root에 포털로 띄운다 (이 줄이 absolute라 그 안에 두면 갇힌다). */
function TutorialBadge() {
  const s = useGame();
  const [open, setOpen] = useState(false);
  const done = tutorialDone(s);
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
  return (
    <>
      <button data-testid="tutorial-badge" aria-label={done ? '할망의 추천' : `할망의 가르침 ${actsDone(s) + 1}막`} title={done ? '할망의 추천' : `할망의 가르침 ${Math.min(actsDone(s) + 1, TUTORIAL_ACTS.length)}/${TUTORIAL_ACTS.length}막`}
        onClick={() => setOpen(true)}
        style={{ flex: 'none', width: TUT_BADGE_W, height: '100%', padding: 0, border: 0, borderRight: `2px solid ${PALETTE.wood}`, background: PALETTE.btnOn, color: PALETTE.btnOnText, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>
        📖
      </button>
      {open && root && createPortal(<TutorialWindow onClose={() => setOpen(false)} />, root)}
    </>
  );
}

/** 상단 2줄 중 아래 한 줄: **지금 할 것 하나**만. 전체 목록은 「할 일」 창이 맡는다 (역할이 겹치지 않게 — 통합 §3).
 *  줄을 누르면 그 하나를 바로 한다(타깃 글로우·창 열기), 오른쪽 「할 일 n」을 누르면 전체 목록이 열린다.
 *  맨 아래 가는 띠는 지금 목표의 진행도(옛 목표 줄을 줄 하나 안 쓰고 대신한다). */
export function TodoLine({ top, onOpenGoal }: { top: number; onOpenGoal: () => void }) {
  const s = useGame();
  const items = todoItems(s);
  const head = items[0];
  const rows = todoRows(s).length; // 「할 일」 창에 모인 줄 수 — 목표·등급·이달·경쟁을 한 숫자로
  const g = currentGoal(s);
  const pct = g && g.max > 0 ? Math.min(100, Math.round((g.cur / g.max) * 100)) : 0;
  const doItem = (it: TodoItem) => {
    if (it.opens === 'goal') { onOpenGoal(); return; }
    setGuideFocus({ key: solverKey(s), targets: it.targets, cells: it.cells, label: it.text });
  };
  return (
    <div style={{ position: 'absolute', top, left: 0, right: 0, height: TODO_LINE_H, zIndex: 10, display: 'flex', alignItems: 'stretch', borderBottom: `2px solid ${PALETTE.wood}`, background: head?.kind === 'warn' ? '#f7d9d9' : PALETTE.paper, boxSizing: 'border-box' }}>
      <TutorialBadge />
      <button data-testid="todo-line" onClick={() => head && doItem(head)} aria-label={head ? `오늘 할 일: ${head.text}` : '오늘 할 일'}
        style={{ flex: 1, minWidth: 0, padding: '0 6px', border: 0, background: 'none', color: PALETTE.ink, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ flex: 'none', color: PALETTE.title, display: 'flex' }}><Icon name={KIND_ICON[head?.kind ?? 'move']} size={14} /></span>
        <span data-testid="todo-head" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', color: head ? PALETTE.ink : PALETTE.inkSoft }}>{head ? head.text : '오늘은 느긋하게 둘러봐요'}</span>
        {head?.gain && <span data-testid="todo-gain" style={{ flex: 'none', color: PALETTE.ok }}>{head.gain}</span>}
      </button>
      <button data-testid="todo-all" data-tut="todo-all" onClick={onOpenGoal} aria-label={`할 일 ${rows}가지 보기`}
        style={{ flex: 'none', padding: '0 7px', border: 0, borderLeft: `2px solid ${PALETTE.woodLight}`, background: PALETTE.paperDark, color: PALETTE.title, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
        할 일{rows > 0 && <span data-testid="todo-rest" style={{ minWidth: 17, textAlign: 'center', background: PALETTE.paper, border: `1px solid ${PALETTE.woodLight}`, borderRadius: 9, fontSize: 12, padding: '0 3px' }}>{rows}</span>}
      </button>
      {/* 목표 진행 띠: 줄 하나를 더 쓰지 않고 목표가 어디쯤인지 보여 준다 */}
      <span data-testid="goal-progress" data-pct={pct} aria-hidden style={{ position: 'absolute', left: 0, bottom: -2, height: 2, width: `${pct}%`, background: pct >= 100 ? PALETTE.ok : PALETTE.bar, transition: 'width 0.3s ease-out' }} />
    </div>
  );
}

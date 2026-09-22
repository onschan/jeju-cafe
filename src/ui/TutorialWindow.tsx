/** 튜토리얼 창 「할망의 가르침」: 「진행」 탭 = 5장 목록(완료 ✓ · 지금 ▶ · 아직 ○, 장마다 n/m)과 지금 장의 단계 목록, 현재 단계 대사 다시 보기, 이 장 건너뛰기(보상 없음).
 *  「추천」 탭(solver) = 「시뮬 추천 (14일 굴려 본 결과)」 = solver(sim/solver.ts bestMoves, 워커) 상위 3수 + 각 예상 이득("14일 굴려 보니 자금 +₩42만") — 탭하면 그 행동의 타깃(칸·창 버튼)이 글로우(tutorialHighlight setGuideFocus).
 *  결과가 아직 없으면 정석 표의 다음 수(strategy.heuristicNextMove) + 「계산 중…」. 그 아래 1년차 월별 정석 빌드 표(strategy.openingBuild). 3일 무행동 힌트(hints.ts)도 같은 1위 수.
 *  목표 줄 왼쪽 「📖 n/33」 배지에서 연다 (GoalBar.tsx). 진행은 sim 상태(state.tutorial)에서 읽는다. */
import { useState } from 'react';
import { useGame } from './store';
import { Popup, confirm } from './Popup';
import { PALETTE, brownBtn, brownBtnOn, card } from './frame';
import { TUTORIAL_STEPS, TUTORIAL_CHAPTERS, currentTutorialStep, currentTutorialChapter, tutorialDone, tutorialStepDone, openingBuild, heuristicNextMove, solverResult, solverKey, UI_SOLVER_OPTIONS } from '../sim/index.ts';
import { SPEAKER_NAME } from '../data/dialogue/index.ts';
import { TUTORIAL_DIALOGUES, chapterText, showTutorialStep, skipCurrentChapter, isChapterStart, SKIP_TEXT, fillTutorialStep } from './tutorialDialogue';
import { useSpotlightPref, setSpotlightOn, setGuideFocus } from './tutorialHighlight';
import { solverBusy } from './solverClient';

export const GRADUATE_TITLE = '할망의 제자';
export const NOTE_TAB = '추천';
export const NO_MOVE_TEXT = '정석은 다 했다. 네 빌드를 해 봐';
export const SOLVER_BUSY_TEXT = '시뮬 계산 중…';
export const SOLVER_SAVE_TEXT = '지금은 저축이 최선 — 어떤 수도 안 하는 것보다 낫지 않아';

/** 추천 탭: 시뮬 추천(solver 상위 3 + 예상 이득, 탭하면 글로우) + 월별 정석 표 */
export function StrategyNote({ onFocus }: { onFocus?: () => void } = {}) {
  const s = useGame();
  const res = solverResult(s);
  const moves = res ? res.moves.filter((m) => m.score > 0) : [];
  const fallback = res ? null : heuristicNextMove(s);
  const month = s.clock.month;
  const focus = (i: number) => {
    const m = moves[i]!;
    setGuideFocus({ key: solverKey(s), targets: m.targets, cells: m.cells, label: `${m.label} · 시뮬 ${m.why}` });
    onFocus?.();
  };
  return (
    <div data-testid="tutorial-note">
      <div data-testid="tutorial-next-move" style={{ ...card, marginBottom: 8, borderColor: PALETTE.title }}>
        <div style={{ fontWeight: 700 }}>🎯 시뮬 추천 ({res ? res.horizon : UI_SOLVER_OPTIONS.horizon}일 굴려 본 결과) <span style={{ fontWeight: 400, color: PALETTE.inkSoft, fontSize: 13 }}>{res ? `${res.rollouts}회` : solverBusy() ? SOLVER_BUSY_TEXT : ''}</span></div>
        {res ? (moves.length === 0 ? <div style={{ fontSize: 14 }}>할망: {SOLVER_SAVE_TEXT}</div> : moves.map((m, i) => (
          <button key={i} data-testid={`solver-move-${i + 1}`} onClick={() => focus(i)} aria-label={`${i + 1}위 ${m.label} 보기`}
            style={{ ...brownBtn, margin: '4px 0 0', width: '100%', minHeight: 44, fontSize: 14, textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.35 }}>
            <b>{i + 1}위</b> {m.label}<div style={{ fontSize: 13, color: PALETTE.inkSoft }}>{m.why}</div>
          </button>
        ))) : <div style={{ fontSize: 14 }}>할망: {fallback ? fallback.text : NO_MOVE_TEXT}</div>}
      </div>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>📅 1년차 정석 빌드</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, lineHeight: 1.4 }}>
          <tbody>
            {openingBuild().map((r) => (
              <tr key={r.month} data-testid={`tutorial-plan-${r.month}`} style={{ background: r.month === month ? PALETTE.paperDark : undefined }}>
                <td style={{ padding: '3px 4px', whiteSpace: 'nowrap', fontWeight: 700, verticalAlign: 'top', color: r.month === month ? PALETTE.title : PALETTE.ink }}>{r.month}월 {r.title}</td>
                <td style={{ padding: '3px 4px', verticalAlign: 'top' }}>{r.what}<div style={{ color: PALETTE.inkSoft }}>— {r.why}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TutorialWindow({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const cur = currentTutorialStep(s);
  const ch = currentTutorialChapter(s);
  const done = tutorialDone(s);
  const [tab, setTab] = useState<'progress' | 'note'>(done ? 'note' : 'progress');
  const curDlg = cur ? fillTutorialStep(TUTORIAL_DIALOGUES[cur.id - 1]!, s) : null;
  const spotlight = useSpotlightPref(); // w-free: 스포트라이트(나머지 어둡게) — 설정 창이 가려져 있어도 여기서 끌 수 있다
  const replay = () => { if (curDlg) { onClose(); showTutorialStep(curDlg, { skip: isChapterStart(curDlg) }); } };
  const skip = () => {
    void confirm(SKIP_TEXT, { title: `${ch?.id}장 「${ch?.title}」 건너뛰기`, yes: '건너뛰기', no: '계속 배우기' }).then((ok) => { if (ok) { skipCurrentChapter(); onClose(); } });
  };
  return (
    <Popup title={`📖 할망의 가르침 ${Math.min(s.tutorial.step, TUTORIAL_STEPS)}/${TUTORIAL_STEPS}`} onBackdrop={onClose}
      buttons={<>
        {!done && <button data-testid="tutorial-skip-chapter" style={{ ...brownBtn, margin: 0, whiteSpace: 'nowrap' }} onClick={skip} aria-label="이 장 건너뛰기">⏭ 건너뛰기</button>}
        {!done && curDlg && <button data-testid="tutorial-replay" style={{ ...brownBtnOn, margin: 0, whiteSpace: 'nowrap' }} onClick={replay} aria-label="대사 다시 보기">💬 다시 보기</button>}
        <button style={{ ...brownBtn, margin: 0, whiteSpace: 'nowrap' }} onClick={onClose}>닫기</button>
      </>}>
      <div data-testid="tutorial-window" style={{ fontSize: 14 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button data-testid="tutorial-tab-progress" aria-pressed={tab === 'progress'} style={{ ...(tab === 'progress' ? brownBtnOn : brownBtn), margin: 0, flex: 1, minHeight: 44, fontSize: 14 }} onClick={() => setTab('progress')}>📋 진행</button>
          <button data-testid="tutorial-tab-note" aria-pressed={tab === 'note'} style={{ ...(tab === 'note' ? brownBtnOn : brownBtn), margin: 0, flex: 1, minHeight: 44, fontSize: 14 }} onClick={() => setTab('note')}>📖 {NOTE_TAB}</button>
        </div>
        {tab === 'note' ? <StrategyNote onFocus={onClose} /> : done ? (
          <div style={{ ...card, marginBottom: 8 }}>
            <b>졸업!</b> 할망의 가르침을 다 마쳤어요.{s.titles.includes('halmang_pupil') && <> 칭호 「{GRADUATE_TITLE}」</>}
          </div>
        ) : curDlg && (
          <div data-testid="tutorial-current" style={{ ...card, marginBottom: 8, borderColor: PALETTE.title }}>
            <div style={{ fontWeight: 700 }}>▶ {cur!.id}단계 · {curDlg.title}</div>
            <div style={{ color: PALETTE.inkSoft, fontSize: 13 }}>{SPEAKER_NAME[curDlg.speaker]}: {curDlg.lines[0]}</div>
            {curDlg.done && <div style={{ fontSize: 13, marginTop: 2 }}>할 일: {curDlg.done}</div>}
          </div>
        )}
        {tab === 'progress' && !done && (
          <button data-testid="tutorial-spotlight" aria-pressed={spotlight} onClick={() => setSpotlightOn(!spotlight)}
            style={{ ...(spotlight ? brownBtnOn : brownBtn), margin: '0 0 8px', width: '100%', minHeight: 44, fontSize: 14 }}>
            🔦 스포트라이트 {spotlight ? '켬 (빛나는 것 빼고 어둡게)' : '끔'}
          </button>
        )}
        {tab === 'progress' && TUTORIAL_CHAPTERS.map((c) => {
          const t = chapterText(c.id);
          const chapterDone = tutorialStepDone(s, c.to);
          const active = ch?.id === c.id;
          return (
            <div key={c.id} data-testid={`tutorial-chapter-${c.id}`} style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 700, color: chapterDone ? PALETTE.inkSoft : active ? PALETTE.title : PALETTE.ink }}>
                {chapterDone ? '✓' : active ? '▶' : '○'} {c.id}장 {t.title} <span style={{ fontWeight: 400, color: PALETTE.inkSoft }}>{Math.max(0, Math.min(c.to, s.tutorial.step) - c.from + 1)}/{c.to - c.from + 1}{t.intro ? ` — ${t.intro}` : ''}</span>
              </div>
              {active && (
                <ul style={{ margin: '2px 0 0 14px', padding: 0, listStyle: 'none', fontSize: 13, lineHeight: 1.6 }}>
                  {TUTORIAL_DIALOGUES.filter((d) => d.chapter === c.id).map((d) => {
                    const isDone = tutorialStepDone(s, d.id);
                    const isCur = cur?.id === d.id;
                    return (
                      <li key={d.id} data-testid={`tutorial-step-${d.id}`} style={{ color: isDone ? PALETTE.inkSoft : isCur ? PALETTE.ink : PALETTE.inkSoft, fontWeight: isCur ? 700 : 400 }}>
                        {isDone ? '✓' : isCur ? '▶' : '○'} {d.id}. {d.title}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Popup>
  );
}

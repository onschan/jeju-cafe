/** 튜토리얼 창 「할망의 가르침」: 5막 진행도(막 이름·완료 ✓·지금 ▶·아직 ○ + 그 막 단계 목록)와 현재 단계 카드(대사 첫 줄·할 일),
 *  아직 안 열린 막은 「언제 열리나」 한 줄, 대사 다시 보기, 이 막 건너뛰기(보상 없음), 스포트라이트 켜기/끄기.
 *  trim: 「추천」 탭과 1년차 월별 표는 없앴다 — 할망의 추천은 목표 창의 한 줄(HalmangLine)로만 나온다.
 *  목표 줄 왼쪽 「📖 막 n/5」 배지에서 연다 (GoalBar.tsx). 진행은 sim 상태(state.tutorial)에서 읽는다. 장(章)은 없다(fun-start). */
import { useState } from 'react';
import { useGame } from './store';
import { Popup, confirm } from './Popup';
import { PALETTE, brownBtn, brownBtnOn, card } from './frame';
import { TUTORIAL_ACTS, actsDone, actDone, actOpen, currentAct, nextTutorialStep, waitingForAct, tutorialDone, tutorialStepDone, heuristicNextMove, solverResult, solverKey } from '../sim/index.ts';
import { SPEAKER_NAME } from '../data/dialogue/index.ts';
import { TUTORIAL_DIALOGUES, showTutorialStep, skipCurrentChapter, SKIP_TEXT, fillTutorialStep } from './tutorialDialogue';
import { useSpotlightPref, setSpotlightOn, setGuideFocus } from './tutorialHighlight';
import { solverBusy } from './solverClient';

export const GRADUATE_TITLE = '할망의 제자';
export const NO_MOVE_TEXT = '할 건 다 했다. 네 방식대로 해 보라';
export const SOLVER_BUSY_TEXT = '셈하는 중…';
export const SOLVER_SAVE_TEXT = '지금은 모으는 게 낫다. 돈이 있어야 다음이 있다';
export const RECOMMEND_TITLE = '할망의 추천';

/** 할망의 추천 한 줄 (trim: 추천 탭·공략 노트 표 대신). solver 1위 수가 있으면 그것, 없으면 휴리스틱 다음 수. 탭하면 그 행동의 타깃이 글로우. */
export function HalmangLine({ onFocus }: { onFocus?: () => void } = {}) {
  const s = useGame();
  const res = solverResult(s);
  const top = res ? res.moves.filter((m) => m.score > 0)[0] : undefined;
  const fallback = heuristicNextMove(s);
  const text = top ? `${top.label} — ${top.why}` : fallback ? fallback.text : res ? SOLVER_SAVE_TEXT : NO_MOVE_TEXT;
  const focus = () => {
    if (top) setGuideFocus({ key: solverKey(s), targets: top.targets, cells: top.cells, label: `${top.label} · ${top.why}` });
    else if (fallback?.cells.length) setGuideFocus({ key: solverKey(s), targets: [], cells: fallback.cells, label: fallback.text });
    onFocus?.();
  };
  return (
    <button data-testid="halmang-line" onClick={focus} aria-label={`${RECOMMEND_TITLE}: ${text}`}
      style={{ ...card, margin: '0 0 8px', width: '100%', minHeight: 44, borderColor: PALETTE.title, fontFamily: 'inherit', fontSize: 14, textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.35 }}>
      <b>🎯 {RECOMMEND_TITLE}</b> <span style={{ fontWeight: 400, color: PALETTE.inkSoft, fontSize: 13 }}>{res ? '' : solverBusy() ? SOLVER_BUSY_TEXT : ''}</span>
      <div>{text}</div>
    </button>
  );
}

export function TutorialWindow({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const cur = nextTutorialStep(s);
  const act = currentAct(s);
  const waiting = waitingForAct(s);
  const done = tutorialDone(s);
  const curDlg = cur ? fillTutorialStep(TUTORIAL_DIALOGUES[cur.id - 1]!, s) : null;
  const spotlight = useSpotlightPref(); // w-free: 스포트라이트(나머지 어둡게) — 설정 창이 가려져 있어도 여기서 끌 수 있다
  const replay = () => { if (curDlg) { onClose(); showTutorialStep(curDlg); } };
  const skip = () => {
    void confirm(SKIP_TEXT, { title: '이 막 건너뛰기', yes: '건너뛰기', no: '계속 배우기' }).then((ok) => { if (ok) { skipCurrentChapter(); onClose(); } });
  };
  return (
    <Popup title={`📖 할망의 가르침 · 막 ${Math.min(actsDone(s) + 1, TUTORIAL_ACTS.length)}/${TUTORIAL_ACTS.length}`} onBackdrop={onClose}
      buttons={<>
        {!done && <button data-testid="tutorial-skip-chapter" style={{ ...brownBtn, margin: 0, whiteSpace: 'nowrap' }} onClick={skip} aria-label="이 막 건너뛰기">⏭ 이 막 건너뛰기</button>}
        {!done && curDlg && <button data-testid="tutorial-replay" style={{ ...brownBtnOn, margin: 0, whiteSpace: 'nowrap' }} onClick={replay} aria-label="대사 다시 보기">💬 다시 보기</button>}
        <button style={{ ...brownBtn, margin: 0, whiteSpace: 'nowrap' }} onClick={onClose}>닫기</button>
      </>}>
      <div data-testid="tutorial-window" style={{ fontSize: 14 }}>
        {done ? (
          <div style={{ ...card, marginBottom: 8 }}>
            <b>다 배웠다!</b> 할망의 가르침을 마쳤어요.{s.titles.includes('halmang_pupil') && <> 칭호 「{GRADUATE_TITLE}」</>}
          </div>
        ) : waiting ? (
          <div data-testid="tutorial-waiting" style={{ ...card, marginBottom: 8, borderColor: PALETTE.title }}>
            <div style={{ fontWeight: 700 }}>▶ {waiting.id}막 {waiting.name}</div>
            <div style={{ color: PALETTE.inkSoft, fontSize: 13 }}>다음 막은 {waiting.when}일 때 열려요</div>
          </div>
        ) : curDlg && (
          <div data-testid="tutorial-current" style={{ ...card, marginBottom: 8, borderColor: PALETTE.title }}>
            <div style={{ fontWeight: 700 }}>▶ {act?.id}막 {act?.name} · {curDlg.title}</div>
            <div style={{ color: PALETTE.inkSoft, fontSize: 13 }}>{SPEAKER_NAME[curDlg.speaker]}: {curDlg.lines[0]}</div>
            {curDlg.done && <div style={{ fontSize: 13, marginTop: 2 }}>할 일: {curDlg.done}</div>}
          </div>
        )}
        {!done && (
          <button data-testid="tutorial-spotlight" aria-pressed={spotlight} onClick={() => setSpotlightOn(!spotlight)}
            style={{ ...(spotlight ? brownBtnOn : brownBtn), margin: '0 0 8px', width: '100%', minHeight: 44, fontSize: 14 }}>
            🔦 스포트라이트 {spotlight ? '켬 (빛나는 것 빼고 살짝 어둡게)' : '끔'}
          </button>
        )}
        <ul data-testid="tutorial-acts" style={{ margin: '2px 0 0 4px', padding: 0, listStyle: 'none', fontSize: 14, lineHeight: 1.7 }}>
          {TUTORIAL_ACTS.map((a) => {
            const aDone = actDone(s, a.id);
            const aCur = act?.id === a.id;
            const open = actOpen(s, a.id);
            return (
              <li key={a.id} data-testid={`tutorial-act-${a.id}`} style={{ marginBottom: 4 }}>
                <span style={{ color: aDone ? PALETTE.inkSoft : aCur ? PALETTE.title : PALETTE.ink, fontWeight: aCur ? 700 : 400 }}>
                  {aDone ? '✓' : aCur ? '▶' : '○'} {a.id}막 {a.name}
                </span>
                {!aDone && !open && <span style={{ color: PALETTE.inkSoft, fontSize: 13 }}> · {a.when}</span>}
                <ul style={{ margin: '0 0 0 14px', padding: 0, listStyle: 'none', fontSize: 13 }}>
                  {TUTORIAL_DIALOGUES.filter((d) => d.act === a.id).map((d) => {
                    const isDone = tutorialStepDone(s, d.id);
                    const isCur = cur?.id === d.id;
                    return (
                      <li key={d.id} data-testid={`tutorial-step-${d.id}`} style={{ color: isDone ? PALETTE.inkSoft : isCur ? PALETTE.title : PALETTE.ink, fontWeight: isCur ? 700 : 400 }}>
                        {isDone ? '✓' : isCur ? '▶' : '○'} {fillTutorialStep(d, s).title}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </Popup>
  );
}

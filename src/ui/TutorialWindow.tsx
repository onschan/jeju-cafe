/** 튜토리얼 창 「할망의 가르침」: 5장 목록(완료 ✓ · 지금 ▶ · 아직 ○, 장마다 n/m)과 지금 장의 단계 목록, 현재 단계 대사 다시 보기, 이 장 건너뛰기(보상 없음).
 *  목표 줄 왼쪽 「📖 n/33」 배지에서 연다 (GoalBar.tsx). 진행은 sim 상태(state.tutorial)에서 읽는다. */
import { useGame } from './store';
import { Popup, confirm } from './Popup';
import { PALETTE, brownBtn, brownBtnOn, card } from './frame';
import { TUTORIAL_STEPS, TUTORIAL_CHAPTERS, currentTutorialStep, currentTutorialChapter, tutorialDone, tutorialStepDone } from '../sim/index.ts';
import { SPEAKER_NAME } from '../data/dialogue/index.ts';
import { TUTORIAL_DIALOGUES, chapterText, showTutorialStep, skipCurrentChapter, isChapterStart, SKIP_TEXT } from './tutorialDialogue';

export const GRADUATE_TITLE = '할망의 제자';

export function TutorialWindow({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const cur = currentTutorialStep(s);
  const ch = currentTutorialChapter(s);
  const done = tutorialDone(s);
  const curDlg = cur ? TUTORIAL_DIALOGUES[cur.id - 1] : null;
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
        {done ? (
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
        {TUTORIAL_CHAPTERS.map((c) => {
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

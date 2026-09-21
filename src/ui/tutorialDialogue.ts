import { useEffect } from 'react';
import { type GameState, type Action, tutorialDone, TUTORIAL_CHAPTERS, dialogueSeen, type TutorialNoteKey } from '../sim/index.ts';
import { TUTORIAL_STEPS as STEP_DATA, TUTORIAL_CHAPTER_TEXTS, SPEAKER_NAME, type TutorialStep } from '../data/dialogue/index.ts';
import { showDialogue, getDialogue } from './dialogue.ts';
import { confirm } from './Popup';

/** 손으로 하는 튜토리얼 「할망의 가르침」 33단계·5장 대화 (w-start: 1~3단계 둘러보기·본관 짓기·본관 보기). 대사는 data/dialogue/tutorial.json, 진행(끝낸 단계 수)은 sim 상태 state.tutorial.step —
 *  조건 판정·보상은 sim/tutorial.ts가 한다. 여기서는 "현재 단계의 대사를 한 번 띄우는" 일만 한다.
 *  대사를 닫으면 `tutorialNote dlg:<id>`를 보내 sim이 그 단계를 끝낼 수 있게 한다(이미 충족된 단계는 대사만 뜨고 바로 통과).
 *  보상 상자(alerts)가 떠 있는 동안은 기다렸다가, 닫히면 다음 단계 대사를 띄운다. 건너뛰기는 장 단위(각 장 첫 단계 대사의 「건너뛰기」·튜토리얼 창). */

export type { TutorialStep };
export const TUTORIAL_DIALOGUES: TutorialStep[] = STEP_DATA;

/** 마지막으로 대사를 띄운 단계 번호 (state.tutorial.step 기준, −1 = 아직). 새 게임이면 resetTutorial. */
let shownFor = -1;
/** sim 액션 보내기·상태 읽기 (App이 store.dispatch·getState를 넣는다 — store↔여기 순환 import를 피한다) */
let dispatchFn: ((a: Action) => unknown) | null = null;
let stateFn: (() => GameState) | null = null;
export function setTutorialDispatch(fn: ((a: Action) => unknown) | null, get: (() => GameState) | null = null): void { dispatchFn = fn; stateFn = get; }
/** 이미 남긴 표식이거나 튜토리얼이 끝났으면 액션을 안 보낸다 (효과음·저장이 매번 나지 않게) */
function note(key: string): void {
  const s = stateFn?.();
  if (s && (tutorialDone(s) || s.tutorial.seen?.includes(key))) return;
  dispatchFn?.({ type: 'tutorialNote', key });
}

export function tutorialShown(): number { return shownFor + 1; }
/** 새 게임을 시작할 때 처음부터 */
export function resetTutorial(): void { shownFor = -1; }

/** 현재 단계(state.tutorial.step)의 대사. 끝났으면 null. */
export function currentTutorialDialogue(s: GameState): TutorialStep | null {
  if (tutorialDone(s)) return null;
  return TUTORIAL_DIALOGUES[s.tutorial.step] ?? null;
}
/** 장 제목·소개 (json) */
export function chapterText(id: number): { id: number; title: string; intro: string } {
  return TUTORIAL_CHAPTER_TEXTS.find((c) => c.id === id) ?? { id, title: TUTORIAL_CHAPTERS.find((c) => c.id === id)?.title ?? '', intro: '' };
}
/** 이 단계가 장의 첫 단계인가 (대사에 「건너뛰기」를 보여 준다) */
export function isChapterStart(step: TutorialStep): boolean {
  return TUTORIAL_CHAPTERS.some((c) => c.from === step.id);
}

/** UI 사건 표식 — sim 조건 판정용 (손님 카드 봄·창고 봄·입지 보기 켬·둘러보기 look:<id>). 튜토리얼이 끝났거나 이미 남겼으면 sim이 무시한다. */
export function noteTutorial(key: TutorialNoteKey): void {
  note(key);
}
/** 컴포넌트가 뜰 때 한 번 표식을 남기는 훅 (StoragePanel·손님 카드·둘러보기 힌트 등에서 한 줄). key가 null이면 아무것도 안 한다 (훅 순서를 지키려고). */
export function useTutorialNote(key: TutorialNoteKey | null, on = true): void {
  useEffect(() => { if (on && key) noteTutorial(key); }, [key, on]);
}
/** 현재 장을 통째로 건너뛴다 (보상 없음, 해금만) */
export function skipCurrentChapter(): void {
  dispatchFn?.({ type: 'skipTutorialChapter' });
  shownFor = -1; // 다음 장 첫 대사를 띄운다
}
/** ease 「이미 알아요」: 이 단계만 보상 없이 통과 (해금만). 다음 단계 대사가 바로 뜬다. */
export function skipCurrentStep(): void {
  dispatchFn?.({ type: 'skipTutorialStep' });
  shownFor = -1;
}

export const SKIP_TEXT = '이 장을 통째로 건너뛸까요? 단계 보상은 못 받아요.';
/** 단계 대사를 띄운다 (다시 보기 포함). 닫으면 dlg:<id> 표식. skipStep(기본 true)이면 왼쪽 아래 「이미 알아요」— 그 단계만 보상 없이 통과 (ease). */
export function showTutorialStep(step: TutorialStep, opts: { skip?: boolean; skipStep?: boolean } = {}): void {
  showDialogue({
    speaker: { name: SPEAKER_NAME[step.speaker], portrait: step.speaker },
    lines: step.lines,
    choices: [{ label: step.button, onPick: () => note(`dlg:${step.id}`) }],
    onSkipStep: opts.skipStep === false ? undefined : () => { const s = stateFn?.(); if (s && s.tutorial.step === step.id - 1) skipCurrentStep(); },
    // 장 단위 건너뛰기 (보상 없음) — 확인에서 아니요를 누르면 대사를 다시 띄운다 (dlg 표식이 남아야 단계가 끝나므로)
    onSkip: opts.skip ? () => { void confirm(SKIP_TEXT, { title: '건너뛰기', yes: '건너뛰기', no: '계속 배우기' }).then((ok) => { if (ok) skipCurrentChapter(); else showTutorialStep(step, opts); }); } : undefined,
  });
}

/** 상태를 보고 현재 단계 대사를 아직 안 띄웠으면 띄운다. 알림(보상 상자·대화)이 남아 있거나 대화가 떠 있으면 기다린다. 띄웠으면 true. */
export function checkTutorial(s: GameState): boolean {
  if (tutorialDone(s) || s.alerts.length > 0 || getDialogue()) return false;
  const step = currentTutorialDialogue(s);
  if (!step || shownFor === s.tutorial.step) return false;
  shownFor = s.tutorial.step;
  if (dialogueSeen(s, step.id)) return false; // 저장을 불러와 이미 본 대사면 다시 안 띄운다 (튜토리얼 창에서 다시 볼 수 있다)
  showTutorialStep(step, { skip: isChapterStart(step) });
  return true;
}


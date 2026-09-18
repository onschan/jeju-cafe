import { type GameState, tutorialDone, TUTORIAL_STEPS } from '../sim/index.ts';
import { TUTORIAL_STEPS as STEP_DATA, SPEAKER_NAME, type TutorialStep } from '../data/dialogue/index.ts';
import { showDialogue, getDialogue } from './dialogue.ts';

/** 손으로 하는 튜토리얼 9단계 대화 (스펙 §7.2). 대사는 data/dialogue/tutorial.json, 진행(끝낸 단계 수)은 sim 상태 state.tutorial.step —
 *  조건 판정·보상은 sim/tutorial.ts가 한다. 여기서는 "현재 단계의 대사를 한 번 띄우는" 일만 한다.
 *  보상 상자(alerts)가 떠 있는 동안은 기다렸다가, 닫히면 다음 단계 대사를 띄운다. 건너뛰기는 첫 단계에서만 (skipTutorial 액션). */

export type { TutorialStep };
export const TUTORIAL_DIALOGUES: TutorialStep[] = STEP_DATA;

/** 마지막으로 대사를 띄운 단계 번호 (state.tutorial.step 기준, −1 = 아직). 새 게임이면 resetTutorial. */
let shownFor = -1;
/** 건너뛰기 콜백 (App이 dispatch({ type: 'skipTutorial' })를 넣는다) */
let skipFn: (() => void) | null = null;
export function setTutorialSkip(fn: (() => void) | null): void { skipFn = fn; }

export function tutorialShown(): number { return shownFor + 1; }
/** 새 게임을 시작할 때 처음부터 */
export function resetTutorial(): void { shownFor = -1; }

/** 현재 단계(state.tutorial.step)의 대사. 끝났으면 null. */
export function currentTutorialDialogue(s: GameState): TutorialStep | null {
  if (tutorialDone(s)) return null;
  return TUTORIAL_DIALOGUES[s.tutorial.step] ?? null;
}

/** 상태를 보고 현재 단계 대사를 아직 안 띄웠으면 띄운다. 알림(보상 상자·대화)이 남아 있거나 대화가 떠 있으면 기다린다. 띄웠으면 true. */
export function checkTutorial(s: GameState): boolean {
  if (tutorialDone(s) || s.alerts.length > 0 || getDialogue()) return false;
  const step = currentTutorialDialogue(s);
  if (!step || shownFor === s.tutorial.step) return false;
  shownFor = s.tutorial.step;
  showDialogue({
    speaker: { name: SPEAKER_NAME[step.speaker], portrait: step.speaker },
    lines: step.lines,
    choices: [{ label: step.button, onPick: () => {} }],
    onSkip: step.id === 1 && s.tutorial.step === 0 ? () => { skipFn?.(); shownFor = TUTORIAL_STEPS; } : undefined,
  });
  return true;
}

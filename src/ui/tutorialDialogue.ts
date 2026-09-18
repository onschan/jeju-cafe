import { type GameState, START_SEATS } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { TUTORIAL_STEPS as STEP_DATA, SPEAKER_NAME, type TutorialStep as StepData } from '../data/dialogue/index.ts';
import { showDialogue, getDialogue } from './dialogue.ts';
import { goalsAchieved } from './simBridge';

/** 튜토리얼 6단계 대화 (스펙 §1.3). 대사는 data/dialogue/tutorial.json, 진행은 localStorage `tut_v3_step`(= 지금까지 보여 준 단계 수).
 *  각 단계는 조건이 차면 한 번만 뜬다. 현재 할 일은 배너가 아니라 목표 줄이 보여 준다. */

/** 창을 연 것처럼 sim 상태에 없는 UI 사건 */
export type TutorialEvent = 'menuOpened' | 'goalOpened';
const seen: Record<TutorialEvent, boolean> = { menuOpened: false, goalOpened: false };
export function markTutorialEvent(e: TutorialEvent): void { seen[e] = true; }

export interface TutorialStep extends StepData {
  /** 이 조건이 차면 뜬다. 없으면(1단계) 바로 */
  when?: (s: GameState) => boolean;
}

function seatCount(s: GameState): number {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat').length;
}

/** tutorial.json의 done 조건을 판정하는 함수 (단계 key 기준) */
const WHEN: Record<string, (s: GameState) => boolean> = {
  welcome_menu: () => true,
  table_path: () => seen.menuOpened,
  first_guest: (s) => seatCount(s) > START_SEATS.length,
  hire: (s) => s.totalGuests > 0,
  goal_bar: (s) => s.staff.length >= 1,
  farewell: (s) => goalsAchieved(s) >= 3,
};

export const TUTORIAL_STEPS: TutorialStep[] = STEP_DATA.map((d) => ({ ...d, when: d.id === 1 ? undefined : WHEN[d.key] }));

export const TUTORIAL_KEY = 'tut_v3_step';

function read(): number {
  try { const n = Number(localStorage.getItem(TUTORIAL_KEY)); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
let shown = typeof localStorage === 'undefined' ? 0 : read();
function write() { try { localStorage.setItem(TUTORIAL_KEY, String(shown)); } catch { /* noop */ } }

export function tutorialShown(): number { return shown; }
export function tutorialDone(): boolean { return shown >= TUTORIAL_STEPS.length; }

/** 새 게임을 시작할 때 처음부터 */
export function resetTutorial(): void { shown = 0; seen.menuOpened = false; seen.goalOpened = false; write(); }
export function skipTutorial(): void { shown = TUTORIAL_STEPS.length; write(); }

/** 상태를 보고 다음 단계 조건이 찼으면 대화를 띄운다. 대화가 이미 떠 있으면 기다린다 (한 번에 한 단계). */
export function checkTutorial(s: GameState): boolean {
  if (tutorialDone() || getDialogue()) return false;
  const step = TUTORIAL_STEPS[shown];
  if (!step || (step.when && !step.when(s))) return false;
  shown++;
  write();
  showDialogue({
    speaker: { name: SPEAKER_NAME[step.speaker], portrait: step.speaker },
    lines: step.lines,
    choices: [{ label: step.button, onPick: () => {} }],
    onSkip: step.id === 1 ? skipTutorial : undefined,
  });
  return true;
}

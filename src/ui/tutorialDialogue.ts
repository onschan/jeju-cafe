import { hasReachableSeat, type GameState } from '../sim/index.ts';
import { showDialogue, getDialogue } from './dialogue.ts';
import { goalsAchieved } from './simBridge';

/** 튜토리얼 6단계 대화 (스펙 §1.3). 진행은 localStorage `tut_v3_step`(= 지금까지 보여 준 단계 수).
 *  각 단계는 조건이 차면 한 번만 뜬다. 현재 할 일은 배너가 아니라 목표 줄이 보여 준다. */

export interface TutorialStep {
  id: number;
  lines: string[];
  /** 이 조건이 차면 뜬다. 없으면(1단계) 바로 */
  when?: (s: GameState) => boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 1, lines: ['어서 오라. 이 카페는 이제 네 것이다.', '먼저 아래 카페 → 메뉴판을 열어 보라. 팔 게 있어야 손님이 온다.'] },
  { id: 2, lines: ['메뉴는 됐다. 손님이 앉을 자리가 있어야지.', '짓기에서 테이블을 놓고, 정낭에서 테이블 옆까지 올렛길을 이어라.'],
    when: (s) => s.menuSlots.some((m) => m !== null) },
  { id: 3, lines: ['길이 이어졌다. 정류장에서 버스가 오면 손님이 걸어온다.', '첫 손님을 기다려 보라. 손님을 누르면 무슨 생각인지 보인다.'],
    when: (s) => hasReachableSeat(s) },
  { id: 4, lines: ['첫 손님이 앉았다. 혼자서는 오래 못 버틴다.', '사람 → 직원에서 공고를 내고 후보를 뽑아 보라.'],
    when: (s) => s.guests.some((g) => g.phase === 'seated') || s.totalGuests > 0 || s.monthGuests > 0 },
  { id: 5, lines: ['식구가 생겼다. 위쪽 목표 줄을 보라.', '지금 할 일이 늘 거기 있다. 채우면 보상을 주고 다음 목표가 온다.'],
    when: (s) => s.staff.length >= 1 },
  { id: 6, lines: ['목표를 세 개나 채웠다. 이제 할 말은 다 했다.', '손님 얼굴을 보며 카페를 키워 보라. 궁금하면 뭐든 눌러 보라.'],
    when: (s) => goalsAchieved(s) >= 3 },
];

export const TUTORIAL_KEY = 'tut_v3_step';

function read(): number {
  try { const n = Number(localStorage.getItem(TUTORIAL_KEY)); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
let shown = typeof localStorage === 'undefined' ? 0 : read();
function write() { try { localStorage.setItem(TUTORIAL_KEY, String(shown)); } catch { /* noop */ } }

export function tutorialShown(): number { return shown; }
export function tutorialDone(): boolean { return shown >= TUTORIAL_STEPS.length; }

/** 새 게임을 시작할 때 처음부터 */
export function resetTutorial(): void { shown = 0; write(); }
export function skipTutorial(): void { shown = TUTORIAL_STEPS.length; write(); }

/** 상태를 보고 다음 단계 조건이 찼으면 대화를 띄운다. 대화가 이미 떠 있으면 기다린다 (한 번에 한 단계). */
export function checkTutorial(s: GameState): boolean {
  if (tutorialDone() || getDialogue()) return false;
  const step = TUTORIAL_STEPS[shown];
  if (!step || (step.when && !step.when(s))) return false;
  shown++;
  write();
  showDialogue({
    speaker: { name: '할망', portrait: 'halmang' },
    lines: step.lines,
    onSkip: step.id === 1 ? skipTutorial : undefined,
  });
  return true;
}

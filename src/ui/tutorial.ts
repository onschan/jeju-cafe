import { useSyncExternalStore } from 'react';
import type { GameState } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';

/** 할망 튜토리얼 12단계 (UI 전용). 단계 조건은 GameState로 판정하고 진행은 localStorage에 둔다.
 *  done이 없는 단계(11·12)는 안내만 하고 "다음" 버튼으로 넘어간다. */

export interface TutorialStep {
  id: number;
  /** 할망 대사 2줄 */
  lines: [string, string];
  /** 강조할 하단 탭 이름 (BottomSheet data-tab). 없으면 강조 없음 */
  tab?: string;
  /** 이 조건을 만족하면 다음 단계로 */
  done?: (s: GameState) => boolean;
}

/** 더보기 안에 숨어 있는 탭. 접혀 있으면 더보기 버튼을 대신 강조한다 (BottomSheet MORE_TABS와 같은 이름) */
export const MORE_TAB_NAMES = new Set(['카페', '메뉴판', '홍보', '도감', '이동']);

const kinds = (s: GameState) => Object.values(s.objects).map((o) => objectDef(o.type).kind);
const acted = (s: GameState, type: string) => s.actionLog.some((a) => a.action.type === type);

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 1, tab: '메뉴판', lines: ['어서 오라. 카페는 메뉴가 먼저다.', '더보기 → 메뉴판 탭에서 아메리카노를 올려 보라.'],
    done: (s) => s.menuSlots.includes('americano') },
  { id: 2, tab: '짓기', lines: ['손님이 앉을 자리가 있어야지.', '짓기 탭에서 테이블을 하나 놓아 보라.'],
    done: (s) => kinds(s).includes('seat') },
  { id: 3, lines: ['정류장에서 버스가 온다. 기다려 보라.', '첫 손님이 앉으면 커피가 나간다.'],
    done: (s) => s.guests.some((g) => g.phase === 'seated') || s.monthGuests > 0 },
  { id: 4, tab: '직원', lines: ['혼자서는 힘들다. 사람을 구해 보라.', '직원 탭에서 공고를 내면 후보가 온다.'],
    done: (s) => s.candidates.length > 0 || s.staff.length > 0 || acted(s, 'postJob') },
  { id: 5, tab: '직원', lines: ['후보 중에 마음에 드는 사람을 골라라.', '채용을 누르면 우리 식구가 된다.'],
    done: (s) => s.staff.length > 0 },
  { id: 6, tab: '짓기', lines: ['재료는 밭에서 나온다.', '짓기 탭에서 밭을 하나 지어 보라.'],
    done: (s) => kinds(s).includes('field') },
  { id: 7, lines: ['밭에 당근을 심고, 반짝이면 눌러 수확하라.', '탭을 닫고 밭을 누르면 심기·수확이 나온다.'],
    done: (s) => acted(s, 'harvest') || Object.values(s.storage).some((n) => n > 0) },
  { id: 8, tab: '홍보', lines: ['손님이 적으면 알려야지.', '더보기 → 홍보 탭에서 전단이라도 돌려 보라.'],
    done: (s) => s.activePromotions.length > 0 || acted(s, 'promote') },
  { id: 9, lines: ['돈이 모이면 옆 땅을 사라.', '어두운 필지를 누르면 살 수 있다.'],
    done: (s) => s.parcels.filter((p) => p.owned).length >= 2 },
  { id: 10, lines: ['달이 바뀌면 결산 카드가 뜬다.', '수입과 비용을 확인하고 닫아 보라.'],
    done: (s) => acted(s, 'dismissMonthCard') },
  { id: 11, lines: ['감귤나무는 3년 뒤에 열린다. 미리 심어 두라.', '3년차엔 관광객이 늘고 ★ 등급이 오른다.'] },
  { id: 12, lines: ['이제 할 말은 다 했다.', '손님 얼굴을 보며 카페를 키워 보라.'] },
];

const KEY = 'jeju-cafe:tutorial';
interface Progress { step: number; done: boolean }

function read(): Progress {
  try {
    const j = localStorage.getItem(KEY);
    if (j) { const p = JSON.parse(j) as Progress; if (typeof p.step === 'number') return p; }
  } catch { /* noop */ }
  return { step: 1, done: false };
}

let progress: Progress = read();
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; for (const l of listeners) l(); }
function write() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* noop */ } }

export function getTutorial(): Progress { return progress; }
export function currentStep(): TutorialStep | null {
  if (progress.done) return null;
  return TUTORIAL_STEPS.find((t) => t.id === progress.step) ?? null;
}

export function advanceTutorial(): void {
  if (progress.done) return;
  const next = progress.step + 1;
  progress = next > TUTORIAL_STEPS.length ? { step: TUTORIAL_STEPS.length, done: true } : { step: next, done: false };
  write();
  emit();
}

export function skipTutorial(): void {
  progress = { step: TUTORIAL_STEPS.length, done: true };
  write();
  emit();
}

/** 새 게임을 시작할 때 처음부터 */
export function resetTutorial(): void {
  progress = { step: 1, done: false };
  write();
  emit();
}

/** 상태를 보고 현재 단계 조건이 찼으면 넘긴다. 여러 단계가 한꺼번에 차 있으면 연달아 넘긴다. */
export function checkTutorial(s: GameState): void {
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const step = currentStep();
    if (!step?.done || !step.done(s)) return;
    advanceTutorial();
  }
}

export function useTutorial(): Progress {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => version);
  return progress;
}

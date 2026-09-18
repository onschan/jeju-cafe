/**
 * 손으로 하는 튜토리얼 9단계 (§7.2). 진행은 sim 상태(state.tutorial.step = 끝낸 단계 수)에 있어 저장·복원되고 결정적이다.
 * 각 단계의 done 조건은 sim 상태만 본다 (창을 열었다 같은 UI 사건 없음). 대사는 data/dialogue/tutorial.json(UI가 띄운다).
 * 단계를 끝내면 applyRewards(보상 상자) → step++. 다음 단계 대사는 UI(tutorialDialogue.ts)가 alerts가 비면 띄운다.
 * 건너뛰기(첫 단계에서만): skipTutorial 액션 → fillStarterLayout(완성 시작 상태) + step = 9.
 *
 * | # | 조건                                        | 하이라이트(data-tut / 맵 칸)                | 보상                 |
 * |---|---------------------------------------------|---------------------------------------------|----------------------|
 * | 1 | 정낭→문 올렛길 (isDoorReachable 본관)        | nav:build → tab:path → 정낭·문 앞 칸        | ₩30만                |
 * | 2 | 테이블 1개 전망 2 이상 자리 (TODO x-site)    | nav:build → tab:rest → 길 옆 빈 칸 3개      | ₩30만 + 입지 보기    |
 * | 3 | 메뉴판에 아메리카노·감귤주스                 | nav:cafe → tab:menu → menu-put              | ₩20만                |
 * | 4 | 첫 결제 (totalIncome > 0)                    | 정류장 칸                                   | 응모권 1             |
 * | 5 | 직원 1명 채용                                | nav:people → tab:candidates → hire          | ₩30만                |
 * | 6 | 돌담을 테이블 북서쪽에 (windShelter 벽)      | nav:build → tab:wall → 테이블 북서 칸       | ₩30만 + 콤보 도감 + 홍보 열림 + 연구 10 |
 * | 7 | 홍보 1회                                     | nav:cafe → tab:promo → promote              | 마일리지 30          |
 * | 8 | 도전 과제 1개 수락                           | goal-bar → tab:challenge → challenge-accept      | ₩50만                |
 * | 9 | 첫 월말 결산 닫기                            | —                                           | 명소 지도            |
 */
import type { GameState, GoalReward, Pt } from './types.ts';
import { objectDef } from '../data/index.ts';
import { isDoorReachable, busStopPos } from './path.ts';
import { doorFrontOf, objectAt, cellAt } from './grid.ts';
import { applyRewards } from './goals.ts';

export const TUTORIAL_STEPS = 9;

export interface TutorialStepDef {
  id: number;
  key: string;
  done: (s: GameState) => boolean;
  reward: GoalReward[];
  /** 하이라이트할 DOM 타깃(data-tut 값, 열린 창에 따라 있는 것만 빛난다) */
  targets: string[];
  /** 하이라이트할 맵 칸 */
  cells: (s: GameState) => Pt[];
}

function mainBuilding(s: GameState) {
  return Object.values(s.objects).find((o) => o.type === 'warehouse') ?? null;
}
function seats(s: GameState) {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
}
function gate(s: GameState) {
  return Object.values(s.objects).find((o) => o.type === 'gate') ?? null;
}
/** 정낭에서 본관 문까지 올렛길이 이어졌나 */
export function pathConnected(s: GameState): boolean {
  const b = mainBuilding(s);
  return b ? isDoorReachable(s, b) : false;
}
/** 전망 2 이상 자리에 테이블이 있나. TODO(x-site): siteOf(s, o.x, o.y).view >= 2 로 교체 */
export function seatWithView(s: GameState, _view: number): boolean {
  return seats(s).length >= 1;
}
/** 테이블 북서쪽 대각 띠에 돌담이 있나 (grid.ts windShelter와 같은 띠) */
export function wallShelteringSeat(s: GameState): boolean {
  for (const seat of seats(s)) {
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const o = objectAt(s, seat.x - dx, seat.y - dy);
      if (o && objectDef(o.type).kind === 'wall') return true;
    }
  }
  return false;
}
/** 첫 월말 결산을 닫았나 (월말이 한 번 지났고(goals.ts observeMonth가 센 흑자/적자 달) 월말 카드가 닫혀 있다) */
export function firstMonthClosed(s: GameState): boolean {
  return s.stats.profitMonths + s.stats.lossMonths >= 1 && s.lastMonthCard === null;
}

/** 길 옆 빈 흙 칸 (전망 좌석 안내용, 최대 n개). TODO(x-site): view ≥ 2 칸으로 교체 */
function emptyCellsNearPath(s: GameState, n: number): Pt[] {
  const out: Pt[] = [];
  const paths = Object.values(s.objects).filter((o) => o.type === 'path');
  for (const p of paths) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) continue;
      const c = cellAt(s, x, y);
      if (c.terrain !== 'soil' || c.objectId || out.some((q) => q.x === x && q.y === y)) continue;
      out.push({ x, y });
      if (out.length >= n) return out;
    }
  }
  return out;
}

export const STEPS: TutorialStepDef[] = [
  { id: 1, key: 'path', done: pathConnected, reward: [{ type: 'money', amount: 300_000 }], targets: ['nav:build', 'tab:path'],
    cells: (s) => { const b = mainBuilding(s); const g = gate(s); return [...(g ? [{ x: g.x, y: g.y }] : []), ...(b ? [doorFrontOf(b)] : [])]; } },
  { id: 2, key: 'seat_view', done: (s) => seatWithView(s, 2), reward: [{ type: 'money', amount: 300_000 }, { type: 'unlockFeature', id: 'siteView' }], targets: ['nav:build', 'tab:rest'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 3, key: 'menu', done: (s) => s.menuSlots.includes('americano') && s.menuSlots.includes('tangerine_juice'), reward: [{ type: 'money', amount: 200_000 }], targets: ['nav:cafe', 'tab:menu', 'menu-put'], cells: () => [] },
  { id: 4, key: 'first_pay', done: (s) => s.totalIncome > 0, reward: [{ type: 'tickets', n: 1 }], targets: [], cells: (s) => [busStopPos(s)] },
  { id: 5, key: 'hire', done: (s) => s.staff.length >= 1, reward: [{ type: 'money', amount: 300_000 }], targets: ['nav:people', 'tab:candidates', 'hire'], cells: () => [] },
  // 7단계(홍보)를 바로 할 수 있게 홍보 기능과 전단 연구비(10)를 여기서 준다 — g07(만족 손님 10명)보다 튜토리얼이 먼저 온다
  { id: 6, key: 'wall', done: wallShelteringSeat, reward: [{ type: 'money', amount: 300_000 }, { type: 'unlockFeature', id: 'comboCodex' }, { type: 'unlockFeature', id: 'promote' }, { type: 'research', n: 10 }], targets: ['nav:build', 'tab:wall'],
    cells: (s) => seats(s).map((o) => ({ x: o.x - 1, y: o.y - 1 })).filter((p) => p.x >= 0 && p.y >= 0 && !cellAt(s, p.x, p.y).objectId) },
  { id: 7, key: 'promote', done: (s) => s.stats.promotionsDone >= 1, reward: [{ type: 'mileage', n: 30 }], targets: ['nav:cafe', 'tab:promo', 'promote'], cells: () => [] },
  { id: 8, key: 'challenge', done: (s) => s.challenges.active.length + s.challenges.done.length >= 1, reward: [{ type: 'money', amount: 500_000 }], targets: ['goal-bar', 'tab:challenge', 'challenge-accept'], cells: () => [] },
  { id: 9, key: 'month_end', done: firstMonthClosed, reward: [{ type: 'unlockFeature', id: 'spotMap' }], targets: [], cells: () => [] },
];

export function initTutorial(skipped = false): GameState['tutorial'] {
  return { step: skipped ? TUTORIAL_STEPS : 0, skipped };
}
export function tutorialDone(state: GameState): boolean {
  return state.tutorial.step >= TUTORIAL_STEPS;
}
/** 지금 하고 있는 단계 (끝났으면 null) */
export function currentTutorialStep(state: GameState): TutorialStepDef | null {
  return tutorialDone(state) ? null : STEPS[state.tutorial.step] ?? null;
}

/** 현재 단계가 끝났으면 보상(보상 상자 알림)을 주고 step++. 한 번에 한 단계. 끝낸 단계 id 또는 null. */
export function checkTutorial(state: GameState): number | null {
  const step = currentTutorialStep(state);
  if (!step || !step.done(state)) return null;
  state.tutorial.step++;
  applyRewards(state, step.reward, { source: 'tutorial', refId: String(step.id), title: `튜토리얼 ${step.id}단계` });
  return step.id;
}

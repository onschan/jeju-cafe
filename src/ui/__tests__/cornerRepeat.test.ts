/**
 * 명당 튜토리얼 반복 회귀 (cfix): 「지어지는 동안 튜토리얼이 성공이 안 되고 반복한다」.
 *
 * 벤치가 1일 공사 중인 그 순간에 — 마지막 조각을 놓자마자 —
 *  ① 튜토리얼 5단계가 done이고 (대사를 봤으면 바로 통과한다),
 *  ② 글로우·짓기 타깃이 「하나 더」를 가리키지 않고,
 *  ③ 오늘 할 일·할 일 창·진단·짓기 창 명당 탭 어디도 「명당 한 곳 더」로 읽히지 않는다
 *     (보상이 걸린 줄은 완공 기준을 지키되 「짓는 중 1」이 붙는다).
 * 전부 문자열 생성 함수만 부른다 — 결정적이고 렌더링이 필요 없다.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../sim/state.ts';
import { apply } from '../../sim/actions.ts';
import { tick, STEP_MS } from '../../sim/tick.ts';
import { DAY_MS } from '../../sim/clock.ts';
import { at } from '../../sim/__tests__/helpers.ts';
import {
  cornerMade, cornerMissingKind, cornerCells, currentTutorialStep, nextTutorialStep, checkTutorial as simCheckTutorial,
  CORNER_PIECE_TYPES, CORNER_PIECE_KINDS,
} from '../../sim/tutorial.ts';
import { cornersBuilding, cornersDoneIncludingWork, completedCorners, cornerProgress, pendingCorners } from '../../sim/corners.ts';
import { gradeProgress } from '../../sim/grade.ts';
import { todoRows } from '../../sim/todo.ts';
import { diagnose } from '../../sim/coach.ts';
import { todoItems } from '../TodoLine.tsx';
import { cornerMissingText } from '../windows/CornerTab.tsx';
import { cornerPart, CORNER_FULL, PART_MAX } from '../layoutScore.ts';
import type { GameState } from '../../sim/types.ts';

/** 2막 5단계(첫 명당)를 하고 있는 상태 — 4단계까지 끝냈고 대사도 봤다 */
function step5State(): GameState {
  const s = createInitialState(1, 'local', 0, 'tutorial');
  s.money = 1e8;
  // 2막 트리거: 좌석 2개 + 첫 결제
  expect(apply(s, { type: 'place', objectType: 'table_out', ...at(2, 4) }).ok).toBe(true);
  expect(apply(s, { type: 'place', objectType: 'table_out', ...at(2, 5) }).ok).toBe(true);
  s.menuSold.americano = 1;
  s.tutorial.step = 4; // 1~4단계 끝
  s.tutorial.seen = ['act:1', 'dlg:1', 'dlg:2', 'dlg:3', 'guestCard', 'act:2', 'siteView', 'dlg:4', 'dlg:5'];
  s.tutorial.lastDay = -5; // 단계 사이 하루 간격은 지난 것으로
  return s;
}
/** 꽃길 세 조각을 붙여 놓는다 — 가운데 벤치는 1일 공사 */
function placeFlowerPath(s: GameState) {
  const [flower, bench, light] = CORNER_PIECE_TYPES as [string, string, string];
  expect(apply(s, { type: 'place', objectType: flower, ...at(1, 1) }).ok).toBe(true);
  expect(apply(s, { type: 'place', objectType: bench, ...at(2, 1) }).ok).toBe(true);
  expect(apply(s, { type: 'place', objectType: light, ...at(1, 2) }).ok).toBe(true);
}
const allText = (s: GameState): string[] => [
  ...todoItems(s).map((i) => i.text),
  ...todoRows(s).flatMap((r) => [r.title, r.how]),
  ...diagnose(s).lines,
  diagnose(s).bottleneck.text,
  ...diagnose(s).evidence.map((e) => `${e.label} ${e.value}`),
  ...cornerProgress(s).map(cornerMissingText),
];

describe('명당 튜토리얼 반복 (cfix)', () => {
  it('마지막 조각이 공사 중이어도 5단계는 done이고, 대사를 본 뒤엔 바로 통과한다', () => {
    const s = step5State();
    expect(currentTutorialStep(s)?.id).toBe(5);
    expect(cornerMade(s)).toBe(false);
    placeFlowerPath(s);
    // 아직 완공 전이다 — 그래도 「다 모았다」로 본다
    expect(completedCorners(s)).toEqual([]);
    expect(cornersBuilding(s)).toBe(1);
    expect(cornersDoneIncludingWork(s)).toBe(1);
    expect(cornerMade(s)).toBe(true);
    // 조건 + 대사(dlg:5)가 다 찼으니 마지막 조각을 놓은 그 액션에서 바로 끝난다 (apply → checkGoals → checkTutorial)
    expect(s.tutorial.step).toBe(5);
    expect(nextTutorialStep(s)?.id).toBe(6);
    expect(simCheckTutorial(s)).toBeNull(); // 더 끝낼 단계가 없다 (6단계는 하루 뒤)
  });

  it('5단계가 끝난 뒤 같은 대사가 다시 차례에 오르지 않는다 (공사가 끝나도)', () => {
    const s = step5State();
    placeFlowerPath(s);
    expect(s.tutorial.step).toBe(5);
    // 공사가 끝날 때까지 돌려도 5단계가 다시 현재 단계가 되지 않는다
    let ms = 0;
    while (Object.values(s.objects).some((o) => o.build) && ms < 3 * DAY_MS) { tick(s, STEP_MS); ms += STEP_MS; }
    expect(completedCorners(s).map((c) => c.id)).toContain('corner_flower_path');
    expect(nextTutorialStep(s)?.id).not.toBe(5);
    expect(simCheckTutorial(s)).not.toBe(5);
  });

  it('조각을 다 모으면 글로우·짓기 타깃이 「하나 더」를 가리키지 않는다', () => {
    const s = step5State();
    expect(cornerMissingKind(s)).toBe(CORNER_PIECE_KINDS[0]);
    expect(cornerCells(s).length).toBe(1);
    placeFlowerPath(s);
    expect(cornerMissingKind(s)).toBeNull(); // 공사 중이어도 빠진 조각은 없다
    expect(cornerCells(s)).toEqual([]);
  });

  it('조각은 시설 id가 아니라 종류로 본다 — 정원등 대신 가로등을 놓아도 「불빛 하나 더」를 되풀이하지 않는다', () => {
    const s = step5State();
    const [flower, bench] = CORNER_PIECE_TYPES as [string, string, string];
    expect(apply(s, { type: 'place', objectType: flower, ...at(1, 1) }).ok).toBe(true);
    expect(apply(s, { type: 'place', objectType: bench, ...at(2, 1) }).ok).toBe(true);
    expect(cornerMissingKind(s)).toBe('light');
    // 「불빛」 트리의 다른 단계(가로등)를 놓아도 같은 조각이다
    expect(apply(s, { type: 'place', objectType: 'streetlight', ...at(1, 2) }).ok).toBe(true);
    expect(cornerMissingKind(s)).toBeNull();
    expect(cornerMade(s)).toBe(true);
  });

  it('마지막 조각을 놓는 순간 반투명 팻말과 「내일이면 꽃길 완성」 메시지가 뜬다', () => {
    const s = step5State();
    s.notices = [];
    placeFlowerPath(s);
    // 반투명 팻말의 근거: 곧 완성될 명당 목록에 닻 좌표가 들어 있다 (render/GameView syncCornerSigns)
    const soon = pendingCorners(s);
    expect(soon.map((c) => c.id)).toEqual(['corner_flower_path']);
    expect(s.objects[soon[0]!.anchorId]).toBeTruthy();
    expect(s.cornerSoon).toEqual(['corner_flower_path']);
    expect(s.notices.some((n) => n === '내일이면 꽃길 완성')).toBe(true);
    // 알림은 한 번만 — 다음 판정에서 다시 쌓이지 않는다
    const before = s.notices.length;
    tick(s, STEP_MS);
    expect(s.notices.filter((n) => n === '내일이면 꽃길 완성').length).toBe(1);
    expect(s.notices.length).toBeGreaterThanOrEqual(before - 1);
  });

  it('오늘 할 일·할 일 창·진단·짓기 창 명당 탭이 「명당 한 곳 더」로 읽히지 않는다', () => {
    const s = step5State();
    placeFlowerPath(s);
    // 짓기 창 명당 탭: 꽃길 줄은 「조각은 다 모였다」
    const fp = cornerProgress(s).find((p) => p.def.id === 'corner_flower_path')!;
    expect(fp.building).toBe(true);
    expect(cornerMissingText(fp)).toBe('조각은 다 모였다 — 내일이면 완성');
    // 진단: 명당 줄은 「짓는 중 1」
    const d = diagnose(s);
    expect(d.evidence.find((e) => e.label === '명당')?.value).toContain('짓는 중 1');
    // 등급 승급(보상)은 완공 기준을 지키되 짓는 중 수를 들고 있다
    const grade = gradeProgress(s, 2)!;
    const cornerRow = grade.find((r) => r.key === 'corners')!;
    expect(cornerRow.cur).toBe(0);
    expect(cornerRow.building).toBe(1);
    const gradeRow = todoRows(s).find((r) => r.kind === 'grade');
    if (gradeRow && gradeRow.how.startsWith('명당')) expect(gradeRow.how).toContain('짓는 중 1');
    // 어느 줄도 「명당을 하나 만들라」는 안내를 짓는 중 표시 없이 남기지 않는다
    for (const t of allText(s)) {
      if (/명당/.test(t) && /(하나|한 곳|1개|더)/.test(t)) expect(t, t).toMatch(/짓는 중|다 모였다|완성/);
    }
    // 배치 점수 명당 성분도 공사 중을 센다
    expect(cornerPart(s)).toBeCloseTo((1 / CORNER_FULL) * PART_MAX.corner, 5);
  });
});

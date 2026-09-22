import { noteBlockedClick, resetBlockedHint, BLOCKED_HINT, BLOCKED_DOUBLE_TAP_MS } from '../tutorialHighlight.ts';
import { getMessages, clearMessages } from '../store.ts';

beforeEach(() => { clearMessages(); resetBlockedHint(); });

test('스포트라이트 차단 중 셸을 두 번 연속 탭하면 「튜토리얼 밖 조작은 📖에서 끌 수 있어요」를 세션에 한 번만 (ease)', () => {
  expect(noteBlockedClick(1000)).toBe(false); // 첫 탭
  expect(noteBlockedClick(1000 + BLOCKED_DOUBLE_TAP_MS + 1)).toBe(false); // 너무 늦은 두 번째
  expect(noteBlockedClick(1000 + BLOCKED_DOUBLE_TAP_MS + 500)).toBe(true); // 연속 두 번
  expect(getMessages()[0]!.text).toBe(BLOCKED_HINT);
  expect(noteBlockedClick(1000 + BLOCKED_DOUBLE_TAP_MS + 800)).toBe(false); // 한 번만
  expect(getMessages()).toHaveLength(1);
});

test('fix-indoor: 맵 칸이 빛나는 튜토리얼 단계는 전부 칸 라벨 문구가 있고, 튜토리얼이 끝나면 칸·라벨이 비어 글로우가 남지 않는다', async () => {
  const { CELL_LABEL, tutorialTargets } = await import('../tutorialHighlight.ts');
  const { STEPS, TUTORIAL_STEPS } = await import('../../sim/tutorial.ts');
  const { createInitialState } = await import('../../sim/state.ts');
  const s = createInitialState(1, 'local', 0, 'tutorial');
  const none = () => [];
  for (const st of STEPS) {
    if (st.cells.toString() === none.toString()) continue; // cells: none
    expect(CELL_LABEL[st.key], `${st.id} ${st.key}`).toBeTruthy();
    expect(CELL_LABEL[st.key]!.length).toBeLessThanOrEqual(22);
  }
  // 1단계 테이블: 입지 최고 칸 1개 글로우 + 「이 자리가 좋아 보인다」
  const t = tutorialTargets(s);
  expect(t.cells.length).toBeGreaterThan(0);
  expect(t.label).toBe(CELL_LABEL['seat']);
  s.tutorial.step = TUTORIAL_STEPS;
  expect(tutorialTargets(s)).toEqual({ targets: [], cells: [], label: '' });
});

test('추천 칸은 시설 발자국(w×h) 전체가 빛난다 — 2×3 주차장 추천 3곳이면 18칸, 회전은 발자국을 안 바꾼다', async () => {
  const { expandFootprints, tutorialTargets, setGuideFocus } = await import('../tutorialHighlight.ts');
  const { createInitialState } = await import('../../sim/state.ts');
  const { objectDef } = await import('../../data/index.ts');
  const { ROTATABLE_TYPES } = await import('../../sim/actions.ts');
  const { sizeOf } = await import('../../sim/grid.ts');
  const { solverKey } = await import('../../sim/solverCache.ts');
  const d = objectDef('parking_lot');
  expect(d.w * d.h).toBeGreaterThan(1);
  const origins = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 10, y: 20 }];
  const cells = expandFootprints(origins, ['nav:build', 'tab:convenience', 'build:parking_lot']);
  expect(cells).toHaveLength(origins.length * d.w * d.h);
  for (const o of origins) for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) expect(cells).toContainEqual({ x: o.x + dx, y: o.y + dy });
  expect(expandFootprints(origins, ['goal-bar'])).toEqual(origins); // 시설 타깃이 없으면 그대로
  expect(expandFootprints([{ x: 1, y: 1 }, { x: 2, y: 1 }], ['build:parking_lot']).length).toBeLessThan(2 * d.w * d.h); // 겹치는 칸은 한 번만
  for (const t of ROTATABLE_TYPES) { try { objectDef(t); } catch { continue; } expect(sizeOf({ type: t, rot: 1 } as never)).toEqual({ w: objectDef(t).w, h: objectDef(t).h }); } // 회전(rot)은 그림만 돌리고 발자국은 그대로
  // solver 추천 포커스도 발자국으로 넓힌다
  const s = createInitialState(1, 'local', 0, 'tutorial');
  setGuideFocus({ key: solverKey(s), targets: ['nav:build', 'build:parking_lot'], cells: [{ x: 5, y: 5 }], label: '주차장' });
  expect(tutorialTargets(s).cells).toHaveLength(d.w * d.h);
  setGuideFocus(null);
});

test('solver: 추천 행동 포커스(setGuideFocus)는 같은 상태 키에서만 타깃·칸을 덮어쓰고(어둠 없이 guide 표식), 키가 바뀌면 튜토리얼 단계 타깃으로 돌아간다. 대사엔 「시뮬」 줄이 안 끼워진다', async () => {
  const { tutorialTargets, setGuideFocus } = await import('../tutorialHighlight.ts');
  const { fillTutorialStep, TUTORIAL_DIALOGUES } = await import('../tutorialDialogue.ts');
  const { createInitialState } = await import('../../sim/state.ts');
  const { solverKey, setSolverResult } = await import('../../sim/solverCache.ts');
  const s = createInitialState(1, 'local', 0, 'tutorial');
  const seat = { x: 12, y: 10 };
  const move = { action: { type: 'place' as const, objectType: 'table_out', x: seat.x, y: seat.y }, score: 420_000, delta: { money: 420_000, reputation: 0, goals: 0 }, why: '14일 뒤 자금 +₩42만, 2위보다 ₩9만 더', label: '야외 테이블 (12,10)', cells: [seat], targets: ['nav:build', 'tab:rest', 'build:table_out'], horizon: 14 };
  setSolverResult({ key: solverKey(s), moves: [move], horizon: 14, rollouts: 10, ms: 1 });
  const step1 = TUTORIAL_DIALOGUES[0]!;
  const filled = fillTutorialStep(step1, s);
  expect(filled.lines).toHaveLength(step1.lines.length);
  for (const l of filled.lines) expect(l).not.toMatch(/시뮬|정석|→ 지금|굴려 보니|\{[a-zA-Z]+\}/);
  setGuideFocus({ key: solverKey(s), targets: move.targets, cells: move.cells, label: '야외 테이블 · +₩42만' });
  const t = tutorialTargets(s);
  expect(t.guide).toBe(true);
  expect(t.cells).toEqual([seat]);
  expect(t.targets).toEqual(move.targets);
  s.money += 1_000_000;
  const t2 = tutorialTargets(s);
  expect(t2.guide).toBeUndefined();
  expect(t2.targets).toEqual(['nav:build', 'tile:seat', 'tab:rest', 'build:table_out', 'build-go']); // fun: 짓기 6타일
  setGuideFocus(null);
  setSolverResult(null);
});

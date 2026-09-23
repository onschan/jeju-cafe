import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, strategyVars, fillTemplate, heuristicNextMove, nextMove } from '../../sim/index.ts';
import { GOALS } from '../../data/index.ts';
import { TUTORIAL_STEPS, INTRO_CUTS, FIRST_TIPS } from '../../data/dialogue/index.ts';
import { idleHint } from '../../sim/hints.ts';
import { CELL_LABEL, CELL_LABEL_DEFAULT, BLOCKED_HINT } from '../tutorialHighlight.ts';
import { LOOK_TEXT } from '../../sim/tutorial.ts';
import { NO_MOVE_TEXT, SOLVER_BUSY_TEXT, SOLVER_SAVE_TEXT, RECOMMEND_TITLE } from '../TutorialWindow';
import { SKIP_TEXT } from '../tutorialDialogue';
import { TIPS } from '../firstTip';
import { apply } from '../../sim/actions.ts';

/** 문구 규칙 §6 (fun-start): 튜토리얼·팁·인트로·목표·도전·힌트·추천 문구에 「→ 지금:」·「정석」·「시뮬」·「공략」·「n일 굴려 보니」 같은 지시문·상투구가 없다. 한 줄 ≤ 22자(튜토리얼·팁·인트로). */
const FORBIDDEN = /→ 지금|정석|시뮬|공략|굴려 보니|→/;
const SRC = resolve(__dirname, '../..');
/** 소스 파일의 문자열 리터럴만 본다 — 주석은 뺀다 */
function stringLiterals(rel: string): string[] {
  const code = readFileSync(resolve(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"`])\/\/[^'"`\n]*$/gm, '$1');
  const out: string[] = [];
  for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) out.push(m[1] ?? m[2] ?? m[3] ?? '');
  return out;
}
function expectClean(texts: string[], where: string) {
  const bad = texts.filter((t) => FORBIDDEN.test(t));
  expect(bad, `${where}: ${bad.slice(0, 5).join(' | ')}`).toEqual([]);
}

describe('문구 규칙 §6: 지시문·화살표·정석·시뮬 없음', () => {
  const s = createInitialState(1, 'local', 0, 'tutorial');
  const vars = strategyVars(s);

  it('튜토리얼 7단계 대사·제목·버튼·할 일 (토큰을 채운 뒤), 한 줄 ≤ 22자', () => {
    const texts = TUTORIAL_STEPS.flatMap((t) => [t.title, ...t.lines, t.button, t.done ?? ''].map((l) => fillTemplate(l, vars)));
    expectClean(texts, '튜토리얼');
    for (const t of TUTORIAL_STEPS) for (const l of t.lines) expect(fillTemplate(l, vars).length, l).toBeLessThanOrEqual(22);
  });
  it('첫 열기 팁 15, 한 줄 ≤ 22자, 창·탭 키가 실제 창 이름을 따른다', () => {
    const keys = Object.keys(FIRST_TIPS);
    expect(keys.length).toBe(15); // ui3: 숏컷 팁 3개(radial·doubleTap·barLongPress)
    expectClean(Object.values(FIRST_TIPS), '팁');
    for (const [k, v] of Object.entries(FIRST_TIPS)) { expect(v.length, k).toBeLessThanOrEqual(22); expect(v.length, k).toBeGreaterThan(0); }
    for (const k of ['build', 'cafe:menu', 'people:staff', 'ledger:spots', 'goal', 'siteView', 'build:parking_lot', 'radial', 'doubleTap', 'barLongPress']) expect(TIPS[k], k).toBeTruthy();
  });
  it('인트로 11컷 자막: 1인칭 상황, 금지어 없음', () => {
    expectClean(INTRO_CUTS.flatMap((c) => [c.caption, ...c.lines]), '인트로');
    expect(INTRO_CUTS[9]!.speaker).toBe('halmang');
    expect(INTRO_CUTS[9]!.lines.join(' ')).toContain('창고');
  });
  it('목표 title/desc 문구', () => {
    expectClean(GOALS.flatMap((g) => [g.title, g.desc, g.line ?? '']), '목표');
  });
  it('힌트·추천·다음 수·칸 라벨·창 문구 (실제 상태로 만든 문자열)', () => {
    const texts: string[] = [...Object.values(CELL_LABEL), CELL_LABEL_DEFAULT, BLOCKED_HINT, ...Object.values(LOOK_TEXT), NO_MOVE_TEXT, SOLVER_BUSY_TEXT, SOLVER_SAVE_TEXT, RECOMMEND_TITLE, SKIP_TEXT];
    // 다음 수를 상태를 바꿔 가며 여러 개 뽑는다
    const t = createInitialState(1, 'local', 0, 'bare');
    for (let i = 0; i < 20; i++) {
      const m = heuristicNextMove(t);
      if (!m) break;
      texts.push(m.text);
      if (m.cells[0] && !Object.values(t.objects).some((o) => o.type === 'warehouse')) { apply(t, { type: 'placeMain', ...m.cells[0] }); continue; }
      break;
    }
    const st = createInitialState(1);
    for (const x of [s, st]) { const m = nextMove(x); if (m) texts.push(m.text); const h = idleHint(x); if (h) texts.push(h); }
    for (const x of [createInitialState(2), createInitialState(3)]) { x.money = 50_000_000; const m = heuristicNextMove(x); if (m) texts.push(m.text); }
    expectClean(texts, '힌트·추천');
  });
  it('소스 파일의 문자열 리터럴(주석 제외): hints.ts·strategy.ts·solver.ts·TutorialWindow·tutorialHighlight·tutorialDialogue·firstTip', () => {
    for (const f of ['sim/hints.ts', 'sim/strategy.ts', 'sim/solver.ts', 'ui/TutorialWindow.tsx', 'ui/tutorialHighlight.ts', 'ui/tutorialDialogue.ts', 'ui/firstTip.ts', 'ui/GoalBar.tsx']) expectClean(stringLiterals(f), f);
  });
  it('알림판: JSX 사이에 낀 화살표도 없다 (문자열이 아니라 화면에 그대로 보인다)', () => {
    // big 통합: BoardPanel의 「조건 → 보상」 줄이 문자열 리터럴이 아니라 JSX 텍스트라 위 검사를 빠져나갔다.
    const code = readFileSync(resolve(SRC, 'ui/BoardPanel.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.includes('\u2192'), 'BoardPanel.tsx에 화살표가 남아 있다').toBe(false);
  });
});

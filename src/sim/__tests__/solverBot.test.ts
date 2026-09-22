/**
 * solver 봇 (bot.ts policy 'solver'): 정석 지식 없이 며칠마다 solver.bestMoves 1위 수만 실행한다.
 * 3년 비교(휴리스틱 봇 대비 자금·목표)는 몇 분이 걸려 SOLVER_BOT=1일 때만 돈다 — 표는 docs/superpowers/plans/2026-09-22-solver.md.
 * 밸런스 밴드(balance.test.ts)는 휴리스틱 봇 기준 그대로.
 */
import { runBot } from '../bot.ts';

const FULL = !!process.env.SOLVER_BOT;

test('solver 봇 1달: 결정적(같은 seed → 같은 행), 파산 없음, 저축보다 나은 수를 실제로 한다(자산·직원이 는다)', () => {
  const a = runBot(1 / 12, 1, 'solver');
  const b = runBot(1 / 12, 1, 'solver');
  expect(a).toEqual(b);
  expect(a).toHaveLength(1);
  const row = a[0]!;
  expect(row.minMoney).toBeGreaterThan(0);
  expect(row.staff + row.guests).toBeGreaterThan(0);
  expect(row.guests).toBeGreaterThan(100); // 자리·메뉴를 갖춰 손님이 온다
}, 60_000);

describe.skipIf(!FULL)('solver 봇 3년 vs 휴리스틱 봇 (SOLVER_BOT=1)', () => {
  test('seed 1: 3년차 말 자금이 휴리스틱 봇 이상', () => {
    const h = runBot(3, 1, 'heuristic').filter((r) => r.year <= 3).at(-1)!;
    const s = runBot(3, 1, 'solver').filter((r) => r.year <= 3).at(-1)!;
    // eslint-disable-next-line no-console
    console.log(`heuristic money ${h.money} goals ${h.goals} · solver money ${s.money} goals ${s.goals}`);
    expect(s.money).toBeGreaterThanOrEqual(h.money);
    expect(s.minMoney).toBeGreaterThan(0);
  }, 900_000);
});

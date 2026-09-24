/**
 * 삼춘 힌트 (game-feel 감사 P0: 튜토리얼 뒤 「할 일 없음」 구간).
 * 플레이어가 IDLE_DAYS일 동안 아무 액션도 안 했으면 매일 아침 지금 가장 값진 다음 행동을 메시지 줄로 한 줄 짚어 준다 (IDLE_REPEAT_DAYS마다 한 번).
 * 상태를 새로 두지 않는다 — actionLog 마지막 항목의 tick으로 쉰 날수를 센다 (dismiss류·setSpeed는 로그에 없다). 튜토리얼이 끝난 뒤에만.
 */
import type { GameState } from './types.ts';
import { STEP_MS } from './tick.ts';
import { DAY_MS } from './clock.ts';
import { pushNotice } from './staff.ts';
import { currentGoal } from './goals.ts';
import { TUTORIAL_STEPS } from './tutorial.ts';
import { objectDef } from '../data/index.ts';
import { nextMove } from './strategy.ts';

export const IDLE_DAYS = 3;
export const IDLE_REPEAT_DAYS = 5;

/** 마지막 액션 뒤 지난 게임 일수 (액션이 없었으면 게임 시작부터) */
export function idleDays(state: GameState): number {
  const last = state.actionLog[state.actionLog.length - 1]?.tick ?? 0;
  return Math.round(((state.tick - last) * STEP_MS) / DAY_MS); // 새 날 처리는 그날의 마지막 스텝 직전에 돌아 floor면 하루가 모자란다
}

/** 지금 가장 값진 다음 행동 한 줄 (없으면 null). 도전 다음엔 solver의 다음 수(strategy.nextMove — 추천 탭 「할망의 추천」과 같은 수).
 *  solver 결과(롤아웃)가 캐시에 있으면 그 1위 수를 예상 수치와 함께("할망: 야외 테이블 (12,9) — 14일 뒤 자금 +₩42만"), 없으면 1년차 표의 다음 수. 문구 규칙 §6: 지시문·화살표 없이 이유 한 줄. */
export function idleHint(state: GameState): string | null {
  const move = nextMove(state);
  if (move) return `할망: ${move.text}`;
  const unbuilt = state.unlocked.objects.filter((t) => objectDef(t).cost > 0 && !Object.values(state.objects).some((o) => o.type === t));
  if (unbuilt.length >= 3 && state.money >= 2_000_000) return `할망: 새로 열린 시설이 ${unbuilt.length}개나 됐져. 돈도 있으니 마당을 꾸며 보라`;
  const g = currentGoal(state);
  if (g) return `할망: 다음 목표는 「${g.title}」 — ${g.desc}`;
  return null;
}

/** 매일 아침: 쉰 지 IDLE_DAYS일째·그 뒤 IDLE_REPEAT_DAYS마다 힌트 */
export function dailyIdleHint(state: GameState): void {
  if (state.tutorial.step < TUTORIAL_STEPS) return;
  const d = idleDays(state);
  if (d < IDLE_DAYS || (d - IDLE_DAYS) % IDLE_REPEAT_DAYS !== 0) return;
  const h = idleHint(state);
  if (h) pushNotice(state, h);
}

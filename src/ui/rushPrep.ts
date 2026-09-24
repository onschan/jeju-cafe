/**
 * 러시 준비·성적 읽기 (rush-battle §6).
 *   - 금요일 예고의 **준비 체크리스트** (빈 자리 n · 직원 n · 재료)
 *   - 「오늘 할 일」이 러시 주에 앞세울 항목
 *   - 진단 카드의 **러시 성적 분석** 한 줄 (「줄이 길어 3명 놓쳤어요」 + 「자리 2개 또는 홀 직원」)
 * 계산은 전부 읽기 전용이다 — sim 상태를 바꾸지 않는다.
 */
import type { GameState } from '../sim/index.ts';
import { availableMenus, freeSeats, totalSeats } from '../sim/index.ts';
import { lastRushResult, queueSizeFor, hasRushSkill, weekdayOf, type RushResult } from './rushBridge';

export interface PrepItem {
  key: 'seat' | 'staff' | 'ingredient';
  /** 한 줄 (≤ 22자) */
  text: string;
  /** 준비가 됐나 */
  ok: boolean;
  /** 탭하면 빛낼 UI 타깃 */
  targets: string[];
}

/** 러시에 필요한 빈 자리 (줄 길이의 절반은 앉힐 수 있어야 한다) */
export function seatsWanted(s: GameState): number {
  return Math.max(2, Math.ceil(queueSizeFor(s) / 2));
}
/** 스킬을 쓸 수 있는 직원 수 */
export function skillStaffCount(s: GameState): number {
  return s.staff.filter((w) => !w.training && hasRushSkill(w.role)).length;
}

/** 준비 체크리스트 3줄 */
export function rushPrepItems(s: GameState): PrepItem[] {
  const free = freeSeats(s).length;
  const want = seatsWanted(s);
  const staff = skillStaffCount(s);
  const menus = s.menuSlots.filter((m) => m !== null).length;
  const ready = availableMenus(s).length;
  return [
    { key: 'seat', text: `빈 자리 ${free}개 · ${want}개는 있어야 해요`, ok: free >= want, targets: ['nav:build'] },
    { key: 'staff', text: staff > 0 ? `스킬 쓸 직원 ${staff}명` : '스킬 쓸 직원이 없어요', ok: staff > 0, targets: ['nav:people'] },
    { key: 'ingredient', text: ready >= menus && menus > 0 ? `메뉴 ${ready}개 다 나가요` : `재료가 떨어진 메뉴 ${Math.max(0, menus - ready)}개`, ok: ready >= menus && menus > 0, targets: ['nav:cafe'] },
  ];
}

/** 아직 못 채운 준비 (오늘 할 일에 앞세울 것) */
export function rushPrepTodo(s: GameState): PrepItem[] {
  return rushPrepItems(s).filter((p) => !p.ok);
}

/** 러시 주인가 — 목요일(4일)부터는 준비가 오늘 할 일의 맨 앞이다 */
export function inRushWeek(s: GameState): boolean {
  return weekdayOf(s.clock) >= 4;
}

// ---------- 진단 카드 (§6: 진단은 러시 성적 분석이 된다) ----------

export interface RushDiagnosis {
  /** 성적 한 줄 (「B · 9명 받고 3명 놓쳤어요」) */
  headline: string;
  /** 왜 놓쳤나 한 줄 */
  why: string;
  /** 다음에 무엇을 (2개) */
  fixes: string[];
  result: RushResult | null;
}

const MISS_WHY: Record<RushResult['missKey'], string> = {
  queue: '자리가 없어 줄이 길어졌어요',
  slow: '자리는 남는데 손이 늦었어요',
  none: '한 명도 안 놓쳤어요',
};

/** 지난 러시 성적 분석. 아직 한 판도 안 했으면 준비 쪽을 말한다. */
export function rushDiagnosis(s: GameState): RushDiagnosis {
  const r = lastRushResult(s);
  if (!r) {
    const todo = rushPrepTodo(s);
    return {
      headline: '아직 러시를 한 판도 안 했어요',
      why: todo.length > 0 ? todo[0]!.text : '준비는 다 됐어요',
      fixes: todo.length > 0 ? todo.slice(0, 2).map((t) => t.text) : ['토요일 점심을 기다려요'],
      result: null,
    };
  }
  const fixes: string[] = [];
  if (r.missKey === 'queue') {
    fixes.push(`자리 ${Math.max(2, Math.ceil(r.left / 2))}개 늘리기`);
    fixes.push('홀 직원 한 명 더');
  } else if (r.missKey === 'slow') {
    fixes.push('맨 앞 손님부터 앉히기');
    fixes.push(skillStaffCount(s) > 0 ? '직원 스킬을 아껴 두지 않기' : '스킬 쓸 직원 뽑기');
  } else {
    fixes.push(totalSeats(s) < queueSizeFor(s) ? '자리를 더 놓으면 줄이 는다' : '더 좋은 자리로 올리기');
    fixes.push('콤보를 끊지 않기');
  }
  return {
    headline: `${r.grade} · ${r.served}명 받고 ${r.left}명 놓쳤어요`,
    why: r.left > 0 ? `${MISS_WHY[r.missKey]} (${r.left}명)` : MISS_WHY.none,
    fixes,
    result: r,
  };
}

/** 결과 카드의 「이래서 놓쳤어요」 한 줄 */
export function missLine(r: RushResult): string {
  if (r.left === 0) return '한 명도 안 놓쳤어요';
  return `${MISS_WHY[r.missKey]} (${r.left}명)`;
}

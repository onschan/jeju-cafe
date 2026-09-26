/**
 * 자리 등급 A~D (드림하우스 스토리 참고 — 방마다 「집세 레벨」이 있고, 가구 조합으로 전문 룸이 되면 집세·쾌적도가 뛴다).
 *
 * 우리 자리 값은 fee.ts의 배수(자리 점수·명당·거리·시설·바닷가…)가 이미 정한다. 그런데 `+28%`는 눈에 안 박힌다 —
 * 「A 자리를 몇 개 만드나」가 전략으로 읽히려면 글자 하나여야 한다. 등급은 그 배수를 네 칸으로 자른 것일 뿐,
 * 값을 새로 만들지 않는다 (카드의 % 와 등급이 어긋날 수 없다).
 *
 * 문턱은 봇 3년 실측(seed 1·2)에서 잘랐다: 1년차 자리는 +5~33% (D·C, 연말에 B 두엇), 2년차 +10~50%, 3년차 +30~94%.
 * 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { seatFeeQuote, feeQuoteIfPlaced } from './fee.ts';

export type SeatGrade = 'A' | 'B' | 'C' | 'D';
export const SEAT_GRADES: readonly SeatGrade[] = ['D', 'C', 'B', 'A'];
/** 요금 배수 +n% 가 이 이상이면 그 등급 (D는 나머지) */
export const GRADE_MIN_PCT: Record<Exclude<SeatGrade, 'D'>, number> = { A: 60, B: 35, C: 15 };
/** 등급 글자 색 (UI·맵 배지 공용) */
export const GRADE_COLOR: Record<SeatGrade, number> = { A: 0xc9741a, B: 0x3f8f3a, C: 0x4a6fa5, D: 0x7a6a5a };

export function gradeOfPct(pct: number): SeatGrade {
  if (pct >= GRADE_MIN_PCT.A) return 'A';
  if (pct >= GRADE_MIN_PCT.B) return 'B';
  if (pct >= GRADE_MIN_PCT.C) return 'C';
  return 'D';
}
export function gradeOfMult(mult: number): SeatGrade {
  return gradeOfPct(Math.round((mult - 1) * 100));
}
/** 다음 등급까지 몇 %p 남았나 (A면 null) */
export function pctToNextGrade(pct: number): { next: SeatGrade; need: number } | null {
  const g = gradeOfPct(pct);
  if (g === 'A') return null;
  const next = SEAT_GRADES[SEAT_GRADES.indexOf(g) + 1] as Exclude<SeatGrade, 'D'>;
  return { next, need: GRADE_MIN_PCT[next] - pct };
}

export interface SeatGradeInfo { grade: SeatGrade; pct: number }
/** 놓인 자리의 등급. 좌석이 아니거나 값을 낼 수 없으면(메뉴 없음) null. */
export function seatGrade(state: GameState, seat: PlacedObject): SeatGradeInfo | null {
  if (objectDef(seat.type).kind !== 'seat') return null;
  try {
    const pct = Math.round((seatFeeQuote(state, seat).mult - 1) * 100);
    return { grade: gradeOfPct(pct), pct };
  } catch { return null; }
}
/** 이 종류를 (x, y)에 놓으면 몇 등급 자리가 되나 (배치 고스트·추천 칸) */
export function gradeIfPlaced(state: GameState, type: string, x: number, y: number): SeatGradeInfo | null {
  if (objectDef(type).kind !== 'seat') return null;
  const q = feeQuoteIfPlaced(state, type, x, y);
  if (!q) return null;
  const pct = Math.round((q.mult - 1) * 100);
  return { grade: gradeOfPct(pct), pct };
}
/** 마당의 등급별 자리 수 — 「A 2 · B 5 · C 8 · D 2」 */
export function gradeCounts(state: GameState): Record<SeatGrade, number> {
  const out: Record<SeatGrade, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const o of Object.values(state.objects)) {
    if (o.build) continue;
    const g = seatGrade(state, o);
    if (g) out[g.grade]++;
  }
  return out;
}
/** 「A 2 · B 5 · C 8」 (0인 등급은 뺀다, 자리가 없으면 '자리 없음') */
export function gradeCountsText(counts: Record<SeatGrade, number>): string {
  const parts = (['A', 'B', 'C', 'D'] as SeatGrade[]).filter((g) => counts[g] > 0).map((g) => `${g} ${counts[g]}`);
  return parts.length > 0 ? parts.join(' · ') : '자리 없음';
}

/** 라이벌 순위표의 총점(0~100)도 같은 글자로 — 숫자 둘을 견주는 것보다 「우리 B · 옆집 A」가 빨리 읽힌다 */
export const SCORE_GRADE_MIN: Record<Exclude<SeatGrade, 'D'>, number> = { A: 70, B: 50, C: 30 };
export function scoreGrade(total: number): SeatGrade {
  if (total >= SCORE_GRADE_MIN.A) return 'A';
  if (total >= SCORE_GRADE_MIN.B) return 'B';
  if (total >= SCORE_GRADE_MIN.C) return 'C';
  return 'D';
}

/**
 * 카페 등급 5단계 (fun-rank, 재미 리셋 스펙 §5): 「올레길 노점」→「동네 카페」→「소문난 카페」→「제주 명소」→「전설의 카페」.
 * 조건 = 누적 손님·테마 수·평판·★ 네 가지를 모두 채우면 승급 (내려가지 않는다). 랭크(rank.ts)·★(guidebook.ts)와 달리
 * 겉모습이 바뀌는 등급이다: 간판 스프라이트(팻말 → 나무 간판 → 네온)·외벽 색·마당 동시 손님 상한·BGM 타악 레이어·승급 컷·보상 상자.
 * 판정은 rank.ts updateRank(evaluateUnlocks가 매일 부른다) 훅에서 checkGrade로 돈다.
 * 테마 수는 트랙 C의 completedCorners가 들어오면 그걸로 바꾼다 — 지금은 활성 콤보 수(compat.activeCombos).
 */
import type { GameState, GoalReward } from './types.ts';
import { completedCorners } from './corners.ts';
import { pushNotice } from './staff.ts';
import { pushFx } from './fx.ts';
import { applyRewards } from './goals.ts';
import { josa } from './josa.ts';

export const GRADE_NAMES = ['올레길 노점', '동네 카페', '소문난 카페', '제주 명소', '전설의 카페'] as const;
export const MAX_GRADE = GRADE_NAMES.length;
/** 등급별 한 줄 (등급 창 미리보기 캡션) — 문구 규칙 §6: ≤22자, 이유가 있는 문장 */
export const GRADE_CAPTION: Record<number, string> = {
  1: '길가 파라솔 하나. 여기서 시작이다',
  2: '동네 사람이 이름을 안다',
  3: '입소문. 사진 찍으러 온다',
  4: '관광 지도에 실렸다',
  5: '제주에 오면 꼭 들르는 곳',
};
export interface GradeReq { guests: number; corners: number; reputation: number; star: number }
/** 등급 g가 되려면 (누적 손님·테마·평판·★) 전부 ≥ GRADE_REQS[g] */
export const GRADE_REQS: Record<number, GradeReq> = {
  2: { guests: 200, corners: 1, reputation: 40, star: 1 },
  3: { guests: 1_500, corners: 3, reputation: 55, star: 2 },
  4: { guests: 6_000, corners: 5, reputation: 70, star: 3 },
  5: { guests: 20_000, corners: 8, reputation: 85, star: 4 },
};
/** 마당 동시 손님 상한 = GRADE_GUEST_CAP_BASE + 등급당 +10 (등급 4에서 예전 상한 60과 같다 — 상한이 늘 묶여 있어 그냥 더하면 3년 자금 밴드가 깨진다) */
export const GRADE_GUEST_CAP_BASE = 30;
export const GRADE_GUEST_CAP_STEP = 10;
/** 승급 보상: 응모권 5 + 마일리지 10×(등급−1) */
export const GRADE_UP_TICKETS = 5;
export const GRADE_UP_TICKETS_PER = 1;
/** fun 점진 공개: 이 등급부터 실내·본관·명소·투어·팝업·대결·연수·경로 계약 창이 나타난다 (아래 등급에선 아예 안 보인다) */
export const REVEAL_GRADE = 3;
/** 타악 BGM 레이어가 켜지는 등급 */
export const GRADE_BGM_LAYER_FROM = 3;

export function gradeOf(state: GameState): number {
  return Math.max(1, Math.min(MAX_GRADE, state.grade ?? 1));
}
export function gradeName(grade: number): string {
  return GRADE_NAMES[Math.max(1, Math.min(MAX_GRADE, grade)) - 1]!;
}

/** 완성한 테마 수 — 트랙 C completedCorners(지금 마당에 완성돼 있는 테마). */
export function cornerCount(state: GameState): number {
  return completedCorners(state).length;
}

export interface GradeProgressRow { key: keyof GradeReq; label: string; cur: number; need: number; met: boolean }
/** 다음 등급 조건 진행 (최고 등급이면 null). 등급 창·문구용. */
export function gradeProgress(state: GameState, grade = gradeOf(state) + 1): GradeProgressRow[] | null {
  const req = GRADE_REQS[grade];
  if (!req) return null;
  const cur: Record<keyof GradeReq, number> = { guests: state.totalGuests, corners: cornerCount(state), reputation: Math.round(state.reputation), star: state.star };
  const label: Record<keyof GradeReq, string> = { guests: '손님', corners: '테마', reputation: '평판', star: '★' };
  return (Object.keys(req) as (keyof GradeReq)[]).map((key) => ({ key, label: label[key], cur: cur[key], need: req[key], met: cur[key] >= req[key] }));
}
export function gradeMet(state: GameState, grade: number): boolean {
  const rows = gradeProgress(state, grade);
  return !!rows && rows.every((r) => r.met);
}

export function gradeUpRewards(grade: number): GoalReward[] {
  return [{ type: 'tickets', n: GRADE_UP_TICKETS + GRADE_UP_TICKETS_PER * (grade - 1) }];
}

/** 마당에 동시에 있을 수 있는 손님 수 (guests.ts 스폰 상한 훅) */
export function guestCap(state: GameState): number {
  return GRADE_GUEST_CAP_BASE + GRADE_GUEST_CAP_STEP * (gradeOf(state) - 1);
}

/** 조건을 다 채웠으면 한 단계 승급 (하루 한 단계). 승급했으면 새 등급, 아니면 null. */
export function checkGrade(state: GameState): number | null {
  const next = gradeOf(state) + 1;
  if (next > MAX_GRADE || !gradeMet(state, next)) return null;
  state.grade = next;
  const name = gradeName(next);
  pushNotice(state, `카페 등급 「${name}」!`);
  pushFx(state, { kind: 'scene', title: `「${name}」`, text: `손님들이 박수를 친다. 우리 카페, ${josa(name, '이/가')} 됐다`, tick: state.tick });
  pushFx(state, { kind: 'applause', tick: state.tick });
  applyRewards(state, gradeUpRewards(next), { source: 'grade', refId: `grade${next}`, title: `「${name}」 승급` });
  state.alerts.push({ type: 'grade', grade: next });
  return next;
}

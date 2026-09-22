/** 직원 칭호(레어 직원) — staff-luck.
 *  후보가 올 때 확률로 칭호가 붙는다: 숙련(25%, +10~15%) / 프로(8%, +25~35%) / 전설(1.5~3%, +50% + 고유 능력). 급여 배수 1.2 / 1.6 / 2.5.
 *  기준 확률은 3단계 공고(잡지 광고) 값이고 공고 단계(1~5)·랭크·평판으로 오르내린다(전단 = 숙련 20%·프로 3.2%, 대학 설명회 = 숙련 30%·프로 12.8%).
 *  전설은 4~5단계 공고·★3부터. 스카우트권을 쓴 공고는 첫 후보가 프로 이상.
 *  프로·전설 후보는 3일만 머문다. 효과는 skillTotal처럼 titleBonus(state, type)로 소비처가 한 줄씩 더한다 (요금·만족·청소·수확·홍보·개발·투어·대결…).
 *  결정적(보조 스트림 rng.ts sideRandom — 주 rng 순서를 건드리지 않는다). */
import type { GameState, Staff, Candidate, TitleDef, TitleGrade, TitleEffectType, RoleId, StatKey, JobTier, StaffPoolDef } from './types.ts';
import { TITLES, titleDef, recruitTierDef } from '../data/index.ts';
import { sideRandom, pickFrom } from './rng.ts';

export const TITLE_GRADES: Record<TitleGrade, { name: string; chance: number; salaryMult: number; order: number }> = {
  skilled: { name: '숙련', chance: 0.25, salaryMult: 1.2, order: 1 },
  pro: { name: '프로', chance: 0.08, salaryMult: 1.6, order: 2 },
  legend: { name: '전설', chance: 0.015, salaryMult: 2.5, order: 3 },
};
export const GRADE_ORDER: TitleGrade[] = ['skilled', 'pro', 'legend'];
/** 기준 공고 단계(잡지 광고). 단계마다 오르는 폭은 (단계 − 3) 곱 — 1단계 전단은 낮고 5단계 대학 설명회는 높다 */
export const TITLE_BASE_TIER = 3;
export const SKILLED_PER_TIER = 0.1;
export const PRO_PER_TIER = 0.3;
export const PRO_PER_RANK = 0.003;
/** 전설: 4~5단계 공고·★3부터. 기본 1.5% + 5단계 +0.5%p + 평판 100이면 +1%p → 2~3% */
export const LEGEND_MIN_TIER = 4;
export const LEGEND_MIN_STAR = 3;
export const LEGEND_PER_TIER = 0.005;
export const LEGEND_PER_REPUTATION = 0.01;
/** 프로·전설 후보가 머무는 날 수 */
export const RARE_STAY_DAYS = 3;

export { titleDef };
export function isRare(grade: TitleGrade | null | undefined): boolean {
  return grade === 'pro' || grade === 'legend';
}
export function titleGradeOf(titleId: string | undefined | null): TitleGrade | null {
  if (!titleId) return null;
  try { return titleDef(titleId).grade; } catch { return null; }
}
export function titleName(titleId: string | undefined | null): string | null {
  if (!titleId) return null;
  try { return titleDef(titleId).name; } catch { return null; }
}
/** 급여 배수 (칭호 없으면 1) */
export function titleSalaryMult(titleId: string | undefined | null): number {
  const g = titleGradeOf(titleId);
  return g ? TITLE_GRADES[g].salaryMult : 1;
}

/** 공고 단계별 칭호 등장 확률 (0~1). 전설은 조건을 못 채우면 0. */
export function titleChances(state: GameState, tier: JobTier): Record<TitleGrade, number> {
  const t = recruitTierDef(tier).tier;
  const skilled = TITLE_GRADES.skilled.chance * (1 + SKILLED_PER_TIER * (t - TITLE_BASE_TIER));
  const pro = TITLE_GRADES.pro.chance * (1 + PRO_PER_TIER * (t - TITLE_BASE_TIER)) + PRO_PER_RANK * Math.max(0, state.rank - 1);
  const legend = t >= LEGEND_MIN_TIER && state.star >= LEGEND_MIN_STAR
    ? TITLE_GRADES.legend.chance + LEGEND_PER_TIER * (t - LEGEND_MIN_TIER) + LEGEND_PER_REPUTATION * Math.max(0, Math.min(100, state.reputation)) / 100
    : 0;
  return { skilled: round4(skilled), pro: round4(pro), legend: round4(legend) };
}
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** 등급 하나를 굴린다 (보조 스트림 sideRandom — 주 rng 순서를 안 바꾼다). guaranteePro면 프로 미만은 프로로 올린다. */
export function rollGrade(state: GameState, tier: JobTier, guaranteePro = false): TitleGrade | null {
  const c = titleChances(state, tier);
  const r = sideRandom(state);
  let g: TitleGrade | null = null;
  if (r < c.legend) g = 'legend';
  else if (r < c.legend + c.pro) g = 'pro';
  else if (r < c.legend + c.pro + c.skilled) g = 'skilled';
  if (guaranteePro && !isRare(g)) g = 'pro';
  return g;
}

/** 풀 정의의 상한이 가장 높은 스탯으로 잘 맞는 직종을 고른다 (직종별 칭호 풀) */
const STAT_ROLES: Record<StatKey, RoleId[]> = { skill: ['barista', 'cook'], smile: ['hall'], strength: ['cook'], stamina: ['clean'] };
export function fitRolesOf(def: Pick<StaffPoolDef, 'statCaps'>): RoleId[] {
  const best = (Object.keys(STAT_ROLES) as StatKey[]).sort((a, b) => def.statCaps[b] - def.statCaps[a])[0]!;
  return STAT_ROLES[best];
}

/** 지금 직원·후보가 가진 칭호 id */
function takenTitles(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const s of state.staff) if (s.title) out.add(s.title);
  for (const c of state.candidates) if (c.title) out.add(c.title);
  return out;
}

/** 그 등급에서 칭호 하나를 고른다: 직종이 맞는 것 우선, 이미 있는 칭호는 뒤로. 결정적. */
export function pickTitle(state: GameState, grade: TitleGrade, def: Pick<StaffPoolDef, 'statCaps'>): TitleDef {
  const roles = new Set<RoleId>(fitRolesOf(def));
  const taken = takenTitles(state);
  const all = TITLES.filter((t) => t.grade === grade);
  let pool = all.filter((t) => t.roles.length === 0 || t.roles.some((r) => roles.has(r)));
  if (pool.length === 0) pool = all;
  const fresh = pool.filter((t) => !taken.has(t.id));
  if (fresh.length > 0) pool = fresh;
  return pickFrom(pool, () => 1, sideRandom(state))!;
}

/** 후보에 칭호를 굴려 붙인다. 붙었으면 정의를 돌려준다. */
export function rollTitle(state: GameState, tier: JobTier, def: Pick<StaffPoolDef, 'statCaps'>, guaranteePro = false): TitleDef | null {
  const grade = rollGrade(state, tier, guaranteePro);
  if (!grade) return null;
  return pickTitle(state, grade, def);
}

/** 도감: 만난 칭호를 적는다 (후보로 온 순간) */
export function noteTitleMet(state: GameState, titleId: string): void {
  state.codex.titles ??= [];
  if (!state.codex.titles.includes(titleId)) state.codex.titles.push(titleId);
}
export function titlesMet(state: GameState): string[] {
  return state.codex.titles ?? [];
}

/** 이 직원 칭호의 효과 값 (없으면 0) */
export function staffTitleEffect(staff: { title?: string } | null | undefined, type: TitleEffectType): number {
  if (!staff?.title) return 0;
  let v = 0;
  try { for (const e of titleDef(staff.title).effects) if (e.type === type) v += e.value; } catch { /* 없는 칭호 id (옛 저장) */ }
  return v;
}
/** 일하는 직원인가 (배치됨·연수 아님·개발 중 아님) */
export function isWorking(state: GameState, st: Staff): boolean {
  return st.role !== null && !st.training && state.developing?.staffId !== st.id;
}
/** 일하는 직원 칭호 효과 합 (skillTotal처럼 소비처가 한 줄로 더한다). role을 주면 그 직종만. */
export function titleBonus(state: GameState, type: TitleEffectType, role?: RoleId): number {
  let v = 0;
  for (const st of state.staff) if (st.title && isWorking(state, st) && (role === undefined || st.role === role)) v += staffTitleEffect(st, type);
  return v;
}

/** 칭호 정의 목록 (도감·UI) */
export function titlesOfGrade(grade: TitleGrade): TitleDef[] {
  return TITLES.filter((t) => t.grade === grade);
}
/** 후보 카드의 남은 시간 문구용: 프로·전설 후보가 떠나는 날(dayIndex) */
export function candidateDaysLeft(c: Candidate, today: number): number | null {
  return c.expiresDay === undefined ? null : Math.max(0, c.expiresDay - today);
}

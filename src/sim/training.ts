/** 연수 5종 (§3.6.4, trainings.json). 해금: 카페 랭크 3. 직원 카드 `연수 보내기` → 기간 동안 자리 비움(급여는 나감) → 복귀 시 스탯 상승(상한 내).
 *  같은 직원의 n번째 연수 비용 = 기본 × (1 + 0.2 × (n − 1)). 연수 우등생 특기는 효과 ×1.5. 종합 연수는 없는 특기 1개를 랜덤으로 준다. */
import type { GameState, ApplyResult, Staff, StatKey, TrainingDef } from './types.ts';
import { TRAININGS, SKILLS, trainingDef } from '../data/index.ts';
import { pickWeighted } from './rng.ts';
import { findStaff, addStat, skillsOf, salaryOf, pushNotice, STAT_KEYS, STAT_NAME, staffAnchor } from './staff.ts';

export const TRAINING_RANK = 3;          // 연수 해금 랭크
export const TRAINING_COST_STEP = 0.2;   // 회당 비용 증가

export function trainingUnlocked(state: GameState): boolean {
  return state.rank >= TRAINING_RANK;
}

/** 연수 할인권(트랙 C 마일리지 상점): 다음 연수 비용 50%, train이 하나 쓴다 */
export const TRAINING_VOUCHER_ITEM = 'training_voucher_discount';
export const TRAINING_VOUCHER_RATE = 0.5;
export function hasTrainingVoucher(state: GameState): boolean {
  return (state.inventory[TRAINING_VOUCHER_ITEM] ?? 0) > 0;
}
/** 그 직원의 다음 연수 비용 (n번째 = trainingCount + 1). state를 주면 연수 할인권 50%를 반영한다. */
export function trainingCost(staff: { trainingCount: number }, trainingId: string, state?: GameState): number {
  const base = Math.round(trainingDef(trainingId).cost * (1 + TRAINING_COST_STEP * staff.trainingCount));
  return state && hasTrainingVoucher(state) ? Math.round(base * TRAINING_VOUCHER_RATE) : base;
}

/** 연수 효과 배수: 1 + 연수 우등생 특기 값 (그 직원 것만) */
export function trainingMultOf(staff: Staff): number {
  let v = 0;
  for (const id of skillsOf(staff)) {
    const e = SKILLS.find((s) => s.id === id)?.effect;
    if (e?.type === 'trainingBonus') v += e.value;
  }
  return 1 + v;
}

/** 조건형 연수(종합 연수 ★3·Lv5)를 이 직원이 갈 수 있나 */
export function trainingRequirementMet(state: GameState, staff: Staff, def: TrainingDef): ApplyResult {
  const r = def.requires;
  if (r?.star !== undefined && state.star < r.star) return { ok: false, reason: `★${r.star}부터 갈 수 있어요` };
  if (r?.level !== undefined && staff.level < r.level) return { ok: false, reason: `Lv.${r.level}부터 갈 수 있어요` };
  return { ok: true };
}

export function canTrain(state: GameState, staffId: string, trainingId: string): ApplyResult {
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (!TRAININGS.some((t) => t.id === trainingId)) return { ok: false, reason: '없는 연수예요' };
  if (!trainingUnlocked(state)) return { ok: false, reason: `카페 랭크 ${TRAINING_RANK}부터 보낼 수 있어요` };
  if (st.training) return { ok: false, reason: '이미 연수 중이에요' };
  if (state.developing?.staffId === staffId) return { ok: false, reason: '메뉴 개발 중이에요' };
  const req = trainingRequirementMet(state, st, trainingDef(trainingId));
  if (!req.ok) return req;
  if (state.money < trainingCost(st, trainingId, state)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

/** 비용을 내고 보낸다. 자리는 그대로 두되(복귀하면 같은 직종) 그동안 staffInRole에서 빠진다. */
export function train(state: GameState, staffId: string, trainingId: string): void {
  const st = findStaff(state, staffId)!;
  const cost = trainingCost(st, trainingId, state);
  if (hasTrainingVoucher(state)) state.inventory[TRAINING_VOUCHER_ITEM] = (state.inventory[TRAINING_VOUCHER_ITEM] ?? 0) - 1;
  state.money -= cost;
  state.monthCosts.recruit += cost;
  st.trainingCount++;
  st.training = { id: trainingId, daysLeft: trainingDef(trainingId).days };
  st.path = [];
  st.anchor = staffAnchor(state, st);
}

/** 복귀: 스탯 상승(상한 내, 우등생 ×1.5) + 종합 연수면 없는 특기 1개. 올린 스탯 요약 문자열. */
export function finishTraining(state: GameState, st: Staff): string {
  const def = trainingDef(st.training!.id);
  const mult = trainingMultOf(st);
  const parts: string[] = [];
  for (const k of STAT_KEYS) {
    const d = def.stats[k as StatKey];
    if (!d) continue;
    const got = addStat(state, st, k, Math.round(d * mult));
    if (got > 0) parts.push(`${STAT_NAME[k]} +${got}`);
  }
  if (def.grantSkill) {
    const have = new Set(skillsOf(st));
    const pool = SKILLS.filter((s) => !have.has(s.id));
    const picked = pickWeighted(state, pool, () => 1);
    if (picked) { st.extraSkills.push(picked.id); parts.push(`특기 ${picked.name}`); }
  }
  st.training = null;
  st.salary = salaryOf(st, state.salaryRaisePct);
  return parts.join(' · ') || '변화 없음';
}

/** 새 날: 연수 일수를 줄이고 0이면 복귀 */
export function dailyTraining(state: GameState): void {
  for (const st of state.staff) {
    if (!st.training) continue;
    st.training.daysLeft--;
    if (st.training.daysLeft > 0) continue;
    const name = trainingDef(st.training.id).name;
    const summary = finishTraining(state, st);
    pushNotice(state, `${st.name} 씨가 ${name}에서 돌아왔어요: ${summary}`);
  }
}

/** UI: 이 직원이 갈 수 있는 연수 목록과 사유 */
export function trainingOptions(state: GameState, staffId: string): { def: TrainingDef; cost: number; ok: boolean; reason?: string }[] {
  const st = findStaff(state, staffId);
  return TRAININGS.map((def) => {
    const r = st ? canTrain(state, staffId, def.id) : { ok: false, reason: '없는 직원이에요' };
    return { def, cost: st ? trainingCost(st, def.id, state) : def.cost, ok: r.ok, reason: r.reason };
  });
}

/** 연수 중인 직원 수 (월말 카드·HUD) */
export function trainingCount(state: GameState): number {
  return state.staff.filter((s) => s.training).length;
}

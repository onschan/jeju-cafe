/**
 * 직원 액티브 스킬 (스펙 §3) — **육성이 목적이 되게 하는 장치**.
 *
 * 패시브 특기(skills.json·skillTotal)는 평상시 내내 걸리는 값이고, 이쪽은 **러시 중에만** 플레이어가 눌러서 쓴다.
 * 역할이 겹치지 않게 효과 종류도 갈라 두었다 — 패시브는 품질·재료비·연구·유입, 액티브는 조리 시간·팁·착석·청결·인내.
 *
 * 직종마다 1번 칸 스킬이 하나씩 있고(바리스타 속사 커피 / 요리사 오늘의 특선 / 홀 능숙한 안내 / 청소 번개 청소),
 * 2번 칸은 중반 해금(activeSkillSlots ≥ 2)과 **러시 연수**를 마친 직원만 쓴다. 그래서 육성 세 갈래가 전부 여기로 모인다:
 *  - 레벨 5·10 → 지속 ×1.25·×1.5, 효과 ×1.15·×1.3
 *  - 칭호 프로·전설 → 쿨다운 −20%·−35%
 *  - 러시 연수 → 2번째 스킬
 *
 * 시간은 **게임 시간 ms 절대 시각**으로 적는다(readyAt·until). 따로 줄여 가지 않으므로 tick 훅이 필요 없고,
 * 같은 세이브면 언제 계산해도 같은 값이라 봇·리플레이가 흔들리지 않는다.
 * JSON의 초는 「3배속 기준 초」 — 러시 길이(60~90초)와 같은 잣대라 곱해서 게임 시간으로 바꾼다.
 */
import type { ActiveSkillDef, ActiveSkillUse, ApplyResult, GameState, RoleId, Staff, TitleGrade } from './types.ts';
import { ACTIVE_SKILLS, activeSkillDef } from '../data/index.ts';
import { DAY_MS, HOUR_MS, START_HOUR } from './clock.ts';
import { CLEAN_MAX } from './cleanliness.ts';
import { dayIndex } from './effects.ts';
import { findStaff, pushNotice } from './staff.ts';
import { titleGradeOf, isWorking } from './titles.ts';
import { pushFx } from './fx.ts';

export { ACTIVE_SKILLS, activeSkillDef };

/** 러시 길이를 재는 잣대 (스펙 §1·§2의 「3배속 60~90초」). JSON의 초 × 1000 × 이 값 = 게임 시간 ms */
export const RUSH_SPEED_REF = 3;
export const secToMs = (sec: number): number => Math.round(sec * 1000 * RUSH_SPEED_REF);

/** 레벨 문턱: 5에서 지속 ×1.25·효과 ×1.15, 10에서 ×1.5·×1.3 */
export const SKILL_LEVEL_STEPS: { level: number; duration: number; power: number }[] = [
  { level: 5, duration: 1.25, power: 1.15 },
  { level: 10, duration: 1.5, power: 1.3 },
];
/** 칭호 등급별 쿨다운 감소 — 숙련은 0, 프로 −20%, 전설 −35% */
export const SKILL_COOLDOWN_CUT: Record<TitleGrade, number> = { skilled: 0, pro: 0.2, legend: 0.35 };
/** 2번째 스킬을 여는 러시 연수 id (trainings.json) */
export const RUSH_TRAINING = 'tr_rush';
/** 스킬 칸 수 상한 */
export const MAX_SKILL_SLOTS = 2;
/** 효과 겹침 상한 — 조리 감소는 아무리 겹쳐도 이만큼까지 */
export const PREP_CUT_CAP = 0.75;

// ---------- 게임 시간 ----------

/** 1년 1월 1일 6시 = 0인 게임 시간 ms. 단조 증가 — 쿨다운·지속의 기준. */
export function gameMs(state: GameState): number {
  return dayIndex(state.clock) * DAY_MS + (state.clock.hour - START_HOUR) * HOUR_MS + state.clock.accMs;
}

// ---------- 해금 ----------

/** 열린 스킬 칸 수 (1~2). 중반 해금 보상 activeSkillSlot이 올린다. */
export function skillSlots(state: GameState): number {
  return Math.max(1, Math.min(MAX_SKILL_SLOTS, state.activeSkillSlots ?? 1));
}
/** 이 직원이 러시 연수를 마쳤나 (2번째 스킬 조건) */
export function rushTrained(staff: Pick<Staff, 'trainingLog'>): boolean {
  return (staff.trainingLog?.[RUSH_TRAINING] ?? 0) > 0;
}
/** 그 직종의 칸별 스킬 정의 */
export function skillOfRole(role: RoleId, slot: 1 | 2 = 1): ActiveSkillDef | null {
  return ACTIVE_SKILLS.find((s) => s.role === role && s.slot === slot) ?? null;
}
/** 이 직원이 지금 쓸 수 있는 스킬 목록 (쉬는 중·연수 중이면 없다) */
export function skillsOfStaff(state: GameState, staff: Staff): ActiveSkillDef[] {
  if (!staff.role || staff.training) return [];
  const out: ActiveSkillDef[] = [];
  const first = skillOfRole(staff.role, 1);
  if (first) out.push(first);
  const second = skillOfRole(staff.role, 2);
  if (second && skillSlots(state) >= 2 && rushTrained(staff)) out.push(second);
  return out;
}
/** 채용 비교표·카드에 쓰는 「이 사람이 러시에서 쓰는 스킬」 — 후보는 아직 직종이 없으니 직종을 받는다 */
export function skillPreview(role: RoleId): ActiveSkillDef | null {
  return skillOfRole(role, 1);
}

// ---------- 값 (레벨·칭호 보정) ----------

function levelStep(level: number): { duration: number; power: number } {
  let out = { duration: 1, power: 1 };
  for (const s of SKILL_LEVEL_STEPS) if (level >= s.level) out = { duration: s.duration, power: s.power };
  return out;
}
/** 쿨다운 (게임 시간 ms) — 칭호 프로 −20%·전설 −35% */
export function cooldownMs(staff: Pick<Staff, 'title'>, def: ActiveSkillDef): number {
  const g = titleGradeOf(staff.title);
  const cut = g ? SKILL_COOLDOWN_CUT[g] : 0;
  return Math.round(secToMs(def.cooldownSec) * (1 - cut));
}
/** 지속 (게임 시간 ms) — 즉발이면 0 */
export function durationMs(staff: Pick<Staff, 'level'>, def: ActiveSkillDef): number {
  if (def.durationSec <= 0) return 0;
  return Math.round(secToMs(def.durationSec) * levelStep(staff.level).duration);
}
/** 효과 값 (레벨 보정). 조리 감소는 0.9를 넘지 않게 자른다. */
export function skillPower(staff: Pick<Staff, 'level'>, def: ActiveSkillDef): number {
  const v = def.effect.value * levelStep(staff.level).power;
  if (def.effect.type === 'prepCut') return Math.min(0.9, round3(v));
  return round3(v);
}
/** cleanBurst의 만족 값 (레벨 보정) */
export function skillSat(staff: Pick<Staff, 'level'>, def: ActiveSkillDef): number {
  if (def.effect.type === 'cleanBurst') return round3(def.effect.sat * levelStep(staff.level).power);
  if (def.effect.type === 'satBoost') return skillPower(staff, def);
  return 0;
}
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** 한글 효과 한 줄 (카드·비교표) — 값은 그 직원 기준 */
export function skillEffectText(staff: Pick<Staff, 'level'>, def: ActiveSkillDef): string {
  const p = skillPower(staff, def);
  const sec = Math.round(durationMs(staff, def) / secToMs(1));
  switch (def.effect.type) {
    case 'prepCut': return `${sec}초 조리 ${Math.round(p * 100)}% 빨리`;
    case 'tipMult': return `${sec}초 팁 ${p.toFixed(1)}배`;
    case 'seatFront': return `맨 앞 ${Math.round(p)}명 바로 착석`;
    case 'cleanBurst': return `청결 +${Math.round(p)} · ${sec}초 만족 +${Math.round(skillSat(staff, def))}`;
    case 'satBoost': return `${sec}초 만족 +${Math.round(p)}`;
    case 'patience': return `줄 선 손님 ${Math.round(p)}초 더 기다림`;
  }
}
/** 카드 한 줄: 「속사 커피 · 12초 조리 60% 빨리 · 쿨 30초」 */
export function skillLine(staff: Pick<Staff, 'level' | 'title'>, def: ActiveSkillDef): string {
  return `${def.name} · ${skillEffectText(staff, def)} · 쿨 ${Math.round(cooldownMs(staff, def) / secToMs(1))}초`;
}

// ---------- 사용·쿨다운 ----------

function uses(state: GameState): Record<string, ActiveSkillUse> {
  return (state.activeSkills ??= {});
}
export function skillUse(state: GameState, staffId: string): ActiveSkillUse | null {
  return uses(state)[staffId] ?? null;
}
/** 남은 쿨다운 (게임 시간 ms, 0이면 바로 쓸 수 있다) */
export function cooldownLeft(state: GameState, staffId: string): number {
  const u = skillUse(state, staffId);
  return u ? Math.max(0, u.readyAt - gameMs(state)) : 0;
}
/** 이 직원의 스킬이 지금 걸려 있나 (지속 중) */
export function skillOn(state: GameState, staffId: string): ActiveSkillUse | null {
  const u = skillUse(state, staffId);
  return u && u.until > gameMs(state) ? u : null;
}
/** 지금 걸려 있는 모든 스킬 */
export function activeUses(state: GameState): ActiveSkillUse[] {
  const now = gameMs(state);
  return Object.values(state.activeSkills ?? {}).filter((u) => u.until > now);
}

/** 러시가 돌고 있나.
 *  TODO(rush1): src/sim/rush.ts가 생기면 `import { rushActive } from './rush.ts'`로 바꾼다.
 *  지금은 state.rush.active를 구조적으로만 읽는다 — rush.ts가 없어도 컴파일된다. */
export function rushActive(state: GameState): boolean {
  const r = (state as unknown as { rush?: { active?: boolean } }).rush;
  return r?.active === true;
}

export function canUseSkill(state: GameState, staffId: string, skillId?: string): ApplyResult {
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (!isWorking(state, st)) return { ok: false, reason: '지금은 일하는 중이 아니에요' };
  const list = skillsOfStaff(state, st);
  if (list.length === 0) return { ok: false, reason: '아직 쓸 수 있는 재주가 없어요' };
  const def = skillId ? list.find((d) => d.id === skillId) : list[0];
  if (!def) return { ok: false, reason: '아직 못 배운 재주예요' };
  if (!rushActive(state)) return { ok: false, reason: '손님이 몰릴 때만 쓸 수 있어요' };
  const left = cooldownLeft(state, staffId);
  if (left > 0) return { ok: false, reason: `${Math.ceil(left / secToMs(1))}초 뒤에 또 쓸 수 있어요` };
  return { ok: true };
}

/** 발동: 쿨다운·지속을 적고 즉발 효과는 훅에 맡긴다 (착석·인내·청결은 러시가 읽어 간다). */
export function useStaffSkill(state: GameState, staffId: string, skillId?: string): ActiveSkillUse | null {
  const st = findStaff(state, staffId);
  if (!st) return null;
  const list = skillsOfStaff(state, st);
  const def = (skillId ? list.find((d) => d.id === skillId) : list[0]) ?? null;
  if (!def) return null;
  const now = gameMs(state);
  const u: ActiveSkillUse = {
    skillId: def.id,
    usedAt: now,
    readyAt: now + cooldownMs(st, def),
    until: now + durationMs(st, def),
    power: skillPower(st, def),
    sat: skillSat(st, def),
  };
  uses(state)[staffId] = u;
  if (def.effect.type === 'cleanBurst') state.clean.value = Math.min(CLEAN_MAX, state.clean.value + u.power);
  pushFx(state, { kind: 'skill', staffId, text: def.name, tick: state.tick });
  return u;
}

/** 한 스텝(STEP_MS) 안에 쓴 것을 「방금」으로 본다 */
export const INSTANT_WINDOW_MS = HOUR_MS / 20;
/** 즉발 스킬이 방금 쓰였나 — 러시가 줄을 건드릴 때 읽는다 (TODO(rush1): rush.ts가 소비한 뒤 clearInstant로 지운다).
 *  seatFront면 앉힐 인원 수, patience면 더해 줄 초. 아니면 0. */
export function instantOf(state: GameState, kind: 'seatFront' | 'patience'): number {
  let n = 0;
  const now = gameMs(state);
  for (const u of Object.values(state.activeSkills ?? {})) {
    const def = defOf(u.skillId);
    if (!def || def.effect.type !== kind) continue;
    if (now - u.usedAt <= INSTANT_WINDOW_MS) n += u.power;
  }
  return n;
}
/** 러시가 즉발 효과를 먹은 뒤 「방금」 표식을 지운다 (두 번 먹지 않게) */
export function clearInstant(state: GameState, kind: 'seatFront' | 'patience'): void {
  for (const u of Object.values(state.activeSkills ?? {})) {
    const def = defOf(u.skillId);
    if (def && def.effect.type === kind) u.usedAt = -INSTANT_WINDOW_MS - 1;
  }
}
function defOf(id: string): ActiveSkillDef | null {
  try { return activeSkillDef(id); } catch { return null; }
}

// ---------- 소비 훅 (guests.ts가 한 줄씩 더한다) ----------

/** 지금 걸린 조리 시간 감소 (그 직종 직원이 쓴 것만). 0~PREP_CUT_CAP */
export function activePrepCut(state: GameState, role: RoleId): number {
  let v = 0;
  for (const [id, u] of Object.entries(state.activeSkills ?? {})) {
    if (u.until <= gameMs(state)) continue;
    const def = defOf(u.skillId);
    if (!def || def.effect.type !== 'prepCut' || def.role !== role) continue;
    const st = findStaff(state, id);
    if (!st || st.role !== role) continue;
    v += u.power;
  }
  return Math.min(PREP_CUT_CAP, round3(v));
}
/** 지금 걸린 팁 배수 (겹치면 가장 큰 것 하나만 — 두 배가 네 배가 되지는 않는다) */
export function activeTipMult(state: GameState): number {
  let m = 1;
  for (const u of activeUses(state)) {
    const def = defOf(u.skillId);
    if (def?.effect.type === 'tipMult') m = Math.max(m, u.power);
  }
  return m;
}
/** 지금 걸린 만족 보정 (cleanBurst·satBoost 합, 최대 +6) */
export const ACTIVE_SAT_MAX = 6;
export function activeSatisfaction(state: GameState): number {
  let v = 0;
  for (const u of activeUses(state)) {
    const def = defOf(u.skillId);
    if (def?.effect.type === 'cleanBurst' || def?.effect.type === 'satBoost') v += u.sat;
  }
  return Math.min(ACTIVE_SAT_MAX, Math.round(v));
}

// ---------- UI ----------

export interface SkillCard {
  staffId: string;
  staffName: string;
  def: ActiveSkillDef;
  ready: boolean;
  leftSec: number;      // 남은 쿨다운 (초)
  cooldownSec: number;  // 이 직원 기준 쿨다운 (초)
  onSec: number;        // 남은 지속 (초, 0이면 안 걸려 있다)
  line: string;         // 「속사 커피 · 12초 조리 60% 빨리 · 쿨 30초」
}
/** 러시 하단 직원 카드 3~6장 (TODO(rush2): Rush HUD가 이 목록을 그린다) */
export function skillCards(state: GameState): SkillCard[] {
  const out: SkillCard[] = [];
  const now = gameMs(state);
  for (const st of state.staff) {
    if (!isWorking(state, st)) continue;
    for (const def of skillsOfStaff(state, st)) {
      const u = skillUse(state, st.id);
      const same = u && u.skillId === def.id ? u : null;
      out.push({
        staffId: st.id,
        staffName: st.name,
        def,
        ready: !same || same.readyAt <= now,
        leftSec: same ? Math.max(0, Math.ceil((same.readyAt - now) / secToMs(1))) : 0,
        cooldownSec: Math.round(cooldownMs(st, def) / secToMs(1)),
        onSec: same && same.until > now ? Math.ceil((same.until - now) / secToMs(1)) : 0,
        line: skillLine(st, def),
      });
    }
  }
  return out;
}

/** 2번째 스킬 칸이 열린 순간 알림 (goals.ts 보상이 부른다) */
export function noteSkillSlot(state: GameState): void {
  pushNotice(state, `직원들이 재주를 하나 더 배울 수 있어요`);
}

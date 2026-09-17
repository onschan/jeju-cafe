import type { GameState, ApplyResult, Candidate, Staff, Stats, StatKey, RoleId, JobTier, SkillEffect, Pt } from './types.ts';
import { NAMES, SKILLS, roleDef, skillDef, objectDef } from '../data/index.ts';
import { nextRandom, randInt, pickWeighted } from './rng.ts';
import { monthIndex } from './clock.ts';
import { isWalkable, findPath, walkableNeighborsOf, moveAlong } from './path.ts';
import { WAREHOUSE_FRONT } from './layout.ts';

export const TIERS: Record<JobTier, { cost: number; count: number; min: number; max: number }> = {
  flyer: { cost: 1_000_000, count: 3, min: 10, max: 40 },
  site: { cost: 5_000_000, count: 4, min: 30, max: 60 },
  headhunter: { cost: 20_000_000, count: 5, min: 50, max: 80 },
};
export const MAX_LEVEL = 10;
export const MAX_STAT = 99;
export const ENERGY_PER_HOUR = 2;       // 배치된 직원 시간당 기력 소모 (하루 18h = −36, 밤 +40)
export const LOW_ENERGY = 30;          // 미만이면 효과 절반
export const NIGHT_ENERGY_RECOVERY = 40;
export const NOTICE_CAP = 10;
export { WAREHOUSE_FRONT };
export const STAT_KEYS: StatKey[] = ['service', 'cooking', 'sense', 'stamina'];

// ---------- 공식 ----------

/** 월급 = 스탯 합 × 3,000 + 레벨 × 500,000 (§9.4 ×100 리스케일, GDD 40만~220만) */
export function salaryOf(stats: Stats, level: number): number {
  return STAT_KEYS.reduce((s, k) => s + stats[k], 0) * 3000 + level * 500_000;
}

/** 레벨업 비용 = 현재 스탯값 × 10 연구P (HSS2식) */
export function levelUpCost(staff: Staff, stat: StatKey): number {
  return staff.stats[stat] * 10;
}

/** 그 역할에 배치된 직원 (메뉴 개발 중인 직원은 바빠서 빠진다) */
export function staffInRole(state: GameState, role: RoleId): Staff[] {
  return state.staff.filter((s) => s.role === role && state.developing?.staffId !== s.id);
}

/** 기력이 낮으면 효과 절반 */
export function energyFactor(staff: Staff): number {
  return staff.energy < LOW_ENERGY ? 0.5 : 1;
}

function skillValue(staff: Staff, type: SkillEffect['type']): number {
  const e = skillDef(staff.skill).effect;
  return e.type === type && 'value' in e ? e.value : 0;
}

/** 특정 스킬 효과 값의 합. role을 주면 그 역할 직원만. */
export function skillTotal(state: GameState, type: SkillEffect['type'], role?: RoleId): number {
  return state.staff.reduce((s, st) => s + (role === undefined || st.role === role ? skillValue(st, type) : 0), 0);
}

/** 그 역할 직원들의 핵심 스탯 합 (기력 30 미만은 절반). 스킬 보정은 소비처에서 skillTotal로 더한다. */
export function roleEffect(state: GameState, role: RoleId): number {
  const key = roleDef(role).stat;
  return staffInRole(state, role).reduce((s, st) => s + st.stats[key] * energyFactor(st), 0);
}

/** 운반 효과와 절약 스킬로 재료비 할인. 최대 30%. */
export function ingredientDiscount(state: GameState): number {
  return Math.min(0.3, roleEffect(state, 'carry') / 500 + skillTotal(state, 'ingredientDiscount'));
}

// ---------- 공고·후보 ----------

export function generateCandidate(state: GameState, tier: JobTier): Candidate {
  const t = TIERS[tier];
  const stats: Stats = { service: 0, cooking: 0, sense: 0, stamina: 0 };
  for (const k of STAT_KEYS) stats[k] = randInt(state, t.min, t.max);
  const name = pickWeighted(state, NAMES.names, () => 1)!;
  const skill = pickWeighted(state, SKILLS, () => 1)!.id;
  const face = { hair: randInt(state, 0, NAMES.hair - 1), skin: randInt(state, 0, NAMES.skin - 1), top: randInt(state, 0, NAMES.top - 1) };
  return { id: `c${state.nextId++}`, name, face, stats, skill, level: 1, salary: salaryOf(stats, 1), expiresMonthIndex: monthIndex(state.clock) + 1 };
}

/** 공고비 (스카우트권이 있으면 무료) */
export function postJobCost(state: GameState, tier: JobTier): number {
  return state.freeRecruits > 0 ? 0 : TIERS[tier].cost;
}
export function canPostJob(state: GameState, tier: JobTier): ApplyResult {
  if (state.money < postJobCost(state, tier)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

export function postJob(state: GameState, tier: JobTier): void {
  const t = TIERS[tier];
  const cost = postJobCost(state, tier);
  if (cost === 0 && state.freeRecruits > 0) state.freeRecruits -= 1;
  state.money -= cost;
  state.monthCosts.recruit += cost;
  for (let i = 0; i < t.count; i++) state.candidates.push(generateCandidate(state, tier));
}

/** 월초: 지난달 후보를 지운다. */
export function expireCandidates(state: GameState): void {
  const now = monthIndex(state.clock);
  state.candidates = state.candidates.filter((c) => c.expiresMonthIndex > now);
}

// ---------- 채용·해고·배치·레벨업 ----------

function roleOpen(state: GameState, role: RoleId): ApplyResult {
  if (!state.unlocked.roles.includes(role)) return { ok: false, reason: '아직 없는 역할이에요' };
  if (staffInRole(state, role).length >= state.slots[role]) return { ok: false, reason: '자리가 다 찼어요' };
  return { ok: true };
}

export function canHire(state: GameState, candidateId: string, role: RoleId): ApplyResult {
  if (!state.candidates.some((c) => c.id === candidateId)) return { ok: false, reason: '없는 후보예요' };
  return roleOpen(state, role);
}

export function hire(state: GameState, candidateId: string, role: RoleId): Staff {
  const c = state.candidates.find((x) => x.id === candidateId)!;
  state.candidates = state.candidates.filter((x) => x.id !== candidateId);
  const front = warehouseFront(state);
  const staff: Staff = {
    id: c.id, name: c.name, face: c.face, stats: c.stats, skill: c.skill, level: c.level, salary: c.salary,
    role, unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: front.x, y: front.y, path: [], anchor: null, waitMs: 0,
  };
  staff.anchor = staffAnchor(state, staff);
  state.staff.push(staff);
  return staff;
}

export function findStaff(state: GameState, staffId: string): Staff | undefined {
  return state.staff.find((s) => s.id === staffId);
}

/** 해고: 퇴직금으로 한 달 월급을 준다. */
export function canFire(state: GameState, staffId: string): ApplyResult {
  if (!findStaff(state, staffId)) return { ok: false, reason: '없는 직원이에요' };
  if (state.developing?.staffId === staffId) return { ok: false, reason: '메뉴 개발 중이에요' };
  return { ok: true };
}

export function fire(state: GameState, staffId: string): void {
  const st = findStaff(state, staffId)!;
  state.money -= st.salary;
  state.monthCosts.recruit += st.salary;
  state.staff = state.staff.filter((s) => s.id !== staffId);
}

export function canAssign(state: GameState, staffId: string, role: RoleId | null): ApplyResult {
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (role === null || role === st.role) return { ok: true };
  return roleOpen(state, role);
}

export function assign(state: GameState, staffId: string, role: RoleId | null): void {
  const st = findStaff(state, staffId)!;
  st.role = role;
  st.path = [];
  st.waitMs = 0;
  st.anchor = staffAnchor(state, st);
}

export function canLevelUp(state: GameState, staffId: string, stat: StatKey): ApplyResult {
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (!STAT_KEYS.includes(stat)) return { ok: false, reason: '없는 스탯이에요' };
  if (st.level >= MAX_LEVEL) return { ok: false, reason: '이미 최고 레벨이에요' };
  if (state.research < levelUpCost(st, stat)) return { ok: false, reason: '연구 포인트가 모자라요' };
  return { ok: true };
}

/** 고른 스탯만 +5~9 (상한 99), 레벨 +1, 월급 재계산. */
export function levelUp(state: GameState, staffId: string, stat: StatKey): void {
  const st = findStaff(state, staffId)!;
  state.research -= levelUpCost(st, stat);
  st.stats[stat] = Math.min(MAX_STAT, st.stats[stat] + randInt(state, 5, 9));
  st.level++;
  st.salary = salaryOf(st.stats, st.level);
}

// ---------- 월급·기력 ----------

export function pushNotice(state: GameState, text: string): void {
  state.notices.push(text);
  if (state.notices.length > NOTICE_CAP) state.notices.shift();
}

/** 월말: 월급 지급. 못 주면 unpaidMonths++, 2달이면 퇴사. */
export function payroll(state: GameState): void {
  const keep: Staff[] = [];
  for (const st of state.staff) {
    if (state.money >= st.salary) {
      state.money -= st.salary;
      state.monthCosts.salary += st.salary;
      st.unpaidMonths = 0;
      keep.push(st);
    } else {
      st.unpaidMonths++;
      if (st.unpaidMonths >= 2) pushNotice(state, `${st.name} 씨가 월급을 못 받아 그만뒀어요`);
      else keep.push(st);
    }
  }
  state.staff = keep;
}

/** 근무 1시간: 배치된 직원은 기력 −2 (튼튼함 스킬만큼 덜). */
export function hourlyEnergy(state: GameState): void {
  for (const st of state.staff) {
    if (st.role === null) continue;
    st.energy = Math.max(0, st.energy - ENERGY_PER_HOUR * (1 - skillValue(st, 'stamina')));
  }
}

/** 밤: 기력 +40 */
export function nightlyRecovery(state: GameState): void {
  for (const st of state.staff) st.energy = Math.min(100, st.energy + NIGHT_ENERGY_RECOVERY);
}

// ---------- 이동 ----------

function manhattan(a: Pt, b: Pt): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nearestWalkable(state: GameState, to: Pt): Pt {
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let y = 0; y < state.grid.h; y++)
    for (let x = 0; x < state.grid.w; x++) {
      if (!isWalkable(state, x, y)) continue;
      const d = manhattan({ x, y }, to);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  return best ?? to; // 도로 줄이 항상 있어 null이 될 일은 없다
}

/** 창고 문 앞 (문 바로 아래 칸). 걷기 칸이 아니면 가장 가까운 걷기 칸. */
export function warehouseFront(state: GameState): Pt {
  return isWalkable(state, WAREHOUSE_FRONT.x, WAREHOUSE_FRONT.y) ? { ...WAREHOUSE_FRONT } : nearestWalkable(state, WAREHOUSE_FRONT);
}

function adjacentWalkableTo(state: GameState, kind: string): Pt | null {
  for (const o of Object.values(state.objects)) {
    if (objectDef(o.type).kind !== kind) continue;
    const nb = walkableNeighborsOf(state, o.x, o.y)[0];
    if (nb) return nb;
  }
  return null;
}

/** 역할별 근무 위치. hall → 좌석 옆, field → 밭 옆, 나머지 → 창고 앞. */
export function staffAnchor(state: GameState, staff: Staff): Pt {
  const front = warehouseFront(state);
  if (staff.role === 'hall') return adjacentWalkableTo(state, 'seat') ?? front;
  if (staff.role === 'field') return adjacentWalkableTo(state, 'field') ?? front;
  return front;
}

const WANDER_RADIUS = 2;

function wanderCells(state: GameState, anchor: Pt): Pt[] {
  const out: Pt[] = [];
  for (let dy = -WANDER_RADIUS; dy <= WANDER_RADIUS; dy++)
    for (let dx = -WANDER_RADIUS; dx <= WANDER_RADIUS; dx++) {
      const p = { x: anchor.x + dx, y: anchor.y + dy };
      if (isWalkable(state, p.x, p.y)) out.push(p);
    }
  return out;
}

function cellOf(st: Staff): Pt {
  return { x: Math.round(st.x), y: Math.round(st.y) };
}

function goTo(state: GameState, st: Staff, to: Pt): void {
  const cur = cellOf(st);
  if (cur.x === to.x && cur.y === to.y) return;
  const path = findPath(state, cur, to);
  st.path = path ? path.slice(1) : [];
}

/** 직원 걷기. 배치된 직원은 앵커 반경 2의 걷기 칸을 1~3초마다 골라 산책. 미배치·기력 0이면 창고 앞에 선다. */
export function moveStaff(state: GameState, dtMs: number): void {
  for (const st of state.staff) {
    if (st.path.length) { moveAlong(st, dtMs); continue; }
    if (st.role === null || st.energy <= 0) {
      st.anchor = warehouseFront(state);
      goTo(state, st, st.anchor);
      continue;
    }
    st.waitMs -= dtMs;
    if (st.waitMs > 0) continue;
    st.anchor = staffAnchor(state, st);
    const cells = wanderCells(state, st.anchor);
    const dest = pickWeighted(state, cells, () => 1);
    if (dest) goTo(state, st, dest);
    st.waitMs = randInt(state, 1000, 3000);
  }
}

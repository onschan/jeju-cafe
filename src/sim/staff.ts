import type { GameState, ApplyResult, Candidate, Staff, Stats, StatKey, RoleId, JobTier, SkillEffect, Pt, StaffPoolDef, RecruitTierDef } from './types.ts';
import { RECRUIT_TIERS, STAFF_POOL, roleDef, skillDef, objectDef, staffPoolDef, recruitTierDef, ROLES } from '../data/index.ts';
import { randInt, pickWeighted } from './rng.ts';
import { monthIndex } from './clock.ts';
import { isWalkable, findPath, walkableNeighborsOf, moveAlong } from './path.ts';
import { WAREHOUSE_FRONT } from './layout.ts';
import { salaryOf as economySalaryOf } from './economy.ts';

/** 채용 방법 5단계 (recruit_tiers.json, §3.6.6). id → 정의 */
export const TIERS: Record<JobTier, RecruitTierDef> = Object.fromEntries(RECRUIT_TIERS.map((t) => [t.id, t])) as Record<JobTier, RecruitTierDef>;
export const MAX_LEVEL = 12;            // 절대 상한 (특수 직원). 실제 상한은 staff.maxLevel (5~12)
export const MAX_STAT = 145;            // 절대 상한 (특수 120 + 유니폼 +25). 실제 상한은 capOf
export const ENERGY_PER_HOUR = 2;       // 배치된 직원 시간당 기력 소모 (하루 18h = −36, 밤 +40)
export const LOW_ENERGY = 30;          // 미만이면 효과 절반
export const NIGHT_ENERGY_RECOVERY = 40;
export const NOTICE_CAP = 30; // 한 번에 여러 시설이 같은 랭크·★에서 열릴 수 있어 여유 있게 (예: ★2 시설 11개)
export { WAREHOUSE_FRONT };
export const STAT_KEYS: StatKey[] = ['stamina', 'strength', 'skill', 'smile'];
export const STAT_NAME: Record<StatKey, string> = { stamina: '체력', strength: '힘', skill: '기술', smile: '미소' };

// ---------- 슬롯 (§3.6.1: 기본 3 + 휴게실 1개당 +3, 휴게실 최대 3) ----------
export const BASE_STAFF_SLOTS = 3;
export const SLOTS_PER_STAFF_ROOM = 3;
export const MAX_STAFF_ROOMS = 3;
export const STAFF_ROOM_TYPE = 'staff_room'; // A가 만드는 시설 id. 없으면 0개.

/** 다 지어진 휴게실 수 (최대 3) */
export function staffRoomCount(state: GameState): number {
  let n = 0;
  for (const o of Object.values(state.objects)) if (o.type === STAFF_ROOM_TYPE && !o.build) n++;
  return Math.min(MAX_STAFF_ROOMS, n);
}
/** 전체 직원 정원 = 3 + 휴게실 × 3 (직종별 자리 state.slots는 그 안에서 따로 센다) */
export function staffCapacity(state: GameState): number {
  return BASE_STAFF_SLOTS + SLOTS_PER_STAFF_ROOM * staffRoomCount(state);
}

// ---------- 공식 ----------

/** 월급 = 기본급 × (1 + 0.15 × (Lv − 1)) × (1 + 인상%) + 스탯 합 × 1,000원 (§3.6.3, economy.ts). 배치 안 된 직원은 payroll에서 50%. */
export { SALARY_PER_STAT_POINT as SALARY_PER_STAT } from './economy.ts';
export const UNASSIGNED_SALARY_RATIO = 0.5;
export function salaryOf(staff: { baseSalary: number; level: number; stats: Stats }, raisePct = 0): number {
  return economySalaryOf(staff, raisePct);
}
/** 이달 실제로 나가는 월급 (쉬는 직원 50%, 연수 중은 그대로) */
export function salaryDue(staff: Staff): number {
  return staff.role === null && !staff.training ? Math.round(staff.salary * UNASSIGNED_SALARY_RATIO) : staff.salary;
}

// ---------- 스탯 상한 (§3.6.2: 스탯별 상한 + 유니폼 1벌당 전 직원 +5, 최대 +25) ----------
export const CAP_PER_UNIFORM = 5;
export const CAP_BONUS_MAX = 25;
export function capBonus(state: GameState): number {
  return Math.min(CAP_BONUS_MAX, CAP_PER_UNIFORM * state.uniforms.length);
}
export function capOf(state: GameState, staff: { statCaps: Stats }, stat: StatKey): number {
  return Math.min(MAX_STAT, staff.statCaps[stat] + capBonus(state));
}
/** 스탯을 상한 안에서 더한다. 실제로 오른 양. */
export function addStat(state: GameState, staff: Staff, stat: StatKey, delta: number): number {
  const before = staff.stats[stat];
  staff.stats[stat] = Math.max(0, Math.min(capOf(state, staff, stat), before + delta));
  return staff.stats[stat] - before;
}

// ---------- 승급 (§3.6.3: 경험치 ≥ 120×Lv 그리고 연구 20×Lv) ----------
export const EXP_PER_LEVEL = 120;
export const RESEARCH_PER_LEVEL = 20;
export const EXP_PER_WORKDAY = 1;
export const EXP_PER_SERVE = 0.2;
export const LEVEL_MAIN_STAT = 3;
export const LEVEL_SUB_STAT = 1;
export const expNeeded = (level: number) => EXP_PER_LEVEL * level;
export const levelUpCost = (level: number) => RESEARCH_PER_LEVEL * level;

/** 승급 때 +3 받는 주 스탯: 맡은 직종의 스탯, 쉬는 중이면 상한이 가장 높은 스탯 */
export function mainStatOf(staff: Staff): StatKey {
  if (staff.role) return roleDef(staff.role).stat;
  return [...STAT_KEYS].sort((a, b) => staff.statCaps[b] - staff.statCaps[a])[0]!;
}

/** 서빙·조리 1건마다 그 직종 직원에게 경험치 +0.2 (E: guests.ts에서 손님이 메뉴를 받을 때 호출) */
export function addRoleExp(state: GameState, role: RoleId, amount = EXP_PER_SERVE): void {
  for (const st of staffInRole(state, role)) st.exp += amount;
}

/** 새 날: 배치된(연수 중 아닌) 직원은 근무일 경험치 +1 */
export function dailyWorkExp(state: GameState): void {
  for (const st of state.staff) if (st.role !== null && !st.training) st.exp += EXP_PER_WORKDAY;
}

// ---------- 특기 ----------

export function skillsOf(staff: { skill: string; extraSkills?: string[] }): string[] {
  return [staff.skill, ...(staff.extraSkills ?? [])];
}
export function hasSkill(staff: { skill: string; extraSkills?: string[] }, skillId: string): boolean {
  return skillsOf(staff).includes(skillId);
}

/** 그 역할에 배치된 직원 (메뉴 개발 중·연수 중인 직원은 빠진다) */
export function staffInRole(state: GameState, role: RoleId): Staff[] {
  return state.staff.filter((s) => s.role === role && !s.training && state.developing?.staffId !== s.id);
}

/** 기력이 낮으면 효과 절반 */
export function energyFactor(staff: Staff): number {
  return staff.energy < LOW_ENERGY ? 0.5 : 1;
}

function skillValue(staff: { skill: string; extraSkills?: string[] }, type: SkillEffect['type']): number {
  let v = 0;
  for (const id of skillsOf(staff)) {
    const e = skillDef(id).effect;
    if (e.type === type && 'value' in e) v += e.value;
  }
  return v;
}

/** 특정 스킬 효과 값의 합 (타고난 특기 + 연수로 얻은 특기). role을 주면 그 역할 직원만. */
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

// ---------- 신설 직종 효과 훅 (§3.6.1) — A(청결)·농원 수확·홍보가 곱한다 ----------

/** 청소 직원의 하루 청결 회복량 = Σ(기술÷5 + 힘÷10) × 기력 계수 × (1 + 청소 달인). 청소 직원이 없으면 0. */
export function cleanPowerOf(state: GameState): number {
  const base = staffInRole(state, 'clean').reduce((s, st) => s + (st.stats.skill / 5 + st.stats.strength / 10) * energyFactor(st), 0);
  return base * (1 + skillTotal(state, 'cleanBonus', 'clean'));
}
export const GARDEN_BONUS_PER_STAFF = 0.5;
export const GARDEN_STAFF_MAX = 2;
export const GARDEN_DECAY_FACTOR = 0.5;
/** 농원 수확 배수 = 1 + 0.5 × 농원지기 수(최대 2) + 농원지기 특기 합. 없으면 1. */
export function gardenBonusOf(state: GameState): number {
  const n = Math.min(GARDEN_STAFF_MAX, staffInRole(state, 'garden').length);
  return 1 + GARDEN_BONUS_PER_STAFF * n + skillTotal(state, 'harvestBonus');
}
/** 농원 시설 노후 배수: 농원지기가 있으면 0.5 (A의 upgrade/노후가 곱한다) */
export function gardenDecayOf(state: GameState): number {
  return staffInRole(state, 'garden').length > 0 ? GARDEN_DECAY_FACTOR : 1;
}
export const PROMO_EFFECT_BONUS = 1.2;
export const PROMO_ENERGY_FACTOR = 0.5;
/** 홍보 효과 배수: 홍보 담당이 있으면 1.2 */
export function promoBonusOf(state: GameState): number {
  return staffInRole(state, 'promo').length > 0 ? PROMO_EFFECT_BONUS : 1;
}
/** 홍보 활동 기력 소모 배수: 홍보 담당이 있으면 0.5 */
export function promoEnergyFactorOf(state: GameState): number {
  return staffInRole(state, 'promo').length > 0 ? PROMO_ENERGY_FACTOR : 1;
}

/** 내 필지에 다 지어진, 수확 있는 농원 시설 수 — 농원지기 해금 조건 */
export function farmCount(state: GameState): number {
  let n = 0;
  for (const o of Object.values(state.objects)) {
    if (objectDef(o.type).yield === undefined || o.build) continue;
    if (state.parcels.some((p) => p.owned && o.x >= p.x && o.y >= p.y && o.x < p.x + p.w && o.y < p.y + p.h)) n++;
  }
  return n;
}
/** 직종 해금 조건 (staff_roles.json unlock). goal 조건은 B의 목표 보상 unlockRole이 연다. */
export function roleUnlockMet(state: GameState, role: RoleId): boolean {
  const def = roleDef(role);
  if (def.unlockedAtStart) return true;
  const u = def.unlock;
  if (!u || u.goal !== undefined) return false;
  if (u.farms !== undefined && farmCount(state) < u.farms) return false;
  if (u.rank !== undefined && state.rank < u.rank) return false;
  return true;
}
/** 새 날: 조건형 직종(농원지기 = 농원 3개, 홍보 담당 = 랭크 4)을 연다 */
export function checkRoleUnlocks(state: GameState): void {
  for (const r of ROLES) {
    if (state.unlocked.roles.includes(r.id) || !r.unlock || r.unlock.goal !== undefined) continue;
    if (roleUnlockMet(state, r.id)) {
      state.unlocked.roles.push(r.id);
      pushNotice(state, `새 직종: ${r.name}`);
    }
  }
}

// ---------- 공고·후보 (§3.6.2 직원 풀 27 · §3.6.6 채용 5단계) ----------

function candidateOf(state: GameState, def: StaffPoolDef): Candidate {
  const stats: Stats = { ...def.stats };
  return {
    id: `c${state.nextId++}`, poolId: def.id, name: def.name, face: { ...def.face }, stats, statCaps: { ...def.statCaps }, skill: def.skill,
    level: 1, maxLevel: def.maxLevel, baseSalary: def.baseSalary, salary: salaryOf({ baseSalary: def.baseSalary, level: 1, stats }, state.salaryRaisePct),
    expiresMonthIndex: monthIndex(state.clock) + 1,
  };
}

/** 지금 우리 직원이거나 후보로 와 있는 풀 id */
function takenPoolIds(state: GameState): Set<string> {
  return new Set([...state.staff.map((s) => s.poolId), ...state.candidates.map((c) => c.poolId)]);
}

/** 그 단계 풀에서 아직 없는 사람 */
export function availablePool(state: GameState, tier: number): StaffPoolDef[] {
  const taken = takenPoolIds(state);
  return STAFF_POOL.filter((p) => p.tier === tier && !taken.has(p.id));
}

/** 그 단계 풀에서 n명을 무작위로 뽑아 후보로 (state.rng, 결정적). 뽑힌 수. */
export function drawCandidates(state: GameState, tier: JobTier, n: number): number {
  const pool = availablePool(state, TIERS[tier].tier);
  let got = 0;
  for (let i = 0; i < n && pool.length > 0; i++) {
    const def = pickWeighted(state, pool, () => 1)!;
    pool.splice(pool.indexOf(def), 1);
    state.candidates.push(candidateOf(state, def));
    got++;
  }
  return got;
}

/** 특수 직원(tier 0)을 후보로 부른다 (C: 소라 등 아이템). 이미 있으면 false. */
export function addPoolCandidate(state: GameState, poolId: string): boolean {
  if (takenPoolIds(state).has(poolId)) return false;
  state.candidates.push(candidateOf(state, staffPoolDef(poolId)));
  return true;
}

/** 공고비 (스카우트권이 있으면 무료) */
export function postJobCost(state: GameState, tier: JobTier): number {
  return state.freeRecruits > 0 ? 0 : TIERS[tier].cost;
}
export function tierUnlocked(state: GameState, tier: JobTier): boolean {
  const u = TIERS[tier].unlock;
  if (!u) return true;
  if (u.star !== undefined && state.star < u.star) return false;
  if (u.rank !== undefined && state.rank < u.rank) return false;
  return true;
}
export function canPostJob(state: GameState, tier: JobTier): ApplyResult {
  if (!TIERS[tier]) return { ok: false, reason: '없는 채용 방법이에요' };
  if (!tierUnlocked(state, tier)) return { ok: false, reason: `★${TIERS[tier].unlock?.star ?? ''}부터 할 수 있어요` };
  if (availablePool(state, TIERS[tier].tier).length === 0) return { ok: false, reason: '이 방법으로 올 사람은 다 왔어요' };
  if (state.money < postJobCost(state, tier)) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}

export function postJob(state: GameState, tier: JobTier): void {
  const t = TIERS[tier];
  const cost = postJobCost(state, tier);
  if (cost === 0 && state.freeRecruits > 0) state.freeRecruits -= 1;
  state.money -= cost;
  state.monthCosts.recruit += cost;
  drawCandidates(state, tier, t.count);
}

/** 월초: 지난달 후보를 지운다. */
export function expireCandidates(state: GameState): void {
  const now = monthIndex(state.clock);
  state.candidates = state.candidates.filter((c) => c.expiresMonthIndex > now);
}

// ---------- 채용·해고·배치·승급 ----------

function roleOpen(state: GameState, role: RoleId): ApplyResult {
  if (!state.unlocked.roles.includes(role)) return { ok: false, reason: '아직 없는 직종이에요' };
  if (staffInRole(state, role).length >= (state.slots[role] ?? 0)) return { ok: false, reason: '자리가 다 찼어요' };
  return { ok: true };
}

export function canHire(state: GameState, candidateId: string, role: RoleId): ApplyResult {
  if (!state.candidates.some((c) => c.id === candidateId)) return { ok: false, reason: '없는 후보예요' };
  if (state.staff.length >= staffCapacity(state)) return { ok: false, reason: `직원은 ${staffCapacity(state)}명까지 (휴게실을 지으면 +3)` };
  return roleOpen(state, role);
}

export function hire(state: GameState, candidateId: string, role: RoleId): Staff {
  const c = state.candidates.find((x) => x.id === candidateId)!;
  state.candidates = state.candidates.filter((x) => x.id !== candidateId);
  const front = warehouseFront(state);
  const staff: Staff = {
    id: c.id, poolId: c.poolId, name: c.name, face: c.face, stats: c.stats, statCaps: c.statCaps, skill: c.skill, extraSkills: [],
    level: c.level, maxLevel: c.maxLevel, baseSalary: c.baseSalary, salary: c.salary, exp: 0, trainingCount: 0, training: null,
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
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (state.developing?.staffId === staffId) return { ok: false, reason: '메뉴 개발 중이에요' };
  if (st.training) return { ok: false, reason: '연수 중이에요' };
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
  if (st.training) return { ok: false, reason: '연수 중이에요' };
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

export function canLevelUp(state: GameState, staffId: string): ApplyResult {
  const st = findStaff(state, staffId);
  if (!st) return { ok: false, reason: '없는 직원이에요' };
  if (st.level >= st.maxLevel) return { ok: false, reason: '이미 최고 레벨이에요' };
  if (st.exp < expNeeded(st.level)) return { ok: false, reason: `경험치가 모자라요 (${Math.floor(st.exp)}/${expNeeded(st.level)})` };
  if (state.research < levelUpCost(st.level)) return { ok: false, reason: '연구 포인트가 모자라요' };
  return { ok: true };
}

/** 승급: 경험치·연구 소모, 레벨 +1, 주 스탯 +3·나머지 +1 (상한 내), 월급 재계산. */
export function levelUp(state: GameState, staffId: string): void {
  const st = findStaff(state, staffId)!;
  state.research -= levelUpCost(st.level);
  st.exp -= expNeeded(st.level);
  const main = mainStatOf(st);
  for (const k of STAT_KEYS) addStat(state, st, k, k === main ? LEVEL_MAIN_STAT : LEVEL_SUB_STAT);
  st.level++;
  st.salary = salaryOf(st, state.salaryRaisePct);
}

// ---------- 월급·기력 ----------

export function pushNotice(state: GameState, text: string): void {
  state.notices.push(text);
  if (state.notices.length > NOTICE_CAP) state.notices.shift();
}

/** 월말: 월급 지급 (쉬는 직원 50%). 못 주면 unpaidMonths++, 2달이면 퇴사. */
export function payroll(state: GameState): void {
  const keep: Staff[] = [];
  for (const st of state.staff) {
    const due = salaryDue(st);
    if (state.money >= due) {
      state.money -= due;
      state.monthCosts.salary += due;
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

/** 근무 1시간: 배치된 직원은 기력 −2 (튼튼함 스킬만큼 덜). 연수 중은 안 닳는다. */
export function hourlyEnergy(state: GameState): void {
  for (const st of state.staff) {
    if (st.role === null || st.training) continue;
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

/** 역할별 근무 위치. hall → 좌석 옆, 나머지 → 창고 앞. */
export function staffAnchor(state: GameState, staff: Staff): Pt {
  const front = warehouseFront(state);
  if (staff.role === 'hall') return adjacentWalkableTo(state, 'seat') ?? front;
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

/** 직원 걷기. 배치된 직원은 앵커 반경 2의 걷기 칸을 1~3초마다 골라 산책. 미배치·기력 0·연수 중이면 창고 앞에 선다. */
export function moveStaff(state: GameState, dtMs: number): void {
  for (const st of state.staff) {
    if (st.path.length) { moveAlong(st, dtMs); continue; }
    if (st.role === null || st.energy <= 0 || st.training) {
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

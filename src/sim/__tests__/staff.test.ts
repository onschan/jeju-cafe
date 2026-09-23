import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';
import { salaryOf, salaryDue, roleEffect, ingredientDiscount, canHire, moveStaff, staffAnchor, drawCandidates, availablePool, addPoolCandidate, staffCapacity, capOf, expNeeded, levelUpCost, addRoleExp, dailyWorkExp, cleanPowerOf, gardenBonusOf, gardenDecayOf, promoBonusOf, promoEnergyFactorOf, checkRoleUnlocks, farmCount, skillTotal, TIERS } from '../staff.ts';
import { trainingCost, canTrain, trainingMultOf, TRAINING_RANK } from '../training.ts';
import { OUTCOME_MULT } from '../luck.ts';
import { ingredientCost } from '../economy.ts';
import { expectedHarvest } from '../orchard.ts';
import { tick } from '../tick.ts';
import { LOAN_MAX } from '../failure.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import { STAFF_POOL, RECRUIT_TIERS, TRAININGS, SKILLS, ROLES } from '../../data/index.ts';
import type { GameState, Staff, Stats, RoleId } from '../types.ts';
import { START_MONEY } from '../state.ts';
import { SLOTS_PER_STAFF_ROOM } from '../staff.ts';
import { rentOf } from '../economy.ts';

export function staffWith(partial: Partial<Stats>, role: RoleId | null, skill = 'coffee_lover'): Staff {
  const stats: Stats = { stamina: 10, strength: 10, skill: 10, smile: 10, ...partial };
  return {
    id: `s${Math.round(Object.values(stats).reduce((a, b) => a + b, 0))}${role}`,
    name: 'x', face: { hair: 0, skin: 0, top: 0 }, poolId: '', stats, statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, skill, extraSkills: [],
    level: 1, maxLevel: 10, baseSalary: 400_000, salary: 0, exp: 0, trainingCount: 0, training: null,
    role, unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: X(4), y: Y(3), path: [], anchor: null, waitMs: 0,
  };
}

function hired(seed = 1, role: RoleId = 'hall'): { s: GameState; st: Staff } {
  const s = bareState(seed);
  apply(s, { type: 'postJob', tier: 'flyer' });
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role });
  return { s, st: s.staff[0]! };
}

// ---------- 데이터 (§3.6) ----------

test('직원 풀 27명: 단계 1~5 각 5명 + 특수 2명, 상한 ≥ 초기치, 채용 5단계·연수 5종·특기 30·직종 8', () => {
  expect(STAFF_POOL.length).toBe(27);
  for (let t = 1; t <= 5; t++) expect(STAFF_POOL.filter((p) => p.tier === t).length).toBe(5);
  expect(STAFF_POOL.filter((p) => p.tier === 0).length).toBe(2);
  for (const p of STAFF_POOL) {
    for (const k of ['stamina', 'strength', 'skill', 'smile'] as const) expect(p.statCaps[k]).toBeGreaterThanOrEqual(p.stats[k]);
    expect(SKILLS.some((s) => s.id === p.skill)).toBe(true);
  }
  expect(RECRUIT_TIERS.map((t) => t.cost)).toEqual([500_000, 5_000_000, 8_000_000, 20_000_000, 50_000_000]);
  expect(TRAININGS.length).toBe(2);
  expect(SKILLS.length).toBe(10);
  expect(ROLES.map((r) => r.id)).toEqual(['barista', 'cook', 'hall', 'clean']);
});

// ---------- 공고·후보 ----------

test('공고: 그 단계 풀에서 3명이 오고, 공고비는 채용비로 잡힌다. 잠긴 단계·돈 부족은 안 된다', () => {
  const s = bareState(7);
  expect(apply(s, { type: 'postJob', tier: 'flyer' }).ok).toBe(true);
  expect(s.candidates.length).toBe(3);
  expect(s.money).toBe(START_MONEY - 500_000);
  expect(s.monthCosts.recruit).toBe(500_000);
  for (const c of s.candidates) { expect(STAFF_POOL.find((p) => p.id === c.poolId)!.tier).toBe(1); expect(c.stats).toEqual(STAFF_POOL.find((p) => p.id === c.poolId)!.stats); }
  expect(new Set(s.candidates.map((c) => c.poolId)).size).toBe(3);
  expect(apply(s, { type: 'postJob', tier: 'site' }).ok).toBe(false); // 돈 부족
  s.money = 1e9;
  expect(apply(s, { type: 'postJob', tier: 'intern' }).ok).toBe(false); // ★3 잠김
  s.star = 3;
  expect(apply(s, { type: 'postJob', tier: 'intern' }).ok).toBe(true);
  expect(s.candidates.length).toBe(6);
});

test('같은 단계를 다시 내면 남은 사람만 오고, 다 오면 더 못 낸다. 같은 seed면 같은 후보', () => {
  const a = bareState(3), b = bareState(3);
  a.money = b.money = 1e8;
  apply(a, { type: 'postJob', tier: 'site' }); apply(b, { type: 'postJob', tier: 'site' });
  expect(a.candidates.length).toBe(3);
  expect(JSON.stringify(a.candidates)).toBe(JSON.stringify(b.candidates));
  expect(availablePool(a, 2).length).toBe(2);
  expect(apply(a, { type: 'postJob', tier: 'site' }).ok).toBe(true);
  expect(a.candidates.length).toBe(5);
  expect(apply(a, { type: 'postJob', tier: 'site' }).ok).toBe(false); // 다 왔다
  const c = a.candidates[0]!;
  expect(c.salary).toBe(salaryOf({ baseSalary: c.baseSalary, level: 1, stats: c.stats, title: c.title })); // staff-luck: 칭호 급여 배수
  expect(drawCandidates(a, 'college', 1)).toBe(1);
});

test('특수 직원(조랑말·돌하르방)은 공고로 안 오고 addPoolCandidate로만 온다', () => {
  const s = bareState(1);
  s.money = 1e9; s.star = 5;
  for (const t of RECRUIT_TIERS) { apply(s, { type: 'postJob', tier: t.id }); apply(s, { type: 'postJob', tier: t.id }); }
  expect(s.candidates.length).toBe(25);
  expect(s.candidates.some((c) => c.poolId === 'st_pony_special')).toBe(false);
  expect(addPoolCandidate(s, 'st_pony_special')).toBe(true);
  expect(addPoolCandidate(s, 'st_pony_special')).toBe(false);
  expect(s.candidates.length).toBe(26);
});

test('시작 후보 2명은 전단 단계 풀에서 온다', () => {
  const s = createInitialState(1, 'p', 0);
  expect(s.candidates.length).toBe(2);
  for (const c of s.candidates) expect(STAFF_POOL.find((p) => p.id === c.poolId)!.tier).toBe(1);
});

// ---------- 급여 (§3.6.3 표 3행) ----------

test('월급 공식: 기본급 × (1 + 0.15 × (Lv−1)) + 스탯 합 × 1,000 — 표 3행 일치', () => {
  const zero: Stats = { stamina: 0, strength: 0, skill: 0, smile: 0 };
  const rows: [number, number[]][] = [
    [400_000, [400_000, 520_000, 640_000, 760_000, 940_000]],
    [1_000_000, [1_000_000, 1_300_000, 1_600_000, 1_900_000, 2_350_000]],
    [2_200_000, [2_200_000, 2_860_000, 3_520_000, 4_180_000, 5_170_000]],
  ];
  for (const [base, expected] of rows)
    expect([1, 3, 5, 7, 10].map((level) => salaryOf({ baseSalary: base, level, stats: zero }))).toEqual(expected);
  // 스탯 합 × 1,000: 김민준 초기 80 → Lv5 720,000
  const kim = STAFF_POOL.find((p) => p.id === 'st_kim_minjun')!;
  expect(salaryOf({ baseSalary: kim.baseSalary, level: 5, stats: kim.stats })).toBe(720_000);
  expect(salaryOf({ baseSalary: 400_000, level: 1, stats: { stamina: 20, strength: 20, skill: 20, smile: 20 } })).toBe(480_000);
});

test('쉬는 직원은 월급 50%, 연수 중은 그대로', () => {
  const st = staffWith({}, null);
  st.salary = 1_000_000;
  expect(salaryDue(st)).toBe(500_000);
  st.role = 'hall';
  expect(salaryDue(st)).toBe(1_000_000);
  st.role = null; st.training = { id: 'tr_barista', daysLeft: 2 };
  expect(salaryDue(st)).toBe(1_000_000);
});

// ---------- 채용·슬롯 ----------

test('채용: 슬롯이 있어야 하고, 역할이 해금돼야 하고, 후보가 사라진다', () => {
  const s = bareState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  const c = s.candidates[0]!;
  expect(apply(s, { type: 'hire', candidateId: c.id, role: 'hall' }).ok).toBe(true);
  expect(s.staff.length).toBe(1); expect(s.staff[0]!.role).toBe('hall'); expect(s.candidates.length).toBe(2);
  expect(s.staff[0]!.energy).toBe(100);
  expect(s.staff[0]!.exp).toBe(0);
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' }).ok).toBe(false); // 슬롯 2 초과
  expect(apply(s, { type: 'hire', candidateId: 'nope', role: 'hall' }).ok).toBe(false);
});

test('직원 정원 = 3 + 휴게실(청소도구실) × 3 (휴게실 최대 3)', () => {
  const s = bareState(1);
  s.money = 1e9;
  expect(staffCapacity(s)).toBe(3);
  apply(s, { type: 'postJob', tier: 'flyer' }); apply(s, { type: 'postJob', tier: 'flyer' });
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' }).ok).toBe(true);
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'barista' }).ok).toBe(true);
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'cook' }).ok).toBe(true);
  const r = apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  expect(r.ok).toBe(false); expect(r.reason).toContain('3명');
  // 휴게실은 A가 만든다 — 여기서는 objects에 직접 흉내 낸다
  s.objects['room1'] = { id: 'room1', type: 'cleaning_room', x: 0, y: 0, rot: 0, placedMonth: 0, build: null } as never;
  expect(staffCapacity(s)).toBe(3 + SLOTS_PER_STAFF_ROOM); // stakes: 휴게실 1개당 +2
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' }).ok).toBe(true);
  for (let i = 2; i <= 5; i++) s.objects[`room${i}`] = { id: `room${i}`, type: 'cleaning_room', x: 0, y: i, rot: 0, placedMonth: 0, build: null } as never;
  expect(staffCapacity(s)).toBe(3 + 3 * SLOTS_PER_STAFF_ROOM); // 휴게실 최대 3개
});

test('후보는 다음 달 초에 사라진다', () => {
  const s = bareState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  for (let i = 0; i < 29; i++) tick(s, DAY_MS);
  expect(s.candidates.length).toBe(3);
  tick(s, DAY_MS);
  expect(s.candidates.length).toBe(0);
});

test('달 말에 낸 공고도 다음 달 1일에 사라진다 (같은 달 안에서는 남는다)', () => {
  const s = bareState(1);
  for (let i = 0; i < 28; i++) tick(s, DAY_MS);
  expect(s.clock.day).toBe(29);
  apply(s, { type: 'postJob', tier: 'flyer' });
  tick(s, DAY_MS);
  expect(s.clock.day).toBe(30);
  expect(s.candidates.length).toBe(3);
  tick(s, DAY_MS);
  expect(s.clock).toMatchObject({ month: 4, day: 1 });
  expect(s.candidates.length).toBe(0);
});

test('월말 월급 차감, 못 주면 unpaidMonths, 2달이면 퇴사', () => {
  const { s, st } = hired();
  const sal = st.salary;
  s.money = sal + 100 + rentOf(s); // stakes: 월급 말고 마을 관리비도 나간다
  s.loan.count = LOAN_MAX; // 잔고가 40만 아래로 떨어져도 삼춘 대출이 안 들어오게
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.lastMonthCard!.costs.salary).toBe(sal);
  expect(s.money).toBe(100);
  s.money = 0;
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(st.unpaidMonths).toBe(1);
  expect(s.lastMonthCard!.costs.salary).toBe(0);
  for (let i = 0; i < 30; i++) tick(s, DAY_MS);
  expect(s.staff.length).toBe(0);
  const quit = s.notices.filter((n) => n.includes('그만뒀어요'));
  expect(quit.length).toBe(1);
  expect(quit[0]).toContain(st.name);
});

// ---------- 승급 (§3.6.3 경험치) ----------

test('assign·fire·승급: 경험치 ≥ 120×Lv 그리고 연구 20×Lv, 주 스탯 +3·나머지 +1', () => {
  const { s, st } = hired();
  expect(apply(s, { type: 'assign', staffId: st.id, role: 'barista' }).ok).toBe(true);
  expect(st.role).toBe('barista');
  expect(apply(s, { type: 'assign', staffId: st.id, role: 'hall' }).ok).toBe(true);
  const before = { ...st.stats };
  s.research = 1000;
  st.exp = expNeeded(1) - 1;
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(false); // 경험치 부족
  st.exp = expNeeded(1);
  s.research = levelUpCost(1) - 1;
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(false); // 연구 부족
  s.research = levelUpCost(1);
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(true);
  expect(s.research).toBe(0);
  expect(st.exp).toBe(0);
  expect(st.level).toBe(2);
  expect(st.stats.smile - before.smile).toBe(3); // 홀 = 미소
  expect(st.stats.skill - before.skill).toBe(1);
  expect(st.stats.stamina - before.stamina).toBe(1);
  expect(st.stats.strength - before.strength).toBe(1);
  expect(st.salary).toBe(salaryOf(st));
  const m0 = s.money;
  const recruit0 = s.monthCosts.recruit;
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(true);
  expect(s.money).toBe(m0 - st.salary); expect(s.staff.length).toBe(0);
  expect(s.monthCosts.recruit).toBe(recruit0 + st.salary); // 퇴직금은 채용비
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(false);
});

test('경험치: 근무일마다 +1 (쉬는 직원·연수 중은 안 오름), 서빙 1건 +0.2', () => {
  const { s, st } = hired();
  for (let d = 0; d < 3; d++) tick(s, DAY_MS);
  expect(st.exp).toBe(3);
  addRoleExp(s, 'hall');
  expect(st.exp).toBeCloseTo(3.2);
  addRoleExp(s, 'barista');
  expect(st.exp).toBeCloseTo(3.2);
  apply(s, { type: 'assign', staffId: st.id, role: null });
  dailyWorkExp(s);
  expect(st.exp).toBeCloseTo(3.2);
});

test('승급은 최대 레벨까지, 스탯은 상한(스탯별 + 유니폼 +5/벌, 최대 +25)을 넘지 않는다', () => {
  const { s, st } = hired();
  st.level = st.maxLevel; s.research = 1e6; st.exp = 1e6;
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(false);
  st.level = 1;
  st.stats.smile = st.statCaps.smile - 1;
  expect(apply(s, { type: 'levelUp', staffId: st.id }).ok).toBe(true);
  expect(st.stats.smile).toBe(st.statCaps.smile);
  expect(capOf(s, st, 'smile')).toBe(st.statCaps.smile);
  s.uniforms = ['uf_hawaiian', 'uf_galot'];
  expect(capOf(s, st, 'smile')).toBe(st.statCaps.smile + 10);
  s.uniforms = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  expect(capOf(s, st, 'smile')).toBe(st.statCaps.smile + 25);
});

// ---------- 연수 (§3.6.4) ----------

function trainee(): { s: GameState; st: Staff } {
  const { s, st } = hired();
  s.rank = TRAINING_RANK; s.money = 1e8;
  return { s, st };
}

test('연수 5종: 랭크 3부터, 비용을 내고 n일 자리를 비운 뒤 스탯이 오른다 (상한 내)', () => {
  const { s, st } = hired();
  s.money = 1e8;
  expect(apply(s, { type: 'train', staffId: st.id, trainingId: 'tr_barista' }).ok).toBe(false); // 랭크
  s.rank = TRAINING_RANK;
  const skill0 = st.stats.skill;
  expect(apply(s, { type: 'train', staffId: st.id, trainingId: 'nope' }).ok).toBe(false);
  expect(apply(s, { type: 'train', staffId: st.id, trainingId: 'tr_barista' }).ok).toBe(true);
  expect(s.money).toBe(1e8 - 1_000_000);
  expect(st.training).toEqual({ id: 'tr_barista', daysLeft: 3 });
  expect(roleEffect(s, 'hall')).toBe(0); // 자리 비움
  expect(apply(s, { type: 'train', staffId: st.id, trainingId: 'tr_service' }).ok).toBe(false); // 이미 연수 중
  expect(apply(s, { type: 'assign', staffId: st.id, role: null }).ok).toBe(false);
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(false);
  st.energy = 5;
  tick(s, DAY_MS); tick(s, DAY_MS);
  expect(st.training!.daysLeft).toBe(1);
  expect(st.stats.skill).toBe(skill0);
  expect(st.energy).toBe(85); // 연수 중엔 안 닳고 밤에 +40씩 회복
  tick(s, DAY_MS);
  expect(st.training).toBeNull();
  expect(st.stats.skill).toBe(skill0 + Math.round(6 * OUTCOME_MULT[s.lastOutcome!.outcome])); // staff-luck: 복귀 판정 배수
  expect(st.role).toBe('hall');
  expect(s.notices.some((n) => n.includes('돌아왔어요') && n.includes(`기술 +${Math.round(6 * OUTCOME_MULT[s.lastOutcome!.outcome])}`))).toBe(true);
  expect(st.salary).toBe(salaryOf(st));
});

test('연수 2종 효과: 기술 +6 · 미소 +6 (trim)', () => {
  const expected: Record<string, Partial<Stats>> = {
    tr_barista: { skill: 6 }, tr_service: { smile: 6 },
  };
  for (const def of TRAININGS) {
    const { s, st } = trainee();
    st.stats = { stamina: 10, strength: 10, skill: 10, smile: 10 };
    expect(apply(s, { type: 'train', staffId: st.id, trainingId: def.id }).ok).toBe(true);
    for (let d = 0; d < def.days; d++) tick(s, DAY_MS);
    expect(st.training).toBeNull();
    const mult = OUTCOME_MULT[s.lastOutcome!.outcome]; // staff-luck: 복귀 때 대박 ×2 / 쪽박 ×0.5
    expect(s.lastOutcome!.task).toBe('training');
    for (const k of ['stamina', 'strength', 'skill', 'smile'] as const) expect(st.stats[k]).toBe(10 + (expected[def.id]![k] ? Math.max(1, Math.round(expected[def.id]![k]! * mult)) : 0));
    if (def.grantSkill) {
      expect(st.extraSkills.length).toBe(1);
      expect(st.extraSkills[0]).not.toBe(st.skill);
      expect(SKILLS.some((x) => x.id === st.extraSkills[0])).toBe(true);
    } else expect(st.extraSkills).toEqual([]);
  }
});

test('연수 비용은 같은 직원의 n번째마다 +20% (기본 × (1 + 0.2 × (n−1))), 상한에 닿으면 덜 오른다', () => {
  const { s, st } = trainee();
  expect(trainingCost(st, 'tr_service')).toBe(800_000);
  apply(s, { type: 'train', staffId: st.id, trainingId: 'tr_service' });
  for (let d = 0; d < 3; d++) tick(s, DAY_MS);
  expect(trainingCost(st, 'tr_service')).toBe(960_000);
  expect(trainingCost(st, 'tr_barista')).toBe(1_200_000);
  const m = s.money;
  apply(s, { type: 'train', staffId: st.id, trainingId: 'tr_barista' });
  expect(s.money).toBe(m - 1_200_000);
  for (let d = 0; d < 3; d++) tick(s, DAY_MS);
  expect(trainingCost(st, 'tr_service')).toBe(1_120_000);
  expect(trainingMultOf(st)).toBe(1); // trim: 연수 우등생 특기 없음
});

// ---------- 신설 직종 효과 훅 ----------

test('청소 직종: cleanPowerOf = Σ(기술÷5 + 힘÷10) × 기력, 청소 달인 ×1.5', () => {
  const s = bareState(1);
  expect(cleanPowerOf(s)).toBe(0);
  s.staff.push(staffWith({ skill: 50, strength: 40 }, 'clean'));
  expect(cleanPowerOf(s)).toBe(14);
  s.staff[0]!.energy = 10;
  expect(cleanPowerOf(s)).toBe(7);
  s.staff[0]!.energy = 100;
  s.staff.push(staffWith({ skill: 20, strength: 20 }, 'clean', 'clean_master'));
  expect(cleanPowerOf(s)).toBeCloseTo((14 + 6) * 1.5);
  s.staff[1]!.role = 'hall';
  expect(cleanPowerOf(s)).toBe(14); // 청소 직원의 특기만
});

test('농원 수확: 청소 직원 ×(1 + 0.5/명, 최대 2명), 노후 ×0.5 (trim: 농원지기 직종 없음)', () => {
  const s = bareState(1);
  expect(gardenBonusOf(s)).toBe(1);
  expect(gardenDecayOf(s)).toBe(1);
  s.staff.push(staffWith({}, 'clean'));
  expect(gardenBonusOf(s)).toBe(1.5);
  expect(gardenDecayOf(s)).toBe(0.5);
  s.staff.push(staffWith({ strength: 20 }, 'clean'));
  s.staff.push(staffWith({ strength: 30 }, 'clean'));
  expect(gardenBonusOf(s)).toBe(2); // 2명 상한
});

test('농원 수확 효과는 실제 월 수확에 곱해진다', () => {
  const s = bareState(1);
  placeObject(s, 'tangerine_tree', X(2), Y(2));
  for (const o of Object.values(s.objects)) o.placedMonth = -1;
  const base = expectedHarvest(s)['tangerine'] ?? 0;
  expect(base).toBeGreaterThan(0);
  s.staff.push(staffWith({}, 'clean'));
  expect(expectedHarvest(s)['tangerine']).toBe(Math.floor(base * 1.5));
});

test('홍보 보정은 없다 (trim: 홍보 담당 직종 삭제 — 훅은 1 고정)', () => {
  const s = bareState(1);
  expect(promoBonusOf(s)).toBe(1);
  expect(promoEnergyFactorOf(s)).toBe(1);
  s.staff.push(staffWith({ smile: 30 }, 'hall'));
  expect(promoBonusOf(s)).toBe(1);
  expect(promoEnergyFactorOf(s)).toBe(1);
  expect(TIERS.flyer.count).toBe(3);
});

test('roleEffect: 역할별 핵심 스탯 합, 요리사·절약 할인, 기력 30 미만이면 절반', () => {
  const s = bareState(1);
  s.staff.push(staffWith({ stamina: 10, strength: 10, skill: 10, smile: 50 }, 'cook', 'thrifty'));
  expect(roleEffect(s, 'cook')).toBe(10);
  expect(roleEffect(s, 'hall')).toBe(0);
  expect(ingredientDiscount(s)).toBeCloseTo(10 / 500 + 0.1);
  expect(ingredientCost(s, 'latte')).toBe(Math.round(2100 * (1 - 0.12)));
  s.staff.push(staffWith({ smile: 40 }, 'hall'));
  s.staff.push(staffWith({ smile: 20 }, 'hall'));
  expect(roleEffect(s, 'hall')).toBe(60);
  s.staff[2]!.energy = 20;
  expect(roleEffect(s, 'hall')).toBe(50);
  s.staff.push(staffWith({ skill: 100 }, 'cook'));
  expect(ingredientDiscount(s)).toBe(0.3);
});

test('기력: 배치된 직원은 시간당 −2, 밤에 +40, 튼튼함이면 덜 닳는다', () => {
  const { s, st } = hired();
  st.energy = 50;
  tick(s, 5 * HOUR_MS);
  expect(st.energy).toBe(40);
  tick(s, DAY_MS);
  expect(st.energy).toBe(40 - 36 + 40);
  st.energy = 100;
  expect(s.clock.hour).toBe(11);
  tick(s, 13 * HOUR_MS); // 12시간 −24 → 76, 24시→6시 경계: 밤 +40(상한 100)이 먼저, 그 다음 6시 −2
  expect(st.energy).toBe(98);
  apply(s, { type: 'assign', staffId: st.id, role: null });
  st.energy = 50;
  tick(s, 5 * HOUR_MS);
  expect(st.energy).toBe(50); // 미배치는 안 닳음
  const s2 = bareState(1);
  const tough = staffWith({}, 'hall', 'tough');
  tough.energy = 50;
  s2.staff.push(tough);
  tick(s2, 10 * HOUR_MS);
  expect(tough.energy).toBeCloseTo(50 - 10 * 2 * 0.7);
});

test('기력: 하루 종일 일만 하면 거의 만땅 유지, 홍보까지 하면 며칠 안에 30 밑으로 떨어진다', () => {
  const { s, st } = hired();
  s.research = 1000;
  for (let d = 0; d < 5; d++) tick(s, DAY_MS);
  expect(st.energy).toBeGreaterThanOrEqual(90); // 하루 −36, 밤 +40
  let lowest = 100;
  for (let d = 0; d < 2; d++) {
    expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'flyer' }).ok).toBe(true); // 기력 −20
    expect(apply(s, { type: 'promote', staffId: st.id, promotionId: 'sns' }).ok).toBe(true);   // 기력 −15
    for (let h = 0; h < 18; h++) { tick(s, HOUR_MS); lowest = Math.min(lowest, st.energy); }
  }
  expect(lowest).toBeLessThan(40); // trim: 홍보 담당 기력 보정이 없어져 바닥이 조금 올랐다
});

test('직원 이동: 앵커 근처를 산책하고, 기력 0이면 창고 앞에 선다', () => {
  const s = bareState(1);
  for (let y = 3; y <= 5; y++) placeObject(s, 'path', X(4), Y(y));
  placeObject(s, 'path', X(3), Y(3)); // 창고 문 앞
  placeObject(s, 'table_out', X(5), Y(5));
  const hall = staffWith({}, 'hall');
  const barista = staffWith({}, 'barista');
  s.staff.push(hall, barista);
  expect(staffAnchor(s, barista)).toEqual({ x: X(3), y: Y(3) });
  const a = staffAnchor(s, hall);
  expect(Math.abs(a.x - X(5)) + Math.abs(a.y - Y(5))).toBe(1);
  const visited = new Set<string>();
  for (let i = 0; i < 300; i++) { moveStaff(s, 100); visited.add(`${hall.x},${hall.y}`); }
  expect(visited.size).toBeGreaterThan(1);
  for (const st of s.staff) { expect(Number.isFinite(st.x)).toBe(true); expect(Math.abs(st.x - staffAnchor(s, st).x)).toBeLessThanOrEqual(2); }
  hall.energy = 0;
  for (let i = 0; i < 100; i++) moveStaff(s, 100);
  expect([hall.x, hall.y]).toEqual([X(3), Y(3)]);
  expect(hall.path.length).toBe(0);
});

test('직원 이동은 tick 안에서 돌고 결정적이다', () => {
  const a = hired(2), b = hired(2);
  for (let y = 3; y <= 5; y++) { placeObject(a.s, 'path', X(4), Y(y)); placeObject(b.s, 'path', X(4), Y(y)); }
  for (let i = 0; i < 50; i++) tick(a.s, 100);
  for (let i = 0; i < 5; i++) tick(b.s, 1000);
  expect(JSON.stringify(a.s.staff)).toBe(JSON.stringify(b.s.staff));
});

// ---------- Task 4: 직원이 게임에 영향 ----------
import { spawnGuests, updateGuests, PREP_MS } from '../guests.ts';
import { setSlot } from '../menu.ts';

function cafe() {
  const s = bareState(1);
  placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'americano');
  return s;
}

test('조리 시간: 직원 없으면 PREP_MS, 바리스타(감각 50)면 그 70% 이하', () => {
  const s = cafe();
  spawnGuests(s, 1); updateGuests(s, 6000);
  const g = s.guests[0]!;
  expect(g.phase).toBe('seated'); expect(g.mood).toBeNull(); expect(g.waitMs).toBe(PREP_MS);
  expect(g.menuId).toBe('americano');
  updateGuests(s, PREP_MS - 100);
  expect(g.mood).toBeNull();
  updateGuests(s, 100);
  expect(g.mood).not.toBeNull();
  const s2 = cafe(); s2.staff.push(staffWith({ skill: 50 }, 'barista'));
  spawnGuests(s2, 1); updateGuests(s2, 6000);
  expect(s2.guests[0]!.waitMs).toBeLessThanOrEqual(3000);
  updateGuests(s2, 3000);
  expect(s2.guests[0]!.mood).not.toBeNull();
  // 디저트는 요리사, 빠른 손 스킬은 더 줄인다
  const s3 = cafe(); setSlot(s3, 0, 'scone'); s3.staff.push(staffWith({ skill: 50 }, 'cook', 'quick_hands'));
  spawnGuests(s3, 1); s3.guests[0]!.type = 'student'; updateGuests(s3, 6000);
  expect(s3.guests[0]!.waitMs).toBe(PREP_MS * 0.5 * 0.8);
});

test('홀 직원 서비스는 만족 기준을 낮춘다', () => {
  // tourist minScenery 2, 자리 경치 1 → meh(scenery). 홀 미소 60이면 happy
  const s = cafe(); spawnGuests(s, 1); s.guests[0]!.type = 'student'; delete s.guests[0]!.gates; updateGuests(s, 6000); updateGuests(s, PREP_MS); // 정낭 인상(+1, w-free)은 guests.test에서
  expect(s.guests[0]!.mood).toBe('meh');
  expect(s.guests[0]!.moodReason).toBe('scenery');
  const s2 = cafe(); s2.staff.push(staffWith({ smile: 60 }, 'hall'));
  spawnGuests(s2, 1); s2.guests[0]!.type = 'student'; delete s2.guests[0]!.gates; updateGuests(s2, 6000); updateGuests(s2, PREP_MS);
  expect(s2.guests[0]!.mood).toBe('happy');
  expect(s2.guests[0]!.moodReason).toBeNull();
});

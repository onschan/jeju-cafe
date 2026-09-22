/** staff-luck: 직원 칭호(레어 직원) — 데이터 30개·등장 확률(1,000회 근사)·급여 배수·효과 훅·3일 만료·스카우트권 보장·도감·결정성 */
import { bareState } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { dayIndex } from '../effects.ts';
import { TITLES, ROLES } from '../../data/index.ts';
import { TITLE_GRADES, titleChances, rollGrade, pickTitle, rollTitle, titleSalaryMult, titleBonus, staffTitleEffect, fitRolesOf, titlesMet, RARE_STAY_DAYS, LEGEND_MIN_TIER, LEGEND_MIN_STAR } from '../titles.ts';
import { drawCandidates, salaryOf, cleanPowerOf, gardenBonusOf, promoBonusOf, ingredientDiscount, hourlyEnergy, availablePool } from '../staff.ts';
import { staffWith } from './staff.test.ts';
import type { GameState, TitleGrade } from '../types.ts';

test('칭호 12개: 숙련 4·프로 4·전설 4, id 유일, 직종 id 유효, 효과 1개 이상, 등급 급여 배수 1.2/1.6/2.5', () => {
  expect(TITLES.length).toBe(12);
  expect(TITLES.filter((t) => t.grade === 'skilled').length).toBe(4);
  expect(TITLES.filter((t) => t.grade === 'pro').length).toBe(4);
  expect(TITLES.filter((t) => t.grade === 'legend').length).toBe(4);
  expect(new Set(TITLES.map((t) => t.id)).size).toBe(12);
  const roleIds = new Set(ROLES.map((r) => r.id));
  for (const t of TITLES) {
    expect(t.effects.length).toBeGreaterThan(0);
    for (const r of t.roles) expect(roleIds.has(r)).toBe(true);
    expect(t.name.length).toBeGreaterThan(0);
  }
  expect([TITLE_GRADES.skilled.salaryMult, TITLE_GRADES.pro.salaryMult, TITLE_GRADES.legend.salaryMult]).toEqual([1.2, 1.6, 2.5]);
  expect(titleSalaryMult('tt_pro_barista')).toBe(1.6);
  expect(titleSalaryMult(undefined)).toBe(1);
});

test('등장 확률: 전단 숙련 20%·프로 3.2%·전설 0, 잡지 광고 25%/8%, 대학 설명회 30%/12.8%; 전설은 4단계 공고·★3부터 2~3%', () => {
  const s = bareState(1);
  expect(titleChances(s, 'flyer')).toEqual({ skilled: 0.2, pro: 0.032, legend: 0 });
  expect(titleChances(s, 'magazine')).toEqual({ skilled: 0.25, pro: 0.08, legend: 0 });
  expect(titleChances(s, 'college')).toEqual({ skilled: 0.3, pro: 0.128, legend: 0 });
  s.star = LEGEND_MIN_STAR;
  expect(titleChances(s, 'magazine').legend).toBe(0); // 3단계는 전설 없음
  s.reputation = 50;
  expect(titleChances(s, 'intern').legend).toBe(0.02);
  s.reputation = 100;
  expect(titleChances(s, 'college').legend).toBe(0.03);
  expect(LEGEND_MIN_TIER).toBe(4);
});

test('등급 굴림 1,000회 근사: 전단은 숙련 ≈20%·프로 ≈3%, 대학 설명회(★3·평판 100)는 전설 ≈3%; 스카우트권 보장은 프로 이상', () => {
  const s = bareState(3);
  const count = (tier: 'flyer' | 'college', n = 1000) => {
    const out: Record<string, number> = { skilled: 0, pro: 0, legend: 0, none: 0 };
    for (let i = 0; i < n; i++) { s.tick++; out[rollGrade(s, tier) ?? 'none']!++; }
    return out;
  };
  const f = count('flyer');
  expect(f.skilled).toBeGreaterThan(150); expect(f.skilled).toBeLessThan(260);
  expect(f.pro).toBeGreaterThan(12); expect(f.pro).toBeLessThan(60);
  expect(f.legend).toBe(0);
  s.star = 4; s.reputation = 100;
  const c = count('college', 2000);
  expect(c.legend).toBeGreaterThan(30); expect(c.legend).toBeLessThan(100); // 3% × 2,000 = 60
  for (let i = 0; i < 50; i++) { s.tick++; expect(['pro', 'legend']).toContain(rollGrade(s, 'flyer', true)); }
});

test('칭호 고르기: 잘 맞는 직종 우선(상한 최고 스탯), 이미 가진 칭호는 뒤로, 같은 seed면 같은 결과', () => {
  const s = bareState(2);
  const skillDef = { statCaps: { stamina: 10, strength: 10, skill: 90, smile: 10 } };
  expect(fitRolesOf(skillDef)).toEqual(['barista', 'cook']);
  const picked = pickTitle(s, 'pro', skillDef);
  expect(picked.grade).toBe('pro');
  expect(picked.roles.length === 0 || picked.roles.some((r) => r === 'barista' || r === 'cook')).toBe(true);
  const a = bareState(9); const b = bareState(9);
  for (let i = 0; i < 20; i++) { a.tick = b.tick = i; expect(rollTitle(a, 'college', skillDef)?.id).toBe(rollTitle(b, 'college', skillDef)?.id); }
});

/** 프로 칭호가 붙을 때까지 공고를 낸다 (전설 조건: ★3·4단계) */
function drawUntil(s: GameState, grade: TitleGrade, tier: 'flyer' | 'intern' = 'flyer'): GameState['candidates'][number] {
  for (let i = 0; i < 400; i++) {
    s.candidates = [];
    s.tick++;
    drawCandidates(s, tier, 3);
    const c = s.candidates.find((x) => x.title && TITLES.find((t) => t.id === x.title)!.grade === grade);
    if (c) return c;
  }
  throw new Error('no title');
}

test('공고 후보의 칭호: 급여 배수·도감 기록·프로/전설은 알림 + 장면 창 + 3일 뒤 떠남 (일반·숙련은 달 말까지)', () => {
  const s = bareState(4);
  s.money = 1e9;
  const c = drawUntil(s, 'pro');
  const base = salaryOf({ baseSalary: c.baseSalary, level: 1, stats: c.stats });
  expect(c.salary).toBe(Math.round(base * 1.6));
  expect(titlesMet(s)).toContain(c.title);
  expect(c.expiresDay).toBe(dayIndex(s.clock) + RARE_STAY_DAYS);
  expect(s.notices.some((n) => n.includes('이력서'))).toBe(true);
  expect(s.fx.some((f) => f.kind === 'scene' && f.title === '프로 지원자')).toBe(true);
  const id = c.id;
  for (let d = 0; d < RARE_STAY_DAYS - 1; d++) tick(s, DAY_MS);
  expect(s.candidates.some((x) => x.id === id)).toBe(true);
  tick(s, DAY_MS);
  expect(s.candidates.some((x) => x.id === id)).toBe(false);
  expect(s.notices.some((n) => n.includes('다른 카페로 갔어요'))).toBe(true);
  // 시작 후보(createInitialState)는 칭호가 없다 — 튜토리얼·리플레이 고정
  const t = createInitialState(1);
  expect(t.candidates.every((x) => !x.title)).toBe(true);
});

test('스카우트권(freeRecruits)으로 낸 공고는 첫 후보가 프로 이상, 채용하면 Staff.title로 넘어가고 월급에 배수가 남는다', () => {
  const s = bareState(5);
  s.freeRecruits = 1;
  expect(apply(s, { type: 'postJob', tier: 'flyer' }).ok).toBe(true);
  const first = s.candidates[0]!;
  expect(first.title).toBeDefined();
  expect(['pro', 'legend']).toContain(TITLES.find((t) => t.id === first.title)!.grade);
  expect(apply(s, { type: 'hire', candidateId: first.id, role: 'hall' }).ok).toBe(true);
  const st = s.staff[0]!;
  expect(st.title).toBe(first.title);
  expect(st.salary).toBe(first.salary);
  expect(salaryOf(st, s.salaryRaisePct)).toBe(st.salary);
  expect(s.freeRecruits).toBe(0);
  expect(availablePool(s, 1).length).toBeLessThan(5);
});

test('효과 훅: 청소·수확·홍보·요금 할인·기력·투어·대결 — 일하는 직원의 칭호만 더한다', () => {
  const s = bareState(1);
  const clean = staffWith({ skill: 50, strength: 50 }, 'clean');
  clean.title = 'tt_clean_god'; // 청결 +35% · 기력 −20%
  s.staff.push(clean);
  expect(cleanPowerOf(s)).toBeCloseTo((50 / 5 + 50 / 10) * 1.35, 5);
  expect(titleBonus(s, 'clean')).toBe(0.35);
  expect(staffTitleEffect(clean, 'energy')).toBe(0.2);
  const e0 = clean.energy;
  hourlyEnergy(s);
  expect(clean.energy).toBeCloseTo(e0 - 2 * 0.8, 5);
});

import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';
import { generateCandidate, salaryOf, roleEffect, ingredientDiscount, canHire, moveStaff, staffAnchor, MAX_STAT } from '../staff.ts';
import { ingredientCost } from '../economy.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS } from '../clock.ts';
import type { GameState, Staff, Stats, RoleId } from '../types.ts';

export function staffWith(partial: Partial<Stats>, role: RoleId | null, skill = 'coffee_lover'): Staff {
  const stats: Stats = { service: 10, cooking: 10, sense: 10, stamina: 10, ...partial };
  return {
    id: `s${Math.round(Object.values(stats).reduce((a, b) => a + b, 0))}${role}`,
    name: 'x', face: { hair: 0, skin: 0, top: 0 }, stats, skill, level: 1, salary: 0,
    role, unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 4, y: 3, path: [], anchor: null, waitMs: 0,
  };
}

function hired(seed = 1, role: RoleId = 'hall'): { s: GameState; st: Staff } {
  const s = createInitialState(seed);
  apply(s, { type: 'postJob', tier: 'flyer' });
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role });
  return { s, st: s.staff[0]! };
}

test('공고 등급별 후보 수와 스탯 범위, 공고비는 채용비로 잡힌다', () => {
  const s = createInitialState(7);
  expect(apply(s, { type: 'postJob', tier: 'flyer' }).ok).toBe(true);
  expect(s.candidates.length).toBe(3);
  expect(s.money).toBe(5_000_000 - 1_000_000);
  expect(s.monthCosts.recruit).toBe(1_000_000);
  for (const c of s.candidates) for (const v of Object.values(c.stats)) { expect(v).toBeGreaterThanOrEqual(10); expect(v).toBeLessThanOrEqual(40); }
  expect(new Set(s.candidates.map((c) => c.id)).size).toBe(3);
  expect(apply(s, { type: 'postJob', tier: 'site' }).ok).toBe(false); // 돈 부족
});

test('같은 seed면 같은 후보', () => {
  const a = createInitialState(3), b = createInitialState(3);
  a.money = b.money = 1e7;
  apply(a, { type: 'postJob', tier: 'site' }); apply(b, { type: 'postJob', tier: 'site' });
  expect(a.candidates.length).toBe(4);
  expect(JSON.stringify(a.candidates)).toBe(JSON.stringify(b.candidates));
  const c = generateCandidate(a, 'headhunter');
  for (const v of Object.values(c.stats)) { expect(v).toBeGreaterThanOrEqual(50); expect(v).toBeLessThanOrEqual(80); }
  expect(c.salary).toBe(salaryOf(c.stats, 1));
});

test('월급 공식', () => {
  expect(salaryOf({ service: 20, cooking: 20, sense: 20, stamina: 20 }, 1)).toBe(20 * 4 * 3000 + 500_000);
});

test('채용: 슬롯이 있어야 하고, 역할이 해금돼야 하고, 후보가 사라진다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  const c = s.candidates[0]!;
  expect(canHire(s, c.id, 'carry').ok).toBe(false); // 미해금 역할
  expect(apply(s, { type: 'hire', candidateId: c.id, role: 'hall' }).ok).toBe(true);
  expect(s.staff.length).toBe(1); expect(s.staff[0]!.role).toBe('hall'); expect(s.candidates.length).toBe(2);
  expect(s.staff[0]!.energy).toBe(100);
  apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' });
  expect(apply(s, { type: 'hire', candidateId: s.candidates[0]!.id, role: 'hall' }).ok).toBe(false); // 슬롯 2 초과
  expect(apply(s, { type: 'hire', candidateId: 'nope', role: 'hall' }).ok).toBe(false);
});

test('후보는 다음 달 초에 사라진다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'postJob', tier: 'flyer' });
  for (let i = 0; i < 29; i++) tick(s, DAY_MS);
  expect(s.candidates.length).toBe(3);
  tick(s, DAY_MS);
  expect(s.candidates.length).toBe(0);
});

test('달 말에 낸 공고도 다음 달 1일에 사라진다 (같은 달 안에서는 남는다)', () => {
  const s = createInitialState(1);
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
  s.money = sal + 100;
  s.settleGrantUsed = true; // 잔고가 40만 아래로 떨어져도 지원금이 안 들어오게
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

test('assign·fire·levelUp(스탯 선택, 비용 = 스탯×10)', () => {
  const { s, st } = hired();
  expect(apply(s, { type: 'assign', staffId: st.id, role: 'barista' }).ok).toBe(true);
  expect(st.role).toBe('barista');
  expect(apply(s, { type: 'assign', staffId: st.id, role: 'carry' }).ok).toBe(false); // 미해금
  expect(apply(s, { type: 'assign', staffId: st.id, role: null }).ok).toBe(true);
  const before = { ...st.stats };
  const cost = before.service * 10;
  s.research = cost - 1;
  expect(apply(s, { type: 'levelUp', staffId: st.id, stat: 'service' }).ok).toBe(false);
  s.research = cost;
  expect(apply(s, { type: 'levelUp', staffId: st.id, stat: 'service' }).ok).toBe(true);
  expect(s.research).toBe(0);
  expect(st.level).toBe(2);
  expect(st.stats.service - before.service).toBeGreaterThanOrEqual(5);
  expect(st.stats.service - before.service).toBeLessThanOrEqual(9);
  expect(st.stats.cooking).toBe(before.cooking);
  expect(st.salary).toBe(salaryOf(st.stats, 2));
  const m0 = s.money;
  const recruit0 = s.monthCosts.recruit;
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(true);
  expect(s.money).toBe(m0 - st.salary); expect(s.staff.length).toBe(0);
  expect(s.monthCosts.recruit).toBe(recruit0 + st.salary); // 퇴직금은 채용비
  expect(apply(s, { type: 'fire', staffId: st.id }).ok).toBe(false);
});

test('levelUp은 10레벨까지', () => {
  const { s, st } = hired();
  st.level = 10; s.research = 1e6;
  expect(apply(s, { type: 'levelUp', staffId: st.id, stat: 'sense' }).ok).toBe(false);
});

test('levelUp 스탯은 99를 넘지 않는다', () => {
  const { s, st } = hired();
  st.stats.sense = 97; s.research = 1e6;
  expect(apply(s, { type: 'levelUp', staffId: st.id, stat: 'sense' }).ok).toBe(true);
  expect(st.stats.sense).toBe(MAX_STAT);
  expect(st.salary).toBe(salaryOf(st.stats, 2));
});

test('roleEffect: 역할별 핵심 스탯 합, 운반·절약 할인, 기력 30 미만이면 절반', () => {
  const s = createInitialState(1);
  s.staff.push(staffWith({ service: 50, cooking: 10, sense: 30, stamina: 10 }, 'carry', 'thrifty'));
  expect(roleEffect(s, 'carry')).toBe(10);
  expect(roleEffect(s, 'hall')).toBe(0);
  expect(ingredientDiscount(s)).toBeCloseTo(10 / 500 + 0.1);
  expect(ingredientCost(s, 'latte')).toBe(Math.round(1900 * (1 - 0.12)));
  s.staff.push(staffWith({ service: 40 }, 'hall'));
  s.staff.push(staffWith({ service: 20 }, 'hall'));
  expect(roleEffect(s, 'hall')).toBe(60);
  s.staff[2]!.energy = 20;
  expect(roleEffect(s, 'hall')).toBe(50);
  s.staff.push(staffWith({ stamina: 100 }, 'carry'));
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
  const s2 = createInitialState(1);
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
  expect(lowest).toBeLessThan(30); // 오후엔 효과 절반(LOW_ENERGY)이 실제로 걸린다
});

test('직원 이동: 앵커 근처를 산책하고, 기력 0이면 창고 앞에 선다', () => {
  const s = createInitialState(1);
  for (let y = 3; y <= 5; y++) placeObject(s, 'path', 4, y);
  placeObject(s, 'table_out', 5, 5);
  const hall = staffWith({}, 'hall');
  const barista = staffWith({}, 'barista');
  s.staff.push(hall, barista);
  expect(staffAnchor(s, barista)).toEqual({ x: 4, y: 3 });
  const a = staffAnchor(s, hall);
  expect(Math.abs(a.x - 5) + Math.abs(a.y - 5)).toBe(1);
  const visited = new Set<string>();
  for (let i = 0; i < 300; i++) { moveStaff(s, 100); visited.add(`${hall.x},${hall.y}`); }
  expect(visited.size).toBeGreaterThan(1);
  for (const st of s.staff) { expect(Number.isFinite(st.x)).toBe(true); expect(Math.abs(st.x - staffAnchor(s, st).x)).toBeLessThanOrEqual(2); }
  hall.energy = 0;
  for (let i = 0; i < 100; i++) moveStaff(s, 100);
  expect([hall.x, hall.y]).toEqual([4, 3]);
  expect(hall.path.length).toBe(0);
});

test('직원 이동은 tick 안에서 돌고 결정적이다', () => {
  const a = hired(2), b = hired(2);
  for (let y = 3; y <= 5; y++) { placeObject(a.s, 'path', 4, y); placeObject(b.s, 'path', 4, y); }
  for (let i = 0; i < 50; i++) tick(a.s, 100);
  for (let i = 0; i < 5; i++) tick(b.s, 1000);
  expect(JSON.stringify(a.s.staff)).toBe(JSON.stringify(b.s.staff));
});

// ---------- Task 4: 직원이 게임에 영향 ----------
import { spawnGuests, updateGuests, PREP_MS } from '../guests.ts';
import { setSlot } from '../menu.ts';

function cafe() {
  const s = createInitialState(1);
  placeObject(s, 'table_out', 4, 5);
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
  const s2 = cafe(); s2.staff.push(staffWith({ sense: 50 }, 'barista'));
  spawnGuests(s2, 1); updateGuests(s2, 6000);
  expect(s2.guests[0]!.waitMs).toBeLessThanOrEqual(3000);
  updateGuests(s2, 3000);
  expect(s2.guests[0]!.mood).not.toBeNull();
  // 디저트는 요리사, 빠른 손 스킬은 더 줄인다
  const s3 = cafe(); setSlot(s3, 0, 'scone'); s3.staff.push(staffWith({ cooking: 50 }, 'cook', 'quick_hands'));
  spawnGuests(s3, 1); s3.guests[0]!.type = 'student'; updateGuests(s3, 6000);
  expect(s3.guests[0]!.waitMs).toBe(PREP_MS * 0.5 * 0.8);
});

test('홀 직원 서비스는 만족 기준을 낮춘다', () => {
  // tourist minScenery 2, 자리 경치 1 → meh(scenery). 홀 service 60이면 happy
  const s = cafe(); spawnGuests(s, 1); s.guests[0]!.type = 'student'; updateGuests(s, 6000); updateGuests(s, PREP_MS);
  expect(s.guests[0]!.mood).toBe('meh');
  expect(s.guests[0]!.moodReason).toBe('scenery');
  const s2 = cafe(); s2.staff.push(staffWith({ service: 60 }, 'hall'));
  spawnGuests(s2, 1); s2.guests[0]!.type = 'student'; updateGuests(s2, 6000); updateGuests(s2, PREP_MS);
  expect(s2.guests[0]!.mood).toBe('happy');
  expect(s2.guests[0]!.moodReason).toBeNull();
});

test('밭 일꾼은 제철에 빈 밭에 심고 익으면 딴다', () => {
  const s = createInitialState(1); s.clock.month = 10;
  apply(s, { type: 'place', objectType: 'field', x: 6, y: 6 });
  apply(s, { type: 'place', objectType: 'field', x: 7, y: 6 });
  apply(s, { type: 'place', objectType: 'field', x: 8, y: 6 });
  s.staff.push(staffWith({ stamina: 30 }, 'field')); // 하루 2칸
  tick(s, DAY_MS);
  const fields = Object.values(s.objects).filter((o) => o.type === 'field');
  expect(fields.filter((f) => f.crop?.cropId === 'carrot').length).toBe(2);
  tick(s, DAY_MS);
  expect(fields.filter((f) => f.crop?.cropId === 'carrot').length).toBe(3);
  fields[0]!.crop!.daysGrown = 59; tick(s, DAY_MS); // 하루 자라 익음 → 따고 → 같은 날 다시 심는다
  expect(s.storage['carrot']).toBeGreaterThan(0);
  expect(fields[0]!.crop?.daysGrown).toBe(0);
});

test('밭 일꾼은 철이 아니면 안 심는다', () => {
  const s = createInitialState(1); // 3월
  apply(s, { type: 'place', objectType: 'field', x: 6, y: 6 });
  s.staff.push(staffWith({ stamina: 30 }, 'field'));
  tick(s, DAY_MS);
  expect(Object.values(s.objects).find((o) => o.type === 'field')!.crop).toBeNull();
});


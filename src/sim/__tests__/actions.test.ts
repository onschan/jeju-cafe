import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { spawnGuests, updateGuests } from '../guests.ts';
import { emptyMonthHarvest } from '../orchard.ts';
import { emptyMonthCosts } from '../economy.ts';

test('place: 돈이 있어야 하고, 깎이고, 로그에 남는다', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'place', objectType: 'stonewall', x: X(0), y: Y(0) }).ok).toBe(true);
  expect(s.money).toBe(5_000_000 - 20_000);
  expect(Object.values(s.objects).some((o) => o.type === 'stonewall')).toBe(true);
  expect(s.actionLog).toEqual([{ tick: 0, action: { type: 'place', objectType: 'stonewall', x: X(0), y: Y(0) } }]);
});

test('setSpeed·dismissMonthCard는 로그에 남지 않는다', () => {
  const s = bareState(1);
  apply(s, { type: 'setSpeed', speed: 2 });
  apply(s, { type: 'dismissMonthCard' });
  expect(s.actionLog.length).toBe(0);
});

test('place: 해금 안 된 오브젝트(목표 보상 시설)는 거부', () => {
  const s = bareState(1);
  const r = apply(s, { type: 'place', objectType: 'terrace_seat', x: X(0), y: Y(0) });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('아직 못 짓는 것');
});

test('place: 돈 부족', () => {
  const s = bareState(1);
  s.money = 100;
  expect(apply(s, { type: 'place', objectType: 'stonewall', x: X(0), y: Y(0) }).ok).toBe(false);
});

test('remove: 시작 오브젝트(정류장·창고)는 못 없앤다, 나머지는 전액 환불', () => {
  const s = bareState(1);
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop')!;
  expect(apply(s, { type: 'remove', objectId: bus.id }).ok).toBe(false);
  apply(s, { type: 'place', objectType: 'stonewall', x: X(0), y: Y(0) });
  const f = Object.values(s.objects).find((o) => o.type === 'stonewall')!;
  expect(apply(s, { type: 'remove', objectId: f.id }).ok).toBe(true);
  expect(s.money).toBe(5_000_000);
});

test('remove: 손님이 지나갈 올렛길은 못 없앤다', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(5) });
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(4) });
  const path = Object.values(s.objects).find((o) => o.type === 'path')!;
  spawnGuests(s, 1);
  expect(s.guests[0]!.path.some((p) => p.x === X(4) && p.y === Y(5))).toBe(true);
  expect(apply(s, { type: 'remove', objectId: path.id }).ok).toBe(false);
});

test('remove: 손님이 서 있는 칸(정낭 옆 올렛길)은 앉아 있는 동안에도 못 없앤다', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(5) });
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(4) });
  const path = Object.values(s.objects).find((o) => o.type === 'path')!;
  spawnGuests(s, 1);
  updateGuests(s, 10_000); // 앉음, 발밑은 (4,5)
  expect(s.guests[0]!.phase).toBe('seated');
  expect(apply(s, { type: 'remove', objectId: path.id }).ok).toBe(false);
});

test('기능 잠금: 진짜 시작 상태에선 필지 사기가 목표 안내와 함께 거부되고, 열면 통과한다', () => {
  const s = createInitialState(1);
  expect(s.features.parcel).toBe(false);
  const target = s.parcels.find((p) => !p.owned)!;
  const r = apply(s, { type: 'buyParcel', id: target.id });
  expect(r.ok).toBe(false);
  expect(r.reason).toContain('목표');
  expect(s.actionLog.length).toBe(0);
  s.features.parcel = true;
  s.money = 1e9;
  const r2 = apply(s, { type: 'buyParcel', id: target.id });
  // 열리면 기능 잠금 대신 필지 규칙(인접·개수·돈)으로 판정된다
  expect(r2.reason ?? '').not.toContain('목표');
});

test('dismissAlert는 alerts 큐 앞을 뺀다 (로그엔 안 남는다)', () => {
  const s = bareState(1);
  s.alerts.push({ type: 'goal', goalId: 'g01' }, { type: 'goal', goalId: 'g02' });
  expect(apply(s, { type: 'dismissAlert' }).ok).toBe(true);
  expect(s.alerts).toEqual([{ type: 'goal', goalId: 'g02' }]);
  expect(s.actionLog.length).toBe(0);
});

test('setSpeed·setSlot·dismissMonthCard', () => {
  const s = bareState(1);
  expect(apply(s, { type: 'setSpeed', speed: 3 }).ok).toBe(true);
  expect(s.clock.speed).toBe(3);
  expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
  s.lastMonthCard = { income: 1, guests: 1, month: 1, year: 1, costs: emptyMonthCosts(), net: 1, ...emptyMonthHarvest(), topMenu: null, deficitStreak: 0, loanTaken: 0, loanBalance: 0, rivalLossPct: 0, guestsLeft: 0 };
  apply(s, { type: 'dismissMonthCard' });
  expect(s.lastMonthCard).toBeNull();
});

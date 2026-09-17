import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { spawnGuests, updateGuests } from '../guests.ts';

test('place: 돈이 있어야 하고, 깎이고, 로그에 남는다', () => {
  const s = createInitialState(1);
  expect(apply(s, { type: 'place', objectType: 'field', x: X(0), y: Y(0) }).ok).toBe(true);
  expect(s.money).toBe(5_000_000 - 30_000);
  expect(Object.values(s.objects).some((o) => o.type === 'field')).toBe(true);
  expect(s.actionLog).toEqual([{ tick: 0, action: { type: 'place', objectType: 'field', x: X(0), y: Y(0) } }]);
});

test('setSpeed·dismissMonthCard는 로그에 남지 않는다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'setSpeed', speed: 2 });
  apply(s, { type: 'dismissMonthCard' });
  expect(s.actionLog.length).toBe(0);
});

test('place: 해금 안 된 오브젝트는 거부', () => {
  const s = createInitialState(1);
  const r = apply(s, { type: 'place', objectType: 'stonewall', x: X(0), y: Y(0) });
  expect(r.ok).toBe(false);
  expect(r.reason).toBe('아직 못 짓는 것');
});

test('place: 돈 부족', () => {
  const s = createInitialState(1);
  s.money = 100;
  expect(apply(s, { type: 'place', objectType: 'field', x: X(0), y: Y(0) }).ok).toBe(false);
});

test('remove: 시작 오브젝트(정류장·창고)는 못 없앤다, 나머지는 전액 환불', () => {
  const s = createInitialState(1);
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop')!;
  expect(apply(s, { type: 'remove', objectId: bus.id }).ok).toBe(false);
  apply(s, { type: 'place', objectType: 'field', x: X(0), y: Y(0) });
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  expect(apply(s, { type: 'remove', objectId: f.id }).ok).toBe(true);
  expect(s.money).toBe(5_000_000);
});

test('remove: 손님이 지나갈 올렛길은 못 없앤다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(5) });
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(4) });
  const path = Object.values(s.objects).find((o) => o.type === 'path')!;
  spawnGuests(s, 1);
  expect(s.guests[0]!.path.some((p) => p.x === X(4) && p.y === Y(5))).toBe(true);
  expect(apply(s, { type: 'remove', objectId: path.id }).ok).toBe(false);
});

test('remove: 손님이 서 있는 칸(정낭 옆 올렛길)은 앉아 있는 동안에도 못 없앤다', () => {
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(5) });
  apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(4) });
  const path = Object.values(s.objects).find((o) => o.type === 'path')!;
  spawnGuests(s, 1);
  updateGuests(s, 10_000); // 앉음, 발밑은 (4,5)
  expect(s.guests[0]!.phase).toBe('seated');
  expect(apply(s, { type: 'remove', objectId: path.id }).ok).toBe(false);
});

test('plant → harvest 흐름', () => {
  const s = createInitialState(1);
  s.clock.month = 10;
  apply(s, { type: 'place', objectType: 'field', x: X(0), y: Y(0) });
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  expect(apply(s, { type: 'plant', objectId: f.id, cropId: 'carrot' }).ok).toBe(true);
  expect(apply(s, { type: 'harvest', objectId: f.id }).ok).toBe(false);
  f.crop!.ready = true;
  expect(apply(s, { type: 'harvest', objectId: f.id }).ok).toBe(true);
  expect(s.storage['carrot']).toBe(2);
});

test('setSpeed·setSlot·unlock·dismissMonthCard', () => {
  const s = createInitialState(1);
  expect(apply(s, { type: 'setSpeed', speed: 3 }).ok).toBe(true);
  expect(s.clock.speed).toBe(3);
  expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
  expect(apply(s, { type: 'unlock' }).ok).toBe(false);
  s.research = 10;
  expect(apply(s, { type: 'unlock' }).ok).toBe(true);
  s.lastMonthCard = { income: 1, guests: 1, month: 1, year: 1, costs: { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0 }, net: 1 };
  apply(s, { type: 'dismissMonthCard' });
  expect(s.lastMonthCard).toBeNull();
});

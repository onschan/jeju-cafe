import { bareState, X, Y } from './helpers.ts';
import { placeObject, objectAt } from '../grid.ts';
import { apply } from '../actions.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, freeSeats } from '../guests.ts';
import { guestBlock, runPending, vacate, vacateWarning, VACATE_SATISFACTION } from '../pending.ts';
import { canDisturb } from '../actions.ts';
import { GUEST_SPEED_CELLS_PER_S } from '../guests.ts';

/** 정낭(4,6) 바로 위 (4,5)에 테이블 하나 — guests.test.ts와 같은 마당 */
function cafe() {
  const s = bareState(1);
  const seat = placeObject(s, 'table_out', X(4), Y(5));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 20;
  return { s, seat };
}
/** 손님이 자리에 앉을 때까지 걷게 한다 */
function seatThem(s: ReturnType<typeof cafe>['s']) {
  updateGuests(s, (8 / GUEST_SPEED_CELLS_PER_S) * 1000);
}

test('손님이 앉은 시설도 철거를 눌러 둘 수 있다 — 예약이 걸리고, 손님이 다 떠나면 그 즉시 치워진다', () => {
  const { s, seat } = cafe();
  spawnGuests(s, 1);
  seatThem(s);
  expect(s.guests[0]!.seatId).toBe(seat.id);
  expect(canDisturb(s, seat).ok).toBe(false);           // 지금 당장은 못 치운다
  expect(apply(s, { type: 'remove', objectId: seat.id }).ok).toBe(false);
  // 예약은 된다
  expect(apply(s, { type: 'reserveWork', objectId: seat.id, work: 'remove' }).ok).toBe(true);
  expect(s.objects[seat.id]!.pending!.kind).toBe('remove');
  runPending(s);
  expect(s.objects[seat.id]).toBeDefined();              // 손님이 있는 동안엔 그대로
  // 손님을 내보내면 바로 실행된다
  s.guests = [];
  expect(guestBlock(s, s.objects[seat.id]!)).toBeNull();
  runPending(s);
  expect(s.objects[seat.id]).toBeUndefined();
});

test('예약된 좌석은 새 손님이 안 고른다 (다른 빈 자리가 있을 때)', () => {
  const { s, seat } = cafe();
  const other = placeObject(s, 'table_out', X(5), Y(6));
  expect(freeSeats(s).map((o) => o.id).sort()).toEqual([seat.id, other.id].sort());
  apply(s, { type: 'reserveWork', objectId: seat.id, work: 'remove' });
  expect(freeSeats(s).map((o) => o.id)).toEqual([other.id]);
  // 남은 자리가 예약된 것뿐이면 예외적으로 앉힌다 — 예약은 그대로 남는다
  apply(s, { type: 'reserveWork', objectId: other.id, work: 'remove' });
  expect(freeSeats(s).map((o) => o.id).sort()).toEqual([seat.id, other.id].sort());
  expect(s.objects[seat.id]!.pending).toBeDefined();
});

test('예약 취소', () => {
  const { s, seat } = cafe();
  apply(s, { type: 'reserveWork', objectId: seat.id, work: 'upgrade' });
  expect(s.objects[seat.id]!.pending).toBeDefined();
  expect(apply(s, { type: 'cancelWork', objectId: seat.id }).ok).toBe(true);
  expect(s.objects[seat.id]!.pending).toBeUndefined();
  expect(apply(s, { type: 'cancelWork', objectId: seat.id }).ok).toBe(false); // 예약이 없으면 거부
});

test('이동 예약: 손님이 떠나면 예약한 칸으로 옮겨진다', () => {
  const { s, seat } = cafe();
  spawnGuests(s, 1);
  seatThem(s);
  expect(apply(s, { type: 'reserveWork', objectId: seat.id, work: 'move', x: X(2), y: Y(2) }).ok).toBe(true);
  s.guests = [];
  runPending(s);
  expect(objectAt(s, X(2), Y(2))?.id).toBe(seat.id);
});

test('「지금 바로」: 빈 자리가 있으면 손님을 옮겨 앉히고 예약을 실행한다', () => {
  const { s, seat } = cafe();
  const other = placeObject(s, 'table_out', X(5), Y(6));
  spawnGuests(s, 1);
  seatThem(s);
  const g = s.guests[0]!;
  expect(g.seatId).toBe(seat.id);
  expect(vacateWarning(s, seat)).toBeNull(); // 갈 데가 있다
  apply(s, { type: 'reserveWork', objectId: seat.id, work: 'remove' });
  expect(apply(s, { type: 'doWorkNow', objectId: seat.id }).ok).toBe(true);
  expect(g.seatId).toBe(other.id);
  expect(s.objects[seat.id]).toBeUndefined(); // 같은 순간에 치워진다
});

test('「지금 바로」: 갈 자리가 없으면 손님은 만족 −5로 돌아간다 (경고 문구가 미리 알린다)', () => {
  const { s, seat } = cafe();
  spawnGuests(s, 1);
  seatThem(s);
  const g = s.guests[0]!;
  const sat = s.guestTypes[g.type]?.satisfaction ?? 0;
  expect(vacateWarning(s, seat)).toContain('돌아가요');
  apply(s, { type: 'reserveWork', objectId: seat.id, work: 'remove' });
  apply(s, { type: 'doWorkNow', objectId: seat.id });
  expect(g.phase).toBe('leaving');
  expect(g.seatId).toBeNull();
  expect(s.guestTypes[g.type]!.satisfaction).toBe(Math.max(0, sat - VACATE_SATISFACTION));
  expect(s.objects[seat.id]).toBeUndefined();
});

test('일괄 철거: 손님이 앉은 것은 예약으로 남고 나머지는 바로 치운다', () => {
  const { s, seat } = cafe();
  const wall = placeObject(s, 'stonewall', X(2), Y(2));
  spawnGuests(s, 1);
  seatThem(s);
  expect(apply(s, { type: 'demolishMany', objectIds: [seat.id, wall.id] }).ok).toBe(true);
  expect(s.objects[wall.id]).toBeUndefined();
  expect(s.objects[seat.id]!.pending!.kind).toBe('remove');
  s.guests = [];
  runPending(s);
  expect(s.objects[seat.id]).toBeUndefined();
});

test('되돌리기: 손님이 앉아 있어도 막히지 않는다 — 손님은 비켜 준다', () => {
  const s = bareState(1);
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 20;
  expect(apply(s, { type: 'place', objectType: 'table_out', x: X(4), y: Y(5) }).ok).toBe(true);
  const seat = objectAt(s, X(4), Y(5))!;
  spawnGuests(s, 1);
  seatThem(s);
  expect(s.guests[0]!.seatId).toBe(seat.id);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  expect(s.objects[seat.id]).toBeUndefined();
});

test('vacate는 지나가는 손님은 건드리지 않는다 (앉은 손님만 정리)', () => {
  const { s, seat } = cafe();
  spawnGuests(s, 1);
  const g = s.guests[0]!;
  expect(g.phase).toBe('walking');
  const r = vacate(s, seat);
  expect(r.moved + r.left).toBe(1); // 자리를 맡아 둔 손님이라 정리 대상
  expect(s.guests).toHaveLength(1);
});

test('업그레이드 트리(같은 자리 다음 단계)도 예약으로 걸린다 — 손님이 떠나면 파라솔 테이블로 올라간다', () => {
  const { s, seat } = cafe();
  s.money = 5_000_000;
  spawnGuests(s, 1);
  seatThem(s);
  expect(apply(s, { type: 'treeUpgrade', objectId: seat.id }).ok).toBe(false); // 지금 당장은 못 올린다
  expect(apply(s, { type: 'reserveWork', objectId: seat.id, work: 'treeUpgrade' }).ok).toBe(true);
  s.guests = [];
  runPending(s);
  expect(s.objects[seat.id]!.type).toBe('table_parasol');
  expect(s.objects[seat.id]!.pending).toBeUndefined();
});

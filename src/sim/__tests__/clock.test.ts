import { createInitialState } from '../state.ts';
import { advanceClock, seasonOf, DAY_MS, HOUR_MS, monthIndex } from '../clock.ts';

test('초기 상태: 1년 3월 1일 6시, 30×16 격자(필지 6장), 시작 오브젝트', () => {
  const s = createInitialState(1);
  expect(s.clock).toMatchObject({ day: 1, month: 3, year: 1, hour: 6, speed: 1 });
  expect(s.createdAt).toBe(0);
  expect(createInitialState(1, 'p1', 123).createdAt).toBe(123);
  expect(s.grid.w).toBe(30);
  expect(s.grid.h).toBe(16);
  expect(s.grid.cells.length).toBe(480);
  // 시작 필지(0..9, 0..7)의 시작 오브젝트는 정류장·창고·정낭뿐 (다른 필지의 덤불·돌담·샘은 별도)
  const types = Object.values(s.objects).filter((o) => o.x < 10 && o.y < 8).map((o) => o.type).sort();
  expect(types).toEqual(['busstop', 'gate', 'warehouse']);
  expect(s.money).toBe(5_000_000);
  expect(s.slots).toEqual({ barista: 1, cook: 1, hall: 2, field: 1, carry: 0, guide: 0 });
  const gate = Object.values(s.objects).find((o) => o.type === 'gate')!;
  expect(s.grid.cells[gate.y * 30 + gate.x]!.objectId).toBe(gate.id);
  expect(s.grid.cells[gate.y * 30 + gate.x]!.terrain).toBe('rock');
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  expect(s.grid.cells[(wh.y + 1) * 30 + (wh.x + 2)]!.objectId).toBe(wh.id);
});

test('시작 필지 아래 변(y=7, 마을 길)과 맵 맨 아랫줄(y=15)은 도로', () => {
  const s = createInitialState(1);
  for (let x = 0; x < 30; x++) expect(s.grid.cells[7 * 30 + x]!.terrain).toBe('road');
  for (let x = 0; x < 30; x++) expect(s.grid.cells[15 * 30 + x]!.terrain).toBe('road');
  expect(s.grid.cells[0]!.terrain).toBe('soil');
});

test('DAY_MS마다 하루, 30일에 달, 12달에 해', () => {
  const s = createInitialState(1);
  const days = advanceClock(s, DAY_MS * 29);
  expect(days).toBe(29);
  expect(s.clock).toMatchObject({ day: 30, month: 3, year: 1 });
  advanceClock(s, DAY_MS);
  expect(s.clock).toMatchObject({ day: 1, month: 4, year: 1 });
  advanceClock(s, DAY_MS * 30 * 11);
  expect(s.clock).toMatchObject({ day: 1, month: 3, year: 2 });
});

test('18시간(HOUR_MS×18)에 하루, hour는 6에서 시작해 24에 닿으면 다음 날 6시로 순환', () => {
  const s = createInitialState(1);
  expect(s.clock.hour).toBe(6);
  let days = advanceClock(s, HOUR_MS * 17);
  expect(days).toBe(0);
  expect(s.clock).toMatchObject({ day: 1, hour: 23 });
  days = advanceClock(s, HOUR_MS);
  expect(days).toBe(1);
  expect(s.clock).toMatchObject({ day: 2, hour: 6 });
});

test('계절과 monthIndex', () => {
  expect(seasonOf(3)).toBe('spring');
  expect(seasonOf(7)).toBe('summer');
  expect(seasonOf(10)).toBe('autumn');
  expect(seasonOf(12)).toBe('winter');
  expect(monthIndex({ day: 1, month: 3, year: 2, hour: 6, accMs: 0, carryMs: 0, speed: 1 })).toBe(14);
});

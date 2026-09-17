import { createInitialState } from '../state';
import { advanceClock, seasonOf, DAY_MS, monthIndex } from '../clock';

test('초기 상태: 1년 1월 1일, 10×8 격자, 시작 오브젝트', () => {
  const s = createInitialState(1);
  expect(s.clock).toMatchObject({ day: 1, month: 1, year: 1, speed: 1 });
  expect(s.grid.w).toBe(10);
  expect(s.grid.h).toBe(8);
  expect(s.grid.cells.length).toBe(80);
  const types = Object.values(s.objects).map((o) => o.type).sort();
  expect(types).toEqual(['busstop', 'gate', 'warehouse']);
  expect(s.money).toBe(5000);
});

test('맨 아래 줄은 도로', () => {
  const s = createInitialState(1);
  for (let x = 0; x < 10; x++) expect(s.grid.cells[7 * 10 + x]!.terrain).toBe('road');
  expect(s.grid.cells[0]!.terrain).toBe('soil');
});

test('DAY_MS마다 하루, 30일에 달, 12달에 해', () => {
  const s = createInitialState(1);
  const days = advanceClock(s, DAY_MS * 29);
  expect(days).toBe(29);
  expect(s.clock).toMatchObject({ day: 30, month: 1, year: 1 });
  advanceClock(s, DAY_MS);
  expect(s.clock).toMatchObject({ day: 1, month: 2, year: 1 });
  advanceClock(s, DAY_MS * 30 * 11);
  expect(s.clock).toMatchObject({ day: 1, month: 1, year: 2 });
});

test('speed 0이면 멈춤, speed 3이면 3배', () => {
  const s = createInitialState(1);
  s.clock.speed = 0;
  expect(advanceClock(s, DAY_MS * 5)).toBe(0);
  s.clock.speed = 3;
  expect(advanceClock(s, DAY_MS)).toBe(3);
});

test('계절과 monthIndex', () => {
  expect(seasonOf(3)).toBe('spring');
  expect(seasonOf(7)).toBe('summer');
  expect(seasonOf(10)).toBe('autumn');
  expect(seasonOf(12)).toBe('winter');
  expect(monthIndex({ day: 1, month: 3, year: 2, accMs: 0, speed: 1 })).toBe(14);
});

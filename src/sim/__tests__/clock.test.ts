import { bareState } from './helpers.ts';
import { START_ORIGIN, GRID_W, GRID_H, VILLAGE_ROAD_Y } from '../state.ts';
import { advanceClock, seasonOf, DAY_MS, HOUR_MS, monthIndex } from '../clock.ts';
import { START_MONEY } from '../state.ts';

test('초기 상태: 1년 3월 1일 6시, 30×24 격자(필지 9장), 시작 오브젝트는 가운데 필지에', () => {
  const s = bareState(1);
  expect(s.clock).toMatchObject({ day: 1, month: 3, year: 1, hour: 6, speed: 1 });
  expect(s.createdAt).toBe(0);
  expect(bareState(1, 'p1', 123).createdAt).toBe(123);
  expect(s.grid.w).toBe(30);
  expect(s.grid.h).toBe(24);
  expect(s.grid.cells.length).toBe(720);
  expect(START_ORIGIN).toEqual({ x: 10, y: 8 });
  // 시작 필지(10..19, 8..15)의 시작 오브젝트는 정류장·창고·정낭뿐 (다른 필지의 덤불·돌담·샘·감귤나무는 별도)
  const inStart = (o: { x: number; y: number }) => o.x >= 10 && o.x < 20 && o.y >= 8 && o.y < 16;
  const types = Object.values(s.objects).filter(inStart).map((o) => o.type).sort();
  expect(types).toEqual(['busstop', 'gate', 'warehouse']);
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop')!;
  expect([bus.x, bus.y]).toEqual([10, 15]); // 가운데 필지 남쪽 변 마을 길
  expect(s.money).toBe(START_MONEY); // stakes: 시작 자금 350만
  expect(s.slots).toEqual({ barista: 1, cook: 1, hall: 2, clean: 2 }); // v3: 밭 직종 없음, 직종 8 (x-staff)
  const gate = Object.values(s.objects).find((o) => o.type === 'gate')!;
  expect(s.grid.cells[gate.y * 30 + gate.x]!.objectId).toBe(gate.id);
  expect(s.grid.cells[gate.y * 30 + gate.x]!.terrain).toBe('soil'); // ease: 바위 지형 없음
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  expect(s.grid.cells[(wh.y + 1) * 30 + (wh.x + 2)]!.objectId).toBe(wh.id);
});

test('마을 길(시작 필지 아래 변 y=15)은 맵 가로 전체 도로, 해안(오른쪽 아래)은 먼 변 2줄, 나머지는 전부 흙 (ease: 바위 없음)', () => {
  const s = bareState(1);
  expect(VILLAGE_ROAD_Y).toBe(15);
  for (let x = 0; x < GRID_W; x++) expect(s.grid.cells[VILLAGE_ROAD_Y * GRID_W + x]!.terrain).toBe('road');
  for (let x = 20; x < 30; x++) for (const y of [22, 23]) expect(s.grid.cells[y * GRID_W + x]!.terrain).toBe('road');
  expect(s.grid.cells[(GRID_H - 1) * GRID_W + 0]!.terrain).toBe('soil'); // 옛 감귤밭 아랫줄은 흙
  for (let lx = 2; lx <= 7; lx++) expect(s.grid.cells[2 * GRID_W + lx]!.terrain).toBe('soil'); // 옛 오름 능선도 흙
  for (const c of s.grid.cells) expect(['soil', 'road']).toContain(c.terrain);
  expect(s.grid.cells[0]!.roomId).toBeNull();
});

test('DAY_MS마다 하루, 30일에 달, 12달에 해', () => {
  const s = bareState(1);
  const days = advanceClock(s, DAY_MS * 29);
  expect(days).toBe(29);
  expect(s.clock).toMatchObject({ day: 30, month: 3, year: 1 });
  advanceClock(s, DAY_MS);
  expect(s.clock).toMatchObject({ day: 1, month: 4, year: 1 });
  advanceClock(s, DAY_MS * 30 * 11);
  expect(s.clock).toMatchObject({ day: 1, month: 3, year: 2 });
});

test('18시간(HOUR_MS×18)에 하루, hour는 6에서 시작해 24에 닿으면 다음 날 6시로 순환', () => {
  const s = bareState(1);
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

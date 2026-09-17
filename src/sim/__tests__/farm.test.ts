import { createInitialState } from '../state.ts';
import { placeObject } from '../grid.ts';
import { canPlant, plant, growOneDay, canHarvest, harvest } from '../farm.ts';

function autumn(s: ReturnType<typeof createInitialState>) {
  s.clock.month = 10;
}

test('밭에 제철 작물만 심을 수 있다', () => {
  const s = createInitialState(1);
  const f = placeObject(s, 'field', 0, 0);
  expect(canPlant(s, f.id, 'carrot').ok).toBe(false); // 1월
  autumn(s);
  expect(canPlant(s, f.id, 'carrot').ok).toBe(true);
  plant(s, f.id, 'carrot');
  expect(f.crop?.cropId).toBe('carrot');
  expect(canPlant(s, f.id, 'carrot').ok).toBe(false); // 이미 심음
});

test('나무는 심는 대상이 아니다', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'tangerine_tree', 0, 0);
  expect(canPlant(s, t.id, 'carrot').ok).toBe(false);
});

test('growDays 뒤에 ready, 수확하면 창고에 들어가고 밭이 빈다', () => {
  const s = createInitialState(1);
  autumn(s);
  const f = placeObject(s, 'field', 5, 5);
  plant(s, f.id, 'carrot');
  for (let i = 0; i < 59; i++) growOneDay(s);
  expect(f.crop?.ready).toBe(false);
  growOneDay(s);
  expect(f.crop?.ready).toBe(true);
  expect(canHarvest(s, f.id).ok).toBe(true);
  harvest(s, f.id);
  expect(s.storage['carrot']).toBe(2); // 방풍 안 됨 → 4의 절반
  expect(f.crop).toBeNull();
});

test('방풍되면 전량 수확', () => {
  const s = createInitialState(1);
  autumn(s);
  const f = placeObject(s, 'field', 5, 5);
  placeObject(s, 'stonewall', 4, 4);
  placeObject(s, 'stonewall', 3, 3);
  plant(s, f.id, 'carrot');
  for (let i = 0; i < 60; i++) growOneDay(s);
  harvest(s, f.id);
  expect(s.storage['carrot']).toBe(4);
});

test('감귤나무: 3년 자란 뒤 수확 달에만, 1년에 한 번', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'tangerine_tree', 5, 5);
  s.clock.month = 12;
  for (let i = 0; i < 1079; i++) growOneDay(s);
  expect(t.crop?.ready).toBe(false);
  growOneDay(s);
  expect(t.crop?.ready).toBe(true);
  harvest(s, t.id);
  expect(s.storage['tangerine']).toBe(6);
  expect(t.crop).not.toBeNull(); // 나무는 남는다
  expect(t.crop?.ready).toBe(false);
  growOneDay(s);
  expect(t.crop?.ready).toBe(false); // 올해는 이미 땄음
  s.clock.year += 1;
  growOneDay(s);
  expect(t.crop?.ready).toBe(true);
  s.clock.month = 6;
  growOneDay(s);
  expect(t.crop?.ready).toBe(false); // 수확 달이 아님
});

test('12월에 땄으면 이듬해 1월엔 같은 창이라 못 딴다', () => {
  const s = createInitialState(1);
  const t = placeObject(s, 'tangerine_tree', 5, 5);
  s.clock.month = 12;
  for (let i = 0; i < 1080; i++) growOneDay(s);
  harvest(s, t.id);
  s.clock.month = 1; s.clock.year = 2;
  growOneDay(s);
  expect(t.crop?.ready).toBe(false);
  s.clock.month = 11;
  growOneDay(s);
  expect(t.crop?.ready).toBe(true); // 새 창
});

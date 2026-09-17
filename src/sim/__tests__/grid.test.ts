import { createInitialState } from '../state.ts';
import { canPlace, placeObject, removeObject, cellAt, objectAt, windShelter, sceneryScore, isSheltered } from '../grid.ts';
import type { GameState } from '../types.ts';

function mustPlace(s: GameState, type: string, x: number, y: number) {
  expect(canPlace(s, type, x, y).ok).toBe(true);
  return placeObject(s, type, x, y);
}

test('빈 흙 칸에 밭을 놓을 수 있다', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 0, 0).ok).toBe(true);
  const obj = mustPlace(s, 'field', 0, 0);
  expect(obj.type).toBe('field');
  expect(cellAt(s, 0, 0).objectId).toBe(obj.id);
  expect(objectAt(s, 0, 0)?.id).toBe(obj.id);
});

test('지형이 맞지 않으면 실패', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 0, 7).ok).toBe(false); // 도로
  expect(canPlace(s, 'field', 3, 0).ok).toBe(false); // (3+0)%7===3 → rock
});

test('겹치거나 격자 밖이면 실패', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 3, 1).ok).toBe(false); // 폐창고 위
  expect(canPlace(s, 'field', 9, 9).ok).toBe(false);
  expect(canPlace(s, 'field', -1, 0).ok).toBe(false);
});

test('다중 칸 오브젝트는 모든 칸을 검사한다', () => {
  const s = createInitialState(1);
  placeObject(s, 'field', 1, 0);
  // warehouse 3×2를 (0,0)에 놓으면 (1,0)과 겹침
  expect(canPlace(s, 'warehouse', 0, 0).ok).toBe(false);
});

test('제거하면 칸이 비고 객체가 사라진다', () => {
  const s = createInitialState(1);
  const obj = placeObject(s, 'field', 0, 0);
  removeObject(s, obj.id);
  expect(cellAt(s, 0, 0).objectId).toBeNull();
  expect(s.objects[obj.id]).toBeUndefined();
});

test('북서쪽 돌담이 방풍을 만든다', () => {
  const s = createInitialState(1);
  // (5,5)를 쓰면 방풍 띠가 시작 오브젝트 warehouse(3,1 3×2)의 (3,2) 칸과 겹쳐
  // wind가 이미 1이 잡히므로, 겹치지 않는 (6,6)으로 한 칸씩 밀어서 검증한다.
  mustPlace(s, 'field', 6, 6);
  expect(windShelter(s, 6, 6)).toBe(0);
  expect(isSheltered(s, 6, 6)).toBe(false);
  mustPlace(s, 'stonewall', 5, 5); // wind 2
  expect(windShelter(s, 6, 6)).toBe(2);
  mustPlace(s, 'stonewall', 4, 4); // +2 → 4
  expect(isSheltered(s, 6, 6)).toBe(true);
});

test('남동쪽 돌담은 방풍이 아니다', () => {
  const s = createInitialState(1);
  mustPlace(s, 'field', 2, 2);
  mustPlace(s, 'stonewall', 3, 3);
  expect(windShelter(s, 2, 2)).toBe(0);
});

test('경치 점수 = 반경 2칸 풍경 합 − 소음 합', () => {
  const s = createInitialState(1);
  const seat = mustPlace(s, 'table_out', 8, 4);
  expect(sceneryScore(s, seat.x, seat.y)).toBe(0);
  mustPlace(s, 'tangerine_tree', 7, 4); // scenery 1
  mustPlace(s, 'stonewall', 9, 5);      // scenery 1
  expect(sceneryScore(s, 8, 4)).toBe(2);
  mustPlace(s, 'tangerine_tree', 5, 4); // 거리 3 → 제외
  expect(sceneryScore(s, 8, 4)).toBe(2);
});

test('소음이 경치를 깎는다', () => {
  const s = createInitialState(1);
  const seat = mustPlace(s, 'table_out', 1, 6); // 정류장 (0,7) noise 1, 반경 안
  expect(sceneryScore(s, seat.x, seat.y)).toBe(-1);
});

test('방풍 띠 밖(|dx−dy|>1)은 세지 않고, 여러 칸 오브젝트는 한 번만 센다', () => {
  const s = createInitialState(1);
  // (6,6) 기준 (5,3)은 dx=1,dy=3 → 띠 밖
  mustPlace(s, 'stonewall', 5, 3);
  expect(windShelter(s, 6, 6)).toBe(0);
  // 창고 (3..5,1..2) wind 1: (5,4)의 띠에 (4,2)와 (3,2)가 모두 들어가지만 한 번만 → 1
  expect(windShelter(s, 5, 4)).toBe(1);
});

test('여러 칸 오브젝트를 없애면 모든 칸이 빈다', () => {
  const s = createInitialState(1);
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  removeObject(s, wh.id);
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) expect(cellAt(s, 3 + dx, 1 + dy).objectId).toBeNull();
});

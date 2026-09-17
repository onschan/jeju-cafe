import { createInitialState } from '../state.ts';
import { canPlace, placeObject, removeObject, cellAt, objectAt, windShelter, sceneryScore, isSheltered } from '../grid.ts';

test('빈 흙 칸에 밭을 놓을 수 있다', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 0, 0).ok).toBe(true);
  const obj = placeObject(s, 'field', 0, 0);
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
  placeObject(s, 'field', 6, 6);
  expect(windShelter(s, 6, 6)).toBe(0);
  expect(isSheltered(s, 6, 6)).toBe(false);
  placeObject(s, 'stonewall', 5, 5); // wind 2
  expect(windShelter(s, 6, 6)).toBe(2);
  placeObject(s, 'stonewall', 4, 4); // +2 → 4
  expect(isSheltered(s, 6, 6)).toBe(true);
});

test('남동쪽 돌담은 방풍이 아니다', () => {
  const s = createInitialState(1);
  placeObject(s, 'field', 2, 2);
  placeObject(s, 'stonewall', 3, 3);
  expect(windShelter(s, 2, 2)).toBe(0);
});

test('경치 점수 = 반경 2칸 풍경 합 − 소음 합', () => {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', 8, 4);
  expect(sceneryScore(s, seat.x, seat.y)).toBe(0);
  placeObject(s, 'tangerine_tree', 7, 3); // scenery 1
  placeObject(s, 'stonewall', 9, 5);      // scenery 1
  expect(sceneryScore(s, 8, 4)).toBe(2);
  placeObject(s, 'tangerine_tree', 5, 4); // 거리 3 → 제외
  expect(sceneryScore(s, 8, 4)).toBe(2);
});

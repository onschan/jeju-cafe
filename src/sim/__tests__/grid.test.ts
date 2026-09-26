import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { canPlace, placeObject, removeObject, cellAt, objectAt, windShelter, sceneryScore, isSheltered } from '../grid.ts';
import type { GameState } from '../types.ts';

function mustPlace(s: GameState, type: string, x: number, y: number) {
  expect(canPlace(s, type, x, y).ok).toBe(true);
  return placeObject(s, type, x, y);
}

test('빈 흙 칸에 당근밭(농원)을 놓을 수 있다', () => {
  const s = bareState(1);
  expect(canPlace(s, 'carrot_field', X(0), Y(0)).ok).toBe(true);
  const obj = mustPlace(s, 'carrot_field', X(0), Y(0));
  expect(obj.type).toBe('carrot_field');
  expect(cellAt(s, X(0), Y(0)).objectId).toBe(obj.id);
  expect(objectAt(s, X(0), Y(0))?.id).toBe(obj.id);
});

test('지형이 맞지 않으면 실패', () => {
  const s = bareState(1);
  expect(canPlace(s, 'carrot_field', X(0), Y(9)).ok).toBe(false); // 도로
  expect(canPlace(s, 'carrot_field', X(3), Y(0)).ok).toBe(true); // ease: 옛 바위 패턴 칸도 흙
});

test('겹치거나 격자 밖이면 실패', () => {
  const s = bareState(1);
  expect(canPlace(s, 'carrot_field', X(5), Y(0)).ok).toBe(false); // 본관 카운터 칸
  expect(canPlace(s, 'carrot_field', X(5), Y(2)).ok).toBe(false); // 본관 빈 바닥엔 밭은 못 놓는다 (자리·장식만)
  expect(canPlace(s, 'carrot_field', X(11), Y(9)).ok).toBe(false); // 마을 길
  expect(canPlace(s, 'carrot_field', -1, 0).ok).toBe(false);
});

test('다중 칸 오브젝트는 모든 칸을 검사한다', () => {
  const s = bareState(1);
  placeObject(s, 'carrot_field', X(1), Y(0));
  // warehouse 3×2를 (0,0)에 놓으면 (1,0)과 겹침
  expect(canPlace(s, 'warehouse', X(0), Y(0)).ok).toBe(false);
});

test('제거하면 칸이 비고 객체가 사라진다', () => {
  const s = bareState(1);
  const obj = placeObject(s, 'carrot_field', X(0), Y(0));
  removeObject(s, obj.id);
  expect(cellAt(s, X(0), Y(0)).objectId).toBeNull();
  expect(s.objects[obj.id]).toBeUndefined();
});

test('북서쪽 돌담이 방풍을 만든다', () => {
  const s = bareState(1);
  // 본관(4..8, 0..3, wind 1)의 방풍 띠에 안 걸리는 (8,8)에서 검증한다.
  mustPlace(s, 'carrot_field', X(8), Y(8));
  expect(windShelter(s, X(8), Y(8))).toBe(0);
  expect(isSheltered(s, X(8), Y(8))).toBe(false);
  mustPlace(s, 'stonewall', X(7), Y(7)); // wind 2
  expect(windShelter(s, X(8), Y(8))).toBe(2);
  mustPlace(s, 'stonewall', X(6), Y(6)); // +2 → 4
  expect(isSheltered(s, X(8), Y(8))).toBe(true);
});

test('남동쪽 돌담은 방풍이 아니다', () => {
  const s = bareState(1);
  mustPlace(s, 'carrot_field', X(1), Y(1));
  mustPlace(s, 'stonewall', X(2), Y(2)); // (3,3)은 본관 문 앞 칸이라 못 놓는다
  expect(windShelter(s, X(1), Y(1))).toBe(0);
});

test('경치 점수 = 반경 2칸 풍경 합 − 소음 합', () => {
  const s = bareState(1);
  const seat = mustPlace(s, 'table_out', X(8), Y(4));
  expect(sceneryScore(s, seat.x, seat.y)).toBe(0);
  mustPlace(s, 'tangerine_tree', X(7), Y(4)); // scenery 2 (v3 감귤나무)
  mustPlace(s, 'stonewall', X(9), Y(5));      // scenery 1
  expect(sceneryScore(s, X(8), Y(4))).toBe(3);
  mustPlace(s, 'tangerine_tree', X(5), Y(4)); // 거리 3 → 제외
  expect(sceneryScore(s, X(8), Y(4))).toBe(3);
});

test('소음이 경치를 깎는다', () => {
  const s = bareState(1);
  const seat = mustPlace(s, 'table_out', X(1), Y(8)); // 정류장 (0,9) noise 1, 반경 안
  expect(sceneryScore(s, seat.x, seat.y)).toBe(-1);
});

test('방풍 띠 밖(|dx−dy|>1)은 세지 않고, 여러 칸 오브젝트는 한 번만 센다', () => {
  const s = bareState(1);
  // (8,8) 기준 (7,5)는 dx=1,dy=3 → 띠 밖
  mustPlace(s, 'stonewall', X(7), Y(5));
  expect(windShelter(s, X(8), Y(8))).toBe(0);
  // 본관 (4..8,0..3) wind 1: (9,5)의 띠에 (8,4)?·(7,3)·(6,2)… 여러 칸이 들어가지만 한 번만 → 1
  expect(windShelter(s, X(9), Y(5))).toBe(1);
});

test('여러 칸 오브젝트를 없애면 모든 칸이 빈다', () => {
  const s = bareState(1);
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  removeObject(s, wh.id);
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 5; dx++) { const c = cellAt(s, wh.x + dx, wh.y + dy); expect(c.objectId).toBeNull(); expect(c.roomId).toBeNull(); }
});

import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { canUndo } from '../undo.ts';
import { objectAt } from '../grid.ts';
import { typeWeight } from '../guests.ts';
import { TARGET_SPAWN_MULT } from '../segments.ts';
import { objectDef } from '../../data/index.ts';

const WALL = 'stonewall';

test('undo: 배치 → 철거 + 낸 돈 100% 환불', () => {
  const s = bareState(1);
  const money = s.money;
  expect(apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) }).ok).toBe(true);
  expect(s.undo?.kind).toBe('place');
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  expect(objectAt(s, X(0), Y(0))).toBeNull();
  expect(s.money).toBe(money);
  expect(s.undo).toBeNull();
  expect(apply(s, { type: 'undoLast' }).ok).toBe(false); // 두 번은 없다
});

test('undo: 철거 → 같은 자리·같은 id로 재배치, 환불 회수', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  const o = objectAt(s, X(0), Y(0))!;
  o.level = 2;
  const before = s.money;
  expect(apply(s, { type: 'remove', objectId: o.id }).ok).toBe(true);
  expect(s.money).toBe(before + objectDef(WALL).cost);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  const back = objectAt(s, X(0), Y(0))!;
  expect(back.id).toBe(o.id);
  expect(back.level).toBe(2);
  expect(s.money).toBe(before);
});

test('undo: 이동 → 원위치', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  const o = objectAt(s, X(0), Y(0))!;
  expect(apply(s, { type: 'move', objectId: o.id, x: X(2), y: Y(2) }).ok).toBe(true);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  expect(o.x).toBe(X(0));
  expect(o.y).toBe(Y(0));
});

test('undo: 날이 바뀌면 못 되돌린다', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  s.clock.day += 1;
  expect(canUndo(s).ok).toBe(false);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(false);
});

test('demolishMany: 여러 개 한 번에 철거·환불, 보호 시설은 건너뜀, undo로 전부 복구', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  apply(s, { type: 'place', objectType: WALL, x: X(1), y: Y(0) });
  const a = objectAt(s, X(0), Y(0))!, b = objectAt(s, X(1), Y(0))!;
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop')!;
  const before = s.money;
  expect(apply(s, { type: 'demolishMany', objectIds: [a.id, b.id, bus.id] }).ok).toBe(true);
  expect(s.objects[a.id]).toBeUndefined();
  expect(s.objects[b.id]).toBeUndefined();
  expect(s.objects[bus.id]).toBeDefined();
  expect(s.money).toBe(before + objectDef(WALL).cost * 2);
  expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
  expect(s.objects[a.id]).toBeDefined();
  expect(s.objects[b.id]).toBeDefined();
  expect(s.money).toBe(before);
  expect(apply(s, { type: 'demolishMany', objectIds: [bus.id] }).ok).toBe(false); // 치울 게 없음
});

test('renameObject: 12자까지, 빈 이름은 지움', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: WALL, x: X(0), y: Y(0) });
  const o = objectAt(s, X(0), Y(0))!;
  expect(apply(s, { type: 'renameObject', objectId: o.id, name: ' 우리 담 ' }).ok).toBe(true);
  expect(o.name).toBe('우리 담');
  apply(s, { type: 'renameObject', objectId: o.id, name: '   ' });
  expect(o.name).toBeUndefined();
});

test('setTargets: 3슬롯 통째로, 잠긴 타입 거부, 스폰 가중치 ×1.3', () => {
  const s = bareState(1);
  const base = typeWeight(s, 'local_auntie', 12);
  expect(apply(s, { type: 'setTargets', targets: ['couple'] }).ok).toBe(false);
  expect(apply(s, { type: 'setTargets', targets: ['local_auntie', 'student', 'village_head', 'local_auntie'] }).ok).toBe(true);
  expect(s.targets).toEqual(['local_auntie', 'student', 'village_head']);
  expect(s.targetSegment).toBe('local_auntie');
  expect(typeWeight(s, 'local_auntie', 12)).toBeCloseTo(base * TARGET_SPAWN_MULT);
  expect(apply(s, { type: 'setTargets', targets: [] }).ok).toBe(true);
  expect(s.targets).toEqual([]);
  expect(typeWeight(s, 'local_auntie', 12)).toBeCloseTo(base);
});

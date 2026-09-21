/** fix-indoor: 본관·별관 실내 = 빈 바닥 + 고정 설비 칸(카운터+주방, 뒷벽 줄) · 문→카운터 통로 · 좌석 접근 칸 · 옛 저장 정리 */
import { describe, test, expect } from 'vitest';
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { createInitialState, fillStarterLayout } from '../state.ts';
import { canPlace, placeObject, cellAt, objectAt, isRoomFloor, isFixedCell, fixedCellsOf } from '../grid.ts';
import { fixedCells, freeFloorCells, mainBuilding } from '../rooms.ts';
import { isWalkable, findPath, busStopPos } from '../path.ts';
import { serialize, deserialize } from '../save.ts';
import { objectDef } from '../../data/index.ts';

describe('고정 설비 칸 (카운터+주방)', () => {
  test('본관 Lv1 3×2: 뒷벽 줄 (4,1)·(5,1)이 고정 — 못 걷고, 실내 가구를 못 놓고, freeFloorCells에서 빠진다', () => {
    const s = bareState(1);
    const m = mainBuilding(s)!;
    expect(fixedCells(m)).toEqual([{ x: X(4), y: Y(1) }, { x: X(5), y: Y(1) }]);
    for (const p of fixedCells(m)) {
      expect(isFixedCell(s, p.x, p.y)).toBe(true);
      expect(isRoomFloor(s, p.x, p.y)).toBe(false);
      expect(isWalkable(s, p.x, p.y)).toBe(false);
      expect(canPlace(s, 'table_in', p.x, p.y).reason).toBe('카운터·주방 자리예요');
      expect(cellAt(s, p.x, p.y).objectId).toBe(m.id); // 칸 자체는 방이 차지 — 바깥 시설도 못 놓는다
      expect(canPlace(s, 'table_out', p.x, p.y).ok).toBe(false);
    }
    expect(isFixedCell(s, X(3), Y(1))).toBe(false); // 문 기둥 칸은 빈 바닥
    expect(freeFloorCells(s, m)).toEqual([{ x: X(3), y: Y(1) }, { x: X(4), y: Y(2) }, { x: X(5), y: Y(2) }]);
    // 고정 설비가 없는 방(갤러리·주방 증축)은 빈 배열
    expect(fixedCellsOf({ type: 'kitchen_ext', x: 0, y: 0 })).toEqual([]);
    expect(fixedCellsOf({ type: 'annex_cafe', x: 10, y: 10 })).toEqual([{ x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }]);
  });

  test('증축해도 고정 칸은 뒷벽 줄 오른쪽으로만 늘어난다 — 기존 가구 위에 깔리지 않는다', () => {
    const s = bareState(1);
    s.money = 1e9;
    const m = mainBuilding(s)!;
    placeObject(s, 'table_in', X(3), Y(1));
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(fixedCells(m)).toEqual([{ x: X(4), y: Y(1) }, { x: X(5), y: Y(1) }, { x: X(6), y: Y(1) }]);
    expect(objectAt(s, X(3), Y(1))?.type).toBe('table_in');
    expect(fixedCells(m).every((p) => cellAt(s, p.x, p.y).objectId === m.id)).toBe(true);
  });
});

describe('실내 가구 겹침·통로', () => {
  test('가구끼리 겹치면 "이미 뭔가 있어요", 문이 갇히면 "손님이 카운터까지 갈 길이 없어요"', () => {
    const s = bareState(1);
    s.money = 1e9;
    // Lv1 빈 바닥: (3,1)·(4,2)·(5,2), 문 (3,2)
    expect(apply(s, { type: 'place', objectType: 'table_in', x: X(3), y: Y(1) }).ok).toBe(true);
    expect(canPlace(s, 'table_in', X(3), Y(1)).reason).toBe('이미 뭔가 있어요');
    // (4,2)까지 막으면 문(3,2)에서 카운터 앞으로 못 간다
    expect(canPlace(s, 'table_in', X(4), Y(2)).reason).toBe('손님이 카운터까지 갈 길이 없어요');
    expect(apply(s, { type: 'place', objectType: 'table_in', x: X(4), y: Y(2) }).ok).toBe(false);
    // (5,2)는 된다: 문 → (4,2) → 카운터 앞, 자리 (5,2)는 (4,2)에서 닿는다
    expect(apply(s, { type: 'place', objectType: 'table_in', x: X(5), y: Y(2) }).ok).toBe(true);
    expect(canPlace(s, 'table_in', X(4), Y(2)).ok).toBe(false); // 이제 (4,2)는 두 자리 모두를 막는다
  });

  test('다른 좌석의 접근 칸을 막는 가구는 거부한다 (Lv2 4×3)', () => {
    const s = bareState(1);
    s.money = 1e9;
    apply(s, { type: 'expandMain' });
    const m = mainBuilding(s)!;
    expect(m).toMatchObject({ w: 4, h: 3 });
    // 문 (3,3). 테이블 (3,1)은 (3,2)로만 닿는다 — (3,2)에 뭔가 놓으면 그 자리가 갇힌다
    placeObject(s, 'table_in', X(3), Y(1));
    expect(canPlace(s, 'table_in', X(3), Y(2)).reason).toBe('실내 테이블 자리로 가는 길이 막혀요');
    expect(canPlace(s, 'fireplace', X(3), Y(2)).reason).toBe('실내 테이블 자리로 가는 길이 막혀요');
    expect(canPlace(s, 'table_in', X(4), Y(2)).ok).toBe(true);
    // 새 좌석 자체가 갇히는 자리도 거부: 구석 (6,3)은 (6,2)·(5,3)이 막히면 닿는 칸이 없다
    placeObject(s, 'fireplace', X(6), Y(2));
    expect(canPlace(s, 'table_in', X(6), Y(3)).ok).toBe(true);
    placeObject(s, 'aquarium', X(5), Y(3));
    expect(canPlace(s, 'table_in', X(6), Y(3)).reason).toBe('손님이 자리까지 갈 길이 없어요');
  });

  test('손님은 고정 칸을 지나지 않고 문 → 빈 바닥으로만 자리에 간다', () => {
    const s = bareState(1);
    for (const y of [5, 4, 3]) placeObject(s, 'path', X(4), Y(y));
    placeObject(s, 'path', X(3), Y(3));
    expect(findPath(s, busStopPos(s), { x: X(5), y: Y(1) })).toBeNull(); // 주방 칸
    expect(findPath(s, busStopPos(s), { x: X(5), y: Y(2) })).not.toBeNull();
  });
});

describe('시작 배치·옛 저장', () => {
  test('완성 시작 상태의 본관 안은 비어 있다; fillStarterLayout(indoor=true)면 실내 테이블 2개를 통로 검사를 통과하는 칸에 정식 배치한다', () => {
    const s = createInitialState(1);
    expect(Object.values(s.objects).some((o) => o.type === 'table_in')).toBe(false);
    const t = createInitialState(2, 'local', 0, 'tutorial');
    fillStarterLayout(t, true);
    const tables = Object.values(t.objects).filter((o) => o.type === 'table_in').map((o) => [o.x, o.y]);
    expect(tables).toEqual([[X(3), Y(1)], [X(5), Y(2)]]);
    for (const [x, y] of tables) expect(cellAt(t, x!, y!).roomId).toBe(mainBuilding(t)!.id);
    expect(Object.values(t.objects).some((o) => o.type === 'table_out')).toBe(true);
  });

  test('옛 저장에서 카운터 칸 위에 있던 실내 가구는 불러올 때 치우고 값을 돌려준다', () => {
    const s = bareState(1);
    const raw = JSON.parse(serialize(s)) as ReturnType<typeof bareState>;
    const m = Object.values(raw.objects).find((o) => o.type === 'warehouse')!;
    raw.objects['old'] = { id: 'old', type: 'table_in', x: m.x + 1, y: m.y, placedMonth: 0 };
    const money = raw.money;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.objects['old']).toBeUndefined();
    expect(loaded.money).toBe(money + objectDef('table_in').cost);
    expect(cellAt(loaded, m.x + 1, m.y).objectId).toBe(m.id);
    expect(loaded.notices.at(-1)).toContain('카운터 자리에 있어 치우고');
  });
});

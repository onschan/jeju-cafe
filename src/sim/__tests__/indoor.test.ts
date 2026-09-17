import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { canPlace, placeObject, cellAt, objectAt, doorOf, doorFrontOf, roomAt, isRoomFloor, objectsInRoom, clearCost, canClearRock, clearRock, ROCK_CLEAR_COST, BIG_ROCK_CLEAR_COST, BUSH_CLEAR_COST } from '../grid.ts';
import { isWalkable, walkableNeighborsOf, findPath, busStopPos, isDoorReachable } from '../path.ts';
import { advanceConstruction, needsDoorPath, DOOR_PATH_HINT } from '../build.ts';
import { dayIndex } from '../effects.ts';
import { spawnGuests, updateGuests } from '../guests.ts';
import { setSlot } from '../menu.ts';
import { evaluateFacilityUnlocks } from '../segments.ts';
import { objectDef, FACILITIES, ROOM_IDS, INDOOR_IDS } from '../../data/index.ts';
import type { GameState } from '../types.ts';

function warehouse(s: GameState) {
  return Object.values(s.objects).find((o) => o.type === 'warehouse')!;
}

test('데이터: 폐창고·주방 증축·갤러리·화장실은 방(room), 실내 테이블·카운터·소파·서가·자판기·로스터기는 indoor', () => {
  for (const id of ROOM_IDS) expect(objectDef(id).room, id).toBe(true);
  for (const id of INDOOR_IDS) expect(objectDef(id).indoor, id).toBe(true);
  expect(objectDef('table_out').indoor).toBeUndefined();
  expect(objectDef('table_in')).toMatchObject({ kind: 'seat', seats: 2, cost: 800_000 });
  expect(objectDef('vending')).toMatchObject({ kind: 'facility', fee: 1500 });
  expect(objectDef('kitchen_ext')).toMatchObject({ kind: 'building', room: true, w: 2, h: 1 });
  expect(FACILITIES.some((f) => f.id === 'table_out')).toBe(false); // objects.json 것과 겹치지 않는다
  const s = createInitialState(1);
  expect(s.unlocked.objects).toContain('vending'); // 시작 해금 시설
  expect(s.unlocked.objects).not.toContain('table_in'); // 랭크 2
  s.rank = 2;
  expect(evaluateFacilityUnlocks(s)).toEqual(expect.arrayContaining(['table_in', 'parking', 'prop_shop']));
  expect(s.unlocked.objects).toContain('table_in');
  expect(s.notices.at(-1)).toMatch(/^새 시설: /);
  expect(evaluateFacilityUnlocks(s)).toEqual([]); // 두 번 열지 않는다
  expect(s.unlocked.objects).not.toContain('sofa'); // ★3
});

test('방 발자국 칸은 roomId를 갖고, 문은 정면 왼쪽, 빈 바닥은 걸을 수 있다', () => {
  const s = createInitialState(1);
  const wh = warehouse(s);
  expect(wh).toMatchObject({ x: X(3), y: Y(1) });
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    const c = cellAt(s, wh.x + dx, wh.y + dy);
    expect(c.roomId).toBe(wh.id);
    expect(c.objectId).toBe(wh.id);
    expect(isRoomFloor(s, wh.x + dx, wh.y + dy)).toBe(true);
    expect(isWalkable(s, wh.x + dx, wh.y + dy)).toBe(true);
  }
  expect(doorOf(wh)).toEqual({ x: X(3), y: Y(2) });
  expect(roomAt(s, X(4), Y(1))?.id).toBe(wh.id);
  expect(roomAt(s, X(0), Y(0))).toBeNull();
  expect(cellAt(s, X(0), Y(0)).roomId).toBeNull();
});

test('실내 오브젝트는 방 바닥 위에만, 문 칸엔 못 놓고, 바깥 오브젝트는 방 바닥에 못 놓는다', () => {
  const s = createInitialState(1);
  const wh = warehouse(s);
  expect(canPlace(s, 'table_in', X(0), Y(0)).reason).toBe('실내에만 놓을 수 있어요');
  expect(canPlace(s, 'table_in', X(3), Y(2)).reason).toBe('문 앞은 비워 둬요');
  expect(canPlace(s, 'table_in', X(4), Y(1)).ok).toBe(true);
  expect(canPlace(s, 'field', X(4), Y(1)).reason).toBe('이미 뭔가 있어요');
  const t = placeObject(s, 'table_in', X(4), Y(1));
  expect(cellAt(s, X(4), Y(1))).toEqual({ terrain: expect.any(String), objectId: t.id, roomId: wh.id });
  expect(objectAt(s, X(4), Y(1))?.id).toBe(t.id);
  expect(isWalkable(s, X(4), Y(1))).toBe(false); // 가구가 있는 바닥은 못 걷는다
  expect(canPlace(s, 'table_in', X(4), Y(1)).reason).toBe('이미 뭔가 있어요');
  expect(objectsInRoom(s, wh.id).map((o) => o.id)).toEqual([t.id]);
  // 2×1 카운터는 한 방 안에 다 들어가야 한다
  expect(canPlace(s, 'counter', X(4), Y(2)).ok).toBe(true);   // (4,2),(5,2)
  expect(canPlace(s, 'counter', X(5), Y(2)).ok).toBe(false);  // (6,2)는 바깥
  // 치우면 다시 방 바닥이 된다
  expect(apply(s, { type: 'remove', objectId: t.id }).ok).toBe(true);
  expect(cellAt(s, X(4), Y(1)).objectId).toBe(wh.id);
  expect(isRoomFloor(s, X(4), Y(1))).toBe(true);
});

test('가구가 든 방은 못 옮기고 못 치운다; 실내 오브젝트 move는 방 안에서만', () => {
  const s = createInitialState(1);
  s.money = 1e9;
  s.unlocked.objects.push('kitchen_ext', 'table_in');
  expect(apply(s, { type: 'place', objectType: 'kitchen_ext', x: X(0), y: Y(0) }).ok).toBe(true); // (0,0),(1,0), 문 (0,0)
  const k = objectAt(s, X(0), Y(0))!;
  expect(doorOf(k)).toEqual({ x: X(0), y: Y(0) });
  expect(apply(s, { type: 'place', objectType: 'table_in', x: X(1), y: Y(0) }).ok).toBe(true);
  const t = objectAt(s, X(1), Y(0))!;
  expect(apply(s, { type: 'move', objectId: k.id, x: X(1), y: Y(1) }).reason).toBe('안에 가구가 있어요');
  expect(apply(s, { type: 'remove', objectId: k.id }).reason).toBe('안에 가구가 있어요');
  expect(apply(s, { type: 'move', objectId: t.id, x: X(2), y: Y(0) }).reason).toBe('실내에만 놓을 수 있어요');
  expect(apply(s, { type: 'move', objectId: t.id, x: X(4), y: Y(1) }).ok).toBe(true); // 폐창고 안으로
  expect(cellAt(s, X(1), Y(0)).objectId).toBe(k.id);
  expect(cellAt(s, X(4), Y(1)).objectId).toBe(t.id);
  // 이제 빈 방은 옮길 수 있고 roomId가 따라간다
  expect(apply(s, { type: 'move', objectId: k.id, x: X(0), y: Y(2) }).ok).toBe(true);
  expect(cellAt(s, X(0), Y(0)).roomId).toBeNull();
  expect(cellAt(s, X(0), Y(0)).objectId).toBeNull();
  expect(cellAt(s, X(1), Y(2)).roomId).toBe(k.id);
  expect(apply(s, { type: 'remove', objectId: k.id }).ok).toBe(true);
  expect(cellAt(s, X(1), Y(2))).toMatchObject({ objectId: null, roomId: null });
});

test('방은 문으로만 드나든다: 문 앞에 길을 놓으면 안까지 경로가 생기고, 다른 변에선 못 들어간다', () => {
  const s = createInitialState(1);
  const wh = warehouse(s);
  // 문 (3,2) 아래 (3,3)에 길이 없으면 방 안(4,1)까지 못 간다. (4,3)·(5,3)에 길이 있어도 (4,2)는 문이 아니라 못 들어간다.
  placeObject(s, 'path', X(4), Y(3));
  placeObject(s, 'path', X(4), Y(4));
  placeObject(s, 'path', X(4), Y(5));
  expect(walkableNeighborsOf(s, X(4), Y(3)).some((p) => p.y === Y(2))).toBe(false);
  expect(findPath(s, busStopPos(s), { x: X(4), y: Y(1) })).toBeNull();
  placeObject(s, 'path', X(3), Y(3));
  expect(walkableNeighborsOf(s, X(3), Y(3)).some((p) => p.x === X(3) && p.y === Y(2))).toBe(true);
  const path = findPath(s, busStopPos(s), { x: X(5), y: Y(1) })!;
  expect(path).not.toBeNull();
  expect(path.some((p) => p.x === doorOf(wh).x && p.y === doorOf(wh).y)).toBe(true);
  // 손님이 실내 테이블에 앉는다
  placeObject(s, 'table_in', X(5), Y(1));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  expect(spawnGuests(s, 1)).toBe(1);
  updateGuests(s, 20_000);
  expect(s.guests[0]!.phase).toBe('seated');
  expect(cellAt(s, s.guests[0]!.approachCell!.x, s.guests[0]!.approachCell!.y).roomId).toBe(wh.id);
});

test('문 앞 칸엔 길·정낭만 놓는다; 방을 놓을 때도 문 앞이 막혀 있으면 안 된다', () => {
  const s = createInitialState(1);
  s.money = 1e9;
  const wh = warehouse(s);
  const f = doorFrontOf(wh);
  expect(f).toEqual({ x: X(3), y: Y(3) });
  expect(canPlace(s, 'table_out', f.x, f.y).reason).toBe('문 앞은 비워 둬요');
  expect(canPlace(s, 'field', f.x, f.y).reason).toBe('문 앞은 비워 둬요');
  expect(canPlace(s, 'stonewall', f.x, f.y).reason).toBe('문 앞은 비워 둬요');
  expect(canPlace(s, 'path', f.x, f.y).ok).toBe(true);
  expect(canPlace(s, 'table_out', X(2), Y(3)).ok).toBe(true);
  // 새 방(주방 증축 2×1)의 문 앞에 테이블이 있으면 못 놓는다
  s.unlocked.objects.push('kitchen_ext');
  placeObject(s, 'table_out', X(0), Y(1));
  expect(canPlace(s, 'kitchen_ext', X(0), Y(0)).reason).toBe('문 앞이 막혀 있어요');
  expect(canPlace(s, 'kitchen_ext', X(1), Y(0)).ok).toBe(true); // 문 앞 (1,1)은 비어 있다
  // 격자 맨 아래 줄은 문 앞이 격자 밖
  for (const p of s.parcels) p.owned = true;
  expect(canPlace(s, 'kitchen_ext', 0, s.grid.h - 1).reason).toBe('문 앞이 격자 밖이에요');
});

test('실내 테이블이 완공됐는데 문 앞까지 길이 없으면 알림에 안내가 붙는다', () => {
  const s = createInitialState(1);
  s.money = 1e9;
  s.unlocked.objects.push('table_in');
  const wh = warehouse(s);
  expect(isDoorReachable(s, wh)).toBe(false);
  expect(apply(s, { type: 'place', objectType: 'table_in', x: X(5), y: Y(1) }).ok).toBe(true);
  const t = objectAt(s, X(5), Y(1))!;
  expect(needsDoorPath(s, t)).toBe(true);
  s.clock.day += 1;
  expect(advanceConstruction(s)).toEqual([t.id]);
  expect(s.notices.at(-1)).toBe(`실내 테이블 완공! — ${DOOR_PATH_HINT}`);
  const scene = s.fx.find((f) => f.kind === 'scene');
  expect(scene && 'text' in scene ? scene.text : '').toContain(DOOR_PATH_HINT);
  // 정낭에서 문 앞까지 길을 이으면 닿는다
  for (const y of [5, 4, 3]) placeObject(s, 'path', X(4), Y(y));
  placeObject(s, 'path', X(3), Y(3));
  expect(isDoorReachable(s, wh)).toBe(true);
  expect(needsDoorPath(s, t)).toBe(false);
  expect(dayIndex(s.clock)).toBeGreaterThan(0);
});

test('clearRock: 작은 바위 30만·큰 바위 100만·덤불 5만, 곡괭이가 있으면 무료(1개 소모), 내 땅만', () => {
  const s = createInitialState(1);
  // 시작 필지 (3,0)은 바위 ((lx+ly)%7===3)
  expect(cellAt(s, X(3), Y(0)).terrain).toBe('rock');
  expect(clearCost(s, X(3), Y(0))).toBe(ROCK_CLEAR_COST);
  expect(clearCost(s, X(0), Y(0))).toBeNull();
  expect(canClearRock(s, X(0), Y(0)).reason).toBe('치울 바위가 없어요');
  expect(canPlace(s, 'field', X(3), Y(0)).reason).toBe('바위를 먼저 치워요');
  s.money = 100_000;
  expect(canClearRock(s, X(3), Y(0)).reason).toBe('돈이 모자라요');
  s.money = 300_000;
  expect(apply(s, { type: 'clearRock', x: X(3), y: Y(0) }).ok).toBe(true);
  expect(s.money).toBe(0);
  expect(cellAt(s, X(3), Y(0)).terrain).toBe('soil');
  expect(canPlace(s, 'field', X(3), Y(0)).ok).toBe(true);
  expect(s.actionLog.at(-1)!.action).toEqual({ type: 'clearRock', x: X(3), y: Y(0) });
  // 오름 능선 큰 바위 (2..7, 2): 안 산 땅이면 못 치운다
  expect(cellAt(s, 4, 2).terrain).toBe('rock_big');
  expect(clearCost(s, 4, 2)).toBe(BIG_ROCK_CLEAR_COST);
  expect(canClearRock(s, 4, 2).reason).toBe('아직 내 땅이 아니에요');
  s.parcels.find((p) => p.no === 2)!.owned = true;
  s.inventory['pickaxe'] = 1;
  expect(apply(s, { type: 'clearRock', x: 4, y: 2 }).ok).toBe(true); // 곡괭이로 무료
  expect(s.money).toBe(0);
  expect(s.inventory['pickaxe']).toBe(0);
  expect(cellAt(s, 4, 2).terrain).toBe('soil');
  // 곶자왈 덤불
  s.parcels.find((p) => p.no === 3)!.owned = true;
  const bush = Object.values(s.objects).find((o) => o.type === 'bush_wild')!;
  expect(clearCost(s, bush.x, bush.y)).toBe(BUSH_CLEAR_COST);
  s.money = 50_000;
  expect(clearRock(s, bush.x, bush.y)).toBe(BUSH_CLEAR_COST);
  expect(s.objects[bush.id]).toBeUndefined();
  expect(cellAt(s, bush.x, bush.y)).toMatchObject({ terrain: 'soil', objectId: null });
});

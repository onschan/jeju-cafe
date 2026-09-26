/** 본관·마당 (zero-base, specs/2026-09-26-zero-base-start.md): 본관은 지붕 없는 진짜 카페(4×3) — 안에도 자리를 놓고, 증축하면 실내가 넓어진다. */
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { canPlace, placeObject, objectAt, doorFrontOf, doorOf, isFixedCell, isRoomFloor } from '../grid.ts';
import { isWalkable, isDoorReachable, canStep } from '../path.ts';
import { spawnGuests, freeSeats, updateGuests, SEAT_MS } from '../guests.ts';
import { setSlot } from '../menu.ts';
import { dayIndex } from '../effects.ts';
import { siteOf, siteBonus, coldDay, shelterOf, SHELTER_PENALTY, SITE_MAX } from '../site.ts';
import { objectDef, ROOM_IDS, SHELTER, BUILD_GROUPS } from '../../data/index.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import {
  mainBuilding, isRoomCut, stayMs, browseChance, cafeMoodSpawnMult,
  seatsShort, seatUsePct, dailyRooms, accumulateSeatUse, mainSummary, autoConnectDoor, autoPathCellCost,
  MAIN_SIZE, MAIN_SIZES, MAIN_MAX_LEVEL, MAIN_EXPAND_COST, MAIN_EXPAND_DAYS, STAY_PER_FACILITY_MS, SEAT_FULL_TEXT,
  mainLevel, mainSize, freeFloorCells, indoorSeats, isIndoorSeat, nextMainLevel, expandCost, expandCells, canExpandMain, isMainClosed,
} from '../rooms.ts';
import type { GameState } from '../types.ts';

/** 본관 문 앞(4,4)에서 어귀 토막(4,6)까지 올렛길 + 메뉴 1개 (손님이 올 수 있는 최소 상태) */
function cafe(seed = 1): GameState {
  const s = bareState(seed);
  s.money = 100_000_000;
  for (const y of [4, 5]) placeObject(s, 'path', X(4), Y(y));
  setSlot(s, 0, 'americano');
  s.storage['beans'] = 100; s.storage['water'] = 100;
  return s;
}
const main = (s: GameState) => mainBuilding(s)!;

describe('데이터', () => {
  test('본관은 5×4 「카페」, 증축 5단계, 방은 본관·주방 확장·화장실·청소도구실', () => {
    expect(objectDef('warehouse').name).toBe('카페');
    expect(objectDef('warehouse').w).toBe(5);
    expect(objectDef('warehouse').h).toBe(4);
    expect(MAIN_SIZE).toEqual({ w: 5, h: 4 });
    expect(MAIN_SIZES).toEqual({ 1: { w: 5, h: 4 }, 2: { w: 6, h: 4 }, 3: { w: 7, h: 5 }, 4: { w: 8, h: 5 }, 5: { w: 8, h: 6 } });
    expect(MAIN_MAX_LEVEL).toBe(5);
    expect([...ROOM_IDS]).toEqual(['warehouse', 'kitchen_ext', 'restroom', 'cleaning_room']);
    expect(BUILD_GROUPS.map((g) => g.key)).toEqual(['rest', 'convenience', 'food', 'fun', 'farm', 'sceneryDeco', 'pathWall']);
    expect(SHELTER['warehouse']).toBe(2);
  });
});

describe('실내: 본관 안에도 자리를 놓는다', () => {
  test('문·문 앞·바닥·카운터 칸: 뒷벽 줄(x > room.x)은 카운터, 나머지는 빈 바닥, 문은 정면 왼쪽', () => {
    const s = cafe();
    const m = main(s);
    expect([m.x, m.y]).toEqual([X(4), Y(0)]);
    expect(doorOf(m)).toEqual({ x: X(4), y: Y(3) });
    expect(doorFrontOf(m)).toEqual({ x: X(4), y: Y(4) });
    for (const dx of [1, 2, 3]) expect(isFixedCell(s, m.x + dx, m.y)).toBe(true);
    expect(isFixedCell(s, m.x, m.y)).toBe(false); // 문 기둥 열은 바닥
    expect(freeFloorCells(s, m).length).toBe(15); // 5×4 = 20 − 카운터 4 − 문 1
    expect(freeFloorCells(s, m).map((p) => `${p.x - m.x},${p.y - m.y}`)).toContain('0,0');
    expect(freeFloorCells(s, m).map((p) => `${p.x - m.x},${p.y - m.y}`)).not.toContain('0,3'); // 문
    expect(isRoomFloor(s, m.x + 1, m.y + 1)).toBe(true);
    expect(isRoomFloor(s, m.x + 1, m.y)).toBe(false);
  });
  test('걷기: 빈 바닥은 걷고, 방 경계는 문으로만 넘는다, 카운터 칸은 못 걷는다', () => {
    const s = cafe();
    const m = main(s);
    expect(isWalkable(s, m.x + 1, m.y + 1)).toBe(true);
    expect(isWalkable(s, m.x + 1, m.y)).toBe(false);
    expect(canStep(s, doorFrontOf(m), doorOf(m))).toBe(true);
    expect(canStep(s, { x: m.x + 1, y: m.y + 4 }, { x: m.x + 1, y: m.y + 3 })).toBe(false); // 벽을 뚫고는 못 들어간다
    expect(canStep(s, { x: m.x + 1, y: m.y + 1 }, { x: m.x + 2, y: m.y + 1 })).toBe(true); // 안에서는 자유
    expect(isDoorReachable(s, m)).toBe(true);
  });
  test('놓기: 빈 바닥엔 1×1 좌석·장식만, 문 칸·카운터 칸은 안 되고, 통로가 막히면 안 된다', () => {
    const s = cafe();
    const m = main(s);
    expect(canPlace(s, 'table_out', m.x + 1, m.y + 1).ok).toBe(true);
    expect(canPlace(s, 'deco_planter', m.x + 2, m.y + 2).ok).toBe(true);
    expect(canPlace(s, 'tangerine_tree', m.x + 1, m.y + 1)).toEqual({ ok: false, reason: '안에는 자리·장식만 놓아요' });
    expect(canPlace(s, 'table_out', m.x + 1, m.y)).toEqual({ ok: false, reason: '카운터·주방 자리예요' });
    expect(canPlace(s, 'table_out', m.x, m.y + 3)).toEqual({ ok: false, reason: '문 앞은 비워 둬요' });
    // 문 (0,3) 옆 (1,3)을 채워도 (0,2) → (1,2) 통로로 카운터 앞에 닿는다. 거기서 (0,2)까지 막으면 문이 봉해진다
    expect(apply(s, { type: 'place', objectType: 'table_out', x: m.x + 1, y: m.y + 3 }).ok).toBe(true); // (1,3)
    expect(canPlace(s, 'table_out', m.x, m.y + 2).ok).toBe(false); // (0,2)까지 막으면 카운터 앞으로 가는 길이 없다
    expect(canPlace(s, 'table_out', m.x + 4, m.y + 3).ok).toBe(true); // (4,3)은 (0,2)→(1,2)→…→(4,2)로 닿는다
  });
  test('실내 자리는 그늘 최대·바람 없음 → 「조용함」 손님 자리, 손님이 문으로 들어가 앉는다', () => {
    const s = cafe();
    const m = main(s);
    const seat = placeObject(s, 'table_out', m.x + 1, m.y + 1);
    expect(isIndoorSeat(s, seat)).toBe(true);
    expect(siteOf(s, seat.x, seat.y).shade).toBe(SITE_MAX.shade);
    expect(indoorSeats(s)).toBe(2);
    expect(freeSeats(s).map((o) => o.id)).toEqual([seat.id]);
    expect(spawnGuests(s, 1)).toBe(1);
    const g = s.guests[0]!;
    expect(g.path.some((p) => p.x === doorOf(m).x && p.y === doorOf(m).y)).toBe(true); // 문을 지난다
    updateGuests(s, 8000);
    expect(g.phase).toBe('seated');
    expect(g.seatId).toBe(seat.id);
  });
});

describe('증축: 4×3 → 5×3 → 6×4', () => {
  test('canExpandMain: 돈·자리·최고 단계, expandCells는 늘어나는 칸만', () => {
    const s = cafe();
    expect(mainLevel(s)).toBe(1);
    expect(nextMainLevel(s)).toBe(2);
    expect(expandCost(s)).toBe(MAIN_EXPAND_COST[2]);
    expect(expandCells(s).map((p) => `${p.x - X(4)},${p.y - Y(0)}`)).toEqual(['5,0', '5,1', '5,2', '5,3']);
    s.money = 0;
    expect(canExpandMain(s)).toEqual({ ok: false, reason: '돈이 모자라요' });
    s.money = 100_000_000;
    placeObject(s, 'stonewall', X(9), Y(2)); // 늘어날 칸에 시설
    expect(canExpandMain(s).ok).toBe(false);
  });
  test('expandMain: 돈을 내고 발자국이 커지며 공사 중엔 안에 못 들어간다, 끝나면 실내가 넓어진다 — Lv3·Lv5에서 문 앞이 한 칸 내려가 올렛길을 잇는다', () => {
    const s = cafe();
    const m = main(s);
    const inside = placeObject(s, 'table_out', m.x + 1, m.y + 1);
    const money = s.money;
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(s.money).toBe(money - MAIN_EXPAND_COST[2]!);
    expect(mainLevel(s)).toBe(2);
    expect(mainSize(s)).toEqual({ w: 6, h: 4 });
    expect(m.build).toBeDefined();
    expect(isMainClosed(s)).toBe(true);
    expect(isWalkable(s, m.x + 1, m.y + 2)).toBe(false); // 공사 중
    expect(freeSeats(s)).toEqual([]);
    expect(objectAt(s, inside.x, inside.y)?.id).toBe(inside.id); // 안의 가구는 그대로
    expect(canExpandMain(s)).toEqual({ ok: false, reason: '공사 중이에요' });
    for (let i = 0; i < MAIN_EXPAND_DAYS + 1; i++) tick(s, DAY_MS);
    expect(m.build).toBeUndefined();
    expect(freeFloorCells(s, m).length).toBe(17); // 6×4 = 24 − 카운터 5 − 문 1 − 테이블 1 = 17
    s.guests = []; // 공사가 끝나자마자 온 손님은 치우고 본다
    expect(freeSeats(s).map((o) => o.id)).toEqual([inside.id]);
    // Lv3: 7×5 — 아래로 한 줄 커져 문 앞이 (4,5)로 내려간다. 옛 문 앞 길은 걷어내고 새 문 앞까지 이어져 있다
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(mainSize(s)).toEqual({ w: 7, h: 5 });
    expect(doorFrontOf(m)).toEqual({ x: X(4), y: Y(5) });
    for (let i = 0; i < MAIN_EXPAND_DAYS + 1; i++) tick(s, DAY_MS);
    expect(isDoorReachable(s, m)).toBe(true);
    // Lv4 8×5 → Lv5 8×6 (문 앞 (4,6)) — 그 다음은 없다
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    for (let i = 0; i < MAIN_EXPAND_DAYS + 1; i++) tick(s, DAY_MS);
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(mainSize(s)).toEqual({ w: 8, h: 6 });
    expect(doorFrontOf(m)).toEqual({ x: X(4), y: Y(6) });
    for (let i = 0; i < MAIN_EXPAND_DAYS + 1; i++) tick(s, DAY_MS);
    expect(isDoorReachable(s, m)).toBe(true);
    expect(freeFloorCells(s, m).length).toBe(39); // 8×6 = 48 − 카운터 7 − 문 1 − 테이블 1
    expect(nextMainLevel(s)).toBeNull();
    expect(canExpandMain(s).ok).toBe(false);
  });
});

describe('겨울·비는 좌석을 끄지 않고 만족만 깎는다 (P0-3)', () => {
  test('겨울에도 야외 좌석이 그대로 후보에 남고, 손님이 앉는다', () => {
    const s = cafe();
    placeObject(s, 'table_out', X(5), Y(5));
    placeObject(s, 'table_parasol', X(3), Y(5));
    s.clock.month = 7;
    expect(coldDay(s)).toBe(false);
    expect(freeSeats(s).length).toBe(2);
    s.clock.month = 12;
    expect(coldDay(s)).toBe(true);
    expect(freeSeats(s).map((o) => o.type).sort()).toEqual(['table_out', 'table_parasol']); // 겨울에도 둘 다 후보
    expect(spawnGuests(s, 2)).toBe(2);
    expect(s.guests.every((g) => g.seatId !== null)).toBe(true);
  });
  test('추운 날이어도 지붕은 만족을 가르지 않는다 — 지붕 개념을 없앴다 (카이로 방향)', () => {
    const s = cafe();
    const bare = placeObject(s, 'table_out', X(5), Y(5));
    const roof = placeObject(s, 'table_parasol', X(3), Y(5));
    s.clock.month = 8;
    s.events.push({ id: 'ev_typhoon_aug', endsDay: dayIndex(s.clock) + 3 } as never);
    expect(coldDay(s)).toBe(true);
    expect(shelterOf(bare)).toBe(0);
    expect(shelterOf(roof)).toBe(1);
    expect(SHELTER_PENALTY).toBe(0);
    expect(siteBonus(s, roof).satisfaction - siteBonus(s, bare).satisfaction).toBe(0);
  });
});

describe('체류·둘러보기·좌석 이용률', () => {
  test('체류 시간 = 좌석 기본 + 순회 시설당 +8분(상한 6), 따뜻한 조명 저녁 +10%; 둘러보기 확률은 시설 3개 초과분 +5%', () => {
    const s = cafe();
    const g = { seatId: null } as never;
    expect(stayMs(s, g, SEAT_MS)).toBe(SEAT_MS);
    placeObject(s, 'vending', X(5), Y(5)); // 이용료 시설 1
    expect(stayMs(s, g, SEAT_MS)).toBe(SEAT_MS + STAY_PER_FACILITY_MS);
    expect(browseChance(s, 0.4)).toBe(0.4);
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [9, 0]] as const) placeObject(s, 'vending', X(x), Y(y));
    expect(browseChance(s, 0.4)).toBeCloseTo(0.5);
    const seat = placeObject(s, 'table_out', X(3), Y(5));
    const gs = { seatId: seat.id } as never;
    expect(stayMs(s, gs, 1000)).toBe(1000 + 5 * STAY_PER_FACILITY_MS);
    s.clock.hour = 19;
    expect(stayMs(s, gs, 1000)).toBe(Math.round((1000 + 5 * STAY_PER_FACILITY_MS) * 1.1)); // 따뜻한 조명 저녁
    s.main.lighting = 'bright';
    expect(stayMs(s, gs, 1000)).toBe(1000 + 5 * STAY_PER_FACILITY_MS);
  });
  test('좌석 이용률: 시간마다 누적, 새 날에 %로 기록, 80% 초과 3일 연속이면 "자리가 모자라요"', () => {
    const s = cafe();
    placeObject(s, 'table_out', X(5), Y(5)); // 2석
    accumulateSeatUse(s, 1000);
    expect(s.main.openMs).toBe(2000);
    s.guests.push({ id: 'g1', type: 'student', phase: 'seated', x: 0, y: 0, path: [], seatId: objectAt(s, X(5), Y(5))!.id, seatSlot: 0, approachCell: null, menuId: null, mood: null, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 });
    s.guests.push({ ...s.guests[0]!, id: 'g2', seatSlot: 1 });
    accumulateSeatUse(s, 1000);
    expect(s.main.usedSeatMs).toBe(2000);
    dailyRooms(s);
    expect(seatUsePct(s)).toBe(50);
    expect(seatsShort(s)).toBe(false);
    s.main.seatLog = [90, 85];
    s.main.openMs = 1000; s.main.usedSeatMs = 900;
    const n = s.notices.length;
    dailyRooms(s);
    expect(seatsShort(s)).toBe(true);
    expect(s.notices.slice(n)).toContain(SEAT_FULL_TEXT);
    expect(mainSummary(s).short).toBe(true);
  });
});

describe('올렛길 자동 연결·카페 분위기', () => {
  test('autoConnectDoor: 새 문 앞에서 정류장과 이어진 가장 가까운 길까지 빈 흙에만 올렛길을 놓고 칸당 길 가격을 낸다', () => {
    const s = cafe();
    const m = main(s);
    expect(autoConnectDoor(s, m)).toEqual({ laid: 0, cost: 0, need: 0, route: [] }); // 이미 이어져 있음
    apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(4))!.id }); // 문 앞 길 철거 → 끊김
    apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(5))!.id });
    expect(isDoorReachable(s, m)).toBe(false);
    expect(isRoomCut(s, m)).toBe(true);
    const money = s.money;
    const r = autoConnectDoor(s, m);
    expect(r.laid).toBe(2); // (4,4)·(4,5) — 어귀 토막 (4,6)까지 최단
    expect(r.cost).toBe(2 * autoPathCellCost());
    expect(s.money).toBe(money - r.cost);
    expect(isDoorReachable(s, m)).toBe(true);
    expect(objectAt(s, X(4), Y(4))?.type).toBe('path');
  });
  test('autoConnectDoor: 돈이 모자라면 놓지 않고 필요 금액만, 이을 길이 없으면 route null', () => {
    const s = cafe();
    const m = main(s);
    apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(4))!.id });
    s.money = autoPathCellCost() - 1;
    const r = autoConnectDoor(s, m);
    expect(r.laid).toBe(0);
    expect(r.need).toBe(autoPathCellCost());
    expect(objectAt(s, X(4), Y(4))).toBeNull();
    // 문 앞이 남의 땅(올렛길을 못 놓는 칸)이면 이을 수 없다
    s.money = 100_000_000;
    s.parcels.find((p) => p.no === 1)!.owned = false;
    expect(autoConnectDoor(s, m).route).toBeNull();
  });
  test('BGM·조명 유입 배수: 잔잔 BGM은 어르신 +5%, 밝은 조명은 청년 +5%', () => {
    const s = cafe();
    expect(cafeMoodSpawnMult(s, 'student')).toBe(1);
    apply(s, { type: 'setBgm', bgm: 'calm' });
    expect(cafeMoodSpawnMult(s, 'local_auntie')).toBeCloseTo(1.05);
    apply(s, { type: 'setLighting', lighting: 'bright' });
    expect(cafeMoodSpawnMult(s, 'student')).toBeCloseTo(1.05);
  });
});

test('autoConnectDoor: 문 앞에 시설이 있으면 잇지 않고 blocked에 이름을 돌려준다', () => {
  const s = cafe();
  const m = main(s);
  apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(4))!.id });
  placeObject(s, 'table_out', X(4), Y(4));
  const r = autoConnectDoor(s, m);
  expect(r.route).toBeNull();
  expect(r.blocked).toBe(objectDef('table_out').name);
});

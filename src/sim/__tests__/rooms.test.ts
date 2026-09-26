/** 본관·마당 (야외 중심 개편): 본관은 주방·카운터만 있는 3×2 상자, 손님은 전부 마당에 앉는다.
 *  추위·비는 시설의 지붕(shelter)이 막는다 — 겨울에 좌석을 걸러내지 않는다. */
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { canPlace, placeObject, objectAt, doorFrontOf } from '../grid.ts';
import { isWalkable, isDoorReachable } from '../path.ts';
import { spawnGuests, freeSeats, SEAT_MS } from '../guests.ts';
import { setSlot } from '../menu.ts';
import { dayIndex } from '../effects.ts';
import { siteBonus, coldDay, shelterOf, SHELTER_PENALTY } from '../site.ts';
import { objectDef, goalDef, ROOM_IDS, SHELTER, BUILD_GROUPS, buildGroupOf } from '../../data/index.ts';
import {
  mainBuilding, isRoomCut, stayMs, browseChance, cafeMoodSpawnMult,
  seatsShort, seatUsePct, dailyRooms, accumulateSeatUse, mainSummary, autoConnectDoor, autoPathCellCost,
  MAIN_SIZE, STAY_PER_FACILITY_MS, SEAT_FULL_TEXT,
} from '../rooms.ts';
import type { GameState } from '../types.ts';

/** 본관 문 앞(3,3)에서 정낭(4,6)까지 올렛길 + 메뉴 1개 (손님이 올 수 있는 최소 상태) */
function cafe(seed = 1): GameState {
  const s = bareState(seed);
  s.money = 100_000_000;
  for (const [x, y] of [[3, 3], [4, 3], [4, 4], [4, 5]] as const) placeObject(s, 'path', X(x), Y(y));
  setSlot(s, 0, 'americano');
  s.storage['beans'] = 100; s.storage['water'] = 100;
  return s;
}
const main = (s: GameState) => mainBuilding(s)!;

describe('데이터: 실내가 없다', () => {
  test('실내 좌석·별관·카운터 확장은 정의에서 사라졌고, 창가석은 야외 「전망 데크석」이 됐다', () => {
    for (const id of ['table_in', 'counter', 'counter_ext', 'annex_cafe', 'greenhouse_cafe']) {
      expect(() => objectDef(id), id).toThrow();
    }
    expect(objectDef('window_seat').name).toBe('전망 데크석');
    expect(buildGroupOf('window_seat')).toBe('rest');
    expect(ROOM_IDS.has('annex_cafe')).toBe(false);
    expect([...ROOM_IDS]).toEqual(['warehouse', 'kitchen_ext', 'restroom', 'cleaning_room']);
  });
  test('짓기 탭은 7개 — 「실내」 탭이 없다', () => {
    expect(BUILD_GROUPS.map((g) => g.key)).toEqual(['rest', 'convenience', 'food', 'fun', 'farm', 'sceneryDeco', 'pathWall']);
  });
  test('지붕(shelter): 파라솔·테라스·툇마루·화로는 1, 본관은 2, 나머지는 0', () => {
    expect(SHELTER['table_parasol']).toBe(1);
    expect(SHELTER['fire_pit']).toBe(1);
    expect(SHELTER['warehouse']).toBe(2);
    expect(objectDef('table_parasol').shelter).toBe(1);
    expect(objectDef('table_out').shelter).toBeUndefined();
  });
  test('목표: 실내 좌석·본관 Lv·별관 조건은 전망 좌석·명당·필지로 갈렸다', () => {
    expect(goalDef('g23').condition).toEqual({ type: 'siteSeats', view: 3, n: 6 });
    expect(goalDef('g36').condition).toEqual({ type: 'siteSeats', view: 4, n: 4 });
    expect(goalDef('g39').condition).toEqual({ type: 'corners', n: 3 });
    expect(goalDef('g48').condition).toEqual({ type: 'parcels', n: 7 });
    expect(goalDef('g49').condition).toEqual({ type: 'siteSeats', view: 4, n: 8 });
    expect(goalDef('g54').condition).toEqual({ type: 'parcels', n: 9 });
  });
});

describe('본관은 3×2 고정', () => {
  test('증축·2층·이사 액션이 없고, 본관은 못 옮기며 좌석이 0석이다', () => {
    const s = cafe();
    const m = main(s);
    expect(MAIN_SIZE).toEqual({ w: 3, h: 2 });
    expect(m.w ?? objectDef('warehouse').w).toBe(3);
    expect(apply(s, { type: 'move', objectId: m.id, x: X(0), y: Y(0) })).toEqual({ ok: false, reason: '본관은 못 옮겨요' });
    expect(freeSeats(s).length).toBe(0); // 본관 안엔 앉을 자리가 없다
  });
  test('본관 안 칸은 걷지 못하고 아무것도 못 놓는다 (주방·카운터뿐)', () => {
    const s = cafe();
    const m = main(s);
    expect(isWalkable(s, m.x + 1, m.y)).toBe(false);
    expect(canPlace(s, 'table_out', m.x + 1, m.y).ok).toBe(false);
    expect(isDoorReachable(s, m)).toBe(true);
    expect(doorFrontOf(m)).toEqual({ x: X(3), y: Y(3) });
  });
});

describe('겨울·비는 좌석을 끄지 않고 만족만 깎는다 (P0-3)', () => {
  test('겨울에도 야외 좌석이 그대로 후보에 남고, 손님이 앉는다', () => {
    const s = cafe();
    placeObject(s, 'table_out', X(5), Y(4));
    placeObject(s, 'table_parasol', X(6), Y(4));
    s.clock.month = 7;
    expect(coldDay(s)).toBe(false);
    expect(freeSeats(s).length).toBe(2);
    s.clock.month = 12;
    expect(coldDay(s)).toBe(true);
    expect(freeSeats(s).map((o) => o.type).sort()).toEqual(['table_out', 'table_parasol']); // 겨울에도 둘 다 후보
    expect(spawnGuests(s, 2)).toBe(2);
    expect(s.guests.every((g) => g.seatId !== null)).toBe(true);
  });
  test('추운 날이어도 지붕은 만족을 가르지 않는다 — 실내/실외·지붕 개념을 없앴다 (카이로 방향)', () => {
    const s = cafe();
    const bare = placeObject(s, 'table_out', X(5), Y(4));
    const roof = placeObject(s, 'table_parasol', X(6), Y(4));
    s.clock.month = 8;
    s.events.push({ id: 'ev_typhoon_aug', endsDay: dayIndex(s.clock) + 3 } as never);
    expect(coldDay(s)).toBe(true);
    expect(shelterOf(bare)).toBe(0);
    expect(shelterOf(roof)).toBe(1);
    expect(SHELTER_PENALTY).toBe(0); // 겨울은 손님 수(계절 배수)로만 온다 — 자리마다 지붕을 따지지 않는다
    expect(siteBonus(s, roof).satisfaction - siteBonus(s, bare).satisfaction).toBe(0);
  });
});

describe('체류·둘러보기·좌석 이용률', () => {
  test('체류 시간 = 좌석 기본 + 순회 시설당 +8분(상한 6), 따뜻한 조명 저녁 +10%; 둘러보기 확률은 시설 3개 초과분 +5%', () => {
    const s = cafe();
    const g = { seatId: null } as never;
    expect(stayMs(s, g, SEAT_MS)).toBe(SEAT_MS);
    placeObject(s, 'vending', X(5), Y(4)); // 이용료 시설 1
    expect(stayMs(s, g, SEAT_MS)).toBe(SEAT_MS + STAY_PER_FACILITY_MS);
    expect(browseChance(s, 0.4)).toBe(0.4);
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [6, 0]] as const) placeObject(s, 'vending', X(x), Y(y));
    expect(browseChance(s, 0.4)).toBeCloseTo(0.5);
    const seat = placeObject(s, 'table_out', X(6), Y(4));
    const gs = { seatId: seat.id } as never;
    expect(stayMs(s, gs, 1000)).toBe(1000 + 5 * STAY_PER_FACILITY_MS);
    s.clock.hour = 19;
    expect(stayMs(s, gs, 1000)).toBe(Math.round((1000 + 5 * STAY_PER_FACILITY_MS) * 1.1)); // 따뜻한 조명 저녁
    s.main.lighting = 'bright';
    expect(stayMs(s, gs, 1000)).toBe(1000 + 5 * STAY_PER_FACILITY_MS);
  });
  test('좌석 이용률: 시간마다 누적, 새 날에 %로 기록, 80% 초과 3일 연속이면 "자리가 모자라요"', () => {
    const s = cafe();
    placeObject(s, 'table_out', X(5), Y(4)); // 2석
    accumulateSeatUse(s, 1000);
    expect(s.main.openMs).toBe(2000);
    s.guests.push({ id: 'g1', type: 'student', phase: 'seated', x: 0, y: 0, path: [], seatId: objectAt(s, X(5), Y(4))!.id, seatSlot: 0, approachCell: null, menuId: null, mood: null, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 });
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
    apply(s, { type: 'remove', objectId: objectAt(s, X(3), Y(3))!.id }); // 문 앞 길 철거 → 끊김
    apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(3))!.id });
    expect(isDoorReachable(s, m)).toBe(false);
    expect(isRoomCut(s, m)).toBe(true);
    const money = s.money;
    const r = autoConnectDoor(s, m);
    expect(r.laid).toBe(2); // (3,3)·(4,3) — (4,4)까지 최단
    expect(r.cost).toBe(2 * autoPathCellCost());
    expect(s.money).toBe(money - r.cost);
    expect(isDoorReachable(s, m)).toBe(true);
    expect(objectAt(s, X(3), Y(3))?.type).toBe('path');
  });
  test('autoConnectDoor: 돈이 모자라면 놓지 않고 필요 금액만, 이을 길이 없으면 route null', () => {
    const s = cafe();
    const m = main(s);
    apply(s, { type: 'remove', objectId: objectAt(s, X(3), Y(3))!.id });
    s.money = autoPathCellCost() - 1;
    const r = autoConnectDoor(s, m);
    expect(r.laid).toBe(0);
    expect(r.need).toBe(autoPathCellCost());
    expect(objectAt(s, X(3), Y(3))).toBeNull();
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
  apply(s, { type: 'remove', objectId: objectAt(s, X(3), Y(3))!.id });
  placeObject(s, 'table_out', X(3), Y(3));
  const r = autoConnectDoor(s, m);
  expect(r.route).toBeNull();
  expect(r.blocked).toBe(objectDef('table_out').name);
});

/** 실내 카페 증축·본관 이동·실내 요소 (트랙 G+J, y-indoor): 스펙 §8 · UX §4 · P0-3/P0-4/P1-7/P1-12/P1-13 */
import { bareState, X, Y } from './helpers.ts';
import { apply } from '../actions.ts';
import { canPlace, placeObject, cellAt, objectAt, roomAt, doorFrontOf, footprintOf, sizeOf, canPlaceMain } from '../grid.ts';
import { isWalkable, isDoorReachable } from '../path.ts';
import { spawnGuests, updateGuests, freeSeats, SEAT_MS } from '../guests.ts';
import { setSlot } from '../menu.ts';
import { tick } from '../tick.ts';
import { DAY_MS, monthIndex } from '../clock.ts';
import { dayIndex } from '../effects.ts';
import { seatsOf } from '../cafe.ts';
import { siteOf } from '../site.ts';
import { serialize, deserialize } from '../save.ts';
import { goalProgress } from '../goals.ts';
import { objectDef, goalDef, INDOOR_IDS, ROOM_IDS, ANNEX_IDS, buildGroupOf } from '../../data/index.ts';
import {
  mainBuilding, mainLevel, indoorSeats, roomSeats, freeFloorCells, fixedCells, expandCells, canExpandMain, expandMain, canBuildSecondFloor, canStartMoveMain, canMoveMain, canUndoMoveMain,
  isRoomCut, annexCount, preferIndoor, filterSeatsForWeather, stayMs, browseChance, indoorSatisfaction, indoorSpawnMult, indoorFeeMult, isFireplaceOn, isPianoPlaying, hasNewBooks, isKidsStocked,
  seatsShort, seatUsePct, dailyRooms, accumulateSeatUse, isMainClosed, mainSummary, autoConnectDoor, autoPathCellCost,
  MAIN_SIZE, MAIN_EXPAND_COST, MAIN_EXPAND_DAYS, FLOOR2_COST, FLOOR2_SEATS, MOVE_COST, MOVE_DAYS, FIREPLACE_FUEL, STAY_PER_FACILITY_MS, SEAT_FULL_TEXT, KIDS_RESTOCK_COST, NEW_BOOKS_MILEAGE,
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

describe('데이터 (§8.2·8.3)', () => {
  test('실내 가구 7 + 별관 2가 objectDef에 있고, 실내 가구는 indoor·「실내」 탭, 별관은 room·별관 목록', () => {
    for (const id of ['sofa_seat', 'bar_counter', 'fireplace', 'piano', 'aquarium', 'kids_corner', 'counter_ext']) {
      expect(objectDef(id).indoor, id).toBe(true);
      expect(INDOOR_IDS.has(id), id).toBe(true);
      expect(buildGroupOf(id), id).toBe('indoor');
    }
    expect(objectDef('sofa_seat')).toMatchObject({ kind: 'seat', seats: 3, w: 2, h: 1, cost: 900_000 });
    expect(objectDef('bar_counter')).toMatchObject({ kind: 'seat', seats: 3, unlock: { type: 'star', star: 2 } });
    expect(objectDef('kids_corner')).toMatchObject({ w: 2, h: 2, noise: 1 });
    for (const id of ['annex_cafe', 'greenhouse_cafe']) { expect(objectDef(id).room, id).toBe(true); expect(ROOM_IDS.has(id)).toBe(true); expect(ANNEX_IDS.has(id)).toBe(true); }
    expect(objectDef('annex_cafe')).toMatchObject({ kind: 'building', w: 4, h: 3, cost: 6_000_000, buildDays: 7 });
    expect(objectDef('greenhouse_cafe')).toMatchObject({ w: 3, h: 3, cost: 4_500_000 });
  });
  test('목표 3개 교체(id 유지·보상 유지): g23 실내 좌석 6석 · g41 본관 Lv2 · g45 별관', () => {
    expect(goalDef('g23')).toMatchObject({ condition: { type: 'indoorSeats', n: 6 }, reward: [{ type: 'unlockFacility', id: 'vending' }] });
    expect(goalDef('g41')).toMatchObject({ condition: { type: 'mainLevel', lv: 2 }, reward: [{ type: 'unlockFacility', id: 'drum_footbath' }] });
    expect(goalDef('g45')).toMatchObject({ condition: { type: 'annex', n: 1 }, reward: [{ type: 'builder', n: 1 }] });
  });
});

describe('본관 증축 (§8.1)', () => {
  test('Lv1 3×2 → Lv2 4×3: 비용 300만·7일·영업 정지, 원점 고정·남동으로 자람, 발자국 안 올렛길은 철거·환불, 기존 가구는 그대로', () => {
    const s = cafe();
    const m = main(s);
    expect(mainLevel(s)).toBe(1);
    expect(sizeOf(m)).toEqual({ w: 3, h: 2 });
    placeObject(s, 'table_in', X(4), Y(2)); // fix-indoor: (4,1)은 카운터 칸
    expect(expandCells(s)).toEqual(expect.arrayContaining([{ x: X(6), y: Y(1) }, { x: X(6), y: Y(2) }, { x: X(3), y: Y(3) }, { x: X(4), y: Y(3) }, { x: X(5), y: Y(3) }, { x: X(6), y: Y(3) }]));
    expect(expandCells(s).length).toBe(6);
    const money = s.money;
    expect(canExpandMain(s).ok).toBe(true);
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(mainLevel(s)).toBe(2);
    expect(sizeOf(m)).toEqual(MAIN_SIZE[2]);
    expect(m).toMatchObject({ x: X(3), y: Y(1), w: 4, h: 3 });
    expect(s.money).toBe(money - MAIN_EXPAND_COST[2]! + 2 * objectDef('path').cost - objectDef('path').cost); // (3,3)·(4,3) 길 환불, 새 문 앞 (3,4) 자동 연결 1칸
    expect(objectAt(s, X(3), Y(4))?.type).toBe('path'); // 자동 연결된 올렛길
    expect(isDoorReachable(s, m)).toBe(true);
    expect(objectAt(s, X(3), Y(3))?.id).toBe(m.id);
    expect(cellAt(s, X(6), Y(3)).roomId).toBe(m.id);
    expect(footprintOf(m).length).toBe(12);
    expect(freeFloorCells(s, m).length).toBe(12 - 1 - 1 - 3); // 문·테이블·카운터 3칸(fix-indoor)
    expect(fixedCells(m)).toEqual([{ x: X(4), y: Y(1) }, { x: X(5), y: Y(1) }, { x: X(6), y: Y(1) }]);
    expect(objectAt(s, X(4), Y(2))?.type).toBe('table_in'); // 가구 유지
    expect(doorFrontOf(m)).toEqual({ x: X(3), y: Y(4) });
    expect(isMainClosed(s)).toBe(true);
    expect(s.main.work).toMatchObject({ kind: 'expand', toLevel: 2, days: MAIN_EXPAND_DAYS });
    expect(s.unlocked.objects).toContain('counter_ext'); // Lv2 해금
    expect(spawnGuests(s, 3)).toBe(0); // 공사 중 손님 0
    expect(canExpandMain(s).reason).toBe('공사 중이에요');
    for (let i = 0; i < MAIN_EXPAND_DAYS; i++) tick(s, DAY_MS);
    expect(isMainClosed(s)).toBe(false);
    expect(s.notices.some((n) => n.includes('본관 증축 Lv2 완공'))).toBe(true);
  });
  test('조건: 확장 칸에 시설·마을 길·남의 땅이 있으면 안 되고, 돈이 모자라면 안 된다. Lv4가 끝', () => {
    const s = cafe();
    placeObject(s, 'table_out', X(6), Y(2));
    expect(canExpandMain(s).reason).toBe('시설을 먼저 치워요');
    apply(s, { type: 'remove', objectId: objectAt(s, X(6), Y(2))!.id });
    cellAt(s, X(6), Y(1)).terrain = 'road';
    expect(canExpandMain(s).reason).toBe('여기엔 못 놓아요');
    cellAt(s, X(6), Y(1)).terrain = 'soil';
    s.money = 1_000_000;
    expect(canExpandMain(s).reason).toBe('돈이 모자라요');
    s.money = 100_000_000;
    for (const lv of [2, 3, 4]) {
      expect(apply(s, { type: 'expandMain' }).ok, `Lv${lv}`).toBe(true);
      for (let i = 0; i < MAIN_EXPAND_DAYS; i++) tick(s, DAY_MS);
      expect(sizeOf(main(s))).toEqual(MAIN_SIZE[lv]);
    }
    expect(canExpandMain(s).reason).toBe('이미 최고 단계예요');
    expect(footprintOf(main(s)).length).toBe(24);
  });
  test('실내 칸 자리: 그늘 2. 실내 가구는 방 안에만 (밖이면 "실내 가구는 건물 안에만 놓아요")', () => {
    const s = cafe();
    const site = siteOf(s, X(4), Y(2));
    expect(site.shade).toBe(2);
    expect(canPlace(s, 'sofa_seat', X(0), Y(0)).reason).toBe('실내 가구는 건물 안에만 놓아요');
    expect(canPlace(s, 'sofa_seat', X(4), Y(2)).ok).toBe(true);
    expect(canPlace(s, 'sofa_seat', X(4), Y(1)).reason).toBe('카운터·주방 자리예요'); // fix-indoor: 뒷벽 줄은 고정 설비
    expect(canPlace(s, 'kids_corner', X(4), Y(1)).reason).toBe('카운터·주방 자리예요'); // 2×2: (4,1)이 카운터
    expect(canPlace(s, 'kids_corner', X(3), Y(1)).reason).toBe('카운터·주방 자리예요'); // (4,1)이 카운터 (그리고 (3,2)가 문)
    expect(canPlace(s, 'kids_corner', X(5), Y(2)).reason).toBe('실내 가구는 건물 안에만 놓아요'); // (6,·)는 밖
    // Lv2(4×3)에선 2×2가 들어간다: (4,2)-(5,3) 바닥, 문(3,3)에서 (3,2)→카운터 앞으로 통한다
    s.money = 1e9; apply(s, { type: 'expandMain' });
    expect(canPlace(s, 'kids_corner', X(4), Y(2)).ok).toBe(true);
  });
});

describe('2층 (§8.2)', () => {
  test('Lv3부터 ₩1,500만·7일, 완공되면 본관이 6석 실내 좌석이 되고 전망 +1', () => {
    const s = cafe();
    expect(canBuildSecondFloor(s).reason).toBe('본관 Lv3부터 올릴 수 있어요');
    for (let x = 3; x <= 8; x++) for (let y = 1; y <= 4; y++) cellAt(s, X(x), Y(y)).terrain = 'soil';
    for (let i = 0; i < 2; i++) { apply(s, { type: 'expandMain' }); for (let d = 0; d < MAIN_EXPAND_DAYS; d++) tick(s, DAY_MS); }
    expect(mainLevel(s)).toBe(3);
    const view0 = siteOf(s, X(4), Y(1)).view;
    const money = s.money;
    expect(apply(s, { type: 'buildSecondFloor' }).ok).toBe(true);
    expect(s.money).toBe(money - FLOOR2_COST);
    expect(seatsOf(s, main(s))).toBe(0); // 공사 중
    for (let d = 0; d < 7; d++) tick(s, DAY_MS);
    expect(s.main.floor2).toBe(true);
    expect(seatsOf(s, main(s))).toBe(FLOOR2_SEATS);
    expect(indoorSeats(s)).toBe(FLOOR2_SEATS);
    expect(siteOf(s, X(4), Y(1)).view).toBe(Math.min(5, view0 + 1));
    expect(canBuildSecondFloor(s).reason).toBe('이미 2층이 있어요');
  });
});

describe('본관 옮기기 (§4.1)', () => {
  test('₩200만·3일(+Lv)·월 1회, 발자국은 내 필지 흙(올렛길은 철거·환불), 가구가 따라간다, 같은 날 되돌리기 1회', () => {
    const s = cafe();
    placeObject(s, 'table_in', X(4), Y(2));
    const m = main(s);
    expect(canStartMoveMain(s).ok).toBe(true);
    expect(canMoveMain(s, m.x, m.y).reason).toBe('지금 자리예요');
    expect(canPlaceMain(s, X(0), Y(4), 3, 2).ok).toBe(true); // (0..2, 4..5)는 바위 없음
    expect(canMoveMain(s, X(-3), Y(4)).reason).toBe('아직 내 땅이 아니에요');
    placeObject(s, 'table_out', X(1), Y(5));
    expect(canMoveMain(s, X(0), Y(4)).reason).toBe('시설을 먼저 치워요');
    apply(s, { type: 'remove', objectId: objectAt(s, X(1), Y(5))!.id });
    placeObject(s, 'path', X(1), Y(5));
    const money = s.money;
    expect(apply(s, { type: 'move', objectId: m.id, x: X(0), y: Y(4) }).ok).toBe(true); // 카드 「옮기기」 → 이동 모드 → 'move' 액션이 moveMain으로
    expect(m).toMatchObject({ x: X(0), y: Y(4) });
    expect(objectAt(s, X(1), Y(5))?.type).toBe('table_in'); // 상대 위치 유지 (1,1)
    expect(cellAt(s, X(1), Y(5)).roomId).toBe(m.id);
    expect(cellAt(s, X(4), Y(1)).roomId).toBeNull();
    expect(s.money).toBe(money - MOVE_COST + objectDef('path').cost - objectDef('path').cost); // (1,5) 환불, 새 문 앞 (0,6) 자동 연결 1칸
    expect(objectAt(s, X(0), Y(6))?.type).toBe('path');
    expect(isDoorReachable(s, m)).toBe(true);
    expect(s.main.work).toMatchObject({ kind: 'move', days: MOVE_DAYS });
    expect(s.main.movedMonth).toBe(monthIndex(s.clock));
    expect(canStartMoveMain(s).reason).toBe('공사 중이에요');
    expect(doorFrontOf(m)).toEqual({ x: X(0), y: Y(6) });
    expect(isRoomCut(s, m)).toBe(false); // 공사 중엔 경고 안 함
    // 되돌리기
    expect(canUndoMoveMain(s).ok).toBe(true);
    expect(apply(s, { type: 'undoMoveMain' }).ok).toBe(true);
    expect(m).toMatchObject({ x: X(3), y: Y(1) });
    expect(objectAt(s, X(4), Y(2))?.type).toBe('table_in');
    expect(s.money).toBe(money); // 비용 환불 (길 환불·자동 연결 길은 그대로 남는다)
    expect(s.main.work).toBeNull();
    expect(canStartMoveMain(s).ok).toBe(true); // 횟수 복구
    // 다시 옮기면 이달은 끝. 문 앞이 길이 아니고 돈이 모자라 자동 연결을 못 하면 경고(필요 금액) + 길 끊김
    apply(s, { type: 'remove', objectId: objectAt(s, X(0), Y(6))!.id });
    s.money = MOVE_COST + objectDef('path').cost - 1;
    expect(apply(s, { type: 'moveMain', x: X(0), y: Y(4) }).ok).toBe(true);
    expect(s.notices.at(-1)).toContain('문 앞에 올렛길을 이어 주세요');
    expect(s.notices.at(-1)).toContain('필요');
    expect(objectAt(s, X(0), Y(6))).toBeNull();
    s.money = 100_000_000;
    tick(s, DAY_MS);
    expect(canUndoMoveMain(s).reason).toBe('되돌릴 이동이 없어요');
    for (let d = 0; d < MOVE_DAYS; d++) tick(s, DAY_MS);
    expect(s.main.work).toBeNull();
    expect(canStartMoveMain(s).reason).toBe('이달엔 이미 옮겼어요');
    expect(isRoomCut(s, m)).toBe(true);
    expect(mainSummary(s).cut).toBe(true);
  });
  test('금지: 증축 공사 중·튜토리얼 1~4단계·빅 이벤트 중·손님 있을 때', () => {
    const s = cafe();
    s.tutorial.step = 1;
    expect(canStartMoveMain(s).reason).toBe('튜토리얼을 먼저 끝내요');
    s.tutorial.step = 99;
    s.events.push({ id: 'ev_typhoon_aug', endsDay: dayIndex(s.clock) + 3 } as never);
    expect(canStartMoveMain(s).reason).toBe('이벤트 중엔 못 옮겨요');
    s.events = [];
    apply(s, { type: 'expandMain' });
    expect(canStartMoveMain(s).reason).toBe('공사 중이에요');
  });
  test('손님: 마당 자리 손님은 상관없고, 본관 자리에 앉았거나 본관 발자국(옮길 자리 포함)을 지나는 손님이 있으면 금지', () => {
    const s = cafe();
    s.tutorial.step = 99;
    placeObject(s, 'table_out', X(6), Y(6));
    const base = { id: 'g1', type: 'student', phase: 'seated', x: X(6), y: Y(6), path: [], seatId: objectAt(s, X(6), Y(6))!.id, seatSlot: 0, approachCell: null, menuId: null, mood: null, moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 } as never;
    s.guests.push(base);
    expect(canStartMoveMain(s).ok).toBe(true); // 마당 손님만
    s.guests[0] = { ...(base as object), seatId: main(s).id } as never; // 본관 카운터에 앉음
    expect(canStartMoveMain(s).reason).toBe('본관에 손님이 있을 땐 못 옮겨요');
    s.guests[0] = { ...(base as object), path: [{ x: X(7), y: Y(7) }] } as never; // 옮길 자리를 지나감
    expect(canStartMoveMain(s).ok).toBe(true);
    expect(canMoveMain(s, X(7), Y(7)).reason).toBe('손님이 지나가는 자리예요');
  });
  test('직원 대기 칸·주방 거리는 옮긴 본관 문 앞 기준, 저장 왕복에 w/h·main이 남는다', () => {
    const s = cafe();
    apply(s, { type: 'expandMain' });
    const j = serialize(s);
    const t = deserialize(j);
    expect(sizeOf(main(t))).toEqual(MAIN_SIZE[2]);
    expect(t.main.level).toBe(2);
    expect(cellAt(t, X(6), Y(3)).objectId).toBe(main(t).id);
    const legacy = JSON.parse(j); delete legacy.main; // main 없는 옛 세이브 → backfill
    expect(deserialize(JSON.stringify(legacy)).main.level).toBe(1);
  });
});

describe('손님: 겨울·비·태풍 실내 우선, 체류 시간, 둘러보기 (§8.1·P1-12)', () => {
  test('겨울엔 길이 이어진 실내 좌석이 있으면 실내를 먼저 고른다 (실내가 차면 야외)', () => {
    const s = cafe();
    placeObject(s, 'table_in', X(4), Y(2)); // 2석
    placeObject(s, 'table_out', X(5), Y(4));
    s.clock.month = 7;
    expect(preferIndoor(s)).toBe(false);
    expect(filterSeatsForWeather(s, freeSeats(s)).length).toBe(2);
    s.clock.month = 12;
    expect(preferIndoor(s)).toBe(true);
    expect(freeSeats(s).map((o) => o.type)).toEqual(['table_in']);
    expect(spawnGuests(s, 3)).toBe(3);
    expect(s.guests.filter((g) => s.objects[g.seatId!]!.type === 'table_in').length).toBe(2);
    expect(s.guests.filter((g) => s.objects[g.seatId!]!.type === 'table_out').length).toBe(1);
    // 태풍 이벤트도 실내 우선
    s.clock.month = 8;
    s.events.push({ id: 'ev_typhoon_aug', endsDay: dayIndex(s.clock) + 3 } as never);
    expect(preferIndoor(s)).toBe(true);
    // 문이 길로 안 이어진 방의 실내 좌석은 우선하지 않는다
    s.guests = [];
    expect(apply(s, { type: 'remove', objectId: objectAt(s, X(3), Y(3))!.id }).ok).toBe(true);
    expect(isDoorReachable(s, main(s))).toBe(false);
    expect(freeSeats(s).map((o) => o.type)).toContain('table_out'); // 실내 우선을 풀고 야외도 돌려준다
  });
  test('체류 시간 = 좌석 기본 + 순회 시설당 +8분(상한 6), 소파 +20%, 책장 +15%, 따뜻한 조명 저녁 +10%; 둘러보기 확률은 시설 3개 초과분 +5%', () => {
    const s = cafe();
    const g = { seatId: null } as never;
    expect(stayMs(s, g, SEAT_MS)).toBe(SEAT_MS);
    placeObject(s, 'vending', X(4), Y(2)); // 이용료 시설 1
    expect(stayMs(s, g, SEAT_MS)).toBe(SEAT_MS + STAY_PER_FACILITY_MS);
    expect(browseChance(s, 0.4)).toBe(0.4);
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [6, 0]] as const) placeObject(s, 'vending', X(x), Y(y)); // (밖에도 놓이나 테스트용으로 직접)
    expect(browseChance(s, 0.4)).toBeCloseTo(0.5);
    const sofa = placeObject(s, 'sofa_seat', X(4), Y(2));
    const gs = { seatId: sofa.id } as never;
    expect(stayMs(s, gs, 1000)).toBe(Math.round((1000 + 5 * STAY_PER_FACILITY_MS) * 1.2));
    s.clock.hour = 19;
    expect(stayMs(s, gs, 1000)).toBe(Math.round((1000 + 5 * STAY_PER_FACILITY_MS) * 1.3)); // 따뜻한 조명 저녁
    s.main.lighting = 'bright';
    expect(stayMs(s, gs, 1000)).toBe(Math.round((1000 + 5 * STAY_PER_FACILITY_MS) * 1.2));
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

describe('실내 요소 상호작용 (§4.3)', () => {
  test('난로: 켜기/끄기, 12~2월 자동 ON, 반경 2 실내 좌석 겨울 만족 +3, 켜 두면 월 연료 ₩5만', () => {
    const s = cafe();
    const fire = placeObject(s, 'fireplace', X(4), Y(2));
    const seat = placeObject(s, 'table_in', X(5), Y(2));
    s.clock.month = 7;
    expect(isFireplaceOn(s, fire)).toBe(false);
    expect(apply(s, { type: 'toggleFireplace', objectId: fire.id }).ok).toBe(true);
    expect(isFireplaceOn(s, fire)).toBe(true);
    expect(indoorSatisfaction(s, seat)).toBe(0); // 여름엔 없다
    s.clock.month = 12;
    expect(indoorSatisfaction(s, seat)).toBeCloseTo(0.3);
    apply(s, { type: 'toggleFireplace', objectId: fire.id });
    expect(isFireplaceOn(s, fire)).toBe(false);
    expect(indoorSatisfaction(s, seat)).toBe(0);
    // 12월 1일 자동 ON은 미설정 난로만
    const s2 = cafe();
    const fire2 = placeObject(s2, 'fireplace', X(4), Y(2));
    s2.clock.month = 11; s2.clock.day = 30;
    tick(s2, DAY_MS);
    expect(s2.clock.month).toBe(12);
    expect(isFireplaceOn(s2, fire2)).toBe(true);
    for (let d = 0; d < 30; d++) tick(s2, DAY_MS);
    expect(s2.clock.month).toBe(1);
    expect(s2.lastMonthCard?.costs.upkeep ?? 0).toBeGreaterThanOrEqual(FIREPLACE_FUEL); // 1월 1일 연료비가 12월 정산에 잡힌다
  });
  test('소파 만족 +2, 바 저녁 세트 18시 이후 1인 손님 요금 +15%, 책장 신간(마일리지 1·한 달), 수족관 먹이(하루 1회·청결 +2), 키즈 장난감(₩10만·한 달·가족 +25%)', () => {
    const s = cafe();
    const sofa = placeObject(s, 'sofa_seat', X(4), Y(2));
    expect(indoorSatisfaction(s, sofa)).toBeCloseTo(0.2);
    const bar = placeObject(s, 'bar_counter', X(4), Y(2));
    expect(indoorFeeMult(s, bar, 'student')).toBe(1);
    expect(apply(s, { type: 'setBarEvening', objectId: bar.id, on: true }).ok).toBe(true);
    s.clock.hour = 19;
    expect(indoorFeeMult(s, bar, 'digital_nomad')).toBe(1.15); // 1인 손님
    expect(indoorFeeMult(s, bar, 'rentcar_family')).toBe(1);
    s.clock.hour = 12;
    expect(indoorFeeMult(s, bar, 'digital_nomad')).toBe(1);
    // 책장
    const shelf = placeObject(s, 'bookshelf', X(0), Y(0));
    s.mileage = 0;
    expect(apply(s, { type: 'addBooks', objectId: shelf.id }).reason).toBe('마일리지가 모자라요');
    s.mileage = 2;
    expect(apply(s, { type: 'addBooks', objectId: shelf.id }).ok).toBe(true);
    expect(s.mileage).toBe(2 - NEW_BOOKS_MILEAGE);
    expect(hasNewBooks(s, shelf)).toBe(true);
    expect(apply(s, { type: 'addBooks', objectId: shelf.id }).reason).toBe('아직 신간이 있어요');
    // 수족관
    const aq = placeObject(s, 'aquarium', X(1), Y(0));
    s.clean.value = 50;
    expect(apply(s, { type: 'feedAquarium', objectId: aq.id }).ok).toBe(true);
    expect(s.clean.value).toBe(52);
    expect(apply(s, { type: 'feedAquarium', objectId: aq.id }).reason).toBe('오늘은 이미 줬어요');
    // 키즈
    const kids = placeObject(s, 'kids_corner', X(2), Y(0));
    expect(isKidsStocked(s, kids)).toBe(false);
    expect(indoorSpawnMult(s, 'rentcar_family')).toBeCloseTo(1.1); // 수족관 가족 +10%만
    const money = s.money;
    expect(apply(s, { type: 'restockKids', objectId: kids.id }).ok).toBe(true);
    expect(s.money).toBe(money - KIDS_RESTOCK_COST);
    expect(isKidsStocked(s, kids)).toBe(true);
    expect(indoorSpawnMult(s, 'rentcar_family')).toBeCloseTo(1.1 * 1.25);
    expect(indoorSpawnMult(s, 'student')).toBeCloseTo(1.1); // 책장 청년 +10%
  });
  test('피아노 연주 시간·BGM·조명 버튼 그룹은 sim 상태에 저장되고 유입 배수로 이어진다', () => {
    const s = cafe();
    expect(apply(s, { type: 'setPianoTime', time: 'lunch' }).reason).toBe('피아노가 없어요');
    placeObject(s, 'piano', X(4), Y(2));
    expect(apply(s, { type: 'setPianoTime', time: 'lunch' }).ok).toBe(true);
    s.clock.hour = 13;
    expect(isPianoPlaying(s)).toBe(true);
    expect(indoorSpawnMult(s, 'student')).toBeCloseTo(1.1);
    s.clock.hour = 15;
    expect(isPianoPlaying(s)).toBe(false);
    expect(apply(s, { type: 'setBgm', bgm: 'calm' }).ok).toBe(true);
    expect(indoorSpawnMult(s, 'local_auntie')).toBeCloseTo(1.05); // senior
    expect(indoorSpawnMult(s, 'student')).toBe(1);
    expect(apply(s, { type: 'setLighting', lighting: 'bright' }).ok).toBe(true);
    expect(indoorSpawnMult(s, 'student')).toBeCloseTo(1.05);
    expect(s.actionLog.at(-1)?.action).toEqual({ type: 'setLighting', lighting: 'bright' });
  });
});

describe('별관·목표 (§8.2·P1-13)', () => {
  test('별관은 완공돼야 세고, 문이 길로 안 이어지면 "길 끊김"; 목표 실내 좌석·본관 Lv·별관 판정', () => {
    const s = cafe();
    s.unlocked.objects.push('annex_cafe');
    expect(apply(s, { type: 'place', objectType: 'annex_cafe', x: X(0), y: Y(4) }).ok).toBe(true); // 문 (0,6) 앞 (0,7) 마을 길
    const annex = objectAt(s, X(0), Y(4))!;
    expect(annexCount(s)).toBe(0); // 짓는 중
    expect(goalProgress(s, goalDef('g45'))).toEqual({ cur: 0, max: 1 });
    for (let d = 0; d < 7; d++) tick(s, DAY_MS);
    expect(annexCount(s)).toBe(1);
    expect(goalProgress(s, goalDef('g45'))).toEqual({ cur: 1, max: 1 });
    expect(isRoomCut(s, annex)).toBe(false); // 마을 길(도로)이 문 앞
    placeObject(s, 'table_in', X(1), Y(4)); placeObject(s, 'table_in', X(2), Y(4)); placeObject(s, 'table_in', X(3), Y(4));
    expect(roomSeats(s, annex)).toBe(6);
    expect(indoorSeats(s)).toBe(6);
    expect(goalProgress(s, goalDef('g23'))).toEqual({ cur: 6, max: 6 });
    expect(goalProgress(s, goalDef('g41'))).toEqual({ cur: 1, max: 2 });
    apply(s, { type: 'expandMain' });
    expect(goalProgress(s, goalDef('g41'))).toEqual({ cur: 2, max: 2 });
    // 온실 카페: 안 자리 전망 +2
    s.unlocked.objects.push('greenhouse_cafe');
    const g = placeObject(s, 'greenhouse_cafe', X(7), Y(0));
    const inside = siteOf(s, X(8), Y(1)).view;
    expect(inside).toBeGreaterThanOrEqual(2);
    expect(roomAt(s, X(8), Y(1))?.id).toBe(g.id);
    expect(isWalkable(s, X(8), Y(1))).toBe(true);
  });
});

describe('z-polish: 올렛길 자동 연결·시설 플래그 캐시', () => {
  test('autoConnectDoor: 새 문 앞에서 정류장과 이어진 가장 가까운 길까지 빈 흙에만 올렛길을 놓고 칸당 길 가격을 낸다', () => {
    const s = cafe();
    const m = main(s);
    // 본관을 (0,4)로 옮긴 상태 흉내: 문 앞 (0,6)이 도로가 아니면 경로가 여러 칸이 된다 → 대신 별도 방(별관)으로 검증
    expect(autoConnectDoor(s, m)).toEqual({ laid: 0, cost: 0, need: 0, route: [] }); // 이미 이어져 있음
    apply(s, { type: 'remove', objectId: objectAt(s, X(3), Y(3))!.id }); // 문 앞 길 철거 → 끊김
    apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(3))!.id });
    expect(isDoorReachable(s, m)).toBe(false);
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
  test('indoorFlags 캐시 키는 배치 서명: actionLog가 캡(1,000)에 닿아도 철거를 바로 본다', () => {
    const s = cafe();
    placeObject(s, 'piano', X(4), Y(2));
    apply(s, { type: 'setPianoTime', time: 'lunch' });
    s.clock.hour = 13;
    for (let i = 0; i < 1001; i++) s.actionLog.push({ tick: s.tick, action: { type: 'setBgm', bgm: null } });
    expect(indoorSpawnMult(s, 'student')).toBeCloseTo(1.1);
    const len = s.actionLog.length;
    expect(apply(s, { type: 'remove', objectId: objectAt(s, X(4), Y(2))!.id }).ok).toBe(true);
    expect(s.actionLog.length).toBe(len); // 캡에 닿아 길이가 안 바뀐다
    expect(indoorSpawnMult(s, 'student')).toBe(1);
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

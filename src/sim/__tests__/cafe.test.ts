import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { apply } from '../actions.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { spawnGuests, updateGuests, totalSeats, freeSeats, pickVisit, isVisitable, likesFacility, VISIT_MS, SEAT_MS, PREP_MS } from '../guests.ts';
import { cafeLevel, nextCafeLevelIncome, placeCost, seatsOf, canPraise, EXPANSIONS, CAFE_LEVEL_INCOME, PRAISE_ENERGY, DEFAULT_CAFE_NAME } from '../cafe.ts';
import { hire, postJob } from '../staff.ts';
import { DAY_MS } from '../clock.ts';
import { tick } from '../tick.ts';
import { objectDef } from '../../data/index.ts';
import type { GameState } from '../types.ts';

function cafe() {
  const s = createInitialState(1);
  const seat = placeObject(s, 'table_out', X(4), Y(5)); // 정낭(4,6) 바로 위
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 10;
  s.money = 1e9;
  return { s, seat };
}

test('카페 이름: 기본 "제주 카페", 1~12자, 로그에 남는다', () => {
  const s = createInitialState(1);
  expect(s.cafeName).toBe(DEFAULT_CAFE_NAME);
  expect(apply(s, { type: 'renameCafe', name: '   ' }).reason).toBe('이름을 적어 주세요');
  expect(apply(s, { type: 'renameCafe', name: '가'.repeat(13) }).ok).toBe(false);
  expect(apply(s, { type: 'renameCafe', name: ' 귤향 카페 ' }).ok).toBe(true);
  expect(s.cafeName).toBe('귤향 카페');
  expect(s.actionLog.at(-1)!.action).toEqual({ type: 'renameCafe', name: ' 귤향 카페 ' });
});

test('카페 레벨: 누적 매출 구간 1~5, 손님 주문·시설 이용료가 쌓인다', () => {
  const s = createInitialState(1);
  expect(cafeLevel(s)).toBe(1);
  expect(nextCafeLevelIncome(s)).toBe(CAFE_LEVEL_INCOME[1]);
  s.totalIncome = 10_000_000; expect(cafeLevel(s)).toBe(2);
  s.totalIncome = 49_999_999; expect(cafeLevel(s)).toBe(2);
  s.totalIncome = 500_000_000; expect(cafeLevel(s)).toBe(5);
  expect(nextCafeLevelIncome(s)).toBeNull();
  const { s: s2 } = cafe();
  spawnGuests(s2, 1);
  updateGuests(s2, 5000);
  expect(s2.totalIncome).toBe(4000); // 당근주스
});

test('증축: 주방(요리 슬롯 +1)·2층(본관 4석)·테라스(야외 좌석 −20%), 한 번씩, 돈이 있어야', () => {
  const s = createInitialState(1);
  expect(EXPANSIONS.map((e) => e.id)).toEqual(['kitchen', 'floor2', 'terrace']);
  expect(apply(s, { type: 'expand', id: 'nope' }).ok).toBe(false);
  s.money = 1_000_000;
  expect(apply(s, { type: 'expand', id: 'kitchen' }).reason).toBe('돈이 모자라요');
  s.money = 20_000_000;
  expect(apply(s, { type: 'expand', id: 'kitchen' }).ok).toBe(true);
  expect(s.slots.cook).toBe(2);
  expect(s.money).toBe(15_000_000);
  expect(apply(s, { type: 'expand', id: 'kitchen' }).reason).toBe('이미 증축했어요');
  expect(s.notices.at(-1)).toContain('주방 증축');
  // 테라스: 야외 테이블 40,000, 실내 테이블은 그대로
  expect(placeCost(s, 'table_out')).toBe(50_000);
  expect(apply(s, { type: 'expand', id: 'terrace' }).ok).toBe(true);
  expect(placeCost(s, 'table_out')).toBe(40_000);
  expect(placeCost(s, 'table_in')).toBe(800_000);
  expect(placeCost(s, 'field')).toBe(30_000);
  const m0 = s.money;
  expect(apply(s, { type: 'place', objectType: 'table_out', x: X(0), y: Y(0) }).ok).toBe(true);
  expect(s.money).toBe(m0 - 40_000);
  // 2층: 본관이 4석짜리 좌석이 된다
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  expect(seatsOf(s, wh)).toBe(0);
  expect(totalSeats(s)).toBe(2);
  expect(apply(s, { type: 'expand', id: 'floor2' }).ok).toBe(true);
  expect(seatsOf(s, wh)).toBe(4);
  expect(totalSeats(s)).toBe(6);
  expect(freeSeats(s).some((o) => o.id === wh.id)).toBe(true);
  expect(s.expansions).toEqual(['kitchen', 'terrace', 'floor2']);
});

test('2층 손님: 문 앞에 길이 있으면 본관으로 걸어가 앉는다', () => {
  const s = createInitialState(1);
  s.money = 1e9;
  apply(s, { type: 'expand', id: 'floor2' });
  for (let y = 3; y <= 5; y++) placeObject(s, 'path', X(4), Y(y));
  placeObject(s, 'path', X(3), Y(3));
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 10;
  expect(spawnGuests(s, 1)).toBe(1);
  const wh = Object.values(s.objects).find((o) => o.type === 'warehouse')!;
  expect(s.guests[0]!.seatId).toBe(wh.id);
  updateGuests(s, 20_000);
  expect(s.guests[0]!.phase).toBe('seated');
  expect(Math.round(s.guests[0]!.y)).toBe(wh.y + 1); // 본관 발자국(2×3) 가운데 줄 = 2층
});

test('인테리어: 외벽 색 0~2, 간판 10자', () => {
  const s = createInitialState(1);
  expect(s.cosmetics).toEqual({ wallColor: 0, sign: '' });
  expect(apply(s, { type: 'setCosmetic', wallColor: 3 }).ok).toBe(false);
  expect(apply(s, { type: 'setCosmetic', wallColor: 2, sign: ' 귤향 ' }).ok).toBe(true);
  expect(s.cosmetics).toEqual({ wallColor: 2, sign: '귤향' });
  expect(apply(s, { type: 'setCosmetic', sign: '가'.repeat(11) }).ok).toBe(false);
});

test('칭찬하기: 기력 +10, 직원당 하루 한 번', () => {
  const s = createInitialState(1);
  s.money = 1e9;
  postJob(s, 'flyer');
  const st = hire(s, s.candidates[0]!.id, 'hall');
  st.energy = 50;
  expect(apply(s, { type: 'praise', staffId: 'nope' }).ok).toBe(false);
  expect(apply(s, { type: 'praise', staffId: st.id }).ok).toBe(true);
  expect(st.energy).toBe(50 + PRAISE_ENERGY);
  expect(canPraise(s, st.id).reason).toBe('오늘은 이미 칭찬했어요');
  st.energy = 95;
  tick(s, DAY_MS);
  expect(apply(s, { type: 'praise', staffId: st.id }).ok).toBe(true);
  expect(st.energy).toBeLessThanOrEqual(100);
});

test('시설 순회: 앉았다 일어난 손님이 40%로 닿는 시설에 들러 이용료를 내고 인기 +1, 숫자 팝업 fx', () => {
  const { s } = cafe();
  // 자판기는 실내 전용 → 폐창고 안 (5,1); 문 앞 (3,3)→(4,3)→(4,4)→(4,5)는 정낭 위 테이블이라 (3,3),(3,4),(3,5),(3,6)? 정낭(4,6) 옆 (3,6)에 길
  placeObject(s, 'vending', X(5), Y(1));
  for (const [x, y] of [[3, 3], [3, 4], [3, 5], [3, 6]] as const) placeObject(s, 'path', X(x), Y(y));
  expect(isVisitable('vending')).toBe(true);
  expect(isVisitable('table_out')).toBe(false);
  expect(likesFacility('student', 'vending')).toBe(false);      // 학생: 쉼·즐길거리
  expect(likesFacility('student', 'souvenir')).toBe(true);
  expect(likesFacility('digital_nomad', 'vending')).toBe(true); // 편의를 바란다
  s.guestTypes['digital_nomad']!.unlocked = true;
  // 결정적: 40%에 걸리도록 rng 상태를 고른다
  spawnGuests(s, 1, 'digital_nomad');
  const g = s.guests[0]!;
  updateGuests(s, 5000);
  expect(g.phase).toBe('seated');
  updateGuests(s, PREP_MS);
  expect(g.mood).not.toBeNull();
  let visited = false;
  for (let attempt = 0; attempt < 30 && !visited; attempt++) {
    const snap: GameState = JSON.parse(JSON.stringify(s));
    updateGuests(snap, SEAT_MS + 1);
    if (snap.guests[0]!.phase === 'visiting') {
      visited = true;
      const v = snap.guests[0]!;
      expect(v.visitId).toBe(Object.values(snap.objects).find((o) => o.type === 'vending')!.id);
      expect(v.seatId).toBeNull();
      const m0 = snap.money;
      updateGuests(snap, 20_000); // 걸어가서 이용
      expect(snap.money).toBe(m0 + objectDef('vending').fee!);
      expect(snap.visitBonus['vending']).toBe(1);
      expect(snap.fx.at(-1)).toMatchObject({ kind: 'pop', x: X(5), y: Y(1), n: 1 });
      updateGuests(snap, VISIT_MS + 1);
      expect(snap.guests[0]?.phase ?? 'gone').toMatch(/leaving|gone/);
    } else {
      s.rng = (s.rng + 7919) | 0; // 다른 난수 상태로 다시
    }
  }
  expect(visited).toBe(true);
  // pickVisit: 닿지 않는 시설은 안 고른다
  const s2 = createInitialState(1);
  placeObject(s2, 'vending', X(5), Y(1));
  let picked = 0;
  for (let i = 0; i < 20; i++) { const r = pickVisit(s2, { type: 'student' } as never, { x: X(4), y: Y(6) }); if (r) picked++; }
  expect(picked).toBe(0);
});

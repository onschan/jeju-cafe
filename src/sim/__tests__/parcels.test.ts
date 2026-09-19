import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { LOAN_AMOUNT, LOAN_THRESHOLD, LOAN_MAX } from '../failure.ts';
import { apply } from '../actions.ts';
import { canPlace, placeObject, sceneryScore, cellAt, objectAt, isSheltered, removeObject } from '../grid.ts';
import { parcelAt, parcelById, parcelPrice, canBuyParcel, parcelUnlockOwnedCount, parcelsAdjacent, COAST_FEE_MULT, COAST_SPAWN_MULT, OREUM_SCENERY, STONEHILL_SCENERY, VILLAGE_SENIOR_MULT, BATDAM_HARVEST_MULT } from '../parcels.ts';
import { typeWeight, spawnGuests, updateGuests } from '../guests.ts';
import { monthlyYieldOf } from '../orchard.ts';
import { monthIndex } from '../clock.ts';
import { checkLoan } from '../failure.ts';
import { setSlot } from '../menu.ts';
import { objectDef } from '../../data/index.ts';
import type { GameState } from '../types.ts';

function own(s: GameState, ...nos: number[]) {
  for (const p of s.parcels) if (nos.includes(p.no)) p.owned = true;
}

test('필지 9장: 3열×3행 10×8, 1번(정중앙)만 소유, 가격은 ×10', () => {
  const s = bareState(1);
  expect(s.parcels.map((p) => [p.no, p.x, p.y, p.owned])).toEqual([
    [1, 10, 8, true], [2, 0, 0, false], [3, 10, 0, false], [4, 0, 8, false], [5, 20, 16, false], [6, 10, 16, false],
    [7, 20, 8, false], [8, 20, 0, false], [9, 0, 16, false],
  ]);
  expect(parcelById(s, 'parcel2')!.price).toBe(1_500_000);
  expect(parcelById(s, 'village_edge')!.price).toBe(800_000);
  expect(parcelAt(s, 19, 15)!.no).toBe(1);
  expect(parcelAt(s, 9, 15)!.no).toBe(4);
  expect(parcelAt(s, 20, 8)!.no).toBe(7);
  expect(parcelAt(s, 25, 20)!.no).toBe(5);
  expect(s.parcels.map((p) => p.bonus)).toEqual(['none', 'oreum', 'gotjawal', 'batdam', 'coast', 'spring', 'village', 'stonehill', 'orchard']);
  // 시작 필지의 4방향 이웃: 3(위)·4(왼쪽)·7(오른쪽)·6(아래). 대각선(2·8·9·5)은 붙은 게 아니다.
  const p1 = parcelById(s, 'parcel1')!;
  expect(s.parcels.filter((p) => parcelsAdjacent(p1, p)).map((p) => p.no).sort()).toEqual([3, 4, 6, 7]);
});

test('필지별 지형·시작 오브젝트는 seed로 결정적이다', () => {
  const a = bareState(4), b = bareState(4);
  expect(a.grid.cells).toEqual(b.grid.cells);
  expect(a.objects).toEqual(b.objects);
  // 곶자왈(3번) 덤불, 밭담(4번) 돌담, 용천수(6번) 샘
  const inParcel = (s: GameState, no: number, type: string) => Object.values(s.objects).filter((o) => o.type === type && parcelAt(s, o.x, o.y)?.no === no).length;
  expect(inParcel(a, 3, 'bush_wild')).toBeGreaterThan(3);
  expect(inParcel(a, 4, 'stonewall')).toBe(14);
  expect(inParcel(a, 6, 'spring')).toBe(1);
  expect(inParcel(a, 8, 'stonewall')).toBe(6); // 돌담 언덕
  expect(inParcel(a, 9, 'tangerine_tree')).toBe(4);       // 옛 감귤밭 (완공된 나무 — 사면 다음 달 1일부터 수확)
  for (const o of Object.values(a.objects)) if (o.type === 'tangerine_tree') {
    expect(o.build).toBeUndefined();
    expect(o.placedMonth).toBeLessThanOrEqual(monthIndex(a.clock));
    expect(monthlyYieldOf(a, o)).toBe(0); // 아직 내 땅이 아니다
  }
  // 오름(2번, 왼쪽 위)은 능선(y=2, x 2..7)이 큰 바위
  for (let x = 2; x <= 7; x++) expect(cellAt(a, x, 2).terrain).toBe('rock_big');
  // 해안(5번, 오른쪽 아래)은 먼 변 두 줄이 도로, 마을 어귀(7번)는 오른쪽 변이 길
  for (let x = 20; x < 30; x++) { expect(cellAt(a, x, 22).terrain).toBe('road'); expect(cellAt(a, x, 23).terrain).toBe('road'); }
  for (let y = 8; y < 16; y++) expect(cellAt(a, 29, y).terrain).toBe('road');
  // 다른 seed면 지형이 다르다
  expect(bareState(5).grid.cells).not.toEqual(a.grid.cells);
});

test('소유하지 않은 필지엔 못 짓는다', () => {
  const s = bareState(1);
  expect(canPlace(s, 'tangerine_tree', 12, 3).ok).toBe(false); // 3번(곶자왈, 위)
  expect(canPlace(s, 'tangerine_tree', 12, 3).reason).toBe('아직 내 땅이 아니에요');
  expect(apply(s, { type: 'place', objectType: 'tangerine_tree', x: 12, y: 3 }).ok).toBe(false);
  own(s, 3);
  expect(canPlace(s, 'tangerine_tree', 12, 3).ok).toBe(true);
  // 경계에 걸치는 오브젝트는 두 필지 모두 소유해야 한다
  s.unlocked.objects.push('warehouse');
  const bush = objectAt(s, 17, 5); // 문 앞 칸(17,5)의 곶자왈 덤불은 치우고 본다
  if (bush) removeObject(s, bush.id);
  expect(canPlace(s, 'warehouse', 17, 3).ok).toBe(true);
  expect(canPlace(s, 'warehouse', 18, 3).ok).toBe(false); // (20,3)은 8번 필지
});

test('buyParcel: 붙어 있어야 하고, 돈이 있어야 하고, 사면 소유·차감·알림', () => {
  const s = bareState(1);
  expect(canBuyParcel(s, 'parcel2').ok).toBe(false); // 1번과 대각선 — 안 붙음
  expect(canBuyParcel(s, 'parcel2').reason).toBe('내 땅과 붙어 있어야 해요');
  expect(canBuyParcel(s, 'parcel1').reason).toBe('이미 내 땅이에요');
  expect(canBuyParcel(s, 'nope').ok).toBe(false);
  s.money = 1_000_000;
  expect(canBuyParcel(s, 'parcel3').reason).toBe('돈이 모자라요');
  s.money = 2_000_000;
  expect(apply(s, { type: 'buyParcel', id: 'parcel3' }).ok).toBe(true);
  expect(s.money).toBe(800_000);
  expect(parcelById(s, 'parcel3')!.owned).toBe(true);
  expect(s.notices.at(-1)).toContain('곶자왈');
  expect(s.actionLog.at(-1)!.action).toEqual({ type: 'buyParcel', id: 'parcel3' });
  // 이제 2번(3번과 붙음)을 살 수 있다
  s.money = 1_500_000;
  expect(apply(s, { type: 'buyParcel', id: 'parcel2' }).ok).toBe(true);
  // 마을 어귀(7번)는 처음부터, 오른쪽에 붙어 있다
  s.money = 800_000;
  expect(apply(s, { type: 'buyParcel', id: 'village_edge' }).ok).toBe(true);
});

test('buyParcel: 해금은 소유 수 — 4·5·8번은 3장, 6·9번은 5장 뒤', () => {
  expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(parcelUnlockOwnedCount)).toEqual([1, 1, 1, 3, 3, 5, 1, 3, 5]);
  const s = bareState(1);
  s.money = 1e9;
  expect(canBuyParcel(s, 'parcel4').ok).toBe(false); // 붙어 있지만 아직 1장
  expect(canBuyParcel(s, 'parcel4').reason).toContain('3개');
  own(s, 2, 3);
  expect(apply(s, { type: 'buyParcel', id: 'parcel4' }).ok).toBe(true);
  expect(canBuyParcel(s, 'parcel6').ok).toBe(false); // 4장, 그리고 1번과 붙어 있음
  own(s, 5);
  expect(apply(s, { type: 'buyParcel', id: 'parcel6' }).ok).toBe(true);
});

test('신구간(1월)엔 30% 할인', () => {
  const s = bareState(1);
  const p = parcelById(s, 'parcel3')!;
  expect(parcelPrice(s, p)).toBe(1_200_000);
  s.clock.month = 1;
  expect(parcelPrice(s, p)).toBe(840_000);
  s.money = 840_000;
  expect(apply(s, { type: 'buyParcel', id: 'parcel3' }).ok).toBe(true);
  expect(s.money).toBe(0);
});

test('구역 보너스: 해안은 관광객 가중 ×1.3, 요금 ×1.1', () => {
  const s = bareState(1);
  expect(typeWeight(s, 'student', 12, 'coast')).toBeCloseTo(typeWeight(s, 'student', 12, 'none') * COAST_SPAWN_MULT);
  expect(typeWeight(s, 'local_auntie', 12, 'coast')).toBe(typeWeight(s, 'local_auntie', 12, 'none'));
  // 마을 어귀: 삼춘(시니어)만 ×1.2
  expect(typeWeight(s, 'local_auntie', 12, 'village')).toBeCloseTo(typeWeight(s, 'local_auntie', 12, 'none') * VILLAGE_SENIOR_MULT);
  expect(typeWeight(s, 'student', 12, 'village')).toBe(typeWeight(s, 'student', 12, 'none'));
  // 해안(5번, 오른쪽 아래 (20,16)~)의 좌석: 해안 도로(y=22)에 붙은 (22,21)에 테이블
  own(s, 5);
  placeObject(s, 'table_out', 22, 21);
  // 정류장 (10,15) → 마을 길 y=15 → (22,15) → 올렛길 (22,16..20) 세로로 잇는다
  for (let y = 16; y <= 20; y++) placeObject(s, 'path', 22, y);
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  expect(spawnGuests(s, 1)).toBe(1);
  const m0 = s.money;
  updateGuests(s, 30_000);
  expect(s.guests[0]!.phase).toBe('seated');
  expect(s.money).toBe(m0 + Math.round(4000 * COAST_FEE_MULT));
});

test('구역 보너스: 오름은 경치 +2, 돌담 언덕 +1, 밭담 골짜기는 방풍, 시작 필지는 그대로', () => {
  const s = bareState(1);
  own(s, 2, 4, 8);
  expect(sceneryScore(s, 5, 5)).toBe(OREUM_SCENERY);
  expect(sceneryScore(s, X(8), Y(4))).toBe(0);
  expect(sceneryScore(s, 25, 7) - STONEHILL_SCENERY).toBeGreaterThanOrEqual(0); // 돌담 언덕(+1) + 근처 돌담 경치
  const cell = { x: 5, y: 12 };
  if (objectAt(s, cell.x, cell.y)) throw new Error('테스트 칸이 비어 있어야 해요');
  const f = placeObject(s, 'carrot_field', cell.x, cell.y);
  expect(isSheltered(s, cell.x, cell.y)).toBe(true); // 밭담 골짜기의 기본 돌담이 북서쪽을 막아 준다
  // 농원 월 수확: 놓은 달엔 0, 다음 달부터 perMonth × 밭담 ×1.2 내림 (8 → 9)
  expect(monthlyYieldOf(s, f)).toBe(0);
  f.placedMonth -= 1;
  expect(monthlyYieldOf(s, f)).toBe(Math.floor(objectDef('carrot_field').yield!.perMonth * BATDAM_HARVEST_MULT));
});

test('랜드마크는 필지당 하나, 데이터는 landmarks.json에서 온다', () => {
  const s = bareState(1);
  const d = objectDef('dolhareubang_pair');
  expect(d.kind).toBe('landmark');
  expect(d.cost).toBe(1_500_000);
  expect(canPlace(s, 'dolhareubang_pair', X(7), Y(4)).ok).toBe(true);
  placeObject(s, 'dolhareubang_pair', X(7), Y(4));
  expect(canPlace(s, 'hackberry', X(0), Y(4)).reason).toBe('이 필지엔 이미 랜드마크가 있어요');
  own(s, 3);
  expect(canPlace(s, 'hackberry', 12, 4).ok).toBe(true);
});

test('곶자왈 덤불은 5만 원에 치우고, 용천수는 못 치운다', () => {
  const s = bareState(1);
  own(s, 3, 6);
  const bush = Object.values(s.objects).find((o) => o.type === 'bush_wild')!;
  const spring = Object.values(s.objects).find((o) => o.type === 'spring')!;
  expect(apply(s, { type: 'remove', objectId: spring.id }).ok).toBe(false);
  s.money = 40_000;
  expect(apply(s, { type: 'remove', objectId: bush.id }).reason).toBe('돈이 모자라요');
  s.money = 60_000;
  expect(apply(s, { type: 'remove', objectId: bush.id }).ok).toBe(true);
  expect(s.money).toBe(10_000);
  expect(s.objects[bush.id]).toBeUndefined();
});

test('move: 돈은 그대로, 칸이 옮겨지고, 막힌 곳이면 실패', () => {
  const s = bareState(1);
  apply(s, { type: 'place', objectType: 'tangerine_tree', x: X(0), y: Y(0) });
  const f = objectAt(s, X(0), Y(0))!; // 9번 필지의 시작 감귤나무와 섞이지 않게 칸으로 찾는다
  const pm = f.placedMonth;
  const m0 = s.money;
  expect(apply(s, { type: 'move', objectId: f.id, x: X(3), y: Y(1) }).ok).toBe(false); // 창고
  expect(apply(s, { type: 'move', objectId: f.id, x: 12, y: 3 }).ok).toBe(false); // 남의 땅
  expect(apply(s, { type: 'move', objectId: f.id, x: X(0), y: Y(0) }).ok).toBe(true); // 제자리(자기 발자국은 빈 것으로)
  expect(apply(s, { type: 'move', objectId: f.id, x: X(1), y: Y(1) }).ok).toBe(true);
  expect(s.money).toBe(m0);
  expect(cellAt(s, X(0), Y(0)).objectId).toBeNull();
  expect(cellAt(s, X(1), Y(1)).objectId).toBe(f.id);
  expect(f).toMatchObject({ x: X(1), y: Y(1), placedMonth: pm }); // 옮겨도 놓은 달은 그대로
  expect(apply(s, { type: 'move', objectId: 'nope', x: X(1), y: Y(1) }).ok).toBe(false);
});

test('rotate·place rot: 정낭만 돌아가고 0..3으로 감긴다', () => {
  const s = bareState(1);
  const gate = Object.values(s.objects).find((o) => o.type === 'gate')!;
  expect(apply(s, { type: 'rotate', objectId: gate.id, rot: 5 }).ok).toBe(true);
  expect(gate.rot).toBe(1);
  apply(s, { type: 'place', objectType: 'tangerine_tree', x: X(0), y: Y(0), rot: 2 });
  const f = objectAt(s, X(0), Y(0))!; // 9번 필지의 시작 감귤나무와 섞이지 않게 칸으로 찾는다
  expect(f.rot).toBeUndefined();
  expect(apply(s, { type: 'rotate', objectId: f.id, rot: 1 }).ok).toBe(false);
});

test('삼춘 대출(옛 정착지원금): 잔고가 40만 아래면 300만, 한 달 1회·최대 3회', () => {
  const s = bareState(1);
  s.money = LOAN_THRESHOLD;
  expect(checkLoan(s)).toBe(false);
  s.money = LOAN_THRESHOLD - 1;
  expect(checkLoan(s)).toBe(true);
  expect(s.money).toBe(LOAN_THRESHOLD - 1 + LOAN_AMOUNT);
  expect(s.loan).toEqual({ count: 1, balance: LOAN_AMOUNT, lastMonthIndex: expect.any(Number) });
  expect(s.notices.at(-1)).toContain('삼춘');
  s.money = 0;
  expect(checkLoan(s)).toBe(false); // 같은 달엔 한 번만
  s.clock.month++;
  expect(checkLoan(s)).toBe(true);
  s.money = 0;
  s.clock.month++;
  expect(checkLoan(s)).toBe(true);
  expect(s.loan.count).toBe(LOAN_MAX);
  s.money = 0;
  s.clock.month++;
  expect(checkLoan(s)).toBe(false); // 최대 3회
});

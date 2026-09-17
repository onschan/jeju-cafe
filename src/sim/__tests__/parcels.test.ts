import { createInitialState, SETTLE_GRANT, SETTLE_GRANT_THRESHOLD } from '../state.ts';
import { apply } from '../actions.ts';
import { canPlace, placeObject, sceneryScore, cellAt, objectAt, isSheltered } from '../grid.ts';
import { parcelAt, parcelById, parcelPrice, canBuyParcel, parcelUnlockOwnedCount, COAST_FEE_MULT, COAST_SPAWN_MULT, OREUM_SCENERY, BATDAM_HARVEST_MULT } from '../parcels.ts';
import { typeWeight, spawnGuests, updateGuests } from '../guests.ts';
import { harvest } from '../farm.ts';
import { settleGrant } from '../tick.ts';
import { setSlot } from '../menu.ts';
import { cropDef, objectDef } from '../../data/index.ts';
import type { GameState } from '../types.ts';

function own(s: GameState, ...nos: number[]) {
  for (const p of s.parcels) if (nos.includes(p.no)) p.owned = true;
}

test('필지 6장: 3열×2행 10×8, 1번(왼쪽 위)만 소유, 가격은 ×10', () => {
  const s = createInitialState(1);
  expect(s.parcels.map((p) => [p.no, p.x, p.y, p.owned])).toEqual([
    [1, 0, 0, true], [2, 10, 0, false], [3, 20, 0, false], [4, 0, 8, false], [5, 10, 8, false], [6, 20, 8, false],
  ]);
  expect(parcelById(s, 'parcel2')!.price).toBe(1_500_000);
  expect(parcelAt(s, 9, 7)!.no).toBe(1);
  expect(parcelAt(s, 10, 7)!.no).toBe(2);
  expect(parcelAt(s, 25, 12)!.no).toBe(6);
  expect(s.parcels.map((p) => p.bonus)).toEqual(['none', 'oreum', 'gotjawal', 'batdam', 'coast', 'spring']);
});

test('필지별 지형·시작 오브젝트는 seed로 결정적이다', () => {
  const a = createInitialState(4), b = createInitialState(4);
  expect(a.grid.cells).toEqual(b.grid.cells);
  expect(a.objects).toEqual(b.objects);
  // 곶자왈(3번) 덤불, 밭담(4번) 돌담, 용천수(6번) 샘
  const inParcel = (s: GameState, no: number, type: string) => Object.values(s.objects).filter((o) => o.type === type && parcelAt(s, o.x, o.y)?.no === no).length;
  expect(inParcel(a, 3, 'bush_wild')).toBeGreaterThan(3);
  expect(inParcel(a, 4, 'stonewall')).toBe(14);
  expect(inParcel(a, 6, 'spring')).toBe(1);
  // 오름(2번)은 능선(y=2, x 12..17)이 바위
  for (let x = 12; x <= 17; x++) expect(cellAt(a, x, 2).terrain).toBe('rock');
  // 해안(5번)은 먼 변 두 줄이 도로
  for (let x = 10; x < 20; x++) { expect(cellAt(a, x, 14).terrain).toBe('road'); expect(cellAt(a, x, 15).terrain).toBe('road'); }
  // 다른 seed면 지형이 다르다
  expect(createInitialState(5).grid.cells).not.toEqual(a.grid.cells);
});

test('소유하지 않은 필지엔 못 짓는다', () => {
  const s = createInitialState(1);
  expect(canPlace(s, 'field', 12, 3).ok).toBe(false);
  expect(canPlace(s, 'field', 12, 3).reason).toBe('아직 내 땅이 아니에요');
  expect(apply(s, { type: 'place', objectType: 'field', x: 12, y: 3 }).ok).toBe(false);
  own(s, 2);
  expect(canPlace(s, 'field', 12, 3).ok).toBe(true);
  // 경계에 걸치는 오브젝트는 두 필지 모두 소유해야 한다
  s.unlocked.objects.push('warehouse');
  expect(canPlace(s, 'warehouse', 17, 3).ok).toBe(true);
  expect(canPlace(s, 'warehouse', 18, 3).ok).toBe(false); // (20,3)은 3번 필지
});

test('buyParcel: 붙어 있어야 하고, 돈이 있어야 하고, 사면 소유·차감·알림', () => {
  const s = createInitialState(1);
  expect(canBuyParcel(s, 'parcel3').ok).toBe(false); // 1번과 안 붙음
  expect(canBuyParcel(s, 'parcel1').reason).toBe('이미 내 땅이에요');
  expect(canBuyParcel(s, 'nope').ok).toBe(false);
  s.money = 1_000_000;
  expect(canBuyParcel(s, 'parcel2').reason).toBe('돈이 모자라요');
  s.money = 2_000_000;
  expect(apply(s, { type: 'buyParcel', id: 'parcel2' }).ok).toBe(true);
  expect(s.money).toBe(500_000);
  expect(parcelById(s, 'parcel2')!.owned).toBe(true);
  expect(s.notices.at(-1)).toContain('오름 자락');
  expect(s.actionLog.at(-1)!.action).toEqual({ type: 'buyParcel', id: 'parcel2' });
  // 이제 3번(2번과 붙음)을 살 수 있다
  s.money = 1_200_000;
  expect(apply(s, { type: 'buyParcel', id: 'parcel3' }).ok).toBe(true);
});

test('buyParcel: 해금은 소유 수 — 4·5번은 3장, 6번은 5장 뒤', () => {
  expect([1, 2, 3, 4, 5, 6].map(parcelUnlockOwnedCount)).toEqual([1, 1, 1, 3, 3, 5]);
  const s = createInitialState(1);
  s.money = 1e9;
  expect(canBuyParcel(s, 'parcel4').ok).toBe(false); // 붙어 있지만 아직 1장
  expect(canBuyParcel(s, 'parcel4').reason).toContain('3개');
  own(s, 2, 3);
  expect(apply(s, { type: 'buyParcel', id: 'parcel4' }).ok).toBe(true);
  expect(canBuyParcel(s, 'parcel6').ok).toBe(false); // 4장, 그리고 3번과 붙어 있음
  own(s, 5);
  expect(apply(s, { type: 'buyParcel', id: 'parcel6' }).ok).toBe(true);
});

test('신구간(1월)엔 30% 할인', () => {
  const s = createInitialState(1);
  const p = parcelById(s, 'parcel2')!;
  expect(parcelPrice(s, p)).toBe(1_500_000);
  s.clock.month = 1;
  expect(parcelPrice(s, p)).toBe(1_050_000);
  s.money = 1_050_000;
  expect(apply(s, { type: 'buyParcel', id: 'parcel2' }).ok).toBe(true);
  expect(s.money).toBe(0);
});

test('구역 보너스: 해안은 관광객 가중 ×1.3, 요금 ×1.1', () => {
  const s = createInitialState(1);
  expect(typeWeight(s, 'tourist', 12, 'coast')).toBeCloseTo(typeWeight(s, 'tourist', 12, 'none') * COAST_SPAWN_MULT);
  expect(typeWeight(s, 'local', 12, 'coast')).toBe(typeWeight(s, 'local', 12, 'none'));
  // 해안(5번, y 8..15)의 좌석: 도로(y=14)에 붙은 (12,13)에 테이블
  own(s, 5);
  placeObject(s, 'table_out', 12, 13);
  // 정류장 (0,7) → 마을 길 y=7 → … 도로가 이어지지 않으므로 올렛길로 잇는다: (12,8..12) 세로
  for (let y = 8; y <= 12; y++) placeObject(s, 'path', 12, y);
  setSlot(s, 0, 'carrot_juice');
  s.storage['carrot'] = 5;
  expect(spawnGuests(s, 1)).toBe(1);
  const m0 = s.money;
  updateGuests(s, 30_000);
  expect(s.guests[0]!.phase).toBe('seated');
  expect(s.money).toBe(m0 + Math.round(4000 * COAST_FEE_MULT));
});

test('구역 보너스: 오름은 경치 +2, 밭담은 수확 ×1.2, 시작 필지는 그대로', () => {
  const s = createInitialState(1);
  own(s, 2, 4);
  expect(sceneryScore(s, 15, 5)).toBe(OREUM_SCENERY);
  expect(sceneryScore(s, 8, 4)).toBe(0);
  const cell = { x: 5, y: 12 };
  if (objectAt(s, cell.x, cell.y)) throw new Error('테스트 칸이 비어 있어야 해요');
  const f = placeObject(s, 'field', cell.x, cell.y);
  f.crop = { cropId: 'carrot', daysGrown: 99, ready: true, harvestedYear: -1 };
  expect(isSheltered(s, cell.x, cell.y)).toBe(true); // 밭담 골짜기의 기본 돌담이 북서쪽을 막아 준다
  expect(harvest(s, f.id)).toBe(Math.floor(cropDef('carrot').yieldAmount * BATDAM_HARVEST_MULT));
});

test('랜드마크는 필지당 하나, 데이터는 landmarks.json에서 온다', () => {
  const s = createInitialState(1);
  const d = objectDef('dolhareubang_pair');
  expect(d.kind).toBe('landmark');
  expect(d.cost).toBe(1_500_000);
  expect(canPlace(s, 'dolhareubang_pair', 7, 4).ok).toBe(true);
  placeObject(s, 'dolhareubang_pair', 7, 4);
  expect(canPlace(s, 'hackberry', 0, 4).reason).toBe('이 필지엔 이미 랜드마크가 있어요');
  own(s, 2);
  expect(canPlace(s, 'hackberry', 12, 4).ok).toBe(true);
});

test('곶자왈 덤불은 5만 원에 치우고, 용천수는 못 치운다', () => {
  const s = createInitialState(1);
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
  const s = createInitialState(1);
  apply(s, { type: 'place', objectType: 'field', x: 0, y: 0 });
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  f.crop = { cropId: 'carrot', daysGrown: 3, ready: false, harvestedYear: -1 };
  const m0 = s.money;
  expect(apply(s, { type: 'move', objectId: f.id, x: 3, y: 1 }).ok).toBe(false); // 창고
  expect(apply(s, { type: 'move', objectId: f.id, x: 12, y: 3 }).ok).toBe(false); // 남의 땅
  expect(apply(s, { type: 'move', objectId: f.id, x: 0, y: 0 }).ok).toBe(true); // 제자리(자기 발자국은 빈 것으로)
  expect(apply(s, { type: 'move', objectId: f.id, x: 1, y: 1 }).ok).toBe(true);
  expect(s.money).toBe(m0);
  expect(cellAt(s, 0, 0).objectId).toBeNull();
  expect(cellAt(s, 1, 1).objectId).toBe(f.id);
  expect(f).toMatchObject({ x: 1, y: 1, crop: { cropId: 'carrot', daysGrown: 3 } });
  expect(apply(s, { type: 'move', objectId: 'nope', x: 1, y: 1 }).ok).toBe(false);
});

test('rotate·place rot: 정낭만 돌아가고 0..3으로 감긴다', () => {
  const s = createInitialState(1);
  const gate = Object.values(s.objects).find((o) => o.type === 'gate')!;
  expect(apply(s, { type: 'rotate', objectId: gate.id, rot: 5 }).ok).toBe(true);
  expect(gate.rot).toBe(1);
  apply(s, { type: 'place', objectType: 'field', x: 0, y: 0, rot: 2 });
  const f = Object.values(s.objects).find((o) => o.type === 'field')!;
  expect(f.rot).toBeUndefined();
  expect(apply(s, { type: 'rotate', objectId: f.id, rot: 1 }).ok).toBe(false);
});

test('정착지원금: 잔고가 40만 아래면 딱 한 번 300만', () => {
  const s = createInitialState(1);
  s.money = SETTLE_GRANT_THRESHOLD;
  expect(settleGrant(s)).toBe(false);
  s.money = SETTLE_GRANT_THRESHOLD - 1;
  expect(settleGrant(s)).toBe(true);
  expect(s.money).toBe(SETTLE_GRANT_THRESHOLD - 1 + SETTLE_GRANT);
  expect(s.notices.at(-1)).toContain('정착지원금');
  s.money = 0;
  expect(settleGrant(s)).toBe(false);
});

import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { apply } from '../actions.ts';
import { grantItem, itemEffect, canUseItem, useItem, ITEM_POP_CAP } from '../items.ts';
import { objectStats, BASE_POPULARITY } from '../compat.ts';
import { ITEMS, itemDef, objectDef } from '../../data/index.ts';
import type { ItemDef } from '../types.ts';

const CUSHION = ITEMS.find((i) => i.id === 'cushion') ?? ITEMS[0]!;

test('데이터: 아이템 12+ 종, 방석은 좌석에 잘 맞고 농원(당근밭)엔 못 쓴다', () => {
  expect(ITEMS.length).toBeGreaterThanOrEqual(12);
  expect(itemDef(CUSHION.id)).toBe(CUSHION);
  if (CUSHION.id === 'cushion') {
    expect(itemEffect(CUSHION, objectDef('table_out'))).toBe(CUSHION.value * 2); // seat 3 → ×2
    expect(itemEffect(CUSHION, objectDef('carrot_field'))).toBe(0);             // farm 0
  }
  // v1 분류가 없는 v2 아이템(안경)은 잘 맞는 시설(서가·갤러리)에만 ×2, 당근밭·야외 테이블엔 0 (QA 1차 P2 #24)
  const glasses = itemDef('glasses');
  expect(glasses.fitSlots).toBeUndefined();
  expect(itemEffect(glasses, objectDef('table_in'))).toBe(glasses.value * 2);
  expect(itemEffect(glasses, objectDef('carrot_field'))).toBe(0);
  expect(itemEffect(glasses, objectDef('table_out'))).toBe(0);
  // 씨앗(잘 맞는 시설 목록 없음)은 어디에나
  expect(itemEffect(itemDef('tangerine_seed'), objectDef('carrot_field'))).toBe(5);
});

test('grantItem은 인벤토리에 쌓고, useItem은 하나를 소모해 같은 종류 전체에 보너스', () => {
  const s = bareState(1);
  grantItem(s, CUSHION.id, 2);
  expect(s.inventory[CUSHION.id]).toBe(2);
  const a = placeObject(s, 'table_out', X(6), Y(4));
  const b = placeObject(s, 'table_out', X(8), Y(4));
  const eff = itemEffect(CUSHION, objectDef('table_out'));
  expect(canUseItem(s, CUSHION.id, 'table_out').ok).toBe(true);
  useItem(s, CUSHION.id, 'table_out');
  expect(s.inventory[CUSHION.id]).toBe(1);
  expect(s.itemBonus['table_out']).toEqual({ popularity: CUSHION.stat === 'popularity' ? eff : 0, feePct: CUSHION.stat === 'feePct' ? eff : 0 });
  const stat = CUSHION.stat;
  expect(objectStats(s, a.id)[stat]).toBe((stat === 'popularity' ? BASE_POPULARITY : 100) + eff);
  expect(objectStats(s, b.id)[stat]).toBe(objectStats(s, a.id)[stat]);
  // 인기 아이템이면 그 종류의 모든 오브젝트 위에 +N 팝업 연출
  if (stat === 'popularity') expect(s.fx).toEqual([{ kind: 'pop', x: a.x, y: a.y, n: eff, tick: 0 }, { kind: 'pop', x: b.x, y: b.y, n: eff, tick: 0 }]);
});

test('없는 아이템·안 맞는 시설은 거부', () => {
  const s = bareState(1);
  expect(canUseItem(s, CUSHION.id, 'table_out').ok).toBe(false); // 인벤토리 0
  grantItem(s, CUSHION.id);
  expect(canUseItem(s, CUSHION.id, 'nope').ok).toBe(false);
  if (CUSHION.id === 'cushion') expect(canUseItem(s, CUSHION.id, 'carrot_field').ok).toBe(false);
  expect(apply(s, { type: 'useItem', itemId: 'ghost_item', objectType: 'table_out' }).ok).toBe(false);
});

test('아이템 인기 보너스는 +30에서 멈춘다', () => {
  const s = bareState(1);
  const big: ItemDef = { id: 'big', name: '큰 방석', stat: 'popularity', value: 12, fitIds: ['table_out'], sourceText: '' };
  s.inventory['big'] = 5;
  for (let i = 0; i < 5; i++) useItem(s, 'big', 'table_out', [big]);
  expect(s.itemBonus['table_out']!.popularity).toBe(ITEM_POP_CAP); // 24 → 30 (48이 아니라)
  expect(s.inventory['big']).toBe(0);
});

test('useItem 액션은 로그에 남고 인벤토리를 줄인다', () => {
  const s = bareState(1);
  grantItem(s, CUSHION.id);
  placeObject(s, 'table_out', X(6), Y(4));
  expect(apply(s, { type: 'useItem', itemId: CUSHION.id, objectType: 'table_out' }).ok).toBe(true);
  expect(s.inventory[CUSHION.id]).toBe(0);
  expect(s.actionLog.at(-1)?.action.type).toBe('useItem');
});

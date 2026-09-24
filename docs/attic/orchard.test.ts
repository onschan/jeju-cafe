import { describe, it, expect } from 'vitest';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, monthIndex } from '../clock.ts';
import { objectDef, FARM_YIELDS, ingredientDef } from '../../data/index.ts';
import { isFarmObject, monthlyYieldOf, expectedHarvest, monthlyHarvest } from '../orchard.ts';
import { consumeIngredients, purchaseCost, ingredientCost } from '../menu.ts';
import { addEffect } from '../effects.ts';
import { bareState, at } from './helpers.ts';

/** 남은 날을 넘겨 다음 달 1일로 */
function toNextMonth(s: ReturnType<typeof bareState>): void {
  const m = s.clock.month;
  while (s.clock.month === m) tick(s, DAY_MS);
}

describe('농원 (밭 없음)', () => {
  it('데이터: 감귤나무 감귤 6/월·경관 +2, 당근밭 당근 8/월, 녹차밭 녹찻잎 4/월. field 오브젝트·field 직종은 없다', () => {
    expect(objectDef('tangerine_tree').yield).toEqual({ ingredientId: 'tangerine', perMonth: 6 });
    expect(objectDef('tangerine_tree').scenery).toBe(2);
    expect(objectDef('tangerine_tree').category).toBe('farm');
    expect(objectDef('carrot_field').yield).toEqual({ ingredientId: 'carrot', perMonth: 8 });
    expect(objectDef('tea_field').yield).toEqual(FARM_YIELDS['tea_field']);
    expect(objectDef('tea_field').yield?.ingredientId).toBe('tea');
    expect(() => objectDef('field')).toThrow();
    for (const id of Object.keys(FARM_YIELDS)) { expect(isFarmObject(id)).toBe(true); ingredientDef(objectDef(id).yield!.ingredientId); }
    expect(isFarmObject('table_out')).toBe(false);
  });

  it('놓은 달에는 수확이 없고, 다음 달 1일에 창고에 들어온다. 이후 매달. 월말 카드에 harvested가 남는다', () => {
    const s = bareState(1);
    s.goals.index = 999;
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', ...at(6, 6) }).ok).toBe(true);
    const tree = Object.values(s.objects).find((o) => o.type === 'tangerine_tree' && o.x === at(6, 6).x && o.y === at(6, 6).y)!;
    expect(tree.placedMonth).toBe(monthIndex(s.clock));
    expect(monthlyYieldOf(s, tree)).toBe(0);
    expect(expectedHarvest(s)).toEqual({ tangerine: 6 });
    toNextMonth(s); // 4월 1일
    expect(s.storage['tangerine']).toBe(6);
    expect(s.monthHarvest.harvested).toEqual({ tangerine: 6 });
    expect(s.lastMonthCard?.harvested).toEqual({}); // 3월엔 안 들어왔다
    toNextMonth(s); // 5월 1일
    expect(s.storage['tangerine']).toBe(12);
    expect(s.lastMonthCard?.harvested).toEqual({ tangerine: 6 }); // 4월 카드
    expect(s.fx.some((f) => f.kind === 'harvest')).toBe(true);
  });

  it('건설 중·안 산 필지의 농원은 수확하지 않고, 이벤트 수확 배수(흉년)는 곱해진다', () => {
    const s = bareState(1);
    s.goals.index = 999;
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', ...at(6, 6) }).ok).toBe(true);
    const tree = Object.values(s.objects).find((o) => o.type === 'tangerine_tree' && o.x === at(6, 6).x && o.y === at(6, 6).y)!;
    tree.placedMonth -= 1;
    expect(monthlyYieldOf(s, tree)).toBe(6);
    tree.build = { doneDay: 999, days: 3 };
    expect(monthlyYieldOf(s, tree)).toBe(0);
    delete tree.build;
    addEffect(s, { kind: 'harvestMult', mult: 0.5, days: 30, source: 't' });
    expect(monthlyYieldOf(s, tree)).toBe(3);
    // 옛 감귤밭(안 산 필지)의 나무는 내 것이 아니다
    const orchardTree = Object.values(s.objects).find((o) => o.type === 'tangerine_tree' && o.id !== tree.id);
    if (orchardTree) expect(monthlyYieldOf(s, orchardTree)).toBe(0);
    expect(monthlyHarvest(s)).toBe(3);
    expect(s.storage['tangerine']).toBe(3);
  });

  it('재료 구매: 창고에 있으면 창고에서 쓰고 절감액이 쌓이며, 없으면 원가로 자동 구매한다', () => {
    const s = bareState(1);
    s.goals.index = 999;
    const cost = ingredientDef('tangerine').cost;
    expect(cost).toBeGreaterThan(0);
    expect(ingredientCost(s, 'tangerine_juice')).toBe(cost);
    expect(purchaseCost(s, 'tangerine_juice')).toBe(cost);
    const money = s.money;
    expect(consumeIngredients(s, 'tangerine_juice')).toBe(cost);
    expect(s.money).toBe(money - cost);
    expect(s.monthCosts.ingredients).toBe(cost);
    s.storage['tangerine'] = 1;
    expect(purchaseCost(s, 'tangerine_juice')).toBe(0);
    expect(consumeIngredients(s, 'tangerine_juice')).toBe(0);
    expect(s.storage['tangerine']).toBeUndefined();
    expect(s.monthHarvest.ingredientSaved).toBe(cost);
    expect(s.money).toBe(money - cost);
    toNextMonth(s);
    expect(s.lastMonthCard?.ingredientSaved).toBe(cost);
    expect(s.monthHarvest.ingredientSaved).toBe(0);
  });
});

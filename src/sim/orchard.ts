/**
 * 농원 (v3 §3): 밭·심기·계절은 없다. 감귤나무·당근밭·녹차밭 같은 농원 시설(ObjectDef.yield)은
 * 매월 1일 창고(state.storage)에 재료를 넣는다. 놓은 달은 제외(다음 달 1일부터), 건설 중·안 산 필지는 제외.
 * 필지 보너스(밭담 ×1.2·용천수 ×1.1·곶자왈 차 ×1.1)와 이벤트 수확 배수(풍년·흉년 harvestMult)를 곱해 내림.
 */
import type { GameState, PlacedObject, MonthHarvest } from './types.ts';
import { objectDef, ingredientDef } from '../data/index.ts';
import { parcelAt, parcelBonusAt, parcelHarvestMult } from './parcels.ts';
import { effectMult } from './effects.ts';
import { monthIndex } from './clock.ts';
import { pushFx } from './fx.ts';
import { pushNotice, gardenBonusOf } from './staff.ts';

export function emptyMonthHarvest(): MonthHarvest {
  return { harvested: {}, ingredientSaved: 0 };
}

/** 농원 시설인가 (월 수확이 있는 오브젝트 정의) */
export function isFarmObject(type: string): boolean {
  return objectDef(type).yield !== undefined;
}

/** 이 오브젝트가 다음 1일에 수확할 양 (0이면 이번엔 안 나온다: 이번 달에 놓았거나 건설 중이거나 내 필지가 아님) */
export function monthlyYieldOf(state: GameState, obj: PlacedObject): number {
  const y = objectDef(obj.type).yield;
  if (!y || obj.build) return 0;
  if (!parcelAt(state, obj.x, obj.y)?.owned) return 0;
  if (obj.placedMonth >= monthIndex(state.clock)) return 0;
  return yieldAmount(state, obj, y.ingredientId, y.perMonth);
}

function yieldAmount(state: GameState, obj: PlacedObject, ingredientId: string, perMonth: number): number {
  return Math.floor(perMonth * parcelHarvestMult(parcelBonusAt(state, obj.x, obj.y), ingredientId) * effectMult(state, 'harvestMult') * gardenBonusOf(state)); // 농원지기(x-staff)
}

/** 다음 달 1일 수확 예정 (UI "이달 수확 예정: 감귤 6"): ingredientId → 개수 */
export function expectedHarvest(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of Object.values(state.objects)) {
    const y = objectDef(o.type).yield;
    if (!y || o.build || !parcelAt(state, o.x, o.y)?.owned) continue;
    out[y.ingredientId] = (out[y.ingredientId] ?? 0) + yieldAmount(state, o, y.ingredientId, y.perMonth);
  }
  return out;
}

/** 매월 1일 (closeMonth 뒤): 농원 시설마다 창고에 재료를 넣고 이달 monthHarvest.harvested에 기록한다 (월말에 카드로 옮겨진다). 들어온 총 개수. */
export function monthlyHarvest(state: GameState): number {
  const got: Record<string, number> = {};
  let total = 0;
  for (const o of Object.values(state.objects)) {
    const n = monthlyYieldOf(state, o);
    if (n <= 0) continue;
    const id = objectDef(o.type).yield!.ingredientId;
    state.storage[id] = (state.storage[id] ?? 0) + n;
    got[id] = (got[id] ?? 0) + n;
    total += n;
    pushFx(state, { kind: 'harvest', x: o.x, y: o.y, tick: state.tick });
  }
  state.monthHarvest.harvested = got;
  if (total > 0) pushNotice(state, `농원 수확: ${Object.entries(got).map(([id, n]) => `${ingredientDef(id).name} ${n}`).join(' · ')}`);
  return total;
}

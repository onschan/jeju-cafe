import type { GameState, ApplyResult, CropDef } from './types.ts';
import { objectDef, cropDef } from '../data/index.ts';
import { isSheltered } from './grid.ts';

/** 수확 창이 해를 넘기면(11,12,1) 1월은 전년도 창에 속한다. */
export function harvestSeasonYear(crop: CropDef, month: number, year: number): number {
  const first = crop.harvestMonths?.[0];
  if (first === undefined) return year;
  return month < first ? year - 1 : year;
}

export function canPlant(state: GameState, objectId: string, cropId: string): ApplyResult {
  const obj = state.objects[objectId];
  if (!obj) return { ok: false, reason: '없는 오브젝트' };
  if (objectDef(obj.type).kind !== 'field') return { ok: false, reason: '밭이 아니에요' };
  if (obj.crop) return { ok: false, reason: '이미 심었어요' };
  if (!state.unlocked.crops.includes(cropId)) return { ok: false, reason: '아직 모르는 작물' };
  const crop = cropDef(cropId);
  if (!crop.plantMonths.includes(state.clock.month)) return { ok: false, reason: '지금은 심는 철이 아니에요' };
  return { ok: true };
}

export function plant(state: GameState, objectId: string, cropId: string): void {
  const obj = state.objects[objectId]!;
  obj.crop = { cropId, daysGrown: 0, ready: false, harvestedYear: 0 };
}

/** 하루치 생육. 매일 한 번 호출. */
export function growOneDay(state: GameState): void {
  const { month, year } = state.clock;
  for (const obj of Object.values(state.objects)) {
    if (!obj.crop) continue;
    const crop = cropDef(obj.crop.cropId);
    obj.crop.daysGrown++;
    const kind = objectDef(obj.type).kind;
    if (kind === 'tree') {
      const mature = obj.crop.daysGrown >= crop.growDays;
      const inSeason = crop.harvestMonths?.includes(month) ?? false;
      obj.crop.ready = mature && inSeason && obj.crop.harvestedYear !== harvestSeasonYear(crop, month, year);
    } else {
      obj.crop.ready = obj.crop.daysGrown >= crop.growDays;
    }
  }
}

export function canHarvest(state: GameState, objectId: string): ApplyResult {
  const obj = state.objects[objectId];
  if (!obj?.crop) return { ok: false, reason: '수확할 게 없어요' };
  if (!obj.crop.ready) return { ok: false, reason: '아직 덜 자랐어요' };
  return { ok: true };
}

/** 수확량을 창고에 넣는다. 방풍 안 되면 절반. 나무는 남고 밭은 빈다. */
export function harvest(state: GameState, objectId: string): number {
  const obj = state.objects[objectId]!;
  const crop = cropDef(obj.crop!.cropId);
  const amount = isSheltered(state, obj.x, obj.y) ? crop.yieldAmount : Math.floor(crop.yieldAmount / 2);
  state.storage[crop.id] = (state.storage[crop.id] ?? 0) + amount;
  if (objectDef(obj.type).kind === 'tree') {
    obj.crop!.ready = false;
    obj.crop!.harvestedYear = harvestSeasonYear(crop, state.clock.month, state.clock.year);
  } else {
    obj.crop = null;
  }
  return amount;
}

/** 수확 가능한 오브젝트 id 목록 (UI 반짝임·봇용) */
export function readyToHarvest(state: GameState): string[] {
  return Object.values(state.objects).filter((o) => o.crop?.ready).map((o) => o.id);
}

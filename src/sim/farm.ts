import type { GameState, ApplyResult, CropDef, FxEvent } from './types.ts';
import { objectDef, cropDef } from '../data/index.ts';
import { isSheltered } from './grid.ts';
import { staffInRole, energyFactor } from './staff.ts';
import { parcelAt, parcelBonusAt, parcelHarvestMult } from './parcels.ts';
import { effectMult } from './effects.ts';

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
  if (crop.plantMonths.length === 0) return { ok: false, reason: '밭에 심는 작물이 아니에요' };
  if (!crop.plantMonths.includes(state.clock.month)) return { ok: false, reason: '지금은 심는 철이 아니에요' };
  return { ok: true };
}

export function plant(state: GameState, objectId: string, cropId: string): void {
  const obj = state.objects[objectId]!;
  obj.crop = { cropId, daysGrown: 0, ready: false, harvestedYear: -1 };
}

/** 연출 큐 상한 */
export const FX_CAP = 50;

export function pushFx(state: GameState, e: FxEvent): void {
  state.fx.push(e);
  if (state.fx.length > FX_CAP) state.fx.splice(0, state.fx.length - FX_CAP);
}

/** 하루치 생육(소유 필지만). 매일 한 번 호출. 익으면 그날 바로 창고로 들어간다(자동 수확, 피드백 2차) — 렌더용 반짝임을 fx에 남긴다. */
export function growOneDay(state: GameState): string[] {
  const { month, year } = state.clock;
  const harvested: string[] = [];
  for (const obj of Object.values(state.objects)) {
    if (!obj.crop) continue;
    if (!parcelAt(state, obj.x, obj.y)?.owned) continue; // 아직 안 산 필지의 나무(옛 감귤밭)는 내 것이 아니다
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
    if (obj.crop.ready) {
      harvest(state, obj.id);
      pushFx(state, { kind: 'harvest', x: obj.x, y: obj.y, tick: state.tick });
      harvested.push(obj.id);
    }
  }
  return harvested;
}

export function canHarvest(state: GameState, objectId: string): ApplyResult {
  const obj = state.objects[objectId];
  if (!obj?.crop) return { ok: false, reason: '수확할 게 없어요' };
  if (!obj.crop.ready) return { ok: false, reason: '아직 덜 자랐어요' };
  return { ok: true };
}

/** 수확량을 창고에 넣는다. 방풍 안 되면 절반, 필지 보너스(밭담 ×1.2 등)·이벤트 수확 배수(풍년·흉년)는 그 뒤에 곱해 내림. 나무는 남고 밭은 빈다. */
export function harvest(state: GameState, objectId: string): number {
  const obj = state.objects[objectId]!;
  const crop = cropDef(obj.crop!.cropId);
  const base = isSheltered(state, obj.x, obj.y) ? crop.yieldAmount : Math.floor(crop.yieldAmount / 2);
  const amount = Math.floor(base * parcelHarvestMult(parcelBonusAt(state, obj.x, obj.y), crop.id) * effectMult(state, 'harvestMult'));
  state.storage[crop.id] = (state.storage[crop.id] ?? 0) + amount;
  if (objectDef(obj.type).kind === 'tree') {
    obj.crop!.ready = false;
    obj.crop!.harvestedYear = harvestSeasonYear(crop, state.clock.month, state.clock.year);
  } else {
    obj.crop = null;
  }
  return amount;
}

/** 수확 가능한 오브젝트 id 목록. 자동 수확 뒤엔 보통 비어 있다 (호환용). */
export function readyToHarvest(state: GameState): string[] {
  return Object.values(state.objects).filter((o) => o.crop?.ready).map((o) => o.id);
}

/** 밭 일꾼 하루 작업량 = 1 + floor(힘/20) 칸 (기력 30 미만이면 절반, 최소 1) */
export function fieldCapacity(state: GameState): number {
  return staffInRole(state, 'field').reduce((n, st) => n + Math.max(1, Math.floor((1 + Math.floor(st.stats.strength / 20)) * energyFactor(st))), 0);
}

/** 매일: 밭 일꾼이 빈 밭에 제철(해금된 첫 번째) 작물을 심는다. (수확은 자동) */
export function staffFarmWork(state: GameState): void {
  let capacity = fieldCapacity(state);
  if (capacity <= 0) return;
  const cropId = state.unlocked.crops.find((c) => cropDef(c).plantMonths.includes(state.clock.month));
  if (!cropId) return;
  for (const obj of Object.values(state.objects)) {
    if (capacity <= 0) return;
    if (objectDef(obj.type).kind !== 'field' || obj.crop) continue;
    plant(state, obj.id, cropId);
    capacity--;
  }
}


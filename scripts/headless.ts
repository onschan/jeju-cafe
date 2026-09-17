/**
 * 단순 봇이 N년을 자동 플레이하고 월별 CSV를 stdout에 찍는다.
 * 사용: pnpm headless [years=3] [seed=1] > out.csv
 */
import { createInitialState, tick, apply, DAY_MS, GRID_W, GRID_H, canPlace, objectAt, readyToHarvest, nextUnlock, canUnlock } from '../src/sim/index.ts';
import { objectDef } from '../src/data/index.ts';

const years = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1);
const s = createInitialState(seed);

function tryPlaceAnywhere(type: string): boolean {
  for (let y = 0; y < GRID_H - 1; y++)
    for (let x = 0; x < GRID_W; x++)
      if (canPlace(s, type, x, y).ok && apply(s, { type: 'place', objectType: type, x, y }).ok) return true;
  return false;
}

/** 정낭(4,6)에서 위로 올렛길을 깔아 좌석까지 연결 */
function ensurePath() {
  for (let y = 5; y >= 3; y--) if (!objectAt(s, 4, y)) apply(s, { type: 'place', objectType: 'path', x: 4, y });
}

function monthlyPlan() {
  ensurePath();
  const seats = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat').length;
  const fields = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'field').length;
  if (seats < 2) { apply(s, { type: 'place', objectType: 'table_out', x: 3, y: 5 }); apply(s, { type: 'place', objectType: 'table_out', x: 5, y: 5 }); }
  if (fields < 6 && s.money >= 300) tryPlaceAnywhere('field');
  if (s.menuSlots[0] === null) apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' });
  if (s.menuSlots[2] === null && s.unlocked.menus.includes('carrot_juice')) apply(s, { type: 'setSlot', slot: 2, menuId: 'carrot_juice' });
  if (s.unlocked.menus.includes('carrot_cake') && s.menuSlots[1] === null) apply(s, { type: 'setSlot', slot: 1, menuId: 'carrot_cake' });
  for (const o of Object.values(s.objects))
    if (objectDef(o.type).kind === 'field' && !o.crop) apply(s, { type: 'plant', objectId: o.id, cropId: 'carrot' });
  while (canUnlock(s).ok) apply(s, { type: 'unlock' });
  if (s.unlocked.objects.includes('stonewall') && s.money >= 1000) tryPlaceAnywhere('stonewall');
}

console.log('year,month,money,research,popularity,carrot,nextUnlock');
let lastMonth = 0;
const totalDays = years * 12 * 30;
for (let d = 0; d < totalDays; d++) {
  if (s.clock.month !== lastMonth) {
    lastMonth = s.clock.month;
    monthlyPlan();
    console.log([s.clock.year, s.clock.month, s.money, s.research, s.popularity, s.storage['carrot'] ?? 0, nextUnlock(s)?.ref ?? '-'].join(','));
  }
  for (const id of readyToHarvest(s)) apply(s, { type: 'harvest', objectId: id });
  tick(s, DAY_MS);
  apply(s, { type: 'dismissMonthCard' });
}

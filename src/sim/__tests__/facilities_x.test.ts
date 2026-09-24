/** 트랙 A(trim): 시설 표·증축 Lv·노후·청결 (스펙 §3.1·§3.2 — 덜어내기 뒤 시설 59종) */
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { monthIndex } from '../clock.ts';
import { objectStats, popularityFor, POPULARITY_CAP } from '../compat.ts';
import { canUpgrade, upgradeCost, levelOf, tierOf, isUpgradable, facilityFee, LEVEL_POPULARITY, LEVEL_SCENERY, LEVEL_SEATS, UPGRADE_USES, STAR_BY_TIER } from '../upgrade.ts';
import { dailyCleanliness, cleanGuestMult, cleanSatisfaction, wearOf, repairCost, canRepair, upkeepMultOf, cleanReduceMult, WEAR_MAX, CLEAN_MAX } from '../cleanliness.ts';
import { seatsOf } from '../cafe.ts';
import { monthlyYieldOf } from '../orchard.ts';
import { effectMult } from '../effects.ts';
import { OBJECTS, MENUS, FACILITIES, FACILITY_X_IDS, FACILITY_X_GOAL_REFS, ITEMS, ITEM_FIT_EXTRA, REMOVED_FACILITY_IDS, objectDef, buildGroupOf } from '../../data/index.ts';
import type { GameState } from '../types.ts';
import facilitiesJson from '../../data/generated/v2/facilities.json' with { type: 'json' };
import facilitiesXJson from '../../data/facilities_x.json' with { type: 'json' };
import extraMenusJson from '../../data/generated/v2/extra_menus.json' with { type: 'json' };


function unlockAll(s: GameState, ...ids: string[]) { for (const id of ids) if (!s.unlocked.objects.includes(id)) s.unlocked.objects.push(id); }
/** 완공까지 날을 넘긴다 */
function finish(s: GameState, days: number) { for (let i = 0; i < days; i++) tick(s, DAY_MS); }

describe('데이터', () => {
  it('trim: 시설 표가 전부 OBJECTS에 있고 id가 유일하며, 종류는 60 이하다', () => {
    expect(FACILITY_X_IDS.size).toBe(5);
    const rowIds = new Set([...facilitiesJson, ...facilitiesXJson].map((f) => f.id));
    expect(rowIds.size).toBe(facilitiesJson.length + facilitiesXJson.length);
    for (const id of rowIds) { if (REMOVED_FACILITY_IDS.has(id)) continue; expect(objectDef(id).id).toBe(id); }
    expect(FACILITIES.filter((f) => FACILITY_X_IDS.has(f.id)).length).toBe(5);
    expect(new Set(OBJECTS.map((o) => o.id)).size).toBe(OBJECTS.length);
    // 밀도 가드: 「짓기 창에서 돈 주고 고르는 종류」가 60을 넘지 않는다 (big 통합).
    // 맵에 처음부터 있는 것(정류장·본관·용천수)과 보상으로만 받는 트로피는 사는 카드가 아니라 빼고 센다.
    const MAP_FIXED = new Set(['busstop', 'warehouse', 'spring']); // BuildWindow HIDDEN_IDS
    const REWARD_ONLY = new Set(['trophy']);                       // 대회 우승으로만 얻는다 (cost 0)
    const buyable = OBJECTS.filter((o) => o.kind !== 'landmark' && !MAP_FIXED.has(o.id) && !REWARD_ONLY.has(o.id));
    expect(buyable.length).toBeLessThanOrEqual(60);
    // 총량도 묶어 둔다 — 보상·고정물이라도 무한정 늘지 않게
    expect(OBJECTS.filter((o) => o.kind !== 'landmark').length).toBeLessThanOrEqual(62);
  });
  it('확장 시설(trim 5종): 요금 있는 쉼 시설은 순회 시설(facility), 카테고리·건설일이 짓기 탭에 맞는다', () => {
    expect(objectDef('cauldron_footbath').kind).toBe('facility');
    expect(objectDef('cauldron_footbath').fee).toBe(5000);
    expect(objectDef('open_air_footbath')).toMatchObject({ popularity: 30, scenery: 20, buildDays: 7 });
    expect(buildGroupOf('brunch_house')).toBe('food');
    expect(buildGroupOf('cleaning_room')).toBe('convenience');
    expect(Object.keys(FACILITY_X_GOAL_REFS).length).toBe(5);
    expect(FACILITY_X_GOAL_REFS.cauldron_footbath).toBe('g41');
    expect(objectDef('fine_dining').unlock).toEqual({ type: 'goal' });
    for (const id of FACILITY_X_IDS) expect(objectDef(id).unlock?.type).not.toBe('start');
  });
  it('강화 아이템 잘 맞는 시설: trim 뒤에도 남은 시설만 가리킨다', () => {
    const salt = ITEMS.find((i) => i.id === 'jeju_salt')!;
    expect(salt.fitIds).toContain('cauldron_footbath');
    const known = new Set([...OBJECTS.map((o) => o.id), ...MENUS.map((m) => m.id), ...extraMenusJson.map((m) => m.id)]);
    for (const item of ITEMS) for (const f of item.fitIds) expect(known.has(f), f).toBe(true);
    for (const [id, fits] of Object.entries(ITEM_FIT_EXTRA)) {
      const item = ITEMS.find((i) => i.id === id)!;
      for (const f of fits) { expect(objectDef(f)).toBeDefined(); expect(item.fitIds).toContain(f); }
    }
  });
});

describe('증축 Lv1~3 (§3.2.2)', () => {
  it('데이터: 티어·증축 가능 종류', () => {
    expect(tierOf(objectDef('table_out'))).toBe('small');
    expect(tierOf(objectDef('tart_bakery'))).toBe('medium');
    expect(tierOf(objectDef('open_air_footbath'))).toBe('large');
    expect(tierOf(objectDef('observatory'))).toBe('large');
    expect(isUpgradable(objectDef('table_out'))).toBe(true);
    expect(isUpgradable(objectDef('tangerine_tree'))).toBe(true);
    expect(isUpgradable(objectDef('observatory'))).toBe(true);
    expect(isUpgradable(objectDef('camellia'))).toBe(false);
    expect(isUpgradable(objectDef('path'))).toBe(false);
    expect(isUpgradable(objectDef('warehouse'))).toBe(false);
  });
  it('비용 Lv2 0.8배·Lv3 1.5배, 조건(이용 100 또는 인기 30 / 이용 500 그리고 ★), 효과(인기 +4/+8·경관 +2/+4·메뉴 +5%/+10%·정원 +1/+2)', () => {
    const s = bareState(1);
    s.money = 100_000_000;
    const t = placeObject(s, 'table_out', X(6), Y(4));
    const def = objectDef('table_out'); // objects.json 기본값(v1 스케일 5만·유지비 750)
    expect(levelOf(t)).toBe(1);
    expect(upgradeCost(s, t)).toBe(Math.round(def.cost * 0.8));
    expect(canUpgrade(s, t.id, 10).ok).toBe(false);
    expect(canUpgrade(s, t.id, 30).ok).toBe(true);
    t.uses = UPGRADE_USES[2];
    expect(apply(s, { type: 'upgradeObject', objectId: t.id }).ok).toBe(true);
    expect(s.money).toBe(100_000_000 - Math.round(def.cost * 0.8));
    expect(levelOf(t)).toBe(2);
    expect(t.build).toBeUndefined(); // 야외 테이블은 즉시 완공
    const st2 = objectStats(s, t.id);
    expect(st2.level).toBe(2);
    expect(st2.popularity).toBe(10 + LEVEL_POPULARITY[2]!);
    expect(st2.scenery).toBe(0 + LEVEL_SCENERY[2]!);
    expect(st2.feePct).toBe(105);
    expect(st2.upkeep).toBe(Math.round(def.upkeep * 1.25));
    expect(seatsOf(s, t)).toBe(2 + LEVEL_SEATS[2]!);
    // Lv3: 이용 500 그리고 ★2(소)
    expect(upgradeCost(s, t)).toBe(Math.round(def.cost * 1.5));
    t.uses = UPGRADE_USES[3];
    s.star = 1;
    expect(apply(s, { type: 'upgradeObject', objectId: t.id }).reason).toContain('★2');
    s.star = STAR_BY_TIER.small;
    expect(apply(s, { type: 'upgradeObject', objectId: t.id }).ok).toBe(true);
    const st3 = objectStats(s, t.id);
    expect(st3.popularity).toBe(18);
    expect(st3.scenery).toBe(4);
    expect(st3.feePct).toBe(110);
    expect(st3.upkeep).toBe(Math.round(def.upkeep * 1.5));
    expect(seatsOf(s, t)).toBe(4);
    expect(apply(s, { type: 'upgradeObject', objectId: t.id }).reason).toContain('최고');
  });
  it('요금형 시설(가마솥 족욕): Lv2 요금 +10%, Lv3 +20% (5,000 → 5,500 → 6,000). Lv 인기는 상한 40과 별도로 최대 48', () => {
    const s = bareState(1);
    s.money = 100_000_000;
    const p = placeObject(s, 'cauldron_footbath', X(6), Y(4));
    expect(facilityFee(s, p)).toBe(5000);
    p.level = 2;
    expect(facilityFee(s, p)).toBe(5500);
    expect(objectStats(s, p.id).feePct).toBe(110);
    p.level = 3;
    expect(facilityFee(s, p)).toBe(6000);
    s.itemBonus[p.type] = { popularity: 100, feePct: 0 };
    expect(objectStats(s, p.id).popularity).toBe(POPULARITY_CAP + 8);
  });
  it('공사 기간이 있는 시설은 증축 중 이용 불가(build), 건축가를 쓰고, 완공되면 Lv가 살아 있다. 농원은 수확 ×1.5/×2', () => {
    const s = bareState(1);
    s.money = 100_000_000;
    s.unlocked.objects.push('tart_bakery');
    expect(apply(s, { type: 'place', objectType: 'tart_bakery', x: X(6), y: Y(4) }).ok).toBe(true);
    const b = Object.values(s.objects).find((o) => o.type === 'tart_bakery')!;
    finish(s, 3);
    expect(b.build).toBeUndefined();
    b.uses = 100;
    expect(upgradeCost(s, b)).toBe(3_600_000);
    expect(apply(s, { type: 'upgradeObject', objectId: b.id }).ok).toBe(true);
    expect(b.build).toEqual({ doneDay: expect.any(Number), days: 3 });
    expect(seatsOf(s, b)).toBe(0);
    expect(apply(s, { type: 'upgradeObject', objectId: b.id }).reason).toContain('공사 중');
    finish(s, 3);
    expect(b.build).toBeUndefined();
    expect(levelOf(b)).toBe(2);
    expect(objectStats(s, b.id).popularity).toBe(20 + 4);
    // 농원
    const tree = placeObject(s, 'tangerine_tree', X(3), Y(6));
    tree.placedMonth = monthIndex(s.clock) - 1;
    expect(monthlyYieldOf(s, tree)).toBe(6);
    tree.level = 2;
    expect(monthlyYieldOf(s, tree)).toBe(9);
    tree.level = 3;
    expect(monthlyYieldOf(s, tree)).toBe(12);
  });
});

describe('노후 (§3.2.3)', () => {
  it('완공 24개월 뒤 인기 −1, 6개월마다 −1, 최대 −6. 수리 = 건설비 10%, 노후 0. 노후·Lv 유지비 배수', () => {
    const s = bareState(1);
    s.money = 100_000_000;
    const t = placeObject(s, 'table_out', X(6), Y(4));
    const def = objectDef('table_out');
    expect(wearOf(s, t)).toBe(0);
    s.clock.year += 2; // +24개월
    expect(wearOf(s, t)).toBe(1);
    expect(objectStats(s, t.id).popularity).toBe(9);
    expect(objectStats(s, t.id).wear).toBe(1);
    expect(upkeepMultOf(s, t)).toBe(1.5);
    expect(objectStats(s, t.id).upkeep).toBe(Math.round(def.upkeep * 1.5));
    s.clock.year += 1; // +36개월 → (36−24)/6+1 = 3
    expect(wearOf(s, t)).toBe(3);
    s.clock.year += 10;
    expect(wearOf(s, t)).toBe(WEAR_MAX);
    expect(objectStats(s, t.id).popularity).toBe(10 - WEAR_MAX);
    expect(repairCost(s, t)).toBe(Math.round(def.cost * 0.1));
    expect(canRepair(s, t.id).ok).toBe(true);
    expect(apply(s, { type: 'repairObject', objectId: t.id }).ok).toBe(true);
    expect(s.money).toBe(100_000_000 - Math.round(def.cost * 0.1));
    expect(t.wearMonth).toBe(monthIndex(s.clock));
    expect(wearOf(s, t)).toBe(0);
    expect(apply(s, { type: 'repairObject', objectId: t.id }).ok).toBe(false);
    // 증축하면 노후 리셋
    const s2 = bareState(1);
    s2.money = 100_000_000;
    const t2 = placeObject(s2, 'table_out', X(6), Y(4));
    s2.clock.year += 3;
    expect(wearOf(s2, t2)).toBe(3);
    t2.uses = 100;
    expect(apply(s2, { type: 'upgradeObject', objectId: t2.id }).ok).toBe(true);
    expect(wearOf(s2, t2)).toBe(0);
    expect(upkeepMultOf(s2, t2)).toBe(1.25);
  });
});

describe('청결 (§3.2.3)', () => {
  it('시작 100. 매일 −(어제 손님 ÷ 20), 청소 직원 +(기술 ÷ 5 + 힘 ÷ 10) (청소 직원이 없으면 일하는 직원 전원의 ¼), 청결 시설은 감소 −20%씩', () => {
    const s = bareState(1);
    expect(s.clean).toEqual({ value: CLEAN_MAX, lastGuests: 0, history: [] });
    s.totalGuests = 100;
    dailyCleanliness(s);
    expect(s.clean.value).toBe(95);
    expect(s.clean.lastGuests).toBe(100);
    s.totalGuests = 300;
    dailyCleanliness(s);
    expect(s.clean.value).toBe(85);
    // 홀 직원(기술 40·힘 50) → 청소 직원이 없으면 (40/5 + 50/10) × 0.25 = 3.25
    s.staff.push({ id: 'st1', name: '청소', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 50, strength: 50, skill: 40, smile: 50 }, skill: 'none', level: 1, salary: 0, poolId: '', statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, extraSkills: [], maxLevel: 10, baseSalary: 0, exp: 0, trainingCount: 0, training: null, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
    dailyCleanliness(s);
    expect(s.clean.value).toBeCloseTo(88.25);
    // 화장실이 있으면 감소 ×0.8
    expect(cleanReduceMult(s)).toBe(1);
    placeObject(s, 'restroom', X(6), Y(4));
    expect(cleanReduceMult(s)).toBeCloseTo(0.8);
    s.totalGuests = 500;
    dailyCleanliness(s);
    expect(s.clean.value).toBeCloseTo(88.25 - 8 + 3.25);
    // 상한 100
    s.staff[0]!.stats.skill = 100;
    for (let i = 0; i < 5; i++) dailyCleanliness(s);
    expect(s.clean.value).toBe(CLEAN_MAX);
  });
  it('효과: 80 이상 만족 +3, 50 미만 손님 ×0.8·만족 −5, 30 미만 ×0.6 — 하루짜리 spawnMult 효과로 걸린다', () => {
    const s = bareState(1);
    expect(cleanSatisfaction(s)).toBe(3);
    expect(cleanGuestMult(s)).toBe(1);
    s.clean.value = 45;
    dailyCleanliness(s);
    expect(cleanGuestMult(s)).toBe(0.8);
    expect(cleanSatisfaction(s)).toBe(-5);
    expect(effectMult(s, 'spawnMult')).toBeCloseTo(0.8);
    expect(s.effects.filter((e) => e.source === 'clean')).toHaveLength(1);
    s.clean.value = 20;
    dailyCleanliness(s);
    expect(cleanGuestMult(s)).toBe(0.6);
    expect(effectMult(s, 'spawnMult')).toBeCloseTo(0.6);
    expect(s.effects.filter((e) => e.source === 'clean')).toHaveLength(1);
    s.clean.value = 90;
    dailyCleanliness(s);
    expect(effectMult(s, 'spawnMult')).toBe(1);
    expect(s.effects.filter((e) => e.source === 'clean')).toHaveLength(0);
  });
  it('하루가 지나면 tick에서 청결이 갱신된다', () => {
    const s = bareState(1);
    s.totalGuests = 40;
    tick(s, DAY_MS);
    expect(s.clean.lastGuests).toBeGreaterThanOrEqual(40);
    expect(s.clean.value).toBeLessThan(CLEAN_MAX);
  });
});

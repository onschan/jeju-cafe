/** 트랙 A: 시설 153·콤보 60·명당 12·증축 Lv·노후·청결 (스펙 §3.1·§3.2) */
import { bareState, X, Y } from './helpers.ts';
import { placeObject } from '../grid.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { monthIndex } from '../clock.ts';
import { objectStats, activeCombos, popularityFor, discoverCombos, comboTotal, spotEffectAt, comboPickMult, COMBO_UP_CAP, COMBO_DOWN_CAP, POPULARITY_CAP } from '../compat.ts';
import { canUpgrade, upgradeCost, levelOf, tierOf, isUpgradable, facilityFee, LEVEL_POPULARITY, LEVEL_SCENERY, LEVEL_SEATS, UPGRADE_USES, STAR_BY_TIER } from '../upgrade.ts';
import { dailyCleanliness, cleanGuestMult, cleanSatisfaction, wearOf, repairCost, canRepair, upkeepMultOf, cleanReduceMult, WEAR_MAX, CLEAN_MAX } from '../cleanliness.ts';
import { seatsOf } from '../cafe.ts';
import { monthlyYieldOf } from '../orchard.ts';
import { effectMult } from '../effects.ts';
import { OBJECTS, FACILITIES, FACILITY_X_IDS, FACILITY_X_GOAL_REFS, COMBOS, SPOT_EFFECTS, ITEMS, ITEM_FIT_EXTRA, objectDef, spotEffectDef, buildGroupOf } from '../../data/index.ts';
import type { ComboDef, GameState } from '../types.ts';
import facilitiesJson from '../../data/generated/v2/facilities.json' with { type: 'json' };
import facilitiesXJson from '../../data/facilities_x.json' with { type: 'json' };

const ADJ_UP: ComboDef = { id: 'cb_t_up', name: '테스트 ↑', a: 'table_out', bIds: ['tangerine_tree'], bCount: 1, target: 'all', strength: 'up', applyTo: 'a', hidden: false, radius: 2, effectText: '', count: 0 } as ComboDef;
const ADJ_DOWN: ComboDef = { ...ADJ_UP, id: 'cb_t_down', name: '테스트 ↓', bIds: ['stonewall'], strength: 'down' };

function unlockAll(s: GameState, ...ids: string[]) { for (const id of ids) if (!s.unlocked.objects.includes(id)) s.unlocked.objects.push(id); }
/** 완공까지 날을 넘긴다 */
function finish(s: GameState, days: number) { for (let i = 0; i < days; i++) tick(s, DAY_MS); }

describe('데이터', () => {
  it('시설 153종 (v2 109 + 확장 44)이 OBJECTS에 있고 id가 유일하다', () => {
    expect(FACILITY_X_IDS.size).toBe(44);
    expect(facilitiesJson.length + facilitiesXJson.length).toBe(153);
    const rowIds = new Set([...facilitiesJson, ...facilitiesXJson].map((f) => f.id));
    expect(rowIds.size).toBe(153);
    for (const id of rowIds) if (id !== 'field') expect(objectDef(id).id).toBe(id); // 밭만 v3에서 빠진다
    expect(FACILITIES.filter((f) => FACILITY_X_IDS.has(f.id)).length).toBe(44);
    expect(new Set(OBJECTS.map((o) => o.id)).size).toBe(OBJECTS.length);
  });
  it('확장 시설: 요금 있는 쉼 시설은 순회 시설(facility), 요금 null 쉼은 좌석, 카테고리·건설일이 짓기 탭에 맞는다', () => {
    expect(objectDef('footbath').kind).toBe('facility');
    expect(objectDef('footbath').fee).toBe(2000);
    expect(objectDef('rest_pavilion').kind).toBe('seat');
    expect(objectDef('lounge').seats).toBe(6);
    expect(objectDef('mini_bowling')).toMatchObject({ w: 3, h: 2, buildDays: 7, category: 'fun', cost: 24_000_000 });
    expect(objectDef('open_air_footbath')).toMatchObject({ popularity: 30, scenery: 20, buildDays: 7 });
    expect(buildGroupOf('tea_house')).toBe('food');
    expect(buildGroupOf('atm')).toBe('convenience');
    // 해금: 목표 33 + 손님층 7 + 랭크 2 + 상점 1 (전부 시작엔 잠김)
    expect(Object.keys(FACILITY_X_GOAL_REFS).length).toBe(34);
    expect(FACILITY_X_GOAL_REFS.footbath).toBe('g21');
    expect(objectDef('lie_footbath').unlock).toEqual({ type: 'segment', guestId: 'retired_teacher', satisfaction: 30 });
    expect(objectDef('locker').unlock).toEqual({ type: 'rank', rank: 4 });
    expect(objectDef('pinball').unlock).toEqual({ type: 'goal' });
    for (const id of FACILITY_X_IDS) expect(objectDef(id).unlock?.type).not.toBe('start');
  });
  it('콤보 60: 앞 45는 v2 그대로, 46~60 신규, 등급이 grade 열에서 읽힌다', () => {
    expect(COMBOS.length).toBe(60);
    expect(COMBOS[0]).toMatchObject({ id: 'cb_tangerine_view', strength: 'up', applyTo: 'both', target: 'all' });
    expect(COMBOS[10]).toMatchObject({ id: 'cb_photo_souvenir', strength: 'upup', hidden: true });
    expect(COMBOS[44]).toMatchObject({ id: 'cb_boardgame_karaoke', strength: 'down' });
    expect(COMBOS[59]).toMatchObject({ id: 'cb_marble_atm', a: 'marble_game', bIds: ['atm'], applyTo: 'a' });
    for (const c of COMBOS) { expect(objectDef(c.a)).toBeDefined(); for (const b of c.bIds) expect(objectDef(b)).toBeDefined(); expect(c.radius).toBe(2); }
    expect(COMBOS.filter((c) => c.hidden).length).toBe(25);
  });
  it('강화 아이템 잘 맞는 시설: 새 시설 편입, 밭 제거', () => {
    const salt = ITEMS.find((i) => i.id === 'jeju_salt')!;
    expect(salt.fitIds).toEqual(['noodle_shop', 'bomal_kalguksu', 'haenyeo_mulhoe', 'sauna_hut', 'cauldron_footbath']);
    expect(ITEMS.find((i) => i.id === 'seaweed_fertilizer')!.fitIds).not.toContain('field');
    for (const [id, fits] of Object.entries(ITEM_FIT_EXTRA)) {
      const item = ITEMS.find((i) => i.id === id)!;
      for (const f of fits) { expect(objectDef(f)).toBeDefined(); expect(item.fitIds).toContain(f); }
    }
  });
  it('명당 12: 중심·필요 시설이 전부 존재한다', () => {
    expect(SPOT_EFFECTS.length).toBe(12);
    for (const sp of SPOT_EFFECTS) {
      expect(objectDef(sp.center)).toBeDefined();
      for (const r of sp.requires) expect(objectDef(r.objectId)).toBeDefined();
      expect(sp.radius).toBe(2);
      expect(spotEffectDef(sp.id)).toBe(sp);
    }
    expect(spotEffectDef('spot_orchard').requires).toEqual([{ objectId: 'tangerine_tree', count: 4 }, { objectId: 'stonewall', count: 2 }]);
  });
});

describe('콤보 판정 (§3.1)', () => {
  it('같은 콤보는 다른 개체마다 다시 센다: 나무 3그루 → 귤밭 뷰 ×3, 상승 합계는 +12/+20% 상한', () => {
    const s = bareState(1);
    const t = placeObject(s, 'table_out', X(6), Y(4));
    placeObject(s, 'tangerine_tree', X(7), Y(4));
    placeObject(s, 'tangerine_tree', X(5), Y(4));
    placeObject(s, 'tangerine_tree', X(6), Y(5));
    const a = activeCombos(s, t.id, [ADJ_UP]);
    expect(a).toHaveLength(1);
    expect(a[0]!.count).toBe(3);
    expect(comboTotal(a)).toEqual({ pop: 9, feePct: 15 });
    placeObject(s, 'tangerine_tree', X(6), Y(3));
    placeObject(s, 'tangerine_tree', X(7), Y(3));
    expect(comboTotal(activeCombos(s, t.id, [ADJ_UP]))).toEqual({ pop: COMBO_UP_CAP.pop, feePct: COMBO_UP_CAP.feePct });
  });
  it('상승·하락은 따로 합산 후 더한다. 하락 상한 −9/−15%', () => {
    const s = bareState(1);
    const t = placeObject(s, 'table_out', X(6), Y(4));
    for (const [x, y] of [[7, 4], [5, 4], [6, 5], [6, 3]] as const) placeObject(s, 'stonewall', X(x), Y(y));
    placeObject(s, 'tangerine_tree', X(7), Y(5));
    const a = activeCombos(s, t.id, [ADJ_UP, ADJ_DOWN]);
    expect(comboTotal(a)).toEqual({ pop: 3 + COMBO_DOWN_CAP.pop, feePct: 5 + COMBO_DOWN_CAP.feePct });
    expect(objectStats(s, t.id, [ADJ_UP, ADJ_DOWN]).popularity).toBe(10 + 3 - 9);
  });
  it('Lv 계수: Lv2 ×1.25, Lv3 ×1.5', () => {
    const s = bareState(1);
    const t = placeObject(s, 'table_out', X(6), Y(4));
    placeObject(s, 'tangerine_tree', X(7), Y(4));
    placeObject(s, 'tangerine_tree', X(5), Y(4));
    const a = activeCombos(s, t.id, [ADJ_UP]);
    expect(comboTotal(a, 2)).toEqual({ pop: 8, feePct: 13 });
    expect(comboTotal(a, 3)).toEqual({ pop: 9, feePct: 15 });
  });
  it('손님층 콤보: 그 태그 손님이 고를 확률 ×1.3(콤보당, 최대 ×2.0)', () => {
    const youth: ComboDef = { ...ADJ_UP, id: 'cb_y', target: 'youth' };
    const s = bareState(1);
    const t = placeObject(s, 'table_out', X(6), Y(4));
    placeObject(s, 'tangerine_tree', X(7), Y(4));
    expect(comboPickMult(s, t.id, 'student', [youth])).toBeCloseTo(1.3);
    expect(comboPickMult(s, t.id, 'local_auntie', [youth])).toBe(1);
    placeObject(s, 'tangerine_tree', X(5), Y(4));
    placeObject(s, 'tangerine_tree', X(6), Y(5));
    placeObject(s, 'tangerine_tree', X(6), Y(3));
    expect(comboPickMult(s, t.id, 'student', [youth])).toBe(2);
  });
  it('히든 콤보 첫 발견: 도감 + 응모권 1', () => {
    const hidden: ComboDef = { ...ADJ_UP, id: 'cb_h', hidden: true };
    const s = bareState(1);
    const before = s.tickets;
    placeObject(s, 'table_out', X(6), Y(4));
    placeObject(s, 'tangerine_tree', X(7), Y(4));
    discoverCombos(s, [hidden], [], []);
    expect(s.codex.combos).toEqual(['cb_h']);
    expect(s.tickets).toBe(before + 1);
    discoverCombos(s, [hidden], [], []);
    expect(s.tickets).toBe(before + 1);
  });
});

describe('명당 (§3.1)', () => {
  it('귤밭 그늘 명당: 야외 테이블 반경 2칸에 감귤나무 4·돌담 2 → 단체 배수 ×1.5, 인기 +5, 처음엔 응모권 2·장면', () => {
    const s = bareState(1);
    const t = placeObject(s, 'table_out', X(6), Y(4));
    for (const [x, y] of [[7, 4], [5, 4], [6, 5], [8, 4]] as const) placeObject(s, 'tangerine_tree', X(x), Y(y));
    placeObject(s, 'stonewall', X(6), Y(3));
    expect(spotEffectAt(s, t.id)).toBeNull();
    placeObject(s, 'stonewall', X(6), Y(6));
    expect(spotEffectAt(s, t.id)?.id).toBe('spot_orchard');
    const st = objectStats(s, t.id, [], []);
    expect(st.spot?.name).toBe('귤밭 그늘 명당');
    expect(st.popularity).toBe(10 + 5);
    expect(popularityFor(s, t.id, 'rentcar_family', [], [])).toBe(Math.min(POPULARITY_CAP, Math.round(15 * 1.5)));
    expect(popularityFor(s, t.id, 'student', [], [])).toBe(15);
    const before = s.tickets;
    discoverCombos(s, [], [], SPOT_EFFECTS);
    expect(s.codex.spots).toEqual(['spot_orchard']);
    expect(s.tickets).toBe(before + 2);
    expect(s.fx.some((f) => f.kind === 'scene' && f.text.includes('여기가 명당이여!'))).toBe(true);
    // 감귤나무(중심 아님)엔 명당이 없다
    expect(spotEffectAt(s, Object.values(s.objects).find((o) => o.type === 'tangerine_tree')!.id)).toBeNull();
  });
  it('건설 중인 시설은 명당을 못 받고, 완공되면 도감에 오른다', () => {
    const s = bareState(1);
    s.money = 100_000_000;
    unlockAll(s, 'footbath', 'rest_pavilion', 'basalt_rock');
    placeObject(s, 'basalt_rock', X(7), Y(4));
    expect(apply(s, { type: 'place', objectType: 'rest_pavilion', x: X(5), y: Y(4) }).ok).toBe(true);
    expect(apply(s, { type: 'place', objectType: 'footbath', x: X(6), y: Y(4) }).ok).toBe(true);
    const fb = Object.values(s.objects).find((o) => o.type === 'footbath')!;
    expect(fb.build).toBeDefined();
    expect(spotEffectAt(s, fb.id)).toBeNull();
    expect(s.codex.spots).toEqual([]);
    finish(s, 2);
    expect(fb.build).toBeUndefined();
    expect(spotEffectAt(s, fb.id)?.id).toBe('spot_bubble');
    expect(s.codex.spots).toEqual(['spot_bubble']);
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
    const st2 = objectStats(s, t.id, [], []);
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
    const st3 = objectStats(s, t.id, [], []);
    expect(st3.popularity).toBe(18);
    expect(st3.scenery).toBe(4);
    expect(st3.feePct).toBe(110);
    expect(st3.upkeep).toBe(Math.round(def.upkeep * 1.5));
    expect(seatsOf(s, t)).toBe(4);
    expect(apply(s, { type: 'upgradeObject', objectId: t.id }).reason).toContain('최고');
  });
  it('요금형 시설(포토존): Lv2 요금 +10%, Lv3 +20% (1,000 → 1,100 → 1,200). Lv 인기는 상한 40과 별도로 최대 48', () => {
    const s = bareState(1);
    s.money = 100_000_000;
    const p = placeObject(s, 'photo_spot', X(6), Y(4));
    expect(facilityFee(s, p)).toBe(1000);
    p.level = 2;
    expect(facilityFee(s, p)).toBe(1100);
    expect(objectStats(s, p.id, [], []).feePct).toBe(110);
    p.level = 3;
    expect(facilityFee(s, p)).toBe(1200);
    s.itemBonus[p.type] = { popularity: 100, feePct: 0 };
    expect(objectStats(s, p.id, [], []).popularity).toBe(POPULARITY_CAP + 8);
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
    expect(objectStats(s, b.id, [], []).popularity).toBe(20 + 4);
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
    expect(objectStats(s, t.id, [], []).popularity).toBe(9);
    expect(objectStats(s, t.id, [], []).wear).toBe(1);
    expect(upkeepMultOf(s, t)).toBe(1.5);
    expect(objectStats(s, t.id, [], []).upkeep).toBe(Math.round(def.upkeep * 1.5));
    s.clock.year += 1; // +36개월 → (36−24)/6+1 = 3
    expect(wearOf(s, t)).toBe(3);
    s.clock.year += 10;
    expect(wearOf(s, t)).toBe(WEAR_MAX);
    expect(objectStats(s, t.id, [], []).popularity).toBe(10 - WEAR_MAX);
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
  it('시작 100. 매일 −(어제 손님 ÷ 20), 청소 직원(직종 없으면 홀 절반) +(기술 ÷ 5), 청결 시설은 감소 −20%씩', () => {
    const s = bareState(1);
    expect(s.clean).toEqual({ value: CLEAN_MAX, lastGuests: 0 });
    s.totalGuests = 100;
    dailyCleanliness(s);
    expect(s.clean.value).toBe(95);
    expect(s.clean.lastGuests).toBe(100);
    s.totalGuests = 300;
    dailyCleanliness(s);
    expect(s.clean.value).toBe(85);
    // 홀 직원(기술 40) → 청소 직종이 없으면 절반 = 40/5 × 0.5 = 4
    s.staff.push({ id: 'st1', name: '청소', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 50, strength: 50, skill: 40, smile: 50 }, skill: 'none', level: 1, salary: 0, poolId: '', statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 }, extraSkills: [], maxLevel: 10, baseSalary: 0, exp: 0, trainingCount: 0, training: null, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
    dailyCleanliness(s);
    expect(s.clean.value).toBe(89);
    // 화장실이 있으면 감소 ×0.8
    expect(cleanReduceMult(s)).toBe(1);
    placeObject(s, 'restroom', X(6), Y(4));
    expect(cleanReduceMult(s)).toBeCloseTo(0.8);
    s.totalGuests = 500;
    dailyCleanliness(s);
    expect(s.clean.value).toBeCloseTo(89 - 8 + 4);
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

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../state.ts';
import { bareState, X, Y } from './helpers.ts';
import { placeObject, objectAt } from '../grid.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { objectDef } from '../../data/index.ts';
import { TREES, treeOf, nextStep, canTreeUpgrade, treeUpgradeCost, streetLength, streetFeeMult, streetText, streetIfPlaced, stepNeedText, BUILD_TILES, TILE_TYPES, tileBadges, STREET_MIN, STREET_BONUS_PCT } from '../tree.ts';
import { cafeScenery, sceneryMultOf, sceneryTouristMult, appealOf, SCENERY_MULT_MIN, SCENERY_MULT_MAX, PHOTO_REPUTATION, PHOTO_REPUTATION_DAY_CAP, notePhoto, photoReputationDelta } from '../appeal.ts';

describe('업그레이드 트리 (fun: 부루마블처럼 같은 자리에서)', () => {
  it('데이터: 트리 5종 × 3~4단계, 단계 시설은 전부 objects에 있고 비용은 단계마다 오르며, 기본 단계는 처음부터 열려 있다', () => {
    expect(TREES.map((t) => t.id)).toEqual(['seat', 'fun', 'shop', 'garden', 'light']);
    const s = createInitialState(1);
    for (const t of TREES) {
      expect(t.steps.length).toBeGreaterThanOrEqual(3);
      expect(t.purpose.length).toBeLessThanOrEqual(22);
      let last = -1;
      for (const st of t.steps) { const d = objectDef(st.type); expect(d.cost, `${t.id} ${st.type}`).toBeGreaterThan(last); last = d.cost; expect(treeOf(st.type)?.tree.id).toBe(t.id); }
      expect(s.unlocked.objects, t.steps[0]!.type).toContain(t.steps[0]!.type);
    }
    for (const tile of BUILD_TILES) expect(tile.purpose.length).toBeLessThanOrEqual(22);
    expect(BUILD_TILES.map((t) => t.id)).toEqual(['seat', 'service', 'charm', 'inflow', 'building', 'all']);
    for (const ids of Object.values(TILE_TYPES)) for (const id of ids) objectDef(id);
  });

  it('테이블 → 파라솔 → 테라스(등급 2) → 전망 테라스(등급 3, 2×1): 같은 원점·id 유지, 차액만, 조건 문구', () => {
    const s = createInitialState(1);
    s.money = 100_000_000;
    const seat = Object.values(s.objects).find((o) => o.type === 'table_out')!;
    const { x, y, id } = seat;
    expect(nextStep('table_out')?.type).toBe('table_parasol');
    const m0 = s.money;
    expect(apply(s, { type: 'treeUpgrade', objectId: id }).ok).toBe(true);
    expect(s.objects[id]!.type).toBe('table_parasol');
    expect(s.objects[id]).toMatchObject({ x, y });
    expect(m0 - s.money).toBe(objectDef('table_parasol').cost - objectDef('table_out').cost);
    // 등급 조건
    const c = canTreeUpgrade(s, id);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe('등급 「동네 카페」면 열려요');
    expect(stepNeedText(s, nextStep('table_parasol')!)).toContain('동네 카페');
    s.grade = 2;
    expect(apply(s, { type: 'treeUpgrade', objectId: id }).ok).toBe(true);
    expect(s.objects[id]!.type).toBe('terrace_seat');
    expect(canTreeUpgrade(s, id).reason).toBe('공사 중이에요');
    for (let i = 0; i < 5 && s.objects[id]!.build; i++) tick(s, DAY_MS);
    s.grade = 3;
    const r = canTreeUpgrade(s, id);
    // 2×1이라 오른쪽 칸이 비어 있어야 한다 — 비어 있으면 올라가고, 아니면 이유가 그 말
    if (r.ok) { expect(apply(s, { type: 'treeUpgrade', objectId: id }).ok).toBe(true); expect(s.objects[id]!.type).toBe('oreum_bench'); expect(objectAt(s, x + 1, y)?.id).toBe(id); }
    else expect(r.reason).toContain('칸');
    expect(treeUpgradeCost(s, { ...s.objects[id]!, type: 'oreum_bench' })).toBe(0); // 최고 단계
  });

  it('트리에 없는 시설은 올릴 수 없고, 잠긴 단계는 짓기 목록에서 잠김 대신 「올려서」 얻는다', () => {
    const s = bareState(1);
    const o = placeObject(s, 'stonewall', X(2), Y(2));
    expect(canTreeUpgrade(s, o.id).ok).toBe(false);
    expect(treeOf('stonewall')).toBeNull();
    expect(treeOf('terrace_seat')).toEqual({ tree: TREES[0], index: 2 });
  });

  it('거리 보너스: 파라솔 이상 3개를 가로로 이으면 그 줄 전부 요금이 오른다 — 기본 야외 테이블 줄은 안 센다', () => {
    const s = bareState(1);
    const a = placeObject(s, 'table_out', X(2), Y(2));
    placeObject(s, 'table_out', X(3), Y(2));
    placeObject(s, 'table_out', X(4), Y(2));
    expect(streetLength(s, a)).toBe(0);
    expect(streetFeeMult(s, a)).toBe(1);
    expect(streetText(s, a)).toContain('올리고');
    const t = bareState(1);
    const p1 = placeObject(t, 'table_parasol', X(2), Y(2));
    const p2 = placeObject(t, 'table_parasol', X(3), Y(2));
    expect(streetLength(t, p1)).toBe(2);
    expect(streetIfPlaced(t, 'table_parasol', X(4), Y(2))).toBe(STREET_MIN);
    const p3 = placeObject(t, 'table_parasol', X(4), Y(2));
    for (const p of [p1, p2, p3]) { expect(streetLength(t, p)).toBe(3); expect(streetFeeMult(t, p)).toBeCloseTo(1 + STREET_BONUS_PCT / 100); }
    expect(streetText(t, p1)).toBe(`테라스 거리 3칸 · 요금 +${STREET_BONUS_PCT}%`);
    placeObject(t, 'table_parasol', X(2), Y(4)); // 떨어진 것은 안 이어진다
    expect(streetLength(t, p1)).toBe(3);
  });

  it('타일 병목 배지: 자리 이용률 90%↑ → 자리, 경관 < 4 → 매력, 직원 0 → 서비스, 경로 1 → 유입', () => {
    const s = bareState(1);
    const b = tileBadges(s, 0.95, 2, 0, 1);
    expect(b.map((x) => x.tile)).toEqual(['seat', 'charm', 'service', 'inflow']);
    for (const x of b) expect(x.text.length).toBeLessThanOrEqual(22);
    expect(tileBadges(s, 0.3, 8, 2, 2)).toEqual([]);
  });
});

describe('카페 매력도 (fun: 경관 → 관광객, 사진 → 평판)', () => {
  it('자리 평균 경치가 관광객 스폰 배수(×0.85~1.25)가 되고, 동네 손님은 1', () => {
    expect(sceneryMultOf(0)).toBe(SCENERY_MULT_MIN);
    expect(sceneryMultOf(100)).toBe(SCENERY_MULT_MAX);
    expect(sceneryMultOf(5)).toBeCloseTo(1.05);
    const s = bareState(1);
    placeObject(s, 'table_out', X(4), Y(5));
    const before = cafeScenery(s);
    placeObject(s, 'cherry_tree', X(5), Y(5));
    expect(cafeScenery(s)).toBeGreaterThan(before);
    expect(sceneryTouristMult(s, 'local_auntie')).toBe(1);
    expect(sceneryTouristMult(s, 'student')).toBeCloseTo(sceneryMultOf(cafeScenery(s)));
  });
  it('사진 n장 → 밤 평판 +0.02/장, 하루 상한 0.15, 세고 나면 0', () => {
    const s = bareState(1);
    for (let i = 0; i < 3; i++) notePhoto(s);
    expect(photoReputationDelta(s)).toBeCloseTo(3 * PHOTO_REPUTATION);
    expect(photoReputationDelta(s)).toBe(0);
    for (let i = 0; i < 50; i++) notePhoto(s);
    expect(photoReputationDelta(s)).toBe(PHOTO_REPUTATION_DAY_CAP);
  });
  it('패널: 인기·경관·서비스 3줄, 올리는 법 2줄·병목 한 줄 ≤ 22자', () => {
    const s = createInitialState(1);
    const a = appealOf(s, 0.95);
    expect(a.rows.map((r) => r.key)).toEqual(['popularity', 'scenery', 'service']);
    for (const r of a.rows) { for (const h of r.howTo) expect(h.length, h).toBeLessThanOrEqual(22); expect(r.bottleneck.length, r.bottleneck).toBeLessThanOrEqual(22); }
    expect(a.rows[2]!.bottleneck).toBe('직원이 없어 서빙이 느리다');
  });
});

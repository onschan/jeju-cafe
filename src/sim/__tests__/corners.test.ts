import { describe, it, expect } from 'vitest';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { objectDef, START_OBJECT_IDS, GUEST_TYPES, guestTags } from '../../data/index.ts';
import {
  CORNERS, cornerDef, completedCorners, cornerProgress, cornerIfPlaced, cornerBonusAt, cornerPickMult, cornerVisitTargets, visitCorner,
  discoverCorners, cornersMade, CORNER_CAP, CORNER_VISITS_PER_DAY, cornersWithPiece, pendingCorners, cornerBreakWarning,
  cornerSeatLine, cornerAnchorLine, cornerServes, cornerPieceDefault, pieceName, pieceMatches, CORNER_TIER_PCT, CORNER_TIER_FEE_PP,
} from '../corners.ts';
import { cornerKindOf, cornerKindTypes, isCornerKind, CORNER_KIND_IDS } from '../cornerKinds.ts';
import { treeUpgrade, canTreeUpgrade } from '../tree.ts';
import { objectStats, guestPickMult } from '../compat.ts';
import { monthlyYieldOf, expectedHarvest, ORCHARD_FULL_TREES } from '../orchard.ts';
import { goalMet } from '../goals.ts';
import { pickVisit } from '../guests.ts';
import { bareState, at } from './helpers.ts';
import { serialize, deserialize } from '../save.ts';
import type { GameState, Guest } from '../types.ts';

const FEMALE = GUEST_TYPES.find((t) => guestTags(t.id).gender === 'female')!.id;
const MALE = GUEST_TYPES.find((t) => guestTags(t.id).gender === 'male')!.id;
/** 자리에 앉아 있는 손님 하나 (spawnGuests는 좌석·길·메뉴가 있어야 해서 직접 만든다) */
function guestOf(s: GameState, type: string, x: number, y: number): Guest {
  const g: Guest = { id: `g${s.nextId++}`, type, phase: 'seated', x, y, path: [], seatId: null, seatSlot: 0, approachCell: null, menuId: null, mood: 'happy', moodReason: null, say: null, visitId: null, timerMs: 0, waitMs: 0, paid: 0 };
  s.guests.push(g);
  return g;
}

function place(s: GameState, type: string, x: number, y: number) {
  s.goals.index = 999;
  s.money = 1e9;
  const r = apply(s, { type: 'place', objectType: type, ...at(x, y) });
  expect(r.ok, `${type}@${x},${y}: ${r.reason}`).toBe(true);
  const o = Object.values(s.objects).find((o) => o.type === type && o.x === at(x, y).x && o.y === at(x, y).y)!;
  for (let i = 0; i < 10 && o.build; i++) tick(s, DAY_MS); // v2 시설(벤치 등)은 공사 1일 — 완공까지 넘긴다
  expect(o.build).toBeUndefined();
  return o;
}
/** 꽃길: 꽃밭(닻)·나무 벤치·가로등. 시작 필지의 빈 칸은 x 0~9 · y 0~6 (본관 3~5,1~2 · 문 앞 3,3 · 정낭 4,6 제외) */
function flowerPath(s: GameState, ox = 0, oy = 0) {
  const bed = place(s, 'flower_bed', ox, oy);
  place(s, 'deco_wood_bench', ox + 1, oy);
  place(s, 'streetlight', ox, oy + 1);
  return bed;
}

describe('명당 데이터 (corners.json)', () => {
  it('24종, id 중복 없음, 조각은 서로 다른 종류 2~4가지, 반경 2, 있는 종류·시설만', () => {
    expect(CORNERS.length).toBe(24);
    expect(new Set(CORNERS.map((c) => c.id)).size).toBe(24);
    const sigs = new Set<string>();
    for (const c of CORNERS) {
      const types = c.pieces.map((p) => p.type);
      expect(new Set(types).size, c.id).toBe(types.length);
      expect(types.length, c.id).toBeGreaterThanOrEqual(2);
      expect(types.length, c.id).toBeLessThanOrEqual(4);
      expect(c.radius).toBe(2);
      for (const t of types) { if (!isCornerKind(t)) expect(objectDef(t), `${c.id}: ${t}`).toBeDefined(); }
      // 조각 구성이 똑같은 명당이 둘 있으면 하나를 만들 때 둘이 같이 완성돼 버린다
      const sig = c.pieces.map((p) => `${p.type}${p.count}`).sort().join('+');
      expect(sigs.has(sig), `${c.id}: 조각 구성이 겹친다`).toBe(false);
      sigs.add(sig);
      expect(c.effect.feePct).toBeGreaterThan(0);
      expect(c.effect.popularity).toBeGreaterThan(0);
      expect(c.effect.tagMult).toBeGreaterThanOrEqual(1);
      expect(c.effect.photo).toBeGreaterThan(0);
      expect(c.line.length).toBeGreaterThan(0);
      expect(c.guestLine.length).toBeLessThanOrEqual(12);
      expect(c.hint.length).toBeLessThanOrEqual(30);
    }
    expect(cornerDef('corner_flower_path').pieces.map((p) => p.type)).toEqual(['garden', 'fun', 'light']);
    expect(cornersWithPiece('deco_wood_bench').length).toBeGreaterThanOrEqual(5);
  });
  it('조각 종류는 업그레이드 트리 그대로다 — 트리 안 시설은 어느 단계든 같은 조각, 트리 밖 시설은 시설 그대로', () => {
    for (const k of CORNER_KIND_IDS) {
      const types = cornerKindTypes(k);
      expect(types.length).toBeGreaterThanOrEqual(2);
      for (const t of types) expect(cornerKindOf(t)).toBe(k); // 종류는 서로 안 겹친다
    }
    for (const t of ['table_out', 'table_parasol', 'terrace_seat', 'oreum_bench']) expect(cornerKindOf(t)).toBe('seat');
    expect(cornerKindOf('stonewall')).toBeNull(); // 트리 밖 — 업그레이드로 안 바뀐다
    expect(pieceMatches('seat', 'table_parasol')).toBe(true);
    expect(pieceMatches('stonewall', 'stonewall')).toBe(true);
    expect(pieceMatches('seat', 'stonewall')).toBe(false);
    expect(pieceName('garden')).toBe('꽃');
    expect(pieceName('stonewall')).toBe('돌담');
  });
  it('첫 명당(꽃길) 조각은 시작부터 열려 있다 (튜토리얼 ⑤ 꽃밭+벤치)', () => {
    for (const p of cornerDef('corner_flower_path').pieces) expect(START_OBJECT_IDS).toContain(cornerPieceDefault(p.type));
  });
});

describe('명당 판정', () => {
  it('꽃밭+벤치+가로등이 반경 2 안에 모이면 꽃길 완성. 하나가 멀면 미완성, 조각 수와 "다음에 놓을 것"이 보인다', () => {
    const s = bareState(1);
    expect(completedCorners(s)).toEqual([]);
    const bed = place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    let p = cornerProgress(s).find((x) => x.def.id === 'corner_flower_path')!;
    expect(p.done).toBe(false);
    expect(p.anchor?.id).toBe(bed.id);
    expect(p.pieces.map((x) => `${x.type}:${x.have}/${x.need}`)).toEqual(['garden:1/1', 'fun:1/1', 'light:0/1']);
    expect(p.missing).toEqual([{ type: 'light', count: 1 }]);
    place(s, 'streetlight', 9, 6); // 멀다
    expect(completedCorners(s)).toEqual([]);
    place(s, 'streetlight', 2, 2); // 체비쇼프 2
    const done = completedCorners(s);
    expect(done.map((c) => c.id)).toEqual(['corner_flower_path']);
    expect(done[0]!.anchorId).toBe(bed.id);
    expect(done[0]!.pieceIds.length).toBe(3);
    p = cornerProgress(s).find((x) => x.def.id === 'corner_flower_path')!;
    expect(p.done).toBe(true);
    expect(p.missing).toEqual([]);
  });
  it('같은 시설을 더 놓아도 명당은 1회 (완성 목록에 명당당 하나), 조각 count(돌담 4)는 서로 다른 개체로 센다', () => {
    const s = bareState(1);
    flowerPath(s, 0, 0);
    flowerPath(s, 7, 4);
    expect(completedCorners(s).filter((c) => c.id === 'corner_flower_path').length).toBe(1);
    // 돌담길: 돌담 4 + 올렛길 1
    const s2 = bareState(1);
    for (let i = 0; i < 3; i++) place(s2, 'stonewall', 6 + i, 0);
    place(s2, 'path', 6, 1);
    expect(completedCorners(s2).some((c) => c.id === 'corner_stonewall_road')).toBe(false);
    place(s2, 'stonewall', 9, 0);
    expect(completedCorners(s2).some((c) => c.id === 'corner_stonewall_road')).toBe(true);
  });
  it('공사 중인 조각은 안 센다 (완공되면 센다)', () => {
    const s = bareState(1);
    place(s, 'flower_bed', 0, 0);
    place(s, 'streetlight', 1, 0);
    s.goals.index = 999; s.money = 1e9;
    expect(apply(s, { type: 'place', objectType: 'deco_wood_bench', ...at(0, 1) }).ok).toBe(true);
    const bench = Object.values(s.objects).find((o) => o.type === 'deco_wood_bench')!;
    if (bench.build) {
      expect(completedCorners(s)).toEqual([]);
      for (let i = 0; i < 10 && bench.build; i++) tick(s, DAY_MS);
    }
    expect(completedCorners(s).map((c) => c.id)).toEqual(['corner_flower_path']);
  });
  it('결정적·캐시: 같은 상태를 두 번 물으면 같은 참조, 배치가 바뀌면 다시 센다', () => {
    const s = bareState(1);
    flowerPath(s);
    const a = completedCorners(s);
    expect(completedCorners(s)).toBe(a);
    place(s, 'table_out', 8, 5);
    expect(completedCorners(s)).not.toBe(a);
    expect(completedCorners(s)).toEqual(a);
  });
  it('cornerIfPlaced: 마지막 조각을 놓을 자리면 그 명당, 이미 완성됐거나 조각이 아니면 null', () => {
    const s = bareState(1);
    place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    expect(cornerIfPlaced(s, 'streetlight', at(2, 2).x, at(2, 2).y)?.id).toBe('corner_flower_path');
    expect(cornerIfPlaced(s, 'streetlight', at(9, 6).x, at(9, 6).y)).toBeNull();
    expect(cornerIfPlaced(s, 'gate', at(2, 2).x, at(2, 2).y)).toBeNull();
    place(s, 'streetlight', 2, 2);
    expect(cornerIfPlaced(s, 'streetlight', at(0, 1).x, at(0, 1).y)).toBeNull();
  });
});

describe('명당 효과', () => {
  it('반경 안 자리에 명당 인기·요금이 objectStats에 더해지고, 밖은 그대로. 합산은 CORNER_CAP까지', () => {
    const s = bareState(1);
    const near = place(s, 'table_out', 1, 1);
    const far = place(s, 'table_out', 9, 6);
    const before = objectStats(s, near.id);
    flowerPath(s, 0, 0);
    const after = objectStats(s, near.id);
    const eff = cornerDef('corner_flower_path').effect;
    // 가로등은 조명 트리 2단계라 단계 보너스(요금 +3%p · 입소문 +10%)가 붙는다
    const pop = Math.round(eff.popularity * 1.1), feePct = eff.feePct + CORNER_TIER_FEE_PP;
    expect(cornerBonusAt(s, near)).toEqual({ pop, feePct });
    expect(after.popularity - before.popularity).toBe(pop);
    expect(after.feePct - before.feePct).toBe(feePct);
    expect(cornerBonusAt(s, far)).toEqual({ pop: 0, feePct: 0 });
    expect(CORNER_CAP.pop).toBeLessThanOrEqual(12);
    expect(CORNER_CAP.feePct).toBeLessThanOrEqual(30); // spot2: 명당 둘이 겹치면 요금 +30%까지 (총 배수 상한은 fee.ts ×2.0)
  });
  it('대상 태그 손님이 반경 안 시설을 고를 확률 ×tagMult (guestPickMult 훅), 다른 태그는 ×1', () => {
    const s = bareState(1);
    const shop = place(s, 'table_out', 1, 1);
    flowerPath(s, 0, 0); // female ×1.3
    expect(cornerPickMult(s, shop, FEMALE)).toBeCloseTo(1.3);
    expect(cornerPickMult(s, shop, MALE)).toBe(1);
    expect(guestPickMult(s, shop.id, FEMALE)).toBeCloseTo(1.3);
  });
});

describe('명당 완성 연출·도감·손님', () => {
  it('처음 완성하면 도감(codex.corners)·메시지 줄·장면 창(scene)·팻말 반짝(corner fx)·첫 명당 마일리지 +1. 두 번째 완성은 안 한다', () => {
    const s = bareState(1);
    const m0 = s.tickets;
    flowerPath(s);
    expect(s.codex.corners).toEqual(['corner_flower_path']);
    expect(cornersMade(s)).toBe(1);
    expect(s.notices.some((n) => n.includes('꽃길'))).toBe(true);
    const scene = s.fx.find((f) => f.kind === 'scene' && f.title.includes('꽃길'));
    expect(scene && scene.kind === 'scene' && scene.text).toBe(cornerDef('corner_flower_path').line);
    expect(s.fx.some((f) => f.kind === 'corner' && f.id === 'corner_flower_path')).toBe(true);
    expect(s.tickets).toBe(m0 + 1);
    const n = s.fx.length;
    flowerPath(s, 7, 4);
    discoverCorners(s);
    expect(s.codex.corners).toEqual(['corner_flower_path']);
    expect(s.fx.filter((f) => f.kind === 'corner').length).toBe(1);
    expect(s.fx.length).toBeGreaterThanOrEqual(n);
  });
  it('철거해도 도감엔 남고(만든 명당), 완성 목록에선 빠진다', () => {
    const s = bareState(1);
    const bed = flowerPath(s);
    expect(apply(s, { type: 'remove', objectId: bed.id }).ok).toBe(true);
    expect(completedCorners(s)).toEqual([]);
    expect(cornersMade(s)).toBe(1);
  });
  it('목표·도전 조건 corners(n): 도감 수로 판정', () => {
    const s = bareState(1);
    expect(goalMet(s, { type: 'corners', n: 1 })).toBe(false);
    flowerPath(s);
    expect(goalMet(s, { type: 'corners', n: 1 })).toBe(true);
    expect(goalMet(s, { type: 'corners', n: 2 })).toBe(false);
  });
  it('손님 방문: 완성 명당의 닻이 방문 후보에 들고(태그 맞는 손님만), 하루 상한이 차면 빠진다. 도착하면 말풍선·사진 fx·누적 수', () => {
    const s = bareState(1);
    const bed = flowerPath(s);
    expect(cornerVisitTargets(s, FEMALE)).toEqual([]); // 붙은 길이 없으면 못 간다
    place(s, 'path', 0, 2); // 가로등(0,1) 아래 올렛길 → 가로등 조각으로 찾아간다
    const light = Object.values(s.objects).find((o) => o.type === 'streetlight')!;
    expect(cornerVisitTargets(s, FEMALE).map((o) => o.id)).toEqual([light.id]);
    expect(cornerVisitTargets(s, MALE)).toEqual([]);
    const g = guestOf(s, FEMALE, bed.x + 2, bed.y + 2);
    let photos = 0;
    for (let i = 0; i < CORNER_VISITS_PER_DAY; i++) {
      s.rng = i; // photo 확률(0.6) — 결정적 난수
      visitCorner(s, g, bed);
      if (s.fx.some((x) => x.kind === 'flash' && x.tick === s.tick && x.guestId === g.id)) photos++;
      s.fx = [];
    }
    expect(g.say).toBe(cornerDef('corner_flower_path').guestLine);
    expect(s.stats.cornerVisits).toBe(CORNER_VISITS_PER_DAY);
    expect(photos).toBeGreaterThan(0);
    expect(cornerVisitTargets(s, FEMALE)).toEqual([]); // 오늘 상한
    s.guests = [];
    tick(s, DAY_MS);
    expect(cornerVisitTargets(s, FEMALE).map((o) => o.id)).toEqual([light.id]); // 새 날
  });
  it('pickVisit: 명당 닻이 시설처럼 뽑힌다 (시설이 없어도), 닻은 걷는 칸이 아니라 옆 칸으로 간다', () => {
    const s = bareState(1);
    const bed = place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    place(s, 'streetlight', 2, 0);
    place(s, 'path', 0, 1); place(s, 'path', 1, 1); // 닻(꽃밭)의 4방 이웃에 걷는 칸
    const from = at(1, 1);
    const g = guestOf(s, FEMALE, from.x, from.y);
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      s.rng = 1000 + i;
      const v = pickVisit(s, g, from);
      if (v && v.obj.id === bed.id) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });
  it('저장·불러오기: codex.corners·cornerVisits가 왕복하고, 옛 저장(corners 없음)은 빈 배열로 채운다', () => {
    const s = bareState(1);
    flowerPath(s);
    const s2 = deserialize(serialize(s));
    expect(s2.codex.corners).toEqual(['corner_flower_path']);
    expect(completedCorners(s2).map((c) => c.id)).toEqual(['corner_flower_path']);
    const raw = JSON.parse(serialize(s));
    delete raw.codex.corners;
    const s3 = deserialize(JSON.stringify(raw));
    expect(s3.codex.corners).toEqual([]);
  });
});

describe('감귤 3그루 상한 (orchard)', () => {
  it('먼저 심은 3그루는 6개, 4그루째부터 1/3(2개). 안 산 필지의 옛 감귤밭은 안 센다', () => {
    const s = bareState(1);
    const trees = [place(s, 'tangerine_tree', 0, 4), place(s, 'tangerine_tree', 2, 4), place(s, 'tangerine_tree', 6, 4), place(s, 'tangerine_tree', 8, 4)];
    for (const t of trees) t.placedMonth -= 1;
    expect(trees.slice(0, ORCHARD_FULL_TREES).map((t) => monthlyYieldOf(s, t))).toEqual([6, 6, 6]);
    expect(monthlyYieldOf(s, trees[3]!)).toBe(2);
    expect(expectedHarvest(s)).toEqual({ tangerine: 20 });
  });
});

describe('spot2: 업그레이드해도 명당이 안 깨진다', () => {
  it('꽃길의 벤치를 해먹으로, 자리를 파라솔로 올려도 조각 종류가 같아 명당이 그대로다', () => {
    const s = bareState(1);
    flowerPath(s, 0, 0);
    expect(completedCorners(s).map((c) => c.id)).toContain('corner_flower_path');
    const bench = Object.values(s.objects).find((o) => o.type === 'deco_wood_bench')!;
    s.money = 1e9;
    s.unlocked.objects.push('hammock');
    const up = canTreeUpgrade(s, bench.id);
    expect(up.ok, up.reason).toBe(true);
    treeUpgrade(s, bench.id);
    for (let i = 0; i < 10 && bench.build; i++) tick(s, DAY_MS);
    expect(bench.type).toBe('hammock');
    expect(completedCorners(s).map((c) => c.id)).toContain('corner_flower_path'); // 「벤치」는 어느 단계든 벤치
  });
  it('상위 단계 조각이면 명당 효과가 단계마다 +10% (합산 상한까지)', () => {
    const s = bareState(1);
    const seat = place(s, 'table_out', 1, 1);
    // 정원등(조명 1단계)으로 꽃길 — 단계 합 0이라 보너스 없음
    place(s, 'flower_bed', 0, 0);
    place(s, 'deco_wood_bench', 1, 0);
    const lamp = place(s, 'garden_lamp', 0, 1);
    const eff = cornerDef('corner_flower_path').effect;
    expect(completedCorners(s)[0]!.tierSteps).toBe(0);
    expect(cornerBonusAt(s, seat)).toEqual({ pop: eff.popularity, feePct: eff.feePct });
    // 정원등 → 가로등(2단계)으로 올리면 요금 +3%p · 입소문 +10%
    s.money = 1e9;
    treeUpgrade(s, lamp.id);
    for (let i = 0; i < 10 && lamp.build; i++) tick(s, DAY_MS);
    expect(completedCorners(s)[0]!.tierSteps).toBe(1);
    expect(cornerBonusAt(s, seat).feePct).toBe(eff.feePct + CORNER_TIER_FEE_PP);
    expect(cornerBonusAt(s, seat).pop).toBe(Math.round(eff.popularity * (1 + CORNER_TIER_PCT / 100)));
  });
});

describe('spot2: 효과가 어디에 닿나', () => {
  it('요금은 반경 2 안의 자리·요금 시설만 받는다 (꽃·담 같은 장식은 요금 0, 입소문은 둘레가 같이 받는다)', () => {
    const s = bareState(1);
    const seat = place(s, 'table_out', 1, 1);
    const wall = place(s, 'stonewall', 2, 1);
    flowerPath(s, 0, 0);
    expect(cornerBonusAt(s, seat).feePct).toBeGreaterThan(0);
    expect(cornerBonusAt(s, wall).feePct).toBe(0);
    expect(cornerBonusAt(s, wall).pop).toBeGreaterThan(0);
  });
  it('명당이 돌봐 주는 자리 목록·카드 한 줄 (자리 카드 「명당 꽃길 옆」, 조각 카드 「돌봐 주는 자리 n곳」)', () => {
    const s = bareState(1);
    const seat = place(s, 'table_out', 1, 1);
    const bed = flowerPath(s, 0, 0);
    const c = completedCorners(s)[0]!;
    expect(cornerServes(s, c).map((o) => o.id)).toEqual([seat.id]);
    expect(cornerSeatLine(s, seat)).toContain('꽃길');
    expect(cornerSeatLine(s, seat)).toContain('요금 +');
    expect(cornerSeatLine(s, bed)).toBeNull(); // 꽃밭은 자리가 아니다
    expect(cornerAnchorLine(s, bed.id)).toEqual({ name: '꽃길', seats: 1, sales: 0 });
  });
});

describe('spot2: 즉시 피드백·경고', () => {
  it('마지막 조각이 공사 중이면 곧 완성될 명당으로 잡히고 미리 알림이 한 번만 뜬다', () => {
    const s = bareState(1);
    place(s, 'flower_bed', 0, 0);
    place(s, 'streetlight', 0, 1);
    s.goals.index = 999; s.money = 1e9;
    expect(apply(s, { type: 'place', objectType: 'deco_wood_bench', ...at(1, 0) }).ok).toBe(true);
    const bench = Object.values(s.objects).find((o) => o.type === 'deco_wood_bench')!;
    expect(bench.build).toBeDefined();
    expect(pendingCorners(s).map((c) => c.id)).toEqual(['corner_flower_path']);
    expect(completedCorners(s)).toEqual([]);
    const soon = s.notices.filter((n) => n.includes('공사가 끝나면') && n.includes('꽃길')).length;
    expect(soon).toBe(1);
    discoverCorners(s);
    expect(s.notices.filter((n) => n.includes('공사가 끝나면') && n.includes('꽃길')).length).toBe(1); // 두 번 안 뜬다
    for (let i = 0; i < 10 && bench.build; i++) tick(s, DAY_MS);
    expect(pendingCorners(s)).toEqual([]);
    expect(completedCorners(s).map((c) => c.id)).toEqual(['corner_flower_path']);
  });
  it('조각을 치우면 명당이 깨진다고 경고한다 — 대신 설 조각이 있으면 경고 없음', () => {
    const s = bareState(1);
    const bed = flowerPath(s, 0, 0);
    const bench = Object.values(s.objects).find((o) => o.type === 'deco_wood_bench')!;
    expect(cornerBreakWarning(s, bench.id)).toBe('치우면 꽃길이 깨져요');
    expect(cornerBreakWarning(s, place(s, 'table_out', 8, 5).id)).toBeNull(); // 조각이 아니다
    place(s, 'deco_wood_bench', 1, 1); // 대신 설 벤치
    expect(cornerBreakWarning(s, bench.id)).toBeNull();
    expect(cornerBreakWarning(s, bed.id)).toBe('치우면 꽃길이 깨져요'); // 꽃은 하나뿐
  });
});

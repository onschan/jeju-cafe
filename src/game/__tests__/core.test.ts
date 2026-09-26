/** 새 코어 (specs/2026-09-27-rebuild-kairo-core.md) — 규칙 하나에 테스트 하나 */
import { describe, it, expect } from 'vitest';
import { newGame, apply, step, run, canPlace, cellAt, HOME, BUS_STOP, ROAD_Y, sheetOf, synergyPairs, popularitySum, dailyGuests, spawnOne, updateGuests, monthEnd, upkeepTotal, unlockables, evaluate, currentObjective, serialize, deserialize, DAY_MS, HOUR_MS, lineCells, walkable, runBot, SYNERGY_POP, SCENERY_CAP } from '../index.ts';
import type { GameState } from '../index.ts';

const at = (lx: number, ly: number) => ({ x: HOME.x + lx, y: HOME.y + ly });
function yard(seed = 1): GameState { const s = newGame(seed); s.money = 100_000_000; return s; }

describe('땅과 바닥', () => {
  it('3×3 필지 12×10, 가운데만 내 땅, 남쪽 변이 마을 길, 정류장은 길 위', () => {
    const s = newGame(1);
    expect(s.grid.w).toBe(36); expect(s.grid.h).toBe(30);
    expect(s.parcels.filter((p) => p.owned).map((p) => p.id)).toEqual(['home']);
    expect(cellAt(s, 0, ROAD_Y).terrain).toBe('road');
    expect(cellAt(s, BUS_STOP.x, BUS_STOP.y).terrain).toBe('road');
    expect(walkable(s, BUS_STOP.x, BUS_STOP.y)).toBe(true);
  });
  it('바닥은 내 땅 잔디에만, 드래그 한 줄은 L자로 이어지고 칸마다 값을 낸다', () => {
    const s = yard();
    expect(canPlace(s, 'floor_wood', at(0, 0).x, at(0, 0).y).ok).toBe(true);
    expect(canPlace(s, 'floor_wood', 0, 0).ok).toBe(false); // 남의 땅
    expect(canPlace(s, 'floor_wood', 5, ROAD_Y).ok).toBe(false); // 길
    expect(lineCells(at(0, 0), at(2, 1)).length).toBe(4);
    const money = s.money;
    expect(apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 0), to: at(3, 0) }).ok).toBe(true);
    expect(s.money).toBe(money - 4 * 20000);
    expect(cellAt(s, at(3, 0).x, at(3, 0).y).floor).toBe('wood');
    expect(apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 0), to: at(3, 0) }).ok).toBe(false); // 이미 깔림
  });
  it('자리·가게는 바닥 위에, 나무·바위는 잔디에, 장식은 어디든. 자리는 걷는 칸에 붙어야 한다', () => {
    const s = yard();
    expect(canPlace(s, 'table_out', at(0, 0).x, at(0, 0).y).reason).toBe('바닥을 먼저 깔아요');
    expect(canPlace(s, 'tangerine_tree', at(0, 0).x, at(0, 0).y).ok).toBe(true);
    // 데크 두 줄 (0..3, 5..6) — (4,5)·(4,6)은 시작 올렛길이라 정류장과 이어진다
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 5), to: at(3, 5) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 6), to: at(3, 6) });
    expect(canPlace(s, 'tangerine_tree', at(0, 6).x, at(0, 6).y).reason).toBe('나무·바위는 잔디에 심어요');
    expect(canPlace(s, 'deco_planter', at(0, 6).x, at(0, 6).y).ok).toBe(true);
    // 아랫줄을 테이블로 채워도 윗줄이 통로라 괜찮다
    for (const lx of [0, 1, 2, 3]) expect(apply(s, { type: 'place', id: 'table_out', x: at(lx, 6).x, y: at(lx, 6).y }).ok).toBe(true);
    // 윗줄 입구 (3,5)를 막으면 아랫줄 테이블들이 정류장에서 끊긴다 — 자리든 장식이든 거부
    expect(canPlace(s, 'table_out', at(3, 5).x, at(3, 5).y).reason).toMatch(/통로가 막혀요/);
    expect(canPlace(s, 'deco_planter', at(3, 5).x, at(3, 5).y).reason).toMatch(/통로가 막혀요/);
    expect(canPlace(s, 'table_out', at(2, 5).x, at(2, 5).y).reason).toMatch(/통로가 막혀요/); // (0,5)·(1,5)가 끊긴다
    expect(canPlace(s, 'table_out', at(0, 0).x, at(0, 0).y).reason).toBe('바닥을 먼저 깔아요');
  });
});

describe('시설 손익계산서', () => {
  it('합계 = 기본 + 상성 보너스 + 경치(반경 2, 상한 20), 상성 짝은 요금도 올린다', () => {
    const s = yard();
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 5), to: at(4, 5) });
    apply(s, { type: 'place', id: 'table_out', x: at(1, 5).x, y: at(1, 5).y });
    const t = Object.values(s.facilities).find((f) => f.x === at(1, 5).x)!;
    const a = sheetOf(s, t);
    expect(a).toMatchObject({ base: 10, bonus: 0, scenery: 0, total: 10, fee: 0 });
    apply(s, { type: 'place', id: 'tangerine_tree', x: at(1, 4).x, y: at(1, 4).y }); // 잔디, 붙어 있음 → 「귤밭 자리」 + 경치 4
    const b = sheetOf(s, t);
    expect(b.pairs.map((p) => p.name)).toEqual(['귤밭 자리']);
    expect(b).toMatchObject({ base: 10, bonus: SYNERGY_POP, scenery: 4, total: 18, fee: 200 });
    expect(b.likedBy).toEqual(['student', 'worker']);
    for (let i = 0; i < 8; i++) apply(s, { type: 'place', id: 'cedar', x: at(i, 7).x, y: at(i, 7).y });
    expect(sheetOf(s, t).scenery).toBeLessThanOrEqual(SCENERY_CAP);
  });
  it('놓는 순간 새로 생긴 상성 짝마다 「상성 UP」이 순서대로 뜬다', () => {
    const s = yard();
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 5), to: at(3, 5) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 6), to: at(3, 6) });
    expect(apply(s, { type: 'place', id: 'table_out', x: at(0, 6).x, y: at(0, 6).y }).ok).toBe(true);
    expect(apply(s, { type: 'place', id: 'table_out', x: at(2, 6).x, y: at(2, 6).y }).ok).toBe(true);
    s.fx = [];
    expect(apply(s, { type: 'place', id: 'tangerine_tree', x: at(1, 7).x, y: at(1, 7).y }).ok).toBe(true); // 두 테이블 사이 아래 잔디
    const ups = s.fx.filter((f) => f.kind === 'synergy');
    expect(ups.length).toBe(3); // 나무 자신 + 테이블 둘
    expect(ups.map((f) => f.kind === 'synergy' && f.order)).toEqual([0, 1, 2]);
    expect(synergyPairs(s, Object.values(s.facilities).find((f) => f.type === 'tangerine_tree')!).length).toBe(2);
  });
});

describe('손님', () => {
  it('하루 손님 수 = 3 + 인기 합/40 + 0.7√명성, 자리×4 상한', () => {
    const s = yard();
    expect(dailyGuests(s)).toBe(3 + Math.floor(popularitySum(s) / 40));
    s.fame = 100;
    expect(dailyGuests(s)).toBe(Math.min(2 * 4, 3 + Math.floor(popularitySum(s) / 40) + 7));
  });
  it('정류장에서 걸어와 앉고, 돈을 내고, 영수증 한 줄을 남기고, 연구가 쌓인다 — 결정적', () => {
    const s = newGame(3);
    const money = s.money;
    expect(spawnOne(s)).toBe(true);
    const g = s.guests[0]!;
    expect(g.path[0]).toEqual(BUS_STOP);
    updateGuests(s, 20_000); // 걸어가 앉는다
    expect(g.phase).toBe('use');
    updateGuests(s, HOUR_MS * 2); // 이용 끝
    expect(s.money).toBeGreaterThan(money);
    expect(s.receipts.length).toBe(1);
    expect(s.receipts[0]!.money).toBe(s.money - money);
    expect(s.research).toBeGreaterThanOrEqual(1);
    expect(s.stats.guests).toBe(1);
    const t = newGame(3); spawnOne(t); updateGuests(t, 20_000); updateGuests(t, HOUR_MS * 2);
    expect(serialize(t)).toBe(serialize(s));
  });
  it('빈 시설이 없으면 오지 않고 돌아간 수만 센다', () => {
    const s = newGame(1);
    s.fame = 5;
    for (const f of Object.values(s.facilities)) s.guests.push({ id: 'x', type: 'student', phase: 'use', x: 0, y: 0, path: [], target: f.id, approach: null, timerMs: 1e9, mood: null, face: { hair: 0, skin: 0, top: 0 } }, { id: 'y', type: 'student', phase: 'use', x: 0, y: 0, path: [], target: f.id, approach: null, timerMs: 1e9, mood: null, face: { hair: 0, skin: 0, top: 0 } });
    expect(spawnOne(s)).toBe(false);
    expect(s.fame).toBe(5);
    expect(s.stats.turnedAway).toBe(1);
  });
  it('하루가 흐르면 손님이 온다', () => {
    const s = newGame(2);
    run(s, DAY_MS * 3);
    expect(s.stats.guests).toBeGreaterThan(0);
  });
});

describe('돈·연구·직원·투자·평가·목표', () => {
  it('월말에 유지비·월급이 나가고, 잔고가 −200만 아래면 삼춘 대출', () => {
    const s = newGame(1);
    const up = upkeepTotal(s);
    expect(up).toBeGreaterThan(0);
    s.money = 0;
    monthEnd(s);
    expect(s.money).toBe(-up);
    s.money = -3_000_000;
    monthEnd(s);
    expect(s.loan.count).toBe(1);
    expect(s.money).toBe(-3_000_000 - up + 3_000_000);
  });
  it('연구로 시설·메뉴·손님층을 연다 (싼 것부터), 모자라면 거부', () => {
    const s = newGame(1);
    const first = unlockables(s)[0]!;
    expect(apply(s, { type: 'unlock', id: first.id }).ok).toBe(false);
    s.research = first.cost;
    expect(apply(s, { type: 'unlock', id: first.id }).ok).toBe(true);
    expect(s.research).toBe(0);
    expect(apply(s, { type: 'unlock', id: first.id }).reason).toBe('이미 열렸어요');
    expect(s.fx.some((f) => f.kind === 'unlock')).toBe(true);
  });
  it('직원: 후보 3명, 뽑으면 월급이 월말에 나간다', () => {
    const s = yard();
    expect(s.candidates.length).toBe(3);
    const c = s.candidates[0]!;
    expect(apply(s, { type: 'hire', candidateId: c.id }).ok).toBe(true);
    expect(s.staff.length).toBe(1);
    const money = s.money;
    monthEnd(s);
    expect(money - s.money).toBe(upkeepTotal(s) + c.wage);
  });
  it('투자는 1회, 명성이 오른다; 땅은 붙은 것만 산다', () => {
    const s = yard();
    expect(apply(s, { type: 'invest', id: 'ad_campaign' }).ok).toBe(true);
    expect(s.fame).toBe(30);
    expect(apply(s, { type: 'invest', id: 'ad_campaign' }).reason).toBe('이미 했어요');
    expect(apply(s, { type: 'buyParcel', id: 'nw' }).reason).toBe('내 땅과 붙어 있어야 해요');
    expect(apply(s, { type: 'buyParcel', id: 'north' }).ok).toBe(true);
    expect(apply(s, { type: 'buyParcel', id: 'nw' }).ok).toBe(true);
  });
  it('평가: 점수 = 명성 + 인기 합, 경쟁 카페 5곳과 순위, 상금', () => {
    const s = yard();
    s.fame = 1000;
    const ev = evaluate(s);
    expect(ev.rank).toBe(1);
    expect(ev.rows.length).toBe(6);
    expect(ev.prize).toBe(3_000_000);
  });
  it('목표 사다리: 첫 목표는 자리 3개, 이루면 상금과 다음 목표', () => {
    const s = yard();
    expect(currentObjective(s)!.id).toBe('seat3');
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 5), to: at(5, 5) });
    expect(apply(s, { type: 'place', id: 'table_out', x: at(0, 5).x, y: at(0, 5).y }).ok).toBe(true);
    expect(apply(s, { type: 'place', id: 'table_out', x: at(5, 5).x, y: at(5, 5).y }).ok).toBe(true);
    expect(s.objectivesDone).toEqual(['seat3']);
    expect(currentObjective(s)!.id).toBe('guest10');
  });
  it('저장 왕복', () => {
    const s = newGame(7);
    run(s, DAY_MS);
    expect(deserialize(serialize(s))).toEqual(s);
  });
});

describe('봇 2년', () => {
  it('파산 없이 굴러가고 시설·명성이 자란다, 같은 seed면 같은 결과', () => {
    const a = runBot(2, 1, newGame);
    const b = runBot(2, 1, newGame);
    expect(a).toEqual(b);
    const last = a.at(-1)!;
    expect(Math.min(...a.map((r) => r.money))).toBeGreaterThan(-5_000_000);
    expect(last.facilities).toBeGreaterThan(6);
    expect(last.fame).toBeGreaterThan(30);
    expect(a.reduce((n, r) => n + r.guests, 0)).toBeGreaterThan(500);
  }, 90_000);
});

/** 새 코어 (specs/2026-09-27-rebuild-kairo-core.md) — 규칙 하나에 테스트 하나 */
import { describe, it, expect } from 'vitest';
import { newGame, apply, step, run, canPlace, cellAt, HOME, BUS_STOP, ROAD_Y, sheetOf, synergyPairs, popularitySum, dailyGuests, spawnOne, updateGuests, monthEnd, upkeepTotal, unlockables, evaluate, currentObjective, serialize, deserialize, DAY_MS, HOUR_MS, lineCells, walkable, wallBetween, effSkill, makeMsOf, serveMsOf, yardScenery, runBot, SYNERGY_POP, SCENERY_CAP } from '../index.ts';
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
  it('합계 = 기본 + 상성 보너스 (마당 경치는 자리에 안 붙는다), 상성 짝은 요금도 올린다', () => {
    const s = yard();
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(0, 5), to: at(4, 5) });
    apply(s, { type: 'place', id: 'table_out', x: at(1, 5).x, y: at(1, 5).y });
    const t = Object.values(s.facilities).find((f) => f.x === at(1, 5).x)!;
    const a = sheetOf(s, t);
    expect(a).toMatchObject({ base: 10, bonus: 0, scenery: 0, total: 10, fee: 0 });
    const yard0 = yardScenery(s);
    const guests0 = dailyGuests(s);
    apply(s, { type: 'place', id: 'tangerine_tree', x: at(1, 4).x, y: at(1, 4).y }); // 붙어 있으면 「귤밭 자리」 상성
    const b = sheetOf(s, t);
    expect(b.pairs.map((p) => p.name)).toEqual(['귤밭 자리']);
    expect(b).toMatchObject({ base: 10, bonus: SYNERGY_POP, scenery: 0, total: 14, fee: 200 }); // 경치는 0
    expect(b.likedBy).toEqual(['student', 'worker']);
    // 마당 경치는 자리와 떨어져 있어도 쌓이고, 쌓이면 손님이 더 온다
    expect(yardScenery(s)).toBe(yard0 + 4);
    for (let i = 0; i < 4; i++) expect(apply(s, { type: 'place', id: 'flower_bed', x: at(i, 1).x, y: at(i, 1).y }).ok).toBe(true);
    expect(sheetOf(s, t).scenery).toBe(0);
    expect(yardScenery(s)).toBeGreaterThan(yard0 + 4);
    expect(dailyGuests(s)).toBeGreaterThan(guests0);
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
    expect(dailyGuests(s)).toBe(3 + Math.floor(popularitySum(s) / 40) + Math.floor(yardScenery(s) / 6));
    s.fame = 100;
    expect(dailyGuests(s)).toBe(Math.min(2 * 4, 3 + Math.floor(popularitySum(s) / 40) + Math.floor(yardScenery(s) / 6) + 7));
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
  it('채용: 공고를 내면 며칠 뒤 후보가 오고, 뽑으면 월급이 월말에 나간다. 담당이 맞아야 제값', () => {
    const s = yard();
    expect(s.candidates.length).toBe(0);
    expect(apply(s, { type: 'recruit', channel: 'headhunter' }).reason).toBe('명성 200부터 쓸 수 있어요');
    const money = s.money;
    expect(apply(s, { type: 'recruit', channel: 'flyer' }).ok).toBe(true);
    expect(money - s.money).toBe(150_000);
    expect(apply(s, { type: 'recruit', channel: 'flyer' }).reason).toBe('이미 채용 중이에요');
    run(s, DAY_MS * 2);
    expect(s.candidates.length).toBe(0);       // 아직 오는 중 (3일)
    run(s, DAY_MS);
    expect(s.candidates.length).toBe(3);
    for (const c of s.candidates) expect(Math.max(c.service, c.speed, c.clean, c.charm)).toBeLessThanOrEqual(7); // 전단지는 B급까지
    const c = s.candidates[0]!;
    expect(apply(s, { type: 'hire', candidateId: c.id }).ok).toBe(true);
    const st = s.staff[0]!;
    expect(st.duty).toBe((['service', 'speed', 'clean', 'charm'] as const).reduce((a, k) => (st[k] > st[a] ? k : a), 'service')); // 가장 잘하는 자리로
    expect(effSkill(st, st.duty)).toBe(st[st.duty]);
    apply(s, { type: 'setDuty', staffId: st.id, duty: st.duty === 'clean' ? 'charm' : 'clean' });
    expect(effSkill(st, st.duty === 'clean' ? 'charm' : 'clean')).toBeLessThan(st[st.duty === 'clean' ? 'charm' : 'clean']);
    const m2 = s.money;
    monthEnd(s);
    expect(m2 - s.money).toBe(upkeepTotal(s) + c.wage);
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
    s.fame = 2500;
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

describe('벽과 실내', () => {
  it('벽은 바닥 변에 선다(칸을 안 먹음); 네모를 두르면 올렛길 쪽은 문으로 남고 실내 +2 — 겨울에 바깥 자리만 −6', () => {
    const s = yard();
    // 데크 (1..3, 5..6), 입구는 (3,6)→(4,6) 올렛길
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 5), to: at(3, 5) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 6), to: at(3, 6) });
    expect(apply(s, { type: 'place', id: 'table_out', x: at(1, 6).x, y: at(1, 6).y }).ok).toBe(true);
    const t = Object.values(s.facilities).find((f) => f.x === at(1, 6).x)!;
    expect(sheetOf(s, t).indoor).toBe(false);
    expect(canPlace(s, 'railing', at(2, 5).x, at(2, 5).y).ok).toBe(false); // 벽은 시설처럼 못 놓는다
    const money = s.money;
    // 데크 네모 둘레에 나무 판벽: 변 10개 중 동쪽 두 변은 올렛길(4,5)·(4,6)에 닿아 문이라 비워진다 → 8변
    expect(apply(s, { type: 'wallRect', id: 'wall_wood', from: at(1, 5), to: at(3, 6) }).ok).toBe(true);
    expect(money - s.money).toBe(8 * 25_000);
    expect(wallBetween(s, at(3, 6), at(4, 6))).toBeNull();           // 문
    expect(wallBetween(s, at(1, 5), at(1, 4))).toBe('wall_wood');    // 북 변
    expect(walkable(s, at(1, 4).x, at(1, 4).y)).toBe(false);        // 잔디는 원래 못 걷는다
    expect(sheetOf(s, t).indoor).toBe(true);
    expect(sheetOf(s, t).season).toBe(2);                            // 실내 +2
    // 같은 자리에 또 두르면 「이미 벽」이라 실패
    expect(apply(s, { type: 'wallRect', id: 'wall_wood', from: at(1, 5), to: at(3, 6) }).ok).toBe(false);
    // 손님은 벽을 못 건넌다: 정류장에서 데크로는 문으로만
    expect(apply(s, { type: 'place', id: 'table_out', x: at(2, 5).x, y: at(2, 5).y }).ok).toBe(true);
    // 겨울: 실내는 +2 그대로, 바깥 자리는 −6
    s.clock.month = 1;
    expect(sheetOf(s, t).season).toBe(2);
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(5, 6), to: at(6, 6) });
    expect(apply(s, { type: 'place', id: 'table_out', x: at(6, 6).x, y: at(6, 6).y }).ok).toBe(true);
    const out = Object.values(s.facilities).find((f) => f.x === at(6, 6).x)!;
    expect(sheetOf(s, out)).toMatchObject({ indoor: false, season: -6 });
    s.clock.month = 5;
    expect(sheetOf(s, out).season).toBe(0);
    // 걷어내기: 한 칸 둘레의 벽을 반값에
    const m2 = s.money;
    expect(apply(s, { type: 'removeWalls', x: at(1, 5).x, y: at(1, 5).y }).ok).toBe(true); // 북·서 변 2개
    expect(s.money - m2).toBe(2 * 12_500);
    expect(sheetOf(s, t).indoor).toBe(false);
  });
});

describe('실내 시설', () => {
  it('실내 전용은 둘러싸인 바닥에만; 아늑함은 실내 자리 인기, 카운터는 자리 요금 +300, 화장실은 손님 점수', () => {
    const s = yard();
    s.research = 10_000;
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 4), to: at(3, 4) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 5), to: at(3, 5) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 6), to: at(3, 6) });
    expect(canPlace(s, 'table_in', at(1, 6).x, at(1, 6).y).reason).toBe('벽으로 둘러싸인 실내 바닥에만 놓아요');
    expect(apply(s, { type: 'wallRect', id: 'wall_wood', from: at(1, 4), to: at(3, 6) }).ok).toBe(true);
    expect(apply(s, { type: 'place', id: 'table_in', x: at(1, 6).x, y: at(1, 6).y }).ok).toBe(true);
    const t = Object.values(s.facilities).find((f) => f.type === 'table_in')!;
    expect(sheetOf(s, t)).toMatchObject({ indoor: true, comfort: 0, fee: 600 });
    for (const id of ['fireplace', 'counter']) if (!s.unlocked.facilities.includes(id)) expect(apply(s, { type: 'unlock', id }).ok).toBe(true);
    expect(apply(s, { type: 'place', id: 'fireplace', x: at(1, 5).x, y: at(1, 5).y }).ok).toBe(true); // 테이블 옆 칸
    expect(sheetOf(s, t).comfort).toBe(5);                  // 벽난로 아늑함 +5
    expect(sheetOf(s, t).pairs.map((p) => p.name)).toContain('난롯가'); // 상성
    expect(apply(s, { type: 'place', id: 'counter', x: at(2, 4).x, y: at(2, 4).y }).ok).toBe(true); // 2×2: (2..3, 4..5)
    expect(sheetOf(s, t).fee).toBe(600 + 200 + 300);        // 상성 +200, 카운터 +300
    expect(canPlace(s, 'fireplace', at(5, 3).x, at(5, 3).y).ok).toBe(false); // 바깥 잔디엔 안 된다
  });
});

describe('벽은 못 넘는다', () => {
  it('손님 길은 벽 변을 한 번도 건너지 않고, 벽이 생기면 걷던 손님도 길을 다시 찾는다', () => {
    const s = yard();
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 5), to: at(3, 5) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 6), to: at(3, 6) });
    expect(apply(s, { type: 'place', id: 'table_out', x: at(1, 5).x, y: at(1, 5).y }).ok).toBe(true);
    expect(spawnOne(s)).toBe(true);
    const g = s.guests[0]!;
    // 걷는 도중에 둘러싼다 (문은 올렛길 쪽)
    run(s, 400);
    expect(apply(s, { type: 'wallRect', id: 'wall_wood', from: at(1, 5), to: at(3, 6) }).ok).toBe(true);
    run(s, 100);
    const noCross = (path: { x: number; y: number }[], from: { x: number; y: number }) => { let p = from; for (const q of path) { if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1) expect(wallBetween(s, p, q)).toBeNull(); p = q; } };
    noCross(g.path, { x: Math.round(g.x), y: Math.round(g.y) });
    expect(g.rev).toBe(s.layoutRev);
    // 끝까지 걸어가 앉는다
    run(s, HOUR_MS * 3);
    expect(['use', 'out'].includes(g.phase) || !s.guests.includes(g)).toBe(true);
  });
});

describe('주문 → 제조 → 서빙', () => {
  it('제조대가 있으면 주문이 걸리고 만들어 서빙된다. 바리스타·홀 등급이 빠를수록 짧다', () => {
    const s = yard();
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 5), to: at(3, 5) });
    apply(s, { type: 'placeLine', id: 'floor_wood', from: at(1, 6), to: at(3, 6) });
    expect(apply(s, { type: 'place', id: 'table_out', x: at(1, 5).x, y: at(1, 5).y }).ok).toBe(true);
    // 제조대 없이: 셀프 — 주문이 안 생긴다
    expect(spawnOne(s)).toBe(true);
    run(s, HOUR_MS * 2);
    expect(s.orders.length).toBe(0);
    // 제조대를 놓으면 주문이 생긴다
    expect(apply(s, { type: 'place', id: 'prep_bar', x: at(3, 6).x, y: at(3, 6).y }).ok).toBe(true);
    const slow = makeMsOf(s, 'drink');
    s.guests.length = 0;
    expect(spawnOne(s)).toBe(true);
    run(s, HOUR_MS * 3);
    const g = s.guests[0]!;
    expect(['use', 'out'].includes(g.phase)).toBe(true);
    expect(s.orders.length + (g.served ? 1 : 0)).toBeGreaterThan(0);  // 주문 중이거나 이미 받았거나
    // 바리스타(손놀림)가 좋으면 제조가 빨라진다
    s.staff.push({ id: 's1', name: '테스터', service: 1, speed: 10, clean: 1, charm: 1, wage: 0, duty: 'speed', served: 0, happy: 0, month: { served: 0, happy: 0 }, face: { hair: 0, skin: 0, top: 0 } });
    expect(makeMsOf(s, 'drink')).toBeLessThan(slow);
    const noHall = serveMsOf(s);
    s.staff.push({ id: 's2', name: '홀', service: 10, speed: 1, clean: 1, charm: 1, wage: 0, duty: 'service', served: 0, happy: 0, month: { served: 0, happy: 0 }, face: { hair: 0, skin: 0, top: 0 } });
    expect(serveMsOf(s)).toBeLessThan(noHall);                        // 홀 직원이 오면 서빙이 빨라진다
    // 끝까지 돌면 손님이 결제하고 나간다
    run(s, HOUR_MS * 6);
    expect(s.stats.guests).toBeGreaterThan(0);
  });
});

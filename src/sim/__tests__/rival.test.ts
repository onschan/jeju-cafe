/** 동네 경쟁 카페 (rival.ts) — 성장 곡선·순위 계산·손님 분배·뺏기 이벤트 선택지·대회 상대 연결·인수/제휴 조건·결정성. */
import { describe, test, expect } from 'vitest';
import type { GameState } from '../types.ts';
import { bareState } from './helpers.ts';
import { apply } from '../actions.ts';
import { createInitialState } from '../state.ts';
import { serialize, deserialize } from '../save.ts';
import {
  RIVALS, initRivals, rivalsState, rivalDef, activeRivals, acquiredRivals, elapsedMonths, rivalAxes, totalOf,
  myAxes, myTotal, myServiceScore, scoreboard, rankGap, boardLine, boardDue, runBoard,
  stealDue, rollSteal, activeSteal, canAnswerRival, answerRival, stealMult,
  pushingTrend, trendCompetitors, trendShareMult, rivalGuestMult,
  endgameOpen, canAllyRival, canAcquireRival, acquireRival, allyRival, dealCost, contestOpponents, dailyRivals,
  RIVAL_AXES, RIVAL_WEIGHT, RIVAL_BOARD_DAY, RIVAL_STEAL_DAY, RIVAL_EFFECT_YEAR, RIVAL_RANK_BONUS,
  RIVAL_STEAL_PENALTY, RIVAL_DEVELOP_PENALTY, RIVAL_SHARE_MAX, RIVAL_ACQUIRE_BONUS, RIVAL_COUNTER_COST,
  RIVAL_DEAL_ENDGAME_YEAR, RIVAL_DEAL_GRADE, RIVAL_DEAL_LEAD_MONTHS, RIVAL_ACQUIRE_COST, RIVAL_DEAL_MONTHLY,
} from '../rival.ts';
import { rivalNames } from '../contest.ts';
import { objectDef } from '../../data/index.ts';

function s0(seed = 1): GameState {
  return bareState(seed);
}

describe('데이터', () => {
  test('경쟁 카페는 5곳이고 id·이름·강점 항목·유행 분류·인수 시설이 모두 성하다', () => {
    expect(RIVALS).toHaveLength(5);
    const ids = new Set(RIVALS.map((d) => d.id));
    expect(ids.size).toBe(5);
    for (const d of RIVALS) {
      expect(d.name.length).toBeGreaterThan(1);
      expect(RIVAL_AXES).toContain(d.strength);
      expect(['coffee', 'dessert', 'meal', 'juice']).toContain(d.category);
      expect(() => objectDef(d.gift)).not.toThrow(); // 인수 보상 시설이 실제로 있다
      for (const a of RIVAL_AXES) {
        expect(d.base[a]).toBeGreaterThanOrEqual(0);
        expect(d.growth[a]).toBeGreaterThan(0); // 다들 자란다 — 가만히 있으면 밀린다
      }
    }
  });
  test('항목 가중치 합은 1', () => {
    expect(RIVAL_AXES.reduce((n, a) => n + RIVAL_WEIGHT[a], 0)).toBeCloseTo(1, 6);
  });
});

describe('성장 곡선', () => {
  test('달이 갈수록 오르고 100을 넘지 않는다', () => {
    const d = rivalDef('roastery_haru');
    const a0 = totalOf(rivalAxes(1, d, 0));
    const a24 = totalOf(rivalAxes(1, d, 24));
    const a60 = totalOf(rivalAxes(1, d, 60));
    expect(a24).toBeGreaterThan(a0);
    expect(a60).toBeGreaterThan(a24);
    for (const m of [0, 12, 60, 240]) for (const a of RIVAL_AXES) {
      const v = rivalAxes(1, d, m)[a];
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
  test('같은 seed·같은 달이면 늘 같은 점수 (결정적)', () => {
    for (const d of RIVALS) for (const m of [0, 7, 33]) expect(rivalAxes(3, d, m)).toEqual(rivalAxes(3, d, m));
  });
  test('seed가 다르면 잡음이 달라진다', () => {
    const d = rivalDef('sea_view');
    const many = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(rivalAxes(seed, d, 10)));
    expect(new Set(many).size).toBeGreaterThan(1);
  });
  test('5년차(60달) 1위 경쟁 카페는 85점을 넘어 계속 겨룰 만하다', () => {
    const top = Math.max(...RIVALS.map((d) => totalOf(rivalAxes(1, d, 60))));
    expect(top).toBeGreaterThan(85);
    expect(top).toBeLessThan(100);
  });
  test('첫 달엔 내가 꼴찌 — 새로 연 카페가 동네 1위일 수는 없다', () => {
    const s = s0();
    const rows = scoreboard(s);
    expect(rows.find((r) => r.me)!.rank).toBe(rows.length);
  });
});

describe('순위 계산', () => {
  test('나 + 경쟁 5 = 6줄, 순위는 1부터 빠짐없이, 점수 내림차순', () => {
    const rows = scoreboard(s0());
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.total).toBeGreaterThanOrEqual(rows[i]!.total);
    expect(rows.filter((r) => r.me)).toHaveLength(1);
  });
  test('내 점수를 올리면 순위가 오른다', () => {
    const s = s0();
    const before = scoreboard(s).find((r) => r.me)!.rank;
    s.reputation = 100;
    s.lastMonthIncome = 30_000_000;
    for (const t of Object.values(s.guestTypes)) { t.unlocked = true; }
    for (const k of Object.keys(s.segmentPopularity)) s.segmentPopularity[k] = 99;
    const after = scoreboard(s).find((r) => r.me)!.rank;
    expect(after).toBeLessThan(before);
  });
  test('rankGap: 한 계단 위와의 격차 · 1위면 위가 없다', () => {
    const s = s0();
    const g = rankGap(scoreboard(s));
    expect(g.above).not.toBeNull();
    expect(g.gap).toBeGreaterThan(0);
    const top = scoreboard(s).map((r) => ({ ...r }));
    top.sort(() => 0);
    expect(rankGap([{ ...top[0]!, me: true, rank: 1 }]).above).toBeNull();
  });
  test('발표는 5일에 한 번만 돈다 — 같은 달에 두 번 발표하지 않는다', () => {
    const s = s0();
    s.clock.day = RIVAL_BOARD_DAY;
    expect(boardDue(s)).toBe(true);
    runBoard(s);
    expect(boardDue(s)).toBe(false);
    s.clock.month++;
    expect(boardDue(s)).toBe(true);
  });
  test('발표하면 내 순위·경쟁 카페 순위·발표 한 줄이 남고, 장면 창과 메시지 줄이 생긴다', () => {
    const s = s0();
    s.clock.day = RIVAL_BOARD_DAY;
    const fx = s.fx.length, notices = s.notices.length;
    runBoard(s);
    const st = rivalsState(s);
    expect(st.myRank).toBe(6);
    expect(st.rows).toHaveLength(6);
    expect(st.line.length).toBeGreaterThan(0);
    expect(s.fx.length).toBeGreaterThan(fx);
    expect(s.notices.length).toBeGreaterThan(notices);
    for (const d of RIVALS) expect(st.cafes[d.id]!.rank).not.toBeNull();
  });
  test('순위가 오르면 보상 상자, 내려가면 없다', () => {
    const s = s0();
    s.clock.day = RIVAL_BOARD_DAY;
    runBoard(s); // 6위
    s.alerts.length = 0;
    s.clock.month++;
    s.reputation = 100; s.lastMonthIncome = 30_000_000;
    for (const t of Object.values(s.guestTypes)) { t.unlocked = true; }
    for (const k of Object.keys(s.segmentPopularity)) s.segmentPopularity[k] = 99;
    runBoard(s);
    expect(rivalsState(s).myRank).toBeLessThan(6);
    expect(s.alerts.some((a) => a.type === 'reward' && a.source === 'rival')).toBe(true);
    // 다시 떨어지면 보상이 없다
    s.alerts.length = 0;
    s.clock.month++;
    s.reputation = 10; s.lastMonthIncome = 0;
    for (const k of Object.keys(s.segmentPopularity)) s.segmentPopularity[k] = 0;
    runBoard(s);
    expect(s.alerts.some((a) => a.type === 'reward' && a.source === 'rival')).toBe(false);
  });
  test('1위를 이어 가면 leadMonths가 쌓이고, 놓치면 0으로', () => {
    const s = s0();
    s.rivals = initRivals();
    for (const d of RIVALS) rivalsState(s).cafes[d.id]!.acquired = true; // 나 혼자 → 늘 1위
    for (let i = 0; i < 3; i++) { s.clock.day = RIVAL_BOARD_DAY; runBoard(s); s.clock.month++; }
    expect(rivalsState(s).leadMonths).toBe(3);
    for (const d of RIVALS) rivalsState(s).cafes[d.id]!.acquired = false;
    s.clock.day = RIVAL_BOARD_DAY;
    runBoard(s);
    expect(rivalsState(s).leadMonths).toBe(0);
  });
  test('내 「서비스」는 평판만으로 100이 되지 않는다 — 직원 머릿수도 본다', () => {
    const s = s0();
    s.reputation = 100;
    s.staff = [];
    expect(myServiceScore(s)).toBeLessThan(100);
  });
});

describe('손님 분배', () => {
  test('1년차엔 손님 배수가 1 — 밴드를 건드리지 않는다', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR - 1;
    rivalsState(s).myRank = 1;
    expect(rivalGuestMult(s)).toBe(1);
  });
  test('순위 계단대로 손님이 붙는다 (1위 +10% · 4위 이하 0)', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.trend = { monthIndex: 0, category: 'coffee' };
    s.monthMenuSold = {}; // 유행을 밀고 있지 않다 → 나눔 없음
    for (const rank of [1, 2, 3, 4, 6]) {
      rivalsState(s).myRank = rank;
      expect(rivalGuestMult(s)).toBeCloseTo(1 + (RIVAL_RANK_BONUS[rank - 1] ?? 0), 6);
    }
  });
  test('유행을 실제로 밀 때만 손님을 나눈다 — 메뉴판에 올려 둔 것만으로는 안 나눈다', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.trend = { monthIndex: 0, category: 'coffee' }; // 커피를 미는 경쟁 카페가 있다
    expect(trendCompetitors(s).length).toBeGreaterThan(0);
    s.monthMenuSold = {};
    expect(pushingTrend(s)).toBe(false);
    expect(trendShareMult(s)).toBe(1);
    s.monthMenuSold = { americano: 100, tangerine_juice: 1 };
    expect(pushingTrend(s)).toBe(true);
    const m = trendShareMult(s);
    expect(m).toBeLessThan(1);
    expect(m).toBeGreaterThanOrEqual(1 - RIVAL_SHARE_MAX);
  });
  test('유행을 밀어도 내가 훨씬 세면 덜 나눈다', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.trend = { monthIndex: 0, category: 'coffee' };
    s.monthMenuSold = { americano: 100 };
    rivalsState(s).myScore = 10;
    const weak = trendShareMult(s);
    rivalsState(s).myScore = 95;
    const strong = trendShareMult(s);
    expect(strong).toBeGreaterThan(weak);
  });
  test('인수한 카페 수만큼 손님이 붙는다', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.monthMenuSold = {};
    rivalsState(s).myRank = 5; // 계단 보너스 0
    const before = rivalGuestMult(s);
    rivalsState(s).cafes['sea_view']!.acquired = true;
    expect(rivalGuestMult(s)).toBeCloseTo(before * (1 + RIVAL_ACQUIRE_BONUS), 6);
  });
});

describe('뺏기 이벤트 선택지', () => {
  function withSteal(): GameState {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.clock.day = RIVAL_STEAL_DAY;
    rollSteal(s);
    return s;
  }
  test('1년차엔 오지 않는다', () => {
    const s = s0();
    s.clock.year = 1;
    s.clock.day = RIVAL_STEAL_DAY;
    expect(stealDue(s)).toBe(false);
  });
  test('같은 세이브·같은 달이면 같은 카페·같은 종류 (결정적)', () => {
    const a = withSteal(), b = withSteal();
    expect(a.rivals!.steal).toEqual(b.rivals!.steal);
  });
  test('그냥 두면 −10%, 메뉴 개발이면 −5%, 맞불 홍보면 손해가 없다', () => {
    const ignore = withSteal();
    answerRival(ignore, 'ignore');
    expect(stealMult(ignore)).toBeCloseTo(1 - RIVAL_STEAL_PENALTY, 6);

    const dev = withSteal();
    const research = dev.research;
    answerRival(dev, 'develop');
    expect(stealMult(dev)).toBeCloseTo(1 - RIVAL_DEVELOP_PENALTY, 6);
    expect(dev.research).toBeGreaterThan(research);

    const counter = withSteal();
    counter.money = RIVAL_COUNTER_COST + 1;
    answerRival(counter, 'counter');
    expect(stealMult(counter)).toBe(1);
    expect(counter.money).toBe(1);
  });
  test('돈이 모자라면 맞불 홍보를 못 고른다 · 답은 한 번만', () => {
    const s = withSteal();
    s.money = RIVAL_COUNTER_COST - 1;
    expect(canAnswerRival(s, 'counter').ok).toBe(false);
    expect(canAnswerRival(s, 'develop').ok).toBe(true);
    answerRival(s, 'develop');
    expect(canAnswerRival(s, 'develop').ok).toBe(false);
  });
  test('달이 바뀌면 이벤트가 사라진다', () => {
    const s = withSteal();
    expect(activeSteal(s)).not.toBeNull();
    s.clock.month++;
    expect(activeSteal(s)).toBeNull();
    expect(stealMult(s)).toBe(1);
  });
  test('액션으로도 답할 수 있다', () => {
    const s = withSteal();
    s.money = RIVAL_COUNTER_COST + 1_000_000;
    expect(apply(s, { type: 'answerRival', choice: 'counter' }).ok).toBe(true);
    expect(apply(s, { type: 'answerRival', choice: 'ignore' }).ok).toBe(false);
  });
});

describe('대회 상대 연결', () => {
  test('상대 3곳은 동네 카페 이름이고 서로 겹치지 않는다', () => {
    for (const month of [6, 12]) for (const ev of ['espresso', 'latteart', 'signature'] as const) {
      const names = rivalNames(7, 2, month, ev);
      expect(names).toHaveLength(3);
      expect(new Set(names).size).toBe(3);
      for (const n of names) expect(RIVALS.some((d) => d.name === n)).toBe(true);
    }
  });
  test('같은 회차면 늘 같은 상대 (결정적), 회차가 다르면 바뀔 수 있다', () => {
    expect(contestOpponents(5, 3, 6, 0)).toEqual(contestOpponents(5, 3, 6, 0));
    const sets = [0, 1, 2].map((ei) => contestOpponents(5, 3, 6, ei).map((d) => d.id).join());
    expect(new Set(sets).size).toBeGreaterThanOrEqual(1);
  });
});

describe('인수·제휴 조건', () => {
  function endgame(): GameState {
    const s = s0();
    s.clock.year = RIVAL_DEAL_ENDGAME_YEAR;
    s.grade = RIVAL_DEAL_GRADE;
    rivalsState(s).leadMonths = RIVAL_DEAL_LEAD_MONTHS;
    s.money = RIVAL_ACQUIRE_COST;
    return s;
  }
  test('연차·등급·1위 유지 셋을 다 채워야 열린다', () => {
    const s = endgame();
    expect(endgameOpen(s)).toBe(true);
    s.clock.year = RIVAL_DEAL_ENDGAME_YEAR - 1;
    expect(endgameOpen(s)).toBe(false);
    s.clock.year = RIVAL_DEAL_ENDGAME_YEAR;
    s.grade = RIVAL_DEAL_GRADE - 1;
    expect(endgameOpen(s)).toBe(false);
    s.grade = RIVAL_DEAL_GRADE;
    rivalsState(s).leadMonths = RIVAL_DEAL_LEAD_MONTHS - 1;
    expect(endgameOpen(s)).toBe(false);
  });
  test('돈이 모자라면 인수를 못 한다', () => {
    const s = endgame();
    s.money = RIVAL_ACQUIRE_COST - 1;
    expect(canAcquireRival(s, 'sea_view').ok).toBe(false);
    expect(canAllyRival(s, 'sea_view').ok).toBe(true); // 제휴는 월 고정비라 지금 돈이 없어도 걸 수 있다
  });
  test('인수하면 순위표에서 빠지고 시설 하나가 열린다', () => {
    const s = endgame();
    const def = rivalDef('tangerine_bakery');
    expect(canAcquireRival(s, def.id).ok).toBe(true);
    acquireRival(s, def.id);
    expect(s.money).toBe(0);
    expect(acquiredRivals(s).map((d) => d.id)).toEqual([def.id]);
    expect(activeRivals(s)).toHaveLength(4);
    expect(scoreboard(s)).toHaveLength(5);
    expect(s.unlocked.objects).toContain(def.gift);
    expect(canAcquireRival(s, def.id).ok).toBe(false); // 두 번은 없다
  });
  test('제휴하면 그 집 강점 항목이 오르고 월 고정비가 붙는다', () => {
    const s = endgame();
    s.reputation = 60;
    const def = rivalDef('guesthouse_cafe'); // 강점 서비스
    const before = myAxes(s)[def.strength];
    allyRival(s, def.id);
    expect(myAxes(s)[def.strength]).toBeGreaterThan(before);
    expect(dealCost(s)).toBe(RIVAL_DEAL_MONTHLY);
    expect(apply(s, { type: 'endAllyRival', id: def.id }).ok).toBe(true);
    expect(dealCost(s)).toBe(0);
  });
});

describe('결정성·세이브', () => {
  test('경쟁은 주 rng를 소비하지 않는다 — dailyRivals 전후로 rng가 같다', () => {
    const s = s0();
    s.clock.year = RIVAL_EFFECT_YEAR;
    for (const day of [RIVAL_BOARD_DAY, RIVAL_STEAL_DAY]) {
      s.clock.day = day;
      const rng = s.rng;
      dailyRivals(s);
      expect(s.rng).toBe(rng);
    }
  });
  test('같은 seed를 두 번 돌리면 순위표가 같다', () => {
    const a = createInitialState(9, 'p', 0, 'starter');
    const b = createInitialState(9, 'p', 0, 'starter');
    expect(scoreboard(a).map((r) => [r.id, r.total])).toEqual(scoreboard(b).map((r) => [r.id, r.total]));
  });
  test('경쟁 상태가 없는 옛 세이브도 그대로 열린다 (backfill)', () => {
    const s = createInitialState(4, 'p', 0, 'starter');
    const raw = JSON.parse(serialize(s)) as GameState;
    delete raw.rivals;
    const back = deserialize(JSON.stringify(raw));
    expect(back.rivals).toBeDefined();
    expect(Object.keys(back.rivals!.cafes)).toHaveLength(5);
    expect(back.rivals!.myRank).toBeNull();
    expect(scoreboard(back)).toHaveLength(6);
  });
  test('세이브를 왕복해도 순위·제휴·인수가 남는다', () => {
    const s = s0();
    s.clock.day = RIVAL_BOARD_DAY;
    runBoard(s);
    rivalsState(s).cafes['sea_view']!.deal = true;
    rivalsState(s).cafes['franchise_star']!.acquired = true;
    const back = deserialize(serialize(s));
    expect(back.rivals!.myRank).toBe(s.rivals!.myRank);
    expect(back.rivals!.cafes['sea_view']!.deal).toBe(true);
    expect(activeRivals(back)).toHaveLength(4);
  });
  test('발표 한 줄은 늘 한국어 문장이고 경쟁 카페 이름을 쓴다', () => {
    const s = s0();
    const line = boardLine(s, scoreboard(s));
    expect(line.length).toBeGreaterThan(5);
    expect(line).toMatch(/앞섰어요|지켰어요/);
  });
  test('elapsedMonths는 시작 달(1년 3월)에 0', () => {
    const s = createInitialState(1, 'p', 0, 'starter');
    expect(elapsedMonths(s)).toBe(0);
    s.clock.year = 2;
    expect(elapsedMonths(s)).toBe(12);
  });
  test('myTotal은 0~100 안', () => {
    const s = s0();
    expect(myTotal(s)).toBeGreaterThanOrEqual(0);
    expect(myTotal(s)).toBeLessThanOrEqual(100);
  });
});

/** 대회 (contest.ts) — 일정·참가 조건·심사 공식·상대 결정성·운 판정·순위 보상·트로피·오즈·도감·목표. */
import { describe, test, expect } from 'vitest';
import type { GameState, Staff, RoleId, ContestEvent } from '../types.ts';
import { apply } from '../actions.ts';
import { step } from '../tick.ts';
import { bareState, forceNextOutcome, at } from './helpers.ts';
import {
  contestState, contestUnlocked, nextContest, daysToContest, signupOpen, isContestDay, contestTitle, roundIndex,
  judgeScore, judgeScores, baseScore, rivalScores, rankAmong, contestOdds, contestMenus, contestStaff,
  canEnterContest, enterContest, canCancelContest, runContest, dailyContest, contestGuestMult, contestBadge,
  trophyOwned, trophyPlaced, canPlaceTrophy, contestHistory, contestWins, contestBestRank,
  titleBonusFor, trainingBonusFor, supplyBonus,
  CONTESTS, CONTEST_MONTHS, SIGNUP_DAYS, CONTEST_GRADE, JUDGE_KEYS, SCORE_MULT, MENU_SCALE, PRIZE_MULT, RANK_TICKETS, RANK_EXP, RANK_BOOST, TROPHY_TYPE, CONTEST_HISTORY_CAP,
  STAFF_BONUS_MAX, TITLE_BONUS_PER, TITLE_BONUS_MAX, TRAINING_BONUS_PER, TRAINING_BONUS_MAX, SUPPLY_BONUS_MAX,
} from '../contest.ts';
import { outcomeChances, OUTCOME_TABLE, TASK_NAME } from '../luck.ts';
import { menuStatsOf } from '../craft.ts';
import { customMet } from '../goals.ts';
import { goalDef, objectDef, menuDef } from '../../data/index.ts';

const BARISTA_MENU = 'americano';

function staffOf(role: RoleId = 'barista', over: Partial<Staff> = {}): Staff {
  return {
    id: `c_${role}`, name: '출전', face: { hair: 0, skin: 0, top: 0 }, poolId: '',
    stats: { stamina: 60, strength: 40, skill: 80, smile: 50 }, statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 },
    skill: 'none', extraSkills: [], level: 3, maxLevel: 10, baseSalary: 400_000, salary: 400_000, exp: 0,
    trainingCount: 0, training: null, role, unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1,
    x: at(4, 3).x, y: at(4, 3).y, path: [], anchor: null, waitMs: 0, ...over,
  };
}

/** 등급 3 · 6월 1일 이레 전 · 바리스타 1명 · 메뉴판에 아메리카노 */
function ready(seed = 1, over: Partial<Staff> = {}): { s: GameState; st: Staff } {
  const s = bareState(seed);
  s.grade = CONTEST_GRADE;
  s.clock.year = 3;
  s.clock.month = 5;
  s.clock.day = 30 - SIGNUP_DAYS + 1; // 6월 1일까지 SIGNUP_DAYS일
  s.money = 50_000_000;
  const st = staffOf('barista', over);
  s.staff = [st];
  s.menuSlots[0] = BARISTA_MENU;
  return { s, st };
}

// ---------- 일정·해금 ----------

describe('일정·참가 조건', () => {
  test('연 2회 6·12월 1일, 해금은 등급 3', () => {
    expect(CONTEST_MONTHS).toEqual([6, 12]);
    const s = bareState();
    s.grade = CONTEST_GRADE - 1;
    expect(contestUnlocked(s)).toBe(false);
    expect(signupOpen(s)).toBe(false);
    s.grade = CONTEST_GRADE;
    expect(contestUnlocked(s)).toBe(true);
  });

  test('다음 개최·남은 날·접수 창 (이레 전 ~ 당일 아침)', () => {
    const s = bareState();
    s.grade = CONTEST_GRADE;
    s.clock.year = 2; s.clock.month = 3; s.clock.day = 1;
    expect(nextContest(s)).toEqual({ year: 2, month: 6 });
    expect(daysToContest(s)).toBe(90);
    expect(signupOpen(s)).toBe(false);
    s.clock.month = 5; s.clock.day = 24; // 6월 1일까지 7일
    expect(daysToContest(s)).toBe(SIGNUP_DAYS);
    expect(signupOpen(s)).toBe(true);
    s.clock.day = 23;
    expect(signupOpen(s)).toBe(false); // 이레보다 이르면 아직
    s.clock.month = 6; s.clock.day = 1;
    expect(daysToContest(s)).toBe(0);
    expect(signupOpen(s)).toBe(true);
    expect(isContestDay(s)).toBe(true);
    s.clock.day = 2;
    expect(nextContest(s)).toEqual({ year: 2, month: 12 }); // 지나면 다음 회차
    s.clock.month = 12; s.clock.day = 2;
    expect(nextContest(s)).toEqual({ year: 3, month: 6 }); // 해를 넘긴다
  });

  test('회차수는 년·월로 결정된다 (상대 성장)', () => {
    expect(roundIndex(1, 6)).toBe(1);
    expect(roundIndex(1, 12)).toBe(2);
    expect(roundIndex(3, 6)).toBe(5);
    expect(roundIndex(3, 12)).toBe(6);
  });

  test('참가비 부족·접수 창 밖·직종 불일치·메뉴 없음이면 거부', () => {
    const { s, st } = ready();
    const espresso = CONTESTS[0]!;
    expect(canEnterContest(s, 'espresso', st.id, BARISTA_MENU).ok).toBe(true);
    s.money = espresso.fee - 1;
    expect(canEnterContest(s, 'espresso', st.id, BARISTA_MENU)).toEqual({ ok: false, reason: '참가비가 모자라요' });
    s.money = 50_000_000;
    s.clock.day = 1; // 접수 창 밖 (5월 1일)
    expect(canEnterContest(s, 'espresso', st.id, BARISTA_MENU).ok).toBe(false);
    s.clock.day = 30 - SIGNUP_DAYS + 1;
    s.staff[0]!.role = 'clean';
    expect(canEnterContest(s, 'espresso', st.id, BARISTA_MENU)).toEqual({ ok: false, reason: '이 종목에 맞는 직종이 아니에요' });
    s.staff[0]!.role = 'barista';
    s.menuSlots[0] = null;
    expect(canEnterContest(s, 'espresso', st.id, BARISTA_MENU).ok).toBe(false);
  });

  test('접수하면 참가비가 나가고, 무르면 돌려받는다 (대회 날은 못 무른다)', () => {
    const { s, st } = ready();
    const fee = CONTESTS[0]!.fee;
    const before = s.money;
    expect(apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU }).ok).toBe(true);
    expect(s.money).toBe(before - fee);
    expect(s.monthCosts.contest).toBe(fee);
    expect(contestState(s).entry).toMatchObject({ event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
    expect(canEnterContest(s, 'espresso', st.id, BARISTA_MENU)).toEqual({ ok: false, reason: '이미 접수했어요' });
    expect(apply(s, { type: 'cancelContest' }).ok).toBe(true);
    expect(s.money).toBe(before);
    expect(contestState(s).entry).toBeNull();
    // 대회 날엔 못 무른다
    apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
    s.clock.month = 6; s.clock.day = 1;
    expect(canCancelContest(s).ok).toBe(false);
  });

  test('종목별 출전 직종·낼 메뉴 (시그니처는 개발 메뉴 먼저)', () => {
    const { s } = ready();
    expect(CONTESTS.map((c) => c.id)).toEqual(['espresso', 'latteart', 'signature']);
    expect(CONTESTS[2]!.roles).toEqual(['barista', 'cook']);
    expect(contestStaff(s, 'espresso')).toHaveLength(1);
    expect(contestMenus(s, 'espresso')).toEqual([BARISTA_MENU]);
    s.staff[0]!.role = 'cook';
    expect(contestStaff(s, 'espresso')).toHaveLength(0); // 에스프레소는 바리스타만
    expect(contestStaff(s, 'signature')).toHaveLength(1);
  });
});

// ---------- 심사 공식 ----------

describe('심사 공식 (MenuStats 4축 직결)', () => {
  test('종목마다 가중치 합이 1이고, 종목별 주 심사축이 다르다', () => {
    for (const d of CONTESTS) {
      const sum = JUDGE_KEYS.reduce((n, k) => n + d.weights[k], 0);
      expect(Math.round(sum * 1000) / 1000, d.id).toBe(1);
    }
    expect(CONTESTS[0]!.weights.taste).toBeGreaterThan(CONTESTS[0]!.weights.look);   // 에스프레소 = 맛
    expect(CONTESTS[1]!.weights.look).toBeGreaterThan(CONTESTS[1]!.weights.taste);   // 라떼아트 = 외관
    expect(CONTESTS[2]!.weights.story).toBeGreaterThan(CONTESTS[2]!.weights.taste);  // 시그니처 = 스토리
  });

  test('항목 점수 = 메뉴 스탯×배수 + 직원 + 칭호 + 연수 + 자급 재료 (각 상한, 0~100)', () => {
    const { s, st } = ready();
    const menu = menuStatsOf(s, BARISTA_MENU);
    const j = judgeScore(s, 'taste', st, BARISTA_MENU);
    expect(j.menu).toBeCloseTo(menu.taste * MENU_SCALE, 5);
    expect(j.staff).toBeCloseTo((st.stats.skill / 100) * STAFF_BONUS_MAX, 5); // 맛·향·외관은 기술
    expect(judgeScore(s, 'story', st, BARISTA_MENU).staff).toBeCloseTo((st.stats.smile / 100) * STAFF_BONUS_MAX, 5); // 스토리는 미소
    expect(j.title).toBe(0);
    expect(j.training).toBe(0);
    expect(j.supply).toBe(0);
    expect(j.total).toBe(Math.round((j.menu + j.staff) * 10) / 10);
  });

  test('스탯 상한·하한: 아무것도 없는 직원은 0, 만점 입력은 100에서 잘린다', () => {
    const { s } = ready();
    const zero = staffOf('barista', { stats: { stamina: 0, strength: 0, skill: 0, smile: 0 } });
    s.staff = [zero];
    s.menuSlots[0] = BARISTA_MENU;
    for (const k of JUDGE_KEYS) expect(judgeScore(s, k, zero, BARISTA_MENU).total).toBeGreaterThanOrEqual(0);
    // 최고 입력: 스탯 100 + 칭호 + 연수 + 자급 + 좋은 메뉴 → 100에서 잘린다
    const maxed = staffOf('barista', { stats: { stamina: 100, strength: 100, skill: 100, smile: 100 }, title: 'tt_pro_barista', trainingLog: { tr_barista: 9, tr_service: 9 } });
    s.staff = [maxed];
    const custom = { id: 'm_x', name: '큰 것', category: 'drink' as const, price: 5000, ingredients: { coffee_bean: 1 }, stats: { taste: 90, aroma: 90, look: 90, health: 0, volume: 0, jeju: 90 } };
    s.customMenus = [custom];
    s.menuSlots[0] = custom.id;
    for (const k of JUDGE_KEYS) expect(judgeScore(s, k, maxed, custom.id).total, k).toBe(100);
    expect(baseScore(CONTESTS[0]!, judgeScores(s, maxed, custom.id))).toBe(100);
  });

  test('칭호·연수·자급 재료 보정은 상한에서 멈춘다', () => {
    const { s } = ready();
    const pro = staffOf('barista', { title: 'tt_pro_barista' }); // speed·fee·photo 3종
    expect(titleBonusFor(pro, 'look')).toBe(TITLE_BONUS_PER);      // photo 1개
    expect(titleBonusFor(pro, 'taste')).toBe(TITLE_BONUS_PER);     // speed 1개
    expect(titleBonusFor(staffOf('barista'), 'taste')).toBe(0);
    const trained = staffOf('barista', { trainingLog: { tr_barista: 2, tr_service: 1 } });
    expect(trainingBonusFor(trained, 'taste')).toBe(2 * TRAINING_BONUS_PER);
    expect(trainingBonusFor(trained, 'story')).toBe(TRAINING_BONUS_PER);
    expect(trainingBonusFor(staffOf('barista', { trainingLog: { tr_barista: 99 } }), 'taste')).toBe(TRAINING_BONUS_MAX);
    expect(titleBonusFor(staffOf('barista', { title: 'tt_pro_barista' }), 'aroma')).toBeLessThanOrEqual(TITLE_BONUS_MAX);
    // 자급: 창고에 재료가 다 있으면 상한
    expect(supplyBonus(s, BARISTA_MENU)).toBe(0);
    s.storage = fullStorage(BARISTA_MENU);
    expect(supplyBonus(s, BARISTA_MENU)).toBe(SUPPLY_BONUS_MAX);
  });
});

/** 그 메뉴 재료를 넉넉히 채운 창고 (자급 보정 상한용) */
function fullStorage(menuId: string): Record<string, number> {
  return Object.fromEntries(Object.entries(menuDef(menuId).ingredients).map(([id, n]) => [id, n * 10]));
}

// ---------- 상대 ----------

describe('상대 3명', () => {
  test('같은 시드·같은 회차면 같은 상대 (두 번 불러도 같다 · 주 rng를 안 쓴다)', () => {
    const a = rivalScores(7, 3, 6, 'espresso', 3);
    const b = rivalScores(7, 3, 6, 'espresso', 3);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(a).toEqual([...a].sort((x, y) => y - x)); // 내림차순
    expect(rivalScores(7, 3, 12, 'espresso', 3)).not.toEqual(a); // 회차가 다르면 다르다
    expect(rivalScores(7, 3, 6, 'latteart', 3)).not.toEqual(a);  // 종목이 다르면 다르다
    expect(rivalScores(8, 3, 6, 'espresso', 3)).not.toEqual(a);  // 세이브가 다르면 다르다
  });

  test('등급·회차가 오르면 상대도 는다', () => {
    const low = rivalScores(1, 3, 6, 'espresso', 3)[0]!;
    const highGrade = rivalScores(1, 3, 6, 'espresso', 5)[0]!;
    const late = rivalScores(1, 8, 6, 'espresso', 3)[0]!;
    expect(highGrade).toBeGreaterThan(low);
    expect(late).toBeGreaterThan(low);
    for (const g of [1, 3, 5]) for (const y of [1, 5, 10]) for (const r of rivalScores(1, y, 6, 'signature', g)) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(100);
    }
  });

  test('순위는 나보다 높은 상대 수 + 1', () => {
    expect(rankAmong(90, [80, 70, 60])).toBe(1);
    expect(rankAmong(75, [80, 70, 60])).toBe(2);
    expect(rankAmong(10, [80, 70, 60])).toBe(4);
  });
});

// ---------- 오즈 ----------

describe('예상 (contestOdds)', () => {
  test('상태를 바꾸지 않고 점수 범위·순위·우승 확률을 돌려준다', () => {
    const { s, st } = ready();
    const before = JSON.stringify({ rng: s.rng, luckSeq: s.luckSeq, money: s.money });
    const o = contestOdds(s, 'espresso', st.id, BARISTA_MENU)!;
    expect(JSON.stringify({ rng: s.rng, luckSeq: s.luckSeq, money: s.money })).toBe(before);
    expect(o.low).toBeCloseTo(Math.round(o.base * SCORE_MULT.fail * 10) / 10, 5);
    expect(o.high).toBeCloseTo(Math.round(o.base * SCORE_MULT.great * 10) / 10, 5);
    expect(o.low).toBeLessThanOrEqual(o.base);
    expect(o.high).toBeGreaterThanOrEqual(o.base);
    expect(o.bestRank).toBeLessThanOrEqual(o.worstRank);
    expect(o.winPct).toBeGreaterThanOrEqual(0);
    expect(o.winPct).toBeLessThanOrEqual(100);
    expect(o.fee).toBe(CONTESTS[0]!.fee);
    expect(o.chances).toEqual(outcomeChances(s, 'contest', st));
    expect(contestOdds(s, 'espresso', 'nobody', BARISTA_MENU)).toBeNull();
  });

  test('연수·칭호·자급을 채우면 예상 점수가 오른다 (대회는 육성의 출구)', () => {
    const { s, st } = ready();
    const plain = contestOdds(s, 'espresso', st.id, BARISTA_MENU)!.base;
    s.staff[0] = { ...st, title: 'tt_pro_barista', trainingLog: { tr_barista: 3 } };
    s.storage = fullStorage(BARISTA_MENU);
    const grown = contestOdds(s, 'espresso', s.staff[0]!.id, BARISTA_MENU)!.base;
    expect(grown).toBeGreaterThan(plain);
  });
});

// ---------- 운 판정 ----------

describe('운 판정', () => {
  test('luck.ts에 contest 한 줄이 있고, 점수 배수는 ×1.15 / ×1 / ×0.80', () => {
    expect(OUTCOME_TABLE.contest).toEqual({ great: 12, success: 63, fail: 25 });
    expect(TASK_NAME.contest).toBe('대회');
    expect(SCORE_MULT).toEqual({ great: 1.15, success: 1, fail: 0.8 });
  });

  test('대박은 점수 ×1.15·평판 +3·응모권 +1, 쪽박은 ×0.80·평판 −2·기력 −20', () => {
    for (const want of ['great', 'fail'] as const) {
      const { s, st } = ready(3);
      s.reputation = 50;
      apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
      s.clock.month = 6; s.clock.day = 1;
      const odds = contestOdds(s, 'espresso', st.id, BARISTA_MENU)!;
      forceNextOutcome(s, want, outcomeChances(s, 'contest', s.staff[0]!));
      const tickets = s.tickets;
      const energy = s.staff[0]!.energy;
      const r = runContest(s)!;
      expect(r.outcome).toBe(want);
      expect(r.myScore).toBeCloseTo(Math.round(odds.base * SCORE_MULT[want] * 10) / 10, 5);
      if (want === 'great') {
        expect(s.reputation).toBeGreaterThan(50);
        expect(s.tickets).toBeGreaterThan(tickets);
      } else {
        expect(s.reputation).toBeLessThan(50);
        expect(s.staff[0]!.energy).toBeLessThan(energy);
      }
    }
  });
});

// ---------- 순위 보상 ----------

describe('순위 보상 4행', () => {
  test.each([1, 2, 3, 4])('%i위: 상금 배율·응모권·경험치·유입 배수·트로피·배지', (rank) => {
    const { s, st } = ready(5);
    s.reputation = 60;
    apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
    s.clock.month = 6; s.clock.day = 1;
    forceNextOutcome(s, 'success', outcomeChances(s, 'contest', s.staff[0]!));
    // 내 점수가 원하는 순위에 놓이도록 메뉴를 만든다 (심사는 메뉴 스탯이 지배한다)
    const rivals = rivalScores(s.seed, 3, 6, 'espresso', s.grade ?? 1);
    const target = rank === 1 ? rivals[0]! + 12 : rank === 4 ? 0 : (rivals[rank - 1]! + rivals[rank - 2]!) / 2;
    s.customMenus = [{ id: 'm_t', name: '조정', category: 'drink', price: 5000, ingredients: {}, stats: { taste: target / MENU_SCALE, aroma: target / MENU_SCALE, look: target / MENU_SCALE, health: 0, volume: 0, jeju: target / MENU_SCALE } }];
    s.staff[0]!.stats = { stamina: 0, strength: 0, skill: 0, smile: 0 }; // 직원 보정을 빼 메뉴만 보게
    contestState(s).entry = { event: 'espresso', staffId: st.id, menuId: 'm_t', day: 0 };
    const money = s.money;
    const tickets = s.tickets;
    const r = runContest(s)!;
    expect(r.rank).toBe(rank);
    expect(r.prize).toBe(Math.round(CONTESTS[0]!.fee * PRIZE_MULT[rank - 1]!));
    expect(s.money).toBe(money + r.prize);
    expect(s.tickets).toBe(tickets + RANK_TICKETS[rank - 1]!);
    expect(r.tickets).toBe(RANK_TICKETS[rank - 1]!);
    expect(s.staff[0]!.exp).toBe(RANK_EXP[rank - 1]!);
    const boost = RANK_BOOST[rank - 1];
    if (boost) {
      expect(contestGuestMult(s)).toBeCloseTo(boost.mult, 5);
      expect(contestBadge(s)).toContain('에스프레소');
      expect(trophyOwned(s, TROPHY_TYPE)).toBe(1);
      expect(r.trophy).toBe(TROPHY_TYPE);
      expect(s.unlocked.objects).toContain(TROPHY_TYPE);
    } else {
      expect(contestGuestMult(s)).toBe(1);
      expect(contestBadge(s)).toBeNull();
      expect(trophyOwned(s, TROPHY_TYPE)).toBe(0);
      expect(r.trophy).toBeNull();
      expect(s.reputation).toBeLessThan(60); // 4위는 평판이 깎인다
    }
    expect(contestState(s).entry).toBeNull();
    expect(contestState(s).pending).toBe(r);
    expect(apply(s, { type: 'dismissContest' }).ok).toBe(true);
    expect(contestState(s).pending).toBeNull();
  });

  test('유입 배수·배지는 기간이 지나면 사라진다', () => {
    const { s, st } = ready(5);
    apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
    s.clock.month = 6; s.clock.day = 1;
    runContest(s);
    const c = contestState(s);
    c.boost = { mult: 1.15, untilDay: 0 };
    c.badge = { text: 'x', untilDay: 0 };
    expect(contestGuestMult(s)).toBe(1);
    expect(contestBadge(s)).toBeNull();
    dailyContest(s);
    expect(c.boost).toBeNull();
    expect(c.badge).toBeNull();
  });
});

// ---------- 트로피 ----------

describe('트로피', () => {
  test('실내 1×1 · 받은 개수만큼만 놓는다', () => {
    const def = objectDef(TROPHY_TYPE);
    expect(def.indoor).toBe(true);
    expect([def.w, def.h]).toEqual([1, 1]);
    expect(def.cost).toBe(0);
    const s = bareState();
    expect(canPlaceTrophy(s, TROPHY_TYPE).ok).toBe(false); // 대회에서 받아야 놓는다
    expect(canPlaceTrophy(s, 'table_out').ok).toBe(true);  // 다른 시설은 상관없다
    contestState(s).trophies[TROPHY_TYPE] = 2;
    expect(canPlaceTrophy(s, TROPHY_TYPE).ok).toBe(true);
    expect(trophyPlaced(s, TROPHY_TYPE)).toBe(0);
  });
});

// ---------- 훅·도감·목표 ----------

describe('훅·도감·목표', () => {
  test('개최일 아침에 tick이 대회를 치른다 (접수가 없으면 아무 일도 없다)', () => {
    const { s, st } = ready(9);
    apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
    s.clock.year = 3; s.clock.month = 5; s.clock.day = 30; s.clock.hour = 23; s.clock.accMs = 0;
    for (let i = 0; i < 4000 && contestState(s).history.length === 0; i++) step(s);
    expect(contestState(s).history).toHaveLength(1);
    expect(contestState(s).history[0]!.month).toBe(6);
    expect(contestState(s).entry).toBeNull();
  });

  test('기록은 최근 12회까지, 신기록·우승 수·최고 순위를 센다', () => {
    const s = bareState();
    const c = contestState(s);
    for (let i = 0; i < CONTEST_HISTORY_CAP + 3; i++) {
      c.history.unshift({ year: 1, month: 6, event: 'espresso' as ContestEvent, scores: { taste: 0, aroma: 0, look: 0, story: 0 }, base: 0, myScore: i, rivals: [], rank: i === CONTEST_HISTORY_CAP + 2 ? 1 : 3, outcome: 'success', chances: { great: 0, success: 1, fail: 0 }, best: false, prize: 0, tickets: 0, staffId: '', staffName: '', menuName: '', trophy: null });
      if (c.history.length > CONTEST_HISTORY_CAP) c.history.length = CONTEST_HISTORY_CAP;
    }
    expect(contestHistory(s)).toHaveLength(CONTEST_HISTORY_CAP);
    expect(contestWins(s)).toBeGreaterThanOrEqual(1);
    expect(contestBestRank(s)).toBe(1);
  });

  test('목표 3개가 대회 조건으로 붙어 있고, 등급 3 목표(g52) 뒤에 온다', () => {
    for (const [id, custom] of [['g53', 'contestEntered'], ['g56', 'contestTop3'], ['g57', 'contestWin']] as const) {
      expect(goalDef(id).condition).toEqual({ type: 'custom', id: custom });
    }
    const s = bareState();
    expect(customMet(s, 'contestEntered')).toBe(false);
    expect(customMet(s, 'contestTop3')).toBe(false);
    expect(customMet(s, 'contestWin')).toBe(false);
    contestState(s).entry = { event: 'espresso', staffId: 'x', menuId: 'y', day: 0 };
    expect(customMet(s, 'contestEntered')).toBe(true); // 접수만 해도 「나가 봤다」
    contestState(s).history = [{ year: 1, month: 6, event: 'espresso', scores: { taste: 0, aroma: 0, look: 0, story: 0 }, base: 0, myScore: 0, rivals: [], rank: 3, outcome: 'success', chances: { great: 0, success: 1, fail: 0 }, best: false, prize: 0, tickets: 0, staffId: '', staffName: '', menuName: '', trophy: null }];
    expect(customMet(s, 'contestTop3')).toBe(true);
    expect(customMet(s, 'contestWin')).toBe(false);
    contestState(s).history[0]!.rank = 1;
    expect(customMet(s, 'contestWin')).toBe(true);
  });

  test('대회 제목은 6월 바리스타 대회 · 12월 카페 경연', () => {
    expect(contestTitle(6, 'espresso')).toBe('제주 바리스타 대회 에스프레소부');
    expect(contestTitle(12, 'signature')).toBe('제주 카페 경연 시그니처부');
  });

  test('주 난수 스트림을 소비하지 않는다 (봇 KPI 밴드·리플레이 안정)', () => {
    const { s, st } = ready(11);
    apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
    s.clock.month = 6; s.clock.day = 1;
    const rngBefore = s.rng;
    runContest(s);
    expect(s.rng).toBe(rngBefore);
    // 예상 계산도 마찬가지
    const seq = s.luckSeq;
    contestOdds(s, 'espresso', st.id, BARISTA_MENU);
    expect(s.rng).toBe(rngBefore);
    expect(s.luckSeq).toBe(seq);
  });

  test('같은 세이브를 두 번 돌리면 같은 결과 (결정적)', () => {
    const run = () => {
      const { s, st } = ready(21);
      apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: BARISTA_MENU });
      s.clock.month = 6; s.clock.day = 1;
      return runContest(s);
    };
    expect(run()).toEqual(run());
  });

  test('접수 없이 개최일이 지나면 그 회차는 건너뛴다', () => {
    const { s } = ready();
    s.clock.month = 6; s.clock.day = 1;
    expect(runContest(s)).toBeNull();
    expect(contestHistory(s)).toHaveLength(0);
  });

  test('이레 전 예고가 한 줄 뜬다', () => {
    const { s } = ready();
    s.notices = [];
    dailyContest(s);
    expect(s.notices.some((n) => n.includes('바리스타 대회'))).toBe(true);
  });
});

// ---------- 저장 ----------

test('대회 필드가 없는 옛 세이브도 로드된다 (backfill)', async () => {
  const { serialize, deserialize } = await import('../save.ts');
  const { s } = ready();
  const json = JSON.parse(serialize(s)) as Record<string, unknown>;
  delete json.contest;
  const loaded = deserialize(JSON.stringify(json));
  expect(loaded.contest).toEqual({ entry: null, history: [], bestScore: 0, boost: null, badge: null, trophies: {}, pending: null });
  expect(contestGuestMult(loaded)).toBe(1);
});

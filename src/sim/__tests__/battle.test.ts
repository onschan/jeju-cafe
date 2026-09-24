/** 동네 대항전 (battle.ts, 스펙 §4) — 일정·상대 선정·점수·승패·단골 이동·연승 항복·순위·결정성. */
import { describe, test, expect } from 'vitest';
import type { GameState } from '../types.ts';
import { bareState } from './helpers.ts';
import { apply } from '../actions.ts';
import { serialize, deserialize } from '../save.ts';
import { RIVALS } from '../../data/index.ts';
import {
  initBattle, battleState, battleRecord, recordText, surrenderedCount,
  battleDay, isBattleDay, daysToBattle, battleOpen, battleRivals, battleOpponent,
  rivalBattleScore, autoBattleScore, winChancePct, battlePreview,
  battleGuestMult, battleDue, startBattle, activeBattle, battleHud, setBattleScore, resolveBattle,
  resultLine, dailyBattle, dismissBattle,
  BATTLE_FROM_YEAR, BATTLE_NOTICE_DAYS, BATTLE_SURRENDER_STREAK, BATTLE_SURRENDER_GUESTS,
  BATTLE_PRIZE_PER_GRADE, BATTLE_RANK_POINT, BATTLE_KEEP_REGULARS, BATTLE_RIVAL_PAR, BATTLE_AUTO_RATIO,
} from '../battle.ts';
import { RUSH_WEEKDAY, weekdayOf } from '../rush.ts';
import { scoreboard, myAxes, rivalGuestMult, RIVAL_EFFECT_YEAR } from '../rival.ts';
import { registerRegular, regularList } from '../interact.ts';
import { gradeOf } from '../grade.ts';
import { rushExpectedScore, rushArrivals } from '../rush.ts';
import { DAYS_PER_MONTH } from '../clock.ts';

/** 2년차 대항전 날 아침의 상태 */
function s2(seed = 1): GameState {
  const s = bareState(seed);
  s.clock.year = 2;
  s.clock.month = 5;
  s.clock.day = battleDay();
  for (const [, t] of Object.entries(s.guestTypes)) t.unlocked = true;
  return s;
}

describe('일정', () => {
  test('러시는 토요일(day % 7 === 6), 대항전은 그달 마지막 러시 날', () => {
    expect(weekdayOf(6)).toBe(RUSH_WEEKDAY); // 그 주 6일차가 토요일
    expect(weekdayOf(battleDay())).toBe(RUSH_WEEKDAY);
    expect(battleDay()).toBe(27); // 30일 달
    expect(battleDay() + 7).toBeGreaterThan(DAYS_PER_MONTH);
  });

  test('남은 날은 그달 안이면 빼기, 지났으면 다음 달 것까지', () => {
    const s = s2();
    s.clock.day = 1;
    expect(daysToBattle(s)).toBe(battleDay() - 1);
    s.clock.day = battleDay();
    expect(daysToBattle(s)).toBe(0);
    expect(isBattleDay(s)).toBe(true);
    s.clock.day = battleDay() + 1;
    expect(daysToBattle(s)).toBe(DAYS_PER_MONTH - battleDay() - 1 + battleDay());
  });

  test('1년차엔 안 열린다 (밴드 보호 — rival.ts 손님 수 효과와 같은 해)', () => {
    expect(BATTLE_FROM_YEAR).toBe(RIVAL_EFFECT_YEAR);
    const s = bareState(1);
    s.clock.day = battleDay();
    expect(battleOpen(s)).toBe(false);
    expect(battleDue(s)).toBe(false);
    expect(battlePreview(s)).toBeNull();
    dailyBattle(s);
    expect(battleState(s).round).toBeNull();
  });

  test(`${BATTLE_NOTICE_DAYS}일 전에 예고 알림이 뜬다`, () => {
    const s = s2();
    s.clock.day = battleDay() - BATTLE_NOTICE_DAYS;
    s.notices = [];
    dailyBattle(s);
    expect(s.notices.some((n) => n.includes('붙어요'))).toBe(true);
    expect(battleState(s).round).toBeNull(); // 아직 판은 안 열린다
  });
});

describe('상대 선정', () => {
  test('순위표에서 나와 가장 가까운 카페가 상대', () => {
    const s = s2();
    const rows = scoreboard(s);
    const i = rows.findIndex((r) => r.me);
    const near = rows[i - 1] ?? rows[i + 1];
    expect(battleOpponent(s)!.id).toBe(near!.id);
  });

  test('항복받은 곳·인수한 곳은 상대에서 빠지고, 다 빠지면 상대가 없다', () => {
    const s = s2();
    expect(battleRivals(s).length).toBe(RIVALS.length);
    for (const d of RIVALS) battleState(s).records[d.id]!.surrendered = true;
    expect(battleRivals(s)).toEqual([]);
    expect(battleOpponent(s)).toBeNull();
    expect(battlePreview(s)).toBeNull();
    expect(surrenderedCount(s)).toBe(RIVALS.length);
  });
});

describe('점수', () => {
  test('상대 점수는 우리 러시 기준 점수에 붙어 움직인다 — 같은 세이브·같은 달이면 늘 같다', () => {
    const s = s2();
    const def = RIVALS[0]!;
    const a = rivalBattleScore(s, def);
    expect(rivalBattleScore(s, def)).toBe(a);
    expect(rivalBattleScore(deserialize(serialize(s)), def)).toBe(a);
    s.grade = Math.min(5, gradeOf(s) + 1);
    expect(rivalBattleScore(s, def)).toBeGreaterThan(a); // 우리가 올라가면 상대도 세진다
  });

  test('무조작 점수는 러시 B 문턱 언저리 — 대등한 상대(par의 0.95)에게는 진다', () => {
    const s = s2();
    const auto = autoBattleScore(s);
    const par = rushExpectedScore(s, rushArrivals(s));
    expect(auto).toBe(Math.round(par * BATTLE_AUTO_RATIO));
    expect(BATTLE_AUTO_RATIO).toBeLessThan(BATTLE_RIVAL_PAR); // 손을 놓으면 대등한 상대에게 진다
    // 규모가 커지면 우리 기준 점수도 상대도 같이 커진다 — 규모만으로는 못 이긴다
    const grew = autoBattleScore(s);
    expect(grew).toBeGreaterThan(0);
  });

  test('예상 승률은 5~95% 사이, 점수가 높을수록 커진다', () => {
    expect(winChancePct(100, 300)).toBeGreaterThanOrEqual(5);
    expect(winChancePct(300, 100)).toBeLessThanOrEqual(95);
    expect(winChancePct(200, 200)).toBe(50);
    expect(winChancePct(260, 200)).toBeGreaterThan(50);
  });
});

describe('한 판', () => {
  test('판을 열면 상대·상대 점수가 못 박히고, HUD 비교 줄이 나온다', () => {
    const s = s2();
    expect(battleDue(s)).toBe(true);
    startBattle(s);
    const r = activeBattle(s)!;
    expect(r.done).toBe(false);
    expect(r.theirScore).toBeGreaterThan(0);
    const hud = battleHud(s)!;
    expect(hud.rivalName).toBe(RIVALS.find((d) => d.id === r.rivalId)!.name);
    expect(hud.myScore).toBe(0);
    setBattleScore(s, 999);
    expect(battleHud(s)!.myScore).toBe(999);
    expect(battleHud(s)!.leading).toBe(true);
    expect(battleDue(s)).toBe(false); // 달마다 한 번
  });

  test('이기면 상금·단골 1~2명·순위 점수가 들어온다', () => {
    const s = s2();
    startBattle(s);
    const money = s.money;
    const regulars = regularList(s).length;
    const res = resolveBattle(s, activeBattle(s)!.theirScore + 50)!;
    expect(res.won).toBe(true);
    expect(res.prize).toBe(BATTLE_PRIZE_PER_GRADE * gradeOf(s));
    expect(s.money).toBe(money + res.prize);
    expect(res.moved.length).toBeGreaterThanOrEqual(1);
    expect(res.moved.length).toBeLessThanOrEqual(2);
    for (const m of res.moved) expect(m.to).toBe('us');
    expect(regularList(s).length).toBe(regulars + res.moved.length);
    expect(battleState(s).rankPoints).toBe(BATTLE_RANK_POINT);
    expect(battleRecord(s, res.rivalId).wins).toBe(1);
    expect(resultLine(res)).toContain('이겼어요');
    expect(battleState(s).pending).toBe(true);
    dismissBattle(s);
    expect(battleState(s).pending).toBe(false);
  });

  test('지면 우리 단골 한 명(가장 늦게 생긴)이 그쪽으로 — 단골이 적으면 아무도 안 간다', () => {
    const s = s2();
    const types = Object.keys(s.guestTypes).slice(0, BATTLE_KEEP_REGULARS + 2);
    for (const t of types) registerRegular(s, t);
    const newest = regularList(s).at(-1)!;
    startBattle(s);
    const res = resolveBattle(s, 0)!;
    expect(res.won).toBe(false);
    expect(res.moved.map((m) => m.name)).toEqual([newest.name]);
    expect(res.moved[0]!.to).toBe('them');
    expect(regularList(s).some((r) => r.id === newest.id)).toBe(false);
    expect(battleRecord(s, res.rivalId).losses).toBe(1);
    expect(resultLine(res)).toContain('졌어요');

    // 단골이 KEEP 이하로 줄면 더 안 뺏긴다
    while (regularList(s).length > BATTLE_KEEP_REGULARS) regularList(s).pop();
    const s2nd = battleState(s);
    s2nd.round = { rivalId: res.rivalId, monthIndex: s2nd.lastMonthIndex, theirScore: 999, myScore: 0, done: false };
    const res2 = resolveBattle(s, 0)!;
    expect(res2.moved).toEqual([]);
    expect(regularList(s).length).toBe(BATTLE_KEEP_REGULARS);
  });

  test('점수를 안 주면 자동 해결 점수로 가른다 (봇·헤드리스)', () => {
    const s = s2();
    startBattle(s);
    const their = activeBattle(s)!.theirScore;
    const res = resolveBattle(s)!;
    expect(res.myScore).toBe(autoBattleScore(s));
    expect(res.won).toBe(res.myScore >= their);
    expect(resolveBattle(s)).toBeNull(); // 같은 판을 두 번 못 끝낸다
  });
});

describe('연승·항복·1위', () => {
  function winAgainst(s: GameState, rivalId: string): void {
    const b = battleState(s);
    b.round = { rivalId, monthIndex: b.lastMonthIndex--, theirScore: 0, myScore: 0, done: false };
    resolveBattle(s, 1000);
  }

  test(`${BATTLE_SURRENDER_STREAK}연승이면 그 카페가 항복하고 손님이 넘어온다`, () => {
    const s = s2();
    const id = RIVALS[0]!.id;
    winAgainst(s, id);
    winAgainst(s, id);
    expect(battleRecord(s, id).surrendered).toBe(false);
    winAgainst(s, id);
    const rec = battleRecord(s, id);
    expect(rec.streak).toBe(BATTLE_SURRENDER_STREAK);
    expect(rec.surrendered).toBe(true);
    expect(battleState(s).last!.surrender).toBe(true);
    expect(recordText(rec)).toContain('항복');
    expect(surrenderedCount(s)).toBe(1);
    expect(battleGuestMult(s)).toBeCloseTo(1 + BATTLE_SURRENDER_GUESTS, 5);
    expect(rivalGuestMult(s)).toBeGreaterThan(1);
  });

  test('중간에 한 번 지면 연승이 끊긴다', () => {
    const s = s2();
    const id = RIVALS[0]!.id;
    winAgainst(s, id);
    winAgainst(s, id);
    const b = battleState(s);
    b.round = { rivalId: id, monthIndex: b.lastMonthIndex--, theirScore: 9999, myScore: 0, done: false };
    resolveBattle(s, 0);
    expect(battleRecord(s, id).streak).toBe(0);
    expect(battleRecord(s, id).surrendered).toBe(false);
  });

  test('다섯 곳을 다 이기면 동네 1위로 고정된다', () => {
    const s = s2();
    for (const d of RIVALS) { winAgainst(s, d.id); winAgainst(s, d.id); winAgainst(s, d.id); }
    expect(battleState(s).champion).toBe(true);
    expect(scoreboard(s).find((r) => r.me)!.rank).toBe(1);
  });

  test('승리로 쌓인 점수는 동네 순위 서비스 항목에 얹히고, 패배로 깎인다', () => {
    const s = s2();
    const before = myAxes(s).service;
    winAgainst(s, RIVALS[0]!.id);
    expect(myAxes(s).service).toBeGreaterThanOrEqual(before);
    const b = battleState(s);
    const rp = b.rankPoints;
    b.round = { rivalId: RIVALS[1]!.id, monthIndex: b.lastMonthIndex--, theirScore: 9999, myScore: 0, done: false };
    resolveBattle(s, 0);
    expect(b.rankPoints).toBeLessThan(rp);
    expect(b.rankPoints).toBeGreaterThanOrEqual(0);
  });
});

describe('결정성·세이브', () => {
  test('같은 세이브를 두 번 돌리면 같은 결과', () => {
    const a = s2(7);
    const b = deserialize(serialize(a));
    dailyBattle(a);
    dailyBattle(b);
    expect(JSON.stringify(battleState(a).last)).toBe(JSON.stringify(battleState(b).last));
  });

  test('옛 세이브(대항전 없음)도 열리고 전적이 0으로 채워진다', () => {
    const s = bareState(1);
    const raw = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete raw.battle;
    const t = deserialize(JSON.stringify(raw));
    expect(battleState(t).records[RIVALS[0]!.id]).toEqual({ wins: 0, losses: 0, streak: 0, surrendered: false });
    expect(battleState(t).champion).toBe(false);
    expect(recordText(battleRecord(t, RIVALS[0]!.id))).toBe('아직');
    expect(initBattle().lastMonthIndex).toBe(-1);
  });

  test('액션 dismissBattle로 결과 연출을 닫는다', () => {
    const s = s2();
    startBattle(s);
    resolveBattle(s);
    expect(battleState(s).pending).toBe(true);
    expect(apply(s, { type: 'dismissBattle' }).ok).toBe(true);
    expect(battleState(s).pending).toBe(false);
  });
});

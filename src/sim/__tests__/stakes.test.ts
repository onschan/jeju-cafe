/**
 * stakes: 긴장감(잃을 것)·트레이드오프·결과 피드백·변수.
 * 고정비·비수기·돌발 5종 선택지 결과·평판 문턱·정원/슬롯 제한·월말 등급 공식·유행 배수 + 결정성.
 */
import { createInitialState, START_MONEY, MENU_SLOT_COUNT, MENU_SLOT_MAX } from '../state.ts';
import { apply } from '../actions.ts';
import { step } from '../tick.ts';
import {
  RENT_PER_PARCEL, rentOf, rent, loanDue, LOAN_DUE_MONTHS, LOAN_OVERDUE_REPUTATION,
  gradeMonth, gradeOfScore, GRADE_S, GRADE_A, GRADE_B, coachAdvice, emptyMonthCosts, totalCosts, closeMonth,
} from '../economy.ts';
import {
  RISKS, riskDef, riskDayOf, monthlyRisk, dailyRisk, resolveRisk, breakdownTarget, breakdownRepairCost,
  GROUP_SEATS, GROUP_REWARD, GROUP_FAIL_REPUTATION, BREAKDOWN_STOP_DAYS, isStopped,
} from '../risk.ts';
import { TREND_CATEGORIES, TREND_MULT, trendCategoryOf, trendMenuMult, rollTrend, eventChoiceDef, resolveEventChoice, EVENT_CHOICES } from '../events.ts';
import { REP_REGULAR_SLOW, regularVisitEveryOtherWeek, shrinkingWarning, REP_LOW } from '../reputation.ts';
import { SEASON_GUEST_MULT, seasonGuestMult, totalSeats } from '../guests.ts';
import { BASE_STAFF_SLOTS, SLOTS_PER_STAFF_ROOM, staffCapacity } from '../staff.ts';
import { START_BUILDERS, MAX_BUILDERS } from '../build.ts';
import { grantReward } from '../goals.ts';
import { noGuestsToday } from '../effects.ts';
import { GOALS } from '../../data/index.ts';
import { runBot } from '../bot.ts';

function fresh() {
  return createInitialState(1);
}
/** 돌발 사고 하나를 지금 띄운다 (rng 없이 — 결과만 본다) */
function pend(s: ReturnType<typeof fresh>, id: string) {
  s.pendingRisk = { id, day: 0 };
  return s;
}

describe('A. 잃을 것 — 월 고정비', () => {
  it('임대료는 소유 필지당 ₩8만/월이고 월 비용 rent 칸에 쌓인다', () => {
    const s = fresh();
    const owned = s.parcels.filter((p) => p.owned).length;
    expect(owned).toBeGreaterThan(0);
    expect(rentOf(s)).toBe(owned * RENT_PER_PARCEL);
    const before = s.money;
    expect(rent(s)).toBe(owned * RENT_PER_PARCEL);
    expect(s.money).toBe(before - owned * RENT_PER_PARCEL);
    expect(s.monthCosts.rent).toBe(owned * RENT_PER_PARCEL);
  });

  it('임대료는 월 비용 합에 들어간다', () => {
    const c = { ...emptyMonthCosts(), rent: 160_000 };
    expect(totalCosts(c)).toBe(160_000);
    expect(totalCosts({ ...emptyMonthCosts(), rent: undefined })).toBe(0); // 옛 세이브(rent 없음)도 0
  });

  it('삼춘 대출은 12개월 안에 갚아야 하고, 넘기면 평판 −5 + 기한이 다시 12개월 늘어난다', () => {
    const s = fresh();
    s.loan.balance = 3_000_000;
    s.loan.dueMonthIndex = 5;
    const rep = s.reputation;
    // 기한 전에는 아무 일도 없다
    expect(loanDue(s)).toBe(0);
    s.clock.year = 1; s.clock.month = 6; // monthIndex 5
    expect(loanDue(s)).toBe(LOAN_OVERDUE_REPUTATION);
    expect(s.reputation).toBe(rep + LOAN_OVERDUE_REPUTATION);
    expect(s.loan.dueMonthIndex).toBe(5 + LOAN_DUE_MONTHS);
    expect(s.loan.overdueCount).toBe(1);
    // 다 갚으면 더는 안 걸린다
    s.loan.balance = 0;
    expect(loanDue(s)).toBe(0);
  });
});

describe('A. 잃을 것 — 비수기', () => {
  it('12·1·2월 손님은 ×0.7, 성수기(7·8월)는 ×1.15', () => {
    for (const m of [12, 1, 2]) expect(seasonGuestMult(m)).toBe(0.7);
    expect(seasonGuestMult(7)).toBe(1.15);
    expect(seasonGuestMult(8)).toBe(1.15);
    expect(SEASON_GUEST_MULT[12]).toBeLessThan(SEASON_GUEST_MULT[11]!);
  });
});

describe('A. 잃을 것 — 돌발 사고 5종', () => {
  it('매월 1일 25%로 한 건을 예약하고, 발동일은 달 안(4~25일)에 퍼진다', () => {
    for (let mi = 0; mi < 40; mi++) {
      const d = riskDayOf(mi);
      expect(d).toBeGreaterThanOrEqual(4);
      expect(d).toBeLessThanOrEqual(25);
    }
    // 같은 seed·같은 달이면 같은 결과 (결정적)
    const a = fresh(); const b = fresh();
    expect(monthlyRisk(a)).toBe(monthlyRisk(b));
    expect(a.riskDay).toBe(b.riskDay);
  });

  it('예정일이 오면 대화창 알림이 뜨고, 답이 없으면 다음 날 0번(손해)으로 확정된다', () => {
    const s = fresh();
    s.riskId = 'blackout';
    s.riskDay = s.clock.day;
    expect(dailyRisk(s)).toBe('blackout');
    expect(s.pendingRisk?.id).toBe('blackout');
    expect(s.alerts.at(-1)).toEqual({ type: 'risk', id: 'blackout' });
    s.clock.day += 1; // 다음 날
    dailyRisk(s);
    expect(s.pendingRisk).toBeNull();
    expect(noGuestsToday(s)).toBe(true); // 0번 = 그날 매출 0
  });

  it('정전: 그냥 쉬면 그날 매출 0, ₩30만을 내면 문을 연다', () => {
    const a = pend(fresh(), 'blackout');
    resolveRisk(a, 0);
    expect(noGuestsToday(a)).toBe(true);
    const b = pend(fresh(), 'blackout');
    const money = b.money;
    resolveRisk(b, 1);
    expect(noGuestsToday(b)).toBe(false);
    expect(b.money).toBe(money - 300_000);
  });

  it('재료 상함: 그냥 두면 창고 재료가 절반, ₩20만을 내면 그대로', () => {
    const a = pend(fresh(), 'spoiled');
    a.storage = { beans: 10, milk: 7 };
    resolveRisk(a, 0);
    expect(a.storage).toEqual({ beans: 5, milk: 3 });
    const b = pend(fresh(), 'spoiled');
    b.storage = { beans: 10 };
    const money = b.money;
    resolveRisk(b, 1);
    expect(b.storage).toEqual({ beans: 10 });
    expect(b.money).toBe(money - 200_000);
  });

  it('직원 결근: 그냥 버티면 한 명 기력 0, ₩15만이면 대타', () => {
    const a = pend(fresh(), 'absent');
    a.staff = [{ ...stub('st1', 60) }, { ...stub('st2', 20) }] as never;
    resolveRisk(a, 0);
    expect((a.staff[1] as { energy: number }).energy).toBe(0); // 기력이 가장 낮은 사람
    expect((a.staff[0] as { energy: number }).energy).toBe(60);
    const b = pend(fresh(), 'absent');
    b.staff = [{ ...stub('st1', 60) }] as never;
    const money = b.money;
    resolveRisk(b, 1);
    expect((b.staff[0] as { energy: number }).energy).toBe(60);
    expect(b.money).toBe(money - 150_000);
  });

  it(`단체 예약: 자리 ${GROUP_SEATS}개 이상이면 ₩50만, 모자라면 평판 ${GROUP_FAIL_REPUTATION}. 사양하면 아무 일도 없다`, () => {
    const ok = pend(fresh(), 'group_booking');
    while (totalSeats(ok) < GROUP_SEATS) { // 좌석을 채운다
      const before = totalSeats(ok);
      const cell = freeCell(ok);
      if (!cell || !apply(ok, { type: 'place', objectType: 'table_out', x: cell.x, y: cell.y }).ok) break;
      if (totalSeats(ok) === before) break;
    }
    const money = ok.money;
    resolveRisk(ok, 0);
    expect(ok.money).toBe(money + GROUP_REWARD);

    const small = pend(fresh(), 'group_booking');
    small.objects = {}; // 자리를 다 치운다
    const rep = small.reputation;
    resolveRisk(small, 0);
    expect(small.reputation).toBe(rep + GROUP_FAIL_REPUTATION);

    const no = pend(fresh(), 'group_booking');
    const m2 = no.money; const r2 = no.reputation;
    resolveRisk(no, 1);
    expect(no.money).toBe(m2);
    expect(no.reputation).toBe(r2);
  });

  it('설비 고장: 세워 두면 며칠 멈추고(인기 0), 고치면 시설가의 10%', () => {
    const a = fresh();
    const target = breakdownTarget(a);
    expect(target).not.toBeNull();
    pend(a, 'breakdown').pendingRisk!.targetId = target!.id;
    resolveRisk(a, 0);
    expect(isStopped(a, a.objects[target!.id]!)).toBe(true);
    expect(a.objects[target!.id]!.stopped).toBeGreaterThan(0);

    const b = fresh();
    const t2 = breakdownTarget(b)!;
    const cost = breakdownRepairCost(b, t2);
    expect(cost).toBeGreaterThan(0);
    pend(b, 'breakdown').pendingRisk!.targetId = t2.id;
    const money = b.money;
    resolveRisk(b, 1);
    expect(b.money).toBe(money - cost);
    expect(isStopped(b, b.objects[t2.id]!)).toBe(false);
    expect(BREAKDOWN_STOP_DAYS).toBeGreaterThan(0);
  });

  it('사고 5종 모두 선택지가 2개고, 답할 것이 없으면 resolveRisk는 false', () => {
    expect(RISKS).toHaveLength(5);
    for (const d of RISKS) {
      expect(d.choices).toHaveLength(2);
      for (const c of d.choices) expect(c.label.length).toBeLessThanOrEqual(22);
      for (const l of d.lines) expect(l.length).toBeLessThanOrEqual(22);
      expect(riskDef(d.id)).toBe(d);
    }
    expect(resolveRisk(fresh(), 0)).toBe(false);
  });

  it('액션으로도 답할 수 있다 (UI 선택지 버튼)', () => {
    const s = pend(fresh(), 'blackout');
    expect(apply(s, { type: 'resolveRisk', choice: 1 }).ok).toBe(true);
    expect(s.pendingRisk).toBeNull();
    expect(apply(s, { type: 'resolveRisk', choice: 0 }).ok).toBe(false);
  });
});

describe('A. 잃을 것 — 평판 하락 체감', () => {
  it(`평판 < ${REP_REGULAR_SLOW}이면 단골이 2주에 한 번, ${REP_LOW} 아래면 경고 줄이 바뀐다`, () => {
    const s = fresh();
    s.reputation = 70;
    expect(regularVisitEveryOtherWeek(s)).toBe(false);
    expect(shrinkingWarning(s)).toBeNull();
    s.reputation = 45;
    expect(regularVisitEveryOtherWeek(s)).toBe(true);
    expect(shrinkingWarning(s)).toContain('손님이 줄고 있어요');
    s.reputation = 20;
    expect(shrinkingWarning(s)).toContain('관광객');
  });
});

describe('B. 트레이드오프 — 자원 4종', () => {
  it('시작 자금 350만 · 건축가 2(최대 5) · 직원 정원 3(휴게실당 +2) · 메뉴판 3칸(최대 6)', () => {
    const s = fresh();
    expect(START_MONEY).toBe(3_500_000);
    expect(s.money).toBe(3_500_000);
    expect(START_BUILDERS).toBe(2);
    expect(MAX_BUILDERS).toBe(5);
    expect(s.builders).toBe(2);
    expect(BASE_STAFF_SLOTS).toBe(3);
    expect(SLOTS_PER_STAFF_ROOM).toBe(2);
    expect(staffCapacity(s)).toBe(3);
    expect(MENU_SLOT_COUNT).toBe(3);
    expect(MENU_SLOT_MAX).toBe(6);
    expect(s.menuSlots).toHaveLength(3);
  });

  it('목표 보상 menuSlot으로 칸이 늘고 6칸에서 멈춘다', () => {
    const s = fresh();
    for (let i = 0; i < 10; i++) grantReward(s, { type: 'menuSlot', n: 1 });
    expect(s.menuSlots).toHaveLength(MENU_SLOT_MAX);
  });

  it('목표 사슬은 건축가 3회·메뉴판 칸 3회를 주어 2→5 · 3→6이 된다', () => {
    const builders = GOALS.flatMap((g) => g.reward).filter((r) => r.type === 'builder').reduce((n, r) => n + (r as { n: number }).n, 0);
    const slots = GOALS.flatMap((g) => g.reward).filter((r) => r.type === 'menuSlot').reduce((n, r) => n + (r as { n: number }).n, 0);
    expect(START_BUILDERS + builders).toBeGreaterThanOrEqual(MAX_BUILDERS);
    expect(MENU_SLOT_COUNT + slots).toBe(MENU_SLOT_MAX);
    // 「메뉴 4개 올리기」(g16)보다 먼저 4번째 칸이 열려야 한다
    const slotIdx = GOALS.findIndex((g) => g.reward.some((r) => r.type === 'menuSlot'));
    const menusIdx = GOALS.findIndex((g) => g.condition.type === 'menus');
    expect(slotIdx).toBeGreaterThanOrEqual(0);
    expect(slotIdx).toBeLessThan(menusIdx);
  });
});

describe('C. 결과 피드백 — 월말 평가 등급', () => {
  it('등급 문턱 S/A/B/C', () => {
    expect(gradeOfScore(100)).toBe('S');
    expect(gradeOfScore(GRADE_S)).toBe('S');
    expect(gradeOfScore(GRADE_S - 1)).toBe('A');
    expect(gradeOfScore(GRADE_A)).toBe('A');
    expect(gradeOfScore(GRADE_A - 1)).toBe('B');
    expect(gradeOfScore(GRADE_B)).toBe('B');
    expect(gradeOfScore(GRADE_B - 1)).toBe('C');
    expect(gradeOfScore(0)).toBe('C');
  });

  it('잘한 달은 S, 못한 달은 C가 되고 총평이 가장 낮은 항목을 짚는다', () => {
    const good = fresh();
    good.monthIncome = 10_000_000;
    good.monthGuests = 1_200;
    good.reputation = 90;
    good.monthComplaints = {};
    const g = gradeMonth(good, 5_000_000, 1_000);
    expect(g.grade).toBe('S');
    expect(g.items).toHaveLength(4);
    expect(g.score).toBe(g.items.reduce((a, b) => a + b.score, 0));
    expect(g.summary.length).toBeLessThanOrEqual(22);

    const bad = fresh();
    bad.monthIncome = 1_000_000;
    bad.monthGuests = 300;
    bad.reputation = 55;
    bad.monthComplaints = { no_seat: 120 }; // 불만이 가장 낮은 항목 → 총평은 자리 이야기
    const b = gradeMonth(bad, 100_000, 250);
    expect(b.grade).toBe('C');
    expect(b.items.find((i) => i.key === 'complaints')!.score).toBe(0);
    expect(b.summary).toBe('자리가 모자라 손님을 놓쳤어요');

    // 적자가 제일 아픈 달이면 총평이 돈 이야기로 바뀐다
    const poor = fresh();
    poor.monthIncome = 1_000_000;
    poor.monthGuests = 300;
    poor.reputation = 70;
    poor.monthComplaints = {};
    expect(gradeMonth(poor, -500_000, 280).summary).toBe('버는 것보다 나간 게 많아요');
  });

  it('월말 카드에 등급·지난달 등급·손님 증감·총평이 실리고, 3달 연속 C면 삼춘이 찾아온다', () => {
    const s = fresh();
    // 세 달 연속 C를 만든다
    for (let i = 0; i < 3; i++) {
      s.monthIncome = 100_000;
      s.monthGuests = 10;
      s.reputation = 10;
      s.monthComplaints = { no_seat: 20 };
      s.monthCosts = { ...emptyMonthCosts(), salary: 900_000 };
      closeMonthHelper(s, i + 3, 1);
      expect(s.lastMonthCard!.grade).toBe('C');
    }
    expect(s.lastMonthCard!.prevGrade).toBe('C');
    expect(s.lastMonthCard!.gradeSummary!.length).toBeGreaterThan(0);
    expect(s.alerts.some((a) => a.type === 'coach')).toBe(true);
    expect(coachAdvice(s).length).toBeLessThanOrEqual(22);
  });
});

describe('D. 변수 — 이번 달 유행 · 빅 이벤트 선택지', () => {
  it('유행은 4분류 중 하나고, 그 분류 메뉴는 주문 가중치 ×1.5', () => {
    const s = fresh();
    const c = rollTrend(s);
    expect(TREND_CATEGORIES).toContain(c);
    expect(s.trend!.category).toBe(c);
    expect(trendCategoryOf(s, 'americano')).toBe('coffee');
    expect(trendCategoryOf(s, 'tangerine_juice')).toBe('juice');
    s.trend = { monthIndex: 0, category: 'coffee' };
    expect(trendMenuMult(s, 'americano')).toBe(TREND_MULT);
    expect(trendMenuMult(s, 'tangerine_juice')).toBe(1);
    s.trend = null;
    expect(trendMenuMult(s, 'americano')).toBe(1);
  });

  it('같은 seed면 유행도 같다 (결정적)', () => {
    const a = fresh(); const b = fresh();
    expect(rollTrend(a)).toBe(rollTrend(b));
  });

  it('태풍은 「미리 대비」로 피해가 줄고, 촬영은 거절하면 이벤트가 안 일어난다', () => {
    const def = eventChoiceDef('ev_typhoon_aug')!;
    expect(def.options[0].repairMult).toBeLessThan(1);
    expect(def.options[1].repairMult).toBe(1);
    for (const [, d] of Object.entries(EVENT_CHOICES)) {
      expect(d.options).toHaveLength(2);
      for (const o of d.options) expect(o.label.length).toBeLessThanOrEqual(22);
      for (const l of d.lines) expect(l.length).toBeLessThanOrEqual(22);
    }
    const s = fresh();
    s.events = [{ id: 'ev_baek_shooting', startDay: 0, endsDay: 14, specialVisited: false }];
    s.pendingEventChoice = { id: 'ev_baek_shooting', day: 0 };
    expect(resolveEventChoice(s, 1)).toBe(true); // 거절
    expect(s.events).toHaveLength(0);

    const t = fresh();
    t.events = [{ id: 'ev_baek_shooting', startDay: 0, endsDay: 14, specialVisited: false }];
    t.pendingEventChoice = { id: 'ev_baek_shooting', day: 0 };
    const rep = t.reputation;
    expect(resolveEventChoice(t, 0)).toBe(true); // 수락 — 그날 영업 정지 + 평판 +10
    expect(t.reputation).toBe(rep + 10);
    expect(noGuestsToday(t)).toBe(true);
    expect(t.events).toHaveLength(1);
  });

  it('액션으로도 답할 수 있다', () => {
    const s = fresh();
    s.events = [{ id: 'ev_bad_review', startDay: 0, endsDay: 14, specialVisited: false }];
    s.pendingEventChoice = { id: 'ev_bad_review', day: 0 };
    expect(apply(s, { type: 'resolveEventChoice', choice: 0 }).ok).toBe(true);
    expect(apply(s, { type: 'resolveEventChoice', choice: 0 }).ok).toBe(false);
  });
});

describe('결정성', () => {
  it('같은 seed로 1년을 돌리면 자금·평판·유행이 같다', () => {
    const run = () => {
      const s = createInitialState(7);
      for (let i = 0; i < 12 * 30 * 18 * 20; i++) { step(s); if (s.clock.year > 1) break; }
      return { money: s.money, rep: s.reputation, trend: s.trend?.category, rng: s.rng };
    };
    expect(run()).toEqual(run());
  }, 60_000);

  it('봇 3년: 파산 없음 (최저 잔고 0 위)', () => {
    const rows = runBot(3, 1);
    expect(Math.min(...rows.map((r) => r.minMoney))).toBeGreaterThan(0);
  }, 60_000);
});

// ---------- 도우미 ----------

function stub(id: string, energy: number) {
  return { id, name: id, role: 'hall', energy, training: null, stats: {}, level: 1, salary: 0 };
}
function freeCell(s: ReturnType<typeof fresh>): { x: number; y: number } | null {
  const p = s.parcels.find((q) => q.owned)!;
  for (let ly = 0; ly < p.h; ly++)
    for (let lx = 0; lx < p.w; lx++) {
      const x = p.x + lx; const y = p.y + ly;
      const c = s.grid.cells[y * s.grid.w + x];
      if (c && !c.objectId && c.terrain === 'soil') return { x, y };
    }
  return null;
}
/** closeMonth를 직접 부른다 (tick 없이 등급만 본다) */
function closeMonthHelper(s: ReturnType<typeof fresh>, month: number, year: number) {
  closeMonth(s, month, year);
}

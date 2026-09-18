import { describe, it, expect } from 'vitest';
import { createInitialState, START_SEATS, START_PATH, START_MENUS, fillStarterLayout } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS, DAYS_PER_MONTH } from '../clock.ts';
import { STEPS, TUTORIAL_STEPS, currentTutorialStep, checkTutorial, tutorialDone, pathConnected, wallShelteringSeat, firstMonthClosed } from '../tutorial.ts';
import { canOpen, checkGoals } from '../goals.ts';
import { hire } from '../staff.ts';
import { openAllFeatures, at } from './helpers.ts';
import { TUTORIAL_STEPS as DIALOGUE } from '../../data/dialogue/index.ts';

/** §7.1 빈 마당에서 시작해 한 단계씩 손으로 한다 */
function tutorialState(seed = 1) {
  const s = createInitialState(seed, 'local', 0, 'tutorial');
  return s;
}
const PATH = [{ lx: 3, ly: 3 }, { lx: 4, ly: 3 }, { lx: 4, ly: 4 }, { lx: 4, ly: 5 }];
function lastReward(s: ReturnType<typeof tutorialState>) {
  return [...s.alerts].reverse().find((a) => a.type === 'reward' && a.source === 'tutorial');
}

describe('손으로 하는 튜토리얼 9단계 (§7.2)', () => {
  it('데이터: sim STEPS 9개와 dialogue/tutorial.json 9개가 key로 1:1이고, 완성 시작 상태(starter)는 튜토리얼이 끝나 있다', () => {
    expect(STEPS).toHaveLength(TUTORIAL_STEPS);
    expect(STEPS.map((s) => s.key)).toEqual(DIALOGUE.map((d) => d.key));
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const starter = createInitialState(1);
    expect(starter.tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true });
    expect(tutorialDone(starter)).toBe(true);
    expect(currentTutorialStep(starter)).toBeNull();
  });

  it('§7.1 시작 상태: 본관·정낭·정류장만, 길·좌석·메뉴 없음, 자금 500만, 후보 2명, 손님 0', () => {
    const s = tutorialState();
    expect(s.tutorial).toEqual({ step: 0, skipped: false });
    expect(Object.values(s.objects).map((o) => o.type).filter((t) => t === 'path' || t === 'table_out' || t === 'table_parasol')).toEqual([]);
    expect(s.menuSlots.every((m) => m === null)).toBe(true);
    expect(s.money).toBe(5_000_000);
    expect(s.candidates).toHaveLength(2);
    expect(canOpen(s)).toBe(false);
    tick(s, DAY_MS);
    expect(s.totalGuests).toBe(0);
    expect(s.guests).toHaveLength(0);
    expect(currentTutorialStep(s)?.id).toBe(1);
  });

  it('건너뛰기(첫 단계에서만): 완성 시작 상태로 채우고 step=9. 이미 시작했으면 거부', () => {
    const s = tutorialState();
    expect(apply(s, { type: 'skipTutorial' }).ok).toBe(true);
    expect(s.tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true });
    const seats = Object.values(s.objects).filter((o) => o.type === 'table_out' || o.type === 'table_parasol');
    expect(seats).toHaveLength(START_SEATS.length);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length);
    expect(s.menuSlots.slice(0, START_MENUS.length)).toEqual(START_MENUS);
    expect(canOpen(s)).toBe(true);
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0); // 건너뛰면 단계 보상 없음
    const t = tutorialState();
    t.tutorial.step = 1;
    expect(apply(t, { type: 'skipTutorial' }).ok).toBe(false);
    // fillStarterLayout은 이미 있는 칸을 건너뛴다
    fillStarterLayout(s);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length);
  });

  it('1~9단계를 순서대로 손으로 하면 단계마다 보상 상자가 뜨고 step이 오른다 (하이라이트 칸·타깃 포함)', () => {
    const s = tutorialState();
    openAllFeatures(s);
    const money0 = s.money;
    // 1: 정낭 → 문 앞 올렛길
    expect(STEPS[0]!.cells(s)).toHaveLength(2); // 정낭·문 앞
    expect(STEPS[0]!.targets).toContain('tab:path');
    expect(pathConnected(s)).toBe(false);
    for (const c of PATH.slice(0, 3)) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(0);
    expect(apply(s, { type: 'place', objectType: 'path', ...at(4, 5) }).ok).toBe(true);
    expect(pathConnected(s)).toBe(true);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toMatchObject({ refId: '1', items: [{ type: 'money', amount: 300_000 }] });
    expect(s.money).toBe(money0 - 4 * 10_000 + 300_000);
    // 2: 테이블 (전망은 x-site 스텁: 좌석 1개)
    expect(STEPS[1]!.cells(s).length).toBeGreaterThan(0);
    expect(STEPS[1]!.cells(s).length).toBeLessThanOrEqual(3);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(s.features.siteView).toBe(true);
    expect(canOpen(s)).toBe(false); // 아직 메뉴 없음
    // 3: 메뉴 두 개
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(apply(s, { type: 'setSlot', slot: 1, menuId: 'tangerine_juice' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(canOpen(s)).toBe(true);
    // 4: 첫 결제 — 손님이 온다
    expect(STEPS[3]!.cells(s)).toHaveLength(1); // 정류장
    for (let h = 0; h < 40 && s.tutorial.step < 4; h++) tick(s, HOUR_MS);
    expect(s.totalIncome).toBeGreaterThan(0);
    expect(s.tutorial.step).toBe(4);
    expect(lastReward(s)).toMatchObject({ refId: '4', items: [{ type: 'tickets', n: 1 }] });
    // 5: 채용
    hire(s, s.candidates[0]!.id, 'hall');
    checkGoals(s);
    expect(s.tutorial.step).toBe(5);
    // 6: 돌담을 테이블 북서쪽에
    expect(wallShelteringSeat(s)).toBe(false);
    const cells = STEPS[5]!.cells(s);
    expect(cells).toContainEqual(at(2, 3));
    expect(apply(s, { type: 'place', objectType: 'stonewall', ...at(2, 3) }).ok).toBe(true);
    expect(wallShelteringSeat(s)).toBe(true);
    expect(s.tutorial.step).toBe(6);
    expect(s.features.comboCodex).toBe(true);
    // 7: 홍보
    s.stats.promotionsDone = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(7);
    expect(lastReward(s)).toMatchObject({ refId: '7', items: [{ type: 'mileage', n: 30 }] });
    // 8: 도전 수락
    expect(apply(s, { type: 'acceptChallenge', id: 'c01' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(8);
    expect(lastReward(s)).toMatchObject({ refId: '8', items: [{ type: 'money', amount: 500_000 }] });
    // 9: 첫 월말 결산 닫기
    expect(firstMonthClosed(s)).toBe(false);
    while (s.clock.month === 3) tick(s, DAY_MS);
    expect(s.lastMonthCard).not.toBeNull();
    expect(s.tutorial.step).toBe(8);
    expect(apply(s, { type: 'dismissMonthCard' }).ok).toBe(true);
    checkGoals(s);
    expect(s.tutorial.step).toBe(9);
    expect(tutorialDone(s)).toBe(true);
    expect(s.features.spotMap).toBe(true);
    expect(s.alerts.filter((a) => a.type === 'reward' && a.source === 'tutorial')).toHaveLength(9);
    expect(checkTutorial(s)).toBeNull();
  });

  it('첫 결제 전엔 손님이 안 오고, 튜토리얼 상태는 저장 스키마에 들어간다', () => {
    const s = tutorialState(3);
    for (let d = 0; d < DAYS_PER_MONTH; d++) tick(s, DAY_MS);
    expect(s.totalGuests).toBe(0);
    expect(s.tutorial.step).toBe(0);
    expect(JSON.parse(JSON.stringify(s)).tutorial).toEqual({ step: 0, skipped: false });
  });
});

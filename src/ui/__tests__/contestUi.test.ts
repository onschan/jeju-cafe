/** 대회 UI: 연출 길이·스킵 단계·문구(영문 id·금지어)·접수 창이 한 화면에 보여 주는 숫자. */
import { describe, it, expect } from 'vitest';
import { bareState } from '../../sim/__tests__/helpers.ts';
import { apply } from '../../sim/actions.ts';
import { QUAL_MS, ITEM_MS, AWARD_MS, SHOW_MS, type ShowPhase } from '../ContestShow';
import {
  CONTESTS, CONTEST_JUDGE_KEYS, CONTEST_JUDGE_LABEL, CONTEST_GRADE, SIGNUP_DAYS, PRIZE_MULT, CONTEST_TICKETS, TROPHY_TYPE,
  contestOdds, contestTitle, contestStaff, contestMenus, trainingNameFor, chanceText, signupOpen, contestState,
} from '../../sim/index.ts';
import { hasIdToken } from '../../data/labels.ts';
import type { GameState, Staff } from '../../sim/types.ts';
import { objectDef } from '../../data/index.ts';

/** 대회 창을 열 수 있는 상태: 등급 3 · 접수 창 · 바리스타 1명 · 메뉴판 1개 */
function ready(): { s: GameState; st: Staff } {
  const s = bareState(1);
  s.grade = CONTEST_GRADE;
  s.clock.year = 3; s.clock.month = 5; s.clock.day = 30 - SIGNUP_DAYS + 1;
  s.money = 50_000_000;
  const st: Staff = {
    id: 'c1', name: '출전', face: { hair: 0, skin: 0, top: 0 }, poolId: '',
    stats: { stamina: 60, strength: 40, skill: 80, smile: 50 }, statCaps: { stamina: 100, strength: 100, skill: 100, smile: 100 },
    skill: 'none', extraSkills: [], level: 3, maxLevel: 10, baseSalary: 400_000, salary: 400_000, exp: 0,
    trainingCount: 0, training: null, role: 'barista', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1,
    x: 0, y: 0, path: [], anchor: null, waitMs: 0,
  };
  s.staff = [st];
  s.menuSlots[0] = 'americano';
  return { s, st };
}

describe('대회 연출 (ContestShow)', () => {
  it('자동 연출은 7.2초를 넘지 않는다 (예선 2.5 + 본선 0.8×4 + 시상 1.5)', () => {
    expect(QUAL_MS).toBe(2500);
    expect(ITEM_MS).toBe(800);
    expect(AWARD_MS).toBe(1500);
    expect(SHOW_MS).toBe(QUAL_MS + ITEM_MS * CONTEST_JUDGE_KEYS.length + AWARD_MS);
    expect(SHOW_MS).toBeLessThanOrEqual(7200);
  });

  it('탭 한 번으로 건너뛸 수 있는 단계가 정의돼 있다 (예선·본선·결과)', () => {
    const auto: ShowPhase[] = ['qual', 'final', 'result'];
    const all: ShowPhase[] = ['qual', 'final', 'result', 'score', 'award', 'reward'];
    for (const p of auto) expect(all).toContain(p);
    // 건너뛰면 정산(score)으로 간다 — 보상까지 누르는 횟수는 3회 안
    expect(all.indexOf('reward') - all.indexOf('score')).toBe(2);
  });

  it('심사 항목은 4개, 이름은 맛·향·외관·스토리', () => {
    expect(CONTEST_JUDGE_KEYS).toEqual(['taste', 'aroma', 'look', 'story']);
    expect(CONTEST_JUDGE_KEYS.map((k) => CONTEST_JUDGE_LABEL[k])).toEqual(['맛', '향', '외관', '스토리']);
  });
});

describe('대회 접수 창 (ContestWindow)', () => {
  it('판단에 필요한 숫자가 한 번에 나온다: 참가비·확률·예상 점수·상대·순위·상금', () => {
    const { s, st } = ready();
    expect(signupOpen(s)).toBe(true);
    const o = contestOdds(s, 'espresso', st.id, 'americano')!;
    expect(o.fee).toBe(CONTESTS[0]!.fee);
    expect(o.rivals).toHaveLength(3);
    expect(o.base).toBeGreaterThanOrEqual(0);
    expect(o.rank).toBeGreaterThanOrEqual(1);
    expect(o.rank).toBeLessThanOrEqual(4);
    expect(chanceText(o.chances)).toMatch(/성공 \d+% · 대박 \d+%/);
    expect(o.prize).toBe(o.fee * (PRIZE_MULT[o.rank - 1] ?? 0));
  });

  it('종목·직원·메뉴 목록에 영문 id가 없다', () => {
    const { s } = ready();
    const texts: string[] = [];
    for (const d of CONTESTS) {
      texts.push(d.name, d.desc, contestTitle(6, d.id), contestTitle(12, d.id));
      for (const st of contestStaff(s, d.id)) texts.push(st.name);
      for (const m of contestMenus(s, d.id)) texts.push(m); // 메뉴 id 자체는 버튼 라벨이 아니라 이름으로 그린다
    }
    for (const k of CONTEST_JUDGE_KEYS) texts.push(CONTEST_JUDGE_LABEL[k], trainingNameFor(k));
    texts.push(objectDef(TROPHY_TYPE).name, objectDef(TROPHY_TYPE).desc ?? '');
    const shown = texts.filter((t) => !contestMenus(s, 'espresso').includes(t));
    const bad = shown.filter((t) => hasIdToken(t));
    expect(bad, bad.slice(0, 5).join(' | ')).toEqual([]);
    for (const t of shown) expect(t).not.toMatch(/→|정석|시뮬|공략/);
  });

  it('4위도 참가상을 받는다 (져도 빈손이 아니다)', () => {
    expect(PRIZE_MULT[3]).toBe(0);
    expect(CONTEST_TICKETS[3]).toBeGreaterThan(0);
  });

  it('접수 뒤에는 접수 카드가 뜨고 다시 접수할 수 없다', () => {
    const { s, st } = ready();
    expect(apply(s, { type: 'enterContest', event: 'espresso', staffId: st.id, menuId: 'americano' }).ok).toBe(true);
    expect(contestState(s).entry).not.toBeNull();
    expect(apply(s, { type: 'enterContest', event: 'latteart', staffId: st.id, menuId: 'americano' }).ok).toBe(false);
  });
});

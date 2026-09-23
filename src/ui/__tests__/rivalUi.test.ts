/** 경쟁·할 일 UI 문구 검증: 영문 id 노출 금지 · 문구 규칙(지시문·화살표·"정석"·"시뮬" 금지, 한 줄 ≤22자) ·
 *  오늘 할 일 경쟁 줄 · 동네 순위표 줄 수 · 375px에서 잘리지 않을 길이. 렌더 없이 문구만 본다. */
import { describe, it, expect } from 'vitest';
import type { GameState } from '../../sim/types.ts';
import { bareState } from '../../sim/__tests__/helpers.ts';
import { hasIdToken } from '../../data/labels.ts';
import {
  RIVALS, scoreboard, rivalsState, rollSteal, stealTitle, activeSteal, boardLine, rankGap,
  todoRows, upcomingGoals, contestCurrentRivalNames,
  RIVAL_AXIS_LABEL, RIVAL_AXES, RIVAL_STEAL_DAY, RIVAL_EFFECT_YEAR, RIVAL_BOARD_DAY, CONTEST_GRADE, SIGNUP_DAYS,
} from '../../sim/index.ts';
import { todoItems } from '../TodoLine';
import { diagnose } from '../../sim/index.ts';

const BAN = ['정석', '시뮬', '→', '←', '해라', '하세요!', 'ㅋ'];

function allText(s: GameState): string[] {
  const out: string[] = [];
  for (const r of todoRows(s)) out.push(r.title, r.how, r.rewardText, r.valueText);
  for (const g of upcomingGoals(s).slice(0, 20)) out.push(g.title, g.conditionText, g.rewardText);
  for (const r of scoreboard(s)) out.push(r.name);
  out.push(boardLine(s, scoreboard(s)));
  for (const d of RIVALS) out.push(d.name, d.concept, d.line, RIVAL_AXIS_LABEL[d.strength]);
  for (const t of todoItems(s)) out.push(t.text, t.gain);
  const d = diagnose(s);
  if (d.rival) out.push(d.rival.text);
  return out.filter((t) => t.length > 0);
}

describe('문구', () => {
  it('경쟁·할 일 문구에 영문 id가 새지 않는다', () => {
    const s = bareState(1);
    for (const t of allText(s)) expect(hasIdToken(t), t).toBe(false);
  });
  it('금지어가 없다', () => {
    const s = bareState(1);
    for (const t of allText(s)) for (const b of BAN) expect(t, t).not.toContain(b);
  });
  it('줄 제목은 375px에서 읽히게 짧다 (≤22자)', () => {
    const s = bareState(1);
    for (const r of todoRows(s)) expect(r.title.length, r.title).toBeLessThanOrEqual(22);
    for (const d of RIVALS) expect(d.name.length, d.name).toBeLessThanOrEqual(12);
  });
  it('경쟁 카페 이름은 한글이고 서로 다르다', () => {
    const names = RIVALS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/[가-힣]/);
  });
});

describe('동네 순위표', () => {
  it('6줄이 나오고 내 줄이 하나, 순위가 1부터', () => {
    const rows = scoreboard(bareState(1));
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.me)).toHaveLength(1);
    expect(rows[0]!.rank).toBe(1);
  });
  it('첫 발표 전에는 변동 화살표를 그릴 근거가 없다 (prevRank null)', () => {
    for (const r of scoreboard(bareState(1))) expect(r.prevRank).toBeNull();
  });
  it('격차 한 줄이 나와 한 계단 위를 가리킨다', () => {
    const rows = scoreboard(bareState(1));
    const { above, gap } = rankGap(rows);
    expect(above).not.toBeNull();
    expect(gap).toBeGreaterThan(0);
    expect(above!.name).not.toBe(rows.find((r) => r.me)!.name);
  });
  it('네 항목 이름이 모두 한글', () => {
    for (const a of RIVAL_AXES) expect(RIVAL_AXIS_LABEL[a]).toMatch(/^[가-힣]+$/);
  });
  it('발표일은 월초 1일이 아니다 — 결산·가이드북 발표와 겹치지 않게 나눴다', () => {
    expect(RIVAL_BOARD_DAY).toBeGreaterThan(1);
    expect(RIVAL_STEAL_DAY).not.toBe(RIVAL_BOARD_DAY);
  });
});

describe('오늘 할 일', () => {
  it('답을 기다리는 뺏기 이벤트는 목표보다 앞에 온다', () => {
    const s = bareState(1);
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.clock.day = RIVAL_STEAL_DAY;
    rollSteal(s);
    const items = todoItems(s);
    const iRival = items.findIndex((t) => t.kind === 'rival');
    const iGoal = items.findIndex((t) => t.kind === 'goal');
    expect(iRival).toBeGreaterThanOrEqual(0);
    if (iGoal >= 0) expect(iRival).toBeLessThan(iGoal);
    expect(items[iRival]!.text).toContain(stealTitle(s).split(' ')[0]!);
  });
  it('1위면 경쟁 줄을 안 그린다 (잔소리를 만들지 않는다)', () => {
    const s = bareState(1);
    rivalsState(s).myRank = 1;
    expect(todoItems(s).some((t) => t.kind === 'rival')).toBe(false);
  });
  it('발표 전이면 순위 줄이 없다', () => {
    const s = bareState(1);
    expect(rivalsState(s).myRank).toBeNull();
    expect(todoItems(s).some((t) => t.key.startsWith('rival:rank'))).toBe(false);
  });
  it('줄은 3개를 넘지 않는다', () => {
    const s = bareState(1);
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.clock.day = RIVAL_STEAL_DAY;
    rollSteal(s);
    expect(todoItems(s).length).toBeLessThanOrEqual(3);
  });
});

describe('대회 상대', () => {
  it('접수 창이 동네 카페 이름을 그대로 보여 준다', () => {
    const s = bareState(1);
    s.grade = CONTEST_GRADE;
    s.clock.year = 3; s.clock.month = 5; s.clock.day = 30 - SIGNUP_DAYS + 1;
    const names = contestCurrentRivalNames(s, 'espresso');
    expect(names).toHaveLength(3);
    for (const n of names) expect(RIVALS.some((d) => d.name === n)).toBe(true);
  });
});

describe('진단', () => {
  it('우리 카페 진단에 동네 순위 한 줄이 붙는다', () => {
    const d = diagnose(bareState(1));
    expect(d.rival).toBeDefined();
    expect(d.rival!.of).toBe(6);
    expect(d.rival!.text).toContain('동네');
    expect(d.evidence.some((e) => e.label === '동네 순위')).toBe(true);
  });
});

describe('뺏기 이벤트 선택지', () => {
  it('세 갈래 문구가 모두 한국어이고 무엇을 잃는지 말한다', () => {
    const s = bareState(1);
    s.clock.year = RIVAL_EFFECT_YEAR;
    s.clock.day = RIVAL_STEAL_DAY;
    rollSteal(s);
    const st = activeSteal(s)!;
    expect(['newmenu', 'sale']).toContain(st.kind);
    const title = stealTitle(s);
    expect(hasIdToken(title)).toBe(false);
    expect(title).toMatch(/냈어요|열었어요/);
  });
});

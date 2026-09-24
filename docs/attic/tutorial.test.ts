import { describe, it, expect } from 'vitest';
import { createInitialState, START_SEATS, START_PATH, START_PATH_ROAD_LINK, START_MENUS, START_MONEY, START_CANDIDATES, START_MAIN, fillStarterLayout } from '../state.ts';
import { apply } from '../actions.ts';
import { tick, STEP_MS } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import {
  STEPS, TUTORIAL_STEPS, TUTORIAL_ACTS, TUTORIAL_STEP_GAP_DAYS, TRACKED_ACTIONS, STARTER_FEATURE_IDS, LOOK_TEXT, currentTutorialStep, nextTutorialStep, checkTutorial, tutorialDone, pathConnected, noteTutorial, dialogueSeen,
  skipTutorialChapter, skipTutorialStep, stepTargets, cornerMade, cornerMissingType, cornerCells, CORNER_PIECE_TYPES, CORNER_RADIUS, TUTORIAL_CORNER_ID, rushSeated, recommendedMainCells,
  actOpen, actDone, actsDone, currentAct, waitingForAct, ACT2_SEATS,
} from '../tutorial.ts';
import { canOpen } from '../goals.ts';
import { mainBuilding } from '../rooms.ts';
import { doorFrontOf, objectAt } from '../grid.ts';
import { bestSeatCells, strategyVars, fillTemplate, TUTORIAL_SEAT_CELL } from '../strategy.ts';
import { serialize, deserialize } from '../save.ts';
import type { GameState } from '../types.ts';
import { at, X, Y } from './helpers.ts';
import { completedCorners } from '../corners.ts';
import { walkableNeighborsOf } from '../path.ts';
import { TUTORIAL_STEPS as DIALOGUE } from '../../data/dialogue/index.ts';

/** fun-start 새 게임: 본관 + 올렛길이 이미 있는 마당에서 한 단계씩 손으로 한다 */
function tutorialState(seed = 1) {
  return createInitialState(seed, 'local', 0, 'tutorial');
}
function lastReward(s: GameState) {
  return [...s.alerts].reverse().find((a) => a.type === 'reward' && a.source === 'tutorial');
}
/** 현재 단계 대사를 본 것으로 표시한다 (UI가 대사를 닫을 때 하는 일) */
function seeDialogue(s: GameState) {
  const st = currentTutorialStep(s);
  if (st) apply(s, { type: 'tutorialNote', key: `dlg:${st.id}` });
}
function clearAlerts(s: GameState) { s.alerts = []; }
/** 게임을 굴려 손님이 올 때까지 (실시간 1배속 기준 ms를 돌려준다) */
/** 공사 중인 게 없을 때까지 스텝을 돌린다 (벤치·가로등은 공사 1일) — 기다린 게임 ms */
function finishBuilds(s: GameState, maxMs = 2 * DAY_MS): number {
  let ms = 0;
  while (Object.values(s.objects).some((o) => o.build) && ms < maxMs) { tick(s, STEP_MS); ms += STEP_MS; }
  return ms;
}
function untilGuest(s: GameState, maxMs = 60_000): number {
  let ms = 0;
  while (s.guests.length === 0 && ms < maxMs) { tick(s, STEP_MS); ms += STEP_MS; }
  return ms;
}
const FORBIDDEN = /→ 지금|정석|시뮬|공략|굴려 보니/;

describe('손으로 하는 튜토리얼 「할망의 가르침」 5막 14단계 (fun-start + rush-battle §3 러시 단계)', () => {
  it('데이터: sim STEPS 14개와 dialogue/tutorial.json 14개가 key·막으로 1:1, 5막에 3·4·2·3·2단계, 대사는 2~3줄·22자 이하·금지어 없음, 완성 시작 상태(starter)는 끝난 채', () => {
    expect(TUTORIAL_STEPS).toBe(14);
    expect(STEPS.map((s) => s.id)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    // rush-battle §3: 인사(greet)는 빠지고 「첫 러시」가 들어왔다. teardown §3: 「직원 스킬」 단계는 다시 빠졌다
    expect(STEPS.map((s) => s.key)).toEqual(['seat', 'menu', 'rushSeat', 'site', 'corner', 'cornerSeat', 'hire', 'tree', 'combo', 'parcel', 'route', 'rearrange', 'checkup', 'contest']);
    expect(STEPS.some((s) => s.key === 'greet')).toBe(false);
    expect(STEPS.some((s) => s.key === 'rushSkill')).toBe(false);
    expect(TUTORIAL_ACTS.map((a) => a.id)).toEqual([1, 2, 3, 4, 5]);
    expect(TUTORIAL_ACTS.map((a) => STEPS.filter((st) => st.act === a.id).length)).toEqual([3, 4, 2, 3, 2]);
    expect(DIALOGUE.map((d) => [d.id, d.key, d.act])).toEqual(STEPS.map((s) => [s.id, s.key, s.act]));
    // 막 예고 한 줄도 22자 이하·금지어 없음
    for (const a of TUTORIAL_ACTS) { expect(a.lead.length, a.lead).toBeLessThanOrEqual(22); expect(a.lead).not.toMatch(FORBIDDEN); expect(a.when.length).toBeGreaterThan(0); }
    const vars = strategyVars(tutorialState());
    for (const d of DIALOGUE) {
      expect(d.speaker).toBe('halmang');
      expect(d.lines.length).toBeGreaterThanOrEqual(2);
      expect(d.lines.length).toBeLessThanOrEqual(3);
      expect(d.linesIfNoWhy?.length ?? d.lines.length, `${d.id}: 대체 문장은 줄 수가 같아야 한다`).toBe(d.lines.length);
      for (const l of [d.title, ...d.lines, ...(d.linesIfNoWhy ?? []), d.button, d.done ?? '']) {
        const f = fillTemplate(l, vars);
        expect(f, l).not.toMatch(FORBIDDEN);
        expect(f, l).not.toMatch(/\{[a-zA-Z]+\}/);
        if (d.lines.includes(l) || d.linesIfNoWhy?.includes(l)) expect(f.length, f).toBeLessThanOrEqual(22);
      }
    }
    for (const t of Object.values(LOOK_TEXT)) expect(t).not.toMatch(FORBIDDEN);
    expect(LOOK_TEXT.gate).toContain('장식');
    expect(STARTER_FEATURE_IDS).toEqual([]);
    expect(createInitialState(1).tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
    expect(TRACKED_ACTIONS.has('greetGuest')).toBe(false); // rush-battle §3·§6: 인사 액션은 삭제됐다
    expect(TRACKED_ACTIONS.has('seatFromQueue')).toBe(true); // 러시 자리 배정 액션 훅
    expect(TRACKED_ACTIONS.has('treeUpgrade')).toBe(true); // 3막 트리 올리기
    expect(TRACKED_ACTIONS.has('move')).toBe(true); // 4막 옮기기
    // 보상은 단계가 아니라 막마다 한 번 — 마지막 막이 칭호를 준다
    expect(TUTORIAL_ACTS[4]!.reward).toContainEqual({ type: 'title', id: 'halmang_pupil', name: '할망의 제자' });
  });

  it('말투: 할망의 다정한 반말 하나로 통일 — 「~한다」 설명문·「~하라」 명령조가 없고, 막 예고·단계 대사가 같은 어미를 쓴다', () => {
    // lines: 사용자 피드백(2026-09-25) 「튜토리얼 대사가 어색하다」 — 했다체·~하라·토막 문장이 섞여 있던 것을 한 말투로 묶었다.
    const PLAIN = /다[.!?]?$/;   // 「자리 값은 칸마다 다르다」 같은 설명문 종결
    const ORDER = /[하해]라[.!?]?$/; // 「재료 걱정은 나중에 하라」 같은 명령조 (「~해 보라」는 권유라 괜찮다)
    const vars = strategyVars(tutorialState());
    const spoken: string[] = [];
    for (const d of DIALOGUE) spoken.push(...d.lines, ...(d.linesIfNoWhy ?? []));
    for (const a of TUTORIAL_ACTS) spoken.push(a.lead);
    for (const l of spoken) {
      const f = fillTemplate(l, vars);
      expect(f, `설명문 종결: ${f}`).not.toMatch(PLAIN);
      expect(f, `명령조: ${f}`).not.toMatch(ORDER);
    }
    // 막 예고는 5막 구조를 말로 드러낸다 (무엇을 가르칠 막인지)
    expect(TUTORIAL_ACTS[1]!.lead).toContain('자리');
    expect(TUTORIAL_ACTS[4]!.lead).toContain('색');
  });

  it('토큰 줄: `{seatWhyPhrase}`가 문장 끝에 붙어 말이 끊기지 않고, 근거가 없을 때 쓸 대체 문장이 데이터에 있다', () => {
    const withToken = DIALOGUE.filter((d) => d.lines.some((l) => l.includes('{')));
    expect(withToken.length).toBeGreaterThan(0);
    for (const d of withToken) {
      for (const l of d.lines) {
        if (!l.includes('{')) continue;
        expect(l.trimEnd().endsWith('}'), `${d.id}: 토큰이 줄 끝에 있다 — ${l}`).toBe(false);
        expect(l, `${d.id}: 토큰 줄은 문장으로 끝나야 한다`).toMatch(/[.!?]$/);
      }
      // 토큰이 있는 단계는 근거가 없을 때 쓸 대체 문장을 가진다 (토큰 값이 밋밋해도 말이 살게)
      expect(d.linesIfNoWhy, `${d.id}: linesIfNoWhy`).toBeTruthy();
      for (const l of d.linesIfNoWhy!) expect(l).not.toContain('{');
    }
    // 대체 문장이 없는 단계는 토큰도 없다
    for (const d of DIALOGUE) if (!d.lines.some((l) => l.includes('{'))) expect(d.linesIfNoWhy).toBeUndefined();
  });

  it('시작 상태(fun-start): 본관이 기본 자리에 서 있고 마을 길→문 앞 올렛길이 이어져 있다. 정낭·좌석·메뉴 없음, 자금 500만, 후보 2, 정류장 있음', () => {
    const s = tutorialState();
    const m = mainBuilding(s)!;
    expect(m).toMatchObject(at(START_MAIN.lx, START_MAIN.ly));
    expect(m.build).toBeUndefined();
    expect(pathConnected(s)).toBe(true);
    for (const c of [...START_PATH, START_PATH_ROAD_LINK]) expect(objectAt(s, X(c.lx), Y(c.ly))?.type, `${c.lx},${c.ly}`).toBe('path');
    expect(Object.values(s.objects).some((o) => o.type === 'gate')).toBe(false); // 정낭은 「담」 탭 장식으로만
    expect(s.unlocked.objects).toContain('gate');
    expect(Object.values(s.objects).some((o) => o.type === 'busstop')).toBe(true);
    expect(Object.values(s.objects).filter((o) => o.type === 'table_out' || o.type === 'table_parasol')).toHaveLength(0);
    expect(s.menuSlots.every((x) => x === null)).toBe(true);
    expect(s.money).toBe(START_MONEY);
    expect(s.candidates).toHaveLength(START_CANDIDATES);
    expect(s.tutorial).toEqual({ step: 0, skipped: false, seen: [] });
    expect(canOpen(s)).toBe(false); // 테이블·메뉴가 없으면 아직
    expect(recommendedMainCells(s)).toEqual([]); // 본관이 있으니 추천 자리 없음
    // 옛 맨땅(bare)은 그대로: 본관 없음·정낭 있음
    const b = createInitialState(1, 'local', 0, 'bare');
    expect(mainBuilding(b)).toBeNull();
    expect(Object.values(b.objects).some((o) => o.type === 'gate')).toBe(true);
    expect(recommendedMainCells(b)).toHaveLength(3);
    // 완성 시작 상태(starter)는 정낭·테이블 2·파라솔·메뉴 3종 그대로 (봇 진행이 안 바뀐다)
    const st = createInitialState(1);
    expect(Object.values(st.objects).some((o) => o.type === 'gate')).toBe(true);
    expect(Object.values(st.objects).filter((o) => o.type === 'table_out' || o.type === 'table_parasol')).toHaveLength(START_SEATS.length);
    expect(st.menuSlots.slice(0, START_MENUS.length)).toEqual(START_MENUS);
    expect(pathConnected(st)).toBe(true);
  });

  it('1막 3단계를 손으로 하면 막 끝에 보상 상자 하나가 뜬다 — 단계 사이에 하루씩, 2막은 좌석 2개·첫 결제 전엔 안 뜬다', () => {
    const s = tutorialState();
    const money0 = s.money;
    // 1: 테이블 — 사용자가 고른 칸 (15,11) 글로우, 짓기 → 쉼 → 야외 테이블
    seeDialogue(s);
    expect(stepTargets(STEPS[0]!, s)).toEqual(['nav:build', 'tile:seat', 'tab:rest', 'build:table_out', 'build-go']);
    const glow = STEPS[0]!.cells(s);
    expect(glow).toEqual([TUTORIAL_SEAT_CELL]);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...glow[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toBeUndefined(); // 보상은 막을 끝낼 때 한 번
    // 연타 금지: 오늘은 다음 단계가 안 뜬다
    expect(currentTutorialStep(s)).toBeNull();
    expect(nextTutorialStep(s)!.key).toBe('menu');
    tick(s, DAY_MS * TUTORIAL_STEP_GAP_DAYS);
    expect(currentTutorialStep(s)!.key).toBe('menu');
    // 2: 메뉴판에 아메리카노
    seeDialogue(s);
    expect(canOpen(s)).toBe(false);
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(canOpen(s)).toBe(true);
    tick(s, DAY_MS * TUTORIAL_STEP_GAP_DAYS);
    // 3: 첫 러시 — 줄에서 손님 둘을 앉힌다 (UI가 rushSeat1·rushSeat2 표식을 남긴다). 글로우는 첫 자리 칸
    seeDialogue(s);
    const wait = untilGuest(s);
    expect(s.guests.length).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(30_000); // 1배속 30초 안에 첫 손님
    expect(STEPS[2]!.cells(s)).toEqual([TUTORIAL_SEAT_CELL]);
    expect(rushSeated(s)).toBe(false);
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'rushSeat1' }).ok).toBe(true);
    expect(rushSeated(s)).toBe(false); // 한 명으로는 아직
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'rushSeat2' }).ok).toBe(true);
    expect(rushSeated(s)).toBe(true);
    expect(s.tutorial.step).toBe(3);
    // 1막 끝 — 보상 상자 하나 (₩30만 · 응모권 1)
    expect(lastReward(s)).toMatchObject({ refId: 'act1' });
    expect(s.money).toBeGreaterThan(money0 - 50_000);
    expect(actDone(s, 1)).toBe(true);
    expect(actsDone(s)).toBe(1);
    clearAlerts(s);
    // 2막은 좌석 2개 + 첫 결제 전엔 아예 안 뜬다
    tick(s, DAY_MS * TUTORIAL_STEP_GAP_DAYS);
    expect(currentAct(s)!.id).toBe(2);
    expect(actOpen(s, 2)).toBe(false);
    expect(currentTutorialStep(s)).toBeNull();
    expect(waitingForAct(s)!.id).toBe(2);
    // 좌석을 하나 더 놓고 한 잔이 팔리면 열린다
    const more = bestSeatCells(s, 1)[0]!;
    expect(apply(s, { type: 'place', objectType: 'table_out', x: more.x, y: more.y }).ok).toBe(true);
    let ms = 0;
    while (!actOpen(s, 2) && ms < 5 * DAY_MS) { tick(s, STEP_MS); ms += STEP_MS; }
    expect(actOpen(s, 2)).toBe(true);
    expect(currentTutorialStep(s)!.key).toBe('site');
  });

  it('3막은 자금 ₩80만·좌석 3개에서 열린다 (그 전엔 단계가 하나도 안 뜬다)', () => {
    const s = tutorialState();
    s.tutorial.step = 7; // 1~2막을 끝낸 모습 (2막은 4단계)
    s.money = 500_000;
    expect(actOpen(s, 3)).toBe(false);
    expect(currentTutorialStep(s)).toBeNull();
    s.money = 800_000;
    for (let i = 0; i < 3 && Object.values(s.objects).filter((o) => o.type === 'table_out').length < 3; i++) {
      const c = bestSeatCells(s, 1)[0]!;
      apply(s, { type: 'place', objectType: 'table_out', x: c.x, y: c.y });
      s.money = 800_000;
    }
    expect(actOpen(s, 3)).toBe(true);
    expect(currentTutorialStep(s)!.key).toBe('tree');
  });

  it('트랙 C 명당: 완성 명당이 하나라도 있으면 5단계가 찬다; 꽃밭·벤치가 멀면(반경 2 밖) 안 차고 빠진 조각은 벤치', () => {
    const t = tutorialState();
    const [flower, bench] = CORNER_PIECE_TYPES as [string, string, string];
    expect(cornerMade(t)).toBe(false);
    expect(apply(t, { type: 'place', objectType: flower, ...at(1, 1) }).ok).toBe(true);
    expect(apply(t, { type: 'place', objectType: bench, ...at(8, 5) }).ok).toBe(true);
    finishBuilds(t);
    expect(cornerMade(t)).toBe(false);
    expect(cornerMissingType(t)).toBe(bench); // 꽃밭 옆에 벤치 하나 더
    expect(cornerCells(t)).toHaveLength(1);
  });

  it('대사 게이트: 조건이 먼저 차도 대사(dlg:<id>)를 보기 전엔 안 끝나고, 보고 나면 바로 통과한다. 표식은 한 번만 남는다', () => {
    const s = tutorialState();
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(0);
    expect(dialogueSeen(s, 1)).toBe(false);
    expect(noteTutorial(s, 'dlg:1')).toBe(true);
    expect(noteTutorial(s, 'dlg:1')).toBe(false);
    expect(checkTutorial(s)).toBe(1);
    expect(s.tutorial.step).toBe(1);
    expect(checkTutorial(s)).toBeNull(); // 2단계 대사를 아직 안 봤다
  });

  it('차례가 되기도 전에 이미 해 둔 단계는 대사 없이 조용히 넘어간다 (고친 버그: 3분 전에 한 일을 다시 시키며 게임을 멈췄다)', () => {
    const s = tutorialState();
    // 1단계(자리 놓기)를 하기도 전에 2단계 조건(메뉴 올리기)까지 미리 해 둔다
    const before = s.tutorial.step;
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(before); // 1단계 대사를 아직 안 봤다 — 지금 차례인 단계는 그대로 기다린다
    noteTutorial(s, 'dlg:1');
    const done = checkTutorial(s);
    expect(done).toBe(1);
    // 미리 해 둔 뒷단계가 있으면 그만큼 대사 없이 함께 넘어가 있어야 한다 (최소한 1단계는 넘었다)
    expect(s.tutorial.step).toBeGreaterThanOrEqual(before + 1);
  });

  it('전체 건너뛰기(첫 단계에서만): 완성 시작 상태(테이블 2·파라솔·메뉴 3종)로 채우고 step=7. 이미 시작했으면 거부. 정낭은 안 생긴다', () => {
    const s = tutorialState();
    expect(apply(s, { type: 'skipTutorial' }).ok).toBe(true);
    expect(s.tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
    expect(mainBuilding(s)).toMatchObject(at(START_MAIN.lx, START_MAIN.ly));
    expect(Object.values(s.objects).filter((o) => o.type === 'table_out' || o.type === 'table_parasol')).toHaveLength(START_SEATS.length);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length + 1); // 정낭 자리(4,6)까지 길
    expect(Object.values(s.objects).some((o) => o.type === 'gate')).toBe(false);
    expect(s.menuSlots.slice(0, START_MENUS.length)).toEqual(START_MENUS);
    expect(canOpen(s)).toBe(true);
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0);
    const t = tutorialState();
    t.tutorial.step = 1;
    expect(apply(t, { type: 'skipTutorial' }).ok).toBe(false);
    fillStarterLayout(s); // 두 번 채워도 그대로
    expect(Object.values(s.objects).filter((o) => o.type === 'warehouse')).toHaveLength(1);
  });

  it('건너뛰기는 막 단위(skipTutorialChapter): 지금 막의 남은 단계만 — 해금만 조용히, 돈·응모권·칭호 없음. 「이미 알아요」(skipTutorialStep)는 한 단계만', () => {
    const s = tutorialState();
    seeDialogue(s);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(1);
    clearAlerts(s);
    const money = s.money, tickets = s.tickets;
    expect(skipTutorialStep(s)).toBe(2);
    expect(s.tutorial.step).toBe(2);
    expect(s.tutorial.skipped).toBe(false);
    // 1막의 남은 단계(3단계)만 넘어간다 — 2막은 그대로 남는다
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(actDone(s, 1)).toBe(true);
    expect(actDone(s, 2)).toBe(false);
    expect(s.tutorial.skipped).toBe(true);
    expect(s.money).toBe(money);
    expect(s.tickets).toBe(tickets);
    expect(s.titles).not.toContain('halmang_pupil');
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0);
    // 막을 다 넘기면 더 넘길 게 없다
    for (let i = 0; i < TUTORIAL_ACTS.length; i++) apply(s, { type: 'skipTutorialChapter' });
    expect(tutorialDone(s)).toBe(true);
    expect(skipTutorialChapter(s)).toBe(0);
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(false);
    // 0단계에서 건너뛰면 완성 시작 상태로 채워 바로 영업
    const u = tutorialState();
    expect(apply(u, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(canOpen(u)).toBe(true);
    expect(actDone(u, 1)).toBe(true);
  });

  it('저장: 표식(seen)·진행이 저장되고 불러온 뒤 이어 간다; 결정적(같은 시드·같은 행동 → 같은 상태)', () => {
    const s = tutorialState(3);
    seeDialogue(s);
    apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) });
    apply(s, { type: 'tutorialNote', key: 'dlg:2' });
    const r = deserialize(serialize(s));
    expect(r.tutorial).toEqual(s.tutorial);
    expect(r.tutorial.seen).toContain('dlg:1');
    tick(r, DAY_MS); // 단계 사이 하루
    expect(apply(r, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(r.tutorial.step).toBe(2);
    const a = tutorialState(5), b = tutorialState(5);
    for (const x of [a, b]) { seeDialogue(x); apply(x, { type: 'place', objectType: 'table_out', ...at(3, 4) }); tick(x, DAY_MS); seeDialogue(x); apply(x, { type: 'setSlot', slot: 0, menuId: 'americano' }); tick(x, DAY_MS); seeDialogue(x); }
    expect(serialize(a)).toBe(serialize(b));
    expect(doorFrontOf(mainBuilding(a)!)).toEqual(at(3, 3));
  });
});

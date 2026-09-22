import { describe, it, expect } from 'vitest';
import { createInitialState, START_SEATS, START_PATH, START_PATH_ROAD_LINK, START_MENUS, START_MONEY, START_CANDIDATES, START_MAIN, fillStarterLayout } from '../state.ts';
import { apply } from '../actions.ts';
import { tick, STEP_MS } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import {
  STEPS, TUTORIAL_STEPS, TRACKED_ACTIONS, STARTER_FEATURE_IDS, LOOK_TEXT, currentTutorialStep, checkTutorial, tutorialDone, pathConnected, noteTutorial, dialogueSeen,
  skipTutorialChapter, skipTutorialStep, stepTargets, cornerMade, cornerMissingType, cornerCells, cornerFlowerType, cornerBenchType, CORNER_RADIUS, greetedGuest, recommendedMainCells,
} from '../tutorial.ts';
import { canOpen } from '../goals.ts';
import { mainBuilding } from '../rooms.ts';
import { doorFrontOf, objectAt } from '../grid.ts';
import { bestSeatCells, strategyVars, fillTemplate } from '../strategy.ts';
import { serialize, deserialize } from '../save.ts';
import type { GameState } from '../types.ts';
import { at, X, Y } from './helpers.ts';
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
function untilGuest(s: GameState, maxMs = 60_000): number {
  let ms = 0;
  while (s.guests.length === 0 && ms < maxMs) { tick(s, STEP_MS); ms += STEP_MS; }
  return ms;
}
const FORBIDDEN = /→ 지금|정석|시뮬|공략|굴려 보니/;

describe('손으로 하는 튜토리얼 「할망의 가르침」 7단계 (fun-start 시작 3분)', () => {
  it('데이터: sim STEPS 7개와 dialogue/tutorial.json 7개가 key로 1:1, 대사는 2~3줄·22자 이하·금지어 없음, 완성 시작 상태(starter)는 끝난 채', () => {
    expect(TUTORIAL_STEPS).toBe(7);
    expect(STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(STEPS.map((s) => s.key)).toEqual(['seat', 'menu', 'greet', 'hire', 'corner', 'goals', 'graduate']);
    expect(DIALOGUE.map((d) => [d.id, d.key])).toEqual(STEPS.map((s) => [s.id, s.key]));
    const vars = strategyVars(tutorialState());
    for (const d of DIALOGUE) {
      expect(d.speaker).toBe('halmang');
      expect(d.lines.length).toBeGreaterThanOrEqual(2);
      expect(d.lines.length).toBeLessThanOrEqual(3);
      for (const l of [d.title, ...d.lines, d.button, d.done ?? '']) {
        const f = fillTemplate(l, vars);
        expect(f, l).not.toMatch(FORBIDDEN);
        expect(f, l).not.toMatch(/\{[a-zA-Z]+\}/);
        if (d.lines.includes(l)) expect(f.length, f).toBeLessThanOrEqual(22);
      }
    }
    for (const t of Object.values(LOOK_TEXT)) expect(t).not.toMatch(FORBIDDEN);
    expect(LOOK_TEXT.gate).toContain('장식');
    expect(STARTER_FEATURE_IDS).toEqual([]);
    expect(createInitialState(1).tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
    expect(TRACKED_ACTIONS.has('greetGuest')).toBe(true); // 트랙 G 손님 인사 액션 훅
    expect(STEPS[6]!.reward).toContainEqual({ type: 'title', id: 'halmang_pupil', name: '할망의 제자' });
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

  it('1~7단계를 순서대로 손으로 하면 단계마다 보상 상자가 뜨고 step이 오른다 — 첫 손님은 테이블·메뉴 뒤 30초 안(1배속), 전체 3분 안', () => {
    const s = tutorialState();
    const money0 = s.money;
    let realMs = 0;
    // 1: 테이블 — 입지 최고 칸 1개 글로우, 짓기 → 쉼 → 야외 테이블
    seeDialogue(s);
    expect(stepTargets(STEPS[0]!, s)).toEqual(['nav:build', 'tab:rest', 'build:table_out']);
    const glow = STEPS[0]!.cells(s);
    expect(glow).toEqual(bestSeatCells(s, 1));
    expect(glow).toHaveLength(1);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...glow[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toMatchObject({ refId: '1', items: [{ type: 'money', amount: 200_000 }] });
    expect(s.money).toBe(money0 - 50_000 + 200_000); // 야외 테이블 ₩5만 + 보상 ₩20만
    clearAlerts(s);
    // 2: 메뉴판에 아메리카노
    seeDialogue(s);
    expect(canOpen(s)).toBe(false);
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(canOpen(s)).toBe(true);
    clearAlerts(s);
    // 3: 첫 손님 — 정류장 글로우 → 손님이 오면 그 손님 칸, 탭해서 인사(트랙 G greetGuest) 또는 손님 카드
    seeDialogue(s);
    expect(STEPS[2]!.cells(s)).toEqual([{ x: X(0), y: Y(7) }]); // 정류장
    const wait = untilGuest(s);
    realMs += wait;
    expect(s.guests.length).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(30_000); // 1배속 30초 안에 첫 손님
    const g = s.guests[0]!;
    expect(STEPS[2]!.cells(s)).toEqual([{ x: Math.round(g.x), y: Math.round(g.y) }]);
    expect(greetedGuest(s)).toBe(false);
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'guestCard' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(lastReward(s)).toMatchObject({ refId: '3', items: [{ type: 'tickets', n: 1 }] });
    clearAlerts(s);
    // 4: 직원 채용 (홀 권장, 아무 직종이나 1명이면 통과)
    seeDialogue(s);
    const c = s.candidates[0]!;
    expect(apply(s, { type: 'hire', candidateId: c.id, role: 'hall' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(4);
    expect(lastReward(s)).toMatchObject({ refId: '4' });
    clearAlerts(s);
    // 5: 첫 코너 — 꽃(화분) 놓기 → 벤치 놓기, 글로우는 빠진 것 하나씩·짓기 탭 타깃도 빠진 것
    seeDialogue(s);
    expect(cornerMade(s)).toBe(false);
    const flower = cornerFlowerType(s), bench = cornerBenchType(s);
    expect(s.unlocked.objects).toContain(flower);
    expect(s.unlocked.objects).toContain(bench);
    expect(cornerMissingType(s)).toBe(flower);
    expect(stepTargets(STEPS[4]!, s)).toEqual(['nav:build', 'tab:sceneryDeco', `build:${flower}`]);
    const f = cornerCells(s);
    expect(f).toHaveLength(1);
    expect(Math.max(Math.abs(f[0]!.x - glow[0]!.x), Math.abs(f[0]!.y - glow[0]!.y))).toBeLessThanOrEqual(CORNER_RADIUS); // 테이블 옆
    expect(apply(s, { type: 'place', objectType: flower, ...f[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(4);
    expect(cornerMissingType(s)).toBe(bench);
    expect(stepTargets(STEPS[4]!, s)).toEqual(['nav:build', 'tab:sceneryDeco', `build:${bench}`]);
    const b = cornerCells(s);
    expect(b).toHaveLength(1);
    expect(Math.max(Math.abs(b[0]!.x - f[0]!.x), Math.abs(b[0]!.y - f[0]!.y))).toBeLessThanOrEqual(CORNER_RADIUS); // 꽃 옆
    expect(apply(s, { type: 'place', objectType: bench, ...b[0]! }).ok).toBe(true);
    expect(cornerMade(s)).toBe(true);
    expect(s.tutorial.step).toBe(5);
    expect(lastReward(s)).toMatchObject({ refId: '5' });
    clearAlerts(s);
    // 6: 목표 창 열어 보기 — 목표 줄 글로우, 보상 없음
    seeDialogue(s);
    expect(stepTargets(STEPS[5]!, s)).toEqual(['goal-bar']);
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'goalWindow' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(6);
    expect(lastReward(s)).toBeUndefined(); // 6단계 상자 없음
    // 7: 끝 — 대사만 닫으면 칭호 「할망의 제자」
    seeDialogue(s);
    expect(s.tutorial.step).toBe(7);
    expect(tutorialDone(s)).toBe(true);
    expect(s.titles).toContain('halmang_pupil');
    expect(lastReward(s)).toMatchObject({ refId: '7' });
    // 전체: 기다린 시간은 첫 손님뿐 — 3분(180초) 안
    expect(realMs).toBeLessThan(180_000);
    // 끝난 뒤엔 표식을 안 남기고, 스포트라이트 칸도 없다
    expect(noteTutorial(s, 'guestCard')).toBe(false);
    expect(currentTutorialStep(s)).toBeNull();
  });

  it('트랙 C 코너 훅: state.corners에 코너가 하나라도 있으면 꽃·벤치 없이도 5단계가 찬다; 꽃과 벤치가 멀면(반경 2 밖) 안 찬다', () => {
    const s = tutorialState();
    expect(cornerMade(s)).toBe(false);
    (s as unknown as { corners: unknown[] }).corners = [{ id: 'flower_path' }];
    expect(cornerMade(s)).toBe(true);
    const t = tutorialState();
    expect(apply(t, { type: 'place', objectType: cornerFlowerType(t), ...at(1, 1) }).ok).toBe(true);
    expect(apply(t, { type: 'place', objectType: cornerBenchType(t), ...at(8, 5) }).ok).toBe(true);
    expect(cornerMade(t)).toBe(false);
    expect(cornerMissingType(t)).toBe(cornerBenchType(t)); // 꽃 옆에 벤치 하나 더
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

  it('건너뛰기(skipTutorialChapter): 어느 단계에서든 남은 단계 전부 — 해금만 조용히, 돈·응모권·칭호 없음. 「이미 알아요」(skipTutorialStep)는 한 단계만', () => {
    const s = tutorialState();
    seeDialogue(s);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(1);
    clearAlerts(s);
    const money = s.money, tickets = s.tickets;
    expect(skipTutorialStep(s)).toBe(2);
    expect(s.tutorial.step).toBe(2);
    expect(s.tutorial.skipped).toBe(false);
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(TUTORIAL_STEPS);
    expect(s.tutorial.skipped).toBe(true);
    expect(s.money).toBe(money);
    expect(s.tickets).toBe(tickets);
    expect(s.titles).not.toContain('halmang_pupil');
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0);
    expect(skipTutorialChapter(s)).toBe(0);
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(false);
    // 0단계에서 건너뛰면 완성 시작 상태로 채워 바로 영업
    const u = tutorialState();
    expect(apply(u, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(canOpen(u)).toBe(true);
    expect(tutorialDone(u)).toBe(true);
  });

  it('저장: 표식(seen)·진행이 저장되고 불러온 뒤 이어 간다; 결정적(같은 시드·같은 행동 → 같은 상태)', () => {
    const s = tutorialState(3);
    seeDialogue(s);
    apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) });
    apply(s, { type: 'tutorialNote', key: 'dlg:2' });
    const r = deserialize(serialize(s));
    expect(r.tutorial).toEqual(s.tutorial);
    expect(r.tutorial.seen).toContain('dlg:1');
    expect(apply(r, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(r.tutorial.step).toBe(2);
    const a = tutorialState(5), b = tutorialState(5);
    for (const x of [a, b]) { seeDialogue(x); apply(x, { type: 'place', objectType: 'table_out', ...at(3, 4) }); seeDialogue(x); apply(x, { type: 'setSlot', slot: 0, menuId: 'americano' }); seeDialogue(x); tick(x, DAY_MS); }
    expect(serialize(a)).toBe(serialize(b));
    expect(doorFrontOf(mainBuilding(a)!)).toEqual(at(3, 3));
  });
});

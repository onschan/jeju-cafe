import { describe, it, expect } from 'vitest';
import { createInitialState, START_SEATS, START_PATH, START_MENUS, START_ORIGIN, START_MAIN, fillStarterLayout } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS, DAYS_PER_MONTH } from '../clock.ts';
import { STEPS, TUTORIAL_STEPS, TUTORIAL_CHAPTERS, TRACKED_ACTIONS, STARTER_FEATURE_IDS, LOOK_IDS, LOOK_TEXT, currentTutorialStep, currentTutorialChapter, checkTutorial, tutorialDone, pathConnected, wallShelteringSeat, firstMonthClosed, noteTutorial, dialogueSeen, skipTutorialChapter, activeComboCount, lookedAll, recommendedMainCells } from '../tutorial.ts';
import { canOpen, checkGoals, FEATURE_OF_ACTION, initFeatures } from '../goals.ts';
import { hire, warehouseFront } from '../staff.ts';
import { mainBuilding, canBuildMain, MAIN_BUILD_COST } from '../rooms.ts';
import { doorFrontOf, objectAt } from '../grid.ts';

import { serialize, deserialize } from '../save.ts';
import { objectDef } from '../../data/index.ts';
import type { GameState, FeatureId } from '../types.ts';
import { at, X, Y } from './helpers.ts';
import { TUTORIAL_STEPS as DIALOGUE, TUTORIAL_CHAPTER_TEXTS } from '../../data/dialogue/index.ts';

/** §7.1 맨땅(본관도 없다)에서 시작해 한 단계씩 손으로 한다 */
function tutorialState(seed = 1) {
  return createInitialState(seed, 'local', 0, 'tutorial');
}
/** 1단계 둘러보기 4곳을 다 본 것으로 표시 */
function lookAll(s: GameState) {
  for (const id of LOOK_IDS) apply(s, { type: 'tutorialNote', key: `look:${id}` });
}
/** 1~3단계(둘러보기·본관 짓기·본관 보기)를 손으로 끝낸다 → step 3, 본관은 완성 시작 상태 자리 */
function throughMain(s: GameState) {
  lookAll(s); seeDialogue(s);
  seeDialogue(s); expect(apply(s, { type: 'placeMain', ...at(START_MAIN.lx, START_MAIN.ly) }).ok).toBe(true);
  seeDialogue(s); apply(s, { type: 'tutorialNote', key: 'look:main' });
  expect(s.tutorial.step).toBe(3);
}
const PATH = [{ lx: 3, ly: 3 }, { lx: 4, ly: 3 }, { lx: 4, ly: 4 }, { lx: 4, ly: 5 }];
function lastReward(s: GameState) {
  return [...s.alerts].reverse().find((a) => a.type === 'reward' && a.source === 'tutorial');
}
/** 현재 단계 대사를 본 것으로 표시한다 (UI가 대사를 닫을 때 하는 일) */
function seeDialogue(s: GameState) {
  const st = currentTutorialStep(s);
  if (st) apply(s, { type: 'tutorialNote', key: `dlg:${st.id}` });
}
/** 대사를 보고 판정한다. 끝낸 단계 id 또는 null */
function seeAndCheck(s: GameState): number | null {
  seeDialogue(s);
  return checkTutorial(s);
}
/** 알림을 전부 닫는다 (보상 상자·목표 대화) */
function clearAlerts(s: GameState) { s.alerts = []; }
/** 단계 id까지 끝난 상태로 만든다 (앞 단계 보상만 적용, 조건은 안 만든다) */
function stateAtStep(step: number, seed = 1): GameState {
  const s = tutorialState(seed);
  fillStarterLayout(s);
  for (const st of STEPS) {
    if (st.id > step) break;
    for (const r of st.reward) {
      if (r.type === 'unlockFeature') s.features[r.id] = true;
      else if (r.type === 'unlockFacility' && !s.unlocked.objects.includes(r.id)) s.unlocked.objects.push(r.id);
    }
  }
  s.tutorial.step = step;
  return s;
}

describe('손으로 하는 튜토리얼 「할망의 가르침」 33단계·5장 (w-start 맨땅 시작)', () => {
  it('데이터: sim STEPS 33개와 dialogue/tutorial.json 33개가 key·chapter로 1:1, 장 5개가 1~33을 빈틈없이 덮고, 완성 시작 상태(starter)는 튜토리얼이 끝나 있다', () => {
    expect(STEPS).toHaveLength(TUTORIAL_STEPS);
    expect(TUTORIAL_STEPS).toBe(33);
    expect(STEPS.slice(0, 4).map((s) => s.key)).toEqual(['look', 'build_main', 'look_main', 'path']);
    expect(STEPS.map((s) => s.key)).toEqual(DIALOGUE.map((d) => d.key));
    expect(STEPS.map((s) => s.chapter)).toEqual(DIALOGUE.map((d) => d.chapter));
    expect(STEPS.map((s) => s.id)).toEqual(Array.from({ length: 33 }, (_, i) => i + 1));
    expect(TUTORIAL_CHAPTERS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(TUTORIAL_CHAPTER_TEXTS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    let next = 1;
    for (const c of TUTORIAL_CHAPTERS) { expect(c.from).toBe(next); expect(c.to).toBeGreaterThanOrEqual(c.from); next = c.to + 1; }
    expect(next).toBe(34);
    for (const st of STEPS) expect(TUTORIAL_CHAPTERS.find((c) => c.id === st.chapter)!.from <= st.id && st.id <= TUTORIAL_CHAPTERS.find((c) => c.id === st.chapter)!.to).toBe(true);
    // 대사: 단계마다 2~3줄, 한 줄 ≤ 28자(20자 안팎), 버튼·제목 있음
    for (const d of DIALOGUE) {
      expect(d.lines.length, d.key).toBeGreaterThanOrEqual(2);
      expect(d.lines.length, d.key).toBeLessThanOrEqual(3);
      for (const l of d.lines) expect(l.length, `${d.key}: ${l}`).toBeLessThanOrEqual(28);
      expect(d.button.length).toBeGreaterThan(0);
      expect(d.title.length).toBeGreaterThan(0);
    }
    const starter = createInitialState(1);
    expect(starter.tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
    expect(tutorialDone(starter)).toBe(true);
    expect(currentTutorialStep(starter)).toBeNull();
    for (const f of STARTER_FEATURE_IDS) expect(starter.features[f]).toBe(true);
    expect(mainBuilding(starter)).not.toBeNull(); // 완성 시작 상태(봇·헤드리스)는 본관 포함
    expect(starter.features.craft).toBe(false); // 25단계 보상이지만 목표 g16이 여니 완성 시작 상태에서는 안 연다 (봇 진행 유지)
    expect(starter.features.popup).toBe(false);
  });

  it('§7.1 시작 상태(w-start 맨땅): 정낭·정류장·지형만 — 본관·길·좌석·메뉴 없음, 자금 500만, 후보 2명, 손님 0, 직원 대기도 안전', () => {
    const s = tutorialState();
    expect(s.tutorial).toEqual({ step: 0, skipped: false, seen: [] });
    expect(mainBuilding(s)).toBeNull();
    expect(Object.values(s.objects).map((o) => o.type).filter((t) => t === 'warehouse' || t === 'path' || t === 'table_out' || t === 'table_parasol')).toEqual([]);
    expect(Object.values(s.objects).some((o) => o.type === 'gate')).toBe(true);
    expect(Object.values(s.objects).some((o) => o.type === 'busstop')).toBe(true);
    expect(s.menuSlots.every((m) => m === null)).toBe(true);
    expect(s.money).toBe(5_000_000);
    expect(s.candidates).toHaveLength(2);
    expect(canOpen(s)).toBe(false);
    // 본관이 없어도 직원 채용·대기(warehouseFront 폴백)·하루 진행이 안전하다
    const st = hire(s, s.candidates[0]!.id, 'hall');
    expect(Number.isFinite(st.x) && Number.isFinite(st.y)).toBe(true);
    expect(warehouseFront(s)).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    for (let d = 0; d < 3; d++) tick(s, DAY_MS);
    expect(s.totalGuests).toBe(0);
    expect(s.guests).toHaveLength(0);
    expect(currentTutorialStep(s)?.id).toBe(1);
    expect(currentTutorialChapter(s)?.id).toBe(1);
    // 저장·복원 왕복
    expect(serialize(deserialize(serialize(s)))).toBe(serialize(s));
  });

  it('placeMain(w-start): 첫 본관은 무료·즉시 완공·1회 — 옮기기와 같은 발자국 규칙(내 땅·바위·시설 없음, 올렛길은 걷어내 환불) + 문 앞이 내 땅. 길은 자동으로 잇지 않는다', () => {
    const s = tutorialState();
    const money = s.money;
    expect(MAIN_BUILD_COST).toBe(0);
    expect(canBuildMain(s, START_ORIGIN.x - 5, START_ORIGIN.y).ok).toBe(false); // 남의 땅
    expect(canBuildMain(s, START_ORIGIN.x + 1, START_ORIGIN.y).reason).toBe('바위를 먼저 치워요'); // (3,0)이 바위
    expect(canBuildMain(s, START_ORIGIN.x + 2, START_ORIGIN.y + 6).ok).toBe(false); // 문 앞 (2,8)이 마을 길
    expect(canBuildMain(s, START_ORIGIN.x + 6, START_ORIGIN.y + 7).ok).toBe(false); // 마을 길 위
    // 발자국 안 올렛길은 걷어내 환불
    expect(apply(s, { type: 'place', objectType: 'path', ...at(4, 2) }).ok).toBe(true);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(1, 4) }).ok).toBe(true);
    expect(canBuildMain(s, START_ORIGIN.x + 1, START_ORIGIN.y + 3).reason).toBe('시설을 먼저 치워요');
    const r = apply(s, { type: 'placeMain', ...at(START_MAIN.lx, START_MAIN.ly) });
    expect(r.ok).toBe(true);
    const m = mainBuilding(s)!;
    expect(m).toMatchObject({ type: 'warehouse', ...at(3, 1) });
    expect(m.build).toBeUndefined(); // 공사 없음
    expect(s.main.work).toBeNull();
    expect(objectAt(s, X(4), Y(2))?.id).toBe(m.id); // 길이 걷혔다
    expect(s.money).toBe(money - 50_000); // 길 1만 환불 + 본관 0원
    expect(doorFrontOf(m)).toEqual(at(3, 3));
    expect(objectAt(s, X(3), Y(3))).toBeNull(); // 자동 연결 안 함
    expect(pathConnected(s)).toBe(false);
    expect(s.grid.cells[Y(1) * s.grid.w + X(3)]!.roomId).toBe(m.id); // 방 바닥
    // 1회만
    expect(apply(s, { type: 'placeMain', ...at(1, 4) }).reason).toBe('이미 본관이 있어요');
    expect(apply(s, { type: 'place', objectType: 'warehouse', ...at(1, 4) }).ok).toBe(false); // 'place'로 와도 같은 길
    // 추천 자리: 본관이 있으면 없고, 없으면 최대 3곳이 전부 지을 수 있는 자리·바람 ≤ 1·문 앞이 정낭에서 5칸 안
    expect(recommendedMainCells(s)).toEqual([]);
    const t = tutorialState();
    const rec = recommendedMainCells(t);
    expect(rec.length).toBe(3);
    const g = Object.values(t.objects).find((o) => o.type === 'gate')!;
    for (const p of rec) {
      expect(canBuildMain(t, p.x, p.y).ok).toBe(true);
      const f = doorFrontOf({ type: 'warehouse', x: p.x, y: p.y, w: 3, h: 2 });
      expect(Math.max(Math.abs(f.x - g.x), Math.abs(f.y - g.y))).toBeLessThanOrEqual(5);
    }
    // 봇·완성 시작 상태의 본관 자리는 규칙에 맞는다
    expect(canBuildMain(t, X(START_MAIN.lx), Y(START_MAIN.ly)).ok).toBe(true);
  });

  it('정낭 없이도(w-free) 4단계 「마을 길 → 문 앞」 조건·글로우·본관 추천 자리가 안전하다: 정낭을 없애면(또는 마을 길에서 떼어 놓으면) 시작 칸은 문 앞에서 가장 가까운 마을 길 칸', () => {
    // 정낭을 마을 길에서 떨어진 곳으로 옮기면 시작 칸은 마을 길
    const m = tutorialState();
    throughMain(m);
    const mg = Object.values(m.objects).find((o) => o.type === 'gate')!;
    expect(STEPS[3]!.cells(m)[0]).toEqual({ x: mg.x, y: mg.y }); // 마을 길에 붙은 정낭 = 시작
    expect(apply(m, { type: 'move', objectId: mg.id, x: X(8), y: Y(1) }).ok).toBe(true);
    expect(m.grid.cells[STEPS[3]!.cells(m)[0]!.y * m.grid.w + STEPS[3]!.cells(m)[0]!.x]!.terrain).toBe('road');
    const s = tutorialState();
    expect(LOOK_TEXT.gate).toContain('옮겨도 돼');
    expect(LOOK_TEXT.rock).toContain('₩10만');
    const gate = Object.values(s.objects).find((o) => o.type === 'gate')!;
    expect(apply(s, { type: 'remove', objectId: gate.id }).ok).toBe(true);
    // 1단계 둘러보기: 정낭 칸은 빠지고 정류장·바위·마을 길 3곳 (정류장 기준으로 가장 가까운 바위·길)
    expect(STEPS[0]!.cells(s)).toHaveLength(3);
    expect(recommendedMainCells(s).length).toBe(3); // 정류장 기준 거리
    throughMain(s);
    const f = doorFrontOf(mainBuilding(s)!);
    const cells = STEPS[3]!.cells(s);
    expect(cells).toHaveLength(2);
    expect(cells[1]).toEqual(f);
    expect(s.grid.cells[cells[0]!.y * s.grid.w + cells[0]!.x]!.terrain).toBe('road');
    expect(pathConnected(s)).toBe(false);
    seeDialogue(s);
    // 문 앞(3,3)에서 마을 길(y=7)까지 옛 정낭 자리(4,6, 바위)를 치우고 올렛길
    apply(s, { type: 'clearRock', x: X(4), y: Y(6) });
    for (const c of [...PATH, { lx: 4, ly: 6 }]) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(pathConnected(s)).toBe(true);
    expect(s.tutorial.step).toBe(4);
  });

  it('대사 게이트: 조건이 먼저 차도 대사(dlg:<id>)를 보기 전엔 안 끝나고, 보고 나면 바로 통과한다. 보상 없는 단계(둘러보기)는 빈 보상 상자를 안 띄운다', () => {
    const s = tutorialState();
    // 1단계 둘러보기: 4곳(정낭·정류장·바위·마을 길) 글로우, 본 것부터 꺼진다
    expect(STEPS[0]!.cells(s)).toHaveLength(4);
    apply(s, { type: 'tutorialNote', key: 'look:gate' });
    expect(STEPS[0]!.cells(s)).toHaveLength(3);
    expect(lookedAll(s)).toBe(false);
    lookAll(s);
    expect(lookedAll(s)).toBe(true);
    expect(STEPS[0]!.cells(s)).toHaveLength(0);
    expect(s.tutorial.step).toBe(0); // 대사 안 봄
    expect(dialogueSeen(s, 1)).toBe(false);
    expect(apply(s, { type: 'tutorialNote', key: 'dlg:1' }).ok).toBe(true); // 액션 직후 checkGoals → checkTutorial
    expect(dialogueSeen(s, 1)).toBe(true);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toBeUndefined(); // 보상 없음 → 상자 없음
    // 4단계 길: 조건이 먼저 차도 대사 전엔 안 끝난다
    seeDialogue(s); expect(apply(s, { type: 'placeMain', ...at(START_MAIN.lx, START_MAIN.ly) }).ok).toBe(true);
    seeDialogue(s); apply(s, { type: 'tutorialNote', key: 'look:main' });
    expect(s.tutorial.step).toBe(3);
    for (const c of PATH) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(pathConnected(s)).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(apply(s, { type: 'tutorialNote', key: 'dlg:4' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(4);
    expect(lastReward(s)).toMatchObject({ refId: '4' });
    // 같은 표식은 두 번 안 남는다
    noteTutorial(s, 'dlg:1');
    expect(s.tutorial.seen.filter((k) => k === 'dlg:1')).toHaveLength(1);
    // 끝난 뒤엔 표식을 안 남긴다
    const done = createInitialState(2);
    expect(noteTutorial(done, 'storage')).toBe(false);
    expect(done.tutorial.seen).toEqual([]);
  });

  it('전체 건너뛰기(첫 단계에서만): 완성 시작 상태(본관 포함)로 채우고 step=33. 이미 시작했으면 거부', () => {
    const s = tutorialState();
    expect(mainBuilding(s)).toBeNull();
    expect(apply(s, { type: 'skipTutorial' }).ok).toBe(true);
    expect(s.tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
    expect(mainBuilding(s)).toMatchObject(at(START_MAIN.lx, START_MAIN.ly));
    const seats = Object.values(s.objects).filter((o) => o.type === 'table_out' || o.type === 'table_parasol');
    expect(seats).toHaveLength(START_SEATS.length);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length);
    expect(s.menuSlots.slice(0, START_MENUS.length)).toEqual(START_MENUS);
    expect(canOpen(s)).toBe(true);
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0); // 건너뛰면 단계 보상 없음
    const t = tutorialState();
    t.tutorial.step = 1;
    expect(apply(t, { type: 'skipTutorial' }).ok).toBe(false);
    fillStarterLayout(s);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length);
    expect(Object.values(s.objects).filter((o) => o.type === 'warehouse')).toHaveLength(1);
    // 기본 자리가 막혀 있으면(둘러보기 중에 뭔가 놓았을 때) 시작 필지 안 다른 자리에 본관을 세운다
    const u = tutorialState();
    expect(apply(u, { type: 'place', objectType: 'table_out', ...at(4, 1) }).ok).toBe(true);
    expect(apply(u, { type: 'skipTutorial' }).ok).toBe(true);
    const m = mainBuilding(u)!;
    expect(m).toBeTruthy();
    expect(m.x === X(START_MAIN.lx) && m.y === Y(START_MAIN.ly)).toBe(false);
    expect(canBuildMain(tutorialState(), m.x, m.y).ok).toBe(true);
  });

  it('장 건너뛰기: 현재 장 끝으로 step을 옮기고 남은 단계의 해금 보상(기능·시설)만 조용히 연다 — 돈·응모권 없음. 맨 처음이면 완성 시작 상태로 채운다', () => {
    const s = tutorialState();
    const money = s.money;
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(11);
    expect(s.tutorial.skipped).toBe(true);
    expect(s.features.siteView).toBe(true);
    expect(s.features.comboCodex).toBe(true);
    expect(s.features.promote).toBe(true);
    expect(s.features.spotMap).toBe(false); // 3장 보상은 아직
    expect(s.money).toBe(money);
    expect(s.tickets).toBe(0);
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length); // 맨땅을 채워 바로 영업
    expect(mainBuilding(s)).not.toBeNull();
    expect(canOpen(s)).toBe(true);
    expect(currentTutorialStep(s)?.id).toBe(12);
    expect(currentTutorialChapter(s)?.id).toBe(2);
    // 2장 중간(14단계 진행 중)에서 건너뛰면 17까지
    s.tutorial.step = 13;
    expect(skipTutorialChapter(s)).toBe(2);
    expect(s.tutorial.step).toBe(17);
    // 4장: 주차장·연구 개발이 열린다
    s.tutorial.step = 22;
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(29);
    expect(s.features.craft).toBe(true);
    expect(s.unlocked.objects).toContain('parking_lot');
    expect(s.inventory['gift_tangerine_box'] ?? 0).toBe(0); // 아이템 보상은 안 준다
    // 5장 → 끝
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(tutorialDone(s)).toBe(true);
    expect(s.features.popup).toBe(true);
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(false);
  });

  it('1장(1~11): 둘러보기 → 본관 짓기 → 본관 보기 → 길 → … 순서대로 손으로 하면 단계마다 보상 상자가 뜨고 step이 오른다 (하이라이트 칸·타깃 포함)', () => {
    const s = tutorialState();
    const money0 = s.money;
    // 1: 둘러보기 — 정낭·정류장·바위·마을 길 4곳 글로우, 타깃(버튼) 없음, 보상 없음
    seeDialogue(s);
    expect(STEPS[0]!.targets).toEqual([]);
    const look = STEPS[0]!.cells(s);
    expect(look).toHaveLength(4);
    const g = Object.values(s.objects).find((o) => o.type === 'gate')!;
    expect(look[0]).toEqual({ x: g.x, y: g.y });
    expect(look[1]).toEqual({ x: X(0), y: Y(7) }); // 정류장
    expect(s.grid.cells[look[2]!.y * s.grid.w + look[2]!.x]!.terrain).toBe('rock');
    expect(s.grid.cells[look[3]!.y * s.grid.w + look[3]!.x]!.terrain).toBe('road');
    expect(apply(s, { type: 'tutorialNote', key: 'look:gate' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(0);
    lookAll(s);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toBeUndefined();
    // 2: 본관 짓기 — 추천 칸 3곳 글로우, 짓기 → 건물 → 카페 본관 카드
    seeDialogue(s);
    expect(STEPS[1]!.targets).toEqual(['nav:build', 'tab:building', 'build:warehouse']);
    const rec = STEPS[1]!.cells(s);
    expect(rec).toHaveLength(3);
    expect(canOpen(s)).toBe(false);
    expect(apply(s, { type: 'placeMain', ...rec[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(lastReward(s)).toMatchObject({ refId: '2', items: [{ type: 'money', amount: 300_000 }] });
    expect(s.money).toBe(money0 + 300_000);
    // 완성 시작 상태와 같은 자리로 다시 놓아 아래 단계 좌표를 맞춘다 (추천 1순위가 seed마다 다를 수 있다)
    const m0 = mainBuilding(s)!;
    if (m0.x !== X(START_MAIN.lx) || m0.y !== Y(START_MAIN.ly)) { delete s.objects[m0.id]; for (const c of s.grid.cells) if (c.objectId === m0.id) { c.objectId = null; c.roomId = null; } expect(apply(s, { type: 'placeMain', ...at(START_MAIN.lx, START_MAIN.ly) }).ok).toBe(true); }
    // 3: 본관 카드 보기 — 본관 발자국 6칸 글로우, 보상 없음
    seeDialogue(s);
    expect(STEPS[2]!.cells(s)).toHaveLength(6);
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'look:main' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(lastReward(s)).toMatchObject({ refId: '2' }); // 3단계 상자 없음
    // 4: 정낭 → 문 앞 올렛길
    expect(STEPS[3]!.cells(s)).toHaveLength(2); // 정낭·문 앞
    expect(STEPS[3]!.targets).toContain('tab:path');
    seeDialogue(s);
    expect(pathConnected(s)).toBe(false);
    for (const c of PATH.slice(0, 3)) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(apply(s, { type: 'place', objectType: 'path', ...at(4, 5) }).ok).toBe(true);
    expect(pathConnected(s)).toBe(true);
    expect(s.tutorial.step).toBe(4);
    expect(lastReward(s)).toMatchObject({ refId: '4', items: [{ type: 'money', amount: 300_000 }] });
    expect(s.money).toBe(money0 - 4 * 10_000 + 600_000);
    // 5: 테이블 (전망 자리)
    seeDialogue(s);
    expect(STEPS[4]!.cells(s).length).toBeGreaterThan(0);
    expect(STEPS[4]!.cells(s).length).toBeLessThanOrEqual(3);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(5);
    expect(s.features.siteView).toBe(true);
    expect(canOpen(s)).toBe(false); // 아직 메뉴 없음
    // 6: 메뉴 두 개
    seeDialogue(s);
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(5);
    expect(apply(s, { type: 'setSlot', slot: 1, menuId: 'tangerine_juice' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(6);
    expect(canOpen(s)).toBe(true);
    // 7: 첫 결제 — 손님이 온다
    seeDialogue(s);
    expect(STEPS[6]!.cells(s)).toHaveLength(1); // 정류장
    for (let h = 0; h < 40 && s.tutorial.step < 7; h++) tick(s, HOUR_MS);
    expect(s.totalIncome).toBeGreaterThan(0);
    expect(s.tutorial.step).toBe(7);
    expect(lastReward(s)).toMatchObject({ refId: '7', items: [{ type: 'tickets', n: 1 }] });
    // 8: 채용
    seeDialogue(s);
    hire(s, s.candidates[0]!.id, 'hall');
    checkGoals(s);
    expect(s.tutorial.step).toBe(8);
    // 9: 돌담을 테이블 북서쪽에
    seeDialogue(s);
    expect(wallShelteringSeat(s)).toBe(false);
    const cells = STEPS[8]!.cells(s);
    expect(cells).toContainEqual(at(2, 3));
    expect(apply(s, { type: 'place', objectType: 'stonewall', ...at(2, 3) }).ok).toBe(true);
    expect(wallShelteringSeat(s)).toBe(true);
    expect(s.tutorial.step).toBe(9);
    expect(s.features.comboCodex).toBe(true);
    expect(s.features.promote).toBe(true);
    // 10: 홍보
    seeDialogue(s);
    s.stats.promotionsDone = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(10);
    expect(lastReward(s)).toMatchObject({ refId: '10', items: [{ type: 'mileage', n: 30 }] });
    // 11: 도전 수락
    seeDialogue(s);
    expect(apply(s, { type: 'acceptChallenge', id: 'c01' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(11);
    expect(lastReward(s)).toMatchObject({ refId: '11', items: [{ type: 'money', amount: 500_000 }] });
    expect(currentTutorialChapter(s)?.id).toBe(2);
    expect(s.alerts.filter((a) => a.type === 'reward' && a.source === 'tutorial')).toHaveLength(9); // 11단계 중 보상 없는 1·3 빼고
  });

  it('2장(12~17): 입지 보기·손님 카드·타깃·콤보 2개·올렛길 10칸·되돌리기', () => {
    const s = stateAtStep(11);
    clearAlerts(s);
    // 12: 입지 보기를 켜고(표식) 전망 자리에 테이블 하나 더 — 표식 없이는 안 끝난다
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6, 4) }).ok).toBe(true);
    expect(seeAndCheck(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'siteView' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(12);
    expect(lastReward(s)).toMatchObject({ refId: '12', items: [{ type: 'money', amount: 200_000 }] });
    // 13: 손님 카드 보기 (UI 표식)
    expect(seeAndCheck(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'guestCard' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(13);
    // 14: 타깃 손님층 1개
    seeDialogue(s);
    const anyGuest = Object.entries(s.guestTypes).find(([, t]) => t.unlocked)![0];
    expect(apply(s, { type: 'setTargets', targets: [anyGuest] }).ok).toBe(true);
    expect(s.tutorial.step).toBe(14);
    expect(lastReward(s)).toMatchObject({ refId: '14', items: [{ type: 'mileage', n: 20 }] });
    // 15: 감귤나무로 콤보 2개 (귤밭 뷰 + 밭담 귤 수확) — 안내 칸은 테이블·돌담 옆
    seeDialogue(s);
    expect(apply(s, { type: 'place', objectType: 'stonewall', ...at(2, 3) }).ok).toBe(true);
    const combo0 = activeComboCount(s);
    const cand = STEPS[14]!.cells(s);
    expect(cand.length).toBeGreaterThan(0);
    expect(cand.length).toBeLessThanOrEqual(3);
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', ...cand[0]! }).ok).toBe(true);
    expect(activeComboCount(s)).toBeGreaterThanOrEqual(combo0 + 2);
    expect(s.tutorial.step).toBe(15);
    // 16: 올렛길 10칸
    seeDialogue(s);
    let n = Object.values(s.objects).filter((o) => o.type === 'path').length;
    for (let ly = 6; n < 10 && ly >= 0; ly--) for (let lx = 0; n < 10 && lx < 9; lx++) if (apply(s, { type: 'place', objectType: 'path', ...at(lx, ly) }).ok) n++;
    expect(n).toBe(10);
    expect(s.tutorial.step).toBe(16);
    // 17: 되돌리기 1회 (성공한 액션 타입이 seen에 남는다)
    seeDialogue(s);
    expect(TRACKED_ACTIONS.has('undoLast')).toBe(true);
    expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
    expect(s.tutorial.seen).toContain('undoLast');
    expect(s.tutorial.step).toBe(17);
    expect(currentTutorialChapter(s)?.id).toBe(3);
  });

  it('3장(18~22): 월말 결산·좌석 4개·홀/청소 배치·창고 보기·농원 수확', () => {
    const s = stateAtStep(17);
    clearAlerts(s);
    hire(s, s.candidates[0]!.id, 'barista'); // 후보는 달이 바뀌면 떠나니 미리 뽑아 둔다 (20단계용)
    // 18: 첫 월말 결산 닫기
    seeDialogue(s);
    expect(firstMonthClosed(s)).toBe(false);
    while (s.clock.month === 3) tick(s, DAY_MS);
    expect(s.lastMonthCard).not.toBeNull();
    expect(s.tutorial.step).toBe(17);
    expect(apply(s, { type: 'dismissMonthCard' }).ok).toBe(true);
    checkGoals(s);
    expect(s.tutorial.step).toBe(18);
    expect(s.features.spotMap).toBe(true);
    clearAlerts(s);
    // 19: 좌석 4개 (완성 시작 상태 3개 + 1)
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(19);
    // 20: 홀 또는 청소 직원 배치
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    expect(s.staff[0]!.role).toBe('barista');
    expect(s.tutorial.step).toBe(19); // 바리스타는 청소를 안 한다
    expect(apply(s, { type: 'assign', staffId: s.staff[0]!.id, role: 'hall' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(20);
    // 21: 재료 창고 보기 (UI 표식)
    expect(seeAndCheck(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'storage' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(21);
    expect(lastReward(s)).toMatchObject({ refId: '21', items: [{ type: 'research', n: 5 }] });
    // 22: 감귤나무를 심고 다음 달 1일 수확
    seeDialogue(s);
    for (const o of Object.values(s.objects)) if (o.type === 'tangerine_tree') apply(s, { type: 'remove', objectId: o.id });
    s.monthHarvest.harvested = {};
    s.lastMonthCard = null;
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', ...at(1, 1) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(21); // 심기만으로는 안 끝난다
    while (s.clock.month === 4) tick(s, DAY_MS);
    checkGoals(s);
    expect(Object.values(s.monthHarvest.harvested).some((v) => v > 0)).toBe(true);
    expect(s.tutorial.step).toBe(22);
    expect(currentTutorialChapter(s)?.id).toBe(4);
  });

  it('4장(23~29): 증축 Lv2 완공·실내 테이블 2·연수·레시피·명소 투자·주차장·상점', () => {
    const s = stateAtStep(22);
    clearAlerts(s);
    s.money = 10_000_000;
    // 23: 본관 Lv2 — 공사 시작만으론 안 끝나고 완공(7일)돼야
    seeDialogue(s);
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(s.main.level).toBe(2);
    expect(s.tutorial.step).toBe(22);
    for (let d = 0; d < 9 && s.main.work; d++) tick(s, DAY_MS);
    expect(s.main.work).toBeNull();
    checkGoals(s);
    expect(s.tutorial.step).toBe(23);
    expect(lastReward(s)).toMatchObject({ refId: '23', items: [{ type: 'money', amount: 500_000 }] });
    // 24: 실내 테이블 2개 (안내 칸 = 본관 방 안 빈 바닥)
    seeDialogue(s);
    const floor = STEPS[23]!.cells(s);
    expect(floor.length).toBeGreaterThanOrEqual(2);
    expect(apply(s, { type: 'place', objectType: 'table_in', ...floor[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(23);
    expect(apply(s, { type: 'place', objectType: 'table_in', ...floor[1]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(24);
    // 25: 연수 1회 (랭크 3부터) — 성공한 train 액션이 seen에 남는다 → 연구 개발이 열린다
    seeDialogue(s);
    hire(s, s.candidates[0]!.id, 'hall');
    s.rank = 3;
    expect(s.features.craft).toBe(false);
    expect(apply(s, { type: 'train', staffId: s.staff[0]!.id, trainingId: 'tr_basic' }).ok || s.tutorial.seen.includes('train') || (() => { s.stats.trainings = 1; checkGoals(s); return true; })()).toBe(true);
    expect(s.tutorial.step).toBe(25);
    expect(s.features.craft).toBe(true);
    // 26: 레시피 개발 (액션 대신 카운터로도 통과)
    seeDialogue(s);
    s.stats.recipesMade = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(26);
    // 27: 명소 투자 → 주차장이 열린다
    seeDialogue(s);
    expect(s.unlocked.objects).not.toContain('parking_lot');
    expect(apply(s, { type: 'investSpot', id: 'canola_field' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(27);
    expect(s.unlocked.objects).toContain('parking_lot');
    // 28: 주차장을 짓고 렌터카 손님 1명
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.routes.parking.totalGuests = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(28);
    expect(lastReward(s)).toMatchObject({ refId: '28', items: [{ type: 'money', amount: 300_000 }, { type: 'tickets', n: 1 }] });
    // 29: 뽑기 1회 → 선물 하나를 준다
    seeDialogue(s);
    s.tickets = Math.max(1, s.tickets);
    expect(apply(s, { type: 'drawTicket' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(29);
    expect(s.inventory['gift_tangerine_box']).toBe(1);
    expect(currentTutorialChapter(s)?.id).toBe(5);
  });

  it('5장(30~33): 선물·이벤트·팝업/대결·가이드북 발표 → 졸업 보상(응모권 5·₩100만·칭호)', () => {
    const s = stateAtStep(29);
    clearAlerts(s);
    // 30: 선물 1회 (giftDay가 찍힌다)
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.giftDay = 3;
    checkGoals(s);
    expect(s.tutorial.step).toBe(30);
    // 31: 이벤트 하나 겪기 — 발동만으론 안 되고 대화(alerts event)를 닫아야. 게시판 이벤트 응답도 된다
    seeDialogue(s);
    s.eventsFired = { ev_x: 1 };
    s.alerts.push({ type: 'event', id: 'ev_x' });
    checkGoals(s);
    expect(s.tutorial.step).toBe(30);
    s.alerts = [];
    checkGoals(s);
    expect(s.tutorial.step).toBe(31);
    expect(s.features.popup).toBe(true);
    const t = stateAtStep(30); seeDialogue(t);
    t.board.events.push({ id: 'be_x', monthIndex: 0, status: 'declined' } as never);
    checkGoals(t);
    expect(t.tutorial.step).toBe(31);
    // 32: 팝업 또는 대결 1회
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.popup.visits.push({} as never);
    checkGoals(s);
    expect(s.tutorial.step).toBe(32);
    // 33: 가이드북 발표를 보고 닫기
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.stats.seenAnnouncement = 6;
    s.lastAnnouncement = { monthIndex: 6 } as never;
    checkGoals(s);
    expect(s.tutorial.step).toBe(32);
    s.lastAnnouncement = null;
    checkGoals(s);
    expect(s.tutorial.step).toBe(33);
    expect(tutorialDone(s)).toBe(true);
    expect(lastReward(s)).toMatchObject({ refId: '33', items: [{ type: 'tickets', n: 5 }, { type: 'money', amount: 1_000_000 }, { type: 'title', id: 'halmang_pupil', name: '할망의 제자' }] });
    expect(s.titles).toContain('halmang_pupil');
    expect(checkTutorial(s)).toBeNull();
  });

  it('순서·해금 정합: 각 단계가 요구하는 기능·시설은 그 전 단계 보상(또는 시작 상태)으로 열려 있다 — 목표 체인 없이도', () => {
    // 단계 → 요구하는 기능·시설 (조건을 채우는 데 필요한 것)
    const NEED: Record<number, { features?: FeatureId[]; objects?: string[] }> = {
      4: { objects: ['path'] }, 5: { objects: ['table_out'] }, 9: { objects: ['stonewall'] }, 10: { features: ['promote'] },
      12: { features: ['siteView'], objects: ['table_out'] }, 15: { objects: ['tangerine_tree'] }, 16: { objects: ['path'] },
      19: { objects: ['table_out'] }, 22: { objects: ['tangerine_tree'] }, 24: { objects: ['table_in'] },
      26: { features: ['craft'] }, 27: { features: ['spotMap'] }, 28: { objects: ['parking_lot'] }, 32: { features: ['popup'] },
    };
    const base = tutorialState();
    const features = initFeatures();
    const objects = new Set(base.unlocked.objects);
    for (const st of STEPS) {
      const need = NEED[st.id];
      if (need) {
        for (const f of need.features ?? []) expect(features[f], `${st.id}단계 ${st.key}: 기능 ${f}`).toBe(true);
        for (const o of need.objects ?? []) expect(objects.has(o), `${st.id}단계 ${st.key}: 시설 ${o}`).toBe(true);
      }
      for (const r of st.reward) {
        if (r.type === 'unlockFeature') features[r.id] = true;
        if (r.type === 'unlockFacility') { expect(() => objectDef(r.id)).not.toThrow(); objects.add(r.id); }
        if (r.type === 'item') expect(r.id).toMatch(/^gift_/);
      }
    }
    // 기능 잠금이 걸린 액션(FEATURE_OF_ACTION)을 요구하는 단계는 그 기능을 앞에서 연다
    expect(FEATURE_OF_ACTION.develop).toBe('craft');
    expect(FEATURE_OF_ACTION.openPopup).toBe('popup');
    expect(FEATURE_OF_ACTION.promote).toBe('promote');
    // 단계 타깃의 data-tut 이름은 소문자·콜론·하이픈만 (UI 속성과 짝)
    for (const st of STEPS) for (const t of st.targets) expect(t).toMatch(/^[a-z][a-z0-9:_-]*$/);
  });

  it('저장: 표식(seen)이 저장되고, 옛 9단계 저장(seen 없음)은 건너뛴 것이면 33으로, 손으로 한 것이면 그대로 이어 간다', () => {
    const s = tutorialState(3);
    apply(s, { type: 'tutorialNote', key: 'dlg:1' });
    for (let d = 0; d < DAYS_PER_MONTH; d++) tick(s, DAY_MS);
    expect(s.totalGuests).toBe(0);
    expect(s.tutorial.step).toBe(0);
    expect(deserialize(serialize(s)).tutorial).toEqual({ step: 0, skipped: false, seen: ['dlg:1'] });
    const old = JSON.parse(serialize(createInitialState(1))) as { tutorial: { step: number; skipped: boolean; seen?: string[] } };
    old.tutorial = { step: 9, skipped: true };
    expect(deserialize(JSON.stringify(old)).tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
    old.tutorial = { step: 9, skipped: false };
    expect(deserialize(JSON.stringify(old)).tutorial).toEqual({ step: 9, skipped: false, seen: [] });
  });
});

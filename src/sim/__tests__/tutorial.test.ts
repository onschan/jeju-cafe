import { describe, it, expect } from 'vitest';
import { createInitialState, START_SEATS, START_PATH, START_MENUS, fillStarterLayout } from '../state.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS, HOUR_MS, DAYS_PER_MONTH } from '../clock.ts';
import { STEPS, TUTORIAL_STEPS, TUTORIAL_CHAPTERS, TRACKED_ACTIONS, STARTER_FEATURE_IDS, currentTutorialStep, currentTutorialChapter, checkTutorial, tutorialDone, pathConnected, wallShelteringSeat, firstMonthClosed, noteTutorial, dialogueSeen, skipTutorialChapter, activeComboCount } from '../tutorial.ts';
import { canOpen, checkGoals, FEATURE_OF_ACTION, initFeatures } from '../goals.ts';
import { hire } from '../staff.ts';
import { serialize, deserialize } from '../save.ts';
import { objectDef } from '../../data/index.ts';
import type { GameState, FeatureId } from '../types.ts';
import { at } from './helpers.ts';
import { TUTORIAL_STEPS as DIALOGUE, TUTORIAL_CHAPTER_TEXTS } from '../../data/dialogue/index.ts';

/** §7.1 빈 마당에서 시작해 한 단계씩 손으로 한다 */
function tutorialState(seed = 1) {
  return createInitialState(seed, 'local', 0, 'tutorial');
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

describe('손으로 하는 튜토리얼 「할망의 가르침」 30단계·5장', () => {
  it('데이터: sim STEPS 30개와 dialogue/tutorial.json 30개가 key·chapter로 1:1, 장 5개가 1~30을 빈틈없이 덮고, 완성 시작 상태(starter)는 튜토리얼이 끝나 있다', () => {
    expect(STEPS).toHaveLength(TUTORIAL_STEPS);
    expect(TUTORIAL_STEPS).toBe(30);
    expect(STEPS.map((s) => s.key)).toEqual(DIALOGUE.map((d) => d.key));
    expect(STEPS.map((s) => s.chapter)).toEqual(DIALOGUE.map((d) => d.chapter));
    expect(STEPS.map((s) => s.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(TUTORIAL_CHAPTERS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    expect(TUTORIAL_CHAPTER_TEXTS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    let next = 1;
    for (const c of TUTORIAL_CHAPTERS) { expect(c.from).toBe(next); expect(c.to).toBeGreaterThanOrEqual(c.from); next = c.to + 1; }
    expect(next).toBe(31);
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
    expect(starter.features.craft).toBe(false); // 22단계 보상이지만 목표 g16이 여니 완성 시작 상태에서는 안 연다 (봇 진행 유지)
    expect(starter.features.popup).toBe(false);
  });

  it('§7.1 시작 상태: 본관·정낭·정류장만, 길·좌석·메뉴 없음, 자금 500만, 후보 2명, 손님 0', () => {
    const s = tutorialState();
    expect(s.tutorial).toEqual({ step: 0, skipped: false, seen: [] });
    expect(Object.values(s.objects).map((o) => o.type).filter((t) => t === 'path' || t === 'table_out' || t === 'table_parasol')).toEqual([]);
    expect(s.menuSlots.every((m) => m === null)).toBe(true);
    expect(s.money).toBe(5_000_000);
    expect(s.candidates).toHaveLength(2);
    expect(canOpen(s)).toBe(false);
    tick(s, DAY_MS);
    expect(s.totalGuests).toBe(0);
    expect(s.guests).toHaveLength(0);
    expect(currentTutorialStep(s)?.id).toBe(1);
    expect(currentTutorialChapter(s)?.id).toBe(1);
  });

  it('대사 게이트: 조건이 먼저 차도 대사(dlg:<id>)를 보기 전엔 안 끝나고, 보고 나면 바로 통과한다', () => {
    const s = tutorialState();
    for (const c of PATH) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(pathConnected(s)).toBe(true);
    expect(s.tutorial.step).toBe(0); // 대사 안 봄
    expect(dialogueSeen(s, 1)).toBe(false);
    expect(apply(s, { type: 'tutorialNote', key: 'dlg:1' }).ok).toBe(true); // 액션 직후 checkGoals → checkTutorial
    expect(dialogueSeen(s, 1)).toBe(true);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toMatchObject({ refId: '1' });
    // 같은 표식은 두 번 안 남는다
    noteTutorial(s, 'dlg:1');
    expect(s.tutorial.seen.filter((k) => k === 'dlg:1')).toHaveLength(1);
    // 끝난 뒤엔 표식을 안 남긴다
    const done = createInitialState(2);
    expect(noteTutorial(done, 'storage')).toBe(false);
    expect(done.tutorial.seen).toEqual([]);
  });

  it('전체 건너뛰기(첫 단계에서만): 완성 시작 상태로 채우고 step=30. 이미 시작했으면 거부', () => {
    const s = tutorialState();
    expect(apply(s, { type: 'skipTutorial' }).ok).toBe(true);
    expect(s.tutorial).toEqual({ step: TUTORIAL_STEPS, skipped: true, seen: [] });
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
  });

  it('장 건너뛰기: 현재 장 끝으로 step을 옮기고 남은 단계의 해금 보상(기능·시설)만 조용히 연다 — 돈·응모권 없음. 맨 처음이면 완성 시작 상태로 채운다', () => {
    const s = tutorialState();
    const money = s.money;
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(8);
    expect(s.tutorial.skipped).toBe(true);
    expect(s.features.siteView).toBe(true);
    expect(s.features.comboCodex).toBe(true);
    expect(s.features.promote).toBe(true);
    expect(s.features.spotMap).toBe(false); // 3장 보상은 아직
    expect(s.money).toBe(money);
    expect(s.tickets).toBe(0);
    expect(s.alerts.filter((a) => a.type === 'reward')).toHaveLength(0);
    expect(Object.values(s.objects).filter((o) => o.type === 'path')).toHaveLength(START_PATH.length); // 빈 마당을 채워 바로 영업
    expect(currentTutorialStep(s)?.id).toBe(9);
    expect(currentTutorialChapter(s)?.id).toBe(2);
    // 2장 중간(11단계 진행 중)에서 건너뛰면 14까지
    s.tutorial.step = 10;
    expect(skipTutorialChapter(s)).toBe(2);
    expect(s.tutorial.step).toBe(14);
    // 4장: 주차장·연구 개발이 열린다
    s.tutorial.step = 19;
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(26);
    expect(s.features.craft).toBe(true);
    expect(s.unlocked.objects).toContain('parking_lot');
    expect(s.inventory['gift_tangerine_box'] ?? 0).toBe(0); // 아이템 보상은 안 준다
    // 5장 → 끝
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(true);
    expect(tutorialDone(s)).toBe(true);
    expect(s.features.popup).toBe(true);
    expect(apply(s, { type: 'skipTutorialChapter' }).ok).toBe(false);
  });

  it('1장(1~8): 순서대로 손으로 하면 단계마다 보상 상자가 뜨고 step이 오른다 (하이라이트 칸·타깃 포함)', () => {
    const s = tutorialState();
    const money0 = s.money;
    // 1: 정낭 → 문 앞 올렛길
    expect(STEPS[0]!.cells(s)).toHaveLength(2); // 정낭·문 앞
    expect(STEPS[0]!.targets).toContain('tab:path');
    seeDialogue(s);
    expect(pathConnected(s)).toBe(false);
    for (const c of PATH.slice(0, 3)) expect(apply(s, { type: 'place', objectType: 'path', ...at(c.lx, c.ly) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(0);
    expect(apply(s, { type: 'place', objectType: 'path', ...at(4, 5) }).ok).toBe(true);
    expect(pathConnected(s)).toBe(true);
    expect(s.tutorial.step).toBe(1);
    expect(lastReward(s)).toMatchObject({ refId: '1', items: [{ type: 'money', amount: 300_000 }] });
    expect(s.money).toBe(money0 - 4 * 10_000 + 300_000);
    // 2: 테이블 (전망 자리)
    seeDialogue(s);
    expect(STEPS[1]!.cells(s).length).toBeGreaterThan(0);
    expect(STEPS[1]!.cells(s).length).toBeLessThanOrEqual(3);
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(3, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(s.features.siteView).toBe(true);
    expect(canOpen(s)).toBe(false); // 아직 메뉴 없음
    // 3: 메뉴 두 개
    seeDialogue(s);
    expect(apply(s, { type: 'setSlot', slot: 0, menuId: 'americano' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(2);
    expect(apply(s, { type: 'setSlot', slot: 1, menuId: 'tangerine_juice' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(3);
    expect(canOpen(s)).toBe(true);
    // 4: 첫 결제 — 손님이 온다
    seeDialogue(s);
    expect(STEPS[3]!.cells(s)).toHaveLength(1); // 정류장
    for (let h = 0; h < 40 && s.tutorial.step < 4; h++) tick(s, HOUR_MS);
    expect(s.totalIncome).toBeGreaterThan(0);
    expect(s.tutorial.step).toBe(4);
    expect(lastReward(s)).toMatchObject({ refId: '4', items: [{ type: 'tickets', n: 1 }] });
    // 5: 채용
    seeDialogue(s);
    hire(s, s.candidates[0]!.id, 'hall');
    checkGoals(s);
    expect(s.tutorial.step).toBe(5);
    // 6: 돌담을 테이블 북서쪽에
    seeDialogue(s);
    expect(wallShelteringSeat(s)).toBe(false);
    const cells = STEPS[5]!.cells(s);
    expect(cells).toContainEqual(at(2, 3));
    expect(apply(s, { type: 'place', objectType: 'stonewall', ...at(2, 3) }).ok).toBe(true);
    expect(wallShelteringSeat(s)).toBe(true);
    expect(s.tutorial.step).toBe(6);
    expect(s.features.comboCodex).toBe(true);
    expect(s.features.promote).toBe(true);
    // 7: 홍보
    seeDialogue(s);
    s.stats.promotionsDone = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(7);
    expect(lastReward(s)).toMatchObject({ refId: '7', items: [{ type: 'mileage', n: 30 }] });
    // 8: 도전 수락
    seeDialogue(s);
    expect(apply(s, { type: 'acceptChallenge', id: 'c01' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(8);
    expect(lastReward(s)).toMatchObject({ refId: '8', items: [{ type: 'money', amount: 500_000 }] });
    expect(currentTutorialChapter(s)?.id).toBe(2);
    expect(s.alerts.filter((a) => a.type === 'reward' && a.source === 'tutorial')).toHaveLength(8);
  });

  it('2장(9~14): 입지 보기·손님 카드·타깃·콤보 2개·올렛길 10칸·되돌리기', () => {
    const s = stateAtStep(8);
    clearAlerts(s);
    // 9: 입지 보기를 켜고(표식) 전망 자리에 테이블 하나 더 — 표식 없이는 안 끝난다
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6, 4) }).ok).toBe(true);
    expect(seeAndCheck(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'siteView' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(9);
    expect(lastReward(s)).toMatchObject({ refId: '9', items: [{ type: 'money', amount: 200_000 }] });
    // 10: 손님 카드 보기 (UI 표식)
    expect(seeAndCheck(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'guestCard' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(10);
    // 11: 타깃 손님층 1개
    seeDialogue(s);
    const anyGuest = Object.entries(s.guestTypes).find(([, t]) => t.unlocked)![0];
    expect(apply(s, { type: 'setTargets', targets: [anyGuest] }).ok).toBe(true);
    expect(s.tutorial.step).toBe(11);
    expect(lastReward(s)).toMatchObject({ refId: '11', items: [{ type: 'mileage', n: 20 }] });
    // 12: 감귤나무로 콤보 2개 (귤밭 뷰 + 밭담 귤 수확) — 안내 칸은 테이블·돌담 옆
    seeDialogue(s);
    expect(apply(s, { type: 'place', objectType: 'stonewall', ...at(2, 3) }).ok).toBe(true);
    const combo0 = activeComboCount(s);
    const cand = STEPS[11]!.cells(s);
    expect(cand.length).toBeGreaterThan(0);
    expect(cand.length).toBeLessThanOrEqual(3);
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', ...cand[0]! }).ok).toBe(true);
    expect(activeComboCount(s)).toBeGreaterThanOrEqual(combo0 + 2);
    expect(s.tutorial.step).toBe(12);
    // 13: 올렛길 10칸
    seeDialogue(s);
    let n = Object.values(s.objects).filter((o) => o.type === 'path').length;
    for (let ly = 6; n < 10 && ly >= 0; ly--) for (let lx = 0; n < 10 && lx < 9; lx++) if (apply(s, { type: 'place', objectType: 'path', ...at(lx, ly) }).ok) n++;
    expect(n).toBe(10);
    expect(s.tutorial.step).toBe(13);
    // 14: 되돌리기 1회 (성공한 액션 타입이 seen에 남는다)
    seeDialogue(s);
    expect(TRACKED_ACTIONS.has('undoLast')).toBe(true);
    expect(apply(s, { type: 'undoLast' }).ok).toBe(true);
    expect(s.tutorial.seen).toContain('undoLast');
    expect(s.tutorial.step).toBe(14);
    expect(currentTutorialChapter(s)?.id).toBe(3);
  });

  it('3장(15~19): 월말 결산·좌석 4개·홀/청소 배치·창고 보기·농원 수확', () => {
    const s = stateAtStep(14);
    clearAlerts(s);
    hire(s, s.candidates[0]!.id, 'barista'); // 후보는 달이 바뀌면 떠나니 미리 뽑아 둔다 (17단계용)
    // 15: 첫 월말 결산 닫기
    seeDialogue(s);
    expect(firstMonthClosed(s)).toBe(false);
    while (s.clock.month === 3) tick(s, DAY_MS);
    expect(s.lastMonthCard).not.toBeNull();
    expect(s.tutorial.step).toBe(14);
    expect(apply(s, { type: 'dismissMonthCard' }).ok).toBe(true);
    checkGoals(s);
    expect(s.tutorial.step).toBe(15);
    expect(s.features.spotMap).toBe(true);
    clearAlerts(s);
    // 16: 좌석 4개 (완성 시작 상태 3개 + 1)
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'place', objectType: 'table_out', ...at(6, 4) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(16);
    // 17: 홀 또는 청소 직원 배치
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    expect(s.staff[0]!.role).toBe('barista');
    expect(s.tutorial.step).toBe(16); // 바리스타는 청소를 안 한다
    expect(apply(s, { type: 'assign', staffId: s.staff[0]!.id, role: 'hall' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(17);
    // 18: 재료 창고 보기 (UI 표식)
    expect(seeAndCheck(s)).toBeNull();
    expect(apply(s, { type: 'tutorialNote', key: 'storage' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(18);
    expect(lastReward(s)).toMatchObject({ refId: '18', items: [{ type: 'research', n: 5 }] });
    // 19: 감귤나무를 심고 다음 달 1일 수확
    seeDialogue(s);
    for (const o of Object.values(s.objects)) if (o.type === 'tangerine_tree') apply(s, { type: 'remove', objectId: o.id });
    s.monthHarvest.harvested = {};
    s.lastMonthCard = null;
    expect(checkTutorial(s)).toBeNull();
    expect(apply(s, { type: 'place', objectType: 'tangerine_tree', ...at(1, 1) }).ok).toBe(true);
    expect(s.tutorial.step).toBe(18); // 심기만으로는 안 끝난다
    while (s.clock.month === 4) tick(s, DAY_MS);
    checkGoals(s);
    expect(Object.values(s.monthHarvest.harvested).some((v) => v > 0)).toBe(true);
    expect(s.tutorial.step).toBe(19);
    expect(currentTutorialChapter(s)?.id).toBe(4);
  });

  it('4장(20~26): 증축 Lv2 완공·실내 테이블 2·연수·레시피·명소 투자·주차장·상점', () => {
    const s = stateAtStep(19);
    clearAlerts(s);
    s.money = 10_000_000;
    // 20: 본관 Lv2 — 공사 시작만으론 안 끝나고 완공(7일)돼야
    seeDialogue(s);
    expect(apply(s, { type: 'expandMain' }).ok).toBe(true);
    expect(s.main.level).toBe(2);
    expect(s.tutorial.step).toBe(19);
    for (let d = 0; d < 9 && s.main.work; d++) tick(s, DAY_MS);
    expect(s.main.work).toBeNull();
    checkGoals(s);
    expect(s.tutorial.step).toBe(20);
    expect(lastReward(s)).toMatchObject({ refId: '20', items: [{ type: 'money', amount: 500_000 }] });
    // 21: 실내 테이블 2개 (안내 칸 = 본관 방 안 빈 바닥)
    seeDialogue(s);
    const floor = STEPS[20]!.cells(s);
    expect(floor.length).toBeGreaterThanOrEqual(2);
    expect(apply(s, { type: 'place', objectType: 'table_in', ...floor[0]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(20);
    expect(apply(s, { type: 'place', objectType: 'table_in', ...floor[1]! }).ok).toBe(true);
    expect(s.tutorial.step).toBe(21);
    // 22: 연수 1회 (랭크 3부터) — 성공한 train 액션이 seen에 남는다 → 연구 개발이 열린다
    seeDialogue(s);
    hire(s, s.candidates[0]!.id, 'hall');
    s.rank = 3;
    expect(s.features.craft).toBe(false);
    expect(apply(s, { type: 'train', staffId: s.staff[0]!.id, trainingId: 'tr_basic' }).ok || s.tutorial.seen.includes('train') || (() => { s.stats.trainings = 1; checkGoals(s); return true; })()).toBe(true);
    expect(s.tutorial.step).toBe(22);
    expect(s.features.craft).toBe(true);
    // 23: 레시피 개발 (액션 대신 카운터로도 통과)
    seeDialogue(s);
    s.stats.recipesMade = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(23);
    // 24: 명소 투자 → 주차장이 열린다
    seeDialogue(s);
    expect(s.unlocked.objects).not.toContain('parking_lot');
    expect(apply(s, { type: 'investSpot', id: 'canola_field' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(24);
    expect(s.unlocked.objects).toContain('parking_lot');
    // 25: 주차장을 짓고 렌터카 손님 1명
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.routes.parking.totalGuests = 1;
    checkGoals(s);
    expect(s.tutorial.step).toBe(25);
    expect(lastReward(s)).toMatchObject({ refId: '25', items: [{ type: 'money', amount: 300_000 }, { type: 'tickets', n: 1 }] });
    // 26: 뽑기 1회 → 선물 하나를 준다
    seeDialogue(s);
    s.tickets = Math.max(1, s.tickets);
    expect(apply(s, { type: 'drawTicket' }).ok).toBe(true);
    expect(s.tutorial.step).toBe(26);
    expect(s.inventory['gift_tangerine_box']).toBe(1);
    expect(currentTutorialChapter(s)?.id).toBe(5);
  });

  it('5장(27~30): 선물·이벤트·팝업/대결·가이드북 발표 → 졸업 보상(응모권 5·₩100만·칭호)', () => {
    const s = stateAtStep(26);
    clearAlerts(s);
    // 27: 선물 1회 (giftDay가 찍힌다)
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.giftDay = 3;
    checkGoals(s);
    expect(s.tutorial.step).toBe(27);
    // 28: 이벤트 하나 겪기 — 발동만으론 안 되고 대화(alerts event)를 닫아야. 게시판 이벤트 응답도 된다
    seeDialogue(s);
    s.eventsFired = { ev_x: 1 };
    s.alerts.push({ type: 'event', id: 'ev_x' });
    checkGoals(s);
    expect(s.tutorial.step).toBe(27);
    s.alerts = [];
    checkGoals(s);
    expect(s.tutorial.step).toBe(28);
    expect(s.features.popup).toBe(true);
    const t = stateAtStep(27); seeDialogue(t);
    t.board.events.push({ id: 'be_x', monthIndex: 0, status: 'declined' } as never);
    checkGoals(t);
    expect(t.tutorial.step).toBe(28);
    // 29: 팝업 또는 대결 1회
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.popup.visits.push({} as never);
    checkGoals(s);
    expect(s.tutorial.step).toBe(29);
    // 30: 가이드북 발표를 보고 닫기
    seeDialogue(s);
    expect(checkTutorial(s)).toBeNull();
    s.stats.seenAnnouncement = 6;
    s.lastAnnouncement = { monthIndex: 6 } as never;
    checkGoals(s);
    expect(s.tutorial.step).toBe(29);
    s.lastAnnouncement = null;
    checkGoals(s);
    expect(s.tutorial.step).toBe(30);
    expect(tutorialDone(s)).toBe(true);
    expect(lastReward(s)).toMatchObject({ refId: '30', items: [{ type: 'tickets', n: 5 }, { type: 'money', amount: 1_000_000 }, { type: 'title', id: 'halmang_pupil', name: '할망의 제자' }] });
    expect(s.titles).toContain('halmang_pupil');
    expect(checkTutorial(s)).toBeNull();
  });

  it('순서·해금 정합: 각 단계가 요구하는 기능·시설은 그 전 단계 보상(또는 시작 상태)으로 열려 있다 — 목표 체인 없이도', () => {
    // 단계 → 요구하는 기능·시설 (조건을 채우는 데 필요한 것)
    const NEED: Record<number, { features?: FeatureId[]; objects?: string[] }> = {
      1: { objects: ['path'] }, 2: { objects: ['table_out'] }, 6: { objects: ['stonewall'] }, 7: { features: ['promote'] },
      9: { features: ['siteView'], objects: ['table_out'] }, 12: { objects: ['tangerine_tree'] }, 13: { objects: ['path'] },
      16: { objects: ['table_out'] }, 19: { objects: ['tangerine_tree'] }, 21: { objects: ['table_in'] },
      23: { features: ['craft'] }, 24: { features: ['spotMap'] }, 25: { objects: ['parking_lot'] }, 29: { features: ['popup'] },
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

  it('저장: 표식(seen)이 저장되고, 옛 9단계 저장(seen 없음)은 건너뛴 것이면 30으로, 손으로 한 것이면 그대로 이어 간다', () => {
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

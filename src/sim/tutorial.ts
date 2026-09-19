/**
 * 손으로 하는 튜토리얼 「할망의 가르침」 30단계 · 5장 (§7.2 확장). 1년차 전체를 관통하며 모든 시스템을 한 번씩 직접 해 본다.
 * 진행은 sim 상태(state.tutorial.step = 끝낸 단계 수)에 있어 저장·복원되고 결정적이다.
 * 각 단계의 done 조건은 sim 상태만 본다. 창을 열었다 같은 UI 사건은 UI가 `tutorialNote` 액션으로 state.tutorial.seen에 남긴다(카드 봄·창고 봄·입지 보기 켬).
 * 액션으로 하는 것(되돌리기·연수·뽑기·선물…)은 apply가 성공한 액션 타입을 seen에 넣는다(TRACKED_ACTIONS).
 * 대사 게이트: UI가 현재 단계 대사를 닫으면 `dlg:<id>`를 seen에 넣고, 그 뒤에야 단계가 끝난다 — 이미 충족된 단계도 대사는 한 번 보고 바로 통과한다.
 * 단계를 끝내면 applyRewards(보상 상자) → step++. 건너뛰기는 장 단위(skipTutorialChapter, 해금 보상만 조용히 적용).
 * 대사는 data/dialogue/tutorial.json(key로 짝). 하이라이트(data-tut·맵 칸)는 ui/tutorialHighlight.ts.
 *
 * | 장 | 단계 | 조건 | 하이라이트(data-tut / 맵 칸) | 보상 |
 * | 1 개업 | 1 path | 정낭→문 올렛길 | nav:build·tab:path·정낭·문 앞 | ₩30만 |
 * |  | 2 seat_view | 전망 2+ 자리 테이블 | tab:rest·길 옆 빈 칸 | ₩30만·입지 보기 |
 * |  | 3 menu | 아메리카노·감귤주스 | nav:cafe·tab:menu·menu-put | ₩20만 |
 * |  | 4 first_pay | 첫 결제 | 정류장 칸 | 응모권 1 |
 * |  | 5 hire | 직원 1명 | nav:people·tab:candidates·hire | ₩30만 |
 * |  | 6 wall | 돌담을 테이블 북서쪽 | tab:wall·북서 띠 | ₩30만·콤보 도감·홍보·연구 10 |
 * |  | 7 promote | 홍보 1회 | tab:promo·promote | 마일리지 30 |
 * |  | 8 challenge | 도전 1개 수락 | goal-bar·tab:challenge·challenge-accept | ₩50만 |
 * | 2 자리와 손님 | 9 site_seat | 입지 보기 켜고 전망 자리 테이블 2개 | site-toggle·tab:rest | ₩20만 |
 * |  | 10 guest_card | 손님 카드 보기(seen guestCard) | tab:guests·guest-row | ₩10만 |
 * |  | 11 target | 타깃 손님층 1개 | target-slot·target-pick | 마일리지 20 |
 * |  | 12 combo2 | 콤보 2개(감귤나무: 귤밭 뷰·밭담 귤 수확) | tab:farm·build:tangerine_tree·후보 칸 | ₩30만 |
 * |  | 13 path10 | 올렛길 10칸 | tab:path | ₩10만 |
 * |  | 14 undo | 되돌리기 1회 | tool:undo | ₩10만 |
 * | 3 첫 달 결산 | 15 month_end | 첫 월말 결산 닫기 | — | 명소 지도 |
 * |  | 16 seats4 | 좌석 4개(자리 없음 불만 해결) | tab:rest | ₩30만 |
 * |  | 17 clean | 홀·청소 직원 배치 | tab:staff·hire·assign | ₩20만 |
 * |  | 18 storage | 재료 창고 보기(seen storage) | tab:ingredients | 연구 5 |
 * |  | 19 harvest | 농원 수확(다음 달 1일) | tab:farm | ₩30만 |
 * | 4 키우기 | 20 expand | 본관 Lv2 완공 | tab:building·main-expand | ₩50만 |
 * |  | 21 indoor2 | 실내 좌석 2개 | tab:indoor·build:table_in·방 안 칸 | ₩30만 |
 * |  | 22 train | 연수 1회(랭크 3) | tab:staff·train | 연구 20·연구 개발 |
 * |  | 23 recipe | 레시피 개발 1회 | tab:craft·develop | ₩50만 |
 * |  | 24 spot | 명소 투자 1회 | tab:spots·spot-invest | ₩30만·주차장 |
 * |  | 25 parking | 렌터카 손님 1명 | tab:convenience·build:parking_lot | ₩30만·응모권 1 |
 * |  | 26 shop | 상점 뽑기·구매 1회 | tab:tickets·draw | 마일리지 30·선물 1 |
 * | 5 마을과 세상 | 27 gift | 선물 1회 | gift | 응모권 1 |
 * |  | 28 event | 이벤트 1개 겪기(대화 닫기·응답) | tab:invest·event-respond | ₩50만·팝업 스토어 |
 * |  | 29 popup_rival | 팝업 또는 대결 1회 | tab:region·popup-open·tab:rivals·rival-challenge | ₩50만 |
 * |  | 30 graduate | 가이드북 발표 보기 | — | 응모권 5·₩100만·칭호 「할망의 제자」 |
 */
import type { GameState, GoalReward, Pt, FeatureId, PlacedObject, Action } from './types.ts';
import { objectDef, COMBOS } from '../data/index.ts';
import { isDoorReachable, busStopPos } from './path.ts';
import { doorFrontOf, objectAt, cellAt } from './grid.ts';
import { applyRewards } from './goals.ts';
import { siteOf } from './site.ts';
import { parcelAt } from './parcels.ts';
import { activeCombos } from './compat.ts';
import { freeFloorCells } from './rooms.ts';
import { isFarmObject } from './orchard.ts';

export const TUTORIAL_STEPS = 30;

export interface TutorialChapter { id: number; title: string; /** 단계 id 범위 [from, to] */ from: number; to: number }
export const TUTORIAL_CHAPTERS: TutorialChapter[] = [
  { id: 1, title: '개업', from: 1, to: 8 },
  { id: 2, title: '자리와 손님', from: 9, to: 14 },
  { id: 3, title: '첫 달 결산', from: 15, to: 19 },
  { id: 4, title: '키우기', from: 20, to: 26 },
  { id: 5, title: '마을과 세상', from: 27, to: 30 },
];

export interface TutorialStepDef {
  id: number;
  key: string;
  chapter: number;
  done: (s: GameState) => boolean;
  reward: GoalReward[];
  /** 하이라이트할 DOM 타깃(data-tut 값, 열린 창에 따라 있는 것만 빛난다) */
  targets: string[];
  /** 하이라이트할 맵 칸 */
  cells: (s: GameState) => Pt[];
}

/** apply가 성공하면 state.tutorial.seen에 타입을 남기는 액션 (조건 판정용) */
export const TRACKED_ACTIONS: ReadonlySet<Action['type']> = new Set<Action['type']>([
  'undoLast', 'train', 'develop', 'drawTicket', 'buyMileage', 'buyTicket', 'giveGift', 'respondEvent', 'openPopup', 'challenge', 'investSpot',
]);
/** UI가 tutorialNote로 남기는 키 */
export type TutorialNoteKey = 'siteView' | 'guestCard' | 'storage';

function seen(s: GameState, key: string): boolean {
  return s.tutorial.seen?.includes(key) ?? false;
}
/** 조건 판정용 표식을 남긴다 (튜토리얼이 끝났으면 안 남긴다). 새로 남겼으면 true. */
export function noteTutorial(state: GameState, key: string): boolean {
  if (tutorialDone(state)) return false;
  state.tutorial.seen ??= [];
  if (state.tutorial.seen.includes(key)) return false;
  state.tutorial.seen.push(key);
  return true;
}
/** 단계 대사를 봤나 (UI가 대사를 닫을 때 dlg:<id>를 남긴다) */
export function dialogueSeen(s: GameState, id: number): boolean {
  return seen(s, `dlg:${id}`);
}

function mainBuilding(s: GameState) {
  return Object.values(s.objects).find((o) => o.type === 'warehouse') ?? null;
}
function seats(s: GameState) {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat' && !objectDef(o.type).indoor);
}
function gate(s: GameState) {
  return Object.values(s.objects).find((o) => o.type === 'gate') ?? null;
}
function count(s: GameState, type: string): number {
  return Object.values(s.objects).filter((o) => o.type === type).length;
}
/** 정낭에서 본관 문까지 올렛길이 이어졌나 */
export function pathConnected(s: GameState): boolean {
  const b = mainBuilding(s);
  return b ? isDoorReachable(s, b) : false;
}
function inBounds(s: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.grid.w && y < s.grid.h;
}
function emptySoil(s: GameState, x: number, y: number): boolean {
  if (!inBounds(s, x, y)) return false;
  const c = cellAt(s, x, y);
  return c.terrain === 'soil' && !c.objectId && !!parcelAt(s, x, y)?.owned;
}
/** 소유 필지의 빈 흙 칸 중 전망 ≥ view인 칸 (트랙 F siteOf) */
function emptyCellsWithView(s: GameState, view: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!emptySoil(s, x, y)) continue;
    if (siteOf(s, x, y).view >= view) { out.push({ x, y }); if (out.length >= n) return out; }
  }
  return out;
}
/** 전망 ≥ view 자리에 있는 야외 테이블 수 */
function seatsWithView(s: GameState, view: number): number {
  return seats(s).filter((o) => siteOf(s, o.x, o.y).view >= view).length;
}
/** 전망 ≥ view 자리에 테이블이 n개 있나. 빈 마당엔 전망 칸이 없을 수 있어, 그런 마당이면 테이블 n개로 통과한다. */
export function seatWithView(s: GameState, view: number, n = 1): boolean {
  if (seatsWithView(s, view) >= n) return true;
  return seats(s).length >= n && emptyCellsWithView(s, view, 1).length === 0;
}
/** 테이블 북서쪽 대각 띠(wallShelteringSeat와 같은 띠)의 빈 흙 칸 — 돌담 안내용. */
function shelterCells(s: GameState, n: number): Pt[] {
  const out: Pt[] = [];
  for (const seat of seats(s)) {
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const x = seat.x - dx, y = seat.y - dy;
      if (!inBounds(s, x, y)) continue;
      const c = cellAt(s, x, y);
      if (c.terrain !== 'soil' || c.objectId || out.some((q) => q.x === x && q.y === y)) continue;
      out.push({ x, y });
      if (out.length >= n) return out;
    }
  }
  return out;
}
/** 테이블 북서쪽 대각 띠에 돌담이 있나 (grid.ts windShelter와 같은 띠) */
export function wallShelteringSeat(s: GameState): boolean {
  for (const seat of seats(s)) {
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) {
      if (Math.abs(dx - dy) > 1) continue;
      const o = objectAt(s, seat.x - dx, seat.y - dy);
      if (o && objectDef(o.type).kind === 'wall') return true;
    }
  }
  return false;
}
/** 첫 월말 결산을 닫았나 (월말이 한 번 지났고(goals.ts observeMonth가 센 흑자/적자 달) 월말 카드가 닫혀 있다) */
export function firstMonthClosed(s: GameState): boolean {
  return s.stats.profitMonths + s.stats.lossMonths >= 1 && s.lastMonthCard === null;
}
/** 전망 좌석 안내용 빈 칸: 전망 ≥ 2인 빈 칸이 있으면 그것, 없으면 길 옆 빈 흙 칸 (최대 n개) */
function emptyCellsNearPath(s: GameState, n: number): Pt[] {
  const out: Pt[] = emptyCellsWithView(s, 2, n);
  if (out.length > 0) return out;
  const paths = Object.values(s.objects).filter((o) => o.type === 'path');
  for (const p of paths) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = p.x + dx, y = p.y + dy;
      if (!emptySoil(s, x, y) || out.some((q) => q.x === x && q.y === y)) continue;
      out.push({ x, y });
      if (out.length >= n) return out;
    }
  }
  return out;
}
/** 마당 전체의 활성 콤보 id 수 (goals.ts comboCount와 같은 셈) */
export function activeComboCount(s: GameState): number {
  const ids = new Set<string>();
  for (const id of Object.keys(s.objects)) for (const c of activeCombos(s, id)) ids.add(c.id);
  return ids.size;
}
/** 오브젝트 발자국과 칸의 체비쇼프 거리 (compat.ts dist와 같은 셈) */
function distToCell(o: PlacedObject, x: number, y: number): number {
  const w = o.w ?? objectDef(o.type).w ?? 1, h = o.h ?? objectDef(o.type).h ?? 1;
  const dx = Math.max(0, o.x - x, x - (o.x + w - 1));
  const dy = Math.max(0, o.y - y, y - (o.y + h - 1));
  return Math.max(dx, dy);
}
function comboRadius(id: string): number {
  return COMBOS.find((c) => c.id === id)?.radius ?? 2;
}
/** 감귤나무를 놓으면 「귤밭 뷰」(table_out)·「밭담 귤 수확」(stonewall) 두 콤보가 같이 나는 빈 흙 칸 (최대 n). 둘 다 안 되면 테이블 옆 칸. */
function comboCells(s: GameState, n: number): Pt[] {
  const tables = Object.values(s.objects).filter((o) => o.type === 'table_out');
  const walls = Object.values(s.objects).filter((o) => o.type === 'stonewall');
  const rTable = comboRadius('cb_tangerine_view'), rWall = comboRadius('cb_wall_harvest');
  const both: Pt[] = [], one: Pt[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!emptySoil(s, x, y)) continue;
    const nearTable = tables.some((t) => distToCell(t, x, y) <= rTable);
    const nearWall = walls.some((t) => distToCell(t, x, y) <= rWall);
    if (nearTable && nearWall) { both.push({ x, y }); if (both.length >= n) return both; }
    else if (nearTable && one.length < n) one.push({ x, y });
  }
  return both.length > 0 ? both : one;
}
/** 실내 좌석 오브젝트 (방 안 가구 중 kind seat) */
function indoorSeatObjects(s: GameState): PlacedObject[] {
  return Object.values(s.objects).filter((o) => { const d = objectDef(o.type); return d.indoor && d.kind === 'seat'; });
}
/** 본관 방 안의 빈 바닥 칸 (실내 가구 안내용) */
function mainFloorCells(s: GameState, n: number): Pt[] {
  const m = mainBuilding(s);
  if (!m || s.main.work) return [];
  return freeFloorCells(s, m).slice(0, n);
}
/** 농원에서 수확한 적이 있나 (이달 수확 또는 지난달 카드) */
function harvestedAny(s: GameState): boolean {
  const any = (h: Record<string, number> | undefined) => !!h && Object.values(h).some((v) => v > 0);
  return any(s.monthHarvest?.harvested) || any(s.lastMonthCard?.harvested);
}
function hasFarm(s: GameState): boolean {
  return Object.values(s.objects).some((o) => isFarmObject(o.type) && parcelAt(s, o.x, o.y)?.owned);
}
/** 빅 이벤트를 하나 겪었나(대화를 닫음) 또는 게시판 이벤트에 답했나 */
function eventExperienced(s: GameState): boolean {
  const fired = Object.keys(s.eventsFired ?? {}).length >= 1 && !s.alerts.some((a) => a.type === 'event');
  return fired || s.board.events.some((e) => e.status !== 'pending') || seen(s, 'respondEvent');
}
function announcementSeen(s: GameState): boolean {
  return s.stats.seenAnnouncement >= 0 && s.lastAnnouncement === null;
}

const money = (amount: number): GoalReward => ({ type: 'money', amount });
const feature = (id: FeatureId): GoalReward => ({ type: 'unlockFeature', id });
const none = () => [] as Pt[];

export const STEPS: TutorialStepDef[] = [
  // ---- 1장 개업 (3월 1주) ----
  { id: 1, key: 'path', chapter: 1, done: pathConnected, reward: [money(300_000)], targets: ['nav:build', 'tab:path', 'build:path'],
    cells: (s) => { const b = mainBuilding(s); const g = gate(s); return [...(g ? [{ x: g.x, y: g.y }] : []), ...(b ? [doorFrontOf(b)] : [])]; } },
  { id: 2, key: 'seat_view', chapter: 1, done: (s) => seatWithView(s, 2), reward: [money(300_000), feature('siteView')], targets: ['nav:build', 'tab:rest', 'build:table_out'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 3, key: 'menu', chapter: 1, done: (s) => s.menuSlots.includes('americano') && s.menuSlots.includes('tangerine_juice'), reward: [money(200_000)], targets: ['nav:cafe', 'tab:menu', 'menu-put'], cells: none },
  { id: 4, key: 'first_pay', chapter: 1, done: (s) => s.totalIncome > 0, reward: [{ type: 'tickets', n: 1 }], targets: [], cells: (s) => [busStopPos(s)] },
  { id: 5, key: 'hire', chapter: 1, done: (s) => s.staff.length >= 1, reward: [money(300_000)], targets: ['nav:people', 'tab:candidates', 'hire'], cells: none },
  // 7단계(홍보)를 바로 할 수 있게 홍보 기능과 전단 연구비(10)를 여기서 준다 — g07(만족 손님 10명)보다 튜토리얼이 먼저 온다
  { id: 6, key: 'wall', chapter: 1, done: wallShelteringSeat, reward: [money(300_000), feature('comboCodex'), feature('promote'), { type: 'research', n: 10 }], targets: ['nav:build', 'tab:wall', 'build:stonewall'],
    cells: (s) => shelterCells(s, 6) },
  { id: 7, key: 'promote', chapter: 1, done: (s) => s.stats.promotionsDone >= 1, reward: [{ type: 'mileage', n: 30 }], targets: ['nav:cafe', 'tab:promo', 'promote'], cells: none },
  { id: 8, key: 'challenge', chapter: 1, done: (s) => s.challenges.active.length + s.challenges.done.length >= 1, reward: [money(500_000)], targets: ['goal-bar', 'tab:challenge', 'challenge-accept'], cells: none },
  // ---- 2장 자리와 손님 (3월) ----
  { id: 9, key: 'site_seat', chapter: 2, done: (s) => seen(s, 'siteView') && seatWithView(s, 2, 2), reward: [money(200_000)], targets: ['nav:build', 'site-toggle', 'tab:rest', 'build:table_out'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 10, key: 'guest_card', chapter: 2, done: (s) => seen(s, 'guestCard'), reward: [money(100_000)], targets: ['nav:people', 'tab:guests', 'guest-row'], cells: none },
  { id: 11, key: 'target', chapter: 2, done: (s) => s.targets.length >= 1, reward: [{ type: 'mileage', n: 20 }], targets: ['nav:people', 'tab:guests', 'target-slot', 'target-pick'], cells: none },
  { id: 12, key: 'combo2', chapter: 2, done: (s) => activeComboCount(s) >= 2, reward: [money(300_000)], targets: ['nav:build', 'tab:farm', 'build:tangerine_tree'],
    cells: (s) => comboCells(s, 3) },
  { id: 13, key: 'path10', chapter: 2, done: (s) => count(s, 'path') >= 10, reward: [money(100_000)], targets: ['nav:build', 'tab:path', 'build:path'], cells: none },
  { id: 14, key: 'undo', chapter: 2, done: (s) => seen(s, 'undoLast'), reward: [money(100_000)], targets: ['nav:build', 'tool:undo'], cells: none },
  // ---- 3장 첫 달 결산 (4월 1일~) ----
  { id: 15, key: 'month_end', chapter: 3, done: firstMonthClosed, reward: [feature('spotMap')], targets: [], cells: none },
  { id: 16, key: 'seats4', chapter: 3, done: (s) => seats(s).length >= 4, reward: [money(300_000)], targets: ['nav:build', 'tab:rest', 'build:table_out'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 17, key: 'clean', chapter: 3, done: (s) => s.staff.some((st) => st.role === 'hall' || st.role === 'clean'), reward: [money(200_000)], targets: ['nav:people', 'tab:staff', 'tab:candidates', 'hire', 'assign'], cells: none },
  { id: 18, key: 'storage', chapter: 3, done: (s) => seen(s, 'storage'), reward: [{ type: 'research', n: 5 }], targets: ['nav:cafe', 'tab:ingredients'], cells: none },
  { id: 19, key: 'harvest', chapter: 3, done: (s) => hasFarm(s) && harvestedAny(s), reward: [money(300_000)], targets: ['nav:build', 'tab:farm', 'build:tangerine_tree'], cells: none },
  // ---- 4장 키우기 (5~7월) ----
  { id: 20, key: 'expand', chapter: 4, done: (s) => s.main.level >= 2 && !s.main.work, reward: [money(500_000)], targets: ['nav:cafe', 'tab:building', 'main-expand'], cells: none },
  { id: 21, key: 'indoor2', chapter: 4, done: (s) => indoorSeatObjects(s).length >= 2, reward: [money(300_000)], targets: ['nav:cafe', 'tab:indoor', 'build:table_in'],
    cells: (s) => mainFloorCells(s, 3) },
  // 23단계(레시피)를 바로 할 수 있게 연구 개발 기능을 여기서 연다 — g16(메뉴 4개)보다 먼저 올 수 있다
  { id: 22, key: 'train', chapter: 4, done: (s) => s.stats.trainings >= 1 || seen(s, 'train'), reward: [{ type: 'research', n: 20 }, feature('craft')], targets: ['nav:people', 'tab:staff', 'train'], cells: none },
  { id: 23, key: 'recipe', chapter: 4, done: (s) => s.stats.recipesMade >= 1 || s.customMenus.length >= 1 || seen(s, 'develop'), reward: [money(500_000)], targets: ['nav:cafe', 'tab:craft', 'develop'], cells: none },
  // 25단계(주차장)를 바로 지을 수 있게 주차장 시설을 여기서 연다 (좌석 6개 조건보다 먼저 올 수 있다)
  { id: 24, key: 'spot', chapter: 4, done: (s) => Object.values(s.spots).some((lv) => lv >= 1) || seen(s, 'investSpot'), reward: [money(300_000), { type: 'unlockFacility', id: 'parking_lot' }], targets: ['nav:ledger', 'tab:spots', 'spot-invest'], cells: none },
  { id: 25, key: 'parking', chapter: 4, done: (s) => (s.routes?.parking?.totalGuests ?? 0) >= 1, reward: [money(300_000), { type: 'tickets', n: 1 }], targets: ['nav:build', 'tab:convenience', 'build:parking_lot'], cells: none },
  // 27단계(선물)를 바로 할 수 있게 선물 하나를 준다
  { id: 26, key: 'shop', chapter: 4, done: (s) => seen(s, 'drawTicket') || seen(s, 'buyMileage') || seen(s, 'buyTicket'), reward: [{ type: 'mileage', n: 30 }, { type: 'item', id: 'gift_tangerine_box', n: 1 }], targets: ['nav:ledger', 'tab:tickets', 'draw'], cells: none },
  // ---- 5장 마을과 세상 (8~12월) ----
  { id: 27, key: 'gift', chapter: 5, done: (s) => seen(s, 'giveGift') || s.giftDay >= 0, reward: [{ type: 'tickets', n: 1 }], targets: ['gift'], cells: none },
  // 29단계(팝업)를 바로 할 수 있게 팝업 스토어 기능을 여기서 연다 — g18(랭크 2)보다 먼저 올 수 있다
  { id: 28, key: 'event', chapter: 5, done: eventExperienced, reward: [money(500_000), feature('popup')], targets: ['nav:ledger', 'tab:invest', 'event-respond'], cells: none },
  { id: 29, key: 'popup_rival', chapter: 5, done: (s) => seen(s, 'openPopup') || seen(s, 'challenge') || (s.popup?.visits?.length ?? 0) >= 1 || s.stats.rivalWins >= 1, reward: [money(500_000)], targets: ['nav:ledger', 'tab:region', 'popup-open', 'nav:people', 'tab:rivals', 'rival-challenge'], cells: none },
  { id: 30, key: 'graduate', chapter: 5, done: announcementSeen, reward: [{ type: 'tickets', n: 5 }, money(1_000_000), { type: 'title', id: 'halmang_pupil', name: '할망의 제자' }], targets: [], cells: none },
];

export function initTutorial(skipped = false): GameState['tutorial'] {
  return { step: skipped ? TUTORIAL_STEPS : 0, skipped, seen: [] };
}
/** 완성 시작 상태(starter)·전체 건너뛰기에서 바로 여는 튜토리얼 기능: 1장 보상 중 목표 체인이 안 주는 것(입지 보기·콤보 도감·명소 지도)과 홍보.
 *  22·28단계가 주는 연구 개발·팝업 스토어는 목표(g16·g18)가 여니 여기서 안 연다 — 봇(starter)의 진행이 바뀌지 않게. */
export const STARTER_FEATURE_IDS: FeatureId[] = ['siteView', 'comboCodex', 'promote', 'spotMap'];
export function tutorialFeatureIds(): FeatureId[] {
  return STARTER_FEATURE_IDS;
}
/** 모든 단계 보상에 들어 있는 기능 (정합 검사용) */
export function allTutorialFeatureIds(): FeatureId[] {
  return STEPS.flatMap((st) => st.reward.filter((r): r is Extract<GoalReward, { type: 'unlockFeature' }> => r.type === 'unlockFeature').map((r) => r.id));
}
export function unlockTutorialFeatures(state: GameState): void {
  for (const id of tutorialFeatureIds()) state.features[id] = true;
}
export function tutorialDone(state: GameState): boolean {
  return state.tutorial.step >= TUTORIAL_STEPS;
}
/** 지금 하고 있는 단계 (끝났으면 null) */
export function currentTutorialStep(state: GameState): TutorialStepDef | null {
  return tutorialDone(state) ? null : STEPS[state.tutorial.step] ?? null;
}
/** 지금 하고 있는 장 (끝났으면 null) */
export function currentTutorialChapter(state: GameState): TutorialChapter | null {
  const step = currentTutorialStep(state);
  return step ? TUTORIAL_CHAPTERS.find((c) => c.id === step.chapter) ?? null : null;
}
/** 단계 id가 끝났나 */
export function tutorialStepDone(state: GameState, id: number): boolean {
  return state.tutorial.step >= id;
}

/** 현재 단계의 대사를 봤고 조건이 찼으면 보상(보상 상자 알림)을 주고 step++. 한 번에 한 단계. 끝낸 단계 id 또는 null. */
export function checkTutorial(state: GameState): number | null {
  const step = currentTutorialStep(state);
  if (!step || !dialogueSeen(state, step.id) || !step.done(state)) return null;
  state.tutorial.step++;
  applyRewards(state, step.reward, { source: 'tutorial', refId: String(step.id), title: `튜토리얼 ${step.id}단계` });
  return step.id;
}

/** 현재 장을 통째로 건너뛴다: 남은 단계의 해금 보상(기능·시설)만 조용히 적용하고 step을 장 끝으로. 돈·응모권 등은 안 준다. 건너뛴 장 수. */
export function skipTutorialChapter(state: GameState): number {
  const ch = currentTutorialChapter(state);
  if (!ch) return 0;
  for (const st of STEPS) {
    if (st.id <= state.tutorial.step || st.id > ch.to) continue;
    for (const r of st.reward) {
      if (r.type === 'unlockFeature') state.features[r.id] = true;
      else if (r.type === 'unlockFacility' && !state.unlocked.objects.includes(r.id)) state.unlocked.objects.push(r.id);
    }
  }
  state.tutorial.step = ch.to;
  state.tutorial.skipped = true;
  return ch.id;
}

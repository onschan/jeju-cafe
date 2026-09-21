/**
 * 손으로 하는 튜토리얼 「할망의 가르침」 33단계 · 5장 (§7.2 확장 + w-start 맨땅 시작). 1년차 전체를 관통하며 모든 시스템을 한 번씩 직접 해 본다.
 * w-start: 새 게임은 맨땅(본관 없음)에서 시작한다. 1~3단계(둘러보기·본관 짓기·본관 보기)를 앞에 넣어 기존 30단계는 번호가 3씩 밀렸다.
 * 진행은 sim 상태(state.tutorial.step = 끝낸 단계 수)에 있어 저장·복원되고 결정적이다.
 * 각 단계의 done 조건은 sim 상태만 본다. 창을 열었다 같은 UI 사건은 UI가 `tutorialNote` 액션으로 state.tutorial.seen에 남긴다(카드 봄·창고 봄·입지 보기 켬).
 * 액션으로 하는 것(되돌리기·연수·뽑기·선물…)은 apply가 성공한 액션 타입을 seen에 넣는다(TRACKED_ACTIONS).
 * 대사 게이트: UI가 현재 단계 대사를 닫으면 `dlg:<id>`를 seen에 넣고, 그 뒤에야 단계가 끝난다 — 이미 충족된 단계도 대사는 한 번 보고 바로 통과한다.
 * 단계를 끝내면 applyRewards(보상 상자) → step++. 건너뛰기는 장 단위(skipTutorialChapter, 해금 보상만 조용히 적용).
 * 대사는 data/dialogue/tutorial.json(key로 짝). 하이라이트(data-tut·맵 칸)는 ui/tutorialHighlight.ts.
 *
 * | 장 | 단계 | 조건 | 하이라이트(data-tut / 맵 칸) | 보상 |
 * | 1 개업 | 1 look | 정낭·정류장·바위·마을 길 탭(seen look:*) | 아직 안 본 칸 | — |
 * |  | 2 build_main | 본관 짓기(placeMain) | nav:build·tab:building·build:warehouse·추천 칸 3 | ₩30만 |
 * |  | 3 look_main | 본관 카드 보기(seen look:main) | 본관 발자국 | — |
 * |  | 4 path | 마을 길→문 앞 올렛길 | nav:build·tab:path·마을 길(정낭이 있으면 정낭)·문 앞 | ₩30만 |
 * |  | 5 seat_view | 전망 2+ 자리 테이블 | tab:rest·길 옆 빈 칸 | ₩30만·입지 보기 |
 * |  | 6 menu | 아메리카노·감귤주스 | nav:cafe·tab:menu·menu-put | ₩20만 |
 * |  | 7 first_pay | 첫 결제 | 정류장 칸 | 응모권 1 |
 * |  | 8 hire | 직원 1명 | nav:people·tab:candidates·hire | ₩30만 |
 * |  | 9 wall | 돌담을 테이블 북서쪽 | tab:wall·북서 띠 | ₩30만·콤보 도감·홍보·연구 10 |
 * |  | 10 promote | 홍보 1회 | tab:promo·promote | 마일리지 30 |
 * |  | 11 challenge | 도전 1개 수락 | goal-bar·tab:challenge·challenge-accept | ₩50만 |
 * | 2 자리와 손님 | 12 site_seat | 입지 보기 켜고 전망 자리 테이블 2개 | site-toggle·tab:rest | ₩20만 |
 * |  | 13 guest_card | 손님 카드 보기(seen guestCard) | tab:guests·guest-row | ₩10만 |
 * |  | 14 target | 타깃 손님층 1개 | target-slot·target-pick | 마일리지 20 |
 * |  | 15 combo2 | 콤보 2개(감귤나무: 귤밭 뷰·밭담 귤 수확) | tab:farm·build:tangerine_tree·후보 칸 | ₩30만 |
 * |  | 16 path10 | 올렛길 10칸 | tab:path | ₩10만 |
 * |  | 17 undo | 되돌리기 1회 | tool:undo | ₩10만 |
 * | 3 첫 달 결산 | 18 month_end | 첫 월말 결산 닫기 | — | 명소 지도 |
 * |  | 19 seats4 | 좌석 4개(자리 없음 불만 해결) | tab:rest | ₩30만 |
 * |  | 20 clean | 홀·청소 직원 배치 | tab:staff·hire·assign | ₩20만 |
 * |  | 21 storage | 재료 창고 보기(seen storage) | tab:ingredients | 연구 5 |
 * |  | 22 harvest | 농원 수확(다음 달 1일) | tab:farm | ₩30만 |
 * | 4 키우기 | 23 expand | 본관 Lv2 완공 | tab:building·main-expand·막는 시설 칸 | ₩50만 |
 * |  | 24 indoor2 | 실내 좌석 2개 | tab:indoor·build:table_in·방 안 칸 | ₩30만 |
 * |  | 25 train | 연수 1회(랭크 3) | tab:staff·train·train-pick | 연구 20·연구 개발 |
 * |  | 26 recipe | 레시피 개발 1회 | tab:craft·craft-ingredient·develop | ₩50만 |
 * |  | 27 spot | 명소 투자 1회 | tab:spots·spot-invest | ₩30만·주차장 |
 * |  | 28 parking | 렌터카 손님 1명 | tab:convenience·build:parking_lot | ₩30만·응모권 1 |
 * |  | 29 shop | 상점 뽑기·구매 1회 | tab:tickets·shop:draw·draw | 마일리지 30·선물 1 |
 * | 5 마을과 세상 | 30 gift | 선물 1회 | gift | 응모권 1 |
 * |  | 31 event | 이벤트 1개 겪기(대화 닫기·응답) | tab:invest·event-respond | ₩50만·팝업 스토어 |
 * |  | 32 popup_rival | 팝업 또는 대결 1회 | tab:region·popup-open·tab:rivals·rival-challenge | ₩50만 |
 * |  | 33 graduate | 가이드북 발표 보기 | — | 응모권 5·₩100만·칭호 「할망의 제자」 |
 */
import type { GameState, GoalReward, Pt, FeatureId, PlacedObject, Action } from './types.ts';
import { objectDef, COMBOS } from '../data/index.ts';
import { isDoorReachable, busStopPos } from './path.ts';
import { doorFrontOf, objectAt, cellAt, footprintOf } from './grid.ts';
import { applyRewards } from './goals.ts';
import { siteOf } from './site.ts';
import { parcelAt } from './parcels.ts';
import { activeCombos } from './compat.ts';
import { freeFloorCells, expandCells, canBuildMain, MAIN_TYPE, MAIN_SIZE, MAIN_RECOMMEND_GATE_DIST, MAIN_RECOMMEND_N } from './rooms.ts';
import { isFarmObject } from './orchard.ts';

export const TUTORIAL_STEPS = 33;

export interface TutorialChapter { id: number; title: string; /** 단계 id 범위 [from, to] */ from: number; to: number }
export const TUTORIAL_CHAPTERS: TutorialChapter[] = [
  { id: 1, title: '개업', from: 1, to: 11 },
  { id: 2, title: '자리와 손님', from: 12, to: 17 },
  { id: 3, title: '첫 달 결산', from: 18, to: 22 },
  { id: 4, title: '키우기', from: 23, to: 29 },
  { id: 5, title: '마을과 세상', from: 30, to: 33 },
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
/** UI가 tutorialNote로 남기는 키. `look:<id>`는 1·3단계 둘러보기(정낭·정류장·바위·마을 길·본관 카드를 열었다) */
export type TutorialNoteKey = 'siteView' | 'guestCard' | 'storage' | `look:${LookId}`;
/** 1단계 둘러보기에서 하나씩 눌러 보는 것 (순서대로 글로우) + 3단계 본관 */
export type LookId = 'gate' | 'busstop' | 'rock' | 'road' | 'main';
export const LOOK_IDS: LookId[] = ['gate', 'busstop', 'rock', 'road'];
/** 둘러보기 카드 위 한 줄 설명 (초중생 어휘, MiniCard Hint) */
export const LOOK_TEXT: Record<LookId, string> = {
  gate: '정낭: 제주식 대문. 있으면 관광객이 좋아해. 옮겨도 돼',
  busstop: '정류장: 버스가 손님을 내려 줘요',
  rock: '바위: ₩10만이면 바로 치워',
  road: '마을 길: 버스가 다니는 길. 여기서 우리 길을 이어요',
  main: '카페 본관: 카운터·주방·실내 자리가 다 여기 있어요',
};

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
/** 마을 길(정류장)에서 본관 문 앞까지 올렛길이 이어졌나 (path/road/gate 걷기 BFS — 정낭 경유 조건 없음, w-free) */
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
/** 본관 Lv2 증축 발자국 중 시설(길 제외)이 막고 있는 칸 — 「이동」으로 치우라는 안내용. 공사 중이거나 이미 Lv2면 없음. */
function expandBlockedCells(s: GameState): Pt[] {
  if (s.main.level >= 2 || s.main.work) return [];
  return expandCells(s).filter((p) => { const o = objectAt(s, p.x, p.y); return !!o && objectDef(o.type).kind !== 'path'; });
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

/** 1단계 둘러보기: 아직 안 본 것의 칸 (정낭·정류장·정낭(없으면 정류장)에서 가장 가까운 바위·마을 길 칸) — 본 것부터 글로우가 꺼진다 */
function lookCells(s: GameState): Pt[] {
  const out: Pt[] = [];
  const g = gate(s);
  const bus = Object.values(s.objects).find((o) => o.type === 'busstop');
  if (!seen(s, 'look:gate') && g) out.push({ x: g.x, y: g.y });
  if (!seen(s, 'look:busstop') && bus) out.push({ x: bus.x, y: bus.y });
  const from = g ? { x: g.x, y: g.y } : bus ? { x: bus.x, y: bus.y } : { x: 0, y: 0 };
  if (!seen(s, 'look:rock')) { const r = nearestRock(s, from); if (r) out.push(r); }
  if (!seen(s, 'look:road')) { const r = nearestRoad(s, from); if (r) out.push(r); }
  return out;
}
function nearestCell(s: GameState, from: Pt, ok: (x: number, y: number) => boolean): Pt | null {
  let best: Pt | null = null, bd = Infinity;
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!ok(x, y)) continue;
    const d = Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) + (Math.abs(x - from.x) + Math.abs(y - from.y)) / 100;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}
/** 내 필지의 빈 바위 칸 중 from에서 가장 가까운 것 */
function nearestRock(s: GameState, from: Pt): Pt | null {
  return nearestCell(s, from, (x, y) => { const c = cellAt(s, x, y); return (c.terrain === 'rock' || c.terrain === 'rock_big') && !c.objectId && !!parcelAt(s, x, y)?.owned; });
}
/** 마을 길 칸 중 from에서 가장 가까운 것 */
function nearestRoad(s: GameState, from: Pt): Pt | null {
  return nearestCell(s, from, (x, y) => cellAt(s, x, y).terrain === 'road' && !cellAt(s, x, y).objectId);
}
export function lookedAll(s: GameState): boolean {
  return LOOK_IDS.every((id) => seen(s, `look:${id}`));
}
/** 본관 발자국 원점 후보 중 추천 자리 (원점 칸, 최대 n): 문 앞 칸이 정낭(없으면 정류장)에서 MAIN_RECOMMEND_GATE_DIST 안인 자리를 바람 적은 순(원점 칸 입지 wind) → 거리 순으로. 빈 마당은 바람이 대부분 3이라 바람은 잘라내지 않고 정렬만 한다. 본관이 이미 있으면 []. 2단계 글로우·짓기 고스트 첫 자리. */
export function recommendedMainCells(s: GameState, n = MAIN_RECOMMEND_N): Pt[] {
  if (mainBuilding(s)) return [];
  const g0 = gate(s);
  const g = g0 ? { x: g0.x, y: g0.y } : busStopPos(s); // 정낭을 치웠으면 정류장 기준 (w-free)
  const size = MAIN_SIZE[1]!;
  const out: { p: Pt; wind: number; dist: number }[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    if (!canBuildMain(s, x, y).ok) continue;
    const f = doorFrontOf({ type: MAIN_TYPE, x, y, w: size.w, h: size.h });
    const dist = Math.max(Math.abs(g.x - f.x), Math.abs(g.y - f.y));
    if (dist > MAIN_RECOMMEND_GATE_DIST) continue;
    out.push({ p: { x, y }, wind: siteOf(s, x, y).wind, dist });
  }
  out.sort((a, b) => a.wind - b.wind || a.dist - b.dist || a.p.y - b.p.y || a.p.x - b.p.x);
  return out.slice(0, n).map((o) => o.p);
}
/** 4단계 길 잇기 글로우: 길의 시작과 본관 문 앞 (w-free: 정낭은 필수가 아니다).
 *  시작 = 마을 길에 붙어 있는 정낭(대문 구실을 하는 것)이 있으면 그 칸, 아니면 문 앞에서 가장 가까운 마을 길 칸. */
function pathCells(s: GameState): Pt[] {
  const b = mainBuilding(s);
  if (!b) return [];
  const f = doorFrontOf(b);
  const g = Object.values(s.objects).find((o) => o.type === 'gate' && nextToRoad(s, o.x, o.y));
  const start = g ? { x: g.x, y: g.y } : nearestRoad(s, f);
  return [...(start ? [start] : []), f];
}
/** 4방향 이웃에 마을 길 칸이 있나 */
function nextToRoad(s: GameState, x: number, y: number): boolean {
  return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => inBounds(s, x + dx, y + dy) && cellAt(s, x + dx, y + dy).terrain === 'road');
}
/** 본관 발자국 칸 (3단계 글로우) */
function mainCells(s: GameState): Pt[] {
  const m = mainBuilding(s);
  return m ? footprintOf(m) : [];
}

const money = (amount: number): GoalReward => ({ type: 'money', amount });
const feature = (id: FeatureId): GoalReward => ({ type: 'unlockFeature', id });
const none = () => [] as Pt[];

export const STEPS: TutorialStepDef[] = [
  // ---- 1장 개업 (3월 1주) — w-start: 맨땅에서 둘러보기 → 본관 짓기 → 본관 보기 → 길 ----
  { id: 1, key: 'look', chapter: 1, done: lookedAll, reward: [], targets: [], cells: lookCells },
  { id: 2, key: 'build_main', chapter: 1, done: (s) => !!mainBuilding(s), reward: [money(300_000)], targets: ['nav:build', 'tab:building', 'build:warehouse'],
    cells: (s) => recommendedMainCells(s) },
  { id: 3, key: 'look_main', chapter: 1, done: (s) => seen(s, 'look:main'), reward: [], targets: [], cells: mainCells },
  { id: 4, key: 'path', chapter: 1, done: pathConnected, reward: [money(300_000)], targets: ['nav:build', 'tab:path', 'build:path'],
    cells: pathCells },
  { id: 5, key: 'seat_view', chapter: 1, done: (s) => seatWithView(s, 2), reward: [money(300_000), feature('siteView')], targets: ['nav:build', 'tab:rest', 'build:table_out'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 6, key: 'menu', chapter: 1, done: (s) => s.menuSlots.includes('americano') && s.menuSlots.includes('tangerine_juice'), reward: [money(200_000)], targets: ['nav:cafe', 'tab:menu', 'menu-put'], cells: none },
  { id: 7, key: 'first_pay', chapter: 1, done: (s) => s.totalIncome > 0, reward: [{ type: 'tickets', n: 1 }], targets: [], cells: (s) => [busStopPos(s)] },
  { id: 8, key: 'hire', chapter: 1, done: (s) => s.staff.length >= 1, reward: [money(300_000)], targets: ['nav:people', 'tab:candidates', 'hire'], cells: none },
  // 10단계(홍보)를 바로 할 수 있게 홍보 기능과 전단 연구비(10)를 여기서 준다 — g07(만족 손님 10명)보다 튜토리얼이 먼저 온다
  { id: 9, key: 'wall', chapter: 1, done: wallShelteringSeat, reward: [money(300_000), feature('comboCodex'), feature('promote'), { type: 'research', n: 10 }], targets: ['nav:build', 'tab:wall', 'build:stonewall'],
    cells: (s) => shelterCells(s, 6) },
  { id: 10, key: 'promote', chapter: 1, done: (s) => s.stats.promotionsDone >= 1, reward: [{ type: 'mileage', n: 30 }], targets: ['nav:cafe', 'tab:promo', 'promote'], cells: none },
  { id: 11, key: 'challenge', chapter: 1, done: (s) => s.challenges.active.length + s.challenges.done.length >= 1, reward: [money(500_000)], targets: ['goal-bar', 'tab:challenge', 'challenge-accept'], cells: none },
  // ---- 2장 자리와 손님 (3월) ----
  { id: 12, key: 'site_seat', chapter: 2, done: (s) => seen(s, 'siteView') && seatWithView(s, 2, 2), reward: [money(200_000)], targets: ['nav:build', 'site-toggle', 'tab:rest', 'build:table_out'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 13, key: 'guest_card', chapter: 2, done: (s) => seen(s, 'guestCard'), reward: [money(100_000)], targets: ['nav:people', 'tab:guests', 'guest-row'], cells: none },
  { id: 14, key: 'target', chapter: 2, done: (s) => s.targets.length >= 1, reward: [{ type: 'mileage', n: 20 }], targets: ['nav:people', 'tab:guests', 'target-slot', 'target-pick'], cells: none },
  { id: 15, key: 'combo2', chapter: 2, done: (s) => activeComboCount(s) >= 2, reward: [money(300_000)], targets: ['nav:build', 'tab:farm', 'build:tangerine_tree'],
    cells: (s) => comboCells(s, 3) },
  { id: 16, key: 'path10', chapter: 2, done: (s) => count(s, 'path') >= 10, reward: [money(100_000)], targets: ['nav:build', 'tab:path', 'build:path'], cells: none },
  { id: 17, key: 'undo', chapter: 2, done: (s) => seen(s, 'undoLast'), reward: [money(100_000)], targets: ['nav:build', 'tool:undo'], cells: none },
  // ---- 3장 첫 달 결산 (4월 1일~) ----
  { id: 18, key: 'month_end', chapter: 3, done: firstMonthClosed, reward: [feature('spotMap')], targets: [], cells: none },
  { id: 19, key: 'seats4', chapter: 3, done: (s) => seats(s).length >= 4, reward: [money(300_000)], targets: ['nav:build', 'tab:rest', 'build:table_out'],
    cells: (s) => emptyCellsNearPath(s, 3) },
  { id: 20, key: 'clean', chapter: 3, done: (s) => s.staff.some((st) => st.role === 'hall' || st.role === 'clean'), reward: [money(200_000)], targets: ['nav:people', 'tab:staff', 'tab:candidates', 'hire', 'assign'], cells: none },
  { id: 21, key: 'storage', chapter: 3, done: (s) => seen(s, 'storage'), reward: [{ type: 'research', n: 5 }], targets: ['nav:cafe', 'tab:ingredients'], cells: none },
  { id: 22, key: 'harvest', chapter: 3, done: (s) => hasFarm(s) && harvestedAny(s), reward: [money(300_000)], targets: ['nav:build', 'tab:farm', 'build:tangerine_tree'], cells: none },
  // ---- 4장 키우기 (5~7월) ----
  { id: 23, key: 'expand', chapter: 4, done: (s) => s.main.level >= 2 && !s.main.work, reward: [money(500_000)], targets: ['nav:cafe', 'tab:building', 'main-expand'],
    cells: (s) => expandBlockedCells(s) },
  { id: 24, key: 'indoor2', chapter: 4, done: (s) => indoorSeatObjects(s).length >= 2, reward: [money(300_000)], targets: ['nav:cafe', 'tab:indoor', 'build:table_in'],
    cells: (s) => mainFloorCells(s, 3) },
  // 26단계(레시피)를 바로 할 수 있게 연구 개발 기능을 여기서 연다 — g16(메뉴 4개)보다 먼저 올 수 있다
  { id: 25, key: 'train', chapter: 4, done: (s) => s.stats.trainings >= 1 || seen(s, 'train'), reward: [{ type: 'research', n: 20 }, feature('craft')], targets: ['nav:people', 'tab:staff', 'train', 'train-pick'], cells: none },
  { id: 26, key: 'recipe', chapter: 4, done: (s) => s.stats.recipesMade >= 1 || s.customMenus.length >= 1 || seen(s, 'develop'), reward: [money(500_000)], targets: ['nav:cafe', 'tab:craft', 'craft-ingredient', 'develop'], cells: none },
  // 28단계(주차장)를 바로 지을 수 있게 주차장 시설을 여기서 연다 (좌석 6개 조건보다 먼저 올 수 있다)
  { id: 27, key: 'spot', chapter: 4, done: (s) => Object.values(s.spots).some((lv) => lv >= 1) || seen(s, 'investSpot'), reward: [money(300_000), { type: 'unlockFacility', id: 'parking_lot' }], targets: ['nav:ledger', 'tab:spots', 'spot-invest'], cells: none },
  { id: 28, key: 'parking', chapter: 4, done: (s) => (s.routes?.parking?.totalGuests ?? 0) >= 1, reward: [money(300_000), { type: 'tickets', n: 1 }], targets: ['nav:build', 'tab:convenience', 'build:parking_lot'], cells: none },
  // 30단계(선물)를 바로 할 수 있게 선물 하나를 준다
  { id: 29, key: 'shop', chapter: 4, done: (s) => seen(s, 'drawTicket') || seen(s, 'buyMileage') || seen(s, 'buyTicket'), reward: [{ type: 'mileage', n: 30 }, { type: 'item', id: 'gift_tangerine_box', n: 1 }], targets: ['nav:ledger', 'tab:tickets', 'shop:draw', 'draw'], cells: none },
  // ---- 5장 마을과 세상 (8~12월) ----
  { id: 30, key: 'gift', chapter: 5, done: (s) => seen(s, 'giveGift') || s.giftDay >= 0, reward: [{ type: 'tickets', n: 1 }], targets: ['gift'], cells: none },
  // 32단계(팝업)를 바로 할 수 있게 팝업 스토어 기능을 여기서 연다 — g18(랭크 2)보다 먼저 올 수 있다
  { id: 31, key: 'event', chapter: 5, done: eventExperienced, reward: [money(500_000), feature('popup')], targets: ['nav:ledger', 'tab:invest', 'event-respond'], cells: none },
  { id: 32, key: 'popup_rival', chapter: 5, done: (s) => seen(s, 'openPopup') || seen(s, 'challenge') || (s.popup?.visits?.length ?? 0) >= 1 || s.stats.rivalWins >= 1, reward: [money(500_000)], targets: ['nav:ledger', 'tab:region', 'popup-open', 'nav:people', 'tab:rivals', 'rival-challenge'], cells: none },
  { id: 33, key: 'graduate', chapter: 5, done: announcementSeen, reward: [{ type: 'tickets', n: 5 }, money(1_000_000), { type: 'title', id: 'halmang_pupil', name: '할망의 제자' }], targets: [], cells: none },
];

export function initTutorial(skipped = false): GameState['tutorial'] {
  return { step: skipped ? TUTORIAL_STEPS : 0, skipped, seen: [] };
}
/** 완성 시작 상태(starter)·전체 건너뛰기에서 바로 여는 튜토리얼 기능: 1장 보상 중 목표 체인이 안 주는 것(입지 보기·콤보 도감·명소 지도)과 홍보.
 *  25·31단계가 주는 연구 개발·팝업 스토어는 목표(g16·g18)가 여니 여기서 안 연다 — 봇(starter)의 진행이 바뀌지 않게. */
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
  if (step.reward.length > 0) applyRewards(state, step.reward, { source: 'tutorial', refId: String(step.id), title: `튜토리얼 ${step.id}단계` }); // 보상 없는 단계(둘러보기)는 빈 상자를 안 띄운다
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

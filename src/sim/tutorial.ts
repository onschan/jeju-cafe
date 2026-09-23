/**
 * 손으로 하는 튜토리얼 「할망의 가르침」 7단계 (fun-start §2 — 시작 3분).
 * 새 게임은 할망이 준 폐창고(본관)가 이미 서 있고 마을 길에서 문 앞까지 올렛길이 이어진 채 시작한다(state.ts 'tutorial'). 테이블 1개·메뉴 1개면 첫 손님이 온다.
 * 화자는 전부 할망. 장(章) 개념은 없다 — 배지는 「📖 n/7」. 그 밖의 시스템(증축·연수·명소·주차장·선물·추천…)은 창을 처음 열 때 한 줄 팁(ui/firstTip.ts)으로.
 * 글로우 칸은 고정 좌표가 아니라 strategy.ts가 실제 입지로 고른 칸(테이블 = seatScore 최고). 대사의 `{토큰}`은 strategyVars로 채운다(`{seatWhy}` = 왜 그 칸인지 한 줄).
 * 진행은 sim 상태(state.tutorial.step = 끝낸 단계 수)에 있어 저장·복원되고 결정적이다.
 * 각 단계의 done 조건은 sim 상태만 본다. 창을 열었다 같은 UI 사건은 UI가 `tutorialNote` 액션으로 state.tutorial.seen에 남긴다(손님 카드 봄·목표 창 봄…).
 * 액션으로 하는 것(손님 인사 등)은 apply가 성공한 액션 타입을 seen에 넣는다(TRACKED_ACTIONS).
 * 대사 게이트: UI가 현재 단계 대사를 닫으면 `dlg:<id>`를 seen에 넣고, 그 뒤에야 단계가 끝난다 — 이미 충족된 단계도 대사는 한 번 보고 바로 통과한다.
 * 단계를 끝내면 applyRewards(보상 상자) → step++. 건너뛰기는 언제나(skipTutorialChapter = 남은 단계 전부, 해금 보상만 조용히 적용).
 * 대사는 data/dialogue/tutorial.json(key로 짝). 하이라이트(data-tut·맵 칸)는 ui/tutorialHighlight.ts.
 *
 * 5막 — 막마다 「그 시스템이 실제로 필요해지는 순간」에 열린다. 막이 열리기 전엔 그 막의 단계가 하나도 안 뜨고, 한 막 안에서도 단계 사이에 최소 한 게임일을 둔다.
 * | 막 | 열리는 때 | 단계 | 막 보상 |
 * | 1 카페를 연다      | 새 게임 바로                     | 자리·메뉴·첫 손님 인사            | ₩30만 · 응모권 1 |
 * | 2 자리와 명당      | 좌석 2개 + 첫 결제               | 자리 점수 보기·첫 명당·명당 곁 자리 | ₩30만 |
 * | 3 한 단계 올린다   | 자금 ₩80만 + 좌석 3개            | 트리 올리기·붙여 놓기·직원 채용     | ₩30만 · 응모권 1 |
 * | 4 넓히고 다시 놓는다| 자금 ₩300만 또는 자리 이용률 80% | 필지 사기·다른 길 열기·옮기기       | ₩50만 |
 * | 5 우리 카페의 색   | 등급 2 또는 2년차                | 진단 읽기·대회 접수                | 칭호 「할망의 제자」·₩50만·응모권 3 |
 */
import type { GameState, GoalReward, Pt, FeatureId, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { isDoorReachable, busStopPos, walkableNeighborsOf } from './path.ts';
import { CORNERS, cornersDoneIncludingWork, cornerProgressIncludingWork, cornerPieceDefault } from './corners.ts';
import { ownedParcels } from './parcels.ts';
import { dayIndex } from './effects.ts';
import { customMet } from './goals.ts';
import { doorFrontOf, cellAt, canPlace } from './grid.ts';
import { applyRewards } from './goals.ts';
import { parcelAt } from './parcels.ts';
import { MAIN_RECOMMEND_N } from './rooms.ts';
import { TUTORIAL_STEPS as TUTORIAL_STEP_TEXTS } from '../data/dialogue/index.ts';
import { bestMainCells, recommendedSeatCell } from './strategy.ts';

/** 보상 상자 제목: 단계 이름 (dialogue/tutorial.json title) */
export function tutorialStepTitle(id: number): string {
  return TUTORIAL_STEP_TEXTS.find((t) => t.id === id)?.title ?? `튜토리얼 ${id}단계`;
}


export interface TutorialStepDef {
  id: number;
  /** 속한 막 (1~5) */
  act: number;
  key: string;
  done: (s: GameState) => boolean;
  /** 하이라이트할 DOM 타깃(data-tut 값, 열린 창에 따라 있는 것만 빛난다). 상태에 따라 다르면 함수. */
  targets: string[] | ((s: GameState) => string[]);
  /** 하이라이트할 맵 칸 */
  cells: (s: GameState) => Pt[];
}
/** 단계의 DOM 타깃 (정적 배열·함수 둘 다) */
export function stepTargets(step: TutorialStepDef, s: GameState): string[] {
  return typeof step.targets === 'function' ? step.targets(s) : step.targets;
}

/** apply가 성공하면 state.tutorial.seen에 타입을 남기는 액션 (조건 판정용). 문자열 집합 — `greetGuest`는 트랙 G(손님 인사)가 만드는 액션이라 아직 Action 타입에 없어도 미리 둔다. */
export const TRACKED_ACTIONS: ReadonlySet<string> = new Set<string>([
  'greetGuest', 'undoLast', 'train', 'develop', 'drawTicket', 'buyMileage', 'buyTicket', 'giveGift', 'respondEvent', 'investSpot',
  'treeUpgrade', 'move', 'buyParcel', 'enterContest',
]);
/** UI가 tutorialNote로 남기는 키. `look:<id>`는 미니 카드 「이게 뭐예요」 힌트(정낭·정류장·마을 길·본관), goalWindow는 목표 창을 열었다(6단계). */
export type TutorialNoteKey = 'siteView' | 'guestCard' | 'storage' | 'goalWindow' | 'checkup' | `look:${LookId}`;
/** 처음부터 놓여 있는 것의 카드 힌트 id (MiniCard Hint) */
export type LookId = 'gate' | 'busstop' | 'road' | 'main';
/** 카드 위 한 줄 설명 (초중생 어휘, MiniCard Hint) */
export const LOOK_TEXT: Record<LookId, string> = {
  gate: '정낭: 제주식 대문 장식. 관광객이 좋아한다',
  busstop: '정류장: 버스가 손님을 내려 준다',
  road: '마을 길: 버스가 다니는 길. 올렛길이 여기서 시작한다',
  main: '카페 본관: 카운터·주방·실내 자리가 다 여기 있다',
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
/** 마을 길(정류장)에서 본관 문 앞까지 올렛길이 이어졌나 (path/road/gate 걷기 BFS) */
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
/** 오브젝트 발자국과 칸의 체비쇼프 거리 (compat.ts dist와 같은 셈) */
function distToCell(o: PlacedObject, x: number, y: number): number {
  const w = o.w ?? objectDef(o.type).w ?? 1, h = o.h ?? objectDef(o.type).h ?? 1;
  const dx = Math.max(0, o.x - x, x - (o.x + w - 1));
  const dy = Math.max(0, o.y - y, y - (o.y + h - 1));
  return Math.max(dx, dy);
}
function objectsOfTypes(s: GameState, types: readonly string[]): PlacedObject[] {
  return Object.values(s.objects).filter((o) => types.includes(o.type));
}

// ---------- 5단계 첫 명당 「꽃길」 (트랙 C corners: 꽃밭 + 벤치 + 가로등) ----------

/** 튜토리얼 첫 명당 */
export const TUTORIAL_CORNER_ID = 'corner_flower_path';
/** 꽃길 조각 순서 (corners.json 그대로: 꽃밭 → 벤치 → 가로등) */
export const CORNER_PIECE_TYPES: readonly string[] = (CORNERS.find((c) => c.id === TUTORIAL_CORNER_ID)?.pieces.map((p) => cornerPieceDefault(p.type)) ?? ['flower_bed', 'deco_wood_bench', 'streetlight']); // spot2: 조각은 종류 — 튜토리얼이 가리킬 시설 하나로 바꾼다
/** 조각끼리 서로 반경 CORNER_RADIUS 안 (corners.json radius) */
export const CORNER_RADIUS = CORNERS.find((c) => c.id === TUTORIAL_CORNER_ID)?.radius ?? 2;
/** 첫 명당이 생겼나: 마지막 조각을 놓는 순간 통과한다 (꽃밭·벤치·가로등은 공사 1일이라 완공을 기다리면 같은 안내가 하루 더 되풀이된다).
 *  효과·도감 등록은 완공 뒤 그대로다 — 여기선 단계 판정만 앞당긴다. */
export function cornerMade(s: GameState): boolean {
  return cornersDoneIncludingWork(s) >= 1;
}
/** 꽃길 닻(첫 조각) — 내 필지 위 완공·공사 중 꽃밭 중 첫 것 */
function cornerAnchor(s: GameState): PlacedObject | null {
  return objectsOfTypes(s, [CORNER_PIECE_TYPES[0]!]).find((o) => parcelAt(s, o.x, o.y)?.owned) ?? null;
}
/** 5단계에서 아직 빠진 조각: 닻(꽃밭)이 없으면 꽃밭, 있으면 닻 반경 안에 없는 첫 조각 (벤치 → 가로등) */
export function cornerMissingType(s: GameState): string {
  const anchor = cornerAnchor(s);
  if (!anchor) return CORNER_PIECE_TYPES[0]!;
  for (const type of CORNER_PIECE_TYPES.slice(1)) {
    const near = objectsOfTypes(s, [type]).some((o) => distToCell(anchor, o.x, o.y) <= CORNER_RADIUS);
    if (!near) return type;
  }
  return CORNER_PIECE_TYPES[CORNER_PIECE_TYPES.length - 1]!;
}
/** 칸이 길 옆인가 (손님이 명당을 찾아가려면 조각 하나가 길에 붙어 있어야 한다) */
function besidePath(s: GameState, x: number, y: number): boolean {
  return walkableNeighborsOf(s, x, y).length > 0;
}
/** 5단계 글로우: 빠진 조각을 놓을 칸 1개 — 꽃밭이면 첫 테이블 옆(반경 2)에서 길 옆 빈 칸, 벤치·가로등이면 꽃밭 옆(반경 2) 빈 칸. 테이블(꽃밭)과 가까운 순. */
export function cornerCells(s: GameState): Pt[] {
  const type = cornerMissingType(s);
  const anchorObj = cornerAnchor(s);
  const anchor = type === CORNER_PIECE_TYPES[0] || !anchorObj ? seats(s)[0] : anchorObj;
  if (!anchor) return [];
  const front = mainBuilding(s) ? doorFrontOf(mainBuilding(s)!) : null;
  let best: Pt | null = null, bd = Infinity;
  for (let dy = -CORNER_RADIUS; dy <= CORNER_RADIUS; dy++) for (let dx = -CORNER_RADIUS; dx <= CORNER_RADIUS; dx++) {
    const x = anchor.x + dx, y = anchor.y + dy;
    if (!emptySoil(s, x, y) || (front && front.x === x && front.y === y) || !canPlace(s, type, x, y).ok) continue;
    // 꽃밭(닻)은 길 옆을 우선 (길 옆이 아니면 +10) — 명당 완성 뒤 손님이 찾아올 수 있게
    const d = Math.max(Math.abs(dx), Math.abs(dy)) + (Math.abs(dx) + Math.abs(dy)) / 100 + (type === CORNER_PIECE_TYPES[0] && !besidePath(s, x, y) ? 10 : 0);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best ? [best] : [];
}

/** 본관 발자국 원점 후보 중 추천 자리 (원점 칸, 최대 n): 바람 적은 순 → 정류장과 문 앞 거리 순 (strategy.bestMainCells). 본관이 이미 있으면 []. 옛 맨땅(bare)·placeMain 고스트 첫 자리. */
export function recommendedMainCells(s: GameState, n = MAIN_RECOMMEND_N): Pt[] {
  return bestMainCells(s, n);
}
/** 1단계 테이블 글로우: 사용자가 고른 칸(strategy.TUTORIAL_SEAT_CELL = 15,11)을 먼저 — 못 놓으면 입지 최고 칸(bestSeatCells). 닿는 칸이 없으면 길 옆 빈 칸. */
function seatCells(s: GameState): Pt[] {
  const best = recommendedSeatCell(s);
  if (best) return [best];
  const out: Pt[] = [];
  for (const p of Object.values(s.objects).filter((o) => o.type === 'path')) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = p.x + dx, y = p.y + dy;
      if (!emptySoil(s, x, y) || out.some((q) => q.x === x && q.y === y)) continue;
      out.push({ x, y });
      if (out.length >= 3) return out;
    }
  }
  return out;
}
/** 3단계 글로우: 손님이 있으면 그 손님 칸(탭해서 인사), 없으면 정류장 */
function guestCells(s: GameState): Pt[] {
  const g = s.guests[0];
  return g ? [{ x: Math.round(g.x), y: Math.round(g.y) }] : [busStopPos(s)];
}
/** 첫 손님에게 인사했나: 트랙 G의 greetGuest 액션(TRACKED_ACTIONS) 또는 손님 카드 열기 */
export function greetedGuest(s: GameState): boolean {
  return seen(s, 'greetGuest') || seen(s, 'guestCard');
}

const money = (amount: number): GoalReward => ({ type: 'money', amount });
const none = () => [] as Pt[];

// ---------- 5막 (막마다 「그 시스템이 실제로 필요해지는 순간」에 열린다) ----------

/** 단계 사이 최소 간격 (게임일) — 한 막 안에서도 대사가 연달아 터지지 않게 */
export const TUTORIAL_STEP_GAP_DAYS = 1;
/** 2막이 열리는 좌석 수 / 3막 자금·좌석 / 4막 자금·좌석 이용률 / 5막 등급·연차 */
export const ACT2_SEATS = 2;
export const ACT3_MONEY = 800_000;
export const ACT3_SEATS = 3;
export const ACT4_MONEY = 3_000_000;
export const ACT4_SEAT_USE = 0.8;
export const ACT5_GRADE = 2;
export const ACT5_YEAR = 2;

export interface TutorialActDef {
  id: number;
  name: string;
  /** 막이 열릴 때 할망 한 줄 예고 (≤22자) */
  lead: string;
  /** 아직 안 열린 막을 창에 한 줄로 ("좌석 2개와 첫 결제") */
  when: string;
  /** 트리거 — 이 막의 단계는 이게 참이 되기 전엔 하나도 안 뜬다 */
  open: (s: GameState) => boolean;
  /** 막을 끝내면 열리는 작은 보상 상자 (단계마다 주지 않는다 — 막마다 한 번) */
  reward: GoalReward[];
}

function seatCount(s: GameState): number {
  return Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat').length;
}
function soldAny(s: GameState): boolean {
  return Object.values(s.menuSold).some((n) => n > 0);
}
/** 자리가 얼마나 차 있나 (0~1) — 4막은 「땅이 좁다」가 몸으로 느껴질 때 연다 */
function seatUse(s: GameState): number {
  const seats = seatCount(s);
  if (seats <= 0) return 0;
  return Math.min(1, s.guests.filter((g) => g.seatId).length / seats);
}

export const TUTORIAL_ACTS: TutorialActDef[] = [
  { id: 1, name: '카페를 연다', lead: '창고는 손봐 뒀다. 시작하라.', when: '새 게임 바로', open: () => true, reward: [money(300_000), { type: 'tickets', n: 1 }] },
  { id: 2, name: '자리와 명당', lead: '자리마다 값이 다르다.', when: `좌석 ${ACT2_SEATS}개와 첫 결제`, open: (s) => seatCount(s) >= ACT2_SEATS && soldAny(s), reward: [money(300_000)] },
  { id: 3, name: '한 단계 올린다', lead: '늘리기보다 올리는 게 싸다.', when: `자금 ₩80만·좌석 ${ACT3_SEATS}개`, open: (s) => s.money >= ACT3_MONEY && seatCount(s) >= ACT3_SEATS, reward: [money(300_000), { type: 'tickets', n: 1 }] },
  { id: 4, name: '넓히고 다시 놓는다', lead: '땅이 좁아졌구나.', when: '자금 ₩300만 또는 자리가 꽉 참', open: (s) => s.money >= ACT4_MONEY || seatUse(s) >= ACT4_SEAT_USE, reward: [money(500_000)] },
  { id: 5, name: '우리 카페의 색', lead: '이제 색을 골라야 한다.', when: `등급 ${ACT5_GRADE} 또는 ${ACT5_YEAR}년차`, open: (s) => (s.grade ?? 1) >= ACT5_GRADE || s.clock.year >= ACT5_YEAR, reward: [{ type: 'title', id: 'halmang_pupil', name: '할망의 제자' }, money(500_000), { type: 'tickets', n: 3 }] },
];
const ACT = new Map(TUTORIAL_ACTS.map((a) => [a.id, a]));
export function tutorialActDef(id: number): TutorialActDef {
  const a = ACT.get(id);
  if (!a) throw new Error(`unknown tutorial act: ${id}`);
  return a;
}

// ---------- 단계 판정 도우미 ----------

/** 명당(완공·짓는 중) 반경 안에 좌석이 있나 — 「명당 옆 자리가 좋아진다」를 손으로 확인하는 단계 */
function seatBesideCorner(s: GameState): boolean {
  const seats = Object.values(s.objects).filter((o) => objectDef(o.type).kind === 'seat');
  if (seats.length === 0) return false;
  for (const p of cornerProgressIncludingWork(s)) {
    if (!p.done || !p.anchor) continue;
    if (seats.some((o) => distToCell(p.anchor!, o.x, o.y) <= p.def.radius)) return true;
  }
  return false;
}
/** 좌석 하나 곁(반경 2)에 시설·장식이 둘 이상 — 「가까이 놓으면 좋아진다」(거리 보너스) */
export const TUTORIAL_COMBO_RADIUS = 2;
export const TUTORIAL_COMBO_COUNT = 2;
function comboBeside(s: GameState): boolean {
  const all = Object.values(s.objects);
  const seats = all.filter((o) => objectDef(o.type).kind === 'seat');
  const near = ['facility', 'deco', 'landmark'];
  return seats.some((seat) => all.filter((o) => o.id !== seat.id && near.includes(objectDef(o.type).kind) && distToCell(seat, o.x, o.y) <= TUTORIAL_COMBO_RADIUS).length >= TUTORIAL_COMBO_COUNT);
}
/** 버스 말고 다른 길이 하나라도 열렸나 (주차장·올레 — 공사 중도 친다) */
function routeOpened(s: GameState): boolean {
  return Object.values(s.objects).some((o) => ROUTE_FACILITY_TYPES.has(o.type));
}
/** 트랙 H 경로 시설 (주차장·올레 표식·선착장·셔틀) */
const ROUTE_FACILITY_TYPES = new Set(['parking_lot', 'parking_lot_big', 'parking_lot_bus', 'parking_lot_wide', 'olle_sign', 'pier', 'shuttle_stop']);

/** 6단계 글로우: 명당 반경 안 빈 칸 (명당 곁에 자리를 두면 요금·인기가 오른다) */
function cornerSeatCells(s: GameState): Pt[] {
  for (const p of cornerProgressIncludingWork(s)) {
    if (!p.done || !p.anchor) continue;
    const a = p.anchor;
    let best: Pt | null = null, bd = Infinity;
    for (let dy = -p.def.radius; dy <= p.def.radius; dy++) for (let dx = -p.def.radius; dx <= p.def.radius; dx++) {
      const x = a.x + dx, y = a.y + dy;
      if (!emptySoil(s, x, y) || !canPlace(s, 'table_out', x, y).ok) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy)) + (Math.abs(dx) + Math.abs(dy)) / 100;
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (best) return [best];
  }
  return [];
}
/** 8단계 글로우: 첫 좌석 곁(반경 2) 빈 칸 — 붙여 놓으면 거리 보너스가 붙는다 */
function comboCells(s: GameState): Pt[] {
  const seat = seats(s)[0] ?? Object.values(s.objects).find((o) => objectDef(o.type).kind === 'seat');
  if (!seat) return [];
  let best: Pt | null = null, bd = Infinity;
  for (let dy = -TUTORIAL_COMBO_RADIUS; dy <= TUTORIAL_COMBO_RADIUS; dy++) for (let dx = -TUTORIAL_COMBO_RADIUS; dx <= TUTORIAL_COMBO_RADIUS; dx++) {
    const x = seat.x + dx, y = seat.y + dy;
    if (!emptySoil(s, x, y)) continue;
    const d = Math.max(Math.abs(dx), Math.abs(dy)) + (Math.abs(dx) + Math.abs(dy)) / 100;
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best ? [best] : [];
}
/** 대회에 한 번이라도 접수했나 (goals.customMet과 같은 판정) */
function contestEntered(s: GameState): boolean {
  return customMet(s, 'contestEntered') || seen(s, 'enterContest');
}

export const STEPS: TutorialStepDef[] = [
  // 1막 개념 — 자리 하나, 메뉴 하나, 첫 손님
  { id: 1, act: 1, key: 'seat', done: (s) => seats(s).length >= 1, targets: ['nav:build', 'tile:seat', 'tab:rest', 'build:table_out', 'build-go'], cells: seatCells },
  { id: 2, act: 1, key: 'menu', done: (s) => s.menuSlots.includes('americano'), targets: ['nav:cafe', 'tab:menu', 'menu-put'], cells: none },
  { id: 3, act: 1, key: 'greet', done: greetedGuest, targets: ['guest-row', 'greet'], cells: guestCells },
  // 2막 배치·명당 — 자리 점수를 보고, 첫 명당을 만들고, 명당 곁에 자리를 둔다
  { id: 4, act: 2, key: 'site', done: (s) => seen(s, 'siteView'), targets: ['site-toggle'], cells: none },
  { id: 5, act: 2, key: 'corner', done: cornerMade, targets: (s) => ['nav:build', 'tile:charm', 'tab:corner', `corner-next:${TUTORIAL_CORNER_ID}`, `build:${cornerMissingType(s)}`, 'build-go'], cells: cornerCells },
  { id: 6, act: 2, key: 'cornerSeat', done: seatBesideCorner, targets: ['nav:build', 'tile:seat', 'tab:rest', 'build:table_out', 'build-go'], cells: cornerSeatCells },
  // 3막 업그레이드 — 같은 자리에서 올리고, 붙여 놓고, 추천 후보를 뽑는다
  { id: 7, act: 3, key: 'tree', done: (s) => seen(s, 'treeUpgrade'), targets: ['tree-up'], cells: none },
  { id: 8, act: 3, key: 'combo', done: comboBeside, targets: ['nav:build', 'tile:charm', 'build-go'], cells: comboCells },
  { id: 9, act: 3, key: 'hire', done: (s) => s.staff.length >= 1, targets: ['nav:people', 'tab:candidates', 'hire'], cells: none },
  // 4막 확장·재배치 — 땅을 사고, 다른 길을 열고, 옮겨 본다
  { id: 10, act: 4, key: 'parcel', done: (s) => ownedParcels(s).length >= 2, targets: ['nav:ledger', 'tab:invest', 'parcel-buy'], cells: none },
  { id: 11, act: 4, key: 'route', done: routeOpened, targets: ['nav:build', 'tile:inflow', 'build:parking_lot', 'build-go'], cells: none },
  { id: 12, act: 4, key: 'rearrange', done: (s) => seen(s, 'move'), targets: ['tool:move', 'tool:undo'], cells: none },
  // 5막 전략 — 진단을 읽고, 대회에 나가 본다
  { id: 13, act: 5, key: 'checkup', done: (s) => seen(s, 'checkup'), targets: ['nav:ledger', 'strategy-card'], cells: none },
  { id: 14, act: 5, key: 'contest', done: (s) => contestEntered(s), targets: ['nav:ledger', 'tab:contest', 'contest-enter'], cells: none },
];
export const TUTORIAL_STEPS = STEPS.length;
/** 그 막의 마지막 단계 id */
function lastStepOfAct(act: number): number {
  return Math.max(...STEPS.filter((st) => st.act === act).map((st) => st.id));
}
/** 이 단계가 속한 막 */
export function actOfStep(id: number): TutorialActDef {
  return tutorialActDef(STEPS.find((st) => st.id === id)?.act ?? 1);
}
/** 막이 열렸나 (트리거 충족). 앞 막을 다 끝냈어야 한다 — 막은 순서대로 열린다. */
export function actOpen(s: GameState, act: number): boolean {
  const def = ACT.get(act);
  return !!def && def.open(s);
}
/** 다 끝낸 막인가 */
export function actDone(s: GameState, act: number): boolean {
  return s.tutorial.step >= lastStepOfAct(act);
}
/** 지금 하고 있는 막 (끝났으면 null) */
export function currentAct(s: GameState): TutorialActDef | null {
  const st = STEPS[s.tutorial.step];
  return st ? tutorialActDef(st.act) : null;
}
/** 끝낸 막 수 (배지 「📖 막 n/5」) */
export function actsDone(s: GameState): number {
  return TUTORIAL_ACTS.filter((a) => actDone(s, a.id)).length;
}
/** 단계 사이 최소 한 게임일을 지났나 (연타 금지) */
export function stepGapPassed(s: GameState): boolean {
  const last = s.tutorial.lastDay;
  return last === undefined || dayIndex(s.clock) >= last + TUTORIAL_STEP_GAP_DAYS;
}
/** 막이 아직이라 기다리는 중인가 (창의 「다음 막은 언제」 한 줄) */
export function waitingForAct(s: GameState): TutorialActDef | null {
  const act = currentAct(s);
  return act && !actOpen(s, act.id) ? act : null;
}

export function initTutorial(skipped = false): GameState['tutorial'] {
  return { step: skipped ? TUTORIAL_STEPS : 0, skipped, seen: [] };
}
/** 완성 시작 상태(starter)·전체 건너뛰기에서 바로 여는 튜토리얼 기능. ease: 입지 보기·콤보 도감·홍보·명소 지도가 처음부터 열려 있어 비었다. */
export const STARTER_FEATURE_IDS: FeatureId[] = [];
export function tutorialFeatureIds(): FeatureId[] {
  return STARTER_FEATURE_IDS;
}
/** 모든 막 보상에 들어 있는 기능 (정합 검사용) */
export function allTutorialFeatureIds(): FeatureId[] {
  return TUTORIAL_ACTS.flatMap((a) => a.reward.filter((r): r is Extract<GoalReward, { type: 'unlockFeature' }> => r.type === 'unlockFeature').map((r) => r.id));
}
export function unlockTutorialFeatures(state: GameState): void {
  for (const id of tutorialFeatureIds()) state.features[id] = true;
}
export function tutorialDone(state: GameState): boolean {
  return state.tutorial.step >= TUTORIAL_STEPS;
}
/** 지금 하고 있는 단계 (끝났으면 null). 막이 아직 안 열렸거나 앞 단계를 끝낸 지 하루가 안 됐으면 null — 가이드는 몰아 뜨지 않는다. */
export function currentTutorialStep(state: GameState): TutorialStepDef | null {
  if (tutorialDone(state)) return null;
  const st = STEPS[state.tutorial.step];
  if (!st || !actOpen(state, st.act) || !stepGapPassed(state)) return null;
  return st;
}
/** 막·간격을 보지 않은 「다음 차례 단계」 (창 목록·건너뛰기가 쓴다) */
export function nextTutorialStep(state: GameState): TutorialStepDef | null {
  return tutorialDone(state) ? null : STEPS[state.tutorial.step] ?? null;
}
/** 단계 id가 끝났나 */
export function tutorialStepDone(state: GameState, id: number): boolean {
  return state.tutorial.step >= id;
}

/** 현재 단계의 대사를 봤고 조건이 찼으면 step++. 보상 상자는 막을 끝낼 때 한 번. 끝낸 단계 id 또는 null. */
export function checkTutorial(state: GameState): number | null {
  const step = currentTutorialStep(state);
  if (!step || !dialogueSeen(state, step.id) || !step.done(state)) return null;
  state.tutorial.step++;
  state.tutorial.lastDay = dayIndex(state.clock); // 다음 단계는 내일부터 (연타 금지)
  const act = tutorialActDef(step.act);
  if (lastStepOfAct(act.id) === step.id) applyRewards(state, act.reward, { source: 'tutorial', refId: `act${act.id}`, title: `${act.id}막 ${act.name}` });
  return step.id;
}

function applyUnlockRewards(state: GameState, act: TutorialActDef): void {
  for (const r of act.reward) {
    if (r.type === 'unlockFeature') state.features[r.id] = true;
    else if (r.type === 'unlockFacility' && !state.unlocked.objects.includes(r.id)) state.unlocked.objects.push(r.id);
  }
}

/** 현재 단계 하나만 건너뛴다 (「이미 알아요」): 그 단계의 해금 보상(기능·시설)만 조용히 적용하고 step++. 돈·응모권 등은 안 준다. 건너뛴 단계 id 또는 null. */
export function skipTutorialStep(state: GameState): number | null {
  const st = nextTutorialStep(state);
  if (!st) return null;
  state.tutorial.step++;
  if (lastStepOfAct(st.act) === st.id) applyUnlockRewards(state, tutorialActDef(st.act)); // 막 보상의 해금만 조용히
  return st.id;
}

/** 건너뛰기는 막 단위: 지금 막의 남은 단계만 넘긴다 (해금 보상만 조용히, 돈·응모권·칭호는 안 준다). 건너뛴 단계 수. */
export function skipTutorialChapter(state: GameState): number {
  const from = state.tutorial.step;
  const cur = nextTutorialStep(state);
  if (!cur) return 0;
  const last = lastStepOfAct(cur.act);
  applyUnlockRewards(state, tutorialActDef(cur.act));
  state.tutorial.step = last;
  state.tutorial.skipped = true;
  return last - from;
}

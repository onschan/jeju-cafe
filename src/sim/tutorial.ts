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
 * | 단계 | 조건 | 하이라이트(data-tut / 맵 칸) | 보상 |
 * | 1 seat    | 야외 테이블 1개 | nav:build·tab:rest·build:table_out · 입지 최고 칸 1 | ₩20만 |
 * | 2 menu    | 메뉴판에 아메리카노 | nav:cafe·tab:menu·menu-put | ₩10만 |
 * | 3 greet   | 첫 손님에게 인사(greetGuest — 트랙 G) 또는 손님 카드 열기 | 정류장(손님이 오면 그 손님 칸) | 응모권 1 |
 * | 4 hire    | 직원 1명 채용(홀 권장) | nav:people·tab:candidates·hire | ₩30만 |
 * | 5 corner  | 첫 명당 「꽃길」: 꽃밭+벤치+가로등 (트랙 C completedCorners ≥1) | nav:build·tab:corner·corner-next:꽃길·build:<빠진 조각> · 테이블 옆 길가 칸 | ₩30만 |
 * | 6 goals   | 목표 창 열어 보기(seen goalWindow) | goal-bar | — |
 * | 7 graduate| 대사 닫기 | — | 칭호 「할망의 제자」·₩50만·응모권 3 |
 */
import type { GameState, GoalReward, Pt, FeatureId, PlacedObject } from './types.ts';
import { objectDef } from '../data/index.ts';
import { isDoorReachable, busStopPos, walkableNeighborsOf } from './path.ts';
import { CORNERS, completedCorners } from './corners.ts';
import { doorFrontOf, cellAt, canPlace } from './grid.ts';
import { applyRewards } from './goals.ts';
import { parcelAt } from './parcels.ts';
import { MAIN_RECOMMEND_N } from './rooms.ts';
import { TUTORIAL_STEPS as TUTORIAL_STEP_TEXTS } from '../data/dialogue/index.ts';
import { bestMainCells, bestSeatCells } from './strategy.ts';

/** 보상 상자 제목: 단계 이름 (dialogue/tutorial.json title) */
export function tutorialStepTitle(id: number): string {
  return TUTORIAL_STEP_TEXTS.find((t) => t.id === id)?.title ?? `튜토리얼 ${id}단계`;
}

export const TUTORIAL_STEPS = 7;

export interface TutorialStepDef {
  id: number;
  key: string;
  done: (s: GameState) => boolean;
  reward: GoalReward[];
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
]);
/** UI가 tutorialNote로 남기는 키. `look:<id>`는 미니 카드 「이게 뭐예요」 힌트(정낭·정류장·마을 길·본관), goalWindow는 목표 창을 열었다(6단계). */
export type TutorialNoteKey = 'siteView' | 'guestCard' | 'storage' | 'goalWindow' | `look:${LookId}`;
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
export const CORNER_PIECE_TYPES: readonly string[] = (CORNERS.find((c) => c.id === TUTORIAL_CORNER_ID)?.pieces.map((p) => p.type) ?? ['flower_bed', 'deco_wood_bench', 'streetlight']);
/** 조각끼리 서로 반경 CORNER_RADIUS 안 (corners.json radius) */
export const CORNER_RADIUS = CORNERS.find((c) => c.id === TUTORIAL_CORNER_ID)?.radius ?? 2;
/** 첫 명당이 생겼나: 트랙 C 명당 목록에 1개 이상 */
export function cornerMade(s: GameState): boolean {
  return completedCorners(s).length >= 1;
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
/** 1단계 테이블 글로우: 입지 최고 칸 1개(strategy.bestSeatCells — 걸어 닿는 칸 중 seatScore 최고). 닿는 칸이 없으면 길 옆 빈 칸. */
function seatCells(s: GameState): Pt[] {
  const best = bestSeatCells(s, 1);
  if (best.length > 0) return best;
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

export const STEPS: TutorialStepDef[] = [
  { id: 1, key: 'seat', done: (s) => seats(s).length >= 1, reward: [money(200_000)], targets: ['nav:build', 'tile:seat', 'tab:rest', 'build:table_out', 'build-go'], cells: seatCells }, // fun: 짓기 6타일 「자리」 → 야외 테이블 카드 → 짓기
  { id: 2, key: 'menu', done: (s) => s.menuSlots.includes('americano'), reward: [money(100_000)], targets: ['nav:cafe', 'tab:menu', 'menu-put'], cells: none },
  { id: 3, key: 'greet', done: greetedGuest, reward: [{ type: 'tickets', n: 1 }], targets: ['guest-row', 'greet'], cells: guestCells },
  { id: 4, key: 'hire', done: (s) => s.staff.length >= 1, reward: [money(300_000)], targets: ['nav:people', 'tab:candidates', 'hire'], cells: none },
  { id: 5, key: 'corner', done: cornerMade, reward: [money(300_000)], targets: (s) => ['nav:build', 'tile:charm', 'tab:corner', `corner-next:${TUTORIAL_CORNER_ID}`, `build:${cornerMissingType(s)}`, 'build-go'], cells: cornerCells }, // fun: 「매력」 타일 → 명당 탭 → 꽃길 「놓기」
  { id: 6, key: 'goals', done: (s) => seen(s, 'goalWindow'), reward: [], targets: ['goal-bar'], cells: none },
  { id: 7, key: 'graduate', done: () => true, reward: [{ type: 'title', id: 'halmang_pupil', name: '할망의 제자' }, money(500_000), { type: 'tickets', n: 3 }], targets: [], cells: none },
];

export function initTutorial(skipped = false): GameState['tutorial'] {
  return { step: skipped ? TUTORIAL_STEPS : 0, skipped, seen: [] };
}
/** 완성 시작 상태(starter)·전체 건너뛰기에서 바로 여는 튜토리얼 기능. ease: 입지 보기·콤보 도감·홍보·명소 지도가 처음부터 열려 있어 비었다. */
export const STARTER_FEATURE_IDS: FeatureId[] = [];
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
/** 단계 id가 끝났나 */
export function tutorialStepDone(state: GameState, id: number): boolean {
  return state.tutorial.step >= id;
}

/** 현재 단계의 대사를 봤고 조건이 찼으면 보상(보상 상자 알림)을 주고 step++. 한 번에 한 단계. 끝낸 단계 id 또는 null. */
export function checkTutorial(state: GameState): number | null {
  const step = currentTutorialStep(state);
  if (!step || !dialogueSeen(state, step.id) || !step.done(state)) return null;
  state.tutorial.step++;
  if (step.reward.length > 0) applyRewards(state, step.reward, { source: 'tutorial', refId: String(step.id), title: tutorialStepTitle(step.id) }); // 보상 없는 단계는 빈 상자를 안 띄운다
  return step.id;
}

function applyUnlockRewards(state: GameState, st: TutorialStepDef): void {
  for (const r of st.reward) {
    if (r.type === 'unlockFeature') state.features[r.id] = true;
    else if (r.type === 'unlockFacility' && !state.unlocked.objects.includes(r.id)) state.unlocked.objects.push(r.id);
  }
}

/** 현재 단계 하나만 건너뛴다 (「이미 알아요」): 그 단계의 해금 보상(기능·시설)만 조용히 적용하고 step++. 돈·응모권 등은 안 준다. 건너뛴 단계 id 또는 null. */
export function skipTutorialStep(state: GameState): number | null {
  const st = currentTutorialStep(state);
  if (!st) return null;
  applyUnlockRewards(state, st);
  state.tutorial.step++;
  return st.id;
}

/** 남은 단계를 통째로 건너뛴다(「건너뛰기」): 남은 단계의 해금 보상(기능·시설)만 조용히 적용하고 step을 끝으로. 돈·응모권·칭호는 안 준다. 건너뛴 단계 수. */
export function skipTutorialChapter(state: GameState): number {
  const from = state.tutorial.step;
  if (from >= TUTORIAL_STEPS) return 0;
  for (const st of STEPS) if (st.id > from) applyUnlockRewards(state, st);
  state.tutorial.step = TUTORIAL_STEPS;
  state.tutorial.skipped = true;
  return TUTORIAL_STEPS - from;
}

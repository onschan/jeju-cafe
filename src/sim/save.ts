import type { GameState } from './types.ts';
import { initRoutes } from './entry.ts';
import { SAVE_VERSION, MENU_SLOT_MAX, trendFor } from './state.ts';
import { monthIndex } from './clock.ts';
import { footprintOf, fixedCellsOf } from './grid.ts';
import { objectDef } from '../data/index.ts';
import { josa } from './josa.ts';
import { initMain } from './rooms.ts';
import { initEnding } from './ending.ts'; // z-ending
import { initContest } from './contest.ts'; // 대회
import { initRivals } from './rival.ts'; // 동네 경쟁 카페
import { initBattle } from './battle.ts'; // 동네 대항전
import type { FinalScore } from './types.ts';
import { TUTORIAL_STEPS } from './tutorial.ts';
import { ROUTE_IDS } from './entry.ts';
import { OBJECTS, SPOTS, ROLES, GOALS, MENUS } from '../data/index.ts';
import { SPOT_MAX_LEVEL } from './spots.ts';
import { LOAN_DUE_MONTHS } from './economy.ts'; // stakes: 대출 상환 기한
import { fmtNum } from './format.ts';

/** trim에서 없어진 것들이 들어 있는 v20 세이브를 올린다 (환불·치환) */
export const MIGRATE_FROM = 20;
/** big·mix·all 통합에서 붙은 필드는 전부 optional이라 backfill만으로 v21 → v22 → v23 → v24가 된다 (덜어낼 것도 없다) */
export const BACKFILL_FROM = [20, 21, 22, 23];
/** 이어서 열 수 있는 가장 낮은 세이브 버전 (이보다 낮으면 백업 뒤 새 게임) */
export const OLDEST_LOADABLE = Math.min(...BACKFILL_FROM);

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const obj = JSON.parse(json) as GameState;
  if (!obj || typeof obj !== 'object') throw new Error('save: not an object');
  if (obj.version === MIGRATE_FROM) migrateTrim(obj);
  if (BACKFILL_FROM.includes(obj.version)) obj.version = SAVE_VERSION; // backfill()이 새 필드를 채운다
  if (obj.version !== SAVE_VERSION) throw new Error(`save version mismatch: ${obj.version} (expected ${SAVE_VERSION})`);
  backfill(obj);
  rebuildCellOwnership(obj);
  evictFixedCellFurniture(obj);
  return obj;
}

/** fix-indoor: 옛 저장에서 카운터·주방 고정 칸(뒷벽 줄) 위에 놓여 있던 실내 가구는 걷어내고 값을 돌려준다 (그 칸은 이제 배치 불가). */
function evictFixedCellFurniture(state: GameState): void {
  const fixed = new Set<string>();
  for (const o of Object.values(state.objects)) for (const p of fixedCellsOf(o)) fixed.add(`${p.x},${p.y}`);
  if (fixed.size === 0) return;
  for (const o of Object.values(state.objects)) {
    const def = objectDef(o.type);
    if (!def.indoor || !footprintOf(o).some((p) => fixed.has(`${p.x},${p.y}`))) continue;
    for (const p of footprintOf(o)) { const c = state.grid.cells[p.y * state.grid.w + p.x]; if (c) c.objectId = c.roomId; }
    delete state.objects[o.id];
    state.money += def.cost;
    state.notices.push(`${josa(def.name, '이/가')} 카운터 자리에 있어 치우고 값을 돌려줬어요`);
  }
}

/** v20 → v21 (trim): 없어진 시설·직종·경로·명소·목표·메뉴를 환불하거나 치환하고 알림 한 줄을 남긴다. */
function migrateTrim(state: GameState): void {
  const facility = new Set(OBJECTS.map((o) => o.id));
  const spot = new Set(SPOTS.map((d) => d.id));
  const role = new Set(ROLES.map((r) => r.id));
  const goal = new Set(GOALS.map((g) => g.id));
  const menu = new Set(MENUS.map((m) => m.id));
  let refund = 0;
  let removed = 0;
  // 시설: 정의가 없어진 것은 치우고 값을 돌려준다
  for (const o of Object.values(state.objects)) {
    if (facility.has(o.type)) continue;
    delete state.objects[o.id];
    removed++;
  }
  state.unlocked.objects = state.unlocked.objects.filter((id) => facility.has(id));
  state.unlocked.menus = state.unlocked.menus.filter((id) => menu.has(id));
  state.menuSlots = state.menuSlots.map((id) => (id && menu.has(id) ? id : null));
  // 명소: 없어진 곳의 투자금을 절반 돌려주고 Lv는 3으로 깎는다
  for (const [id, lv] of Object.entries(state.spots)) {
    if (!spot.has(id)) { refund += lv * 500_000; delete state.spots[id]; delete state.spotVisitors[id]; delete state.spotPrizes[id]; continue; }
    if (lv > SPOT_MAX_LEVEL) { refund += (lv - SPOT_MAX_LEVEL) * 1_000_000; state.spots[id] = SPOT_MAX_LEVEL; }
  }
  // 직종: 없어진 직종에 배치된 직원은 쉬는 중으로
  for (const st of state.staff) if (st.role && !role.has(st.role)) st.role = null;
  for (const k of Object.keys(state.slots)) if (!role.has(k as never)) delete (state.slots as unknown as Record<string, number>)[k];
  // 경로: 없어진 경로 상태는 지운다
  for (const k of Object.keys(state.routes)) if (!(ROUTE_IDS as string[]).includes(k)) delete (state.routes as Record<string, unknown>)[k];
  // 목표: 없어진 목표 id는 달성 기록에서 뺀다 (index는 남은 목표 수 안으로)
  state.goals.claimed = state.goals.claimed.filter((id) => goal.has(id));
  state.goals.index = Math.min(state.goals.index, GOALS.length);
  if (refund > 0) state.money += refund;
  if (removed > 0 || refund > 0) {
    state.notices.push(`정리된 콘텐츠를 환불했어요 — 시설 ${removed}개 · ₩${fmtNum(refund)}`);
  }
  state.version = SAVE_VERSION;
}

/** seatfix: PlacedObject.pending에 들어올 수 있는 종류 */
const PENDING_KINDS = ['move', 'remove', 'upgrade', 'treeUpgrade'];

/** 같은 SAVE_VERSION 안에서 뒤에 추가된 필드를 기본값으로 채운다 (버전을 올리지 않고 붙인 필드). */
function backfill(state: GameState): void {
  state.lastMonthIncome ??= state.lastMonthCard?.income ?? 0;
  state.researchAcc ??= 0;
  state.dayOrders ??= { drink: 0, dessert: 0, meal: 0, signature: 0 }; // staff2: 오늘 분류별 주문 수 (v23)
  // staff2: 담당 구역·저녁 근무도 v23에 붙은 optional 필드 — 옛 세이브엔 없고, 알 수 없는 구역 값은 「전체」로 되돌린다
  for (const st of state.staff) {
    if (st.zone !== undefined && st.zone !== 'indoor' && st.zone !== 'outdoor') delete st.zone;
    if (st.night !== undefined && typeof st.night !== 'boolean') delete st.night;
  }
  // ---- stakes: 긴장감·트레이드오프·변수 ----
  state.monthCosts.rent ??= 0;
  if (state.lastMonthCard) state.lastMonthCard.costs.rent ??= 0;
  state.trend ??= trendFor(state.seed, monthIndex(state.clock)); // stakes: 옛 세이브도 이번 달 유행을 갖는다
  state.riskDay ??= 0;
  state.riskId ??= null;
  state.pendingRisk ??= null;
  state.pendingEventChoice ??= null;
  state.lastGrade ??= null;
  state.badGradeMonths ??= 0;
  state.menuSlotMax ??= MENU_SLOT_MAX;
  state.undo ??= null;
  state.eventsFired ??= {};
  state.monthMenuSold ??= {};
  state.routes ??= initRoutes(); // 트랙 H 유입 경로 (routes 없는 옛 저장)
  state.main ??= initMain(); // y-indoor: 본관 증축·이동·분위기 (SAVE_VERSION 18)
  state.ending ??= initEnding(); // z-ending: 엔딩·빠른 모드 (v18 세이브엔 없다)
  state.carry ??= null; // z-ending: 이월 묶음
  state.codex.titles ??= []; // staff-luck: 만난 칭호 도감
  state.codex.corners ??= []; // fun-corner: 만든 명당 도감
  state.unlocked.recruits ??= []; // midgame: 목표로 여는 채용 방법
  state.staffCapBonus ??= 0;      // midgame: 목표 보상 직원 정원
  state.ticketHints ??= 0;        // midgame: 응모권 안내 횟수
  state.lastOutcome ??= null;
  state.contest ??= initContest(); // 대회 (v21 세이브엔 없다 — 등급 3이면 다음 6·12월부터 접수할 수 있다)
  state.rivals ??= initRivals(); // 동네 경쟁 카페 (옛 세이브는 다음 5일 발표부터 순위가 잡힌다)
  state.battle ??= initBattle(); // 동네 대항전 (옛 세이브는 다음 마지막 주 토요일부터 — 2년차부터 열린다)
  state.activeSkills ??= {};     // 러시 액티브 스킬 쿨다운 (옛 세이브는 아무도 안 쓴 상태)
  state.activeSkillSlots ??= 1;  // 스킬 칸 1개 (2번째는 러시 등급 누적 해금)
  state.titleChanceBonus ??= 0;  // 칭호 확률 보너스
  state.monthCosts.deal ??= 0; // 제휴 월 고정비 줄
  if (state.lastMonthCard) state.lastMonthCard.costs.deal ??= 0;
  state.monthCosts.contest ??= 0; // 대회 참가비 줄 (월말 카드 비용 합계)
  if (state.lastMonthCard) state.lastMonthCard.costs.contest ??= 0;
  if (state.loan.balance > 0) state.loan.dueMonthIndex ??= monthIndex(state.clock) + LOAN_DUE_MONTHS; // stakes: 빌린 기록만 있는 옛 세이브에 기한을 준다 (overdueCount는 넘긴 뒤에 생긴다 — 새 상태에 없는 키를 만들지 않는다)
  state.luckSeq ??= 0;
  state.monthGreatServes ??= 0;
  state.voices ??= []; // trim: 손님 목소리 피드
  state.dayLog ??= []; // 성장: 하루 기록 (옛 세이브는 오늘부터 쌓인다)
  state.dayLogMark ??= { income: state.monthIncome, regulars: state.regulars?.length ?? 0 };
  state.grade ??= 1; // fun-rank: 카페 등급 (옛 세이브는 「올레길 노점」에서 시작 — 조건이 차 있으면 다음 날 판정에서 오른다)
  for (const k of ['clearRock', 'promote', 'craft', 'siteView', 'comboCodex', 'spotMap']) delete (state.features as Record<string, boolean>)[k]; // ease: 바위 삭제·처음부터 열린 기능 — 옛 저장의 기능 키는 지운다
  delete (state.stats as unknown as Record<string, number>)['rocksCleared'];
  // ease: 옛 저장(v19)의 바위·큰 바위 칸은 흙으로, 곶자왈 덤불 오브젝트는 지운다 (지형·오브젝트 정의가 없어졌다)
  for (const c of state.grid.cells) if ((c.terrain as string) !== 'soil' && (c.terrain as string) !== 'road') c.terrain = 'soil';
  for (const o of Object.values(state.objects)) if (o.type === 'bush_wild') delete state.objects[o.id];
  // seatfix: 예약 작업(pending)은 v23에 붙은 optional 필드 — 옛 세이브엔 없고, 알 수 없는 종류는 지운다
  for (const o of Object.values(state.objects)) {
    if (!o.pending) continue;
    if (!PENDING_KINDS.includes(o.pending.kind) || (o.pending.kind === 'move' && !o.pending.to)) delete o.pending;
    else o.pending.at ??= 0;
  }
  if (state.tutorial.lastDay !== undefined && typeof state.tutorial.lastDay !== 'number') delete state.tutorial.lastDay; // 5막 재구성: 없으면 첫 단계가 바로 뜬다
  if (state.tutorial.seen === undefined) { // z-tutorial: 30단계 판정 표식이 없는 옛 9단계 저장 — 건너뛴 것은 계속 끝난 상태(30), 손으로 한 것은 10단계부터 이어 간다
    state.tutorial.seen = [];
    if (state.tutorial.skipped && state.tutorial.step < TUTORIAL_STEPS) state.tutorial.step = TUTORIAL_STEPS;
  }
}

/** objects.json의 w/h가 바뀌어도 세이브가 깨지지 않도록 cells[].objectId를 objects에서 다시 만든다. */
function rebuildCellOwnership(state: GameState): void {
  for (const c of state.grid.cells) c.objectId = null;
  for (const o of Object.values(state.objects))
    for (const p of footprintOf(o)) {
      const cell = state.grid.cells[p.y * state.grid.w + p.x];
      if (cell) cell.objectId = o.id;
    }
}

/** 저장 계층 추상화. 2차에서 Supabase 구현으로 교체 가능. */
export interface SaveStore {
  save(slot: number, state: GameState): Promise<void>;
  load(slot: number): Promise<GameState | null>;
  list(): Promise<number[]>;
}

export class MemorySaveStore implements SaveStore {
  private map = new Map<number, string>();
  async save(slot: number, state: GameState) { this.map.set(slot, serialize(state)); }
  async load(slot: number) { const j = this.map.get(slot); return j ? deserialize(j) : null; }
  async list() { return [...this.map.keys()].sort((a, b) => a - b); }
}

/** 최고 점수 기록 (z-ending): 엔딩 최종 점수 카드 + 언제·어느 카페였나 */
export interface BestRecord { score: FinalScore; cafeName: string; at: number }

export class LocalSaveStore implements SaveStore {
  constructor(private prefix = 'jeju-cafe:slot:') {}
  private key(slot: number) { return `${this.prefix}${slot}`; }
  /** 엔딩 최고 점수 슬롯 (`<prefix>best`). 저장은 총점이 더 높을 때만. */
  private bestKey() { return `${this.prefix}best`; }
  loadBest(): BestRecord | null {
    try {
      const j = localStorage.getItem(this.bestKey());
      if (!j) return null;
      const b = JSON.parse(j) as BestRecord;
      return b && typeof b === 'object' && b.score && typeof b.score.total === 'number' ? b : null;
    } catch { return null; }
  }
  /** 갱신했으면 true */
  saveBest(rec: BestRecord): boolean {
    const cur = this.loadBest();
    if (cur && cur.score.total >= rec.score.total) return false;
    try { localStorage.setItem(this.bestKey(), JSON.stringify(rec)); } catch { return false; }
    return true;
  }
  async save(slot: number, state: GameState) { localStorage.setItem(this.key(slot), serialize(state)); }
  async load(slot: number) {
    const j = localStorage.getItem(this.key(slot));
    if (!j) return null;
    try {
      return deserialize(j);
    } catch {
      // SAVE_VERSION이 올라가는 등으로 역직렬화가 실패해도 원본 세이브를 지우지 않고 백업해 둔다.
      localStorage.setItem(`${this.prefix}backup:${slot}`, j);
      return null;
    }
  }
  async list() {
    const out: number[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(this.prefix)) {
        const n = Number(k.slice(this.prefix.length));
        if (Number.isInteger(n)) out.push(n);
      }
    }
    return out.sort((a, b) => a - b);
  }
}

import type { GameState } from './types.ts';
import { initRoutes } from './entry.ts';
import { SAVE_VERSION } from './state.ts';
import { footprintOf, fixedCellsOf } from './grid.ts';
import { objectDef } from '../data/index.ts';
import { josa } from './josa.ts';
import { initMain } from './rooms.ts';
import { initEnding } from './ending.ts'; // z-ending
import { initVillage } from './village.ts'; // z-ending
import type { FinalScore } from './types.ts';
import { TUTORIAL_STEPS } from './tutorial.ts';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const obj = JSON.parse(json) as GameState;
  if (!obj || typeof obj !== 'object') throw new Error('save: not an object');
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

/** 같은 SAVE_VERSION 안에서 뒤에 추가된 필드를 기본값으로 채운다 (버전을 올리지 않고 붙인 필드). */
function backfill(state: GameState): void {
  state.lastMonthIncome ??= state.lastMonthCard?.income ?? 0;
  state.researchAcc ??= 0;
  state.undo ??= null;
  state.eventsFired ??= {};
  state.monthMenuSold ??= {};
  state.routes ??= initRoutes(); // 트랙 H 유입 경로 (routes 없는 옛 저장)
  state.main ??= initMain(); // y-indoor: 본관 증축·이동·분위기 (SAVE_VERSION 18)
  state.ending ??= initEnding(); // z-ending: 엔딩·빠른 모드·100주년 (v18 세이브엔 없다)
  state.village ??= initVillage(); // z-ending: 정착 등급·마을제
  state.carry ??= null; // z-ending: 이월 묶음
  state.codex.titles ??= []; // staff-luck: 만난 칭호 도감
  state.lastOutcome ??= null;
  state.luckSeq ??= 0;
  state.monthGreatServes ??= 0;
  state.grade ??= 1; // fun-rank: 카페 등급 (옛 세이브는 「올레길 노점」에서 시작 — 조건이 차 있으면 다음 날 판정에서 오른다)
  for (const k of ['clearRock', 'promote', 'craft', 'siteView', 'comboCodex', 'spotMap']) delete (state.features as Record<string, boolean>)[k]; // ease: 바위 삭제·처음부터 열린 기능 — 옛 저장의 기능 키는 지운다
  delete (state.stats as unknown as Record<string, number>)['rocksCleared'];
  // ease: 옛 저장(v19)의 바위·큰 바위 칸은 흙으로, 곶자왈 덤불 오브젝트는 지운다 (지형·오브젝트 정의가 없어졌다)
  for (const c of state.grid.cells) if ((c.terrain as string) !== 'soil' && (c.terrain as string) !== 'road') c.terrain = 'soil';
  for (const o of Object.values(state.objects)) if (o.type === 'bush_wild') delete state.objects[o.id];
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

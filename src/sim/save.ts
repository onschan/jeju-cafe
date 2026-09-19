import type { GameState } from './types.ts';
import { initRoutes } from './entry.ts';
import { SAVE_VERSION } from './state.ts';
import { footprint } from './grid.ts';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const obj = JSON.parse(json) as GameState;
  if (!obj || typeof obj !== 'object') throw new Error('save: not an object');
  if (obj.version !== SAVE_VERSION) throw new Error(`save version mismatch: ${obj.version} (expected ${SAVE_VERSION})`);
  backfill(obj);
  rebuildCellOwnership(obj);
  return obj;
}

/** 같은 SAVE_VERSION 안에서 뒤에 추가된 필드를 기본값으로 채운다 (버전을 올리지 않고 붙인 필드). */
function backfill(state: GameState): void {
  state.lastMonthIncome ??= state.lastMonthCard?.income ?? 0;
  state.researchAcc ??= 0;
  state.undo ??= null;
  state.eventsFired ??= {};
  state.monthMenuSold ??= {};
  state.routes ??= initRoutes(); // 트랙 H 유입 경로 (routes 없는 옛 저장)
}

/** objects.json의 w/h가 바뀌어도 세이브가 깨지지 않도록 cells[].objectId를 objects에서 다시 만든다. */
function rebuildCellOwnership(state: GameState): void {
  for (const c of state.grid.cells) c.objectId = null;
  for (const o of Object.values(state.objects))
    for (const p of footprint(o.type, o.x, o.y)) {
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

export class LocalSaveStore implements SaveStore {
  constructor(private prefix = 'jeju-cafe:slot:') {}
  private key(slot: number) { return `${this.prefix}${slot}`; }
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

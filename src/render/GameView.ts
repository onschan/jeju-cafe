import { Application, Container, Sprite, Graphics } from 'pixi.js';
import type { GameState, PlacedObject, Guest } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { TILE, terrainTexture, objectTexture, label, bubble, clearTextureCache } from './textures';
import { attachCamera } from './camera';

export interface GameViewOptions {
  onTap: (cellX: number, cellY: number) => void;
}

/** HUD 두 줄(~87px) + 할망 안내(두 줄이면 ~136px) 아래에 0행이 오도록 하는 월드 기본 오프셋 */
const WORLD_OFFSET = { x: 8, y: 140 };

/** Pixi 씬을 소유하고, render(state)로 상태를 화면에 반영한다. 상태를 바꾸지 않는다. */
export class GameView {
  app = new Application();
  world = new Container();
  private tiles = new Container();
  private objects = new Container();
  private guests = new Container();
  private overlay = new Container();
  private objNodes = new Map<string, { node: Container; type: string }>();
  private guestNodes = new Map<string, Container>();
  /** 오브젝트 id → 마지막으로 그린 배지 키. 키가 같으면 다시 그리지 않는다. */
  private badgeKeys = new Map<string, string>();
  /** 손님 id → 마지막으로 만든 말풍선 키. 키가 같으면 다시 만들지 않는다. */
  private bubbleKeys = new Map<string, string>();
  private tilesBuilt = false;
  private detachCamera: (() => void) | null = null;
  private selection = new Graphics();
  private hostWidth = 0;

  async init(parent: HTMLElement, opts: GameViewOptions) {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.world.addChild(this.tiles, this.objects, this.guests, this.overlay);
    this.overlay.addChild(this.selection);
    this.app.stage.addChild(this.world);
    this.detachCamera = attachCamera(this.app.stage, { world: this.world, canvas: this.app.canvas, onTap: opts.onTap });
    this.hostWidth = parent.clientWidth;
    this.world.position.set(WORLD_OFFSET.x, WORLD_OFFSET.y);
  }

  destroy() {
    this.detachCamera?.();
    this.detachCamera = null;
    // init()이 끝나기 전에 언마운트되면 renderer가 없어 destroy가 던진다
    const renderer = this.app.renderer;
    if (!renderer) return;
    this.app.destroy(true, { children: true });
    clearTextureCache(renderer);
  }

  /** 저장 불러오기·새 게임처럼 상태가 통째로 바뀔 때 노드 캐시를 비운다. */
  reset() {
    for (const { node } of this.objNodes.values()) node.destroy({ children: true });
    for (const node of this.guestNodes.values()) node.destroy({ children: true });
    this.objNodes.clear();
    this.guestNodes.clear();
    this.badgeKeys.clear();
    this.bubbleKeys.clear();
    this.tiles.removeChildren().forEach((c) => c.destroy());
    this.tilesBuilt = false;
    this.selection.clear();
  }

  setSelection(cell: { x: number; y: number } | null) {
    this.selection.clear();
    if (!cell) return;
    this.selection.rect(cell.x * TILE, cell.y * TILE, TILE, TILE).stroke({ color: 0xffff00, width: 2 });
  }

  render(state: GameState) {
    if (!this.tilesBuilt) {
      this.buildTiles(state);
      this.world.scale.set(Math.min(2, Math.max(1, Math.floor(this.hostWidth / (state.grid.w * TILE)))));
    }
    this.syncObjects(state);
    this.syncGuests(state);
  }

  private buildTiles(state: GameState) {
    this.tiles.removeChildren().forEach((c) => c.destroy());
    for (let y = 0; y < state.grid.h; y++) {
      for (let x = 0; x < state.grid.w; x++) {
        const cell = state.grid.cells[y * state.grid.w + x]!;
        const sp = new Sprite(terrainTexture(this.app.renderer, cell.terrain));
        sp.position.set(x * TILE, y * TILE);
        this.tiles.addChild(sp);
      }
    }
    this.tilesBuilt = true;
  }

  private makeObjectNode(o: PlacedObject): Container {
    const def = objectDef(o.type);
    const c = new Container();
    const sp = new Sprite(objectTexture(this.app.renderer, def.kind, def.w, def.h));
    sp.position.set(1, 1);
    const t = label(def.name);
    t.position.set(3, 2);
    const badge = new Graphics();
    badge.label = 'badge';
    c.addChild(sp, t, badge);
    c.position.set(o.x * TILE, o.y * TILE);
    return c;
  }

  private syncObjects(state: GameState) {
    for (const [id, entry] of this.objNodes) {
      const o = state.objects[id];
      // 없어졌거나, 불러오기·리셋 뒤 id가 재사용돼 타입이 달라진 노드는 버린다
      if (!o || o.type !== entry.type) {
        entry.node.destroy({ children: true });
        this.objNodes.delete(id);
        this.badgeKeys.delete(id);
      }
    }
    const blinkOn = Math.floor(performance.now() / 300) % 2 === 0;
    for (const o of Object.values(state.objects)) {
      let entry = this.objNodes.get(o.id);
      if (!entry) {
        entry = { node: this.makeObjectNode(o), type: o.type };
        this.objects.addChild(entry.node);
        this.objNodes.set(o.id, entry);
      }
      // 작물 상태 표시: 심음=초록 점, 수확 가능=노란 테두리 깜빡임. 키가 바뀔 때만 다시 그린다.
      const key = o.crop ? `${o.crop.cropId}:${o.crop.ready}:${o.crop.ready ? blinkOn : ''}` : '';
      if (this.badgeKeys.get(o.id) === key) continue;
      this.badgeKeys.set(o.id, key);
      const badge = entry.node.getChildByLabel('badge') as Graphics;
      badge.clear();
      if (o.crop) {
        if (o.crop.ready) {
          if (blinkOn) badge.rect(0, 0, TILE, TILE).stroke({ color: 0xffe066, width: 2 });
        } else {
          badge.circle(TILE - 6, TILE - 6, 3).fill(0x66ff66);
        }
      }
    }
  }

  private makeGuestNode(g: Guest): Container {
    const c = new Container();
    const body = new Graphics().roundRect(8, 4, 16, 24, 4).fill(g.type === 'local' ? 0x4a90d9 : 0xe07a5f);
    c.addChild(body);
    return c;
  }

  private syncGuests(state: GameState) {
    const alive = new Set(state.guests.map((g) => g.id));
    for (const [id, node] of this.guestNodes) {
      if (!alive.has(id)) {
        node.destroy({ children: true });
        this.guestNodes.delete(id);
        this.bubbleKeys.delete(id);
      }
    }
    for (const g of state.guests) {
      let node = this.guestNodes.get(g.id);
      if (!node) { node = this.makeGuestNode(g); this.guests.addChild(node); this.guestNodes.set(g.id, node); }
      // 같은 날 스폰된 손님이 겹쳐 걷지 않도록 id 기반 작은 오프셋
      const jitter = (parseInt(g.id.slice(1), 10) % 3) * 4 - 4;
      node.position.set(g.x * TILE + jitter, g.y * TILE - 8);
      // 말풍선은 앉아 있는 동안 기분이 바뀔 때만 다시 만든다
      const key = g.phase === 'seated' ? String(g.mood) : '';
      if (this.bubbleKeys.get(g.id) === key) continue;
      this.bubbleKeys.set(g.id, key);
      node.getChildByLabel('bubble')?.destroy({ children: true });
      if (key) {
        const b = bubble(g.mood);
        b.label = 'bubble';
        b.position.set(14, -12);
        node.addChild(b);
      }
    }
  }
}

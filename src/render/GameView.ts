import { Application, Container, Sprite, Graphics } from 'pixi.js';
import type { GameState, PlacedObject, Guest } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { TILE, terrainTexture, objectTexture, label, bubble } from './textures';
import { attachCamera } from './camera';

export interface GameViewOptions {
  onTap: (cellX: number, cellY: number) => void;
}

/** Pixi 씬을 소유하고, render(state)로 상태를 화면에 반영한다. 상태를 바꾸지 않는다. */
export class GameView {
  app = new Application();
  world = new Container();
  private tiles = new Container();
  private objects = new Container();
  private guests = new Container();
  private overlay = new Container();
  private objNodes = new Map<string, Container>();
  private guestNodes = new Map<string, Container>();
  private tilesBuilt = false;
  private detachCamera: (() => void) | null = null;
  private selection = new Graphics();

  async init(parent: HTMLElement, opts: GameViewOptions) {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    parent.appendChild(this.app.canvas);
    this.world.addChild(this.tiles, this.objects, this.guests, this.overlay);
    this.overlay.addChild(this.selection);
    this.app.stage.addChild(this.world);
    this.detachCamera = attachCamera(this.app.stage, { world: this.world, onTap: opts.onTap });
    this.world.scale.set(Math.min(2, Math.max(1, Math.floor(parent.clientWidth / (10 * TILE)))));
    this.world.position.set(8, 60);
  }

  destroy() {
    this.detachCamera?.();
    this.app.destroy(true, { children: true });
  }

  setSelection(cell: { x: number; y: number } | null) {
    this.selection.clear();
    if (!cell) return;
    this.selection.rect(cell.x * TILE, cell.y * TILE, TILE, TILE).stroke({ color: 0xffff00, width: 2 });
  }

  render(state: GameState) {
    if (!this.tilesBuilt) this.buildTiles(state);
    this.syncObjects(state);
    this.syncGuests(state);
  }

  private buildTiles(state: GameState) {
    this.tiles.removeChildren();
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
    c.addChild(sp, t);
    c.position.set(o.x * TILE, o.y * TILE);
    return c;
  }

  private syncObjects(state: GameState) {
    for (const [id, node] of this.objNodes) {
      if (!state.objects[id]) { node.destroy({ children: true }); this.objNodes.delete(id); }
    }
    for (const o of Object.values(state.objects)) {
      let node = this.objNodes.get(o.id);
      if (!node) { node = this.makeObjectNode(o); this.objects.addChild(node); this.objNodes.set(o.id, node); }
      // 작물 상태 표시: 심음=초록 점, 수확 가능=노란 테두리 깜빡임
      const badge = (node.getChildByLabel('badge') as Graphics | null) ?? (() => { const g = new Graphics(); g.label = 'badge'; node!.addChild(g); return g; })();
      badge.clear();
      if (o.crop) {
        if (o.crop.ready) {
          const on = Math.floor(performance.now() / 300) % 2 === 0;
          if (on) badge.rect(0, 0, TILE, TILE).stroke({ color: 0xffe066, width: 2 });
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
      if (!alive.has(id)) { node.destroy({ children: true }); this.guestNodes.delete(id); }
    }
    for (const g of state.guests) {
      let node = this.guestNodes.get(g.id);
      if (!node) { node = this.makeGuestNode(g); this.guests.addChild(node); this.guestNodes.set(g.id, node); }
      // 같은 날 스폰된 손님이 겹쳐 걷지 않도록 id 기반 작은 오프셋
      const jitter = (parseInt(g.id.slice(1), 10) % 3) * 4 - 4;
      node.position.set(g.x * TILE + jitter, g.y * TILE - 8);
      const old = node.getChildByLabel('bubble');
      if (old) old.destroy({ children: true });
      if (g.phase === 'seated') {
        const b = bubble(g.mood);
        b.label = 'bubble';
        b.position.set(14, -12);
        node.addChild(b);
      }
    }
  }
}

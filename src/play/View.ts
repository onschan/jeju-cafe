/**
 * 새 그림 (specs/2026-09-27-rebuild-kairo-core.md 2단계). 옛 GameView는 안 쓴다 — iso 좌표·카메라·시트·파츠 캐릭터 같은 그림 도구만 가져온다.
 * 그리는 것: 바닥·잔디·길 타일(계절), 미소유 땅 덮개, 시설, 손님, 「상성 UP」·돈 연출, 배치 고스트, 바닥 줄 미리보기, 밤.
 */
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameState, Facility, Guest, Fx, Pt } from '../game/index.ts';
import { facilityDef, isFloorDef, canPlace, canLayFloor, lineCells, seasonOf, isNight, cellAt, HOME } from '../game/index.ts';
import { loadAssets, tex, peekTex, hasAssets, spriteName } from '../render/assets';
import { attachCamera } from '../render/camera';
import { ISO_W, ISO_H, cellToScreen, cellCenter, footAnchor, depth, screenToCell } from '../render/iso';
import { makeCharacterNode, updateCharacterNode, partsOfFace, CHAR_H, type CharacterNode, type Dir } from '../render/character';
import { label, loadLabelFont } from '../render/textures';

export interface Ghost { id: string; x: number; y: number; ok: boolean; reason?: string; line?: { from: Pt; to: Pt } }
export interface ViewOptions { onTap: (x: number, y: number) => void; onDragCell?: (x: number, y: number) => void; onDragEnd?: () => void; dragCapture?: (x: number, y: number) => boolean }

const SYNERGY_STAGGER_MS = 110;
const FLOAT_MS = 900;

export class View {
  app = new Application();
  world = new Container();
  tiles = new Container();
  actors = new Container();
  overlay = new Container();
  night = new Graphics();
  private facilityNodes = new Map<string, { node: Container; type: string; key: string }>();
  private guestNodes = new Map<string, { node: CharacterNode; dir: Dir; frame: 0 | 1 | 2; walked: number }>();
  private tileKey = '';
  private ghost: Container | null = null;
  private ghostKey = '';
  private floats: { node: Container; born: number; y0: number }[] = [];
  private queued: { fx: Fx; at: number }[] = [];
  private detach: (() => void) | null = null;
  private fxSeen = 0;
  private bounds = { x: 0, y: 0, w: 0, h: 0 };

  async init(parent: HTMLElement, opts: ViewOptions): Promise<void> {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    await Promise.all([loadAssets(), loadLabelFont()]);
    parent.appendChild(this.app.canvas);
    this.actors.sortableChildren = true;
    this.overlay.sortableChildren = true;
    this.night.eventMode = 'none';
    this.world.addChild(this.tiles, this.actors, this.overlay, this.night);
    this.app.stage.addChild(this.world);
    this.detach = attachCamera(this.app.stage, {
      world: this.world, canvas: this.app.canvas, ticker: this.app.ticker,
      viewport: () => ({ width: this.app.screen.width, height: this.app.screen.height }),
      bounds: () => this.bounds,
      onTap: opts.onTap, dragCapture: opts.dragCapture, onDragCell: opts.onDragCell, onDragEnd: opts.onDragEnd,
      minScale: 0.5, maxScale: 2.5,
    });
    this.app.ticker.add(() => this.tickFx(performance.now()));
  }
  destroy(): void { this.detach?.(); this.app.destroy(true, { children: true }); }

  /** 첫 화면: 내 마당이 가운데 오도록 */
  centerOn(state: GameState): void {
    const c = cellCenter(HOME.x + 6, HOME.y + 5);
    this.world.scale.set(1.2);
    this.world.position.set(this.app.screen.width / 2 - c.sx * 1.2, this.app.screen.height / 2 - c.sy * 1.2);
    void state;
  }
  cellAtClient(cx: number, cy: number): Pt {
    const rect = this.app.canvas.getBoundingClientRect();
    const lx = (cx - rect.left - this.world.x) / this.world.scale.x, ly = (cy - rect.top - this.world.y) / this.world.scale.y;
    return screenToCell(lx, ly);
  }
  cellToClient(x: number, y: number): { left: number; top: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const c = cellCenter(x, y);
    return { left: rect.left + this.world.x + c.sx * this.world.scale.x, top: rect.top + this.world.y + c.sy * this.world.scale.y };
  }

  sync(state: GameState, ghost: Ghost | null, now: number): void {
    this.syncTiles(state);
    this.syncFacilities(state);
    this.syncGuests(state, now);
    this.syncGhost(state, ghost);
    this.takeFx(state, now);
    this.night.clear();
    if (isNight(state.clock)) {
      const k = Math.min(1, (state.clock.hour - 19 + state.clock.ms / 1500) / 3);
      this.night.rect(-4000, -4000, 8000, 8000).fill({ color: 0x0a1030, alpha: 0.35 * k });
    }
  }

  private syncTiles(state: GameState): void {
    const season = seasonOf(state.clock.month);
    const key = `${state.layoutRev}:${season}:${state.parcels.map((p) => (p.owned ? 1 : 0)).join('')}`;
    if (key === this.tileKey) return;
    this.tileKey = key;
    this.tiles.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics();
    for (let y = 0; y < state.grid.h; y++) for (let x = 0; x < state.grid.w; x++) {
      const c = cellAt(state, x, y);
      const own = state.parcels.some((p) => p.owned && x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h);
      const { sx, sy } = cellToScreen(x, y);
      const name = c.terrain === 'road' ? spriteName.isoTile('road', season) : c.floor && c.floor !== 'path' ? `iso_tile_floor_${c.floor}` : own ? spriteName.isoTile('soil', season) : 'iso_tile_locked';
      const t = hasAssets() ? peekTex(name) ?? peekTex(spriteName.isoTile('soil', season)) : null;
      if (t) { const sp = new Sprite(t); sp.anchor.set(0.5, 0); sp.position.set(sx, sy); this.tiles.addChild(sp); }
      else g.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: c.terrain === 'road' ? 0x8a8a80 : c.floor ? 0xc9a36a : own ? 0x6aa84f : 0x3f5a3a });
      if (c.floor === 'path') { const pt = hasAssets() ? peekTex(spriteName.isoObject('path')) : null; if (pt) { const sp = new Sprite(pt); sp.anchor.set(0.5, 1); const a = footAnchor(x, y, 1, 1); sp.position.set(a.sx, a.sy); this.tiles.addChild(sp); } }
    }
    this.tiles.addChild(g);
    // 필지 경계(잔디 위 얇은 선)
    const b = new Graphics();
    for (const p of state.parcels) {
      const c0 = cellToScreen(p.x, p.y), c1 = cellToScreen(p.x + p.w, p.y), c2 = cellToScreen(p.x + p.w, p.y + p.h), c3 = cellToScreen(p.x, p.y + p.h);
      b.poly([c0.sx, c0.sy, c1.sx, c1.sy, c2.sx, c2.sy, c3.sx, c3.sy]).stroke({ color: p.owned ? 0xfff2c0 : 0x000000, alpha: p.owned ? 0.5 : 0.25, width: 1 });
    }
    this.tiles.addChild(b);
    const c0 = cellToScreen(0, 0), c1 = cellToScreen(state.grid.w, 0), c2 = cellToScreen(state.grid.w, state.grid.h), c3 = cellToScreen(0, state.grid.h);
    this.bounds = { x: c3.sx - 80, y: c0.sy - 120, w: c1.sx - c3.sx + 160, h: c2.sy - c0.sy + 240 };
  }

  private syncFacilities(state: GameState): void {
    for (const [id, e] of this.facilityNodes) if (!state.facilities[id]) { e.node.destroy({ children: true }); this.facilityNodes.delete(id); }
    for (const f of Object.values(state.facilities)) {
      const d = facilityDef(f.type);
      const key = `${f.x},${f.y}:${f.level}`;
      let e = this.facilityNodes.get(f.id);
      if (e && e.key === key) continue;
      e?.node.destroy({ children: true });
      const node = new Container();
      const a = footAnchor(f.x, f.y, d.w, d.h);
      node.position.set(a.sx, a.sy);
      node.zIndex = depth(f.x, f.y, d.w, d.h);
      const t = hasAssets() ? peekTex(spriteName.isoObject(f.type)) : null;
      if (t) { const sp = new Sprite(t); sp.anchor.set(0.5, 1); node.addChild(sp); }
      else { node.addChild(new Graphics().rect(-12, -28, 24, 28).fill(d.tab === 'env' ? 0x3d8b3d : d.tab === 'seat' ? 0xb8703a : 0xd8a03a)); }
      if (f.level >= 2) { const l = label(`Lv${f.level}`, 9); l.anchor.set(0.5, 0.5); const bg = new Graphics().roundRect(-14, -7, 28, 14, 3).fill({ color: 0xb8862a, alpha: 0.9 }); const c = new Container(); c.addChild(bg, l); c.position.set(14, -(t?.height ?? 30) + 6); node.addChild(c); }
      this.actors.addChild(node);
      this.facilityNodes.set(f.id, { node, type: f.type, key });
    }
  }

  private syncGuests(state: GameState, now: number): void {
    const alive = new Set(state.guests.map((g) => g.id));
    for (const [id, e] of this.guestNodes) if (!alive.has(id)) { e.node.destroy({ children: true }); this.guestNodes.delete(id); }
    for (const g of state.guests) {
      let e = this.guestNodes.get(g.id);
      if (!e) {
        const node = makeCharacterNode(partsOfFace(g.face, g.type === 'tourist' ? ['camera'] : g.type === 'student' ? ['backpack'] : g.type === 'senior' ? ['strawhat'] : []), 'down', 1);
        this.actors.addChild(node);
        e = { node, dir: 'down', frame: 1, walked: 0 };
        this.guestNodes.set(g.id, e);
      }
      const c = cellCenter(g.x, g.y);
      const seated = g.phase === 'use';
      e.node.position.set(c.sx, c.sy + (seated ? -6 : 0));
      e.node.zIndex = depth(g.x, g.y) + (seated ? 0.4 : 0.2);
      const next = g.path[0];
      const dir: Dir = !next ? 'down' : Math.abs(next.x - g.x) > Math.abs(next.y - g.y) ? (next.x > g.x ? 'right' : 'left') : next.y < g.y ? 'up' : 'down';
      const frame = (seated || !next) ? 1 : (Math.floor(now / 125) % 3) as 0 | 1 | 2;
      if (dir !== e.dir || frame !== e.frame) { updateCharacterNode(e.node, dir, frame); e.dir = dir; e.frame = frame; }
      const moodNode = e.node.getChildByLabel('mood');
      if (g.phase === 'out' && g.mood && !moodNode) { const l = label(g.mood === 'happy' ? '♥' : g.mood === 'angry' ? '✕' : '…', 12); l.label = 'mood'; l.anchor.set(0.5, 1); l.position.set(0, -CHAR_H - 2); l.style.fill = g.mood === 'happy' ? 0xff6a8a : g.mood === 'angry' ? 0xff4040 : 0xffffff; e.node.addChild(l); }
    }
  }

  private syncGhost(state: GameState, ghost: Ghost | null): void {
    const key = ghost ? `${ghost.id}:${ghost.x},${ghost.y}:${ghost.ok}:${ghost.line ? `${ghost.line.from.x},${ghost.line.from.y}-${ghost.line.to.x},${ghost.line.to.y}` : ''}:${state.layoutRev}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost?.destroy({ children: true });
    this.ghost = null;
    if (!ghost) return;
    const d = facilityDef(ghost.id);
    const c = new Container();
    c.zIndex = 1e6;
    const g = new Graphics();
    if (isFloorDef(d)) {
      const cells = ghost.line ? lineCells(ghost.line.from, ghost.line.to) : [{ x: ghost.x, y: ghost.y }];
      for (const p of cells) {
        const ok = canLayFloor(state, d.floor!, p.x, p.y).ok;
        const { sx, sy } = cellToScreen(p.x, p.y);
        g.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: ok ? 0x4fd16a : 0xd94b4b, alpha: 0.55 });
      }
    } else {
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
        const { sx, sy } = cellToScreen(ghost.x + dx, ghost.y + dy);
        g.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: ghost.ok ? 0x4fd16a : 0xd94b4b, alpha: 0.45 });
      }
      const t = hasAssets() ? peekTex(spriteName.isoObject(ghost.id)) : null;
      if (t) { const sp = new Sprite(t); sp.anchor.set(0.5, 1); const a = footAnchor(ghost.x, ghost.y, d.w, d.h); sp.position.set(a.sx, a.sy); sp.alpha = 0.7; sp.tint = ghost.ok ? 0xffffff : 0xff9090; c.addChild(sp); }
    }
    c.addChild(g);
    this.overlay.addChild(c);
    this.ghost = c;
  }

  /** 사림이 남긴 연출을 가져간다 — 상성 UP은 순서대로 110ms씩 늦게 */
  private takeFx(state: GameState, now: number): void {
    if (state.fx.length === 0) return;
    for (const fx of state.fx) {
      if (fx.kind === 'synergy') this.queued.push({ fx, at: now + fx.order * SYNERGY_STAGGER_MS });
      else if (fx.kind === 'money') this.queued.push({ fx, at: now });
    }
    this.fxSeen += state.fx.length;
    state.fx.length = 0;
  }
  private tickFx(now: number): void {
    for (const q of this.queued.filter((q) => q.at <= now)) {
      const fx = q.fx;
      if (fx.kind === 'synergy') this.float(fx.x, fx.y, `상성 UP  ${fx.name}`, 0xff4d5e, now);
      else if (fx.kind === 'money') this.float(fx.x, fx.y, `+₩${fx.won.toLocaleString('en-US')}`, 0xffd166, now);
    }
    this.queued = this.queued.filter((q) => q.at > now);
    for (const f of this.floats) {
      const k = (now - f.born) / FLOAT_MS;
      if (k >= 1) { f.node.destroy({ children: true }); continue; }
      f.node.position.y = f.y0 - 28 * k;
      f.node.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
    this.floats = this.floats.filter((f) => !f.node.destroyed);
  }
  private float(x: number, y: number, text: string, color: number, now: number): void {
    const c = cellCenter(x, y);
    const l = label(text, 11); l.anchor.set(0.5, 1); l.style.fill = 0xffffff;
    const w = l.width + 10;
    const bg = new Graphics().roundRect(-w / 2, -16, w, 16, 4).fill({ color, alpha: 0.95 });
    const node = new Container(); node.addChild(bg, l); node.zIndex = 1e6 + 1;
    node.position.set(c.sx, c.sy - 30);
    this.overlay.addChild(node);
    this.floats.push({ node, born: now, y0: c.sy - 30 });
  }
}
/** 놓을 수 있나 (고스트 색) — 사림 규칙 그대로 */
export function ghostOf(state: GameState, id: string, x: number, y: number, line?: { from: Pt; to: Pt }): Ghost {
  const r = canPlace(state, id, x, y);
  return { id, x, y, ok: r.ok, reason: r.reason, line };
}
export type { Facility, Guest };
export { Text };

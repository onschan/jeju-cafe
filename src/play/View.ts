/**
 * 새 그림 (specs/2026-09-27-rebuild-kairo-core.md 2단계). 옛 GameView는 안 쓴다 — iso 좌표·카메라·시트·파츠 캐릭터 같은 그림 도구만 가져온다.
 * 그리는 것: 바닥·잔디·길 타일(계절), 미소유 땅 덮개, 시설, 손님, 「상성 UP」·돈 연출, 배치 고스트, 바닥 줄 미리보기, 밤.
 */
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { GameState, Facility, Guest, Fx, Pt, Staff } from '../game/index.ts';
import { facilityDef, isFloorDef, canPlace, canLayFloor, lineCells, seasonOf, isNight, cellAt, walkable, wallBetween, footprint, dirtyOf, dishesOf, staffActOf, rooms, ROOM_KO, HOME, ROAD_Y, BUS_STOP, rectEdges, canWall, edgeCells, type WallEdge } from '../game/index.ts';
import { loadAssets, tex, peekTex, hasAssets, spriteName } from '../render/assets';
import { attachCamera } from '../render/camera';
import { ISO_W, ISO_H, cellToScreen, cellCenter, footAnchor, depth, screenToCell } from '../render/iso';
import { makeCharacterNode, updateCharacterNode, partsOfFace, CHAR_H, type CharacterNode, type Dir } from '../render/character';
import { label, loadLabelFont } from '../render/textures';
import { Background } from '../render/Background';
import { makeSpeechBubble } from '../render/bubble';
import { busPose } from '../render/scenery';
import { parcelFill, parcelProps } from './parcelScenery';
const DIRS4: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
import { guestAccs } from './guestLook';
import { staffLine, guestLine, LINE_MS } from './lines';

export interface Ghost { id: string; x: number; y: number; ok: boolean; reason?: string; line?: { from: Pt; to: Pt }; edges?: WallEdge[] }
export interface ViewOptions { onTap: (x: number, y: number, fx?: number, fy?: number) => void; onDragCell?: (x: number, y: number, fx?: number, fy?: number) => void; onDragEnd?: () => void; dragCapture?: (x: number, y: number, fx?: number, fy?: number) => boolean; onLongPress?: (x: number, y: number) => boolean; onBusStop?: () => void }

const SYNERGY_STAGGER_MS = 110;
const FLOAT_MS = 900;

/** 벽 종류 id → 그림 이름 조각 (iso_obj_w_<kind>_<ne|nw>) */
export const WALL_SPRITE: Record<string, string> = { railing: 'fence', door_wood: 'door', wall_wood: 'wood', wall_plaster: 'plaster', wall_window: 'window', wall: 'stone', wall_brick: 'brick', wall_glass: 'glass' };
/** 밤에 빛을 내는 시설과 빛 반경(px) */
const LIGHT_RADIUS: Record<string, number> = { garden_lamp: 56, streetlight: 84 };
/** 직원이 하는 일 → 머리 위 아이콘 */
const ACT_ICON: Record<string, string> = { make: 'icon_coffee', serve: 'icon_meal', clean: 'icon_harvest', promo: 'icon_promo', burn: 'icon_fire' };

export class View {
  app = new Application();
  world = new Container();
  tiles = new Container();
  actors = new Container();
  overlay = new Container();
  night = new Graphics();
  glow = new Graphics(); // 밤 등불 빛 (night 위에 더하기 블렌드)
  bg = new Background(); // 맵 밖 제주 풍경 (하늘·바다·마을·감귤밭·렌터카)
  private bus: Sprite | null = null;
  private facilityNodes = new Map<string, { node: Container; type: string; key: string }>();
  private guestNodes = new Map<string, { node: CharacterNode; dir: Dir; frame: 0 | 1 | 2; walked: number; bubble: string }>();
  /** 직원: 마당 바닥 위를 서성인다 (그림 전용 — 사림에는 위치가 없다) */
  private staffNodes = new Map<string, { node: CharacterNode; x: number; y: number; tx: number; ty: number; idleUntil: number; dir: Dir; shownDir: Dir; frame: 0 | 1 | 2; act: string; actAt?: number; actKey?: string }>();
  private floorCells: Pt[] = []; private floorRev = -1;
  private firstSync = true;
  private sparkles: { sp: Sprite; born: number }[] = [];
  private wallNodes: Sprite[] = []; private wallRev = -1;
  private roomTags: Container[] = []; private roomRev = -1;
  private orderMarks = new Map<string, Container>();
  private markKind = new Map<string, string>();
  private bars = new Graphics();
  private tileKey = '';
  private ghost: Container | null = null;
  private ghostKey = '';
  private floats: { node: Container; born: number; y0: number }[] = [];
  private queued: { fx: Fx; at: number }[] = [];
  private detach: (() => void) | null = null;
  private fxSeen = 0;
  private bounds = { x: 0, y: 0, w: 0, h: 0 };
  private busGridW = 0;
  private busWasMoving = false;
  private onBusStop: (() => void) | null = null;

  async init(parent: HTMLElement, opts: ViewOptions): Promise<void> {
    await this.app.init({ resizeTo: parent, background: 0x1e1e1e, antialias: false, resolution: window.devicePixelRatio, autoDensity: true });
    await Promise.all([loadAssets(), loadLabelFont()]);
    parent.appendChild(this.app.canvas);
    this.actors.sortableChildren = true;
    this.overlay.sortableChildren = true;
    this.night.eventMode = 'none'; this.glow.eventMode = 'none'; this.glow.blendMode = 'add';
    this.bars.eventMode = 'none';
    this.world.addChild(this.bg.node, this.tiles, this.actors, this.bars, this.overlay, this.night, this.glow);
    this.app.stage.addChild(this.world);
    this.detach = attachCamera(this.app.stage, {
      world: this.world, canvas: this.app.canvas, ticker: this.app.ticker,
      viewport: () => ({ width: this.app.screen.width, height: this.app.screen.height }),
      bounds: () => this.bounds,
      onTap: opts.onTap, dragCapture: opts.dragCapture, onDragCell: opts.onDragCell, onDragEnd: opts.onDragEnd, onLongPress: opts.onLongPress,
      minScale: 0.5, maxScale: 2.5,
    });
    this.onBusStop = opts.onBusStop ?? null;
    this.app.ticker.add(() => { const now = performance.now(); this.tickFx(now); this.bg.tick(now); this.tickBus(now); this.tickSparkles(now); });
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
    this.bg.sync(state.grid.w, state.grid.h, ROAD_Y, state.clock.hour + state.clock.ms / 1500);
    this.busGridW = state.grid.w;
    this.syncTiles(state);
    this.syncFacilities(state);
    this.syncWalls(state);
    this.syncRoomTags(state);
    this.syncOrders(state, now);
    this.syncGuests(state, now);
    this.syncStaff(state, now);
    this.syncGhost(state, ghost);
    this.firstSync = false;
    this.takeFx(state, now);
    this.night.clear(); this.glow.clear();
    if (isNight(state.clock)) {
      const k = Math.min(1, (state.clock.hour - 19 + state.clock.ms / 1500) / 3);
      this.night.rect(-4000, -4000, 8000, 8000).fill({ color: 0x0a1030, alpha: 0.35 * k });
      // 등불: 정원등·가로등 둘레가 따뜻하게 밝다 (살짝 숨쉬듯)
      const pulse = 0.85 + 0.15 * Math.sin(now / 900);
      for (const f of Object.values(state.facilities)) {
        const r = LIGHT_RADIUS[f.type]; if (!r) continue;
        const c = cellCenter(f.x, f.y);
        this.glow.ellipse(c.sx, c.sy + ISO_H / 2, r, r * 0.5).fill({ color: 0xffb64a, alpha: 0.16 * k * pulse });
        this.glow.ellipse(c.sx, c.sy + ISO_H / 2, r * 0.45, r * 0.22).fill({ color: 0xffd98a, alpha: 0.18 * k * pulse });
      }
    }
  }

  private syncTiles(state: GameState): void {
    const season = seasonOf(state.clock.month);
    const key = `${state.layoutRev}:${season}:${state.parcels.map((p) => (p.owned ? 1 : 0)).join('')}:${hasAssets() ? 1 : 0}`;
    if (key === this.tileKey) return;
    this.tileKey = key;
    this.tiles.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics();
    for (let y = 0; y < state.grid.h; y++) for (let x = 0; x < state.grid.w; x++) {
      const c = cellAt(state, x, y);
      const parcel = state.parcels.find((p) => x >= p.x && y >= p.y && x < p.x + p.w && y < p.y + p.h) ?? null;
      const own = !!parcel?.owned;
      const { sx, sy } = cellToScreen(x, y);
      // 미소유 땅은 그 땅의 풍경(유채밭·감귤밭·억새·돌밭)으로 — 사면 흙이 된다
      const fill = !own && parcel ? parcelFill(parcel) : 'soil';
      const name = c.terrain === 'road' ? spriteName.isoTile('road', season) : c.floor && c.floor !== 'path' ? `iso_tile_floor_${c.floor}` : fill !== 'soil' ? `iso_tile_field_${fill}` : spriteName.isoTile('soil', season);
      const t = hasAssets() ? peekTex(name) ?? peekTex(spriteName.isoTile('soil', season)) : null;
      if (t) { const sp = new Sprite(t); sp.anchor.set(0.5, 0); sp.position.set(sx, sy); if (!own && c.terrain !== 'road') sp.tint = 0xd8d4c8; this.tiles.addChild(sp); }
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
    // 미소유 필지 소품(나무·돌담·등대…) — 깊이 순으로 타일 위에
    if (hasAssets()) for (const p of state.parcels) {
      if (p.owned) continue;
      for (const pr of parcelProps(p, (x, y) => cellAt(state, x, y).terrain === 'road')) {
        const t = peekTex(spriteName.isoObject(pr.sprite)); if (!t) continue;
        const sp = new Sprite(t); sp.anchor.set(0.5, 1); const a = footAnchor(pr.x, pr.y, 1, 1); sp.position.set(a.sx, a.sy); sp.tint = 0xe0dcd0; this.tiles.addChild(sp);
      }
    }
    // 미소유 필지 팻말: 이름 · 값 (탭하면 산다)
    for (const p of state.parcels) {
      if (p.owned) continue;
      const cc = cellCenter(p.x + Math.floor(p.w / 2), p.y + Math.floor(p.h / 2));
      const st = hasAssets() ? peekTex(spriteName.isoObject('signboard')) : null;
      if (st) { const sp = new Sprite(st); sp.anchor.set(0.5, 1); sp.position.set(cc.sx, cc.sy + ISO_H / 2); this.tiles.addChild(sp); }
      const l = label(`${p.name}  ₩${Math.round(p.price / 10_000)}만`, 11); l.anchor.set(0.5, 1);
      const w = l.width + 10;
      const bg = new Graphics().roundRect(-w / 2, -16, w, 16, 3).fill({ color: 0x3b2a1a, alpha: 0.9 });
      const node = new Container(); node.addChild(bg, l); node.position.set(cc.sx, cc.sy - 40);
      this.tiles.addChild(node);
    }
    const c0 = cellToScreen(0, 0), c1 = cellToScreen(state.grid.w, 0), c2 = cellToScreen(state.grid.w, state.grid.h), c3 = cellToScreen(0, state.grid.h);
    this.bounds = { x: c3.sx - 80, y: c0.sy - 120, w: c1.sx - c3.sx + 160, h: c2.sy - c0.sy + 240 };
  }

  private syncFacilities(state: GameState): void {
    for (const [id, e] of this.facilityNodes) if (!state.facilities[id]) { e.node.destroy({ children: true }); this.facilityNodes.delete(id); }
    for (const f of Object.values(state.facilities)) {
      const d = facilityDef(f.type);
      const sprite = f.type;
      const key = `${f.x},${f.y}:${f.level}:${sprite}:${hasAssets() ? 1 : 0}`; // 벽은 이웃에 따라 sprite가 바뀌니 그것으로 갱신된다
      let e = this.facilityNodes.get(f.id);
      if (e && e.key === key) continue;
      e?.node.destroy({ children: true });
      const node = new Container();
      const a = footAnchor(f.x, f.y, d.w, d.h);
      node.position.set(a.sx, a.sy);
      node.zIndex = depth(f.x, f.y, d.w, d.h);
      const t = hasAssets() ? peekTex(spriteName.isoObject(sprite)) : null;
      if (t) { const sp = new Sprite(t); sp.anchor.set(0.5, 1); node.addChild(sp); }
      else { node.addChild(new Graphics().rect(-12, -28, 24, 28).fill(d.tab === 'env' ? 0x3d8b3d : d.tab === 'seat' ? 0xb8703a : 0xd8a03a)); }
      if (f.level >= 2) { const l = label(`Lv${f.level}`, 9); l.anchor.set(0.5, 0.5); const bg = new Graphics().roundRect(-14, -7, 28, 14, 3).fill({ color: 0xb8862a, alpha: 0.9 }); const c = new Container(); c.addChild(bg, l); c.position.set(14, -(t?.height ?? 30) + 6); node.addChild(c); }
      this.actors.addChild(node);
      const isNew = !e;
      this.facilityNodes.set(f.id, { node, type: f.type, key });
      // 공사 반짝임: 새로 놓인 것에만 (불러올 때는 안 한다)
      if (isNew && !this.firstSync && hasAssets()) { const st = peekTex('fx_sparkle_0'); if (st) { const sp = new Sprite(st); sp.anchor.set(0.5, 1); sp.position.set(a.sx, a.sy - (t?.height ?? 24) / 2); sp.zIndex = node.zIndex + 0.5; this.actors.addChild(sp); this.sparkles.push({ sp, born: performance.now() }); } }
    }
  }

  private tickSparkles(now: number): void {
    for (const q of this.sparkles) {
      const k = (now - q.born) / 700;
      if (k >= 1) { q.sp.destroy(); continue; }
      const t = peekTex(`fx_sparkle_${Math.floor(k * 12) % 4}`); if (t) q.sp.texture = t;
      q.sp.position.y -= 0.4; q.sp.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
    this.sparkles = this.sparkles.filter((q) => !q.sp.destroyed);
  }

  /** 직원은 바닥 칸 사이를 천천히 오가며 서성인다. 목적지는 빈 바닥 칸 중 하나, 닿으면 1~3초 쉰다. */
  private syncStaff(state: GameState, now: number): void {
    if (this.floorRev !== state.layoutRev) {
      this.floorRev = state.layoutRev; this.floorCells = [];
      for (let y = 0; y < state.grid.h; y++) for (let x = 0; x < state.grid.w; x++) { const c = cellAt(state, x, y); if (c.floor && c.floor !== 'path' && !c.objectId) this.floorCells.push({ x, y }); }
    }
    const alive = new Set(state.staff.map((st) => st.id));
    for (const [id, e] of this.staffNodes) if (!alive.has(id)) { e.node.destroy({ children: true }); this.staffNodes.delete(id); }
    if (this.floorCells.length === 0) return;
    const pickCell = () => this.floorCells[Math.floor(Math.random() * this.floorCells.length)]!;
    const dt = Math.min(0.1, (now - this.staffLast) / 1000); this.staffLast = now;
    let i = -1;
    for (const st of state.staff) {
      i++;
      let e = this.staffNodes.get(st.id);
      if (!e) {
        const c = pickCell();
        const node = makeCharacterNode(partsOfFace(st.face, ['apron']), 'down', 1);
        this.actors.addChild(node);
        // 직원은 이름표를 달아 손님과 구분한다
        const tag = new Container();
        const l = label(st.name, 9); l.anchor.set(0.5, 1); l.style.fill = 0xfff8e8;
        const w = l.width + 8;
        tag.addChild(new Graphics().roundRect(-w / 2, -12, w, 12, 3).fill({ color: 0x6b4423, alpha: 0.92 }).stroke({ color: 0x3b1f0e, width: 1 }), l);
        tag.label = 'tag'; tag.position.set(0, -CHAR_H - 14);
        node.addChild(tag);
        e = { node, x: c.x, y: c.y, tx: c.x, ty: c.y, idleUntil: now + 1000, dir: 'down', shownDir: 'down', frame: 1, act: '' };
        this.staffNodes.set(st.id, e);
      }
      const cx0 = Math.round(e.x), cy0 = Math.round(e.y);
      const dx = e.tx - e.x, dy = e.ty - e.y, dist = Math.hypot(dx, dy);
      let moving = false;
      if (dist > 0.02) {
        const step = Math.min(dist, 1.6 * dt * (state.clock.speed || 0));
        // 벽·시설을 뚫지 않게: 목적지까지 한 축씩(ㄱ자) 간다
        if (Math.abs(dx) > 0.02) { e.x += Math.sign(dx) * Math.min(Math.abs(dx), step); e.dir = dx > 0 ? 'right' : 'left'; }
        else { e.y += Math.sign(dy) * Math.min(Math.abs(dy), step); e.dir = dy > 0 ? 'down' : 'up'; }
        moving = step > 0;
      } else if (now > e.idleUntil) {
        const post = this.dutyCell(state, st, i);
        // 담당 자리가 있으면 그 자리를 지킨다 — 할 일 없이 돌아다니지 않게
        if (post) { if (post.x !== cx0 || post.y !== cy0) { e.tx = post.x; e.ty = post.y; } e.idleUntil = now + 500; }
        else {
          // 담당 자리가 없을 때만, 같은 줄이나 칸에서 가까운 빈 바닥으로 (벽을 뚫고 가지 않게)
          const cx = Math.round(e.x), cy = Math.round(e.y);
          const clear = (c: Pt) => { const dx = Math.sign(c.x - cx), dy = Math.sign(c.y - cy); let p = { x: cx, y: cy }; while (p.x !== c.x || p.y !== c.y) { const n = { x: p.x + dx, y: p.y + dy }; if (!walkable(state, n.x, n.y) || wallBetween(state, p, n)) return false; p = n; } return true; };
          const cand = this.floorCells.filter((c) => (c.x === cx || c.y === cy) && Math.abs(c.x - cx) + Math.abs(c.y - cy) <= 5 && (c.x !== cx || c.y !== cy) && clear(c));
          const c = cand.length ? cand[Math.floor(Math.random() * cand.length)]! : { x: cx, y: cy };
          e.tx = c.x; e.ty = c.y; e.idleUntil = now + 1000 + Math.random() * 2500;
        }
      }
      const act = this.staffAct(state, st);
      // 일하는 모션: 제조·서빙은 위아래로 까딱, 청소는 좌우로 쓱쓱 (걷는 중엔 걷기 그대로)
      const working = !moving && (act === 'make' || act === 'clean' || act === 'serve');
      const bobY = working && act !== 'clean' ? Math.round(Math.sin(now / 130) * 2) : 0;
      const swayX = working && act === 'clean' ? Math.round(Math.sin(now / 110) * 3) : 0;
      const cc = cellCenter(e.x, e.y);
      e.node.position.set(cc.sx + swayX, cc.sy + bobY);
      e.node.zIndex = depth(e.x, e.y) + 0.25;
      if (working && act === 'clean' && hasAssets()) this.puff(cc.sx + swayX + 6, cc.sy - 2, now, 0xd8cfbb, st.id);
      const frame = moving ? (Math.floor(now / 140) % 3) as 0 | 1 | 2 : 1;
      if (frame !== e.frame || e.dir !== e.shownDir) { updateCharacterNode(e.node, e.dir, frame); e.frame = frame; e.shownDir = e.dir; }
      const tagBg = e.node.getChildByLabel('tag')?.children[0] as Graphics | undefined;
      if (tagBg) tagBg.tint = st.burn ? 0xff8a4a : 0xffffff;
      // 버닝타임: 머리 위에 불꽃 하나 (하는 일 말풍선은 그대로 둔다)
      this.badge(e.node, 'fire', 'icon_fire', !!st.burn, 0, -CHAR_H - 27 + Math.round(Math.sin(now / 150) * 2));
      // 서빙 중이면 잔을 들고 간다
      const tray = state.orders.find((o) => o.phase === 'serve');
      this.badge(e.node, 'cup', tray?.kind === 'food' ? 'icon_cake' : 'icon_coffee', act === 'serve', 11, -Math.round(CHAR_H * 0.35) + (moving ? Math.round(Math.sin(now / 140) * 1.5) : 0));
      // 일이 바뀌는 순간엔 한마디를 같이, 잠시 뒤엔 아이콘만
      if (act !== e.act) { e.actAt = now; e.act = act; }
      const said = act !== '' && now - (e.actAt ?? 0) < LINE_MS;
      const want = `${act}:${said ? 1 : 0}`;
      if (want !== e.actKey) {
        e.actKey = want;
        e.node.getChildByLabel('act')?.destroy({ children: true });
        if (act && hasAssets()) {
          const icon = peekTex(ACT_ICON[act] ?? 'icon_hand');
          const text = said ? staffLine(act, !!st.burn, `${st.id}:${Math.floor(now / 9000)}`) ?? undefined : undefined;
          if (icon || text) { const b = makeSpeechBubble({ icon, iconSize: 14, text }); b.label = 'act'; b.position.set(12, -CHAR_H - 2); e.node.addChild(b); }
        }
      }
      const ab = e.node.getChildByLabel('act');
      if (ab) ab.position.y = -CHAR_H - 2 + Math.round(Math.sin(now / 260 + i) * 1.5);
    }
  }
  private staffLast = 0;

  /** 그 직원이 지금 하는 일 (직원 창의 상태 칩과 같은 값) */
  private staffAct(state: GameState, st: Staff): string {
    const a = staffActOf(state, st);
    return a === 'idle' ? '' : a;
  }
  /** 캐릭터에 작은 표식 하나 붙였다 뗐다 (불꽃·든 잔) */
  private badge(node: Container, key: string, sprite: string, on: boolean, x: number, y: number): void {
    let sp = node.getChildByLabel(key) as Sprite | null;
    if (!on) { sp?.destroy(); return; }
    if (!sp) {
      if (!hasAssets()) return;
      const tex = peekTex(sprite); if (!tex) return;
      sp = new Sprite(tex); sp.label = key; sp.anchor.set(0.5, 1); sp.setSize(13, 13);
      node.addChild(sp);
    }
    sp.position.set(x, y);
  }

  /** 담당 자리: 접객은 자리 옆, 바는 카운터·주방 옆, 정리는 마당 아무 데나, 홍보는 올렛길 입구 */
  private dutyCell(state: GameState, st: { duty: string }, i: number): Pt | null {
    const near = (f: Facility): Pt | null => {
      const d = facilityDef(f.type);
      for (const p of footprint(f.x, f.y, d.w, d.h)) for (const v of DIRS4) {
        const q = { x: p.x + v.x, y: p.y + v.y };
        if (q.x < 0 || q.y < 0 || q.x >= state.grid.w || q.y >= state.grid.h) continue;
        const c = cellAt(state, q.x, q.y);
        if (!c.objectId && c.floor && c.floor !== 'path' && !wallBetween(state, p, q)) return q;
      }
      return null;
    };
    const all = Object.values(state.facilities);
    if (st.duty === 'service') {
      // 서빙 중인 주문이 있으면 그 손님 자리로
      const serving = state.orders.filter((o) => o.phase === 'serve');
      if (serving.length > 0) {
        const o = serving[i % serving.length]!;
        const g = state.guests.find((q) => q.id === o.guest);
        const f = g?.target ? state.facilities[g.target] : null;
        if (f) { const q = near(f); if (q) return q; }
      }
      const seats = all.filter((f) => facilityDef(f.type).tab === 'seat');
      for (let k = 0; k < seats.length; k++) { const q = near(seats[(i + k) % seats.length]!); if (q) return q; }
      return null;
    }
    if (st.duty === 'speed') {
      const bars = all.filter((f) => { const d = facilityDef(f.type); return !!d.station || d.amenity === 'counter' || d.amenity === 'kitchen' || d.tab === 'shop'; });
      for (let k = 0; k < bars.length; k++) { const q = near(bars[(i + k) % bars.length]!); if (q) return q; }
      return null;
    }
    if (st.duty === 'clean') {
      const t = (st as { workAt?: string }).workAt;
      const f = t ? state.facilities[t] : null;
      if (f) { const q = near(f); if (q) return q; }
      return null;
    }
    if (st.duty === 'charm') {
      // 올렛길 입구(길에 가장 가까운 올렛길 칸) 옆 바닥
      let best: Pt | null = null;
      for (let y = 0; y < state.grid.h; y++) for (let x = 0; x < state.grid.w; x++) if (cellAt(state, x, y).floor === 'path' && (!best || y > best.y)) best = { x, y };
      if (best) for (const v of DIRS4) { const q = { x: best.x + v.x, y: best.y + v.y }; if (q.x >= 0 && q.y >= 0 && q.x < state.grid.w && q.y < state.grid.h) { const c = cellAt(state, q.x, q.y); if (!c.objectId && c.floor && c.floor !== 'path') return q; } }
      return best;
    }
    return null; // 정리: 마당을 돌아다닌다
  }

  /** 제조 중인 제조대 위에 컵 말풍선 — 지금 무엇이 만들어지는지 보이게 */
  private syncOrders(state: GameState, now: number): void {
    const making = new Map<string, string>();
    for (const o of state.orders) if (o.phase === 'make' && o.station) making.set(o.station, o.kind);
    // 더럽거나 설거지가 쌓이면 그 위에 표시 (제조 중이 아니면)
    for (const f of Object.values(state.facilities)) {
      if (making.has(f.id)) continue;
      if (dishesOf(f) >= 3) making.set(f.id, 'dish');
      else if (dirtyOf(f) >= 2) making.set(f.id, 'dirt');
    }
    for (const [id, node] of this.orderMarks) if (!making.has(id) || this.markKind.get(id) !== making.get(id)) { node.destroy({ children: true }); this.orderMarks.delete(id); this.markKind.delete(id); }
    if (!hasAssets()) return;
    for (const [id, kind] of making) {
      const f = state.facilities[id]; if (!f) continue;
      let node = this.orderMarks.get(id);
      if (!node) {
        const icon = peekTex(kind === 'dish' ? 'icon_harvest' : kind === 'dirt' ? 'icon_warn' : kind === 'food' ? 'icon_cake' : 'icon_coffee'); if (!icon) continue;
        node = makeSpeechBubble({ icon, iconSize: 14 });
        this.actors.addChild(node); this.orderMarks.set(id, node); this.markKind.set(id, kind);
      }
      const d = facilityDef(f.type);
      const a = footAnchor(f.x, f.y, d.w, d.h);
      node.position.set(a.sx, a.sy - 26 + Math.round(Math.sin(now / 220) * 2));
      node.zIndex = depth(f.x, f.y, d.w, d.h) + 0.6;
    }
    // 제조 진행 바 + 모락모락 김
    this.bars.clear();
    for (const o of state.orders) {
      if (o.phase !== 'make' || !o.station) continue;
      const f = state.facilities[o.station]; if (!f) continue;
      const d = facilityDef(f.type);
      const a = footAnchor(f.x, f.y, d.w, d.h);
      const k = Math.max(0, Math.min(1, 1 - o.ms / Math.max(1, o.total)));
      const w = 26, x = a.sx - w / 2, y = a.sy - 42;
      this.bars.rect(x - 1, y - 1, w + 2, 6).fill({ color: 0x3b1f0e, alpha: 0.85 });
      this.bars.rect(x, y, w * k, 4).fill({ color: 0xffc34a });
      this.puff(a.sx + 6, a.sy - 30, now, 0xffffff, f.id);
    }
  }
  /** 모락모락 — 김(제조)·먼지(청소) 한 점. 내는 쪽마다 따로 쉬었다 낸다. */
  private puff(sx: number, sy: number, now: number, tint = 0xffffff, key = 'x'): void {
    if (now - (this.lastPuff.get(key) ?? -1e9) < 300 || !hasAssets()) return;
    this.lastPuff.set(key, now);
    const t = peekTex('fx_sparkle_0'); if (!t) return;
    const sp = new Sprite(t); sp.anchor.set(0.5, 1); sp.position.set(sx, sy); sp.alpha = 0.85; sp.tint = tint; sp.zIndex = 1e6;
    this.actors.addChild(sp);
    this.sparkles.push({ sp, born: now });
  }
  private lastPuff = new Map<string, number>();

  /** 방 이름표: 벽으로 둘러싼 방 가운데에 종류와 별을 작게 */
  private syncRoomTags(state: GameState): void {
    if (this.roomRev === state.layoutRev) return;
    this.roomRev = state.layoutRev;
    for (const n of this.roomTags) n.destroy({ children: true });
    this.roomTags = [];
    for (const r of rooms(state)) {
      const mx = r.cells.reduce((a, c) => a + c.x, 0) / r.cells.length;
      const my = r.cells.reduce((a, c) => a + c.y, 0) / r.cells.length;
      const cc = cellCenter(Math.round(mx), Math.round(my));
      const l = label(`${ROOM_KO[r.kind]} ${'★'.repeat(r.stars)}`, 9); l.anchor.set(0.5, 1); l.style.fill = 0xfff2c0;
      const w = l.width + 10;
      const node = new Container();
      node.addChild(new Graphics().roundRect(-w / 2, -13, w, 13, 3).fill({ color: 0x3b2a1a, alpha: 0.72 }), l);
      node.position.set(cc.sx, cc.sy - 22);
      node.zIndex = 5e5;
      this.overlay.addChild(node);
      this.roomTags.push(node);
    }
  }

  /** 변 벽: 칸의 북·서 변에 선 벽을 그린다. 방 앞쪽(안쪽이 벽 뒤에 있는) 벽은 반투명 — 카이로의 잘라 낸 앞벽처럼 안이 보이게. */
  private syncWalls(state: GameState): void {
    if (this.wallRev === state.layoutRev) return;
    this.wallRev = state.layoutRev;
    for (const n of this.wallNodes) n.destroy();
    this.wallNodes = [];
    if (!hasAssets()) return;
    for (let y = 0; y < state.grid.h; y++) for (let x = 0; x < state.grid.w; x++) {
      const c = cellAt(state, x, y);
      for (const side of ['n', 'w'] as const) {
        const kind = side === 'n' ? c.wn : c.ww; if (!kind) continue;
        const t = peekTex(`iso_obj_w_${WALL_SPRITE[kind] ?? 'wood'}_${side === 'n' ? 'ne' : 'nw'}`); if (!t) continue;
        const sp = new Sprite(t); sp.anchor.set(0.5, 1);
        const a = footAnchor(x, y, 1, 1); sp.position.set(a.sx, a.sy);
        sp.zIndex = depth(x, y) - 0.5;
        // 앞벽 판정: 벽 뒤(북/서) 칸이 바닥이고 벽 앞(이 칸)이 바닥이 아니면 방의 앞면이다
        const back = side === 'n' ? { x, y: y - 1 } : { x: x - 1, y };
        const backFloor = back.y >= 0 && back.x >= 0 && !!cellAt(state, back.x, back.y).floor;
        if (backFloor && !c.floor) sp.alpha = 0.35;
        this.actors.addChild(sp); this.wallNodes.push(sp);
      }
    }
  }

  /** 마을 버스: 서쪽 마을에서 들어와 정류장에 섰다가 동쪽으로 나간다 (링 길과 이어진다) */
  private tickBus(now: number): void {
    if (!this.busGridW || !hasAssets()) return;
    const p = busPose(now, BUS_STOP.x, this.busGridW);
    if (!this.bus) { const t = peekTex(spriteName.isoObject('bus', '0')); if (!t) return; this.bus = new Sprite(t); this.bus.anchor.set(0.5, 1); this.actors.addChild(this.bus); }
    this.bus.visible = p.visible;
    // 정류장에 막 섰다: 소리 + 문 앞 반짝임 (손님이 내리는 느낌)
    if (this.busWasMoving && !p.moving && p.visible) {
      this.onBusStop?.();
      const st = peekTex('fx_sparkle_0');
      if (st) { const a0 = footAnchor(BUS_STOP.x, ROAD_Y - 1, 1, 1); const sp = new Sprite(st); sp.anchor.set(0.5, 1); sp.position.set(a0.sx, a0.sy - 8); sp.zIndex = depth(BUS_STOP.x, ROAD_Y - 1) + 0.6; this.actors.addChild(sp); this.sparkles.push({ sp, born: now }); }
    }
    this.busWasMoving = p.moving && p.visible;
    if (!p.visible) return;
    const t = peekTex(spriteName.isoObject('bus', p.moving ? String(Math.floor(now / 160) % 2) : '0'));
    if (t) this.bus.texture = t;
    const a = footAnchor(p.x, ROAD_Y, 1, 1);
    this.bus.position.set(a.sx, a.sy + (p.moving ? Math.round(Math.sin(now / 90)) : 0));
    this.bus.zIndex = depth(p.x, ROAD_Y) + 0.3;
  }

  private syncGuests(state: GameState, now: number): void {
    const alive = new Set(state.guests.map((g) => g.id));
    for (const [id, e] of this.guestNodes) if (!alive.has(id)) { e.node.destroy({ children: true }); this.guestNodes.delete(id); }
    for (const g of state.guests) {
      let e = this.guestNodes.get(g.id);
      if (!e) {
        const node = makeCharacterNode(partsOfFace(g.face, guestAccs(g.type)), 'down', 1);
        this.actors.addChild(node);
        e = { node, dir: 'down', frame: 1, walked: 0, bubble: '' };
        this.guestNodes.set(g.id, e);
      }
      const c = cellCenter(g.x, g.y);
      const seated = g.phase === 'use';
      // 앉은 손님은 자리(시설) 위에 그린다 — 옆 칸에 서 있지 않게
      const tf = seated && g.target ? state.facilities[g.target] : null;
      // 자리 앞쪽 모서리에 앉힌다 — 가운데에 두면 테이블 위로 올라탄 것처럼 보인다
      const pos = tf ? (() => { const d = facilityDef(tf.type); const cc = cellCenter(tf.x + (d.w - 1) / 2, tf.y + (d.h - 1) / 2); return { sx: cc.sx - 10, sy: cc.sy + 8 }; })() : c;
      e.node.position.set(pos.sx, pos.sy);
      e.node.zIndex = tf ? depth(tf.x, tf.y, facilityDef(tf.type).w, facilityDef(tf.type).h) + 0.45 : depth(g.x, g.y) + 0.2;
      const next = g.path[0];
      const dir: Dir = !next ? 'down' : Math.abs(next.x - g.x) > Math.abs(next.y - g.y) ? (next.x > g.x ? 'right' : 'left') : next.y < g.y ? 'up' : 'down';
      const frame = (seated || !next) ? 1 : (Math.floor(now / 125) % 3) as 0 | 1 | 2;
      if (dir !== e.dir || frame !== e.frame) { updateCharacterNode(e.node, dir, frame); e.dir = dir; e.frame = frame; }
      // 말풍선: 앉으면 뭘 하는지(커피·가게), 나갈 때 기분. 단계가 바뀌면 갈아 끼운다.
      const want = g.phase === 'use' ? (g.served === false ? 'wait' : `use:${g.target ? facilityDef(state.facilities[g.target]?.type ?? 'table_out').tab : 'seat'}`) : g.phase === 'out' && g.mood ? `mood:${g.mood}` : '';
      if (want !== e.bubble) {
        e.node.getChildByLabel('bubble')?.destroy({ children: true });
        e.bubble = want;
        if (want && hasAssets()) {
          const icon = want === 'wait' ? peekTex('icon_clock') : want.startsWith('use:') ? peekTex(want === 'use:shop' ? 'icon_shop' : 'icon_coffee') : peekTex(spriteName.bubble(g.mood ?? 'meh'));
          const text = guestLine(want, `${g.id}:${g.type}`) ?? undefined;
          if (icon || text) {
            const b = makeSpeechBubble({ icon, iconSize: 14, text });
            b.label = 'bubble'; b.position.set(0, -CHAR_H - 2); e.node.addChild(b);
          }
        }
      }
      const bb = e.node.getChildByLabel('bubble');
      if (bb) bb.position.y = -CHAR_H - 2 + Math.round(Math.sin(now / 250 + g.x) * 1.5);
    }
  }

  private syncGhost(state: GameState, ghost: Ghost | null): void {
    const key = ghost ? `${ghost.id}:${ghost.x},${ghost.y}:${ghost.ok}:${ghost.line ? `${ghost.line.from.x},${ghost.line.from.y}-${ghost.line.to.x},${ghost.line.to.y}` : ''}:${ghost.edges ? ghost.edges.map((e) => `${e.x},${e.y}${e.side}`).join('|') : ''}:${state.layoutRev}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost?.destroy({ children: true });
    this.ghost = null;
    if (!ghost) return;
    const d = facilityDef(ghost.id);
    const c = new Container();
    c.zIndex = 1e6;
    const g = new Graphics();
    if (d.sub === 'wall') {
      // 벽 네모: 둘레 변마다 되는지 보고 벽 그림을 반투명으로, 안쪽 칸은 살짝 칠한다
      const from = ghost.line?.from ?? { x: ghost.x, y: ghost.y }, to = ghost.line?.to ?? { x: ghost.x, y: ghost.y };
      const x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x), y0 = Math.min(from.y, to.y), y1 = Math.max(from.y, to.y);
      if (!ghost.edges) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const { sx, sy } = cellToScreen(x, y); g.poly([sx, sy, sx + ISO_W / 2, sy + ISO_H / 2, sx, sy + ISO_H, sx - ISO_W / 2, sy + ISO_H / 2]).fill({ color: 0xffe08a, alpha: 0.18 }); }
      for (const e of ghost.edges ?? rectEdges(from, to)) {
        const ok = canWall(state, ghost.id, e).ok;
        const [p0, p1] = edgeCells(e);
        // 변을 선으로: 북 변은 칸 위 꼭짓점→오른쪽 꼭짓점, 서 변은 위 꼭짓점→왼쪽 꼭짓점
        const top = cellToScreen(e.x, e.y);
        const end = e.side === 'n' ? { sx: top.sx + ISO_W / 2, sy: top.sy + ISO_H / 2 } : { sx: top.sx - ISO_W / 2, sy: top.sy + ISO_H / 2 };
        g.moveTo(top.sx, top.sy).lineTo(end.sx, end.sy).stroke({ color: ok ? 0x4fd16a : 0xd94b4b, width: 3, alpha: 0.9 });
        void p0; void p1;
        const wt = ok && hasAssets() ? peekTex(`iso_obj_w_${WALL_SPRITE[ghost.id] ?? 'wood'}_${e.side === 'n' ? 'ne' : 'nw'}`) : null;
        if (wt) { const sp = new Sprite(wt); sp.anchor.set(0.5, 1); const a = footAnchor(e.x, e.y, 1, 1); sp.position.set(a.sx, a.sy); sp.alpha = 0.6; c.addChild(sp); }
      }
    } else if (isFloorDef(d)) {
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

  /** 그 칸 위에 짧은 글씨 (거절 이유 등) */
  say(x: number, y: number, text: string, color = 0xc8402e): void { this.float(x, y, text, color, performance.now()); }

  /** 사림이 남긴 연출을 가져간다 — 상성 UP은 순서대로 110ms씩 늦게 */
  private takeFx(state: GameState, now: number): void {
    if (state.fx.length === 0) return;
    for (const fx of state.fx) {
      if (fx.kind === 'synergy') this.queued.push({ fx, at: now + fx.order * SYNERGY_STAGGER_MS });
      else if (fx.kind === 'roomup') this.queued.push({ fx, at: now + fx.order * SYNERGY_STAGGER_MS });
      else if (fx.kind === 'money') this.queued.push({ fx, at: now });
    }
    this.fxSeen += state.fx.length;
    state.fx.length = 0;
  }
  private tickFx(now: number): void {
    for (const q of this.queued.filter((q) => q.at <= now)) {
      const fx = q.fx;
      if (fx.kind === 'synergy') this.float(fx.x, fx.y, `상성 UP  ${fx.name}`, 0xff4d5e, now);
      else if (fx.kind === 'roomup') { this.float(fx.x, fx.y, fx.text, 0xffd166, now); const c = cellCenter(fx.x, fx.y); for (let i = 0; i < 5; i++) this.puff(c.sx + (i - 2) * 9, c.sy - 6 - i * 3, now + i, 0xffe28a, `room${fx.x},${fx.y},${i}`); }
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
export function ghostOf(state: GameState, id: string, x: number, y: number, line?: { from: Pt; to: Pt }, edges?: WallEdge[]): Ghost {
  const d = facilityDef(id);
  if (d.sub === 'wall') { const from = line?.from ?? { x, y }, to = line?.to ?? { x, y }; const oks = (edges ?? rectEdges(from, to)).map((e) => canWall(state, id, e)); const ok = oks.some((r) => r.ok); return { id, x, y, ok, reason: ok ? undefined : oks[0]?.reason, line, edges }; }
  const r = canPlace(state, id, x, y);
  return { id, x, y, ok: r.ok, reason: r.reason, line };
}
export type { Facility, Guest };
export { Text };

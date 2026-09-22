import { Container, Sprite, Graphics, Texture, TilingSprite } from 'pixi.js';
import type { GameState } from '../sim/index.ts';
import { VILLAGE_ROAD_Y } from '../sim/layout.ts';
import { ENTRY_ROUTES } from '../sim/entry.ts';
import { peekTex, hasAssets, spriteName } from './assets';
import { footAnchor, cellToScreen } from './iso';
import { ringCells, ringKind, RING_DEPTH, RING_STEP, skyColor, coastRoadX, carPose, type RingKind } from './scenery';

/** 맵 밖 배경(트랙 E "처음부터 제주"): 하늘(시간대별 색) + 수평선 띠(바다 파도 2프레임·멀리 배·등대, 왼쪽엔 바다 건너 오름 곶 + 한라산)
 *  + 맵 둘레 8칸 장식 타일 링(북 바다·물가, 서 마을, 동 감귤밭 + 해안 도로, 남 오름 기슭 풀밭) + 링 밖은 사면 색 채움(바다/풀).
 *  띠·링은 필지 소유와 무관하게 항상 그린다. 타일 컨테이너 아래에 둔다.
 *  링 타일은 2×2 매크로(128×64+높이) 280장 — 배경 스프라이트 ≤400 예산 안. 바다·물가 타일은 700ms마다 프레임을 바꾼다. */

const BAND_W = 512;
const BAND_H = 96;
/** 링 위 꼭짓점(y = −RING_DEPTH 줄)보다 위에 수평선이 오도록 띠를 올린다(카메라 위 여유 180+200 안에서 보인다). */
const SEA_BAND_Y = -370;
/** 수평선(바다 띠 40번째 줄) — 링 밖 바다 채움은 여기서 시작한다 */
const HORIZON_Y = SEA_BAND_Y + 40;
const OREUM_BAND_Y = -394;
/** 바다 색(띠·링 타일의 SEA_MID와 같다) · 잔디 색(링 타일 grass MD와 같다) */
const SEA = 0x3b7fc4;
const GRASS = 0x5aa63f;
const SKY_TOP = -900;
const GROUND_PAD = 600;
const SIDE_PAD = 900;
/** 바다·물가 파도 프레임 간격 */
const WAVE_MS = 700;
/** 렌터카 2대 위상(ms)·색 */
const CARS: { phase: number; tint: number }[] = [{ phase: 0, tint: 0xffffff }, { phase: 11_000, tint: 0xf26d6d }];

export class Background {
  node = new Container();
  private sky = new Graphics();
  private bands = new Container();
  private ring = new Container();
  private cars: Sprite[] = [];
  private waves: { sp: Sprite; kind: 'sea' | 'shore' }[] = [];
  private seaBands: Sprite[] = [];
  private waveFrame = -1;
  private key = '';
  private skyHour = -1;
  private skyRect = { left: 0, right: 0 };
  private gridW = 0;
  private gridH = 0;

  constructor() {
    this.node.eventMode = 'none';
    this.ring.sortableChildren = true;
    this.node.addChild(this.sky, this.bands, this.ring);
  }

  /** 저장 불러오기·새 게임 뒤 다시 그리도록 */
  reset() {
    this.key = '';
    this.skyHour = -1;
  }

  sync(state: GameState) {
    const key = `${state.grid.w}x${state.grid.h}:${hasAssets() ? 1 : 0}`;
    if (key !== this.key) {
      this.key = key;
      this.build(state);
    }
    const hour = Math.floor((state.clock as { hour?: number }).hour ?? 12);
    if (hour !== this.skyHour) {
      this.skyHour = hour;
      this.drawSky(hour);
    }
  }

  /** 매 프레임: 파도 프레임·렌터카 위치 */
  tick(now: number) {
    const f = Math.floor(now / WAVE_MS) % 2;
    if (f !== this.waveFrame) {
      this.waveFrame = f;
      for (const w of this.waves) { const t = peekTex(`iso_ring_${w.kind}_${f}`); if (t) w.sp.texture = t; }
      for (const b of this.seaBands) { const t = peekTex(`bg_sea_${f}`); if (t) b.texture = t; }
    }
    if (this.cars.length) {
      const cx = coastRoadX(this.gridW);
      for (let i = 0; i < this.cars.length; i++) {
        const sp = this.cars[i]!;
        const p = carPose(now, CARS[i]!.phase, this.gridH);
        sp.visible = p.visible;
        if (!p.visible) continue;
        const { sx, sy } = footAnchor(cx, p.y, 1, 1);
        sp.position.set(sx, sy);
        sp.zIndex = cx + p.y + 0.5;
        sp.alpha = p.y < 1 ? Math.max(0, p.y) : 1; // 물가에서 사라진다
      }
    }
  }

  private build(state: GameState) {
    this.bands.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ring.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.waves = [];
    this.seaBands = [];
    this.cars = [];
    this.waveFrame = -1;
    const { w, h } = state.grid;
    this.gridW = w;
    this.gridH = h;
    const ringLeft = cellToScreen(-RING_DEPTH, h + RING_DEPTH);
    const ringRight = cellToScreen(w + RING_DEPTH, -RING_DEPTH);
    const left = ringLeft.sx - SIDE_PAD;
    const right = ringRight.sx + SIDE_PAD;
    this.skyRect = { left, right };
    this.drawSky(this.skyHour < 0 ? 12 : this.skyHour);

    // 링 밖 채움: 위 두 변 너머는 바다, 나머지는 풀. 링 꼭짓점(위·왼쪽·오른쪽·아래)으로 나눈다.
    const top = cellToScreen(-RING_DEPTH, -RING_DEPTH);
    const bottom = cellToScreen(w + RING_DEPTH, h + RING_DEPTH);
    // 링 밖 채움: 풀은 전체, 바다는 위 두 변 너머(수평선까지). 시트가 있으면 64×32 무늬 타일을 이어 붙이고(밋밋하지 않게), 없으면 단색.
    const groundRect = { x: left, y: top.sy, w: right - left, h: bottom.sy + GROUND_PAD - top.sy };
    const seaPoly = [left, ringLeft.sy, ringLeft.sx, ringLeft.sy, top.sx, top.sy, ringRight.sx, ringRight.sy, right, ringRight.sy, right, HORIZON_Y, left, HORIZON_Y];
    const farGrass = peekTex('iso_far_grass'), farSea = peekTex('iso_far_sea');
    if (farGrass && farSea) {
      const grass = new TilingSprite({ texture: farGrass, width: groundRect.w, height: groundRect.h });
      grass.position.set(groundRect.x, groundRect.y);
      const sea = new TilingSprite({ texture: farSea, width: right - left, height: ringRight.sy - HORIZON_Y });
      sea.position.set(left, HORIZON_Y);
      const mask = new Graphics().poly(seaPoly).fill(0xffffff);
      sea.mask = mask;
      this.bands.addChild(grass, sea, mask);
    } else {
      this.bands.addChild(new Graphics().rect(groundRect.x, groundRect.y, groundRect.w, groundRect.h).fill(GRASS).poly(seaPoly).fill(SEA));
    }

    // 수평선 띠: 바다(전폭, 파도 2프레임) → 오름 곶(왼쪽 절반, 바다 건너)
    this.band('bg_sea_0', SEA_BAND_Y, left, right, true);
    this.band('bg_oreum', OREUM_BAND_Y, left, Math.min(0, right));

    // 장식 타일 링
    const roads = { villageRoadY: VILLAGE_ROAD_Y, olleY: ENTRY_ROUTES.olle.entry.y, shuttleX: -1 };
    for (const c of ringCells(w, h)) {
      const kind = ringKind(c.x, c.y, w, h, roads);
      const sp = this.ringSprite(kind);
      if (!sp) continue;
      const { sx, sy } = footAnchor(c.x, c.y, RING_STEP, RING_STEP);
      sp.anchor.set(0.5, 1);
      sp.position.set(sx, sy);
      sp.zIndex = c.x + c.y;
      this.ring.addChild(sp);
      if (kind === 'sea' || kind === 'shore') this.waves.push({ sp, kind });
    }
    // 해안 도로 렌터카 2대 (링 스프라이트와 같은 깊이 정렬)
    const carTex = peekTex(spriteName.isoObject('car_y'));
    if (carTex) {
      for (const c of CARS) {
        const sp = new Sprite(carTex);
        sp.anchor.set(0.5, 1);
        sp.tint = c.tint;
        sp.visible = false;
        this.ring.addChild(sp);
        this.cars.push(sp);
      }
    }
  }

  private drawSky(hour: number) {
    const { left, right } = this.skyRect;
    this.sky.clear();
    if (right <= left) return;
    this.sky.rect(left, SKY_TOP, right - left, -SKY_TOP + 200).fill(skyColor(hour));
  }

  /** 링 타일 스프라이트. 시트가 없으면 단색 다이아몬드(플레이스홀더). */
  private ringSprite(kind: RingKind): Sprite | null {
    const t: Texture | null = peekTex(`iso_ring_${kind}${kind === 'sea' || kind === 'shore' ? '_0' : ''}`);
    return t ? new Sprite(t) : null;
  }

  /** [x0, x1) 구간을 띠로 채운다 (512px 단위로 이어 붙임). 시트가 없으면 아무것도 안 그린다. */
  private band(name: string, y: number, x0: number, x1: number, sea = false) {
    const t: Texture | null = peekTex(name);
    if (!t) return;
    for (let x = x0; x < x1; x += BAND_W) {
      const sp = new Sprite(t);
      sp.position.set(x, y);
      this.bands.addChild(sp);
      if (sea) this.seaBands.push(sp);
    }
  }

  /** 배경 스프라이트 수(성능 확인용) */
  spriteCount(): number {
    return this.ring.children.length + this.bands.children.length;
  }
}

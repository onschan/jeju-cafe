import { Container, Sprite, Graphics, Texture, TilingSprite } from 'pixi.js';
import { peekTex, hasAssets, spriteName } from './assets';
import { footAnchor, cellToScreen } from './iso';
import { ringCells, ringKind, RING_DEPTH, RING_STEP, skyColor, coastRoadX, carPose, type RingKind } from './scenery';

/** 맵 밖 배경(옛 GameView 트랙 E, 새 코어로): 하늘(시간대별 색) + 수평선 띠(바다 파도 2프레임 · 왼쪽엔 바다 건너 오름)
 *  + 맵 둘레 8칸 장식 타일 링(북 바다·물가, 서 마을, 동 감귤밭 + 해안 도로, 남 풀밭) + 링 밖 채움(바다/풀) + 해안 도로 렌터카 2대.
 *  타일 컨테이너 아래에 둔다. 바다·물가 타일은 700ms마다 프레임을 바꾼다. */
const BAND_W = 512;
const SEA_BAND_Y = -370;
const HORIZON_Y = SEA_BAND_Y + 40;
const OREUM_BAND_Y = -394;
const SEA = 0x3b7fc4;
const GRASS = 0x5aa63f;
const SKY_TOP = -900;
const GROUND_PAD = 600;
const SIDE_PAD = 900;
const WAVE_MS = 700;
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

  sync(gridW: number, gridH: number, roadY: number, hour: number): void {
    const key = `${gridW}x${gridH}:${roadY}:${hasAssets() ? 1 : 0}`;
    if (key !== this.key) { this.key = key; this.build(gridW, gridH, roadY); }
    const h = Math.floor(hour);
    if (h !== this.skyHour) { this.skyHour = h; this.drawSky(h); }
  }

  /** 매 프레임: 파도 프레임·렌터카 위치 */
  tick(now: number): void {
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
        sp.alpha = p.y < 1 ? Math.max(0, p.y) : 1;
      }
    }
  }

  private build(w: number, h: number, roadY: number): void {
    this.bands.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ring.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.waves = []; this.seaBands = []; this.cars = []; this.waveFrame = -1;
    this.gridW = w; this.gridH = h;
    const ringLeft = cellToScreen(-RING_DEPTH, h + RING_DEPTH);
    const ringRight = cellToScreen(w + RING_DEPTH, -RING_DEPTH);
    const left = ringLeft.sx - SIDE_PAD;
    const right = ringRight.sx + SIDE_PAD;
    this.skyRect = { left, right };
    this.drawSky(this.skyHour < 0 ? 12 : this.skyHour);

    const top = cellToScreen(-RING_DEPTH, -RING_DEPTH);
    const bottom = cellToScreen(w + RING_DEPTH, h + RING_DEPTH);
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
    this.band('bg_sea_0', SEA_BAND_Y, left, right, true);
    this.band('bg_oreum', OREUM_BAND_Y, left, Math.min(0, right));

    for (const c of ringCells(w, h)) {
      const kind = ringKind(c.x, c.y, w, h, roadY);
      const sp = this.ringSprite(kind);
      if (!sp) continue;
      const { sx, sy } = footAnchor(c.x, c.y, RING_STEP, RING_STEP);
      sp.anchor.set(0.5, 1);
      sp.position.set(sx, sy);
      sp.zIndex = c.x + c.y;
      this.ring.addChild(sp);
      if (kind === 'sea' || kind === 'shore') this.waves.push({ sp, kind });
    }
    const carTex = peekTex(spriteName.isoObject('car_y'));
    if (carTex) for (const c of CARS) { const sp = new Sprite(carTex); sp.anchor.set(0.5, 1); sp.tint = c.tint; sp.visible = false; this.ring.addChild(sp); this.cars.push(sp); }
  }

  private drawSky(hour: number): void {
    const { left, right } = this.skyRect;
    this.sky.clear();
    if (right <= left) return;
    this.sky.rect(left, SKY_TOP, right - left, -SKY_TOP + 200).fill(skyColor(hour));
  }
  private ringSprite(kind: RingKind): Sprite | null {
    const t: Texture | null = peekTex(`iso_ring_${kind}${kind === 'sea' || kind === 'shore' ? '_0' : ''}`);
    return t ? new Sprite(t) : null;
  }
  private band(name: string, y: number, x0: number, x1: number, sea = false): void {
    const t: Texture | null = peekTex(name);
    if (!t) return;
    for (let x = x0; x < x1; x += BAND_W) { const sp = new Sprite(t); sp.position.set(x, y); this.bands.addChild(sp); if (sea) this.seaBands.push(sp); }
  }
}

import { Container, Sprite, Graphics, Texture } from 'pixi.js';
import type { GameState } from '../sim/index.ts';
import { peekTex, hasAssets } from './assets';
import { ISO_W, ISO_H } from './iso';

/** 맵 밖 배경: 하늘 + 지평선 띠(바다·오름·숲·마을) + 잔디 바닥. 타일 컨테이너 아래에 둔다.
 *  띠는 tools/assets/sprites_bg.py의 512×96 스프라이트를 가로로 이어 붙인다.
 *  바다는 5번(해안) 필지, 오름은 2번(오름 자락) 필지를 샀을 때만 나타난다. */

const BAND_W = 512;
const BAND_H = 96;
/** 띠의 위쪽 y(월드). 먼 것일수록 위에 놓아 앞 띠가 아래를 가린다. */
const BAND_Y = { sea: -150, oreum: -120, forest: -96, village: -84 } as const;
/** 하늘 색(맑은 날 낮). 시트의 sky LT와 같다. */
const SKY = 0x8ec1f0;
/** 잔디 바닥 색. 띠의 아랫줄(grass MD)과 같아 이음새가 안 보인다. */
const GRASS = 0x5aa63f;
const SKY_TOP = -400;
const GROUND_PAD = 320;
const SIDE_PAD = BAND_W;

export class Background {
  node = new Container();
  private key = '';

  constructor() {
    this.node.eventMode = 'none';
  }

  /** 저장 불러오기·새 게임 뒤 다시 그리도록 */
  reset() {
    this.key = '';
  }

  sync(state: GameState) {
    const owned = new Set(state.parcels.filter((p) => p.owned).map((p) => p.no));
    const key = `${state.grid.w}x${state.grid.h}:${owned.has(2) ? 1 : 0}${owned.has(5) ? 1 : 0}:${hasAssets() ? 1 : 0}`;
    if (key === this.key) return;
    this.key = key;
    this.node.removeChildren().forEach((c) => c.destroy({ children: true }));

    const { w, h } = state.grid;
    const left = -h * (ISO_W / 2) - SIDE_PAD;
    const right = w * (ISO_W / 2) + SIDE_PAD;
    const bottom = (w + h) * (ISO_H / 2) + GROUND_PAD;
    const g = new Graphics()
      .rect(left, SKY_TOP, right - left, -SKY_TOP).fill(SKY)
      .rect(left, BAND_Y.forest + BAND_H - 1, right - left, bottom - (BAND_Y.forest + BAND_H - 1)).fill(GRASS);
    this.node.addChild(g);

    if (owned.has(5)) this.band('bg_sea', BAND_Y.sea, left, right);
    if (owned.has(2)) this.band('bg_oreum', BAND_Y.oreum, left, right);
    this.band('bg_forest', BAND_Y.forest, left, right);
    // 마을은 시작 필지(왼쪽 위) 너머 왼쪽에만
    this.band('bg_village', BAND_Y.village, left, -ISO_W);
  }

  /** [x0, x1) 구간을 띠로 채운다 (512px 단위로 이어 붙임). 시트가 없으면 아무것도 안 그린다. */
  private band(name: string, y: number, x0: number, x1: number) {
    const t: Texture | null = peekTex(name);
    if (!t) return;
    for (let x = x0; x < x1; x += BAND_W) {
      const sp = new Sprite(t);
      sp.position.set(x, y);
      this.node.addChild(sp);
    }
  }
}

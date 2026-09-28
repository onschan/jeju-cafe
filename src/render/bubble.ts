import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { label } from './textures';

/** 캐릭터 머리 위 말풍선: 흰 바탕 + 갈색 테두리 + 아래 꼬리. 원점 = 꼬리 끝. 글자나 아이콘(시트 텍스처) 중 하나, 둘 다면 아이콘 왼쪽. */
export interface BubbleSpec { text?: string; icon?: Texture | null; iconSize?: number }
const BORDER = 0x6b3d1e, FILL = 0xffffff, INK = 0x3b1f0e;
const PAD_X = 4, PAD_Y = 3, TAIL_H = 5, TAIL_W = 6, RADIUS = 4, FONT_SIZE = 9;

export function makeSpeechBubble(spec: BubbleSpec): Container {
  const c = new Container();
  const parts: Container[] = [];
  let w = 0, h = 0;
  if (spec.icon) { const sp = new Sprite(spec.icon); const size = spec.iconSize ?? 16; sp.width = size; sp.height = size; parts.push(sp); w += size; h = Math.max(h, size); }
  if (spec.text) { const t = label(spec.text, FONT_SIZE); t.style.fill = INK; parts.push(t); if (spec.icon) w += 3; w += t.width; h = Math.max(h, t.height); }
  const bw = w + PAD_X * 2, bh = h + PAD_Y * 2;
  const bx = -Math.round(bw / 3), by = -bh - TAIL_H;
  const g = new Graphics();
  g.roundRect(bx, by, bw, bh, RADIUS).fill(FILL).stroke({ color: BORDER, width: 1.5 });
  g.poly([0, 0, -TAIL_W / 2 + 1, by + bh - 0.5, TAIL_W / 2 + 1, by + bh - 0.5]).fill(FILL).stroke({ color: BORDER, width: 1.5 });
  g.rect(-TAIL_W / 2 + 2, by + bh - 1.5, TAIL_W - 2, 2).fill(FILL);
  c.addChild(g);
  let x = bx + PAD_X;
  for (const p of parts) { p.position.set(x, by + PAD_Y + Math.round((h - p.height) / 2)); c.addChild(p); x += p.width + 3; }
  return c;
}

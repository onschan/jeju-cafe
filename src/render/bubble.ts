import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { label } from './textures';

/** 캐릭터 머리 위 말풍선: 흰 바탕 + 갈색 테두리 + 아래 꼬리. 원점 = 꼬리 끝(캐릭터 머리 위 한 점).
 *  글자(Galmuri 라벨)나 아이콘(시트 텍스처) 중 하나를 담는다. 둘 다 있으면 아이콘 왼쪽·글자 오른쪽. */

export interface BubbleSpec {
  text?: string;
  icon?: Texture | null;
  /** 아이콘만 있을 때 크기 (기본 16) */
  iconSize?: number;
}

const BORDER = 0x6b3d1e;
const FILL = 0xffffff;
const INK = 0x3b1f0e;
const PAD_X = 4;
const PAD_Y = 3;
const TAIL_H = 5;
const TAIL_W = 6;
const RADIUS = 4;
const FONT_SIZE = 9;
/** 한 줄에 이만큼을 넘으면 줄을 나눈다 (글자 수) */
const WRAP_CHARS = 12;

/** 긴 대사는 12자 단위로 줄을 나눈다 (공백 우선, 없으면 글자 수로) */
export function wrapBubbleText(text: string, max = WRAP_CHARS): string {
  if (text.length <= max) return text;
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (word.length > max) {
      if (line) { out.push(line); line = ''; }
      for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (next.length > max) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out.join('\n');
}

/** 주문 말풍선용 짧은 메뉴 이름: 괄호·부제를 떼고 6자까지 (아이콘 옆에 한 줄) */
export const BUBBLE_NAME_MAX = 6;
export function shortMenuName(name: string): string {
  const base = name.replace(/\s*[(（].*$/, '').replace(/\s+/g, ' ').trim();
  return base.length > BUBBLE_NAME_MAX ? `${base.slice(0, BUBBLE_NAME_MAX)}…` : base;
}

export function makeSpeechBubble(spec: BubbleSpec): Container {
  const c = new Container();
  const parts: Container[] = [];
  let w = 0, h = 0;
  if (spec.icon) {
    const sp = new Sprite(spec.icon);
    const size = spec.iconSize ?? 16;
    sp.width = size; sp.height = size;
    parts.push(sp);
    w += size; h = Math.max(h, size);
  }
  if (spec.text) {
    const t = label(wrapBubbleText(spec.text), FONT_SIZE);
    t.style.fill = INK;
    t.style.align = 'left';
    parts.push(t);
    if (spec.icon) w += 3;
    w += t.width; h = Math.max(h, t.height);
  }
  const bw = w + PAD_X * 2, bh = h + PAD_Y * 2;
  // 꼬리 끝이 (0,0), 상자는 그 위. 꼬리는 상자 왼쪽 1/3 지점에서 내려온다.
  const bx = -Math.round(bw / 3), by = -bh - TAIL_H;
  const g = new Graphics();
  g.roundRect(bx, by, bw, bh, RADIUS).fill(FILL).stroke({ color: BORDER, width: 1.5 });
  g.poly([0, 0, -TAIL_W / 2 + 1, by + bh - 0.5, TAIL_W / 2 + 1, by + bh - 0.5]).fill(FILL).stroke({ color: BORDER, width: 1.5 });
  // 꼬리와 상자가 만나는 선을 흰색으로 덮어 이어진 모양으로
  g.rect(-TAIL_W / 2 + 2, by + bh - 1.5, TAIL_W - 2, 2).fill(FILL);
  c.addChild(g);
  let x = bx + PAD_X;
  for (const p of parts) {
    p.position.set(x, by + PAD_Y + Math.round((h - p.height) / 2));
    c.addChild(p);
    x += p.width + 3;
  }
  return c;
}

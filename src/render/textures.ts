import { Container, Graphics, Text } from 'pixi.js';

let labelFont = 'monospace';
/** 픽셀 폰트가 준비되면 라벨이 그 폰트로 나온다 (index.html @font-face Galmuri11). 실패해도 폴백으로 계속. */
export async function loadLabelFont(): Promise<void> {
  try { await document.fonts.load('12px Galmuri11'); labelFont = 'Galmuri11'; } catch { /* 폴백 유지 */ }
}
/** 맵 위 짧은 글자 (상성 UP·돈·Lv) */
export function label(text: string, size = 9): Text {
  return new Text({ text, style: { fontSize: size, fill: 0xffffff, fontFamily: labelFont } });
}
export function bubble(mood: 'happy' | 'meh' | 'angry' | null): Container {
  const c = new Container();
  const g = new Graphics().roundRect(0, 0, 18, 14, 4).fill(0xffffff);
  const t = label(mood === 'happy' ? ':)' : mood === 'meh' ? ':|' : mood === 'angry' ? '>:(' : '…', 10);
  t.position.set(2, 1);
  c.addChild(g, t);
  return c;
}

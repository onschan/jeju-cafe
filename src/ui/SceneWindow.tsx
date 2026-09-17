import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Popup } from './Popup';
import { brownBtn, PALETTE } from './frame';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { HAIR_RGB, TOP_RGB, type CharacterParts, type Dir } from '../render/character';
import { sfx } from './audio';

/** 장면 창: 160×90 로비 배경(scene_lobby) 위에 파츠 캐릭터 1~3명 + 대사 한 줄.
 *  고용 성공·필지 구매·월 매출 신기록 같은 순간에 showScene()으로 띄운다. */

export const SCENE_W = 160;
export const SCENE_H = 90;
const FEET_Y = 86;

export interface SceneChar { parts: CharacterParts; dir?: Dir }
export interface SceneReq { title: string; text: string; chars: SceneChar[]; sfx?: 'fanfare' | 'unlock' | 'happy' }

/** 직원이 없을 때 서 있는 기본 인물(앞치마) */
export const DEFAULT_CHAR: SceneChar = { parts: { skin: 0, hairStyle: 1, hairColor: 1, top: 3, accs: ['apron'] } };

let current: SceneReq | null = null;
const queue: SceneReq[] = [];
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; for (const l of listeners) l(); }

/** 장면을 띄운다. 이미 떠 있으면 뒤에 줄을 선다. */
export function showScene(req: SceneReq): void {
  if (current) { queue.push(req); return; }
  current = { ...req, chars: req.chars.length ? req.chars.slice(0, 3) : [DEFAULT_CHAR] };
  if (req.sfx) sfx(req.sfx);
  emit();
}

function closeScene() {
  current = null;
  const next = queue.shift();
  if (next) showScene(next);
  else emit();
}

export function drawScene(canvas: HTMLCanvasElement, sheet: Sheet | null, chars: SceneChar[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PALETTE.paperDark;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  if (!sheet) return;
  drawFrame(ctx, sheet, 'scene_lobby', 0, 0);
  const n = chars.length;
  chars.forEach((c, i) => {
    const dir = c.dir ?? 'down';
    const x = Math.round((SCENE_W * 0.62 * (i + 1)) / (n + 1) + 8);
    const p = c.parts;
    drawFrame(ctx, sheet, `body_${p.skin}_${dir}_1`, x, FEET_Y, { anchorX: 0.5, anchorY: 1 });
    drawFrame(ctx, sheet, `top_${dir}_1`, x, FEET_Y, { anchorX: 0.5, anchorY: 1, tint: TOP_RGB[p.top] });
    drawFrame(ctx, sheet, `hair_${p.hairStyle}_${dir}`, x, FEET_Y, { anchorX: 0.5, anchorY: 1, tint: HAIR_RGB[p.hairColor] });
    for (const acc of p.accs) drawFrame(ctx, sheet, `acc_${acc}_${dir}`, x, FEET_Y, { anchorX: 0.5, anchorY: 1 });
  });
}

function SceneCanvas({ chars }: { chars: SceneChar[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    const c = ref.current;
    if (!c) return;
    drawScene(c, null, chars);
    void loadSheet().then((sheet) => { if (!disposed && ref.current) drawScene(ref.current, sheet, chars); });
    return () => { disposed = true; };
  }, [chars]);
  return <canvas ref={ref} width={SCENE_W} height={SCENE_H} data-testid="scene" style={{ display: 'block', width: '100%', aspectRatio: `${SCENE_W} / ${SCENE_H}`, imageRendering: 'pixelated', border: `2px solid ${PALETTE.wood}`, borderRadius: 4, background: PALETTE.paperDark }} />;
}

/** App에 한 번 둔다. showScene()이 요청한 장면을 그린다. */
export function SceneHost() {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => version);
  if (!current) return null;
  return (
    <Popup title={current.title} onBackdrop={closeScene}
      buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={closeScene}>확인</button>}>
      <SceneCanvas chars={current.chars} />
      <div style={{ marginTop: 8, fontWeight: 700 }}>{current.text}</div>
    </Popup>
  );
}

/** 첫 화면: 시트로 그린 데모 풍경 + 나무 간판 로고 + 메뉴(새 게임·이어하기·설정). 옛 TitleScreen을 새 코어로. */
import { useEffect, useRef, useState } from 'react';
import { loadSheet, drawFrame, type SheetFrames } from './thumbs';
import { cellToScreen, footAnchor, depth, ISO_W } from '../render/iso';
import { HAIR_RGB, TOP_RGB } from '../render/character';
import { C, panel, btn, btnGold, btnOff, small } from './theme';
import { hadSave } from './store';
import { isMuted, setMuted, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume, unlockAudio, sfx } from './audio';

const SKY = '#8ec1f0';
const GRASS = '#5aa63f';
const DEMO_W = 6, DEMO_H = 6;
const DEMO_OBJECTS = [
  { type: 'greenhouse_cafe', x: 0, y: 0, w: 3, h: 2 }, { type: 'cedar', x: 4, y: 0, w: 1, h: 1 },
  { type: 'tangerine_tree_ready', x: 5, y: 1, w: 1, h: 1 }, { type: 'camellia', x: 5, y: 3, w: 1, h: 1 },
  { type: 'stonewall', x: 5, y: 0, w: 1, h: 1 }, { type: 'table_out', x: 1, y: 3, w: 1, h: 1 },
  { type: 'table_out', x: 3, y: 3, w: 1, h: 1 }, { type: 'table_parasol', x: 2, y: 4, w: 1, h: 1 },
  { type: 'flower_bed', x: 0, y: 3, w: 1, h: 1 }, { type: 'garden_lamp', x: 4, y: 4, w: 1, h: 1 },
  { type: 'busstop', x: 0, y: 5, w: 1, h: 1 },
];
const DEMO_CHARS = [
  { x: 2, y: 3, skin: 0, hair: 2, hairColor: 1, top: 0, acc: 'camera', dir: 'down' },
  { x: 3, y: 4, skin: 1, hair: 5, hairColor: 0, top: 1, acc: 'backpack', dir: 'left' },
  { x: 1, y: 2, skin: 0, hair: 1, hairColor: 3, top: 5, acc: 'apron', dir: 'down' },
];
function drawDemo(canvas: HTMLCanvasElement, sheet: SheetFrames | null): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: cw, height: ch } = canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SKY; ctx.fillRect(0, 0, cw, ch);
  const ox = Math.round(cw / 2 + 32);
  const oy = Math.round(ch * 0.34);
  ctx.fillStyle = GRASS; ctx.fillRect(0, oy - 1, cw, ch - oy + 1);
  if (!sheet) return;
  const band = (name: string, y: number, x0: number, x1: number) => { for (let x = x0; x < x1; x += 512) drawFrame(ctx, sheet, name, x, y); };
  const bx0 = ((ox % 512) - 512) % 512;
  band('bg_sea_0', oy - 150, bx0, cw);
  band('bg_oreum', oy - 120, bx0, cw);
  band('bg_forest', oy - 96, bx0, cw);
  band('bg_village', oy - 84, ox - ISO_W - 1024, ox - ISO_W);
  for (let y = 0; y < DEMO_H; y++) for (let x = 0; x < DEMO_W; x++) {
    const { sx, sy } = cellToScreen(x, y);
    drawFrame(ctx, sheet, y === DEMO_H - 1 ? 'iso_tile_road_spring' : y >= 2 && y <= 4 && x >= 0 && x <= 4 ? 'iso_tile_floor_wood' : 'iso_tile_soil_spring', ox + sx, oy + sy, { anchorX: 0.5, anchorY: 0 });
  }
  const items: { d: number; draw: () => void }[] = [];
  for (const o of DEMO_OBJECTS) {
    const { sx, sy } = footAnchor(o.x, o.y, o.w, o.h);
    items.push({ d: depth(o.x, o.y, o.w, o.h), draw: () => drawFrame(ctx, sheet, `iso_obj_${o.type}`, ox + sx, oy + sy, { anchorX: 0.5, anchorY: 1 }) });
  }
  for (const c of DEMO_CHARS) {
    const { sx, sy } = cellToScreen(c.x + 0.5, c.y + 0.5);
    const fx = ox + sx, fy = oy + sy + 16;
    items.push({ d: c.x + c.y + 0.5, draw: () => {
      drawFrame(ctx, sheet, `body_${c.skin}_${c.dir}_1`, fx, fy, { anchorX: 0.5, anchorY: 1 });
      drawFrame(ctx, sheet, `top_${c.dir}_1`, fx, fy, { anchorX: 0.5, anchorY: 1, tint: TOP_RGB[c.top] });
      drawFrame(ctx, sheet, `hair_${c.hair}_${c.dir}`, fx, fy, { anchorX: 0.5, anchorY: 1, tint: HAIR_RGB[c.hairColor] });
      if (c.acc) drawFrame(ctx, sheet, `acc_${c.acc}_${c.dir}`, fx, fy, { anchorX: 0.5, anchorY: 1 });
    } });
  }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.draw();
}
function DemoBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let sheet: SheetFrames | null = null; let dead = false;
    const draw = () => { const c = ref.current; if (!c) return; const p = c.parentElement!; const k = p.clientWidth < 520 ? 1 : 2; c.width = Math.ceil(p.clientWidth / k); c.height = Math.ceil(p.clientHeight / k); drawDemo(c, sheet); };
    draw();
    void loadSheet().then((s) => { if (dead) return; sheet = s; draw(); });
    window.addEventListener('resize', draw);
    return () => { dead = true; window.removeEventListener('resize', draw); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }} />;
}

const WOOD = '#8b5a2b';
const logo: React.CSSProperties = {
  fontWeight: 700, fontSize: 34, lineHeight: 1.12, color: '#fff5dc', letterSpacing: 1, textAlign: 'center', whiteSpace: 'nowrap',
  textShadow: `2px 0 0 ${WOOD}, -2px 0 0 ${WOOD}, 0 2px 0 ${WOOD}, 0 -2px 0 ${WOOD}, 2px 2px 0 ${WOOD}, -2px -2px 0 ${WOOD}, 2px -2px 0 ${WOOD}, -2px 2px 0 ${WOOD}, 4px 4px 0 #3b1f0e`,
};
const sign: React.CSSProperties = {
  background: 'repeating-linear-gradient(90deg, #b07a48 0 14px, #9a6a3c 14px 28px)',
  border: `3px solid ${WOOD}`, padding: '16px 22px 12px', borderRadius: 10,
  boxShadow: `inset 0 0 0 2px ${WOOD}, inset 0 0 0 4px #c89a63, 0 6px 0 #3b1f0e`,
};
const bigBtn: React.CSSProperties = { ...btn, width: '100%', minHeight: 46, fontSize: 17 };

/** 첫 화면. onStart(fresh): 이어하기(false) · 새 게임(true) */
export function Title({ onStart, onReplayIntro, onNew }: { onStart: (fresh: boolean) => void; onReplayIntro: () => void; onNew: (name: string, preset: 'tutorial' | 'starter') => void }) {
  // 폰에서 키보드가 올라오면 보이는 높이가 줄어든다 — 그 높이에 맞춰야 단추가 안 가린다
  const [vh, setVh] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fit = () => setVh(vv.height);
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, []);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('우리 카페');
  const [settings, setSettings] = useState(false);
  const [, bump] = useState(0);
  return (
    <div onPointerDownCapture={() => unlockAudio()} style={{ position: 'absolute', inset: 0, zIndex: 50, overflow: 'hidden', background: '#15110c' }}>
      <DemoBackdrop />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,8,5,0.12) 0%, rgba(10,8,5,0.55) 65%)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: vh ?? '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 'calc(24px + env(safe-area-inset-top)) 22px calc(16px + env(safe-area-inset-bottom))', overflowY: 'auto' }}>
        <div style={{ ...sign, flex: 'none' }}>
          <div style={logo}>제주 카페<br />이야기</div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#fff5dc', marginTop: 6, textShadow: `1px 1px 0 ${WOOD}` }}>귀농 카페 경영 시뮬레이션</div>
        </div>
        <div style={{ ...panel, width: '100%', maxWidth: 300, display: 'grid', gap: 6, padding: 10, flex: 'none' }}>
          {!naming ? <>
            {hadSave && <button style={{ ...bigBtn, ...btnGold }} onClick={() => { sfx('tap'); onStart(false); }}>이어하기</button>}
            <button style={bigBtn} onClick={() => { sfx('tap'); setNaming(true); }}>새 게임</button>
            <button style={{ ...bigBtn, ...btnOff, minHeight: 38, fontSize: 15 }} onClick={() => setSettings(true)}>설정</button>
            <div style={{ ...small, textAlign: 'center' }}>바닥을 깔고, 자리를 놓고, 손님을 맞는다</div>
          </> : <>
            <div style={{ fontSize: 13 }}>카페 이름</div>
            <input autoFocus value={name} maxLength={12} onChange={(e) => setName(e.target.value)} onFocus={(e) => setTimeout(() => e.target.closest('div')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)} style={{ fontFamily: 'inherit', fontSize: 16, padding: 6, textAlign: 'center' }} />
            <div style={{ ...small, marginTop: 2 }}>어떻게 시작할까요?</div>
            <button style={{ ...bigBtn, ...btnGold }} onClick={() => onNew(name, 'tutorial')}>차근차근 (따라 하기)<div style={{ ...small, color: C.ink, fontSize: 11 }}>빈 마당에서 7단계로 배우며</div></button>
            <button style={bigBtn} onClick={() => onNew(name, 'starter')}>기본 세팅으로 바로<div style={{ ...small, color: '#fff8e8', fontSize: 11 }}>벽·자리·카운터·제조대까지 차려진 채로</div></button>
            <button style={{ ...btnOff, minHeight: 36 }} onClick={() => setNaming(false)}>뒤로</button>
          </>}
        </div>
      </div>
      {settings && <div style={{ position: 'absolute', inset: 0, background: '#0008', display: 'grid', placeItems: 'center' }} onClick={() => setSettings(false)}>
        <div style={{ ...panel, width: 280, display: 'grid', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <b>설정</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1 }}>소리</span><button style={isMuted() ? btnOff : btnGold} onClick={() => { unlockAudio(); setMuted(!isMuted()); bump((n) => n + 1); }}>{isMuted() ? '꺼짐' : '켜짐'}</button></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...small, minWidth: 48 }}>음악</span><input type="range" min={0} max={100} value={getBgmVolume()} style={{ flex: 1 }} onChange={(e) => { setBgmVolume(Number(e.target.value)); bump((n) => n + 1); }} /></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ ...small, minWidth: 48 }}>효과음</span><input type="range" min={0} max={100} value={getSfxVolume()} style={{ flex: 1 }} onChange={(e) => { setSfxVolume(Number(e.target.value)); bump((n) => n + 1); }} onPointerUp={() => sfx('coin')} /></label>
          <button style={btn} onClick={() => { setSettings(false); onReplayIntro(); }}>프롤로그 다시 보기</button>
          <button style={btnOff} onClick={() => setSettings(false)}>닫기</button>
        </div>
      </div>}
    </div>
  );
}

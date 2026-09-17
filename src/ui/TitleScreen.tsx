import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { cellToScreen, footAnchor, depth, ISO_W } from '../render/iso';
import { HAIR_RGB, TOP_RGB } from '../render/character';
import { frame, brownBtn, brownBtnOff, PALETTE, won } from './frame';
import { Popup, Confirm } from './Popup';
import { SaveSlots } from './SaveSlots';
import { newGame, hasAnySave } from './store';
import { getBest } from './best';
import { unlockAudio, bgm } from './audio';

/** README 링크. 배포 환경에 맞춰 VITE_SITE_URL로 바꿀 수 있다. */
const SITE_URL: string = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://github.com/cks3066/jeju-cafe#readme';

// ---------- 배경: 시트 프레임으로 고정 데모 배치를 그린 캔버스 ----------

const SKY = '#8ec1f0';
const GRASS = '#5aa63f';
const DEMO_W = 6;
const DEMO_H = 6;
interface DemoObj { type: string; x: number; y: number; w: number; h: number }
const DEMO_OBJECTS: DemoObj[] = [
  { type: 'warehouse', x: 0, y: 0, w: 3, h: 2 },
  { type: 'pine', x: 4, y: 0, w: 1, h: 1 },
  { type: 'tangerine_tree_ready', x: 5, y: 1, w: 1, h: 1 },
  { type: 'camellia', x: 5, y: 3, w: 1, h: 1 },
  { type: 'stonewall', x: 5, y: 0, w: 1, h: 1 },
  { type: 'table_out', x: 1, y: 3, w: 1, h: 1 },
  { type: 'table_out', x: 3, y: 3, w: 1, h: 1 },
  { type: 'table_out', x: 2, y: 4, w: 1, h: 1 },
  { type: 'flower_bed', x: 0, y: 3, w: 1, h: 1 },
  { type: 'lantern_path', x: 4, y: 4, w: 1, h: 1 },
  { type: 'gate', x: 2, y: 5, w: 1, h: 1 },
  { type: 'busstop', x: 0, y: 5, w: 1, h: 1 },
];
interface DemoChar { x: number; y: number; skin: number; hair: number; hairColor: number; top: number; acc?: string; dir: string }
const DEMO_CHARS: DemoChar[] = [
  { x: 2, y: 3, skin: 0, hair: 2, hairColor: 1, top: 0, acc: 'camera', dir: 'down' },
  { x: 3, y: 4, skin: 1, hair: 5, hairColor: 0, top: 1, acc: 'backpack', dir: 'left' },
  { x: 1, y: 2, skin: 0, hair: 1, hairColor: 3, top: 5, acc: 'apron', dir: 'down' },
];

function drawDemo(canvas: HTMLCanvasElement, sheet: Sheet | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: cw, height: ch } = canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, cw, ch);
  // 셀 (0,0) 위 꼭짓점의 캔버스 좌표
  const ox = Math.round(cw / 2 + 32);
  const oy = Math.round(ch * 0.3);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, oy - 1, cw, ch - oy + 1);
  if (!sheet) return;
  const band = (name: string, y: number, x0: number, x1: number) => {
    for (let x = x0; x < x1; x += 512) drawFrame(ctx, sheet, name, x, y);
  };
  const bx0 = ((ox % 512) - 512) % 512; // 캔버스 왼쪽 밖에서 시작해 이어 붙인다
  band('bg_sea', oy - 150, bx0, cw);
  band('bg_oreum', oy - 120, bx0, cw);
  band('bg_forest', oy - 96, bx0, cw);
  band('bg_village', oy - 84, ox - ISO_W - 1024, ox - ISO_W);
  for (let y = 0; y < DEMO_H; y++) {
    for (let x = 0; x < DEMO_W; x++) {
      const { sx, sy } = cellToScreen(x, y);
      drawFrame(ctx, sheet, y === DEMO_H - 1 ? 'iso_tile_road_spring' : 'iso_tile_soil_spring', ox + sx, oy + sy, { anchorX: 0.5, anchorY: 0 });
    }
  }
  const items: { d: number; draw: () => void }[] = [];
  for (const o of DEMO_OBJECTS) {
    const { sx, sy } = footAnchor(o.x, o.y, o.w, o.h);
    items.push({ d: depth(o.x, o.y, o.w, o.h), draw: () => { drawFrame(ctx, sheet, `iso_obj_${o.type}`, ox + sx, oy + sy, { anchorX: 0.5, anchorY: 1 }); } });
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
    let sheet: Sheet | null = null;
    let disposed = false;
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const parent = c.parentElement!;
      c.width = Math.ceil(parent.clientWidth / 2);
      c.height = Math.ceil(parent.clientHeight / 2);
      drawDemo(c, sheet);
    };
    draw();
    void loadSheet().then((s) => { if (disposed) return; sheet = s; draw(); });
    window.addEventListener('resize', draw);
    return () => { disposed = true; window.removeEventListener('resize', draw); };
  }, []);
  return <canvas ref={ref} data-testid="title-bg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated' }} />;
}

// ---------- 로고: 갈무리 굵은 글씨 + 픽셀 그림자 (온천골 스토리 나무 간판 느낌) ----------

const logoStyle: CSSProperties = {
  fontFamily: "'Galmuri11', system-ui, sans-serif",
  fontWeight: 700,
  fontSize: 38,
  lineHeight: 1.1,
  color: '#fff5dc',
  letterSpacing: 1,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  textShadow: `2px 0 0 ${PALETTE.wood}, -2px 0 0 ${PALETTE.wood}, 0 2px 0 ${PALETTE.wood}, 0 -2px 0 ${PALETTE.wood}, 2px 2px 0 ${PALETTE.wood}, -2px -2px 0 ${PALETTE.wood}, 2px -2px 0 ${PALETTE.wood}, -2px 2px 0 ${PALETTE.wood}, 4px 4px 0 #3b1f0e`,
};

const signStyle: CSSProperties = {
  ...frame,
  background: `repeating-linear-gradient(90deg, ${PALETTE.woodLight} 0 14px, #b8884d 14px 28px)`,
  padding: '18px 22px 14px',
  borderRadius: 10,
  boxShadow: `inset 0 0 0 2px ${PALETTE.wood}, inset 0 0 0 4px ${PALETTE.woodLight}, 0 6px 0 #3b1f0e`,
};

const titleBtn: CSSProperties = { ...brownBtn, width: '100%', marginRight: 0, minHeight: 48, fontSize: 18 };

// ---------- 타이틀 화면 ----------

export function TitleScreen({ onEnter }: { onEnter: () => void }) {
  const [canContinue, setCanContinue] = useState(false);
  const [slots, setSlots] = useState(false);
  const [best, setBest] = useState(false);
  useEffect(() => { void hasAnySave().then(setCanContinue); }, []);
  const onPointerDown = () => { unlockAudio(); void bgm('title'); };
  const start = () => {
    const go = () => { newGame(); onEnter(); };
    if (canContinue) Confirm('새로 시작하면 자동 저장이 새 게임으로 바뀌어요. 슬롯 1~3의 저장은 남아요.', go, { title: '새 게임' });
    else go();
  };
  const b = getBest();
  return (
    <div data-testid="title" onPointerDownCapture={onPointerDown} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: "'Galmuri11', system-ui, sans-serif" }}>
      <DemoBackdrop />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(48px + env(safe-area-inset-top)) 24px calc(28px + env(safe-area-inset-bottom))' }}>
        <div style={signStyle}>
          <div style={logoStyle}>제주 카페<br />이야기</div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#fff5dc', marginTop: 6, textShadow: `1px 1px 0 ${PALETTE.wood}` }}>귀농 카페 경영 시뮬레이션</div>
        </div>
        <div style={{ ...frame, width: '100%', maxWidth: 300, display: 'grid', gap: 6, padding: 10 }}>
          <button style={titleBtn} onClick={start}>시작</button>
          <button style={canContinue ? titleBtn : { ...brownBtnOff, ...titleBtn, opacity: 0.45 }} disabled={!canContinue} onClick={() => setSlots(true)}>이어하기</button>
          <button style={titleBtn} onClick={() => setBest(true)}>최고 점수</button>
          <a href={SITE_URL} target="_blank" rel="noreferrer" style={{ ...titleBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>사이트</a>
        </div>
      </div>
      {slots && <SaveSlots mode="load" onClose={() => setSlots(false)} onLoaded={onEnter} />}
      {best && (
        <Popup title="최고 점수" onBackdrop={() => setBest(false)} buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={() => setBest(false)}>닫기</button>}>
          <div style={frameTitleRow}><span>연 매출 최고</span><b>{b.yearScore > 0 ? won(b.yearScore) : '아직 없음'}</b></div>
          {b.at && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>{b.at.year}년차 기록</div>}
          <div style={{ ...frameTitleRow, marginTop: 8 }}><span>월 매출 최고</span><b>{b.monthIncome > 0 ? won(b.monthIncome) : '아직 없음'}</b></div>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 8 }}>연 매출은 12월 결산 때 갱신돼요.</div>
        </Popup>
      )}
    </div>
  );
}

const frameTitleRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };

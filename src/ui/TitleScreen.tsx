import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { wonText } from '../data/labels.ts';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { cellToScreen, footAnchor, depth, ISO_W } from '../render/iso';
import { HAIR_RGB, TOP_RGB } from '../render/character';
import { frame, brownBtn, brownBtnOff, PALETTE } from './frame';
import { Popup, Confirm } from './Popup';
import { SaveSlots } from './SaveSlots';
import { newGame, hasAnySave, getBestEnding } from './store';
import { ScoreCard } from './EndingScreen'; // z-ending: 엔딩 최종 점수 카드
import { getBest } from './best';
import { unlockAudio, bgm, sfx, isMuted, setMuted, setBgmVolume, setSfxVolume, getBgmVolume, getSfxVolume } from './audio';
import { Icon } from './Icon';
import { SAVE_VERSION } from '../sim/index.ts';

/** 버전 표기: package.json version + 빌드 날짜 (vite define). 테스트 환경엔 define이 없으니 안전하게 */
const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';
export const VERSION_TEXT = `v${APP_VERSION}${BUILD_DATE ? ` · ${BUILD_DATE}` : ''}`;

/** 세이브 슬롯 키 (store.ts SLOT_PREFIX와 같음). 백업 키는 `${prefix}backup:<slot>` */
const SLOT_PREFIX = 'jeju-cafe:slot:';
/** 지금 버전보다 옛 세이브(역직렬화 실패로 백업된 것 포함)가 localStorage에 남아 있나 — 타이틀에 「옛 세이브는 백업됐어요」 한 줄 */
export function hasOldSave(storage: Pick<Storage, 'length' | 'key' | 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  if (!storage) return false;
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!k?.startsWith(SLOT_PREFIX)) continue;
    if (k.startsWith(`${SLOT_PREFIX}backup:`)) return true;
    try {
      const v = (JSON.parse(storage.getItem(k) ?? 'null') as { version?: unknown } | null)?.version;
      if (typeof v === 'number' && v < SAVE_VERSION) return true;
    } catch { /* 깨진 값은 무시 */ }
  }
  return false;
}


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

/** onEnter: 이어하기(프롤로그 없이 게임). onNewGame: 새 게임 상태를 만든 뒤 프롤로그로. onReplayIntro: 설정 「프롤로그 다시 보기」 */
export function TitleScreen({ onEnter, onNewGame, onReplayIntro }: { onEnter: () => void; onNewGame: () => void; onReplayIntro: () => void }) {
  const [canContinue, setCanContinue] = useState(false);
  const [slots, setSlots] = useState(false);
  const [best, setBest] = useState(false);
  const [oldSave, setOldSave] = useState(false);
  const [sound, setSound] = useState(false);
  useEffect(() => { void hasAnySave().then(setCanContinue); setOldSave(hasOldSave()); }, []);
  const onPointerDown = () => { unlockAudio(); void bgm('title'); };
  const start = () => {
    const go = () => { newGame(); onNewGame(); };
    if (canContinue) Confirm('새로 시작하면 자동 저장이 새 게임으로 바뀌어요. 슬롯 1~3의 저장은 남아요.', go, { title: '새 게임' });
    else go();
  };
  const b = getBest();
  const be = getBestEnding(); // z-ending: 엔딩 최고 점수
  return (
    <div data-testid="title" onPointerDownCapture={onPointerDown} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: "'Galmuri11', system-ui, sans-serif" }}>
      <DemoBackdrop />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(48px + env(safe-area-inset-top)) 24px calc(28px + env(safe-area-inset-bottom))' }}>
        <div style={signStyle}>
          <div style={logoStyle}>제주 카페<br />이야기</div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#fff5dc', marginTop: 6, textShadow: `1px 1px 0 ${PALETTE.wood}` }}>귀농 카페 경영 시뮬레이션</div>
        </div>
        <div style={{ ...frame, width: '100%', maxWidth: 300, display: 'grid', gap: 6, padding: 10 }}>
          <button style={titleBtn} onClick={start}><Icon name="sparkle" size={20} /> 새 게임</button>
          <button style={canContinue ? titleBtn : { ...brownBtnOff, ...titleBtn, opacity: 0.45 }} disabled={!canContinue} onClick={() => setSlots(true)}><Icon name="play" size={20} /> 이어하기</button>
          <button style={titleBtn} onClick={() => setBest(true)}><Icon name="trophy" size={20} /> 최고 점수</button>
          <button style={titleBtn} onClick={() => setSound(true)} data-testid="title-settings"><Icon name="settings" size={20} /> 설정</button>
          {oldSave && <div data-testid="old-save-note" style={{ fontSize: 13, color: PALETTE.inkSoft, textAlign: 'center' }}>옛 세이브는 백업됐어요 (v{SAVE_VERSION} 이전 세이브는 새 게임으로)</div>}
          <div data-testid="title-version" style={{ fontSize: 12, color: PALETTE.inkSoft, textAlign: 'center' }}>{VERSION_TEXT}</div>
        </div>
      </div>
      {slots && <SaveSlots mode="load" onClose={() => setSlots(false)} onLoaded={onEnter} />}
      {sound && <SoundPopup onClose={() => setSound(false)} onReplayIntro={() => { setSound(false); onReplayIntro(); }} />}
      {best && (
        <Popup title="최고 점수" onBackdrop={() => setBest(false)} buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={() => setBest(false)}>닫기</button>}>
          {be ? <ScoreCard score={be.score} cafeName={be.cafeName} /> : <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 8 }}>10년차 결산 점수는 아직 없어요.</div>}
          <div style={{ ...frameTitleRow, marginTop: 10, borderTop: `1px dashed ${PALETTE.woodLight}`, paddingTop: 8 }}><span>연 매출 최고</span><b>{b.yearScore > 0 ? wonText(b.yearScore) : '아직 없음'}</b></div>
          {b.at && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>{b.at.year}년차 기록</div>}
          <div style={{ ...frameTitleRow, marginTop: 8 }}><span>월 매출 최고</span><b>{b.monthIncome > 0 ? wonText(b.monthIncome) : '아직 없음'}</b></div>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 8 }}>연 매출은 12월 결산 때 갱신돼요.</div>
        </Popup>
      )}
    </div>
  );
}

const frameTitleRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };

/** 타이틀 설정(소리): 배경음·효과음 슬라이더 + 음소거 (게임 안 설정 탭과 같은 값) + 프롤로그 다시 보기 */
function SoundPopup({ onClose, onReplayIntro }: { onClose: () => void; onReplayIntro: () => void }) {
  const [bgmVol, setBgmVol] = useState(getBgmVolume());
  const [sfxVol, setSfxVol] = useState(getSfxVolume());
  const [muted, setMutedState] = useState(isMuted());
  const slider = (text: string, v: number, set: (n: number) => void) => (
    <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr 40px', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44 }}>
      <span>{text}</span>
      <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: '100%', accentColor: PALETTE.paperDark }} />
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </label>
  );
  return (
    <Popup title="설정" onBackdrop={onClose} buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={onClose}>닫기</button>}>
      <div style={{ display: 'grid', gap: 6 }} data-testid="title-sound">
        {slider('배경음', bgmVol, (n) => { setBgmVolume(n); setBgmVol(n); })}
        {slider('효과음', sfxVol, (n) => { setSfxVolume(n); setSfxVol(n); sfx('tap'); })}
        <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={() => { setMuted(!isMuted()); setMutedState(isMuted()); }}>{muted ? <><Icon name="sound_on" /> 소리 켜기</> : <><Icon name="sound_off" /> 소리 끄기</>}</button>
        <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} data-testid="title-replay-intro" onClick={onReplayIntro}><Icon name="play" /> 프롤로그 다시 보기</button>
        <div style={{ fontSize: 12, color: PALETTE.inkSoft }}>{VERSION_TEXT}</div>
      </div>
    </Popup>
  );
}

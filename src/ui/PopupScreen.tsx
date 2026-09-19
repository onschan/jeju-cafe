import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame, dispatch } from './store';
import { Popup } from './Popup';
import { Bar } from './Bars';
import { brownBtn, dangerBtn, card, PALETTE } from './frame';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { HAIR_RGB, TOP_RGB, namedGuestParts, type CharacterParts } from '../render/character';
import { namedGuestFace, regionProgress, menuOf, priceOf, AFFINITY_MAX, POPUP_GUESTS_MAX, type PopupVisit } from '../sim/index.ts';
import { regionDef, namedGuestDef } from '../data/index.ts';
import { getState } from './store';

/**
 * 팝업 스토어 화면 (2B-4 Task 4): 지역 배경 띠 + 카운터 + 줄 선 손님. state.popup.visits에 새 방문이 생기면
 * 그 손님이 줄에서 카운터로 걸어와(0.8s) 말풍선(1.2s) → 반응(0.8s) → 왼쪽으로 퇴장(0.6s). 호감도 바는 아래 HTML.
 */
export const POPUP_W = 240;
export const POPUP_H = 120;
const FEET_Y = 108;
const COUNTER_X = 96;
const QUEUE_X0 = 150;
const QUEUE_GAP = 22;
const WALK_MS = 800;
const BUBBLE_MS = 1200;
const REACT_MS = 800;
const EXIT_MS = 600;
export const VISIT_ANIM_MS = WALK_MS + BUBBLE_MS + REACT_MS + EXIT_MS;

/** 지역 → 배경 띠 (2B-3 배경 재사용) */
export const REGION_BG: Record<string, string> = {
  dongmun: 'bg_village', hyeopjae: 'bg_sea', seongsan: 'bg_oreum', jungmun: 'bg_village', udo: 'bg_sea', hallasan: 'bg_forest', dolhareubang: 'bg_forest',
};
/** 지역 배경 색 (시트가 없을 때) */
const REGION_SKY: Record<string, string> = { bg_village: '#c9d6a3', bg_sea: '#9fd3e6', bg_oreum: '#b7c98a', bg_forest: '#8fb27a' };

export function partsOf(namedId: string): CharacterParts {
  const d = namedGuestDef(namedId);
  return namedGuestParts(namedGuestFace(d), d.face.seed, d.regionId);
}

function drawChar(ctx: CanvasRenderingContext2D, sheet: Sheet | null, p: CharacterParts, x: number, dir: 'down' | 'left' | 'right', frame: 0 | 1 | 2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (!sheet) {
    ctx.fillStyle = `#${TOP_RGB[p.top]!.toString(16).padStart(6, '0')}`;
    ctx.fillRect(Math.round(x - 6), FEET_Y - 28, 12, 20);
    ctx.fillStyle = `#${HAIR_RGB[p.hairColor]!.toString(16).padStart(6, '0')}`;
    ctx.fillRect(Math.round(x - 6), FEET_Y - 36, 12, 8);
    ctx.restore();
    return;
  }
  const o = { anchorX: 0.5, anchorY: 1 };
  drawFrame(ctx, sheet, `body_${p.skin}_${dir}_${frame}`, x, FEET_Y, o);
  drawFrame(ctx, sheet, `top_${dir}_${frame}`, x, FEET_Y, { ...o, tint: TOP_RGB[p.top] });
  drawFrame(ctx, sheet, `hair_${p.hairStyle}_${dir}`, x, FEET_Y, { ...o, tint: HAIR_RGB[p.hairColor] });
  for (const acc of p.accs) drawFrame(ctx, sheet, `acc_${acc}_${dir}`, x, FEET_Y, o);
  ctx.restore();
}

/** 애니 단계 (0~1 진행) */
export interface Anim { visit: PopupVisit; start: number }
export function animPhase(elapsed: number): { phase: 'walk' | 'bubble' | 'react' | 'exit' | 'done'; t: number } {
  if (elapsed < WALK_MS) return { phase: 'walk', t: elapsed / WALK_MS };
  if (elapsed < WALK_MS + BUBBLE_MS) return { phase: 'bubble', t: (elapsed - WALK_MS) / BUBBLE_MS };
  if (elapsed < WALK_MS + BUBBLE_MS + REACT_MS) return { phase: 'react', t: (elapsed - WALK_MS - BUBBLE_MS) / REACT_MS };
  if (elapsed < VISIT_ANIM_MS) return { phase: 'exit', t: (elapsed - WALK_MS - BUBBLE_MS - REACT_MS) / EXIT_MS };
  return { phase: 'done', t: 1 };
}

export function drawPopupScene(canvas: HTMLCanvasElement, sheet: Sheet | null, regionId: string, queue: string[], anim: Anim | null, now: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const bg = REGION_BG[regionId] ?? 'bg_village';
  // 배경 띠 (512×96 중 240 너비 조각) + 바닥
  ctx.fillStyle = REGION_SKY[bg] ?? PALETTE.paperDark;
  ctx.fillRect(0, 0, POPUP_W, POPUP_H);
  const f = sheet?.frames[bg];
  if (sheet && f) ctx.drawImage(sheet.image, f.x, f.y, Math.min(f.w, POPUP_W), f.h, 0, 0, Math.min(f.w, POPUP_W), f.h);
  ctx.fillStyle = '#c8b48a';
  ctx.fillRect(0, 96, POPUP_W, POPUP_H - 96);
  ctx.fillStyle = '#a58c62';
  ctx.fillRect(0, 96, POPUP_W, 2);
  // 카운터 (천막 + 판)
  ctx.fillStyle = '#e04a4a';
  ctx.fillRect(COUNTER_X - 50, 40, 100, 8);
  ctx.fillStyle = '#fff5dc';
  for (let i = 0; i < 5; i++) ctx.fillRect(COUNTER_X - 50 + i * 20, 40, 10, 8);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(COUNTER_X - 44, 76, 88, 22);
  ctx.fillStyle = '#c99a5b';
  ctx.fillRect(COUNTER_X - 44, 74, 88, 4);
  ctx.fillStyle = '#6b3d1e';
  ctx.fillRect(COUNTER_X - 48, 48, 3, 28);
  ctx.fillRect(COUNTER_X + 45, 48, 3, 28);
  // 줄 선 손님 (오른쪽, 뒤에서 앞으로)
  queue.slice(0, POPUP_GUESTS_MAX).forEach((id, i) => {
    const x = QUEUE_X0 + i * QUEUE_GAP;
    if (x < POPUP_W + 8) drawChar(ctx, sheet, partsOf(id), x, 'left', 1, 0.85);
  });
  // 지금 손님
  if (anim) {
    const { phase, t } = animPhase(now - anim.start);
    const p = partsOf(anim.visit.namedId);
    const frame = ((Math.floor(now / 120) % 3) as 0 | 1 | 2);
    if (phase === 'walk') drawChar(ctx, sheet, p, QUEUE_X0 - (QUEUE_X0 - COUNTER_X - 30) * t, 'left', frame);
    else if (phase === 'exit') drawChar(ctx, sheet, p, COUNTER_X + 30 - (COUNTER_X + 60) * t, 'left', frame);
    else {
      drawChar(ctx, sheet, p, COUNTER_X + 30, 'down', 1);
      // 말풍선 (대사는 HTML에) — 아이콘만: 주문 ☕ / 반응
      const x = COUNTER_X + 30;
      const y = FEET_Y - 52;
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = PALETTE.wood;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - 14, y - 14, 28, 20, 5);
      ctx.fill();
      ctx.stroke();
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.ink;
      const v = anim.visit;
      const icon = phase === 'bubble' ? (v.menuId ? '☕' : '…') : v.mood === 'happy' ? (v.taste ? '♥' : '♪') : v.reason === 'price' ? '₩' : '?';
      ctx.fillText(icon, x, y + 1);
      if (phase === 'react' && v.mood === 'happy') {
        ctx.fillStyle = v.taste ? '#e63946' : PALETTE.ok;
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`+${v.gain}`, x + 24, y - 6 - t * 10);
      }
    }
  }
}

function VisitLine({ v }: { v: PopupVisit }) {
  const d = namedGuestDef(v.namedId);
  const menu = v.menuId ? menuOf(getState(), v.menuId).name : null;
  const react = v.mood === 'happy' ? (v.taste ? `${menu} — 딱 취향! 호감 +${v.gain}` : `${menu} — 호감 +${v.gain}`) : v.reason === 'price' ? '비싸다… (예산 초과)' : '먹을 게 없네… 😐';
  return (
    <div style={{ fontSize: 13 }}>
      <b>{d.name}</b> <span style={{ color: PALETTE.inkSoft }}>{d.job}</span>
      <div style={{ fontStyle: 'italic', color: PALETTE.inkSoft }}>“{d.line}”</div>
      <div>{react}{v.regularNow ? ' · ★ 단골이 됐어요!' : ''}{v.reward ? ` · 🎁 ${v.reward}` : ''}</div>
      <div style={{ whiteSpace: 'nowrap' }}>호감 <Bar value={v.affinity} max={AFFINITY_MAX} width={120} color={v.taste ? '#e63946' : PALETTE.bar} /> {v.affinity}/{AFFINITY_MAX}</div>
    </div>
  );
}

/** 팝업 화면: 열린 팝업이 있을 때 App이 띄운다 */
export function PopupScreen({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const ref = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<Sheet | null>(null);
  const seenRef = useRef<number>(-1); // 마지막으로 연출한 방문 tick
  const pendingRef = useRef<PopupVisit[]>([]);
  const animRef = useRef<Anim | null>(null);
  const [shown, setShown] = useState<PopupVisit | null>(null);
  const regionId = s.popup.regionId ?? s.popup.lastRegionId;
  const visits = s.popup.visits;
  // 새 방문을 연출 큐에 넣는다 (처음 열 때 이미 있던 것은 마지막 하나만 보여 준다)
  useEffect(() => {
    if (seenRef.current < 0) {
      seenRef.current = visits.length > 0 ? visits[visits.length - 1]!.tick : 0;
      setShown(visits[visits.length - 1] ?? null);
      return;
    }
    for (const v of visits) if (v.tick > seenRef.current) { pendingRef.current.push(v); seenRef.current = v.tick; }
  }, [visits, visits.length]);
  useEffect(() => {
    let raf = 0;
    let disposed = false;
    void loadSheet().then((sh) => { if (!disposed) sheetRef.current = sh; });
    const frame = (now: number) => {
      if (!animRef.current && pendingRef.current.length > 0) {
        animRef.current = { visit: pendingRef.current.shift()!, start: now };
        setShown(animRef.current.visit);
      }
      if (animRef.current && animPhase(now - animRef.current.start).phase === 'done') animRef.current = null;
      const c = ref.current;
      if (c) drawPopupScene(c, sheetRef.current, regionId ?? 'dongmun', getState().popup.queue, animRef.current, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { disposed = true; cancelAnimationFrame(raf); };
  }, [regionId]);
  if (!regionId) return null;
  const def = regionDef(regionId);
  const prog = regionProgress(s, regionId);
  const open = s.popup.regionId !== null;
  return (
    <Popup title={`${def.name} 팝업 스토어`} onBackdrop={onClose}
      buttons={<>
        {open && <button style={dangerBtn} onClick={() => dispatch({ type: 'closePopup' })} aria-label="팝업 닫기">팝업 접기</button>}
        <button style={{ ...brownBtn, marginRight: 0 }} onClick={onClose}>확인</button>
      </>}>
      <canvas ref={ref} width={POPUP_W} height={POPUP_H} data-testid="popup-scene" style={{ display: 'block', width: '100%', aspectRatio: `${POPUP_W} / ${POPUP_H}`, imageRendering: 'pixelated', border: `2px solid ${PALETTE.wood}`, borderRadius: 4, background: PALETTE.paperDark }} />
      <div style={{ fontSize: 12, color: PALETTE.inkSoft, margin: '6px 0' }}>
        {open ? `줄 ${s.popup.queue.length}명 남음 · ` : '오늘 팝업은 끝났어요 · '}방문 {visits.length} · 만난 손님 {prog.met}/{prog.total} · 단골★ {prog.regular} · 매출 {wonText(visits.reduce((n, v) => n + (v.menuId ? priceOf(s, v.menuId) : 0), 0))}
      </div>
      <div style={{ ...card, marginBottom: 0, minHeight: 72 }} data-testid="popup-visit">
        {shown ? <VisitLine v={shown} /> : <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>손님을 기다리는 중… 매 시간 한 명씩 와요</span>}
      </div>
    </Popup>
  );
}

// ---------- 호스트 (모듈 스토어): 지역 지도의 "팝업 보기"나 팝업이 열리는 순간 자동으로 띄운다 ----------
let visible = false;
let version = 0;
const listeners = new Set<() => void>();
function emit() { version++; for (const l of listeners) l(); }
export function showPopupScreen(): void { visible = true; emit(); }
export function hidePopupScreen(): void { visible = false; emit(); }

/** App에 한 번 둔다. 팝업이 새로 열리면(regionId null → id) 자동으로 화면을 띄운다. */
export function PopupScreenHost() {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => version);
  const s = useGame();
  const prevRef = useRef<string | null>(s.popup.regionId);
  useEffect(() => {
    if (s.popup.regionId && !prevRef.current) showPopupScreen();
    prevRef.current = s.popup.regionId;
  }, [s.popup.regionId]);
  if (!visible || s.lastMonthCard || s.lastAnnouncement) return null;
  return <PopupScreen onClose={hidePopupScreen} />;
}

/** 옛 UI에서 되살린 카드들: 목표 보물상자 · 월말 결산 · 하루 요약 · 삼춘 메시지 줄 · 파츠 초상 */
import { useEffect, useRef, useState } from 'react';
import type { GameState, Objective } from '../game/index.ts';
import { GUEST_TYPES, currentObjective, popularitySum, myScore, rivalScore, RIVALS } from '../game/index.ts';
import { drawPortrait, PORTRAIT_SIZE } from '../render/portrait';
import { partsOfFace, type AccKind, type Face } from '../render/character';
import { useThumb } from './thumbs';
import { assetUrl } from './assetUrl';
import { toasts } from './store';
import { guestAccs } from './guestLook';
import { C, panel, titleBar, btnGold, small, won, wonShort } from './theme';

// ---------- 초상 ----------
/** 파츠 초상(48 원본 → size로 픽셀 확대). 시트가 아직이면 올 때까지 다시 그린다. */
export function Portrait({ face, accs = [], size = 48 }: { face: Face; accs?: AccKind[]; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true; let tries = 0;
    const tick = () => { if (!alive || !ref.current) return; if (drawPortrait(ref.current, partsOfFace(face, accs))) return; if (tries++ < 20) setTimeout(tick, 150); };
    tick();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face.hair, face.skin, face.top, accs.join(',')]);
  return <span style={{ display: 'inline-block', width: size, height: size, background: '#efe6d2', border: `2px solid #b07a48`, borderRadius: 6, overflow: 'hidden', flex: 'none' }}><canvas ref={ref} width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} style={{ width: size, height: size, imageRendering: 'pixelated', display: 'block' }} /></span>;
}
/** 손님층 대표 얼굴 (결정적) */
export function guestTypeFace(typeId: string): { face: Face; accs: AccKind[] } {
  const i = Math.max(0, GUEST_TYPES.findIndex((g) => g.id === typeId));
  const accs: AccKind[] = guestAccs(typeId);
  return { face: { hair: (i * 3 + 1) % 8, skin: i % 3, top: (i * 5 + 2) % 8 }, accs };
}

// ---------- 목표 보물상자 ----------
const SHAKE_SEQ = [0, 1, 0, 2, 0, 1, 2, 1, 2, 0];
const OPEN_SEQ = [3, 4, 5, 6, 5, 6, 7];
const CHEST_FRAME_MS = 80;
/** 목표를 이루면 보물상자가 흔들리다 열리고 상금이 튀어나온다. 탭하면 닫힌다. */
export function RewardChest({ objective, onClose }: { objective: Objective; onClose: () => void }) {
  const [i, setI] = useState(0);
  const seq = [...SHAKE_SEQ, ...OPEN_SEQ];
  useEffect(() => { if (i >= seq.length - 1) return; const t = setTimeout(() => setI(i + 1), CHEST_FRAME_MS); return () => clearTimeout(t); }, [i, seq.length]);
  const frame = seq[Math.min(i, seq.length - 1)]!;
  const url = useThumb(`ui_chest_${frame}`, 128);
  const opened = i >= SHAKE_SEQ.length + 2;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 45, background: '#0006', display: 'grid', placeItems: 'center' }} onClick={() => { if (opened) onClose(); }}>
      <div style={{ ...panel, width: 260, textAlign: 'center', display: 'grid', gap: 6 }}>
        <div style={{ ...titleBar, justifyContent: 'center' }}>목표 달성!</div>
        <div style={{ fontSize: 14 }}>{objective.text}</div>
        <div style={{ height: 128, display: 'grid', placeItems: 'center', position: 'relative' }}>
          {url ? <img className="px" src={url} width={128} height={128} alt="" style={{ imageRendering: 'pixelated' }} /> : <div style={{ width: 128, height: 128 }} />}
          {opened && <div style={{ position: 'absolute', top: 6, left: 0, right: 0, fontSize: 22, fontWeight: 700, color: C.gold, textShadow: '1px 1px 0 #4a2f16', animation: 'pop .35s ease-out' }}>+{wonShort(objective.reward)}</div>}
        </div>
        <div style={small}>{opened ? '탭해서 받기' : '…'}</div>
      </div>
      <style>{`@keyframes pop { from { transform: translateY(24px) scale(.6); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}

// ---------- 월말 결산 ----------
export function MonthCard({ s, onClose }: { s: GameState; onClose: () => void }) {
  const m = s.lastMonth!;
  const profit = m.income - m.spent;
  const rate = m.guests ? Math.round((m.happy / m.guests) * 100) : 0;
  const obj = currentObjective(s);
  const rows = [{ id: 'me', name: s.cafeName, score: myScore(s) }, ...RIVALS.map((r) => ({ id: r.id, name: r.name, score: rivalScore(r.id, s.clock.year) }))].sort((a, b) => b.score - a.score);
  const rank = rows.findIndex((r) => r.id === 'me') + 1;
  const stamp = profit >= 0 && rate >= 60 ? '잘했다!' : profit >= 0 ? '무난' : '적자';
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 44, background: '#0006', display: 'grid', placeItems: 'center' }}>
      <div style={{ ...panel, width: 300, display: 'grid', gap: 6, position: 'relative' }}>
        <div style={titleBar}>{m.year}년 {m.month}월 결산</div>
        <div style={{ position: 'absolute', right: 14, top: 40, transform: 'rotate(-12deg)', border: `3px solid ${profit >= 0 ? C.red : C.soft}`, color: profit >= 0 ? C.red : C.soft, borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 16, opacity: 0.85 }}>{stamp}</div>
        <Line k="수입" v={won(m.income)} c={C.green} /><Line k="지출" v={won(m.spent)} c={C.red} /><Line k="순이익" v={`${profit < 0 ? '−' : ''}${won(Math.abs(profit))}`} c={profit >= 0 ? C.ink : C.red} bold />
        <Line k="손님" v={`${m.guests}명 · 만족 ${rate}%`} /><Line k="명성" v={`${s.fame} (${s.fame - m.fame0 >= 0 ? '+' : ''}${s.fame - m.fame0})`} /><Line k="시설 인기 합" v={String(popularitySum(s))} />
        <Line k="제주 카페 랭킹" v={`지금 ${rank}위 / ${rows.length}`} />
        <div style={{ ...small, borderTop: `1px solid #d8c9a8`, paddingTop: 6 }}>{obj ? `다음 목표 — ${obj.text} (상금 ${wonShort(obj.reward)})` : '목표를 다 이뤘다. 마음껏 키워 보자.'}</div>
        <button style={btnGold} onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
function Line({ k, v, c, bold }: { k: string; v: string; c?: string; bold?: boolean }) { return <div style={{ display: 'flex', fontSize: 13 }}><span style={{ ...small, flex: 1 }}>{k}</span><span style={{ color: c ?? C.ink, fontWeight: bold ? 700 : 400 }}>{v}</span></div>; }

// ---------- 하루 요약 ----------
export const DAY_CARD_MS = 3000;
function delta(cur: number, prev: number | null, money = false): string {
  if (prev === null) return ''; const d = cur - prev; if (d === 0) return '';
  return `${d > 0 ? '▲' : '▼'}${money ? wonShort(Math.abs(d)).replace('₩', '') : Math.abs(d)}`;
}
/** 하루가 끝나면(24시) 3초 동안 「오늘 장사」 한 장 — 손님·매출, 어제 대비 */
export function DaySummary({ today, prev, bottom }: { today: { guests: number; income: number }; prev: { guests: number; income: number } | null; bottom: number | string }) {
  const rows = [
    { label: '손님', value: `${today.guests}명`, d: delta(today.guests, prev?.guests ?? null), up: !prev || today.guests >= prev.guests },
    { label: '매출', value: wonShort(today.income), d: delta(today.income, prev?.income ?? null, true), up: !prev || today.income >= prev.income },
  ];
  return (
    <div style={{ position: 'absolute', left: 8, right: 8, bottom, ...panel, padding: '5px 10px', pointerEvents: 'none', fontSize: 14, fontWeight: 700 }}>
      <div style={{ ...small, marginBottom: 2 }}><img className="px" src={assetUrl('assets/icons/icon_calendar.png')} width={12} height={12} alt="" /> 오늘 장사</div>
      <div style={{ display: 'flex', gap: 12 }}>{rows.map((r) => <span key={r.label}><span style={{ ...small, fontWeight: 400 }}>{r.label} </span>{r.value}{r.d && <span style={{ color: r.up ? C.green : C.red, marginLeft: 3 }}>{r.d}</span>}</span>)}</div>
    </div>
  );
}

// ---------- 삼춘 메시지 줄 ----------
export const MESSAGE_LINE_H = 24;
/** 하단 바 바로 위 한 줄: 삼춘 초상 + 마지막 알림. 3초 뒤 회색으로. 탭하면 최근 것들이 펼쳐진다. */
export function MessageLine({ bottom, flash }: { bottom: number | string; flash: string | null }) {
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const list = [...toasts].reverse();
  const head = list[0];
  const fresh = !!head && performance.now() - head.at < 3000;
  const text = flash ?? head?.text ?? '';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 11 }}>
      {open && list.length > 1 && <div style={{ position: 'absolute', left: 6, right: 6, bottom: MESSAGE_LINE_H + 4, ...panel, padding: '4px 8px', fontSize: 13, color: C.soft, maxHeight: '40vh', overflowY: 'auto' }}>{list.map((m) => <div key={m.id} style={{ lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {m.text}</div>)}</div>}
      <button onClick={() => setOpen((v) => !v)} style={{ width: '100%', height: MESSAGE_LINE_H, padding: '0 8px', border: 0, borderTop: `2px solid #4a2f16`, background: flash ? '#8e2f22' : fresh ? '#6b4423' : '#4f3419', color: flash ? '#ffe3dc' : fresh ? '#fff8e8' : '#cdb89a', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', boxSizing: 'border-box', transition: 'background .3s, color .3s' }}>
        <img className="px" src={assetUrl('assets/icons/portrait_samchun.png')} width={22} height={22} alt="" style={{ flex: 'none', imageRendering: 'pixelated', borderRadius: 3, opacity: text ? 1 : 0.4 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      </button>
    </div>
  );
}

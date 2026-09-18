import { useEffect, useRef, useState } from 'react';
import type { Alert, GoalReward } from '../sim/index.ts';
import { goalRewardText, FEATURE_NAME } from '../sim/index.ts';
import { objectDef, MENUS } from '../data/index.ts';
import { useGame, dispatch } from './store';
import { frame, frameTitle, brownBtn, PALETTE } from './frame';
import { Icon } from './Icon';
import { sfx } from './audio';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { showDialogue } from './dialogue.ts';
import { alertToDialogue } from './alertDialogue.ts';

/** 보상 상자 연출 (스펙 §7.4). state.alerts 맨 앞이 { type: 'reward' }면 뜬다.
 *  갈색 상자가 흔들리다(0.6초) 열리고, 보상이 하나씩(0.3초 간격) 튀어나온다 (fanfare → coin). 해금이면 시설/메뉴 스프라이트 + "새로 열렸다!" 배지.
 *  탭하면 닫힘 → dismissAlert. 축하 대사(line)가 있으면 닫은 뒤 대화창으로 이어진다. 목표는 뒤에 { type: 'goal' } 알림이 따로 있다. */

export const SHAKE_MS = 600;
export const ITEM_INTERVAL_MS = 300;

const SOURCE_TITLE: Record<Extract<Alert, { type: 'reward' }>['source'], string> = { goal: '목표 달성!', challenge: '도전 성공!', monthly: '이달의 과제 달성!', tutorial: '잘했다!' };

function rewardIcon(r: GoalReward): string {
  switch (r.type) {
    case 'money': return 'money';
    case 'research': return 'research';
    case 'unlockFacility': case 'builder': return 'build';
    case 'unlockMenu': return 'menu';
    case 'unlockFeature': case 'unlockRole': case 'unlockRecruit': case 'unlockGuidebook': return 'unlock';
    case 'unlockGuest': return 'tourist';
    case 'staffSlot': return 'local';
    case 'item': case 'seed': return 'plant';
    case 'tickets': case 'mileage': case 'title': case 'feeBonus': return 'look';
  }
}
function isUnlock(r: GoalReward): boolean {
  return r.type.startsWith('unlock') || r.type === 'title';
}
function unlockName(r: GoalReward): string {
  switch (r.type) {
    case 'unlockFacility': try { return objectDef(r.id).name; } catch { return '새 시설'; }
    case 'unlockMenu': return MENUS.find((m) => m.id === r.id)?.name ?? '새 메뉴';
    case 'unlockFeature': return FEATURE_NAME[r.id];
    case 'title': return r.name;
    default: return goalRewardText(r);
  }
}

/** 시설·메뉴 스프라이트 (시트에 있으면 캔버스, 없으면 아이콘) */
function UnlockSprite({ sheet, r }: { sheet: Sheet | null; r: GoalReward }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const name = r.type === 'unlockFacility' ? `iso_obj_${r.id}` : r.type === 'unlockMenu' ? `menu_${r.id}` : null;
  useEffect(() => {
    const c = ref.current;
    if (!c || !sheet || !name) { setDrawn(false); return; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 48);
    const f = sheet.frames[name] ?? sheet.frames[`${name}_0`];
    if (!f) { setDrawn(false); return; }
    setDrawn(drawFrame(ctx, sheet, sheet.frames[name] ? name : `${name}_0`, 32, 48, { anchorX: 0.5, anchorY: 1, scale: Math.min(64 / f.w, 48 / f.h, 2) }));
  }, [sheet, name]);
  return (
    <span style={{ position: 'relative', width: 64, height: 48, display: 'inline-block', flex: 'none' }}>
      {!drawn && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={rewardIcon(r)} size={32} /></span>}
      <canvas ref={ref} width={64} height={48} style={{ position: 'absolute', inset: 0, imageRendering: 'pixelated' }} aria-hidden />
    </span>
  );
}

export function RewardPopup() {
  const s = useGame();
  const a = s.alerts[0];
  const alert = a && a.type === 'reward' ? a : null;
  const [phase, setPhase] = useState<'shake' | 'open'>('shake');
  const [shown, setShown] = useState(0);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  useEffect(() => { let on = true; void loadSheet().then((sh) => { if (on) setSheet(sh); }); return () => { on = false; }; }, []);
  // 알림이 바뀔 때마다 처음부터: 흔들림 → 열림 → 아이템 0.3초 간격
  useEffect(() => {
    if (!alert) return;
    setPhase('shake');
    setShown(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => { setPhase('open'); sfx('fanfare'); }, SHAKE_MS));
    alert.items.forEach((_, i) => timers.push(setTimeout(() => { setShown(i + 1); sfx(isUnlock(alert.items[i]!) ? 'unlock' : 'coin'); }, SHAKE_MS + ITEM_INTERVAL_MS * (i + 1))));
    return () => timers.forEach(clearTimeout);
  }, [alert]);
  if (!alert) return null;
  const done = phase === 'open' && shown >= alert.items.length;
  const close = () => {
    if (!done) { setPhase('open'); setShown(alert.items.length); return; } // 탭하면 연출을 건너뛰고 다 보여준다
    const req = alertToDialogue(alert);
    dispatch({ type: 'dismissAlert' });
    if (req.lines.length > 0) showDialogue(req);
  };
  return (
    <div data-testid="reward-popup" onClick={close}
      style={{ position: 'absolute', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45, padding: 16 }}>
      <style>{`@keyframes reward-shake { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(-8deg); } 40% { transform: rotate(8deg); } 60% { transform: rotate(-6deg); } 80% { transform: rotate(6deg); } }
@keyframes reward-pop { 0% { transform: translateY(24px) scale(0.4); opacity: 0; } 60% { transform: translateY(-6px) scale(1.1); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes reward-lid { 0% { transform: translateY(0) rotate(0); } 100% { transform: translateY(-18px) rotate(-14deg); } }`}</style>
      <div style={{ ...frame, width: '100%', maxWidth: 340, textAlign: 'center', fontSize: 16 }} onClick={(e) => e.stopPropagation()}>
        <div style={frameTitle}>{SOURCE_TITLE[alert.source]}</div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{alert.title}</div>
        {/* 상자 */}
        <div aria-hidden style={{ position: 'relative', width: 96, height: 72, margin: '0 auto 10px', animation: phase === 'shake' ? `reward-shake 0.3s ease-in-out infinite` : undefined }}>
          <div style={{ position: 'absolute', left: 8, top: 24, width: 80, height: 44, background: PALETTE.wood, border: `3px solid ${PALETTE.ink}`, borderRadius: 4 }} />
          <div style={{ position: 'absolute', left: 0, top: 12, width: 96, height: 20, background: PALETTE.woodLight, border: `3px solid ${PALETTE.ink}`, borderRadius: 4, transformOrigin: 'left bottom', animation: phase === 'open' ? 'reward-lid 0.25s ease-out forwards' : undefined }} />
          <div style={{ position: 'absolute', left: 40, top: 8, width: 16, height: 56, background: '#ffd54a', opacity: 0.9 }} />
        </div>
        {/* 아이템 */}
        <div data-testid="reward-items" style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 44 }}>
          {alert.items.slice(0, phase === 'open' ? shown : 0).map((r, i) => (
            <div key={i} data-testid="reward-item" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, animation: 'reward-pop 0.3s ease-out', textAlign: 'left' }}>
              {isUnlock(r) ? <UnlockSprite sheet={sheet} r={r} /> : <Icon name={rewardIcon(r)} size={24} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{isUnlock(r) ? unlockName(r) : goalRewardText(r)}</div>
                {isUnlock(r) && <span style={{ display: 'inline-block', marginTop: 2, fontSize: 13, background: PALETTE.btnOn, color: PALETTE.btnOnText, borderRadius: 4, padding: '0 6px' }}>새로 열렸다!</span>}
              </div>
            </div>
          ))}
        </div>
        <button style={{ ...brownBtn, marginTop: 12, minWidth: 120 }} onClick={close} aria-label={done ? '받기' : '건너뛰기'}>{done ? '받기' : '…'}</button>
      </div>
    </div>
  );
}

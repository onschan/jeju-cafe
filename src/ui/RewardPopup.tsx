import { useEffect, useRef, useState } from 'react';
import type { Alert, GoalReward } from '../sim/index.ts';
import { goalRewardText, FEATURE_NAME } from '../sim/index.ts';
import { objectDef, MENUS } from '../data/index.ts';
import { useGame, dispatch } from './store';
import { frame, brownBtn, PALETTE } from './frame';
import { Icon } from './Icon';
import { sfx } from './audio';
import { loadSheet, drawFrame, type Sheet } from './sheetCanvas';
import { showDialogue } from './dialogue.ts';
import { alertToDialogue } from './alertDialogue.ts';
import { assetUrl } from './assetUrl';

/** 보상 상자 연출 (스펙 §7.4). state.alerts 맨 앞이 { type: 'reward' }면 뜬다.
 *  보물 상자 스프라이트(ui_chest_0..7, 64px 원본을 128px로)가 흔들리다(0.6초) 열리고, 보상이 하나씩(0.3초 간격) 상자에서 위로 튀어나와
 *  자리로 내려앉는다 (fanfare → coin). 열릴 때 반짝 6개·동전 4개가 흩어진다(렌더 측 난수). 해금이면 시설/메뉴 스프라이트 + "새로 열렸다!" 배지.
 *  탭하면 닫힘 → dismissAlert. 축하 대사(line)가 있으면 닫은 뒤 대화창으로 이어진다. 목표는 뒤에 { type: 'goal' } 알림이 따로 있다. */

export const SHAKE_MS = 600;
export const ITEM_INTERVAL_MS = 300;
/** 상자 프레임 간격 */
export const CHEST_FRAME_MS = 80;
/** 흔들림 프레임 순서(0 닫힘·1 왼쪽·2 오른쪽) → 열림 순서(3 살짝 → 4 활짝 → 5·6 반짝 → 7 정지) */
const SHAKE_SEQ = [0, 1, 0, 2, 0, 1, 2, 1, 2, 0];
const OPEN_SEQ = [3, 4, 5, 6, 5, 6, 7];
const CHEST_PX = 128;

const ui = (name: string) => assetUrl(`assets/icons/${name}.png`);

const SOURCE_TITLE: Record<Extract<Alert, { type: 'reward' }>['source'], string> = { goal: '목표 달성!', monthly: '이달의 과제 달성!', tutorial: '잘했다!', rank: '새 시설이 열렸다!', star: '★ 승급!', unlock: '새 손님!', milestone: '반쯤 왔다!', bundle: '한꺼번에!', grade: '카페가 자랐다!' }; // grade: fun-rank 등급 승급

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
    case 'tickets': case 'title': case 'feeBonus': return 'look';
    case 'menuSlot': return 'menu'; // stakes: 메뉴판 칸
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

/** 보물 상자 스프라이트: phase에 따라 프레임 시퀀스를 80ms 간격으로 넘긴다. 열리면 반짝·동전 파티클(위치는 렌더 측 난수). */
function Chest({ phase }: { phase: 'shake' | 'open' }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    const id = window.setInterval(() => setTick((t) => t + 1), CHEST_FRAME_MS);
    return () => window.clearInterval(id);
  }, [phase]);
  const seq = phase === 'shake' ? SHAKE_SEQ : OPEN_SEQ;
  const frame = phase === 'shake' ? seq[tick % seq.length]! : seq[Math.min(tick, seq.length - 1)]!;
  // 파티클 위치는 열릴 때 한 번 뽑는다 (연출용 난수: sim이 아니므로 Math.random OK)
  const [particles] = useState(() => ({
    sparks: Array.from({ length: 6 }, (_, i) => ({ x: 8 + Math.random() * (CHEST_PX - 24), y: -8 + Math.random() * 56, delay: i * 90 + Math.random() * 120, frame: i % 3 })),
    coins: Array.from({ length: 4 }, (_, i) => ({ x: 24 + i * 24 + Math.random() * 12, dx: (Math.random() - 0.5) * 60, h: 40 + Math.random() * 30, delay: 120 + i * 70, frame: i % 4 })),
  }));
  return (
    <div aria-hidden data-testid="reward-chest" data-frame={frame} style={{ position: 'relative', width: CHEST_PX, height: CHEST_PX, margin: '4px auto 0' }}>
      <img className="px" src={ui(`ui_chest_${frame}`)} width={CHEST_PX} height={CHEST_PX} alt="" style={{ display: 'block', imageRendering: 'pixelated' }} />
      {phase === 'open' && particles.sparks.map((p, i) => (
        <img key={`s${i}`} className="px" src={ui(`ui_sparkle_${p.frame}`)} width={16} height={16} alt=""
          style={{ position: 'absolute', left: p.x, top: p.y, imageRendering: 'pixelated', opacity: 0, animation: `reward-spark 0.7s ease-out ${p.delay}ms 2` }} />
      ))}
      {phase === 'open' && particles.coins.map((p, i) => (
        <img key={`c${i}`} className="px" src={ui(`ui_coin_${p.frame}`)} width={24} height={24} alt=""
          style={{ position: 'absolute', left: p.x, top: 40, imageRendering: 'pixelated', opacity: 0, ['--dx' as string]: `${p.dx}px`, ['--h' as string]: `${-p.h}px`, animation: `reward-coin 0.9s cubic-bezier(.2,.7,.4,1) ${p.delay}ms forwards` }} />
      ))}
    </div>
  );
}

/** 제목 리본 배너 (ui_ribbon_banner 240×40 → 2배) */
function Ribbon({ text }: { text: string }) {
  return (
    <div style={{ position: 'relative', width: 240, height: 40, margin: '-26px auto 0' }}>
      <img className="px" src={ui('ui_ribbon_banner')} width={240} height={40} alt="" style={{ position: 'absolute', inset: 0, imageRendering: 'pixelated' }} />
      <div style={{ position: 'absolute', inset: '2px 24px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff8e6', fontWeight: 700, fontSize: 17, textShadow: '1px 1px 0 #5a1010, -1px 1px 0 #5a1010, 1px -1px 0 #5a1010, -1px -1px 0 #5a1010' }}>{text}</div>
    </div>
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
      <style>{`@keyframes reward-pop { 0% { transform: translateY(-72px) scale(0.5); opacity: 0; } 35% { transform: translateY(-96px) scale(1.05); opacity: 1; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes reward-spark { 0% { opacity: 0; transform: scale(0.4); } 30% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0; transform: scale(0.8) translateY(-10px); } }
@keyframes reward-coin { 0% { opacity: 1; transform: translate(0, 0) rotateY(0); } 50% { opacity: 1; transform: translate(calc(var(--dx) / 2), var(--h)) rotateY(180deg); } 100% { opacity: 0; transform: translate(var(--dx), 30px) rotateY(360deg); } }`}</style>
      <div style={{ ...frame, width: '100%', maxWidth: 340, textAlign: 'center', fontSize: 16, overflow: 'visible' }} onClick={(e) => e.stopPropagation()}>
        <Ribbon text={SOURCE_TITLE[alert.source]} />
        <div style={{ fontWeight: 700, fontSize: 17, marginTop: 6, marginBottom: 2 }}>{alert.title}</div>
        {/* 보물 상자 */}
        <Chest phase={phase} />
        {/* 아이템: 상자에서 위로 튀어나와 자리로 내려앉는다 */}
        <div data-testid="reward-items" style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 44, marginTop: 4 }}>
          {alert.items.slice(0, phase === 'open' ? shown : 0).map((r, i) => (
            <div key={i} data-testid="reward-item" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, animation: 'reward-pop 0.45s cubic-bezier(.3,1.4,.5,1)', textAlign: 'left' }}>
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

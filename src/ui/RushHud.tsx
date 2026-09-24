/**
 * 러시 타임 HUD (rush-battle §2). **새 화면이 아니다** — 같은 맵 위에 세 조각만 얹는다.
 *   상단 띠(48px): 남은 시간 바 · 점수 · 콤보 · 일시정지(44px)
 *   왼쪽 세로 줄(58px): 문 앞에 선 손님 얼굴 최대 6명 + 「+n」, 각자 인내 게이지
 *   하단 카드(88px): 직원 스킬 3~6장 — 초상·스킬 이름·쿨다운 원형 게이지
 * 맵을 가리는 넓이는 화면의 4분의 1이 안 된다 (§2: 조작 중에도 맵이 70% 넘게 보인다).
 * 탭 대상은 모두 44px 이상, 스킬 카드는 한 손이 닿는 하단에 둔다 (§6 접근성).
 */
import { useEffect, useRef, useState } from 'react';
import { getState, setUserSpeed, showMessage, useGame, userSpeed } from './store';
import { guestFace } from '../sim/index.ts';
import { guestTypeDef } from '../data/index.ts';
import { guestParts } from '../render/character';
import { Portrait } from './GuestPopup';
import { Icon } from './Icon';
import { BattleBar } from './BattleBar';
import { battleHud } from '../sim/index.ts';
import { PALETTE } from './frame';
import { SHELL_TOP, SHELL_BOTTOM } from './Shell';
import { sfx } from './audio';
import {
  RUSH_LEN_MS, fireSkill, noteRushSkill, roleIcon, rushOf, rushPaused, rushRunning, rushSkillCards,
  rushTick, rushTimeLeftMs, subscribeRush, useRushAutoPref, type RushQueueGuest,
} from './rushBridge';

/** 상단 띠 높이 */
export const RUSH_TOP_H = 48;
/** 대항전 비교 바 높이 (판이 있는 주에만 한 줄 더) */
export const RUSH_BATTLE_H = 30;
/** 왼쪽 줄 너비 */
export const RUSH_QUEUE_W = 58;
/** 하단 스킬 카드 줄 높이 */
export const RUSH_CARDS_H = 88;
/** 줄에 얼굴로 보여 주는 손님 수 (나머지는 「+n」) */
export const RUSH_QUEUE_SHOWN = 6;

/** 임시 엔진이 바뀔 때마다 다시 그린다 (sim이 들어오면 store가 알아서 깨운다) */
function useRushVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => subscribeRush(() => setV((n) => n + 1)), []);
  return v;
}

/** 인내 게이지 색: 넉넉하면 초록, 반쯤이면 노랑, 얼마 안 남으면 빨강 */
function patienceColor(ratio: number): string {
  return ratio > 0.5 ? PALETTE.ok : ratio > 0.25 ? '#e0a24c' : PALETTE.bad;
}

function QueueFace({ g, first, onPick }: { g: RushQueueGuest; first: boolean; onPick: () => void }) {
  const def = guestTypeDef(g.type);
  const face = guestFace(g.type);
  const ratio = Math.max(0, Math.min(1, g.patienceLeft / Math.max(1, g.patience)));
  return (
    <button data-testid={first ? 'rush-queue-first' : 'rush-queue-face'} data-tut={first ? 'rush-queue-first' : undefined} onClick={onPick}
      aria-label={`${def.name}${first ? ' · 맨 앞' : ''} · 인내 ${Math.round(ratio * 100)}%`}
      style={{
        width: RUSH_QUEUE_W - 6, minHeight: 50, padding: 0, margin: 0, border: `3px solid ${first ? PALETTE.btnOn : PALETTE.wood}`,
        borderRadius: 8, background: PALETTE.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, overflow: 'hidden',
      }}>
      <Portrait parts={guestParts(face, def.tags, def.wants)} face={face} size={RUSH_QUEUE_W - 14} expr={ratio > 0.25 ? 'normal' : 'surprised'} />
      <span aria-hidden style={{ width: '100%', height: 6, background: PALETTE.paperDark, display: 'block' }}>
        <span data-testid="rush-patience" data-pct={Math.round(ratio * 100)} style={{ display: 'block', height: '100%', width: `${ratio * 100}%`, background: patienceColor(ratio), transition: 'width 0.2s linear' }} />
      </span>
    </button>
  );
}

/** 쿨다운 원형 게이지 (conic-gradient — 이미지 없이 한 겹) */
function Cooldown({ ratio }: { ratio: number }) {
  if (ratio <= 0) return null;
  return (
    <span aria-hidden data-testid="rush-cooldown" data-pct={Math.round(ratio * 100)}
      style={{ position: 'absolute', inset: 0, borderRadius: 6, background: `conic-gradient(rgba(0,0,0,0.55) ${ratio * 360}deg, transparent 0deg)` }} />
  );
}

export function RushHud() {
  const s = useGame();
  useRushVersion();
  const auto = useRushAutoPref();
  const last = useRef(performance.now());
  const running = rushRunning(s);
  const paused = rushPaused(s);
  // 러시는 sim tick이 굴린다. 이 rAF는 쿨다운 원·인내 게이지가 스텝 사이에도 부드럽게 줄어들게 다시 그리기만 한다.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    last.current = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(100, now - last.current);
      last.current = now;
      rushTick(rushPaused(getState()) ? 0 : dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const r = rushOf(s);
  if (!running || !r) return null;
  const leftMs = rushTimeLeftMs(s);
  const pct = Math.max(0, Math.min(100, (leftMs / RUSH_LEN_MS) * 100));
  const secs = Math.ceil(leftMs / 1000);
  const shown = r.queue.slice(0, RUSH_QUEUE_SHOWN);
  const rest = r.queue.length - shown.length;
  const staff = rushSkillCards(s);
  const battleOn = !!battleHud(s); // 대항전 날이면 비교 바 한 줄이 더 붙는다
  const pickFront = () => showMessage('초록 자리를 눌러 앉혀요');
  const press = (staffId: string, skillId?: string) => {
    const out = fireSkill(s, staffId, skillId);
    if (!out.ok) { sfx('error'); showMessage(out.reason ?? '지금은 못 써요'); return; }
    sfx('unlock');
    noteRushSkill();
    showMessage(out.seated > 0 ? `${out.seated}명을 한 번에 앉혔어요` : out.text);
  };
  return (
    <>
      {/* 상단 띠 */}
      <div data-testid="rush-top" style={{
        position: 'absolute', top: SHELL_TOP, left: 0, right: 0, height: RUSH_TOP_H, zIndex: 11,
        display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px', boxSizing: 'border-box',
        background: PALETTE.paper, borderBottom: `2px solid ${PALETTE.wood}`, color: PALETTE.ink, fontWeight: 700, fontSize: 14,
      }}>
        <span style={{ flex: 1, minWidth: 0, height: 12, background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, overflow: 'hidden' }}>
          <span data-testid="rush-time" data-pct={Math.round(pct)} style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct > 25 ? PALETTE.bar : PALETTE.bad, transition: 'width 0.2s linear' }} />
        </span>
        <span data-testid="rush-secs" style={{ flex: 'none', minWidth: 30, textAlign: 'right' }}>{secs}초</span>
        <span data-testid="rush-score" style={{ flex: 'none', color: PALETTE.title }}>{r.score}점</span>
        {r.combo >= 2 && <span data-testid="rush-combo" style={{ flex: 'none', color: PALETTE.btn, animation: 'rush-combo 0.5s ease-out' }}><Icon name="fire" size={14} />{r.combo}</span>}
        <button data-testid="rush-pause" aria-label={paused ? '계속하기' : '잠시 멈추기'} onClick={() => setUserSpeed(userSpeed() === 0 ? 1 : 0)}
          style={{ flex: 'none', width: 48, height: 44, padding: 0, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, background: PALETTE.btn, color: PALETTE.btnText, fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
          <Icon name={paused ? 'play' : 'speed_pause'} size={16} />
        </button>
      </div>

      {/* 동네 대항전이 붙은 날이면 상대와의 점수 비교 한 줄 (rush3) */}
      {battleOn && (
        <div data-testid="rush-battle" style={{ position: 'absolute', top: SHELL_TOP + RUSH_TOP_H, left: 0, right: 0, height: RUSH_BATTLE_H, zIndex: 11, padding: '0 6px', boxSizing: 'border-box' }}>
          <BattleBar />
        </div>
      )}

      {/* 왼쪽 세로 줄 */}
      <div data-testid="rush-queue" aria-label={`문 앞에 선 손님 ${r.queue.length}명`} style={{
        position: 'absolute', top: SHELL_TOP + RUSH_TOP_H + (battleOn ? RUSH_BATTLE_H : 0) + 6, left: 4, width: RUSH_QUEUE_W, zIndex: 11,
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', pointerEvents: 'auto',
      }}>
        {shown.map((g, i) => <QueueFace key={g.id} g={g} first={i === 0} onPick={pickFront} />)}
        {rest > 0 && (
          <span data-testid="rush-queue-rest" style={{ width: RUSH_QUEUE_W - 6, minHeight: 28, lineHeight: '28px', textAlign: 'center', background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: PALETTE.ink }}>+{rest}</span>
        )}
      </div>

      {/* 하단 스킬 카드 (한 손 영역) */}
      <div data-testid="rush-cards" role="toolbar" aria-label="직원 스킬" style={{
        position: 'absolute', left: 0, right: 0, bottom: `calc(${SHELL_BOTTOM}px + env(safe-area-inset-bottom))`, height: RUSH_CARDS_H, zIndex: 11,
        display: 'flex', gap: 5, padding: '4px 6px', boxSizing: 'border-box', overflowX: 'auto', background: '#f6e7c6dd', borderTop: `2px solid ${PALETTE.wood}`,
      }}>
        {staff.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: PALETTE.inkSoft }}>직원이 있으면 스킬을 쓸 수 있어요</div>
        )}
        {staff.map((c) => {
          const def = c.def;
          const cd = c.leftSec * 1000;
          const ratio = c.cooldownSec > 0 ? c.leftSec / c.cooldownSec : 0;
          return (
            <button key={`${c.staffId}-${def.id}`} data-testid={`rush-skill-${c.staffId}`} data-tut="rush-skill" onClick={() => press(c.staffId, def.id)} disabled={ratio > 0}
              aria-label={`${c.staffName}의 ${def.name}${ratio > 0 ? ` · ${c.leftSec}초 뒤` : ''}`} title={def.desc}
              style={{
                position: 'relative', flex: '1 0 88px', minWidth: 88, minHeight: 76, padding: '3px 4px', border: `3px solid ${PALETTE.wood}`, borderRadius: 8,
                background: ratio > 0 ? PALETTE.paperDark : PALETTE.btnOn, color: PALETTE.ink, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden',
              }}>
              <Icon name={roleIcon(def.role)} size={20} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{def.name}</span>
              <span style={{ fontSize: 11, color: PALETTE.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{c.staffName}</span>
              <Cooldown ratio={ratio} />
              {ratio > 0 && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff8e6', fontSize: 16 }}>{c.leftSec}</span>}
            </button>
          );
        })}
      </div>
      {auto && <div data-testid="rush-auto" style={{ position: 'absolute', top: SHELL_TOP + RUSH_TOP_H + (battleOn ? RUSH_BATTLE_H : 0) + 6, right: 6, zIndex: 11, background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '2px 6px', fontSize: 12, fontWeight: 700, color: PALETTE.inkSoft }}>자동 진행 중 · 점수는 절반</div>}
      <style>{'@keyframes rush-combo { 0% { transform: scale(1.6); } 100% { transform: scale(1); } }'}</style>
    </>
  );
}

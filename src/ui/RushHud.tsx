/**
 * 러시 타임 HUD (rush-battle §2). **새 화면이 아니다** — 같은 맵 위에 두 조각만 얹는다.
 *   상단 띠(48px): 남은 시간 바 · 점수 · 콤보 · 일시정지(44px)
 *   왼쪽 세로 줄(58px): 문 앞에 선 손님 얼굴 최대 6명 + 「+n」, 각자 인내 게이지
 * 맵을 가리는 넓이는 화면의 4분의 1이 안 된다 (§2: 조작 중에도 맵이 70% 넘게 보인다).
 * 탭 대상은 모두 44px 이상 (§6 접근성).
 * teardown §3: 직원 액티브 스킬 카드 줄과 동네 대항전 비교 바는 걷어냈다.
 */
import { useEffect, useRef, useState } from 'react';
import { getState, setUserSpeed, showMessage, useGame, userSpeed } from './store';
import { guestFace } from '../sim/index.ts';
import { guestTypeDef } from '../data/index.ts';
import { guestParts } from '../render/character';
import { Portrait } from './GuestPopup';
import { Icon } from './Icon';
import { PALETTE } from './frame';
import { SHELL_TOP } from './Shell';
import {
  RUSH_LEN_MS, rushOf, rushPaused, rushRunning,
  rushTick, rushTimeLeftMs, subscribeRush, useRushAutoPref, type RushQueueGuest,
} from './rushBridge';

/** 상단 띠 높이 */
export const RUSH_TOP_H = 48;
/** 왼쪽 줄 너비 */
export const RUSH_QUEUE_W = 58;
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
  const pickFront = () => showMessage('초록 자리를 눌러 앉혀요');
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

      {/* 왼쪽 세로 줄 */}
      <div data-testid="rush-queue" aria-label={`문 앞에 선 손님 ${r.queue.length}명`} style={{
        position: 'absolute', top: SHELL_TOP + RUSH_TOP_H + 6, left: 4, width: RUSH_QUEUE_W, zIndex: 11,
        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', pointerEvents: 'auto',
      }}>
        {shown.map((g, i) => <QueueFace key={g.id} g={g} first={i === 0} onPick={pickFront} />)}
        {rest > 0 && (
          <span data-testid="rush-queue-rest" style={{ width: RUSH_QUEUE_W - 6, minHeight: 28, lineHeight: '28px', textAlign: 'center', background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: PALETTE.ink }}>+{rest}</span>
        )}
      </div>

      {auto && <div data-testid="rush-auto" style={{ position: 'absolute', top: SHELL_TOP + RUSH_TOP_H + 6, right: 6, zIndex: 11, background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '2px 6px', fontSize: 12, fontWeight: 700, color: PALETTE.inkSoft }}>자동 진행 중 · 점수는 절반</div>}
      <style>{'@keyframes rush-combo { 0% { transform: scale(1.6); } 100% { transform: scale(1); } }'}</style>
    </>
  );
}

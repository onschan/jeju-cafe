/**
 * 러시 한 주의 연출 (rush-battle §2): **예고 → 카운트다운 → 러시 → 결과 카드 → 보상 상자**.
 *   금요일  — 「내일 점심, 손님이 몰린다」 + 준비 체크리스트(빈 자리·직원·재료)
 *   토요일 12시 — 3·2·1 카운트다운(그동안 게임은 멈춘다) 뒤 러시 시작
 *   끝나면   — 등급 도장 S/A/B/C · 받은 손님 · 놓친 손님 · 팁 · 최고 콤보 · 보상 + 「이래서 놓쳤어요」 한 줄
 *              → 탭하면 보상 상자(RewardPopup의 상자 연출을 그대로 쓴다)
 * 러시 진행은 rushBridge가 맡고, 여기서는 띄우고 닫는 일만 한다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getState, pauseGame, useGame } from './store';
import { assetUrl } from './assetUrl';
import { Chest, Ribbon } from './RewardPopup';
import { Icon } from './Icon';
import { sfx } from './audio';
import { brownBtn, brownBtnOn, frame, PALETTE } from './frame';
import { missLine, rushPrepItems } from './rushPrep';
import {
  GRADE_REWARD_TEXT, endRush, isNoticeDay, isRushTime, lastRushResult, queueSizeFor, rushOf, rushPar,
  rushTally, startRush, subscribeRush, weekKeyOf, type RushGrade,
} from './rushBridge';

/** 카운트다운 한 칸 (ms) */
export const COUNT_STEP_MS = 800;
/** 예고·카운트다운을 주마다 한 번만 (세션 동안 기억 — 저장에는 안 남긴다) */
const noticed = new Set<string>();
const started = new Set<string>();
/** 테스트·새 게임용 */
export function resetRushShow(): void { noticed.clear(); started.clear(); }

type Phase = 'none' | 'notice' | 'count' | 'result' | 'reward';

const GRADE_COLOR: Record<RushGrade, string> = { S: '#c9184a', A: '#c9743a', B: '#4c9a2a', C: '#7a5636' };

/** 등급 도장 — 비스듬히 찍힌 동그란 도장 */
function GradeStamp({ grade }: { grade: RushGrade }) {
  return (
    <div data-testid="rush-grade" data-grade={grade} aria-label={`등급 ${grade}`}
      style={{
        width: 84, height: 84, margin: '0 auto', borderRadius: 42, border: `5px solid ${GRADE_COLOR[grade]}`, color: GRADE_COLOR[grade],
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 700, transform: 'rotate(-12deg)',
        background: '#fffaf0', boxShadow: `0 0 0 3px #fffaf0 inset`,
      }}>{grade}</div>
  );
}

function Overlay({ children, onTap, testId }: { children: ReactNode; onTap?: () => void; testId: string }) {
  const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
  const node = (
    <div data-testid={testId} onClick={onTap}
      style={{ position: 'absolute', inset: 0, background: '#0009', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 44, padding: 16 }}>
      {children}
    </div>
  );
  return root ? createPortal(node, root) : node;
}

export function RushShow() {
  const s = useGame();
  const [phase, setPhase] = useState<Phase>('none');
  const [count, setCount] = useState(3);
  const key = weekKeyOf(s);
  // 창·연출이 떠 있는 동안은 게임을 멈춘다 (§2: 일시정지는 가능)
  useEffect(() => (phase === 'none' ? undefined : pauseGame('dialogue')), [phase]);
  // 금요일 예고 — 보상 상자·대화가 밀려 있으면 기다린다
  useEffect(() => {
    if (phase !== 'none' || !isNoticeDay(s) || noticed.has(key) || s.alerts.length > 0) return;
    noticed.add(key);
    setPhase('notice');
    sfx('month');
  }, [phase, key, s.alerts.length, s]);
  // 토요일 12시 카운트다운
  useEffect(() => {
    if (phase !== 'none' || !isRushTime(s) || started.has(key) || s.alerts.length > 0) return;
    started.add(key);
    setCount(3);
    setPhase('count');
  }, [phase, key, s.alerts.length, s]);
  // 카운트다운 3·2·1 → 시작
  const counting = phase === 'count';
  useEffect(() => {
    if (!counting) return;
    sfx('tap');
    if (count <= 0) { startRush(getState()); setPhase('none'); return; }
    const t = setTimeout(() => setCount((n) => n - 1), COUNT_STEP_MS);
    return () => clearTimeout(t);
  }, [counting, count]);
  // 러시가 끝나면 결과 카드
  const resultSeen = useRef<string | null>(null);
  useEffect(() => subscribeRush(() => {
    const st = getState();
    const r = rushOf(st);
    // 러시가 끝난 상태는 다음 주까지 남아 있다 — 세이브를 며칠 뒤에 열었을 때 지난주 결과가 다시 뜨지 않게
    // 「오늘이 러시 날이고 러시 시각이 지났을 때」만 결과 카드를 띄운다.
    if (r?.phase !== 'done' || !isRushTime(st)) return;
    const k = weekKeyOf(st);
    if (resultSeen.current === k) return;
    resultSeen.current = k;
    setPhase('result');
    sfx('fanfare');
  }), []);

  if (phase === 'none') return null;

  if (phase === 'notice') {
    const items = rushPrepItems(s);
    return (
      <Overlay testId="rush-notice">
        <div style={{ ...frame, width: '100%', maxWidth: 320 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <img className="px" src={assetUrl('assets/icons/portrait_halmang.png')} width={64} height={64} alt="할망" style={{ imageRendering: 'pixelated', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>
              <div>내일 점심, 손님이 몰린다.</div>
              <div>줄이 문 앞까지 설 거여.</div>
              <div style={{ color: PALETTE.title }}>오늘 안에 채워 두라.</div>
            </div>
          </div>
          <div data-testid="rush-check" style={{ marginTop: 8 }}>
            {items.map((it) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, fontSize: 14, fontWeight: 700, color: it.ok ? PALETTE.ok : PALETTE.bad }}>
                <Icon name={it.ok ? 'check' : 'warn'} size={14} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 4 }}>줄에 설 손님은 {queueSizeFor(s)}명쯤이에요</div>
          <button data-testid="rush-notice-ok" style={{ ...brownBtnOn, width: '100%', marginTop: 10, marginRight: 0 }} onClick={() => setPhase('none')}>알겠수다</button>
        </div>
      </Overlay>
    );
  }

  if (phase === 'count') {
    return (
      <Overlay testId="rush-count">
        <div style={{ textAlign: 'center', color: '#fff8e6' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>오늘 점심, 손님이 몰린다</div>
          <div data-testid="rush-count-n" data-n={count} style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>{count > 0 ? count : '!'}</div>
        </div>
      </Overlay>
    );
  }

  const r = lastRushResult();
  if (!r) return null;

  if (phase === 'reward') {
    const items = GRADE_REWARD_TEXT[r.grade].split(' · ');
    return (
      <Overlay testId="rush-reward" onTap={() => { endRush(); setPhase('none'); }}>
        <style>{`@keyframes reward-spark { 0% { opacity: 0; transform: scale(0.4); } 30% { opacity: 1; transform: scale(1.2); } 100% { opacity: 0; transform: scale(0.8) translateY(-10px); } }
@keyframes reward-coin { 0% { opacity: 1; transform: translate(0, 0) rotateY(0); } 50% { opacity: 1; transform: translate(calc(var(--dx) / 2), var(--h)) rotateY(180deg); } 100% { opacity: 0; transform: translate(var(--dx), 30px) rotateY(360deg); } }`}</style>
        <div style={{ ...frame, width: '100%', maxWidth: 320, textAlign: 'center', overflow: 'visible' }} onClick={(e) => e.stopPropagation()}>
          <Ribbon text={`${r.grade} 러시 보상`} />
          <Chest phase="open" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {items.map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'left' }}>
                <Icon name="ticket" size={20} /> {t}
              </div>
            ))}
          </div>
          <button data-testid="rush-reward-ok" style={{ ...brownBtn, marginTop: 10, minWidth: 120, marginRight: 0 }} onClick={() => { endRush(); setPhase('none'); }}>받기</button>
        </div>
      </Overlay>
    );
  }

  // 결과 카드
  const tally = rushTally();
  const par = rushPar();
  return (
    <Overlay testId="rush-result">
      <div style={{ ...frame, width: '100%', maxWidth: 320, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>점심 러시가 끝났어요</div>
        <GradeStamp grade={r.grade} />
        <div data-testid="rush-score-line" style={{ fontSize: 20, fontWeight: 700, marginTop: 6, color: PALETTE.title }}>{r.score}점{par > 0 && <span style={{ fontSize: 13, color: PALETTE.inkSoft }}> / 기준 {par}점</span>}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', marginTop: 8, fontSize: 15, textAlign: 'left' }}>
          <span style={{ color: PALETTE.inkSoft }}>받은 손님</span><b data-testid="rush-served">{r.served}명</b>
          <span style={{ color: PALETTE.inkSoft }}>놓친 손님</span><b data-testid="rush-left" style={{ color: r.left > 0 ? PALETTE.bad : PALETTE.ok }}>{r.left}명</b>
          <span style={{ color: PALETTE.inkSoft }}>팁</span><b>{r.tip}</b>
          <span style={{ color: PALETTE.inkSoft }}>최고 콤보</span><b>{Math.max(r.bestCombo, tally.bestCombo)}</b>
        </div>
        <div data-testid="rush-miss" style={{ marginTop: 8, padding: '8px', background: PALETTE.paperDark, border: `3px solid ${r.left > 0 ? PALETTE.bad : PALETTE.ok}`, borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'left', color: r.left > 0 ? PALETTE.bad : PALETTE.ok, lineHeight: 1.4 }}>
          <Icon name="bulb" size={15} /> {missLine(r)}
          {r.shortfall && <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 3 }}>다음 주엔 그 자리를 늘려 보세요</div>}
        </div>
        {r.auto && <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 4 }}>자동 진행이라 점수가 절반이에요</div>}
        <div style={{ fontSize: 14, marginTop: 6, color: PALETTE.title, fontWeight: 700 }}>{GRADE_REWARD_TEXT[r.grade]}</div>
        <button data-testid="rush-result-ok" style={{ ...brownBtnOn, width: '100%', marginTop: 10, marginRight: 0 }} onClick={() => { setPhase('reward'); sfx('unlock'); }}>보상 열기</button>
      </div>
    </Overlay>
  );
}

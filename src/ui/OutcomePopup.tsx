import { useEffect, useState } from 'react';
import type { Outcome } from '../sim/index.ts';
import { TASK_NAME, OUTCOME_NAME } from '../sim/index.ts';
import { useGame, dispatch } from './store';
import { frame, brownBtn, PALETTE } from './frame';
import { sfx } from './audio';
import { Portrait } from './windows/StaffWindow';
import { TitleRibbon } from './TitleBadge';

/** 대박/중박/쪽박 결과 팝업 (staff-luck). state.lastOutcome이 있으면 뜬다.
 *  직원 초상 + 확률 게이지(대박 금·성공 초록·쪽박 회색) 위를 바늘이 1.2초 동안 끝까지 갔다 돌아와 결과 칸에 멈춘다 (drumroll → fanfare/coin/error)
 *  → 「대박!!」(금·흔들림) / 「성공」 / 「쪽박…」(회색) 스탬프 + 효과 줄. 탭하면 연출을 건너뛴다. 닫으면 dismissOutcome. */

export const SPIN_MS = 1200;
const NEEDLE_EASE = 'cubic-bezier(.3,.7,.4,1)'; // 바늘: 오른쪽 끝까지 갔다 돌아와 결과 칸을 살짝 지나친 뒤 멈춘다 (outcome-sweep)
const STAMP: Record<Outcome, { text: string; color: string; bg: string; sfx: 'fanfare' | 'coin' | 'error' }> = {
  great: { text: '대박!!', color: '#7a4a00', bg: 'linear-gradient(180deg, #fff3b0, #ffd166)', sfx: 'fanfare' },
  success: { text: '성공', color: '#f4ffe9', bg: PALETTE.ok, sfx: 'coin' },
  fail: { text: '쪽박…', color: '#f3f3f3', bg: '#8a8a8a', sfx: 'error' },
};
const SEG_COLOR: Record<Outcome, string> = { great: '#ffd166', success: PALETTE.ok, fail: '#9a9a9a' };

/** 결과 칸 가운데(0~1)에 바늘이 멈춘다 — 확률 표와 같은 순서(대박 → 성공 → 쪽박) */
export function needleTarget(c: { great: number; success: number; fail: number }, outcome: Outcome): number {
  const start = outcome === 'great' ? 0 : outcome === 'success' ? c.great : c.great + c.success;
  const width = c[outcome];
  return Math.max(0.02, Math.min(0.98, start + width / 2));
}

export function OutcomePopup() {
  const s = useGame();
  const r = s.lastOutcome ?? null;
  const [phase, setPhase] = useState<'spin' | 'result'>('spin');
  useEffect(() => {
    if (!r) return;
    setPhase('spin');
    sfx('drumroll');
    const t1 = setTimeout(() => { setPhase('result'); sfx(STAMP[r.outcome].sfx); }, SPIN_MS);
    return () => clearTimeout(t1);
  }, [r]);
  if (!r) return null;
  const staff = r.staffId ? s.staff.find((st) => st.id === r.staffId) ?? null : null;
  const done = phase === 'result';
  const target = needleTarget(r.chances, r.outcome);
  const skip = () => { if (!done) { setPhase('result'); sfx(STAMP[r.outcome].sfx); } };
  const close = () => { if (!done) { skip(); return; } dispatch({ type: 'dismissOutcome' }); };
  const st = STAMP[r.outcome];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div data-testid="outcome-popup" data-phase={phase} data-outcome={r.outcome} onClick={close}
      style={{ position: 'absolute', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 52, padding: 16 }}>
      <style>{`@keyframes outcome-stamp { 0% { transform: scale(2.2) rotate(-12deg); opacity: 0; } 60% { transform: scale(0.95) rotate(-6deg); opacity: 1; } 100% { transform: scale(1) rotate(-6deg); opacity: 1; } }
@keyframes outcome-shake { 0%, 100% { transform: translate(0, 0); } 20% { transform: translate(-3px, 1px); } 40% { transform: translate(3px, -1px); } 60% { transform: translate(-2px, 0); } 80% { transform: translate(2px, 1px); } }
@keyframes outcome-sweep { 0% { left: 0%; } 30% { left: 100%; } 60% { left: 0%; } 80% { left: min(100%, calc(var(--target) + 12%)); } 100% { left: var(--target); } }`}</style>
      <div style={{ ...frame, width: '100%', maxWidth: 340, textAlign: 'center', fontSize: 16, animation: done && r.outcome === 'great' ? 'outcome-shake 0.5s ease-in-out 2' : undefined }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{TASK_NAME[r.task]} · {r.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 8 }}>
          {staff && <Portrait face={staff.face} role={staff.role} size={72} />}
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{staff ? staff.name : '우리 카페'}</div>
            {staff && <TitleRibbon titleId={staff.title} size="sm" />}
            <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>대박 {pct(r.chances.great)} · 성공 {pct(r.chances.success)} · 쪽박 {pct(r.chances.fail)}</div>
          </div>
        </div>
        {/* 확률 게이지 + 바늘 */}
        <div data-testid="outcome-gauge" style={{ position: 'relative', height: 26, margin: '14px 6px 6px', border: `2px solid ${PALETTE.wood}`, borderRadius: 6, overflow: 'visible', display: 'flex', background: PALETTE.paperDark }}>
          {(['great', 'success', 'fail'] as Outcome[]).map((k) => (
            <div key={k} style={{ width: `${r.chances[k] * 100}%`, background: SEG_COLOR[k], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: k === 'great' ? '#7a4a00' : '#fff', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {r.chances[k] >= 0.12 ? OUTCOME_NAME[k] : ''}
            </div>
          ))}
          <div aria-hidden data-testid="outcome-needle" style={{ position: 'absolute', top: -12, left: `${target * 100}%`, ['--target' as string]: `${target * 100}%`, width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `12px solid ${PALETTE.bad}`, transform: 'translateX(-50%)', animation: done ? undefined : `outcome-sweep ${SPIN_MS}ms ${NEEDLE_EASE} forwards` }} />
        </div>
        {/* 스탬프 + 효과 줄 */}
        <div style={{ minHeight: 88, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {done ? (
            <>
              <div data-testid="outcome-stamp" style={{ display: 'inline-block', padding: '4px 18px', fontSize: r.outcome === 'great' ? 30 : 24, fontWeight: 900, color: st.color, background: st.bg, border: `3px solid ${r.outcome === 'great' ? '#b8860b' : r.outcome === 'fail' ? '#5a5a5a' : '#2f6a18'}`, borderRadius: 8, transform: 'rotate(-6deg)', animation: 'outcome-stamp 0.35s cubic-bezier(.2,1.4,.5,1)', letterSpacing: 2 }}>{st.text}</div>
              <div style={{ fontSize: 14, textAlign: 'left', width: '100%', padding: '0 8px' }}>
                {r.lines.map((l, i) => <div key={i} style={{ padding: '2px 0', borderTop: i > 0 ? `1px dashed ${PALETTE.woodLight}` : undefined }}>{l}</div>)}
              </div>
            </>
          ) : (
            <div style={{ color: PALETTE.inkSoft, fontSize: 14 }}>두근두근…</div>
          )}
        </div>
        <button style={{ ...brownBtn, marginTop: 6, minWidth: 120 }} onClick={close} aria-label={done ? '확인' : '건너뛰기'}>{done ? '확인' : '…'}</button>
      </div>
    </div>
  );
}

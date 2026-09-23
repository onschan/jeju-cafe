/** 대회 결과 연출 (video-patch §3.1.4). state.contest.pending이 있으면 뜬다.
 *  예선(2.5초) → 본선 심사 4항목이 하나씩(0.8초 × 4) → 결과표 → 정산식 → 시상대(1.5초) → 보상.
 *  자동 연출은 합쳐 **7.2초**, 어느 단계에서든 **탭 한 번이면 정산으로 건너뛴다**(카이로류의 대표 단점 = 못 건너뛰는 반복 연출).
 *  OutcomePopup 룰렛은 쓰지 않는다 — 대회는 무대 화면이다. */
import { useEffect, useState } from 'react';
import { useGame, dispatch } from './store';
import {
  contestTitle, CONTESTS, CONTEST_JUDGE_KEYS, CONTEST_JUDGE_LABEL, CONTEST_SCORE_MULT, PRIZE_MULT, TROPHY_TYPE, OUTCOME_NAME,
  type ContestResult, type ContestJudge,
} from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { frame, brownBtn, PALETTE } from './frame';
import { Icon } from './Icon';
import { sfx } from './audio';

/** 예선 게이지가 차는 시간 */
export const QUAL_MS = 2500;
/** 본선: 심사 항목 하나가 차는 시간 (×4) */
export const ITEM_MS = 800;
/** 시상대가 올라오는 시간 */
export const AWARD_MS = 1500;
/** 자동 연출 총 길이 */
export const SHOW_MS = QUAL_MS + ITEM_MS * CONTEST_JUDGE_KEYS.length + AWARD_MS; // 7,200ms

export type ShowPhase = 'qual' | 'final' | 'result' | 'score' | 'award' | 'reward';
const AUTO: ShowPhase[] = ['qual', 'final', 'result'];

const RANK_COLOR = ['#d4a13c', '#b9b9c4', '#c08457', PALETTE.inkSoft];
const small = { fontSize: 13, color: PALETTE.inkSoft } as const;

/** 심사 항목이 상대 평균보다 높으면 관중이 손을 든다 */
function cheers(r: ContestResult, k: ContestJudge): boolean {
  const avg = r.rivals.reduce((n, v) => n + v, 0) / Math.max(1, r.rivals.length);
  return r.scores[k] > avg;
}

function Row({ name, score, you, rank }: { name: string; score: number; you?: boolean; rank: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 4, background: you ? '#ffe8e8' : 'transparent', border: you ? `2px solid ${PALETTE.bad}` : '2px solid transparent' }}>
      <b style={{ width: 22, color: RANK_COLOR[rank - 1] ?? PALETTE.ink }}>{rank}</b>
      <span style={{ flex: 1, fontWeight: you ? 700 : 400 }}>{name}</span>
      {you && <span style={{ color: PALETTE.bad, fontWeight: 700, fontSize: 12 }}>우리 카페</span>}
      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{score}</b>
    </div>
  );
}

/** 4명 순위표 (내 줄 강조) */
function Board({ r, upto }: { r: ContestResult; upto?: number }) {
  const rows = [
    { name: r.staffName, score: upto === undefined ? r.myScore : upto, you: true },
    // 상대 이름은 동네 경쟁 카페 (rival.ts) — 접수 창에서 본 이름 그대로 나온다. 옛 세이브엔 이름이 없다.
    ...r.rivals.map((v, i) => ({ name: r.rivalNames?.[i] ?? `이웃 카페 ${i + 1}`, score: v, you: false })),
  ].sort((a, b) => b.score - a.score);
  return <div>{rows.map((x, i) => <Row key={i} name={x.name} score={x.score} you={x.you} rank={i + 1} />)}</div>;
}

export function ContestShow() {
  const s = useGame();
  const r = s.contest?.pending ?? null;
  const [phase, setPhase] = useState<ShowPhase>('qual');
  const [item, setItem] = useState(0);

  useEffect(() => {
    if (!r) return;
    setPhase('qual');
    setItem(0);
    sfx('drumroll');
    const ts: ReturnType<typeof setTimeout>[] = [];
    ts.push(setTimeout(() => setPhase('final'), QUAL_MS));
    for (let i = 1; i <= CONTEST_JUDGE_KEYS.length; i++) ts.push(setTimeout(() => setItem(i), QUAL_MS + ITEM_MS * i));
    ts.push(setTimeout(() => { setPhase('result'); sfx(r.rank === 1 ? 'fanfare' : 'unlock'); }, QUAL_MS + ITEM_MS * CONTEST_JUDGE_KEYS.length));
    return () => ts.forEach(clearTimeout);
  }, [r]);

  if (!r) return null;
  const def = CONTESTS.find((c) => c.id === r.event)!;
  const skipping = AUTO.includes(phase);
  /** 탭 한 번 — 연출 중이면 정산으로 건너뛴다 */
  const tap = () => {
    if (skipping) { setPhase('score'); setItem(CONTEST_JUDGE_KEYS.length); return; }
    if (phase === 'score') { setPhase('award'); sfx('fanfare'); setTimeout(() => setPhase('reward'), AWARD_MS); return; }
    if (phase === 'award') { setPhase('reward'); return; }
    dispatch({ type: 'dismissContest' });
  };
  const mult = CONTEST_SCORE_MULT[r.outcome];
  const prizeMult = PRIZE_MULT[r.rank - 1] ?? 0;

  return (
    <div data-testid="contest-show" data-phase={phase} onClick={tap}
      style={{ position: 'absolute', inset: 0, background: '#0009', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 53, padding: 12 }}>
      <div style={{ ...frame, width: '100%', maxWidth: 360, maxHeight: '92%', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {/* 무대 배너 */}
        <div style={{ background: PALETTE.title, color: PALETTE.titleText, fontWeight: 700, textAlign: 'center', padding: '5px 8px', margin: '-8px -8px 8px', borderRadius: '4px 4px 0 0', fontSize: 15 }}>
          {contestTitle(r.month, r.event)}
        </div>

        {phase === 'qual' && (
          <div data-testid="contest-qual">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>예선 — 네 팀 중 두 팀이 올라가요</div>
            <Board r={r} />
            <div style={{ ...small, marginTop: 6, textAlign: 'center' }}>두근두근…</div>
          </div>
        )}

        {(phase === 'final' || phase === 'score' || phase === 'result') && (
          <div data-testid="contest-final">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>본선 심사 — {r.staffName} 씨의 {r.menuName}</div>
            {CONTEST_JUDGE_KEYS.map((k, i) => {
              const on = phase !== 'final' || item > i;
              return (
                <div key={k} style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 14 }}>
                    <span style={{ width: 44 }}>{CONTEST_JUDGE_LABEL[k]}</span>
                    <b style={{ width: 34, textAlign: 'right' }}>{on ? r.scores[k] : ''}</b>
                    <span style={small}>비중 {Math.round(def.weights[k] * 100)}%</span>
                    {on && cheers(r, k) && <span style={{ color: '#b8860b', fontSize: 12, fontWeight: 700 }}><Icon name="party" size={12} /> 환호</span>}
                  </div>
                  <div style={{ height: 10, background: PALETTE.paperDark, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: on ? `${r.scores[k]}%` : '0%', background: PALETTE.bar, transition: `width ${ITEM_MS}ms ease-out` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {phase === 'result' && (
          <div data-testid="contest-result" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700 }}>결과</div>
            <Board r={r} />
            {r.best && <div style={{ color: PALETTE.bad, fontWeight: 700, textAlign: 'center' }}><Icon name="party" /> 신기록!</div>}
          </div>
        )}

        {phase === 'score' && (
          <div data-testid="contest-score" style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700 }}>정산</div>
            {CONTEST_JUDGE_KEYS.map((k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{CONTEST_JUDGE_LABEL[k]} {r.scores[k]} × 비중 {Math.round(def.weights[k] * 100)}%</span>
                <b>{Math.round(r.scores[k] * def.weights[k] * 10) / 10}</b>
              </div>
            ))}
            <div style={{ borderTop: `1px dashed ${PALETTE.woodLight}`, margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>합계</span><b>{r.base}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{OUTCOME_NAME[r.outcome]} — 점수 ×{mult}</span><b>{r.myScore}</b>
            </div>
            <div style={{ borderTop: `2px solid ${PALETTE.wood}`, margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
              <b>{r.rank}위</b><b>상금 참가비 ×{prizeMult} = {wonText(r.prize)}</b>
            </div>
            <Board r={r} />
          </div>
        )}

        {(phase === 'award' || phase === 'reward') && (
          <div data-testid="contest-award" style={{ marginTop: 8, textAlign: 'center' }}>
            <style>{'@keyframes contest-rise { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }'}</style>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6, height: 96 }}>
              {[2, 1, 3].map((n) => {
                const mine = n === r.rank;
                return (
                  <div key={n} style={{ width: 72, animation: `contest-rise ${AWARD_MS / 2}ms ease-out ${n === 1 ? 0 : 150}ms both` }}>
                    {mine && <div style={{ fontSize: 12, fontWeight: 700, color: PALETTE.bad }}>우리 카페</div>}
                    <div style={{ height: n === 1 ? 56 : n === 2 ? 40 : 28, background: mine ? PALETTE.btnOn : PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{n}</div>
                  </div>
                );
              })}
            </div>
            {phase === 'reward' && (
              <div data-testid="contest-reward" style={{ textAlign: 'left', marginTop: 8, fontSize: 14 }}>
                <b style={{ fontSize: 16 }}>{r.rank === 1 ? '우승!' : r.rank <= 3 ? '입상!' : '참가상'}</b>
                {r.prize > 0 && <div>상금 {wonText(r.prize)}</div>}
                {r.trophy === TROPHY_TYPE && <div>상패 1개 — 실내에 놓을 수 있어요</div>}
                <div>응모권 +{r.tickets}{r.rank >= 4 ? ' (참가상)' : ''}</div>
                {r.rank >= 4 && <div style={small}>“다음엔 꼭…” 하고 {r.staffName} 씨가 웃었어요</div>}
                {r.rank <= 3 && <div style={small}>간판에 배지가 붙고 손님이 늘어요</div>}
              </div>
            )}
          </div>
        )}

        <button style={{ ...brownBtn, width: '100%', marginRight: 0, marginTop: 8 }} onClick={(e) => { e.stopPropagation(); tap(); }} data-testid="contest-next">
          {phase === 'result' ? '정산 보기' : skipping ? '건너뛰기' : phase === 'score' ? '시상식' : phase === 'award' ? '…' : '확인'}
        </button>
      </div>
    </div>
  );
}

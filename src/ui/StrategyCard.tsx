/** ui3 전략 피드백: 「우리 카페 진단」 카드.
 *  장부 › 경영 현황 맨 위에 늘 최신 한 장. 3줄 평가 + 가장 큰 걸림돌 1개 + 다음 수 2개 + 노선 한 줄.
 *  탭하면 근거 수치가 펼쳐진다. 계산은 sim/coach.ts(diagnose)가 하고, 여기서는 배치 점수·추천 한 수만 넣어 준다. */
import { useState } from 'react';
import { useTutorialNote } from './tutorialDialogue';
import { useGame } from './store';
import { Icon } from './Icon';
import { diagnose, cachedMoves, unreachableObjects, type Diagnosis } from '../sim/index.ts';
import { layoutScore } from './layoutScore';
import { card, PALETTE } from './frame';

/** 지금 상태 진단 (배치 점수·solver 1위 수를 함께 넣는다) */
export function diagnosisOf(s: Parameters<typeof diagnose>[0]): Diagnosis {
  let topMove: string | null = null;
  try { topMove = cachedMoves(s, (m) => m.score > 0)[0]?.label ?? null; } catch { topMove = null; }
  let layout: number | null = null;
  try { layout = layoutScore(s).total; } catch { layout = null; }
  return diagnose(s, { layout, topMove });
}

const ROUTE_ICON: Record<string, string> = { tourist: 'tourist', regular: 'local', contest: 'medal', none: 'bulb' };

export function StrategyCard({ onFocus }: { onFocus?: (x: number, y: number) => void } = {}) {
  const s = useGame();
  const [open, setOpen] = useState(false);
  useTutorialNote('checkup'); // 5막: 진단을 열어 봤다
  const d = diagnosisOf(s);
  const blocked = unreachableObjects(s);
  const first = blocked[0];
  return (
    <div style={{ ...card, borderColor: PALETTE.wood }} data-testid="strategy-card" data-tut="strategy-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ fontSize: 16 }}><Icon name="report" size={16} /> 우리 카페 진단</b>
        <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>{d.dateText}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        {d.lines.map((l, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>· {l}</div>)}
      </div>

      {/* 걸림돌 칸이 이미 같은 말을 하면 줄을 겹치지 않고, 대신 그 자리로 가는 버튼만 남긴다 */}
      {first && (
        <button data-testid="strategy-unreachable" onClick={() => onFocus?.(first.x, first.y)}
          style={{ width: '100%', minHeight: 44, marginTop: 6, textAlign: 'left', background: PALETTE.paper, border: `2px solid ${PALETTE.bad}`, borderRadius: 6, color: PALETTE.bad, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '6px 8px' }}>
          <Icon name="close" size={14} /> 손님이 못 가는 시설 {blocked.length}개
          {onFocus && <span style={{ color: PALETTE.inkSoft, fontWeight: 400 }}> · 탭하면 그 자리로</span>}
        </button>
      )}

      <div data-testid="strategy-bottleneck" style={{ marginTop: 6, padding: '6px 8px', background: PALETTE.paperDark, borderRadius: 6, border: `2px solid ${PALETTE.woodLight}` }}>
        <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>가장 큰 걸림돌</div>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, color: d.bottleneck.key === 'none' ? PALETTE.ok : PALETTE.bad }}>{d.bottleneck.text}</div>
        <div data-testid="strategy-moves" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {d.moves.map((m, i) => (
            <span key={i} style={{ fontSize: 14, fontWeight: 700, background: PALETTE.paper, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '3px 8px' }}>{i === 0 ? '①' : '②'} {m}</span>
          ))}
        </div>
      </div>

      <div data-testid="strategy-route" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>
        <Icon name={ROUTE_ICON[d.route.id] ?? 'bulb'} size={14} /> {d.route.id === 'none' ? d.route.line : <><b>{d.route.name}</b> · {d.route.line}</>}
        <div style={{ color: PALETTE.inkSoft }}>이 노선이면 다음은 {d.route.next}</div>
      </div>

      <button data-testid="strategy-detail" aria-expanded={open} onClick={() => setOpen(!open)}
        style={{ width: '100%', minHeight: 44, marginTop: 6, background: 'transparent', border: `2px dashed ${PALETTE.woodLight}`, borderRadius: 6, color: PALETTE.inkSoft, fontFamily: 'inherit', fontSize: 14 }}>
        {open ? '▲ 근거 접기' : '▼ 무엇을 보고 이렇게 말하나'}
      </button>
      {open && (
        <div data-testid="strategy-evidence" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', marginTop: 6, fontSize: 14 }}>
          {d.evidence.map((e) => <span key={e.label} style={{ display: 'contents' }}><span style={{ color: PALETTE.inkSoft }}>{e.label}</span><b>{e.value}</b></span>)}
        </div>
      )}
    </div>
  );
}

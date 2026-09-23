/** 「카페 매력도」 패널 (fun 통합, 경영 현황 첫 화면): 지표 3개만 크게 — 인기(동네 손님 ← 시설·홍보) / 경관(관광객 ← 정원·코너·전망) / 서비스(만족·단골 ← 직원·주방·자리).
 *  각각 "올리는 법 2줄" + "지금 병목" 한 줄. 잔지표는 경영 현황의 「자세히」 접힘 안. */
import { useState, useEffect, type CSSProperties } from 'react';
import { useGame } from './store';
import { appealOf, seatUseRate, totalSeats, touristPctText, cachedMoves, josa, type AppealRow, type GameState } from '../sim/index.ts';
import { Icon } from './Icon';
import { Bar } from './Bars';
import { card, PALETTE } from './frame';
import { showFirstTip } from './firstTip';
import { layoutScore, noteLayoutScore, weakestPart, PART_ADVICE, SCORE_MAX } from './layoutScore'; // video-patch §3.2.3

const ICON: Record<AppealRow['key'], string> = { popularity: 'local', scenery: 'plant', service: 'staff' };
const WHO: Record<AppealRow['key'], string> = { popularity: '동네 손님이 온다', scenery: '관광객이 온다', service: '단골이 된다' };
const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft, lineHeight: 1.35 };

/** 배치 점수 1줄 (video-patch §3.2.3): `배치 점수 78 / 100 (지난달 71 ▲7)`. 탭하면 4성분 막대 + 가장 약한 성분 한 수.
 *  성장은 차이로 느껴진다 — 전월 대비 화살표가 이 줄의 핵심이다. */
function LayoutScoreLine({ s }: { s: GameState }) {
  const [open, setOpen] = useState(false);
  const score = layoutScore(s);
  const prev = noteLayoutScore(s, score.total);
  const diff = prev === null ? null : score.total - prev;
  const weak = weakestPart(score);
  // 가장 약한 성분을 메울 한 수: solver 1위 짓기 수가 있으면 그 이름, 없으면 성분별 이유 한 줄
  const move = cachedMoves(s, (m) => m.action.type === 'place' && m.score > 0)[0];
  return (
    <div data-testid="layout-score" style={{ marginBottom: 6 }}>
      <button aria-expanded={open} aria-label={`배치 점수 ${score.total}점`} onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', minHeight: 30, padding: '2px 6px', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, background: '#fffaf0', color: PALETTE.ink, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', boxSizing: 'border-box' }}>
        <Icon name="build" size={15} />
        <span style={{ flex: 'none' }}>배치 점수</span>
        <span data-testid="layout-score-total" style={{ flex: 1, fontSize: 18 }}>{score.total} <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>/ {SCORE_MAX}</span></span>
        {diff !== null && (
          <span data-testid="layout-score-diff" style={{ flex: 'none', fontSize: 13, color: diff > 0 ? PALETTE.ok : diff < 0 ? PALETTE.bad : PALETTE.inkSoft }}>
            지난달 {prev} {diff > 0 ? `▲${diff}` : diff < 0 ? `▼${-diff}` : '='}
          </span>
        )}
      </button>
      {open && (
        <div data-testid="layout-score-parts" style={{ marginTop: 4, fontSize: 13 }}>
          {score.parts.map((p) => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '20px' }}>
              <span style={{ flex: 'none', width: 62, color: PALETTE.inkSoft, whiteSpace: 'nowrap' }}>{p.label}</span>
              <Bar value={p.value} max={p.max} width={96} color={p === weak ? PALETTE.bad : PALETTE.ok} />
              <span style={{ flex: 'none' }}>{p.value}/{p.max}</span>
            </div>
          ))}
          <div style={{ marginTop: 2, color: PALETTE.title }}>
            <Icon name="bulb" size={13} /> {josa(weak.label, '이/가')} 제일 모자라요 · {move ? move.label : PART_ADVICE[weak.key]}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppealPanel() {
  const s = useGame();
  const a = appealOf(s, seatUseRate(s, totalSeats(s)));
  const [open, setOpen] = useState<AppealRow['key'] | null>(null);
  useEffect(() => { showFirstTip('appeal'); }, []);
  return (
    <div data-testid="appeal-panel" style={{ ...card, padding: 8 }}>
      <LayoutScoreLine s={s} />
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}><Icon name="sparkle" size={16} /> 카페 매력도</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {a.rows.map((r) => {
          const on = open === r.key;
          return (
            <button key={r.key} data-testid={`appeal-${r.key}`} aria-pressed={on} onClick={() => setOpen(on ? null : r.key)}
              style={{ background: on ? '#fff6dc' : '#fffaf0', border: `2px solid ${on ? PALETTE.btnOn : PALETTE.woodLight}`, borderRadius: 6, padding: '8px 4px', minHeight: 88, fontFamily: 'inherit', color: PALETTE.ink, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
              <Icon name={ICON[r.key]} size={22} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>{r.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{r.value}{r.unit}</div>
              <Bar value={Math.max(0, r.value)} max={r.max} width={56} color={r.bottleneck ? PALETTE.bad : PALETTE.ok} />
              <div style={{ ...small, fontSize: 12 }}>{WHO[r.key]}</div>
            </button>
          );
        })}
      </div>
      {a.rows.filter((r) => !open || r.key === open).map((r) => (r.bottleneck || open === r.key) && (
        <div key={r.key} data-testid={`appeal-detail-${r.key}`} style={{ marginTop: 6, fontSize: 14, lineHeight: 1.4 }}>
          {r.bottleneck && <div style={{ color: PALETTE.bad, fontWeight: 700 }}><Icon name="warn" size={14} /> {r.bottleneck}</div>}
          {open === r.key && (
            <div style={small}>
              <div><Icon name="bulb" size={13} /> {r.howTo[0]}</div>
              <div><Icon name="bulb" size={13} /> {r.howTo[1]}</div>
              {r.key === 'scenery' && <div>{touristPctText(a.scenery)} · 사진이 늘면 평판이 오른다</div>}
              {r.key === 'popularity' && <div>자리 이용률 {Math.round(a.seatUse * 100)}%</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

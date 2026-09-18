import { useGame } from './store';
import { topComplaints, COMPLAINT_LABEL, REP_LOW, REP_HIGH } from '../sim/index.ts';
import { card, PALETTE } from './frame';

/** 사람 창 → 손님 탭 상단: ♥ 평판 · 이번 달 불만 TOP3 · 최근 후기 (트랙 E reputation.ts) */
export function ComplaintsCard() {
  const s = useGame();
  const top = topComplaints(s);
  const rep = Math.round(s.reputation);
  const color = rep < REP_LOW ? PALETTE.bad : rep >= REP_HIGH ? PALETTE.ok : PALETTE.ink;
  return (
    <div style={card} data-testid="complaints-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <b>이번 달 불만 TOP3</b>
        <span style={{ color, fontWeight: 700 }} title="평판 0~100">♥ 평판 {rep}</span>
      </div>
      {top.length === 0
        ? <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>아직 불만이 없어요</div>
        : top.map((t) => <div key={t.reason} style={{ fontSize: 14, lineHeight: 1.5 }}>· {COMPLAINT_LABEL[t.reason]} <span style={{ color: PALETTE.inkSoft }}>{t.count}건</span></div>)}
      {s.reviews.length > 0 && (
        <div style={{ marginTop: 6, borderTop: `1px dashed ${PALETTE.woodLight}`, paddingTop: 4 }}>
          <b style={{ fontSize: 13 }}>후기</b>
          {s.reviews.map((r, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{'★'.repeat(r.score)}<span style={{ color: PALETTE.inkSoft }}>{'☆'.repeat(5 - r.score)}</span> {r.month}월 · {r.text}</div>)}
        </div>
      )}
    </div>
  );
}

/** 「카페 매력도」 패널 (fun 통합, 경영 현황 첫 화면): 지표 3개만 크게 — 인기(동네 손님 ← 시설·홍보) / 경관(관광객 ← 정원·명당·전망) / 서비스(만족·단골 ← 직원·주방·자리).
 *  각각 "올리는 법 2줄" + "지금 병목" 한 줄. 잔지표는 경영 현황의 「자세히」 접힘 안. */
import { useState, useEffect, type CSSProperties } from 'react';
import { useGame } from './store';
import { appealOf, seatUseRate, totalSeats, touristPctText, type AppealRow } from '../sim/index.ts';
import { Icon } from './Icon';
import { Bar } from './Bars';
import { card, PALETTE } from './frame';
import { showFirstTip } from './firstTip';

const ICON: Record<AppealRow['key'], string> = { popularity: 'local', scenery: 'plant', service: 'staff' };
const WHO: Record<AppealRow['key'], string> = { popularity: '동네 손님이 온다', scenery: '관광객이 온다', service: '단골이 된다' };
const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft, lineHeight: 1.35 };

export function AppealPanel() {
  const s = useGame();
  const a = appealOf(s, seatUseRate(s, totalSeats(s)));
  const [open, setOpen] = useState<AppealRow['key'] | null>(null);
  useEffect(() => { showFirstTip('appeal'); }, []);
  return (
    <div data-testid="appeal-panel" style={{ ...card, padding: 8 }}>
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

import { useState } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { namedGuestFace, metCount, regularCount, regionProgress, AFFINITY_MAX } from '../sim/index.ts';
import { REGIONS, NAMED_GUESTS, namedGuestsOf } from '../data/index.ts';
import { Portrait, namedPortraitParts } from './GuestPopup';
import { Bar } from './Bars';
import { brownBtn, brownBtnOn, PALETTE } from './frame';

/** 도감: 지역 손님 56 — 만나기 전엔 실루엣(???), 만나면 이름·직업·한 줄 소개·호감도·단골★ */
export function NamedGuestCodex() {
  const s = useGame();
  const [regionId, setRegionId] = useState<string>(REGIONS[0]!.id);
  const prog = regionProgress(s, regionId);
  return (
    <div data-testid="named-codex">
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '8px 0 4px' }}>
        지역 손님 도감 {metCount(s)}/{NAMED_GUESTS.length} · 단골★ {regularCount(s)} · 팝업에서 만나면 공개, 호감 100마다 보상
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 4 }}>
        {REGIONS.map((r) => {
          const p = regionProgress(s, r.id);
          return (
            <button key={r.id} style={{ ...(regionId === r.id ? brownBtnOn : brownBtn), padding: '0 8px', fontSize: 13 }} onClick={() => setRegionId(r.id)} data-testid={`codex-region-${r.id}`}>
              {r.name} {p.met}/{p.total}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: PALETTE.inkSoft, marginBottom: 4 }}>만난 손님 {prog.met}/{prog.total} · 단골★ {prog.regular}</div>
      {namedGuestsOf(regionId).map((g) => {
        const st = s.namedGuests[g.id];
        const met = st?.met ?? false;
        return (
          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 14, opacity: met ? 1 : 0.6 }} data-testid={`codex-${g.id}`}>
            <span style={{ filter: met ? 'none' : 'brightness(0) opacity(0.55)', display: 'inline-flex' }}>
              <Portrait parts={namedPortraitParts(g.id)} face={namedGuestFace(g)} size={48} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{met ? g.name : '???'}</b>{met && st?.regular && <span style={{ color: PALETTE.btnOn }}> ★</span>}
              <span style={{ fontSize: 12, color: PALETTE.inkSoft }}> {met ? g.job : '아직 못 만난 손님'}</span>
              <br />
              <span style={{ fontSize: 12, color: PALETTE.inkSoft, fontStyle: 'italic' }}>{met ? `“${g.line}” · 지갑 ${wonText(g.budget)}` : '팝업을 열어 만나 보세요'}</span>
            </span>
            {met && <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}><Bar value={st?.affinity ?? 0} max={AFFINITY_MAX} width={60} /> {st?.affinity ?? 0}</span>}
          </div>
        );
      })}
    </div>
  );
}

import { useEffect } from 'react';
import { Icon } from './Icon';
import { showFirstTipIfIdle } from './firstTip';
import { useGame } from './store';
import { pendingRequests, doneRequests, requestDef, requestHint, isRequestMet, guestFace, regularHearts } from '../sim/index.ts';
import { guestTypeDef } from '../data/index.ts';
import { Portrait, guestPortraitParts } from './GuestPopup';
import { Hearts } from './MiniCard';
import { card, PALETTE } from './frame';

/** 사람 › 손님 탭 상단 「손님 요청」 카드 (fun-guest §4): 손님층별로 바라는 것 한 줄 + 들어주기 힌트. 들어줬으면 ✓ — 다음에 그 손님이 오면 고마워한다. */
export function RequestsCard() {
  const s = useGame();
  const pending = pendingRequests(s);
  const done = doneRequests(s).slice(-3).reverse();
  const has = pending.length > 0;
  useEffect(() => { if (!has) return; const t = setTimeout(() => showFirstTipIfIdle('requests'), 0); return () => clearTimeout(t); }, [has]); // fun-start 첫 열기 팁 — 창 팁이 떠 있으면 다음에
  if (pending.length === 0 && done.length === 0) return null;
  return (
    <div data-testid="requests-card" style={{ ...card, padding: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
        <b><Icon name="quest" /> 손님 요청</b><span style={{ fontSize: 12, color: PALETTE.inkSoft }}>들어주면 단골 게이지가 차요</span>
      </div>
      {pending.map((r) => {
        const def = requestDef(r.id);
        const met = isRequestMet(s, def);
        const t = guestTypeDef(r.guestType);
        return (
          <div key={r.id} data-testid={`request-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 14, lineHeight: 1.4 }}>
            <Portrait parts={guestPortraitParts(r.guestType)} face={guestFace(r.guestType)} size={32} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{t.name} <Hearts n={regularHearts(s, r.guestType)} /></span><br />
              <b>“{def.text}”</b><br />
              <span style={{ fontSize: 13, color: met ? PALETTE.ok : PALETTE.inkSoft }}>{met ? '✓ 준비됐어요 — 다음에 오면 고마워해요' : <><Icon name="bulb" size={14} /> {requestHint(def)}</>}</span>
            </span>
          </div>
        );
      })}
      {done.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: PALETTE.inkSoft }}>
          들어줬어요: {done.map((r) => `${guestTypeDef(r.guestType).name} · ${requestDef(r.id).text}`).join(' / ')}
        </div>
      )}
    </div>
  );
}

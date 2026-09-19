import { useState } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame } from './store';
import { guestFace, unlockedTypeIds } from '../sim/index.ts';
import { guestTypeDef, GUEST_TYPES } from '../data/index.ts';
import { BoardPanel } from './BoardPanel';
import { RivalPanel } from './RivalPanel';
import { Portrait, guestPortraitParts, guestPortraitOf, guestWallet, guestName } from './GuestPopup';
import { Bar } from './Bars';
import { ComplaintsCard } from './ComplaintsCard';
import { card, brownBtn, brownBtnOn, PALETTE } from './frame';

type Sub = 'now' | 'quests' | 'codex' | 'rivals';
const SUBS: { id: Sub; label: string }[] = [{ id: 'now', label: '지금 온 손님' }, { id: 'quests', label: '부탁' }, { id: 'codex', label: '손님 도감' }, { id: 'rivals', label: '라이벌' }];
const MOOD_ICON: Record<string, string> = { happy: '😊', meh: '😐', angry: '😠' };

/** 손님 탭: 지금 온 손님(누르면 프로필) · 게시판 부탁 · 손님 도감 */
export function GuestsPanel({ onGuest }: { onGuest: (guestId: string) => void }) {
  const s = useGame();
  const [sub, setSub] = useState<Sub>('now');
  const offered = Object.values(s.board.quests).filter((q) => q.status === 'offered').length;
  const unlocked = new Set(unlockedTypeIds(s));
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 4 }}>
        {SUBS.map((t) => (
          <button key={t.id} style={{ ...(sub === t.id ? brownBtnOn : brownBtn), padding: '0 10px' }} onClick={() => setSub(t.id)}>
            {t.label}{t.id === 'quests' && offered > 0 ? ` (${offered})` : ''}{t.id === 'now' ? ` ${s.guests.length}` : ''}{t.id === 'rivals' && s.rivals.length > 0 ? ` (${s.rivals.length})` : ''}
          </button>
        ))}
      </div>
      {sub === 'now' && (
        <div>
          <ComplaintsCard />
          {s.guests.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>지금은 손님이 없어요. 맵에서 손님을 눌러도 프로필이 열려요.</div>}
          {s.guests.map((g) => {
            const def = guestTypeDef(g.type);
            const q = def.questId && s.board.quests[def.questId]?.status === 'offered';
            return (
              <button key={g.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: 14, color: PALETTE.ink }} onClick={() => onGuest(g.id)} aria-label={guestName(g)}>
                <Portrait {...guestPortraitOf(g)} size={32} />
                <span style={{ flex: 1 }}><b>{guestName(g)}</b>{g.namedId && <b style={{ color: PALETTE.btn }}> ★</b>}{q && <b style={{ color: PALETTE.bad }}> !</b>}<br /><span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{g.phase === 'seated' ? '자리에서' : g.phase === 'visiting' ? '구경 중' : g.phase === 'leaving' ? '집에 가는 중' : '오는 중'}{g.mood ? ` ${MOOD_ICON[g.mood]}` : ''}</span></span>
                <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>지갑 {wonText(guestWallet(s, g))}</span>
              </button>
            );
          })}
        </div>
      )}
      {sub === 'quests' && <BoardPanel tabs={['quests']} />}
      {sub === 'rivals' && <RivalPanel />}
      {sub === 'codex' && (
        <div>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>손님 도감 {unlocked.size}/{GUEST_TYPES.length} · 만족 30이면 부탁을 들고 와요</div>
          {GUEST_TYPES.map((t) => {
            const open = unlocked.has(t.id);
            const st = s.guestTypes[t.id];
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: open ? 1 : 0.5, marginBottom: 2, fontSize: 14 }}>
                {open ? <Portrait parts={guestPortraitParts(t.id)} face={guestFace(t.id)} size={24} /> : <span style={{ width: 24, textAlign: 'center' }}>?</span>}
                <span style={{ flex: 1 }}>{open ? t.name : '???'}</span>
                {open && <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}><Bar value={st?.satisfaction ?? 0} max={100} width={60} /> {st?.satisfaction ?? 0}{st?.regular === 'vip' ? ' VIP' : st?.regular === 'regular' ? ' 단골' : ''}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

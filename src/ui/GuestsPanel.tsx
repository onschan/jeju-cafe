import { useState } from 'react';
import { Icon } from './Icon';
import { wonText } from '../data/labels.ts';
import { useGame, dispatch } from './store';
import { guestFace, unlockedTypeIds, MAX_TARGETS, type GameState, type Guest } from '../sim/index.ts';
import { guestTypeDef, GUEST_TYPES } from '../data/index.ts';
import { BoardPanel } from './BoardPanel';
import { RivalPanel } from './RivalPanel';
import { Portrait, guestPortraitParts, guestPortraitOf, guestWallet, guestName } from './GuestPopup';
import { Bar } from './Bars';
import { ComplaintsCard } from './ComplaintsCard';
import { card, brownBtn, brownBtnOn, PALETTE } from './frame';

type Sub = 'now' | 'quests' | 'codex' | 'rivals';
const SUBS: { id: Sub; label: string }[] = [{ id: 'now', label: '지금 온 손님' }, { id: 'quests', label: '부탁' }, { id: 'codex', label: '손님 도감' }, { id: 'rivals', label: '라이벌' }];
const MOOD_ICON: Record<string, string> = { happy: 'mood_happy', meh: 'mood_meh', angry: 'mood_angry' };

/** 정렬 칩 (§5.4): 손님 [최근] [만족↓] [지갑↓]. 선택 1개, 세션 기억 */
export type GuestSort = 'recent' | 'satisfaction' | 'wallet';
const SORTS: { key: GuestSort; label: string; icon: string }[] = [{ key: 'recent', label: '최근', icon: 'clock' }, { key: 'satisfaction', label: '만족↓', icon: 'mood_happy' }, { key: 'wallet', label: '지갑↓', icon: 'money' }];
let rememberedSort: GuestSort = 'recent';

export function sortGuests(s: GameState, guests: Guest[], sort: GuestSort): Guest[] {
  const arr = [...guests];
  if (sort === 'satisfaction') arr.sort((a, b) => (s.guestTypes[b.type]?.satisfaction ?? 0) - (s.guestTypes[a.type]?.satisfaction ?? 0));
  else if (sort === 'wallet') arr.sort((a, b) => guestWallet(s, b) - guestWallet(s, a));
  else arr.reverse(); // 최근 온 순 (spawn 순서의 역)
  return arr;
}

/** 정렬 칩 줄 — 직원 목록도 같은 모양으로 쓴다 */
export function SortChips<K extends string>({ chips, active, onPick, testId }: { chips: { key: K; label: string; icon?: string }[]; active: K; onPick: (k: K) => void; testId?: string }) {
  return (
    <div role="radiogroup" aria-label="정렬" data-testid={testId} style={{ display: 'flex', gap: 4, marginBottom: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
      {chips.map((c) => (
        <button key={c.key} aria-pressed={c.key === active} onClick={() => onPick(c.key)}
          style={{ ...(c.key === active ? brownBtnOn : brownBtn), margin: 0, minHeight: 44, padding: '0 10px', fontSize: 14, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{c.icon && <Icon name={c.icon} />}{c.icon ? ' ' : ''}{c.label}</button>
      ))}
    </div>
  );
}

/** 타깃 손님층 3슬롯 (§5.4): 온 손님 카드를 탭하면 슬롯이 채워진다(같은 걸 탭하면 빠짐). 스폰 ×1.3 · 만족 +. */
function TargetSlots({ s }: { s: GameState }) {
  const [picking, setPicking] = useState(false);
  const unlocked = unlockedTypeIds(s).filter((id) => guestTypeDef(id).weight > 0);
  const toggle = (id: string) => {
    const next = s.targets.includes(id) ? s.targets.filter((t) => t !== id) : [...s.targets, id];
    dispatch({ type: 'setTargets', targets: next });
  };
  return (
    <div data-testid="target-slots" style={{ ...card, padding: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
        <b><Icon name="target" /> 타깃 손님층</b><span style={{ fontSize: 12, color: PALETTE.inkSoft }}>스폰 ×1.3 · 만족 +</span>
        <span style={{ flex: 1 }} />
        <button style={{ ...(picking ? brownBtnOn : brownBtn), margin: 0, minHeight: 36, padding: '0 10px', fontSize: 13 }} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>{picking ? '닫기' : '고르기'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
        {Array.from({ length: MAX_TARGETS }, (_, i) => {
          const id = s.targets[i];
          return (
            <button key={i} data-testid={`target-slot-${i}`} aria-label={id ? `타깃 ${guestTypeDef(id).name} 해제` : '빈 슬롯'} onClick={() => (id ? toggle(id) : setPicking(true))}
              style={{ ...(id ? brownBtnOn : brownBtn), margin: 0, minHeight: 48, padding: 4, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: id ? 1 : 0.7 }}>
              {id ? <><Portrait parts={guestPortraitParts(id)} face={guestFace(id)} size={24} />{guestTypeDef(id).name}</> : `+ 슬롯 ${i + 1}`}
            </button>
          );
        })}
      </div>
      {picking && (
        <div data-testid="target-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {unlocked.map((id) => {
            const on = s.targets.includes(id);
            const full = !on && s.targets.length >= MAX_TARGETS;
            return (
              <button key={id} aria-pressed={on} disabled={full} onClick={() => toggle(id)}
                style={{ ...(on ? brownBtnOn : brownBtn), margin: 0, minHeight: 40, padding: '0 8px', fontSize: 13, opacity: full ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Portrait parts={guestPortraitParts(id)} face={guestFace(id)} size={20} />{guestTypeDef(id).name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 손님 탭: 지금 온 손님(누르면 프로필) · 게시판 부탁 · 손님 도감 · 라이벌.
 *  sub를 주면 그 부분만 그린다(아이콘 그리드 창이 부분을 고른다, §5.1). 없으면 옛 소탭 버튼 줄. */
export function GuestsPanel({ onGuest, sub: fixed }: { onGuest: (guestId: string) => void; sub?: Sub }) {
  const s = useGame();
  const [subState, setSub] = useState<Sub>('now');
  const sub = fixed ?? subState;
  const [sort, setSortState] = useState<GuestSort>(rememberedSort);
  const setSort = (k: GuestSort) => { rememberedSort = k; setSortState(k); };
  const offered = Object.values(s.board.quests).filter((q) => q.status === 'offered').length;
  const unlocked = new Set(unlockedTypeIds(s));
  return (
    <div>
      {!fixed && (
        <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 4 }}>
          {SUBS.map((t) => (
            <button key={t.id} style={{ ...(sub === t.id ? brownBtnOn : brownBtn), padding: '0 10px' }} onClick={() => setSub(t.id)}>
              {t.label}{t.id === 'quests' && offered > 0 ? ` (${offered})` : ''}{t.id === 'now' ? ` ${s.guests.length}` : ''}{t.id === 'rivals' && s.rivals.length > 0 ? ` (${s.rivals.length})` : ''}
            </button>
          ))}
        </div>
      )}
      {sub === 'now' && (
        <div>
          <TargetSlots s={s} />
          <ComplaintsCard />
          <SortChips chips={SORTS} active={sort} onPick={setSort} testId="guest-sort" />
          {s.guests.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>지금은 손님이 없어요. 맵에서 손님을 눌러도 프로필이 열려요.</div>}
          {sortGuests(s, s.guests, sort).map((g) => {
            const def = guestTypeDef(g.type);
            const q = def.questId && s.board.quests[def.questId]?.status === 'offered';
            const target = s.targets.includes(g.type);
            return (
              <button key={g.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: 14, color: PALETTE.ink }} onClick={() => onGuest(g.id)} aria-label={guestName(g)}>
                <Portrait {...guestPortraitOf(g)} size={32} />
                <span style={{ flex: 1 }}><b>{guestName(g)}</b>{target && <span title="타깃"> <Icon name="target" size={14} /></span>}{g.namedId && <b style={{ color: PALETTE.btn }}> ★</b>}{q && <b style={{ color: PALETTE.bad }}> !</b>}<br /><span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{g.phase === 'seated' ? '자리에서' : g.phase === 'visiting' ? '구경 중' : g.phase === 'leaving' ? '집에 가는 중' : '오는 중'}{g.mood ? <> <Icon name={MOOD_ICON[g.mood] ?? 'mood_meh'} size={14} /></> : ''} · 만족 {s.guestTypes[g.type]?.satisfaction ?? 0}</span></span>
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

import { useState } from 'react';
import { useGame, dispatch } from './store';
import {
  questProgress, canAcceptQuest, visibleQuests, questRewardText, spotLevel, spotUnlocked, nextSpotLevel, spotAppeal, spotGuestBonus, canInvestSpot, guestFace, monthIndex,
  SPOT_MAX_LEVEL, SPOT_BUS_LEVEL, SPOT_GUEST_LEVEL, SPOT_QUEST_LEVEL, QUEST_MONTHS,
  type QuestState, type QuestCondition, type SpotCategory, type EventState, type UnlockCond,
} from '../sim/index.ts';
import { questDef, guestTypeDef, eventDef, spotDef, SPOTS, objectDef, menuDef, itemDef } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { Face, Bar } from './StaffPanel';
import { card, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, PALETTE, won } from './frame';
import { RegionPanel } from './RegionPanel';

export type BoardTab = 'quests' | 'events' | 'spots' | 'regions';
const TABS: { id: BoardTab; label: string }[] = [{ id: 'quests', label: '부탁' }, { id: 'events', label: '이벤트' }, { id: 'spots', label: '투자' }, { id: 'regions', label: '지역 지도' }];
const SPOT_TABS: { id: SpotCategory; label: string }[] = [{ id: 'sight', label: '볼거리' }, { id: 'food', label: '먹거리' }, { id: 'play', label: '놀거리' }, { id: 'nature', label: '자연' }];
const STATUS_TEXT: Record<QuestState['status'], string> = { offered: '새 부탁', active: '도전 중', done: '완료', failed: '기한 지남' };

function safeName<T>(f: () => T, fallback: string): string {
  try { return String(f()); } catch { return fallback; }
}
/** 조건 한 줄 ("아메리카노 20잔", "스냅사진관 1개 (아직 없는 시설)") */
function conditionText(c: QuestCondition): string {
  switch (c.type) {
    case 'menuSold': return `${safeName(() => menuDef(c.params.menuId).name, c.params.menuId)} ${c.params.count}잔 판매`;
    case 'objectPlaced': {
      let name: string;
      try { name = objectDef(c.params.objectId).name; } catch { name = `${c.params.objectId} (아직 없는 시설)`; }
      return `${name} ${c.params.count}개 배치`;
    }
    case 'spotLevel': return `${safeName(() => spotDef(c.params.spotId).name, c.params.spotId)} Lv${c.params.level}`;
    case 'segmentPopularity': return `${safeName(() => guestTypeDef(c.params.guestId).name, c.params.guestId)} 인기 ${c.params.popularity}`;
    case 'item': return `${safeName(() => itemDef(c.params.itemId).name, c.params.itemId)} ${c.params.count}개`;
    case 'none': return '바로 완료';
  }
}

function lockText(u: UnlockCond): string {
  if (u.type === 'rank') return `카페 랭크 ${u.rank} 필요`;
  if (u.type === 'spot') return `${safeName(() => spotDef(u.spotId).name, u.spotId)} Lv${u.level} 필요`;
  return '잠김';
}

function QuestCard({ q }: { q: QuestState }) {
  const s = useGame();
  const def = questDef(q.id);
  const guest = guestTypeDef(def.guestId);
  const p = questProgress(s, q.id);
  const ok = canAcceptQuest(s, q.id).ok;
  // 기한 달까지 남은 달 수 (수락 직후 2 = 카드의 '기한 2달', 기한 달엔 '이달까지')
  const left = q.deadlineMonthIndex !== null ? q.deadlineMonthIndex - monthIndex(s.clock) : null;
  return (
    <div style={{ ...card, opacity: q.status === 'done' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Face face={guestFace(def.guestId)} />
        <b style={{ flex: 1 }}>{guest.name}</b>
        <span style={{ fontSize: 12, color: q.status === 'active' ? PALETTE.ok : q.status === 'failed' ? PALETTE.bad : PALETTE.inkSoft }}>{STATUS_TEXT[q.status]}{q.status === 'active' && left !== null ? (left > 0 ? ` · ${left}달 남음` : ' · 이달까지') : ''}</span>
      </div>
      <div style={{ fontSize: 13, fontStyle: 'italic', color: PALETTE.inkSoft, margin: '4px 0' }}>“{guest.line}”</div>
      <div style={{ fontSize: 13 }}>{conditionText(def.condition)} → <b>{questRewardText(def)}</b>{def.unlockGuestId ? ` · ${safeName(() => guestTypeDef(def.unlockGuestId!).name, '')} 방문` : ''}</div>
      {q.status === 'active' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 13 }}>
          <Bar value={p.now} max={p.goal} width={120} color={PALETTE.ok} /> {Math.min(p.now, p.goal)}/{p.goal}
        </div>
      )}
      {q.status === 'offered' && (
        <button style={{ ...(ok ? brownBtn : brownBtnOff), marginTop: 6, marginBottom: 0 }} disabled={!ok} onClick={() => dispatch({ type: 'acceptQuest', id: q.id })}>
          도전하기 (기한 {QUEST_MONTHS}달)
        </button>
      )}
    </div>
  );
}

function EventCard({ ev }: { ev: EventState }) {
  const def = eventDef(ev.id);
  const pending = ev.status === 'pending';
  const status = ev.status === 'accepted' ? '수락' : ev.status === 'declined' ? '거절' : ev.status === 'applied' ? '일어남' : '답 기다림';
  return (
    <div style={{ ...card, opacity: pending ? 1 : 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <b style={{ flex: 1 }}>{def.name}</b>
        <span style={{ fontSize: 12, color: pending ? PALETTE.bad : PALETTE.inkSoft }}>{status}</span>
      </div>
      <div style={{ fontSize: 13, fontStyle: 'italic', color: PALETTE.inkSoft, margin: '4px 0' }}>“{def.line}”</div>
      <div style={{ fontSize: 13 }}>{def.effectText}</div>
      {pending && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button style={{ ...brownBtn, marginBottom: 0 }} onClick={() => dispatch({ type: 'respondEvent', id: ev.id, accept: true })}>수락</button>
          <button style={{ ...dangerBtn, marginBottom: 0 }} onClick={() => dispatch({ type: 'respondEvent', id: ev.id, accept: false })}>거절</button>
        </div>
      )}
    </div>
  );
}

function SpotCard({ id }: { id: string }) {
  const s = useGame();
  const def = spotDef(id);
  const lv = spotLevel(s, id);
  const next = nextSpotLevel(s, id);
  const unlocked = spotUnlocked(s, id);
  const ok = canInvestSpot(s, id).ok;
  const appeal = def.levels.find((l) => l.level === lv)?.appeal ?? 0;
  const guest = def.lv2GuestId ? safeName(() => guestTypeDef(def.lv2GuestId!).name, def.lv2GuestId) : null;
  const invest = () => {
    if (!next) return;
    Confirm(`${def.name} Lv${next.level}에 ${won(next.cost)}을 투자합니다. 매력도 ${appeal} → ${next.appeal}`, () => dispatch({ type: 'investSpot', id }), { title: '관광지 투자' });
  };
  return (
    <div style={{ ...card, opacity: unlocked ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>{def.name}</b>
        <span style={{ fontSize: 13 }}>{'★'.repeat(lv)}{'☆'.repeat(SPOT_MAX_LEVEL - lv)}</span>
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>
        Lv{lv} · 매력도 {appeal}
        {guest ? ` · Lv${SPOT_GUEST_LEVEL} ${guest}` : ''} · Lv{SPOT_BUS_LEVEL} 투어 버스 · Lv{SPOT_QUEST_LEVEL} 부탁{def.nextSpotId ? `·다음 관광지` : ''}
      </div>
      {!unlocked && <div style={{ fontSize: 12, color: PALETTE.bad }}>{lockText(def.unlock)}</div>}
      {next && (
        <button style={{ ...(ok ? brownBtn : brownBtnOff), marginTop: 6, marginBottom: 0 }} disabled={!ok} onClick={invest}>
          투자 Lv{next.level} <Icon name="money" /> {won(next.cost)}
        </button>
      )}
    </div>
  );
}

/** tabs로 보여 줄 소탭을 고른다 (손님 탭 = 부탁, 투자 탭 = 투자·이벤트). 하나뿐이면 소탭 줄을 숨긴다. */
export function BoardPanel({ tabs = ['quests', 'events', 'spots'] }: { tabs?: BoardTab[] }) {
  const s = useGame();
  const [tab, setTab] = useState<BoardTab>(tabs[0] ?? 'quests');
  const [cat, setCat] = useState<SpotCategory>('sight');
  const quests = visibleQuests(s);
  const events = [...s.board.events].reverse();
  const offered = quests.filter((q) => q.status === 'offered').length;
  const pending = events.filter((e) => e.status === 'pending').length;
  return (
    <div>
      {tabs.length > 1 && <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 4 }}>
        {TABS.filter((t) => tabs.includes(t.id)).map((t) => {
          const n = t.id === 'quests' ? offered : t.id === 'events' ? pending : t.id === 'regions' && s.popup.regionId ? 1 : 0;
          return (
            <button key={t.id} style={{ ...(tab === t.id ? brownBtnOn : brownBtn), padding: '0 10px' }} onClick={() => setTab(t.id)}>
              {t.label}{n > 0 ? ` (${n})` : ''}
            </button>
          );
        })}
      </div>}

      {tab === 'quests' && (
        <div>
          {quests.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>아직 부탁이 없어요. 손님 만족이 30에 닿으면 부탁을 들고 와요.</div>}
          {quests.map((q) => <QuestCard key={q.id} q={q} />)}
        </div>
      )}

      {tab === 'events' && (
        <div>
          {events.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>이번 달 이벤트가 없어요. 매월 1일에 소식이 와요.</div>}
          {events.map((ev, i) => <EventCard key={`${ev.id}-${ev.monthIndex}-${i}`} ev={ev} />)}
        </div>
      )}

      {tab === 'regions' && <RegionPanel />}

      {tab === 'spots' && (
        <div>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>매력도 합 {spotAppeal(s)} → 하루 손님 +{spotGuestBonus(s)} · 응모권 {s.tickets} · 마일리지 {s.mileage}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: 4 }}>
            {SPOT_TABS.map((t) => (
              <button key={t.id} style={{ ...(cat === t.id ? brownBtnOn : brownBtn), padding: '0 8px', fontSize: 13 }} onClick={() => setCat(t.id)}>{t.label}</button>
            ))}
          </div>
          {SPOTS.filter((d) => d.category === cat).sort((a, b) => a.order - b.order).map((d) => <SpotCard key={d.id} id={d.id} />)}
        </div>
      )}
    </div>
  );
}

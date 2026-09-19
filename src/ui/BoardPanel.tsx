import { useState } from 'react';
import { useGame, dispatch } from './store';
import { josa } from '../sim/josa.ts';
import {
  questProgress, canAcceptQuest, visibleQuests, questRewardText, spotLevel, spotUnlocked, nextSpotLevel, spotAppeal, spotGuestBonus, canInvestSpot, guestFace, monthIndex,
  spotRequirements, spotVisitors, totalSpotVisitors, dailyVisitors, totalDailyVisitors, tourScore, tourAvailable, canHostTour, hasTourBusKey, canSetTourBus,
  SPOT_MAX_LEVEL, SPOT_GUEST_LEVEL, SPOT_ITEM_LEVEL, SPOT_QUEST_LEVEL, SPOT_TAG_MULT, SPOT_FEE_PCT, SPOT_SCENERY, SPOT_LV5_MILEAGE, VISITOR_PRIZES, TOUR_BUS_FEE, TOUR_YEAR, TOUR_SUCCESS_SCORE, TOUR_MONEY_PER_SCORE, TOUR_SUCCESS_VISITORS, TOUR_FAIL_MONEY, TOUR_FAIL_VISITORS, QUEST_MONTHS,
  type QuestState, type QuestCondition, type SpotCategory, type EventState, type UnlockCond,
} from '../sim/index.ts';
import { questDef, guestTypeDef, eventDef, spotDef, SPOTS, objectDef, menuDef, itemDef } from '../data/index.ts';
import { label, wonText } from '../data/labels.ts';
import { Icon } from './Icon';
import { Confirm, Popup } from './Popup';
import { Face, Bar } from './Bars';
import { card, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, PALETTE } from './frame';
import { fmtNum } from '../sim/format.ts';
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

const TAG_LABEL: Record<string, string> = { female: '여성', group: '단체', youth: '청년', senior: '시니어' };

/** Lv별 효과 문구 (§3.4.2 누적): 태그 배수·요금·경관·해금 */
function levelEffectText(def: ReturnType<typeof spotDef>, lv: number): string {
  const parts: string[] = [`${TAG_LABEL[def.tag] ?? def.tag} 손님 ×${SPOT_TAG_MULT[lv]?.toFixed(2)}`];
  if (SPOT_FEE_PCT[lv]) parts.push(`${label('category', def.facilityCategory)} 시설 요금 +${SPOT_FEE_PCT[lv]}%`);
  if (SPOT_SCENERY[lv]) parts.push(`전 좌석 경관 +${SPOT_SCENERY[lv]}`);
  if (lv === SPOT_GUEST_LEVEL && def.lv2GuestId) parts.push(`${safeName(() => guestTypeDef(def.lv2GuestId!).name, '새 손님')} 방문`);
  if (lv === SPOT_ITEM_LEVEL && def.lv3ItemId) parts.push(`${safeName(() => itemDef(def.lv3ItemId!).name, '강화 아이템')} 1개`);
  if (lv === SPOT_QUEST_LEVEL) parts.push(`부탁${def.nextSpotId ? ` · ${safeName(() => spotDef(def.nextSpotId!).name, '다음 명소')} 개방` : ''}`);
  if (lv === SPOT_MAX_LEVEL) parts.push(`마일리지 ${SPOT_LV5_MILEAGE}${def.lv5Special ? ` · ${def.lv5Special.text}` : ''}`);
  return parts.join(' · ');
}

function SpotCard({ id }: { id: string }) {
  const s = useGame();
  const def = spotDef(id);
  const lv = spotLevel(s, id);
  const next = nextSpotLevel(s, id);
  const unlocked = spotUnlocked(s, id);
  const can = canInvestSpot(s, id);
  const reqs = spotRequirements(s, id);
  const appeal = def.levels.find((l) => l.level === lv)?.appeal ?? 0;
  const visitors = spotVisitors(s, id);
  const prize = VISITOR_PRIZES[s.spotPrizes[id] ?? 0];
  const tourOk = canHostTour(s, id);
  const score = tourScore(s, id);
  const invest = () => {
    if (!next) return;
    Confirm(`${def.name} Lv${next.level}에 ${josa(wonText(next.cost), '을/를')} 투자합니다. 매력도 ${appeal} → ${next.appeal}`, () => dispatch({ type: 'investSpot', id }), { title: '관광지 투자' });
  };
  const host = () => {
    Confirm(`${def.name}에서 투어를 열까요? 예상 점수 ${score} (${TOUR_SUCCESS_SCORE} 이상이면 성공: 점수×₩${fmtNum(TOUR_MONEY_PER_SCORE)} = ₩${fmtNum(Math.max(score, TOUR_SUCCESS_SCORE) * TOUR_MONEY_PER_SCORE)}${score < TOUR_SUCCESS_SCORE ? ' 이상' : ''} · 방문객 +${fmtNum(TOUR_SUCCESS_VISITORS)}, 아니면 ₩${fmtNum(TOUR_FAIL_MONEY)} · 방문객 +${fmtNum(TOUR_FAIL_VISITORS)})`, () => dispatch({ type: 'hostTour', spotId: id }), { title: '투어 개최' });
  };
  return (
    <div style={{ ...card, opacity: unlocked ? 1 : 0.55 }} data-testid={`spot-${id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>{def.name}</b>
        <span style={{ fontSize: 13 }}>{'★'.repeat(lv)}{'☆'.repeat(SPOT_MAX_LEVEL - lv)}</span>
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>
        Lv{lv} · 매력도 {appeal}{lv > 0 ? ` · 방문객 하루 ${fmtNum(dailyVisitors(s, id))}명 · 누적 ${fmtNum(visitors)}명` : ''}
        {lv > 0 && prize ? ` (다음 상품 ${fmtNum(prize.visitors)}명: ${prize.text})` : ''}
      </div>
      {lv > 0 && <div style={{ fontSize: 13 }}>지금 효과: {levelEffectText(def, lv)}</div>}
      {!unlocked && <div style={{ fontSize: 12, color: PALETTE.bad }}>{lockText(def.unlock)}</div>}
      {next && unlocked && (
        <div style={{ fontSize: 13, marginTop: 4 }}>
          <div>Lv{next.level} 효과: {levelEffectText(def, next.level)}</div>
          {reqs.length > 0 && (
            <div style={{ color: PALETTE.inkSoft }}>
              조건: {reqs.map((r, i) => <span key={i} style={{ color: r.met ? PALETTE.ok : PALETTE.bad, marginRight: 6 }}>{r.met ? '✓' : '✗'} {r.text}</span>)}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {next && (
          <button style={{ ...(can.ok ? brownBtn : brownBtnOff), marginTop: 6, marginBottom: 0 }} disabled={!can.ok} onClick={invest} aria-label={`${def.name} 투자`}>
            투자 Lv{next.level} <Icon name="money" /> {wonText(next.cost)}
          </button>
        )}
        {lv > 0 && s.clock.year >= TOUR_YEAR && (
          <button style={{ ...(tourOk.ok ? brownBtnOn : brownBtnOff), marginTop: 6, marginBottom: 0 }} disabled={!tourOk.ok} onClick={host} aria-label={`${def.name} 투어 개최`}>
            🚌 투어 개최 (점수 {score})
          </button>
        )}
      </div>
    </div>
  );
}

/** 투어 버스 계약 카드 (투어 버스 열쇠가 있을 때): 월 50만 원, 방문객 ×1.3 · 단체 손님 ×1.3 */
function TourBusCard() {
  const s = useGame();
  if (!hasTourBusKey(s) && !s.tourBus) return null;
  const on = s.tourBus;
  const can = canSetTourBus(s, !on);
  return (
    <div style={card} data-testid="tour-bus-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>🚌 투어 버스 계약</b>
        <span style={{ fontSize: 12, color: on ? PALETTE.ok : PALETTE.inkSoft }}>{on ? '계약 중' : '계약 없음'}{s.tourBusFreeMonths > 0 ? ` · 무료 ${s.tourBusFreeMonths}달` : ''}</span>
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>월 {wonText(TOUR_BUS_FEE)} · 전 명소 방문객 ×1.3 · 단체 손님 ×1.3 · Lv3 이상 명소의 손님이 일요일 11시 버스로 와요</div>
      <button style={{ ...(can.ok ? (on ? dangerBtn : brownBtn) : brownBtnOff), marginTop: 6, marginBottom: 0 }} disabled={!can.ok}
        onClick={() => Confirm(on ? '투어 버스 계약을 끝낼까요?' : `투어 버스를 계약할까요? 월 ${josa(wonText(TOUR_BUS_FEE), '이/가')} 들어요.`, () => dispatch({ type: 'setTourBus', on: !on }), { title: '투어 버스' })}>
        {on ? '계약 끝내기' : '계약하기'}
      </button>
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
          {events.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>이번 달 소식이 없어요. 매월 1일에 투자·행사 제안이 와요.</div>}
          {events.map((ev, i) => <EventCard key={`${ev.id}-${ev.monthIndex}-${i}`} ev={ev} />)}
        </div>
      )}

      {tab === 'regions' && <RegionPanel />}

      {tab === 'spots' && (
        <div>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>매력도 합 {spotAppeal(s)} · 방문객 하루 {fmtNum(totalDailyVisitors(s))}명(누적 {fmtNum(totalSpotVisitors(s))}) → 하루 손님 +{spotGuestBonus(s)} · 응모권 {s.tickets} · 마일리지 {s.mileage}{tourAvailable(s) ? ' · 이달 투어 개최 가능' : ''}</div>
          <TourBusCard />
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

/** 투어 개최 결과 팝업 (App에 한 번 둔다): lastTour가 생기면 보여 주고 dismissTour로 닫는다 */
export function TourPopup() {
  const s = useGame();
  const r = s.lastTour;
  if (!r) return null;
  const close = () => dispatch({ type: 'dismissTour' });
  const name = safeName(() => spotDef(r.spotId).name, '명소');
  return (
    <Popup title="투어 개최" onBackdrop={close} buttons={<button style={brownBtn} onClick={close} data-testid="tour-close">받기</button>}>
      <div data-testid="tour-result">
        <div style={{ fontSize: 18, fontWeight: 700 }}>{r.success ? `${name} 투어 대성공!` : `${name} 투어는 아쉬웠어요`}</div>
        <div>점수 {r.score} (성공 기준 {TOUR_SUCCESS_SCORE}) · <Icon name="money" /> {wonText(r.money)} · 방문객 +{fmtNum(r.visitors)}</div>
        <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 4 }}>점수 = 매력 + 30 × (그 명소 손님층 인기 ÷ 100) + 발견한 상성 수. 투어는 달마다 한 번 열 수 있어요.</div>
      </div>
    </Popup>
  );
}

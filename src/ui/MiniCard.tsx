import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGame, dispatch } from './store';
import { objectStats, sceneryScore, clearCost, canClearRock, hasPickaxe, cellAt, walletOf, guestFace, namedGuestFace, canAcceptQuest, parcelPrice, canBuyParcel, canGiveGift, giftFits, giftCount, giftedToday, PROTECTED_TYPES, ROTATABLE_TYPES, LOW_ENERGY, STAT_KEYS, STAT_NAME, staffInRole, canLevelUp, MAX_LEVEL, type GameState, type Guest, type RoleId, type StatKey } from '../sim/index.ts';
import { BUS_HOUR, isBusDay } from '../sim/spots.ts';
import { objectDef, guestTypeDef, namedGuestDef, questDef, roleDef, ROLES, GIFTS } from '../data/index.ts';
import { staffParts } from '../render/character';
import { Portrait, guestPortraitParts, namedPortraitParts, guestName } from './GuestPopup';
import { Bar, EnergyBar } from './StaffPanel';
import { Confirm, Popup } from './Popup';
import { Icon } from './Icon';
import { BOTTOM_BAR_H } from './Shell';
import { frame, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, PALETTE, won } from './frame';

/** 맵에서 탭한 대상. 스펙 §1.2 표. */
export type CardTarget =
  | { kind: 'guest'; id: string }
  | { kind: 'staff'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'rock'; x: number; y: number }
  | { kind: 'empty'; x: number; y: number }
  | { kind: 'parcel'; id: string }
  | { kind: 'busstop'; id: string }
  | { kind: 'counter'; id: string };

export interface CardActions {
  onGuestDetail: (guestId: string) => void;
  onQuest: (questId: string) => void;
  onStaffDetail: (staffId: string) => void;
  onObjectDetail: (objectId: string) => void;
  onMove: (objectId: string) => void;
  onBuild: (x: number, y: number) => void;
  onCafe: () => void;
}

const WANT_LABEL: Record<string, string> = { rest: '쉬는 자리', food: '먹거리', fun: '즐길거리', scenery: '경치', convenience: '편의 시설', farm: '농원' };
const PHASE_TEXT: Record<Guest['phase'], string> = { walking: '자리로 가는 중', seated: '앉아 있는 중', visiting: '구경하는 중', leaving: '집에 가는 중' };
const MOOD_TEXT: Record<string, string> = { happy: '기분 좋음', meh: '그저 그럼', angry: '화남' };
const KIND_ICON: Record<string, string> = { seat: 'look', field: 'plant', tree: 'harvest', wall: 'build', path: 'build', building: 'build', deco: 'look', busstop: 'calendar', gate: 'build', landmark: 'unlock', facility: 'look' };

/** 직원을 쉬게 했을 때 돌아갈 역할 (UI 전용 기억) */
const restingRole = new Map<string, RoleId>();

const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };
const btn: CSSProperties = { ...brownBtn, margin: 0, padding: '0 10px', fontSize: 15 };
const btnOn: CSSProperties = { ...brownBtnOn, margin: 0, padding: '0 10px', fontSize: 15 };
const btnOff: CSSProperties = { ...brownBtnOff, margin: 0, padding: '0 10px', fontSize: 15 };
const btnDanger: CSSProperties = { ...dangerBtn, margin: 0, padding: '0 10px', fontSize: 15 };

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{children}</div>;
}

function GuestCard({ s, id, a }: { s: GameState; id: string; a: CardActions }) {
  const [picking, setPicking] = useState(false);
  const g = s.guests.find((x) => x.id === id);
  if (!g) return <div style={small}>손님이 떠났어요</div>;
  const def = guestTypeDef(g.type);
  const nd = g.namedId ? namedGuestDef(g.namedId) : null;
  const st = s.guestTypes[def.id];
  const quest = def.questId && s.board.quests[def.questId]?.status === 'offered' ? def.questId : null;
  const state = g.mood ? `${MOOD_TEXT[g.mood] ?? ''}` : PHASE_TEXT[g.phase];
  const wants = def.wants.slice(0, 2).map((w) => WANT_LABEL[w] ?? w);
  const gifts = GIFTS.filter((x) => (s.inventory[x.id] ?? 0) > 0);
  const giftOk = gifts.length > 0 && !giftedToday(s) && g.phase !== 'leaving';
  return (
    <div data-testid="card-guest">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {nd ? <Portrait parts={namedPortraitParts(nd.id)} face={namedGuestFace(nd)} size={56} /> : <Portrait parts={guestPortraitParts(g.type)} face={guestFace(g.type)} size={56} />}
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.5 }}>
          <div><b>{guestName(g)}</b>{quest && <span style={{ color: PALETTE.bad, fontWeight: 700 }}> !</span>}</div>
          <div style={small}>예산 {def.wallet > 0 ? won(walletOf(s, g.type)) : '없음'} · {state}</div>
          <div style={{ whiteSpace: 'nowrap' }}>만족 <Bar value={st?.satisfaction ?? 0} max={100} width={80} /> {st?.satisfaction ?? 0}{st?.regular === 'vip' ? ' · VIP' : st?.regular === 'regular' ? ' · 단골' : ''}</div>
          {wants.length > 0 && <div style={small}>좋아하는 것: {wants.join(' · ')}</div>}
        </div>
      </div>
      <Row>
        <button style={btn} onClick={() => a.onGuestDetail(g.id)}>자세히</button>
        {quest && <button style={canAcceptQuest(s, quest).ok ? btnOn : btnOff} disabled={!canAcceptQuest(s, quest).ok} onClick={() => a.onQuest(quest)}>! 부탁 듣기</button>}
        {giftCount(s) > 0 && <button style={giftOk ? btn : btnOff} disabled={!giftOk} onClick={() => setPicking(true)} aria-label="선물하기">🎁 선물하기{giftedToday(s) ? ' (내일)' : ''}</button>}
      </Row>
      {picking && (
        <Popup title={`${guestName(g)}에게 선물`} onBackdrop={() => setPicking(false)} buttons={<button style={brownBtn} onClick={() => setPicking(false)}>닫기</button>}>
          {gifts.map((x) => {
            const can = canGiveGift(s, g.id, x.id);
            const fit = giftFits(x, g.type);
            return (
              <button key={x.id} style={{ ...(can.ok ? brownBtn : brownBtnOff), width: '100%', marginRight: 0, textAlign: 'left' }} disabled={!can.ok} data-testid={`gift-${x.id}`}
                onClick={() => { setPicking(false); dispatch({ type: 'giveGift', guestId: g.id, itemId: x.id }); }}>
                {x.name} ×{s.inventory[x.id]}{fit ? ' ★ 잘 맞아요 (×2)' : ''}
              </button>
            );
          })}
        </Popup>
      )}
      {quest && <div style={{ ...small, marginTop: 6 }}>부탁: {questDef(quest).description}</div>}
    </div>
  );
}

function StaffCard({ s, id, a }: { s: GameState; id: string; a: CardActions }) {
  const st = s.staff.find((x) => x.id === id);
  if (!st) return <div style={small}>직원이 없어요</div>;
  const resting = st.role === null;
  const canPromote = st.level < MAX_LEVEL && STAT_KEYS.some((k) => canLevelUp(s, st.id, k as StatKey).ok);
  const toggleRest = () => {
    if (!resting) { restingRole.set(st.id, st.role!); dispatch({ type: 'assign', staffId: st.id, role: null }); return; }
    const remembered = restingRole.get(st.id) ?? null;
    const free = (r: RoleId) => s.unlocked.roles.includes(r) && staffInRole(s, r).length < s.slots[r];
    const role = remembered && free(remembered) ? remembered : ROLES.map((r) => r.id as RoleId).find(free) ?? null;
    if (!role) { dispatch({ type: 'assign', staffId: st.id, role: null }); return; }
    dispatch({ type: 'assign', staffId: st.id, role });
  };
  return (
    <div data-testid="card-staff">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Portrait parts={staffParts(st.face, st.role, s.uniform ?? null)} face={st.face} size={56} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.5 }}>
          <div><b>{st.name}</b> <span style={small}>{st.role ? roleDef(st.role).name : '쉬는 중'} · Lv.{st.level}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', columnGap: 6, fontSize: 12, alignItems: 'center' }}>
            {STAT_KEYS.map((k) => <span key={k} style={{ display: 'contents' }}><span>{STAT_NAME[k as StatKey]}</span><Bar value={st.stats[k as StatKey]} max={100} width={56} /></span>)}
          </div>
          <div style={{ fontSize: 13 }}><EnergyBar energy={st.energy} />{st.energy < LOW_ENERGY && <span style={{ color: PALETTE.bad }}> 지침</span>} · 월급 {won(st.salary)}</div>
        </div>
      </div>
      <Row>
        <button style={canPromote ? btnOn : btnOff} disabled={!canPromote} onClick={() => a.onStaffDetail(st.id)}>승급</button>
        <button style={btn} onClick={toggleRest}>{resting ? '일 시키기' : '쉬게 하기'}</button>
        <button style={btn} onClick={() => a.onStaffDetail(st.id)}>자세히</button>
      </Row>
    </div>
  );
}

function ObjectCard({ s, id, a, onClose }: { s: GameState; id: string; a: CardActions; onClose: () => void }) {
  const o = s.objects[id];
  if (!o) return <div style={small}>없어진 시설이에요</div>;
  const d = objectDef(o.type);
  const st = objectStats(s, o.id);
  const protectedType = PROTECTED_TYPES.has(o.type);
  const remove = () => Confirm(`${d.name}${d.removeCost ? `을(를) ${won(d.removeCost)} 들여 치울까요?` : `을(를) 치우고 ${won(d.cost)}을 돌려받을까요?`}`, () => { dispatch({ type: 'remove', objectId: o.id }); onClose(); }, { title: '철거' });
  return (
    <div data-testid="card-object">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name={KIND_ICON[d.kind] ?? 'build'} size={18} /> <b>{d.name}</b>{o.build && <span style={{ color: PALETTE.title }}> · 짓는 중</span>}</div>
        <div style={small}>인기 <b style={{ color: PALETTE.ink }}>{st.popularity}</b> · 경관 <b style={{ color: PALETTE.ink }}>{st.scenery > 0 ? '+' : ''}{st.scenery}</b> · 요금 <b style={{ color: PALETTE.ink }}>{st.feePct}%</b>{st.upkeep > 0 && ` · 유지비 ${won(st.upkeep)}/달`}</div>
        <div style={small}>주변 시너지: {st.combos.length > 0 ? st.combos.map((c) => `${c.strength === 'down' ? '↓' : '↑'}${c.name}`).join(' · ') : '없음'}{st.sets.length > 0 && ` · 세트 ${st.sets.map((x) => x.name).join(', ')}`}</div>
      </div>
      <Row>
        {!protectedType && <button style={btn} onClick={() => a.onMove(o.id)}>이동</button>}
        {ROTATABLE_TYPES.has(o.type) && <button style={btn} onClick={() => dispatch({ type: 'rotate', objectId: o.id, rot: ((o.rot ?? 0) + 1) % 4 })}>회전</button>}
        {!protectedType && o.type !== 'bush_wild' && <button style={btnDanger} onClick={remove}>철거</button>}
        <button style={btn} onClick={() => a.onObjectDetail(o.id)}>자세히</button>
      </Row>
    </div>
  );
}

function RockCard({ s, x, y, onClose }: { s: GameState; x: number; y: number; onClose: () => void }) {
  const cost = clearCost(s, x, y);
  if (cost === null) return <div style={small}>바위가 아니에요</div>;
  const terrain = cellAt(s, x, y).terrain;
  const name = terrain === 'rock_big' ? '큰 바위' : terrain === 'rock' ? '바위' : '곶자왈 덤불';
  const can = canClearRock(s, x, y);
  const free = hasPickaxe(s);
  return (
    <div data-testid="card-rock">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>{name}</b> <span style={small}>({x},{y})</span></div>
        <div style={small}>치우기 비용 {free ? '곡괭이 1개' : won(cost)} · 기간 즉시{!can.ok && can.reason && ` · ${can.reason}`}</div>
      </div>
      <Row><button style={can.ok ? btnOn : btnOff} disabled={!can.ok} onClick={() => { if (dispatch({ type: 'clearRock', x, y }).ok) onClose(); }}><Icon name="remove" /> 치우기</button></Row>
    </div>
  );
}

function EmptyCard({ s, x, y, a }: { s: GameState; x: number; y: number; a: CardActions }) {
  return (
    <div data-testid="card-empty">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>빈 땅</b> <span style={small}>({x},{y}) · 경치 {sceneryScore(s, x, y)}</span></div>
        <div style={small}>여기에 무엇을 지을까?</div>
      </div>
      <Row><button style={btnOn} onClick={() => a.onBuild(x, y)}><Icon name="build" /> 짓기</button></Row>
    </div>
  );
}

function ParcelCard({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const p = s.parcels.find((x) => x.id === id);
  if (!p || p.owned) return <div style={small}>이미 우리 땅이에요</div>;
  const can = canBuyParcel(s, p.id);
  const price = parcelPrice(s, p);
  const buy = () => Confirm(`${p.name} 필지를 ${won(price)}에 살까요? 맵이 넓어져요.`, () => { if (dispatch({ type: 'buyParcel', id: p.id }).ok) onClose(); }, { title: '필지 구매' });
  return (
    <div data-testid="card-parcel">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>{p.name}</b> <span style={small}>{p.w}×{p.h}칸</span></div>
        <div style={small}>가격 {won(price)}{!can.ok && can.reason && ` · ${can.reason}`}</div>
      </div>
      <Row><button style={can.ok ? btnOn : btnOff} disabled={!can.ok} onClick={buy}><Icon name="money" /> 사기</button></Row>
    </div>
  );
}

function BusStopCard({ s, id }: { s: GameState; id: string }) {
  const o = s.objects[id];
  const name = o ? objectDef(o.type).name : '정류장';
  const nextBus = (() => {
    if (!s.tourBus) return '계약 없음 (투자 창)';
    const { day, hour } = s.clock;
    if (isBusDay(day) && hour < BUS_HOUR) return `오늘 ${BUS_HOUR}시`;
    for (let d = 1; d <= 7; d++) if (isBusDay(((day - 1 + d) % 30) + 1)) return d === 1 ? `내일 ${BUS_HOUR}시` : `${d}일 뒤 ${BUS_HOUR}시`;
    return '미정';
  })();
  return (
    <div data-testid="card-busstop">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name="calendar" size={18} /> <b>{name}</b></div>
        <div style={small}>이번 달 손님 {s.monthGuests}명 · 지금 {s.guests.length}명 · 다음 버스 {nextBus}</div>
      </div>
    </div>
  );
}

function CounterCard({ s, a }: { s: GameState; a: CardActions }) {
  const menus = s.menuSlots.filter((m) => m !== null).length;
  return (
    <div data-testid="card-counter">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name="menu" size={18} /> <b>{s.cafeName || '우리 카페'}</b> <span style={small}>본관 카운터</span></div>
        <div style={small}>메뉴 {menus}개 · 직원 {s.staff.length}명 · 이번 달 손님 {s.monthGuests}명 · 매출 {won(s.monthIncome)}</div>
      </div>
      <Row><button style={btnOn} onClick={a.onCafe}>카페 창</button></Row>
    </div>
  );
}

/** 화면 하단(하단 바 위)에 붙는 미니 카드. 높이 ≤ 30vh, 맵은 그대로 보인다. ✕ 또는 맵의 다른 곳을 탭하면 닫힌다. */
export function MiniCard({ target, actions, onClose }: { target: CardTarget; actions: CardActions; onClose: () => void }) {
  const s = useGame();
  let body: ReactNode;
  switch (target.kind) {
    case 'guest': body = <GuestCard s={s} id={target.id} a={actions} />; break;
    case 'staff': body = <StaffCard s={s} id={target.id} a={actions} />; break;
    case 'object': body = <ObjectCard s={s} id={target.id} a={actions} onClose={onClose} />; break;
    case 'rock': body = <RockCard s={s} x={target.x} y={target.y} onClose={onClose} />; break;
    case 'empty': body = <EmptyCard s={s} x={target.x} y={target.y} a={actions} />; break;
    case 'parcel': body = <ParcelCard s={s} id={target.id} onClose={onClose} />; break;
    case 'busstop': body = <BusStopCard s={s} id={target.id} />; break;
    case 'counter': body = <CounterCard s={s} a={actions} />; break;
  }
  return (
    <div data-testid="mini-card" data-kind={target.kind}
      style={{ ...frame, position: 'absolute', left: 6, right: 6, bottom: `calc(${BOTTOM_BAR_H + 6}px + env(safe-area-inset-bottom))`, maxHeight: '30vh', overflowY: 'auto', zIndex: 12, padding: '8px 10px', fontSize: 16 }}>
      <button aria-label="닫기" onClick={onClose} style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, border: 0, background: 'transparent', color: PALETTE.inkSoft, fontSize: 18, fontWeight: 700, fontFamily: 'inherit' }}>✕</button>
      <div style={{ paddingRight: 36 }}>{body}</div>
    </div>
  );
}

import { useState, type CSSProperties, type ReactNode } from 'react';
import { wonText } from '../data/labels.ts';
import { josa } from '../sim/josa.ts';
import { useGame, dispatch } from './store';
import { objectStats, siteOf, siteLineText, clearCost, canClearRock, hasPickaxe, cellAt, walletOf, guestFace, namedGuestFace, canAcceptQuest, parcelPrice, canBuyParcel, canGiveGift, giftFits, giftCount, giftedToday, PROTECTED_TYPES, ROTATABLE_TYPES, LOW_ENERGY, STAT_KEYS, STAT_NAME, staffInRole, canLevelUp, capOf, skillsOf, expNeeded, isUpgradable, canUpgrade, upgradeCost, upgradeConditionText, MAX_OBJECT_LEVEL, canRepair, repairCost, CLEAN_LOW, type GameState, type Guest, type RoleId, type StatKey } from '../sim/index.ts';
import { BUS_HOUR, isBusDay } from '../sim/spots.ts';
import { RouteCard } from './RouteCard';
import type { RouteId } from '../sim/index.ts';
import { mainSummary, canExpandMain, expandCost, nextMainLevel, canBuildSecondFloor, canStartMoveMain, canUndoMoveMain, canMoveThisMonth, moveDays, isRoomCut, isAnnex, roomSeats, roomSeatsUsed, isFireplaceOn, canToggleFireplace, canSetPianoTime, canAddBooks, hasNewBooks, canFeedAquarium, isAquariumHungry, canRestockKids, isKidsStocked, canSetBarEvening, isBarEvening, activeCombos, MAIN_EXPAND_DAYS, FLOOR2_COST, FLOOR2_DAYS, MOVE_COST, NEW_BOOKS_MILEAGE, KIDS_RESTOCK_COST, ANNEX_CUT_TEXT, DOOR_PATH_WARN, BGM_LABEL, LIGHT_LABEL, PIANO_LABEL } from '../sim/index.ts'; // y-indoor
import { ButtonGroup } from './ButtonGroup';
import { requestBuildTab } from './windows/BuildWindow';
import { label as labelOf } from '../data/labels.ts';
import { objectDef, guestTypeDef, namedGuestDef, questDef, roleDef, skillDef, trainingDef, ROLES, GIFTS } from '../data/index.ts';
import { staffParts } from '../render/character';
import { Portrait, guestPortraitParts, namedPortraitParts, guestName } from './GuestPopup';
import { Bar, EnergyBar } from './Bars';
import { Confirm, Popup } from './Popup';
import { Icon } from './Icon';
import { SiteLine } from './SiteLine';
import { SHELL_BOTTOM } from './Shell';
import { frame, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, brownInput, PALETTE } from './frame';

/** 맵에서 탭한 대상. 스펙 §1.2 표. */
export type CardTarget =
  | { kind: 'guest'; id: string }
  | { kind: 'staff'; id: string }
  | { kind: 'object'; id: string }
  | { kind: 'rock'; x: number; y: number }
  | { kind: 'empty'; x: number; y: number }
  | { kind: 'parcel'; id: string }
  | { kind: 'busstop'; id: string }
  | { kind: 'counter'; id: string }
  | { kind: 'route'; route: RouteId; id?: string }; // 트랙 H: 진입점·경로 시설 → RouteCard

export interface CardActions {
  onGuestDetail: (guestId: string) => void;
  onQuest: (questId: string) => void;
  onStaffDetail: (staffId: string) => void;
  onObjectDetail: (objectId: string) => void;
  onMove: (objectId: string) => void;
  onBuild: (x: number, y: number) => void;
  /** 같은 것 더 짓기 (§5.3): 그 시설 고스트로 바로 진입 */
  onBuildSame: (objectType: string, x: number, y: number) => void;
  onCafe: () => void;
  /** ◀ ▶ 같은 종류 순회 (§1.3): 카드 대상을 바꾼다 */
  onSelect: (target: CardTarget) => void;
}

/** 카드·창 표 접기 상태 (§5.4: 3줄까지만 펼치고 `▸ 자세히`, 세션 동안 기억) */
const detailOpen = new Map<string, boolean>();
export function Details({ id, children, lines = 3 }: { id: string; children: ReactNode[]; lines?: number }) {
  const [open, setOpen] = useState(detailOpen.get(id) ?? false);
  const items = children.filter((c) => c !== null && c !== false && c !== undefined);
  const more = items.length > lines;
  return (
    <>
      {(open || !more ? items : items.slice(0, lines)).map((c, i) => <div key={i}>{c}</div>)}
      {more && <button data-testid="details-toggle" aria-expanded={open} onClick={() => { detailOpen.set(id, !open); setOpen(!open); }}
        style={{ border: 0, background: 'transparent', color: PALETTE.title, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '4px 0', minHeight: 28 }}>{open ? '▾ 접기' : `▸ 자세히 (+${items.length - lines})`}</button>}
    </>
  );
}

/** 시설 이름 바꾸기 팝업 (§5.6, sim renameObject) */
function RenamePopup({ objectId, current, onClose }: { objectId: string; current: string; onClose: () => void }) {
  const [name, setName] = useState(current);
  const save = () => { dispatch({ type: 'renameObject', objectId, name }); onClose(); };
  return (
    <Popup title="이름 바꾸기" onBackdrop={onClose} buttons={<><button style={brownBtnOn} onClick={save}><Icon name="check" /> 저장</button><button style={brownBtn} onClick={onClose}>닫기</button></>}>
      <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} aria-label="시설 이름" placeholder="12자까지" autoFocus
        style={{ ...brownInput, width: '100%', boxSizing: 'border-box', marginRight: 0, marginBottom: 0 }} />
      <div style={{ ...small, marginTop: 4 }}>비우면 원래 이름으로 돌아가요</div>
    </Popup>
  );
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
          <div style={small}>예산 {def.wallet > 0 ? wonText(walletOf(s, g.type)) : '없음'} · {state}</div>
          <div style={{ whiteSpace: 'nowrap' }}>만족 <Bar value={st?.satisfaction ?? 0} max={100} width={80} /> {st?.satisfaction ?? 0}{st?.regular === 'vip' ? ' · VIP' : st?.regular === 'regular' ? ' · 단골' : ''}</div>
          {wants.length > 0 && <div style={small}>좋아하는 것: {wants.join(' · ')}</div>}
        </div>
      </div>
      <Row>
        <button style={btn} onClick={() => a.onGuestDetail(g.id)}>자세히</button>
        {quest && <button style={canAcceptQuest(s, quest).ok ? btnOn : btnOff} disabled={!canAcceptQuest(s, quest).ok} onClick={() => a.onQuest(quest)}>! 부탁 듣기</button>}
        {giftCount(s) > 0 && <button style={giftOk ? btn : btnOff} disabled={!giftOk} onClick={() => setPicking(true)} aria-label="선물하기"><Icon name="gift" /> 선물하기{giftedToday(s) ? ' (내일)' : ''}</button>}
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
  const canPromote = canLevelUp(s, st.id).ok;
  const away = st.training ? trainingDef(st.training.id) : null;
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
          <div><b>{st.name}</b> <span style={small}>{away ? `연수 중 (${away.name} ${st.training!.daysLeft}일)` : st.role ? roleDef(st.role).name : '쉬는 중'} · Lv.{st.level}/{st.maxLevel}</span></div>
          <div style={{ fontSize: 12, color: PALETTE.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>특기 {skillsOf(st).map((id) => skillDef(id).name).join(' · ')}{st.level < st.maxLevel ? ` · 경험치 ${Math.floor(st.exp)}/${expNeeded(st.level)}` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', columnGap: 6, fontSize: 12, alignItems: 'center' }}>
            {STAT_KEYS.map((k) => <span key={k} style={{ display: 'contents' }}><span>{STAT_NAME[k as StatKey]}</span><Bar value={st.stats[k as StatKey]} max={Math.max(100, capOf(s, st, k as StatKey))} width={56} /></span>)}
          </div>
          <div style={{ fontSize: 13 }}><EnergyBar energy={st.energy} />{st.energy < LOW_ENERGY && <span style={{ color: PALETTE.bad }}> 지침</span>} · 월급 {wonText(st.salary)}</div>
        </div>
      </div>
      <Row>
        <button style={canPromote ? btnOn : btnOff} disabled={!canPromote} onClick={() => a.onStaffDetail(st.id)}>승급</button>
        <button style={away ? btnOff : btn} disabled={!!away} onClick={toggleRest}>{resting ? '일 시키기' : '쉬게 하기'}</button>
        <button style={btn} onClick={() => a.onStaffDetail(st.id)}>자세히</button>
      </Row>
    </div>
  );
}

function ObjectCard({ s, id, a, onClose }: { s: GameState; id: string; a: CardActions; onClose: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const o = s.objects[id];
  if (!o) return <div style={small}>없어진 시설이에요</div>;
  const d = objectDef(o.type);
  // ◀ ▶ 같은 종류 순회 (§1.3)
  const sameKind = Object.values(s.objects).filter((x) => x.type === o.type);
  const idx = sameKind.findIndex((x) => x.id === o.id);
  const cycle = (dir: -1 | 1) => { const n = sameKind[(idx + dir + sameKind.length) % sameKind.length]; if (n) a.onSelect({ kind: 'object', id: n.id }); };
  const canBuildSame = s.unlocked.objects.includes(o.type) && !PROTECTED_TYPES.has(o.type) && o.type !== 'bush_wild';
  const st = objectStats(s, o.id);
  const protectedType = PROTECTED_TYPES.has(o.type);
  const remove = () => Confirm(`${josa(d.name, '을/를')}${d.removeCost ? ` ${wonText(d.removeCost)} 들여 치울까요?` : ` 치우고 ${josa(wonText(d.cost), '을/를')} 돌려받을까요?`}`, () => { dispatch({ type: 'remove', objectId: o.id }); onClose(); }, { title: '철거' });
  // 트랙 A: 증축 Lv·수리·청결
  const upgradable = isUpgradable(d) && st.level < MAX_OBJECT_LEVEL;
  const up = upgradable ? canUpgrade(s, o.id, st.popularity) : { ok: false, reason: '' };
  const upCost = upgradable ? upgradeCost(s, o) : 0;
  const doUpgrade = () => Confirm(`${josa(d.name, '을/를')} Lv${st.level + 1}로 증축할까요? ${wonText(upCost)}${(d.buildDays ?? 0) > 0 ? ` · 공사 ${d.buildDays}일(이용 불가)` : ''}`, () => { dispatch({ type: 'upgradeObject', objectId: o.id }); }, { title: '증축' });
  const rep = canRepair(s, o.id);
  const clean = Math.round(s.clean.value);
  return (
    <div data-testid="card-object">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name={KIND_ICON[d.kind] ?? 'build'} size={18} /> <b>{o.name ?? d.name}</b>{o.name && <span style={small}> ({d.name})</span>}{st.level >= 2 && <b style={{ color: PALETTE.title }}> Lv{st.level}</b>}{o.build && <span style={{ color: PALETTE.title }}> · 짓는 중</span>}{st.wear > 0 && <span style={{ color: PALETTE.bad }}> · 낡았어요 (인기 −{st.wear})</span>}</span>
          {sameKind.length > 1 && (
            <span data-testid="card-cycle" style={{ flex: 'none', display: 'inline-flex', gap: 2, alignItems: 'center', fontSize: 12, color: PALETTE.inkSoft }}>
              <button aria-label="이전 같은 시설" onClick={() => cycle(-1)} style={{ ...btn, minHeight: 36, minWidth: 36, padding: 0, fontSize: 14 }}>◀</button>
              {idx + 1}/{sameKind.length}
              <button aria-label="다음 같은 시설" onClick={() => cycle(1)} style={{ ...btn, minHeight: 36, minWidth: 36, padding: 0, fontSize: 14 }}>▶</button>
            </span>
          )}
        </div>
        <Details id={`object:${o.type}`}>
          <div style={small}>인기 <b style={{ color: PALETTE.ink }}>{st.popularity}</b> · 경관 <b style={{ color: PALETTE.ink }}>{st.scenery > 0 ? '+' : ''}{st.scenery}</b> · 요금 <b style={{ color: PALETTE.ink }}>{st.feePct}%</b>{st.upkeep > 0 && ` · 유지비 ${wonText(st.upkeep)}/달`}{(o.uses ?? 0) > 0 && ` · 이용 ${o.uses}회`}</div>
          <div style={small}>주변 시너지: {st.combos.length > 0 ? st.combos.map((c) => `${c.strength === 'down' ? '↓' : '↑'}${c.name}${c.count > 1 ? ` ×${c.count}` : ''}`).join(' · ') : '없음'}{st.sets.length > 0 && ` · 세트 ${st.sets.map((x) => x.name).join(', ')}`}{st.spot && ` · 명당 ${st.spot.name}`}</div>
          <SiteLine s={s} o={o} />
          {isAnnex(o) && <div style={small}>실내 {roomSeatsUsed(s, o)}/{roomSeats(s, o)}석{isRoomCut(s, o) && <span style={{ color: PALETTE.bad, fontWeight: 700 }} data-testid="annex-cut"> · {ANNEX_CUT_TEXT} — {DOOR_PATH_WARN}</span>}</div>}
          <div style={{ ...small, whiteSpace: 'nowrap' }} data-testid="clean-bar">카페 청결 <Bar value={clean} max={100} width={80} /> {clean}{clean < CLEAN_LOW && <span style={{ color: PALETTE.bad }}> 지저분해요</span>}</div>
        </Details>
      </div>
      <Row>
        <IndoorButtons s={s} o={o} />
        {upgradable && <button style={up.ok ? btnOn : btnOff} disabled={!up.ok} title={up.ok ? undefined : up.reason} onClick={doUpgrade} data-testid="upgrade-btn">증축 Lv{st.level + 1} ({wonText(upCost)})</button>}
        {st.wear > 0 && <button style={rep.ok ? btnOn : btnOff} disabled={!rep.ok} onClick={() => dispatch({ type: 'repairObject', objectId: o.id })} data-testid="repair-btn">수리 ({wonText(repairCost(s, o))})</button>}
        {!protectedType && <button style={btn} onClick={() => a.onMove(o.id)}>이동</button>}
        {ROTATABLE_TYPES.has(o.type) && <button style={btn} onClick={() => dispatch({ type: 'rotate', objectId: o.id, rot: ((o.rot ?? 0) + 1) % 4 })}>회전</button>}
        {!protectedType && o.type !== 'bush_wild' && <button style={btnDanger} onClick={remove}>철거</button>}
        {canBuildSame && <button style={btn} data-testid="build-same" onClick={() => a.onBuildSame(o.type, o.x + d.w, o.y)}><Icon name="plus" /> 같은 것 더</button>}
        <button style={btn} data-testid="rename-object" onClick={() => setRenaming(true)}><Icon name="pencil" /> 이름</button>
        <button style={btn} onClick={() => a.onObjectDetail(o.id)}>자세히</button>
      </Row>
      {upgradable && !up.ok && up.reason && <div style={{ ...small, marginTop: 4 }}>증축 조건: {upgradeConditionText(o, d)}</div>}
      {renaming && <RenamePopup objectId={o.id} current={o.name ?? ''} onClose={() => setRenaming(false)} />}
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
        <div style={small}>치우기 비용 {free ? '곡괭이 1개' : wonText(cost)} · 기간 즉시{!can.ok && can.reason && ` · ${can.reason}`}</div>
      </div>
      <Row><button style={can.ok ? btnOn : btnOff} disabled={!can.ok} onClick={() => { if (dispatch({ type: 'clearRock', x, y }).ok) onClose(); }}><Icon name="remove" /> 치우기</button></Row>
    </div>
  );
}

function EmptyCard({ s, x, y, a }: { s: GameState; x: number; y: number; a: CardActions }) {
  return (
    <div data-testid="card-empty">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>빈 땅</b> <span style={small}>({x},{y})</span></div>
        <div style={small}>{siteLineText(siteOf(s, x, y))}</div>
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
  const buy = () => Confirm(`${p.name} 필지를 ${wonText(price)}에 살까요? 맵이 넓어져요.`, () => { if (dispatch({ type: 'buyParcel', id: p.id }).ok) onClose(); }, { title: '필지 구매' });
  return (
    <div data-testid="card-parcel">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>{p.name}</b> <span style={small}>{p.w}×{p.h}칸</span></div>
        <div style={small}>가격 {wonText(price)}{!can.ok && can.reason && ` · ${can.reason}`}</div>
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
        <div style={small}>이번 달 손님 {s.monthGuests}명 · 지금 {s.guests.length}명{o?.type === 'gate' ? ' · 손님은 여기서 올렛길로 들어와요' : ` · 다음 버스 ${nextBus}`}</div>
      </div>
    </div>
  );
}

/** 본관 카드 (UX 참고 §4.2, y-indoor): 3줄(이름·Lv·실내 좌석 / 주방·재고 / 매출·직원·이용률) + 버튼 2줄(메뉴판·실내 꾸미기·카페 창 / 증축·2층·옮기기) + ▸ 자세히(재고·콤보·청결·난로/피아노/BGM/조명) */
const LOW_STOCK = 3;
/** ₩300만 식 짧은 돈 표기 (본관 카드 버튼) */
const manWon = (n: number) => (n % 10_000 === 0 ? `₩${(n / 10_000).toLocaleString()}만` : wonText(n));
const mbtn: CSSProperties = { ...btn, padding: '0 8px' };
const mbtnOn: CSSProperties = { ...btnOn, padding: '0 8px' };
const mbtnOff: CSSProperties = { ...btnOff, padding: '0 8px' };
export function MainCard({ s, id, a }: { s: GameState; id: string; a: CardActions }) {
  const [more, setMore] = useState(false);
  const o = s.objects[id];
  const m = mainSummary(s);
  const menus = s.menuSlots.filter((x) => x !== null).length;
  const cooking = s.guests.filter((g) => g.phase === 'seated' && g.mood === null && g.menuId).length;
  const waiting = s.guests.filter((g) => g.phase === 'walking').length + s.waiting.length;
  const low = Object.entries(s.storage).filter(([, n]) => n > 0 && n <= LOW_STOCK).slice(0, 2);
  const working = s.staff.filter((st) => st.role !== null && !st.training).length;
  const next = nextMainLevel(s);
  const exp = canExpandMain(s);
  const f2 = canBuildSecondFloor(s);
  const mv = canStartMoveMain(s);
  const undo = canUndoMoveMain(s);
  const workText = m.work ? `${m.work.kind === 'expand' ? `증축 Lv${m.work.toLevel}` : m.work.kind === 'floor2' ? '2층' : '이사'} 공사 중 · ${m.daysLeft}일` : null;
  const doExpand = () => Confirm(`본관을 Lv${next}로 증축할까요? ${manWon(expandCost(s))} · 공사 ${MAIN_EXPAND_DAYS}일(영업 정지)`, () => { dispatch({ type: 'expandMain' }); }, { title: '본관 증축' });
  const doFloor2 = () => Confirm(`2층을 올릴까요? ${manWon(FLOOR2_COST)} · 공사 ${FLOOR2_DAYS}일(영업 정지) · 실내 자리 +6`, () => { dispatch({ type: 'buildSecondFloor' }); }, { title: '2층 올리기' });
  const reason = m.work ? null : !exp.ok && next ? `증축: ${exp.reason}` : s.main.floor2 || !f2.ok && s.main.level >= 3 ? (!f2.ok && !s.main.floor2 ? `2층: ${f2.reason}` : null) : null;
  const combos = o ? activeCombos(s, o.id) : [];
  const stock = Object.entries(s.storage).filter(([, n]) => n > 0);
  const pianoOk = canSetPianoTime(s).ok;
  return (
    <div data-testid="card-main">
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name="home" /> <b>{s.cafeName || '우리 카페'} Lv{m.level}</b>{s.main.floor2 && ' · 2층'} · 실내 {m.seatsUsed}/{m.seats}석{workText && <span style={{ color: PALETTE.title }}> · {workText}</span>}</div>
        <div style={small}><Icon name="kitchen" size={14} /> 주문 대기 {waiting} · 조리 중 {cooking} · 메뉴 {menus}개{low.length > 0 && <span style={{ color: PALETTE.bad }}> · <Icon name="warn" size={14} /> {low.map(([k, n]) => `${labelOf('ingredient', k)} ${n}개 남음`).join(' · ')}</span>}</div>
        <div style={small}>{wonText(s.monthIncome)} · 직원 {working} · 이용률 {m.usePct === null ? '—' : `${m.usePct}%`}{m.short && <span style={{ color: PALETTE.bad }}> · 자리가 모자라요</span>}</div>
        {m.cut && <div style={{ color: PALETTE.bad, fontWeight: 700 }} data-testid="main-cut">{ANNEX_CUT_TEXT} — {DOOR_PATH_WARN}</div>}
      </div>
      <Row>
        <button style={mbtn} onClick={a.onCafe}><Icon name="coffee" /> 메뉴판</button>
        <button style={mbtn} onClick={() => { if (o) { requestBuildTab('indoor'); a.onBuild(o.x, o.y); } }} data-testid="main-indoor-btn"><Icon name="chair" /> 실내 꾸미기</button>
        <button style={mbtn} onClick={() => setMore(!more)} aria-expanded={more}>{more ? '▾ 접기' : '▸ 자세히'}</button>
      </Row>
      <Row>
        {next && <button style={exp.ok ? mbtnOn : mbtnOff} disabled={!exp.ok} title={exp.ok ? undefined : exp.reason} onClick={doExpand} data-testid="main-expand-btn"><Icon name="build" /> 증축 Lv{next} ({manWon(expandCost(s))}·{MAIN_EXPAND_DAYS}일)</button>}
        {!s.main.floor2 && <button style={f2.ok ? mbtnOn : mbtnOff} disabled={!f2.ok} title={f2.ok ? undefined : f2.reason} onClick={doFloor2} data-testid="main-floor2-btn"><Icon name="floor2" /> 2층</button>}
        {undo.ok
          ? <button style={mbtn} onClick={() => dispatch({ type: 'undoMoveMain' })} data-testid="main-undo-btn">↩ 되돌리기</button>
          : <button style={mv.ok ? mbtn : mbtnOff} disabled={!mv.ok} title={mv.ok ? undefined : mv.reason} onClick={() => o && a.onMove(o.id)} data-testid="main-move-btn"><Icon name="truck" /> 옮기기 ({manWon(MOVE_COST)}·{moveDays(s)}일)</button>}
      </Row>
      <div style={{ ...small, marginTop: 4 }}>이달 이동 {canMoveThisMonth(s) ? '가능 ○' : '끝 ×'}{reason && ` · ${reason}`}{!mv.ok && canMoveThisMonth(s) && !m.work && ` · 옮기기: ${mv.reason}`}</div>
      {more && (
        <div style={{ ...small, marginTop: 6, borderTop: `1px solid ${PALETTE.woodLight}`, paddingTop: 6 }} data-testid="main-detail">
          <div>재고: {stock.length > 0 ? stock.map(([k, n]) => `${labelOf('ingredient', k)} ${n}`).join(' · ') : '없음'}</div>
          <div>콤보: {combos.length > 0 ? combos.map((c) => `${c.strength === 'down' ? '↓' : '↑'}${c.name}`).join(' · ') : '없음'}</div>
          <div style={{ whiteSpace: 'nowrap' }}>청결 <Bar value={Math.round(s.clean.value)} max={100} width={80} /> {Math.round(s.clean.value)}</div>
          <div style={{ marginTop: 4 }}><Icon name="note" /> BGM</div>
          <ButtonGroup label="BGM" value={s.main.bgm ?? 'none'} onPick={(v) => dispatch({ type: 'setBgm', bgm: v === 'none' ? null : v })} testId="main-bgm"
            options={[{ value: 'none', label: '끔' }, { value: 'calm', label: BGM_LABEL.calm }, { value: 'jazz', label: BGM_LABEL.jazz }, { value: 'folk', label: BGM_LABEL.folk }]} />
          <div style={{ marginTop: 4 }}><Icon name="bulb" /> 저녁 조명</div>
          <ButtonGroup label="저녁 조명" value={s.main.lighting} onPick={(v) => dispatch({ type: 'setLighting', lighting: v })} testId="main-light"
            options={[{ value: 'warm', label: LIGHT_LABEL.warm }, { value: 'bright', label: LIGHT_LABEL.bright }]} />
          <div style={{ marginTop: 4 }}><Icon name="piano" /> 피아노 연주 시간{!pianoOk && ' (피아노 없음)'}</div>
          <ButtonGroup label="피아노 연주 시간" value={s.main.pianoTime} disabled={!pianoOk} onPick={(v) => dispatch({ type: 'setPianoTime', time: v })} testId="main-piano"
            options={[{ value: 'lunch', label: PIANO_LABEL.lunch }, { value: 'evening', label: PIANO_LABEL.evening }, { value: 'none', label: PIANO_LABEL.none }]} />
        </div>
      )}
    </div>
  );
}

/** 실내 요소 상호작용 버튼 (UX 참고 §4.3, y-indoor): 난로 켜기/끄기 · 책장 신간 · 수족관 먹이 · 키즈 장난감 · 바 저녁 세트 — 전부 버튼(셀렉트 없음) */
function IndoorButtons({ s, o }: { s: GameState; o: { id: string; type: string } }) {
  const obj = s.objects[o.id]!;
  switch (o.type) {
    case 'fireplace': {
      const on = isFireplaceOn(s, obj);
      const can = canToggleFireplace(s, o.id);
      return <button style={can.ok ? (on ? btnOn : btn) : btnOff} disabled={!can.ok} onClick={() => dispatch({ type: 'toggleFireplace', objectId: o.id })} data-testid="fireplace-btn"><Icon name="fire" /> {on ? '난로 끄기' : '난로 켜기'}</button>;
    }
    case 'bookshelf': {
      const can = canAddBooks(s, o.id);
      return <button style={can.ok ? btnOn : btnOff} disabled={!can.ok} title={can.ok ? undefined : can.reason} onClick={() => dispatch({ type: 'addBooks', objectId: o.id })} data-testid="books-btn"><Icon name="book" /> 신간 넣기 (마일리지 {NEW_BOOKS_MILEAGE}){hasNewBooks(s, obj) && ' · 신간 있음'}</button>;
    }
    case 'aquarium': {
      const can = canFeedAquarium(s, o.id);
      return <button style={can.ok ? btnOn : btnOff} disabled={!can.ok} title={can.ok ? undefined : can.reason} onClick={() => dispatch({ type: 'feedAquarium', objectId: o.id })} data-testid="feed-btn"><Icon name="fish" /> 먹이 주기{isAquariumHungry(s, obj) && ' · 배고파요'}</button>;
    }
    case 'kids_corner': {
      const can = canRestockKids(s, o.id);
      return <button style={can.ok ? btnOn : btnOff} disabled={!can.ok} title={can.ok ? undefined : can.reason} onClick={() => dispatch({ type: 'restockKids', objectId: o.id })} data-testid="kids-btn"><Icon name="toy" /> 장난감 보충 ({wonText(KIDS_RESTOCK_COST)}){isKidsStocked(s, obj) ? ' · 넉넉' : ' · 필요'}</button>;
    }
    case 'bar_counter': {
      const can = canSetBarEvening(s, o.id);
      const on = isBarEvening(obj);
      return <button style={can.ok ? (on ? btnOn : btn) : btnOff} disabled={!can.ok} onClick={() => dispatch({ type: 'setBarEvening', objectId: o.id, on: !on })} aria-pressed={on} data-testid="bar-btn"><Icon name="cocktail" /> 저녁 세트 {on ? 'ON' : 'OFF'}</button>;
    }
    default: return null;
  }
}

/** 화면 하단(하단 바 위)에 붙는 미니 카드. 높이 ≤ 30vh, 맵은 그대로 보인다. 닫기 아이콘 또는 맵의 다른 곳을 탭하면 닫힌다. */
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
    case 'counter': body = <MainCard s={s} id={target.id} a={actions} />; break; // y-indoor
    case 'route': body = <RouteCard s={s} route={target.route} objectId={target.id} />; break; // 트랙 H
  }
  return (
    <div data-testid="mini-card" data-kind={target.kind}
      style={{ ...frame, position: 'absolute', left: 6, right: 6, bottom: `calc(${SHELL_BOTTOM + 6}px + env(safe-area-inset-bottom))`, maxHeight: '30vh', overflowY: 'auto', zIndex: 12, padding: '8px 10px', fontSize: 16 }}>
      <button aria-label="닫기" onClick={onClose} style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, border: 0, background: 'transparent', color: PALETTE.inkSoft, fontSize: 18, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></button>
      <div style={{ paddingRight: 36 }}>{body}</div>
    </div>
  );
}

import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { wonText } from '../data/labels.ts';
import { josa } from '../sim/josa.ts';
import { useGame, dispatch, showMessage } from './store';
import { parcelFeature } from '../sim/index.ts'; // fun-rank: 필지 특징·"사면 생기는 것"
import { nightSeatLine, objectStats, siteOf, siteLineText, cellAt, walletOf, guestFace, namedGuestFace, canAcceptQuest, parcelPrice, canBuyParcel, canGiveGift, giftFits, giftCount, giftedToday, PROTECTED_TYPES, ROTATABLE_TYPES, LOW_ENERGY, STAT_KEYS, STAT_NAME, staffInRole, canLevelUp, capOf, skillsOf, expNeeded, isUpgradable, canUpgrade, upgradeCost, upgradeConditionText, MAX_OBJECT_LEVEL, canRepair, repairCost, CLEAN_LOW, type GameState, type Guest, type PlacedObject, type RoleId, type StatKey } from '../sim/index.ts';
import { guestBlock, vacateWarning, WORK_NAME } from '../sim/index.ts'; // seatfix: 손님이 앉은 시설 예약·「지금 바로」
import { RouteCard } from './RouteCard';
import { TreeUpgradeRow } from './TreeUpgrade'; // fun: 같은 자리 업그레이드 트리
import { treeOf } from '../sim/index.ts';
import { cornerSeatLine, cornerAnchorLine, cornerBreakWarning } from '../sim/corners.ts'; // spot2: 명당 효과·경고를 카드에서 보이게
import { seatFeeQuote, FEE_MULT_CAP } from '../sim/fee.ts'; // spot2: 요금 내역 (기본 → 자리·명당·거리 → 실제로 받는 값)
import { isCornerTarget } from '../sim/corners.ts';
import { objectReachable, UNREACHABLE_TEXT } from '../sim/index.ts'; // ui3: 손님이 못 가는 시설
import { seatsNeeded, isSeat } from '../sim/index.ts'; // midgame: 「자리 4/6」 — 지금 손님에 필요한 자리
import type { RouteId } from '../sim/index.ts';
import { mainSummary, canAutoConnectPath, canExpandMain, expandCost, nextMainLevel, canBuildSecondFloor, canStartMoveMain, canUndoMoveMain, canMoveThisMonth, moveDays, isRoomCut, isAnnex, roomSeats, roomSeatsUsed, MAIN_EXPAND_DAYS, FLOOR2_COST, FLOOR2_DAYS, MOVE_COST, ANNEX_CUT_TEXT, DOOR_PATH_WARN, BGM_LABEL, LIGHT_LABEL } from '../sim/index.ts'; // y-indoor
import { ButtonGroup } from './ButtonGroup';
import { requestBuildTab } from './windows/BuildWindow';
import { label as labelOf } from '../data/labels.ts';
import { objectDef, guestTypeDef, namedGuestDef, questDef, roleDef, skillDef, trainingDef, ROLES, GIFTS } from '../data/index.ts';
import { staffParts } from '../render/character';
import { TitleRibbon } from './TitleBadge'; // staff-luck 칭호 리본
import { Portrait, namedPortraitParts, guestName } from './GuestPopup';
import { guestParts } from '../render/character';
import { canGreet, canRecommend, recommendFits, regularHearts, regularById, requestDef, requestHint, regularFace, GAUGE_MAX, availableMenus, menuOf } from '../sim/index.ts'; // fun-guest
import { Bar, EnergyBar } from './Bars';
import { Confirm, Popup } from './Popup';
import { Icon } from './Icon';
import { SiteLine } from './SiteLine';
import { SHELL_BOTTOM } from './Shell';
import { frame, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, brownInput, PALETTE } from './frame';
import { useTutorialNote } from './tutorialDialogue';
import { LOOK_TEXT, type LookId } from '../sim/index.ts';

/** 맵에서 탭한 대상. 스펙 §1.2 표. */
export type CardTarget =
  | { kind: 'guest'; id: string; objectId?: string }   // seatfix: 손님이 앉아 있는 시설 — 카드 위 칩으로 오간다
  | { kind: 'staff'; id: string }
  | { kind: 'object'; id: string; guestId?: string }   // seatfix: 이 시설 위에 있는 손님
  | { kind: 'empty'; x: number; y: number }
  | { kind: 'parcel'; id: string }
  | { kind: 'busstop'; id: string }
  | { kind: 'counter'; id: string }
  | { kind: 'road'; x: number; y: number } // w-start 둘러보기: 마을 길 칸
  | { kind: 'route'; route: RouteId; id?: string }; // 트랙 H: 진입점·경로 시설 → RouteCard

/** ease: 이 금액 이상 드는 확정만 확인 팝업을 띄운다 (본관 옮기기·필지 구매·연수·투자는 각자 유지) */
export const CONFIRM_MIN_COST = 1_000_000;

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
  /** ease 「마을 길까지 자동 잇기」: 미리보기(파란 칸) 모드로 (본관·정류장 카드) */
  onAutoPath: () => void;
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

/** 「이게 뭐예요」 한 줄 (w-start): 처음부터 놓여 있는 것(정낭·정류장·마을 길·용천수·옆 필지·본관) 카드 맨 위에 초중생 어휘 설명 한 줄.
 *  세션에 한 번만 펼쳐 보이고, 그 뒤엔 「? 이게 뭐예요」 버튼으로 접힌다 (다시 누르면 펼친다). 튜토리얼 1·3단계 둘러보기 표식(look:<id>)도 여기서 남긴다. */
const hintShown = new Set<string>();
export const HINT_TEXT: Record<LookId | 'spring' | 'parcel', string> = {
  ...LOOK_TEXT,
  spring: '용천수: 땅에서 솟는 맑은 물. 못 옮기고 옆 경치가 좋아져요',
  parcel: '옆 땅: 사면 카페가 넓어져요. 땅마다 특색이 달라요',
};
export function Hint({ id }: { id: keyof typeof HINT_TEXT }) {
  const [open, setOpen] = useState(!hintShown.has(id));
  useTutorialNote(id === 'spring' || id === 'parcel' ? null : `look:${id}`);
  useEffect(() => { hintShown.add(id); }, [id]);
  return open
    ? <div data-testid={`hint-${id}`} style={{ fontSize: 14, color: PALETTE.title, fontWeight: 700, marginBottom: 4, lineHeight: 1.4 }}><Icon name="bulb" size={14} /> {HINT_TEXT[id]}</div>
    : <button data-testid={`hint-${id}`} aria-expanded={false} onClick={() => setOpen(true)} style={{ border: 0, background: 'transparent', color: PALETTE.title, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '2px 0', minHeight: 24 }}>? 이게 뭐예요</button>;
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

/** seatfix: 손님이 앉은 시설을 탭하면 「시설 / 손님」 두 칩으로 같은 자리에서 둘 다 본다 (더블탭은 모바일에서 느려 안 쓴다) */
const chip: CSSProperties = { ...brownBtn, margin: 0, padding: '0 10px', fontSize: 14, minHeight: 44, flex: 1 };
const chipOn: CSSProperties = { ...brownBtnOn, margin: 0, padding: '0 10px', fontSize: 14, minHeight: 44, flex: 1 };
function SeatChips({ on, objectId, guestId, a }: { on: 'object' | 'guest'; objectId: string; guestId: string; a: CardActions }) {
  return (
    <div data-testid="seat-chips" style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
      <button style={on === 'object' ? chipOn : chip} aria-pressed={on === 'object'} data-testid="chip-object"
        onClick={() => a.onSelect({ kind: 'object', id: objectId, guestId })}><Icon name="chair" /> 시설</button>
      <button style={on === 'guest' ? chipOn : chip} aria-pressed={on === 'guest'} data-testid="chip-guest"
        onClick={() => a.onSelect({ kind: 'guest', id: guestId, objectId })}><Icon name="guest" /> 손님</button>
    </div>
  );
}

/** seatfix: 예약 줄 — 「예약됨 · 지금 바로 · 취소」. 손님이 다 떠나면 sim이 알아서 실행한다. */
function PendingRow({ s, o, onClose }: { s: GameState; o: PlacedObject; onClose: () => void }) {
  const p = o.pending!;
  const warn = vacateWarning(s, o);
  const gone = p.kind === 'remove';
  const now = () => {
    const r = dispatch({ type: 'doWorkNow', objectId: o.id });
    if (!r.ok) { showMessage(r.reason ?? '지금은 못 해요'); return; }
    showMessage(warn ? '손님이 돌아갔어요' : '손님을 다른 자리로 옮겼어요');
    if (gone) onClose();
  };
  return (
    <div data-testid="pending-row" style={{ marginTop: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: PALETTE.title }}><Icon name="clock" size={14} /> 예약됨 · {WORK_NAME[p.kind]}</div>
      <div style={small}>손님이 일어나면 바로 해요{warn ? ` · ${warn}` : ''}</div>
      <Row>
        <button style={btnOn} data-testid="pending-now" onClick={now}>지금 바로</button>
        <button style={btn} data-testid="pending-cancel" onClick={() => dispatch({ type: 'cancelWork', objectId: o.id })}>취소</button>
      </Row>
    </div>
  );
}

/** 손님 카드 반응 표정(놀람·웃음)이 평소 얼굴로 돌아가는 시간 */
const REACT_EXPR_MS = 3000;
/** 단골 게이지 하트 5칸 (fun-guest §4): 찬 칸은 진하게, 빈 칸은 흐리게 */
export function Hearts({ n, max = GAUGE_MAX }: { n: number; max?: number }) {
  return (
    <span data-testid="hearts" aria-label={`단골 게이지 ${n}/${max}`} style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
      {Array.from({ length: max }, (_, i) => <span key={i} style={{ opacity: i < n ? 1 : 0.25, lineHeight: 0 }}><Icon name="heart" size={14} /></span>)}
    </span>
  );
}

/** 손님 카드 (fun-guest §4): 큰 얼굴 96px + 이름, 선택지 3개(인사·추천·선물)를 누르면 바로 말풍선·표정·하트/땀. 요청 줄 + 들어주기 힌트, 단골 하트 5칸. */
function GuestCard({ s, id, a, objectId }: { s: GameState; id: string; a: CardActions; objectId?: string }) {
  const [picking, setPicking] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [expr, setExpr] = useState<'normal' | 'happy' | 'surprised'>('normal');
  useTutorialNote('guestCard'); // 튜토리얼 「손님 카드 보기」
  // 반응 표정은 다른 손님으로 넘어가면, 또 3초 뒤엔 평소 얼굴로
  useEffect(() => { setExpr('normal'); }, [id]);
  useEffect(() => { if (expr === 'normal') return; const t = setTimeout(() => setExpr('normal'), REACT_EXPR_MS); return () => clearTimeout(t); }, [expr]);
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
  const greet = canGreet(s, g.id);
  const recommend = canRecommend(s, g.id);
  const menus = availableMenus(s).filter((m) => m !== g.menuId);
  const regular = g.regularId ? regularById(s, g.regularId) : null;
  const request = g.requestId ? requestDef(g.requestId) : null;
  const face = g.faceSeed !== undefined ? regularFace(g.faceSeed) : guestFace(g.type);
  const parts = nd ? namedPortraitParts(nd.id) : guestParts(face, def.tags, def.wants);
  const portraitExpr = expr !== 'normal' ? expr : g.mood === 'happy' ? 'happy' : 'normal';
  const pressGreet = () => { if (dispatch({ type: 'greetGuest', guestId: g.id }).ok) setExpr('happy'); };
  const pressRecommend = (menuId: string) => {
    setRecommending(false);
    const fits = recommendFits(s, g, menuId);
    if (dispatch({ type: 'recommendMenu', guestId: g.id, menuId }).ok) setExpr(fits ? 'happy' : 'surprised');
  };
  const tri: CSSProperties = { ...brownBtn, flex: 1, minWidth: 0, margin: 0, padding: '0 2px', fontSize: 14, minHeight: 44, whiteSpace: 'nowrap' };
  // ◀ ▶ 지금 온 손님 순회 — 같은 자리에 둘이 앉으면 탭으로는 한 명만 잡히므로 (§1.3)
  const all = s.guests.filter((x) => x.phase !== 'leaving');
  const idx = Math.max(0, all.findIndex((x) => x.id === g.id));
  const cycle = (dir: -1 | 1) => { const n = all[(idx + dir + all.length) % all.length]; if (n) a.onSelect({ kind: 'guest', id: n.id }); };
  return (
    <div data-testid="card-guest">
      {objectId && s.objects[objectId] && <SeatChips on="guest" objectId={objectId} guestId={g.id} a={a} />}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Portrait parts={parts} face={nd ? namedGuestFace(nd) : face} size={96} expr={portraitExpr} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 17, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="guest-name">{nd ? nd.name : (g.name ?? guestName(g))}{quest && <span style={{ color: PALETTE.bad }}> !</span>}</span>
            {all.length > 1 && <>
              <button aria-label="이전 손님" onClick={() => cycle(-1)} style={{ ...btn, minHeight: 44, minWidth: 44, padding: 0, fontSize: 14 }}>◀</button>
              <button aria-label="다음 손님" onClick={() => cycle(1)} style={{ ...btn, minHeight: 44, minWidth: 44, padding: 0, fontSize: 14 }}>▶</button>
            </>}
          </div>
          <div style={small}>{regular && <b style={{ color: PALETTE.btn }}>♥ 단골 · </b>}{nd ? nd.job : def.name} · {state}</div>
          <div style={small}>예산 {nd ? wonText(nd.budget) : def.wallet > 0 ? wonText(walletOf(s, g.type)) : '없음'}</div>
          {!nd && <div style={{ whiteSpace: 'nowrap' }}>단골 <Hearts n={regularHearts(s, g.type)} /> <span style={small}>만족 {st?.satisfaction ?? 0}{st?.regular === 'vip' ? ' · VIP' : ''}</span></div>}
          {wants.length > 0 && !nd && <div style={small}>좋아하는 것: {wants.join(' · ')}</div>}
        </div>
      </div>
      {g.say && <div data-testid="guest-say" style={{ marginTop: 6, fontStyle: 'italic', color: PALETTE.inkSoft, fontSize: 14 }}>“{g.say}”</div>}
      {request && (
        <div data-testid="guest-request" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.5 }}>
          <div><b>요청</b> {request.text}</div>
          <div style={small}><Icon name="bulb" size={14} /> {requestHint(request)}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button data-tut="greet" data-testid="btn-greet" style={greet.ok ? tri : { ...tri, ...btnOff }} disabled={!greet.ok} onClick={pressGreet} aria-label="인사"
          title={greet.reason}><Icon name="wave" /> {g.greeted ? '인사 ✓' : '인사'}</button>
        <button data-testid="btn-recommend" style={recommend.ok && menus.length > 0 ? tri : { ...tri, ...btnOff }} disabled={!recommend.ok || menus.length === 0} onClick={() => setRecommending(true)} aria-label="추천"
          title={recommend.reason}><Icon name="menu" /> {g.recommended ? '추천 ✓' : '추천'}</button>
        <button data-tut="gift" data-testid="btn-gift" style={giftOk ? tri : { ...tri, ...btnOff }} disabled={!giftOk} onClick={() => setPicking(true)} aria-label="선물하기"
          title={gifts.length === 0 ? '선물이 없어요' : giftedToday(s) ? '선물은 하루 한 번' : undefined}><Icon name="gift" /> 선물</button>
      </div>
      {!greet.ok && greet.reason && <div style={{ ...small, marginTop: 4 }}>{greet.reason}</div>}
      <Row>
        <button style={btn} onClick={() => a.onGuestDetail(g.id)}>자세히</button>
        {quest && <button style={canAcceptQuest(s, quest).ok ? btnOn : btnOff} disabled={!canAcceptQuest(s, quest).ok} onClick={() => a.onQuest(quest)}>! 부탁 듣기</button>}
      </Row>
      {recommending && (
        <Popup title={`${g.name ?? guestName(g)}에게 추천`} onBackdrop={() => setRecommending(false)} buttons={<button style={brownBtn} onClick={() => setRecommending(false)}>닫기</button>}>
          <div style={{ ...small, marginBottom: 6 }}>취향에 맞으면 주문을 바꾸고 팁을 더 내요</div>
          {menus.map((m) => {
            const fits = recommendFits(s, g, m);
            return (
              <button key={m} style={{ ...brownBtn, width: '100%', marginRight: 0, textAlign: 'left' }} data-testid={`recommend-${m}`} onClick={() => pressRecommend(m)}>
                {menuOf(s, m).name}{fits ? ' ★ 좋아할 듯' : ''}
              </button>
            );
          })}
        </Popup>
      )}
      {picking && (
        <Popup title={`${g.name ?? guestName(g)}에게 선물`} onBackdrop={() => setPicking(false)} buttons={<button style={brownBtn} onClick={() => setPicking(false)}>닫기</button>}>
          {gifts.map((x) => {
            const can = canGiveGift(s, g.id, x.id);
            const fit = giftFits(x, g.type);
            return (
              <button key={x.id} style={{ ...(can.ok ? brownBtn : brownBtnOff), width: '100%', marginRight: 0, textAlign: 'left' }} disabled={!can.ok} data-testid={`gift-${x.id}`}
                onClick={() => { setPicking(false); if (dispatch({ type: 'giveGift', guestId: g.id, itemId: x.id }).ok) setExpr('happy'); }}>
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
        <Portrait parts={staffParts(st.face, st.role, s.uniform ?? null)} face={st.face} size={64} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.5 }}>
          <div><b>{st.name}</b> <span style={small}>{away ? `연수 중 (${away.name} ${st.training!.daysLeft}일)` : st.role ? roleDef(st.role).name : '쉬는 중'} · Lv.{st.level}/{st.maxLevel}</span></div>
          {st.title && <div><TitleRibbon titleId={st.title} size="sm" /></div>}
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

function ObjectCard({ s, id, a, onClose, guestId }: { s: GameState; id: string; a: CardActions; onClose: () => void; guestId?: string }) {
  const [renaming, setRenaming] = useState(false);
  const o = s.objects[id];
  if (!o) return <div style={small}>없어진 시설이에요</div>;
  const d = objectDef(o.type);
  // ◀ ▶ 같은 종류 순회 (§1.3)
  const sameKind = Object.values(s.objects).filter((x) => x.type === o.type);
  const idx = sameKind.findIndex((x) => x.id === o.id);
  const cycle = (dir: -1 | 1) => { const n = sameKind[(idx + dir + sameKind.length) % sameKind.length]; if (n) a.onSelect({ kind: 'object', id: n.id }); };
  const canBuildSame = s.unlocked.objects.includes(o.type) && !PROTECTED_TYPES.has(o.type);
  const st = objectStats(s, o.id);
  const protectedType = PROTECTED_TYPES.has(o.type);
  // seatfix: 손님이 앉았거나 지나가는 중이면 버튼을 끄지 않고 예약을 건다 (자리가 비면 sim이 그 즉시 실행)
  const blocked = guestBlock(s, o);
  const reserve = (work: 'remove' | 'upgrade') => {
    if (!dispatch({ type: 'reserveWork', objectId: o.id, work }).ok) return false;
    showMessage(work === 'remove' ? '손님이 일어나면 치울게요' : '손님이 일어나면 증축할게요');
    return true;
  };
  /** ease: 철거는 확인 팝업 없이 바로 — 되돌리기 1회가 보호한다 (₩100만 이상 철거 비용이 드는 것만 확인) */
  const remove = () => {
    const go = () => {
      if (blocked && reserve('remove')) return;
      const r = dispatch({ type: 'remove', objectId: o.id }); if (r.ok) { showMessage(`${josa(d.name, '을/를')} 치웠어요${d.removeCost ? '' : ` · ${wonText(d.cost)} 돌려받음`} (↶ 되돌리기 가능)`); onClose(); } else showMessage(r.reason ?? '지금은 못 치워요');
    };
    if ((d.removeCost ?? 0) >= CONFIRM_MIN_COST) Confirm(`${josa(d.name, '을/를')} ${wonText(d.removeCost!)} 들여 치울까요?`, go, { title: '철거' });
    else go();
  };
  // 트랙 A: 증축 Lv·수리·청결
  const upgradable = isUpgradable(d) && st.level < MAX_OBJECT_LEVEL && !treeOf(o.type); // fun: 트리에 있는 시설은 「업그레이드 ▲」가 대신한다
  const up = upgradable ? canUpgrade(s, o.id, st.popularity) : { ok: false, reason: '' };
  const upCost = upgradable ? upgradeCost(s, o) : 0;
  const doUpgrade = () => Confirm(`${josa(d.name, '을/를')} Lv${st.level + 1}로 증축할까요? ${wonText(upCost)}${(d.buildDays ?? 0) > 0 ? ` · 공사 ${d.buildDays}일(이용 불가)` : ''}`, () => { if (blocked && reserve('upgrade')) return; dispatch({ type: 'upgradeObject', objectId: o.id }); }, { title: '증축' });
  const rep = canRepair(s, o.id);
  const clean = Math.round(s.clean.value);
  const breakWarn = cornerBreakWarning(s, o.id); // spot2: 치우거나 옮기면 명당이 깨지는 조각
  return (
    <div data-testid="card-object">
      {guestId && s.guests.some((g) => g.id === guestId) && <SeatChips on="object" objectId={o.id} guestId={guestId} a={a} />}
      {o.type === 'spring' && <Hint id="spring" />}
      {o.type === 'gate' && <Hint id="gate" />}{/* w-free: 정낭은 일반 시설 카드(이동·회전·철거·같은 것 더) + 둘러보기 힌트 */}
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Icon name={KIND_ICON[d.kind] ?? 'build'} size={18} /> <b>{o.name ?? d.name}</b>{o.name && <span style={small}> ({d.name})</span>}{st.level >= 2 && <b style={{ color: PALETTE.title }}> Lv{st.level}</b>}{o.build && <span style={{ color: PALETTE.title }}> · 짓는 중</span>}{st.wear > 0 && <span style={{ color: PALETTE.bad }}> · 낡았어요 (입소문 −{st.wear})</span>}</span>
          {sameKind.length > 1 && (
            <span data-testid="card-cycle" style={{ flex: 'none', display: 'inline-flex', gap: 2, alignItems: 'center', fontSize: 12, color: PALETTE.inkSoft }}>
              <button aria-label="이전 같은 시설" onClick={() => cycle(-1)} style={{ ...btn, minHeight: 44, minWidth: 44, padding: 0, fontSize: 14 }}>◀</button>
              {idx + 1}/{sameKind.length}
              <button aria-label="다음 같은 시설" onClick={() => cycle(1)} style={{ ...btn, minHeight: 44, minWidth: 44, padding: 0, fontSize: 14 }}>▶</button>
            </span>
          )}
        </div>
        <SeatNeedRow s={s} o={o} />{/* midgame: 자리 시설이면 「자리 4/6」 */}
        <Details id={`object:${o.type}`}>
          <div style={small}>입소문 <b style={{ color: PALETTE.ink }}>{st.popularity}</b> · 경관 <b style={{ color: PALETTE.ink }}>{st.scenery > 0 ? '+' : ''}{st.scenery}</b> · 요금 <b style={{ color: PALETTE.ink }}>{st.feePct}%</b>{st.upkeep > 0 && ` · 유지비 ${wonText(st.upkeep)}/달`}{(o.uses ?? 0) > 0 && ` · 이용 ${o.uses}회`}</div>
          <div style={small}>주변 시너지: {st.corner.pop > 0 || st.corner.feePct > 0 ? `명당 입소문 +${st.corner.pop} · 요금 +${st.corner.feePct}%` : '없음'}{st.sets.length > 0 && ` · 세트 ${st.sets.map((x) => x.name).join(', ')}`}</div>
          <SiteLine s={s} o={o} />
          {(() => { const nl = nightSeatLine(s, o); return nl ? <div style={{ ...small, ...(nl.bad ? { color: PALETTE.bad } : {}) }} data-testid="night-line">🌙 {nl.text}</div> : null; })()}
          {isAnnex(o) && <div style={small}>실내 {roomSeatsUsed(s, o)}/{roomSeats(s, o)}석{isRoomCut(s, o) && <span style={{ color: PALETTE.bad, fontWeight: 700 }} data-testid="annex-cut"> · {ANNEX_CUT_TEXT} — {DOOR_PATH_WARN}</span>}</div>}
          <div style={{ ...small, whiteSpace: 'nowrap' }} data-testid="clean-bar">카페 청결 <Bar value={clean} max={100} width={80} /> {clean}{clean < CLEAN_LOW && <span style={{ color: PALETTE.bad }}> 지저분해요</span>}</div>
        </Details>
      </div>
      <FeeLines s={s} o={o} />{/* spot2: 「기본 ₩3,000 · 자리 +28% · 명당 +12% → ₩4,300」 */}
      <CornerLines s={s} o={o} />{/* spot2: 자리엔 「명당 꽃길 옆 · 요금 +5%」, 조각엔 「돌봐 주는 자리 n곳」 */}
      <UnreachableRow s={s} o={o} a={a} />{/* ui3: 손님이 못 가는 시설이면 이유 한 줄 + 「길 잇기」 */}
      {treeOf(o.type) && <TreeUpgradeRow s={s} o={o} />}{/* fun: 「업그레이드 ▲」는 카드 맨 위(버튼 줄 위) — 아래에 두면 잘린다 */}
      {!protectedType && breakWarn && <div style={{ ...small, marginTop: 4, color: PALETTE.bad, fontWeight: 700 }} data-testid="corner-break-warn">{breakWarn} · 업그레이드는 괜찮아요</div>}
      <Row>
        {upgradable && <button style={up.ok ? btnOn : btnOff} disabled={!up.ok} title={up.ok ? undefined : up.reason} onClick={doUpgrade} data-testid="upgrade-btn">증축 Lv{st.level + 1} ({wonText(upCost)})</button>}
        {st.wear > 0 && <button style={rep.ok ? btnOn : btnOff} disabled={!rep.ok} onClick={() => dispatch({ type: 'repairObject', objectId: o.id })} data-testid="repair-btn">수리 ({wonText(repairCost(s, o))})</button>}
        {!protectedType && <button style={btn} onClick={() => a.onMove(o.id)}>이동</button>}
        {ROTATABLE_TYPES.has(o.type) && <button style={btn} onClick={() => dispatch({ type: 'rotate', objectId: o.id, rot: ((o.rot ?? 0) + 1) % 4 })}>회전</button>}
        {!protectedType && <button style={btnDanger} onClick={remove}>철거</button>}
        {canBuildSame && <button style={btn} data-testid="build-same" onClick={() => a.onBuildSame(o.type, o.x + d.w, o.y)}><Icon name="plus" /> 같은 것 더</button>}
        <button style={btn} data-testid="rename-object" onClick={() => setRenaming(true)}><Icon name="pencil" /> 이름</button>
        <button style={btn} onClick={() => a.onObjectDetail(o.id)}>자세히</button>
      </Row>
      {upgradable && !up.ok && up.reason && <div style={{ ...small, marginTop: 4 }}>증축 조건: {upgradeConditionText(o, d)}</div>}
      {o.pending
        ? <PendingRow s={s} o={o} onClose={onClose} />
        : blocked && !protectedType && <div style={{ ...small, marginTop: 4 }} data-testid="busy-line">{blocked} · 눌러 두면 일어날 때 해 드려요</div>}
      {renaming && <RenamePopup objectId={o.id} current={o.name ?? ''} onClose={() => setRenaming(false)} />}
    </div>
  );
}

/** midgame: 자리 시설 카드에 「자리 4/6 · 홍보 중엔 9」 — 몇 개가 더 필요한지가 수치로 보이게. */
function SeatNeedRow({ s, o }: { s: GameState; o: PlacedObject }) {
  if (!isSeat(s, o)) return null;
  const n = seatsNeeded(s);
  const short = n.short > 0;
  return (
    <div data-testid="seat-need" style={{ ...small, color: short ? PALETTE.bad : PALETTE.inkSoft, fontWeight: short ? 700 : 400 }}>
      <Icon name="look" size={13} /> 자리 {n.have}/{n.now}{short ? ` · ${n.short}개 더` : ''} · 홍보 중엔 {n.promo}개
    </div>
  );
}

/** spot2 요금 내역 (사용자 피드백 "잘 꾸밀수록 받는 요금이 더 좋아지면"): 자리 카드에 세 줄 —
 *  ① 기본 메뉴 값 → 실제로 받는 값 ② 무엇이 얼마나 얹었나 ③ 상한(×2.0)에 닿았으면 그 말.
 *  요금 배수는 sim의 fee.ts가 실제 결제에 쓰는 그 값이다 — 카드 숫자와 받는 값이 갈라지지 않는다. */
function FeeLines({ s, o }: { s: GameState; o: PlacedObject }) {
  const d = objectDef(o.type);
  if (!isCornerTarget(d) || o.build) return null;
  const q = seatFeeQuote(s, o);
  if (q.base <= 0) return null;
  const up = Math.round((q.mult - 1) * 100);
  return (
    <div style={{ marginTop: 4 }} data-testid="fee-lines">
      <div style={{ fontSize: 14, fontWeight: 700 }}>
        기본 {wonText(q.base)} → <span style={{ color: PALETTE.title }}>{wonText(q.price)}</span>{up !== 0 && <span style={{ ...small, color: up > 0 ? PALETTE.ok : PALETTE.bad }}> ({up > 0 ? '+' : ''}{up}%)</span>}
      </div>
      <div style={small}>{q.parts.length > 0 ? q.parts.map((x) => `${x.label} ${x.pct > 0 ? '+' : ''}${x.pct}%`).join(' · ') : '아직 얹은 게 없어요 — 자리를 꾸미면 올라가요'}</div>
      {q.capped && <div style={{ ...small, color: PALETTE.title }}>요금은 메뉴 값의 {FEE_MULT_CAP}배까지예요</div>}
    </div>
  );
}

/** spot2: 명당이 이 시설에 무슨 일을 하는지 카드에서 보이게.
 *  - 자리(좌석·요금 시설): "명당 꽃길 옆 · 요금 +5% · 만족 +5"
 *  - 명당 조각(팻말을 탭했을 때): "꽃길이 돌봐 주는 자리 3곳 · 오늘 이 자리들 매출 ₩12만" */
function CornerLines({ s, o }: { s: GameState; o: PlacedObject }) {
  const seat = cornerSeatLine(s, o);
  const anchor = cornerAnchorLine(s, o.id);
  if (!seat && !anchor) return null;
  return (
    <>
      {seat && <div style={{ ...small, color: PALETTE.ok, fontWeight: 700 }} data-testid="corner-seat-line">{seat}</div>}
      {anchor && (
        <div style={small} data-testid="corner-anchor-line">
          {josa(anchor.name, '이/가')} 돌봐 주는 자리 {anchor.seats}곳{anchor.seats > 0 ? ` · 오늘 이 자리들 매출 ${wonText(anchor.sales)}` : ' — 옆에 자리를 놓아 보세요'}
        </div>
      )}
    </>
  );
}

/** ui3: 손님이 걸어서 못 오는 시설이면 왜 그런지 한 줄 + 할 수 있는 수.
 *  본관 문 앞이 끊겼을 때만 「길 잇기」(autoConnectPath)가 통한다 — 외딴 시설은 옆에 길을 놓거나 옮겨야 한다. */
function UnreachableRow({ s, o, a }: { s: GameState; o: PlacedObject; a: CardActions }) {
  if (objectReachable(s, o)) return null;
  const c = canAutoConnectPath(s);
  const cells = c.route?.empty.length ?? 0;
  const canPath = s.unlocked.objects.includes('path');
  return (
    <div data-testid="card-unreachable" style={{ marginTop: 4, padding: '4px 6px', border: `2px solid ${PALETTE.bad}`, borderRadius: 6, background: PALETTE.paper }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: PALETTE.bad, lineHeight: 1.4 }}>{UNREACHABLE_TEXT}</div>
      <div style={small}>올렛길이 이 자리까지 닿아야 손님이 앉아요</div>
      <Row>
        {c.ok && <button style={btnOn} data-testid="card-autopath" onClick={() => a.onAutoPath()}>길 잇기 ({cells}칸 · {wonText(c.route?.cost ?? 0)})</button>}
        {canPath && <button style={c.ok ? btn : btnOn} data-testid="card-lay-path" onClick={() => a.onBuildSame('path', o.x, o.y)}><Icon name="build" /> 길 놓기</button>}
      </Row>{/* 통합: 「이동」은 바로 아래 버튼 줄에 이미 있다 — 좁은 화면에서 같은 버튼이 두 번 보이지 않게 */}
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

/** 마을 길 칸 (w-start 둘러보기): 버스가 다니는 길, 여기서 올렛길을 잇는다 */
function RoadCard({ s, x, y }: { s: GameState; x: number; y: number }) {
  return (
    <div data-testid="card-road">
      <Hint id="road" />
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><b>마을 길</b> <span style={small}>({x},{y})</span></div>
        <div style={small}>이번 달 손님 {s.monthGuests}명이 이 길로 왔어요 · 길 위엔 못 지어요</div>
      </div>
    </div>
  );
}

function ParcelCard({ s, id, onClose }: { s: GameState; id: string; onClose: () => void }) {
  const p = s.parcels.find((x) => x.id === id);
  if (!p || p.owned) return <div style={small}>이미 우리 땅이에요</div>;
  const can = canBuyParcel(s, p.id);
  const price = parcelPrice(s, p);
  const f = parcelFeature(p); // fun-rank
  const buy = () => Confirm(`${p.name} 필지를 ${wonText(price)}에 살까요? ${f.gain}`, () => { if (dispatch({ type: 'buyParcel', id: p.id }).ok) onClose(); }, { title: '필지 구매' });
  return (
    <div data-testid="card-parcel">
      <Hint id="parcel" />
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name={f.icon} size={18} alt={f.feature} /> <b>{p.name}</b> <span style={small}>{f.feature} · {p.w}×{p.h}칸</span></div>
        <div>{f.gain}</div>
        <div style={small}>가격 {wonText(price)}{!can.ok && can.reason && ` · ${can.reason}`}</div>
      </div>
      <Row><button style={can.ok ? btnOn : btnOff} disabled={!can.ok} onClick={buy}><Icon name="money" /> 사기</button></Row>
    </div>
  );
}

function BusStopCard({ s, id }: { s: GameState; id: string }) {
  const o = s.objects[id];
  const name = o ? objectDef(o.type).name : '정류장';
  return (
    <div data-testid="card-busstop">
      <Hint id="busstop" />
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name="calendar" size={18} /> <b>{name}</b></div>
        <div style={small}>이번 달 손님 {s.monthGuests}명 · 지금 {s.guests.length}명</div>
      </div>
    </div>
  );
}

/** 본관 카드 (UX 참고 §4.2, y-indoor): 3줄(이름·Lv·실내 좌석 / 주방·재고 / 매출·직원·이용률) + 버튼 2줄(메뉴판·실내 꾸미기·카페 창 / 증축·2층·옮기기) + ▸ 자세히(재고·청결·난로/피아노/BGM/조명) */
const LOW_STOCK = 3;
/** ₩300만 식 짧은 돈 표기 (본관 카드 버튼) */
const manWon = (n: number) => (n % 10_000 === 0 ? `₩${(n / 10_000).toLocaleString()}만` : wonText(n));
const mbtn: CSSProperties = { ...btn, padding: '0 8px' };
const mbtnOn: CSSProperties = { ...btnOn, padding: '0 8px' };
const mbtnOff: CSSProperties = { ...btnOff, padding: '0 8px' };
/** ease: 「마을 길까지 자동 잇기 ₩N」 — 본관 문 앞이 정류장과 안 이어졌을 때만 보인다. 누르면 파란 미리보기 → ✓ (확인 팝업 없음) */
export function AutoPathButton({ s, onAutoPath }: { s: GameState; onAutoPath: () => void }) {
  const c = canAutoConnectPath(s);
  const r = c.route;
  if (!r || r.route === null || r.route.length === 0) return null; // 본관 없음·이미 이어짐·이을 길 없음(문 앞 막힘은 카드 문구가 알린다)
  return <button style={c.ok ? mbtnOn : mbtnOff} disabled={!c.ok} title={c.ok ? undefined : c.reason} onClick={onAutoPath} data-testid="auto-path-btn"><Icon name="build" /> 마을 길까지 자동 잇기 {wonText(r.cost)}{!c.ok && c.reason ? ` · ${c.reason}` : ''}</button>;
}

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
  const stock = Object.entries(s.storage).filter(([, n]) => n > 0);
  return (
    <div data-testid="card-main">
      <Hint id="main" />
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name="home" /> <b>{s.cafeName || '우리 카페'} Lv{m.level}</b>{s.main.floor2 && ' · 2층'} · 실내 {m.seatsUsed}/{m.seats}석{workText && <span style={{ color: PALETTE.title }}> · {workText}</span>}</div>
        <div style={small}><Icon name="kitchen" size={14} /> 주문 대기 {waiting} · 조리 중 {cooking} · 메뉴 {menus}개{low.length > 0 && <span style={{ color: PALETTE.bad }}> · <Icon name="warn" size={14} /> {low.map(([k, n]) => `${labelOf('ingredient', k)} ${n}개 남음`).join(' · ')}</span>}</div>
        <div style={small}>{wonText(s.monthIncome)} · 직원 {working} · 이용률 {m.usePct === null ? '—' : `${m.usePct}%`}{m.short && <span style={{ color: PALETTE.bad }}> · 자리가 모자라요</span>}</div>
        {m.cut && <div style={{ color: PALETTE.bad, fontWeight: 700 }} data-testid="main-cut">{ANNEX_CUT_TEXT} — {DOOR_PATH_WARN}</div>}
      </div>
      <Row><AutoPathButton s={s} onAutoPath={a.onAutoPath} /></Row>
      <Row>
        <button style={mbtn} onClick={a.onCafe}><Icon name="coffee" /> 메뉴판</button>
        <button style={mbtn} onClick={() => { if (o) { requestBuildTab('indoor'); a.onBuild(o.x, o.y); } }} data-testid="main-indoor-btn"><Icon name="chair" /> 실내 꾸미기</button>
        <button style={mbtn} onClick={() => setMore(!more)} aria-expanded={more}>{more ? '▾ 접기' : '▸ 자세히'}</button>
      </Row>
      <Row>
        {next && <button style={exp.ok ? mbtnOn : mbtnOff} disabled={!exp.ok} title={exp.ok ? undefined : exp.reason} onClick={doExpand} data-testid="main-expand-btn" data-tut="main-expand"><Icon name="build" /> 증축 Lv{next} ({manWon(expandCost(s))}·{MAIN_EXPAND_DAYS}일)</button>}
        {!s.main.floor2 && <button style={f2.ok ? mbtnOn : mbtnOff} disabled={!f2.ok} title={f2.ok ? undefined : f2.reason} onClick={doFloor2} data-testid="main-floor2-btn"><Icon name="floor2" /> 2층</button>}
        {undo.ok
          ? <button style={mbtn} onClick={() => dispatch({ type: 'undoMoveMain' })} data-testid="main-undo-btn">↩ 되돌리기</button>
          : <button style={mv.ok ? mbtn : mbtnOff} disabled={!mv.ok} title={mv.ok ? undefined : mv.reason} onClick={() => o && a.onMove(o.id)} data-testid="main-move-btn"><Icon name="truck" /> 옮기기 ({manWon(MOVE_COST)}·{moveDays(s)}일)</button>}
      </Row>
      <div style={{ ...small, marginTop: 4 }}>이달 이동 {canMoveThisMonth(s) ? '가능 ○' : '끝 ×'}{reason && ` · ${reason}`}{!mv.ok && canMoveThisMonth(s) && !m.work && ` · 옮기기: ${mv.reason}`}</div>
      {more && (
        <div style={{ ...small, marginTop: 6, borderTop: `1px solid ${PALETTE.woodLight}`, paddingTop: 6 }} data-testid="main-detail">
          <div>재고: {stock.length > 0 ? stock.map(([k, n]) => `${labelOf('ingredient', k)} ${n}`).join(' · ') : '없음'}</div>
          <div style={{ whiteSpace: 'nowrap' }}>청결 <Bar value={Math.round(s.clean.value)} max={100} width={80} /> {Math.round(s.clean.value)}</div>
          <div style={{ marginTop: 4 }}><Icon name="note" /> BGM</div>
          <ButtonGroup label="BGM" value={s.main.bgm ?? 'none'} onPick={(v) => dispatch({ type: 'setBgm', bgm: v === 'none' ? null : v })} testId="main-bgm"
            options={[{ value: 'none', label: '끔' }, { value: 'calm', label: BGM_LABEL.calm }, { value: 'jazz', label: BGM_LABEL.jazz }, { value: 'folk', label: BGM_LABEL.folk }]} />
          <div style={{ marginTop: 4 }}><Icon name="bulb" /> 저녁 조명</div>
          <ButtonGroup label="저녁 조명" value={s.main.lighting} onPick={(v) => dispatch({ type: 'setLighting', lighting: v })} testId="main-light"
            options={[{ value: 'warm', label: LIGHT_LABEL.warm }, { value: 'bright', label: LIGHT_LABEL.bright }]} />
        </div>
      )}
    </div>
  );
}

/** 화면 하단(하단 바 위)에 붙는 미니 카드. 높이 ≤ 30vh, 맵은 그대로 보인다. 닫기 아이콘 또는 맵의 다른 곳을 탭하면 닫힌다. */
export function MiniCard({ target, actions, onClose }: { target: CardTarget; actions: CardActions; onClose: () => void }) {
  const s = useGame();
  let body: ReactNode;
  switch (target.kind) {
    case 'guest': body = <GuestCard s={s} id={target.id} a={actions} objectId={target.objectId} />; break;
    case 'staff': body = <StaffCard s={s} id={target.id} a={actions} />; break;
    case 'object': body = <ObjectCard s={s} id={target.id} a={actions} onClose={onClose} guestId={target.guestId} />; break;
    case 'empty': body = <EmptyCard s={s} x={target.x} y={target.y} a={actions} />; break;
    case 'parcel': body = <ParcelCard s={s} id={target.id} onClose={onClose} />; break;
    case 'busstop': body = <BusStopCard s={s} id={target.id} />; break;
    case 'counter': body = <MainCard s={s} id={target.id} a={actions} />; break; // y-indoor
    case 'road': body = <RoadCard s={s} x={target.x} y={target.y} />; break; // w-start
    case 'route': body = <>{target.route === 'bus' && <Hint id="busstop" />}<RouteCard s={s} route={target.route} objectId={target.id} />{target.route === 'bus' && <Row><AutoPathButton s={s} onAutoPath={actions.onAutoPath} /></Row>}</>; break; // 트랙 H (정류장은 둘러보기 힌트·자동 잇기 포함)
  }
  return (
    <div data-testid="mini-card" data-kind={target.kind}
      style={{ ...frame, position: 'absolute', left: 6, right: 6, bottom: `calc(${SHELL_BOTTOM + 6}px + env(safe-area-inset-bottom))`, maxHeight: '30vh', overflowY: 'auto', zIndex: 12, padding: '8px 10px', fontSize: 16 }}>
      <button aria-label="닫기" onClick={onClose} style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, border: 0, background: 'transparent', color: PALETTE.inkSoft, fontSize: 18, fontWeight: 700, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></button>
      <div style={{ paddingRight: 36 }}>{body}</div>
    </div>
  );
}

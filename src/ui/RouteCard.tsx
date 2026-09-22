/**
 * 트랙 H 손님 유입 경로 UI (UX 참고 §3.3).
 * - RouteCard: 진입점·경로 시설을 탭했을 때 미니 카드 본문 — 이름·오늘 손님·다음 도착·상한·길 연결 ○/×·[계약/해지]·[넓히기].
 * - RoutesSection: 장부 › 경영 창의 "손님 경로" 표 — 경로별 이달 손님·매출 비중 막대.
 */
import type { CSSProperties } from 'react';
import { Icon } from './Icon';
import { dispatch } from './store';
import { josa } from '../sim/josa.ts';
import { ENTRY_ROUTES, routeState, routeStats, routeConnected, routeLinked, routeShare, canAutoLinkRoute, routeFacility, routeOpened, routeDailyCap, nextArrivalText, canSetRouteContract, canExpandParking, parkingExpandCost, parkingSlots, PARKING_EXPAND_FROM, PARKING_EXPAND_TO, SHUTTLE_FEE, buildDaysLeft, type GameState, type RouteId } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { BUS_HOUR, isBusDay } from '../sim/spots.ts';
import { Bar } from './Bars';
import { wonText as won } from '../data/labels.ts';
import { Confirm } from './Popup';
import { brownBtnOn, brownBtnOff, dangerBtn, PALETTE, card } from './frame';

/** 경로별 픽셀 아이콘 이름 (sim의 def.icon 이모지 대신) */
const ROUTE_ICON: Record<string, string> = { bus: 'bus', parking: 'car', shuttle: 'plane', cruise: 'ship', olle: 'ribbon' };
/** 잠긴 경로 한 줄: 무엇을 하면 누가 오는지 (트랙 E 진입점 미리 보기 — 맵 팻말과 같은 방향의 말) */
const LOCK_HINT: Record<string, string> = {
  parking: '주차장을 지으면 렌터카 손님이 와요',
  shuttle: '남쪽 샘터 땅을 사면 셔틀이 서요',
  cruise: '북쪽 곶자왈 땅을 사면 배가 와요',
  olle: '서쪽 밭담 땅을 사면 올레꾼이 와요',
};

const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };
const btnOn: CSSProperties = { ...brownBtnOn, margin: 0, padding: '0 10px', fontSize: 15 };
const btnOff: CSSProperties = { ...brownBtnOff, margin: 0, padding: '0 10px', fontSize: 15 };
const btnDanger: CSSProperties = { ...dangerBtn, margin: 0, padding: '0 10px', fontSize: 15 };

/** 다음 투어 버스 (정류장 카드 — 기존 BusStopCard 문구) */
function nextTourBusText(s: GameState): string {
  if (!s.tourBus) return '계약 없음';
  const { day, hour } = s.clock;
  if (isBusDay(day) && hour < BUS_HOUR) return `오늘 ${BUS_HOUR}시`;
  for (let d = 1; d <= 7; d++) if (isBusDay(((day - 1 + d) % 30) + 1)) return d === 1 ? `내일 ${BUS_HOUR}시` : `${d}일 뒤 ${BUS_HOUR}시`;
  return '미정';
}

export function RouteCard({ s, route, objectId }: { s: GameState; route: RouteId; objectId?: string }) {
  const def = ENTRY_ROUTES[route];
  const st = routeState(s, route);
  const facility = routeFacility(s, route);
  const connected = routeConnected(s, route);
  const cap = routeDailyCap(s, route);
  const parcel = def.parcelId ? s.parcels.find((p) => p.id === def.parcelId) : null;
  const opened = routeOpened(s, route);
  const facilityName = objectDef(def.facilities[0]!).name;
  // 셔틀 계약
  const contractOn = canSetRouteContract(s, route, true);
  const contractOff = canSetRouteContract(s, route, false);
  const contract = () => {
    if (st.contract) { Confirm(`${def.name} 계약을 끝낼까요? 셔틀이 더는 오지 않아요.`, () => { dispatch({ type: 'setRouteContract', route, on: false }); }, { title: '계약 해지' }); return; }
    Confirm(`${josa(def.name, '을/를')} 월 ${won(SHUTTLE_FEE)}에 계약할까요? 11시·15시에 6~10명이 와요. (투어 버스 계약 중이면 무료)`, () => { dispatch({ type: 'setRouteContract', route, on: true }); }, { title: '셔틀 계약' });
  };
  // 주차장 넓히기
  const lot = objectId && s.objects[objectId]?.type === PARKING_EXPAND_FROM ? s.objects[objectId]! : Object.values(s.objects).find((o) => o.type === PARKING_EXPAND_FROM) ?? null;
  const expand = lot ? canExpandParking(s, lot.id) : { ok: false, reason: '' };
  const doExpand = () => { if (!lot) return; Confirm(`${josa(objectDef(PARKING_EXPAND_FROM).name, '을/를')} ${objectDef(PARKING_EXPAND_TO).name}(6칸)으로 넓힐까요? 차액 ${won(parkingExpandCost())} · 공사 ${objectDef(PARKING_EXPAND_TO).buildDays ?? 0}일`, () => { dispatch({ type: 'expandParking', objectId: lot.id }); }, { title: '주차장 넓히기' }); };
  const building = Object.values(s.objects).find((o) => o.build && def.facilities.includes(o.type));
  // fun P0: 시설 앞 칸이 자리까지 이어졌나 + 「자동 잇기」
  const linked = routeLinked(s, route);
  const autoLink = facility && st.unlocked && !linked ? canAutoLinkRoute(s, route) : null;
  const doAutoLink = () => { if (!autoLink?.route) return; Confirm(`${josa(facilityName, '을/를')} 정류장 길까지 올렛길 ${autoLink.route.empty.length}칸(${won(autoLink.route.cost)})으로 이을까요?`, () => { dispatch({ type: 'autoLinkRoute', route }); }, { title: '자동 잇기' }); };
  const share = route === 'bus' || route === 'parking' || route === 'olle' ? routeShare(s, route, route === 'parking' ? 12 : s.clock.hour) : 0;
  const status = !st.unlocked ? (LOCK_HINT[route] ?? `잠김 — ${def.unlockText}`) : building ? `${objectDef(building.type).name} 짓는 중 · ${buildDaysLeft(s, building)}일` : !facility ? `${facilityName}을 지어요` : def.needsContract && !st.contract ? '계약이 필요해요' : connected ? '손님이 와요' : '길이 끊겼어요';
  return (
    <div data-testid="card-route" data-route={route}>
      <div style={{ fontSize: 14, lineHeight: 1.5 }}>
        <div><Icon name={ROUTE_ICON[def.id] ?? 'bus'} size={18} /> <b>{def.name}</b> <span style={small}>{facility && facility.type !== 'busstop' ? objectDef(facility.type).name : ''}{parcel ? ` · ${parcel.name}${parcel.owned ? '' : ' 필요'}` : ''}</span></div>
        <div style={small}>오늘 {route === 'bus' ? '손님' : '여기서 온 손님'} <b style={{ color: PALETTE.ink }}>{st.todayGuests}</b>명 · 이달 {st.monthGuests}명 · 다음 도착 {route === 'bus' ? `상시 · 투어 버스 ${nextTourBusText(s)}` : nextArrivalText(s, route)}</div>
        <div style={small}>상한 {cap === null ? '없음' : `${cap}명/일`}{route === 'parking' && parkingSlots(s) > 0 ? ` (${parkingSlots(s)}칸 × 3대 × 3명)` : ''} · 길 연결 <b style={{ color: connected ? PALETTE.ok : PALETTE.bad }}>{connected ? '○' : '×'}</b>{def.needsContract && ` · 계약 ${st.contract ? '중' : '없음'}`}</div>
        {facility && st.unlocked && !connected
          ? <div style={{ fontSize: 13, color: PALETTE.bad, fontWeight: 700 }} data-testid="route-broken">길이 끊겼어요 — 진입점({def.entry.x},{def.entry.y})까지 올렛길을 이어요</div>
          : facility && st.unlocked && !linked
            ? <div style={{ fontSize: 13, color: PALETTE.bad, fontWeight: 700 }} data-testid="route-unlinked">길이 끊겼어요 — 자리까지 올렛길이 안 이어졌어요</div>
            : <div style={small}>{status}{!opened && st.unlocked && !facility ? ` · ${facilityName} ${won(objectDef(def.facilities[0]!).cost)}` : ''}</div>}
        {st.unlocked && facility && connected && linked && share > 0 && <div style={small} data-testid="route-share">하루 손님의 <b style={{ color: PALETTE.ink }}>{Math.round(share * 100)}%</b>가 여기서 와요{route === 'parking' ? ' (10~17시)' : ''}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {autoLink && <button style={autoLink.ok ? btnOn : btnOff} disabled={!autoLink.ok} title={autoLink.ok ? undefined : autoLink.reason} onClick={doAutoLink} data-testid="route-autolink"><Icon name="roadside" /> 자동 잇기{autoLink.route && autoLink.route.cost > 0 ? ` (${won(autoLink.route.cost)})` : ''}</button>}
        {autoLink && !autoLink.ok && autoLink.reason && <span style={{ ...small, alignSelf: 'center' }}>{autoLink.reason}</span>}
        {def.needsContract && (st.contract
          ? <button style={contractOff.ok ? btnDanger : btnOff} disabled={!contractOff.ok} onClick={contract} data-testid="route-contract">계약 해지</button>
          : <button style={contractOn.ok ? btnOn : btnOff} disabled={!contractOn.ok} title={contractOn.ok ? undefined : contractOn.reason} onClick={contract} data-testid="route-contract"><Icon name="plane" /> 계약 ({won(SHUTTLE_FEE)}/월)</button>)}
        {route === 'parking' && lot && <button style={expand.ok ? btnOn : btnOff} disabled={!expand.ok} title={expand.ok ? undefined : expand.reason} onClick={doExpand} data-testid="route-expand"><Icon name="car" /> 넓히기 ({won(parkingExpandCost())})</button>}
        {route === 'parking' && lot && !expand.ok && expand.reason && <span style={{ ...small, alignSelf: 'center' }}>{expand.reason}</span>}
      </div>
    </div>
  );
}

/** 장부 › 경영: "손님 경로" 표 — 경로별 이달 손님 수·매출 비중 막대 */
export function RoutesSection({ s }: { s: GameState }) {
  const rows = routeStats(s);
  return (
    <div style={card} data-testid="routes-section">
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>손님 경로 (이달)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 8px', fontSize: 14, alignItems: 'center' }}>
        {rows.map((r) => (
          <span key={r.route} style={{ display: 'contents' }}>
            <span style={{ color: r.unlocked ? PALETTE.ink : PALETTE.inkSoft, whiteSpace: 'nowrap' }}><Icon name={ROUTE_ICON[r.route] ?? 'bus'} size={14} /> {r.name}{!r.unlocked ? ' (잠김)' : !r.active ? ' (멈춤)' : ''}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ whiteSpace: 'nowrap' }}><Bar value={r.guestShare * 100} max={100} width={56} /> <Bar value={r.incomeShare * 100} max={100} width={56} color={PALETTE.ok} /></span>
              <span style={{ ...small, whiteSpace: 'nowrap' }}>{r.monthGuests}명 · {won(r.monthIncome)}</span>
            </span>
          </span>
        ))}
      </div>
      <div style={{ ...small, marginTop: 4 }}>막대: 손님 비중(주황) · 매출 비중(초록)</div>
    </div>
  );
}

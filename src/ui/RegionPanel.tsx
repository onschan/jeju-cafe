import { useGame, dispatch } from './store';
import { wonText } from '../data/labels.ts';
import { isWeekend, daysToWeekend, popupCost, popupGuestCount, canOpenPopup, regionState, regionProgress, metCount, regularCount } from '../sim/index.ts';
import { REGIONS, NAMED_GUESTS } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { Bar } from './Bars';
import { showPopupScreen } from './PopupScreen';
import { card, brownBtn, brownBtnOn, brownBtnOff, PALETTE } from './frame';

/** 지역 지도 (투자 탭): 7지역의 활기·식욕 게이지, 만난 손님·단골★, 주말 팝업 열기 */
export function RegionPanel() {
  const s = useGame();
  const weekend = isWeekend(s.clock.day);
  const open = s.popup.regionId;
  return (
    <div data-testid="region-panel">
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>
        주말(6·13·20·27일)에 팝업을 열면 그 지역 손님 6~8명이 와요. 연 지역은 활기·식욕 −8, 나머지는 주말마다 +5 · 만난 손님 {metCount(s)}/{NAMED_GUESTS.length} · 단골★ {regularCount(s)}
      </div>
      <div style={{ fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <b style={{ color: weekend ? PALETTE.ok : PALETTE.inkSoft }}>{weekend ? '오늘은 주말 — 이번 주말 팝업을 열 수 있어요' : `다음 주말까지 ${daysToWeekend(s.clock.day)}일`}</b>
        {open && <button style={{ ...brownBtnOn, marginBottom: 0 }} onClick={showPopupScreen} aria-label="팝업 보기">🏪 팝업 보기</button>}
      </div>
      {REGIONS.map((r) => {
        const st = regionState(s, r.id);
        const prog = regionProgress(s, r.id);
        const can = canOpenPopup(s, r.id);
        const cost = popupCost(r.id);
        const isOpen = open === r.id;
        return (
          <div key={r.id} style={{ ...card, borderColor: isOpen ? PALETTE.btnOn : PALETTE.woodLight }} data-testid={`region-${r.id}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <b style={{ flex: 1 }}>{r.name}{isOpen ? ' · 팝업 열림' : ''}</b>
              <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>손님 {prog.met}/{prog.total} · ★ {prog.regular}</span>
            </div>
            <div style={{ fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap', margin: '4px 0' }}>
              <span style={{ whiteSpace: 'nowrap' }}>활기 <Bar value={st.vitality} max={100} width={70} color={PALETTE.ok} /> {st.vitality}</span>
              <span style={{ whiteSpace: 'nowrap' }}>식욕 <Bar value={st.appetite} max={100} width={70} color={PALETTE.bar} /> {st.appetite} → {popupGuestCount(st.appetite)}명</span>
            </div>
            {r.note && <div style={{ fontSize: 12, color: PALETTE.inkSoft }}>{r.note} · 취향이 까다롭고 지갑이 커요</div>}
            <button data-tut="popup-open" style={{ ...(can.ok ? brownBtn : brownBtnOff), marginTop: 4, marginBottom: 0 }} disabled={!can.ok} aria-label={`${r.name} 팝업 열기`}
              onClick={() => Confirm(`${r.name}에 ${wonText(cost)}으로 ${weekend ? '이번 주말' : '주말'} 팝업을 열까요? 손님 ${popupGuestCount(st.appetite)}명이 와요.`, () => dispatch({ type: 'openPopup', regionId: r.id }), { title: '팝업 스토어' })}>
              팝업 열기 <Icon name="money" /> {wonText(cost)}{!can.ok && !isOpen ? ` · ${can.reason}` : ''}
            </button>
          </div>
        );
      })}
    </div>
  );
}

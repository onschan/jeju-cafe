import { useGame, dispatch } from './store';
import { Icon } from './Icon';
import { Popup } from './Popup';
import { brownBtn, PALETTE, won } from './frame';

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: bold ? 700 : 400, color }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

export function MonthCard() {
  const s = useGame();
  const c = s.lastMonthCard;
  if (!c) return null;
  const close = () => dispatch({ type: 'dismissMonthCard' });
  const cost = c.costs;
  const net = c.net;
  // 알림(퇴사 등)은 sim이 지우는 액션이 없어 최근 3개만 보여 준다
  const notices = s.notices.slice(-3);
  return (
    <Popup title={`${c.year}년 ${c.month}월 결산`} onBackdrop={close}
      buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={close}>닫기</button>}>
      <div style={{ marginBottom: 6 }}><Icon name="calendar" size={20} /> 손님 {c.guests}명</div>
      <Row label="수입" value={`+${won(c.income)}`} color={PALETTE.ok} />
      <Row label="재료비" value={`-${won(cost.ingredients)}`} />
      <Row label="월급" value={`-${won(cost.salary)}`} />
      <Row label="유지비" value={`-${won(cost.upkeep)}`} />
      <Row label="홍보" value={`-${won(cost.ads)}`} />
      <div style={{ borderTop: `2px solid ${PALETTE.woodLight}`, margin: '6px 0' }} />
      <Row label="순이익" value={`${net >= 0 ? '+' : '-'}${won(Math.abs(net))}`} color={net >= 0 ? PALETTE.ok : PALETTE.bad} bold />
      {notices.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 13, color: PALETTE.bad }}>
          {notices.map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      )}
    </Popup>
  );
}

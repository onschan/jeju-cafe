import { useGame, dispatch } from './store';
import { Icon } from './Icon';

export function MonthCard() {
  const s = useGame();
  const c = s.lastMonthCard;
  if (!c) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0008', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => dispatch({ type: 'dismissMonthCard' })}>
      <div style={{ background: '#fff', color: '#222', borderRadius: 12, padding: 20, minWidth: 240, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}><Icon name="calendar" size={24} /> {c.year}년 {c.month}월 결산</div>
        <div style={{ marginTop: 10 }}>손님 {c.guests}명</div>
        <div>번 돈 ₩{c.income.toLocaleString()}</div>
        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>눌러서 닫기</div>
      </div>
    </div>
  );
}

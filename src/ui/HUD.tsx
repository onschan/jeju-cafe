import { useGame, getToast } from './store';

/** 돈을 짧게: 1만 이상은 '497만'처럼 만 단위(내림), 그 아래는 그대로. 375px 폰에서 상단 바 한 줄에 들어가도록. */
export function compactMoney(n: number): string {
  const neg = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 10_000) return `${neg}${Math.floor(a / 10_000).toLocaleString()}만`;
  return `${neg}${a.toLocaleString()}`;
}

/** 연구 포인트를 짧게: 1만 이상은 '1.2만'(소수 1자리), 그 아래는 구분 기호 없이 그대로. */
export function compactNumber(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 10_000) return `${sign}${(Math.floor(a / 1000) / 10).toFixed(a % 10_000 >= 1000 ? 1 : 0)}만`;
  return `${sign}${a}`;
}

/** 6~23시 → 'AM 8:00' / 'PM 3:00' */
export function clockText(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour < 12 || hour >= 24 ? 'AM' : 'PM'} ${h12}:00`;
}

/** 밤 오버레이 알파: 18시 0 → 22시 0.55 */
export function nightAlpha(hour: number): number {
  return Math.max(0, Math.min(1, (hour - 18) / 4)) * 0.55;
}

/** 캔버스 위·셸 아래에 깔리는 밤 어둠. 터치는 통과한다. */
export function NightOverlay() {
  const s = useGame();
  const a = nightAlpha(s.clock.hour);
  if (a <= 0) return null;
  return <div data-testid="night" style={{ position: 'absolute', inset: 0, background: `rgba(11,26,58,${a.toFixed(3)})`, pointerEvents: 'none' }} />;
}

/** 액션 실패 문구 등 짧은 토스트. 목표 줄 바로 아래에 뜬다. */
export function Toast({ top }: { top: number }) {
  useGame();
  const toast = getToast();
  if (!toast) return null;
  return (
    <div data-testid="toast" style={{ position: 'absolute', top: top + 6, left: 12, right: 12, zIndex: 15, background: '#c9184a', color: '#fff', padding: '8px 10px', borderRadius: 8, fontSize: 15, fontWeight: 700, pointerEvents: 'none' }}>
      {toast}
    </div>
  );
}

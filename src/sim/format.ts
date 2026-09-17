/** 로케일과 무관한 숫자 포맷 (1234567 → '1,234,567'). sim 알림 문자열은 상태에 저장되므로 toLocaleString을 쓰면 기기 로케일에 따라 리플레이 상태가 달라진다 (QA 1차 P2 #26). */
export function fmtNum(n: number): string {
  const neg = n < 0 ? '-' : '';
  const [int, frac] = Math.abs(n).toString().split('.');
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg}${grouped}${frac ? `.${frac}` : ''}`;
}

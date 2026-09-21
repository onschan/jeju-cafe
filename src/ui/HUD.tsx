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

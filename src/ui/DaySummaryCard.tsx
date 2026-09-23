/** 오늘의 성장 요약 (성장 체감): 하루가 끝나면(24시) 화면 하단에 3초 동안 한 장 —
 *  "손님 42명 ▲6 · 매출 ₩38만 ▲4만 · 새 단골 1명". 증감은 어제 대비. 하루 1회(끝난 날이 바뀔 때만 뜬다). */
import { useEffect, useState } from 'react';
import { useGame } from './store';
import { daySummary, type DayLogRow } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { PALETTE } from './frame';
import { Icon } from './Icon';

/** 카드가 떠 있는 시간 */
export const DAY_CARD_MS = 3000;

/** 어제 대비 증감 한 조각. 0이면 안 쓴다. */
export function deltaText(cur: number, prev: number | null, unit: 'guests' | 'money' | 'count'): string {
  if (prev === null) return '';
  const d = cur - prev;
  if (d === 0) return '';
  const n = Math.abs(d);
  const body = unit === 'money' ? wonText(n, true).replace('₩', '') : `${n}`;
  return `${d > 0 ? '▲' : '▼'}${body}`;
}

/** 요약 세 줄의 본문 (테스트가 문구만 본다) */
export function summaryParts(today: DayLogRow, prev: DayLogRow | null): { label: string; value: string; delta: string; up: boolean }[] {
  const rows = [
    { label: '손님', value: `${today.guests}명`, delta: deltaText(today.guests, prev?.guests ?? null, 'guests'), up: !prev || today.guests >= prev.guests },
    { label: '매출', value: wonText(today.income, true), delta: deltaText(today.income, prev?.income ?? null, 'money'), up: !prev || today.income >= prev.income },
  ];
  if (today.regulars > 0) rows.push({ label: '새 단골', value: `${today.regulars}명`, delta: '', up: true });
  return rows;
}

export function DaySummaryCard({ bottom }: { bottom: number }) {
  const s = useGame();
  const sum = daySummary(s);
  const day = sum?.today.day ?? null;
  // 처음 그릴 때의 날은 「이미 본 것」으로 둔다 — 세이브를 이어서 열자마자 어제 요약이 튀어나오지 않게
  const [shownDay, setShownDay] = useState<number | null>(day);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (day === null || day === shownDay) return;
    setShownDay(day);
    setOpen(true);
    const t = setTimeout(() => setOpen(false), DAY_CARD_MS);
    return () => clearTimeout(t);
  }, [day, shownDay]);

  // big 통합: 월말 결산·가이드북 발표·대회 결과 연출이 떠 있으면 하루 요약은 미룬다
  // (셋 다 화면을 덮는 카드라 아래쪽에 하루 요약이 같이 비치면 「한 번에 하나」가 깨진다)
  if (!open || !sum || s.lastMonthCard || s.lastAnnouncement || s.contest?.pending) return null;
  const rows = summaryParts(sum.today, sum.prev);
  return (
    <div data-testid="day-summary" aria-live="polite"
      style={{
        position: 'absolute', left: 8, right: 8, bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`, zIndex: 12,
        background: PALETTE.paper, border: `3px solid ${PALETTE.wood}`, borderRadius: 8, padding: '6px 10px',
        boxShadow: '0 2px 0 #0004', pointerEvents: 'none', fontSize: 14, fontWeight: 700, color: PALETTE.ink,
      }}>
      <div style={{ fontSize: 12, color: PALETTE.inkSoft, marginBottom: 2 }}><Icon name="calendar" size={12} /> 오늘 장사</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
        {rows.map((r) => (
          <span key={r.label} style={{ whiteSpace: 'nowrap' }}>
            <span style={{ color: PALETTE.inkSoft, fontWeight: 400 }}>{r.label} </span>{r.value}
            {r.delta && <span style={{ color: r.up ? PALETTE.ok : PALETTE.bad, marginLeft: 3 }}>{r.delta}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

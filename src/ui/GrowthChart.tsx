/** 성장 그래프 (성장 체감): 최근 30일 손님·매출 막대. 순수 SVG — 라이브러리 없이 30칸.
 *  등급이 오른 날에는 세로선 + 등급 이름을 얹는다("여기서 「동네 카페」가 됐다"를 눈으로). 경영 현황 「자세히」 안. */
import { useGame } from './store';
import { recentDays, gradeName, DAY_LOG_CAP, type DayLogRow } from '../sim/index.ts';
import { wonText } from '../data/labels.ts';
import { PALETTE } from './frame';

const W = 300, H = 76, PAD_B = 12, BAR_H = H - PAD_B;
const SLOT = W / DAY_LOG_CAP;

/** 등급이 오른 날 (첫 줄은 기준이라 제외) */
export function gradeUps(rows: DayLogRow[]): { i: number; grade: number }[] {
  const out: { i: number; grade: number }[] = [];
  for (let i = 1; i < rows.length; i++) if (rows[i]!.grade > rows[i - 1]!.grade) out.push({ i, grade: rows[i]!.grade });
  return out;
}

export function GrowthChart() {
  const s = useGame();
  const rows = recentDays(s);
  if (rows.length < 2) return <div style={{ fontSize: 13, color: PALETTE.inkSoft, padding: '8px 0' }}>하루가 지나면 그래프가 쌓여요.</div>;
  const maxG = Math.max(1, ...rows.map((r) => r.guests));
  const maxI = Math.max(1, ...rows.map((r) => r.income));
  const ups = gradeUps(rows);
  const h = (v: number, max: number) => Math.max(v > 0 ? 1 : 0, Math.round((v / max) * BAR_H));
  return (
    <div data-testid="growth-chart" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: PALETTE.inkSoft, marginBottom: 2 }}>
        <span>최근 {rows.length}일</span>
        <span>
          <span style={{ color: PALETTE.bar }}>■</span> 손님 최대 {maxG}명 · <span style={{ color: PALETTE.ok }}>■</span> 매출 최대 {wonText(maxI, true)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={92} preserveAspectRatio="none" role="img"
        aria-label={`최근 ${rows.length}일 손님·매출 막대 그래프`} style={{ display: 'block', background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 4 }}>
        {rows.map((r, i) => {
          const x = i * SLOT;
          const gh = h(r.guests, maxG), ih = h(r.income, maxI);
          return (
            <g key={r.day}>
              <rect x={x + SLOT * 0.12} y={BAR_H - gh} width={SLOT * 0.36} height={gh} fill={PALETTE.bar} />
              <rect x={x + SLOT * 0.52} y={BAR_H - ih} width={SLOT * 0.36} height={ih} fill={PALETTE.ok} />
            </g>
          );
        })}
        <line x1={0} y1={BAR_H} x2={W} y2={BAR_H} stroke={PALETTE.wood} strokeWidth={1} />
        {ups.map((u) => {
          const x = u.i * SLOT;
          const anchor = x > W * 0.6 ? 'end' : 'start';
          return (
            <g key={u.i} data-testid="grade-mark">
              <line x1={x} y1={0} x2={x} y2={BAR_H} stroke={PALETTE.title} strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={anchor === 'end' ? x - 2 : x + 2} y={9} textAnchor={anchor} fontSize={9} fill={PALETTE.title}>{gradeName(u.grade)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

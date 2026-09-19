/** 월말 결산 창 (스펙 §2.1). 순수 컴포넌트 — 수입/비용 표(항목 한글), 이달의 하이라이트 3줄, 다음 달 팁 1줄, ★ 게이지.
 *  card는 기존 state.lastMonthCard 형태 + 선택 필드. 하이라이트·팁은 호출자(통합)가 sim 상태로 만들어 넘긴다 — 없으면 카드만. */
import type { MonthCosts, ComplaintReason } from '../../sim/index.ts';
import { wonText } from '../../data/labels.ts';
import { COMPLAINT_LABEL } from '../../sim/index.ts';
import { PALETTE, brownBtn } from '../frame';
import { body, Stars, rowCard, soft } from './shared.tsx';

export interface ReportCard {
  income: number;
  guests: number;
  month: number;
  year: number;
  costs: MonthCosts;
  net: number;
  /** 농원에서 들어온 재료 수 (밭 폐지 후 자동 수확, 트랙 A) */
  harvested?: number;
  /** 자급 재료로 아낀 재료비 */
  ingredientSaved?: number;
  /** 이달의 하이라이트 3줄: 최다 판매 메뉴 · 최고 만족 손님층 · 새로 열린 것 */
  highlights?: string[];
  /** 다음 달 팁 1줄 (현재 목표 기반) */
  tip?: string;
  // ---- 트랙 E (경제·평판) — 있으면 줄이 붙는다 ----
  deficitStreak?: number;            // 연속 적자 달 (3 이상이면 배지)
  loanTaken?: number;                // 그달 받은 삼춘 대출
  loanBalance?: number;              // 월말 대출 잔액
  rivalLossPct?: number;             // 라이벌 때문에 줄어든 손님 %
  guestsLeft?: number;               // 대기열이 차서 돌아간 손님
  reputation?: number;               // 월말 평판
  reputationDelta?: number;          // 그달 평판 변화
  topComplaints?: { reason: ComplaintReason; count: number }[];
}

export interface ReportWindowProps {
  card: ReportCard;
  /** ★ 등급 1~5 */
  star?: number;
  /** 지난달 ★ (올랐으면 반짝 표시) */
  prevStar?: number;
  /** 다음 ★까지 진행 0~1 (없으면 게이지만) */
  starProgress?: number;
  /** 월 매출 신기록 */
  monthRecord?: boolean;
  onClose(): void;
}

function Row({ label, value, color, bold, indent }: { label: string; value: string; color?: string; bold?: boolean; indent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: bold ? 700 : 400, color, fontSize: bold ? 16 : 14, paddingLeft: indent ? 12 : 0, lineHeight: 1.5 }}>
      <span>{label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

export function ReportWindow({ card: c, star, prevStar, starProgress, monthRecord, onClose }: ReportWindowProps) {
  const cost = c.costs;
  const totalCost = cost.ingredients + cost.salary + cost.upkeep + cost.ads + (cost.recruit ?? 0) + (cost.tax ?? 0) + (cost.loanRepay ?? 0) + (cost.tourBus ?? 0);
  const complaints = (c.topComplaints ?? []).slice(0, 3);
  const up = star !== undefined && prevStar !== undefined && star > prevStar;
  const highlights = (c.highlights ?? []).filter(Boolean).slice(0, 3);
  return (
    <div style={body} data-testid="report-window">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 20 }}>{c.year}년 {c.month}월</b>
        <span style={{ fontSize: 15 }}>손님 {c.guests}명</span>
        {monthRecord && <span style={{ color: PALETTE.bad, fontWeight: 700 }}>🎉 월 매출 신기록</span>}
      </div>

      <div style={rowCard}>
        <Row label="수입" value={`+${wonText(c.income)}`} color={PALETTE.ok} bold />
        <Row label="메뉴 판매" value={`+${wonText(c.income)}`} indent />
        {c.harvested !== undefined && c.harvested > 0 && <Row label="농원 수확" value={`재료 ${c.harvested}개`} indent />}
        {c.ingredientSaved !== undefined && c.ingredientSaved > 0 && <Row label="자급 재료로 아낀 돈" value={`+${wonText(c.ingredientSaved)}`} indent color={PALETTE.ok} />}
        <div style={{ borderTop: `1px dashed ${PALETTE.woodLight}`, margin: '6px 0' }} />
        <Row label="비용" value={`-${wonText(totalCost)}`} color={PALETTE.bad} bold />
        <Row label="재료비" value={`-${wonText(cost.ingredients)}`} indent />
        <Row label="월급" value={`-${wonText(cost.salary)}`} indent />
        <Row label="유지비" value={`-${wonText(cost.upkeep)}`} indent />
        <Row label="홍보" value={`-${wonText(cost.ads)}`} indent />
        {(cost.recruit ?? 0) > 0 && <Row label="채용·퇴직금·연수" value={`-${wonText(cost.recruit)}`} indent />}
        {(cost.tax ?? 0) > 0 && <Row label="소득세" value={`-${wonText(cost.tax)}`} indent />}
        {(cost.tourBus ?? 0) > 0 && <Row label="투어 버스" value={`-${wonText(cost.tourBus)}`} indent />}
        {(cost.loanRepay ?? 0) > 0 && <Row label="삼춘 대출 상환" value={`-${wonText(cost.loanRepay)}`} indent />}
        <div style={{ borderTop: `2px solid ${PALETTE.wood}`, margin: '6px 0' }} />
        <Row label="순이익" value={`${c.net >= 0 ? '+' : '-'}${wonText(Math.abs(c.net))}`} color={c.net >= 0 ? PALETTE.ok : PALETTE.bad} bold />
        {(c.deficitStreak ?? 0) >= 3 && <div style={{ color: PALETTE.bad, fontSize: 14, marginTop: 4 }}>적자 {c.deficitStreak}개월째 — 비용부터 줄여 보세요</div>}
        {(c.loanTaken ?? 0) > 0 && <Row label="삼춘 대출 받음" value={`+${wonText(c.loanTaken ?? 0)}`} color={PALETTE.bad} />}
        {(c.loanBalance ?? 0) > 0 && <Row label="대출 잔액" value={wonText(c.loanBalance ?? 0)} color={PALETTE.inkSoft} />}
      </div>

      {c.reputation !== undefined && (
        <div style={rowCard} data-testid="report-reputation">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>평판 ♥{Math.round(c.reputation)}</span>
            <span style={{ color: (c.reputationDelta ?? 0) >= 0 ? PALETTE.ok : PALETTE.bad }}>{(c.reputationDelta ?? 0) >= 0 ? '+' : ''}{Math.round(c.reputationDelta ?? 0)}</span>
          </div>
          {complaints.length > 0
            ? complaints.map((t) => <div key={t.reason} style={{ fontSize: 14, lineHeight: 1.5 }}>· 불만 {COMPLAINT_LABEL[t.reason]} <span style={{ color: PALETTE.inkSoft }}>{t.count}건</span></div>)
            : <div style={{ fontSize: 14, color: PALETTE.inkSoft }}>불만이 없었어요</div>}
          {(c.guestsLeft ?? 0) > 0 && <div style={{ fontSize: 14, lineHeight: 1.5 }}>· 자리가 없어 돌아간 손님 <span style={{ color: PALETTE.inkSoft }}>{c.guestsLeft}명</span></div>}
          {(c.rivalLossPct ?? 0) > 0 && <div style={{ fontSize: 14, lineHeight: 1.5 }}>· 라이벌 카페 때문에 손님 <span style={{ color: PALETTE.bad }}>−{c.rivalLossPct}%</span></div>}
        </div>
      )}

      {highlights.length > 0 && (
        <div style={rowCard} data-testid="report-highlights">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>이달의 하이라이트</div>
          {highlights.map((h, i) => <div key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>{['🥇', '😊', '🔓'][i] ?? '•'} {h}</div>)}
        </div>
      )}

      {star !== undefined && (
        <div style={{ ...rowCard, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} data-testid="report-star">
          <Stars n={star} size={22} label={`★${star}`} />
          <span style={{ fontSize: 14 }}>{up ? <b style={{ color: PALETTE.bad }}>★ 등급이 올랐어요!</b> : `★${star} 카페`}</span>
          {starProgress !== undefined && star < 5 && (
            <span style={{ flex: '1 1 100px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, height: 10, background: PALETTE.paperDark, border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.max(0, Math.min(100, starProgress * 100))}%`, height: '100%', background: '#c9741a' }} />
              </span>
              <span style={{ ...soft, fontSize: 13, whiteSpace: 'nowrap' }}>다음 ★까지</span>
            </span>
          )}
        </div>
      )}

      {c.tip && <div style={{ ...rowCard, background: PALETTE.paperDark }} data-testid="report-tip">💡 <b>다음 달 팁</b> — {c.tip}</div>}

      <button style={{ ...brownBtn, width: '100%', margin: '4px 0 0' }} onClick={onClose} data-testid="report-close">닫기</button>
    </div>
  );
}

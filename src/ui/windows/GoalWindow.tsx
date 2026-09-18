/** 목표 창 (스펙 §2). 순수 컴포넌트 — goals 배열(순차 체인)을 받아 현재 목표 크게, 지난 목표 체크 목록, 다음 목표 1개 미리보기.
 *  state.goals·goals.json은 트랙 A가 만들고 있어 통합 때 `{ title, desc, cur, max, rewardText, done }`로 변환해 넘긴다
 *  (desc = conditionText(goal.condition), rewardText = rewardText(goal.rewards) — labels.ts). */
import { PALETTE } from '../frame';
import { body, Bar, rowCard, soft, Empty } from './shared.tsx';

export interface GoalItem {
  title: string;
  desc: string;
  cur: number;
  max: number;
  rewardText: string;
  done: boolean;
}

export interface GoalWindowProps {
  goals: GoalItem[];
  onClose(): void;
  /** 지난 목표를 몇 개까지 보여줄까 (최근 것부터). 기본 8 */
  pastLimit?: number;
}

export function GoalWindow({ goals, pastLimit = 8 }: GoalWindowProps) {
  const idx = goals.findIndex((g) => !g.done);
  const current = idx >= 0 ? goals[idx] : undefined;
  const next = idx >= 0 ? goals[idx + 1] : undefined;
  const past = goals.filter((g) => g.done);
  const shown = past.slice(-pastLimit).reverse();
  const doneCount = past.length;
  return (
    <div style={body} data-testid="goal-window">
      <div style={{ ...soft, marginBottom: 6 }}>이룬 목표 {doneCount}/{goals.length}</div>

      {current ? (
        <div data-testid="goal-current" style={{ ...rowCard, borderColor: PALETTE.wood, borderWidth: 3, padding: 12 }}>
          <div style={{ ...soft, fontSize: 13, marginBottom: 2 }}>지금 목표 {idx + 1}</div>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>{current.title}</div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>{current.desc}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Bar value={current.cur} max={current.max} height={14} color={current.cur >= current.max ? PALETTE.ok : PALETTE.bar} />
            <b style={{ fontSize: 16 }}>{Math.min(current.cur, current.max)}/{current.max}</b>
          </div>
          <div style={{ fontSize: 15 }}>🎁 보상: <b>{current.rewardText}</b></div>
        </div>
      ) : (
        <Empty>{goals.length === 0 ? '아직 목표가 없어요' : '목표를 전부 이뤘어요! 이제 마음껏 카페를 키워 보세요.'}</Empty>
      )}

      {next && (
        <div data-testid="goal-next" style={{ ...rowCard, opacity: 0.75 }}>
          <div style={{ ...soft, fontSize: 13 }}>다음 목표</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{next.title}</div>
          <div style={soft}>{next.desc} · 보상 {next.rewardText}</div>
        </div>
      )}

      {shown.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>지난 목표</div>
          {shown.map((g, i) => (
            <div key={`${g.title}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', borderBottom: `1px solid ${PALETTE.paperDark}`, fontSize: 14 }}>
              <span style={{ color: PALETTE.ok, flex: '0 0 auto' }}>✔</span>
              <span style={{ flex: 1, textDecoration: 'line-through', color: PALETTE.inkSoft }}>{g.title}</span>
              <span style={{ ...soft, fontSize: 13, flex: '0 0 auto' }}>{g.rewardText}</span>
            </div>
          ))}
          {past.length > shown.length && <div style={{ ...soft, fontSize: 13, marginTop: 4 }}>… 그 전 {past.length - shown.length}개</div>}
        </div>
      )}
    </div>
  );
}

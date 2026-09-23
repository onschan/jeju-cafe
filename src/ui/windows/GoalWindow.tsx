/** 목표 창 (trim: 도전 탭을 걷어내고 [메인/월간] 두 탭).
 *  메인: 동시 진행 2개 크게 + 다음 목표 미리보기 + 지난 목표 체크 목록 + 한 줄 추천. 월간: 이달의 과제 1개. */
import { useState } from 'react';
import { Icon } from '../Icon';
import { PALETTE } from '../frame';
import { fmtNum } from '../../sim/format.ts';
import { body, Bar, rowCard, rowCardLocked, rowBtn, rowBtnOff, soft, Empty, TabBar, useWindowState, type WindowProps } from './shared.tsx';
import { activeGoals, pastGoals, toGoal, urgentChallenge } from '../simBridge';
import { monthlyProgress, goalConditionText, goalRewardText } from '../../sim/index.ts';
import { GOALS } from '../../data/index.ts';
import { useTutorialNote } from '../tutorialDialogue';
import { HalmangLine } from '../TutorialWindow'; // trim: 추천 탭 대신 한 줄

export type GoalTab = 'main' | 'monthly';
const TABS: { key: GoalTab; label: string }[] = [{ key: 'main', label: '메인' }, { key: 'monthly', label: '월간' }];

export interface GoalWindowProps extends WindowProps {
  onClose(): void;
  initialTab?: GoalTab;
  /** 지난 목표를 몇 개까지 보여줄까 (최근 것부터). 기본 8 */
  pastLimit?: number;
}

export function GoalWindow(props: GoalWindowProps) {
  const { s, dispatch } = useWindowState(props);
  useTutorialNote('goalWindow'); // 튜토리얼 6단계 「목표 창 열어 보기」
  const [tab, setTab] = useState<GoalTab>(props.initialTab ?? 'main');
  const pastLimit = props.pastLimit ?? 8;
  const rewardsText = (rs: { type: string }[]) => (rs as Parameters<typeof goalRewardText>[0][]).map(goalRewardText).join(' · ');

  const renderMain = () => {
    const active = activeGoals(s);
    const past = pastGoals(s);
    const shown = past.slice(-pastLimit).reverse();
    const nextIdx = GOALS.findIndex((g) => !s.goals.claimed.includes(g.id) && !active.some((a) => a.id === g.id));
    const next = nextIdx >= 0 ? toGoal(s, GOALS[nextIdx]!, false) : null;
    return (
      <>
        <HalmangLine onFocus={props.onClose} />
        <div style={{ ...soft, marginBottom: 6 }}>이룬 목표 {past.length}/{GOALS.length}</div>
        {active.length === 0 && <Empty>{GOALS.length === 0 ? '아직 목표가 없어요' : '목표를 전부 이뤘어요! 이제 마음껏 카페를 키워 보세요.'}</Empty>}
        {active.map((g, i) => (
          <div key={g.id} data-testid={i === 0 ? 'goal-current' : 'goal-current-2'} style={{ ...rowCard, borderColor: PALETTE.wood, borderWidth: 3, padding: 12 }}>
            <div style={{ ...soft, fontSize: 13, marginBottom: 2 }}>지금 목표 {GOALS.findIndex((x) => x.id === g.id) + 1}</div>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>{g.title}</div>
            <div style={{ fontSize: 15, marginBottom: 8 }}>{g.desc}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Bar value={g.cur} max={g.max} height={14} color={g.cur >= g.max ? PALETTE.ok : PALETTE.bar} />
              <b style={{ fontSize: 16 }}>{Math.min(g.cur, g.max)}/{g.max}</b>
            </div>
            <div style={{ fontSize: 15 }}><Icon name="gift" /> 보상: <b>{g.rewardText}</b></div>
          </div>
        ))}
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
            {shown.map((g) => (
              // 375px: 제목·보상을 한 줄에 나란히 두면 좁은 제목 칸이 min-content(한 글자)까지 줄어 글자가 세로로 쏟아진다.
              // 제목은 한 줄 말줄임(minWidth 0), 보상은 아래 작은 줄로 내린다.
              <div key={g.id} data-testid="goal-past" style={{ padding: '5px 0', borderBottom: `1px solid ${PALETTE.paperDark}`, fontSize: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: PALETTE.ok, flex: '0 0 auto', display: 'flex' }}><Icon name="check" size={14} /></span>
                  <span data-testid="goal-past-title" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'line-through', color: PALETTE.inkSoft }}>{g.title}</span>
                </div>
                <div data-testid="goal-past-reward" style={{ ...soft, fontSize: 12, paddingLeft: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.rewardText}</div>
              </div>
            ))}
            {past.length > shown.length && <div style={{ ...soft, fontSize: 13, marginTop: 4 }}>… 그 전 {past.length - shown.length}개</div>}
          </div>
        )}
      </>
    );
  };

  const renderMonthly = () => {
    const m = s.monthly;
    if (!m) return <Empty>이달의 과제는 매월 1일에 나와요.</Empty>;
    const p = monthlyProgress(s);
    const u = urgentChallenge(s);
    const daysLeft = u?.kind === 'monthly' ? u.daysLeft : null;
    return (
      <div data-testid="monthly-card" style={{ ...rowCard, borderColor: PALETTE.wood, borderWidth: 3, padding: 12 }}>
        <div style={{ ...soft, fontSize: 13 }}>{s.clock.month}월의 과제 {m.status === 'done' ? '· 달성!' : m.status === 'failed' ? '· 놓쳤어요' : daysLeft !== null ? `· ${daysLeft}일 남음` : ''}</div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>{m.title}</div>
        <div style={{ fontSize: 15, marginBottom: 8 }}>{goalConditionText(m.condition)} — 난이도는 지난달 기준으로 자동이에요</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <Bar value={p.cur} max={p.max} height={14} color={m.status === 'done' ? PALETTE.ok : PALETTE.bar} />
          <b style={{ fontSize: 16 }}>{fmtNum(p.cur)}/{fmtNum(p.max)}</b>
        </div>
        <div style={{ fontSize: 15 }}><Icon name="gift" /> 보상: <b>{rewardsText(m.reward)}</b></div>
      </div>
    );
  };

  return (
    <div style={body} data-testid="goal-window">
      <TabBar tabs={TABS} active={tab} onPick={setTab} testId="goal-tab" />
      {tab === 'main' && renderMain()}
      {tab === 'monthly' && renderMonthly()}
    </div>
  );
}

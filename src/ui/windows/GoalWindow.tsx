/** 목표 창 (스펙 §2 → §7.3 3레인). [메인/도전/월간] 탭.
 *  메인: 동시 진행 2개 크게 + 다음 목표 미리보기 + 지난 목표 체크 목록. 도전: 진행 중 2슬롯 + 고를 수 있는 6개(수락 버튼, 잠긴 것은 남은 날). 월간: 이달의 과제 1개.
 *  상태는 store(useGame)에서 읽고 수락은 dispatch({ type: 'acceptChallenge' }). */
import { useState } from 'react';
import { Icon } from '../Icon';
import { PALETTE } from '../frame';
import { fmtNum } from '../../sim/format.ts';
import { body, Bar, rowCard, rowCardLocked, rowBtn, rowBtnOff, soft, Empty, TabBar, useWindowState, type WindowProps } from './shared.tsx';
import { activeGoals, pastGoals, toGoal, urgentChallenge } from '../simBridge';
import { offeredChallenges, canAcceptChallenge, challengeProgress, challengeDaysLeft, isChallengeLocked, challengeLockDaysLeft, monthlyProgress, goalConditionText, goalRewardText, CHALLENGE_SLOTS } from '../../sim/index.ts';
import { GOALS, challengeDef } from '../../data/index.ts';
import { showToast } from '../store';
import { useTutorialNote } from '../tutorialDialogue';

export type GoalTab = 'main' | 'challenge' | 'monthly';
const TABS: { key: GoalTab; label: string }[] = [{ key: 'main', label: '메인' }, { key: 'challenge', label: '도전' }, { key: 'monthly', label: '월간' }];
const TIER_STARS = (t: number) => '★'.repeat(t);

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
              <div key={g.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', borderBottom: `1px solid ${PALETTE.paperDark}`, fontSize: 14 }}>
                <span style={{ color: PALETTE.ok, flex: '0 0 auto' }}><Icon name="check" size={14} /></span>
                <span style={{ flex: 1, textDecoration: 'line-through', color: PALETTE.inkSoft }}>{g.title}</span>
                <span style={{ ...soft, fontSize: 13, flex: '0 0 auto' }}>{g.rewardText}</span>
              </div>
            ))}
            {past.length > shown.length && <div style={{ ...soft, fontSize: 13, marginTop: 4 }}>… 그 전 {past.length - shown.length}개</div>}
          </div>
        )}
      </>
    );
  };

  const renderChallenge = () => {
    const offered = offeredChallenges(s);
    return (
      <>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>진행 중 {s.challenges.active.length}/{CHALLENGE_SLOTS}</div>
        {s.challenges.active.length === 0 && <Empty>아직 받은 도전이 없어요. 아래에서 골라 받아요 (기한이 있어요).</Empty>}
        {s.challenges.active.map((a) => {
          const def = challengeDef(a.id);
          const p = challengeProgress(s, a.id);
          return (
            <div key={a.id} data-testid="challenge-active" style={{ ...rowCard, borderColor: PALETTE.wood, borderWidth: 3 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <b style={{ flex: 1, fontSize: 17 }}>{def.title}</b>
                <span style={{ ...soft, fontSize: 13 }}>{TIER_STARS(def.tier)} · {challengeDaysLeft(s, a.id)}일 남음</span>
              </div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>{def.desc}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Bar value={p.cur} max={p.max} height={12} />
                <b>{fmtNum(p.cur)}/{fmtNum(p.max)}</b>
              </div>
              <div style={{ fontSize: 14 }}><Icon name="gift" size={14} /> {rewardsText(def.reward)}</div>
            </div>
          );
        })}
        <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>고를 수 있는 도전</div>
        {offered.length === 0 && <Empty>지금 고를 수 있는 도전이 없어요. 메인 목표를 더 이루면 늘어나요.</Empty>}
        {offered.map((def, i) => {
          const can = canAcceptChallenge(s, def.id);
          const locked = isChallengeLocked(s, def.id);
          return (
            <div key={def.id} data-testid="challenge-offer" style={locked ? rowCardLocked : rowCard}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div><b>{def.title}</b> <span style={{ ...soft, fontSize: 13 }}>{TIER_STARS(def.tier)} · {def.days}일</span></div>
                  <div style={{ ...soft, fontSize: 13 }}>{def.desc || goalConditionText(def.condition)}</div>
                  <div style={{ fontSize: 13 }}><Icon name="gift" size={13} /> {rewardsText(def.reward)}</div>
                  {locked && <div style={{ fontSize: 13, color: PALETTE.bad }}>실패로 잠김 · {challengeLockDaysLeft(s, def.id)}일 뒤</div>}
                </div>
                <button data-tut={i === 0 ? 'challenge-accept' : undefined} data-testid="challenge-accept" style={can.ok ? rowBtn : rowBtnOff} disabled={!can.ok} aria-label={`${def.title} 수락`}
                  onClick={() => { const r = dispatch({ type: 'acceptChallenge', id: def.id }); if (!r.ok && r.reason) showToast(r.reason); }}>수락</button>
              </div>
            </div>
          );
        })}
        {s.challenges.done.length > 0 && <div style={{ ...soft, fontSize: 13, marginTop: 8 }}>이룬 도전 {s.challenges.done.length}개</div>}
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
      {tab === 'challenge' && renderChallenge()}
      {tab === 'monthly' && renderMonthly()}
    </div>
  );
}

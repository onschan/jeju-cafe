/** 「할 일」 창 (옛 목표 창).
 *  사용자 판단: "해야 할 도전거리를 숨겨 놓지 마."
 *  - [지금 할 일]: 동시에 굴러가는 5~7줄을 **한 화면에** — 메인 목표 2 + 등급 승급 + 이달의 과제 + 경쟁 2.
 *    줄마다 진행 막대·보상·「가는 법」 한 줄.
 *  - [앞으로]: 남은 목표 **전부**를 잠금 없이 (조건·보상 공개, 순서만 표시).
 *  - [지난]: 이룬 목표 체크 목록.
 *  줄 조립은 sim/todo.ts가 한다 — 여기서는 그리기만. */
import { useState } from 'react';
import { Icon } from '../Icon';
import { PALETTE } from '../frame';
import { body, Bar, rowCard, soft, Empty, TabBar, useWindowState, type WindowProps } from './shared.tsx';
import { pastGoals } from '../simBridge';
import { todoRows, upcomingGoals, TREND_NAME, type TodoRow, type TodoKind } from '../../sim/index.ts';
import { GOALS } from '../../data/index.ts';
import { useTutorialNote } from '../tutorialDialogue';
import { HalmangLine } from '../TutorialWindow';

export type GoalTab = 'now' | 'next' | 'done';
const TABS: { key: GoalTab; label: string }[] = [{ key: 'now', label: '지금 할 일' }, { key: 'next', label: '앞으로' }, { key: 'done', label: '지난' }];

/** 줄 종류별 머리 아이콘·꼬리표 */
const KIND_ICON: Record<TodoKind, string> = { goal: 'target', grade: 'home_cafe', monthly: 'calendar', rival: 'trophy', contest: 'medal' };
const KIND_TAG: Record<TodoKind, string> = { goal: '목표', grade: '등급', monthly: '이달', rival: '경쟁', contest: '대회' };

export interface GoalWindowProps extends WindowProps {
  onClose(): void;
  initialTab?: GoalTab;
  /** 지난 목표를 몇 개까지 보여줄까 (최근 것부터). 기본 8 */
  pastLimit?: number;
}

function Row({ r, big }: { r: TodoRow; big: boolean }) {
  const barColor = r.done ? PALETTE.ok : r.kind === 'rival' || r.kind === 'contest' ? '#c9743a' : PALETTE.bar;
  return (
    <div data-testid="todo-row" data-kind={r.kind} style={{ ...rowCard, borderColor: r.done ? PALETTE.ok : PALETTE.wood, borderWidth: big ? 3 : 2, padding: big ? 10 : 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ flex: 'none', color: PALETTE.title, display: 'flex', alignSelf: 'center' }}><Icon name={KIND_ICON[r.kind]} size={14} /></span>
        <span style={{ ...soft, flex: 'none', fontSize: 12 }}>{KIND_TAG[r.kind]}</span>
        <b data-testid="todo-row-title" style={{ flex: 1, minWidth: 0, fontSize: big ? 17 : 15, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</b>
        {r.done && <span style={{ flex: 'none', color: PALETTE.ok, display: 'flex' }}><Icon name="check" size={14} /></span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', margin: '5px 0 4px' }}>
        <Bar value={r.cur} max={r.max} height={12} color={barColor} />
        <b style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{r.valueText}</b>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>{r.how}</div>
      {r.rewardText && <div data-testid="todo-row-reward" style={{ ...soft, fontSize: 13 }}><Icon name="gift" size={12} /> {r.rewardText}</div>}
    </div>
  );
}

export function GoalWindow(props: GoalWindowProps) {
  const { s } = useWindowState(props);
  useTutorialNote('goalWindow'); // 튜토리얼 「목표 창 열어 보기」
  const [tab, setTab] = useState<GoalTab>(props.initialTab ?? 'now');
  const pastLimit = props.pastLimit ?? 8;

  const renderNow = () => {
    const rows = todoRows(s);
    return (
      <>
        <HalmangLine onFocus={props.onClose} />
        <div data-testid="todo-count" style={{ ...soft, marginBottom: 6 }}>지금 할 일 {rows.length}가지 — 아무 줄이나 먼저 채워도 돼요</div>
        {/* uifix: 상단 줄에서 내려온 이번 달 유행 — 한 달짜리 정보라 상시 줄이 아니라 이 창에 둔다 */}
        {s.trend && <div data-testid="trend-line" style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, fontSize: 13, fontWeight: 700, color: PALETTE.title }}><Icon name="look" size={14} />이번 달 유행 — {TREND_NAME[s.trend.category]}가 잘 나가요</div>}
        {rows.length === 0 && <Empty>지금은 할 일이 없어요. 마음껏 카페를 키워 보세요.</Empty>}
        {rows.map((r, i) => <Row key={r.key} r={r} big={i < 2} />)}
      </>
    );
  };

  const renderNext = () => {
    const list = upcomingGoals(s);
    return (
      <>
        <div style={{ ...soft, marginBottom: 6 }}>남은 목표 {list.length}개 — 조건과 보상을 모두 열어 뒀어요</div>
        {list.length === 0 && <Empty>목표를 전부 이뤘어요!</Empty>}
        {list.map((g) => (
          <div key={g.id} data-testid="goal-upcoming" style={{ padding: '6px 0', borderBottom: `1px solid ${PALETTE.paperDark}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ ...soft, flex: 'none', fontSize: 12, minWidth: 26 }}>{g.no}</span>
              <b style={{ flex: 1, minWidth: 0, fontSize: 15, color: g.active ? PALETTE.title : PALETTE.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</b>
              {g.active && <span style={{ flex: 'none', fontSize: 12, color: PALETTE.title }}>지금</span>}
            </div>
            <div style={{ fontSize: 13, paddingLeft: 32 }}>{g.conditionText}</div>
            <div style={{ ...soft, fontSize: 12, paddingLeft: 32 }}><Icon name="gift" size={11} /> {g.rewardText}</div>
          </div>
        ))}
      </>
    );
  };

  const renderDone = () => {
    const past = pastGoals(s);
    const shown = past.slice(-pastLimit).reverse();
    return (
      <>
        <div style={{ ...soft, marginBottom: 6 }}>이룬 목표 {past.length}/{GOALS.length}</div>
        {shown.length === 0 && <Empty>아직 이룬 목표가 없어요.</Empty>}
        {shown.map((g) => (
          // 375px: 제목·보상을 한 줄에 나란히 두면 좁은 제목 칸이 min-content까지 줄어 글자가 세로로 쏟아진다.
          <div key={g.id} data-testid="goal-past" style={{ padding: '5px 0', borderBottom: `1px solid ${PALETTE.paperDark}`, fontSize: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: PALETTE.ok, flex: '0 0 auto', display: 'flex' }}><Icon name="check" size={14} /></span>
              <span data-testid="goal-past-title" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'line-through', color: PALETTE.inkSoft }}>{g.title}</span>
            </div>
            <div data-testid="goal-past-reward" style={{ ...soft, fontSize: 12, paddingLeft: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.rewardText}</div>
          </div>
        ))}
        {past.length > shown.length && <div style={{ ...soft, fontSize: 13, marginTop: 4 }}>… 그 전 {past.length - shown.length}개</div>}
      </>
    );
  };

  return (
    <div style={body} data-testid="goal-window">
      <TabBar tabs={TABS} active={tab} onPick={setTab} testId="goal-tab" />
      {tab === 'now' && renderNow()}
      {tab === 'next' && renderNext()}
      {tab === 'done' && renderDone()}
    </div>
  );
}

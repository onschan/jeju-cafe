/** 동네 순위표 (장부 › 평가 맨 위).
 *  6곳(나 + 경쟁 카페 5)을 월간 순위로 · 변동 화살표 · 나와의 격차 · 발표 한 줄.
 *  아래로 ① 이달 뺏기 이벤트 대응 3갈래 ② 엔드게임(인수·제휴) 카드.
 *  계산은 sim/rival.ts가 한다 — 여기서는 그리기와 액션만. */
import { useEffect } from 'react';
import { useGame, dispatch } from './store';
import {
  battlePreview, battleRecord, battleRecordText, myBattleRecord, battleOpen, activeBattle, battleDay, battleState, battleResultLine,
  BATTLE_FROM_YEAR, BATTLE_SURRENDER_STREAK,
  scoreboard, rivalsState, rivalDef, activeSteal, stealTitle, canAnswerRival, rankGap,
  endgameOpen, endgameReason, canAllyRival, canAcquireRival, activeRivals, acquiredRivals,
  RIVAL_AXES, RIVAL_AXIS_LABEL, RIVAL_COUNTER_COST, RIVAL_DEVELOP_RESEARCH, RIVAL_DEVELOP_PENALTY,
  RIVAL_STEAL_PENALTY, RIVAL_ACQUIRE_COST, RIVAL_DEAL_MONTHLY, RIVAL_DEAL_AXIS_PCT, RIVAL_BOARD_DAY, RIVAL_RANK_BONUS,
  type RivalRow,
} from '../sim/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { card, brownBtn, brownBtnOff, dangerBtn, PALETTE } from './frame';
import { wonText } from '../data/labels.ts';
import { josa } from '../sim/josa.ts';
import { BattleBar } from './BattleBar';

const small = { fontSize: 13, color: PALETTE.inkSoft } as const;

/** 지난 발표 대비 오르내림 */
function Arrow({ r }: { r: RivalRow }) {
  if (r.prevRank === null) return <span style={{ ...small, minWidth: 22, textAlign: 'center' }}>–</span>;
  const d = r.prevRank - r.rank;
  if (d === 0) return <span style={{ ...small, minWidth: 22, textAlign: 'center' }}>=</span>;
  return (
    <span data-testid="rival-arrow" style={{ minWidth: 22, textAlign: 'center', fontSize: 13, fontWeight: 700, color: d > 0 ? PALETTE.ok : PALETTE.bad }}>
      {d > 0 ? '▲' : '▼'}{Math.abs(d)}
    </span>
  );
}

function BoardRow({ r, gapText, record }: { r: RivalRow; gapText: string; record?: string }) {
  return (
    <div data-testid={r.me ? 'rival-row-me' : 'rival-row'} style={{
      display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', gap: 6, alignItems: 'center',
      padding: '5px 6px', borderRadius: 4,
      background: r.me ? '#fff3dc' : 'transparent', border: `2px solid ${r.me ? PALETTE.wood : 'transparent'}`, marginBottom: 2,
    }}>
      <b style={{ minWidth: 26, fontSize: 15, color: r.rank === 1 ? '#c9741a' : PALETTE.ink }}>{r.rank}위</b>
      <Arrow r={r} />
      <span style={{ minWidth: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: 15, fontWeight: r.me ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
          {r.name}{r.me ? ' (우리)' : ''}{r.deal ? ' · 제휴' : ''}
        </span>
        {gapText && <span style={{ ...small, fontSize: 12 }}>{gapText}</span>}
      </span>
      <span data-testid={r.me ? 'battle-record-me' : 'battle-record'} style={{ ...small, minWidth: 54, textAlign: 'right', whiteSpace: 'nowrap' }}>{record ?? ''}</span>
      <b style={{ fontSize: 15, whiteSpace: 'nowrap' }}>{r.total}</b>
    </div>
  );
}

/** 이달 뺏기 이벤트 대응 — 맞불 홍보 / 메뉴 개발 / 무시 */
function StealCard() {
  const s = useGame();
  const st = activeSteal(s);
  if (!st) return null;
  const def = rivalDef(st.rivalId);
  if (st.answer !== 'none') {
    const done = st.answer === 'counter' ? '맞불 홍보로 손님을 지켰어요' : st.answer === 'develop' ? `메뉴로 받았어요 — 손님 ${Math.round(RIVAL_DEVELOP_PENALTY * 100)}%만 줄어요` : `그냥 뒀어요 — 이달 손님 ${Math.round(RIVAL_STEAL_PENALTY * 100)}% 줄어요`;
    return <div style={{ ...card, borderColor: PALETTE.woodLight }} data-testid="rival-steal-done"><b>{stealTitle(s)}</b><div style={small}>{done}</div></div>;
  }
  const counterOk = canAnswerRival(s, 'counter').ok;
  const go = (choice: 'counter' | 'develop' | 'ignore') => dispatch({ type: 'answerRival', choice });
  return (
    <div style={{ ...card, borderColor: PALETTE.bad }} data-testid="rival-steal">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="warn" />
        <b style={{ flex: 1 }}>{stealTitle(s)}</b>
      </div>
      <div style={{ fontSize: 13, fontStyle: 'italic', color: PALETTE.inkSoft, margin: '4px 0' }}>“{def.line}”</div>
      <div style={{ fontSize: 13 }}>그냥 두면 이달 손님이 {Math.round(RIVAL_STEAL_PENALTY * 100)}% 줄어요</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        <button data-testid="rival-counter" disabled={!counterOk} style={{ ...(counterOk ? brownBtn : brownBtnOff), margin: 0, flex: '1 1 40%' }} onClick={() => go('counter')}>
          맞불 홍보 {wonText(RIVAL_COUNTER_COST)}
        </button>
        <button data-testid="rival-develop" style={{ ...brownBtn, margin: 0, flex: '1 1 40%' }} onClick={() => go('develop')}>
          메뉴 개발 · 연구 +{RIVAL_DEVELOP_RESEARCH}
        </button>
        <button data-testid="rival-ignore" style={{ ...dangerBtn, margin: 0, flex: '1 1 100%' }} onClick={() => go('ignore')}>무시하기</button>
      </div>
    </div>
  );
}

/** 엔드게임: 인수·제휴 (5년차·등급 4·1위 3달) */
function EndgameCard() {
  const s = useGame();
  const open = endgameOpen(s);
  const got = acquiredRivals(s);
  return (
    <div style={{ ...card, opacity: open ? 1 : 0.75 }} data-testid="rival-endgame">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="hand" />
        <b style={{ flex: 1 }}>인수 · 제휴</b>
      </div>
      {!open && <div style={{ fontSize: 13, color: PALETTE.bad }}>{endgameReason(s)}</div>}
      <div style={small}>인수 {wonText(RIVAL_ACQUIRE_COST)} · 그 카페 손님이 넘어오고 시설 하나가 딸려 와요<br />제휴 월 {wonText(RIVAL_DEAL_MONTHLY)} · 그 집이 잘하는 항목이 {Math.round(RIVAL_DEAL_AXIS_PCT * 100)}% 올라요</div>
      {activeRivals(s).map((d) => {
        const deal = rivalsState(s).cafes[d.id]?.deal ?? false;
        const ally = canAllyRival(s, d.id);
        const acq = canAcquireRival(s, d.id);
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '4px 0', borderTop: `1px solid ${PALETTE.paperDark}` }}>
            <span style={{ flex: '1 1 100%', fontSize: 14 }}><b>{d.name}</b> <span style={small}>{d.concept} · {josa(RIVAL_AXIS_LABEL[d.strength], '이/가')} 강해요</span></span>
            {deal ? (
              <button style={{ ...dangerBtn, margin: 0, flex: 1 }} onClick={() => dispatch({ type: 'endAllyRival', id: d.id })}>제휴 끝내기</button>
            ) : (
              <button data-testid="rival-ally" disabled={!ally.ok} title={ally.reason} style={{ ...(ally.ok ? brownBtn : brownBtnOff), margin: 0, flex: 1 }} onClick={() => dispatch({ type: 'allyRival', id: d.id })}>제휴</button>
            )}
            <button data-testid="rival-acquire" disabled={!acq.ok} title={acq.reason} style={{ ...(acq.ok ? brownBtn : brownBtnOff), margin: 0, flex: 1 }}
              onClick={() => Confirm(`${d.name}를 ${wonText(RIVAL_ACQUIRE_COST)}에 인수합니다. 그 집 손님이 우리에게 와요.`, () => dispatch({ type: 'acquireRival', id: d.id }), { title: '인수' })}>인수</button>
          </div>
        );
      })}
      {got.length > 0 && <div style={{ ...small, marginTop: 4 }}>인수한 곳: {got.map((d) => d.name).join(' · ')}</div>}
    </div>
  );
}


/** 동네 대항전 — 예고(상대·전적·예상 승률) · 진행 중 비교 바 · 지난 결과 */
function BattleCard() {
  const s = useGame();
  const st = battleState(s);
  const round = activeBattle(s);
  const last = st.last;
  if (!battleOpen(s)) {
    return (
      <div style={{ ...card, opacity: 0.75 }} data-testid="battle-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="rival" /><b style={{ flex: 1 }}>동네 대항전</b></div>
        <div style={small}>{BATTLE_FROM_YEAR}년차부터 매월 마지막 주 토요일에 한 곳과 붙어요</div>
      </div>
    );
  }
  const p = battlePreview(s);
  return (
    <div style={card} data-testid="battle-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="rival" />
        <b style={{ flex: 1 }}>동네 대항전</b>
        <span style={small}>매월 {battleDay()}일</span>
      </div>
      {round ? (
        <>
          <div style={{ fontSize: 14, margin: '4px 0' }}>{josa(rivalDef(round.rivalId).name, '과/와')} 붙는 중이에요</div>
          <BattleBar />
        </>
      ) : p ? (
        <div data-testid="battle-preview">
          <div style={{ fontSize: 15, marginTop: 2 }}><b>{p.def.name}</b> <span style={small}>{p.def.concept}</span></div>
          <div style={{ fontSize: 14, marginTop: 2 }}>
            {p.daysLeft === 0 ? '오늘 붙어요' : `${p.daysLeft}일 뒤에 붙어요`} · 전적 {battleRecordText(p.record)}
          </div>
          <div style={{ fontSize: 14 }}>예상 승률 {p.chancePct}% <span style={small}>({p.myScore} 대 {p.theirScore})</span></div>
          <div style={small}>{BATTLE_SURRENDER_STREAK}연승이면 그 집이 손을 들어요</div>
        </div>
      ) : (
        <div style={small}>더 붙을 곳이 없어요 — 동네가 우리 차지예요</div>
      )}
      {last && <BattleResultRow />}
    </div>
  );
}

/** 결과 한 줄: 승패·점수·오간 단골 이름·순위 변동 */
function BattleResultRow() {
  const s = useGame();
  const r = battleState(s).last;
  if (!r) return null;
  const rankMoved = r.rankBefore !== null && r.rankAfter !== null && r.rankBefore !== r.rankAfter;
  return (
    <div data-testid="battle-result" style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${PALETTE.paperDark}` }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: r.won ? PALETTE.ok : PALETTE.bad }}>{battleResultLine(r)}</div>
      {r.moved.length > 0 && (
        <div style={{ fontSize: 14 }}>
          {r.moved[0]!.to === 'us' ? '우리 쪽으로 온 단골' : '그 집으로 간 단골'}: {r.moved.map((m) => `${m.name}(${m.typeName})`).join(' · ')}
        </div>
      )}
      {r.prize > 0 && <div style={small}>상금 {wonText(r.prize)}</div>}
      {rankMoved && <div style={small}>동네 {r.rankBefore}위에서 {r.rankAfter}위로</div>}
    </div>
  );
}

/** 동네 순위표 한 장 */
export function RivalBoard() {
  const s = useGame();
  const st = rivalsState(s);
  const rows = scoreboard(s);
  const me = rows.find((r) => r.me)!;
  const { above, gap } = rankGap(rows);
  // 안 본 발표는 여기서 본 것으로 친다 (평가 탭 배지가 꺼진다)
  useEffect(() => { if (st.pending) dispatch({ type: 'dismissRivalBoard' }); }, [st.pending]);
  const bonus = RIVAL_RANK_BONUS[me.rank - 1] ?? 0;
  return (
    <div data-testid="rival-board">
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <Icon name="rival" />
          <b style={{ flex: 1, fontSize: 16 }}>동네 순위</b>
          <span style={small}>매월 {RIVAL_BOARD_DAY}일 발표</span>
        </div>
        {st.line && <div data-testid="rival-line" style={{ fontSize: 14, margin: '4px 0' }}>{st.line}</div>}
        <div style={{ marginTop: 4 }}>
          {rows.map((r) => (
            <BoardRow key={r.id} r={r} record={battleRecordText(r.me ? myBattleRecord(s) : battleRecord(s, r.id))}
              gapText={r.me ? (above ? `${above.name}와 ${gap}점 차` : '동네에서 제일 잘 나가요') : ''} />
          ))}
        </div>
        <div style={{ ...small, marginTop: 4 }}>
          {bonus > 0 ? `${me.rank}위라서 손님이 ${Math.round(bonus * 100)}% 더 와요` : '3위 안에 들면 손님이 더 와요'}
          {st.leadMonths > 0 ? ` · 1위 ${st.leadMonths}달째` : ''}
        </div>
        <div style={{ ...small, marginTop: 4 }}>
          보는 항목: {RIVAL_AXES.map((a) => `${RIVAL_AXIS_LABEL[a]} ${Math.round(me.axes[a])}`).join(' · ')}
        </div>
      </div>
      <BattleCard />
      <StealCard />
      <EndgameCard />
    </div>
  );
}

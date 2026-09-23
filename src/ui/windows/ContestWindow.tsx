/** 대회 접수 창 (장부 › 대회). video-patch §3.1.4 1단계.
 *  판단에 필요한 숫자를 한 화면에 둔다(§2.4 원칙 4): 참가비 · 성공 확률 · 예상 점수 범위 · 상대 3명 · 예상 순위 · 상금.
 *  「무엇을 키우면 오르나」 줄이 심사 4항목마다 메뉴·직원·칭호·연수·자급 재료 기여를 그대로 보여 준다 — 대회는 기존 육성의 출구다. */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import {
  contestUnlocked, signupOpen, nextContest, daysToContest, contestTitle, contestMenus, contestStaff, contestOdds, canEnterContest, canCancelContest,
  judgeScore, menuOf, chanceText, trainingNameFor, contestHistory, trophyOwned, trophyPlaced, contestCurrentRivalNames,
  CONTESTS, CONTEST_JUDGE_KEYS, CONTEST_JUDGE_LABEL, CONTEST_GRADE, SIGNUP_DAYS, PRIZE_MULT, CONTEST_TICKETS, TROPHY_TYPE,
  type ContestEvent, type ContestJudge, type ContestResult,
} from '../../sim/index.ts';
import { wonText } from '../../data/labels.ts';
import { Icon } from '../Icon';
import { Bar } from '../Bars';
import { ButtonGroup } from '../ButtonGroup';
import { Confirm } from '../Popup';
import { card, brownBtn, brownBtnOff, brownBtnOn, dangerBtn, PALETTE } from '../frame';

const small = { fontSize: 13, color: PALETTE.inkSoft } as const;
const RANK_MARK = ['금', '은', '동', ''];

/** 종목마다 가중치가 가장 큰 심사 항목 */
function mainJudge(event: ContestEvent): ContestJudge {
  const w = CONTESTS.find((c) => c.id === event)!.weights;
  return [...CONTEST_JUDGE_KEYS].sort((a, b) => w[b] - w[a])[0]!;
}

export function ContestRow({ r }: { r: ContestResult }) {
  const def = CONTESTS.find((c) => c.id === r.event);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, padding: '2px 0' }}>
      <span style={{ width: 62, color: PALETTE.inkSoft }}>{r.year}년 {r.month}월</span>
      <span style={{ width: 56 }}>{def?.name ?? ''}</span>
      <b style={{ color: r.rank === 1 ? '#b8860b' : PALETTE.ink }}>{r.rank}위</b>
      <span style={small}>{r.myScore}점 · {r.staffName}</span>
      {r.best && <span style={{ color: PALETTE.bad, fontWeight: 700 }}>신기록</span>}
    </div>
  );
}

/** 심사 항목 한 줄: 막대 + 기여 내역 */
function JudgeRow({ k, weight, total, parts }: { k: ContestJudge; weight: number; total: number; parts: { menu: number; staff: number; title: number; training: number; supply: number } }) {
  const bits = [`메뉴 ${parts.menu}`];
  if (parts.staff > 0) bits.push(`직원 +${parts.staff}`);
  if (parts.title > 0) bits.push(`칭호 +${parts.title}`);
  if (parts.training > 0) bits.push(`${trainingNameFor(k)} +${parts.training}`);
  if (parts.supply > 0) bits.push(`자급 재료 +${parts.supply}`);
  return (
    <div style={{ marginBottom: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
        <span style={{ width: 44 }}>{CONTEST_JUDGE_LABEL[k]}</span>
        <Bar value={total} max={100} width={110} color={PALETTE.bar} />
        <b style={{ width: 34, textAlign: 'right' }}>{total}</b>
        <span style={small}>비중 {Math.round(weight * 100)}%</span>
      </div>
      <div style={{ ...small, paddingLeft: 50 }}>{bits.join(' · ')}</div>
    </div>
  );
}

export function ContestWindow() {
  const s = useGame();
  const [event, setEvent] = useState<ContestEvent>('espresso');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const c = s.contest;
  const next = nextContest(s);
  const left = daysToContest(s);
  const open = signupOpen(s);
  const history = contestHistory(s);
  const trophies = trophyOwned(s, TROPHY_TYPE);

  if (!contestUnlocked(s)) {
    return <div style={card} data-testid="contest-locked">등급 {CONTEST_GRADE}이 되면 대회에 나갈 수 있어요.</div>;
  }

  const def = CONTESTS.find((d) => d.id === event)!;
  const staffList = contestStaff(s, event);
  const menus = contestMenus(s, event);
  const pickedStaff = staffList.find((x) => x.id === staffId) ?? staffList[0] ?? null;
  const pickedMenu = menus.includes(menuId ?? '') ? menuId! : menus[0] ?? null;
  const odds = pickedStaff && pickedMenu ? contestOdds(s, event, pickedStaff.id, pickedMenu) : null;
  const can = pickedStaff && pickedMenu ? canEnterContest(s, event, pickedStaff.id, pickedMenu) : { ok: false, reason: '낼 직원과 메뉴가 있어야 해요' };

  const enter = () => {
    if (!pickedStaff || !pickedMenu) return;
    Confirm(`${contestTitle(next.month, event)}에 ${pickedStaff.name} 씨를 내보냅니다. 참가비 ${wonText(def.fee)}`, () => dispatch({ type: 'enterContest', event, staffId: pickedStaff.id, menuId: pickedMenu }), { title: '대회 접수' });
  };

  return (
    <div data-testid="contest-window">
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <b style={{ flex: 1, fontSize: 16 }}><Icon name="trophy" /> {next.month === 6 ? '제주 바리스타 대회' : '제주 카페 경연'}</b>
          <span style={{ fontSize: 13, color: open ? PALETTE.bad : PALETTE.inkSoft }}>{left === 0 ? '오늘 열려요' : `${next.year}년 ${next.month}월 1일 · ${left}일 남음`}</span>
        </div>
        <div style={small}>연 2회 6월·12월에 열려요. 접수는 이레 전부터 당일 아침까지.</div>
        {trophies > 0 && <div style={{ fontSize: 13, marginTop: 4 }}>받은 상패 {trophies}개 (실내에 놓은 것 {trophyPlaced(s, TROPHY_TYPE)}개)</div>}
      </div>

      {c?.entry ? (
        <div style={card} data-testid="contest-entered">
          <b>접수했어요 — {CONTESTS.find((d) => d.id === c.entry!.event)?.name}</b>
          <div style={{ fontSize: 14 }}>{s.staff.find((x) => x.id === c.entry!.staffId)?.name ?? '직원'} 씨가 {menuOf(s, c.entry!.menuId).name}을 냅니다</div>
          <div style={small}>대회 날 아침에 결과가 나와요. 그날 이 직원은 자리를 비워요.</div>
          <button style={{ ...(canCancelContest(s).ok ? dangerBtn : brownBtnOff), marginTop: 6, marginBottom: 0 }} disabled={!canCancelContest(s).ok}
            onClick={() => Confirm('접수를 물릴까요? 참가비는 돌려받아요.', () => dispatch({ type: 'cancelContest' }), { title: '접수 무르기' })}>무르기</button>
        </div>
      ) : (
        <>
          <div style={{ fontWeight: 700, margin: '0 0 4px' }}>종목 고르기</div>
          {CONTESTS.map((d) => {
            const on = d.id === event;
            return (
              <button key={d.id} onClick={() => { setEvent(d.id); setStaffId(null); setMenuId(null); }} data-testid={`contest-event-${d.id}`}
                style={{ ...(on ? brownBtnOn : brownBtn), display: 'block', width: '100%', textAlign: 'left', minHeight: 56, padding: '6px 10px', marginRight: 0, fontSize: 15 }}>
                <b>{d.name}</b> <span style={{ fontSize: 14, fontWeight: 400 }}>참가비 {wonText(d.fee)}</span>
                <div style={{ fontSize: 13, fontWeight: 400, opacity: 0.9 }}>심사는 「{CONTEST_JUDGE_LABEL[mainJudge(d.id)]}」을 가장 크게 봐요</div>
                <div style={{ fontSize: 13, fontWeight: 400, opacity: 0.9 }}>{d.desc}</div>
              </button>
            );
          })}

          <div style={card}>
            <div style={{ fontWeight: 700 }}>내보낼 직원</div>
            {staffList.length === 0
              ? <div style={small}>{def.roles.includes('cook') ? '바리스타나 요리사' : '바리스타'}를 배치해야 나갈 수 있어요.</div>
              : <ButtonGroup label="출전 직원" value={pickedStaff?.id ?? ''} onPick={setStaffId} testId="contest-staff"
                  options={staffList.map((x) => ({ value: x.id, label: x.name }))} />}
            <div style={{ fontWeight: 700, marginTop: 8 }}>낼 메뉴</div>
            {menus.length === 0
              ? <div style={small}>메뉴판에 낼 만한 메뉴가 없어요. {def.categories[0] === 'signature' ? '시그니처를 개발해 올려 보세요.' : '음료를 한 가지 올려 보세요.'}</div>
              : <ButtonGroup label="출전 메뉴" value={pickedMenu ?? ''} onPick={setMenuId} testId="contest-menu"
                  options={menus.map((id) => ({ value: id, label: menuOf(s, id).name }))} />}
          </div>

          {odds && pickedStaff && pickedMenu && (
            <div style={card} data-testid="contest-odds">
              <div style={{ fontWeight: 700, marginBottom: 4 }}>심사 4항목 예상</div>
              {CONTEST_JUDGE_KEYS.map((k) => {
                const j = judgeScore(s, k, pickedStaff, pickedMenu);
                return <JudgeRow key={k} k={k} weight={def.weights[k]} total={j.total} parts={j} />;
              })}
              <div style={{ borderTop: `1px dashed ${PALETTE.woodLight}`, margin: '6px 0' }} />
              <div style={{ fontSize: 15 }}>내 예상 점수 <b>{odds.base}</b> <span style={small}>(쪽박 {odds.low} ~ 대박 {odds.high})</span></div>
              <div style={{ fontSize: 14 }} data-testid="contest-rivals">상대 {contestCurrentRivalNames(s, event).map((n, i) => `${n} ${odds.rivals[i] ?? '-'}`).join(' · ')}</div>
              <div style={{ fontSize: 15 }}>예상 순위 <b style={{ color: odds.rank === 1 ? '#b8860b' : PALETTE.ink }}>{odds.rank}위</b> <span style={small}>(잘 되면 {odds.bestRank}위 · 나쁘면 {odds.worstRank}위)</span></div>
              <div style={{ fontSize: 14 }}>{chanceText(odds.chances)} · 우승 확률 <b>{odds.winPct}%</b></div>
              <div style={small}>1위 상금 {wonText(def.fee * PRIZE_MULT[0]!)} · 2위 {wonText(def.fee * PRIZE_MULT[1]!)} · 3위 {wonText(def.fee * PRIZE_MULT[2]!)} · 4위는 참가상 응모권 {CONTEST_TICKETS[3]}</div>
            </div>
          )}

          <button style={{ ...(can.ok ? brownBtn : brownBtnOff), width: '100%', marginRight: 0 }} disabled={!can.ok} onClick={enter} data-testid="contest-enter">
            {open ? `접수하기 ${wonText(def.fee)}` : `접수는 대회 ${SIGNUP_DAYS}일 전부터`}
          </button>
          {!can.ok && can.reason && <div style={{ ...small, color: PALETTE.bad }}>{can.reason}</div>}
        </>
      )}

      <div style={{ fontWeight: 700, margin: '8px 0 4px' }}>지난 대회</div>
      {history.length === 0 ? <div style={small}>아직 나간 대회가 없어요.</div> : history.map((r, i) => <ContestRow key={i} r={r} />)}
    </div>
  );
}

/** 도감 「대회」 줄 (사람 › 도감). 트로피 진열과 우승 이력. */
export function ContestCodex() {
  const s = useGame();
  const history = contestHistory(s);
  const owned = trophyOwned(s, TROPHY_TYPE);
  const wins = history.filter((r) => r.rank === 1).length;
  const best = history.length ? Math.min(...history.map((r) => r.rank)) : null;
  return (
    <div style={{ marginTop: 6 }} data-testid="contest-codex">
      <div style={{ ...small, margin: '0 0 4px' }}>
        대회 도감 · {history.length}회 출전 · 우승 {wins}회{best !== null ? ` · 최고 ${best}위` : ''} · 상패 {owned}개
      </div>
      {history.length === 0
        ? <div style={small}>연 2회 6월·12월에 대회가 열려요. 등급 {CONTEST_GRADE}부터 나갈 수 있어요.</div>
        : history.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13 }}>
            <span style={{ width: 18, textAlign: 'center', color: '#b8860b' }}>{RANK_MARK[r.rank - 1] ?? ' '}</span>
            <ContestRow r={r} />
          </div>
        ))}
    </div>
  );
}

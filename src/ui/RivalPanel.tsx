import { useEffect, useState } from 'react';
import { ButtonGroup } from './ButtonGroup';
import { useGame, dispatch } from './store';
import { rivalMonths, rivalPower, judgeBreakdown, challengeOdds, canChallenge, menuStatsOf, menuOf, rivalStatPenaltyPct, josa, RIVAL_LEAVE_MONTHS, JUDGE_LUCK, type RivalState, type MenuStatKey } from '../sim/index.ts';
import { rivalDef, namedGuestDef, MENU_STAT_LABEL } from '../data/index.ts';
import { Popup } from './Popup';
import { Bar } from './Bars';
import { card, brownBtn, brownBtnOn, brownBtnOff, PALETTE } from './frame';

const SIZE_LABEL: Record<string, string> = { small: '소형', medium: '중형', large: '대형' };

/** 대결 메뉴 고르기 (카드 안에 펼침): 아는 메뉴 전부, 항목별 예상 점수와 승산 */
function ChallengePicker({ r, onClose }: { r: RivalState; onClose: () => void }) {
  const s = useGame();
  const def = rivalDef(r.rivalId);
  const menus = [...new Set([...s.menuSlots.filter((m): m is string => !!m), ...s.unlocked.menus, ...s.customMenus.map((m) => m.id)])];
  const [menuId, setMenuId] = useState<string>(menus[0] ?? '');
  const power = rivalPower(def, s.clock.year);
  const bd = menuId ? judgeBreakdown(def, menuStatsOf(s, menuId)) : null;
  const odds = menuId ? challengeOdds(s, r.id, menuId) : 0;
  const can = menuId ? canChallenge(s, r.id, menuId) : { ok: false, reason: '메뉴가 없어요' };
  return (
    <div style={{ marginTop: 8, borderTop: `2px solid ${PALETTE.woodLight}`, paddingTop: 6 }} data-testid="challenge-picker">
      <div style={{ fontSize: 13, marginBottom: 6 }}>심사 기준: {Object.entries(def.judge).map(([k, w]) => `${MENU_STAT_LABEL[k as MenuStatKey]} ${Math.round((w ?? 0) * 100)}%`).join(' · ')} · 라이벌 점수 <b>{power}</b> (+ 우리 운 0~{JUDGE_LUCK})</div>
      <ButtonGroup label="대결 메뉴" value={menuId} onPick={setMenuId}
        options={menus.map((m) => ({ value: m, label: `${menuOf(s, m).name} ${judgeBreakdown(def, menuStatsOf(s, m)).total}` }))} />
      {bd && (
        <div style={{ fontSize: 13, marginTop: 4 }}>
          {Object.entries(bd.breakdown).map(([k, v]) => `${MENU_STAT_LABEL[k as MenuStatKey]} ${v}`).join(' · ')}
          <div style={{ marginTop: 2 }}>예상 <b>{bd.total}</b> vs {power} · 승산 <b style={{ color: odds >= 0.5 ? PALETTE.ok : PALETTE.bad }}>{Math.round(odds * 100)}%</b>{!can.ok && <span style={{ color: PALETTE.bad }}> · {can.reason}</span>}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button style={{ ...brownBtn, marginBottom: 0 }} onClick={onClose}>취소</button>
        <button style={{ ...(can.ok ? brownBtnOn : brownBtnOff), marginBottom: 0 }} disabled={!can.ok} onClick={() => { if (dispatch({ type: 'challenge', rivalId: r.id, menuId }).ok) onClose(); }} aria-label="대결 시작">대결!</button>
      </div>
    </div>
  );
}

function RivalCard({ r }: { r: RivalState }) {
  const s = useGame();
  const [pick, setPick] = useState(false);
  const def = rivalDef(r.rivalId);
  const months = rivalMonths(s, r);
  return (
    <div style={{ ...card, borderColor: PALETTE.bad }} data-testid={`rival-${r.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <b style={{ flex: 1 }}>VS {def.name} <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{SIZE_LABEL[def.size]}</span></b>
        <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{months}개월째 · {RIVAL_LEAVE_MONTHS - months}달 뒤 철수</span>
      </div>
      <div style={{ fontSize: 13, fontStyle: 'italic', color: PALETTE.inkSoft, margin: '4px 0' }}>“{def.line}”</div>
      <div style={{ fontSize: 13 }}>
        매월 단골★ {def.stealPerMonth}명 이탈 · 양·보기 −{def.statPenalty}%씩 (지금 −{r.penaltyPct}%){def.bankruptMonthly ? ` · 월 ${def.bankruptMonthly}% 자체 파산` : ''}
        {r.stolen.length > 0 && <div style={{ color: PALETTE.bad }}>빼앗긴 단골: {r.stolen.map((id) => namedGuestDef(id).name).join('·')}</div>}
      </div>
      {!pick && <button style={{ ...brownBtnOn, marginTop: 6, marginBottom: 0 }} onClick={() => setPick(true)} aria-label={`${josa(def.name, '과/와')} 대결`}>대결 (메뉴 승부)</button>}
      {pick && <ChallengePicker r={r} onClose={() => setPick(false)} />}
    </div>
  );
}

/** 손님 탭 라이벌 소탭: 라이벌 카드 + 대결 */
export function RivalPanel() {
  const s = useGame();
  const pen = rivalStatPenaltyPct(s);
  return (
    <div data-testid="rival-panel">
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>
        {s.rivals.length === 0 ? '지금은 라이벌 카페가 없어요. 3년차부터 근처에 생길 수 있어요.' : `라이벌 ${s.rivals.length}곳 · 우리 메뉴 양·보기 −${pen}% · 대결에서 이기면 철수하고 마일리지 +2, 지면 인기 −5`}
      </div>
      {s.rivals.map((r) => <RivalCard key={r.id} r={r} />)}
    </div>
  );
}

/** 대결 결과: 심사 게이지가 차오른 뒤 승패 (1.2초 애니). dismissChallenge로 닫는다. */
export function ChallengePopup() {
  const s = useGame();
  const res = s.lastChallenge;
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!res) return;
    setT(0);
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => { const x = Math.min(1, (now - start) / 1200); setT(x); if (x < 1) raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [res]);
  if (!res) return null;
  const def = rivalDef(res.rivalId);
  const max = Math.max(res.score, res.power, 1) * 1.15;
  const done = t >= 1;
  return (
    <Popup title={`카페 대결 — ${def.name}`} onBackdrop={done ? () => dispatch({ type: 'dismissChallenge' }) : undefined}
      buttons={<button style={{ ...brownBtn, marginRight: 0 }} disabled={!done} onClick={() => dispatch({ type: 'dismissChallenge' })}>확인</button>}>
      <div data-testid="challenge-popup" style={{ fontSize: 14 }}>
        <div>우리 메뉴 <b>{res.menuName}</b></div>
        <div style={{ margin: '6px 0' }}>
          {Object.entries(res.breakdown).map(([k, v]) => (
            <div key={k} style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{MENU_STAT_LABEL[k as MenuStatKey]} <Bar value={(v ?? 0) * t} max={max / 2} width={100} color={PALETTE.ok} /> {done ? v : ''}</div>
          ))}
          <div style={{ fontSize: 13, whiteSpace: 'nowrap' }}>운 <Bar value={res.luck * t} max={max / 2} width={100} color={PALETTE.btnOn} /> {done ? res.luck : ''}</div>
        </div>
        <div style={{ whiteSpace: 'nowrap' }}>우리 <Bar value={res.score * t} max={max} width={140} color={PALETTE.ok} /> <b>{done ? res.score : ''}</b></div>
        <div style={{ whiteSpace: 'nowrap' }}>{def.name} <Bar value={res.power * t} max={max} width={140} color={PALETTE.bad} /> <b>{done ? res.power : ''}</b></div>
        {done && (
          <div style={{ marginTop: 8, fontWeight: 700, color: res.win ? PALETTE.ok : PALETTE.bad }} data-testid="challenge-result">
            {res.win ? `승리! ${josa(def.name, '이/가')} 철수했어요 · 마일리지 +2` : `패배… 인기 −5. 다음 달에 다시 도전해요`}
          </div>
        )}
      </div>
    </Popup>
  );
}

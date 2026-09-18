/** 직원 창 (스펙 §4.3). 하위 탭: 우리 직원 / 채용 후보. 카드 1열: 파츠 초상·이름·직종·4스탯 바·급여·에너지·레벨.
 *  버튼: 승급(연구 비용)·해고(확인)·후보는 채용(급여)·공고 내기(등급별 비용). sim 액션은 기존 StaffPanel과 같다(postJob·hire·fire·assign·levelUp). */
import { useEffect, useRef, useState } from 'react';
import type { GameState, Staff, Candidate, RoleId, StatKey, JobTier, Face } from '../../sim/index.ts';
import { TIERS, MAX_LEVEL, LOW_ENERGY, STAT_KEYS, levelUpCost, canHire, canLevelUp, staffInRole, postJobCost } from '../../sim/index.ts';
import { ROLES } from '../../data/index.ts';
import { label } from '../../data/labels.ts';
import { PALETTE, brownBtn, brownBtnOff, brownSelect } from '../frame';
import { drawPortrait, PORTRAIT_SIZE } from '../../render/portrait';
import { partsOfFace, staffParts, HAIR_RGB, SKIN_RGB, TOP_RGB } from '../../render/character';
import { useWindowState, body, TabBar, Bar, rowCard, rowCardOn, rowBtn, rowBtnOn, rowBtnOff, rowBtnDanger, soft, Empty, ConfirmRow, win, type Dispatch, type WindowProps } from './shared.tsx';

const TIER_ORDER: JobTier[] = ['flyer', 'site', 'headhunter'];
const TIER_NAME: Record<JobTier, string> = { flyer: '전단 공고', site: '구인 사이트', headhunter: '헤드헌터' };
/** v3에서 없어지는 직종(밭)은 목록에서 뺀다 */
const HIDDEN_ROLES = new Set<string>(['field']);
const css = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
type Tab = 'ours' | 'candidates';

/** 파츠 초상 48px. 시트가 아직 없으면(Pixi 미로드) 머리·피부·상의 색 상자로 대신한다. */
export function Portrait({ face, role, size = 48 }: { face: Face; role: RoleId | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (ref.current) setOk(drawPortrait(ref.current, staffParts(face, role))); }, [face.hair, face.skin, face.top, role]);
  const p = partsOfFace(face);
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flex: '0 0 auto', border: `2px solid ${PALETTE.wood}`, borderRadius: 6, background: PALETTE.paperDark, overflow: 'hidden' }} aria-label="초상">
      {!ok && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateRows: '1fr 1fr 1fr' }}>
          <span style={{ background: css(HAIR_RGB[p.hairColor] ?? 0) }} />
          <span style={{ background: css(SKIN_RGB[p.skin] ?? 0) }} />
          <span style={{ background: css(TOP_RGB[p.top] ?? 0) }} />
        </span>
      )}
      <canvas ref={ref} width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} style={{ position: 'absolute', inset: 0, width: size, height: size, imageRendering: 'pixelated', visibility: ok ? 'visible' : 'hidden' }} />
    </span>
  );
}

function StatRows({ stats }: { stats: Staff['stats'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '3px 8px', alignItems: 'center', fontSize: 14, margin: '6px 0' }}>
      {STAT_KEYS.map((k) => (
        <span key={k} style={{ display: 'contents' }}>
          <span>{label('stat', k)}</span>
          <Bar value={stats[k]} max={100} />
          <span style={{ minWidth: 24, textAlign: 'right' }}>{stats[k]}</span>
        </span>
      ))}
    </div>
  );
}

/** 열려 있고 자리가 남은 직종 (지금 맡은 직종은 항상 포함) */
function openRoles(s: GameState, keep: RoleId | null = null): RoleId[] {
  return ROLES.map((r) => r.id).filter((id) => !HIDDEN_ROLES.has(id) && s.unlocked.roles.includes(id) && (id === keep || staffInRole(s, id).length < (s.slots[id] ?? 0)));
}

function StaffCard({ st, s, dispatch }: { st: Staff; s: GameState; dispatch: Dispatch }) {
  const [promoting, setPromoting] = useState(false);
  const [firing, setFiring] = useState(false);
  const roles = openRoles(s, st.role);
  const maxed = st.level >= MAX_LEVEL;
  const energyColor = st.energy < LOW_ENERGY ? PALETTE.bad : PALETTE.ok;
  return (
    <div style={promoting ? rowCardOn : rowCard} data-testid={`staff-${st.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Portrait face={st.face} role={st.role} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{st.name}</b>
            <span style={{ fontSize: 14 }}>{st.role ? label('role', st.role) : '쉬는 중'} · Lv.{st.level}</span>
          </div>
          <div style={soft}>월급 {win(st.salary)} · {label('skill', st.skill)}{st.unpaidMonths > 0 && <span style={{ color: PALETTE.bad }}> · 월급 밀림 {st.unpaidMonths}달</span>}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '3px 8px', alignItems: 'center', fontSize: 14, marginTop: 6 }}>
        <span>에너지</span><Bar value={st.energy} max={100} color={energyColor} /><span style={{ minWidth: 24, textAlign: 'right' }}>{Math.round(st.energy)}</span>
      </div>
      <StatRows stats={st.stats} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <select value={st.role ?? ''} onChange={(e) => dispatch({ type: 'assign', staffId: st.id, role: (e.target.value || null) as RoleId | null })} style={{ ...brownSelect, margin: 0, flex: '1 1 100px' }} aria-label="직종">
          <option value="">쉬기</option>
          {roles.map((r) => <option key={r} value={r}>{label('role', r)}</option>)}
        </select>
        <button style={maxed ? rowBtnOff : promoting ? rowBtnOn : rowBtn} disabled={maxed} onClick={() => { setPromoting(!promoting); setFiring(false); }} aria-label={`${st.name} 승급`}>
          {maxed ? '최고 레벨' : '승급'}
        </button>
        <button style={rowBtnDanger} onClick={() => { setFiring(!firing); setPromoting(false); }} aria-label={`${st.name} 해고`}>해고</button>
      </div>
      {promoting && (
        <div style={{ marginTop: 6, padding: 8, background: PALETTE.paperDark, borderRadius: 6 }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>어떤 힘을 키울까? <span style={soft}>연구 포인트 {s.research} 있음</span></div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {STAT_KEYS.map((k: StatKey) => {
              const cost = levelUpCost(st, k);
              const ok = canLevelUp(s, st.id, k).ok;
              return (
                <button key={k} style={ok ? rowBtn : rowBtnOff} disabled={!ok} onClick={() => { if (dispatch({ type: 'levelUp', staffId: st.id, stat: k }).ok) setPromoting(false); }}>
                  {label('stat', k)} 🔬{cost}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {firing && <ConfirmRow text={`${st.name} 씨를 내보낼까요? 퇴직금 ${win(st.salary)}이 나가요.`} yes="내보내기" onYes={() => dispatch({ type: 'fire', staffId: st.id })} onNo={() => setFiring(false)} />}
    </div>
  );
}

function CandidateCard({ c, s, dispatch }: { c: Candidate; s: GameState; dispatch: Dispatch }) {
  const roles = openRoles(s);
  const [role, setRole] = useState<RoleId | ''>(roles[0] ?? '');
  const chosen = (role && roles.includes(role) ? role : roles[0]) ?? '';
  const ok = chosen !== '' && canHire(s, c.id, chosen).ok;
  return (
    <div style={rowCard} data-testid={`candidate-${c.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Portrait face={c.face} role={chosen || null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{c.name}</b>
            <span style={{ fontSize: 14 }}>Lv.{c.level}</span>
          </div>
          <div style={soft}>월급 {win(c.salary)} · {label('skill', c.skill)}</div>
        </div>
      </div>
      <StatRows stats={c.stats} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <select value={chosen} onChange={(e) => setRole(e.target.value as RoleId)} style={{ ...brownSelect, margin: 0, flex: '1 1 100px' }} aria-label="직종">
          {roles.length === 0 && <option value="">자리 없음</option>}
          {roles.map((r) => <option key={r} value={r}>{label('role', r)}</option>)}
        </select>
        <button data-tut="hire" style={ok ? rowBtnOn : rowBtnOff} disabled={!ok} onClick={() => { if (chosen) dispatch({ type: 'hire', candidateId: c.id, role: chosen }); }} aria-label={`${c.name} 채용`}>
          채용 · 월급 {win(c.salary)}
        </button>
      </div>
    </div>
  );
}

export interface StaffWindowProps extends WindowProps { initialTab?: Tab; focusId?: string | null }

export function StaffWindow(props: StaffWindowProps) {
  const { s, dispatch } = useWindowState(props);
  const [tab, setTab] = useState<Tab>(props.initialTab ?? (s.staff.length === 0 && s.candidates.length > 0 ? 'candidates' : 'ours'));
  const slots = ROLES.filter((r) => !HIDDEN_ROLES.has(r.id) && s.unlocked.roles.includes(r.id)).map((r) => `${r.name} ${staffInRole(s, r.id).length}/${s.slots[r.id] ?? 0}`).join(' · ');
  return (
    <div style={body} data-testid="staff-window">
      <TabBar tabs={[{ key: 'ours', label: `우리 직원 ${s.staff.length}` }, { key: 'candidates', label: '채용 후보', badge: s.candidates.length }]} active={tab} onPick={setTab} testId="staff-tab" />
      {tab === 'ours' && (
        <>
          <div style={{ ...soft, marginBottom: 6 }}>자리: {slots}</div>
          {s.staff.length === 0 && <Empty>아직 직원이 없어요. 채용 후보 탭에서 공고를 내 보세요.</Empty>}
          {s.staff.map((st) => <StaffCard key={st.id} st={st} s={s} dispatch={dispatch} />)}
        </>
      )}
      {tab === 'candidates' && (
        <>
          <div style={{ marginBottom: 4 }}><b>공고 내기</b> <span style={soft}>돈을 내면 후보가 와요{s.freeRecruits > 0 ? ` · 스카우트권 ${s.freeRecruits}장` : ''}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            {TIER_ORDER.map((t) => {
              const cost = postJobCost(s, t);
              const ok = s.money >= cost;
              return (
                <button key={t} style={{ ...(ok ? brownBtn : brownBtnOff), margin: 0, padding: '6px 4px', fontSize: 14, lineHeight: 1.25 }} disabled={!ok} onClick={() => dispatch({ type: 'postJob', tier: t })} data-testid={`post-${t}`}>
                  {TIER_NAME[t]}<br /><span style={{ fontSize: 13, fontWeight: 400 }}>{cost > 0 ? win(cost) : '무료'} · {TIERS[t].count}명</span>
                </button>
              );
            })}
          </div>
          {s.candidates.length === 0 && <Empty>후보가 없어요. 공고를 내면 이번 달 안에 뽑을 수 있어요.</Empty>}
          {s.candidates.map((c) => <CandidateCard key={c.id} c={c} s={s} dispatch={dispatch} />)}
        </>
      )}
    </div>
  );
}

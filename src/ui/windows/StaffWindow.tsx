/** 직원 창 (스펙 §4.3 + HSS2 확장 §3.6). 하위 탭: 우리 직원 / 채용 후보. 카드 1열: 파츠 초상·이름·직종·특기 배지·경험치 바·4스탯 바(상한 눈금)·급여·에너지·레벨.
 *  버튼: 승급(경험치+연구)·연수(5종, 랭크 3)·해고(확인)·후보는 채용·공고 내기(채용 5단계, 풀에서 온다). sim 액션: postJob·hire·fire·assign·levelUp·train. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ButtonGroup } from '../ButtonGroup';
import type { GameState, Staff, Candidate, RoleId, StatKey, JobTier, Face } from '../../sim/index.ts';
import { TIERS, LOW_ENERGY, STAT_KEYS, levelUpCost, expNeeded, mainStatOf, canHire, canLevelUp, canPostJob, staffInRole, postJobCost, tierUnlocked, availablePool, staffCapacity, staffRoomCount, capOf, capBonus, skillsOf, salaryDue, trainingOptions, trainingUnlocked, TRAINING_RANK } from '../../sim/index.ts';
import { ROLES, RECRUIT_TIERS, skillDef, trainingDef, staffPoolDef } from '../../data/index.ts';
import { label, wonText } from '../../data/labels.ts';
import { PALETTE, brownBtn, brownBtnOff } from '../frame';
import { drawPortrait, PORTRAIT_SIZE } from '../../render/portrait';
import { partsOfFace, staffParts, HAIR_RGB, SKIN_RGB, TOP_RGB } from '../../render/character';
import { SortChips } from '../GuestsPanel';
import { useWindowState, body, TabBar, Bar, rowCard, rowCardOn, rowBtn, rowBtnOn, rowBtnOff, rowBtnDanger, soft, Empty, ConfirmRow, type Dispatch, type WindowProps } from './shared.tsx';

const TIER_ORDER: JobTier[] = RECRUIT_TIERS.map((t) => t.id);
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

/** 스탯 바 + 상한 눈금. 눈금은 상한 위치의 세로 선, 상한에 닿은 스탯은 바 색이 진해진다. */
export function CapBar({ value, cap, height = 10 }: { value: number; cap: number; height?: number }) {
  const max = Math.max(100, cap);
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const capPct = Math.max(0, Math.min(100, (cap / max) * 100));
  const full = value >= cap;
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height, background: PALETTE.paperDark, border: `1px solid ${PALETTE.wood}`, borderRadius: 3, overflow: 'hidden' }} aria-label={`${value}/${cap}`}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: full ? PALETTE.ok : PALETTE.bar }} />
      <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${capPct}% - 1px)`, width: 2, background: PALETTE.ink, opacity: 0.7 }} />
    </span>
  );
}

function StatRows({ s, who, main }: { s: GameState; who: { stats: Staff['stats']; statCaps: Staff['statCaps'] }; main?: StatKey }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '3px 8px', alignItems: 'center', fontSize: 14, margin: '6px 0' }}>
      {STAT_KEYS.map((k) => {
        const cap = capOf(s, who, k);
        return (
          <span key={k} style={{ display: 'contents' }}>
            <span style={{ fontWeight: k === main ? 700 : 400 }}>{label('stat', k)}{k === main ? '★' : ''}</span>
            <CapBar value={who.stats[k]} cap={cap} />
            <span style={{ minWidth: 52, textAlign: 'right', fontSize: 13 }}>{who.stats[k]}<span style={soft}>/{cap}</span></span>
          </span>
        );
      })}
    </div>
  );
}

/** 특기 배지 (타고난 것 + 연수로 얻은 것) */
export function SkillBadges({ who }: { who: { skill: string; extraSkills?: string[] } }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {skillsOf(who).map((id, i) => (
        <span key={id} title={skillDef(id).desc} style={{ fontSize: 13, padding: '0 6px', borderRadius: 8, border: `1px solid ${PALETTE.wood}`, background: i === 0 ? PALETTE.btnOn : PALETTE.paperDark, whiteSpace: 'nowrap' }}>
          {label('skill', id)}
        </span>
      ))}
    </span>
  );
}

/** 열려 있고 자리가 남은 직종 (지금 맡은 직종은 항상 포함) */
function openRoles(s: GameState, keep: RoleId | null = null): RoleId[] {
  return ROLES.map((r) => r.id).filter((id) => !HIDDEN_ROLES.has(id) && s.unlocked.roles.includes(id) && (id === keep || staffInRole(s, id).length < (s.slots[id] ?? 0)));
}

function TrainingPanel({ st, s, dispatch, onDone }: { st: Staff; s: GameState; dispatch: Dispatch; onDone: () => void }) {
  const opts = trainingOptions(s, st.id);
  const unlocked = trainingUnlocked(s);
  return (
    <div style={{ marginTop: 6, padding: 8, background: PALETTE.paperDark, borderRadius: 6 }} data-testid={`training-${st.id}`}>
      <div style={{ fontSize: 14, marginBottom: 4 }}>어떤 연수를 보낼까? <span style={soft}>{st.trainingCount > 0 ? `${st.trainingCount + 1}번째라 비용 +${st.trainingCount * 20}%` : '그동안 자리를 비워요'}</span></div>
      {!unlocked && <div style={{ ...soft, marginBottom: 4 }}>카페 랭크 {TRAINING_RANK}부터 보낼 수 있어요</div>}
      <div style={{ display: 'grid', gap: 4 }}>
        {opts.map(({ def, cost, ok, reason }) => (
          <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div><b>{def.name}</b> <span style={soft}>{def.days}일</span></div>
              <div style={{ ...soft, fontSize: 13 }}>{def.desc}{unlocked && !ok && reason ? ` · ${reason}` : ''}</div>
            </div>
            <button style={ok ? rowBtn : rowBtnOff} disabled={!ok} title={reason} onClick={() => { if (dispatch({ type: 'train', staffId: st.id, trainingId: def.id }).ok) onDone(); }} aria-label={`${st.name} ${def.name}`}>
              {wonText(cost)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffCard({ st, s, dispatch }: { st: Staff; s: GameState; dispatch: Dispatch }) {
  const [training, setTraining] = useState(false);
  const [firing, setFiring] = useState(false);
  const roles = openRoles(s, st.role);
  const maxed = st.level >= st.maxLevel;
  const promo = canLevelUp(s, st.id);
  const need = expNeeded(st.level);
  const energyColor = st.energy < LOW_ENERGY ? PALETTE.bad : PALETTE.ok;
  const away = st.training ? trainingDef(st.training.id) : null;
  const due = salaryDue(st);
  return (
    <div style={training ? rowCardOn : rowCard} data-testid={`staff-${st.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Portrait face={st.face} role={st.role} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{st.name}</b>
            <span style={{ fontSize: 14 }}>{away ? `연수 중 · ${away.name} ${st.training!.daysLeft}일 남음` : st.role ? label('role', st.role) : '쉬는 중'} · Lv.{st.level}<span style={soft}>/{st.maxLevel}</span></span>
          </div>
          <div style={soft}>월급 {wonText(due)}{due < st.salary ? ' (쉬는 중 50%)' : ''}{st.unpaidMonths > 0 && <span style={{ color: PALETTE.bad }}> · 월급 밀림 {st.unpaidMonths}달</span>}</div>
          <div style={{ marginTop: 2 }}><SkillBadges who={st} /></div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '3px 8px', alignItems: 'center', fontSize: 14, marginTop: 6 }}>
        <span>에너지</span><Bar value={st.energy} max={100} color={energyColor} /><span style={{ minWidth: 52, textAlign: 'right' }}>{Math.round(st.energy)}</span>
        <span>경험치</span><Bar value={maxed ? need : Math.min(st.exp, need)} max={need} color={PALETTE.btnOn} /><span style={{ minWidth: 52, textAlign: 'right', fontSize: 13 }}>{maxed ? '최고' : `${Math.floor(st.exp)}/${need}`}</span>
      </div>
      <StatRows s={s} who={st} main={mainStatOf(st)} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <ButtonGroup label="직종" disabled={!!away} value={st.role ?? ''} onPick={(v) => dispatch({ type: 'assign', staffId: st.id, role: (v || null) as RoleId | null })} style={{ flex: '1 1 100%' }}
          options={[{ value: '', label: '쉬기' }, ...roles.map((r) => ({ value: r, label: label('role', r) }))]} />
        <button style={maxed ? rowBtnOff : promo.ok ? rowBtnOn : rowBtnOff} disabled={!promo.ok} title={promo.reason} onClick={() => dispatch({ type: 'levelUp', staffId: st.id })} aria-label={`${st.name} 승급`}>
          {maxed ? '최고 레벨' : <>승급 <Icon name="research" size={14} />{levelUpCost(st.level)}</>}
        </button>
        <button style={away ? rowBtnOff : training ? rowBtnOn : rowBtn} disabled={!!away} onClick={() => { setTraining(!training); setFiring(false); }} aria-label={`${st.name} 연수`}>연수</button>
        <button style={away ? rowBtnOff : rowBtnDanger} disabled={!!away} onClick={() => { setFiring(!firing); setTraining(false); }} aria-label={`${st.name} 해고`}>해고</button>
      </div>
      {training && !away && <TrainingPanel st={st} s={s} dispatch={dispatch} onDone={() => setTraining(false)} />}
      {firing && <ConfirmRow text={`${st.name} 씨를 내보낼까요? 퇴직금 ${wonText(st.salary)}이 나가요.`} yes="내보내기" onYes={() => dispatch({ type: 'fire', staffId: st.id })} onNo={() => setFiring(false)} />}
    </div>
  );
}

function CandidateCard({ c, s, dispatch }: { c: Candidate; s: GameState; dispatch: Dispatch }) {
  const roles = openRoles(s);
  const [role, setRole] = useState<RoleId | ''>(roles[0] ?? '');
  const chosen = (role && roles.includes(role) ? role : roles[0]) ?? '';
  const check = chosen !== '' ? canHire(s, c.id, chosen) : { ok: false, reason: '자리 없음' };
  const bio = staffPoolDef(c.poolId).bio;
  return (
    <div style={rowCard} data-testid={`candidate-${c.id}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Portrait face={c.face} role={chosen || null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{c.name}</b>
            <span style={{ fontSize: 14 }}>최대 Lv.{c.maxLevel}</span>
          </div>
          <div style={soft}>월급 {wonText(c.salary)} · <SkillBadges who={c} /></div>
          {bio && <div style={{ ...soft, fontSize: 13 }}>{bio}</div>}
        </div>
      </div>
      <StatRows s={s} who={c} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <ButtonGroup label="직종" value={chosen} onPick={(r) => setRole(r)} style={{ flex: '1 1 100%' }}
          options={roles.length === 0 ? [{ value: '' as RoleId, label: '자리 없음', disabled: true }] : roles.map((r) => ({ value: r, label: label('role', r) }))} />
        <button data-tut="hire" style={check.ok ? rowBtnOn : rowBtnOff} disabled={!check.ok} title={check.reason} onClick={() => { if (chosen) dispatch({ type: 'hire', candidateId: c.id, role: chosen }); }} aria-label={`${c.name} 채용`}>
          채용 · 월급 {wonText(c.salary)}
        </button>
      </div>
      {!check.ok && check.reason && <div style={{ ...soft, fontSize: 13, marginTop: 4 }}>{check.reason}</div>}
    </div>
  );
}

export interface StaffWindowProps extends WindowProps { initialTab?: Tab; focusId?: string | null }

/** 정렬 칩 (§5.4): 직원 [직종] [급여↓] [피로↓]. 세션 기억 */
export type StaffSort = 'role' | 'salary' | 'fatigue';
const STAFF_SORTS: { key: StaffSort; label: string; icon: string }[] = [{ key: 'role', label: '직종', icon: 'tie' }, { key: 'salary', label: '급여↓', icon: 'money' }, { key: 'fatigue', label: '피로↓', icon: 'tired' }];
let rememberedStaffSort: StaffSort = 'role';
export function sortStaff(staff: Staff[], sort: StaffSort): Staff[] {
  const arr = [...staff];
  if (sort === 'salary') arr.sort((a, b) => b.salary - a.salary);
  else if (sort === 'fatigue') arr.sort((a, b) => a.energy - b.energy);
  else arr.sort((a, b) => (a.role ?? 'zz').localeCompare(b.role ?? 'zz'));
  return arr;
}

export function StaffWindow(props: StaffWindowProps) {
  const { s, dispatch } = useWindowState(props);
  const [tab, setTab] = useState<Tab>(props.initialTab ?? (s.staff.length === 0 && s.candidates.length > 0 ? 'candidates' : 'ours'));
  const [sort, setSortState] = useState<StaffSort>(rememberedStaffSort);
  const setSort = (k: StaffSort) => { rememberedStaffSort = k; setSortState(k); };
  const slots = ROLES.filter((r) => !HIDDEN_ROLES.has(r.id) && s.unlocked.roles.includes(r.id)).map((r) => `${r.name} ${staffInRole(s, r.id).length}/${s.slots[r.id] ?? 0}`).join(' · ');
  const cap = staffCapacity(s);
  const rooms = staffRoomCount(s);
  const bonus = capBonus(s);
  return (
    <div style={body} data-testid="staff-window">
      <TabBar tabs={[{ key: 'ours', label: `직원 ${s.staff.length}/${cap}` }, { key: 'candidates', label: '채용', badge: s.candidates.length }]} active={tab} onPick={setTab} testId="staff-tab" />
      {tab === 'ours' && (
        <>
          <div style={{ ...soft, marginBottom: 2 }}>정원 {s.staff.length}/{cap}명{rooms > 0 ? ` (휴게실 ${rooms})` : ' · 휴게실을 지으면 +3명'}{bonus > 0 ? ` · 유니폼 상한 +${bonus}` : ''}</div>
          <div style={{ ...soft, marginBottom: 6 }}>자리: {slots}</div>
          {s.staff.length > 1 && <SortChips chips={STAFF_SORTS} active={sort} onPick={setSort} testId="staff-sort" />}
          {s.staff.length === 0 && <Empty>아직 직원이 없어요. 채용 후보 탭에서 공고를 내 보세요.</Empty>}
          {sortStaff(s.staff, sort).map((st) => <StaffCard key={st.id} st={st} s={s} dispatch={dispatch} />)}
        </>
      )}
      {tab === 'candidates' && (
        <>
          <div style={{ marginBottom: 4 }}><b>공고 내기</b> <span style={soft}>돈을 내면 그 방법으로 올 사람이 후보로 와요{s.freeRecruits > 0 ? ` · 스카우트권 ${s.freeRecruits}장` : ''}</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6, marginBottom: 10 }}>
            {TIER_ORDER.map((t) => {
              const def = TIERS[t];
              const cost = postJobCost(s, t);
              const check = canPostJob(s, t);
              const left = availablePool(s, def.tier).length;
              const locked = !tierUnlocked(s, t);
              return (
                <button key={t} style={{ ...(check.ok ? brownBtn : brownBtnOff), margin: 0, padding: '6px 4px', fontSize: 14, lineHeight: 1.25 }} disabled={!check.ok} title={check.reason} onClick={() => dispatch({ type: 'postJob', tier: t })} data-testid={`post-${t}`}>
                  {def.name}<br /><span style={{ fontSize: 13, fontWeight: 400 }}>{locked ? `★${def.unlock?.star ?? ''}부터` : `${cost > 0 ? wonText(cost) : '무료'} · ${left}명 남음`}</span>
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

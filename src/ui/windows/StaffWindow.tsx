/** 직원 창 (스펙 §4.3 + HSS2 확장 §3.6). 하위 탭: 우리 직원 / 채용 후보. 카드 1열: 파츠 초상·이름·직종·특기 배지·경험치 바·4스탯 바(상한 눈금)·급여·에너지·레벨.
 *  버튼: 승급(경험치+연구)·연수(5종, 랭크 3)·해고(확인)·후보는 채용·공고 내기(채용 5단계, 풀에서 온다). sim 액션: postJob·hire·fire·assign·levelUp·train. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ButtonGroup } from '../ButtonGroup';
import { josa } from '../../sim/josa.ts';
import type { GameState, Staff, Candidate, RoleId, StatKey, JobTier, Face } from '../../sim/index.ts';
import { gradeOf, REVEAL_GRADE } from '../../sim/index.ts'; // fun 점진 공개
import { TIERS, LOW_ENERGY, STAT_KEYS, levelUpCost, expNeeded, mainStatOf, canHire, canLevelUp, canPostJob, staffInRole, postJobCost, tierUnlocked, availablePool, staffCapacity, staffRoomCount, capOf, capBonus, skillsOf, salaryDue, trainingOptions, trainingUnlocked, TRAINING_RANK, titleChances, titleDef, TITLE_GRADES, candidateDaysLeft, dayIndex, outcomeChances, chanceText, trainingChances, isWorking } from '../../sim/index.ts';
// staff2: 직종 전략성 — 「지금 필요해요」·「우리 카페에 오면」·후보 비교표·배치
import { roleNeeds, needOf, hireForecast, suggestRole, roleEffectText, roleHeads, headsOfCandidate, recommendedHire, postJobHint, zoneOf, isNightShift, STAFF_ZONES, ZONE_NAME, ZONE_ROLE, type StaffZone, type RoleNeed, type HireSuggestion } from '../../sim/index.ts';
import { TitleRibbon } from '../TitleBadge'; // staff-luck 칭호 리본
import { skillsOfStaff, skillPreview, skillLine, skillEffectText, cooldownMs, secToMs, skillSlots, rushTrained, MAX_SKILL_SLOTS } from '../../sim/index.ts'; // rush3: 러시 액티브 스킬
import { ROLES, RECRUIT_TIERS, skillDef, trainingDef, staffPoolDef } from '../../data/index.ts';
import { label, wonText } from '../../data/labels.ts';
import { PALETTE, brownBtn, brownBtnOff, NO_SCROLLBAR } from '../frame';
import { drawPortrait, PORTRAIT_SIZE } from '../../render/portrait';
import { partsOfFace, staffParts, HAIR_RGB, SKIN_RGB, TOP_RGB } from '../../render/character';
import { SortChips } from '../GuestsPanel';
import { useWindowState, body, TabBar, Bar, rowCard, rowCardOn, rowBtn, rowBtnOn, rowBtnOff, rowBtnDanger, soft, Empty, ConfirmRow, type Dispatch, type WindowProps } from './shared.tsx';

const TIER_ORDER: JobTier[] = RECRUIT_TIERS.map((t) => t.id);
/** 공고 버튼의 칭호 확률 줄 (staff-luck): "프로 8% · 전설 2%" (전설 조건 미달이면 프로만) */
function titleLine(s: GameState, tier: JobTier) {
  const c = titleChances(s, tier);
  const p = (v: number) => `${Math.round(v * 1000) / 10}%`;
  return <>프로 {p(c.pro)}{c.legend > 0 && <><br />전설 {p(c.legend)}</>}</>;
}
/** v3에서 없어지는 직종(밭)은 목록에서 뺀다 */
const HIDDEN_ROLES = new Set<string>(['field']);
const css = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
type Tab = 'ours' | 'candidates';

/** 파츠 초상 96px(48 원본 2배). 시트가 아직 없으면(Pixi 미로드) 머리·피부·상의 색 상자로 대신한다. */
/** 시트가 늦게 올 때 초상을 다시 그리는 횟수·간격 */
const PORTRAIT_RETRIES = 20;
const PORTRAIT_RETRY_MS = 150;

export function Portrait({ face, role, size = 96 }: { face: Face; role: RoleId | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ok, setOk] = useState(false);
  // uifix: 시트가 아직 안 왔을 때 한 번 실패하면 색 띠 세 줄로 남았다 (홍보 결과 팝업이 로딩보다 먼저 뜨면 그랬다) → 올 때까지 다시 그린다
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const tick = () => {
      if (!alive || !ref.current) return;
      if (drawPortrait(ref.current, staffParts(face, role))) { setOk(true); return; }
      setOk(false);
      if (tries++ < PORTRAIT_RETRIES) setTimeout(tick, PORTRAIT_RETRY_MS);
    };
    tick();
    return () => { alive = false; };
  }, [face.hair, face.skin, face.top, role]);
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

/** rush3: 러시 때 쓰는 재주 줄 (이름·효과·쿨다운) — 뽑을 때·키울 때 이게 보여야 육성이 목적이 된다 */
export function ActiveSkillLines({ s, st }: { s: GameState; st: Staff }) {
  const list = skillsOfStaff(s, st);
  if (list.length === 0) return null;
  const locked = skillSlots(s) >= MAX_SKILL_SLOTS && !rushTrained(st) && list.length < MAX_SKILL_SLOTS;
  return (
    <div data-testid={`skill-active-${st.id}`} style={{ marginTop: 3, fontSize: 13, lineHeight: 1.5 }}>
      {list.map((def) => (
        <div key={def.id}>
          <span style={{ padding: '0 5px', borderRadius: 8, border: `1px solid ${PALETTE.wood}`, background: PALETTE.btnOn }}>재주</span> {skillLine(st, def)}
        </div>
      ))}
      {locked && <div style={{ ...soft, fontSize: 13 }}>러시 연수를 다녀오면 재주를 하나 더 써요</div>}
    </div>
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
      <div style={{ ...soft, fontSize: 13, marginBottom: 4 }} data-testid={`training-chance-${st.id}`}>돌아올 때 판정: {chanceText(trainingChances(s, st.id))} (대박이면 효과 2배, 쪽박이면 절반)</div>
      {!unlocked && <div style={{ ...soft, marginBottom: 4 }}>카페가 더 알려지면 보낼 수 있어요</div>}
      <div style={{ display: 'grid', gap: 4 }}>
        {opts.map(({ def, cost, ok, reason }) => (
          <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div><b>{def.name}</b> <span style={soft}>{def.days}일</span></div>
              <div style={{ ...soft, fontSize: 13 }}>{def.desc}{unlocked && !ok && reason ? ` · ${reason}` : ''}</div>
            </div>
            <button data-tut="train-pick" style={ok ? rowBtn : rowBtnOff} disabled={!ok} title={reason} onClick={() => { if (dispatch({ type: 'train', staffId: st.id, trainingId: def.id }).ok) onDone(); }} aria-label={`${st.name} ${def.name}`}>
              {wonText(cost)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


/** staff2: 「지금 필요해요」 칩 — 매력도 패널의 서비스 항목과 같은 데이터(주문 적체·줄·청결)를 본다 */
function NeedChip({ need }: { need: RoleNeed }) {
  return (
    <span data-testid={`need-${need.role}`} title={need.why} style={{ fontSize: 13, fontWeight: 700, padding: '1px 7px', borderRadius: 9, border: `1px solid ${PALETTE.bad}`, background: PALETTE.paperDark, color: PALETTE.bad, whiteSpace: 'nowrap' }}>
      지금 필요해요
    </span>
  );
}

/** staff2 추천: 지금 병목 직종에서 가장 이득인 후보 1명에게 붙는 리본 */
function RecommendRibbon() {
  return (
    <span data-testid="recommend-ribbon" style={{ fontSize: 13, fontWeight: 700, padding: '1px 7px', borderRadius: 9, border: `1px solid ${PALETTE.ok}`, background: PALETTE.btnOn, color: PALETTE.btnOnText, whiteSpace: 'nowrap' }}>
      ⭐ 추천
    </span>
  );
}

/** staff2: 「우리 카페에 오면」 3줄 */
function ForecastLines({ s, who, role, testId }: { s: GameState; who: { stats: Staff['stats']; baseSalary: number; level: number; title?: string }; role: RoleId; testId: string }) {
  const f = hireForecast(s, who, role);
  return (
    <div data-testid={testId} style={{ marginTop: 6, padding: '6px 8px', background: PALETTE.paperDark, borderRadius: 6, fontSize: 14, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>우리 카페에 오면</div>
      {f.lines.map((l, i) => <div key={i}>{l}</div>)}
      {f.diminished && <div style={{ ...soft, fontSize: 13 }}>같은 직종 세 번째부터 몫이 절반이에요</div>}
    </div>
  );
}

/** rush3: 후보가 이 직종으로 오면 러시에서 쓸 재주 (이름 · 효과 · 쿨다운) */
export function candidateSkillText(c: { level: number; title?: string }, role: RoleId): string {
  const def = skillPreview(role);
  if (!def) return '—';
  return `${def.name} · ${skillEffectText(c, def)} · 쿨 ${Math.round(cooldownMs(c, def) / secToMs(1))}초`;
}

/** staff2: 후보를 나란히 견주는 표 — 스탯(주 스탯)·칭호·급여·예상 이득 */
function CompareTable({ s, cands, role, recId }: { s: GameState; cands: Candidate[]; role: RoleId; recId?: string | null }) {
  const cell: React.CSSProperties = { padding: '3px 5px', fontSize: 13, textAlign: 'left', borderBottom: `1px solid ${PALETTE.wood}` };
  return (
    <div className={NO_SCROLLBAR} style={{ overflowX: 'auto', marginBottom: 10 }} data-testid="candidate-compare">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{josa(label('role', role), '으로/로')} 뽑는다면</div>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 300 }}>
        <thead><tr>{['후보', '몫', '칭호', '재주', '월급', '이 자리에 오면'].map((h) => <th key={h} style={{ ...cell, fontWeight: 700 }}>{h}</th>)}</tr></thead>
        <tbody>
          {cands.map((c) => {
            const f = hireForecast(s, c, role);
            return (
              <tr key={c.id} data-testid={`compare-${c.id}`}>
                <td style={cell}>{c.id === recId ? '⭐ ' : ''}{c.name}</td>
                <td style={cell}>{headsOfCandidate(c, role).toFixed(1)}인분</td>
                <td style={cell}>{c.title ? titleDef(c.title).name : '—'}</td>
                <td style={cell} data-testid={`compare-skill-${c.id}`}>{candidateSkillText(c, role)}</td>
                <td style={cell}>{wonText(f.salary, true)}</td>
                <td style={cell}>{f.gain}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** staff2: 직원 카드의 배치 — 홀은 담당 구역 3택, 모두 저녁 근무 토글 */
function PlacementRow({ st, s, dispatch }: { st: Staff; s: GameState; dispatch: Dispatch }) {
  if (st.role === null || st.training) return null;
  const night = isNightShift(st);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }} data-testid={`place-${st.id}`}>
      {st.role === ZONE_ROLE && (
        <ButtonGroup testId="zone" label="담당 구역" value={zoneOf(st)} onPick={(z) => dispatch({ type: 'setStaffZone', staffId: st.id, zone: z as StaffZone })} style={{ flex: '1 1 100%' }}
          options={STAFF_ZONES.map((z) => ({ value: z, label: ZONE_NAME[z] }))} />
      )}
      {st.role === ZONE_ROLE && <div style={{ ...soft, fontSize: 13, flex: '1 1 100%' }}>{zoneOf(st) === 'all' ? '어느 쪽도 특별히 챙기지 않아요' : `${ZONE_NAME[zoneOf(st)]} 손님 만족 +2, 반대쪽 −1`}</div>}
      <button style={night ? rowBtnOn : rowBtn} onClick={() => dispatch({ type: 'setStaffNight', staffId: st.id, on: !night })} aria-label={`${st.name} 저녁 근무`} data-testid={`night-${st.id}`}>
        저녁 근무 {night ? '함' : '안 함'}
      </button>
      <span style={{ ...soft, fontSize: 13 }}>{night ? '저녁 손님 만족 +2 · 기력이 하루 10 덜 차요' : '저녁까지 있으면 저녁 손님이 더 좋아해요'}</span>
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
          <div style={{ marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}><TitleRibbon titleId={st.title} /><SkillBadges who={st} /></div>
          {st.title && <div style={{ ...soft, fontSize: 13 }}>{titleDef(st.title).desc}</div>}
          <ActiveSkillLines s={s} st={st} />{/* rush3: 러시 재주 줄 */}
          {isWorking(s, st) && <div style={{ ...soft, fontSize: 13 }} data-testid={`luck-${st.id}`}>이 직원에게 시키면: 홍보 대박 {Math.round(outcomeChances(s, 'promo', st).great * 100)}% · 쪽박 {Math.round(outcomeChances(s, 'promo', st).fail * 100)}%</div>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '3px 8px', alignItems: 'center', fontSize: 14, marginTop: 6 }}>
        <span>에너지</span><Bar value={st.energy} max={100} color={energyColor} /><span style={{ minWidth: 52, textAlign: 'right' }}>{Math.round(st.energy)}</span>
        <span>경험치</span><Bar value={maxed ? need : Math.min(st.exp, need)} max={need} color={PALETTE.btnOn} /><span style={{ minWidth: 52, textAlign: 'right', fontSize: 13 }}>{maxed ? '최고' : `${Math.floor(st.exp)}/${need}`}</span>
      </div>
      <StatRows s={s} who={st} main={mainStatOf(st)} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <ButtonGroup testId="assign" label="직종" disabled={!!away} value={st.role ?? ''} onPick={(v) => dispatch({ type: 'assign', staffId: st.id, role: (v || null) as RoleId | null })} style={{ flex: '1 1 100%' }}
          options={[{ value: '', label: '쉬기' }, ...roles.map((r) => ({ value: r, label: label('role', r) }))]} />
        <button style={maxed ? rowBtnOff : promo.ok ? rowBtnOn : rowBtnOff} disabled={!promo.ok} title={promo.reason} onClick={() => dispatch({ type: 'levelUp', staffId: st.id })} aria-label={`${st.name} 승급`}>
          {maxed ? '최고 레벨' : <>승급 <Icon name="research" size={14} />{levelUpCost(st.level)}</>}
        </button>
        {gradeOf(s) >= REVEAL_GRADE && <button data-tut="train" style={away ? rowBtnOff : training ? rowBtnOn : rowBtn} disabled={!!away} onClick={() => { setTraining(!training); setFiring(false); }} aria-label={`${st.name} 연수`}>연수</button>}{/* fun 점진 공개: 연수는 등급 3부터 */}
        <button style={away ? rowBtnOff : rowBtnDanger} disabled={!!away} onClick={() => { setFiring(!firing); setTraining(false); }} aria-label={`${st.name} 해고`}>해고</button>
      </div>
      <PlacementRow st={st} s={s} dispatch={dispatch} />{/* staff2: 담당 구역·저녁 근무 */}
      {training && !away && <TrainingPanel st={st} s={s} dispatch={dispatch} onDone={() => setTraining(false)} />}
      {firing && <ConfirmRow text={`${st.name} 씨를 내보낼까요? 퇴직금 ${josa(wonText(st.salary), '이/가')} 나가요.`} yes="내보내기" onYes={() => dispatch({ type: 'fire', staffId: st.id })} onNo={() => setFiring(false)} />}
    </div>
  );
}

function CandidateCard({ c, s, dispatch, rec }: { c: Candidate; s: GameState; dispatch: Dispatch; rec: HireSuggestion | null }) {
  const roles = openRoles(s);
  const recommended = rec?.candidateId === c.id;
  const [role, setRole] = useState<RoleId | ''>((recommended ? rec!.role : suggestRole(s, roles)) ?? ''); // staff2: 지금 병목인 직종을 먼저 보여 준다
  const chosen = (role && roles.includes(role) ? role : suggestRole(s, roles) ?? roles[0]) ?? '';
  const need = chosen ? needOf(s, chosen) : null;
  const check = chosen !== '' ? canHire(s, c.id, chosen) : { ok: false, reason: '자리 없음' };
  const bio = staffPoolDef(c.poolId).bio;
  const daysLeft = candidateDaysLeft(c, dayIndex(s.clock)); // staff-luck: 프로·전설 후보는 3일
  return (
    <div style={recommended ? rowCardOn : rowCard} data-testid={`candidate-${c.id}`} data-recommended={recommended || undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Portrait face={c.face} role={chosen || null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 16 }}>{c.name}</b>
            <span style={{ fontSize: 14 }}>최대 Lv.{c.maxLevel}</span>
            {recommended && <RecommendRibbon />}{/* staff2 추천 */}
            {need && <NeedChip need={need} />}{/* staff2 */}
          </div>
          <div style={soft}>월급 {wonText(c.salary)}{c.title ? ` (칭호 ×${TITLE_GRADES[titleDef(c.title).grade].salaryMult})` : ''} · <SkillBadges who={c} /></div>
          {c.title && <div style={{ marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><TitleRibbon titleId={c.title} />{daysLeft !== null && <span style={{ fontSize: 13, color: PALETTE.bad, fontWeight: 700 }} data-testid={`candidate-days-${c.id}`}>{daysLeft > 0 ? `${daysLeft}일 남음` : '오늘까지'}</span>}</div>}
          {c.title && <div style={{ ...soft, fontSize: 13 }}>{titleDef(c.title).desc}</div>}
          {chosen && <div data-testid={`candidate-skill-${c.id}`} style={{ ...soft, fontSize: 13 }}>재주 {candidateSkillText(c, chosen)}</div>}{/* rush3: 뽑을 때 러시 재주가 보인다 */}
          {bio && <div style={{ ...soft, fontSize: 13 }}>{bio}</div>}
        </div>
      </div>
      <StatRows s={s} who={c} />
      {chosen && <ForecastLines s={s} who={c} role={chosen} testId={`forecast-${c.id}`} />}{/* staff2 */}
      {recommended && <div data-testid={`recommend-why-${c.id}`} style={{ fontSize: 13, marginTop: 2, color: PALETTE.title, fontWeight: 700 }}>{rec!.why}</div>}
      {need && !recommended && <div style={{ ...soft, fontSize: 13, marginTop: 2 }}>{need.why}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
        <ButtonGroup label="직종" value={chosen} onPick={(r) => setRole(r)} style={{ flex: '1 1 100%' }}
          options={roles.length === 0 ? [{ value: '' as RoleId, label: '자리 없음', disabled: true }] : roles.map((r) => ({ value: r, label: label('role', r) }))} />
        <button data-tut={recommended ? 'hire' : undefined} style={check.ok ? rowBtnOn : rowBtnOff} disabled={!check.ok} title={check.reason} onClick={() => { if (chosen) dispatch({ type: 'hire', candidateId: c.id, role: chosen }); }} aria-label={`${c.name} 채용`}>
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
  const cap = staffCapacity(s);
  const rooms = staffRoomCount(s);
  const bonus = capBonus(s);
  // staff2: 정원·인건비는 늘 카드 위에 고정, 직종별 자리는 「몇 인분인지」와 함께
  const payroll = s.staff.reduce((n, st) => n + salaryDue(st), 0);
  const needs = roleNeeds(s);
  const shownRoles = ROLES.filter((r) => !HIDDEN_ROLES.has(r.id) && s.unlocked.roles.includes(r.id));
  const openForHire = openRoles(s);
  const compareRole = suggestRole(s, openForHire);
  const rec = recommendedHire(s, s.candidates, openForHire); // staff2 추천: 병목 직종에서 가장 이득인 후보 1명
  // 「추천 → 같은 직종으로 뽑을 수 있는 사람 → 나머지」 순 (같은 순위면 후보 순서 그대로)
  const rank = (c: Candidate) => (rec && c.id === rec.candidateId ? 0 : rec && canHire(s, c.id, rec.role).ok ? 1 : 2);
  const sortedCands = s.candidates.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  const Head = (
    <div style={{ marginBottom: 6, padding: '6px 8px', background: PALETTE.paperDark, borderRadius: 6 }} data-testid="staff-budget">
      <div style={{ fontSize: 14, fontWeight: 700 }}>직원 {s.staff.length}/{cap}명 · 이달 인건비 {wonText(payroll)}</div>
      <div style={{ ...soft, fontSize: 13 }}>{rooms > 0 ? `휴게실 ${rooms}개로 정원 +${rooms * 2}` : '휴게실을 지으면 정원이 늘어요'}{bonus > 0 ? ` · 유니폼 상한 +${bonus}` : ''}</div>
    </div>
  );
  const RoleRows = (
    <div style={{ display: 'grid', gap: 3, marginBottom: 8 }} data-testid="role-rows">
      {shownRoles.map((r) => {
        const need = needs.find((n) => n.role === r.id);
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', fontSize: 14 }}>
            <b style={{ minWidth: 58 }}>{r.name}</b>
            <span>{staffInRole(s, r.id).length}/{s.slots[r.id] ?? 0}명 · {roleHeads(s, r.id).toFixed(1)}인분</span>
            {need && <NeedChip need={need} />}
            <span style={{ ...soft, fontSize: 13, flex: '1 1 100%' }}>{need ? need.why : roleEffectText(s, r.id)}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div style={body} data-testid="staff-window">
      <TabBar tabs={[{ key: 'ours', label: `직원 ${s.staff.length}/${cap}` }, { key: 'candidates', label: '채용', badge: s.candidates.length }]} active={tab} onPick={setTab} testId="staff-tab" />
      {tab === 'ours' && (
        <>
          {Head}
          {RoleRows}
          {s.staff.length > 1 && <SortChips chips={STAFF_SORTS} active={sort} onPick={setSort} testId="staff-sort" />}
          {s.staff.length === 0 && <Empty>아직 직원이 없어요. 채용 후보 탭에서 공고를 내 보세요.</Empty>}
          {sortStaff(s.staff, sort).map((st) => <StaffCard key={st.id} st={st} s={s} dispatch={dispatch} />)}
        </>
      )}
      {tab === 'candidates' && (
        <>
          {Head}
          {RoleRows}
          <div style={{ marginBottom: 4 }}><b>공고 내기</b> <span style={soft}>돈을 내면 그 방법으로 올 사람이 후보로 와요{s.freeRecruits > 0 ? ` · 스카우트권 ${s.freeRecruits}장 (쓰면 프로 이상 보장)` : ''}</span></div>
          <div data-testid="post-job-hint" style={{ fontSize: 14, fontWeight: 700, color: PALETTE.title, marginBottom: 4 }}>{postJobHint(s, openForHire)}</div>{/* staff2: 공고 전에 방향이 보이게 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6, marginBottom: 10 }}>
            {TIER_ORDER.map((t) => {
              const def = TIERS[t];
              const cost = postJobCost(s, t);
              const check = canPostJob(s, t);
              const left = availablePool(s, def.tier).length;
              const locked = !tierUnlocked(s, t);
              return (
                <button key={t} style={{ ...(check.ok ? brownBtn : brownBtnOff), margin: 0, padding: '6px 4px', fontSize: 14, lineHeight: 1.25 }} disabled={!check.ok} title={check.reason} onClick={() => dispatch({ type: 'postJob', tier: t })} data-testid={`post-${t}`}>
                  {def.name}<br /><span style={{ fontSize: 13, fontWeight: 400 }}>{locked ? `★${def.unlock?.star ?? ''}부터` : <>{cost > 0 ? wonText(cost) : '무료'}<br />{left}명 남음<br />{titleLine(s, t)}</>}</span>
                </button>
              );
            })}
          </div>
          {s.candidates.length === 0 && <Empty>후보가 없어요. 공고를 내면 이번 달 안에 뽑을 수 있어요.</Empty>}
          {s.candidates.length > 1 && compareRole && <CompareTable s={s} cands={sortedCands.slice(0, 3)} role={rec?.role ?? compareRole} recId={rec?.candidateId} />}{/* staff2: 나란히 견주기 — 추천을 첫 칸에 */}
          {sortedCands.map((c) => <CandidateCard key={c.id} c={c} s={s} dispatch={dispatch} rec={rec} />)}
        </>
      )}
    </div>
  );
}

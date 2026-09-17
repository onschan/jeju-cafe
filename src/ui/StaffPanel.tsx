import { useState } from 'react';
import { useGame, dispatch } from './store';
import { TIERS, MAX_LEVEL, LOW_ENERGY, levelUpCost, canHire, canLevelUp, staffInRole, type Staff, type Candidate, type RoleId, type StatKey, type JobTier, type Face as FaceParts } from '../sim/index.ts';
import { ROLES, roleDef, skillDef } from '../data/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { card, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, brownSelect, PALETTE, won } from './frame';

const TIER_ORDER: JobTier[] = ['flyer', 'site', 'headhunter'];
const TIER_NAME: Record<JobTier, string> = { flyer: '전단 공고', site: '구인 사이트', headhunter: '헤드헌터' };
const STATS: { key: StatKey; name: string }[] = [
  { key: 'service', name: '친절' },
  { key: 'cooking', name: '요리' },
  { key: 'sense', name: '감각' },
  { key: 'stamina', name: '체력' },
];
// 얼굴 파츠 미리보기용 색 (스프라이트는 렌더가 맡는다) — names.json의 hair 4 · skin 3 · top 8
const HAIR_COLORS = ['#2b1b12', '#6b3d1e', '#c47a2c', '#e8d36a'];
const SKIN_COLORS = ['#ffe0bd', '#e8b98a', '#b87a4b'];
const TOP_COLORS = ['#e63946', '#f4a261', '#ffd166', '#6abe30', '#2a9d8f', '#457b9d', '#8e5ea2', '#f1faee'];

/** 얼굴 = 색 사각형 3개 (머리·피부·상의) */
export function Face({ face }: { face: FaceParts }) {
  const sq = (c: string) => <span style={{ display: 'inline-block', width: 14, height: 14, background: c, border: `1px solid ${PALETTE.wood}`, marginRight: 2 }} />;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }} aria-label="얼굴">
      {sq(HAIR_COLORS[face.hair % HAIR_COLORS.length]!)}
      {sq(SKIN_COLORS[face.skin % SKIN_COLORS.length]!)}
      {sq(TOP_COLORS[face.top % TOP_COLORS.length]!)}
    </span>
  );
}

/** 가로 막대 (0~max) */
export function Bar({ value, max, color = PALETTE.bar, width = 80 }: { value: number; max: number; color?: string; width?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span style={{ display: 'inline-block', width, height: 10, background: PALETTE.paperDark, border: `1px solid ${PALETTE.wood}`, verticalAlign: 'middle' }}>
      <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color }} />
    </span>
  );
}

export function EnergyBar({ energy }: { energy: number }) {
  const color = energy < LOW_ENERGY ? PALETTE.bad : PALETTE.ok;
  return <span style={{ whiteSpace: 'nowrap' }}>기력 <Bar value={energy} max={100} color={color} width={60} /> {Math.round(energy)}</span>;
}

function StatRows({ stats }: { stats: Staff['stats'] }) {
  return (
    <div style={{ fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '2px 6px', alignItems: 'center' }}>
      {STATS.map((st) => (
        <span key={st.key} style={{ display: 'contents' }}>
          <span>{st.name}</span>
          <Bar value={stats[st.key]} max={100} width={80} />
          <span>{stats[st.key]}</span>
        </span>
      ))}
    </div>
  );
}

/** 열려 있고 자리가 남은 역할 (지금 그 직원이 맡은 역할은 항상 포함) */
function openRoles(s: ReturnType<typeof useGame>, keep: RoleId | null = null): RoleId[] {
  return ROLES.map((r) => r.id).filter((id) => s.unlocked.roles.includes(id) && (id === keep || staffInRole(s, id).length < s.slots[id]));
}

function slotSummary(s: ReturnType<typeof useGame>): string {
  return ROLES.filter((r) => s.unlocked.roles.includes(r.id)).map((r) => `${r.name} ${staffInRole(s, r.id).length}/${s.slots[r.id]}`).join(' · ');
}

function CandidateCard({ c }: { c: Candidate }) {
  const s = useGame();
  const roles = openRoles(s);
  const [role, setRole] = useState<RoleId | ''>(roles[0] ?? '');
  const chosen = (role && roles.includes(role) ? role : roles[0]) ?? '';
  const ok = chosen !== '' && canHire(s, c.id, chosen).ok;
  const sk = skillDef(c.skill);
  const hire = () => {
    if (!chosen) return;
    Confirm(`${c.name} 씨를 ${roleDef(chosen).name}(으)로 고용합니다. 월급 ${won(c.salary)}`, () => dispatch({ type: 'hire', candidateId: c.id, role: chosen }), { title: '채용' });
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <Face face={c.face} /><b style={{ flex: 1 }}>{c.name}</b>
        <span style={{ fontSize: 13 }}>월급 {won(c.salary)}</span>
      </div>
      <StatRows stats={c.stats} />
      <div style={{ fontSize: 13, margin: '4px 0' }}><b>{sk.name}</b> <span style={{ color: PALETTE.inkSoft }}>{sk.desc}</span></div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={chosen} onChange={(e) => setRole(e.target.value as RoleId)} style={brownSelect} aria-label="역할">
          {roles.length === 0 && <option value="">자리 없음</option>}
          {roles.map((r) => <option key={r} value={r}>{roleDef(r).name}</option>)}
        </select>
        <button style={ok ? brownBtn : brownBtnOff} disabled={!ok} onClick={hire}>채용</button>
      </div>
    </div>
  );
}

function StaffCard({ st }: { st: Staff }) {
  const s = useGame();
  const [picking, setPicking] = useState(false);
  const roles = openRoles(s, st.role);
  const sk = skillDef(st.skill);
  const fire = () => Confirm(`${st.name} 씨를 내보냅니다. 퇴직금 ${won(st.salary)}을 줘요`, () => dispatch({ type: 'fire', staffId: st.id }), { title: '해고' });
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <Face face={st.face} /><b style={{ flex: 1 }}>{st.name}</b>
        <span style={{ fontSize: 13 }}>Lv.{st.level} · 월급 {won(st.salary)}</span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 4 }}><EnergyBar energy={st.energy} />{st.unpaidMonths > 0 && <span style={{ color: PALETTE.bad, marginLeft: 6 }}>월급 밀림 {st.unpaidMonths}달</span>}</div>
      <StatRows stats={st.stats} />
      <div style={{ fontSize: 13, margin: '4px 0' }}><b>{sk.name}</b> <span style={{ color: PALETTE.inkSoft }}>{sk.desc}</span></div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={st.role ?? ''} onChange={(e) => dispatch({ type: 'assign', staffId: st.id, role: (e.target.value || null) as RoleId | null })} style={brownSelect} aria-label="역할">
          <option value="">미배치</option>
          {roles.map((r) => <option key={r} value={r}>{roleDef(r).name}</option>)}
        </select>
        <button style={st.level >= MAX_LEVEL ? brownBtnOff : picking ? brownBtnOn : brownBtn} disabled={st.level >= MAX_LEVEL} onClick={() => setPicking(!picking)}>
          <Icon name="research" /> 레벨업
        </button>
        <button style={dangerBtn} onClick={fire}>해고</button>
      </div>
      {picking && (
        <div style={{ fontSize: 13, marginTop: 4 }}>
          <div style={{ marginBottom: 4 }}>어떤 힘을 키울까? (연구 포인트)</div>
          {STATS.map((x) => {
            const cost = levelUpCost(st, x.key);
            const ok = canLevelUp(s, st.id, x.key).ok;
            return (
              <button key={x.key} style={ok ? brownBtn : brownBtnOff} disabled={!ok}
                onClick={() => { if (dispatch({ type: 'levelUp', staffId: st.id, stat: x.key }).ok) setPicking(false); }}>
                {x.name} <Icon name="research" /> {cost}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StaffPanel() {
  const s = useGame();
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, color: PALETTE.inkSoft }}>자리: {slotSummary(s)}</div>

      <div style={{ marginBottom: 4 }}><b>공고 내기</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>돈을 내면 후보가 와요</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {TIER_ORDER.map((t) => {
          const d = TIERS[t];
          const ok = s.money >= d.cost;
          return (
            <button key={t} style={ok ? brownBtn : brownBtnOff} disabled={!ok} onClick={() => dispatch({ type: 'postJob', tier: t })}>
              {TIER_NAME[t]}<br /><span style={{ fontSize: 12 }}><Icon name="money" size={12} /> {won(d.cost)} · {d.count}명</span>
            </button>
          );
        })}
      </div>

      {s.candidates.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ marginBottom: 4 }}><b>후보 {s.candidates.length}명</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>이번 달 안에 뽑아요</span></div>
          {s.candidates.map((c) => <CandidateCard key={c.id} c={c} />)}
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <div style={{ marginBottom: 4 }}><b>직원 {s.staff.length}명</b></div>
        {s.staff.length === 0 && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>아직 직원이 없어요. 공고를 내 보세요.</div>}
        {s.staff.map((st) => <StaffCard key={st.id} st={st} />)}
      </div>
    </div>
  );
}

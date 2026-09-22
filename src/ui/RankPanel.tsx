import { useEffect, useState, type CSSProperties } from 'react';
import { wonText } from '../data/labels.ts';
import { useGame, dispatch } from './store';
import { rankScore, nextRankThreshold, nextStarConditions, judgeScores, guidebookScore, monthlyTarget, MAX_STAR, JUDGE_LABEL, ANNOUNCE_MONTHS } from '../sim/index.ts';
import type { AnnouncementEntry, JudgeKey } from '../sim/index.ts';
import { GUIDEBOOKS } from '../data/index.ts';
import { Popup } from './Popup';
import { Icon } from './Icon';
import { sfx } from './audio';
import { card, brownBtn, PALETTE } from './frame';

const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, MAX_STAR - n));

/** 가이드북이 보는 항목 (가중치 > 0, 최대 4개) — 월간 추천은 종합 + 타깃 손님층 */
function judgedKeys(id: string): JudgeKey[] {
  const g = GUIDEBOOKS.find((x) => x.id === id);
  if (!g) return ['overall'];
  const keys = (Object.entries(g.weights) as [JudgeKey, number][]).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return keys.slice(0, 4);
}

function Gauge({ label, value, max = 100, on, color = PALETTE.bar }: { label: string; value: number; max?: number; on: boolean; color?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>{label}</span><b>{on ? value : ''}</b></div>
      <div style={{ height: 10, background: PALETTE.paperDark, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: on ? `${Math.min(100, (value / max) * 100)}%` : '0%', background: color, transition: 'width 600ms ease-out' }} />
      </div>
    </div>
  );
}

/** 랭킹 탭: 카페 랭크·★ + 다음 조건, 가이드북 11종 목록 */
export function RankPanel() {
  const s = useGame();
  const score = rankScore(s);
  const next = nextRankThreshold(s);
  const star = nextStarConditions(s);
  const scores = judgeScores(s);
  const month = s.clock.month;
  const nextAnnounce = ANNOUNCE_MONTHS.find((m) => m > month) ?? ANNOUNCE_MONTHS[0]!;
  return (
    <div data-testid="rank-panel">
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span><Icon name="unlock" /> 카페 랭크 <b style={{ fontSize: 20 }}>{s.rank}</b></span>
          <span style={{ color: '#d4a13c', fontSize: 18 }} data-testid="star-text">{stars(s.star)}</span>
        </div>
        <Gauge label={next ? `랭크 점수 ${score} / ${next}` : `랭크 점수 ${score} (최고!)`} value={score} max={next ?? Math.max(1, score)} on />
        <div style={small}>점수 = 누적 손님 50명당 1 + 시설 1개당 2 + 온 적 있는 손님층 1종당 5</div>
        {star ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 700 }}>★{star.star} 조건 <span style={small}>(월초에 검사해요)</span></div>
            {star.conditions.map((c) => <div key={c.text} style={{ fontSize: 14, color: c.met ? PALETTE.ok : PALETTE.ink }} data-testid="star-cond">{c.met ? <Icon name="check" size={12} /> : '○'} {c.text}</div>)}
            <div style={small}>열리는 것: {star.unlockText}</div>
          </div>
        ) : <div style={{ ...small, marginTop: 6 }}>최고 등급이에요!</div>}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>우리 카페 심사표</div>
        {(Object.keys(JUDGE_LABEL) as JudgeKey[]).map((k) => <Gauge key={k} label={JUDGE_LABEL[k]} value={scores[k]} on />)}
        <div style={small}>미소 = 홀 직원 서비스 · 경관 = 좌석 주변 경치 · 메뉴 = 메뉴판 스탯 · 체험 = 즐길거리 · 단체 = 큰 좌석·주차장</div>
      </div>

      <div style={{ fontWeight: 700, marginBottom: 4 }}>가이드북 <span style={small}>· 발표 {ANNOUNCE_MONTHS.join('·')}월 (다음 {nextAnnounce}월), 농협 추천은 매월</span></div>
      {GUIDEBOOKS.map((g) => {
        const st = s.guidebooks[g.id];
        const unlocked = st?.unlocked ?? false;
        return (
          <div key={g.id} style={{ ...card, opacity: unlocked ? 1 : 0.7, marginBottom: 6 }} data-testid={`gb-${g.id}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b><Icon name={unlocked ? 'book' : 'lock'} /> {g.name}</b>
              {unlocked && <span style={{ fontSize: 13 }}>{st?.lastRank ? `최근 ${st.lastRank}위` : '아직 발표 전'}{st?.best ? ` · 최고 ${st.best}위` : ''}</span>}
            </div>
            <div style={small}>
              {unlocked ? `심사: ${g.criteriaText}${g.monthly ? ` (이번 달 타깃: ${monthlyTarget(s).label} 손님)` : ''} · 지금 점수 ${guidebookScore(s, g, scores)}` : `해금: ${g.unlockText}`}
              {' · '}1위 {wonText(g.prize)} + 연구 {g.research}{g.seeds.length ? ' + 씨앗' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 발표 팝업 (App에 한 번 둔다): 항목 게이지 → 종합 → 순위 → ★ 순으로 카운터 연출. 가이드북이 여럿이면 "다음"으로 넘긴다. */
export function AnnouncementPopup() {
  const s = useGame();
  const a = s.lastAnnouncement;
  const [idx, setIdx] = useState(0);
  const [stage, setStage] = useState(0);
  const entry: AnnouncementEntry | undefined = a?.entries[idx];
  // 결산 카드가 떠 있는 동안은 기다린다 (결산 → 발표 → 장면 창 순서, QA 1차 P2 #25)
  const blocked = s.lastMonthCard !== null;
  useEffect(() => { setIdx(0); }, [a]);
  useEffect(() => {
    if (!entry || blocked) return;
    setStage(0);
    const keys = judgedKeys(entry.id);
    const total = keys.length + 3; // 항목들 → 종합 → 순위 → ★
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= total; i++) timers.push(setTimeout(() => { setStage(i); if (i === keys.length + 2) sfx(entry.rank === 1 ? 'fanfare' : 'unlock'); }, 500 * i));
    return () => timers.forEach(clearTimeout);
  }, [entry, blocked]);
  if (!a || !entry || blocked) return null;
  const keys = judgedKeys(entry.id);
  const last = idx >= a.entries.length - 1;
  const close = () => { if (last) dispatch({ type: 'dismissAnnouncement' }); else setIdx(idx + 1); };
  const done = stage >= keys.length + 3;
  const rankStage = keys.length + 2;
  return (
    <Popup title={`${a.year}년차 ${a.month}월 가이드북 발표`} onBackdrop={done ? close : undefined}
      buttons={<button style={brownBtn} onClick={() => (done ? close() : setStage(keys.length + 3))} data-testid="announce-next">{done ? (last ? '닫기' : '다음') : '건너뛰기'}</button>}>
      <div data-testid="announce-entry" data-stage={stage}>
        <div style={{ fontSize: 18, fontWeight: 700 }}><Icon name="book" size={18} /> {entry.name}</div>
        {entry.targetText && <div style={small}>이번 달 타깃: {entry.targetText} 손님</div>}
        <div style={{ margin: '6px 0' }}>
          {keys.map((k, i) => <Gauge key={k} label={JUDGE_LABEL[k]} value={entry.scores[k]} on={stage > i} />)}
          <Gauge label="종합 점수" value={entry.total} on={stage > keys.length} color="#c9743a" />
        </div>
        <div style={{ minHeight: 28, fontSize: 20, fontWeight: 700, textAlign: 'center', transform: stage >= rankStage ? 'scale(1)' : 'scale(0.6)', opacity: stage >= rankStage ? 1 : 0, transition: 'all 300ms ease-out' }} data-testid="announce-rank">
          {entry.rank === 1 ? <><Icon name="trophy" size={20} /> 1위!</> : `${entry.rank}위`} <span style={small}>/ {entry.rivals.length + 1}곳</span>
        </div>
        {stage >= rankStage && (
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {entry.prize > 0 ? <div>상금 {wonText(entry.prize)} + 연구 {entry.research}{entry.seedText ? ` + ${entry.seedText}` : ''}</div> : <div style={small}>다음엔 더 잘해 봐요! 심사표에서 약한 항목을 보세요.</div>}
          </div>
        )}
        {done && (
          <div style={{ marginTop: 6, textAlign: 'center', color: '#d4a13c', fontSize: 18 }} data-testid="announce-star">
            {a.starAfter > a.starBefore ? `${stars(a.starBefore)} → ${stars(a.starAfter)} 승급!` : stars(s.star)}
          </div>
        )}
      </div>
    </Popup>
  );
}

import { useState, useEffect } from 'react';
import { showFirstTip } from './firstTip';
import { useGame } from './store';
import { gradeOf, gradeName, gradeProgress, guestCap, GRADE_NAMES, GRADE_CAPTION, GRADE_REQS, MAX_GRADE, GRADE_BGM_LAYER_FROM } from '../sim/index.ts';
import { fmtNum } from '../sim/format.ts';
import { assetUrl } from './assetUrl';
import { Icon } from './Icon';
import { Window } from './Window';
import { Bar } from './windows/shared.tsx';
import { brownBtn, brownBtnOn, PALETTE } from './frame';

/** 등급 창 (fun-rank, 스펙 §5): 상단 바 등급 이름을 탭하면 열린다.
 *  위: 「5년 뒤 우리 카페」 미리보기 — 등급별 카페 외관 일러스트 5장(public/assets/grade/grade{n}.png, 인트로 컷 스타일 320×180)을 등급 버튼으로 넘겨 본다.
 *  아래: 다음 등급 조건 4줄(다녀간 손님·완성한 명당·평판·★) 진행 막대 + 등급이 오르면 생기는 것. */
export function GradeWindow({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const cur = gradeOf(s);
  const [shown, setShown] = useState(Math.min(MAX_GRADE, cur + 1));
  const next = cur + 1;
  const rows = gradeProgress(s, next);
  useEffect(() => { showFirstTip('grade'); }, []); // fun-start 첫 열기 팁
  return (
    <Window title={`등급 「${gradeName(cur)}」`} onClose={onClose} testId="window-grade">
      <div data-testid="grade-preview" style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: PALETTE.inkSoft, marginBottom: 4 }}>5년 뒤 우리 카페</div>
        <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box', aspectRatio: '16 / 9', background: PALETTE.paperDark, border: `3px solid ${PALETTE.wood}`, borderRadius: 6, overflow: 'hidden' }}>{/* uifix: box-sizing이 없어 테두리 3px만큼 가로로 6px 넘쳤다 */}
          <img className="px" src={assetUrl(`assets/grade/grade${shown}.png`)} alt={`${gradeName(shown)} 모습`} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated', display: 'block', filter: shown > cur ? 'grayscale(0.35) brightness(0.9)' : 'none' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 8px', background: 'rgba(43,33,24,0.75)', color: '#fff', fontSize: 14, lineHeight: 1.3 }}>
            <b>{shown}. {gradeName(shown)}</b>{shown === cur ? ' · 지금' : shown < cur ? ' · 지나왔다' : ''}<br />
            <span style={{ opacity: 0.9 }}>{GRADE_CAPTION[shown]}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {GRADE_NAMES.map((name, i) => {
            const g = i + 1;
            return (
              <button key={name} aria-label={`${g}단계 ${name}`} onClick={() => setShown(g)}
                style={{ ...brownBtn, margin: 0, flex: 1, minWidth: 0, padding: '0 2px', height: 48, fontSize: 11, lineHeight: 1.05, opacity: g <= cur ? 1 : 0.75, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, ...(g === shown ? brownBtnOn : {}) }}>
                <span>{g <= cur ? <Icon name="check" size={11} /> : <Icon name="lock" size={11} />}</span>
                <span style={{ whiteSpace: 'normal', wordBreak: 'keep-all', textAlign: 'center' }}>{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rows ? (
        <div data-testid="grade-progress" style={{ background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>다음: 「{gradeName(next)}」</div>
          {rows.map((r) => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '4.2em 1fr auto', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 14 }}>
              <span style={{ color: r.met ? PALETTE.ok : PALETTE.ink, whiteSpace: 'nowrap' }}>{r.met ? <Icon name="check" size={12} /> : null} {r.label}</span>
              <Bar value={r.cur} max={r.need} height={12} color={r.met ? PALETTE.ok : PALETTE.bar} />
              {/* cfix: 승급은 완공 기준이라 공사 중인 명당은 0으로 보인다 — 「짓는 중 1」을 옆에 붙여 안 움직이는 것처럼 보이지 않게 */}
              <b style={{ whiteSpace: 'nowrap' }}>{r.key === 'star' ? `★${r.cur}/★${r.need}` : `${fmtNum(Math.min(r.cur, r.need))}/${fmtNum(r.need)}`}{r.building > 0 && !r.met ? <span style={{ fontWeight: 400, color: PALETTE.inkSoft }}> · 짓는 중 {r.building}</span> : null}</b>
            </div>
          ))}
          <div style={{ fontSize: 14, color: PALETTE.inkSoft, lineHeight: 1.4, marginTop: 4 }}>
            오르면: 간판이 커진다 · 마당 손님 {guestCap(s)}명에서 {guestCap({ ...s, grade: next })}명으로{next >= GRADE_BGM_LAYER_FROM && cur < GRADE_BGM_LAYER_FROM ? ' · 북소리가 더해진다' : ''} · 응모권 5장
          </div>
        </div>
      ) : (
        <div data-testid="grade-progress" style={{ background: '#fffaf0', border: `2px solid ${PALETTE.woodLight}`, borderRadius: 6, padding: '8px 10px', fontSize: 15 }}>
          제주에서 제일가는 카페다. 손님 {fmtNum(s.totalGuests)}명이 다녀갔다.
        </div>
      )}
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginTop: 8, lineHeight: 1.4 }}>
        등급 조건: {Object.entries(GRADE_REQS).map(([g, r]) => `${gradeName(Number(g))} 손님 ${fmtNum(r.guests)}·명당 ${r.corners}·평판 ${r.reputation}·★${r.star}`).join(' / ')}
      </div>
    </Window>
  );
}

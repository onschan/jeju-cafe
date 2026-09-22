import { useGame } from './store';
import { TITLES } from '../data/index.ts';
import { GRADE_ORDER, TITLE_GRADES, titlesMet, type TitleGrade } from '../sim/index.ts';
import { PALETTE } from './frame';
import { TitleRibbon, GRADE_COLOR } from './TitleBadge';
import { label } from '../data/labels.ts';

/** 칭호 도감 (staff-luck): 만난 칭호는 리본·효과·잘 맞는 직종, 아직 못 만난 칭호는 ??? + 등급만. 후보로 오면 「만남」으로 친다. */
export function TitleCodex() {
  const s = useGame();
  const met = new Set(titlesMet(s));
  return (
    <div data-testid="title-codex">
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '8px 0 4px' }}>
        칭호 도감 {met.size}/{TITLES.length} · 공고를 내면 확률로 칭호 있는 사람이 와요 (숙련 → 프로 → 전설, 높은 단계 공고·★3부터 전설)
      </div>
      {GRADE_ORDER.map((g: TitleGrade) => (
        <div key={g} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: GRADE_COLOR[g].border }}>{TITLE_GRADES[g].name} · 급여 ×{TITLE_GRADES[g].salaryMult}</div>
          {TITLES.filter((t) => t.grade === g).map((t) => {
            const known = met.has(t.id);
            return (
              <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', opacity: known ? 1 : 0.6, fontSize: 14 }} data-testid={`title-${t.id}`}>
                <span style={{ width: 18, textAlign: 'center' }}>{known ? '★' : ' '}</span>
                {known ? <TitleRibbon titleId={t.id} size="sm" /> : <span>???</span>}
                <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>
                  {known ? `${t.desc}${t.roles.length ? ` · ${t.roles.map((r) => label('role', r)).join('/')}` : ''}` : '아직 못 만났어요'}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

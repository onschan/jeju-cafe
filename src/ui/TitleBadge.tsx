import type { CSSProperties } from 'react';
import type { TitleGrade } from '../sim/index.ts';
import { TITLE_GRADES, titleDef } from '../sim/index.ts';

/** 직원 칭호 리본 배지 (staff-luck): 숙련 초록 / 프로 파랑 / 전설 금 + 반짝 애니. 채용 후보 카드·직원 카드·미니 카드에 붙는다. */
export const GRADE_COLOR: Record<TitleGrade, { bg: string; text: string; border: string }> = {
  skilled: { bg: '#4c9a2a', text: '#f4ffe9', border: '#2f6a18' },
  pro: { bg: '#2f6fb5', text: '#eaf3ff', border: '#1c4a80' },
  legend: { bg: 'linear-gradient(90deg, #b8860b, #ffd166 45%, #fff3b0 50%, #ffd166 55%, #b8860b)', text: '#3b1f0e', border: '#8a5a00' },
};

export const RIBBON_KEYFRAMES = `@keyframes title-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes title-spark { 0%, 100% { opacity: 0.2; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.2); } }`;

export function TitleRibbon({ titleId, size = 'md', style }: { titleId: string | undefined | null; size?: 'sm' | 'md'; style?: CSSProperties }) {
  if (!titleId) return null;
  let def: ReturnType<typeof titleDef>;
  try { def = titleDef(titleId); } catch { return null; }
  const c = GRADE_COLOR[def.grade];
  const legend = def.grade === 'legend';
  const fontSize = size === 'sm' ? 12 : 13;
  return (
    <span data-testid="title-ribbon" data-grade={def.grade} title={`${TITLE_GRADES[def.grade].name} 칭호: ${def.desc}`}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize, fontWeight: 700, lineHeight: 1.4, padding: '1px 10px', whiteSpace: 'nowrap',
        color: c.text, background: c.bg, backgroundSize: legend ? '200% 100%' : undefined, animation: legend ? 'title-shimmer 1.6s linear infinite' : undefined,
        border: `1px solid ${c.border}`, clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 50%, 100% 100%, 6px 100%, 0 50%)', ...style,
      }}>
      <style>{RIBBON_KEYFRAMES}</style>
      {legend && <span aria-hidden style={{ display: 'inline-block', animation: 'title-spark 0.9s ease-in-out infinite' }}>✦</span>}
      {TITLE_GRADES[def.grade].name} · {def.name}
      {legend && <span aria-hidden style={{ display: 'inline-block', animation: 'title-spark 0.9s ease-in-out 0.45s infinite' }}>✦</span>}
    </span>
  );
}

/** 칭호 이름을 이름 앞에 붙인 문구: 「프로 바리스타」 김민준 */
export function titledName(who: { name: string; title?: string }): string {
  if (!who.title) return who.name;
  try { return `「${titleDef(who.title).name}」 ${who.name}`; } catch { return who.name; }
}

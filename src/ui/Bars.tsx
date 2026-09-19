/** 얼굴 색 칩·가로 막대·기력 막대 — 카드·창이 함께 쓰는 작은 표시 요소. (옛 StaffPanel.tsx에서 남긴 것; 패널 자체는 StaffWindow로 대체돼 삭제) */
import { LOW_ENERGY, type Face as FaceParts } from '../sim/index.ts';
import { PALETTE } from './frame';
import { partsOfFace, HAIR_RGB, SKIN_RGB, TOP_RGB } from '../render/character';

const css = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;

/** 얼굴 = 색 사각형 3개 (머리·피부·상의). 색은 렌더의 파츠 tint 표(character.ts)와 같다. */
export function Face({ face }: { face: FaceParts }) {
  const p = partsOfFace(face);
  const sq = (c: string) => <span style={{ display: 'inline-block', width: 14, height: 14, background: c, border: `1px solid ${PALETTE.wood}`, marginRight: 2 }} />;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }} aria-label="얼굴">
      {sq(css(HAIR_RGB[p.hairColor]!))}
      {sq(css(SKIN_RGB[p.skin]!))}
      {sq(css(TOP_RGB[p.top]!))}
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

import { useState } from 'react';
import { useGame, dispatch } from './store';
import { cafeLevel, nextCafeLevelIncome, canExpand, canRenameCafe, EXPANSIONS, CAFE_NAME_MAX, WALL_COLORS, SIGN_MAX, CAFE_LEVEL_INCOME } from '../sim/index.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { Bar } from './StaffPanel';
import { card, brownBtn, brownBtnOn, brownBtnOff, brownSelect, PALETTE, won } from './frame';

const css = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`;
const WALL_NAMES = ['흰 벽', '귤빛 벽', '하늘빛 벽'];

/** 본관(폐창고)을 누르거나 카페 탭: 이름·레벨·증축·인테리어·메뉴판 바로가기 */
export function CafePanel({ onMenu }: { onMenu: () => void }) {
  const s = useGame();
  const [name, setName] = useState(s.cafeName);
  const [sign, setSign] = useState(s.cosmetics.sign);
  const lv = cafeLevel(s);
  const next = nextCafeLevelIncome(s);
  const floor = CAFE_LEVEL_INCOME[lv - 1] ?? 0;
  const rename = () => {
    const r = dispatch({ type: 'renameCafe', name });
    if (r.ok) setName(s.cafeName);
  };
  return (
    <div data-testid="cafe-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <input value={name} maxLength={CAFE_NAME_MAX} onChange={(e) => setName(e.target.value)} aria-label="카페 이름"
          style={{ ...brownSelect, flex: 1, minWidth: 0, marginRight: 0, marginBottom: 0 }} />
        <button style={canRenameCafe(s, name).ok && name.trim() !== s.cafeName ? brownBtnOn : brownBtnOff} disabled={!canRenameCafe(s, name).ok || name.trim() === s.cafeName}
          onClick={rename} aria-label="이름 저장">이름 짓기</button>
      </div>

      <div style={{ ...card, padding: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <b>카페 레벨 {lv}</b>
          <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>누적 매출 {won(s.totalIncome)}</span>
        </div>
        {next !== null ? (
          <div style={{ fontSize: 13, marginTop: 2 }}>
            <Bar value={s.totalIncome - floor} max={next - floor} width={140} /> 다음 레벨까지 {won(Math.max(0, next - s.totalIncome))}
          </div>
        ) : <div style={{ fontSize: 13, marginTop: 2, color: PALETTE.ok }}>최고 레벨이에요!</div>}
      </div>

      <div style={{ marginBottom: 4 }}><b>증축</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>본관이 넓어져요</span></div>
      {EXPANSIONS.map((e) => {
        const done = s.expansions.includes(e.id);
        const can = canExpand(s, e.id);
        return (
          <div key={e.id} style={{ ...card, padding: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div><b>{e.name}</b>{done && <span style={{ color: PALETTE.ok, fontSize: 13 }}> · 완공</span>}</div>
              <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>{e.desc} · {won(e.cost)}</div>
            </div>
            {!done && (
              <button style={can.ok ? brownBtnOn : brownBtnOff} disabled={!can.ok} aria-label={`${e.name} 증축`}
                onClick={() => Confirm(`${e.name}을(를) ${won(e.cost)}에 할까요? ${e.desc}.`, () => dispatch({ type: 'expand', id: e.id }), { title: '증축' })}>
                <Icon name="build" /> 짓기
              </button>
            )}
          </div>
        );
      })}

      <div style={{ marginBottom: 4 }}><b>인테리어</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>외벽 색·간판 (보기만 바뀌어요)</span></div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {WALL_COLORS.map((c, i) => (
          <button key={i} aria-label={WALL_NAMES[i]} style={{ ...(s.cosmetics.wallColor === i ? brownBtnOn : brownBtn), padding: '0 8px', marginRight: 0, marginBottom: 0 }}
            onClick={() => dispatch({ type: 'setCosmetic', wallColor: i })}>
            <span style={{ display: 'inline-block', width: 14, height: 14, background: css(c), border: `1px solid ${PALETTE.wood}`, verticalAlign: 'middle', marginRight: 4 }} />{WALL_NAMES[i]}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <input value={sign} maxLength={SIGN_MAX} placeholder="간판 문구" onChange={(e) => setSign(e.target.value)} aria-label="간판 문구"
          style={{ ...brownSelect, flex: 1, minWidth: 0, marginRight: 0, marginBottom: 0 }} />
        <button style={sign.trim() !== s.cosmetics.sign ? brownBtnOn : brownBtnOff} disabled={sign.trim() === s.cosmetics.sign}
          onClick={() => dispatch({ type: 'setCosmetic', sign })}>간판 달기</button>
      </div>

      <button style={brownBtn} onClick={onMenu}><Icon name="menu" /> 메뉴판 보기</button>
    </div>
  );
}

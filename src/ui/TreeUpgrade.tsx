/** 시설 카드 「업그레이드 ▲」 (fun 통합, 부루마블처럼 같은 자리에서 다음 단계): 다음 단계 이름·차액·조건("★2면 열려요")·거리 보너스 줄·
 *  "이 자리에서 …로 올리면 +₩n/일"(solver evaluate 14일 롤아웃의 자금 차이 ÷ 14 — 탭했을 때 한 번 계산). */
import { useMemo, type CSSProperties } from 'react';
import { dispatch } from './store';
import { wonText } from '../data/labels.ts';
import { josa } from '../sim/josa.ts';
import { objectDef } from '../data/index.ts';
import { treeOf, nextStep, canTreeUpgrade, treeUpgradeCost, streetText, evaluate, type GameState, type PlacedObject } from '../sim/index.ts';
import { layoutSig } from '../sim/layoutRev.ts';
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { brownBtnOn, brownBtnOff, PALETTE } from './frame';

const small: CSSProperties = { fontSize: 13, color: PALETTE.inkSoft };
const btnOn: CSSProperties = { ...brownBtnOn, margin: 0, padding: '0 10px', fontSize: 15 };
const btnOff: CSSProperties = { ...brownBtnOff, margin: 0, padding: '0 10px', fontSize: 15 };
/** 롤아웃 일수 (하루 수치로 나눈다) */
export const GAIN_DAYS = 14;

/** "+₩3만/일" — 올렸을 때와 그대로일 때의 14일 뒤 자금 차이. 올릴 수 없으면 null. */
export function upgradeGainPerDay(s: GameState, objectId: string): number | null {
  if (!canTreeUpgrade(s, objectId).ok) return null;
  const base = evaluate(s, null, GAIN_DAYS);
  const up = evaluate(s, { type: 'treeUpgrade', objectId }, GAIN_DAYS);
  if (!up.ok) return null;
  return Math.round((up.metrics.money - base.metrics.money + treeUpgradeCost(s, s.objects[objectId]!)) / GAIN_DAYS); // 차액은 도로 더한다 — 하루 벌이 차이만
}
export function gainText(n: number): string {
  const a = Math.abs(n);
  const won = a >= 10_000 ? `₩${Math.round(a / 10_000)}만` : `₩${a.toLocaleString('en-US')}`;
  return `${n >= 0 ? '+' : '−'}${won}/일`;
}

export function TreeUpgradeRow({ s, o }: { s: GameState; o: PlacedObject }) {
  const t = treeOf(o.type);
  const next = nextStep(o.type);
  const can = canTreeUpgrade(s, o.id);
  const cost = treeUpgradeCost(s, o);
  const sig = layoutSig(s);
  const gain = useMemo(() => (t && next && can.ok ? upgradeGainPerDay(s, o.id) : null), [o.id, sig, can.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null;
  const nextDef = next ? objectDef(next.type) : null;
  const go = () => {
    if (!nextDef) return;
    Confirm(`${josa(objectDef(o.type).name, '을/를')} 같은 자리에서 ${josa(nextDef.name, '으로/로')} 올릴까요? ${cost > 0 ? wonText(cost) : '무료'}${(nextDef.buildDays ?? 0) > 0 ? ` · 공사 ${nextDef.buildDays}일` : ''}`, () => { dispatch({ type: 'treeUpgrade', objectId: o.id }); }, { title: '업그레이드' });
  };
  return (
    <div data-testid="tree-upgrade" style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {nextDef
          ? <button style={can.ok ? btnOn : btnOff} disabled={!can.ok} title={can.ok ? undefined : can.reason} onClick={go} data-testid="tree-upgrade-btn"><Icon name="plus" /> 업그레이드 ▲ {nextDef.name} ({cost > 0 ? wonText(cost) : '무료'})</button>
          : <span style={{ ...small, color: PALETTE.ok }}><Icon name="check" size={13} /> {t.tree.name} 최고 단계</span>}
        <span style={{ ...small, color: can.ok ? PALETTE.ink : PALETTE.inkSoft }}>
          {nextDef && can.ok && gain !== null ? `이 자리에서 올리면 ${gainText(gain)}` : nextDef && !can.ok ? can.reason : ''}
        </span>
      </div>
      <div style={small}>{t.tree.name} {t.index + 1}/{t.tree.steps.length}단계 · {streetText(s, o)}</div>
    </div>
  );
}

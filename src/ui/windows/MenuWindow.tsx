/** 메뉴판 창 (스펙 §4.1 · ui3 정돈).
 *  위쪽 고정 구역 = 메뉴판에 올린 것(슬롯 n/m), 아래 = 분류별 후보 목록. 둘을 시각적으로 갈라 둔다.
 *  한 줄은 [아이콘] 이름 ₩가격 ★인기 [올리기/내리기]만 — 재료·필요 직원·판매량은 줄을 탭하면 펼친다.
 *  분류 칩은 4개 고정(음료·디저트·식사·시그니처). 잠긴 메뉴는 자물쇠 + 해금 문구. 가격 조정 액션은 sim에 없어 가격은 보기만. */
import { useState } from 'react';
import { Icon } from '../Icon';
import type { GameState, MenuDef, MenuCategory } from '../../sim/index.ts';
import { menuOf, priceOf, hasMenuStaff, isMenuAvailable, menuStatsOf } from '../../sim/index.ts';
import { MENUS, statSum } from '../../data/index.ts';
import { label, requireText, ingredientsText, unlockText, wonText } from '../../data/labels.ts';
import { PALETTE } from '../frame';
import { useWindowState, body, Chips, Stars, rowCard, rowCardOn, rowCardLocked, rowBtn, rowBtnOn, rowBtnOff, soft, Empty, type WindowProps } from './shared.tsx';

/** 분류별 픽셀 아이콘 이름 (말풍선·메뉴판 공통) */
export const CAT_ICON: Record<MenuCategory, string> = { drink: 'coffee', dessert: 'cake', meal: 'meal', signature: 'sparkle' };
const CHIPS: { key: MenuCategory; label: string }[] = [
  { key: 'drink', label: '음료' }, { key: 'dessert', label: '디저트' }, { key: 'meal', label: '식사' }, { key: 'signature', label: '시그니처' },
];

/** 인기 ★: 스탯 합을 5단계로 (아메리카노 19 → ★2, 치즈케이크 40대 → ★4) */
export function menuStars(s: GameState, menuId: string): number {
  let sum: number;
  try { sum = statSum(menuStatsOf(s, menuId)); } catch { sum = statSum(menuOf(s, menuId).stats); }
  return Math.max(1, Math.min(5, 1 + Math.floor(sum / 12)));
}

export interface MenuWindowProps extends WindowProps {
  /** 잠긴 메뉴의 해금 문구 (목표 이름). 없으면 "목표를 이루면 열려요". 트랙 A의 goals와 통합 때 연결. */
  menuUnlockText?: (menuId: string) => string | null;
}

/** 한 줄: 1차 정보만. 탭하면 재료·필요 직원·판매량이 펼쳐진다 (창 안 1차 정보 3줄 이내). */
function MenuRow({ s, def, locked, on, unlock, disabled, onPut, onPull }: {
  s: GameState; def: MenuDef; locked: boolean; on: boolean; unlock: string | null; disabled: boolean; onPut: () => void; onPull: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = def.id;
  const staffOk = !locked && hasMenuStaff(s, id);
  const ready = !locked && isMenuAvailable(s, id);
  const req = requireText(def);
  const price = locked ? def.price : priceOf(s, id);
  const sold = s.menuSold[id] ?? 0;
  return (
    <div style={locked ? rowCardLocked : on ? rowCardOn : rowCard} data-testid={`menu-row-${id}`} aria-disabled={locked || undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 28, display: 'flex', justifyContent: 'center', flex: '0 0 auto' }} aria-hidden><Icon name={locked ? 'lock' : CAT_ICON[def.category]} size={24} /></span>
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${def.name} 자세히`}
          style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'transparent', border: 0, padding: 0, fontFamily: 'inherit', color: 'inherit', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{def.name}</b>
          <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{wonText(price)}</span>
          {!locked && <Stars n={menuStars(s, id)} label={`인기 ${menuStars(s, id)}/5`} />}
          {!locked && on && !ready && staffOk && <span style={{ color: PALETTE.bad, fontSize: 13 }}>재료 없음</span>}
          {!locked && !staffOk && req && <span style={{ color: PALETTE.bad, fontSize: 13 }}>직원 없음</span>}
          <span style={{ ...soft, fontSize: 13 }}>{open ? '▲' : '▼'}</span>
        </button>
        {!locked && (
          on
            ? <button style={rowBtnOn} onClick={onPull} aria-label={`${def.name} 내리기`}>내리기</button>
            : <button data-tut="menu-put" style={disabled ? rowBtnOff : rowBtn} disabled={disabled} onClick={onPut} aria-label={`${def.name} 올리기`}>올리기</button>
        )}
      </div>
      {locked && <div style={{ ...soft, marginTop: 2 }}>{unlock}</div>}
      {!locked && open && (
        <div style={{ ...soft, marginTop: 4, lineHeight: 1.5 }} data-testid={`menu-detail-${id}`}>
          <div>재료 · {ingredientsText(def) || '재료 없음'}</div>
          {req && <div style={{ color: staffOk ? PALETTE.inkSoft : PALETTE.bad }}>필요 직원 · {req}</div>}
          {sold > 0 && <div>{sold}잔 팔림</div>}
        </div>
      )}
    </div>
  );
}

export function MenuWindow(props: MenuWindowProps) {
  const { s, dispatch } = useWindowState(props);
  const [filter, setFilter] = useState<MenuCategory>('drink');
  const onBoard = s.menuSlots.filter((m): m is string => m !== null);
  const used = onBoard.length;
  const total = s.menuSlots.length;
  const unlockedIds = new Set(s.unlocked.menus);
  const all: { def: MenuDef; locked: boolean }[] = [
    ...s.customMenus.map((def) => ({ def, locked: false })),
    ...MENUS.map((def) => ({ def, locked: !unlockedIds.has(def.id) })),
  ];
  // 올린 것은 분류와 상관없이 맨 위 고정 구역에 (슬롯 순서 그대로), 후보 목록에는 안 겹치게 뺀다
  const board = onBoard.map((id) => all.find((m) => m.def.id === id)).filter((m): m is { def: MenuDef; locked: boolean } => !!m);
  const list = all.filter((m) => m.def.category === filter && !onBoard.includes(m.def.id));
  list.sort((a, b) => Number(a.locked) - Number(b.locked));

  const put = (id: string) => {
    const slot = s.menuSlots.indexOf(null);
    if (slot < 0) return;
    dispatch({ type: 'setSlot', slot, menuId: id });
  };
  const pull = (id: string) => {
    const slot = s.menuSlots.indexOf(id);
    if (slot >= 0) dispatch({ type: 'setSlot', slot, menuId: null });
  };
  const row = (m: { def: MenuDef; locked: boolean }) => (
    <MenuRow key={m.def.id} s={s} def={m.def} locked={m.locked} on={onBoard.includes(m.def.id)} disabled={used >= total}
      unlock={m.locked ? (props.menuUnlockText?.(m.def.id) ?? unlockText({})) : null}
      onPut={() => put(m.def.id)} onPull={() => pull(m.def.id)} />
  );

  return (
    <div style={body} data-testid="menu-window">
      <div data-testid="menu-board" style={{ background: PALETTE.paperDark, border: `2px solid ${PALETTE.wood}`, borderRadius: 8, padding: '6px 8px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <b style={{ fontSize: 16, whiteSpace: 'nowrap' }}>메뉴판 {used}/{total}칸</b>
          <span style={soft}>{used >= total ? '꽉 찼어요 — 하나 내려야 올려요' : `빈 칸 ${total - used}개`}</span>
        </div>
        {board.length === 0 ? <Empty>아직 올린 메뉴가 없어요</Empty> : board.map(row)}
      </div>

      <Chips chips={CHIPS} active={filter} onPick={setFilter} />
      {list.length === 0 && <Empty>이 분류엔 더 올릴 메뉴가 없어요</Empty>}
      {list.map(row)}
      <div style={{ ...soft, marginTop: 4 }}>{label('category', 'drink')}는 누구나 시켜요. 디저트·식사는 좋아하는 손님이 따로 있어요.</div>
    </div>
  );
}

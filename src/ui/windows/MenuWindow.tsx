/** 메뉴판 창 (스펙 §4.1). 한 줄 = [아이콘] 이름 ₩가격 ★인기 [올리기/내리기], 아래 재료·직원 조건 한글.
 *  잠긴 메뉴는 🔒 + 해금 문구. 상단 "메뉴 슬롯 n/m", 카테고리 칩. 가격 조정 액션은 sim에 없어 가격은 보기만. */
import { useState } from 'react';
import type { GameState, MenuDef, MenuCategory } from '../../sim/index.ts';
import { menuOf, priceOf, hasMenuStaff, isMenuAvailable, menuStatsOf } from '../../sim/index.ts';
import { MENUS, statSum } from '../../data/index.ts';
import { label, requireText, ingredientsText, unlockText, wonText } from '../../data/labels.ts';
import { PALETTE } from '../frame';
import { useWindowState, body, Chips, Stars, rowCard, rowCardOn, rowCardLocked, rowBtn, rowBtnOn, rowBtnOff, soft, Empty, type WindowProps } from './shared.tsx';

const CAT_ICON: Record<MenuCategory, string> = { drink: '☕', dessert: '🍰', meal: '🍽️', signature: '✨' };
type Filter = 'all' | MenuCategory;
const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'drink', label: '음료' }, { key: 'dessert', label: '디저트' }, { key: 'meal', label: '식사' }, { key: 'signature', label: '시그니처' },
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

export function MenuWindow(props: MenuWindowProps) {
  const { s, dispatch } = useWindowState(props);
  const [filter, setFilter] = useState<Filter>('all');
  const onBoard = s.menuSlots.filter((m): m is string => m !== null);
  const used = onBoard.length;
  const total = s.menuSlots.length;
  const unlockedIds = new Set(s.unlocked.menus);
  const all: { def: MenuDef; locked: boolean }[] = [
    ...s.customMenus.map((def) => ({ def, locked: false })),
    ...MENUS.map((def) => ({ def, locked: !unlockedIds.has(def.id) })),
  ];
  const list = all.filter((m) => filter === 'all' || m.def.category === filter);
  // 메뉴판에 올라간 것 → 열린 것 → 잠긴 것
  list.sort((a, b) => Number(onBoard.includes(b.def.id)) - Number(onBoard.includes(a.def.id)) || Number(a.locked) - Number(b.locked));

  const put = (id: string) => {
    const slot = s.menuSlots.indexOf(null);
    if (slot < 0) return;
    dispatch({ type: 'setSlot', slot, menuId: id });
  };
  const pull = (id: string) => {
    const slot = s.menuSlots.indexOf(id);
    if (slot >= 0) dispatch({ type: 'setSlot', slot, menuId: null });
  };

  return (
    <div style={body} data-testid="menu-window">
      <div style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 16, whiteSpace: 'nowrap' }}>메뉴 슬롯 {used}/{total}</b>
        <span style={{ ...soft, marginLeft: 8 }}>{used >= total ? '꽉 찼어요 — 하나 내려야 올릴 수 있어요' : '올리기를 누르면 메뉴판에 올라가요'}</span>
      </div>
      <Chips chips={CHIPS} active={filter} onPick={setFilter} />
      {list.length === 0 && <Empty>이 분류엔 메뉴가 없어요</Empty>}
      {list.map(({ def, locked }) => {
        const id = def.id;
        const on = onBoard.includes(id);
        const staffOk = !locked && hasMenuStaff(s, id);
        const ready = !locked && isMenuAvailable(s, id);
        const req = requireText(def);
        const price = locked ? def.price : priceOf(s, id);
        const unlock = locked ? (props.menuUnlockText?.(id) ?? unlockText({})) : null;
        return (
          <div key={id} style={locked ? rowCardLocked : on ? rowCardOn : rowCard} data-testid={`menu-row-${id}`} aria-disabled={locked || undefined}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22, width: 28, textAlign: 'center', flex: '0 0 auto' }} aria-hidden>{locked ? '🔒' : CAT_ICON[def.category]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <b style={{ fontSize: 16 }}>{def.name}</b>
                  <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{wonText(price)}</span>
                </div>
                <div style={{ ...soft, marginTop: 2 }}>
                  {locked ? unlock : (
                    <>
                      <Stars n={menuStars(s, id)} label={`인기 ${menuStars(s, id)}/5`} /> · {ingredientsText(def) || '재료 없음'}
                      {req && <span style={{ color: staffOk ? PALETTE.inkSoft : PALETTE.bad }}> · {req}</span>}
                      {!ready && staffOk && on && <span style={{ color: PALETTE.bad }}> · 재료 없음</span>}
                      {(s.menuSold[id] ?? 0) > 0 && <span> · {s.menuSold[id]}잔 팔림</span>}
                    </>
                  )}
                </div>
              </div>
              {!locked && (
                on
                  ? <button style={rowBtnOn} onClick={() => pull(id)} aria-label={`${def.name} 내리기`}>내리기</button>
                  : <button data-tut="menu-put" style={used >= total ? rowBtnOff : rowBtn} disabled={used >= total} onClick={() => put(id)} aria-label={`${def.name} 올리기`}>올리기</button>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ ...soft, marginTop: 4 }}>{label('category', 'drink')}는 누구나 시켜요. 디저트·식사는 좋아하는 손님이 따로 있어요.</div>
    </div>
  );
}

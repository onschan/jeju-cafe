/** 메뉴판 창 (스펙 §4.1 · ui3 정돈).
 *  위쪽 고정 구역 = 메뉴판에 올린 것(슬롯 n/m), 아래 = 분류별 후보 목록. 둘을 시각적으로 갈라 둔다.
 *  한 줄은 [아이콘] 이름 ₩가격 ★인기 [올리기/내리기]만 — 재료·필요 직원·판매량은 줄을 탭하면 **창 하단 고정 바**에 뜬다(「자세히」로 3줄).
 *  분류 칩은 4개 고정(음료·디저트·식사·시그니처). 잠긴 메뉴는 자물쇠 + 해금 문구. 가격 조정 액션은 sim에 없어 가격은 보기만. */
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import type { GameState, MenuDef, MenuCategory } from '../../sim/index.ts';
import { menuOf, priceOf, hasMenuStaff, isMenuAvailable, menuStatsOf } from '../../sim/index.ts';
import { MENUS, statSum } from '../../data/index.ts';
import { label, requireText, ingredientsText, unlockText, wonText } from '../../data/labels.ts';
import { PALETTE, brownBtn, brownBtnOff } from '../frame';
import { WindowBar } from '../Window';
import { showFirstTip } from '../firstTip';
import { useWindowState, body, Chips, Stars, rowCard, rowCardOn, rowCardLocked, rowBtn, rowBtnOn, rowBtnOff, soft, oneLine, Empty, type WindowProps } from './shared.tsx';

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

/** 한 줄: 1차 정보만. 탭하면 고르고, 재료·필요 직원·판매량은 창 하단 고정 바에 뜬다. */
function MenuRow({ s, def, locked, on, picked, unlock, disabled, onSelect, onPut, onPull }: {
  s: GameState; def: MenuDef; locked: boolean; on: boolean; picked: boolean; unlock: string | null; disabled: boolean; onSelect: () => void; onPut: () => void; onPull: () => void;
}) {
  const id = def.id;
  const staffOk = !locked && hasMenuStaff(s, id);
  const ready = !locked && isMenuAvailable(s, id);
  const req = requireText(def);
  const price = locked ? def.price : priceOf(s, id);
  return (
    <div style={{ ...(locked ? rowCardLocked : on ? rowCardOn : rowCard), ...(picked ? { boxShadow: `0 0 0 3px ${PALETTE.btnOn}` } : null) }} data-testid={`menu-row-${id}`} aria-disabled={locked || undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 28, display: 'flex', justifyContent: 'center', flex: '0 0 auto' }} aria-hidden><Icon name={locked ? 'lock' : CAT_ICON[def.category]} size={24} /></span>
        <button onClick={onSelect} aria-pressed={picked} aria-label={`${def.name} 고르기`}
          style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'transparent', border: 0, padding: 0, fontFamily: 'inherit', color: 'inherit', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 16 }}>{def.name}</b>
          <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}>{wonText(price)}</span>
          {!locked && <Stars n={menuStars(s, id)} label={`인기 ${menuStars(s, id)}/5`} />}
          {!locked && on && !ready && staffOk && <span style={{ color: PALETTE.bad, fontSize: 13 }}>재료 없음</span>}
          {!locked && !staffOk && req && <span style={{ color: PALETTE.bad, fontSize: 13 }}>직원 없음</span>}
          <span style={{ ...soft, fontSize: 13 }}>{picked ? '▲' : '▼'}</span>
        </button>
        {!locked && (
          on
            ? <button style={rowBtnOn} onClick={onPull} aria-label={`${def.name} 내리기`}>내리기</button>
            : <button data-tut="menu-put" style={disabled ? rowBtnOff : rowBtn} disabled={disabled} onClick={onPut} aria-label={`${def.name} 올리기`}>올리기</button>
        )}
      </div>
      {locked && <div style={{ ...soft, marginTop: 2 }}>{unlock}</div>}
    </div>
  );
}

/** ui-bar: 고른 메뉴는 창 하단 고정 바에 — 이름·가격·★ + 요약 한 줄 + 오른쪽 「올리기/내리기」. 「자세히」는 최대 3줄. */
function PickedBar({ s, def, locked, on, unlock, disabled, onPut, onPull }: {
  s: GameState; def: MenuDef; locked: boolean; on: boolean; unlock: string | null; disabled: boolean; onPut: () => void; onPull: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = def.id;
  useEffect(() => { setOpen(false); }, [id]);
  const staffOk = !locked && hasMenuStaff(s, id);
  const ready = !locked && isMenuAvailable(s, id);
  const req = requireText(def);
  const price = locked ? def.price : priceOf(s, id);
  const sold = s.menuSold[id] ?? 0;
  const hint = locked ? (unlock ?? '') : on ? (ready ? '메뉴판에 올라가 있어요' : staffOk ? '재료가 없어요' : '만들 직원이 없어요') : disabled ? '메뉴판이 꽉 찼어요' : '올리면 손님이 시켜요';
  return (
    <WindowBar testId="menu-detail">
      {open && (
        <div data-testid="menu-detail-more" style={{ ...soft, fontSize: 13, lineHeight: 1.4, marginBottom: 4, borderBottom: `1px solid ${PALETTE.woodLight}`, paddingBottom: 4 }}>
          <div style={{ ...oneLine, color: staffOk || locked ? PALETTE.inkSoft : PALETTE.bad }}>필요 직원 · {req || '누구나'}</div>
          <div style={oneLine}>{sold > 0 ? `${sold}잔 팔림` : '아직 안 팔렸어요'}</div>
          <div style={oneLine}>{label('category', def.category)}{locked ? '' : ` · 인기 ${menuStars(s, id)}/5`}</div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...oneLine, fontSize: 16, fontWeight: 700 }}>
            <Icon name={locked ? 'lock' : CAT_ICON[def.category]} size={16} /> {def.name} <span style={{ fontWeight: 400, fontSize: 14 }}>{wonText(price)}</span> {!locked && <Stars n={menuStars(s, id)} label={`인기 ${menuStars(s, id)}/5`} />}
          </div>
          <div style={{ ...soft, ...oneLine, fontSize: 13 }}>재료 · {ingredientsText(def) || '재료 없음'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: 2 }}>
            <button data-testid="menu-detail-toggle" aria-expanded={open} onClick={() => setOpen(!open)}
              style={{ ...brownBtn, margin: 0, padding: '0 8px', minHeight: 44, fontSize: 13, flex: '0 0 auto' }}>자세히 {open ? '▲' : '▼'}</button>
            <span style={{ ...soft, ...oneLine, fontSize: 13, color: locked || (on && !ready) ? PALETTE.bad : PALETTE.inkSoft }}>{hint}</span>
          </div>
        </div>
        {!locked && (on
          ? <button data-testid="menu-bar-pull" style={{ ...brownBtn, margin: 0, minHeight: 44, flex: '0 0 auto' }} onClick={onPull} aria-label={`${def.name} 내리기`}>내리기</button>
          : <button data-testid="menu-bar-put" style={{ ...(disabled ? brownBtnOff : brownBtn), margin: 0, minHeight: 44, flex: '0 0 auto' }} disabled={disabled} onClick={onPut} aria-label={`${def.name} 올리기`}>올리기</button>)}
      </div>
    </WindowBar>
  );
}

export function MenuWindow(props: MenuWindowProps) {
  const { s, dispatch } = useWindowState(props);
  const [filter, setFilter] = useState<MenuCategory>('drink');
  const [picked, setPicked] = useState<string | null>(null); // ui-bar: 고른 메뉴 — 상세는 창 하단 고정 바에
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
  const unlockOf = (m: { def: MenuDef; locked: boolean }) => (m.locked ? (props.menuUnlockText?.(m.def.id) ?? unlockText({})) : null);
  // 고를 때 팁 말풍선을 내린다 — 아래 고정 바를 가리지 않게 (짓기 창과 같은 규칙)
  const row = (m: { def: MenuDef; locked: boolean }) => (
    <MenuRow key={m.def.id} s={s} def={m.def} locked={m.locked} on={onBoard.includes(m.def.id)} picked={picked === m.def.id} disabled={used >= total}
      unlock={unlockOf(m)} onSelect={() => { setPicked(picked === m.def.id ? null : m.def.id); showFirstTip(null); }}
      onPut={() => put(m.def.id)} onPull={() => pull(m.def.id)} />
  );
  const sel = picked ? all.find((m) => m.def.id === picked) : undefined;

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
      {sel && <PickedBar s={s} def={sel.def} locked={sel.locked} on={onBoard.includes(sel.def.id)} disabled={used >= total} unlock={unlockOf(sel)}
        onPut={() => put(sel.def.id)} onPull={() => pull(sel.def.id)} />}
    </div>
  );
}

import { useState, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useGame, dispatch } from './store';
import { objectAt, isMenuAvailable, hasMenuStaff, menuRequirementText, sceneryScore, boardBadge, clearCost, placeCost, MENU_SLOT_COUNT } from '../sim/index.ts';
import { objectDef, cropDef, menuDef } from '../data/index.ts';
import { Icon } from './Icon';
import { StaffPanel } from './StaffPanel';
import { PromoPanel } from './PromoPanel';
import { ObjectInfoPanel, CodexPanel, RockPanel } from './ObjectInfoPanel';
import { BoardPanel } from './BoardPanel';
import { CafePanel } from './CafePanel';
import { GuestsPanel } from './GuestsPanel';
import { frame, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, brownSelect, PALETTE, won } from './frame';

export type Mode =
  | { kind: 'idle' }
  | { kind: 'build'; objectType: string }
  | { kind: 'move' }
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'menu' }
  | { kind: 'staff'; focusId?: string }
  | { kind: 'promo' }
  | { kind: 'codex' }
  | { kind: 'guests' }
  | { kind: 'invest' }
  | { kind: 'shop' }
  | { kind: 'rank' }
  | { kind: 'cafe' };

/** 고스트 배치 확정 줄: 상태 문구 + ✓ / ↻ / ✗ */
export interface PlaceBarProps {
  text: string;
  ok: boolean;
  canRotate: boolean;
  msg: string | null;
  onConfirm: () => void;
  onRotate: () => void;
  onCancel: () => void;
}

/** 짓기 카드를 맵으로 끌어 놓기: 'move'는 손가락이 움직일 때마다, 'end'는 손을 뗄 때 */
export type DragBuild = (objectType: string, clientX: number, clientY: number, phase: 'move' | 'end') => void;

/** 길·돌담은 드래그로 칠한다 (App과 같은 규칙) */
const PAINT_KINDS = new Set(['path', 'wall']);
/** 카드에서 이만큼 움직이면 끌기로 본다 */
const CARD_DRAG_PX = 8;

/** GDD의 하단 6버튼 + 더보기(카페·메뉴판·홍보·도감·이동). 같은 탭을 다시 누르면 보기로 돌아간다. */
const MAIN_TABS: { kind: Mode['kind']; icon: string; label: string; to: Mode }[] = [
  { kind: 'build', icon: 'build', label: '짓기', to: { kind: 'build', objectType: 'field' } },
  { kind: 'guests', icon: 'tourist', label: '손님', to: { kind: 'guests' } },
  { kind: 'staff', icon: 'local', label: '직원', to: { kind: 'staff' } },
  { kind: 'invest', icon: 'calendar', label: '투자', to: { kind: 'invest' } },
  { kind: 'shop', icon: 'money', label: '상점', to: { kind: 'shop' } },
  { kind: 'rank', icon: 'unlock', label: '랭킹', to: { kind: 'rank' } },
];
const MORE_TABS: { kind: Mode['kind']; icon: string; label: string; to: Mode }[] = [
  { kind: 'cafe', icon: 'look', label: '카페', to: { kind: 'cafe' } },
  { kind: 'menu', icon: 'menu', label: '메뉴판', to: { kind: 'menu' } },
  { kind: 'promo', icon: 'speed_1', label: '홍보', to: { kind: 'promo' } },
  { kind: 'codex', icon: 'research', label: '도감', to: { kind: 'codex' } },
  { kind: 'move', icon: 'harvest', label: '이동', to: { kind: 'move' } },
];
const MORE_KINDS = new Set(MORE_TABS.map((t) => t.kind));
const TALL_KINDS = new Set<Mode['kind']>(['staff', 'promo', 'codex', 'cell', 'guests', 'invest', 'cafe', 'shop', 'rank']);

/** 재료 있음/없음 색점 (leaf / red) */
function Dot({ ok }: { ok: boolean }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: ok ? '#6abe30' : '#e63946', marginRight: 4, verticalAlign: 'middle' }} />;
}

/** 메뉴 상태 문구: 재료 있음 / 재료 없음 / 바리스타 필요 */
function menuStatus(s: ReturnType<typeof useGame>, id: string): { ok: boolean; text: string } {
  if (!hasMenuStaff(s, id)) return { ok: false, text: menuRequirementText(id) ?? '직원 필요' };
  const ok = isMenuAvailable(s, id);
  return { ok, text: ok ? '재료 있음' : '재료 없음' };
}

/** 하단 메시지 줄 ("여기엔 못 지어요" 등) */
function MessageBar({ text }: { text: string | null }) {
  if (!text) return null;
  return <div data-testid="place-msg" style={{ background: PALETTE.bad, color: '#fff', fontWeight: 700, padding: '6px 10px', borderRadius: 6, marginBottom: 6 }}>{text}</div>;
}

function PlaceBar({ text, ok, canRotate, msg, onConfirm, onRotate, onCancel }: PlaceBarProps) {
  return (
    <div style={{ marginBottom: 6 }}>
      <MessageBar text={msg} />
      <div style={{ fontSize: 13, color: ok ? PALETTE.ok : PALETTE.bad, marginBottom: 4 }}>{text}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button aria-label="확정" style={{ ...(ok ? brownBtnOn : brownBtnOff), flex: 1, fontSize: 20 }} onClick={onConfirm}>✓ 확정</button>
        {canRotate && <button aria-label="회전" style={{ ...brownBtn, fontSize: 20 }} onClick={onRotate}>↻</button>}
        <button aria-label="취소" style={{ ...dangerBtn, fontSize: 20 }} onClick={onCancel}>✗</button>
      </div>
    </div>
  );
}

/** 짓기 카드: 누르면 고르고, 맵으로 끌면 그 자리에 고스트가 생긴다 */
function BuildCard({ type, on, onPick, onDrag }: { type: string; on: boolean; onPick: () => void; onDrag: DragBuild | undefined }) {
  const s = useGame();
  const d = objectDef(type);
  const cost = placeCost(s, type);
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!onDrag || PAINT_KINDS.has(d.kind)) return;
    start.current = { x: e.clientX, y: e.clientY, dragging: false };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 활성 포인터가 없으면 무시 */ }
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const st = start.current;
    if (!st || !onDrag) return;
    if (!st.dragging && Math.hypot(e.clientX - st.x, e.clientY - st.y) < CARD_DRAG_PX) return;
    if (!st.dragging) { st.dragging = true; onPick(); }
    onDrag(type, e.clientX, e.clientY, 'move');
  };
  const up = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const st = start.current;
    start.current = null;
    if (st?.dragging && onDrag) { onDrag(type, e.clientX, e.clientY, 'end'); e.preventDefault(); }
  };
  return (
    <button style={{ ...(on ? brownBtnOn : brownBtn), touchAction: 'none' }} onClick={() => { if (!start.current?.dragging) onPick(); }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; }} data-testid={`build-${type}`}>
      {d.name} {cost > 0 ? won(cost) : ''}{d.indoor ? ' 🏠' : ''}
    </button>
  );
}

export function BottomSheet({ mode, setMode, place, msg, onGuest, onDragBuild }: {
  mode: Mode; setMode: (m: Mode) => void; place: PlaceBarProps | null; msg: string | null;
  onGuest: (guestId: string) => void; onDragBuild?: DragBuild;
}) {
  const s = useGame();
  const [more, setMore] = useState(false);
  const tall = TALL_KINDS.has(mode.kind);
  const badge = boardBadge(s);
  const moreOpen = more || MORE_KINDS.has(mode.kind);
  const tabBtn = (t: { kind: Mode['kind']; icon: string; label: string; to: Mode }) => (
    <button key={t.kind} data-tab={t.label} style={{ ...(mode.kind === t.kind ? brownBtnOn : brownBtn), padding: '0 8px', position: 'relative' }} onClick={() => setMode(mode.kind === t.kind ? { kind: 'idle' } : t.to)} aria-label={t.label}>
      <Icon name={t.icon} /> {t.label}
      {t.kind === 'guests' && badge > 0 && <span data-testid="board-badge" style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: PALETTE.bad, color: '#fff', fontSize: 11, lineHeight: '18px', textAlign: 'center', padding: '0 4px' }}>{badge}</span>}
    </button>
  );
  return (
    <div style={{ ...frame, position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: '10px 10px 0 0', borderBottom: 0, padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', maxHeight: tall ? '60vh' : '40vh', overflowY: 'auto', fontSize: 16 }}>
      {place ? <PlaceBar {...place} /> : <MessageBar text={msg} />}
      <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap' }} data-testid="tabs">
        {MAIN_TABS.map(tabBtn)}
        <button style={{ ...(moreOpen ? brownBtnOn : brownBtn), padding: '0 8px' }} onClick={() => setMore(!more)} aria-label="더보기" aria-expanded={moreOpen} data-tab="더보기">⋯ 더보기</button>
        {moreOpen && MORE_TABS.map(tabBtn)}
      </div>

      {mode.kind === 'build' && (
        <div>
          {s.unlocked.objects.map((t) => (
            <BuildCard key={t} type={t} on={mode.objectType === t} onPick={() => setMode({ kind: 'build', objectType: t })} onDrag={onDragBuild} />
          ))}
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>
            {PAINT_KINDS.has(objectDef(mode.objectType).kind) ? '칸을 누르거나 끌어서 이어 놓아요' : '칸을 누르거나 카드를 맵으로 끌면 고스트가 생겨요. 끌어서 옮기고 ✓로 확정해요. 🏠 = 실내(본관 안)에만'}
          </div>
        </div>
      )}

      {mode.kind === 'move' && !place && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>옮길 것을 누르고, 새 자리를 누른 뒤 ✓로 확정해요 (돈은 안 들어요). 보기 모드에서 길게 눌러도 들어 올려져요</div>}
      {mode.kind === 'idle' && !place && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>칸·손님·직원을 누르면 정보가 보여요. 오브젝트를 길게 누르면 옮길 수 있어요</div>}

      {mode.kind === 'cell' && <CellPanel x={mode.x} y={mode.y} />}

      {mode.kind === 'menu' && (
        <div>
          {Array.from({ length: MENU_SLOT_COUNT }, (_, i) => {
            const cur = s.menuSlots[i] ?? null;
            const st = cur ? menuStatus(s, cur) : null;
            return (
              <div key={i} style={{ marginBottom: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-block', width: 28 }}>{i + 1}.</span>
                <select value={cur ?? ''} onChange={(e) => dispatch({ type: 'setSlot', slot: i, menuId: e.target.value || null })} style={brownSelect}>
                  <option value="">(비움)</option>
                  {s.unlocked.menus.map((m) => {
                    const req = hasMenuStaff(s, m) ? null : menuRequirementText(m);
                    return <option key={m} value={m}>{menuDef(m).name} {won(menuDef(m).price)}{req ? ` · ${req}` : ''}</option>;
                  })}
                </select>
                {st && <span style={{ fontSize: 13, marginBottom: 6 }}><Dot ok={st.ok} />{st.text}</span>}
              </div>
            );
          })}
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>창고: {Object.entries(s.storage).map(([c, n]) => `${cropDef(c).name} ${n}`).join(' · ') || '비어 있음'}</div>
        </div>
      )}

      {mode.kind === 'staff' && <StaffPanel focusId={mode.focusId ?? null} />}
      {mode.kind === 'promo' && <PromoPanel />}
      {mode.kind === 'codex' && <CodexPanel />}
      {mode.kind === 'guests' && <GuestsPanel onGuest={onGuest} />}
      {mode.kind === 'invest' && <BoardPanel tabs={['spots', 'events']} />}
      {mode.kind === 'cafe' && <CafePanel onMenu={() => setMode({ kind: 'menu' })} />}
      {mode.kind === 'shop' && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>상점(마일리지·응모권)은 곧 열려요. 지금 마일리지 {s.mileage} · 응모권 {s.tickets}</div>}
      {mode.kind === 'rank' && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>가이드북 랭킹은 1년차 7월에 첫 발표! 지금 카페 랭크 {s.rank} · ★{s.star}</div>}
    </div>
  );
}

function CellPanel({ x, y }: { x: number; y: number }) {
  const s = useGame();
  const o = objectAt(s, x, y);
  if (!o) {
    if (clearCost(s, x, y) !== null) return <RockPanel x={x} y={y} />;
    return <div style={{ color: PALETTE.inkSoft }}>빈 칸 ({x},{y}) · 경치 {sceneryScore(s, x, y)}</div>;
  }
  return <ObjectInfoPanel objectId={o.id} />;
}

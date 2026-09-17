import { useGame, dispatch } from './store';
import { objectAt, isMenuAvailable, hasMenuStaff, menuRequirementText, sceneryScore, MENU_SLOT_COUNT } from '../sim/index.ts';
import { objectDef, cropDef, menuDef } from '../data/index.ts';
import { Icon } from './Icon';
import { StaffPanel } from './StaffPanel';
import { PromoPanel } from './PromoPanel';
import { ObjectInfoPanel, CodexPanel } from './ObjectInfoPanel';
import { frame, brownBtn, brownBtnOn, brownBtnOff, dangerBtn, brownSelect, PALETTE, won } from './frame';

export type Mode = { kind: 'idle' } | { kind: 'build'; objectType: string } | { kind: 'move' } | { kind: 'cell'; x: number; y: number } | { kind: 'menu' } | { kind: 'staff' } | { kind: 'promo' } | { kind: 'codex' };

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

/** 길·돌담은 드래그로 칠한다 (App과 같은 규칙) */
const PAINT_KINDS = new Set(['path', 'wall']);

const TABS: { kind: Mode['kind']; icon: string; label: string; to: Mode }[] = [
  { kind: 'idle', icon: 'look', label: '보기', to: { kind: 'idle' } },
  { kind: 'build', icon: 'build', label: '짓기', to: { kind: 'build', objectType: 'field' } },
  { kind: 'move', icon: 'harvest', label: '이동', to: { kind: 'move' } },
  { kind: 'menu', icon: 'menu', label: '메뉴판', to: { kind: 'menu' } },
  { kind: 'staff', icon: 'local', label: '직원', to: { kind: 'staff' } },
  { kind: 'promo', icon: 'tourist', label: '홍보', to: { kind: 'promo' } },
  { kind: 'codex', icon: 'research', label: '도감', to: { kind: 'codex' } },
];

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

export function BottomSheet({ mode, setMode, place, msg }: { mode: Mode; setMode: (m: Mode) => void; place: PlaceBarProps | null; msg: string | null }) {
  const s = useGame();
  const tall = mode.kind === 'staff' || mode.kind === 'promo' || mode.kind === 'codex' || mode.kind === 'cell';
  return (
    <div style={{ ...frame, position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: '10px 10px 0 0', borderBottom: 0, padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', maxHeight: tall ? '60vh' : '40vh', overflowY: 'auto', fontSize: 16 }}>
      {place ? <PlaceBar {...place} /> : <MessageBar text={msg} />}
      <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.kind} style={{ ...(mode.kind === t.kind ? brownBtnOn : brownBtn), padding: '0 8px' }} onClick={() => setMode(t.to)}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      {mode.kind === 'build' && (
        <div>
          {s.unlocked.objects.map((t) => {
            const d = objectDef(t);
            const on = mode.objectType === t;
            return (
              <button key={t} style={on ? brownBtnOn : brownBtn} onClick={() => setMode({ kind: 'build', objectType: t })}>
                {d.name} {d.cost > 0 ? won(d.cost) : ''}
              </button>
            );
          })}
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>
            {PAINT_KINDS.has(objectDef(mode.objectType).kind) ? '칸을 누르거나 끌어서 이어 놓아요' : '칸을 누르면 고스트가 생겨요. 끌어서 옮기고 ✓로 확정해요'}
          </div>
        </div>
      )}

      {mode.kind === 'move' && !place && <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>옮길 것을 누르고, 새 자리를 누른 뒤 ✓로 확정해요 (돈은 안 들어요)</div>}

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

      {mode.kind === 'staff' && <StaffPanel />}
      {mode.kind === 'promo' && <PromoPanel />}
      {mode.kind === 'codex' && <CodexPanel />}
    </div>
  );
}

function CellPanel({ x, y }: { x: number; y: number }) {
  const s = useGame();
  const o = objectAt(s, x, y);
  if (!o) return <div style={{ color: PALETTE.inkSoft }}>빈 칸 ({x},{y}) · 경치 {sceneryScore(s, x, y)}</div>;
  return <ObjectInfoPanel objectId={o.id} />;
}

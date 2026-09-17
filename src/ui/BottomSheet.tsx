import type { CSSProperties } from 'react';
import { useGame, dispatch } from './store';
import { objectAt, canPlant, isMenuAvailable, MENU_SLOT_COUNT, PROTECTED_TYPES } from '../sim/index.ts';
import { objectDef, cropDef, menuDef, CROPS } from '../data/index.ts';

export type Mode = { kind: 'idle' } | { kind: 'build'; objectType: string } | { kind: 'cell'; x: number; y: number } | { kind: 'menu' };

const btn: CSSProperties = { minHeight: 44, padding: '0 12px', marginRight: 6, marginBottom: 6, border: 0, borderRadius: 8, background: '#333', color: '#fff', fontSize: 16 };
const disabledBtn: CSSProperties = { ...btn, opacity: 0.5 };

export function BottomSheet({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const s = useGame();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#222', color: '#fff', padding: '10px 12px calc(10px + env(safe-area-inset-bottom))', borderTop: '1px solid #444', maxHeight: '40vh', overflowY: 'auto', fontSize: 16 }}>
      <div style={{ marginBottom: 6 }}>
        <button style={{ ...btn, background: mode.kind === 'idle' ? '#ffd166' : '#333', color: mode.kind === 'idle' ? '#000' : '#fff' }} onClick={() => setMode({ kind: 'idle' })}>👆 보기</button>
        <button style={{ ...btn, background: mode.kind === 'build' ? '#ffd166' : '#333', color: mode.kind === 'build' ? '#000' : '#fff' }} onClick={() => setMode({ kind: 'build', objectType: 'field' })}>🔨 짓기</button>
        <button style={{ ...btn, background: mode.kind === 'menu' ? '#ffd166' : '#333', color: mode.kind === 'menu' ? '#000' : '#fff' }} onClick={() => setMode({ kind: 'menu' })}>📋 메뉴판</button>
      </div>

      {mode.kind === 'build' && (
        <div>
          {s.unlocked.objects.map((t) => {
            const d = objectDef(t);
            const on = mode.objectType === t;
            return (
              <button key={t} style={{ ...btn, background: on ? '#06d6a0' : '#333' }} onClick={() => setMode({ kind: 'build', objectType: t })}>
                {d.name} {d.cost > 0 ? `₩${d.cost}` : ''}
              </button>
            );
          })}
          <div style={{ fontSize: 13, opacity: 0.7 }}>칸을 눌러서 놓아요</div>
        </div>
      )}

      {mode.kind === 'cell' && <CellPanel x={mode.x} y={mode.y} />}

      {mode.kind === 'menu' && (
        <div>
          {Array.from({ length: MENU_SLOT_COUNT }, (_, i) => {
            const cur = s.menuSlots[i] ?? null;
            return (
              <div key={i} style={{ marginBottom: 6 }}>
                <span style={{ display: 'inline-block', width: 40 }}>{i + 1}.</span>
                <select value={cur ?? ''} onChange={(e) => dispatch({ type: 'setSlot', slot: i, menuId: e.target.value || null })} style={{ minHeight: 44, fontSize: 16 }}>
                  <option value="">(비움)</option>
                  {s.unlocked.menus.map((m) => <option key={m} value={m}>{menuDef(m).name} ₩{menuDef(m).price}</option>)}
                </select>
                {cur && <span style={{ marginLeft: 8 }}>{isMenuAvailable(s, cur) ? '✅ 재료 있음' : '❌ 재료 없음'}</span>}
              </div>
            );
          })}
          <div style={{ fontSize: 13, opacity: 0.7 }}>창고: {Object.entries(s.storage).map(([c, n]) => `${cropDef(c).name} ${n}`).join(' · ') || '비어 있음'}</div>
        </div>
      )}
    </div>
  );
}

function CellPanel({ x, y }: { x: number; y: number }) {
  const s = useGame();
  const o = objectAt(s, x, y);
  if (!o) return <div style={{ opacity: 0.7 }}>빈 칸 ({x},{y})</div>;
  const d = objectDef(o.type);
  return (
    <div>
      <div style={{ marginBottom: 6 }}><b>{d.name}</b>{o.crop && ` · ${cropDef(o.crop.cropId).name} ${o.crop.ready ? '수확할 수 있어요!' : `${o.crop.daysGrown}일째`}`}</div>
      {d.kind === 'field' && !o.crop && CROPS.filter((c) => s.unlocked.crops.includes(c.id) && c.plantMonths.length > 0).map((c) => {
        const can = canPlant(s, o.id, c.id);
        return (
          <button key={c.id} style={can.ok ? btn : disabledBtn} disabled={!can.ok} onClick={() => dispatch({ type: 'plant', objectId: o.id, cropId: c.id })}>
            🌱 {c.name} 심기{!can.ok && can.reason && ` (${can.reason})`}
          </button>
        );
      })}
      {o.crop?.ready && <button style={{ ...btn, background: '#ffd166', color: '#000' }} onClick={() => dispatch({ type: 'harvest', objectId: o.id })}>✨ 수확</button>}
      {!PROTECTED_TYPES.has(o.type) && (
        <button style={{ ...btn, background: '#8a2a2a' }} onClick={() => dispatch({ type: 'remove', objectId: o.id })}>🗑 치우기 (₩{d.cost} 돌려받음)</button>
      )}
    </div>
  );
}

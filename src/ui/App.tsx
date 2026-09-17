import { useCallback, useEffect, useRef, useState } from 'react';
import { GameView, type GhostSpec } from '../render/GameView';
import { startLoop, dispatch, getState, setViewReset, autosaveNow, hasAnySave, loadSlot, setMonthCardHook } from './store';
import { unlockAudio, bgm, isMuted, setMuted } from './audio';
import { seasonOf, canPlace, objectAt, footprint, parcelAt, parcelPrice, canBuyParcel, PROTECTED_TYPES, ROTATABLE_TYPES, type GameState } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
// render/·ui/는 Vite 전용이라 확장자 없는 import 허용. sim/·data/만 .ts 확장자 규칙.
import { HUD, NightOverlay } from './HUD';
import { BottomSheet, type Mode, type PlaceBarProps } from './BottomSheet';
import { MonthCard } from './MonthCard';
import { Guide } from './Guide';
import { PopupHost, Popup, Confirm } from './Popup';
import { won, brownBtn, dangerBtn } from './frame';
import { TitleScreen } from './TitleScreen';
import { SaveSlots } from './SaveSlots';
import { TutorialOverlay } from './TutorialOverlay';
import { useTutorial } from './tutorial';
import { showScene, SceneHost, type SceneChar } from './SceneWindow';
import { staffParts } from '../render/character';

/** 길·돌담은 드래그로 연속해서 놓는다 (고스트 없이) */
const PAINT_KINDS = new Set(['path', 'wall']);
const MSG_MS = 1500;

/** 짓기 모드 고스트(놓을 자리·방향) */
interface BuildGhost { x: number; y: number; rot: number }
/** 이동 모드: 고른 오브젝트와 옮길 자리 */
interface Moving { objectId: string; x: number; y: number }

/** 장면 창에 세울 직원(최대 3명). 없으면 SceneWindow가 기본 인물을 세운다. */
function staffChars(s: GameState): SceneChar[] {
  return s.staff.slice(0, 3).map((st) => ({ parts: staffParts(st.face, st.role) }));
}

function inFootprint(type: string, ox: number, oy: number, x: number, y: number): boolean {
  return footprint(type, ox, oy).some((p) => p.x === x && p.y === y);
}

/** 타이틀 → 게임. 게임에서 메뉴로 나가면 자동 저장 뒤 타이틀로. */
export function App() {
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  // 개발 자동화용: ?game 이면 자동 저장(없으면 새 게임)으로 바로 들어간다
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('game')) return;
    void hasAnySave().then(async (has) => { if (has) await loadSlot(0); setScreen('game'); });
  }, []);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {screen === 'title'
        ? <TitleScreen onEnter={() => setScreen('game')} />
        : <Game onExit={() => { autosaveNow(); setScreen('title'); }} />}
      <PopupHost />
      <SceneHost />
    </div>
  );
}

/** 게임 안 메뉴: 슬롯 저장·타이틀로 */
function GameMenu({ onClose, onExit }: { onClose: () => void; onExit: () => void }) {
  const [slots, setSlots] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };
  if (slots) return <SaveSlots mode="save" onClose={() => setSlots(false)} />;
  return (
    <Popup title="메뉴" onBackdrop={onClose} buttons={<button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={onClose}>닫기</button>}>
      <div style={{ display: 'grid', gap: 6 }}>
        <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={toggleMute}>{muted ? '소리 켜기' : '소리 끄기'}</button>
        <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={() => setSlots(true)}>슬롯에 저장</button>
        <button style={{ ...dangerBtn, marginRight: 0, marginBottom: 0 }} onClick={() => Confirm('자동 저장하고 타이틀로 나갈까요?', onExit, { title: '타이틀로' })}>타이틀로 나가기</button>
      </div>
    </Popup>
  );
}

function Game({ onExit }: { onExit: () => void }) {
  const [menu, setMenu] = useState(false);
  const tutorial = useTutorial();
  // 월 매출 신기록 → 장면 창
  useEffect(() => {
    setMonthCardHook((st, rec) => {
      const card = st.lastMonthCard;
      if (rec.monthRecord && card) showScene({ title: '월 매출 신기록', text: `${card.month}월 매출 ${won(card.income)} — 신기록!`, chars: staffChars(st), sfx: 'fanfare' });
    });
    return () => setMonthCardHook(null);
  }, []);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView | null>(null);
  const modeRef = useRef<Mode>({ kind: 'idle' });
  const [mode, setModeState] = useState<Mode>({ kind: 'idle' });
  const ghostRef = useRef<BuildGhost | null>(null);
  const [ghost, setGhostState] = useState<BuildGhost | null>(null);
  const movingRef = useRef<Moving | null>(null);
  const [moving, setMovingState] = useState<Moving | null>(null);
  /** 드래그 시작 칸과 고스트 원점의 차이 (여러 칸 오브젝트를 잡은 칸 기준으로 끌기) */
  const dragOffset = useRef({ dx: 0, dy: 0 });
  const [msg, setMsg] = useState<string | null>(null);
  const msgTimer = useRef(0);

  // 첫 터치에서 오디오를 열고 현재 계절 BGM을 시작한다 (이후 호출은 no-op)
  const onPointerDown = () => { unlockAudio(); void bgm(seasonOf(getState().clock.month)); };
  const setGhost = (g: BuildGhost | null) => { ghostRef.current = g; setGhostState(g); };
  const setMoving = (m: Moving | null) => { movingRef.current = m; setMovingState(m); };
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
    viewRef.current?.setSelection(m.kind === 'cell' ? { x: m.x, y: m.y } : null);
    if (m.kind !== 'build') setGhost(null);
    if (m.kind !== 'move') setMoving(null);
  };
  const say = useCallback((text: string) => {
    setMsg(text);
    window.clearTimeout(msgTimer.current);
    msgTimer.current = window.setTimeout(() => setMsg(null), MSG_MS);
  }, []);

  /** 미소유 필지를 누르면 구매 확인 */
  const askBuyParcel = (s: GameState, x: number, y: number): boolean => {
    const p = parcelAt(s, x, y);
    if (!p || p.owned) return false;
    const can = canBuyParcel(s, p.id);
    if (!can.ok) { say(can.reason ?? '아직 살 수 없어요'); return true; }
    Confirm(`${p.name} 필지를 ${won(parcelPrice(s, p))}에 살까요? 맵이 넓어져요.`, () => {
      if (dispatch({ type: 'buyParcel', id: p.id }).ok) showScene({ title: '필지 구매', text: `${p.name} — 땅이 넓어졌다!`, chars: staffChars(getState()), sfx: 'unlock' });
    }, { title: '필지 구매' });
    return true;
  };

  useEffect(() => {
    const host = hostRef.current!;
    const view = new GameView();
    viewRef.current = view;
    let stop: (() => void) | null = null;
    let disposed = false;
    (async () => {
      await view.init(host, {
        onTap: (x, y) => {
          const m = modeRef.current;
          const s = getState();
          if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) return;
          if (askBuyParcel(s, x, y)) return;
          if (m.kind === 'build') {
            if (PAINT_KINDS.has(objectDef(m.objectType).kind)) dispatch({ type: 'place', objectType: m.objectType, x, y });
            else setGhost({ x, y, rot: ghostRef.current?.rot ?? 0 });
          } else if (m.kind === 'move') {
            const mv = movingRef.current;
            if (mv) setMoving({ ...mv, x, y });
            else {
              const o = objectAt(s, x, y);
              if (!o) say('옮길 것을 골라 주세요');
              else if (PROTECTED_TYPES.has(o.type)) say('이건 못 옮겨요');
              else setMoving({ objectId: o.id, x: o.x, y: o.y });
            }
          } else setMode({ kind: 'cell', x, y });
        },
        dragCapture: (x, y) => {
          const m = modeRef.current;
          if (m.kind === 'build') {
            if (PAINT_KINDS.has(objectDef(m.objectType).kind)) return true;
            const g = ghostRef.current;
            if (g && inFootprint(m.objectType, g.x, g.y, x, y)) { dragOffset.current = { dx: x - g.x, dy: y - g.y }; return true; }
          } else if (m.kind === 'move') {
            const mv = movingRef.current;
            const o = mv ? getState().objects[mv.objectId] : null;
            if (mv && o && inFootprint(o.type, mv.x, mv.y, x, y)) { dragOffset.current = { dx: x - mv.x, dy: y - mv.y }; return true; }
          }
          return false;
        },
        onDragCell: (x, y) => {
          const m = modeRef.current;
          const s = getState();
          if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) return;
          const { dx, dy } = dragOffset.current;
          if (m.kind === 'build') {
            if (PAINT_KINDS.has(objectDef(m.objectType).kind)) {
              if (canPlace(s, m.objectType, x, y).ok) dispatch({ type: 'place', objectType: m.objectType, x, y });
            } else if (ghostRef.current) setGhost({ ...ghostRef.current, x: x - dx, y: y - dy });
          } else if (m.kind === 'move' && movingRef.current) setMoving({ ...movingRef.current, x: x - dx, y: y - dy });
        },
      });
      if (disposed) { view.destroy(); return; } // init 중 언마운트(Fast Refresh 등)
      // 개발 중 브라우저 자동화가 셀 → 화면 좌표를 계산할 수 있도록 (프로덕션 빌드에는 포함되지 않음)
      if (import.meta.env.DEV) (window as unknown as { __view: unknown }).__view = view;
      setViewReset(() => view.reset());
      stop = startLoop((s) => view.render(s));
    })();
    return () => { disposed = true; stop?.(); setViewReset(null); view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 고스트를 뷰에 반영한다
  const s = getState();
  let ghostSpec: GhostSpec | null = null;
  let place: PlaceBarProps | null = null;
  if (mode.kind === 'build' && ghost) {
    const def = objectDef(mode.objectType);
    const can = canPlace(s, mode.objectType, ghost.x, ghost.y);
    const ok = can.ok && s.money >= def.cost;
    ghostSpec = { type: mode.objectType, x: ghost.x, y: ghost.y, rot: ROTATABLE_TYPES.has(mode.objectType) ? ghost.rot : undefined, ok, text: `${def.name} ${won(def.cost)}` };
    place = {
      text: `${def.name} · ${won(def.cost)} · ${ok ? '여기에 지을 수 있어요' : (can.reason ?? '돈이 모자라요')}`,
      ok,
      canRotate: ROTATABLE_TYPES.has(mode.objectType),
      msg,
      onConfirm: () => {
        const r = dispatch({ type: 'place', objectType: mode.objectType, x: ghost.x, y: ghost.y, rot: ghost.rot });
        if (r.ok) setGhost(null);
        else say(r.reason ?? '여기엔 못 지어요');
      },
      onRotate: () => setGhost({ ...ghost, rot: (ghost.rot + 1) % 4 }),
      onCancel: () => setGhost(null),
    };
  } else if (mode.kind === 'move' && moving) {
    const o = s.objects[moving.objectId];
    if (o) {
      const def = objectDef(o.type);
      const can = canPlace(s, o.type, moving.x, moving.y, o.id);
      ghostSpec = { type: o.type, x: moving.x, y: moving.y, rot: o.rot, ok: can.ok, text: `${def.name} 옮기기` };
      place = {
        text: `${def.name} · ${can.ok ? '여기로 옮길 수 있어요' : (can.reason ?? '여기엔 못 옮겨요')}`,
        ok: can.ok,
        canRotate: ROTATABLE_TYPES.has(o.type),
        msg,
        onConfirm: () => {
          const r = dispatch({ type: 'move', objectId: o.id, x: moving.x, y: moving.y });
          if (r.ok) setMoving(null);
          else say(r.reason ?? '여기엔 못 지어요');
        },
        onRotate: () => dispatch({ type: 'rotate', objectId: o.id, rot: ((o.rot ?? 0) + 1) % 4 }),
        onCancel: () => setMoving(null),
      };
    }
  }
  useEffect(() => { viewRef.current?.setGhost(ghostSpec); });

  return (
    <div onPointerDownCapture={onPointerDown} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      <NightOverlay />
      <HUD onMenu={() => setMenu(true)} />
      {tutorial.done ? <Guide /> : <TutorialOverlay />}
      <BottomSheet mode={mode} setMode={setMode} place={place} msg={place ? null : msg} />
      <MonthCard />
      {menu && <GameMenu onClose={() => setMenu(false)} onExit={onExit} />}
    </div>
  );
}

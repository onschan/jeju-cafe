import { useEffect, useRef, useState } from 'react';
import { GameView, type GhostSpec } from '../render/GameView';
import { startLoop, dispatch, getState, useGame, setViewReset, autosaveNow, hasAnySave, loadSlot, setMonthCardHook, setSceneHook, showToast, pauseGame } from './store';
import { unlockAudio, bgm, isMuted, setMuted, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume, sfx } from './audio';
import { seasonOf, canPlace, objectAt, footprint, parcelAt, clearCost, placeCost, PROTECTED_TYPES, ROTATABLE_TYPES, goalForMenu, type GameState } from '../sim/index.ts';
import { objectDef, GOALS } from '../data/index.ts';
// render/·ui/는 Vite 전용이라 확장자 없는 import 허용. sim/·data/만 .ts 확장자 규칙.
import { NightOverlay, Toast } from './HUD';
import { TopShell, BottomBar, PlaceBar, SHELL_TOP, type WindowKind, type PlaceBarProps } from './Shell';
import { Window, type WindowTab } from './Window';
import { MiniCard, type CardTarget, type CardActions } from './MiniCard';
import { DialogueHost } from './Dialogue.tsx';
import { checkTutorial, markTutorialEvent } from './tutorialDialogue';
import { checkAlerts } from './alertDialogue.ts';
import { currentGoal, pastGoals, toGoal, guestSay, staffSay } from './simBridge';
import { BuildWindow } from './windows/BuildWindow.tsx';
import { MenuWindow } from './windows/MenuWindow.tsx';
import { StaffWindow } from './windows/StaffWindow.tsx';
import { GoalWindow } from './windows/GoalWindow.tsx';
import { GuestPopup } from './GuestPopup';
import { DrawPopup, ShopPanel } from './ShopPanel';
import { AnnouncementPopup, RankPanel } from './RankPanel';
import { MonthCard } from './MonthCard';
import { DevelopResultPopup, CraftPanel } from './CraftPanel';
import { CafePanel } from './CafePanel';
import { PromoPanel } from './PromoPanel';
import { GuestsPanel } from './GuestsPanel';
import { BoardPanel } from './BoardPanel';
import { RegionPanel } from './RegionPanel';
import { ObjectInfoPanel, CodexPanel } from './ObjectInfoPanel';
import { PopupHost, Confirm } from './Popup';
import { won, brownBtn, dangerBtn, card, PALETTE } from './frame';
import { compactNumber } from './HUD';
import { Icon } from './Icon';
import { TitleScreen } from './TitleScreen';
import { SaveSlots } from './SaveSlots';
import { showScene, SceneHost, type SceneChar } from './SceneWindow';
import { staffParts } from '../render/character';
import { PopupScreenHost } from './PopupScreen';
import { ChallengePopup } from './RivalPanel';

/** 길·돌담은 드래그로 연속해서 놓는다 (고스트 없이) */
const PAINT_KINDS = new Set(['path', 'wall']);

/** 맵 조작 모드. 창·카드는 별도 상태. */
type Mode =
  | { kind: 'idle' }
  | { kind: 'build'; objectType: string }
  | { kind: 'move' }
  | { kind: 'remove' };

/** 전체 화면 창과 그 하위 탭 */
type BuildTab = 'build' | 'remove' | 'move';
type CafeTab = 'menu' | 'ingredients' | 'craft' | 'promo';
type PeopleTab = 'staff' | 'guests' | 'codex' | 'quests';
type LedgerTab = 'invest' | 'shop' | 'rank' | 'region' | 'settings';
type Win =
  | { kind: 'build'; tab: BuildTab; origin?: { x: number; y: number } }
  | { kind: 'cafe'; tab: CafeTab }
  | { kind: 'people'; tab: PeopleTab; focusId?: string }
  | { kind: 'ledger'; tab: LedgerTab }
  | { kind: 'status' }
  | { kind: 'goal' }
  | { kind: 'object'; id: string };

const BUILD_TABS: WindowTab<BuildTab>[] = [{ key: 'build', label: '시설' }, { key: 'remove', label: '철거' }, { key: 'move', label: '이동' }];
const CAFE_TABS: WindowTab<CafeTab>[] = [{ key: 'menu', label: '메뉴판' }, { key: 'ingredients', label: '재료' }, { key: 'craft', label: '연구' }, { key: 'promo', label: '홍보' }];
const PEOPLE_TABS: WindowTab<PeopleTab>[] = [{ key: 'staff', label: '직원' }, { key: 'guests', label: '손님' }, { key: 'codex', label: '도감' }, { key: 'quests', label: '부탁' }];
const LEDGER_TABS: WindowTab<LedgerTab>[] = [{ key: 'invest', label: '투자' }, { key: 'shop', label: '상점' }, { key: 'rank', label: '랭킹' }, { key: 'region', label: '지역' }, { key: 'settings', label: '설정' }];
const DEFAULT_TAB: Record<WindowKind, Win> = { build: { kind: 'build', tab: 'build' }, cafe: { kind: 'cafe', tab: 'menu' }, people: { kind: 'people', tab: 'staff' }, ledger: { kind: 'ledger', tab: 'invest' } };

/** 짓기 모드 고스트(놓을 자리·방향) */
interface BuildGhost { x: number; y: number; rot: number }
/** 이동 모드: 고른 오브젝트와 옮길 자리 */
interface Moving { objectId: string; x: number; y: number }

/** 장면 창에 세울 직원(최대 3명). 없으면 SceneWindow가 기본 인물을 세운다. */
function staffChars(s: GameState): SceneChar[] {
  return s.staff.slice(0, 3).map((st) => ({ parts: staffParts(st.face, st.role, s.uniform ?? null) }));
}

function inFootprint(type: string, ox: number, oy: number, x: number, y: number): boolean {
  return footprint(type, ox, oy).some((p) => p.x === x && p.y === y);
}

/** 보기 모드에서 칸을 눌렀을 때 카드 대상. 손님 → 직원 → 필지(미소유) → 오브젝트 → 바위 → 빈 땅. */
function targetAt(s: GameState, x: number, y: number): CardTarget | null {
  const guest = s.guests.find((g) => Math.round(g.x) === x && Math.round(g.y) === y);
  if (guest) return { kind: 'guest', id: guest.id };
  const staff = s.staff.find((st) => Math.round(st.x) === x && Math.round(st.y) === y);
  if (staff) return { kind: 'staff', id: staff.id };
  const p = parcelAt(s, x, y);
  if (p && !p.owned) return { kind: 'parcel', id: p.id };
  const o = objectAt(s, x, y);
  if (o) {
    const kind = objectDef(o.type).kind;
    if (o.type === 'warehouse') return { kind: 'counter', id: o.id };
    if (kind === 'busstop' || kind === 'gate') return { kind: 'busstop', id: o.id };
    return { kind: 'object', id: o.id };
  }
  if (clearCost(s, x, y) !== null) return { kind: 'rock', x, y };
  if (!p) return null;
  return { kind: 'empty', x, y };
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

/** 장부 → 설정: 소리·슬롯 저장·타이틀로 */
function SettingsPanel({ onExit }: { onExit: () => void }) {
  const [slots, setSlots] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };
  const [bgmVol, setBgmVol] = useState(getBgmVolume());
  const [sfxVol, setSfxVol] = useState(getSfxVolume());
  const slider = (label: string, v: number, set: (n: number) => void) => (
    <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr 40px', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44 }}>
      <span>{label}</span>
      <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: '100%', accentColor: PALETTE.paperDark }} />
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </label>
  );
  return (
    <div style={{ display: 'grid', gap: 6 }} data-testid="settings">
      {slider('배경음', bgmVol, (n) => { setBgmVolume(n); setBgmVol(n); })}
      {slider('효과음', sfxVol, (n) => { setSfxVolume(n); setSfxVol(n); sfx('tap'); })}
      <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={toggleMute}>{muted ? '소리 켜기' : '소리 전부 끄기'}</button>
      <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={() => setSlots(true)}>슬롯에 저장</button>
      <button style={{ ...dangerBtn, marginRight: 0, marginBottom: 0 }} onClick={() => Confirm('자동 저장하고 타이틀로 나갈까요?', onExit, { title: '타이틀로' })}>타이틀로 나가기</button>
      {slots && <SaveSlots mode="save" onClose={() => setSlots(false)} />}
    </div>
  );
}

/** 상단 바를 누르면: 경영 현황 */
function StatusPanel() {
  const s = useGame();
  const rows: [string, string][] = [
    ['카페', s.cafeName || '우리 카페'],
    ['날짜', `${s.clock.year}년 ${s.clock.month}월 ${s.clock.day}일`],
    ['자금', won(s.money)],
    ['연구 포인트', compactNumber(s.research)],
    ['★ 등급', `${s.star} · 랭크 ${s.rank}위`],
    ['이번 달 손님', `${s.monthGuests}명 · 매출 ${won(s.monthIncome)}`],
    ['누적 손님', `${s.totalGuests}명 · 누적 매출 ${won(s.totalIncome)}`],
    ['직원', `${s.staff.length}명 · 후보 ${s.candidates.length}명`],
    ['메뉴', `${s.menuSlots.filter((m) => m !== null).length}개`],
    ['필지', `${s.parcels.filter((p) => p.owned).length}/${s.parcels.length}`],
    ['응모권·마일리지', `${s.tickets} · ${s.mileage}`],
  ];
  return (
    <div data-testid="status">
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 15 }}>
        {rows.map(([k, v]) => <span key={k} style={{ display: 'contents' }}><span style={{ color: PALETTE.inkSoft }}>{k}</span><b>{v}</b></span>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
        <Icon name="local" size={18} alt="동네 손님" /> 동네
        <meter min={-100} max={100} value={s.popularity} style={{ flex: 1 }} />
        인기 <Icon name="tourist" size={18} alt="관광객" />
      </div>
    </div>
  );
}

/** 목표 줄을 누르면: 이룬 목표 + 지금 목표 + 다음 목표 (GoalWindow, 트랙 B). 미리보기용 다음 목표 1개는 진행도 0으로. */
function GoalPanel({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const cur = currentGoal(s);
  const goals = [
    ...pastGoals(s).map((g) => ({ ...g, done: true })),
    ...(cur ? [{ ...cur, done: false }] : []),
    ...GOALS.slice(s.goals.index + 1).map((g) => ({ ...toGoal(s, g, false), cur: 0, max: g.condition.n, done: false })),
  ];
  return <GoalWindow goals={goals} onClose={onClose} />;
}

/** 잠긴 메뉴 카드 문구: 여는 목표가 있으면 그 제목으로 */
function menuUnlockText(menuId: string): string | null {
  const g = goalForMenu(menuId);
  return g ? `「${g.title}」 목표를 이루면 열려요` : null;
}

function Game({ onExit }: { onExit: () => void }) {
  const s = useGame();
  // 월 매출 신기록 → 장면 창
  useEffect(() => {
    setMonthCardHook((st, rec) => {
      const card = st.lastMonthCard;
      if (rec.monthRecord && card) showScene({ title: '월 매출 신기록', text: `${card.month}월 매출 ${won(card.income)} — 신기록!`, chars: staffChars(st), sfx: 'fanfare' });
    });
    setSceneHook((st, title, text) => showScene({ title, text, chars: staffChars(st), sfx: 'fanfare' }));
    return () => { setMonthCardHook(null); setSceneHook(null); };
  }, []);
  // sim 알림(목표 달성·빅 이벤트) → 대화창, 그 다음 튜토리얼 6단계. 알림은 한 번에 하나씩 순서대로.
  useEffect(() => {
    checkAlerts(s, () => dispatch({ type: 'dismissAlert' }));
    checkTutorial(s);
  });
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView | null>(null);
  const modeRef = useRef<Mode>({ kind: 'idle' });
  const [mode, setModeState] = useState<Mode>({ kind: 'idle' });
  const [win, setWin] = useState<Win | null>(null);
  const [cardTarget, setCardTargetState] = useState<CardTarget | null>(null);
  const cardRef = useRef<CardTarget | null>(null);
  const setCardTarget = (t: CardTarget | null) => { cardRef.current = t; setCardTargetState(t); };
  const ghostRef = useRef<BuildGhost | null>(null);
  const [ghost, setGhostState] = useState<BuildGhost | null>(null);
  const movingRef = useRef<Moving | null>(null);
  const [moving, setMovingState] = useState<Moving | null>(null);
  /** 드래그 시작 칸과 고스트 원점의 차이 (여러 칸 오브젝트를 잡은 칸 기준으로 끌기) */
  const dragOffset = useRef({ dx: 0, dy: 0 });
  /** 손님 프로필 팝업 */
  const [guestPopup, setGuestPopup] = useState<string | null>(null);
  /** 길게 눌러 들어 올린 이동이면 확정·취소 뒤 보기로 돌아간다 */
  const liftedRef = useRef(false);

  // 첫 터치에서 오디오를 열고 현재 계절 BGM을 시작한다 (이후 호출은 no-op)
  const onPointerDown = () => { unlockAudio(); void bgm(seasonOf(getState().clock.month)); };
  const setGhost = (g: BuildGhost | null) => { ghostRef.current = g; setGhostState(g); };
  const setMoving = (m: Moving | null) => { movingRef.current = m; setMovingState(m); };
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
    if (m.kind !== 'idle') { setCardTarget(null); viewRef.current?.setSelection(null); }
    if (m.kind !== 'build') setGhost(null);
    if (m.kind !== 'move') setMoving(null);
  };
  const openCard = (t: CardTarget | null) => {
    setCardTarget(t);
    const cell = t && (t.kind === 'rock' || t.kind === 'empty') ? { x: t.x, y: t.y } : null;
    viewRef.current?.setSelection(cell);
  };
  /** 보기 모드에서 칸을 누르면: 말풍선(손님·직원) + 미니 카드. 같은 대상을 다시 누르면 닫힌다. */
  const inspect = (st: GameState, x: number, y: number) => {
    const t = targetAt(st, x, y);
    const cur = cardRef.current;
    const same = t && cur && JSON.stringify(t) === JSON.stringify(cur);
    if (!t || same) { openCard(null); return; }
    if (t.kind === 'guest') { const g = st.guests.find((g) => g.id === t.id); const line = g && guestSay(st, g); if (line) viewRef.current?.showBubble(t.id, { text: line }); }
    else if (t.kind === 'staff') { const w = st.staff.find((w) => w.id === t.id); const line = w && staffSay(st, w); if (line) viewRef.current?.showBubble(t.id, { text: line }); }
    openCard(t);
  };
  /** 길게 누르면 오브젝트를 들어 올린다 (보기 모드). 이동 모드로 바뀌고 손가락을 따라 고스트가 움직인다. */
  const liftObject = (x: number, y: number): boolean => {
    if (modeRef.current.kind !== 'idle') return false;
    const st = getState();
    const o = objectAt(st, x, y);
    if (!o || PROTECTED_TYPES.has(o.type)) return false;
    setMode({ kind: 'move' });
    liftedRef.current = true;
    setMoving({ objectId: o.id, x: o.x, y: o.y });
    dragOffset.current = { dx: x - o.x, dy: y - o.y };
    return true;
  };
  /** 카드의 `이동` 버튼: 들어 올린 것과 같은 흐름 */
  const startMove = (objectId: string) => {
    const o = getState().objects[objectId];
    if (!o) return;
    setMode({ kind: 'move' });
    liftedRef.current = true;
    setMoving({ objectId: o.id, x: o.x, y: o.y });
    dragOffset.current = { dx: 0, dy: 0 };
  };
  /** 짓기 창에서 시설을 고르면: 창을 닫고 맵에 고스트 (origin이 있으면 그 칸, 없으면 시작 필지 가운데) */
  const pickBuild = (objectType: string, origin?: { x: number; y: number }) => {
    setWin(null);
    setMode({ kind: 'build', objectType });
    if (PAINT_KINDS.has(objectDef(objectType).kind)) return;
    const st = getState();
    const home = st.parcels.find((p) => p.no === 1);
    const at = origin ?? (home ? { x: home.x + Math.floor(home.w / 2), y: home.y + Math.floor(home.h / 2) } : { x: Math.floor(st.grid.w / 2), y: Math.floor(st.grid.h / 2) });
    setGhost({ x: at.x, y: at.y, rot: 0 });
  };

  useEffect(() => {
    const host = hostRef.current!;
    const view = new GameView();
    viewRef.current = view;
    let stop: (() => void) | null = null;
    let disposed = false;
    (async () => {
      await view.init(host, {
        guestSay,
        onTap: (x, y) => {
          const m = modeRef.current;
          const st = getState();
          if (x < 0 || y < 0 || x >= st.grid.w || y >= st.grid.h) { if (m.kind === 'idle') openCard(null); return; }
          if (m.kind === 'build') {
            if (PAINT_KINDS.has(objectDef(m.objectType).kind)) dispatch({ type: 'place', objectType: m.objectType, x, y });
            else setGhost({ x, y, rot: ghostRef.current?.rot ?? 0 });
          } else if (m.kind === 'move') {
            const mv = movingRef.current;
            if (mv) setMoving({ ...mv, x, y });
            else {
              const o = objectAt(st, x, y);
              if (!o) showToast('옮길 것을 골라 주세요');
              else if (PROTECTED_TYPES.has(o.type)) showToast('이건 못 옮겨요');
              else setMoving({ objectId: o.id, x: o.x, y: o.y });
            }
          } else if (m.kind === 'remove') {
            const o = objectAt(st, x, y);
            if (!o) showToast('치울 것을 골라 주세요');
            else if (PROTECTED_TYPES.has(o.type) || o.type === 'bush_wild') showToast('이건 못 치워요');
            else { const d = objectDef(o.type); Confirm(`${d.name}${d.removeCost ? `을(를) ${won(d.removeCost)} 들여 치울까요?` : `을(를) 치우고 ${won(d.cost)}을 돌려받을까요?`}`, () => dispatch({ type: 'remove', objectId: o.id }), { title: '철거' }); }
          } else inspect(st, x, y);
        },
        onLongPress: liftObject,
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
          const st = getState();
          if (x < 0 || y < 0 || x >= st.grid.w || y >= st.grid.h) return;
          const { dx, dy } = dragOffset.current;
          if (m.kind === 'build') {
            if (PAINT_KINDS.has(objectDef(m.objectType).kind)) {
              if (canPlace(st, m.objectType, x, y).ok) dispatch({ type: 'place', objectType: m.objectType, x, y });
            } else if (ghostRef.current) setGhost({ ...ghostRef.current, x: x - dx, y: y - dy });
          } else if (m.kind === 'move' && movingRef.current) setMoving({ ...movingRef.current, x: x - dx, y: y - dy });
        },
      });
      if (disposed) { view.destroy(); return; } // init 중 언마운트(Fast Refresh 등)
      // 개발 중 브라우저 자동화가 셀 → 화면 좌표를 계산할 수 있도록 (프로덕션 빌드에는 포함되지 않음)
      if (import.meta.env.DEV) (window as unknown as { __view: unknown }).__view = view;
      setViewReset(() => view.reset());
      stop = startLoop((st) => view.render(st));
    })();
    return () => { disposed = true; stop?.(); setViewReset(null); view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 배치·이동·철거 중에는 게임을 멈춘다
  const placing = mode.kind !== 'idle';
  useEffect(() => { if (placing) return pauseGame(); }, [placing]);

  // 고스트를 뷰에 반영한다
  let ghostSpec: GhostSpec | null = null;
  let place: PlaceBarProps | null = null;
  if (mode.kind === 'build') {
    const def = objectDef(mode.objectType);
    const cost = placeCost(s, mode.objectType);
    if (PAINT_KINDS.has(def.kind)) {
      place = { text: `${def.name} · ${won(cost)}/칸 · 칸을 누르거나 끌어서 이어 놓아요`, ok: true, canRotate: false, paint: true, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
    } else if (ghost) {
      const can = canPlace(s, mode.objectType, ghost.x, ghost.y);
      const ok = can.ok && s.money >= cost;
      ghostSpec = { type: mode.objectType, x: ghost.x, y: ghost.y, rot: ROTATABLE_TYPES.has(mode.objectType) ? ghost.rot : undefined, ok, text: `${def.name} ${won(cost)}` };
      place = {
        text: `${def.name} · ${won(cost)} · ${ok ? '여기에 지을 수 있어요' : (can.reason ?? '돈이 모자라요')}`,
        ok,
        canRotate: ROTATABLE_TYPES.has(mode.objectType),
        onConfirm: () => {
          const r = dispatch({ type: 'place', objectType: mode.objectType, x: ghost.x, y: ghost.y, rot: ghost.rot });
          if (r.ok) setMode({ kind: 'idle' });
        },
        onRotate: () => setGhost({ ...ghost, rot: (ghost.rot + 1) % 4 }),
        onCancel: () => setMode({ kind: 'idle' }),
      };
    }
  } else if (mode.kind === 'move') {
    const o = moving ? s.objects[moving.objectId] : null;
    if (moving && o) {
      const def = objectDef(o.type);
      const can = canPlace(s, o.type, moving.x, moving.y, o.id);
      ghostSpec = { type: o.type, x: moving.x, y: moving.y, rot: o.rot, ok: can.ok, text: `${def.name} 옮기기` };
      place = {
        text: `${def.name} · ${can.ok ? '여기로 옮길 수 있어요' : (can.reason ?? '여기엔 못 옮겨요')}`,
        ok: can.ok,
        canRotate: ROTATABLE_TYPES.has(o.type),
        onConfirm: () => {
          const r = dispatch({ type: 'move', objectId: o.id, x: moving.x, y: moving.y });
          if (!r.ok) return;
          if (liftedRef.current) { liftedRef.current = false; setMode({ kind: 'idle' }); } else setMoving(null);
        },
        onRotate: () => dispatch({ type: 'rotate', objectId: o.id, rot: ((o.rot ?? 0) + 1) % 4 }),
        onCancel: () => { if (liftedRef.current) { liftedRef.current = false; setMode({ kind: 'idle' }); } else setMoving(null); },
      };
    } else {
      place = { text: '옮길 시설을 누르세요 (돈은 안 들어요)', ok: true, canRotate: false, paint: true, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
    }
  } else if (mode.kind === 'remove') {
    place = { text: '치울 시설을 누르세요', ok: true, canRotate: false, paint: true, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
  }
  useEffect(() => { viewRef.current?.setGhost(ghostSpec); });

  const openWindow = (kind: WindowKind) => { setMode({ kind: 'idle' }); openCard(null); setWin(DEFAULT_TAB[kind]); };
  const cardActions: CardActions = {
    onGuestDetail: (id) => { openCard(null); setGuestPopup(id); },
    onQuest: (questId) => { openCard(null); if (dispatch({ type: 'acceptQuest', id: questId }).ok) setWin({ kind: 'people', tab: 'quests' }); },
    onStaffDetail: (id) => { openCard(null); setWin({ kind: 'people', tab: 'staff', focusId: id }); },
    onObjectDetail: (id) => { openCard(null); setWin({ kind: 'object', id }); },
    onMove: (id) => { openCard(null); startMove(id); },
    onBuild: (x, y) => { openCard(null); setWin({ kind: 'build', tab: 'build', origin: { x, y } }); },
    onCafe: () => { openCard(null); setWin({ kind: 'cafe', tab: 'menu' }); },
  };
  const closeWin = () => setWin(null);
  // 튜토리얼 ①·⑤의 "창을 열었다" 조건
  useEffect(() => {
    if (win?.kind === 'cafe' && win.tab === 'menu') markTutorialEvent('menuOpened');
    if (win?.kind === 'goal') markTutorialEvent('goalOpened');
  }, [win]);

  const renderWindow = () => {
    if (!win) return null;
    switch (win.kind) {
      case 'build': {
        const tab = win.tab;
        return (
          <Window title="짓기" tabs={BUILD_TABS} tab={tab} onTab={(t) => setWin({ ...win, tab: t })} onClose={closeWin} testId="window-build">
            {tab === 'build' && <BuildWindow onClose={closeWin} onPickBuild={(t) => pickBuild(t, win.origin)} />}
            {tab === 'remove' && (
              <div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>맵에서 치울 시설을 누르면 돈을 돌려받아요. 본관·정낭·정류장은 못 치워요.</div>
                <button style={dangerBtn} onClick={() => { closeWin(); setMode({ kind: 'remove' }); }}><Icon name="remove" /> 철거 시작</button>
              </div>
            )}
            {tab === 'move' && (
              <div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>옮길 시설을 누르고 새 자리를 누른 뒤 ✓로 확정해요 (돈은 안 들어요). 맵에서 시설을 길게 눌러도 들어 올려져요.</div>
                <button style={brownBtn} onClick={() => { closeWin(); setMode({ kind: 'move' }); }}><Icon name="harvest" /> 이동 시작</button>
              </div>
            )}
          </Window>
        );
      }
      case 'cafe':
        return (
          <Window title="카페" tabs={CAFE_TABS} tab={win.tab} onTab={(t) => setWin({ kind: 'cafe', tab: t })} onClose={closeWin} testId="window-cafe">
            {win.tab === 'menu' && <MenuWindow onClose={closeWin} menuUnlockText={menuUnlockText} />}
            {win.tab === 'ingredients' && <CafePanel onMenu={() => setWin({ kind: 'cafe', tab: 'menu' })} />}
            {win.tab === 'craft' && <CraftPanel />}
            {win.tab === 'promo' && <PromoPanel />}
          </Window>
        );
      case 'people':
        return (
          <Window title="사람" tabs={PEOPLE_TABS} tab={win.tab} onTab={(t) => setWin({ kind: 'people', tab: t })} onClose={closeWin} testId="window-people">
            {win.tab === 'staff' && <StaffWindow onClose={closeWin} focusId={win.focusId ?? null} />}
            {win.tab === 'guests' && <GuestsPanel onGuest={setGuestPopup} />}
            {win.tab === 'codex' && <CodexPanel />}
            {win.tab === 'quests' && <BoardPanel tabs={['quests']} />}
          </Window>
        );
      case 'ledger':
        return (
          <Window title="장부" tabs={LEDGER_TABS} tab={win.tab} onTab={(t) => setWin({ kind: 'ledger', tab: t })} onClose={closeWin} testId="window-ledger">
            {win.tab === 'invest' && <BoardPanel tabs={['spots', 'events']} />}
            {win.tab === 'shop' && <ShopPanel />}
            {win.tab === 'rank' && <RankPanel />}
            {win.tab === 'region' && <RegionPanel />}
            {win.tab === 'settings' && <SettingsPanel onExit={onExit} />}
          </Window>
        );
      case 'status':
        return <Window title="경영 현황" onClose={closeWin} testId="window-status"><StatusPanel /></Window>;
      case 'goal':
        return <Window title="목표" onClose={closeWin} testId="window-goal"><GoalPanel onClose={closeWin} /></Window>;
      case 'object': {
        const o = s.objects[win.id];
        return <Window title={o ? objectDef(o.type).name : '시설'} onClose={closeWin} testId="window-object">{o ? <ObjectInfoPanel objectId={o.id} /> : <div>없어진 시설이에요</div>}</Window>;
      }
    }
  };

  return (
    <div onPointerDownCapture={onPointerDown} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      <NightOverlay />
      <TopShell onStatus={() => setWin({ kind: 'status' })} onGoal={() => setWin({ kind: 'goal' })} />
      <Toast top={SHELL_TOP} />
      {place ? <PlaceBar {...place} /> : <BottomBar onOpen={openWindow} />}
      {cardTarget && !place && <MiniCard target={cardTarget} actions={cardActions} onClose={() => openCard(null)} />}
      <MonthCard />
      <DevelopResultPopup />
      <DrawPopup />
      <AnnouncementPopup />
      <ChallengePopup />
      <PopupScreenHost />
      {guestPopup && <GuestPopup guestId={guestPopup} onClose={() => setGuestPopup(null)} onQuest={(id) => { dispatch({ type: 'acceptQuest', id }); setWin({ kind: 'people', tab: 'quests' }); }} />}
      {renderWindow()}
      <DialogueHost />
    </div>
  );
}

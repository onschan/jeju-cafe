import { useEffect, useRef, useState } from 'react';
import { wonText, label } from '../data/labels.ts';
import { GameView, RECT_COLOR_LINE, type GhostSpec, type RangeHint } from '../render/GameView';
import { startLoop, dispatch, getState, useGame, setViewReset, autosaveNow, hasAnySave, loadSlot, setMonthCardHook, setSceneHook, showMessage, pauseGame, isSpeedLocked, setSpeedLocked } from './store';
import { unlockAudio, bgm, isMuted, setMuted, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume, sfx, setBgmLayer } from './audio';
import { gradeOf, gradeName, GRADE_BGM_LAYER_FROM, REVEAL_GRADE, contestUnlocked, signupOpen } from '../sim/index.ts'; // fun-rank · fun 점진 공개 · 대회
import { seasonOf, canPlace, objectAt, footprint, sizeOf, mainBuilding, parcelAt, placeCost, isLineType, lineCells, planLine, canAutoConnectPath, type LineOrder, type Pt, PROTECTED_TYPES, ROTATABLE_TYPES, goalForMenu, featureOpen, canUndo, demolishRefund, guestBlock, routeAtCell, tutorialDone, canBuildMain, recommendedMainCells, cellAt, doorFrontOf, MAIN_TYPE, MAIN_BUILD_COST, type GameState, type PlacedObject } from '../sim/index.ts';
import { RoutesSection } from './RouteCard'; // 트랙 H
import { objectDef } from '../data/index.ts';
// render/·ui/는 Vite 전용이라 확장자 없는 import 허용. sim/·data/만 .ts 확장자 규칙.
import { TopShell, BottomBar, PlaceBar, SHELL_BOTTOM, SHELL_TOP, BOTTOM_BAR_H, type WindowKind, type PlaceBarProps } from './Shell';
import { Window, type IconGridItem } from './Window';
import { MessageLine, MESSAGE_LINE_H } from './MessageLine';
import { VoiceFeed, VOICE_FEED_MAX, VOICE_ROW_H } from './VoiceFeed'; // trim: 손님 목소리 피드
import { DaySummaryCard } from './DaySummaryCard'; // 성장: 오늘의 성장 요약 3초 카드
import { GrowthChart } from './GrowthChart'; // 성장: 최근 30일 손님·매출 막대
import { MiniCard, MainCard, type CardTarget, type CardActions } from './MiniCard';
import { DialogueHost } from './Dialogue.tsx';
import { checkTutorial, setTutorialDispatch, useTutorialNote } from './tutorialDialogue';
import { startSolverLoop } from './solverClient';
import { useTutorialHighlight, useSpotlightPref, setSpotlightOn, tutorialTargets } from './tutorialHighlight';
import { FirstTipBubble, useFirstTip, tipKeyFor, showFirstTip } from './firstTip'; // fun-start: 창·탭·모드 첫 열기 팁 한 줄
import { SiteOverlayChip } from './SiteToggle';
import { RewardPopup } from './RewardPopup';
import { OutcomePopup } from './OutcomePopup'; // staff-luck: 대박/중박/쪽박 룰렛
import { ContestShow } from './ContestShow'; // 대회 결과 연출 (연 2회 6·12월)
import { ContestWindow } from './windows/ContestWindow';
import { checkAlerts } from './alertDialogue.ts';
import { guestSay, staffSay } from './simBridge';
import { BuildWindow, requestBuildTab } from './windows/BuildWindow.tsx';
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
import { ObjectInfoPanel, CodexPanel } from './ObjectInfoPanel';
import { PopupHost, Confirm } from './Popup';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, card, PALETTE } from './frame';
import { compactNumber } from './HUD';
import { Icon } from './Icon';
import { TitleScreen } from './TitleScreen';
import { EndingScreen } from './EndingScreen'; // z-ending
import { IntroScreen } from './IntroScreen'; // intro: 새 게임 프롤로그 11컷
import { SaveSlots } from './SaveSlots';
import { showScene, SceneHost, type SceneChar } from './SceneWindow';
import { staffParts } from '../render/character';
import { rangeHintFor } from './rangeHint';
import { cornerMoveWarning } from '../sim/corners.ts'; // spot2: 옮기면 명당이 깨질 때 배치 바 경고
import { windCoveredSeatsBy, WIND_WEDGE_MAX } from '../sim/site.ts'; // spot2: 돌담 줄이 막아 주는 자리
import { AppealPanel } from './AppealPanel'; // fun: 카페 매력도
import { tradeoffOf } from './tradeoff'; // fun: 배치 트레이드오프
import { rectCells, demolishTargets, reservedCount, nextGhostAfterPlace, type Rect, type BuildGhost } from './placing';
import { placementPicks, PlacementHintLine, type PlacePicks } from './PlacementHints'; // video-patch §3.2: 추천 칸 3곳
import { usePlaceHintsPref, setPlaceHintsOn } from './layoutScore';
import { TodoLine } from './TodoLine'; // video-patch §3.4: 오늘 할 일
// ---- rush: 러시 타임 HUD·연출·조작 (rush-battle §2) ----
import { RushHud } from './RushHud';
import { RushShow } from './RushShow';
import { noteRushSeat, rushMarks, rushRunning, seatFront, setRushAutoOn, urgentAt, useRushAutoPref } from './rushBridge';
// ---- ui3: 전략 피드백 · 숏컷 · 화면 정돈 ----
import { StrategyCard } from './StrategyCard';
import { RadialMenu, type RadialItem } from './RadialMenu';
import { useShortcutsPref, setShortcutsOn, shortcutsOn, useMapMinimalPref, setMapMinimalOn } from './shortcuts';
import { checkupKey, canStartBuild, isUpgradable, canUpgrade, upgradeCost, objectStats, treeOf, canTreeUpgrade, treeUpgradeCost, MAX_OBJECT_LEVEL, LIGHT_RADIUS, spotReachable, UNREACHABLE_GHOST_TEXT } from '../sim/index.ts';
import { recentBuildTypes } from './windows/BuildWindow.tsx';
import { josa } from '../sim/josa.ts';

/** 길·담 두 번 탭 라인 배치 상태 (ease, sim/line.ts): 탭 1 시작 칸 → 탭 2 끝 칸 → 파란 미리보기 → ✓ 확정. 드래그는 언제나 카메라. */
interface Line { from: Pt; to: Pt | null; order: LineOrder }
const GAUGES_KEY = 'jeju-cafe:gauges';
function gaugesPref(): boolean { try { return localStorage.getItem(GAUGES_KEY) !== '0'; } catch { return true; } }

/** 맵 조작 모드. 창·카드는 별도 상태. build.count = 이번 연속 배치에서 놓은 수 */
type Mode =
  | { kind: 'idle' }
  | { kind: 'build'; objectType: string; count: number }
  | { kind: 'move' }
  | { kind: 'remove' }
  | { kind: 'autopath' }; // ease: 「마을 길까지 자동 잇기」 파란 미리보기 → ✓

/** 전체 화면 창과 그 아이콘 그리드 항목 (§5.1) */
type CafeTab = 'menu' | 'ingredients' | 'craft' | 'promo' | 'building' | 'indoor';
type PeopleTab = 'staff' | 'candidates' | 'guests' | 'codex' | 'quests';
type LedgerTab = 'report' | 'invest' | 'spots' | 'shop' | 'tickets' | 'rank' | 'contest' | 'settings';
type Win =
  | { kind: 'build'; origin?: { x: number; y: number } }
  | { kind: 'cafe'; tab: CafeTab | null }
  | { kind: 'people'; tab: PeopleTab | null; focusId?: string }
  | { kind: 'ledger'; tab: LedgerTab | null }
  | { kind: 'status' }
  | { kind: 'goal' }
  | { kind: 'object'; id: string };

const DEFAULT_WIN: Record<WindowKind, Win> = { build: { kind: 'build' }, cafe: { kind: 'cafe', tab: null }, people: { kind: 'people', tab: null }, ledger: { kind: 'ledger', tab: null } };

/** 이동 모드: 고른 오브젝트와 옮길 자리 */
interface Moving { objectId: string; x: number; y: number }

/** ui3 숏컷: 길게 누르기 방사형 메뉴가 떠 있는 자리 (화면 좌표 + 대상) */
type RadialState =
  | { left: number; top: number; kind: 'object'; id: string }
  | { left: number; top: number; kind: 'empty'; x: number; y: number };

/** ui3 숏컷: 하단 「짓기」를 길게 누르면 뜨는 최근 시설 퀵바 (창을 안 열고 바로 고스트로) */
function QuickBar({ onPick, onMore, onClose }: { onPick: (type: string) => void; onMore: () => void; onClose: () => void }) {
  const s = useGame();
  const recent = recentBuildTypes(s);
  return (
    <div data-testid="quick-bar" style={{ position: 'absolute', left: 8, right: 8, bottom: `calc(${SHELL_BOTTOM + 8}px + env(safe-area-inset-bottom))`, zIndex: 14, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: PALETTE.paper, border: `3px solid ${PALETTE.wood}`, borderRadius: 8, padding: 6 }}>
      <span style={{ fontSize: 13, color: PALETTE.inkSoft, whiteSpace: 'nowrap' }}><Icon name="undo" size={13} /> 최근</span>
      {recent.map((id) => {
        const cost = placeCost(s, id);
        const ok = canStartBuild(s, id).ok && s.money >= cost;
        return (
          <button key={id} data-testid={`quick-${id}`} disabled={!ok} style={{ ...(ok ? brownBtn : brownBtnOff), margin: 0, minHeight: 44, padding: '0 10px', fontSize: 14 }} onClick={() => onPick(id)}>
            {objectDef(id).name} <span style={{ fontWeight: 400 }}>{cost > 0 ? wonText(cost) : '무료'}</span>
          </button>
        );
      })}
      <button style={{ ...brownBtn, margin: 0, minHeight: 44, padding: '0 10px', fontSize: 14 }} onClick={onMore}><Icon name="build" size={14} /> 짓기 창</button>
      <button aria-label="닫기" style={{ ...dangerBtn, margin: 0, minHeight: 44, padding: '0 10px', fontSize: 14, marginLeft: 'auto' }} onClick={onClose}><Icon name="close" size={14} /></button>
    </div>
  );
}

/** 열린 시설 중 조건에 맞는 가장 싼 것의 id (없으면 null) — 빈 칸 방사형 메뉴 [자리][정원][조명][길] */
function cheapestUnlocked(s: GameState, pick: (d: ReturnType<typeof objectDef>) => boolean): string | null {
  let best: { id: string; cost: number } | null = null;
  for (const id of s.unlocked.objects) {
    let d;
    try { d = objectDef(id); } catch { continue; }
    if (!pick(d)) continue;
    if (!best || d.cost < best.cost) best = { id, cost: d.cost };
  }
  return best?.id ?? null;
}

/** 장면 창에 세울 직원(최대 3명). 없으면 SceneWindow가 기본 인물을 세운다. */
function staffChars(s: GameState): SceneChar[] {
  return s.staff.slice(0, 3).map((st) => ({ parts: staffParts(st.face, st.role, s.uniform ?? null) }));
}

/** (ox,oy)에 놓인 발자국 안에 (x,y)가 있나. w/h를 주면 그 크기(본관 증축 Lv2+ 옮기기 — sizeOf). */
function inFootprint(type: string, ox: number, oy: number, x: number, y: number, w?: number, h?: number): boolean {
  return footprint(type, ox, oy, w, h).some((p) => p.x === x && p.y === y);
}

/** 보기 모드에서 칸을 눌렀을 때 카드 대상. 손님 → 직원 → 필지(미소유) → 오브젝트 → 마을 길 → 빈 땅.
 *  seatfix: 손님이 시설 위에 있으면 시설 카드를 먼저 띄운다 — 손님이 앉은 테이블도 탭해서 옮기고 치울 수 있어야 한다.
 *  카드 위 칩 두 개로 손님 카드와 오간다 (guestId·objectId로 서로를 가리킨다). */
function targetAt(s: GameState, x: number, y: number): CardTarget | null {
  const guest = s.guests.find((g) => Math.round(g.x) === x && Math.round(g.y) === y);
  if (guest) {
    const under = objectAt(s, x, y);
    if (under && !PROTECTED_TYPES.has(under.type) && objectDef(under.type).kind !== 'busstop' && !routeAtCell(s, x, y)) return { kind: 'object', id: under.id, guestId: guest.id };
    return { kind: 'guest', id: guest.id };
  }
  const staff = s.staff.find((st) => Math.round(st.x) === x && Math.round(st.y) === y);
  if (staff) return { kind: 'staff', id: staff.id };
  const rt = routeAtCell(s, x, y); if (rt) return { kind: 'route', route: rt, id: objectAt(s, x, y)?.id }; // 트랙 H: 진입점·경로 시설(정류장 포함) → 경로 카드
  const p = parcelAt(s, x, y);
  if (p && !p.owned && cellAt(s, x, y).terrain === 'road' && !objectAt(s, x, y)) return { kind: 'road', x, y }; // game-feel P2: 안 산 필지 안 마을 길도 길 카드 (튜토리얼 1단계 look:road가 필지 카드에 막히지 않게)
  if (p && !p.owned) return { kind: 'parcel', id: p.id };
  const o = objectAt(s, x, y);
  if (o) {
    const kind = objectDef(o.type).kind;
    if (o.type === 'warehouse') return { kind: 'counter', id: o.id };
    if (kind === 'busstop') return { kind: 'busstop', id: o.id }; // 정낭은 일반 시설 카드 (w-free)
    return { kind: 'object', id: o.id };
  }
  if (cellAt(s, x, y).terrain === 'road') return { kind: 'road', x, y }; // w-start 둘러보기: 마을 길 칸 카드
  if (!p) return null;
  return { kind: 'empty', x, y };
}

/** 타이틀 → (새 게임이면 프롤로그 →) 게임. 게임에서 메뉴로 나가면 자동 저장 뒤 타이틀로. 설정 「프롤로그 다시 보기」는 끝나면 타이틀로. */
export function App() {
  const [screen, setScreen] = useState<'title' | 'intro' | 'game'>('title');
  const [introReplay, setIntroReplay] = useState(false);
  // 개발 자동화용: ?game 이면 자동 저장(없으면 새 게임)으로 바로 들어간다
  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('game')) return;
    void hasAnySave().then(async (has) => { if (has) await loadSlot(0); setScreen('game'); });
  }, []);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {screen === 'title'
        ? <TitleScreen onEnter={() => setScreen('game')} onNewGame={() => { setIntroReplay(false); setScreen('intro'); }} onReplayIntro={() => { setIntroReplay(true); setScreen('intro'); }} />
        : screen === 'intro'
          ? <IntroScreen replay={introReplay} onDone={() => setScreen(introReplay ? 'title' : 'game')} />
          : <Game onExit={() => { autosaveNow(); setScreen('title'); }} />}
      <PopupHost />
      <SceneHost />
    </div>
  );
}

/** 켜짐/꺼짐 2버튼 그룹 (셀렉트·체크박스 대신) */
function OnOff({ label: text, on, onChange, testId }: { label: string; on: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <div role="radiogroup" aria-label={text} data-testid={testId} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 14 }}>
      <span>{text}</span>
      <button aria-pressed={on} style={{ ...(on ? brownBtnOn : brownBtn), margin: 0, padding: '0 10px', fontSize: 14 }} onClick={() => onChange(true)}>켜기</button>
      <button aria-pressed={!on} style={{ ...(!on ? brownBtnOn : brownBtn), margin: 0, padding: '0 10px', fontSize: 14 }} onClick={() => onChange(false)}>끄기</button>
    </div>
  );
}

/** 장부 → 설정: 소리·속도 잠금·시설 게이지·슬롯 저장·타이틀로 */
function SettingsPanel({ onExit, gauges, onGauges }: { onExit: () => void; gauges: boolean; onGauges: (v: boolean) => void }) {
  const [slots, setSlots] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const toggleMute = () => { const m = !muted; setMuted(m); setMutedState(m); };
  const [bgmVol, setBgmVol] = useState(getBgmVolume());
  const [sfxVol, setSfxVol] = useState(getSfxVolume());
  const s = useGame();
  const spotlight = useSpotlightPref();
  const placeHints = usePlaceHintsPref(); // video-patch §3.2.1
  const shortcuts = useShortcutsPref(); // ui3 숏컷
  const mapMinimal = useMapMinimalPref(); // ui3 맵 위 표시 최소화
  const rushAuto = useRushAutoPref(); // rush: 러시 자동 진행
  const slider = (text: string, v: number, set: (n: number) => void) => (
    <label style={{ display: 'grid', gridTemplateColumns: '64px 1fr 40px', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 44 }}>
      <span>{text}</span>
      <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: '100%', accentColor: PALETTE.paperDark }} />
      <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </label>
  );
  return (
    <div style={{ display: 'grid', gap: 6 }} data-testid="settings">
      {slider('배경음', bgmVol, (n) => { setBgmVolume(n); setBgmVol(n); })}
      {slider('효과음', sfxVol, (n) => { setSfxVolume(n); setSfxVol(n); sfx('tap'); })}
      <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={toggleMute}>{muted ? <><Icon name="sound_on" /> 소리 켜기</> : <><Icon name="sound_off" /> 소리 끄기</>}</button>
      <OnOff label="속도 잠금 (창을 열어도 안 멈춤)" on={isSpeedLocked()} onChange={setSpeedLocked} testId="setting-speed-lock" />
      <OnOff label="시설 위 입소문 바 표시" on={gauges} onChange={onGauges} testId="setting-gauges" />
      <OnOff label="자리 추천 보기 (놓을 때 빛나는 칸)" on={placeHints} onChange={setPlaceHintsOn} testId="setting-place-hints" />{/* video-patch §3.2.1 */}
      <OnOff label="숏컷 (길게 누르기·두 번 탭)" on={shortcuts} onChange={setShortcutsOn} testId="setting-shortcuts" />{/* ui3 */}
      <OnOff label="맵 위 표시 최소화" on={mapMinimal} onChange={setMapMinimalOn} testId="setting-map-minimal" />{/* ui3 */}
      <OnOff label="러시 자동 진행 (점수는 절반)" on={rushAuto} onChange={setRushAutoOn} testId="setting-rush-auto" />{/* rush §6 */}
      {!tutorialDone(s) && <OnOff label="튜토리얼 스포트라이트 (빛나는 것 빼고 어둡게)" on={spotlight} onChange={setSpotlightOn} testId="setting-spotlight" />}{/* w-free */}
      <button style={{ ...brownBtn, marginRight: 0, marginBottom: 0 }} onClick={() => setSlots(true)}><Icon name="save" /> 슬롯에 저장</button>
      <button style={{ ...dangerBtn, marginRight: 0, marginBottom: 0 }} onClick={() => Confirm('자동 저장하고 타이틀로 나갈까요?', onExit, { title: '타이틀로' })}><Icon name="door" /> 타이틀로</button>
      {slots && <SaveSlots mode="save" onClose={() => setSlots(false)} />}
    </div>
  );
}

/** 상단 바를 누르면: 경영 현황 (§5.1: 저장 · 이달 요약 · 손님 경로 자리 · 성장 그래프) */
function StatusPanel({ onFocus }: { onFocus?: (x: number, y: number) => void } = {}) {
  const s = useGame();
  const [saved, setSaved] = useState(false);
  const rows: [string, string][] = [
    ['카페', s.cafeName || '우리 카페'],
    ['날짜', `${s.clock.year}년 ${s.clock.month}월 ${s.clock.day}일`],
    ['자금', wonText(s.money)],
    ['연구 포인트', compactNumber(s.research)],
    ['★ 등급', `★${s.star} · ${gradeName(gradeOf(s))}`],
    ['이번 달 손님', `${s.monthGuests}명 · 수입 ${wonText(s.monthIncome)}`],
    ['누적 손님', `${s.totalGuests}명 · 누적 판매 ${wonText(s.totalIncome)}`],
    ['직원', `${s.staff.length}명 · 후보 ${s.candidates.length}명`],
    ['메뉴', `${s.menuSlots.filter((m) => m !== null).length}개`],
    ['필지', `${s.parcels.filter((p) => p.owned).length}/${s.parcels.length}`],
    ['응모권', `${s.tickets}`],
  ];
  const [detail, setDetail] = useState(false); // fun: 잔지표는 「자세히」 접힘
  return (
    <div data-testid="status">
      <StrategyCard onFocus={onFocus} />{/* ui3: 우리 카페 진단 — 3줄 평가·걸림돌 1개·다음 수 2개 (맨 위) */}
      <AppealPanel />{/* fun: 카페 매력도 — 인기·경관·서비스 */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 15 }}>
        {rows.slice(0, 3).map(([k, v]) => <span key={k} style={{ display: 'contents' }}><span style={{ color: PALETTE.inkSoft }}>{k}</span><b>{v}</b></span>)}
      </div>
      <RoutesSection s={s} />{/* 트랙 H: 손님 경로 표 */}
      <button data-testid="status-detail" style={{ ...brownBtn, width: '100%', marginRight: 0, minHeight: 44 }} onClick={() => setDetail(!detail)}>{detail ? '▲ 접기' : '▼ 자세히'}</button>
      {detail && (
        <>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 15 }}>
            {rows.slice(3).map(([k, v]) => <span key={k} style={{ display: 'contents' }}><span style={{ color: PALETTE.inkSoft }}>{k}</span><b>{v}</b></span>)}
          </div>
          <GrowthChart />{/* 성장: 최근 30일 손님·매출 + 승급 세로선 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <Icon name="local" size={18} alt="동네 손님" /> 동네
            <meter min={-100} max={100} value={s.popularity} style={{ flex: 1 }} />
            손님 색깔 <Icon name="tourist" size={18} alt="관광객" />
          </div>
        </>
      )}
      <button data-testid="status-save" style={{ ...brownBtnOn, width: '100%', marginRight: 0, minHeight: 48 }} onClick={() => { autosaveNow(); setSaved(true); showMessage('저장했어요'); }}><Icon name="save" /> {saved ? '저장했어요' : '저장'}</button>
    </div>
  );
}

/** 카페 › 재료: 창고에 있는 재료 (농원 수확·상자) */
function StoragePanel() {
  const s = useGame();
  useTutorialNote('storage'); // 튜토리얼 18단계 「재료 창고 보기」
  const rows = Object.entries(s.storage).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div data-testid="storage-panel">
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 6 }}>창고 재료는 메뉴를 만들 때 먼저 쓰고, 없으면 자동으로 사요.</div>
      {rows.length === 0 && <div style={{ fontSize: 14, color: PALETTE.inkSoft, padding: '12px 0', textAlign: 'center' }}>창고가 비어 있어요. 농원에서 수확하면 쌓여요.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {rows.map(([id, n]) => <div key={id} style={{ ...card, marginBottom: 0, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{label('ingredient', id)}</span><b>{n}개</b></div>)}
      </div>
    </div>
  );
}

/** 잠긴 메뉴 카드 문구: 여는 목표가 있으면 그 제목으로 */
function menuUnlockText(menuId: string): string | null {
  const g = goalForMenu(menuId);
  return g ? `「${g.title}」 목표를 이루면 열려요` : null;
}

/** 고스트 밑 확정·회전 원형 버튼 48px (§5.3): DOM 오버레이가 고스트의 화면 좌표를 따라간다. 고스트가 화면 위 40%에 있으면 숨긴다(§5.6 하단 바 버튼만). */
function GhostButtons({ view, cell, ok, canRotate, onConfirm, onRotate }: { view: GameView | null; cell: { x: number; y: number; w: number; h: number }; ok: boolean; canRotate: boolean; onConfirm: () => void; onRotate: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el && view) {
        const p = view.cellToClient(cell.x, cell.y, cell.w, cell.h);
        const host = el.offsetParent as HTMLElement | null;
        const r = host?.getBoundingClientRect() ?? { left: 0, top: 0, height: window.innerHeight };
        const top = p.top - r.top + 8;
        el.style.transform = `translate(${Math.round(p.left - r.left)}px, ${Math.round(top)}px)`;
        el.style.display = top < r.height * 0.4 ? 'none' : 'flex';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, cell.x, cell.y, cell.w, cell.h]);
  const round = (bg: string): React.CSSProperties => ({ width: 48, height: 48, borderRadius: 24, border: `3px solid ${PALETTE.wood}`, background: bg, color: '#fff', fontSize: 22, fontWeight: 700, fontFamily: 'inherit', boxShadow: '0 2px 0 #0006', padding: 0 });
  return (
    <div ref={ref} data-testid="ghost-buttons" style={{ position: 'absolute', left: -52, top: 0, display: 'none', gap: 8, zIndex: 13, pointerEvents: 'auto', willChange: 'transform' }}>
      <button aria-label="확정" disabled={!ok} onClick={onConfirm} style={{ ...round(ok ? '#e8892b' : '#9a8a74'), opacity: ok ? 1 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={24} /></button>
      {canRotate && <button aria-label="회전" onClick={onRotate} style={{ ...round('#4c9a2a'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="undo" size={24} /></button>}
    </div>
  );
}

function Game({ onExit }: { onExit: () => void }) {
  const s = useGame();
  // 월 매출 신기록 → 장면 창
  useEffect(() => {
    setMonthCardHook((st, rec) => {
      const c = st.lastMonthCard;
      if (rec.monthRecord && c) showScene({ title: '월 매출 신기록', text: `${c.month}월 매출 ${wonText(c.income)} — 신기록!`, chars: staffChars(st), sfx: 'fanfare' });
    });
    setSceneHook((st, title, text) => showScene({ title, text, chars: staffChars(st), sfx: 'fanfare' }));
    return () => { setMonthCardHook(null); setSceneHook(null); };
  }, []);
  useEffect(() => { setTutorialDispatch(dispatch, getState); return () => setTutorialDispatch(null); }, []);
  useEffect(() => startSolverLoop(), []); // solver: 워커에서 롤아웃 탐색 → 공략 노트 「지금 추천 행동」·글로우 칸·대사 근거
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<GameView | null>(null);
  const [view, setView] = useState<GameView | null>(null);
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
  const rectRef = useRef<Rect | null>(null);
  const [rect, setRectState] = useState<Rect | null>(null);
  const lineRef = useRef<Line | null>(null);
  const [line, setLineState] = useState<Line | null>(null);
  /** 드래그 시작 칸과 고스트 원점의 차이 (여러 칸 오브젝트를 잡은 칸 기준으로 끌기) */
  const dragOffset = useRef({ dx: 0, dy: 0 });
  /** 손님 프로필 팝업 */
  const [guestPopup, setGuestPopup] = useState<string | null>(null);
  /** 길게 눌러 들어 올린 이동이면 확정·취소 뒤 보기로 돌아간다 */
  const liftedRef = useRef(false);
  const [gauges, setGaugesState] = useState(gaugesPref);
  const setGauges = (v: boolean) => { setGaugesState(v); try { localStorage.setItem(GAUGES_KEY, v ? '1' : '0'); } catch { /* noop */ } };
  useEffect(() => { view?.setGauges(gauges); }, [view, gauges]);
  // video-patch §3.2.1: 고스트가 떠 있는 동안 추천 칸 3곳 — 보여 주기만 한다. 탭하면 고스트가 그 칸으로 갈 뿐, 짓기는 ✓ 확정뿐이다.
  const hintsOn = usePlaceHintsPref();

  // 첫 터치에서 오디오를 열고 현재 계절 BGM을 시작한다 (이후 호출은 no-op)
  const onPointerDown = () => { unlockAudio(); void bgm(seasonOf(getState().clock.month)); };
  useEffect(() => { setBgmLayer(gradeOf(s) >= GRADE_BGM_LAYER_FROM); }, [s.grade]); // fun-rank: 등급 3부터 타악 레이어
  useEffect(() => { if (gradeOf(s) >= REVEAL_GRADE) showFirstTip('reveal'); }, [s.grade]); // fun 점진 공개: 등급 3 첫 등장 팁
  const setGhost = (g: BuildGhost | null) => { ghostRef.current = g; setGhostState(g); };
  const setMoving = (m: Moving | null) => { movingRef.current = m; setMovingState(m); };
  const setRect = (r: Rect | null) => { rectRef.current = r; setRectState(r); viewRef.current?.setRectCells(r ? rectCells(r) : []); };
  /** 라인 미리보기: 시작 칸만 있으면 그 칸, 끝까지 있으면 두 칸 사이 경로를 파란 마름모로 (시작 칸은 진하게) */
  const setLine = (l: Line | null) => {
    lineRef.current = l;
    setLineState(l);
    const cells = !l ? [] : l.to ? lineCells(l.from, l.to, l.order) : [l.from];
    viewRef.current?.setRectCells(cells, RECT_COLOR_LINE, l?.from ?? null);
  };
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
    if (m.kind !== 'idle') { setCardTarget(null); viewRef.current?.setSelection(null); }
    if (m.kind !== 'build') { setGhost(null); setLine(null); }
    if (m.kind !== 'autopath' && m.kind !== 'remove') viewRef.current?.setRectCells([]);
    if (m.kind !== 'move') setMoving(null);
    if (m.kind !== 'remove') setRect(null);
  };
  // sim 알림(목표 달성·빅 이벤트) → 대화창(보상 상자는 RewardPopup), 그 다음 손으로 하는 튜토리얼 9단계. 알림은 한 번에 하나씩 순서대로.
  // 다음 단계 대사가 뜨면 연속 배치·이동·철거 모드를 끝낸다 — 배치 바가 하단 바를 덮어 「아래 카페를 눌러」를 못 따라가는 걸 막는다.
  useEffect(() => {
    if (rushRunning(s)) return; // rush: 러시 한 판이 도는 동안은 알림·대사를 미룬다 (대사가 뜨면 게임이 멈춰 러시가 얼어붙는다)
    checkAlerts(s, () => dispatch({ type: 'dismissAlert' }), (x) => dispatch(x)); // stakes: 선택지는 sim 액션으로
    if (checkTutorial(s) && modeRef.current.kind !== 'idle') setMode({ kind: 'idle' });
  });
  const openCard = (t: CardTarget | null) => {
    setCardTarget(t);
    const cell = t && t.kind === 'empty' ? { x: t.x, y: t.y } : null;
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
  /** 러시 중 맵 탭 (rush-battle §2 조작): 빨개진 자리면 긴급 처리, 아니면 줄 맨 앞 손님을 그 자리에 앉힌다.
   *  자리를 먼저 눌러도 맨 앞 손님이 앉는다 — 손님을 고르는 단계가 없다. 성공하면 칸 위로 +점수가 뜬다. */
  const rushTap = (st: GameState, x: number, y: number) => {
    const o = objectAt(st, x, y);
    if (!o) { showMessage('자리를 눌러 손님을 앉혀요'); return; }
    const mark = rushMarks(st).find((m) => m.id === o.id);
    if (!mark) { showMessage('여기엔 손님을 못 앉혀요'); return; }
    const out = mark.kind === 'urgent' ? urgentAt(st, o.id) : seatFront(st, o.id);
    if (!out.ok) { sfx('error'); showMessage(out.reason ?? '지금은 못 앉혀요'); return; }
    sfx(mark.kind === 'urgent' ? 'happy' : 'coin');
    viewRef.current?.popText(o.x, o.y, `+${out.gained}`);
    if (out.combo >= 3) { viewRef.current?.popText(o.x, o.y - 1, `${out.combo}연속!`, 0xffb300); sfx('unlock'); }
    if (mark.kind !== 'urgent') noteRushSeat();
  };
  /** 길게 누르면 오브젝트를 들어 올린다 (보기 모드). 이동 모드로 바뀌고 손가락을 따라 고스트가 움직인다. */
  const liftObject = (x: number, y: number): boolean => {
    if (modeRef.current.kind !== 'idle') return false;
    const st = getState();
    const o = objectAt(st, x, y);
    if (!o || PROTECTED_TYPES.has(o.type)) return false;
    // seatfix: 손님이 앉아 있어도 들어 올린다 — 확정할 때 예약으로 넘어간다
    setMode({ kind: 'move' });
    liftedRef.current = true;
    setMoving({ objectId: o.id, x: o.x, y: o.y });
    dragOffset.current = { dx: x - o.x, dy: y - o.y };
    return true;
  };
  /** 카드의 `이동` 버튼: 들어 올린 것과 같은 흐름 */
  const startMove = (objectId: string) => {
    const st = getState();
    const o = st.objects[objectId];
    if (!o) return;
    setMode({ kind: 'move' }); // seatfix: 손님이 앉아 있어도 고를 수 있다 — 확정하면 예약된다
    liftedRef.current = true;
    setMoving({ objectId: o.id, x: o.x, y: o.y });
    dragOffset.current = { dx: 0, dy: 0 };
  };
  /** 짓기 창에서 시설을 고르면: 창을 닫고 맵에 고스트 (origin이 있으면 그 칸, 없으면 시작 필지 가운데). 길·담은 고스트 없이 두 번 탭(origin이 있으면 그 칸이 시작 칸). */
  const pickBuild = (objectType: string, origin?: { x: number; y: number }) => {
    setWin(null);
    setMode({ kind: 'build', objectType, count: 0 });
    if (isLineType(objectType)) { if (origin) setLine({ from: origin, to: null, order: 'xy' }); return; }
    const st = getState();
    const home = st.parcels.find((p) => p.no === 1);
    const center = home ? { x: home.x + Math.floor(home.w / 2), y: home.y + Math.floor(home.h / 2) } : { x: Math.floor(st.grid.w / 2), y: Math.floor(st.grid.h / 2) };
    const at = origin ?? (objectType === MAIN_TYPE ? recommendedMainCells(st)[0] ?? center : center); // w-start: 본관 고스트는 추천 1순위 칸에서 시작
    setGhost({ x: at.x, y: at.y, rot: 0 });
  };
  /** 카메라를 본관에 (§5.6 홈 버튼) */
  const goHome = () => {
    const st = getState();
    const home = Object.values(st.objects).find((o) => o.type === 'warehouse');
    if (!home) return;
    const d = objectDef(home.type);
    viewRef.current?.focusCell(home.x, home.y, d.w, d.h, 1.5);
  };
  const undo = () => { if (dispatch({ type: 'undoLast' }).ok) { showMessage('되돌렸어요'); showFirstTip('undo'); } };

  // ---------- ui3 숏컷: 길게 누르기 방사형 메뉴 · 더블 탭 · 하단 바 길게 누르기 · 맵 위 표시 최소화 ----------
  const shortcutsPref = useShortcutsPref();
  const mapMinimalPref = useMapMinimalPref();
  useEffect(() => { viewRef.current?.setMapMinimal(mapMinimalPref); }, [view, mapMinimalPref]);
  const [radial, setRadial] = useState<RadialState | null>(null);
  const [quickBar, setQuickBar] = useState(false);
  // ui3: 주 1회(1·8·15·22일) 새 진단이 나오면 메시지 한 줄 — 알림 링버퍼는 안 건드린다
  const checkup = checkupKey(s);
  const lastCheckup = useRef<string | null>(null);
  useEffect(() => {
    if (lastCheckup.current !== null && lastCheckup.current !== checkup) showMessage('우리 카페 진단이 새로 나왔어요');
    lastCheckup.current = checkup;
  }, [checkup]);
  /** 맵 셀 → 이 컴포넌트 안 좌표 (방사형 메뉴 중심) */
  const cellPoint = (x: number, y: number): { left: number; top: number } => {
    const p = viewRef.current?.cellToClient(x, y);
    const r = hostRef.current?.getBoundingClientRect();
    return { left: (p?.left ?? 0) - (r?.left ?? 0), top: (p?.top ?? 0) - (r?.top ?? 0) };
  };
  /** 시설 철거 (미니 카드와 같은 규칙: 비싼 철거만 확인) */
  const removeObject = (id: string) => {
    const st = getState();
    const o = st.objects[id];
    if (!o) return;
    const d = objectDef(o.type);
    const go = () => {
      if (reserveIfBusy(o, 'remove', '손님이 일어나면 치울게요')) return; // 통합: 숏컷 철거도 카드와 같은 예약 규칙
      const r = dispatch({ type: 'remove', objectId: id }); showMessage(r.ok ? `${josa(d.name, '을/를')} 치웠어요 (↶ 되돌리기 가능)` : (r.reason ?? '지금은 못 치워요'));
    };
    if ((d.removeCost ?? 0) >= 1_000_000) Confirm(`${josa(d.name, '을/를')} ${wonText(d.removeCost!)} 들여 치울까요?`, go, { title: '철거' });
    else go();
  };
  /** 통합 규칙: 손님이 앉았거나 지나가는 중이면 숏컷도 카드와 똑같이 예약으로 넘어간다 (걸었으면 true) */
  const reserveIfBusy = (o: PlacedObject, work: 'remove' | 'upgrade' | 'treeUpgrade', msg: string): boolean => {
    if (!guestBlock(getState(), o)) return false;
    if (!dispatch({ type: 'reserveWork', objectId: o.id, work }).ok) return false;
    showMessage(msg);
    return true;
  };
  /** 한 번에 업그레이드: 트리가 있으면 다음 단계, 없으면 증축 Lv. 확인 팝업 한 번.
   *  통합: 점유 좌석이면 확인 팝업이 이유를 붙이고, 확정은 예약으로 간다. */
  const quickUpgrade = (id: string) => {
    const st = getState();
    const o = st.objects[id];
    if (!o) return;
    const d = objectDef(o.type);
    const busy = guestBlock(st, o);
    if (treeOf(o.type)) {
      const can = canTreeUpgrade(st, id);
      if (!can.ok || !can.next) { showMessage(can.reason ?? '지금은 못 올려요'); return; }
      const cost = treeUpgradeCost(st, o);
      const nd = objectDef(can.next.type);
      Confirm(`${josa(d.name, '을/를')} ${josa(nd.name, '으로/로')} 올릴까요? ${cost > 0 ? wonText(cost) : '무료'}${busy ? ` · ${busy}` : ''}`, () => {
        if (reserveIfBusy(o, 'treeUpgrade', '손님이 일어나면 올릴게요')) return;
        dispatch({ type: 'treeUpgrade', objectId: id });
      }, { title: '업그레이드' });
      return;
    }
    const stats = objectStats(st, id);
    if (!isUpgradable(d) || stats.level >= MAX_OBJECT_LEVEL) { showMessage('더 올릴 수 없어요'); return; }
    const can = canUpgrade(st, id, stats.popularity);
    if (!can.ok) { showMessage(can.reason ?? '지금은 못 올려요'); return; }
    const cost = upgradeCost(st, o);
    Confirm(`${josa(d.name, '을/를')} Lv${stats.level + 1}로 증축할까요? ${wonText(cost)}${busy ? ` · ${busy}` : ''}`, () => {
      if (reserveIfBusy(o, 'upgrade', '손님이 일어나면 증축할게요')) return;
      dispatch({ type: 'upgradeObject', objectId: id });
    }, { title: '증축' });
  };
  const canQuickUpgrade = (st: GameState, id: string): boolean => {
    const o = st.objects[id];
    if (!o) return false;
    const d = objectDef(o.type);
    if (treeOf(o.type)) return canTreeUpgrade(st, id).ok;
    const stats = objectStats(st, id);
    return isUpgradable(d) && stats.level < MAX_OBJECT_LEVEL && canUpgrade(st, id, stats.popularity).ok;
  };
  const radialItems = (r: RadialState): RadialItem[] => {
    const st = getState();
    if (r.kind === 'object') {
      const o = st.objects[r.id];
      if (!o) return [];
      const d = objectDef(o.type);
      const prot = PROTECTED_TYPES.has(o.type);
      return [
        { label: '올리기', aria: '업그레이드', icon: 'plus', disabled: !canQuickUpgrade(st, o.id), onPick: () => quickUpgrade(o.id) },
        { label: '이동', icon: 'move', disabled: prot, onPick: () => startMove(o.id) },
        { label: '철거', icon: 'remove', disabled: prot, onPick: () => removeObject(o.id) },
        { label: '더', aria: '같은 것 더', icon: 'build', disabled: prot || !st.unlocked.objects.includes(o.type), onPick: () => pickBuild(o.type, { x: o.x + d.w, y: o.y }) },
      ];
    }
    const at = { x: r.x, y: r.y };
    const seat = cheapestUnlocked(st, (d) => d.kind === 'seat' && !d.indoor);
    const garden = cheapestUnlocked(st, (d) => !d.indoor && d.scenery > 0 && (d.kind === 'deco' || d.kind === 'tree') && !LIGHT_RADIUS[d.id]);
    const lamp = cheapestUnlocked(st, (d) => !!LIGHT_RADIUS[d.id] && !d.indoor);
    const road = cheapestUnlocked(st, (d) => d.kind === 'path');
    return [
      { label: '자리', icon: 'chair', disabled: !seat, onPick: () => seat && pickBuild(seat, at) },
      { label: '정원', icon: 'plant', disabled: !garden, onPick: () => garden && pickBuild(garden, at) },
      { label: '조명', icon: 'bulb', disabled: !lamp, onPick: () => lamp && pickBuild(lamp, at) },
      { label: '길', icon: 'roadside', disabled: !road, onPick: () => road && pickBuild(road, at) },
    ];
  };
  /** 길게 누르기: 숏컷이 켜져 있고 보기 모드면 방사형 메뉴. 꺼져 있으면 예전처럼 들어 올리기. */
  const longPressMenu = (x: number, y: number): boolean => {
    if (!shortcutsOn() || modeRef.current.kind !== 'idle') return false;
    const st = getState();
    const o = objectAt(st, x, y);
    const open = (r: RadialState) => { openCard(null); setRadial(r); showFirstTip('radial'); };
    if (o && !PROTECTED_TYPES.has(o.type)) { open({ ...cellPoint(o.x, o.y), kind: 'object', id: o.id }); return true; }
    if (!o) {
      const p = parcelAt(st, x, y);
      if (p?.owned && cellAt(st, x, y).terrain !== 'road') { open({ ...cellPoint(x, y), kind: 'empty', x, y }); return true; }
    }
    return false;
  };
  /** 더블 탭: 시설이면 업그레이드 바로, 빈 칸이면 최근에 지은 시설 고스트 */
  const onDoubleTap = (x: number, y: number): boolean => {
    if (!shortcutsOn() || modeRef.current.kind !== 'idle') return false;
    const st = getState();
    const o = objectAt(st, x, y);
    if (o && !PROTECTED_TYPES.has(o.type)) { openCard(null); quickUpgrade(o.id); showFirstTip('doubleTap'); return true; }
    if (!o) {
      const p = parcelAt(st, x, y);
      const recent = recentBuildTypes(st, 1)[0];
      if (p?.owned && recent) { openCard(null); pickBuild(recent, { x, y }); showFirstTip('doubleTap'); return true; }
    }
    return false;
  };
  /** 하단 바 길게 누르기: 짓기=최근 시설 퀵바 · 카페=메뉴판 · 사람=채용 · 장부=경영 현황 */
  const onBarLongPress = (kind: WindowKind) => {
    setMode({ kind: 'idle' });
    openCard(null);
    if (kind === 'build') { const st = getState(); if (recentBuildTypes(st).length === 0) { setWin({ kind: 'build' }); return; } setQuickBar(true); return; }
    if (kind === 'cafe') setWin({ kind: 'cafe', tab: 'menu' });
    else if (kind === 'people') setWin({ kind: 'people', tab: 'candidates' });
    else setWin({ kind: 'ledger', tab: 'report' });
    showFirstTip('barLongPress');
  };

  useEffect(() => {
    const host = hostRef.current!;
    const v = new GameView();
    viewRef.current = v;
    // 개발 자동화(손 플레이 검증)에서 칸 ↔ 화면 좌표를 물어보기 위한 훅. 프로덕션 빌드엔 빠진다
    if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __view: GameView }).__view = v;
    let stop: (() => void) | null = null;
    let disposed = false;
    (async () => {
      await v.init(host, {
        guestSay,
        onTap: (x, y) => {
          const m = modeRef.current;
          const st = getState();
          if (x < 0 || y < 0 || x >= st.grid.w || y >= st.grid.h) { if (m.kind === 'idle') openCard(null); return; }
          if (rushRunning(st)) { rushTap(st, x, y); return; } // 러시 중엔 맵 탭이 곧 조작이다
          if (m.kind === 'build') {
            if (isLineType(m.objectType)) {
              // 두 번 탭: 시작 칸 → 끝 칸(같은 칸이면 1칸). 미리보기가 떠 있는데 또 누르면 새 시작 칸
              const l = lineRef.current;
              if (!l || l.to) setLine({ from: { x, y }, to: null, order: l?.order ?? 'xy' });
              else setLine({ ...l, to: { x, y } });
            } else setGhost({ x, y, rot: ghostRef.current?.rot ?? 0 }); // 추천 칸이든 빈 칸이든 탭은 고스트만 옮긴다 — 짓기는 ✓ 확정뿐 (끌기는 길게 누른 뒤에만)
          } else if (m.kind === 'move') {
            const mv = movingRef.current;
            if (mv) setMoving({ ...mv, x, y });
            else {
              const o = objectAt(st, x, y);
              if (!o) showMessage('옮길 것을 골라 주세요');
              else if (PROTECTED_TYPES.has(o.type)) showMessage('이건 못 옮겨요');
              else setMoving({ objectId: o.id, x: o.x, y: o.y }); // seatfix: 손님이 앉아 있어도 고른다
            }
          } else if (m.kind === 'remove') {
            // 탭 = 한 칸 사각형. 이미 고른 게 있으면 새로 고른다
            const o = objectAt(st, x, y);
            if (!o) { setRect(null); showMessage('치울 것을 골라 주세요'); }
            else if (demolishTargets(st, { x0: x, y0: y, x1: x, y1: y }).length === 0) { setRect(null); showMessage('이건 못 치워요'); }
            else setRect({ x0: x, y0: y, x1: x, y1: y });
          } else inspect(st, x, y);
        },
        // 길게 누르기: 보기 모드면 오브젝트 들어 올리기, 고스트·옮기는 시설 위면 그때부터 끌기 (ease: 짧은 드래그는 언제나 카메라)
        onLongPress: (x, y) => {
          const m = modeRef.current;
          if (m.kind === 'build' && !isLineType(m.objectType)) {
            const g = ghostRef.current;
            if (g && inFootprint(m.objectType, g.x, g.y, x, y)) { dragOffset.current = { dx: x - g.x, dy: y - g.y }; return true; }
            return false;
          }
          if (m.kind === 'move') {
            const mv = movingRef.current;
            const o = mv ? getState().objects[mv.objectId] : null;
            if (mv && o && inFootprint(o.type, mv.x, mv.y, x, y, sizeOf(o).w, sizeOf(o).h)) { dragOffset.current = { dx: x - mv.x, dy: y - mv.y }; return true; }
            return false;
          }
          // ui3 숏컷: 보기 모드에서 길게 누르면 방사형 4버튼. 들어 올리기는 그 안 [이동]으로 흡수됐다 (숏컷을 끄면 예전처럼 바로 들어 올린다)
          // true를 돌려줘 그 뒤 드래그를 가져간다 — 손을 뗄 때 탭으로 미니 카드가 같이 열리지 않게 (보기 모드의 onDragCell은 아무것도 안 한다)
          if (longPressMenu(x, y)) return true;
          return liftObject(x, y);
        },
        onDoubleTap,
        dragCapture: (x, y) => {
          const m = modeRef.current;
          if (m.kind === 'remove') {
            const st = getState();
            if (x < 0 || y < 0 || x >= st.grid.w || y >= st.grid.h) return false;
            setRect({ x0: x, y0: y, x1: x, y1: y });
            return true;
          }
          return false;
        },
        onDragCell: (x, y) => {
          const m = modeRef.current;
          const st = getState();
          if (x < 0 || y < 0 || x >= st.grid.w || y >= st.grid.h) return;
          const { dx, dy } = dragOffset.current;
          if (m.kind === 'build') {
            if (!isLineType(m.objectType) && ghostRef.current) setGhost({ ...ghostRef.current, x: x - dx, y: y - dy });
          } else if (m.kind === 'move' && movingRef.current) setMoving({ ...movingRef.current, x: x - dx, y: y - dy });
          else if (m.kind === 'remove' && rectRef.current) setRect({ ...rectRef.current, x1: x, y1: y });
        },
      });
      if (disposed) { v.destroy(); return; } // init 중 언마운트(Fast Refresh 등)
      // 개발 중 브라우저 자동화가 셀 → 화면 좌표를 계산할 수 있도록 (프로덕션 빌드에는 포함되지 않음)
      if (import.meta.env.DEV) { (window as unknown as { __view: unknown }).__view = v; (window as unknown as { __tut: unknown }).__tut = () => tutorialTargets(getState()); } // 자동화: 튜토리얼 글로우 칸
      setViewReset(() => v.reset());
      v.setGauges(gaugesPref());
      v.setMapInsets(SHELL_TOP, SHELL_BOTTOM); // uifix: 맵 팻말이 상단 2줄·하단 바 위로 떠다니지 않게 그 띠 안에서만 그린다
      stop = startLoop((st) => v.render(st));
      setView(v);
    })();
    return () => { disposed = true; stop?.(); setViewReset(null); v.destroy(); viewRef.current = null; setView(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 배치·이동·철거 중에는 게임을 멈춘다
  const placing = mode.kind !== 'idle';
  useEffect(() => { if (placing) return pauseGame('place'); }, [placing]);

  const undoOk = canUndo(s).ok;
  // 고스트·범위 힌트를 뷰에 반영한다
  let ghostSpec: GhostSpec | null = null;
  let rangeHint: RangeHint | null = null;
  let ghostCell: { x: number; y: number; w: number; h: number } | null = null;
  let place: PlaceBarProps | null = null;
  /** video-patch §3.2.1: 지금 고스트가 떠 있는 시설의 추천 칸 3곳 (설정에서 끄면 없음) */
  let picks: PlacePicks | null = null;
  if (mode.kind === 'build' && mode.objectType === MAIN_TYPE) {
    // w-start: 첫 본관 고스트 — 무료·1회, 문 앞 칸 미리보기(파란 마름모), 입지 배지는 주방 —(GameView), 확정하면 placeMain
    const def = objectDef(MAIN_TYPE);
    if (ghost) {
      const can = canBuildMain(s, ghost.x, ghost.y);
      const front = doorFrontOf({ type: MAIN_TYPE, x: ghost.x, y: ghost.y, w: def.w, h: def.h });
      ghostSpec = { type: MAIN_TYPE, x: ghost.x, y: ghost.y, ok: can.ok, text: `${def.name} ${MAIN_BUILD_COST > 0 ? wonText(MAIN_BUILD_COST) : '무료'}`, w: def.w, h: def.h, door: front };
      rangeHint = null;
      ghostCell = { x: ghost.x, y: ghost.y, w: def.w, h: def.h };
      place = {
        text: `${def.name} · 무료 · 문은 앞쪽 왼쪽에 생겨요 · ${can.ok ? '여기에 지을 수 있어요' : (can.reason ?? '여기엔 못 지어요')}`,
        ok: can.ok,
        canRotate: false,
        onUndo: null,
        onConfirm: () => {
          const r = dispatch({ type: 'placeMain', x: ghost.x, y: ghost.y });
          if (!r.ok) { showMessage(r.reason ?? '여기엔 못 지어요'); return; }
          setMode({ kind: 'idle' });
          showMessage('카페 본관을 지었어요 — 문 앞 칸까지 올렛길을 이어요');
        },
        onRotate: () => {},
        onCancel: () => setMode({ kind: 'idle' }),
      };
    }
  } else if (mode.kind === 'build') {
    const def = objectDef(mode.objectType);
    const cost = placeCost(s, mode.objectType);
    if (isLineType(def.id)) {
      // ease 두 번 탭: 시작 칸 → 끝 칸 → 미리보기(파란 칸 + 비용 합계) → ✓ 확정 / ↻ 방향(ㄱ자 꺾는 순서) / ✕ 취소. 확정 전엔 돈이 안 나간다
      const done = mode.count > 0 ? `${mode.count}줄 놓음 · ` : '';
      if (!line) {
        place = { text: `${def.name} · ${wonText(cost)}/칸 · ${done}시작 칸을 누르고 끝 칸을 누르면 이어져요`, ok: true, canRotate: false, paint: true, onUndo: undoOk ? undo : null, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
      } else if (!line.to) {
        place = { text: `${def.name} · ${wonText(cost)}/칸 · 끝 칸을 누르세요 (한 칸이면 같은 칸을 다시)`, ok: true, canRotate: false, paint: true, onUndo: undoOk ? undo : null, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
      } else {
        const plan = planLine(s, def.id, line.from, line.to, line.order);
        const bent = line.from.x !== line.to.x && line.from.y !== line.to.y;
        const skip = plan.skipped.length > 0 ? ` · 있는 칸 ${plan.skipped.length} 건너뜀` : '';
        const blocked = plan.ok && plan.blocked.length > plan.skipped.length ? ` · 못 놓는 칸 ${plan.blocked.length - plan.skipped.length}` : '';
        ghostCell = { x: line.to.x, y: line.to.y, w: 1, h: 1 };
        // spot2 돌담의 쓸모: 이 줄이 북서쪽에서 가려 주는 야외 자리를 칸으로 보여 주고 한 줄로 알린다
        const shelter = plan.ok ? windCoveredSeatsBy(s, def.id, plan.cells) : [];
        if (shelter.length > 0) {
          rangeHint = { x: line.to.x, y: line.to.y, w: 1, h: 1, radius: WIND_WEDGE_MAX, marks: shelter.map((o) => ({ x: o.x, y: o.y, w: objectDef(o.type).w, h: objectDef(o.type).h })) };
        }
        const wind = shelter.length > 0 ? ` · 자리 ${shelter.length}곳 겨울 바람을 막아요` : '';
        place = {
          text: plan.ok ? `${def.name} ${plan.cells.length}칸 · ${wonText(plan.cost)}${skip}${blocked}${wind} · ✓ 확정` : `${def.name} · ${plan.reason ?? '여기엔 못 놓아요'}${skip}`,
          ok: plan.ok,
          canRotate: bent,
          rotateLabel: '방향',
          onUndo: undoOk ? undo : null,
          onConfirm: () => {
            const r = dispatch({ type: 'placeLine', objectType: def.id, from: line.from, to: line.to!, order: line.order });
            if (!r.ok) { showMessage(r.reason ?? '여기엔 못 놓아요'); return; }
            showMessage(`${def.name} ${plan.cells.length}칸을 놓았어요 (↶ 되돌리기 가능)`);
            setLine(null);
            if (!tutorialDone(getState())) { setMode({ kind: 'idle' }); return; } // 튜토리얼 중엔 배치 바가 하단 바를 덮지 않게
            setMode({ kind: 'build', objectType: def.id, count: mode.count + 1 });
          },
          onRotate: () => setLine({ ...line, order: line.order === 'xy' ? 'yx' : 'xy' }),
          onCancel: () => setLine(null),
        };
      }
    } else if (ghost) {
      const can = canPlace(s, mode.objectType, ghost.x, ghost.y);
      const ok = can.ok && s.money >= cost;
      // ui3: 놓을 수는 있지만 손님이 걸어 올 수 없는 자리면 고스트가 주황이 되고 배치 바가 경고한다
      const unreach = ok && !spotReachable(s, mode.objectType, ghost.x, ghost.y);
      ghostSpec = { type: mode.objectType, x: ghost.x, y: ghost.y, rot: ROTATABLE_TYPES.has(mode.objectType) ? ghost.rot : undefined, ok, warn: unreach, text: `${def.name} ${wonText(cost)}` };
      rangeHint = rangeHintFor(s, mode.objectType, ghost.x, ghost.y);
      ghostCell = { x: ghost.x, y: ghost.y, w: def.w, h: def.h };
      const confirmAt = (x: number, y: number) => {
        const r = dispatch({ type: 'place', objectType: mode.objectType, x, y, rot: ghost.rot });
        if (!r.ok) { showMessage(r.reason ?? '여기엔 못 놓아요'); return; }
        // 튜토리얼 중엔 연속 배치를 끈다 — 배치 바가 하단 바를 덮어 다음 단계 버튼을 못 누른다 (y 통합 미해결 a)
        if (!tutorialDone(getState())) { setMode({ kind: 'idle' }); return; }
        // 연속 배치(§5.3): 고스트를 옆 칸으로 옮겨 남긴다. 돈이 모자라면 자동 종료
        const nx = nextGhostAfterPlace(getState(), mode.objectType, { ...ghost, x, y });
        if (nx.done) { setMode({ kind: 'idle' }); showMessage(nx.reason); return; }
        setGhost(nx.ghost);
        setMode({ kind: 'build', objectType: mode.objectType, count: mode.count + 1 });
      };
      const confirm = () => confirmAt(ghost.x, ghost.y);
      if (hintsOn) picks = placementPicks(s, mode.objectType);
      place = {
        text: `${def.name} · ${wonText(cost)} · ${unreach ? UNREACHABLE_GHOST_TEXT : ok ? (mode.count > 0 ? `${mode.count}개 놓음 · 계속 놓을 수 있어요` : '여기에 지을 수 있어요 · 칸을 누르면 옮겨요') : (can.reason ?? '돈이 모자라요')}`,
        tradeoff: tradeoffOf(s, mode.objectType, ghost.x, ghost.y), // fun: 얻는 것/잃는 것 두 줄
        ok,
        canRotate: ROTATABLE_TYPES.has(mode.objectType),
        continuous: mode.count > 0,
        onUndo: undoOk ? undo : null,
        onConfirm: confirm,
        onRotate: () => setGhost({ ...ghost, rot: (ghost.rot + 1) % 4 }),
        onCancel: () => setMode({ kind: 'idle' }),
      };
    }
  } else if (mode.kind === 'move') {
    const o = moving ? s.objects[moving.objectId] : null;
    if (moving && o) {
      const def = objectDef(o.type);
      const size = sizeOf(o); // 본관 증축 Lv2+는 정의 크기와 다르다 (y-indoor)
      const can = canPlace(s, o.type, moving.x, moving.y, o.id);
      // seatfix: 손님이 앉았거나 지나가는 중이어도 확정할 수 있다 — 그 자리로 옮기는 예약이 걸리고, 손님이 일어나면 sim이 옮긴다 (본관은 기존 이사 규칙 그대로)
      const busy = o.type === 'warehouse' ? null : guestBlock(s, o);
      const moveUnreach = can.ok && !spotReachable(s, o.type, moving.x, moving.y); // ui3: 옮긴 자리에 손님이 못 오면 주황
      const cornerBreak = can.ok && !moveUnreach ? cornerMoveWarning(s, o.id, moving.x, moving.y) : null; // spot2: 명당 조각을 빼내면 명당이 깨진다
      ghostSpec = { type: o.type, x: moving.x, y: moving.y, rot: o.rot, ok: can.ok, warn: moveUnreach, text: `${def.name} 옮기기`, w: size.w, h: size.h };
      rangeHint = rangeHintFor(s, o.type, moving.x, moving.y, o.id);
      ghostCell = { x: moving.x, y: moving.y, w: size.w, h: size.h };
      place = {
        // 한 줄 우선순위: 못 옮기는 이유 > 손님이 못 오는 자리 > 예약 안내 > 옮길 수 있어요
        text: `${def.name} · ${!can.ok ? (can.reason ?? '여기엔 못 옮겨요') : moveUnreach ? UNREACHABLE_GHOST_TEXT : cornerBreak ? cornerBreak : busy ? `${busy} · 일어나면 옮길게요` : '여기로 옮길 수 있어요'}`,
        ok: can.ok,
        canRotate: ROTATABLE_TYPES.has(o.type),
        onUndo: undoOk ? undo : null,
        onConfirm: () => {
          const done = () => { if (liftedRef.current) { liftedRef.current = false; setMode({ kind: 'idle' }); } else setMoving(null); };
          if (busy) {
            const p = dispatch({ type: 'reserveWork', objectId: o.id, work: 'move', x: moving.x, y: moving.y });
            if (!p.ok) { showMessage(p.reason ?? '여기엔 못 옮겨요'); return; }
            showMessage('손님이 일어나면 옮길게요');
            done();
            return;
          }
          const r = dispatch({ type: 'move', objectId: o.id, x: moving.x, y: moving.y });
          if (!r.ok) { showMessage(r.reason ?? '여기엔 못 옮겨요'); return; }
          done();
        },
        onRotate: () => dispatch({ type: 'rotate', objectId: o.id, rot: ((o.rot ?? 0) + 1) % 4 }),
        onCancel: () => { if (liftedRef.current) { liftedRef.current = false; setMode({ kind: 'idle' }); } else setMoving(null); },
      };
    } else {
      place = { text: '옮길 시설을 누르세요 (돈은 안 들어요)', ok: true, canRotate: false, paint: true, onUndo: undoOk ? undo : null, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
    }
  } else if (mode.kind === 'remove') {
    const ids = rect ? demolishTargets(s, rect) : [];
    if (rect && ids.length > 0) {
      const objs = ids.map((id) => s.objects[id]!);
      const delta = demolishRefund(objs);
      const later = reservedCount(s, ids); // seatfix: 손님이 있는 것은 예약만 걸린다
      place = {
        text: `${ids.length}개 철거 · ${delta >= 0 ? `환불 ${wonText(delta)}` : `비용 ${wonText(-delta)}`}${later > 0 ? ` · ${later}개는 손님이 일어나면` : ''}`,
        ok: true, canRotate: false, onUndo: undoOk ? undo : null,
        onConfirm: () => {
          const r = dispatch({ type: 'demolishMany', objectIds: ids });
          if (r.ok) { setRect(null); showMessage(later > 0 ? `${ids.length - later}개 치우고 ${later}개는 예약했어요` : `${ids.length}개 치웠어요 (↶ 되돌리기 가능)`); }
          else showMessage(r.reason ?? '지금은 못 치워요');
        },
        onRotate: () => {},
        onCancel: () => setRect(null),
      };
    } else {
      place = { text: '치울 시설을 누르거나 끌어서 여러 개 고르세요', ok: true, canRotate: false, paint: true, onUndo: undoOk ? undo : null, onConfirm: () => {}, onRotate: () => {}, onCancel: () => setMode({ kind: 'idle' }) };
    }
  } else if (mode.kind === 'autopath') {
    // ease 「마을 길까지 자동 잇기」: canAutoConnectPath의 빈 칸을 파란 마름모로, ✓면 autoConnectPath (되돌리기 1회로 전부)
    const c = canAutoConnectPath(s);
    const r = c.route;
    place = {
      text: c.ok && r ? `올렛길 ${r.empty.length}칸 · ${wonText(r.cost)} · 문 앞까지 자동으로 이어요 · ✓ 확정` : (c.reason ?? '이을 길이 없어요'),
      ok: c.ok, canRotate: false, onUndo: undoOk ? undo : null,
      onConfirm: () => {
        const res = dispatch({ type: 'autoConnectPath' });
        if (!res.ok) { showMessage(res.reason ?? '이을 길이 없어요'); return; }
        showMessage(`올렛길 ${r?.empty.length ?? 0}칸을 이었어요 (↶ 되돌리기 가능)`);
        setMode({ kind: 'idle' });
      },
      onRotate: () => {},
      onCancel: () => setMode({ kind: 'idle' }),
    };
  } else if (cardTarget?.kind === 'object') {
    const o = s.objects[cardTarget.id];
    if (o) rangeHint = rangeHintFor(s, o.type, o.x, o.y, o.id);
  }
  useEffect(() => { viewRef.current?.setGhost(ghostSpec); viewRef.current?.setRangeHint(rangeHint); });
  // rush: 러시 중 자리 색칠 (초록 앉힐 수 있다 · 회색 못 앉힌다 · 빨강 주문이 밀렸다)
  const rushOn = rushRunning(s);
  useEffect(() => { viewRef.current?.setRushMarks(rushOn ? rushMarks(s) : []); });
  // 러시가 시작되면 짓기·이동·철거 모드를 끝낸다 — 배치 바가 스킬 카드를 덮지 않게
  useEffect(() => { if (rushOn) { setMode({ kind: 'idle' }); openCard(null); setWin(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rushOn]);
  // video-patch §3.2.1: 추천 칸을 맵에 그린다 (고스트 칸은 이미 고스트가 덮으므로 뺀다)
  const pickMarks = picks ? picks.picks.filter((p) => !(ghost && p.x === ghost.x && p.y === ghost.y)) : [];
  useEffect(() => { viewRef.current?.setPlacementPicks(pickMarks); });
  // 자동 잇기 미리보기 칸 (상태가 바뀌면 다시 계산)
  useEffect(() => { if (mode.kind !== 'autopath') return; const r = canAutoConnectPath(s).route; viewRef.current?.setRectCells(r?.empty ?? [], RECT_COLOR_LINE); }, [mode.kind, s]);

  const openWindow = (kind: WindowKind) => { setMode({ kind: 'idle' }); openCard(null); setWin(DEFAULT_WIN[kind]); };
  const cardActions: CardActions = {
    onGuestDetail: (id) => { openCard(null); setGuestPopup(id); },
    onQuest: (questId) => { openCard(null); if (dispatch({ type: 'acceptQuest', id: questId }).ok) setWin({ kind: 'people', tab: 'quests' }); },
    onStaffDetail: (id) => { openCard(null); setWin({ kind: 'people', tab: 'staff', focusId: id }); },
    onObjectDetail: (id) => { openCard(null); setWin({ kind: 'object', id }); },
    onMove: (id) => { openCard(null); startMove(id); },
    onBuild: (x, y) => { openCard(null); setWin({ kind: 'build', origin: { x, y } }); },
    onBuildSame: (type, x, y) => { openCard(null); pickBuild(type, { x, y }); },
    onCafe: () => { openCard(null); setWin({ kind: 'cafe', tab: 'building' }); },
    onAutoPath: () => { openCard(null); closeWin(); setMode({ kind: 'autopath' }); const m = mainBuilding(getState()); if (m) viewRef.current?.focusCell(m.x, m.y + 2, 3, 3, 1.2); },
    onSelect: (t) => openCard(t),
  };
  const closeWin = () => setWin(null);
  /** ui3: 창 안 줄(손님이 못 가는 시설)에서 그 자리로 — 창을 닫고 카메라를 옮긴다 */
  const focusAndClose = (x: number, y: number) => { setWin(null); openCard(null); viewRef.current?.focusCell(x, y, 1, 1, 1.4); };
  // 튜토리얼 하이라이트 (data-tut 글로우 + 맵 칸)
  useTutorialHighlight(view);
  useFirstTip(tipKeyFor(win, mode, !!guestPopup)); // fun-start: 창·탭·모드를 처음 열면 팁 한 줄

  const CAFE_MENU: IconGridItem<CafeTab>[] = [
    { key: 'menu', label: '메뉴판', icon: 'coffee', desc: '무엇을 파나' },
    { key: 'ingredients', label: '재료', icon: 'harvest', desc: '쟁여 둔 것' },
    { key: 'craft', label: '연구', icon: 'research', desc: '새 메뉴' }, // ease: 연구·홍보는 처음부터 열려 있다
    { key: 'promo', label: '홍보', icon: 'promo', desc: '손님 부르기' },
    { key: 'building', label: '본관', icon: 'home', desc: '건물 키우기' },
    { key: 'indoor', label: '실내', icon: 'chair', desc: '안 꾸미기' },
  ];
  const offered = Object.values(s.board.quests).filter((q) => q.status === 'offered').length;
  const PEOPLE_MENU: IconGridItem<PeopleTab>[] = [
    { key: 'staff', label: '직원', icon: 'staff', desc: '일하는 사람', badge: s.staff.filter((st) => st.energy < 20).length },
    { key: 'candidates', label: '채용', icon: 'hire', desc: '뽑을 사람', badge: s.candidates.length },
    { key: 'guests', label: '손님', icon: 'guest', desc: '지금 온 손님', badge: s.guests.length },
    { key: 'codex', label: '도감', icon: 'book', desc: '만난 손님' },
    { key: 'quests', label: '부탁', icon: 'quest', desc: '들어온 부탁', badge: offered },
  ];
  const revealed = gradeOf(s) >= REVEAL_GRADE; // fun 점진 공개: 등급 3부터 실내·본관·명소·지역이 나타난다 (잠금 표시 대신 아예 안 보임)
  const LEDGER_MENU: IconGridItem<LedgerTab>[] = [
    { key: 'report', label: '경영', icon: 'report', desc: '돈의 흐름' },
    { key: 'invest', label: '투자', icon: 'money', desc: '땅과 대출', badge: s.board.events.filter((e) => e.status === 'pending').length },
    { key: 'spots', label: '명소', icon: 'map', desc: '동네 명소' },
    { key: 'tickets', label: '응모권', icon: 'ticket', desc: '뽑기와 상점', badge: s.tickets }, // midgame: 「상점」 탭이 같은 화면이라 하나로 합쳤다
    { key: 'rank', label: '평가', icon: 'trophy', desc: '동네 순위', badge: s.rivals?.pending ? 1 : 0 }, // 동네 순위 발표를 아직 안 봤으면 배지
    { key: 'contest', label: '대회', icon: 'medal', desc: '카페 대회', badge: signupOpen(s) && !s.contest?.entry ? 1 : 0 },
    { key: 'settings', label: '설정', icon: 'settings', desc: '소리와 저장' },
  ];

  const cafeMenu = revealed ? CAFE_MENU : CAFE_MENU.filter((t) => t.key !== 'building' && t.key !== 'indoor');
  const peopleMenu = PEOPLE_MENU;
  const ledgerMenu = LEDGER_MENU.filter((t) => (revealed || t.key !== 'spots') && (contestUnlocked(s) || t.key !== 'contest')); // 대회는 등급 3부터 (fun 점진 공개)
  const renderWindow = () => {
    if (!win) return null;
    switch (win.kind) {
      case 'build':
        return (
          <Window title="짓기" onClose={closeWin} testId="window-build">
            {/* ui3 정돈: 도구 줄은 아이콘만 (읽어 주는 이름은 남긴다) · 줄이 차지하는 높이 −8px */}
            <div data-testid="build-tools" role="toolbar" aria-label="도구" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 0, marginTop: -4 }}>
              <button data-tut="tool:move" aria-label="이동" title="이동" style={{ ...brownBtn, margin: 0, padding: 0, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { closeWin(); setMode({ kind: 'move' }); }}><Icon name="move" size={20} /></button>
              <button data-tut="tool:remove" aria-label="철거" title="철거" style={{ ...dangerBtn, margin: 0, padding: 0, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { closeWin(); setMode({ kind: 'remove' }); }}><Icon name="remove" size={20} /></button>
              <button data-testid="tool-undo" data-tut="tool:undo" aria-label="되돌리기" disabled={!undoOk} title={undoOk ? '되돌리기' : canUndo(s).reason} style={{ ...(undoOk ? brownBtn : brownBtnOff), margin: 0, padding: 0, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} onClick={undo}><Icon name="undo" size={20} /></button>
            </div>
            <BuildWindow onClose={closeWin} onPickBuild={(t) => pickBuild(t, win.origin)} />
          </Window>
        );
      case 'cafe':
        return (
          <Window title="카페" menu={cafeMenu} tab={win.tab} onTab={(t) => setWin({ kind: 'cafe', tab: t })} onClose={closeWin} testId="window-cafe">
            {win.tab === 'menu' && <MenuWindow onClose={closeWin} menuUnlockText={menuUnlockText} />}
            {win.tab === 'ingredients' && <StoragePanel />}
            {win.tab === 'craft' && <CraftPanel />}
            {win.tab === 'promo' && <PromoPanel />}
            {win.tab === 'building' && (<>
              {mainBuilding(s) && <MainCard s={s} id={mainBuilding(s)!.id} a={{ ...cardActions, onCafe: () => setWin({ kind: 'cafe', tab: 'menu' }) }} />}{/* y-indoor 본관 카드 본문 (창 안) */}
              <CafePanel onMenu={() => setWin({ kind: 'cafe', tab: 'menu' })} />
            </>)}
            {win.tab === 'indoor' && <BuildWindow onClose={closeWin} onPickBuild={(t) => pickBuild(t)} initialTab="indoor" />}{/* y-indoor 「실내」 탭 */}
          </Window>
        );
      case 'people':
        return (
          <Window title="사람" menu={peopleMenu} tab={win.tab} onTab={(t) => setWin({ kind: 'people', tab: t })} onClose={closeWin} testId="window-people">
            {win.tab === 'staff' && <StaffWindow onClose={closeWin} focusId={win.focusId ?? null} initialTab="ours" />}
            {win.tab === 'candidates' && <StaffWindow onClose={closeWin} focusId={null} initialTab="candidates" />}
            {win.tab === 'guests' && <GuestsPanel onGuest={setGuestPopup} sub="now" />}
            {win.tab === 'codex' && <><GuestsPanel onGuest={setGuestPopup} sub="codex" /><CodexPanel /></>}
            {win.tab === 'quests' && <BoardPanel tabs={['quests']} />}
          </Window>
        );
      case 'ledger':
        return (
          <Window title="장부" menu={ledgerMenu} tab={win.tab} onTab={(t) => setWin({ kind: 'ledger', tab: t })} onClose={closeWin} testId="window-ledger">
            {win.tab === 'report' && <StatusPanel onFocus={focusAndClose} />}
            {win.tab === 'invest' && <BoardPanel tabs={['events']} onContest={() => setWin({ kind: 'ledger', tab: 'contest' })} />}
            {win.tab === 'spots' && <BoardPanel tabs={['spots']} />}
            {(win.tab === 'tickets' || win.tab === 'shop') && <ShopPanel initialTab="draw" />}{/* 옛 세이브·숏컷이 'shop'으로 올 수 있다 */}
            {win.tab === 'rank' && <RankPanel />}
            {win.tab === 'contest' && <ContestWindow />}
            {win.tab === 'settings' && <SettingsPanel onExit={onExit} gauges={gauges} onGauges={setGauges} />}
          </Window>
        );
      case 'status':
        return <Window title="경영 현황" onClose={closeWin} testId="window-status"><StatusPanel onFocus={focusAndClose} /></Window>;
      case 'goal':
        return <Window title="할 일" onClose={closeWin} testId="window-goal"><GoalWindow onClose={closeWin} /></Window>;
      case 'object': {
        const o = s.objects[win.id];
        return <Window title={o ? (o.name ?? objectDef(o.type).name) : '시설'} onClose={closeWin} testId="window-object">{o ? <ObjectInfoPanel objectId={o.id} onFocus={(x, y) => viewRef.current?.focusCell(x, y, 1, 1, 1.6)} /> : <div>없어진 시설이에요</div>}</Window>;
      }
    }
  };

  return (
    <div onPointerDownCapture={onPointerDown} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }} />
      <SiteOverlayChip />
      {win ? <FirstTipBubble bottom={76} /> : <FirstTipBubble top={SHELL_TOP + 10} />}
      <TopShell onStatus={() => setWin({ kind: 'status' })} onGoal={() => setWin({ kind: 'goal' })} onTickets={() => setWin({ kind: 'ledger', tab: 'tickets' })} />
      {!place && !cardTarget && !rushOn && (
        <button data-testid="home-btn" aria-label="본관으로" onClick={goHome}
          style={{ position: 'absolute', left: 8, bottom: `calc(${SHELL_BOTTOM + 8}px + env(safe-area-inset-bottom))`, width: 56, height: 56, borderRadius: 28, border: `3px solid ${PALETTE.wood}`, background: PALETTE.paper, fontSize: 20, zIndex: 11, padding: 0, boxShadow: '0 2px 0 #0004', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="home_cafe_big" size={48} /></button>
      )}
      {place && ghostCell && <GhostButtons view={view} cell={ghostCell} ok={place.ok} canRotate={place.canRotate} onConfirm={place.onConfirm} onRotate={place.onRotate} />}
      {picks && <PlacementHintLine picks={picks} bottom={SHELL_BOTTOM + 44} state={s} type={mode.kind === 'build' ? mode.objectType : undefined} />}{/* video-patch §3.2.1: 워커 대기 중에도 한 줄은 남는다 */}
      {!place && !cardTarget && !win && !rushOn && (
        <VoiceFeed bottom={BOTTOM_BAR_H + 26}
          onFocus={(x, y) => viewRef.current?.focusCell(x, y, 1, 1, 1.6)}
          onFix={(fix) => {
            if (fix === 'seat') { requestBuildTab('rest'); setWin({ kind: 'build' }); }
            else if (fix === 'staff') setWin({ kind: 'people', tab: 'staff' });
            else if (fix === 'menu') setWin({ kind: 'cafe', tab: 'menu' });
            else if (fix === 'clean') { setMode({ kind: 'idle' }); showMessage('낡은 시설을 골라 고쳐 보세요'); }
          }} />
      )}
      {!win && !rushOn && <DaySummaryCard bottom={BOTTOM_BAR_H + 26 + VOICE_FEED_MAX * (VOICE_ROW_H + 2) + 4} />}{/* 손님 목소리 피드 위 */}
      <MessageLine bottom={BOTTOM_BAR_H} />
      {quickBar && !place && <QuickBar onPick={(t) => { setQuickBar(false); pickBuild(t); }} onMore={() => { setQuickBar(false); setWin({ kind: 'build' }); }} onClose={() => setQuickBar(false)} />}
      {place ? <PlaceBar {...place} /> : <BottomBar onOpen={openWindow} onLongOpen={onBarLongPress} />}
      {radial && <RadialMenu left={radial.left} top={radial.top} items={radialItems(radial)} onClose={() => setRadial(null)} />}
      {cardTarget && !place && <MiniCard target={cardTarget} actions={cardActions} onClose={() => openCard(null)} />}
      <MonthCard />
      <DevelopResultPopup />
      <DrawPopup />
      <AnnouncementPopup />
      {guestPopup && <GuestPopup guestId={guestPopup} onClose={() => setGuestPopup(null)} onQuest={(id) => { dispatch({ type: 'acceptQuest', id }); setWin({ kind: 'people', tab: 'quests' }); }} />}
      {renderWindow()}
      <RushHud />
      <RushShow />
      {!rushOn && <RewardPopup />}{/* rush: 보상 상자도 러시가 끝난 뒤에 */}
      <OutcomePopup />
      <ContestShow />
      <EndingScreen onExit={onExit} />
      <DialogueHost />
    </div>
  );
}

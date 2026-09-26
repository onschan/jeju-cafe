import { useEffect, useState } from 'react';
import { useGame, dispatch, showMessage } from './store';
import { wonText } from '../data/labels.ts';
import { objectStats, sceneryScore, canUseItem, itemEffect, popularityFor, guestPickMult, likesFacility, unlockedTypeIds, BASE_POPULARITY, BASE_FEE_PCT, PROTECTED_TYPES, type ObjectKind, type GameState, type PlacedObject, buildDaysLeft, josa } from '../sim/index.ts';
import { objectDef, itemDef, guestTypeDef, SETS } from '../data/index.ts';
import { betterSpot } from './PlacementHints'; // video-patch §3.2.2
import { Icon } from './Icon';
import { Confirm } from './Popup';
import { RecipeCodex } from './CraftPanel';
import { TitleCodex } from './TitleCodex'; // staff-luck 칭호 도감
import { ContestCodex } from './windows/ContestWindow';
import { CornerCodex } from './CornerCodex';
import { brownBtn, brownBtnOn, brownBtnOff, dangerBtn, card, PALETTE } from './frame';

/** 계열 이름 (아이 눈높이) */
const KIND_LABEL: Record<ObjectKind, string> = {
  seat: '자리', tree: '농원', wall: '담', path: '길', building: '건물', deco: '꾸미기', busstop: '정류장', gate: '대문', landmark: '랜드마크', facility: '시설',
};
const TARGET_LABEL: Record<string, string> = { all: '모두', female: '여성 손님', male: '남성 손님', youth: '젊은 손님', adult: '어른 손님', senior: '삼춘', group: '단체 손님' };

/** 부호를 붙인 수 (보너스·경치 줄) */
function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** 「여기보다 좋은 자리 있음 · +38만」 한 줄 (video-patch §3.2.2). 이득이 문턱 아래면 **줄 자체를 안 그린다** — 항상 뜨는 잔소리를 만들지 않는다. */
function BetterSpotLine({ objectId, onFocus }: { objectId: string; onFocus?: (x: number, y: number) => void }) {
  const s = useGame();
  const spot = betterSpot(s, objectId);
  if (!spot) return null;
  const go = () => {
    const r = dispatch({ type: 'move', objectId, x: spot.x, y: spot.y });
    if (!r.ok) { showMessage(r.reason ?? '여기엔 못 옮겨요'); return; }
    onFocus?.(spot.x, spot.y);
    showMessage('더 좋은 자리로 옮겼어요 (↶ 되돌리기 가능)');
  };
  return (
    <div data-testid="better-spot" style={{ ...card, padding: 6, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
        <Icon name="bulb" size={13} /> 여기보다 좋은 자리 있음 · <b style={{ color: PALETTE.ok, whiteSpace: 'nowrap' }}>+{Math.round(spot.gain / 10_000)}만</b>
      </span>
      <button data-testid="better-spot-move" style={{ ...brownBtnOn, flex: 'none', margin: 0, height: 44, padding: '0 8px', fontSize: 14, whiteSpace: 'nowrap' }} onClick={go}><Icon name="move" /> 옮기기</button>
    </div>
  );
}

/** video P0-4 「누구에게 인기」: 이 자리를 가장 반길 손님층 하나.
 *  새로 계산하지 않는다 — 자리는 sceneryScore가 손님층의 눈높이(minScenery)를 넘는지, 시설은 likesFacility,
 *  그다음 popularityFor × guestPickMult 순으로 본다. 손님층끼리 값이 다 같으면 null(아무 데나 붙이면 거짓말이다). */
export function bestGuestType(s: GameState, objectId: string): { id: string; name: string } | null {
  const o = s.objects[objectId];
  if (!o) return null;
  const d = objectDef(o.type);
  const seat = d.kind === 'seat';
  const around = seat ? sceneryScore(s, o.x, o.y) : 0;
  /** 큰 순서대로 본다: 눈높이를 넘겼나(자리) · 좋아하는 종류인가(시설) · 인기 × 고르는 배수 */
  const scoreOf = (id: string): number[] => {
    const g = guestTypeDef(id);
    const picky = seat && around >= g.minScenery ? g.minScenery : -1; // 까다로운 손님까지 만족시키는 자리면 그 손님이 주인공
    const likes = !seat && likesFacility(id, o.type) ? 1 : 0;
    return [picky, likes, popularityFor(s, objectId, id) * guestPickMult(s, objectId, id)];
  };
  const cmp = (a: number[], b: number[]): number => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]! ? 1 : -1;
    return 0;
  };
  let best: { id: string; score: number[] } | null = null;
  let same = true;
  for (const id of unlockedTypeIds(s)) {
    const score = scoreOf(id);
    if (!best) { best = { id, score }; continue; }
    const c = cmp(score, best.score);
    if (c !== 0) same = false;
    if (c > 0) best = { id, score };
  }
  if (!best || same) return null;
  return { id: best.id, name: guestTypeDef(best.id).name };
}

/** video P0-4 n/N 페이저: 같은 종류의 시설을 왼쪽 위부터 줄 세운다 (영상 15:00의 1/4). */
export function sameKindObjects(s: GameState, objectId: string): PlacedObject[] {
  const o = s.objects[objectId];
  if (!o) return [];
  return Object.values(s.objects).filter((x) => x.type === o.type).sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1));
}

/** 손익계산서 한 줄 (라벨 · 인기 · 요금). big이면 경치 줄처럼 크게. */
function SheetRow({ label, pop, fee, big, bold, testId }: { label: string; pop: string; fee?: string; big?: boolean; bold?: boolean; testId?: string }) {
  const size = big ? 17 : 14;
  return (
    <div data-testid={testId} style={{ display: 'flex', alignItems: 'baseline', fontSize: size, fontWeight: bold || big ? 700 : 400, lineHeight: 1.6 }}>
      <span style={{ flex: 1, minWidth: 0, color: PALETTE.inkSoft, fontSize: big ? 15 : 13 }}>{label}</span>
      <span style={{ width: 62, textAlign: 'right' }}>{pop}</span>
      <span style={{ width: 62, textAlign: 'right' }}>{fee ?? ''}</span>
    </div>
  );
}

/** 칸을 눌렀을 때 보이는 오브젝트 정보: 손익계산서(기본·보너스·경치·합계) · 누구에게 인기 · n/N 페이저 · 상성·세트·아이템 사용·치우기 */
export function ObjectInfoPanel({ objectId, onFocus }: { objectId: string; onFocus?: (x: number, y: number) => void }) {
  const s = useGame();
  // 페이저로 옮겨 간 시설. 창이 다른 시설로 다시 열리면 그쪽으로 되돌아간다
  const [pagedId, setPagedId] = useState(objectId);
  useEffect(() => { setPagedId(objectId); }, [objectId]);
  const curId = s.objects[pagedId] ? pagedId : objectId;
  const o = s.objects[curId];
  if (!o) return null;
  const d = objectDef(o.type);
  const st = objectStats(s, o.id);
  const around = sceneryScore(s, o.x, o.y);
  // 합계 줄: 새로 계산하지 않는다 — objectStats가 준 값에서 정의값(기본)을 빼면 보너스, 합계는 objectStats 그대로다
  const baseP = d.popularity ?? BASE_POPULARITY;
  const baseF = d.feePct ?? BASE_FEE_PCT;
  const bonusP = st.popularity - baseP;
  const bonusF = st.feePct - baseF;
  const likes = bestGuestType(s, o.id);
  const siblings = sameKindObjects(s, o.id);
  const siblingIndex = Math.max(0, siblings.findIndex((x) => x.id === o.id));
  const goSibling = (step: number) => {
    const next = siblings[(siblingIndex + step + siblings.length) % siblings.length];
    if (!next) return;
    setPagedId(next.id);
    onFocus?.(next.x, next.y); // 카메라가 따라간다 (영상 15:00)
  };
  const usable = Object.entries(s.inventory).filter(([id, n]) => n > 0 && canUseItem(s, id, o.type).ok);
  const useIt = (itemId: string) => {
    const it = itemDef(itemId);
    const eff = itemEffect(it, d);
    Confirm(`${josa(it.name, '을/를')} 써서 모든 ${d.name}의 ${josa(it.stat === 'popularity' ? '입소문' : it.stat === 'scenery' ? '경관' : '요금', '을/를')} +${eff}${it.stat === 'feePct' ? '%' : ''} 올릴까요? (아이템 1개를 써요)`, () => dispatch({ type: 'useItem', itemId, objectType: o.type }), { title: '아이템 사용' });
  };
  return (
    <div>
      <div style={{ marginBottom: 2 }}>
        <b>{d.name}</b> <span style={{ fontSize: 13, color: PALETTE.inkSoft }}>· {KIND_LABEL[d.kind]}</span>
      </div>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>{d.desc ?? d.effectText ?? josa(d.name, '이에요/예요')}</div>
      {o.build && <div style={{ fontSize: 14, color: PALETTE.title, marginBottom: 4 }} data-testid="building"><Icon name="build" size={14} /> 짓는 중 — 완공까지 {buildDaysLeft(s, o)}일 (일꾼 삼춘이 일하고 있어요)</div>}
      {/* video P0-4: 이 자리가 지금 얼마나 일하는지 한 창에서 더해 본다 — 기본 + 보너스 → 합계, 경치는 제일 크게 (영상 15:00) */}
      <div data-testid="object-sheet" style={{ ...card, padding: '4px 8px', marginBottom: 6 }}>
        <SheetRow label={`유지 ${wonText(st.upkeep)}/달`} pop="인기" fee="요금" />
        <SheetRow label="기본" pop={`${baseP}`} fee={`${baseF}%`} />
        <SheetRow label="보너스" pop={signed(bonusP)} fee={`${signed(bonusF)}%`} />
        <SheetRow testId="sheet-scenery" label={`경치 (주변 ${around})`} pop={signed(st.scenery)} big />
        <SheetRow testId="sheet-total" label="합계" pop={`${st.popularity}`} fee={`${st.feePct}%`} bold />
        {st.noise > 0 && <SheetRow label="소음" pop={`${st.noise}`} />}
      </div>
      {likes && <div data-testid="object-likes" style={{ fontSize: 14, fontWeight: 700, color: PALETTE.title, marginBottom: 4 }}>{likes.name}에게 인기</div>}
      {siblings.length > 1 && (
        <div data-testid="object-pager" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <button aria-label="이전 시설" style={{ ...brownBtn, margin: 0, flex: 'none', width: 44, height: 44, fontSize: 16, padding: 0 }} onClick={() => goSibling(-1)}>◀</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700 }}>{siblingIndex + 1}/{siblings.length}</span>
          <button aria-label="다음 시설" style={{ ...brownBtn, margin: 0, flex: 'none', width: 44, height: 44, fontSize: 16, padding: 0 }} onClick={() => goSibling(1)}>▶</button>
        </div>
      )}

      <BetterSpotLine objectId={o.id} onFocus={onFocus} />
      {st.corner.pop > 0 && (
        <div style={{ ...card, padding: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>가까운 명당 덕</div>
          <div style={{ fontSize: 14 }}><b style={{ color: PALETTE.ok }}>입소문 +{st.corner.pop}</b> · 명당은 돈이 아니라 소문을 낸다</div>
        </div>
      )}
      {st.sets.length > 0 && (
        <div style={{ ...card, padding: 6, marginBottom: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft }}>세트 효과</div>
          {st.sets.map((x) => {
            const max = SETS.find((d) => d.id === x.id)?.levelMult.length ?? x.level;
            return (
              <div key={x.id} style={{ fontSize: 14 }}>
                ★ {x.name} <b>Lv{x.level}</b>
                {x.level >= max && <b data-testid="set-max" style={{ marginLeft: 4, padding: '0 4px', borderRadius: 3, background: PALETTE.btnOn, color: PALETTE.btnOnText, fontSize: 11 }}>MAX</b>}{/* §2.4: 더 못 키우는 것은 뱃지로 한눈에 */}
                <span style={{ fontSize: 12, color: PALETTE.inkSoft }}> · {TARGET_LABEL[x.target]} 입소문 ×{x.mult}</span>
              </div>
            );
          })}
        </div>
      )}
      {s.itemBonus[o.type] && (s.itemBonus[o.type]!.popularity > 0 || s.itemBonus[o.type]!.feePct > 0) && (
        <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 4 }}>
          아이템 보너스: 입소문 +{s.itemBonus[o.type]!.popularity}{s.itemBonus[o.type]!.feePct > 0 && ` · 요금 +${s.itemBonus[o.type]!.feePct}%`}
        </div>
      )}
      {!PROTECTED_TYPES.has(o.type) && (
        <button style={dangerBtn} onClick={() => dispatch({ type: 'remove', objectId: o.id })}><Icon name="remove" /> 치우기 ({d.removeCost ? `${wonText(d.removeCost)} 들어요` : `${wonText(d.cost)} 돌려받음`})</button>
      )}
      {/* 아이템은 심기·치우기 아래에 — 아이템이 10개를 넘으면 기본 동작이 화면 밖으로 밀려난다 */}
      {usable.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, color: PALETTE.inkSoft, marginBottom: 2 }}>강화 아이템 쓰기</div>
          {usable.map(([id, n]) => (
            <button key={id} style={brownBtnOn} onClick={() => useIt(id)}>
              <Icon name="unlock" /> {itemDef(id).name} 쓰기 ({n}개)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 목록은 먼저 TOP N만 보여 주고 나머지는 접는다 (§2.4 정보 밀도) */
export const CODEX_TOP = 4;

/** 이름을 모르는 오브젝트 id도 안전하게 (v2 표에는 아직 없는 시설이 섞일 수 있다) */
function nameOf(objectId: string): string {
  try { return objectDef(objectId).name; } catch { return objectId; }
}

/** 세트·명당·레시피 도감 */
export function CodexPanel() {
  const s = useGame();
  const doneSets = new Set(s.codex.sets);
  const [allSets, setAllSets] = useState(false);
  // §2.4 정보 밀도: 이룬 것을 앞으로 모아 TOP4만 펼치고 나머지는 접는다
  const ordered = [...SETS].sort((a, b) => Number(doneSets.has(b.id)) - Number(doneSets.has(a.id)));
  const shown = allSets ? ordered : ordered.slice(0, CODEX_TOP);
  return (
    <div style={{ fontSize: 14 }}>
      <div style={{ fontSize: 13, color: PALETTE.inkSoft, margin: '0 0 4px' }}>
        세트 도감 {doneSets.size}/{SETS.length} · 반경 3칸 안에 다 모으면 완성, 2배·3배면 레벨 업
      </div>
      {shown.map((x) => (
        <div key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ width: 18, textAlign: 'center' }}>{doneSets.has(x.id) ? '★' : ' '}</span>
          <span>{x.name}</span>
          <span style={{ fontSize: 12, color: PALETTE.inkSoft }}>{x.requires.map((r) => `${nameOf(r.objectId)} ${r.count}`).join(' · ')} 모으면 {TARGET_LABEL[x.target]}</span>
        </div>
      ))}
      {ordered.length > CODEX_TOP && (
        <button data-testid="codex-sets-more" style={{ ...brownBtn, margin: '4px 0 6px', height: 44, fontSize: 14 }} onClick={() => setAllSets((v) => !v)}>
          {allSets ? '접기' : `나머지 ${ordered.length - CODEX_TOP}개 더 보기`}
        </button>
      )}
      <ContestCodex />{/* 대회: 트로피·우승 이력 */}
      <CornerCodex />
      <RecipeCodex />
      <TitleCodex />
    </div>
  );
}

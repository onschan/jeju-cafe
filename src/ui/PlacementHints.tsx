/**
 * 배치 안내 (video-patch §3.2): solver가 이미 낸 답을 배치 화면으로 끌어올린다.
 *
 * - `pickStrengths`   세 칸에 **서로 다른 강점**을 하나씩 (「① 전망 ② 길 옆 ③ 주방 곁」) — 같은 이유 세 개는 선택지가 아니다.
 * - `placementPicks`  고스트가 떠 있는 동안 그 시설의 **상위 3칸** — 1위 금색, 2·3위 연금색, 칸 위에 `+42만` 한 줄.
 *                     캐시가 있으면 `cachedMoves`의 `delta`로 숫자까지, 없으면 휴리스틱 순서로 **숫자 없는 회색 3칸**.
 *                     추천 칸은 보여 주기만 한다 — 탭하면 고스트가 그 칸으로 갈 뿐이고, 짓는 것은 ✓ 확정 버튼이다.
 *                     워커가 아직 안 끝났으면 `state: 'busy'` — 화면엔 「자리 보는 중…」 한 줄만 두고 절대 비우지 않는다.
 * - `betterSpot`      이미 놓은 시설에 「여기보다 좋은 자리 있음 · +38만」. 이득이 BETTER_SPOT_MIN 미만이면 **줄 자체를 안 그린다**.
 *
 * solver.ts·solverCache.ts는 읽기만 한다 — 여기서 조합만 한다.
 */
import type { GameState, Pt, SolverMove } from '../sim/index.ts';
import { cachedMoves, solverResult, canPlace, seatScore, isLineType, bestSeatCells, bestIndoorSeats, bestCornerCells, parcelAt, cellAt, PROTECTED_TYPES, seatStrengths, STRENGTH_LABEL, type SeatStrength } from '../sim/index.ts';
import { objectDef } from '../data/index.ts';
import { solverBusy } from './solverClient';
import { PALETTE } from './frame';

/** 몇 칸까지 보여 주나 */
export const PICK_COUNT = 3;
/** 평판 1점을 돈으로 본 값 (sim/solver.ts SOLVER_WEIGHTS.reputation과 같은 값) — 라벨을 돈으로 쓸지 평판으로 쓸지 가른다 */
export const REP_WORTH = 50_000;
/** 「여기보다 좋은 자리」 줄을 그리는 최소 이득 */
export const BETTER_SPOT_MIN = 300_000;
/** 워커를 기다리는 동안의 한 줄 */
export const PICK_BUSY_TEXT = '자리 보는 중…';

export type PickState = 'cache' | 'fallback' | 'busy';
export interface PlacePick { x: number; y: number; rank: number; /** 칸 위 한 줄 (없으면 숫자 없는 회색 칸) */ label: string | null }
export interface PlacePicks { picks: PlacePick[]; state: PickState }

/** 만 단위 반올림 (`+42만`). 1만에 못 미치면 null */
export function wanLabel(money: number): string | null {
  const wan = Math.round(money / 10_000);
  return wan >= 1 ? `+${wan}만` : null;
}
/** 칸 위 한 줄: 돈이 크면 `+42만`, 평판이 더 크면 `평판 +2`. 둘 다 작으면 null */
export function pickLabel(d: SolverMove['delta']): string | null {
  const rep = Math.round(d.reputation);
  if (rep >= 1 && d.reputation * REP_WORTH > d.money) return `평판 +${rep}`;
  return wanLabel(d.money);
}

/** 캐시가 없을 때의 휴리스틱 칸 — 좌석·명당 조각은 전용 휴리스틱, 나머지는 자리 점수 순 빈 칸 */
function heuristicCells(s: GameState, type: string, n: number): Pt[] {
  const d = objectDef(type);
  if (d.kind === 'seat') return d.indoor ? bestIndoorSeats(s, n) : bestSeatCells(s, n, type);
  const corner = bestCornerCells(s, type, n);
  if (corner.length > 0) return corner;
  const out: { p: Pt; sc: number }[] = [];
  for (let y = 0; y < s.grid.h; y++) for (let x = 0; x < s.grid.w; x++) {
    const c = cellAt(s, x, y);
    if (c.objectId || !parcelAt(s, x, y)?.owned) continue;
    if (!canPlace(s, type, x, y).ok) continue;
    out.push({ p: { x, y }, sc: seatScore(s, x, y) });
  }
  out.sort((a, b) => b.sc - a.sc || a.p.y - b.p.y || a.p.x - b.p.x);
  return out.slice(0, n).map((o) => o.p);
}

/** 이 시설을 놓을 추천 칸 3개. 캐시가 맞으면 숫자까지, 아니면 회색 3칸(또는 워커 대기). */
export function placementPicks(s: GameState, type: string, n = PICK_COUNT): PlacePicks {
  const moves = cachedMoves(s, (m) => m.action.type === 'place' && m.action.objectType === type);
  const picks: PlacePick[] = [];
  for (const m of moves) {
    if (m.action.type !== 'place') continue;
    const { x, y } = m.action;
    if (!canPlace(s, type, x, y).ok) continue; // 캐시를 만든 뒤 그 칸이 막혔을 수 있다
    picks.push({ x, y, rank: picks.length + 1, label: pickLabel(m.delta) });
    if (picks.length >= n) break;
  }
  if (picks.length > 0) return { picks, state: 'cache' };
  const busy = !solverResult(s) && solverBusy();
  const cells = heuristicCells(s, type, n).filter((p) => canPlace(s, type, p.x, p.y).ok);
  return { picks: cells.map((p, i) => ({ x: p.x, y: p.y, rank: i + 1, label: null })), state: busy ? 'busy' : 'fallback' };
}

/** 추천 칸이면 그 칸 (아니면 null). 탭은 **고스트만 옮긴다** — 짓기는 ✓ 확정뿐이라 실수로 지어지는 길이 없다. */
export function pickAt(picks: PlacePick[], x: number, y: number): PlacePick | null {
  return picks.find((p) => p.x === x && p.y === y) ?? null;
}

// ---------- 「여기보다 좋은 자리 있음」 ----------

/**
 * 옮겨서 더 버는 돈(추정). solver가 낸 「이 종류를 제일 좋은 빈 칸에 하나 더 놓을 때의 이득」을 그 칸의 자리 점수로 나누면
 * **자리 한 점의 값**이 나온다. 지금 자리와 추천 자리의 점수 차에 그 값을 곱한 것이 옮겨서 얻는 몫이다.
 * 점수가 같거나 낮으면 0 이하 — 줄이 안 그려진다.
 */
export function moveGain(deltaMoney: number, bestScore: number, nowScore: number): number {
  if (bestScore <= 0) return 0;
  return Math.round(deltaMoney * ((bestScore - nowScore) / bestScore));
}

export interface BetterSpot { x: number; y: number; gain: number }
/** 이 시설을 옮길 만한 더 좋은 칸 (이득이 BETTER_SPOT_MIN 미만이면 null) */
export function betterSpot(s: GameState, objectId: string): BetterSpot | null {
  const o = s.objects[objectId];
  if (!o || o.build || PROTECTED_TYPES.has(o.type)) return null;
  if (isLineType(o.type)) return null; // 길·담은 줄로 깔린다 — 한 칸을 옮기라는 말은 잔소리다
  const now = seatScore(s, o.x, o.y);
  for (const m of cachedMoves(s, (x) => x.action.type === 'place' && x.action.objectType === o.type)) {
    if (m.action.type !== 'place') continue;
    const { x, y } = m.action;
    if (x === o.x && y === o.y) continue;
    if (!canPlace(s, o.type, x, y, o.id).ok) continue;
    const gain = moveGain(m.delta.money, seatScore(s, x, y), now);
    if (gain >= BETTER_SPOT_MIN) return { x, y, gain };
    return null; // 1위 칸이 문턱을 못 넘으면 아래 칸은 볼 것도 없다
  }
  return null;
}

// ---------- 화면 ----------

/** 순위 칩 (①②③) */
const RANK_CHIP = ['①', '②', '③'] as const;
/**
 * 세 칸에 서로 다른 강점을 하나씩 (「① 전망 ② 길 옆 ③ 주방 곁」). 앞 칸이 가져간 강점은 뒤 칸이 다시 쓰지 않는다 —
 * 세 칸에 같은 이유를 달면 고를 거리가 없다(video-patch §2.4.4). 근거가 하나도 없는 칸은 순위만 남긴다.
 */
export function pickStrengths(s: GameState, type: string, picks: PlacePick[]): string[] {
  const cells = picks.map((p) => ({ x: p.x, y: p.y }));
  const used = new Set<SeatStrength>();
  const out: string[] = [];
  picks.forEach((p, i) => {
    const k = seatStrengths(s, { x: p.x, y: p.y }, cells, type).find((x) => !used.has(x));
    if (k) used.add(k);
    out.push(`${RANK_CHIP[i] ?? `${i + 1}`} ${k ? STRENGTH_LABEL[k] : '다음 자리'}`);
  });
  return out;
}

/** 배치 바 위 한 줄: 세 칸의 서로 다른 강점 / 워커를 기다리는 중인지. 빈 화면을 남기지 않는다. */
export function PlacementHintLine({ picks, bottom, state: s, type }: { picks: PlacePicks; bottom: number; state?: GameState; type?: string }) {
  const strengths = s && type && picks.picks.length > 0 ? pickStrengths(s, type, picks.picks).join(' ') : '';
  const text = picks.state === 'busy' ? PICK_BUSY_TEXT
    : picks.picks.length === 0 ? '놓을 만한 빈 칸이 없어요'
      : strengths || (picks.state === 'cache' ? `빛나는 칸 ${picks.picks.length}곳이 제일 낫다` : `빛나는 칸 ${picks.picks.length}곳이 좋아 보여요`);
  return (
    <div data-testid="placement-hint" style={{ position: 'absolute', left: 6, right: 6, bottom: `calc(${bottom}px + env(safe-area-inset-bottom))`, zIndex: 12, pointerEvents: 'none', background: PALETTE.paper, border: `2px solid ${PALETTE.wood}`, borderRadius: 6, padding: '2px 8px', fontSize: 13, fontWeight: 700, color: PALETTE.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {text}
    </div>
  );
}

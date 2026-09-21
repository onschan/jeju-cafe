/**
 * 도파민 측정 — 봇(src/sim/bot.ts의 botDay 루프)이 N년을 돌리는 동안 「보상 사건」을 매일 diff로 잡아 표로 낸다.
 * 사용: pnpm dopamine [years=3] [seed=1] [--player] [--md]
 *   --player : 봇 위에 얇은 플레이어 층(도전 과제 2슬롯 수락·게시판 이벤트 응답·응모권 뽑기)을 얹는다. 기본 봇은 도전을 안 받아 도파민이 과소평가된다.
 *   --md     : 문서에 붙이는 마크다운 표만 출력
 * 잡는 사건: 목표·도전·월간 과제·튜토리얼 보상(alerts reward), 시설/메뉴/직종/기능 해금, 랭크업·★, 이름 있는 손님 첫 등장, 특별 손님,
 *   빅 이벤트 발동, 게시판 이벤트(작은 이벤트) 제안, 부탁 완료, 레시피 개발(히든 포함), 콤보/세트/명당/재료 콤보 첫 발견, 뽑기 당첨/꽝,
 *   정착 등급·마을제, 라이벌 승리, 가이드북 1위, 월 매출 신기록, 명소 Lv업·방문객 상품, 손님층 해금, 칭호, 완공 장면, 투어 성공.
 * 부정 사건(실패 알림·도전 실패·★강등·악평)은 따로 센다. 결제 팝업(fx pop)은 하루 평균으로만 낸다.
 */
import type { GameState, Alert, FxEvent } from '../src/sim/types.ts';
import { createInitialState } from '../src/sim/state.ts';
import { botDay, newBotCursor } from '../src/sim/bot.ts';
import { apply } from '../src/sim/actions.ts';
import { offeredChallenges, canAcceptChallenge } from '../src/sim/challenges.ts';
import { canRespondEvent } from '../src/sim/board.ts';
import { canDrawTicket, hasFreeDraw } from '../src/sim/shop.ts';
import { monthIndex } from '../src/sim/clock.ts';

export type EventKind =
  | '목표' | '도전' | '월간과제' | '튜토리얼'
  | '해금·시설' | '해금·메뉴' | '해금·직종' | '해금·기능' | '해금·손님층' | '해금·가이드북'
  | '랭크업' | '★승급' | '손님·첫등장' | '손님·특별' | '이벤트·빅' | '이벤트·게시판' | '부탁완료'
  | '레시피' | '히든레시피' | '콤보첫발견' | '세트첫발견' | '명당첫발견' | '재료콤보'
  | '뽑기당첨' | '뽑기꽝' | '정착등급' | '마을제' | '라이벌승' | '가이드북1위' | '신기록' | '명소Lv' | '방문객상품' | '칭호' | '완공' | '투어성공';
export type NegKind = '실패알림' | '도전실패' | '★강등' | '악평' | '이벤트종료';

/** 사건 간 공백을 셀 때 빼는 것(플레이어가 직접 시킨 일의 완료·꽝) */
export const MINOR: EventKind[] = ['완공', '뽑기꽝', '이벤트·게시판'];

export interface RewardEvent { day: number; year: number; month: number; dom: number; kind: EventKind; what: string }
export interface NegEvent { day: number; kind: NegKind; what: string }

export interface DopamineResult {
  years: number; seed: number; player: boolean;
  events: RewardEvent[]; negs: NegEvent[];
  popPerDay: number;                // 결제 팝업(fx pop) 하루 평균
  monthly: { year: number; month: number; total: number; major: number; byKind: Partial<Record<EventKind, number>> }[];
  gaps: { from: number; to: number; days: number; fromDate: string; toDate: string }[]; // 주요 사건 사이 공백 (긴 순)
  maxGap: number; maxGapYear1: number;
  windows: Record<string, number>;  // 구간별 주요 사건 수
  byKind: Partial<Record<EventKind, number>>;
  byNeg: Partial<Record<NegKind, number>>;
  unlocks3y: number;                // 시설+메뉴+손님층+손님 첫 등장
  day1Share: number;                // 주요 사건 중 매월 1~2일에 몰린 비율
}

function dateOf(s: GameState): string { return `${s.clock.year}년 ${s.clock.month}월 ${s.clock.day}일`; }

/** 얇은 플레이어 층: 도전 2슬롯 채우기, 게시판 이벤트 수락, 응모권 있으면 뽑기 */
function playerLayer(s: GameState): void {
  for (const c of offeredChallenges(s)) if (s.challenges.active.length < 2 && canAcceptChallenge(s, c.id).ok) apply(s, { type: 'acceptChallenge', id: c.id });
  for (const e of s.board.events) if (canRespondEvent(s, e.id).ok) apply(s, { type: 'respondEvent', id: e.id, accept: true });
  if (!hasFreeDraw(s) && s.tickets >= 1 && canDrawTicket(s).ok && apply(s, { type: 'drawTicket' }).ok) apply(s, { type: 'dismissDraw' });
}

export function runDopamine(years: number, seed: number, player = false): DopamineResult {
  const s = createInitialState(seed);
  const cur = newBotCursor();
  const events: RewardEvent[] = [];
  const negs: NegEvent[] = [];
  let day = 0;
  let pops = 0;
  const push = (kind: EventKind, what: string) => events.push({ day, year: s.clock.year, month: s.clock.month, dom: s.clock.day, kind, what });
  const neg = (kind: NegKind, what: string) => negs.push({ day, kind, what });

  // alerts·fx는 봇이 바로 닫으므로 push를 가로채 기록한다
  const alertsArr = s.alerts as Alert[] & { push: (...a: Alert[]) => number };
  const origAlertPush = alertsArr.push.bind(alertsArr);
  alertsArr.push = (...items: Alert[]) => {
    for (const a of items) {
      if (a.type === 'reward') {
        const src = a.source === 'goal' ? '목표' : a.source === 'challenge' ? '도전' : a.source === 'monthly' ? '월간과제' : '튜토리얼';
        push(src, a.title);
      } else if (a.type === 'event') push('이벤트·빅', a.id);
      else if (a.type === 'eventEnd') neg('이벤트종료', a.id);
      else if (a.type === 'challengeFailed') neg('도전실패', a.id);
      else if (a.type === 'failure') { if (a.stage === 'demote') neg('★강등', 'demote'); else neg('실패알림', a.stage); }
      else if (a.type === 'reputation') neg('악평', 'reputation');
      else if (a.type === 'village') push('정착등급', `grade ${a.grade}`);
    }
    return origAlertPush(...items);
  };
  const fxArr = s.fx as FxEvent[] & { push: (...a: FxEvent[]) => number };
  const origFxPush = fxArr.push.bind(fxArr);
  fxArr.push = (...items: FxEvent[]) => {
    for (const f of items) {
      if (f.kind === 'pop') pops++;
      else if (f.kind === 'scene') {
        if (f.title === '완공') push('완공', f.text.slice(0, 30));
        else if (f.title === '명당') push('명당첫발견', f.text.slice(0, 30));
        else if (f.title === '가이드북 1위') push('가이드북1위', f.text.slice(0, 30));
        else if (f.title === '악평') neg('악평', f.text.slice(0, 30));
        // 랭크 업·★ 승급은 아래 diff로 (중복 방지)
      }
    }
    return origFxPush(...items);
  };
  // 결과 팝업(봇이 같은 틱에 닫는다)은 setter로 가로챈다
  const hookLast = <K extends 'lastDraw' | 'lastChallenge' | 'lastTour'>(key: K, on: (v: NonNullable<GameState[K]>) => void) => {
    let v = s[key];
    Object.defineProperty(s, key, { get: () => v, set: (nv) => { v = nv; if (nv) on(nv as NonNullable<GameState[K]>); }, enumerable: true, configurable: true });
  };
  hookLast('lastDraw', (d) => push(d.kind === 'miss' ? '뽑기꽝' : '뽑기당첨', d.label));
  hookLast('lastChallenge', (c) => { if (c.win) push('라이벌승', c.menuName); });
  hookLast('lastTour', (t) => { if (t.success) push('투어성공', t.spotId); });

  const snap = () => ({
    objects: s.unlocked.objects.length, menus: s.unlocked.menus.length, roles: s.unlocked.roles.length,
    features: Object.values(s.features).filter(Boolean).length,
    guestTypes: Object.values(s.guestTypes).filter((g) => g.unlocked).length,
    books: Object.values(s.guidebooks).filter((g) => g.unlocked).length,
    rank: s.rank, star: s.star,
    named: Object.entries(s.namedGuests).filter(([, g]) => g.met).map(([id]) => id),
    special: s.events.filter((e) => e.specialVisited).map((e) => e.id + '@' + e.startDay),
    boardEvents: s.board.events.map((e) => e.id),
    quests: Object.values(s.board.quests).filter((q) => q.status === 'done').length,
    recipes: s.stats.recipesMade, hidden: s.codex.recipes.length,
    combos: s.codex.combos.length, sets: s.codex.sets.length, spotsCodex: s.codex.spots.length, ingCombos: s.codex.ingredientCombos.length,
    festivals: s.village.festivals, titles: s.titles.length,
    spots: { ...s.spots }, prizes: Object.values(s.spotPrizes).reduce((a, b) => a + b, 0),
    income: s.lastMonthCard?.income ?? 0,
  });
  let before = snap();
  let bestIncome = 0;
  let monthsSeen = 0;

  const totalDays = years * 12 * 30;
  for (day = 0; day < totalDays; day++) {
    if (player) playerLayer(s);
    botDay(s, cur, (card) => {
      monthsSeen++;
      if (monthsSeen > 1 && card.income > bestIncome) push('신기록', `월 매출 ₩${card.income.toLocaleString('en-US')}`);
      bestIncome = Math.max(bestIncome, card.income);
    });
    const after = snap();
    if (after.objects > before.objects) push('해금·시설', s.unlocked.objects.slice(before.objects).join(','));
    if (after.menus > before.menus) push('해금·메뉴', s.unlocked.menus.slice(before.menus).join(','));
    if (after.roles > before.roles) push('해금·직종', s.unlocked.roles.slice(before.roles).join(','));
    if (after.features > before.features) push('해금·기능', `+${after.features - before.features}`);
    if (after.guestTypes > before.guestTypes) push('해금·손님층', `+${after.guestTypes - before.guestTypes}`);
    if (after.books > before.books) push('해금·가이드북', `+${after.books - before.books}`);
    if (after.rank > before.rank) push('랭크업', `랭크 ${after.rank}`);
    if (after.star > before.star) push('★승급', `★${after.star}`);
    for (const id of after.named) if (!before.named.includes(id)) push('손님·첫등장', id);
    for (const id of after.special) if (!before.special.includes(id)) push('손님·특별', id);
    for (const id of after.boardEvents) if (!before.boardEvents.includes(id)) push('이벤트·게시판', id);
    if (after.quests > before.quests) push('부탁완료', `+${after.quests - before.quests}`);
    if (after.recipes > before.recipes) push('레시피', `+${after.recipes - before.recipes}`);
    if (after.hidden > before.hidden) push('히든레시피', s.codex.recipes.slice(before.hidden).join(','));
    if (after.combos > before.combos) push('콤보첫발견', s.codex.combos.slice(before.combos).join(','));
    if (after.sets > before.sets) push('세트첫발견', s.codex.sets.slice(before.sets).join(','));
    if (after.ingCombos > before.ingCombos) push('재료콤보', s.codex.ingredientCombos.slice(before.ingCombos).join(','));
    if (after.festivals > before.festivals) push('마을제', `${after.festivals}회`);
    if (after.titles > before.titles) push('칭호', s.titles.slice(before.titles).join(','));
    for (const [id, lv] of Object.entries(after.spots)) if (lv > (before.spots[id] ?? 0)) push('명소Lv', `${id} Lv${lv}`);
    if (after.prizes > before.prizes) push('방문객상품', `+${after.prizes - before.prizes}`);
    before = after;
  }

  // 집계
  const major = events.filter((e) => !MINOR.includes(e.kind));
  const monthly: DopamineResult['monthly'] = [];
  const startMi = monthIndex(createInitialState(seed).clock);
  for (let m = 0; m < years * 12; m++) {
    const mi = startMi + m;
    const year = Math.floor(mi / 12) + 1, month = (mi % 12) + 1;
    const es = events.filter((e) => e.year === year && e.month === month);
    const byKind: Partial<Record<EventKind, number>> = {};
    for (const e of es) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    monthly.push({ year, month, total: es.length, major: es.filter((e) => !MINOR.includes(e.kind)).length, byKind });
  }
  const day1Share = major.length ? major.filter((e) => e.dom <= 2).length / major.length : 0;
  const majorDays = [...new Set(major.map((e) => e.day))].sort((a, b) => a - b);
  const gaps: DopamineResult['gaps'] = [];
  const startMi0 = monthIndex(createInitialState(seed).clock);
  const fmt = (d: number) => { const mi = startMi0 + Math.floor(d / 30); return `${Math.floor(mi / 12) + 1}년 ${(mi % 12) + 1}월 ${(d % 30) + 1}일`; };
  let prev = 0;
  for (const d of [...majorDays, totalDays]) { if (d - prev > 1) gaps.push({ from: prev, to: d, days: d - prev, fromDate: fmt(prev), toDate: fmt(Math.min(d, totalDays - 1)) }); prev = d; }
  gaps.sort((a, b) => b.days - a.days);
  const maxGap = gaps[0]?.days ?? 0;
  const maxGapYear1 = Math.max(0, ...gaps.filter((g) => g.from < 360).map((g) => Math.min(g.to, 360) - g.from));
  const count = (from: number, to: number) => major.filter((e) => e.day >= from && e.day < to).length;
  const windows = { '1일': count(0, 1), '6일': count(0, 6), '10분(3배속 50일)': count(0, 50), '1개월': count(0, 30), '1년': count(0, 360), '3년': count(0, 1080), [`${years}년`]: count(0, totalDays) };
  const byKind: Partial<Record<EventKind, number>> = {};
  for (const e of events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  const byNeg: Partial<Record<NegKind, number>> = {};
  for (const e of negs) byNeg[e.kind] = (byNeg[e.kind] ?? 0) + 1;
  const unlocks3y = events.filter((e) => e.day < 1080 && ['해금·시설', '해금·메뉴', '해금·손님층', '손님·첫등장'].includes(e.kind)).reduce((a, e) => a + (e.what.startsWith('+') ? Number(e.what.slice(1)) : e.what.split(',').length), 0);
  return { years, seed, player, events, negs, popPerDay: pops / totalDays, monthly, gaps: gaps.slice(0, 8), maxGap, maxGapYear1, windows, byKind, byNeg, unlocks3y, day1Share };
}

export function toMarkdown(r: DopamineResult): string {
  const L: string[] = [];
  L.push(`### 봇 ${r.years}년 · seed ${r.seed}${r.player ? ' · --player(도전 수락·게시판 응답·뽑기)' : ' · 기본 봇'}`);
  L.push('');
  L.push('| 구간 | 주요 사건 수 |'); L.push('|---|---|');
  for (const [k, v] of Object.entries(r.windows)) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push(`- 주요 사건 총 ${r.events.filter((e) => !MINOR.includes(e.kind)).length} (전체 ${r.events.length}, 완공·꽝·게시판 제외) · 월 평균 ${(r.events.filter((e) => !MINOR.includes(e.kind)).length / (r.years * 12)).toFixed(1)} · 1년차 월 평균 ${((r.windows['1년'] ?? 0) / 12).toFixed(1)}`);
  L.push(`- 사건 간 최대 공백 ${r.maxGap}일 (1년차 안 ${r.maxGapYear1}일) · 해금(시설·메뉴·손님층·손님 첫 등장) 3년 ${r.unlocks3y} · 주요 사건의 ${(r.day1Share * 100).toFixed(0)}%가 매월 1~2일에 몰림`);
  L.push(`- 부정 사건: ${Object.entries(r.byNeg).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'}`);
  L.push('');
  L.push('긴 공백 TOP 8:');
  L.push('');
  L.push('| 공백(일) | 부터 | 까지 |'); L.push('|---|---|---|');
  for (const g of r.gaps) L.push(`| ${g.days} | ${g.fromDate} | ${g.toDate} |`);
  L.push('');
  L.push('종류별 합계:');
  L.push('');
  L.push('| 종류 | 수 |'); L.push('|---|---|');
  for (const [k, v] of Object.entries(r.byKind).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} |`);
  L.push('');
  L.push('월별 사건 수 (주요/전체 · 주요 종류):');
  L.push('');
  L.push('| 연 | 월 | 주요 | 전체 | 내역 |'); L.push('|---|---|---|---|---|');
  for (const m of r.monthly) {
    const det = Object.entries(m.byKind).filter(([k]) => !MINOR.includes(k as EventKind)).map(([k, v]) => `${k}${v > 1 ? `×${v}` : ''}`).join(' ');
    L.push(`| ${m.year} | ${m.month} | ${m.major} | ${m.total} | ${det} |`);
  }
  return L.join('\n');
}

const isMain = process.argv[1]?.endsWith('dopamine.ts');
if (isMain) {
  const args = process.argv.slice(2);
  const nums = args.filter((a) => !a.startsWith('--')).map(Number);
  const years = nums[0] ?? 3;
  const seed = nums[1] ?? 1;
  const player = args.includes('--player');
  const md = args.includes('--md');
  const r = runDopamine(years, seed, player);
  if (md) { console.log(toMarkdown(r)); }
  else {
    console.log(toMarkdown(r));
    console.log('\n첫 60일 사건 타임라인:');
    for (const e of r.events.filter((e) => e.day < 60)) console.log(`  ${e.year}년 ${e.month}월 ${e.dom}일  ${e.kind}  ${e.what}`);
  }
}

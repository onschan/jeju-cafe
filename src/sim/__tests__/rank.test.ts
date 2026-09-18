import { bareState } from './helpers.ts';
import { X, Y } from './helpers.ts';
import { createInitialState } from '../state.ts';
import { emptyMonthHarvest } from '../orchard.ts';
import { apply } from '../actions.ts';
import { tick } from '../tick.ts';
import { DAY_MS } from '../clock.ts';
import { placeObject } from '../grid.ts';
import { setSlot } from '../menu.ts';
import { unlockGuestType } from '../segments.ts';
import { rankScore, rankForScore, nextRankThreshold, facilityCount, updateRank, RANK_THRESHOLDS, MAX_RANK, GUESTS_PER_POINT } from '../rank.ts';
import {
  starConditionMet, nextStarConditions, checkStar, judgeScores, guidebookScore, evaluateGuidebooks, guidebooksToAnnounce, announce, rivalScores, rankAmong, monthlyTarget, codexTotal,
  MAX_STAR, RIVAL_COUNT, PRIZE_RATIO, RANK_MILEAGE, MONTHLY_TAGS, JUDGE_KEYS,
} from '../guidebook.ts';
import { GUIDEBOOKS, STARS, guidebookDef, GUEST_TYPES } from '../../data/index.ts';
import type { GameState } from '../types.ts';

test('데이터: 가이드북 11 (해금·가중치 합 1·상금), ★ 5단계 조건', () => {
  expect(GUIDEBOOKS).toHaveLength(11);
  for (const g of GUIDEBOOKS) {
    const sum = Object.values(g.weights).reduce((n, w) => n + w, 0);
    expect(sum, g.id).toBeCloseTo(g.monthly ? 0.5 : 1, 5);
    expect(g.prize).toBeGreaterThan(0);
  }
  expect(guidebookDef('gb_kind_cafe').unlock).toEqual({ type: 'start' });
  expect(guidebookDef('gb_dessert').unlock).toEqual({ type: 'category', category: 'food', count: 5 });
  expect(guidebookDef('gb_together').unlock).toEqual({ type: 'segmentPop', guestId: 'rentcar_family', popularity: 40 });
  expect(guidebookDef('gb_ribbon_survey').unlock).toEqual({ type: 'star', star: 4 });
  expect(STARS.map((s) => s.star)).toEqual([1, 2, 3, 4, 5]);
  expect(MAX_STAR).toBe(5);
  expect(codexTotal()).toBeGreaterThan(0);
});

test('랭크 점수·문턱: 누적 손님/50 + 시설×2 + 해금 손님층×5, 길·돌담·본관은 시설로 안 센다', () => {
  const s = bareState(1);
  expect(facilityCount(s)).toBe(0);
  expect(rankScore(s)).toBe(3 * 5); // 시작 손님층 3
  placeObject(s, 'path', X(4), Y(5));
  placeObject(s, 'table_out', X(6), Y(4));
  expect(facilityCount(s)).toBe(1);
  s.totalGuests = 623;
  expect(rankScore(s)).toBe(12 + 2 + 15);
  expect(rankForScore(0)).toBe(1);
  expect(rankForScore(RANK_THRESHOLDS[1]!)).toBe(2);
  expect(rankForScore(RANK_THRESHOLDS[MAX_RANK - 1]!)).toBe(MAX_RANK);
  expect(nextRankThreshold(s)).toBe(RANK_THRESHOLDS[1]);
  s.totalGuests = 100_000;
  expect(updateRank(s)).toBe(true);
  expect(s.rank).toBe(MAX_RANK);
  expect(nextRankThreshold(s)).toBeNull();
  expect(s.notices.at(-1)).toContain(`랭크 ${MAX_RANK}`);
  expect(s.fx.some((f) => f.kind === 'scene' && f.title === '랭크 업')).toBe(true);
});

test('랭크 2에 오르면 랭크 해금 시설(실내 테이블·주차장)과 손님(렌터카 가족)이 열린다', () => {
  const s = bareState(1);
  s.totalGuests = RANK_THRESHOLDS[1]! * GUESTS_PER_POINT;
  tick(s, DAY_MS); // 월초 evaluateUnlocks는 다음 달이지만 place 뒤에도 돈다
  placeObject(s, 'table_out', X(6), Y(4));
  apply(s, { type: 'place', objectType: 'path', x: X(4), y: Y(5) });
  expect(s.rank).toBe(2);
  expect(s.unlocked.objects).toContain('table_in');
  expect(s.unlocked.objects).toContain('parking');
  expect(s.guestTypes['rentcar_family']!.unlocked).toBe(true);
});

function richState(): GameState {
  const s = bareState(1);
  s.lastMonthCard = { income: 400_000, guests: 100, month: 3, year: 1, costs: { ingredients: 0, salary: 0, ads: 0, upkeep: 0, recruit: 0 }, net: 400_000, ...emptyMonthHarvest(), topMenu: null };
  s.lastMonthIncome = 400_000;
  return s;
}

test('★ 조건 "월 매출"은 결산 카드를 닫아도 지난달 매출로 판정한다', () => {
  const s = richState();
  expect(apply(s, { type: 'dismissMonthCard' }).ok).toBe(true);
  expect(s.lastMonthCard).toBeNull();
  expect(starConditionMet(s, '월 매출 100,000')).toBe(true);
});

test('★ 조건 문구 해석: 월 매출·메뉴·직원·손님층 만족·시그니처·랜드마크·랭킹 1위·도감%·정착 등급, 모르는 문구는 false', () => {
  const s = richState();
  expect(starConditionMet(s, '월 매출 100,000')).toBe(true);
  expect(starConditionMet(s, '월 매출 800,000')).toBe(false);
  expect(starConditionMet(s, '메뉴 3')).toBe(true); // v3 시작 메뉴 3 (아메리카노·라떼·감귤주스)
  expect(starConditionMet(s, '메뉴 4')).toBe(false);
  expect(starConditionMet(s, '직원 1')).toBe(false);
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 10, strength: 10, skill: 10, smile: 50 }, skill: 'none', level: 1, salary: 0, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  expect(starConditionMet(s, '직원 1')).toBe(true);
  expect(starConditionMet(s, '손님층 4 만족 30')).toBe(false);
  for (const id of GUEST_TYPES.slice(0, 4).map((t) => t.id)) { unlockGuestType(s, id); s.guestTypes[id]!.satisfaction = 30; }
  expect(starConditionMet(s, '손님층 4 만족 30')).toBe(true);
  expect(starConditionMet(s, '시그니처 1')).toBe(false);
  expect(starConditionMet(s, '랜드마크 2')).toBe(false);
  expect(starConditionMet(s, '랭킹 1위')).toBe(false);
  s.guidebooks['gb_kind_cafe']!.best = 1;
  expect(starConditionMet(s, '랭킹 1위')).toBe(true);
  expect(starConditionMet(s, '도감 80%')).toBe(false);
  expect(starConditionMet(s, '정착 등급 6')).toBe(false);
  s.totalIncome = 1_000_000_000;
  expect(starConditionMet(s, '정착 등급 6')).toBe(true);
  expect(starConditionMet(s, '천하제일')).toBe(false);
});

test('★ 승급: 다음 ★ 조건을 다 채우면 월초 검사에서 한 단계 오르고 알림·장면·★ 해금 시설(카운터·주방 증축)', () => {
  const s = richState();
  expect(nextStarConditions(s)!.star).toBe(2);
  expect(nextStarConditions(s)!.conditions.map((c) => c.text)).toEqual(['월 매출 300,000', '메뉴 15', '손님층 4 만족 30']);
  expect(checkStar(s)).toBeNull(); // 메뉴 3·손님층 만족 0
  for (let i = 0; i < 12; i++) s.unlocked.menus.push(`m${i}`); // 3 + 12 = 15
  for (const id of GUEST_TYPES.slice(0, 4).map((t) => t.id)) { unlockGuestType(s, id); s.guestTypes[id]!.satisfaction = 30; }
  expect(nextStarConditions(s)!.conditions.every((c) => c.met)).toBe(true);
  expect(checkStar(s)).toBe(2);
  expect(s.star).toBe(2);
  expect(s.notices.some((n) => n.includes('★2 승급'))).toBe(true);
  expect(s.fx.some((f) => f.kind === 'scene' && f.title === '★2 승급')).toBe(true);
  expect(s.unlocked.objects).toContain('counter');
  expect(s.unlocked.objects).toContain('kitchen_ext');
  // ★3: 월 매출 80만·시그니처 1·직원 4 — 아직
  expect(checkStar(s)).toBeNull();
  s.star = MAX_STAR;
  expect(nextStarConditions(s)).toBeNull();
});

test('심사 점수는 모두 0~100이고 같은 상태면 같은 값(결정적), 직원·좌석이 생기면 미소·경관이 오른다', () => {
  const s = bareState(1);
  const a = judgeScores(s);
  for (const k of JUDGE_KEYS) { expect(a[k]).toBeGreaterThanOrEqual(0); expect(a[k]).toBeLessThanOrEqual(100); }
  expect(a.scenery).toBe(0);
  expect(judgeScores(s)).toEqual(a);
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 10, strength: 10, skill: 10, smile: 80 }, skill: 'none', level: 1, salary: 0, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  placeObject(s, 'table_out', X(6), Y(4));
  placeObject(s, 'tangerine_tree', X(7), Y(4));
  setSlot(s, 0, 'americano');
  const b = judgeScores(s);
  expect(b.smile).toBeGreaterThan(a.smile);
  expect(b.scenery).toBeGreaterThan(0);
  expect(b.menu).toBeGreaterThan(0);
  expect(b.overall).toBe(Math.round((b.smile + b.scenery + b.menu + b.fun + b.group) / 5));
  // 가중 합
  expect(guidebookScore(s, guidebookDef('gb_local_map'), b)).toBe(b.overall);
  expect(guidebookScore(s, guidebookDef('gb_kind_cafe'), b)).toBe(Math.round(b.smile * 0.8 + b.overall * 0.2));
  // 월간 추천: 타깃 태그가 monthIndex로 돈다
  expect(MONTHLY_TAGS.map((t) => t.key)).toContain(monthlyTarget(s).key);
});

test('경쟁 카페 9곳: seed·가이드북·년차로 결정적, 년차가 오르면 세다, 순위 = 나보다 높은 곳 + 1', () => {
  const r1 = rivalScores(1, 'gb_kind_cafe', 1, 9);
  expect(r1).toHaveLength(RIVAL_COUNT);
  expect(r1).toEqual(rivalScores(1, 'gb_kind_cafe', 1, 9));
  expect(r1).not.toEqual(rivalScores(2, 'gb_kind_cafe', 1, 9));
  expect([...r1].sort((a, b) => b - a)).toEqual(r1);
  const avg = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
  expect(avg(rivalScores(1, 'gb_kind_cafe', 3, 9))).toBeGreaterThan(avg(r1));
  expect(avg(rivalScores(1, 'gb_ribbon_survey', 1, 9))).toBeGreaterThan(avg(r1));
  for (const r of r1) { expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(100); }
  expect(rankAmong(101, r1)).toBe(1);
  expect(rankAmong(-1, r1)).toBe(RIVAL_COUNT + 1);
});

test('가이드북 해금: 시작은 친절 카페만, 1년 7월에 동네 맛집 지도, 먹거리 5개면 미식 카페', () => {
  const s = bareState(1);
  expect(s.guidebooks['gb_kind_cafe']!.unlocked).toBe(true);
  expect(s.guidebooks['gb_local_map']!.unlocked).toBe(false);
  expect(evaluateGuidebooks(s)).toEqual([]);
  s.clock.month = 7;
  expect(evaluateGuidebooks(s)).toEqual(['gb_local_map']);
  s.money = 1e9;
  s.unlocked.objects.push('vending');
  for (let i = 0; i < 5; i++) placeObject(s, 'hallabong_stand', X(i), Y(2));
  expect(evaluateGuidebooks(s)).toEqual(['gb_dessert']);
});

test('발표: 3·9월에 해금된 가이드북을 채점해 순위·상금·연구·마일리지·씨앗(1위), best 갱신, lastAnnouncement', () => {
  const s = bareState(1);
  s.clock.month = 9;
  expect(guidebooksToAnnounce(s).map((g) => g.id)).toEqual(['gb_kind_cafe']);
  s.clock.month = 4;
  expect(guidebooksToAnnounce(s)).toEqual([]);
  s.guidebooks['gb_coop_monthly']!.unlocked = true;
  expect(guidebooksToAnnounce(s).map((g) => g.id)).toEqual(['gb_coop_monthly']);
  s.clock.month = 9;
  // 1위를 만들어 보상 확인: 심사 점수를 넘어서도록 강한 직원
  s.staff.push({ id: 's1', name: 'a', face: { hair: 0, skin: 0, top: 0 }, stats: { stamina: 99, strength: 99, skill: 99, smile: 99 }, skill: 'none', level: 1, salary: 0, role: 'hall', unpaidMonths: 0, energy: 100, lastParttimeMonthIndex: -1, x: 0, y: 0, path: [], anchor: null, waitMs: 0 });
  const money = s.money, research = s.research, mileage = s.mileage;
  const a = announce(s, [guidebookDef('gb_kind_cafe')])!;
  expect(a.entries).toHaveLength(1);
  const e = a.entries[0]!;
  expect(e.rank).toBe(rankAmong(e.total, e.rivals));
  expect(s.guidebooks['gb_kind_cafe']!.lastRank).toBe(e.rank);
  expect(s.guidebooks['gb_kind_cafe']!.best).toBe(e.rank);
  const ratio = PRIZE_RATIO[e.rank - 1] ?? 0;
  expect(e.prize).toBe(Math.round(100_000 * ratio));
  expect(s.money - money).toBe(e.prize);
  expect(s.research - research).toBe(Math.round(100 * ratio));
  expect(s.mileage - mileage).toBe(RANK_MILEAGE[e.rank - 1] ?? 0);
  expect(s.lastAnnouncement).toBe(a);
  expect(apply(s, { type: 'dismissAnnouncement' }).ok).toBe(true);
  expect(s.lastAnnouncement).toBeNull();
  // 발표가 없는 달은 null
  expect(announce(s, [])).toBeNull();
});

test('발표 시점: 9월 1일 월초에 lastAnnouncement가 생기고, 다른 달엔 생기지 않는다 (월간 추천은 매월)', () => {
  const s = bareState(2);
  s.clock.month = 8;
  s.clock.day = 30;
  s.clock.hour = 23;
  tick(s, DAY_MS);
  expect(s.clock.month).toBe(9);
  expect(s.lastAnnouncement).not.toBeNull();
  expect(s.lastAnnouncement!.month).toBe(9);
  expect(s.lastAnnouncement!.entries.map((e) => e.id)).toEqual(['gb_kind_cafe', 'gb_local_map']); // 동네 맛집 지도는 1년 7월 해금
  apply(s, { type: 'dismissAnnouncement' });
  for (let d = 0; d < 31; d++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(10);
  expect(s.lastAnnouncement).toBeNull();
  s.guidebooks['gb_coop_monthly']!.unlocked = true;
  for (let d = 0; d < 31; d++) tick(s, DAY_MS);
  expect(s.clock.month).toBe(11);
  expect(s.lastAnnouncement!.entries.map((e) => e.id)).toEqual(['gb_coop_monthly']);
  expect(s.lastAnnouncement!.entries[0]!.targetText).not.toBeNull();
});

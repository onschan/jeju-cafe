/**
 * 우리 카페 진단 (ui3: 전략 피드백).
 * 주 1회(매월 1·8·15·22일) 기준으로 지금 운영을 3줄로 평가하고, 가장 큰 병목 1개 + 다음 수 2개를 낸다.
 * 새 시뮬을 돌리지 않는다 — 이미 있는 자산만 조합한다:
 *   매력도 3지표(appealOf) · 좌석 이용률(seatUseRate) · 대기 이탈(monthGuestsLeft) · 불만 TOP(topComplaints)
 *   · 직원 구성(staff) · 청결(clean) · 메뉴 슬롯 · 지난달 순이익(lastMonthCard) · 배치 점수(호출자가 넣어 준다)
 * 직원 병목은 채용 화면(StaffWindow)과 같은 함수 staffPlan.roleNeeds(roleHeads 인분 환산)를 그대로 인용한다 —
 * 진단과 「지금 필요해요」가 다른 직종을 가리키면 안 된다.
 * 결정적: rng·Date를 안 쓴다. 상태를 바꾸지 않는다(순수 함수).
 */
import type { GameState, ObjectDef, RoleId } from './types.ts';
import { OBJECTS, objectDef } from '../data/index.ts';
import { appealOf, cafeScenery, POPULARITY_LOW } from './appeal.ts';
import { seatUseRate, SEAT_USE_BOTTLENECK, SCENERY_BOTTLENECK } from './tree.ts';
import { totalSeats, seatsNeeded, GUESTS_PER_SEAT } from './guests.ts';
import { topComplaints } from './reputation.ts';
import { CLEAN_LOW } from './cleanliness.ts';
import { staffInRole } from './staff.ts';
import { roleNeeds, type RoleNeed } from './staffPlan.ts'; // 통합: 직원 병목은 채용 화면과 같은 판정(roleHeads 인분)을 그대로 쓴다
import { unreachableCount } from './reach.ts';
import { josa } from './josa.ts';

/** 진단이 새로 나오는 날 (매월 1·8·15·22일) */
export const CHECKUP_DAYS = [1, 8, 15, 22] as const;
/** 노선으로 쳐 주는 최소 점수 — 이보다 낮으면 「아직 색이 없어요」 */
export const ROUTE_MIN = 3;

export function isCheckupDay(s: GameState): boolean {
  return (CHECKUP_DAYS as readonly number[]).includes(s.clock.day);
}
/** 오늘까지 지나온 가장 최근 진단일 (월 1일 이전이 없으므로 늘 있다) */
export function lastCheckupDay(day: number): number {
  let out: number = CHECKUP_DAYS[0];
  for (const d of CHECKUP_DAYS) if (d <= day) out = d;
  return out;
}
/** 진단이 바뀌는 시점 키 — UI가 「새 진단이 나왔어요」를 한 번만 알리는 데 쓴다 */
export function checkupKey(s: GameState): string {
  return `${s.clock.year}-${s.clock.month}-${lastCheckupDay(s.clock.day)}`;
}

export type BottleneckKey = 'unreachable' | 'seat' | 'service' | 'popularity' | 'scenery' | 'clean' | 'menu' | 'money' | 'none';
export type CoachRouteId = 'tourist' | 'regular' | 'contest' | 'none';

export interface Diagnosis {
  /** 진단 기준일 문구 ("9월 15일") */
  dateText: string;
  /** 현재 상태 3줄 (규모 · 잘 되는 것 · 걸리는 것) */
  lines: [string, string, string];
  bottleneck: { key: BottleneckKey; text: string };
  /** 다음 수 2개 (명사구) */
  moves: [string, string];
  route: { id: CoachRouteId; name: string; line: string; next: string };
  /** 손님이 못 가는 시설 수 (0이면 줄을 안 그린다) */
  unreachable: number;
  /** 탭하면 펼치는 근거 수치 */
  evidence: { label: string; value: string }[];
  /** 월말 결산용 총평 한 줄 (등급 총평과 겹치지 않게 노선+다음 수로 만든다) */
  summary: string;
}

export interface CoachInput {
  /** 배치 점수 0~100 (ui/layoutScore.ts) — 없으면 근거 줄에서 빠진다 */
  layout?: number | null;
  /** solver 1위 수 문구 — 없으면 근거 줄에서 빠진다 */
  topMove?: string | null;
}

const ROUTE_NAME: Record<CoachRouteId, string> = { tourist: '관광객형', regular: '단골형', contest: '대회형', none: '아직 색이 없어요' };
const ROUTE_LINE: Record<CoachRouteId, string> = {
  tourist: '경치를 보러 오는 손님이 많아요',
  regular: '다시 오는 손님이 카페를 받쳐요',
  contest: '대회 성적이 간판을 올려요',
  none: '아직 색이 없어요 — 하나를 밀어 보세요',
};
const ROUTE_NEXT: Record<CoachRouteId, string> = {
  tourist: '전망 좋은 자리와 정원',
  regular: '단골이 좋아하는 메뉴 한 종',
  contest: '시그니처 메뉴와 연수',
  none: '경관·단골·대회 중 하나',
};
const ROLE_NAME: Record<RoleId, string> = { barista: '바리스타', cook: '조리', hall: '홀', clean: '청소' };
/** 진단 「다음 수」에 쓰는 직종 이름 (채용 화면과 같은 말) */
const ROLE_HIRE: Record<RoleId, string> = { barista: '바리스타 1명', cook: '요리사 1명', hall: '홀 직원 1명', clean: '청소 직원 1명' };

/** 열려 있는 것 중 가장 싼 시설 이름 (없으면 기본 문구) */
function cheapestName(s: GameState, pick: (d: ObjectDef) => boolean, fallback: string): string {
  let best: ObjectDef | null = null;
  for (const id of s.unlocked.objects) {
    let d: ObjectDef;
    try { d = objectDef(id); } catch { continue; }
    if (!pick(d) || d.indoor) continue;
    if (!best || d.cost < best.cost) best = d;
  }
  return best?.name ?? fallback;
}
const seatName = (s: GameState) => cheapestName(s, (d) => d.kind === 'seat', '야외 자리');
const sceneryName = (s: GameState) => cheapestName(s, (d) => d.scenery > 0 && d.kind !== 'seat', '정원');
const popName = (s: GameState) => cheapestName(s, (d) => d.kind === 'facility' && (d.popularity ?? 0) > 0, '편의 시설');

/** 열린 시설 중 한 종류라도 있나 (없는 종류를 권하지 않게) */
function hasUnlocked(s: GameState): boolean {
  return s.unlocked.objects.length > 0 && OBJECTS.length > 0;
}

/** 노선 점수: 경관·관광객 축 / 단골 수 / 대회 이력 */
function routeOf(s: GameState, scenery: number): CoachRouteId {
  const tourist = scenery / 2 + Math.max(0, s.popularity) / 20;
  const regularN = (s.regulars?.length ?? 0) + Object.values(s.guestTypes).filter((g) => g.regular === 'vip').length * 2;
  const regular = regularN;
  const history = s.contest?.history ?? [];
  const contest = history.length * 2 + history.filter((h) => h.rank === 1).length * 3;
  const best = Math.max(tourist, regular, contest);
  if (best < ROUTE_MIN) return 'none';
  return best === contest ? 'contest' : best === regular ? 'regular' : 'tourist';
}

/** 직원 병목이 하나뿐일 때 두 번째로 권할 수 (직종마다 그 직종이 막힌 이유를 푸는 수) */
function roleBackupMove(s: GameState, need: RoleNeed): string {
  if (need.role === 'barista') return '메뉴 올리기';
  if (need.role === 'cook') return '주방 넓히기';
  if (need.role === 'hall') return `${seatName(s)} 1개`;
  return '낡은 시설 수리';
}

/** 가장 큰 병목 1개 + 다음 수 2개 */
function bottleneckOf(s: GameState, m: { seatUse: number; left: number; pop: number; scenery: number; staffN: number; menuLeft: number; clean: number; net: number; unreachable: number; needs: RoleNeed[] }): { key: BottleneckKey; text: string; moves: [string, string] } {
  const top = topComplaints(s, 1)[0];
  // midgame: 「자리 몇 개?」를 수요에서 역산한다 — 대기 이탈이 있으면 이탈 인원분, 없으면 오늘 손님 기준 모자란 수
  const seatNeed = seatsNeeded(s);
  const add = Math.max(seatNeed.short, Math.ceil(m.left / GUESTS_PER_SEAT));
  // 아무리 좋은 시설도 손님이 못 가면 0이다 — 가장 먼저 본다
  if (m.unreachable > 0) return { key: 'unreachable', text: `손님이 못 가는 시설이 ${m.unreachable}개 있어요`, moves: ['올렛길 잇기', '끊긴 시설 옮기기'] };
  if (m.left > 0 || m.seatUse >= SEAT_USE_BOTTLENECK) {
    const text = m.left > 0 ? `자리 ${Math.max(1, add)}개가 모자라요 (대기 이탈 ${m.left}명)` : `자리가 거의 꽉 찼어요 (지금 손님엔 ${seatNeed.now}개)`;
    return { key: 'seat', text, moves: [`${seatName(s)} ${Math.min(4, Math.max(1, add))}개`, ROLE_HIRE.hall] };
  }
  if (m.staffN === 0) return { key: 'service', text: '직원이 없어 서빙이 안 돼요', moves: [ROLE_HIRE.hall, ROLE_HIRE.barista] };
  // 통합: 직원 병목은 채용 화면의 「지금 필요해요」와 같은 판정을 인용한다 (roleHeads 인분 환산 — 말이 갈리지 않게)
  const need = m.needs[0];
  if (need) {
    const second = m.needs[1] ? ROLE_HIRE[m.needs[1]!.role] : roleBackupMove(s, need);
    return { key: need.role === 'clean' ? 'clean' : 'service', text: need.why, moves: [ROLE_HIRE[need.role], second] };
  }
  if (top?.reason === 'wait_long') return { key: 'service', text: `주문이 밀려 손님이 기다려요 (불만 ${top.count}건)`, moves: [ROLE_HIRE.hall, '주방 넓히기'] };
  if (m.clean < CLEAN_LOW) return { key: 'clean', text: `가게가 지저분해요 (청결 ${Math.round(m.clean)})`, moves: [ROLE_HIRE.clean, '낡은 시설 수리'] };
  if (m.menuLeft > 0) return { key: 'menu', text: `메뉴판 빈 칸이 ${m.menuLeft}개 있어요`, moves: ['메뉴 올리기', '디저트 한 종'] };
  if (m.pop < POPULARITY_LOW && hasUnlocked(s)) return { key: 'popularity', text: `가게를 아는 사람이 적어요 (인기 ${m.pop})`, moves: [`${popName(s)} 1개`, '전단 홍보 1회'] };
  if (m.scenery < SCENERY_BOTTLENECK) return { key: 'scenery', text: `관광객 눈에 띌 게 없어요 (경관 ${Math.round(m.scenery * 10) / 10})`, moves: [`${sceneryName(s)} 1개`, '자리 옆으로 옮기기'] };
  if (m.net < 0) return { key: 'money', text: '버는 것보다 나간 게 많아요', moves: ['쉬는 직원 정리', '유지비 큰 시설 정리'] };
  return { key: 'none', text: '지금은 크게 막힌 데가 없어요', moves: ['명당 한 곳 더', '자리 한 단계 올리기'] };
}

/** 지금 상태 진단 한 장. layout·topMove는 UI가 가진 값이라 밖에서 넣어 준다. */
export function diagnose(s: GameState, input: CoachInput = {}): Diagnosis {
  const seats = totalSeats(s);
  const seatUse = seatUseRate(s, seats);
  const appeal = appealOf(s, seatUse);
  const scenery = cafeScenery(s);
  const left = Math.max(0, s.monthGuestsLeft ?? 0);
  const pop = appeal.rows.find((r) => r.key === 'popularity')!.value;
  const service = appeal.rows.find((r) => r.key === 'service')!.value;
  const menuLeft = s.menuSlots.filter((x) => x === null).length;
  const clean = s.clean.value;
  const net = s.lastMonthCard?.net ?? 0;
  const staffN = s.staff.length;
  const unreachable = unreachableCount(s);
  const needs = roleNeeds(s); // 통합: 채용 화면과 같은 병목 판정
  const b = bottleneckOf(s, { seatUse, left, pop, scenery, staffN, menuLeft, clean, net, unreachable, needs });
  const route = routeOf(s, scenery);

  // 3줄 평가: 규모 · 잘 되는 것 · 살림. 걸리는 것은 아래 「가장 큰 걸림돌」 칸이 따로 맡는다 (같은 말을 두 번 안 한다)
  const best = [...appeal.rows].sort((a, b2) => b2.value / b2.max - a.value / a.max)[0]!;
  const lines: [string, string, string] = [
    `이번 달 손님 ${s.monthGuests}명 · 자리 ${seats}/${seatsNeeded(s).now}개`,
    `${josa(best.label, '이/가')} 제일 좋아요 (${best.value}${best.unit})`,
    `직원 ${staffN}명 · 메뉴 ${s.menuSlots.length - menuLeft}/${s.menuSlots.length}칸 · 청결 ${Math.round(clean)}`,
  ];

  const roles = (Object.keys(ROLE_NAME) as RoleId[]).map((r) => ({ r, n: staffInRole(s, r).length })).filter((x) => x.n > 0);
  const evidence: { label: string; value: string }[] = [
    { label: '인기', value: `${pop} / ${appeal.rows[0]!.max}` },
    { label: '경관', value: `${Math.round(scenery * 10) / 10}` },
    { label: '서비스', value: `${service}%` },
    { label: '자리 이용률', value: `${Math.round(seatUse * 100)}%` },
    { label: '필요한 자리', value: `지금 ${seatsNeeded(s).now}개 · 홍보 중 ${seatsNeeded(s).promo}개` }, // midgame: 「몇 개 필요한가」를 수치로
    { label: '대기 이탈', value: `${left}명` },
    { label: '불만 1위', value: topComplaints(s, 1)[0] ? `${topComplaints(s, 1)[0]!.count}건` : '없음' },
    { label: '직원', value: roles.length > 0 ? roles.map((x) => `${ROLE_NAME[x.r]} ${x.n}`).join(' · ') : '없음' },
    { label: '메뉴', value: `${s.menuSlots.length - menuLeft}/${s.menuSlots.length}칸` },
    { label: '모자란 직종', value: needs.length > 0 ? needs.map((n) => ROLE_NAME[n.role]).join(' · ') : '없음' }, // 통합: 채용 화면과 같은 판정
  ];
  if (input.layout !== undefined && input.layout !== null) evidence.push({ label: '배치 점수', value: `${input.layout}점` });
  if (input.topMove) evidence.push({ label: '추천 한 수', value: input.topMove });

  return {
    dateText: `${s.clock.month}월 ${lastCheckupDay(s.clock.day)}일`,
    lines,
    bottleneck: { key: b.key, text: b.text },
    moves: b.moves,
    unreachable,
    route: { id: route, name: ROUTE_NAME[route], line: ROUTE_LINE[route], next: ROUTE_NEXT[route] },
    evidence,
    summary: route === 'none' ? `아직 색이 없어요 · 다음은 ${b.moves[0]}` : `${ROUTE_NAME[route]} 카페예요 · 다음은 ${b.moves[0]}`,
  };
}

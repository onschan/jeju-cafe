import type { GameState } from './types.ts';
import { advanceClock, END_HOUR, START_HOUR, HOUR_MS } from './clock.ts';
import { monthlyHarvest } from './orchard.ts';
import { dailyContest, monthlyContest } from './contest.ts'; // 대회: 6·12월 1일 개최, 이레 전 예고
import { dailyRivals, dailyRivalBoard } from './rival.ts'; // 동네 경쟁 카페: 5일 순위 발표 (뺏기 이벤트는 끔)
import { checkGoals } from './goals.ts';
import { monthlyBigEvents, dailyBigEvents, hourlyBigEvents, rollTrend, resolvePendingEventChoice } from './events.ts';
import { monthlyRisk, dailyRisk } from './risk.ts'; // stakes: 돌발 사고
import { hourlySpawn, hourlyRegulars, updateGuests } from './guests.ts';
import { upkeep, closeMonth, annualRaise, incomeTax, TAX_MONTH, rent, dealFee, loanDue } from './economy.ts';
import { checkLoan, monthlyFailure } from './failure.ts';
import { resetWaiting } from './guests.ts';
import { nightlyReputation, monthlyReputation } from './reputation.ts';
import { payroll, expireCandidates, expireRareCandidates, hourlyEnergy, nightlyRecovery, moveStaff, dailyWorkExp, checkRoleUnlocks } from './staff.ts';
import { dailyTraining } from './training.ts';
import { expirePromotions } from './promotions.ts';
import { evaluateUnlocks } from './segments.ts';
import { dailyBoard, monthlyBoard } from './board.ts';
import { pruneEffects } from './effects.ts';
import { resolveDevelop } from './craft.ts';
import { advanceConstruction } from './build.ts';
import { monthlyShop, dailyShop } from './shop.ts';
import { monthlyRank } from './guidebook.ts';
import { monthlyTickets } from './mileage.ts';
import { dailySpots } from './spots.ts';
import { monthlyGifts } from './items.ts';
import { fmtNum } from './format.ts';
import { dailyCleanliness } from './cleanliness.ts';
import { dailyRoutes, monthlyRoutes } from './entry.ts';
import { dailyRooms, accumulateSeatUse, MS_PER_HOUR } from './rooms.ts'; // 좌석 이용률
import { endingMonthly } from './ending.ts'; // z-ending: 5년차 엔딩 (pace)
import { dailyIdleHint } from './hints.ts'; // game-feel: 3일 무행동이면 삼춘 힌트
import { closeDay } from './daylog.ts'; // 성장: 하루 요약 카드·30일 그래프
import { runPending } from './pending.ts'; // seatfix: 자리가 빈 예약(이동·철거·증축)을 바로 실행
import { checkChapter } from './chapter.ts'; // chapter: 한 판 = 다섯 막
import { checkTutorial } from './tutorial.ts';

/** 고정 스텝 (게임 ms) = 게임 시간 3분. pace: HOUR_MS에 묶어 둔다 — 시계를 빠르게 해도 한 시간에 도는 스텝 수(20)가 같아야
 *  조리 대기·체류·걸음이 같은 눈금으로 끊기고, 하루 매출과 난수 흐름이 그대로 유지된다. */
export const STEP_MS = HOUR_MS / 20;
const MAX_STEPS_PER_TICK = 600;    // 백그라운드 복귀 등 폭주 방지 (게임 시간 30시간)
const HOURS_PER_DAY = END_HOUR - START_HOUR;

/** 시간이 한 칸 지날 때마다 (새 시각 = state.clock.hour) */
function onNewHour(state: GameState): void {
  hourlyEnergy(state);
  accumulateSeatUse(state, MS_PER_HOUR); // 지난 한 시간 좌석 이용 (이용률)
  // [코어만] hourlyRegulars(state); // 단골★·특별 손님이 일반 손님(대기열)보다 먼저 자리를 잡는다
  // [코어만] hourlyBigEvents(state);
  hourlySpawn(state);
  // [코어만] checkGoals(state);
  checkTutorial(state); // 튜토리얼은 액션 때만이 아니라 시간이 흘러도 판정한다 — 「첫 손님 받기」처럼 기다려야 되는 단계가 있다
}

/** 새 날 (6시의 시간 처리보다 먼저): 효과 만료 → 빅 이벤트 종료 → 팝업 정리·지역 회복 → 밤 회복 → 근무 경험치·연수 복귀·직종 해금 → 게시판(부탁 진행·제안) → 메뉴 개발 완료 → 건설 → 목표 판정 */
function onNewDay(state: GameState): void {
  // [코어만] closeDay(state); // 성장: 어제 하루치(손님·매출·새 단골·등급)를 한 줄 — dayStats가 리셋되기 전에
  nightlyReputation(state); // 어제 만족·불만으로 평판 갱신
  resetWaiting(state);
  pruneEffects(state);
  dailyCleanliness(state); // 트랙 A: 청결 일일 변화 (spawnMult 효과 갱신)
  // [코어만] resolvePendingEventChoice(state); // stakes: 어제 안 고른 빅 이벤트 선택지는 0번으로 확정
  // [코어만] dailyBigEvents(state); // 예약일이 된 빅 이벤트 발동 + 끝난 것 정리
  // [코어만] dailyRisk(state); // stakes: 어제 안 고른 돌발 사고를 확정하고, 오늘이 예정일이면 새 사고
  nightlyRecovery(state);
  dailyWorkExp(state);
  dailyTraining(state); // 연수 일수 차감·복귀 — 「코어만」 정리 때 꺼졌는데 train 액션은 살아 있어 보낸 직원이 영영 안 돌아왔다 (청소 직원이 가면 청결 0 → 손님 −40%)
  checkRoleUnlocks(state);
  expireRareCandidates(state); // staff-luck: 프로·전설 후보 3일 만료
  // [코어만] dailyBoard(state);
  // [코어만] dailySpots(state);
  resolveDevelop(state);
  advanceConstruction(state);
  // [코어만] dailyRoutes(state); // 트랙 H: 경로 해금·길 끊김·오늘 손님 리셋
  dailyRooms(state); // 어제 좌석 이용률 기록
  evaluateUnlocks(state); // game-feel: 손님층·시설 해금·랭크업을 월초가 아니라 조건을 채운 날에 (월초 몰림 방지)
  // [코어만] checkGoals(state);
  // [코어만] dailyRivals(state); // 뺏기 이벤트(12일)는 끈 채
  dailyRivalBoard(state); // 동네 순위 발표(5일) — 라이벌 순위표가 살아 움직이게
  // [코어만] dailyShop(state); // game-feel: 보름 응모권
  // [코어만] dailyIdleHint(state);
  checkChapter(state); // chapter: 어제까지 쌓인 것으로 막을 넘었나 (카이로 방향: 러시 없이, 손님이 제자리에 앉은 수로)
}

/** 월 바뀜 (1일의 날 처리보다 먼저): (3월) 급여 인상 → 월급 → 홍보 만료·인기 감소 → 유지비 → 투어 버스 → (3월) 소득세 → 명소 월 정산·선물 → 손님 수 마일리지 → 정산 → 실패 상태(경고·대출·상환·위기) → 평판 후기 → 농원 수확 → 후보 만료 → 손님 해금 → 게시판 → 응모권·무료 추첨 → ★·가이드북 발표 → 라이벌 → 빅 이벤트 판정(예약) */
function onNewMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const newYear = state.clock.month === TAX_MONTH && state.clock.year >= 2;
  if (newYear) annualRaise(state);
  payroll(state);
  expirePromotions(state);
  upkeep(state);
  rent(state); // stakes: 소유 필지 월 임대료 (마을 관리비)
  // [코어만] dealFee(state); // 동네 경쟁 카페 제휴 월 고정비 (rival.ts)
  loanDue(state); // stakes: 삼춘 대출 상환 기한 (넘기면 평판 −5)
  if (newYear) incomeTax(state);
  // [코어만] monthlyRoutes(state); // 트랙 H: 경로 월 리셋·셔틀 계약비
  // [코어만] monthlyGifts(state);
  // [코어만] monthlyTickets(state);
  closeMonth(state, prevMonth, prevYear);
  monthlyFailure(state);
  monthlyReputation(state);
  // [코어만] monthlyHarvest(state);
  expireCandidates(state);
  evaluateUnlocks(state);
  // [코어만] monthlyBoard(state);
  // [코어만] monthlyShop(state);
  // [코어만] monthlyRank(state);
  // [코어만] monthlyContest(state); // 대회 (6·12월 1일 아침): 접수한 종목을 치른다
  // [코어만] monthlyBigEvents(state); // 판정은 1일, 발동은 달 안에 퍼진다 (game-feel)
  // [코어만] rollTrend(state); // stakes: 이번 달 유행 분류 (×1.5 손님 선호)
  // [코어만] monthlyRisk(state); // stakes: 이달 돌발 사고 예약 (25%)
  // [코어만] endingMonthly(state); // z-ending: 5년차 3월 1일 엔딩 (결산 카드 뒤)
}

/** 고정 스텝 하나. 결정적. 리플레이는 이 함수만 호출한다. */
export function step(state: GameState): void {
  const prevMonth = state.clock.month;
  const prevYear = state.clock.year;
  const prevHour = state.clock.hour;
  const days = advanceClock(state, STEP_MS);
  const hours = days * HOURS_PER_DAY + (state.clock.hour - prevHour);
  // 스텝(HOUR_MS/20) < 시간(HOUR_MS)이라 한 스텝에 시간은 최대 한 칸 지난다.
  // 24시→6시 경계에서는 큰 단위부터: 월(월급·정산·농원 수확) → 날(밤 회복·게시판·목표) → 시간(6시 기력 소모·스폰).
  if (state.clock.month !== prevMonth) onNewMonth(state, prevMonth, prevYear);
  for (let i = 0; i < days; i++) onNewDay(state);
  for (let i = 0; i < hours; i++) onNewHour(state);
  updateGuests(state, STEP_MS);
  runPending(state); // seatfix: 손님이 다 떠난 예약은 그 즉시 실행된다
  moveStaff(state, STEP_MS);
  checkLoan(state);
  state.tick++;
}

/** 실시간 dtMs를 speed로 환산해 STEP_MS 단위로 step을 돌린다. 잔여는 clock.carryMs에 보관.
 *  시뮬레이션(고정 스텝 수·난수 흐름)은 실시간 dt와 무관하다. */
export function tick(state: GameState, dtMs: number): GameState {
  const c = state.clock;
  c.carryMs += dtMs * c.speed;
  let steps = 0;
  while (c.carryMs >= STEP_MS && steps < MAX_STEPS_PER_TICK) {
    c.carryMs -= STEP_MS;
    step(state);
    steps++;
  }
  if (steps === MAX_STEPS_PER_TICK) c.carryMs = 0;
  return state;
}


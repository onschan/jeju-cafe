import type { GameState } from './types.ts';
import { advanceClock, END_HOUR, START_HOUR } from './clock.ts';
import { monthlyHarvest } from './orchard.ts';
import { checkGoals } from './goals.ts';
import { dailyBigEvents, dailyBigEventRoll, hourlyBigEvents } from './events.ts';
import { hourlySpawn, hourlyRegulars, updateGuests } from './guests.ts';
import { upkeep, closeMonth, annualRaise, incomeTax, TAX_MONTH } from './economy.ts';
import { checkLoan, monthlyFailure } from './failure.ts';
import { resetWaiting } from './guests.ts';
import { nightlyReputation, monthlyReputation } from './reputation.ts';
import { payroll, expireCandidates, hourlyEnergy, nightlyRecovery, moveStaff, dailyWorkExp, checkRoleUnlocks } from './staff.ts';
import { dailyTraining } from './training.ts';
import { expirePromotions } from './promotions.ts';
import { evaluateUnlocks } from './segments.ts';
import { dailyBoard, monthlyBoard } from './board.ts';
import { pruneEffects } from './effects.ts';
import { resolveDevelop } from './craft.ts';
import { advanceConstruction } from './build.ts';
import { monthlyShop, dailyShop } from './shop.ts';
import { monthlyRank } from './guidebook.ts';
import { monthlyMileage } from './mileage.ts';
import { dailySpots, monthlySpots } from './spots.ts';
import { monthlyGifts } from './items.ts';
import { fmtNum } from './format.ts';
import { hourlyPopup, dailyPopup } from './popup.ts';
import { monthlyRivals } from './rivals.ts';
import { dailyCleanliness } from './cleanliness.ts';
import { dailyRoutes, monthlyRoutes } from './entry.ts';
import { dailyRooms, monthlyRooms, accumulateSeatUse, MS_PER_HOUR } from './rooms.ts'; // y-indoor: 본관 공사·좌석 이용률·난로 연료
import { endingMonthly } from './ending.ts'; // z-ending: 10년차 엔딩·100주년
import { villageMonthly, festivalMonthly } from './village.ts'; // z-ending: 9월 정착 등급 심사·10월 마을제

export const STEP_MS = 100;        // 고정 스텝 (게임 ms)
const MAX_STEPS_PER_TICK = 600;    // 백그라운드 복귀 등 폭주 방지 (60초 게임 시간)
const HOURS_PER_DAY = END_HOUR - START_HOUR;

/** 시간이 한 칸 지날 때마다 (새 시각 = state.clock.hour) */
function onNewHour(state: GameState): void {
  hourlyEnergy(state);
  accumulateSeatUse(state, MS_PER_HOUR); // y-indoor: 지난 한 시간 좌석 이용 (이용률)
  hourlyRegulars(state); // 단골★·특별 손님이 일반 손님(대기열)보다 먼저 자리를 잡는다
  hourlyBigEvents(state);
  hourlySpawn(state);
  hourlyPopup(state);
  checkGoals(state); // 목표 줄이 1/1로 하루 종일 멈춰 있지 않게 매시간 판정 (달성 즉시 보상·대화창)
}

/** 새 날 (6시의 시간 처리보다 먼저): 효과 만료 → 빅 이벤트 종료 → 팝업 정리·지역 회복 → 밤 회복 → 근무 경험치·연수 복귀·직종 해금 → 게시판(부탁 진행·제안) → 메뉴 개발 완료 → 건설 → 목표 판정 */
function onNewDay(state: GameState): void {
  nightlyReputation(state); // 어제 만족·불만으로 평판 갱신
  resetWaiting(state);
  pruneEffects(state);
  dailyCleanliness(state); // 트랙 A: 청결 일일 변화 (spawnMult 효과 갱신)
  dailyBigEvents(state);
  dailyBigEventRoll(state); // game-feel: 빅 이벤트는 매일 굴려 달 안에 퍼진다 (월초 몰림 방지)
  dailyPopup(state);
  nightlyRecovery(state);
  dailyWorkExp(state);
  dailyTraining(state);
  checkRoleUnlocks(state);
  dailyBoard(state);
  dailySpots(state);
  resolveDevelop(state);
  advanceConstruction(state);
  dailyRoutes(state); // 트랙 H: 경로 해금·길 끊김·오늘 손님 리셋
  dailyRooms(state); // y-indoor: 본관 증축·이동·2층 완공, 어제 이용률, 난로 자동 ON
  evaluateUnlocks(state); // game-feel: 손님층·시설 해금·랭크업을 월초가 아니라 조건을 채운 날에 (월초 몰림 방지)
  checkGoals(state);
  dailyShop(state); // game-feel: 보름 응모권
}

/** 월 바뀜 (1일의 날 처리보다 먼저): (3월) 급여 인상 → 월급 → 홍보 만료·인기 감소 → 유지비 → 투어 버스 → (3월) 소득세 → 명소 월 정산·선물 → 손님 수 마일리지 → 정산 → 실패 상태(경고·대출·상환·위기) → 평판 후기 → 농원 수확 → 후보 만료 → 손님 해금 → 게시판 → 응모권·무료 추첨 → ★·가이드북 발표 → 라이벌 (빅 이벤트 판정은 매일 onNewDay) */
function onNewMonth(state: GameState, prevMonth: number, prevYear: number): void {
  const newYear = state.clock.month === TAX_MONTH && state.clock.year >= 2;
  if (newYear) annualRaise(state);
  payroll(state);
  monthlyRooms(state); // y-indoor: 켜 둔 난로 연료비
  expirePromotions(state);
  upkeep(state);
  if (newYear) incomeTax(state);
  monthlySpots(state); // 투어 버스 월 계약비(트랙 C chargeTourBus → monthCosts.tourBus)
  monthlyRoutes(state); // 트랙 H: 경로 월 리셋·셔틀 계약비
  monthlyGifts(state);
  monthlyMileage(state);
  closeMonth(state, prevMonth, prevYear);
  monthlyFailure(state);
  monthlyReputation(state);
  monthlyHarvest(state);
  expireCandidates(state);
  evaluateUnlocks(state);
  monthlyBoard(state);
  monthlyShop(state);
  monthlyRank(state);
  monthlyRivals(state);
  villageMonthly(state); // z-ending: 9월 1일 정착 등급 심사
  festivalMonthly(state); // z-ending: 10월 1일 마을제 안내
  endingMonthly(state); // z-ending: 10년차 3월 1일 엔딩 (결산 카드 뒤) · 20년차 11월 100주년
}

/** 고정 스텝 하나. 결정적. 리플레이는 이 함수만 호출한다. */
export function step(state: GameState): void {
  const prevMonth = state.clock.month;
  const prevYear = state.clock.year;
  const prevHour = state.clock.hour;
  const days = advanceClock(state, STEP_MS);
  const hours = days * HOURS_PER_DAY + (state.clock.hour - prevHour);
  // 스텝(100ms) < 시간(2000ms)이라 한 스텝에 시간은 최대 한 칸 지난다.
  // 24시→6시 경계에서는 큰 단위부터: 월(월급·정산·농원 수확) → 날(밤 회복·게시판·목표) → 시간(6시 기력 소모·스폰).
  if (state.clock.month !== prevMonth) onNewMonth(state, prevMonth, prevYear);
  for (let i = 0; i < days; i++) onNewDay(state);
  for (let i = 0; i < hours; i++) onNewHour(state);
  updateGuests(state, STEP_MS);
  moveStaff(state, STEP_MS);
  checkLoan(state);
  state.tick++;
}

/** 실시간 dtMs를 speed로 환산해 STEP_MS 단위로 step을 돌린다. 잔여는 clock.carryMs에 보관. */
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

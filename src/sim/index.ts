export * from './types.ts';
export { createInitialState, GRID_W, GRID_H, PARCEL_W, PARCEL_H, START_ORIGIN, VILLAGE_ROAD_Y, MENU_SLOT_COUNT, SAVE_VERSION, START_MONEY, START_MONTH, START_MENUS, START_CANDIDATES, START_PATH, START_SEATS, fillStarterLayout, type StartLayout } from './state.ts';
export { parcelAt, parcelById, parcelPrice, canBuyParcel, ownedParcels, parcelBonusAt, parcelUnlockOwnedCount } from './parcels.ts';
export { tick, step, STEP_MS } from './tick.ts';
export { upkeepOf, isAged, salaryOf as economySalaryOf, incomeTaxOf, totalCosts, emptyMonthCosts, UPKEEP_RATE, BASE_SALARY_DEFAULT, SALARY_LEVEL_STEP, SALARY_PER_STAT_POINT, ANNUAL_RAISE_PCT, TAX_RATE, TAX_MONTH } from './economy.ts';
export { addComplaint, addReputation, complaintCounts, topComplaints, reputationGuestMult, reputationTypeMult, reputationTipMult, reputationNamedMult, reputationScore, nightlyReputation, monthlyReputation, makeReviews, reviewScore, applyApology, cleanValue, wornCount, COMPLAINT_REASONS, COMPLAINT_LABEL, COMPLAINT_REVIEW, REPUTATION_START, REP_LOW, REP_HIGH, REP_ALERT, APOLOGY_REPUTATION, MAX_REVIEWS, TOP_COMPLAINTS } from './reputation.ts';
export { hasLoan, loanRewardMult, canTakeLoan, takeLoan, checkLoan, repayLoan, LOAN_AMOUNT, LOAN_MAX, LOAN_THRESHOLD, LOAN_REPAY_RATIO, LOAN_REWARD_MULT, WARN_DEFICIT_MONTHS, LOAN_DEFICIT_MONTHS, CRISIS_MONEY, CRISIS_MONTHS } from './failure.ts';
export { apply, PROTECTED_TYPES, ROTATABLE_TYPES, demolishRefund, canDisturb } from './actions.ts';
export { canUndo } from './undo.ts';
export { DAY_MS, seasonOf, monthIndex, DAYS_PER_MONTH } from './clock.ts';
// ---- stakes: 긴장감·트레이드오프·변수 ----
export { RISKS, riskDef, riskDayOf, resolveRisk, hasPendingRisk, dailyRisk, monthlyRisk, breakdownTarget, breakdownRepairCost, absentStaffId, isStopped, stoppedCount, riskDaysLeft, RISK_CHANCE, GROUP_SEATS, GROUP_REWARD, GROUP_FAIL_REPUTATION, BREAKDOWN_STOP_DAYS, BREAKDOWN_REPAIR_PCT, type RiskId, type RiskDef } from './risk.ts';
export { RENT_PER_PARCEL, rentOf, rent, loanDue, LOAN_DUE_MONTHS, LOAN_OVERDUE_REPUTATION, gradeMonth, gradeOfScore, coachAdvice, GRADE_S, GRADE_A, GRADE_B, GRADE_ITEM_MAX, COACH_BAD_MONTHS, type GradeResult, type GradeItem } from './economy.ts';
export { TREND_CATEGORIES, TREND_NAME, TREND_MULT, trendCategoryOf, trendOf, trendMenuMult, rollTrend, EVENT_CHOICES, eventChoiceDef, hasPendingEventChoice, resolveEventChoice, resolvePendingEventChoice, type EventChoiceDef, type EventChoiceOption } from './events.ts';
export { REP_REGULAR_SLOW, regularVisitEveryOtherWeek, shrinkingWarning } from './reputation.ts';
export { cellAt, objectAt, canPlace, footprint, parcelHasLandmark, isSheltered, sceneryScore, objectScenery, windShelter, SHELTER_THRESHOLD, SCENERY_CAP, doorOf, doorFrontOf, roomAt, isRoomFloor, objectsInRoom } from './grid.ts';
export { FX_CAP } from './fx.ts';
export { isFarmObject, monthlyYieldOf, expectedHarvest, emptyMonthHarvest } from './orchard.ts';
export { stockOf } from './warehouse.ts';
export { currentGoal, activeGoals, goalClaimed, goalProgress, goalValue, goalMet, conditionProgress, conditionCheckers, goalConditionText, goalRewardText, goalForFacility, goalForMenu, goalForFeature, featureOpen, checkFeature, canOpen, applyRewards, grantReward, scaleReward, underLoan, FEATURE_IDS, ACTION_FEATURE_IDS, FEATURE_NAME, FEATURE_OF_ACTION, CONCURRENT_GOALS, goalDef, type Progress } from './goals.ts';
export { monthlyProgress, makeMonthly, checkMonthly, MONTHLY_TARGET_RATIO } from './monthly.ts';
export { bestMainCell, bestMainCells, bestSeatCell, bestSeatCells, bestWallCell, bestWallCells, bestCornerCell, bestCornerCells, cornerScoreIfPlaced, cornerNameForPiece, bestIndoorSeat, bestIndoorSeats, bestParkingCell, bestParkingCells, bestSpotToInvest, nextMove, heuristicNextMove, solverNextMove, solverDeltaText, strategyVars, fillTemplate, wallSheltered, OPENING_SEATS, SUMMER_SEATS, SOLVER_SEAT_K, SOLVER_CELL_K, type NextMove } from './strategy.ts'; // pro-guide
// ---------- solver: 롤아웃 탐색 (최적해 가이드) ----------
export { cloneState, candidateActions, pickDiverse, candidateGroup, evaluate, rolloutDays, metricsOf, scoreOf, bestMoves, solveSync, buildTabOf, SOLVER_WEIGHTS, LOW_REPUTATION, DEFAULT_SOLVER_OPTIONS, UI_SOLVER_OPTIONS, BOT_SOLVER_OPTIONS, type SolverOptions, type SolverCandidate, type Metrics, type Evaluation } from './solver.ts';
export { solverKey, moneyBucket, setSolverResult, solverResult, lastSolverResult, onSolverResult, cachedMoves, rankCellsByCache, type SolverMove, type SolverResult } from './solverCache.ts';
export { STEPS as TUTORIAL_STEP_DEFS, TUTORIAL_STEPS, currentTutorialStep, stepTargets, tutorialStepDone, tutorialDone, dialogueSeen, pathConnected, recommendedMainCells, cornerMade, cornerMissingType, cornerCells, greetedGuest, LOOK_TEXT, type TutorialStepDef, type TutorialNoteKey, type LookId } from './tutorial.ts';
export { activeEvents, isEventActive, eventDaysLeft, eventGuestMult, eventTagMult, eventFeeMult, eventEligible, guestHasTag, isSpecialGuest, specialGuestTip, specialGuestsMet, MAX_ACTIVE_EVENTS, SPECIAL_GUEST_HOUR } from './events.ts';
export { guestSay, staffSay } from './say.ts';
export { ENTRY_ROUTES, ROUTE_IDS, routeDef, entryPoints, routeStats, routeState, routeActive, routeOpened, routeConnected, routeLinked, routeShare, routeTakesGuests, canAutoLinkRoute, installRouteForParcel, parkingTodayText, PARCEL_ROUTE, ROUTE_AUTO_SITES, ROUTE_OPEN_LINE, PARKING_SHARE_MIN, PARKING_SHARE_MAX, OLLE_SHARE, CAR_GUESTS_MIN, CAR_GUESTS_MAX, PARKING_FLUSH_HOUR, routeFacility, routeTarget, routeSpawnPos, routeHome, routeAtCell, routeOfFacility, routeDailyCap, routeCapLeft, nextArrivalText, parkingSlots, parkingSites, routePathCells, canExpandParking, parkingExpandCost, spawnRouteWeights, routeArrivals, routeTagMult, hasRouteTag, isForeign, routeUnlockMet, routeFacilityUnlockMet, PARKING_SLOTS, PARKING_GUESTS_PER_SLOT, PARKING_EXPAND_FROM, PARKING_EXPAND_TO, OLLE_GUEST_MULT, FOREIGN_WALLET_MULT, type RouteDef, type RouteTag, type EntryPoint, type RouteStat } from './entry.ts'; // 트랙 H
export { isMenuAvailable, availableMenus, canSetSlot, hasMenuStaff, menuRequirementText, menuOf, purchaseCost, ingredientCost } from './menu.ts';
export { menuMod, menuStatsOf, menuSkills, skillEffects, skillTier, skillTierValue, priceOf, priceFromStats, toppingCost, costMult, activeIngredientCombos, comboBonus, matchHiddenRecipe, normalizeParams, paramDeviation, successRate, bonusWidth, developStaffStat, developCost, canDevelop, developDaysLeft, autoMenuName, canAddTopping, canRemoveTopping, canLevelUpMenu, levelUpMenuCost, maxSlots, isStaffBusy, isCustomMenu, qualityOf, countIngredients, DEVELOP_DAYS, DEVELOP_RESEARCH, BASE_NAME, BASE_MIN, PARAM_AXES, PARAM_LABEL, PARAM_DEFAULT, BASE_STAT, MENU_SKILLS, SKILL_TIER_VALUES, SKILL_DESC, TIER_NAMES, MAX_TOPPINGS, MAX_MENU_LEVEL, SIGNATURE_STAR, P_GREAT, type MenuSkill, type SkillEffects } from './craft.ts';
export { isWalkable, busStopPos, isDoorReachable } from './path.ts';
export { OLDEST_LOADABLE, BACKFILL_FROM } from './save.ts';
export { addResearchProgress, HAPPY_PER_RESEARCH, TASTE_MATCH_WEIGHT } from './progress.ts';
export { serialize, deserialize, MemorySaveStore, LocalSaveStore, type SaveStore, type BestRecord } from './save.ts';
export { freeSeats, hasReachableSeat, seatSlotPos, dailyGuestCount, gateSatisfaction, countGatesOn, GATE_SATISFACTION_MAX, popularityGuestBase, popularitySum, facilityPopularitySum, spotDailyGuests, seasonGuestMult, spawnMultiplier, prepTimeMs, serviceBonus, isVisitable, likesFacility, spawnNamedGuest, hourlyRegulars, totalSeats, GUEST_SPEED_CELLS_PER_S, SEAT_MS, PREP_MS, VISIT_CHANCE, GUESTS_PER_SEAT, BASE_DAILY_GUESTS, POP_SUM_PER_GUEST, FACILITY_POP_PER_GUEST, WAIT_MAX, SEASON_GUEST_MULT, servingCapacity, waitPenalty, waitCapOf, drinkQualityBonus, prepCut, ordersToday, zoneSatisfaction, nightShiftSatisfaction, OWNER_DRINKS_PER_DAY, DRINKS_PER_BARISTA, FOOD_PER_COOK, SERVICE_PER_HEAD, SERVICE_MAX, PREP_CUT_PER_HEAD, MAX_PREP_CUT, WAIT_PER_HALL_HEAD } from './guests.ts'; // staff2
export { canPromote, effectivePopularity, MAX_ACTIVE_PROMOTIONS, PARTTIME_MONEY } from './promotions.ts';
export { TIERS, MAX_LEVEL, MAX_STAT, LOW_ENERGY, STAT_KEYS, STAT_NAME, salaryOf, salaryDue, SALARY_PER_STAT, UNASSIGNED_SALARY_RATIO, levelUpCost, expNeeded, mainStatOf, addRoleExp, EXP_PER_SERVE, EXP_PER_WORKDAY, roleEffect, ingredientDiscount, staffInRole, canHire, canLevelUp, canPostJob, postJobCost, tierUnlocked, availablePool, addPoolCandidate, staffCapacity, staffRoomCount, capOf, capBonus, skillsOf, hasSkill, skillTotal, cleanPowerOf, gardenBonusOf, gardenDecayOf, promoBonusOf, promoEnergyFactorOf, farmCount, roleUnlockMet, BASE_STAFF_SLOTS, SLOTS_PER_STAFF_ROOM, STAFF_ROOM_TYPE, roleHeads, roleHeadsWith, headValue, HEAD_STAT, HEAD_MAX, DIMINISH_FROM, DIMINISH_FACTOR, zoneOf, setZone, canSetZone, isNightShift, canSetNight, setNight, hasNightShift, STAFF_ZONES, ZONE_NAME, ZONE_ROLE, NIGHT_BONUS, NIGHT_ENERGY_COST, type StaffZone } from './staff.ts';
export { canTrain, trainingCost, trainingOptions, trainingUnlocked, trainingMultOf, trainingChances, TRAINING_RANK, TRAINING_COST_STEP } from './training.ts';
// ---------- staff-luck: 직원 칭호(레어 직원)·작업 확률 결과(대박/중박/쪽박) ----------
export { TITLE_GRADES, GRADE_ORDER, RARE_STAY_DAYS, LEGEND_MIN_TIER, LEGEND_MIN_STAR, titleDef, titleGradeOf, titleName, titleSalaryMult, titleChances, rollGrade, fitRolesOf, pickTitle, rollTitle, noteTitleMet, titlesMet, staffTitleEffect, isWorking, titleBonus, titlesOfGrade, candidateDaysLeft, isRare } from './titles.ts';
export { OUTCOME_TABLE, TASK_NAME, TASK_STAT, OUTCOME_NAME, OUTCOME_MULT, GREAT_REPUTATION, FAIL_REPUTATION, FAIL_ENERGY, GREAT_TICKETS, LOW_ENERGY_FAIL, outcomeChances, rollOutcome, bestStaffFor, chanceText, recordOutcome, luckSkill, type Chances, type LuckMods } from './luck.ts';
export { promoChances } from './promotions.ts';
export { giftChances } from './items.ts';
export { developChances } from './craft.ts';
export { serveStaff, SERVE_TIP_RATE } from './guests.ts';
export { objectStats, popularityFor, setLevels, guestPickMult, cornerSatisfaction, discoverPlacement, BASE_POPULARITY, POPULARITY_CAP, PICK_MULT_CAP } from './compat.ts';
// ---------- fun: 카페 매력도 (경관 → 관광객, 사진 → 평판) ----------
export { cafeScenery, sceneryMultOf, sceneryTouristMult, touristPctText, sceneryGainText, appealOf, POPULARITY_FULL, POPULARITY_LOW, SEAT_USE_HIGH, SCENERY_MULT_MIN, SCENERY_MULT_MAX, PHOTO_REPUTATION, PHOTO_REPUTATION_DAY_CAP, type Appeal, type AppealRow } from './appeal.ts';
// ---------- fun: 슬롯형 시설·업그레이드 트리·거리 보너스·짓기 타일 ----------
export { TREES, treeDef, treeOf, treeBase, nextStep, stepNeedText, stepNeedMet, treeUpgradeCost, canTreeUpgrade, treeUpgrade, streetLength, streetFeeMult, streetText, streetIfPlaced, BUILD_TILES, TILE_TYPES, tileBadges, seatUseRate, STREET_MIN, STREET_BONUS_PCT, SEAT_USE_BOTTLENECK, SCENERY_BOTTLENECK, type TreeId, type TreeDef, type TreeStep, type BuildTileId, type BuildTile, type TileBadge } from './tree.ts';
export { levelOf, tierOf, isUpgradable, upgradeCost, usesOf, recordUse, upgradeConditionText, canUpgrade, seatBonusOf, facilityFee, yieldMultOf, MAX_OBJECT_LEVEL, LEVEL_COST_MULT, LEVEL_POPULARITY, LEVEL_SCENERY, LEVEL_FEE_PCT, LEVEL_MENU_PCT, LEVEL_UPKEEP_MULT, LEVEL_COMBO_MULT, LEVEL_SEATS, LEVEL_YIELD_MULT, UPGRADE_USES, UPGRADE_POP_ALT, STAR_BY_TIER, type Tier } from './upgrade.ts';
export { dailyCleanliness, dailyCleanRecovery, cleanReduceMult, cleanGuestMult, cleanSatisfaction, cleanJudgePenalty, wearOf, isWorn, repairCost, canRepair, upkeepMultOf, CLEAN_MAX, CLEAN_HIGH, CLEAN_LOW, CLEAN_CRIT, CLEAN_ROLE, WEAR_START_MONTHS, WEAR_STEP_MONTHS, WEAR_MAX, REPAIR_COST_PCT, WORN_UPKEEP_MULT, seatDirt, CLEAN_FREE_SEATS, CLEAN_PER_SEAT } from './cleanliness.ts'; // staff2: 자리 수 오염
export { canUseItem, grantItem, itemEffect, ITEM_POP_CAP, ITEM_SCENERY_CAP, canGiveGift, giftFits, giftedToday, giftCount, hasSpecial, canCraftGift, GIFT_POPULARITY, GIFT_SATISFACTION, GIFT_FIT_MULT } from './items.ts';
export { lineCells, planLine, isLineType, LINE_KINDS, type LineOrder, type LinePlan } from './line.ts';
export { buildDaysOf, effectiveBuildDays, FAST_HAMMER_ITEM, INSTANT_HAMMER_ITEM, isUnderConstruction, constructions, canStartBuild, buildDaysLeft, START_BUILDERS, MAX_BUILDERS, needsDoorPath, DOOR_PATH_HINT } from './build.ts';
export { canDrawTicket, canSetUniform, canUseGuestItem, hasFreeDraw, hasUniform, rollPrize, SEED_PACK, DRAW_MONEY_PER_YEAR, UNIFORM_PIECES_PER_SET, MONTHLY_FREE_TICKETS } from './shop.ts';
export { addTickets, codexCount, checkCodexTickets, monthlyTickets, CODEX_PER_TICKET, GUESTS_PER_TICKET } from './mileage.ts';
export { rankScore, rankForScore, nextRankThreshold, facilityCount, unlockedGuestTypeCount, updateRank, RANK_THRESHOLDS, MAX_RANK } from './rank.ts';
// ---------- fun-rank: 카페 등급 5단계·필지 특징 ----------
export { gradeOf, gradeName, gradeProgress, gradeMet, cornerCount, checkGrade, gradeUpRewards, guestCap, GRADE_NAMES, GRADE_CAPTION, GRADE_REQS, MAX_GRADE, GRADE_GUEST_CAP_BASE, GRADE_GUEST_CAP_STEP, GRADE_BGM_LAYER_FROM, REVEAL_GRADE, type GradeReq, type GradeProgressRow } from './grade.ts';
export { parcelFeature, PARCEL_FEATURES, type ParcelFeature } from './parcels.ts';
export { starConditionMet, starConditionsHeld, isReviewDue, starReview, nextStarConditions, checkStar, judgeScores, guidebookScore, guidebookState, evaluateGuidebooks, guidebooksToAnnounce, announce, rivalScores, rivalTop, rivalBoost, rankAmong, monthlyTarget, targetPopularity, codexTotal, MAX_STAR, JUDGE_KEYS, JUDGE_LABEL, ANNOUNCE_MONTHS, RIVAL_COUNT, PRIZE_RATIO, RANK_TICKETS, MONTHLY_TAGS, RIVAL_WIN_BOOST, REVIEW_MIN_STAR, REVIEW_EVERY_YEARS, RANK_SHIELD_ITEM } from './guidebook.ts';
export { evaluateUnlocks, evaluateFacilityUnlocks, unlockCondMet, isUnlocked, unlockedTypeIds, guestFace, walletOf, regularTier, isTarget, MAX_TARGETS, TARGET_SPAWN_MULT, canSetTargets, SAT_QUEST, SAT_REGULAR, SAT_VIP } from './segments.ts';
export { questProgress, canAcceptQuest, canRespondEvent, eventConditionMet, boardBadge, visibleQuests, questRewardText, QUEST_MONTHS } from './board.ts';
export {
  spotLevel, spotUnlocked, nextSpotLevel, spotAppeal, spotAppealOf, spotGuestBonus, canInvestSpot, spotRequirements, spotVisitors, totalSpotVisitors, dailyVisitors, totalDailyVisitors,
  spotSpawnMult, spotFeePct, spotSceneryBonus, tagPopularity, spotCost,
  SPOT_MAX_LEVEL, SPOT_GUEST_LEVEL, SPOT_ITEM_LEVEL, SPOT_NEXT_LEVEL, SPOT_TAG_MULT, SPOT_FEE_PCT, SPOT_SCENERY, SPOT_LV3_TICKETS, SPOT_VISITOR_REQ, SPOT_YEAR_REQ_LV3,
  VISITOR_PRIZES, GOLDEN_TANGERINE_VISITORS, VISITOR_GUEST_RATE,
  type SpotRequirement,
} from './spots.ts';
export { effectMult, noGuestsToday, dayIndex } from './effects.ts';
export { cafeLevel, nextCafeLevelIncome, hasExpansion, canRenameCafe, canExpand, placeCost, seatsOf, isSeat, canSetCosmetic, canPraise, EXPANSIONS, CAFE_LEVEL_INCOME, CAFE_NAME_MAX, WALL_COLORS, SIGN_MAX, PRAISE_ENERGY, DEFAULT_CAFE_NAME, type ExpansionId, type ExpansionDef } from './cafe.ts';
export { josa, hasBatchim } from './josa.ts';
export { namedLikes, namedGuestFace, namedGuestState, metCount, NAMED_MIN_SCENERY } from './named.ts';
export { siteOf, seatScore, siteScore, siteTone, scoredType, scoreOf as siteScoreOf, siteBonus, siteSay, siteBadgeText, siteLineText, layoutKey, isOutdoorSeat, seaInRange, SITE_KEYS, SITE_LABEL, SITE_ICON, SITE_MAX, SITE_GOOD, SITE_SAY, type Site, type SiteKey, type SiteBonus } from './site.ts';
export { sizeOf, footprintOf, canPlaceMain, fixedCellsOf, isFixedCell, indoorRouteCheck } from './grid.ts';
export {
  mainBuilding, mainLevel, mainSize, mainDoorFront, isMainClosed, mainWorkDaysLeft, isIndoorCell, isIndoorSeat, roomSeats, indoorSeats, roomSeatsUsed, freeFloorCells, fixedCells,
  canBuildMain, MAIN_BUILD_COST, isAnnex, annexCount, isRoomCut, cutRooms, nextMainLevel, expandCost, expandCells, canExpandMain, canBuildSecondFloor, moveDays, canMoveThisMonth, canStartMoveMain, canMoveMain, canUndoMoveMain,
  seatsShort, seatUsePct, preferIndoor, stayMs, browseChance, indoorSpawnMult, mainSummary, initMain,
  MAIN_TYPE, MAIN_MAX_LEVEL, MAIN_SIZE, MAIN_EXPAND_COST, MAIN_EXPAND_DAYS, FLOOR2_COST, FLOOR2_MIN_LEVEL, FLOOR2_DAYS, FLOOR2_VIEW, MOVE_COST, MOVE_DAYS,
  SEAT_FULL_PCT, SEAT_FULL_DAYS, SEAT_FULL_TEXT, DOOR_PATH_WARN, ANNEX_CUT_TEXT, BGM_LABEL, LIGHT_LABEL, STAY_PER_FACILITY_MS,
  autoConnectRoute, canAutoConnectPath, type AutoRoute,
} from './rooms.ts';
// ---------- fix-indoor: 밤 조명 ----------
export { NIGHT_HOUR, LIGHT_RADIUS, STREETLIGHT_SAT, DARK_SAT, DARK_TEXT, isNight, isLightType, lights, lightAt, litCellsOf, nightSeatPoints, nightSatisfaction, nightSeatLine } from './lighting.ts';
// ---------- z-ending ----------
export { computeScore, scoreTier, spotLevelSum, endingDue, endingMonthly, canContinueEnding, canSetSpeed, makeCarry, applyCarry, carryText, dolhareubangCount, initEnding, ENDING_YEAR, ENDING_MONTH, MILLENNIUM_TREE, FAST_SPEED, CARRY_RATIO, SCORE_ITEMS, SCORE_TITLES } from './ending.ts';
export { greetedToday, greetsLeftToday, canGreet, greetGuest, greetLine, canRecommend, recommendMenu, recommendFits, guestNameFor, regularFace, REQUESTS, requestDef, isRequestMet, requestHint, pendingRequests, doneRequests, regularGauge, regularHearts, regularOf, regularById, regularsDue, regularCount, regularList, forgetRegular, GREET_DAY_MAX, RECOMMEND_DAY_MAX, RECOMMEND_TIP_RATE, GAUGE_MAX, REGULAR_TIP_RATE, REQUEST_DAY_MAX } from './interact.ts'; // fun-guest (트랙 G)
// ---------- 대회 (contest.ts) — 연 2회 6·12월, 등급 3부터 ----------
export {
  initContest, contestState, contestUnlocked, nextContest, daysToContest, signupOpen, isContestDay, contestTitle, roundIndex,
  judgeScore, judgeScores as contestJudgeScores, baseScore, rivalScores as contestRivals, currentRivals, rankAmong as contestRankAmong,
  contestOdds, contestMenus, contestStaff, canEnterContest, enterContest, canCancelContest, cancelContest, runContest,
  dailyContest, monthlyContest, contestGuestMult, contestBadge, trophyOwned, trophyPlaced, canPlaceTrophy,
  contestHistory, contestWins, contestBestRank, trophyKinds, hasSignature, trainingNameFor, titleBonusFor, trainingBonusFor, supplyBonus,
  contestDef, CONTESTS, CONTEST_MONTHS, CONTEST_DAY, SIGNUP_DAYS, CONTEST_GRADE, CONTEST_HISTORY_CAP,
  JUDGE_KEYS as CONTEST_JUDGE_KEYS, JUDGE_LABEL as CONTEST_JUDGE_LABEL, JUDGE_STAT as CONTEST_JUDGE_STAT, SCORE_MULT as CONTEST_SCORE_MULT,
  PRIZE_MULT, RANK_TICKETS as CONTEST_TICKETS, RANK_EXP as CONTEST_EXP, RANK_BOOST, BADGE_MONTHS, TROPHIES, TROPHY_IDS, TROPHY_TYPE,
  TITLE_JUDGE, TITLE_TRAINING, MENU_SCALE, STAFF_BONUS_MAX, TITLE_BONUS_PER, TITLE_BONUS_MAX, TRAINING_BONUS_PER, TRAINING_BONUS_MAX, SUPPLY_BONUS_MAX,
  RIVAL_BASE, RIVAL_PER_GRADE, RIVAL_PER_ROUND, RIVAL_STEP, RIVAL_NOISE, RIVAL_COUNT as CONTEST_RIVAL_COUNT,
  type ContestOdds,
} from './contest.ts';
export { pushVoice, recentVoices, voiceText, voicesToday, busiestSeat, dirtiestObject, bestViewSeat, VOICE_DAY_MAX, VOICE_CAP, VOICE_FIX, VOICE_FIX_LABEL, type VoiceLine, type VoiceReason, type VoiceFix } from './voice.ts'; // trim: 손님 목소리 피드
export { closeDay, recentDays, daySummary, DAY_LOG_CAP, type DaySummary } from './daylog.ts'; // 성장: 하루 요약·30일 그래프
export type { DayLogRow } from './types.ts';
export { roleEffectText, roleNeeds, needOf, hireForecast, suggestRole, staffBudget, headsOfCandidate, headsOfStaff, type RoleNeed, type HireForecast, type StaffBudget } from './staffPlan.ts'; // staff2: 채용 판단 자료

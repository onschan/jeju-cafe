import type { EventEffect } from '../sim/types.ts';

/**
 * 이벤트 42종의 effectText → 효과 DSL (sim/board.ts가 해석).
 * 표의 문장 중 지금 sim이 지원하는 것(자금 ±, 손님 ×N M일, 수확 ×N, 인기 ±, 아이템, 알림, 유지비 ×N 한 달, 하루 손님 0)만 옮겼다.
 * 없는 항목(시설 파손·웨이팅·라이벌 철수 등)은 알림만 남긴다 — TODO는 각 줄 주석.
 * choice = 수락/거절 (수락 시 effects, 거절 시 decline).
 */
export interface EventSpec { choice?: boolean; effects: EventEffect[]; decline?: EventEffect[] }

const MONTH = 30;

export const EVENT_EFFECTS: Record<string, EventSpec> = {
  // 태풍: 방풍 안 된 작물 소실·시설 파손은 TODO → 유지비 ×2 한 달, 수확 ×0.5 한 달
  ev_typhoon_alert: { effects: [{ kind: 'upkeepMult', mult: 2, days: MONTH }, { kind: 'harvestMult', mult: 0.5, days: MONTH }] },
  ev_flight_cancel: { effects: [{ kind: 'spawnMult', mult: 0, days: 3, filter: 'tourist' }] },
  ev_rentcar_rush: { effects: [{ kind: 'spawnMult', mult: 1.5, days: 7, filter: 'family' }] }, // 주차장 없으면 이탈은 TODO
  ev_roe_deer_raid: { effects: [{ kind: 'harvestMult', mult: 0.7, days: MONTH }] },
  ev_magpie_thief: { effects: [{ kind: 'harvestMult', mult: 0.8, days: MONTH }] },
  ev_crow_flock: { effects: [{ kind: 'harvestMult', mult: 0.5, days: 10 }] },
  ev_haenyeo_gift: { effects: [{ kind: 'grantItem', itemId: 'jeju_salt', n: 1 }, { kind: 'grantItem', itemId: 'conch_shell', n: 1 }] },
  ev_village_meeting: { choice: true, effects: [{ kind: 'spawnMult', mult: 0.5, days: 1 }, { kind: 'popularity', delta: 5, filter: 'local' }] },
  ev_farm_grant_review: { effects: [] }, // 정착지원금은 tick.settleGrant가 처리 (알림만)
  ev_insta_viral: { effects: [{ kind: 'spawnMult', mult: 2, days: 3 }] },
  ev_tv_shoot: { choice: true, effects: [{ kind: 'money', amount: -2_000_000 }, { kind: 'popularity', delta: 10, filter: 'all' }] },
  ev_centennial_festival: { effects: [{ kind: 'spawnMult', mult: 3, days: MONTH }, { kind: 'grantItem', itemId: 'millennium_seed', n: 1 }] },
  ev_first_snow: { effects: [{ kind: 'noGuests', days: 1 }, { kind: 'spawnMult', mult: 2, days: 3, filter: { guestId: 'oreum_hiker' } }] },
  ev_canola_bloom: { effects: [{ kind: 'spawnMult', mult: 3, days: MONTH, filter: 'tourist' }] },
  ev_hydrangea_bloom: { effects: [{ kind: 'spawnMult', mult: 2, days: MONTH, filter: 'female' }] },
  ev_pampas_wave: { effects: [{ kind: 'spawnMult', mult: 2, days: MONTH, filter: { guestId: 'insta_traveler' } }] },
  ev_camellia_fall: { effects: [{ kind: 'spawnMult', mult: 1.5, days: MONTH, filter: 'senior' }, { kind: 'spawnMult', mult: 1.5, days: MONTH, filter: { guestId: 'couple' } }] },
  ev_tangerine_delivery: { effects: [{ kind: 'money', amount: 300_000 }] }, // 감귤 1개당 1,500은 수확량 훅 TODO → 정액
  ev_tangerine_bumper: { effects: [{ kind: 'harvestMult', mult: 1.5, days: MONTH }] },
  ev_tangerine_poor: { effects: [{ kind: 'harvestMult', mult: 0.6, days: MONTH }] },
  ev_stray_cat: { effects: [] },
  ev_warehouse_dig: { effects: [] }, // 버튼(수동)은 TODO — 월 롤 대상 아님
  ev_field_coin: { effects: [{ kind: 'money', amount: 300_000 }] },
  ev_olle_group: { effects: [{ kind: 'spawnMult', mult: 2, days: 1, filter: { guestId: 'olle_walker' } }] },
  ev_bus_breakdown: { effects: [{ kind: 'spawnMult', mult: 1.5, days: 1, filter: 'group' }] },
  ev_foreign_vlogger: { effects: [{ kind: 'popularity', delta: 15, filter: { guestId: 'solo_foreign' } }] },
  ev_secret_chef: { effects: [{ kind: 'tickets', amount: 3 }] },
  ev_kimchi_gift: { effects: [{ kind: 'grantItem', itemId: 'honey', n: 1 }] },
  ev_blackout: { effects: [{ kind: 'noGuests', days: 1 }] },
  ev_water_cut: { effects: [{ kind: 'noGuests', days: 1 }] },
  ev_bee_swarm: { effects: [{ kind: 'grantItem', itemId: 'honey', n: 3 }] },
  ev_lunar_group: { effects: [{ kind: 'spawnMult', mult: 2, days: MONTH, filter: 'group' }] },
  ev_golden_week: { effects: [{ kind: 'spawnMult', mult: 1.5, days: 10 }] },
  ev_summer_vacation: { effects: [{ kind: 'spawnMult', mult: 1.5, days: MONTH, filter: 'family' }] },
  ev_monsoon: { effects: [{ kind: 'spawnMult', mult: 0.8, days: MONTH }] },
  ev_hidden_oreum_view: { effects: [] },
  ev_rival_open: { effects: [{ kind: 'spawnMult', mult: 0.8, days: MONTH * 3, filter: 'tourist' }] },
  ev_staff_wedding: { effects: [] },
  ev_staff_scout: { choice: true, effects: [] },
  ev_governor_visit: { effects: [] },
  ev_yeongdeung_wind: { effects: [{ kind: 'harvestMult', mult: 0.8, days: MONTH }, { kind: 'spawnMult', mult: 2, days: MONTH, filter: { guestId: 'haenyeo' } }] },
  ev_weekend_popup: { effects: [] }, // 매주 토 — 월 롤 대상 아님
};

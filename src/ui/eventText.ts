/** sim 빅 이벤트(events_v3.json, 트랙 A) ↔ 대화 데이터(dialogue/events.json, 트랙 B) 연결.
 *  두 파일의 id가 다르게 붙어 있어 여기서 표로 잇는다. 표에 없거나 B에 대사가 없으면 A의 dialogue 필드를 쓴다. */
import { bigEventDef } from '../data/index.ts';
import { eventDialogue, SPEAKER_NAME, type Speaker } from '../data/dialogue/index.ts';
import type { DialogueReq } from './dialogue.ts';

/** A(events_v3) id → B(dialogue/events) id */
export const EVENT_TEXT_ID: Record<string, string> = {
  ev_visa_free_cn: 'ev_visa_free',
  ev_baek_shooting: 'ev_baekjungwon_shoot',
  ev_hyori_guesthouse: 'ev_yori_minbak',
  ev_iu_guest: 'ev_yuai_guest',
  ev_dondon_waiting: 'ev_dondon_waiting',
  ev_tangerine_festival: 'ev_tangerine_fest',
  ev_canola_bloom: 'ev_canola',
  ev_typhoon_aug: 'ev_typhoon',
  ev_typhoon_sep: 'ev_typhoon',
  ev_snow_jan: 'ev_snow',
  ev_snow_feb: 'ev_snow',
  ev_cherry_blossom: 'ev_cherry',
  ev_olle_festival: 'ev_olle_walk_fest',
  ev_haenyeo_festival: 'ev_haenyeo_fest',
  ev_cruise: 'ev_cruise',
  ev_cheap_flights: 'ev_flight_sale',
  ev_school_trip_season: 'ev_school_trip',
  ev_drama_location: 'ev_drama_rumor',
  ev_influencer_shot: 'ev_influencer',
  ev_workation: 'ev_workation',
  ev_golf: 'ev_golf',
  ev_marathon: 'ev_marathon',
  ev_ev_expo: 'ev_ev_fest',
  ev_udo_peanut: 'ev_peanut_icecream',
  ev_black_pork_festival: 'ev_black_pork_fest',
  ev_sea_fog: 'ev_sea_fog',
  ev_lunar_new_year: 'ev_lunar_new_year',
};

function speakerOf(key: Speaker | string): DialogueReq['speaker'] {
  const k = (key in SPEAKER_NAME ? key : 'halmang') as Speaker;
  return { name: SPEAKER_NAME[k], portrait: k };
}

/** 이벤트 발동 대화. 제목을 첫 줄로 넣는다. */
export function eventStartDialogue(eventId: string): Omit<DialogueReq, 'onClose'> {
  const def = bigEventDef(eventId);
  const b = eventDialogue(EVENT_TEXT_ID[eventId] ?? eventId);
  if (b && b.lines.length > 0) return { speaker: speakerOf(b.speaker), lines: [`【${b.title}】`, ...b.lines] };
  return { speaker: speakerOf(def.dialogue.speaker), lines: [`【${def.title}】`, ...def.dialogue.lines] };
}

/** 이벤트 종료 한 줄 */
export function eventEndDialogue(eventId: string): Omit<DialogueReq, 'onClose'> {
  const def = bigEventDef(eventId);
  const b = eventDialogue(EVENT_TEXT_ID[eventId] ?? eventId);
  const line = b?.endLine || def.endDialogue || `${def.title}이(가) 끝났어요.`;
  return { speaker: speakerOf(b?.speaker ?? def.dialogue.speaker), lines: [line] };
}

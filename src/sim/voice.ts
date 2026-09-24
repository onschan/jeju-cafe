/**
 * 손님 목소리 (trim의 ★ 추가): 손님이 나갈 때마다 한 줄 후기가 쌓인다.
 *
 * - 불만 4사유(자리 없음·기다림·비쌈·더러움)는 reputation.addComplaint가, 좋은 말은 guests가 넣는다 —
 *   월말 카드·매력도 패널의 병목과 같은 데이터다.
 * - 같은 날·같은 사유는 한 줄로 묶어 수를 센다 ("3명이 자리가 없어 돌아갔어요").
 * - 하루 최대 VOICE_DAY_MAX줄. 줄마다 원인 칸(cell)과 해결 버튼(fix)이 붙어 UI가 카메라를 옮기고 창을 연다.
 * - 결정적: rng·Date를 쓰지 않는다.
 */
import type { GameState, Pt } from './types.ts';
import { dayIndex } from './effects.ts';
import { objectDef, guestTypeDef } from '../data/index.ts';
import { fmtNum } from './format.ts';
import { wearOf } from './cleanliness.ts';
import { siteOf } from './site.ts';
import { josa } from './josa.ts';

export type VoiceReason = 'no_seat' | 'wait_long' | 'expensive' | 'dirty' | 'view' | 'corner';
/** 해결 버튼이 여는 것 */
export type VoiceFix = 'seat' | 'staff' | 'menu' | 'clean' | 'none';

export interface VoiceLine {
  id: string;
  reason: VoiceReason;
  count: number;      // 같은 날 같은 사유를 말한 손님 수
  day: number;        // dayIndex
  tick: number;
  detail?: string;    // 메뉴 이름 · 시설 이름
  cell?: Pt;          // 원인 칸 (카메라가 갈 곳)
}

/** 하루에 쌓이는 줄 수 */
export const VOICE_DAY_MAX = 8;
/** 보관하는 줄 수 (피드는 최근 몇 줄만 보여 준다) */
export const VOICE_CAP = 16;

export const VOICE_FIX: Record<VoiceReason, VoiceFix> = {
  no_seat: 'seat', wait_long: 'staff', expensive: 'menu', dirty: 'clean', view: 'none', corner: 'none',
};
export const VOICE_FIX_LABEL: Record<VoiceFix, string> = {
  seat: '자리 늘리기', staff: '직원 보기', menu: '메뉴판 열기', clean: '치우러 가기', none: '',
};

/** 한 줄 문구 (수를 센다) */
export function voiceText(v: VoiceLine): string {
  const n = v.count;
  switch (v.reason) {
    case 'no_seat': return n > 1 ? `${n}명이 자리가 없어 돌아갔어요` : '자리가 없어서 그냥 갔어요';
    case 'wait_long': return n > 1 ? `${n}명이 오래 기다렸어요` : '5분 기다렸어요';
    case 'expensive': return v.detail ? `${josa(v.detail, '이/가')} 비싸요` : '비싸요';
    case 'dirty': return v.detail ? `${josa(v.detail, '이/가')} 낡고 지저분해요` : '카페가 지저분해요';
    case 'view': return '바다 보이는 자리 최고예요';
    case 'corner': return v.detail ? `${v.detail}에서 사진 찍었어요` : '사진 찍을 데가 많아요';
  }
}

function list(state: GameState): VoiceLine[] {
  return (state.voices ??= []);
}
/** 오늘 쌓인 줄 수 */
export function voicesToday(state: GameState): number {
  const today = dayIndex(state.clock);
  return list(state).filter((v) => v.day === today).reduce((n, v) => n + v.count, 0);
}

/** 한 줄 추가 (같은 날 같은 사유는 묶는다). 하루 상한을 넘으면 묶기만 하고 새 줄은 안 만든다. */
export function pushVoice(state: GameState, reason: VoiceReason, detail?: string, cell?: Pt): void {
  const arr = list(state);
  const today = dayIndex(state.clock);
  const same = arr.find((v) => v.day === today && v.reason === reason && v.detail === detail);
  if (same) {
    same.count++;
    same.tick = state.tick;
    if (cell) same.cell = cell;
    return;
  }
  if (voicesToday(state) >= VOICE_DAY_MAX) return;
  arr.push({ id: `v${state.nextId++}`, reason, count: 1, day: today, tick: state.tick, detail, cell });
  while (arr.length > VOICE_CAP) arr.shift();
}

/** 피드에 보여 줄 줄 (최근 것부터 n개).
 *  uifix: 날짜만 다른 같은 말(같은 사유·같은 대상)은 한 줄로 — 세 줄이 「감귤 창고 앞에서 사진 찍었어요」로
 *  똑같이 보이던 것을 막는다. 가장 최근 줄만 남긴다(수도 그날 것). 상태는 건드리지 않는다. */
export function recentVoices(state: GameState, n = 3): VoiceLine[] {
  const out: VoiceLine[] = [];
  const seen = new Set<string>();
  for (const v of [...list(state)].reverse()) {
    const key = `${v.reason}|${v.detail ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

// ---------- 손님 영수증 한 줄 (video P0-5) ----------

/** 손님 하나가 나갈 때 남는 한 줄: 〈얼굴 · 손님층 · 인기 +N · ₩N〉.
 *  한 칸짜리 슬롯이라 다음 손님이 오면 바로 교체된다 — 알림 링버퍼(NOTICE_CAP)는 안 건드린다. */
export interface Receipt {
  /** 바뀐 걸 UI가 알아채는 번호 (오브젝트 id와 무관하게 1씩) */
  id: number;
  typeId: string;
  /** 인기 게이지 변화 (음수면 동네 쪽) */
  rep: number;
  /** 이 손님이 낸 돈 */
  paid: number;
}

/** 영수증 한 줄이 화면에 머무는 시간 */
export const RECEIPT_MS = 2000;

/** 영수증 한 줄을 남긴다 (돈을 낸 손님만). 러시 중에는 부르지 않는다 — HUD가 이미 꽉 찼다. */
export function pushReceipt(state: GameState, typeId: string, rep: number, paid: number): void {
  if (paid <= 0) return;
  state.receipt = { id: (state.receipt?.id ?? 0) + 1, typeId, rep, paid };
}

/** 영수증 한 줄 문구 — 「대학생 · 인기 +2 · ₩4,500」. 얼굴은 UI가 앞에 붙인다. */
export function receiptText(r: Receipt): string {
  const name = guestTypeDef(r.typeId).name;
  const rep = r.rep === 0 ? '' : ` · 인기 ${r.rep > 0 ? '+' : '−'}${Math.abs(r.rep)}`;
  return `${name}${rep} · ₩${fmtNum(r.paid)}`;
}

// ---------- 원인 칸 찾기 ----------

/** 가장 붐비는 좌석 구역: 손님이 가장 많이 앉아 있는 좌석. 없으면 아무 좌석. */
export function busiestSeat(state: GameState): Pt | undefined {
  const count = new Map<string, number>();
  for (const g of state.guests) if (g.seatId) count.set(g.seatId, (count.get(g.seatId) ?? 0) + 1);
  let best: { id: string; n: number } | null = null;
  for (const [id, n] of count) if (!best || n > best.n || (n === best.n && id < best.id)) best = { id, n };
  const o = best ? state.objects[best.id] : Object.values(state.objects).find((x) => objectDef(x.type).kind === 'seat');
  return o ? { x: o.x, y: o.y } : undefined;
}
/** 가장 낡은(청결이 나쁜) 시설 */
export function dirtiestObject(state: GameState): { cell: Pt; name: string } | undefined {
  let best: { o: { x: number; y: number; type: string }; w: number } | null = null;
  for (const o of Object.values(state.objects)) {
    if (o.build) continue;
    const w = wearOf(state, o);
    if (w <= 0) continue;
    if (!best || w > best.w) best = { o, w };
  }
  return best ? { cell: { x: best.o.x, y: best.o.y }, name: objectDef(best.o.type).name } : undefined;
}
/** 전망이 가장 좋은 좌석 (좋은 말의 원인 칸) */
export function bestViewSeat(state: GameState): Pt | undefined {
  let best: { o: { x: number; y: number }; v: number } | null = null;
  for (const o of Object.values(state.objects)) {
    if (o.build || objectDef(o.type).kind !== 'seat') continue;
    const v = siteOf(state, o.x, o.y).view;
    if (!best || v > best.v) best = { o, v };
  }
  return best && best.v > 0 ? { x: best.o.x, y: best.o.y } : undefined;
}

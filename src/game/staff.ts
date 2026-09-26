/** 직원: 후보 3명(매달 새로), 서비스 1~5 · 월급. 서비스 합이 손님 회전과 만족을 올린다. 최대 6. */
import type { GameState, Candidate, ApplyResult } from './types.ts';
import { randInt, nextRandom } from './rng.ts';
import { monthIndex } from './clock.ts';

export const STAFF_MAX = 6;
const NAMES = ['이서연', '김도윤', '박하늘', '고은별', '양지훈', '문소희', '현우진', '강다혜', '오세라', '부민재', '홍바다', '송이랑'];
export function refreshCandidates(s: GameState): void {
  const mi = monthIndex(s.clock);
  if (s.candidatesMonth === mi) return;
  s.candidatesMonth = mi;
  s.candidates = [];
  for (let i = 0; i < 3; i++) {
    const service = randInt(s, 1, Math.min(5, 2 + Math.floor(s.fame / 60)));
    s.candidates.push({ id: `c${mi}_${i}`, name: NAMES[Math.floor(nextRandom(s) * NAMES.length)]!, service, wage: 400_000 + service * 150_000, until: mi, face: { hair: randInt(s, 0, 7), skin: randInt(s, 0, 2), top: randInt(s, 0, 7) } });
  }
}
export function canHire(s: GameState, cid: string): ApplyResult {
  const c = s.candidates.find((x) => x.id === cid);
  if (!c) return { ok: false, reason: '없는 후보예요' };
  if (s.staff.length >= STAFF_MAX) return { ok: false, reason: `직원은 ${STAFF_MAX}명까지예요` };
  if (s.money < c.wage) return { ok: false, reason: '첫 달 월급이 없어요' };
  return { ok: true };
}
export function hire(s: GameState, cid: string): void {
  const c = s.candidates.find((x) => x.id === cid) as Candidate;
  s.candidates = s.candidates.filter((x) => x.id !== cid);
  const { until: _u, ...st } = c; void _u;
  s.staff.push({ ...st, id: `s${s.nextId++}` });
}
export function wagesTotal(s: GameState): number { return s.staff.reduce((n, st) => n + st.wage, 0); }

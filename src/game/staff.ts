/** 직원: 후보 3명(매달 새로), 능력 4가지(접객·손놀림·정리·매력 1~10) · 월급. 최대 6.
 *  접객 → 손님 만족, 손놀림 → 자리 회전, 정리 → 깔끔 점수, 매력 → 입소문(명성). 등급 S(9~10) A(7~8) B(5~6) C(3~4) D(2) E(1). */
import type { GameState, Candidate, Staff, ApplyResult } from './types.ts';
import { randInt, nextRandom } from './rng.ts';
import { monthIndex } from './clock.ts';

export const STAFF_MAX = 6;
export const SKILLS = ['service', 'speed', 'clean', 'charm'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_KO: Record<Skill, string> = { service: '접객', speed: '손놀림', clean: '정리', charm: '매력' };
export const SKILL_DESC: Record<Skill, string> = { service: '손님 만족', speed: '자리 회전', clean: '깔끔 점수', charm: '입소문(명성)' };
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';
export function gradeOf(v: number): Grade { return v >= 9 ? 'S' : v >= 7 ? 'A' : v >= 5 ? 'B' : v >= 3 ? 'C' : v >= 2 ? 'D' : 'E'; }
export function skillSum(st: Staff): number { return st.service + st.speed + st.clean + st.charm; }
/** 월급 = 기본 30만 + 능력 합 × 4만 */
export function wageOf(st: Pick<Staff, 'service' | 'speed' | 'clean' | 'charm'>): number { return 300_000 + (st.service + st.speed + st.clean + st.charm) * 40_000; }
const NAMES = ['이서연', '김도윤', '박하늘', '고은별', '양지훈', '문소희', '현우진', '강다혜', '오세라', '부민재', '홍바다', '송이랑'];
export function refreshCandidates(s: GameState): void {
  const mi = monthIndex(s.clock);
  if (s.candidatesMonth === mi) return;
  s.candidatesMonth = mi;
  s.candidates = [];
  const cap = Math.min(10, 4 + Math.floor(s.fame / 60)); // 명성이 오르면 좋은 사람이 온다
  for (let i = 0; i < 3; i++) {
    // 한 가지는 두드러지게 (전문 분야), 나머지는 낮게 — 고르는 재미
    const star = SKILLS[Math.floor(nextRandom(s) * 4)]!;
    const v: Record<Skill, number> = { service: 0, speed: 0, clean: 0, charm: 0 };
    for (const k of SKILLS) v[k] = k === star ? randInt(s, Math.min(cap, 4), cap) : randInt(s, 1, Math.max(2, cap - 3));
    s.candidates.push({ id: `c${mi}_${i}`, name: NAMES[Math.floor(nextRandom(s) * NAMES.length)]!, ...v, wage: wageOf(v), until: mi, face: { hair: randInt(s, 0, 7), skin: randInt(s, 0, 2), top: randInt(s, 0, 7) } });
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
/** 능력 합 (전 직원) */
export function staffSkill(s: GameState, k: Skill): number { return s.staff.reduce((n, st) => n + st[k], 0); }

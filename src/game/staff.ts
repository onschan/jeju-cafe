/** 직원: 채용 루트로 공고를 내면 며칠 뒤 후보가 온다. 능력 4가지(접객·손놀림·정리·매력 1~10, 등급 S~E)와 담당.
 *  담당한 능력은 그대로, 나머지는 1/4만 쓰인다 — 잘하는 자리에 앉히는 게 요령. */
import type { GameState, Candidate, Staff, ApplyResult } from './types.ts';
import { randInt, nextRandom } from './rng.ts';

export const STAFF_MAX = 6;
export const SKILLS = ['service', 'speed', 'clean', 'charm'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_KO: Record<Skill, string> = { service: '접객', speed: '손놀림', clean: '정리', charm: '매력' };
/** 담당 이름 (그 능력을 맡는 자리) */
export const DUTY_KO: Record<Skill, string> = { service: '홀 접객', speed: '바(제조)', clean: '정리·청소', charm: '홍보·간판' };
export const SKILL_DESC: Record<Skill, string> = { service: '손님 만족', speed: '자리 회전', clean: '깔끔 점수', charm: '입소문(명성)' };
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';
export function gradeOf(v: number): Grade { return v >= 10 ? 'S' : v >= 8 ? 'A' : v >= 6 ? 'B' : v >= 4 ? 'C' : v >= 2 ? 'D' : 'E'; }
/** 담당이면 그대로, 아니면 1/4 */
export function effSkill(st: Staff, k: Skill): number { return st.duty === k ? st[k] : st[k] * 0.25; }
export function skillSum(st: Pick<Staff, Skill>): number { return st.service + st.speed + st.clean + st.charm; }
/** 월급 = 기본 25만 + 능력 합 × 4만 (S급은 비싸다) */
export function wageOf(st: Pick<Staff, Skill>): number { return 250_000 + skillSum(st) * 40_000; }
/** 가장 잘하는 능력 */
export function bestSkill(st: Pick<Staff, Skill>): Skill { return [...SKILLS].sort((a, b) => st[b] - st[a])[0]!; }

export interface ChannelDef {
  id: string; name: string; desc: string; cost: number; days: number; n: number;
  lo: number; hi: number;   // 두드러진 능력의 범위
  bias: number;             // 클수록 낮은 값이 잘 나온다 (1 = 고름)
  sChance: number;          // S급(10)이 뜰 확률
  fame?: number;            // 공고 자체가 올리는 명성
  needFame?: number;        // 이 명성부터 쓸 수 있다
}
/** 채용 루트 — 값이 비싸고 오래 걸릴수록 좋은 사람이 온다. S급은 어디서든 희박하다. */
export const CHANNELS: ChannelDef[] = [
  { id: 'intro', name: '지인 소개', desc: '삼춘이 아는 사람을 불러 준다', cost: 50_000, days: 2, n: 2, lo: 1, hi: 5, bias: 1.6, sChance: 0 },
  { id: 'flyer', name: '전단지', desc: '동네에 돌린다', cost: 150_000, days: 3, n: 3, lo: 2, hi: 7, bias: 1.8, sChance: 0.005 },
  { id: 'posting', name: '대규모 채용공고', desc: '구인 사이트에 크게 낸다', cost: 700_000, days: 7, n: 5, lo: 3, hi: 9, bias: 1.5, sChance: 0.02, needFame: 60 },
  { id: 'headhunter', name: '헤드헌터', desc: '경력자를 콕 집어 데려온다', cost: 2_500_000, days: 10, n: 2, lo: 6, hi: 10, bias: 1.2, sChance: 0.1, needFame: 200 },
  { id: 'tv', name: 'TV 광고', desc: '카페도 알리고 사람도 모은다', cost: 6_000_000, days: 14, n: 6, lo: 4, hi: 10, bias: 1.4, sChance: 0.05, fame: 20, needFame: 400 },
];
export function channelDef(id: string): ChannelDef { const c = CHANNELS.find((x) => x.id === id); if (!c) throw new Error(`unknown channel: ${id}`); return c; }

const NAMES = ['이서연', '김도윤', '박하늘', '고은별', '양지훈', '문소희', '현우진', '강다혜', '오세라', '부민재', '홍바다', '송이랑', '진가온', '허슬기', '좌민호'];
/** 치우친 주사위: bias가 클수록 낮은 값이 잘 나온다 */
function biased(s: GameState, lo: number, hi: number, bias: number): number {
  const r = nextRandom(s) ** bias;
  return Math.max(lo, Math.min(hi, lo + Math.floor(r * (hi - lo + 1))));
}
/** 후보 한 명: 한 가지가 두드러지고 나머지는 낮다 (전문 분야) */
function makeCandidate(s: GameState, ch: ChannelDef, i: number): Candidate {
  const star = SKILLS[Math.floor(nextRandom(s) * SKILLS.length)]!;
  const v = { service: 0, speed: 0, clean: 0, charm: 0 } as Record<Skill, number>;
  const top = nextRandom(s) < ch.sChance ? 10 : biased(s, ch.lo, Math.min(ch.hi, 9), ch.bias);
  for (const k of SKILLS) v[k] = k === star ? top : biased(s, 1, Math.max(2, Math.floor(top * 0.7)), 2);
  return { id: `c${s.nextId++}_${i}`, name: NAMES[Math.floor(nextRandom(s) * NAMES.length)]!, ...v, duty: star, wage: wageOf(v), until: 30, from: ch.id, served: 0, happy: 0, month: { served: 0, happy: 0 }, face: { hair: randInt(s, 0, 7), skin: randInt(s, 0, 2), top: randInt(s, 0, 7) } };
}
export function canRecruit(s: GameState, id: string): ApplyResult {
  const ch = CHANNELS.find((x) => x.id === id);
  if (!ch) return { ok: false, reason: '없는 채용 루트예요' };
  if (s.hiring) return { ok: false, reason: '이미 채용 중이에요' };
  if (ch.needFame && s.fame < ch.needFame) return { ok: false, reason: `명성 ${ch.needFame}부터 쓸 수 있어요` };
  if (s.money < ch.cost) return { ok: false, reason: '돈이 모자라요' };
  return { ok: true };
}
export function recruit(s: GameState, id: string): void {
  const ch = channelDef(id);
  s.money -= ch.cost; s.month.spent += ch.cost;
  if (ch.fame) s.fame += ch.fame;
  s.hiring = { channel: id, daysLeft: ch.days };
  s.fx.push({ kind: 'notice', text: `${ch.name} — ${ch.days}일 뒤 후보가 와요` });
}
/** 하루가 지날 때: 공고 진행, 후보 만료 */
export function tickHiring(s: GameState): void {
  if (s.hiring) {
    s.hiring.daysLeft--;
    if (s.hiring.daysLeft <= 0) {
      const ch = channelDef(s.hiring.channel);
      s.candidates = Array.from({ length: ch.n }, (_, i) => makeCandidate(s, ch, i));
      s.hiring = null;
      const best = Math.max(...s.candidates.map((c) => Math.max(c.service, c.speed, c.clean, c.charm)));
      s.fx.push({ kind: 'notice', text: `${ch.name} — 후보 ${ch.n}명 도착 (최고 ${gradeOf(best)}급)` });
    }
  }
  for (const c of s.candidates) c.until--;
  s.candidates = s.candidates.filter((c) => c.until > 0);
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
  const { until: _u, from: _f, ...st } = c; void _u; void _f;
  s.staff.push({ ...st, id: `s${s.nextId++}`, duty: bestSkill(c) });
}
export function wagesTotal(s: GameState): number { return s.staff.reduce((n, st) => n + st.wage, 0); }
/** 담당까지 셈한 능력 합 (전 직원) */
export function staffSkill(s: GameState, k: Skill): number { return s.staff.reduce((n, st) => n + effSkill(st, k), 0); }
/** 이번 손님을 맡을 홀 직원 (접객 담당끼리 돌아가며) */
export function serverFor(s: GameState): Staff | null {
  const hall = s.staff.filter((st) => st.duty === 'service');
  if (hall.length === 0) return null;
  return hall[s.stats.guests % hall.length]!;
}

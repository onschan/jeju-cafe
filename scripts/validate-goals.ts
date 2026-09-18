/**
 * goals.json(108)·challenges.json(40)의 참조 id 검증 (스펙 §5 트랙 B 머지 조건).
 * - unlockFacility → facilities.json(+ facilities_x.json이 있으면) / objects.json id 존재
 * - unlockMenu → menus.json + extra_menus.json, spotLevel → spots.json, trainings 조건 → trainings.json(있으면), unlockRole/staffSlot → staff_roles.json,
 *   item/seed → items.json + special_items.json, unlockGuest/guestType → guests.json, guidebook → guidebooks.json, unlockRecruit → recruit_tiers.json
 * - 해금 선후 모순: 조건이 참조하는 시설/메뉴가 목표 보상으로 열린다면 그 목표가 더 앞에 있어야 한다.
 * 사용: pnpm tsx scripts/validate-goals.ts [--strict]   (기본은 경고만 exit 0, --strict면 문제가 있으면 exit 1 — 통합 때 strict로)
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname ?? '.', '..');
const strict = process.argv.includes('--strict');
const read = <T>(p: string): T => JSON.parse(readFileSync(resolve(root, p), 'utf8')) as T;
const ids = (p: string): Set<string> => existsSync(resolve(root, p)) ? new Set((read<{ id: string }[]>(p)).map((x) => x.id)) : new Set();

type Cond = { type: string; menuId?: string; spotId?: string; guestId?: string; bookId?: string };
type Reward = { type: string; id?: string; role?: string; kind?: string };
type Goal = { id: string; title: string; condition: Cond; reward: Reward[] };
type Challenge = Goal & { requires?: number };

const goals = read<Goal[]>('src/data/goals.json');
const challenges = read<Challenge[]>('src/data/challenges.json');
const facilities = new Set([...ids('src/data/generated/v2/facilities.json'), ...ids('src/data/generated/v2/facilities_x.json'), ...ids('src/data/objects.json'), ...ids('src/data/generated/objects.json')]);
const menus = new Set([...ids('src/data/menus.json'), ...ids('src/data/generated/v2/extra_menus.json')]);
const spots = ids('src/data/generated/v2/spots.json');
const roles = ids('src/data/staff_roles.json');
const items = new Set([...ids('src/data/generated/v2/items.json'), ...ids('src/data/generated/v2/special_items.json'), ...ids('src/data/generated/items.json')]);
const guests = ids('src/data/generated/v2/guests.json');
const guidebooks = ids('src/data/generated/v2/guidebooks.json');
const recruits = ids('src/data/generated/v2/recruit_tiers.json');
const trainings = existsSync(resolve(root, 'src/data/trainings.json')) || existsSync(resolve(root, 'src/data/generated/v2/trainings.json'));

const problems: string[] = [];
const warn = (s: string) => problems.push(s);

function checkRefs(kind: string, g: Goal) {
  const c = g.condition;
  const tag = `${kind} ${g.id}(${g.title})`;
  if (c.menuId && !menus.has(c.menuId)) warn(`${tag}: 조건 menuId '${c.menuId}' 없음`);
  if (c.spotId && !spots.has(c.spotId)) warn(`${tag}: 조건 spotId '${c.spotId}' 없음`);
  if (c.guestId && !guests.has(c.guestId)) warn(`${tag}: 조건 guestId '${c.guestId}' 없음`);
  if (c.bookId && !guidebooks.has(c.bookId)) warn(`${tag}: 조건 bookId '${c.bookId}' 없음`);
  if ((c.type === 'trainings' || c.type === 'training') && !trainings) warn(`${tag}: 조건 trainings — trainings.json 아직 없음 (x-staff)`);
  for (const r of g.reward) {
    switch (r.type) {
      case 'unlockFacility': if (!facilities.has(r.id!)) warn(`${tag}: 보상 시설 '${r.id}' 없음 (x-facility)`); break;
      case 'unlockMenu': if (!menus.has(r.id!)) warn(`${tag}: 보상 메뉴 '${r.id}' 없음`); break;
      case 'unlockRole': if (!roles.has(r.id!)) warn(`${tag}: 보상 직종 '${r.id}' 없음 (x-staff)`); break;
      case 'staffSlot': if (!roles.has(r.role!)) warn(`${tag}: 보상 슬롯 직종 '${r.role}' 없음 (x-staff)`); break;
      case 'item': if (!items.has(r.id!)) warn(`${tag}: 보상 아이템 '${r.id}' 없음 (x-items)`); break;
      case 'seed': if (!items.has(r.kind!)) warn(`${tag}: 보상 씨앗 '${r.kind}' 없음 (x-items)`); break;
      case 'unlockGuest': if (!guests.has(r.id!)) warn(`${tag}: 보상 손님 '${r.id}' 없음`); break;
      case 'unlockGuidebook': if (!guidebooks.has(r.id!)) warn(`${tag}: 보상 가이드북 '${r.id}' 없음`); break;
      case 'unlockRecruit': if (!recruits.has(r.id!)) warn(`${tag}: 보상 채용 등급 '${r.id}' 없음`); break;
    }
  }
}
for (const g of goals) checkRefs('goal', g);
for (const c of challenges) checkRefs('challenge', c);

// 해금 선후: 조건이 쓰는 메뉴(menuSold)가 목표 보상으로 열리면 그 목표가 앞에 있어야 한다
const menuOpener = new Map<string, number>();
const facilityOpener = new Map<string, number>();
goals.forEach((g, i) => { for (const r of g.reward) { if (r.type === 'unlockMenu') menuOpener.set(r.id!, i); if (r.type === 'unlockFacility') facilityOpener.set(r.id!, i); } });
goals.forEach((g, i) => {
  const m = g.condition.menuId;
  if (m && menuOpener.has(m) && menuOpener.get(m)! >= i) warn(`goal ${g.id}: 조건 메뉴 '${m}'를 여는 목표(${goals[menuOpener.get(m)!]!.id})가 뒤에 있음`);
});
// 기능 선후: 액션 잠금 기능이 필요한 조건은 그 기능을 여는 목표 뒤에
const featureOpener = new Map<string, number>();
goals.forEach((g, i) => { for (const r of g.reward) if (r.type === 'unlockFeature') featureOpener.set(r.id!, i); });
const NEEDS: Record<string, string> = { promotions: 'promote', parcels: 'parcel', rocks: 'clearRock', recipes: 'craft', namedGuest: 'popup', rivalWins: 'challenge' };
goals.forEach((g, i) => {
  const f = NEEDS[g.condition.type];
  if (f && (featureOpener.get(f) ?? -1) >= i && g.condition.type !== 'parcels') warn(`goal ${g.id}: 조건 '${g.condition.type}'에 필요한 기능 '${f}'를 여는 목표가 뒤에 있음`);
  if (f === 'parcel' && (featureOpener.get(f) ?? -1) >= i) warn(`goal ${g.id}: 필지 구매 기능이 뒤에서 열림`);
});
// 도전 requires는 목표 개수 안
for (const c of challenges) if ((c.requires ?? 0) > goals.length) warn(`challenge ${c.id}: requires ${c.requires} > 목표 ${goals.length}`);
// 중복 id
for (const [name, list] of [['goal', goals], ['challenge', challenges]] as const) {
  const seen = new Set<string>();
  for (const g of list) { if (seen.has(g.id)) warn(`${name} id 중복: ${g.id}`); seen.add(g.id); }
}

const missingFacilities = new Set(problems.filter((p) => p.includes('보상 시설')).map((p) => /'([^']+)'/.exec(p)?.[1]));
console.log(`validate-goals: 목표 ${goals.length} · 도전 ${challenges.length} · 문제 ${problems.length}${missingFacilities.size ? ` (없는 시설 ${missingFacilities.size}종)` : ''}`);
for (const p of problems) console.log(`  ${strict ? 'ERROR' : 'WARN'} ${p}`);
if (strict && problems.length > 0) process.exit(1);

/** id → 한글 이름 헬퍼 (스펙 §4.4). UI 어디에도 `q_local_uncle`, `americano` 같은 id가 보이지 않게 한다.
 *  모든 데이터 소스를 뒤져 이름을 찾고, 없으면 '?' 대신 id를 사람이 읽을 형태('local uncle')로 돌려준다.
 *  sim 런타임에는 의존하지 않는다(타입만) — 트랙 A가 sim을 바꾸는 중이라 데이터만 본다. */
import type { MenuDef, ObjectDef, UnlockCond, QuestReward, QuestCondition } from '../sim/types.ts';
import {
  MENUS, OBJECTS, INGREDIENTS, GUEST_TYPES, ROLES, ITEMS, QUESTS, SPOTS, SKILLS, PROMOTIONS,
  INGREDIENT_CATEGORY_NAME, MENU_STAT_LABEL, canonicalGuestId,
} from './index.ts';
import extraMenusJson from './generated/v2/extra_menus.json' with { type: 'json' };

export type LabelKind = 'menu' | 'facility' | 'ingredient' | 'guest' | 'role' | 'item' | 'quest' | 'spot' | 'skill' | 'promotion' | 'stat' | 'category';

/** 직원 스탯 4 (sim/staff.ts STAT_NAME과 같은 값 — sim 의존을 피하려고 여기 둔다) */
const STAFF_STAT_LABEL: Record<string, string> = { stamina: '체력', strength: '힘', skill: '기술', smile: '미소' };
/** 메뉴·시설·재료·관광지 분류 한글 (키가 서로 겹치지 않는다) */
const CATEGORY_LABEL: Record<string, string> = {
  // 메뉴
  drink: '음료', dessert: '디저트', meal: '식사', signature: '시그니처',
  // 시설
  rest: '쉼', convenience: '편의', food: '먹거리', fun: '즐길거리', farm: '농원', scenery: '경관', landmark: '랜드마크', path: '길', wall: '담',
  // 관광지
  sight: '볼거리', play: '놀거리', nature: '자연',
  ...INGREDIENT_CATEGORY_NAME,
};

type Named = { id: string; name: string };
const byId = (xs: readonly Named[]): Map<string, string> => new Map(xs.map((x) => [x.id, x.name]));

let tables: Record<LabelKind, Map<string, string>> | null = null;
function table(kind: LabelKind): Map<string, string> {
  if (!tables) {
    const menu = byId(MENUS);
    for (const m of extraMenusJson as { id: string; name: string }[]) if (!menu.has(m.id)) menu.set(m.id, m.name);
    const ingredient = byId(INGREDIENTS);
    const guest = byId(GUEST_TYPES);
    // 부탁은 이름이 없어 "OO의 부탁"으로 부른다
    const quest = new Map<string, string>();
    for (const q of QUESTS) quest.set(q.id, `${guest.get(q.guestId) ?? humanize(q.guestId)}의 부탁`);
    tables = {
      menu,
      facility: byId(OBJECTS),
      ingredient,
      guest,
      role: byId(ROLES),
      item: byId(ITEMS),
      quest,
      spot: byId(SPOTS),
      skill: byId(SKILLS),
      promotion: byId(PROMOTIONS),
      stat: new Map(Object.entries({ ...STAFF_STAT_LABEL, ...MENU_STAT_LABEL })),
      category: new Map(Object.entries(CATEGORY_LABEL)),
    };
  }
  return tables[kind];
}

/** id를 사람이 읽을 형태로: 접두어(q_·ev_·ng)와 밑줄을 걷어낸다. 'q_local_uncle' → 'local uncle'. 한글이면 그대로. */
export function humanize(id: string): string {
  if (/[가-힣]/.test(id)) return id;
  return id.replace(/^(q|ev|cb|gb|ts|ms|ng|m_custom)_/, '').replace(/_/g, ' ').trim() || id;
}

/** kind의 id → 한글 이름. 없으면 다른 종류 표도 뒤지고, 그래도 없으면 humanize(id). */
export function label(kind: LabelKind, id: string): string {
  const key = kind === 'guest' ? canonicalGuestId(id) : id;
  const hit = table(kind).get(key);
  if (hit) return hit;
  for (const k of ['menu', 'facility', 'ingredient', 'guest', 'item', 'spot', 'role', 'skill', 'promotion', 'quest', 'stat', 'category'] as LabelKind[]) {
    if (k === kind) continue;
    const v = table(k).get(key);
    if (v) return v;
  }
  return humanize(id);
}

/** 영문 id 토큰이 섞여 있나 (테스트·폴백 판정용). 'ㅇㅇ americano ㅇㅇ'·'q_local_uncle' → true */
export function hasIdToken(text: string): boolean {
  return /(^|[^A-Za-z])[a-z][a-z0-9]*_[a-z0-9_]+(?![A-Za-z])/.test(text) || /^[a-z0-9_]+$/.test(text.trim());
}

/** 돈 표기 단일 함수 (UX §5.4, 로케일 무관). 카드·목록 = `₩1,240,000`, short(상단 바·요약) = 1만 이상 만 단위 내림 `₩124만`, 1억 이상 `₩1.2억`. 음수 = `−₩…` */
export function wonText(n: number, short = false): string {
  const neg = n < 0 ? '−' : '';
  const a = Math.round(Math.abs(n));
  if (short && a >= 100_000_000) return `${neg}₩${(Math.floor(a / 10_000_000) / 10).toFixed(a % 100_000_000 >= 10_000_000 ? 1 : 0)}억`;
  if (short && a >= 10_000) return `${neg}₩${groupDigits(Math.floor(a / 10_000))}만`;
  return `${neg}₩${groupDigits(a)}`;
}
function groupDigits(a: number): string { return a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// ---------- 메뉴 ----------
/** "바리스타 필요" / "커피 장인 필요". 조건 없으면 null. */
export function requireText(menu: Pick<MenuDef, 'requires'>): string | null {
  const req = menu.requires;
  if (!req) return null;
  const parts: string[] = [];
  if (req.role) parts.push(label('role', req.role));
  if (req.skill) parts.push(label('skill', req.skill));
  return parts.length > 0 ? `${parts.join('·')} 필요` : null;
}

/** "감귤 1 · 우유 1" */
export function ingredientsText(menu: Pick<MenuDef, 'ingredients'>): string {
  return Object.entries(menu.ingredients).map(([id, n]) => `${label('ingredient', id)} ${n}`).join(' · ');
}

// ---------- 해금 ----------
/** UnlockCond → 핵심 구절 ("손님 50명 맞이", "랭크 2"). 문장은 unlockText가 붙인다. */
export function unlockCondText(c: UnlockCond): string {
  switch (c.type) {
    case 'start': return '처음부터';
    case 'rank': return RANK_CLAUSE; // 랭크(1~10) 숫자는 UI에 안 쓴다
    case 'star': return `★${c.star}`;
    case 'segment': return `${label('guest', c.guestId)} 손님 만족 ${c.satisfaction}`;
    case 'quest': return `${label('quest', c.questId)} 완료`;
    case 'spot': return `${label('spot', c.spotId)} ${c.level}단계`;
    case 'date': return `${c.year}년 ${c.month}월`;
    case 'count': return `${label('facility', c.objectId)} ${c.count}개`;
    case 'category': return `${label('category', c.category)} 시설 ${c.count}개`;
    case 'segmentPop': return `${label('guest', c.guestId)} 손님 인지도 ${c.popularity}`;
    case 'goal': return '목표 보상';
    case 'all': return c.conditions.length > 0 ? c.conditions.map(unlockCondText).join(' + ') : '아직 열 수 없음';
    case 'any': return c.conditions.length > 0 ? c.conditions.map(unlockCondText).join(' 또는 ') : '아직 열 수 없음';
  }
}

/** 잠긴 시설·메뉴 카드용 문장: "손님 50명 맞이하면 열려요". 조건이 없으면 목표(트랙 A)가 여는 것으로 안내한다. */
/** 랭크(1~10) 숫자는 플레이어에게 안 보인다 — 진척 지표는 등급과 ★ 둘뿐. 생성 데이터의 「랭크 n」 문구도 같은 말로 바꾼다. */
export const RANK_CLAUSE = '카페가 더 알려지면';
export function scrubRank(text: string): string {
  return text.replace(/랭크\s*\d+\s*(위|단계)?/g, RANK_CLAUSE).trim();
}
export function unlockText(def: Pick<ObjectDef, 'unlock' | 'unlockText'> | { unlock?: UnlockCond; unlockText?: string }): string {
  const c = def.unlock;
  if (c && c.type !== 'start') {
    if (c.type === 'goal') return '목표를 이루면 열려요';
    if (c.type === 'rank') return `${RANK_CLAUSE} 열려요`; // 랭크 숫자는 안 보여 준다
    if (c.type === 'all' && c.conditions.length === 0) return '아직 열 수 없어요';
    return `${ifClause(unlockCondText(c))} 열려요`;
  }
  if (c?.type === 'start') return '처음부터 열려 있어요';
  if (def.unlockText && !hasIdToken(def.unlockText)) {
    const scrubbed = scrubRank(def.unlockText);
    return scrubbed === def.unlockText ? `${ifClause(def.unlockText)} 열려요` : `${scrubbed} 열려요`;
  }
  return '목표를 이루면 열려요';
}

/** 숫자로 끝나면 읽는 소리(영·일·이·삼…)의 받침으로 판정한다 */
const DIGIT_BATCHIM = [true, true, false, true, false, false, true, true, true, false];
function endsWithBatchim(word: string): boolean {
  const ch = word.trim().replace(/[)\]」』]+$/, '').slice(-1);
  if (/\d/.test(ch)) return DIGIT_BATCHIM[Number(ch)] ?? false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}
/** "X이면" / "X면" */
export function ifClause(word: string): string {
  return `${word}${endsWithBatchim(word) ? '이면' : '면'}`;
}

// ---------- 부탁·목표 조건/보상 ----------
/** 부탁(quests.json)과 목표(goals.json, 스펙 §2)의 조건을 한 함수로 받는다. params 안에 있든 평평하든 다 읽는다. */
export type LooseCondition = QuestCondition | { type: string; params?: Record<string, unknown>; [k: string]: unknown };
export type LooseReward = QuestReward | { type: string; [k: string]: unknown };

function param(c: LooseCondition, ...keys: string[]): unknown {
  const p = (c as { params?: Record<string, unknown> }).params ?? {};
  for (const k of keys) {
    if (p[k] !== undefined) return p[k];
    const v = (c as Record<string, unknown>)[k];
    if (v !== undefined) return v;
  }
  return undefined;
}
const num = (c: LooseCondition, ...keys: string[]): number => Number(param(c, ...keys) ?? 1) || 1;
const str = (c: LooseCondition, ...keys: string[]): string => String(param(c, ...keys) ?? '');

export function conditionText(c: LooseCondition): string {
  const n = () => num(c, 'n', 'count', 'amount', 'value');
  switch (c.type) {
    case 'menuSold': return `${label('menu', str(c, 'menuId', 'menu'))} ${n()}잔 팔기`;
    case 'menuOn': case 'menuSlot': return `${label('menu', str(c, 'menuId', 'menu'))} 메뉴판에 올리기`;
    case 'objectPlaced': return `${label('facility', str(c, 'objectId', 'facility', 'object'))} ${n()}개 놓기`;
    case 'spotLevel': return `${label('spot', str(c, 'spotId', 'spot'))} ${num(c, 'level')}단계까지 투자하기`;
    case 'segmentPopularity': return `${label('guest', str(c, 'guestId', 'guest'))} 손님 인지도 ${num(c, 'popularity', 'n')}`;
    case 'item': return `${label('item', str(c, 'itemId', 'item'))} ${n()}개 모으기`;
    case 'guests': return `손님 ${n()}명 맞이하기`;
    case 'money': return `자금 ${wonText(n())} 모으기`;
    case 'staff': return `직원 ${n()}명 채용하기`;
    case 'facilities': {
      const cat = param(c, 'cat', 'category');
      return `${cat ? `${label('category', String(cat))} ` : ''}시설 ${n()}개 짓기`;
    }
    case 'satisfied': return `만족한 손님 ${n()}명 만들기`;
    case 'parcels': return `필지 ${n()}개 사기`;
    case 'indoorSeats': return `실내 자리 ${n()}석 만들기`;
    case 'mainLevel': return `카페 Lv${n()}로 증축하기`;
    case 'gradeSeats': return `${str(c, 'grade')} 등급 자리 ${n()}개 만들기`;
    case 'rivalRank': return n() === 1 ? '동네 1위 하기' : `동네 ${n()}위 안에 들기`;
    case 'rank': return `랭크 ${n()}위 오르기`;
    case 'stars': case 'star': return `★${n()} 받기`;
    case 'regular': return `단골 ${n()}명 만들기`;
    case 'research': return `연구 포인트 ${n()} 모으기`;
    case 'namedGuest': return `이름 있는 손님 ${n()}명 만나기`;
    case 'promotion': case 'promote': return `홍보 ${n()}회 하기`;
    case 'recipe': case 'develop': return `레시피 ${n()}개 개발하기`;
    case 'menus': return `메뉴 ${n()}개 올리기`;
    case 'none': return '조건 없음';
    case 'custom': {
      const t = param(c, 'text', 'desc');
      return typeof t === 'string' ? t : humanize(str(c, 'id'));
    }
    default: {
      const t = param(c, 'text', 'desc');
      return typeof t === 'string' ? t : humanize(c.type);
    }
  }
}

function rewardOne(r: LooseReward): string {
  const o = r as Record<string, unknown>;
  const amount = Number(o.amount ?? o.n ?? o.count ?? 1) || 1;
  const id = String(o.id ?? o.itemId ?? o.menuId ?? o.objectId ?? o.facilityId ?? '');
  switch (r.type) {
    case 'money': return wonText(amount);
    case 'research': return `연구 ${amount}`;
    case 'ticket': case 'tickets': return `응모권 ${amount}장`;
    case 'mileage': return `마일리지 ${amount}`;
    case 'ad': return `홍보 효과 ${amount}`;
    case 'item': return label('item', String(o.itemId ?? id));
    case 'unlockFacility': return `${label('facility', String(o.facilityId ?? o.objectId ?? id))} 해금`;
    case 'unlockMenu': return `${label('menu', String(o.menuId ?? id))} 해금`;
    case 'unlockGuest': return `${label('guest', String(o.guestId ?? id))} 손님 등장`;
    case 'staffSlot': return `직원 자리 +${amount}`;
    case 'builder': return `건축가 +${amount}`;
    case 'star': return `★${amount} 심사`;
    case 'parcelDiscount': return '필지 할인권';
    default: {
      const t = o.text;
      return typeof t === 'string' ? t : humanize(r.type);
    }
  }
}

/** 보상 목록 → "₩200,000 · 연구 20". 비어 있으면 '없음'. */
export function rewardText(rewards: readonly LooseReward[]): string {
  if (rewards.length === 0) return '없음';
  return rewards.map(rewardOne).join(' · ');
}

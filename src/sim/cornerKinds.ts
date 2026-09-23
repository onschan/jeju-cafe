/**
 * 명당 조각 「종류」 (spot2, 사용자 피드백 "명당 조합에 파라솔 같은 게 왜 들어가 있나 — 업그레이드하면 풀리는 거 아님?").
 *
 * 맞는 지적이었다. 명당 조각이 **시설 id**면, 그 자리를 업그레이드(야외 테이블 → 파라솔 → 테라스 → 오름 뷰)하는 순간 명당이 깨진다.
 * 그래서 **업그레이드 트리(upgrade_tree.json)에 있는 시설은 트리 통째로 한 종류**로 센다 — 「자리」는 어느 단계든 자리다.
 * 트리 밖 시설(돌담·돌하르방·수국·삼나무…)은 업그레이드로 바뀔 일이 없으니 그대로 시설 id로 둔다(명당마다 고유한 맛이 남는다).
 *
 * 종류 목록은 표로 적지 않는다 — upgrade_tree.json에서 자동으로 만든다. 트리가 늘면 종류도 는다.
 * 이름·아이콘만 표(KIND_LABEL)로 두고, 빠진 트리가 있으면 트리 이름·아이콘을 그대로 쓴다.
 * 결정적: rng·Date를 쓰지 않는다.
 */
import treeJson from '../data/upgrade_tree.json' with { type: 'json' };

interface RawTree { id: string; name: string; icon: string; steps: { type: string }[] }
const TREES = (treeJson as { trees: RawTree[] }).trees;

export type CornerKindId = string;

/** 카드·힌트에 쓰는 이름과 아이콘 (문구 규칙 §6: 영문 id 노출 금지). 트리 이름이 그대로 쓸 만하면 여기 안 적어도 된다. */
const KIND_LABEL: Record<string, { name: string; icon: string }> = {
  seat: { name: '자리', icon: 'chair' },     // 야외 테이블 → 파라솔 → 테라스 → 오름 뷰 벤치
  fun: { name: '벤치', icon: 'toy' },        // 나무 벤치 → 해먹 → 가마솥 족욕 → 노천 족욕탕
  light: { name: '불빛', icon: 'bulb' },     // 정원등 → 가로등 → 알전구 줄 → 도대불
  garden: { name: '꽃', icon: 'plant' },     // 꽃밭 → 동백 → 야자수 → 연못
  shop: { name: '매대', icon: 'shop' },      // 오메기떡 매대 → 타르트 → 브런치 → 다이닝
};

export const CORNER_KIND_IDS: CornerKindId[] = TREES.map((t) => t.id);
const KIND_SET = new Set<string>(CORNER_KIND_IDS);
const KIND_OF = new Map<string, CornerKindId>();
const TYPES_OF = new Map<CornerKindId, string[]>();
const STEP_INDEX = new Map<string, number>();
for (const t of TREES) {
  TYPES_OF.set(t.id, t.steps.map((st) => st.type));
  t.steps.forEach((st, i) => { KIND_OF.set(st.type, t.id); STEP_INDEX.set(st.type, i); });
}

/** 이 시설이 속한 종류 (업그레이드 트리 밖이면 null — 그런 시설은 명당 조각에서 시설 id 그대로 쓴다) */
export function cornerKindOf(type: string): CornerKindId | null {
  return KIND_OF.get(type) ?? null;
}
/** 이 종류에 속한 시설 id 목록 (단계 순) */
export function cornerKindTypes(id: CornerKindId): string[] {
  return TYPES_OF.get(id) ?? [];
}
export function isCornerKind(key: string): boolean {
  return KIND_SET.has(key);
}
/** 종류 이름 (「자리」·「불빛」). 종류 키가 아니면 그대로 돌려준다 — 부르는 쪽이 시설 이름을 넣는다. */
export function cornerKindName(key: string): string {
  if (!isCornerKind(key)) return key;
  return KIND_LABEL[key]?.name ?? TREES.find((t) => t.id === key)?.name ?? key;
}
/** 종류 아이콘 (짓기 「명당」 탭 조각 줄) */
export function cornerKindIcon(key: string): string {
  if (!isCornerKind(key)) return 'build';
  return KIND_LABEL[key]?.icon ?? TREES.find((t) => t.id === key)?.icon ?? 'build';
}
/** 업그레이드 트리에서 이 시설이 몇 번째 단계인가 (0 = 기본 단계, 트리에 없으면 0) */
export function stepIndexOf(type: string): number {
  return STEP_INDEX.get(type) ?? 0;
}

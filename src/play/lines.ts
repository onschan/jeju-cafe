/** 머리 위 한마디. 아이콘만 띄우면 심심해서, 일이 바뀌는 순간엔 짧은 대사를 같이 띄운다.
 *  같은 사람이 같은 상황에서 늘 같은 말을 하도록 id로 골라 — 깜빡이지 않게. */

const STAFF: Record<string, string[]> = {
  make: ['지금 내려요~', '한 잔 나갑니다', '원두 좋다', '뜨거우니 조심!', '꾹 눌러서 탁'],
  serve: ['나왔습니다~', '맛있게 드세요', '여기 놓을게요', '주문하신 거예요', '조심조심'],
  clean: ['싹 치울게요', '여긴 내가 맡지', '반짝반짝', '설거지 금방 끝나요', '먼지 하나 없이'],
  promo: ['전단지 돌리고 올게요', '한 번 들러 보세요~', '오늘 날씨 좋다', '저기요, 저희 카페가요'],
};
const BURN: string[] = ['오늘 컨디션 최고!', '손이 막 돌아가요', '지금이야!', '불타오른다'];
const GUEST_WAIT: string[] = ['아직인가…', '배고프다', '천천히 주세요~', '기다리는 중'];
const GUEST_USE: string[] = ['여기 좋다', '경치 예쁘다', '잘 마실게요', '분위기 괜찮네', '또 와야지'];
const GUEST_SHOP: string[] = ['이것 좀 볼까', '하나 사 갈까', '귀엽다'];
const GUEST_MOOD: Record<string, string[]> = {
  happy: ['잘 마셨어요!', '또 올게요', '여기 단골 할래'],
  meh: ['뭐… 괜찮았어요', '그럭저럭', '다음엔 더 좋아지길'],
  angry: ['너무 오래 걸려요', '좀 아쉽네요', '다시는 안 와'],
};

/** 문자열을 고르게 섞는 작은 해시 — 같은 키면 늘 같은 대사 */
function pick(list: string[], key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return list[Math.abs(h) % list.length]!;
}
/** 직원이 막 일을 시작했을 때 한마디 (없으면 null) */
export function staffLine(act: string, burning: boolean, key: string): string | null {
  if (burning) return pick(BURN, key);
  const l = STAFF[act];
  return l ? pick(l, key) : null;
}
/** 손님 한마디 */
export function guestLine(want: string, key: string): string | null {
  if (want === 'wait') return pick(GUEST_WAIT, key);
  if (want === 'use:shop') return pick(GUEST_SHOP, key);
  if (want.startsWith('use:')) return pick(GUEST_USE, key);
  if (want.startsWith('mood:')) return pick(GUEST_MOOD[want.slice(5)] ?? GUEST_MOOD.meh!, key);
  return null;
}
/** 대사를 띄워 두는 시간 */
export const LINE_MS = 2600;

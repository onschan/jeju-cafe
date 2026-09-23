/** 한국어 조사: 앞말의 받침 유무로 이(가)·을(를)·은(는)·(으)로를 고른다. "이장님이(가)" 같은 병기를 없애기 위한 것. */

/** 숫자로 끝나면 읽는 소리로 받침을 정한다: 0으로 끝나면 십·백·천·만(받침 있음), 아니면 마지막 자리 1·3·6·7·8(일·삼·육·칠·팔)만 받침 */
const DIGIT_BATCHIM = new Set(['0', '1', '3', '6', '7', '8']);

/** 마지막 글자가 받침 있는 한글인가. 숫자면 읽는 소리로(₩300,000이·5명이·2가), 그 밖의 영문·기호는 받침 없는 것으로 친다. */
export function hasBatchim(word: string): boolean {
  const w = word.trim().replace(/[)\]」』]+$/, '');
  if (w.endsWith('%')) return false; // 퍼센트
  const ch = w.slice(-1);
  if (/[0-9]/.test(ch)) return DIGIT_BATCHIM.has(ch);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export type JosaPair = '이/가' | '을/를' | '은/는' | '으로/로' | '과/와' | '이에요/예요';

/** word + 조사. 예: josa('이장님', '이/가') → '이장님이', josa('파라솔', '을/를') → '파라솔을'.
 *  '으로/로'는 ㄹ 받침이면 '로' (예: 서울로). */
export function josa(word: string, pair: JosaPair): string {
  const batchim = hasBatchim(word);
  switch (pair) {
    case '이/가': return word + (batchim ? '이' : '가');
    case '을/를': return word + (batchim ? '을' : '를');
    case '은/는': return word + (batchim ? '은' : '는');
    case '과/와': return word + (batchim ? '과' : '와');
    case '이에요/예요': return word + (batchim ? '이에요' : '예요');
    case '으로/로': {
      const ch = word.trim().slice(-1);
      const code = ch.charCodeAt(0);
      const rieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
      return word + (batchim && !rieul ? '으로' : '로');
    }
  }
}

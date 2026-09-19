import { Container, Sprite, Graphics } from 'pixi.js';
import type { Face, RoleId, GuestTags, GuestWant } from '../sim/index.ts';
import { tex, hasAssets, spriteName } from './assets';

/** 파츠 캐릭터: 몸(피부) → 상의(tint) → 머리(tint) → 액세서리 순으로 쌓는다. tools/assets/sprites_chars.py의 compose_character와 같은 순서. */

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Frame = 0 | 1 | 2;

/** sprites_chars.py HAIR_RGB 순서 그대로 */
export const HAIR_RGB: readonly number[] = [0x3a3a44, 0x6b3f1d, 0x96602c, 0xd4a13c, 0xb3b3b8, 0xb4432b];
/** sprites_chars.py TOP_RGB 순서 그대로 */
export const TOP_RGB: readonly number[] = [0xf7a1c4, 0x4a90d9, 0x4fae3a, 0xffd166, 0xd62828, 0xf0ece4, 0x9a6fd1, 0xf7981f];
/** 미리보기용 피부 톤(시트의 body_{skin} 얼굴색 근사) */
export const SKIN_RGB: readonly number[] = [0xffe0bd, 0xe8b98a, 0xb87a4b];
export const SKIN_COUNT = 3;
export const HAIR_STYLE_COUNT = 8;
export const ACC_KINDS = ['strawhat', 'cap', 'glasses', 'backpack', 'camera', 'apron'] as const;
export type AccKind = (typeof ACC_KINDS)[number];

/** 캐릭터 스프라이트 높이(발끝 기준 머리 위까지) */
export const CHAR_H = 48;

export interface CharacterParts {
  skin: number;      // 0..2
  hairStyle: number; // 0..7 (7 = 대머리)
  hairColor: number; // HAIR_RGB 인덱스
  top: number;       // TOP_RGB 인덱스
  accs: AccKind[];
}

/** Staff.face(정수 인덱스) → 파츠. names.json 개수와 무관하게 나머지 연산으로 접는다. */
export function partsOfFace(face: Face, accs: AccKind[] = []): CharacterParts {
  return {
    skin: face.skin % SKIN_COUNT,
    hairStyle: face.hair % HAIR_STYLE_COUNT,
    hairColor: face.hair % HAIR_RGB.length,
    top: face.top % TOP_RGB.length,
    accs,
  };
}

/** 역할별 액세서리 */
export const ROLE_ACC: Record<RoleId, AccKind> = {
  hall: 'apron',
  barista: 'cap',
  cook: 'apron',
  carry: 'backpack',
  guide: 'glasses',
  clean: 'apron',     // 청소: 앞치마
  garden: 'strawhat', // 농원지기: 밀짚모자
  promo: 'camera',    // 홍보 담당: 카메라
};

/** 유니폼 → 상의 색(TOP_RGB 인덱스)·액세서리. 하와이안 = 주황, 갈옷 = 노랑(갈색 근사), 해녀복 = 파랑 + 물안경(안경), 방언 티 = 흰색, 산타복 = 빨강 + 모자(캡). */
export const UNIFORM_STYLE: Record<string, { top: number; acc?: AccKind }> = {
  uf_hawaiian: { top: 7 },
  uf_galot: { top: 3 },
  uf_haenyeo: { top: 1, acc: 'glasses' },
  uf_dialect_tee: { top: 5 },
  uf_santa: { top: 4, acc: 'cap' },
};

/** 직원 파츠: 얼굴 + 역할 액세서리. 유니폼을 입었으면 상의 색(과 액세서리)을 유니폼으로. */
export function staffParts(face: Face, role: RoleId | null, uniform: string | null = null): CharacterParts {
  const style = uniform ? UNIFORM_STYLE[uniform] : undefined;
  const accs: AccKind[] = [];
  if (style?.acc) accs.push(style.acc);
  if (role && !accs.includes(ROLE_ACC[role])) accs.push(ROLE_ACC[role]);
  const parts = partsOfFace(face, accs);
  if (style) parts.top = style.top;
  return parts;
}

/** 손님 파츠: 얼굴(id 해시)에 태그로 머리 모양·액세서리를 얹는다. 여성 0~3, 남성 4~6, 시니어 남성은 대머리(7)도. 단체 → 배낭, 경치 → 카메라, 농사 → 밀짚모자, 편의 → 안경. */
export function guestParts(face: Face, tags: GuestTags, wants: GuestWant[]): CharacterParts {
  const base = partsOfFace(face);
  const h = face.hair + face.top * 7;
  const hairStyle = tags.gender === 'female' ? h % 4 : tags.gender === 'male' ? (tags.age === 'senior' ? 4 + (h % 4) : 4 + (h % 3)) : h % 7;
  const accs: AccKind[] = [];
  if (tags.group) accs.push('backpack');
  else if (wants.includes('scenery')) accs.push('camera');
  else if (wants.includes('farm')) accs.push('strawhat');
  else if (wants.includes('convenience')) accs.push('glasses');
  return { ...base, hairStyle, accs };
}

/** 이름 있는 손님(지역 손님 56) 파츠: face.seed로 정한 얼굴 + 고정 액세서리(시드로 결정, 없음도 있다). 돌하르방 마을은 액세서리 없이 회색 머리. */
const NAMED_ACCS: (AccKind | null)[] = [null, 'glasses', 'cap', 'camera', 'strawhat', 'backpack', null];
/** 특별 손님(빅 이벤트, face.seed 101~103)의 고정 생김새: 백중원=짧은 머리·모자, 이요리·이장순=단발·안경, 유아이=긴 머리 */
const SPECIAL_LOOKS: Record<number, Pick<CharacterParts, 'hairStyle' | 'hairColor' | 'accs'>> = {
  101: { hairStyle: 1, hairColor: 0, accs: ['cap'] },
  102: { hairStyle: 0, hairColor: 1, accs: ['glasses'] },
  103: { hairStyle: 6, hairColor: 0, accs: [] },
};

export function namedGuestParts(face: Face, seed: number, regionId: string): CharacterParts {
  const base = partsOfFace(face);
  const special = SPECIAL_LOOKS[seed];
  if (special) return { ...base, ...special };
  if (regionId === 'dolhareubang') return { ...base, hairColor: 4, hairStyle: 4 + (seed % 4), accs: [] };
  const acc = NAMED_ACCS[seed % NAMED_ACCS.length] ?? null;
  return { ...base, hairStyle: seed % HAIR_STYLE_COUNT, accs: acc ? [acc] : [] };
}

const LAYER = { body: 'body', top: 'top', hair: 'hair' } as const;
const ACC_LABEL = 'acc';

export interface CharacterNode extends Container {
  /** 시트가 없어 플레이스홀더로 그렸으면 false */
  __parts: CharacterParts | null;
}

function layerSprite(label: string, texture: ReturnType<typeof tex>, tint?: number): Sprite {
  const sp = new Sprite(texture ?? undefined);
  sp.label = label;
  sp.anchor.set(0.5, 1);
  if (tint !== undefined) sp.tint = tint;
  return sp;
}

/** 원점은 발끝. 시트가 없으면 상의색 사각형 하나로 대신한다. */
export function makeCharacterNode(parts: CharacterParts, dir: Dir = 'down', frame: Frame = 1): CharacterNode {
  const c = new Container() as CharacterNode;
  if (!hasAssets()) {
    c.__parts = null;
    c.addChild(new Graphics().roundRect(-8, -36, 16, 24, 4).fill(TOP_RGB[parts.top]!));
    return c;
  }
  c.__parts = parts;
  c.addChild(layerSprite(LAYER.body, tex(spriteName.body(parts.skin, dir, frame))));
  c.addChild(layerSprite(LAYER.top, tex(spriteName.top(dir, frame)), TOP_RGB[parts.top]));
  c.addChild(layerSprite(LAYER.hair, tex(spriteName.hair(parts.hairStyle, dir)), HAIR_RGB[parts.hairColor]));
  for (const kind of parts.accs) {
    const sp = layerSprite(ACC_LABEL, tex(spriteName.acc(kind, dir)));
    (sp as Sprite & { __kind: AccKind }).__kind = kind;
    c.addChild(sp);
  }
  return c;
}

/** 방향·프레임에 맞춰 네 레이어 텍스처를 함께 교체한다. */
export function updateCharacterNode(node: CharacterNode, dir: Dir, frame: Frame): void {
  const parts = node.__parts;
  if (!parts) return;
  for (const child of node.children) {
    if (!(child instanceof Sprite)) continue;
    let name: string | null = null;
    if (child.label === LAYER.body) name = spriteName.body(parts.skin, dir, frame);
    else if (child.label === LAYER.top) name = spriteName.top(dir, frame);
    else if (child.label === LAYER.hair) name = spriteName.hair(parts.hairStyle, dir);
    else if (child.label === ACC_LABEL) name = spriteName.acc((child as Sprite & { __kind: AccKind }).__kind, dir);
    if (!name) continue;
    const t = tex(name);
    if (t && child.texture !== t) child.texture = t;
  }
}

/** 액세서리 조합이 바뀌었는지(역할 변경) */
export function sameAccs(node: CharacterNode, accs: AccKind[]): boolean {
  const cur = node.__parts?.accs ?? [];
  return cur.length === accs.length && cur.every((k, i) => k === accs[i]);
}

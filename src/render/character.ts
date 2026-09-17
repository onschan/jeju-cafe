import { Container, Sprite, Graphics } from 'pixi.js';
import type { Face, RoleId } from '../sim/index.ts';
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
  field: 'strawhat',
  carry: 'backpack',
  guide: 'glasses',
};

export function staffParts(face: Face, role: RoleId | null): CharacterParts {
  return partsOfFace(face, role ? [ROLE_ACC[role]] : []);
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

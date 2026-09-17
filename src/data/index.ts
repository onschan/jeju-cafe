import type { ObjectDef, CropDef, MenuDef, GuestTypeDef, UnlockDef } from '../sim/types.ts';
import objectsJson from './objects.json' with { type: 'json' };
import cropsJson from './crops.json' with { type: 'json' };
import menusJson from './menus.json' with { type: 'json' };
import guestsJson from './guests.json' with { type: 'json' };
import unlocksJson from './unlocks.json' with { type: 'json' };

export const OBJECTS = objectsJson as ObjectDef[];
export const CROPS = cropsJson as CropDef[];
export const MENUS = menusJson as unknown as MenuDef[];
export const GUEST_TYPES = guestsJson as GuestTypeDef[];
export const UNLOCKS = unlocksJson as UnlockDef[];

function indexBy<T extends { id: string }>(xs: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const x of xs) {
    if (Object.prototype.hasOwnProperty.call(out, x.id)) throw new Error(`duplicate id: ${x.id}`);
    out[x.id] = x;
  }
  return out;
}
const OBJ = indexBy(OBJECTS);
const CROP = indexBy(CROPS);
const MENU = indexBy(MENUS);
const GUEST = indexBy(GUEST_TYPES);

function must<T>(map: Record<string, T>, id: string, what: string): T {
  const v = map[id];
  if (!v) throw new Error(`unknown ${what}: ${id}`);
  return v;
}
export const objectDef = (id: string) => must(OBJ, id, 'object');
export const cropDef = (id: string) => must(CROP, id, 'crop');
export const menuDef = (id: string) => must(MENU, id, 'menu');
export const guestTypeDef = (id: string) => must(GUEST, id, 'guestType');

/** 게임 시작 시 이미 열려 있는 것 */
export const INITIAL_UNLOCKED = {
  objects: ['field', 'path', 'table_out', 'tangerine_tree'],
  menus: ['tangerine_juice', 'carrot_juice'],
  crops: ['carrot', 'tangerine'],
};

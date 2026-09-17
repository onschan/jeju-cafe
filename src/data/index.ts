import type { ObjectDef, CropDef, MenuDef, GuestTypeDef, UnlockDef, IngredientDef, RoleDef, SkillDef, PromotionDef } from '../sim/types.ts';
import objectsJson from './objects.json' with { type: 'json' };
import cropsJson from './crops.json' with { type: 'json' };
import menusJson from './menus.json' with { type: 'json' };
import guestsJson from './guests.json' with { type: 'json' };
import unlocksJson from './unlocks.json' with { type: 'json' };
import ingredientsJson from './ingredients.json' with { type: 'json' };
import staffRolesJson from './staff_roles.json' with { type: 'json' };
import skillsJson from './skills.json' with { type: 'json' };
import namesJson from './names.json' with { type: 'json' };
import promotionsJson from './promotions.json' with { type: 'json' };
import dialogueJson from './dialogue.json' with { type: 'json' };

export const OBJECTS = objectsJson as ObjectDef[];
export const CROPS = cropsJson as CropDef[];
export const MENUS = menusJson as unknown as MenuDef[];
export const GUEST_TYPES = guestsJson as GuestTypeDef[];
export const UNLOCKS = unlocksJson as UnlockDef[];
export const INGREDIENTS = ingredientsJson as IngredientDef[];
export const ROLES = staffRolesJson as RoleDef[];
export const SKILLS = skillsJson as unknown as SkillDef[];
export const NAMES = namesJson as { names: string[]; hair: number; skin: number; top: number };
export const PROMOTIONS = promotionsJson as unknown as PromotionDef[];
export const DIALOGUE = dialogueJson as {
  guest: Record<string, { happy: string[]; meh: { no_menu: string[]; scenery: string[]; wait: string[] } }>;
};

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
const INGREDIENT = indexBy(INGREDIENTS);
const ROLE = indexBy(ROLES);
const SKILL = indexBy(SKILLS);
const PROMOTION = indexBy(PROMOTIONS);

function must<T>(map: Record<string, T>, id: string, what: string): T {
  const v = map[id];
  if (!v) throw new Error(`unknown ${what}: ${id}`);
  return v;
}
export const objectDef = (id: string) => must(OBJ, id, 'object');
export const cropDef = (id: string) => must(CROP, id, 'crop');
export const menuDef = (id: string) => must(MENU, id, 'menu');
export const guestTypeDef = (id: string) => must(GUEST, id, 'guestType');
export const ingredientDef = (id: string) => must(INGREDIENT, id, 'ingredient');
export const roleDef = (id: string) => must(ROLE, id, 'role');
export const skillDef = (id: string) => must(SKILL, id, 'skill');
export const promotionDef = (id: string) => must(PROMOTION, id, 'promotion');

/** 게임 시작 시 이미 열려 있는 것 */
export const INITIAL_UNLOCKED = {
  objects: ['field', 'path', 'table_out', 'tangerine_tree'],
  menus: [
    'americano', 'latte', 'green_tea', 'yuja_tea', 'iced_tea', 'hot_choco',
    'toast', 'scone', 'cheesecake', 'cookie', 'egg_sandwich', 'croissant',
  ],
  crops: ['carrot', 'tangerine'],
};

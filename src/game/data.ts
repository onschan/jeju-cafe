import facilitiesJson from './data/facilities.json' with { type: 'json' };
import guestsJson from './data/guests.json' with { type: 'json' };
import menusJson from './data/menus.json' with { type: 'json' };
import synergyJson from './data/synergy.json' with { type: 'json' };
import investJson from './data/invest.json' with { type: 'json' };
import rivalsJson from './data/rivals.json' with { type: 'json' };
import type { FacilityDef, GuestTypeDef, MenuDef, SynergyDef, InvestDef, RivalDef } from './types.ts';

export const FACILITIES = facilitiesJson as FacilityDef[];
export const GUEST_TYPES = guestsJson as GuestTypeDef[];
export const MENUS = menusJson as MenuDef[];
export const SYNERGIES = synergyJson as SynergyDef[];
export const INVESTS = investJson as InvestDef[];
export const RIVALS = rivalsJson as RivalDef[];

const F = new Map(FACILITIES.map((d) => [d.id, d]));
const G = new Map(GUEST_TYPES.map((d) => [d.id, d]));
const M = new Map(MENUS.map((d) => [d.id, d]));
export function facilityDef(id: string): FacilityDef { const d = F.get(id); if (!d) throw new Error(`unknown facility: ${id}`); return d; }
export function guestTypeDef(id: string): GuestTypeDef { const d = G.get(id); if (!d) throw new Error(`unknown guest type: ${id}`); return d; }
export function menuDef(id: string): MenuDef { const d = M.get(id); if (!d) throw new Error(`unknown menu: ${id}`); return d; }
export function isFloorDef(d: FacilityDef): boolean { return d.sub === 'floor'; }
/** 손님이 쓰는 것 (자리·가게) */
export function isUsable(d: FacilityDef): boolean { return d.tab === 'seat' || d.tab === 'shop'; }

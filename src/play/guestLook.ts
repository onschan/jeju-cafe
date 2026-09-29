import type { AccKind } from '../render/character';
/** 손님층별 액세서리 (걷는 몸·초상 공통) */
export function guestAccs(typeId: string): AccKind[] {
  return typeId === 'tourist' ? ['camera'] : typeId === 'student' ? ['backpack'] : typeId === 'senior' ? ['strawhat'] : typeId === 'worker' ? ['glasses'] : typeId === 'family' ? ['cap'] : [];
}

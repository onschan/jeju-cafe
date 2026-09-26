import type { CSSProperties } from 'react';
export const C = { paper: '#f6ecd6', wood: '#8b5a2b', ink: '#2b2118', soft: '#7a6650', gold: '#d4a13c', red: '#c8402e', green: '#3f8f3a', blue: '#3a6fb0', dark: '#1e1e1e' };
export const panel: CSSProperties = { background: C.paper, border: `3px solid ${C.wood}`, borderRadius: 8, color: C.ink, padding: 8 };
export const btn: CSSProperties = { background: C.wood, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' };
export const btnOff: CSSProperties = { ...btn, background: '#b9a48a', color: '#f4ebdc' };
export const btnGold: CSSProperties = { ...btn, background: C.gold, color: C.ink };
export const small: CSSProperties = { fontSize: 12, color: C.soft };
export function won(n: number): string { return `₩${Math.round(n).toLocaleString('en-US')}`; }
export function wonShort(n: number): string { const a = Math.abs(n); const s = n < 0 ? '−' : ''; if (a >= 100_000_000) return `${s}₩${(a / 100_000_000).toFixed(1)}억`; if (a >= 10_000) return `${s}₩${Math.round(a / 10_000)}만`; return `${s}₩${a}`; }

import type { CSSProperties } from 'react';
export const C = { paper: '#f6ecd6', wood: '#8b5a2b', ink: '#2b2118', soft: '#7a6650', gold: '#d4a13c', red: '#c8402e', green: '#3f8f3a', blue: '#3a6fb0', dark: '#1e1e1e' };
export const panel: CSSProperties = { background: C.paper, border: `2px solid ${C.wood}`, boxShadow: `inset 0 0 0 2px #fff8e8, 0 2px 0 #4a2f16`, borderRadius: 4, color: C.ink, padding: 8 };
/** 창 제목 띠 (카이로 창처럼 진한 띠 + 흰 글씨) */
export const titleBar: CSSProperties = { background: C.wood, color: '#fff8e8', padding: '4px 8px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, margin: -8, marginBottom: 6 };
/** 카탈로그 칸 */
export const tile: CSSProperties = { background: '#fff8e8', border: `2px solid ${C.wood}`, borderRadius: 4, padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer', boxShadow: '0 2px 0 #4a2f16' };
export const tileLocked: CSSProperties = { ...tile, background: '#3a3128', color: '#8a7a68', borderColor: '#5a4a38', cursor: 'default', boxShadow: 'none' };
export const btn: CSSProperties = { background: C.wood, color: '#fff8e8', border: `2px solid #4a2f16`, boxShadow: 'inset 0 2px 0 #b07a48', borderRadius: 4, padding: '6px 10px', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' };
export const btnOff: CSSProperties = { ...btn, background: '#b9a48a', color: '#f4ebdc', boxShadow: 'inset 0 2px 0 #d8c8b0' };
export const btnGold: CSSProperties = { ...btn, background: C.gold, color: C.ink, boxShadow: 'inset 0 2px 0 #f0d080' };
export const small: CSSProperties = { fontSize: 12, color: C.soft };
export function won(n: number): string { return `₩${Math.round(n).toLocaleString('en-US')}`; }
export function wonShort(n: number): string { const a = Math.abs(n); const s = n < 0 ? '−' : ''; if (a >= 100_000_000) return `${s}₩${(a / 100_000_000).toFixed(1)}억`; if (a >= 10_000) return `${s}₩${Math.round(a / 10_000)}만`; return `${s}₩${a}`; }

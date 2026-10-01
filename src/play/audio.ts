/** 소리: 계절 BGM(타악 레이어는 명성 300부터) + 효과음. 옛 ui/audio.ts를 줄인 것. 첫 사용자 제스처에서 unlockAudio(). */
import { assetUrl } from './assetUrl';

export type SfxName = 'tap' | 'place' | 'remove' | 'plant' | 'coin' | 'happy' | 'meh' | 'unlock' | 'month' | 'fanfare' | 'error' | 'bus';
export type BgmName = 'spring' | 'summer' | 'autumn' | 'winter' | 'title' | 'intro' | 'intro_warm';
const SFX: SfxName[] = ['tap', 'place', 'remove', 'plant', 'coin', 'happy', 'meh', 'unlock', 'month', 'fanfare', 'error', 'bus'];
const MUTE_KEY = 'jeju-cafe:muted', BGM_VOL_KEY = 'jeju-cafe:bgmVol', SFX_VOL_KEY = 'jeju-cafe:sfxVol';
const MASTER_GAIN = 0.6, LOWPASS_HZ = 3000, LAYER_FADE_S = 1.5;

let ctx: AudioContext | null = null;
let master: GainNode | null = null, bgmGain: GainNode | null = null, sfxGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let current: { name: BgmName; src: AudioBufferSourceNode; gain: GainNode; layer: { src: AudioBufferSourceNode; gain: GainNode } | null } | null = null;
let layerOn = false;
let muted = false;
/** 0~100. 폰 스피커에서 8비트 음이 크게 들려 기본은 낮게 */
let bgmVolume = 25, sfxVolume = 45;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
  const b = localStorage.getItem(BGM_VOL_KEY); if (b !== null && Number.isFinite(Number(b))) bgmVolume = clampVol(Number(b));
  const f = localStorage.getItem(SFX_VOL_KEY); if (f !== null && Number.isFinite(Number(f))) sfxVolume = clampVol(Number(f));
} catch { /* noop */ }
function clampVol(v: number): number { return Math.max(0, Math.min(100, Math.round(v))); }
function volToGain(v: number): number { return (v / 100) ** 2; }

async function load(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return null;
  const hit = buffers.get(url); if (hit) return hit;
  try { const res = await fetch(url); const buf = await ctx.decodeAudioData(await res.arrayBuffer()); buffers.set(url, buf); return buf; } catch { return null; }
}
/** 첫 사용자 제스처에서. iOS는 이 안에서 resume해야 소리가 난다. */
export function unlockAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  ctx = new AudioContext();
  const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = LOWPASS_HZ; lowpass.Q.value = 0.5; lowpass.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER_GAIN; master.connect(lowpass);
  bgmGain = ctx.createGain(); bgmGain.gain.value = volToGain(bgmVolume); bgmGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = volToGain(sfxVolume); sfxGain.connect(master);
  void ctx.resume();
  for (const n of SFX) void load(assetUrl(`assets/sfx/${n}.m4a`));
}
export function audioReady(): boolean { return ctx !== null; }
const lastAt = new Map<SfxName, number>();
/** 효과음. 같은 소리는 80ms 안에 겹치지 않는다 (동전이 우르르 날 때). */
export function sfx(name: SfxName): void {
  if (!ctx || !master) return;
  const now = performance.now(); if (now - (lastAt.get(name) ?? -1e9) < 80) return; lastAt.set(name, now);
  const buf = buffers.get(assetUrl(`assets/sfx/${name}.m4a`)); if (!buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(sfxGain ?? master); src.start();
}
export async function bgm(name: BgmName): Promise<void> {
  if (!ctx || !bgmGain || current?.name === name) return;
  const hasLayer = name === 'spring' || name === 'summer' || name === 'autumn' || name === 'winter';
  const [buf, layerBuf] = await Promise.all([load(assetUrl(`assets/bgm/${name}.m4a`)), hasLayer ? load(assetUrl(`assets/bgm/${name}_perc.m4a`)) : Promise.resolve(null)]);
  if (!buf || !ctx || current?.name === name) return;
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bgmGain);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain);
  const t = ctx.currentTime; src.start(t); gain.gain.linearRampToValueAtTime(1, t + 1);
  let layer: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  if (layerBuf) { const lg = ctx.createGain(); lg.gain.value = layerOn ? 1 : 0; lg.connect(gain); const ls = ctx.createBufferSource(); ls.buffer = layerBuf; ls.loop = true; ls.connect(lg); ls.start(t); layer = { src: ls, gain: lg }; }
  if (current) { current.gain.gain.linearRampToValueAtTime(0, t + 1); const old = current; setTimeout(() => { try { old.src.stop(); old.layer?.src.stop(); } catch { /* 이미 멈춤 */ } }, 1100); }
  current = { name, src, gain, layer };
}
/** 타악 레이어 (명성이 오르면 곡이 두터워진다) */
export function setBgmLayer(on: boolean): void {
  if (layerOn === on) return; layerOn = on;
  if (!ctx || !current?.layer) return;
  const g = current.layer.gain.gain; g.cancelScheduledValues(ctx.currentTime); g.setValueAtTime(g.value, ctx.currentTime); g.linearRampToValueAtTime(on ? 1 : 0, ctx.currentTime + LAYER_FADE_S);
}
export function setMuted(m: boolean): void { muted = m; try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* noop */ } if (master) master.gain.value = m ? 0 : MASTER_GAIN; }
export function isMuted(): boolean { return muted; }
export function setBgmVolume(v: number): void { bgmVolume = clampVol(v); try { localStorage.setItem(BGM_VOL_KEY, String(bgmVolume)); } catch { /* noop */ } if (bgmGain) bgmGain.gain.value = volToGain(bgmVolume); }
export function setSfxVolume(v: number): void { sfxVolume = clampVol(v); try { localStorage.setItem(SFX_VOL_KEY, String(sfxVolume)); } catch { /* noop */ } if (sfxGain) sfxGain.gain.value = volToGain(sfxVolume); }
export function getBgmVolume(): number { return bgmVolume; }
export function getSfxVolume(): number { return sfxVolume; }

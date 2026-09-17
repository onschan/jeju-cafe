import { assetUrl } from './assetUrl';

export type SfxName = 'tap' | 'place' | 'remove' | 'plant' | 'harvest' | 'coin' | 'happy' | 'meh' | 'unlock' | 'month' | 'fanfare' | 'error' | 'bus';
export type BgmName = 'spring' | 'summer' | 'autumn' | 'winter' | 'title';

const MUTE_KEY = 'jeju-cafe:muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let current: { name: BgmName; src: AudioBufferSourceNode; gain: GainNode } | null = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* noop */ }

async function load(url: string): Promise<AudioBuffer | null> {
  if (!ctx) return null;
  if (buffers.has(url)) return buffers.get(url)!;
  try {
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    buffers.set(url, buf);
    return buf;
  } catch { return null; }
}

/** 첫 사용자 제스처에서 호출. iOS는 이 안에서 resume해야 소리가 난다. */
export function unlockAudio(): void {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  bgmGain = ctx.createGain(); bgmGain.gain.value = 0.5; bgmGain.connect(master);
  void ctx.resume();
  for (const n of ['tap', 'place', 'remove', 'plant', 'harvest', 'coin', 'happy', 'meh', 'unlock', 'month', 'fanfare', 'error', 'bus']) void load(assetUrl(`assets/sfx/${n}.m4a`));
}

export function sfx(name: SfxName): void {
  if (!ctx || !master) return;
  const buf = buffers.get(assetUrl(`assets/sfx/${name}.m4a`));
  if (!buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(master); src.start();
}

export async function bgm(name: BgmName): Promise<void> {
  if (!ctx || !bgmGain || current?.name === name) return;
  const buf = await load(assetUrl(`assets/bgm/${name}.m4a`));
  if (!buf || !ctx) return;
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bgmGain);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start();
  const t = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(1, t + 1);
  if (current) { current.gain.gain.linearRampToValueAtTime(0, t + 1); const old = current.src; setTimeout(() => old.stop(), 1100); }
  current = { name, src, gain };
}

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* noop */ }
  if (master) master.gain.value = m ? 0 : 1;
}
export function isMuted(): boolean { return muted; }

export function suspendAudio(): void { void ctx?.suspend(); }
export function resumeAudio(): void { void ctx?.resume(); }

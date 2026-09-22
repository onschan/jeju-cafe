import { assetUrl } from './assetUrl';

export type SfxName = 'tap' | 'place' | 'remove' | 'plant' | 'harvest' | 'coin' | 'happy' | 'meh' | 'unlock' | 'month' | 'fanfare' | 'error' | 'bus' | 'drumroll'; // drumroll: 대박/중박/쪽박 룰렛 긴장음 (staff-luck)
export type BgmName = 'spring' | 'summer' | 'autumn' | 'winter' | 'title' | 'intro'; // intro: 프롤로그 1~3컷 잔잔한 단조

const MUTE_KEY = 'jeju-cafe:muted';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let bgmGain: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
let current: { name: BgmName; src: AudioBufferSourceNode; gain: GainNode; layer: { src: AudioBufferSourceNode; gain: GainNode } | null } | null = null;
/** fun-rank: 타악 레이어(`{계절}_perc.m4a`) 켜짐 — 카페 등급 3부터 (setBgmLayer). 계절곡과 같은 길이라 같은 시각에 시작해 두 트랙을 동시에 돌린다. */
let layerOn = false;
const LAYER_SONGS = new Set<BgmName>(['spring', 'summer', 'autumn', 'winter']);
const LAYER_FADE_S = 1.5;
let sfxGain: GainNode | null = null;
let muted = false;
/** 0~100. 기본은 낮게(BGM 25·효과음 45) — 폰 스피커에서 8비트 음이 크게 들린다는 피드백 */
let bgmVolume = 25;
let sfxVolume = 45;
const BGM_VOL_KEY = 'jeju-cafe:bgmVol';
const SFX_VOL_KEY = 'jeju-cafe:sfxVol';
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
  const b = Number(localStorage.getItem(BGM_VOL_KEY)); if (Number.isFinite(b) && localStorage.getItem(BGM_VOL_KEY) !== null) bgmVolume = clampVol(b);
  const f = Number(localStorage.getItem(SFX_VOL_KEY)); if (Number.isFinite(f) && localStorage.getItem(SFX_VOL_KEY) !== null) sfxVolume = clampVol(f);
} catch { /* noop */ }

/** 전체 상한. 8비트 파형은 피크가 높아 1.0이면 거칠다 */
const MASTER_GAIN = 0.6;
const LOWPASS_HZ = 3000;
function clampVol(v: number): number { return Math.max(0, Math.min(100, Math.round(v))); }
/** 슬라이더 값(0~100) → 게인. 귀에 고르게 들리도록 제곱 곡선 */
function volToGain(v: number): number { return (v / 100) ** 2; }

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
  // 8비트 square 파형의 고역을 깎아 폰 스피커에서 날카롭지 않게: master → 로우패스(3 kHz) → 출력
  const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = LOWPASS_HZ; lowpass.Q.value = 0.5; lowpass.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER_GAIN; master.connect(lowpass);
  bgmGain = ctx.createGain(); bgmGain.gain.value = volToGain(bgmVolume); bgmGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = volToGain(sfxVolume); sfxGain.connect(master);
  void ctx.resume();
  for (const n of ['tap', 'place', 'remove', 'plant', 'harvest', 'coin', 'happy', 'meh', 'unlock', 'month', 'fanfare', 'error', 'bus', 'drumroll']) void load(assetUrl(`assets/sfx/${n}.m4a`));
}

export function sfx(name: SfxName): void {
  if (!ctx || !master) return;
  const buf = buffers.get(assetUrl(`assets/sfx/${name}.m4a`));
  if (!buf) return;
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(sfxGain ?? master); src.start();
}

export async function bgm(name: BgmName): Promise<void> {
  if (!ctx || !bgmGain || current?.name === name) return;
  const [buf, layerBuf] = await Promise.all([load(assetUrl(`assets/bgm/${name}.m4a`)), LAYER_SONGS.has(name) ? load(assetUrl(`assets/bgm/${name}_perc.m4a`)) : Promise.resolve(null)]);
  if (!buf || !ctx) return;
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(bgmGain);
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain);
  const t = ctx.currentTime;
  src.start(t);
  gain.gain.linearRampToValueAtTime(1, t + 1);
  let layer: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  if (layerBuf) { // fun-rank: 타악 레이어는 같은 시각에 시작해 두고 게인만 켜고 끈다
    const lg = ctx.createGain(); lg.gain.value = layerOn ? 1 : 0; lg.connect(gain);
    const ls = ctx.createBufferSource(); ls.buffer = layerBuf; ls.loop = true; ls.connect(lg); ls.start(t);
    layer = { src: ls, gain: lg };
  }
  if (current) { current.gain.gain.linearRampToValueAtTime(0, t + 1); const old = current; setTimeout(() => { old.src.stop(); old.layer?.src.stop(); }, 1100); }
  current = { name, src, gain, layer };
}

/** fun-rank: 타악 레이어 켜기/끄기 (카페 등급 3 「소문난 카페」부터 — App이 등급을 보고 부른다). 1.5초 페이드. */
export function setBgmLayer(on: boolean): void {
  if (layerOn === on) return;
  layerOn = on;
  if (!ctx || !current?.layer) return;
  const g = current.layer.gain.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(g.value, ctx.currentTime);
  g.linearRampToValueAtTime(on ? 1 : 0, ctx.currentTime + LAYER_FADE_S);
}
export function isBgmLayerOn(): boolean { return layerOn; }

export function setMuted(m: boolean): void {
  muted = m;
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* noop */ }
  if (master) master.gain.value = m ? 0 : MASTER_GAIN;
}
export function isMuted(): boolean { return muted; }

export function setBgmVolume(v: number): void {
  bgmVolume = clampVol(v);
  try { localStorage.setItem(BGM_VOL_KEY, String(bgmVolume)); } catch { /* noop */ }
  if (bgmGain) bgmGain.gain.value = volToGain(bgmVolume);
}
export function setSfxVolume(v: number): void {
  sfxVolume = clampVol(v);
  try { localStorage.setItem(SFX_VOL_KEY, String(sfxVolume)); } catch { /* noop */ }
  if (sfxGain) sfxGain.gain.value = volToGain(sfxVolume);
}
export function getBgmVolume(): number { return bgmVolume; }
export function getSfxVolume(): number { return sfxVolume; }

export function suspendAudio(): void { void ctx?.suspend(); }
export function resumeAudio(): void { void ctx?.resume(); }

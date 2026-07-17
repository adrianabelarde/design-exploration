/*
 * 1:1 port of keeby's tone-pad audio path:
 *   - TickPlayer.swift → seven round-robin tick WAVs, 40ms min interval,
 *     played straight to the destination (no filters, no compressor).
 *   - AudioEngine.swift tone shaping (via keeby web's SoundPad.jsx port):
 *     toneX (Thock 0 → Clack 1) drives a lowpass whose cutoff is derived by
 *     inverting the native one-pole IIR alpha = max(0.06, toneX²), with a
 *     parallel dry tap (thockiness · 0.45) and quadratic wet makeup gain.
 *     toneY (Deep 0 → Sharp 1) maps to playbackRate 0.88 + toneY · 0.24.
 *   - LoudnessNormalizer.swift → per-clip windowed-RMS normalization at decode.
 *
 * Release preview plays three NovelKeys Cream presses 200ms apart (down + up
 * 85ms later, scaled by playbackRate) so a release feels like a short type
 * test rather than a single thock.
 */

const TICK_MIN_INTERVAL = 0.04; // matches TickPlayer.swift
const TICK_GAIN = 0.8 * 0.45;
const CREAM_NORM = 0.88; // SWITCH_NORMALIZATION_GAIN['novelkeys-cream']
const PREVIEW_PRESS_GAP_MS = 200;
const PREVIEW_PRESS_COUNT = 3;
const PREVIEW_UP_OFFSET_MS = 85;

const CLIP_TARGET = 0.32;
const MIN_GAIN = 0.55;
const MAX_GAIN = 16.0;

const SOUNDS_BASE = `${import.meta.env.BASE_URL}sounds`;

let _ctx: AudioContext | null = null;
let _compressor: DynamicsCompressorNode | null = null;
let _ticks: AudioBuffer[] = [];
let _ticksLoading: Promise<AudioBuffer[]> | null = null;
let _tickIndex = 0;
let _lastTickAt = 0;
let _cream: { down: AudioBuffer[]; up: AudioBuffer[] } | null = null;
let _creamLoading: Promise<void> | null = null;
let _rrIndex = 0;

function getCtx(): AudioContext | null {
  if (_ctx) return _ctx;
  if (typeof window === 'undefined') return null;
  const Impl = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Impl) return null;
  _ctx = new Impl({ latencyHint: 'interactive' });
  return _ctx;
}

export function resumeAudio() {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function getCompressor(): DynamicsCompressorNode | null {
  const ctx = getCtx();
  if (!ctx) return null;
  if (_compressor && _compressor.context === ctx) return _compressor;
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -12;
  c.knee.value = 6;
  c.ratio.value = 4;
  c.attack.value = 0.002;
  c.release.value = 0.05;
  c.connect(ctx.destination);
  _compressor = c;
  return c;
}

/** LoudnessNormalizer.swift port — bidirectional per-clip windowed-RMS gain. */
function normalizeClipLoudness(buffer: AudioBuffer): AudioBuffer {
  const channelCount = buffer.numberOfChannels;
  const frameCount = buffer.length;
  if (frameCount === 0 || channelCount === 0) return buffer;

  const windowSize = Math.min(Math.max(64, Math.floor(buffer.sampleRate * 0.010)), frameCount);
  const denom = windowSize * channelCount;

  let sumSquares = 0;
  for (let ch = 0; ch < channelCount; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < windowSize; i++) sumSquares += data[i] * data[i];
  }
  let maxSumSquares = sumSquares;

  if (frameCount > windowSize) {
    for (let s = 1; s <= frameCount - windowSize; s++) {
      for (let ch = 0; ch < channelCount; ch++) {
        const data = buffer.getChannelData(ch);
        const leaving = data[s - 1];
        const entering = data[s + windowSize - 1];
        sumSquares += entering * entering - leaving * leaving;
      }
      if (sumSquares > maxSumSquares) maxSumSquares = sumSquares;
    }
  }

  const maxRMS = Math.sqrt(Math.max(0, maxSumSquares) / denom);
  if (maxRMS <= 0.001) return buffer;

  const gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, CLIP_TARGET / maxRMS));
  if (Math.abs(gain - 1.0) <= 0.005) return buffer;

  for (let ch = 0; ch < channelCount; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) data[i] *= gain;
  }
  return buffer;
}

async function fetchBuffer(url: string): Promise<AudioBuffer | null> {
  const ctx = getCtx();
  if (!ctx) return null;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(ab.slice(0));
    return normalizeClipLoudness(buffer);
  } catch {
    return null;
  }
}

export async function loadTicks(): Promise<AudioBuffer[]> {
  if (_ticks.length) return _ticks;
  if (_ticksLoading) return _ticksLoading;
  _ticksLoading = (async () => {
    const buffers = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7].map((i) => fetchBuffer(`${SOUNDS_BASE}/ticks/tick_${i}.wav`)),
    );
    _ticks = buffers.filter((b): b is AudioBuffer => b !== null);
    return _ticks;
  })();
  return _ticksLoading;
}

export async function loadCream(): Promise<void> {
  if (_cream) return;
  if (_creamLoading) return _creamLoading;
  _creamLoading = (async () => {
    const downs = await Promise.all(
      ['alpha_down_01.wav', 'alpha_down_02.wav', 'alpha_down_03.wav'].map((f) =>
        fetchBuffer(`${SOUNDS_BASE}/novelkeys-cream/${f}`),
      ),
    );
    const ups = await Promise.all(
      ['alpha_up_01.wav'].map((f) => fetchBuffer(`${SOUNDS_BASE}/novelkeys-cream/${f}`)),
    );
    _cream = {
      down: downs.filter((b): b is AudioBuffer => b !== null),
      up: ups.filter((b): b is AudioBuffer => b !== null),
    };
  })();
  return _creamLoading;
}

// Synth fallback so the drag still ticks if the WAV fetch hasn't landed yet.
function playSynthTick(ctx: AudioContext, volumeScale: number, variantIndex: number) {
  const now = ctx.currentTime;
  const variants = [2400, 2200, 2600, 2050, 2800, 2300, 2500];
  const base = variants[variantIndex % variants.length];
  const osc = ctx.createOscillator();
  const noise = ctx.createBufferSource();
  const noiseBuf = ctx.createBuffer(1, 220, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = noiseBuf;
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.018);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5 * volumeScale, now + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
  osc.connect(gain);
  noise.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  noise.start(now);
  osc.stop(now + 0.04);
  noise.stop(now + 0.02);
}

function playTickNow(ctx: AudioContext, volumeScale: number) {
  const now = ctx.currentTime;
  if (!_ticks.length) {
    playSynthTick(ctx, volumeScale, _tickIndex++);
    return;
  }
  const buf = _ticks[_tickIndex % _ticks.length];
  _tickIndex++;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = TICK_GAIN * volumeScale;
  // Direct path: no filters, no compressor — same straight-through signal
  // chain TickPlayer.swift uses with AVAudioPlayer.
  src.connect(gain).connect(ctx.destination);
  src.start(now + 0.002);
}

export function playTick(volumeScale = 1) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  if (now - _lastTickAt < TICK_MIN_INTERVAL) return;
  _lastTickAt = now;
  playTickNow(ctx, volumeScale);
}

/** Deliberately overwhelming demo path: one tick for every pointer update. */
export function playTickUnthrottled(volumeScale = 1) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  playTickNow(ctx, volumeScale);
}

// Convert the macOS one-pole IIR alpha into a Biquad lowpass cutoff (Hz).
// A one-pole `y += alpha * (x - y)` has its -3dB point at
// fc = -fs/(2π) · ln(1 - alpha). At alpha=0.06, sr=44.1k → ~430 Hz.
function lpfCutoffFromToneX(toneX: number, sampleRate: number): number {
  if (toneX >= 0.99) return Math.min(20000, sampleRate / 2 - 100); // bypass
  const alpha = Math.max(0.06, toneX * toneX);
  const fc = (-sampleRate / (2 * Math.PI)) * Math.log(1 - alpha);
  return Math.max(80, Math.min(20000, fc));
}

export function playTonePreview({
  toneX,
  toneY,
  volume = 0.55,
}: {
  toneX: number;
  toneY: number;
  volume?: number;
}) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const buffers = _cream;
  if (!buffers || !buffers.down.length) return;
  const dest = getCompressor() ?? ctx.destination;

  // Shared shaping coefficients — same numbers the macOS engine uses.
  const thockiness = Math.max(0, 1 - toneX);
  const applyLPF = toneX < 0.99;
  const wetMakeup = applyLPF ? 1 + thockiness * thockiness * 3 : 1;
  const dryMix = applyLPF ? thockiness * 0.45 : 0;
  const cutoff = lpfCutoffFromToneX(toneX, ctx.sampleRate);
  const playbackRate = 0.88 + toneY * 0.24;

  const shapeNode = (buffer: AudioBuffer | undefined, baseGain: number, startOffset: number) => {
    if (!buffer) return;
    const now = ctx.currentTime + startOffset;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;

    const wet = ctx.createGain();
    const dry = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    // Shallow Q so the biquad behaves like the native one-pole — no ringing.
    lp.Q.value = 0.5;
    wet.gain.value = wetMakeup;
    dry.gain.value = dryMix;

    // Master envelope keeps overlapping releases from clipping.
    const env = ctx.createGain();
    const target = baseGain * volume;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(target, now + 0.003);
    const dur = buffer.duration / playbackRate;
    if (dur > 0.04) {
      env.gain.setValueAtTime(target, now + dur - 0.02);
      env.gain.linearRampToValueAtTime(0.0001, now + dur);
    }

    // Wet path: src → lp → wet (makeup) → env → dest
    // Dry path:  src → dry → env → dest  (parallel, only when LPF is active)
    src.connect(lp).connect(wet).connect(env);
    if (dryMix > 0) src.connect(dry).connect(env);
    env.connect(dest);
    src.start(now);
    src.stop(now + dur + 0.04);
  };

  for (let i = 0; i < PREVIEW_PRESS_COUNT; i++) {
    const downBuf = buffers.down[_rrIndex % buffers.down.length];
    const upBuf = buffers.up[_rrIndex % Math.max(buffers.up.length, 1)];
    _rrIndex++;
    const offsetSec = (i * PREVIEW_PRESS_GAP_MS) / 1000;
    shapeNode(downBuf, 0.55 * CREAM_NORM, offsetSec);
    // Up offset scales with playbackRate so a deeper voice still has a
    // proportional release.
    shapeNode(upBuf, 0.4 * CREAM_NORM, offsetSec + PREVIEW_UP_OFFSET_MS / 1000 / playbackRate);
  }
}

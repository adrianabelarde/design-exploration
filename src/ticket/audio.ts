import punchSampleUrl from '../assets/punch-sample.mp3';

/**
 * Punch audio. The hero path plays slices of a real ticket-punch recording:
 * the file holds ten distinct punches (~1s apart), so we detect the ten
 * spike onsets by envelope threshold and fire ONE spike per hole, cycling
 * through all ten so consecutive punches never sound identical. Rapid-fire
 * word punching plays the slices sped up to sit tight on the 40ms hole
 * cadence. If the sample fails to load, a procedural ka-chunk (metallic
 * snap + lever thud + paper tick) fills in.
 */

/**
 * One punch of the recording, split into its two mechanical halves. Each
 * ~1s spike is really a pair: the loud bite when the die shears the paper,
 * then ~250-300ms later a much quieter tick as the spring pops the jaws
 * back open (about 10x down, which is why plain onset detection sees one
 * event). We slice both and boost the release to a usable level.
 */
interface PunchSlice {
  start: number;
  pressDur: number;
  release: number;
  releaseDur: number;
  releaseBoost: number;
}

/** Spike starts by rising-edge envelope crossing, then per-spike release. */
function analyzePunches(buffer: AudioBuffer): PunchSlice[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const win = 256;
  const n = Math.floor(data.length / win);
  const env = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * win; j < (i + 1) * win; j++) sum += Math.abs(data[j]);
    env[i] = sum / win;
    if (env[i] > peak) peak = env[i];
  }
  const thresh = peak * 0.28;
  const refractory = Math.round((0.15 * sr) / win);
  const onsets: number[] = [];
  let last = -refractory;
  for (let i = 1; i < n; i++) {
    if (env[i] > thresh && env[i - 1] <= thresh && i - last >= refractory) {
      // Back up a few ms so the transient's attack is not clipped.
      onsets.push(Math.max(0, (i * win) / sr - 0.012));
      last = i;
    }
  }

  return onsets.map((start, i) => {
    const next = i + 1 < onsets.length ? onsets[i + 1] : buffer.duration;
    const toIdx = (s: number) => Math.min(n - 1, Math.max(0, Math.round((s * sr) / win)));

    // Press loudness, for scaling the release against.
    let pressPeak = 0;
    for (let k = toIdx(start); k <= toIdx(start + 0.1); k++) {
      if (env[k] > pressPeak) pressPeak = env[k];
    }

    // The release tick: loudest envelope point once the bite has decayed.
    const lo = toIdx(start + 0.15);
    const hi = toIdx(Math.min(next - 0.05, start + 0.6));
    let relIdx = lo;
    for (let k = lo; k <= hi; k++) {
      if (env[k] > env[relIdx]) relIdx = k;
    }
    const relPeak = env[relIdx];
    const found = relPeak > peak * 0.008;
    const release = found ? Math.max(start + 0.12, (relIdx * win) / sr - 0.015) : start + 0.25;
    const end = Math.min(next - 0.02, release + 0.25);

    return {
      start,
      pressDur: Math.min(release - start - 0.01, 0.22),
      release,
      releaseDur: Math.max(0.06, end - release),
      // Aim the release at ~45% of its press's loudness; a real spring-back
      // is clearly quieter than the bite, but not buried.
      releaseBoost: found ? Math.min(10, Math.max(1, (pressPeak * 0.45) / relPeak)) : 3,
    };
  });
}

class TicketAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private sample: AudioBuffer | null = null;
  private slices: PunchSlice[] = [];
  private sliceIdx = 0;
  private heldIdx = 0;
  private loading = false;

  /** Decode + analyze the punch recording; safe to call before any gesture. */
  preload(): void {
    if (this.loading || this.sample) return;
    this.loading = true;
    void (async () => {
      try {
        const res = await fetch(punchSampleUrl);
        const bytes = await res.arrayBuffer();
        // OfflineAudioContext decodes without autoplay-policy complaints;
        // the resulting AudioBuffer is context-independent.
        const buffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes);
        const slices = analyzePunches(buffer);
        if (slices.length >= 3) {
          this.sample = buffer;
          this.slices = slices;
          this.sliceIdx = Math.floor(Math.random() * slices.length);
        }
      } catch {
        // Procedural fallback stays in charge.
      }
    })();
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.preload();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  /** Play a [start, start+dur) window of the recording. */
  private playSlice(start: number, dur: number, gain: number, rate: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sample) return;
    const t = ctx.currentTime;
    const playRate = rate * (0.96 + Math.random() * 0.08);
    const wallDur = dur / playRate;

    const src = ctx.createBufferSource();
    src.buffer = this.sample;
    src.playbackRate.value = playRate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.setValueAtTime(gain, t + wallDur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + wallDur);
    src.connect(g).connect(this.master);
    src.start(t, start, dur);
  }

  /**
   * The bite: die shears through the paper. Round-robin through the ten
   * recorded punches; remembers which one so the matching release() plays
   * the same tool's spring-back.
   */
  press(intensity = 1, rate = 1): void {
    if (!this.ctx || this.muted) return;
    if (this.sample && this.slices.length > 0) {
      this.heldIdx = this.sliceIdx;
      this.sliceIdx = (this.sliceIdx + 1) % this.slices.length;
      const s = this.slices[this.heldIdx];
      this.playSlice(s.start, s.pressDur, 0.95 * intensity, rate);
      return;
    }
    this.proceduralPress(intensity);
  }

  /** The spring-back: jaws pop open. Quieter twin of the last press(). */
  release(intensity = 1, rate = 1): void {
    if (!this.ctx || this.muted) return;
    if (this.sample && this.slices.length > 0) {
      const s = this.slices[this.heldIdx];
      this.playSlice(s.release, s.releaseDur, Math.min(0.95, s.releaseBoost * 0.28) * intensity, rate);
      return;
    }
    this.proceduralRelease(intensity);
  }

  /**
   * One full punch (bite + natural spring-back tail), for the rapid-fire
   * word sequence. `rate` speeds the slice up (~1.45x sits each spike on
   * the 40ms hole cadence).
   */
  kachunk(intensity = 1, rate = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;

    if (this.sample && this.slices.length > 0) {
      const i = this.sliceIdx;
      this.sliceIdx = (this.sliceIdx + 1) % this.slices.length;
      const start = this.slices[i].start;
      const next = i + 1 < this.slices.length ? this.slices[i + 1].start : this.sample.duration;
      this.playSlice(start, Math.min(next - start, 0.45), 0.95 * intensity, rate);
      return;
    }
    this.proceduralPress(intensity);
  }

  /** Procedural fallback for the bite (no sample decoded). */
  private proceduralPress(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    if (!this.noise) return;
    const vary = 0.9 + Math.random() * 0.2;

    // Metallic die snap.
    const snap = ctx.createBufferSource();
    snap.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (2300 + Math.random() * 900) * vary;
    bp.Q.value = 1.3;
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(0.42 * intensity, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    snap.connect(bp).connect(snapGain).connect(this.master);
    snap.start(t, Math.random() * 0.3);
    snap.stop(t + 0.09);

    // Lever thud.
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(155 * vary, t);
    thud.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.3 * intensity, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    thud.connect(thudGain).connect(this.master);
    thud.start(t);
    thud.stop(t + 0.13);

    // Paper tick.
    const tick = ctx.createBufferSource();
    tick.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(0.1 * intensity, t + 0.005);
    tickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    tick.connect(hp).connect(tickGain).connect(this.master);
    tick.start(t + 0.005, Math.random() * 0.3);
    tick.stop(t + 0.04);
  }

  /** Procedural fallback for the spring-back: a small, brighter clack. */
  private proceduralRelease(intensity: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;

    const clack = ctx.createBufferSource();
    clack.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400 + Math.random() * 800;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    clack.connect(bp).connect(g).connect(this.master);
    clack.start(t, Math.random() * 0.3);
    clack.stop(t + 0.07);
  }
}

export const ticketAudio = new TicketAudio();

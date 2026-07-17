/**
 * The View-Master click-clack, procedural for now. A real pull has two
 * transients, same grammar as the hole puncher: the pawl driving the disc
 * on the down-stroke (click) and the lever springing home on release
 * (clack). Swap in an onset-sliced recording of a real Model G later —
 * the call sites won't change.
 */
class ReelAudio {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Call from a user gesture so autoplay policy lets the clicks through. */
  unlock() {
    this.ensure();
  }

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf || this.noiseBuf.sampleRate !== ctx.sampleRate) {
      const len = Math.floor(ctx.sampleRate * 0.12);
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  private burst(
    ctx: AudioContext,
    at: number,
    freq: number,
    q: number,
    dur: number,
    gain: number,
    type: BiquadFilterType = 'bandpass',
  ) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq * (0.95 + Math.random() * 0.1);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  /** Down-stroke: the pawl shoves the disc one index. Solid, woody. */
  click(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.001;
    // low thump of the whole body taking the shove
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * intensity, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
    // plastic contact
    this.burst(ctx, t, 1500, 1.1, 0.035, 0.45 * intensity);
    // the detent tick as the next frame seats
    this.burst(ctx, t + 0.008, 3900, 2, 0.014, 0.14 * intensity, 'highpass');
  }

  /** Release: the lever springs home. Lighter, brighter. */
  clack(intensity = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + 0.001;
    this.burst(ctx, t, 2700, 2, 0.03, 0.26 * intensity);
    this.burst(ctx, t + 0.012, 5100, 2.5, 0.012, 0.09 * intensity, 'highpass');
  }
}

export const reelAudio = new ReelAudio();

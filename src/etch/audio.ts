/**
 * Procedural sound — no samples.
 *  - drawing: band-passed noise, gain tracking stylus speed (powder scraping)
 *  - shaking: low-passed noise bursts (powder + beads rattling in the case)
 *
 * The AudioContext is created lazily on first user gesture (autoplay policy).
 */

class EtchAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private scratchGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private muted = false;

  private ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    bp.Q.value = 0.7;
    this.scratchGain = ctx.createGain();
    this.scratchGain.gain.value = 0;
    src.connect(bp).connect(this.scratchGain).connect(this.master);
    src.start();
  }

  /** Call on any first pointer interaction. */
  unlock() {
    this.ensure();
  }

  /** speed in px/s of stylus travel. */
  scratch(speed: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const level = Math.min(0.085, 0.012 + (speed / 3000) * 0.07);
    const g = this.scratchGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(level, t, 0.02);
    g.setTargetAtTime(0, t + 0.07, 0.05);
  }

  /** One shake of the case. energy in [0,1]. */
  rattle(energy: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + Math.random() * 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.09 + 0.2 * energy, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16 + 0.12 * energy);
    src.connect(lp).connect(g).connect(this.master);
    const offset = Math.random() * (this.noiseBuffer.duration - 0.4);
    src.start(t, offset, 0.35);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }
}

export const etchAudio = new EtchAudio();

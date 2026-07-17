/**
 * Physical constants of the classic Ohio Art Etch A Sketch ("Magic Screen"),
 * used to scale the digital reproduction 1:1.
 *
 * The machine: each knob winds a steel wire around a spool. The wires run a
 * pulley system that drives two orthogonal rails; the stylus sits where they
 * cross. Knob rotation → linear stylus travel is therefore just arc length:
 *
 *   Δx = r_spool · Δθ
 *
 * The screen's inside face is coated with aluminum powder (held on by
 * electrostatic attraction, kept flowing by polystyrene beads). The stylus
 * scrapes powder off — the "line" is the dark interior showing through.
 * Shaking redeposits powder and re-coats the glass.
 */

/** Drawing window of the Pocket Etch A Sketch, in millimetres. */
export const SCREEN_W_MM = 78;
export const SCREEN_H_MM = 55.5;

/** Contact patch of the stylus tip against the glass. */
export const STYLUS_TIP_MM = 0.7;

/**
 * Effective radius of the wire spool on each knob shaft.
 * One full knob turn advances the stylus 2πr ≈ 22 mm — about 28% of the
 * pocket screen width, i.e. ~3.5 turns to cross the whole screen.
 */
export const SPOOL_RADIUS_MM = 3.5;

/**
 * Slack in the wire/pulley drive. When you reverse a knob, it turns freely
 * through this angle before the stylus responds — mechanical backlash.
 */
export const BACKLASH_RAD = 0.15;

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

/**
 * Models drive-train slack: input rotation is absorbed by a dead band of
 * ±BACKLASH_RAD/2 before any output motion is transmitted.
 */
export class Backlash {
  private slack = 0;
  private readonly range: number;

  constructor(range = BACKLASH_RAD) {
    this.range = range;
  }

  /** Feed a knob delta (rad); returns the delta actually reaching the rail. */
  apply(delta: number): number {
    this.slack += delta;
    const half = this.range / 2;
    if (this.slack > half) {
      const out = this.slack - half;
      this.slack = half;
      return out;
    }
    if (this.slack < -half) {
      const out = this.slack + half;
      this.slack = -half;
      return out;
    }
    return 0;
  }
}

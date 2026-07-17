/**
 * The silver bell silhouette, normalized to a -1..1 box with y pointing DOWN
 * (canvas convention; negate y for THREE.Shape).
 *
 * Real conductors' punches each cut a unique registered die shape (bells,
 * stars, crescents) so a forged punch mark could be traced. Ours cuts a bell.
 */
export interface BellTracer {
  moveTo(x: number, y: number): unknown;
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  closePath(): unknown;
}

export function traceBell(t: BellTracer): void {
  t.moveTo(0, -1);
  t.bezierCurveTo(0.42, -0.98, 0.56, -0.62, 0.58, -0.2);
  t.bezierCurveTo(0.6, 0.18, 0.74, 0.42, 0.92, 0.58);
  t.lineTo(0.92, 0.76);
  t.lineTo(-0.92, 0.76);
  t.lineTo(-0.92, 0.58);
  t.bezierCurveTo(-0.74, 0.42, -0.6, 0.18, -0.58, -0.2);
  t.bezierCurveTo(-0.56, -0.62, -0.42, -0.98, 0, -1);
  t.closePath();
}

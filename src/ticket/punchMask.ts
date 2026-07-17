import * as THREE from 'three';
import { traceBell } from './bell';

/**
 * The punch mask: white = intact card, black = void. It is seeded from the
 * ticket's die-cut silhouette (side notches and all), so the shader's
 * discard + paper-rim logic treats the factory-cut outline exactly like a
 * punched hole edge. Punches then carve black on top.
 */
export class PunchMask {
  readonly width = 1536;
  readonly height: number;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private bell: Path2D;
  private silhouette: HTMLCanvasElement;

  constructor(aspect: number, silhouette: HTMLCanvasElement) {
    this.height = Math.round(this.width / aspect);
    this.silhouette = silhouette;
    const canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    this.bell = new Path2D();
    traceBell(this.bell);
    this.bell.closePath();

    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.reset();
  }

  /**
   * Punch at ticket UV (u right, v up). `rFrac` is the hole radius as a
   * fraction of ticket WIDTH; the mask canvas shares the ticket's aspect,
   * so a circle in mask pixels is a circle in world space.
   */
  punch(u: number, v: number, rFrac: number, shape: 'circle' | 'bell' = 'circle', angle = 0): void {
    const ctx = this.ctx;
    const r = rFrac * this.width;
    ctx.save();
    ctx.translate(u * this.width, (1 - v) * this.height);
    ctx.rotate(angle);
    ctx.fillStyle = '#000000';
    if (shape === 'bell') {
      ctx.scale(r * 1.12, r * 1.12);
      ctx.fill(this.bell);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  /** Is there still card (not void, not already punched) at this UV? */
  isSolid(u: number, v: number): boolean {
    const x = Math.min(this.width - 1, Math.max(0, Math.round(u * this.width)));
    const y = Math.min(this.height - 1, Math.max(0, Math.round((1 - v) * this.height)));
    return this.ctx.getImageData(x, y, 1, 1).data[0] > 127;
  }

  reset(): void {
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.silhouette, 0, 0, this.width, this.height);
    this.texture.needsUpdate = true;
  }
}

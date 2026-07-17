/**
 * The screen, modelled the way the real one works:
 *
 *  - a dark "interior" layer at the bottom (the inside of the toy)
 *  - an aluminum-powder layer on top (silver, grainy, faintly sparkling)
 *  - the stylus ERASES powder (destination-out), revealing the dark interior.
 *    A line can never get darker by redrawing — there's no ink.
 *  - shaking redeposits powder (source-over film + clumps), proportional to
 *    shake energy. One shake never fully erases; ghost lines are authentic.
 */

const INTERIOR_TOP = '#2d2f34';
const INTERIOR_BOTTOM = '#212327';
const POWDER_TOP = '#cfd2d5';
const POWDER_BOTTOM = '#b5b8bc';
const POWDER_MID = '#c2c5c9';

/** Fraction of a full even re-coat applied per unit of shake energy. */
const FILM_PER_SHAKE = 0.4;

/** Tileable speck field: powder grain + occasional aluminum-flake sparkle. */
function makeSpeckTile(): HTMLCanvasElement {
  const size = 128;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext('2d')!;

  for (let i = 0; i < 1600; i++) {
    const light = Math.random() < 0.42;
    ctx.fillStyle = light
      ? `rgba(255,255,255,${0.12 + Math.random() * 0.25})`
      : `rgba(88,92,98,${0.08 + Math.random() * 0.24})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }
  // aluminum flakes catching the light
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.45})`;
    const s = Math.random() < 0.2 ? 2 : 1;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  return tile;
}

/** Freehand stroke outline (from perfect-freehand) as a smooth Path2D. */
function outlinePath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 3) {
    if (outline.length > 0) {
      path.arc(outline[0][0], outline[0][1], 1, 0, Math.PI * 2);
    }
    return path;
  }
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
  }
  path.closePath();
  return path;
}

export class PowderScreen {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly powder: HTMLCanvasElement;
  private readonly pctx: CanvasRenderingContext2D;
  private readonly speckPattern: CanvasPattern;
  private readonly dpr: number;
  private readonly w: number;
  private readonly h: number;
  private readonly lineW: number;

  constructor(canvas: HTMLCanvasElement, w: number, h: number, lineW: number) {
    this.w = w;
    this.h = h;
    this.lineW = lineW;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * this.dpr;
    canvas.height = h * this.dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(this.dpr, this.dpr);

    this.powder = document.createElement('canvas');
    this.powder.width = w * this.dpr;
    this.powder.height = h * this.dpr;
    this.pctx = this.powder.getContext('2d')!;
    this.pctx.scale(this.dpr, this.dpr);

    this.speckPattern = this.pctx.createPattern(makeSpeckTile(), 'repeat')!;
    try {
      // keep grain 1 device-pixel fine on retina screens
      this.speckPattern.setTransform(new DOMMatrix().scale(1 / this.dpr));
    } catch {
      /* older engines: slightly coarser grain, still fine */
    }

    this.coat(1);
    this.render();
  }

  /** Lay down an even film of powder over everything. */
  private coat(alpha: number) {
    const p = this.pctx;
    p.save();
    p.globalAlpha = alpha;
    const g = p.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, POWDER_TOP);
    g.addColorStop(1, POWDER_BOTTOM);
    p.fillStyle = g;
    p.fillRect(0, 0, this.w, this.h);
    p.fillStyle = this.speckPattern;
    p.fillRect(0, 0, this.w, this.h);
    p.restore();
  }

  /** Scrape a furrow from (x0,y0) to (x1,y1). */
  line(x0: number, y0: number, x1: number, y1: number) {
    const p = this.pctx;
    p.save();
    p.globalCompositeOperation = 'destination-out';
    p.lineCap = 'round';
    p.lineJoin = 'round';

    // disturbed powder at the furrow's shoulders
    p.globalAlpha = 0.16;
    p.lineWidth = this.lineW * 2.4;
    p.beginPath();
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    p.stroke();

    // the furrow itself — not quite total, a whisper of powder remains
    p.globalAlpha = 0.92;
    p.lineWidth = this.lineW;
    p.beginPath();
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    p.stroke();

    p.restore();
    this.render();
  }

  /**
   * Live preview of an in-progress freehand stroke: the outline is painted
   * OVER the powder in interior color, visually identical to erased powder,
   * without touching the powder layer (the outline keeps reshaping as
   * points arrive, and erasure is destructive).
   */
  previewStroke(outline: number[][]) {
    this.render();
    if (outline.length < 2) return;
    const c = this.ctx;
    const path = outlinePath(outline);
    c.save();
    c.globalAlpha = 0.14; // disturbed powder at the shoulders
    c.strokeStyle = INTERIOR_BOTTOM;
    c.lineWidth = this.lineW * 1.2;
    c.stroke(path);
    c.globalAlpha = 0.92;
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, INTERIOR_TOP);
    g.addColorStop(1, INTERIOR_BOTTOM);
    c.fillStyle = g;
    c.fill(path);
    c.restore();
  }

  /** Carve a finished freehand stroke out of the powder for real. */
  commitStroke(outline: number[][]) {
    if (outline.length >= 2) {
      const p = this.pctx;
      const path = outlinePath(outline);
      p.save();
      p.globalCompositeOperation = 'destination-out';
      p.globalAlpha = 0.16;
      p.lineWidth = this.lineW * 1.2;
      p.stroke(path);
      p.globalAlpha = 0.92;
      p.fill(path);
      p.restore();
    }
    this.render();
  }

  /** The stylus never lifts off the glass — its resting point shows. */
  dot(x: number, y: number) {
    const p = this.pctx;
    p.save();
    p.globalCompositeOperation = 'destination-out';
    p.globalAlpha = 0.9;
    p.beginPath();
    p.arc(x, y, this.lineW * 0.55, 0, Math.PI * 2);
    p.fill();
    p.restore();
    this.render();
  }

  /**
   * One shake's worth of powder redeposition. `energy` in [0,1].
   * An even film plus soft clumps — repeated shakes converge to a clean coat.
   */
  deposit(energy: number) {
    const e = Math.min(1, Math.max(0, energy));
    this.coat(FILM_PER_SHAKE * e);

    const p = this.pctx;
    p.save();
    p.filter = 'blur(2px)';
    p.fillStyle = POWDER_MID;
    const clumps = 6 + Math.round(16 * e);
    for (let i = 0; i < clumps; i++) {
      p.globalAlpha = (0.08 + Math.random() * 0.22) * e;
      p.beginPath();
      p.arc(
        Math.random() * this.w,
        Math.random() * this.h,
        8 + Math.random() * 44,
        0,
        Math.PI * 2,
      );
      p.fill();
    }
    p.restore();
    this.render();
  }

  private render() {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, INTERIOR_TOP);
    g.addColorStop(1, INTERIOR_BOTTOM);
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, this.h);
    c.drawImage(this.powder, 0, 0, this.w, this.h);
  }
}

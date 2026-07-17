import * as THREE from 'three';
import { traceBell } from './bell';
import { deriveMaps } from './maps';
import ticketUrl from '../assets/polar-ticket.png';

/**
 * Ticket artwork. The hero path loads the generated ticket render, scrubs
 * any background off it, and uses its ALPHA as the die-cut silhouette (the
 * side notches included), so the visible shape is the ticket's own outline.
 * Normal + roughness maps are derived from the art so the engraving reads
 * as pressed-in relief, not print. If the asset fails to load, a procedural
 * ticket is drawn instead.
 */

const TEX_W = 2048;

export interface TicketMaps {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface TicketArt {
  front: TicketMaps;
  back: TicketMaps;
  /** width / height */
  aspect: number;
  /** White ticket shape on black; seeds the punch mask (and its die-cut rim). */
  silhouette: HTMLCanvasElement;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/* ---- photo path ---------------------------------------------------------- */

interface ProcessedPhoto {
  /** Cropped to the ticket, transparent background. */
  cropped: HTMLCanvasElement;
  aspect: number;
  /** Mean color of the ticket body, used to pad the albedo behind the cut. */
  fill: string;
}

/**
 * Flood-clean the background from the borders in (transparent pixels and
 * anything close to the border color), then crop to the opaque bbox. Border
 * flooding cannot eat the ticket interior: bright gold sits far from both
 * white and transparent in color distance.
 */
function processPhoto(img: HTMLImageElement): ProcessedPhoto {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const [work, wctx] = makeCanvas(w, h);
  wctx.drawImage(img, 0, 0);
  const id = wctx.getImageData(0, 0, w, h);
  const d = id.data;

  // Background reference: the corner pixels (if they are opaque at all).
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  let bgR = 0, bgG = 0, bgB = 0, bgOpaque = 0;
  for (const c of corners) {
    if (d[c * 4 + 3] > 200) {
      bgR += d[c * 4];
      bgG += d[c * 4 + 1];
      bgB += d[c * 4 + 2];
      bgOpaque++;
    }
  }
  if (bgOpaque > 0) {
    bgR /= bgOpaque;
    bgG /= bgOpaque;
    bgB /= bgOpaque;
  }
  const TOL2 = 34 * 34;
  const isBg = (p: number) => {
    const o = p * 4;
    if (d[o + 3] < 40) return true;
    if (bgOpaque === 0) return false;
    const dr = d[o] - bgR;
    const dg = d[o + 1] - bgG;
    const db = d[o + 2] - bgB;
    return dr * dr + dg * dg + db * db < TOL2;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) {
    for (const p of [x, (h - 1) * w + x]) {
      if (!visited[p] && isBg(p)) { visited[p] = 1; stack.push(p); }
    }
  }
  for (let y = 0; y < h; y++) {
    for (const p of [y * w, y * w + w - 1]) {
      if (!visited[p] && isBg(p)) { visited[p] = 1; stack.push(p); }
    }
  }
  while (stack.length) {
    const p = stack.pop()!;
    d[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0 && !visited[p - 1] && isBg(p - 1)) { visited[p - 1] = 1; stack.push(p - 1); }
    if (x < w - 1 && !visited[p + 1] && isBg(p + 1)) { visited[p + 1] = 1; stack.push(p + 1); }
    if (y > 0 && !visited[p - w] && isBg(p - w)) { visited[p - w] = 1; stack.push(p - w); }
    if (y < h - 1 && !visited[p + w] && isBg(p + w)) { visited[p + w] = 1; stack.push(p + w); }
  }

  // Opaque bbox and mean ticket color.
  let minX = w, minY = h, maxX = 0, maxY = 0;
  let mr = 0, mg = 0, mb = 0, mn = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (d[o + 3] >= 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if ((x + y) % 7 === 0) { mr += d[o]; mg += d[o + 1]; mb += d[o + 2]; mn++; }
      }
    }
  }
  wctx.putImageData(id, 0, 0);

  const bw = Math.max(maxX - minX + 1, 1);
  const bh = Math.max(maxY - minY + 1, 1);
  const [cropped, cctx] = makeCanvas(bw, bh);
  cctx.drawImage(work, minX, minY, bw, bh, 0, 0, bw, bh);

  // The render is a moody dark amber, but with metalness at 1 the albedo
  // scales every reflection: dark art = dark gold, no lighting can fix it.
  // Lift the mid-tones (gamma 0.78 + a little gain) so the foil reads bright.
  const lift = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    lift[v] = Math.min(255, Math.round(255 * Math.pow(v / 255, 0.78) * 1.06));
  }
  const cid = cctx.getImageData(0, 0, bw, bh);
  const cd = cid.data;
  for (let i = 0; i < cd.length; i += 4) {
    cd[i] = lift[cd[i]];
    cd[i + 1] = lift[cd[i + 1]];
    cd[i + 2] = lift[cd[i + 2]];
  }
  cctx.putImageData(cid, 0, 0);

  const fill = mn > 0
    ? `rgb(${Math.round(mr / mn)}, ${Math.round(mg / mn)}, ${Math.round(mb / mn)})`
    : '#c8a24a';
  return { cropped, aspect: bw / bh, fill };
}

function photoArt(photo: ProcessedPhoto): TicketArt {
  const texH = Math.round(TEX_W / photo.aspect);

  // Albedo padded with the mean gold behind the cut, so the Sobel derivation
  // sees a continuous surface instead of a cliff at the die-cut edge.
  const [front, fctx] = makeCanvas(TEX_W, texH);
  fctx.fillStyle = photo.fill;
  fctx.fillRect(0, 0, TEX_W, texH);
  fctx.drawImage(photo.cropped, 0, 0, TEX_W, texH);

  // Back: the same art pre-mirrored (see Ticket.tsx on why mirroring works).
  const [back, bctx] = makeCanvas(TEX_W, texH);
  bctx.fillStyle = photo.fill;
  bctx.fillRect(0, 0, TEX_W, texH);
  bctx.translate(TEX_W, 0);
  bctx.scale(-1, 1);
  bctx.drawImage(photo.cropped, 0, 0, TEX_W, texH);

  // Silhouette from alpha: white shape on black. Symmetric enough that the
  // mirrored back shares it (the punch mask is sampled by shared UVs).
  const [sil, sctx] = makeCanvas(TEX_W, texH);
  sctx.drawImage(photo.cropped, 0, 0, TEX_W, texH);
  const sid = sctx.getImageData(0, 0, TEX_W, texH);
  const sd = sid.data;
  for (let i = 0; i < TEX_W * texH; i++) {
    const o = i * 4;
    const solid = sd[o + 3] > 127 ? 255 : 0;
    sd[o] = solid;
    sd[o + 1] = solid;
    sd[o + 2] = solid;
    sd[o + 3] = 255;
  }
  sctx.putImageData(sid, 0, 0);

  // The render already carries its own baked relief and shading; derived
  // normals stay whisper-subtle so they don't double the emboss, and
  // roughness varies just enough for the engraving to gloss differently.
  return {
    front: toTextures(front, { strength: 0.55, blur: 2.2, roughMin: 0.42, roughMax: 0.72 }),
    back: toTextures(back, { strength: 0.55, blur: 2.2, roughMin: 0.42, roughMax: 0.72 }),
    aspect: photo.aspect,
    silhouette: sil,
  };
}

/* ---- procedural fallback -------------------------------------------------- */

const FALLBACK_H = 944;
const INK = (a: number) => `rgba(94, 62, 16, ${a})`;

function drawGoldBase(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, FALLBACK_H);
  g.addColorStop(0, '#e7c46f');
  g.addColorStop(0.16, '#f5e2a0');
  g.addColorStop(0.38, '#e0ba5c');
  g.addColorStop(0.6, '#d2a648');
  g.addColorStop(0.82, '#c3943c');
  g.addColorStop(1, '#dcb055');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, FALLBACK_H);

  for (let i = 0; i < 340; i++) {
    const y = Math.random() * FALLBACK_H;
    const a = 0.015 + Math.random() * 0.035;
    ctx.fillStyle =
      Math.random() < 0.5 ? `rgba(255, 244, 214, ${a})` : `rgba(122, 90, 32, ${a})`;
    ctx.fillRect(0, y, TEX_W, 1 + Math.random() * 2.2);
  }
  for (let i = 0; i < 3200; i++) {
    const a = 0.02 + Math.random() * 0.04;
    ctx.fillStyle =
      Math.random() < 0.5 ? `rgba(255, 250, 230, ${a})` : `rgba(96, 70, 24, ${a})`;
    ctx.fillRect(Math.random() * TEX_W, Math.random() * FALLBACK_H, 1.4, 1.4);
  }
  const v = ctx.createRadialGradient(
    TEX_W / 2, FALLBACK_H / 2, FALLBACK_H * 0.32,
    TEX_W / 2, FALLBACK_H / 2, TEX_W * 0.62,
  );
  v.addColorStop(0, 'rgba(88, 58, 12, 0)');
  v.addColorStop(1, 'rgba(88, 58, 12, 0.16)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, TEX_W, FALLBACK_H);
}

function drawBorder(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = INK(0.92);
  ctx.lineWidth = 7;
  ctx.strokeRect(44.5, 44.5, TEX_W - 89, FALLBACK_H - 89);
  ctx.strokeStyle = INK(0.5);
  ctx.lineWidth = 1.6;
  ctx.strokeRect(58, 58, TEX_W - 116, FALLBACK_H - 116);
  ctx.strokeStyle = INK(0.88);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(80, 80, TEX_W - 160, FALLBACK_H - 160);

  ctx.strokeStyle = INK(0.26);
  ctx.lineWidth = 1.1;
  const mid = 69;
  const ring = (cx: number, cy: number, rr = 12) => {
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  };
  for (let x = 92; x <= TEX_W - 92; x += 17) {
    ring(x, mid);
    ring(x, FALLBACK_H - mid);
  }
  for (let y = 92; y <= FALLBACK_H - 92; y += 17) {
    ring(mid, y);
    ring(TEX_W - mid, y);
  }
  for (const [cx, cy] of [
    [mid, mid], [TEX_W - mid, mid], [mid, FALLBACK_H - mid], [TEX_W - mid, FALLBACK_H - mid],
  ]) {
    ctx.strokeStyle = INK(0.85);
    ctx.lineWidth = 2.2;
    ring(cx, cy, 16);
    ctx.lineWidth = 1.4;
    ring(cx, cy, 9);
    ctx.fillStyle = INK(0.9);
    ctx.beginPath();
    ctx.arc(cx, cy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function caps(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  px: number,
  spacing: number,
  alpha = 0.88,
): void {
  ctx.fillStyle = INK(alpha);
  ctx.font = `600 ${px}px "Playfair Display", Georgia, serif`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, TEX_W / 2 + spacing / 2, y);
  ctx.letterSpacing = '0px';
}

function drawFront(ctx: CanvasRenderingContext2D): void {
  drawGoldBase(ctx);
  drawBorder(ctx);
  caps(ctx, 'NORTH POLE LINES', 176, 36, 16);
  ctx.strokeStyle = INK(0.5);
  ctx.lineWidth = 1.4;
  for (const [x0, x1] of [[320, 720], [TEX_W - 720, TEX_W - 320]]) {
    ctx.beginPath();
    ctx.moveTo(x0, 176);
    ctx.lineTo(x1, 176);
    ctx.stroke();
  }
  ctx.fillStyle = INK(0.94);
  ctx.font = '178px "Pinyon Script", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('The Polar Express', TEX_W / 2, 368);

  const fy = 486;
  ctx.strokeStyle = INK(0.55);
  ctx.lineWidth = 1.6;
  for (const [x0, x1] of [[TEX_W / 2 - 300, TEX_W / 2 - 46], [TEX_W / 2 + 46, TEX_W / 2 + 300]]) {
    ctx.beginPath();
    ctx.moveTo(x0, fy);
    ctx.lineTo(x1, fy);
    ctx.stroke();
  }
  ctx.fillStyle = INK(0.85);
  ctx.save();
  ctx.translate(TEX_W / 2, fy);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();

  ctx.fillStyle = INK(0.88);
  ctx.font = '600 30px "Playfair Display", Georgia, serif';
  ctx.letterSpacing = '8px';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('DECEMBER 24', 112, 844);
  ctx.textAlign = 'right';
  ctx.fillText('NO. 1225', TEX_W - 112, 844);
  ctx.letterSpacing = '0px';
}

function drawBack(ctx: CanvasRenderingContext2D): void {
  drawGoldBase(ctx);
  ctx.save();
  ctx.translate(TEX_W, 0);
  ctx.scale(-1, 1);
  drawBorder(ctx);
  caps(ctx, 'THE POLAR EXPRESS', 176, 36, 16);
  caps(ctx, 'ROUND TRIP', 388, 128, 14, 0.94);
  caps(ctx, 'GOOD FOR ONE RIDE', 844, 26, 10, 0.8);

  ctx.save();
  ctx.translate(TEX_W / 2, 648);
  ctx.scale(118, 118);
  ctx.lineWidth = 7 / 118;
  ctx.strokeStyle = INK(0.92);
  ctx.beginPath();
  traceBell(ctx);
  ctx.stroke();
  ctx.strokeStyle = INK(0.4);
  ctx.lineWidth = 3 / 118;
  ctx.beginPath();
  ctx.moveTo(-0.5, 0.42);
  ctx.bezierCurveTo(-0.2, 0.52, 0.2, 0.52, 0.5, 0.42);
  ctx.stroke();
  ctx.fillStyle = INK(0.9);
  ctx.beginPath();
  ctx.arc(0, 0.92, 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK(0.9);
  ctx.lineWidth = 5 / 118;
  ctx.beginPath();
  ctx.arc(0, -1.06, 0.11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

async function proceduralArt(): Promise<TicketArt> {
  try {
    await Promise.all([
      document.fonts.load('178px "Pinyon Script"'),
      document.fonts.load('600 36px "Playfair Display"'),
    ]);
  } catch {
    // Fallback serifs still produce a usable ticket.
  }
  const [front, fctx] = makeCanvas(TEX_W, FALLBACK_H);
  drawFront(fctx);
  const [back, bctx] = makeCanvas(TEX_W, FALLBACK_H);
  drawBack(bctx);
  const [sil, sctx] = makeCanvas(TEX_W, FALLBACK_H);
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0, 0, TEX_W, FALLBACK_H);

  return {
    front: toTextures(front, { strength: 1.7, blur: 1.3, roughMin: 0.46, roughMax: 0.95 }),
    back: toTextures(back, { strength: 1.7, blur: 1.3, roughMin: 0.46, roughMax: 0.95 }),
    aspect: TEX_W / FALLBACK_H,
    silhouette: sil,
  };
}

/* ---- shared --------------------------------------------------------------- */

function toTextures(
  albedo: HTMLCanvasElement,
  opts: Parameters<typeof deriveMaps>[1],
): TicketMaps {
  const { normal, roughness } = deriveMaps(albedo, opts);
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normal);
  const roughnessMap = new THREE.CanvasTexture(roughness);
  for (const t of [map, normalMap, roughnessMap]) t.anisotropy = 8;
  return { map, normalMap, roughnessMap };
}

export async function buildTicketArt(): Promise<TicketArt> {
  try {
    const img = await loadImage(ticketUrl);
    return photoArt(processPhoto(img));
  } catch {
    return proceduralArt();
  }
}

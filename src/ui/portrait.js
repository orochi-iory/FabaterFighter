/**
 * Retratos procedural de cada luchador (canvas 2D).
 * Se usan en la pantalla de selección y en el HUD.
 */

import { faceArt } from '../render/facepaint.js';

export function drawPortrait(canvas, def, opts = {}) {
  let ctx = opts.ctx || null;
  if (!ctx) { try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; } }
  if (!ctx) return;                       // entornos sin canvas 2D
  const W = canvas.width, H = canvas.height;
  const c = def.colors;
  const b = def.body;

  ctx.clearRect(0, 0, W, H);

  // Fondo
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, shade(c.trim, -0.45));
  bg.addColorStop(0.55, shade(c.gi, -0.6));
  bg.addColorStop(1, '#0a0713');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Haz de luz del color del personaje
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.62, 4, W * 0.5, H * 0.62, W * 0.75);
  glow.addColorStop(0, hexA(def.fx, 0.55));
  glow.addColorStop(1, hexA(def.fx, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Líneas de velocidad
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const y = (i / 14) * H + (opts.seed || 0) % 7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y - 12);
    ctx.stroke();
  }
  ctx.restore();

  const cx = W / 2;
  const scale = W / 128;
  const bulk = b.bulk || 1;

  // Cuerpo / hombros
  ctx.fillStyle = c.gi;
  ctx.beginPath();
  ctx.moveTo(cx - 46 * bulk * scale, H);
  ctx.quadraticCurveTo(cx - 44 * bulk * scale, H * 0.72, cx - 20 * bulk * scale, H * 0.62);
  ctx.lineTo(cx + 20 * bulk * scale, H * 0.62);
  ctx.quadraticCurveTo(cx + 44 * bulk * scale, H * 0.72, cx + 46 * bulk * scale, H);
  ctx.closePath();
  ctx.fill();

  // Cuello
  ctx.fillStyle = shade(c.skin, -0.12);
  ctx.fillRect(cx - 9 * scale, H * 0.55, 18 * scale, H * 0.12);

  // Cinturón / banda
  ctx.fillStyle = c.trim;
  ctx.fillRect(cx - 46 * bulk * scale, H * 0.86, 92 * bulk * scale, 7 * scale);

  // Detalle del traje
  ctx.fillStyle = hexA(c.accent, 0.85);
  ctx.beginPath();
  ctx.moveTo(cx, H * 0.66);
  ctx.lineTo(cx - 12 * scale, H * 0.86);
  ctx.lineTo(cx + 12 * scale, H * 0.86);
  ctx.closePath();
  ctx.fill();

  // Cabeza
  const headR = 26 * scale * (b.head || 1);
  const hy = H * 0.4;
  ctx.fillStyle = c.skin;
  roundRect(ctx, cx - headR, hy - headR * 1.15, headR * 2, headR * 2.3, 8 * scale);
  ctx.fill();

  // Pelo / casco
  ctx.fillStyle = c.hair;
  const style = b.hair || 'short';
  if (style === 'spiky') {
    ctx.beginPath();
    ctx.moveTo(cx - headR, hy - headR * 0.2);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      ctx.lineTo(cx - headR + t * headR * 2, hy - headR * (0.9 + (i % 2 ? 0.55 : 0.1)));
    }
    ctx.lineTo(cx + headR, hy - headR * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'ponytail' || style === 'long') {
    ctx.beginPath();
    ctx.ellipse(cx, hy - headR * 0.5, headR * 1.05, headR * 0.8, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx + headR * 0.6, hy - headR * 0.4, headR * 0.5, headR * (style === 'long' ? 3.2 : 2.2));
    if (style === 'long') ctx.fillRect(cx - headR * 1.1, hy - headR * 0.4, headR * 0.5, headR * 3.0);
  } else if (style === 'mohawk') {
    ctx.fillRect(cx - headR * 0.25, hy - headR * 2.0, headR * 0.5, headR * 1.6);
  } else if (style === 'flame') {
    ctx.beginPath();
    ctx.moveTo(cx - headR, hy - headR * 0.3);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      ctx.lineTo(cx - headR + t * headR * 2, hy - headR * (1.1 + Math.sin(i * 2.1) * 0.5 + 0.5));
    }
    ctx.lineTo(cx + headR, hy - headR * 0.3);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'mask') {
    ctx.fillStyle = c.gi;
    roundRect(ctx, cx - headR, hy - headR * 1.15, headR * 2, headR * 2.3, 8 * scale);
    ctx.fill();
  } else if (style === 'bald') {
    // nada
  } else if (style === 'flat') {
    ctx.fillRect(cx - headR, hy - headR * 1.15, headR * 2, headR * 0.7);
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, hy - headR * 0.45, headR * 1.02, headR * 0.75, 0, Math.PI, 0);
    ctx.fill();
  }

  // Accesorios
  if (b.band === 'headband') {
    ctx.fillStyle = c.trim;
    ctx.fillRect(cx - headR * 1.05, hy - headR * 0.55, headR * 2.1, headR * 0.34);
    ctx.fillRect(cx + headR * 0.9, hy - headR * 0.5, headR * 0.3, headR * 1.8);
  }
  if (b.beard) {
    ctx.fillStyle = c.hair;
    roundRect(ctx, cx - headR * 0.72, hy + headR * 0.35, headR * 1.44, headR * 0.95, 6 * scale);
    ctx.fill();
  }
  if (b.cap) {
    ctx.fillStyle = c.trim;
    ctx.fillRect(cx - headR * 1.05, hy - headR * 1.25, headR * 2.1, headR * 0.55);
    ctx.fillRect(cx - headR * 1.05, hy - headR * 0.75, headR * 2.9, headR * 0.22);
  }
  if (b.turban) {
    ctx.fillStyle = c.trim;
    ctx.beginPath();
    ctx.ellipse(cx, hy - headR * 0.85, headR * 1.25, headR * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(cx, hy - headR * 1.0, headR * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.scarf) {
    ctx.fillStyle = c.trim;
    roundRect(ctx, cx - headR * 1.1, hy + headR * 1.0, headR * 2.2, headR * 0.55, 4 * scale);
    ctx.fill();
  }

  // Cara: los mismos rasgos texturizados que lleva el modelo 3D.
  const face = faceCanvasFor(def);
  if (face) {
    const fw = headR * 2 * 0.94;
    const fh = fw * (128 / 96);
    ctx.drawImage(face, cx - fw / 2, hy - headR * 1.04, fw, fh);
  }

  // Sombra inferior + borde
  const vg = ctx.createLinearGradient(0, H * 0.6, 0, H);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, H * 0.6, W, H * 0.4);

  ctx.strokeStyle = hexA(c.accent, 0.9);
  ctx.lineWidth = 3 * scale;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
}

/* Canvas cacheado con los rasgos de la cara (mismo faceArt que el 3D). */
const faceCache = new Map();
function faceCanvasFor(def) {
  if (faceCache.has(def.id)) return faceCache.get(def.id);
  let out = null;
  try {
    const art = faceArt(def);
    const c = document.createElement('canvas');
    const x = c && typeof c.getContext === 'function' ? c.getContext('2d') : null;
    if (x) {
      c.width = art.w; c.height = art.h;
      x.putImageData(new ImageData(new Uint8ClampedArray(art.data), art.w, art.h), 0, 0);
      out = c;
    }
  } catch (e) { out = null; }
  faceCache.set(def.id, out);
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex, a) {
  const c = norm(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function shade(hex, amt) {
  const c = norm(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}

function norm(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

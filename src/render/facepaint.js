/**
 * Caras con textura: dibuja a píxel (sin canvas 2D, funciona en Node y en el
 * navegador) los rasgos de cada luchador sobre un RGBA transparente que luego
 * se pega como calco curvado delante de la cara geométrica.
 *
 * El calco solo pinta lo que el relieve no da bien: cejas, boca, barba
 * incipiente, cicatrices, pintura de guerra, pañoleta o visor. Los ojos y la
 * nariz siguen siendo geometría, para que la cara tenga profundidad real.
 */
import * as THREE from '../../vendor/three.module.min.js';

const W = 96, H = 128;

/* ------------------------------------------------------------------ */
/* Mini-rasterizador con alpha                                         */
/* ------------------------------------------------------------------ */

function makeBuf() { return new Uint8ClampedArray(W * H * 4); }

function blend(buf, x, y, r, g, b, a) {
  x |= 0; y |= 0;
  a = Math.min(1, a);
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const out = Math.min(255, a * 255 + buf[i + 3] * (1 - a));
  const k = out > 0 ? (a * 255) / out : 0;
  buf[i] = r * k + buf[i] * (1 - k);
  buf[i + 1] = g * k + buf[i + 1] * (1 - k);
  buf[i + 2] = b * k + buf[i + 2] * (1 - k);
  buf[i + 3] = out;
}

function line(buf, x0, y0, x1, y1, w, r, g, b, a) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
      if (dx * dx + dy * dy <= w * w) blend(buf, x + dx, y + dy, r, g, b, a);
    }
  }
}

function ellipse(buf, cx, cy, rx, ry, r, g, b, a, rot = 0) {
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -rx - 1; x <= rx + 1; x++) {
    const lx = x * cr + y * sr, ly = -x * sr + y * cr;
    const q = (lx * lx) / (rx * rx + 0.01) + (ly * ly) / (ry * ry + 0.01);
    if (q <= 1) blend(buf, cx + x, cy + y, r, g, b, a * Math.min(1, 1.5 - q));
  }
}

/* ------------------------------------------------------------------ */
/* Recetas por luchador                                                */
/* ------------------------------------------------------------------ */

const RECIPES = {
  kenji:   { browW: 2.6, browAng: -0.16, browY: 34, lips: 1, stubble: 0.15 },
  valeria: { browW: 1.6, browAng: -0.28, browY: 33, lips: 2, lipCol: [146, 52, 60], blush: 0.10 },
  brutus:  { browW: 3.4, browAng: 0.30, browY: 36, lips: 1, wide: 1.3, stubble: 0.5, scar: 1 },
  kagerou: { mask: 1, paint: 'stripe' },
  magnus:  { browW: 1.8, browAng: -0.05, browY: 34, lips: 1, goatee: 1, browCol: [210, 205, 198] },
  rex:     { browW: 2.2, browAng: 0.22, browY: 35, lips: 1, smirk: 1, stubble: 0.6 },
  orion:   { visor: 1, lips: 1 },
  sera:    { browW: 1.4, browAng: -0.30, browY: 33, lips: 2, lipCol: [158, 62, 74], blush: 0.12, bindi: 1 },
  goran:   { browW: 3.2, browAng: 0.26, browY: 36, lips: 1, wide: 1.25, stubble: 0.85 },
  vesper:  { browW: 1.7, browAng: -0.22, browY: 33, lips: 2, lipCol: [120, 44, 96], paint: 'bolt' }
};

/** Dibuja la cara y devuelve { data, w, h }. Determinista (sin Math.random). */
export function faceArt(def) {
  const R = RECIPES[def.id] || { browW: 2, browAng: -0.1, browY: 34, lips: 1 };
  const buf = makeBuf();
  const hair = new THREE.Color(def.colors.hair || '#333');
  hair.convertSRGBToLinear();
  const hr = hair.r * 255, hg = hair.g * 255, hb = hair.b * 255;
  const dark = (v) => v * 0.35 + 20;
  const bc = R.browCol || [dark(hr), dark(hg), dark(hb)];

  // Cejas: el extremo interior baja con browAng>0 (ceño) y sube con <0 (arco)
  if (!R.mask && !R.visor) {
    for (const s of [-1, 1]) {
      const len = 12 * (R.wide || 1);
      const xIn = 48 + s * 8, xOut = 48 + s * (8 + len);
      const yIn = R.browY + R.browAng * 16;
      const yOut = R.browY - R.browAng * 8 + Math.abs(R.browAng) * 4;
      line(buf, xIn, yIn, xOut, yOut, R.browW, bc[0], bc[1], bc[2], 0.95);
    }
  }

  // Boca
  const my = 96;
  if (R.mask) {
    // pañoleta cubriendo media cara
    for (let y = 78; y < H; y++) for (let x = 14; x < W - 14; x++) {
      const edge = Math.min(x - 14, W - 14 - x) / 10;
      blend(buf, x, y, 30, 30, 38, Math.min(1, edge) * 0.95);
    }
    line(buf, 20, 84, W - 20, 88, 1.4, 90, 30, 30, 0.8);
    line(buf, 20, 96, W - 20, 100, 1.4, 90, 30, 30, 0.6);
  } else if (R.lips === 2) {
    ellipse(buf, 48, my, 9, 3.4, R.lipCol[0], R.lipCol[1], R.lipCol[2], 0.9);
    ellipse(buf, 48, my + 3, 7.5, 2.6, R.lipCol[0] + 30, R.lipCol[1] + 20, R.lipCol[2] + 20, 0.8);
    line(buf, 40, my + 1.4, 56, my + 1.4, 0.8, 40, 10, 16, 0.7);
  } else {
    const wM = 9 * (R.wide || 1);
    if (R.smirk) line(buf, 48 - wM, my, 48 + wM, my - 3, 1.5, 60, 26, 26, 0.85);
    else line(buf, 48 - wM, my, 48 + wM, my + 1, 1.6, 62, 28, 28, 0.85);
    line(buf, 48 - wM * 0.6, my + 4, 48 + wM * 0.6, my + 4.5, 1.0, 255, 255, 255, 0.10); // labio inferior
  }

  // Sombra del tabique nasal
  if (!R.mask) {
    ellipse(buf, 48, 74, 3.2, 1.6, 0, 0, 0, 0.22);
    ellipse(buf, 44.5, 73, 1.4, 1.0, 0, 0, 0, 0.3);
    ellipse(buf, 51.5, 73, 1.4, 1.0, 0, 0, 0, 0.3);
  }

  // Barba incipiente / cerrada (ruido determinista)
  if (R.stubble) {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900 * R.stubble; i++) {
      const x = 20 + rnd() * 56, y = 82 + rnd() * 40;
      const dx = (x - 48) / 30, dy = (y - 100) / 26;
      if (dx * dx + dy * dy < 1) blend(buf, x, y, bc[0], bc[1], bc[2], 0.25 + rnd() * 0.2);
    }
  }
  if (R.goatee) {
    ellipse(buf, 48, 108, 8, 7, 225, 222, 214, 0.85);
    ellipse(buf, 48, 92, 10, 2.2, 225, 222, 214, 0.7);
  }

  // Rubor
  if (R.blush) {
    ellipse(buf, 30, 78, 7, 4, 200, 90, 90, R.blush * 3);
    ellipse(buf, 66, 78, 7, 4, 200, 90, 90, R.blush * 3);
  }

  // Cicatriz sobre la ceja izquierda
  if (R.scar) line(buf, 62, 26, 68, 44, 1.1, 190, 120, 110, 0.8);

  // Bindi
  if (R.bindi) ellipse(buf, 48, 30, 1.8, 1.8, 180, 40, 50, 0.95);

  // Pintura de guerra
  if (R.paint === 'stripe') {
    line(buf, 22, 46, 40, 46, 2.2, 160, 30, 30, 0.8);
    line(buf, 56, 46, 74, 46, 2.2, 160, 30, 30, 0.8);
  }
  if (R.paint === 'bolt') {
    line(buf, 26, 44, 32, 50, 1.6, 60, 190, 255, 0.85);
    line(buf, 32, 50, 28, 56, 1.6, 60, 190, 255, 0.85);
    line(buf, 28, 56, 34, 62, 1.6, 60, 190, 255, 0.85);
  }

  // Visor táctico: franja brillante sobre los ojos
  if (R.visor) {
    for (let y = 40; y <= 50; y++) for (let x = 18; x < W - 18; x++) {
      const edge = Math.min(x - 18, W - 18 - x) / 6;
      const glow = 1 - Math.abs(y - 45) / 6;
      blend(buf, x, y, 40, 190, 255, Math.min(1, edge) * (0.55 + glow * 0.4));
    }
  }

  return { data: buf, w: W, h: H };
}

/** DataTexture lista para el calco (transparente, sRGB). */
export function faceTexture(def) {
  const art = faceArt(def);
  const t = new THREE.DataTexture(art.data, art.w, art.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Previsualizacion de las hojas provisionales SIN navegador: stub de
 * contexto 2D con rasterizador software (capsulas, discos, poligonos y
 * transforms) + codificador PNG. Genera /tmp/2d-<id>.png para inspeccion.
 *
 * Uso: node tools/render2d-preview.mjs [id ...]
 */
import zlib from 'node:zlib';
import fs from 'node:fs';

/* ---------- rasterizador ---------- */
class Ctx {
  constructor(cv) {
    this.cv = cv;
    this.fillStyle = '#000'; this.strokeStyle = '#000';
    this.lineWidth = 1; this.lineCap = 'butt'; this.globalAlpha = 1;
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.clipR = null;
    this.rings = [];
    this.warnOOB = 0;
  }
  get buf() { return this.cv._buf; }
  get W() { return this.cv.width; }
  get H() { return this.cv.height; }
  save() { this.stack.push(this.m.slice()); this.stack.push(this.clipR); }
  restore() { if (this.stack.length) this.clipR = this.stack.pop(); if (this.stack.length) this.m = this.stack.pop(); }
  clip() {
    if (!this.rings.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const r of this.rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    this.clipR = [x0, y0, x1, y1];
  }
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  rotate(t) {
    const c = Math.cos(t), s = Math.sin(t), m = this.m;
    const a = m[0] * c + m[2] * s, b = m[1] * c + m[3] * s;
    m[2] = m[0] * -s + m[2] * c; m[3] = m[1] * -s + m[3] * c;
    m[0] = a; m[1] = b;
  }
  X(x, y) { const m = this.m; return m[0] * x + m[2] * y + m[4]; }
  Y(x, y) { const m = this.m; return m[1] * x + m[3] * y + m[5]; }
  beginPath() { this.rings = []; }
  moveTo(x, y) { this.rings.push([[this.X(x, y), this.Y(x, y)]]); }
  lineTo(x, y) { if (this.rings.length) this.rings[this.rings.length - 1].push([this.X(x, y), this.Y(x, y)]); }
  arc(cx, cy, r, a0, a1) {
    const n = 40, ring = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      ring.push([this.X(cx + Math.cos(a) * r, cy + Math.sin(a) * r), this.Y(cx + Math.cos(a) * r, cy + Math.sin(a) * r)]);
    }
    this.rings.push(ring);
  }
  rect(x, y, w, h) {
    this.rings.push([[this.X(x, y), this.Y(x, y)], [this.X(x + w, y), this.Y(x + w, y)], [this.X(x + w, y + h), this.Y(x + w, y + h)], [this.X(x, y + h), this.Y(x, y + h)]]);
  }
  roundRect(x, y, w, h) { this.rect(x, y, w, h); }
  closePath() { }
  parse(col) {
    if (col.startsWith('#')) {
      const n = parseInt(col.slice(1), 16);
      if (col.length === 4) return [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17, 255];
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
    }
    const m = col.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] * 255 : 255]; }
    return [0, 0, 0, 255];
  }
  blend(px, py, col, alpha) {
    const x = px | 0, y = py | 0;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) { this.warnOOB++; return; }
    if (this.clipR && (x < this.clipR[0] || y < this.clipR[1] || x > this.clipR[2] || y > this.clipR[3])) return;
    const i = (y * this.W + x) * 4, b = this.buf;
    const a = (col[3] / 255) * alpha;
    b[i] = col[0] * a + b[i] * (1 - a);
    b[i + 1] = col[1] * a + b[i + 1] * (1 - a);
    b[i + 2] = col[2] * a + b[i + 2] * (1 - a);
    b[i + 3] = Math.min(255, b[i + 3] + a * 255);
  }
  capsule(x1, y1, x2, y2, w, col, alpha) {
    const r = w / 2 + 0.4;
    const bx0 = Math.floor(Math.min(x1, x2) - r), bx1 = Math.ceil(Math.max(x1, x2) + r);
    const by0 = Math.floor(Math.min(y1, y2) - r), by1 = Math.ceil(Math.max(y1, y2) + r);
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1e-9;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2));
      const ddx = x + 0.5 - (x1 + dx * t), ddy = y + 0.5 - (y1 + dy * t);
      if (ddx * ddx + ddy * ddy <= r * r) this.blend(x, y, col, alpha);
    }
  }
  stroke() {
    const col = this.parse(this.strokeStyle), alpha = this.globalAlpha, w = this.lineWidth;
    for (const ring of this.rings)
      for (let i = 0; i + 1 < ring.length; i++)
        this.capsule(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], w, col, alpha);
  }
  fill() {
    const col = this.parse(this.fillStyle), alpha = this.globalAlpha;
    for (const ring of this.rings) {
      if (ring.length < 3) {                                  // disco degenerado (arc r pequeno)
        for (const [x, y] of ring) this.disc(x, y, this.lineWidth || 2, col, alpha);
        continue;
      }
      this.poly(ring, col, alpha);
    }
  }
  disc(cx, cy, r, col, alpha) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.blend(x, y, col, alpha);
      }
  }
  poly(ring, col, alpha) {
    let y0 = 1e9, y1 = -1e9;
    for (const [, y] of ring) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
          xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.floor(xs[k]); x <= Math.ceil(xs[k + 1]); x++) this.blend(x, y, col, alpha);
    }
  }
  fillRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.fill(); }
  clearRect() { }
}

class FakeCanvas {
  constructor() { this.width = 0; this.height = 0; this._buf = null; this._ctx = null; }
  getContext() {
    if (!this._ctx) this._ctx = new Ctx(this);
    return this._ctx;
  }
  set width(v) { this._w = v; this._alloc(); }
  get width() { return this._w; }
  set height(v) { this._h = v; this._alloc(); }
  get height() { return this._h; }
  _alloc() {
    if (this._w && this._h) {
      // como el canvas real: cambiar el tamanio borra el contenido
      this._buf = new Uint8ClampedArray(this._w * this._h * 4);
      if (this._ctx) this._ctx.cv = this;
    }
  }
}

/* ---------- PNG writer (RGBA, filtro 0) ---------- */
function crc32(buf) {
  let c = ~0;
  for (const d of buf) { c ^= d; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const b = Buffer.alloc(8 + data.length + 4);
  b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8);
  b.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return b;
}
function writePNG(path, W, H, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(path, png);
}

/* ---------- main ---------- */
global.document = { createElement: (t) => (t === 'canvas' ? new FakeCanvas() : null) };

const { ROSTER } = await import('../src/data/roster.js');
const { placeholderSheet } = await import('../src/render2d/placeholder.js');

const want = process.argv.slice(2);
const list = want.length ? ROSTER.filter((d) => want.includes(d.id)) : ROSTER;
for (const def of list) {
  const sheet = placeholderSheet(def);
  if (!sheet || !sheet.image) { console.log(def.id, 'SIN hoja (sin canvas)'); continue; }
  const cv = sheet.image;
  writePNG('/tmp/2d-' + def.id + '.png', cv.width, cv.height, cv._buf);
  console.log(def.id, 'hoja', cv.width + 'x' + cv.height, 'anims', Object.keys(sheet.anims).length,
    cv._ctx.warnOOB ? ('FUERA-DE-LIMITES:' + cv._ctx.warnOOB) : 'ok');
}

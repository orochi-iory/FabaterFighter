/**
 * Herramienta de desarrollo: renderiza por software una pose del luchador a PNG.
 *
 * No hay GPU ni navegador en el entorno de trabajo, así que esta es la única
 * forma de VER el resultado: aplica el skinning en CPU, rasteriza con z-buffer
 * y sombreado de Lambert, y escribe un PNG sin dependencias.
 *
 *   node tools/snapshot.mjs [salida.png] [luchador] [pose]
 *   node tools/snapshot.mjs /tmp/kenji.png kenji punch
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;

const THREE = await import('../vendor/three.module.min.js');
const { ROSTER } = await import('../src/data/roster.js');
const { Rig } = await import('../src/render/rig.js');
const { Fighter } = await import('../src/game/fighter.js');

const OUT = process.argv[2] || '/tmp/fighter.png';
const WHO = process.argv[3] || 'kenji';
const POSE = process.argv[4] || 'idle';
const W = 420, H = 560;

/* ------------------------------------------------------------------ */
/* PNG sin dependencias                                                */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePNG(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;                       // filtro "none" por scanline
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // profundidad de bit
  ihdr[9] = 2;   // color verdadero RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(path, png);
}

/* ------------------------------------------------------------------ */
/* Escena y pose                                                       */
/* ------------------------------------------------------------------ */

const def = ROSTER.find((f) => f.id === WHO) || ROSTER[0];
const rig = new Rig(def);
const fighter = new Fighter(def, 0, 1);
const opp = { x: 2.2, y: 0 };
fighter.x = 0;
fighter.facing = 1;

const step = (n = 1) => { for (let i = 0; i < n; i++) rig.update(fighter, 1 / 60, opp); };

// Modo "raw": muestra el clip de mocap pelado, sin capas procedurales,
// para inspeccionar visualmente la captura antes de hornearla.
if (POSE.startsWith('raw:')) {
  const [, clip, frameStr] = POSE.split(':');
  const { sampleClip, rotationsToQuats, NJ } = await import('../src/anim/clip.js');
  // si el clip no está horneado aún, muestrear directo del BVH
  const rot = new Float32Array(NJ * 3), root = new Float32Array(3);
  if (!sampleClip(clip, +frameStr, rot, root)) throw new Error(`clip no horneado: ${clip}`);
  const { JOINTS } = await import('../src/anim/skeleton-def.js');
  const quats = JOINTS.map(() => new THREE.Quaternion());
  rotationsToQuats(rot, quats);
  for (let i = 0; i < JOINTS.length; i++) rig.bones[JOINTS[i].name].quaternion.copy(quats[i]);
  rig.hips.position.set(root[0], rig.bp.Hips[1] + root[1], root[2]);
  rig.root.updateMatrixWorld(true);
} else {

if (POSE === 'punch' || POSE === 'kick') {
  step(90);
  const list = POSE === 'punch'
    ? def.specials.filter((m) => (m.input.button || 'P') === 'P')
    : def.specials.filter((m) => m.input.button === 'K');
  const mv = list[0] || def.specials[0];
  fighter.state = 'attack';
  fighter.move = mv;
  fighter.moveFrame = mv.startup + Math.floor(mv.active / 2);
  fighter.updateAnim();
  step(10);
  console.log(`pose: ${mv.name} (${mv.id}) en frame activo ${fighter.moveFrame}`);
} else if (POSE === 'ko') {
  fighter.state = 'knockdown';
  fighter.stateFrame = 40;
  fighter.updateAnim();
  step(30);
} else if (POSE === 'idle-loop') {
  for (let i = 0; i < 150; i++) { fighter.stateFrame = i; fighter.updateAnim(); step(); }
} else {
  for (let i = 0; i < 150; i++) { fighter.stateFrame = i; fighter.updateAnim(); step(); }
}

} // fin del else de "raw:"

rig.root.updateMatrixWorld(true);
rig.skeleton.update();

/* ------------------------------------------------------------------ */
/* Skinning en CPU                                                     */
/* ------------------------------------------------------------------ */

const geo = rig.mesh.geometry;
const pos = geo.getAttribute('position');
const nrm = geo.getAttribute('normal');
const col = geo.getAttribute('color');
const si = geo.getAttribute('skinIndex');
const sw = geo.getAttribute('skinWeight');
const idx = geo.getIndex();
const bm = rig.skeleton.boneMatrices;

const skinPos = new Float32Array(pos.count * 3);
const skinNrm = new Float32Array(pos.count * 3);
const m4 = new THREE.Matrix4();
const vp = new THREE.Vector3(), vn = new THREE.Vector3();

for (let i = 0; i < pos.count; i++) {
  vp.fromBufferAttribute(pos, i);
  vn.fromBufferAttribute(nrm, i);
  const out = new THREE.Vector3();
  const outN = new THREE.Vector3();
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k);
    if (!w) continue;
    const b = si.getComponent(i, k);
    m4.fromArray(bm, b * 16);
    out.add(vp.clone().applyMatrix4(m4).multiplyScalar(w));
    const nm = new THREE.Matrix3().getNormalMatrix(m4);
    outN.add(vn.clone().applyMatrix3(nm).multiplyScalar(w));
  }
  skinPos[i * 3] = out.x; skinPos[i * 3 + 1] = out.y; skinPos[i * 3 + 2] = out.z;
  outN.normalize();
  skinNrm[i * 3] = outN.x; skinNrm[i * 3 + 1] = outN.y; skinNrm[i * 3 + 2] = outN.z;
}

/* ------------------------------------------------------------------ */
/* Cámara y rasterizado                                                */
/* ------------------------------------------------------------------ */

const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 60);
if (POSE.startsWith('raw:')) camera.position.set(0.35, 1.15, 4.1);
else camera.position.set(4.1, 1.15, 0.35);   // el rig mira a +X
camera.lookAt(0, 1.0, 0);
camera.updateMatrixWorld();
camera.updateProjectionMatrix();
const mvp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

const L = new THREE.Vector3(0.45, 0.75, 0.5).normalize();   // luz principal
const L2 = new THREE.Vector3(-0.6, 0.2, -0.4).normalize();  // relleno

const fb = new Float32Array(W * H).fill(Infinity);
const rgb = Buffer.alloc(W * H * 3);
// Fondo: degradado vertical
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r = Math.round(26 + 14 * t), g = Math.round(24 + 16 * t), b = Math.round(38 + 26 * t);
  for (let x = 0; x < W; x++) {
    rgb[(y * W + x) * 3] = r; rgb[(y * W + x) * 3 + 1] = g; rgb[(y * W + x) * 3 + 2] = b;
  }
}

const clip = new THREE.Vector4();
const scr = [];
for (let i = 0; i < pos.count; i++) {
  clip.set(skinPos[i * 3], skinPos[i * 3 + 1], skinPos[i * 3 + 2], 1).applyMatrix4(mvp);
  const w = clip.w || 1e-6;
  scr.push({ x: (clip.x / w * 0.5 + 0.5) * W, y: (1 - (clip.y / w * 0.5 + 0.5)) * H, z: clip.z / w, w });
}

let drawn = 0;
for (let t = 0; t < idx.count; t += 3) {
  const a = scr[idx.getX(t)], b = scr[idx.getX(t + 1)], c = scr[idx.getX(t + 2)];
  if (a.w <= 0 || b.w <= 0 || c.w <= 0) continue;
  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
  if (maxX < minX || maxY < minY) continue;

  const ia = idx.getX(t), ib = idx.getX(t + 1), ic = idx.getX(t + 2);
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(area) < 1e-9) continue;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) / area;
      let w1 = ((c.x - b.x) * (py - b.y) - (px - b.x) * (c.y - b.y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      // Interpolación perspectiva-correcta
      const iz = w0 / a.w + w1 / b.w + w2 / c.w;
      const z = 1 / iz;
      if (z >= fb[y * W + x]) continue;
      fb[y * W + x] = z;

      const n = new THREE.Vector3(
        (skinNrm[ia * 3] * w0 / a.w + skinNrm[ib * 3] * w1 / b.w + skinNrm[ic * 3] * w2 / c.w) * z,
        (skinNrm[ia * 3 + 1] * w0 / a.w + skinNrm[ib * 3 + 1] * w1 / b.w + skinNrm[ic * 3 + 1] * w2 / c.w) * z,
        (skinNrm[ia * 3 + 2] * w0 / a.w + skinNrm[ib * 3 + 2] * w1 / b.w + skinNrm[ic * 3 + 2] * w2 / c.w) * z
      ).normalize();
      let d = Math.max(0, n.dot(L)) * 0.95 + Math.max(0, n.dot(L2)) * 0.22 + 0.22;
      const o = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        const vc = col.getComponent(ia, k) * w0 + col.getComponent(ib, k) * w1 + col.getComponent(ic, k) * w2;
        // color lineal -> sRGB aproximado
        const lit = Math.min(1, vc * d * 1.9);
        rgb[o + k] = Math.round(255 * (lit <= 0.0031308 ? lit * 12.92 : 1.055 * Math.pow(lit, 1 / 2.4) - 0.055));
      }
      drawn++;
    }
  }
}

writePNG(OUT, W, H, rgb);
console.log(`${def.name} / ${POSE}: ${drawn} píxeles cubiertos de ${W * H} ` +
  `(${(100 * drawn / (W * H)).toFixed(1)}% de la imagen) -> ${OUT}`);

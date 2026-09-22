/**
 * Compila los BVH de CMU (descargados con tools/fetch-mocap.sh) a un único
 * módulo JS compacto que el juego carga en tiempo de ejecución.
 *
 *   node tools/build-anim.mjs            -> escribe src/data/anims.js
 *   node tools/build-anim.mjs --list     -> solo lista las ventanas detectadas
 *
 * Lo que hace por clip:
 *   1. recorta la ventana de acción (detectada por velocidad de manos/pies),
 *   2. re-muestrea de 120 fps a 60 fps,
 *   3. descarta las articulaciones de los dedos (no aportan nada visible),
 *   4. cuantiza las rotaciones a Int16 (0.05º) y la raíz a Int16 (1 mm),
 *   5. guarda todo en base64.
 *
 * Solo se guardan ROTACIONES: las longitudes de hueso las pone el rig del juego,
 * así que los personajes mantienen sus propias proporciones (retargeting).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../vendor/three.module.min.js';
import { parseBVH, jointWorldPos } from './bvh.js';
import { JOINTS } from '../src/anim/skeleton-def.js';

const SRC = process.env.MOCAP_DIR || '/tmp/mocap';
const OUT_FPS = 60;
const ROT_SCALE = 20;        // grados * 20  -> resolución de 0.05º
const POS_SCALE = 1000;      // metros * 1000 -> resolución de 1 mm
/** Altura del sujeto de mocap en unidades BVH (medida sobre la T-pose de CMU). */
const MOCAP_HEIGHT = 21.0;
/** Altura canónica del esqueleto del juego, en metros. */
const RIG_HEIGHT = 1.75;
const UNIT = RIG_HEIGHT / MOCAP_HEIGHT;
/** Escala de CMU (unidades BVH) a unidades de mundo del juego. */
const WORLD_HEIGHT_RATIO = 1.86 / RIG_HEIGHT;
/** Altura de cadera de nuestro esqueleto en mundo, con los pies en el suelo. */
const RIG_HIPS = 0.95 * WORLD_HEIGHT_RATIO;

const DROP = new Set([
  'LeftFingerBase', 'LeftHandIndex1', 'LThumb',
  'RightFingerBase', 'RightHandIndex1', 'RThumb',
  'Neck1'   // se fusiona con Neck en el rig
]);

/**
 * Clips que usa el juego.
 *   win            -> índice de la ventana de acción detectada
 *   lead / follow  -> fotogramas (a 120 fps) antes y después del pico de velocidad;
 *                     el pico es el momento de mayor velocidad de mano/pie, o sea
 *                     el impacto, y se guarda como `impact` para sincronizarlo con
 *                     los frames activos del golpe.
 *   range          -> recorte explícito (locomoción y clips lentos)
 */
const CLIPS = {
  // --- Reposo y locomoción (rangos explícitos, en bucle) ---
  idle:        { file: '77_03',  range: [480, 840],  loop: true },
  walkF:       { file: '144_33', range: [603, 943],  loop: true },
  walkB:       { file: '111_01', range: [200, 560],  loop: true },
  walkSide:    { file: '111_26', range: [700, 1060], loop: true },
  run:         { file: '111_23', range: [123, 393],  loop: true },
  jump:        { file: '141_04', range: [180, 420] },
  // --- Puñetazos ---
  jab:         { file: '144_20', win: 0, lead: 22, follow: 26 },
  cross:       { file: '144_20', win: 3, lead: 26, follow: 32 },
  hookL:       { file: '144_13', win: 3, lead: 24, follow: 30 },
  hookR:       { file: '144_26', win: 0, lead: 24, follow: 30 },
  uppercut:    { file: '02_05',  win: 8, lead: 26, follow: 32 },
  punchCombo:  { file: '141_14', win: 0, lead: 24, follow: 30 },
  punchLunge:  { file: '76_01',  win: 3, lead: 26, follow: 32 },
  // --- Patadas ---
  kickLow:     { file: '74_03',  win: 0, lead: 30, follow: 34 },
  kickMid:     { file: '74_05',  win: 0, lead: 28, follow: 34 },
  kickHigh:    { file: '74_06',  win: 0, lead: 30, follow: 36 },
  kickFront:   { file: '144_05', win: 2, lead: 30, follow: 34 },
  kickFrontL:  { file: '144_09', win: 7, lead: 30, follow: 36 },
  kickSpin:    { file: '74_04',  win: 0, lead: 30, follow: 36 },
  kickJump:    { file: '75_16',  win: 0, lead: 32, follow: 36 },
  kickCombo:   { file: '111_19', win: 0, lead: 28, follow: 34 },
  // --- Defensa y desplazamientos ---
  blockHigh:   { file: '144_07', win: 1, lead: 24, follow: 30 },
  blockLow:    { file: '144_07', win: 2, lead: 24, follow: 30 },
  spin:        { file: '144_28', win: 1, lead: 26, follow: 32 },
  lunge:       { file: '144_17', win: 15, lead: 24, follow: 30 },
  // --- Reacciones ---
  hitReact:    { file: '23_12',  win: 1, lead: 12, follow: 30 },
  knockdown:   { file: '90_16',  win: 0, full: true },
  wakeup:      { file: '140_08', win: 1, full: true },
  // --- Ceremonia ---
  bow:         { file: '111_02', range: [3, 420] },
  salute:      { file: '144_30', win: 10, full: true }
};

/* ------------------------------------------------------------------ */

const cache = new Map();
function load(file) {
  if (!cache.has(file)) {
    const p = path.join(SRC, `${file}.bvh`);
    if (!fs.existsSync(p)) throw new Error(`falta ${p} (ejecuta tools/fetch-mocap.sh)`);
    cache.set(file, parseBVH(fs.readFileSync(p, 'utf8')));
  }
  return cache.get(file);
}

/** Velocidad máxima de manos/pies por fotograma. */
function speedProfile(bvh) {
  const idx = ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot']
    .map((n) => bvh.names.get(n)).filter((v) => v !== undefined);
  const out = new Array(bvh.nFrames).fill(0);
  let prev = null;
  for (let f = 3; f < bvh.nFrames; f++) {
    const pos = idx.map((j) => jointWorldPos(bvh, j, f));
    if (prev) {
      let m = 0;
      for (let k = 0; k < pos.length; k++) {
        m = Math.max(m, Math.hypot(pos[k][0] - prev[k][0], pos[k][1] - prev[k][1], pos[k][2] - prev[k][2]));
      }
      out[f] = m / bvh.frameTime;
    }
    prev = pos;
  }
  return out;
}

/** Divide el clip en ventanas de acción separadas por pausas. */
function detectWindows(bvh, minFrames = 20) {
  const spd = speedProfile(bvh);
  const sorted = [...spd].sort((a, b) => a - b);
  const thr = Math.max(2, sorted[Math.floor(sorted.length * 0.72)] * 1.25);
  const wins = [];
  let start = -1;
  let gap = 0;
  for (let f = 3; f < bvh.nFrames; f++) {
    if (spd[f] > thr) {
      if (start < 0) start = f;
      gap = 0;
    } else if (start >= 0 && ++gap > 14) {
      const end = f - gap;
      if (end - start >= minFrames) {
        let peak = 0, pf = start;
        for (let k = start; k <= end; k++) if (spd[k] > peak) { peak = spd[k]; pf = k; }
        wins.push({ from: start, to: end, peak, peakFrame: pf });
      }
      start = -1;
    }
  }
  if (start >= 0 && bvh.nFrames - start >= minFrames) {
    let peak = 0, pf = start;
    for (let k = start; k < bvh.nFrames; k++) if (spd[k] > peak) { peak = spd[k]; pf = k; }
    wins.push({ from: start, to: bvh.nFrames - 1, peak, peakFrame: pf });
  }
  return wins;
}

/** Re-muestrea [from,to] a OUT_FPS y devuelve Float32Array de canales por fotograma. */
function resample(bvh, from, to) {
  const srcFps = 1 / bvh.frameTime;
  const ratio = srcFps / OUT_FPS;
  const n = Math.max(2, Math.floor((to - from) / ratio));
  const out = new Float32Array(n * bvh.nChannels);
  for (let i = 0; i < n; i++) {
    const t = from + i * ratio;
    const a = Math.min(bvh.nFrames - 1, Math.floor(t));
    const b = Math.min(bvh.nFrames - 1, a + 1);
    const k = t - a;
    for (let c = 0; c < bvh.nChannels; c++) {
      const va = bvh.frames[a * bvh.nChannels + c];
      const vb = bvh.frames[b * bvh.nChannels + c];
      out[i * bvh.nChannels + c] = va + (vb - va) * k;
    }
  }
  return { data: out, frames: n };
}

/* ------------------------------------------------------------------ */

const listOnly = process.argv.includes('--list');
const usedFiles = new Set(Object.values(CLIPS).map((c) => c.file));
const windowsByFile = new Map();

for (const file of [...usedFiles].sort()) {
  const bvh = load(file);
  windowsByFile.set(file, detectWindows(bvh));
}

if (listOnly) {
  for (const [file, wins] of windowsByFile) {
    const bvh = load(file);
    console.log(`\n${file}  (${bvh.nFrames}f, ${(bvh.nFrames * bvh.frameTime).toFixed(1)}s) -> ${wins.length} ventanas`);
    wins.forEach((w, i) => {
      const dur = ((w.to - w.from) * bvh.frameTime).toFixed(2);
      console.log(`  [${i}] f${w.from}-${w.to}  ${dur}s  pico ${w.peak.toFixed(0)} u/s en f${w.peakFrame}`);
    });
  }
  process.exit(0);
}

/* --- horneado --- */
const kept = JOINTS.filter((j) => !DROP.has(j.name));
const keepIdx = kept.map((j) => j.name);
const baked = {};
let totalFrames = 0;

for (const [name, cfg] of Object.entries(CLIPS)) {
  const bvh = load(cfg.file);
  const wins = windowsByFile.get(cfg.file);
  let from, to, peakSrc = -1;
  if (cfg.range) {
    [from, to] = cfg.range;
  } else {
    const w = wins[cfg.win];
    if (!w) throw new Error(`${name}: ${cfg.file} no tiene la ventana ${cfg.win} (hay ${wins.length})`);
    if (cfg.full) {
      from = w.from - 4;
      to = w.to + 4;
    } else {
      const lead = cfg.lead ?? 24, follow = cfg.follow ?? 30;
      peakSrc = w.peakFrame;
      from = w.peakFrame - lead;
      to = w.peakFrame + follow;
    }
  }
  from = Math.max(3, from);
  to = Math.min(bvh.nFrames - 1, Math.max(to, from + 8));

  const { data, frames } = resample(bvh, from, to);
  totalFrames += frames;

  // Índice de canal de cada articulación conservada (sus 3 rotaciones)
  const rotCh = keepIdx.map((jn) => {
    const j = bvh.joints[bvh.names.get(jn)];
    const base = j.start;
    const map = { Zrotation: -1, Yrotation: -1, Xrotation: -1 };
    j.channels.forEach((c, k) => { if (c in map) map[c] = base + k; });
    return map;
  });
  const hips = bvh.joints[0];
  const posCh = [0, 1, 2].map((k) => hips.start + k);

  // La raíz se guarda relativa al primer fotograma de la ventana.
  const p0 = posCh.map((c) => data[c]);

  // --- Normalización de yaw ---------------------------------------------------
  // Cada actor capturado mira a un azimut arbitrario (unos a +Z, otros a -X...).
  // Medimos hacia dónde mira la cadera (Hips es la raíz del BVH: su rotación es
  // la orientación mundial del cuerpo) y giramos todo el clip para que el
  // "frente" quede en +Z, que es como el juego lo espera.
  const RAD = Math.PI / 180;
  const nCh = bvh.nChannels;
  const hm = rotCh[0];   // Hips es la primera articulación conservada
  const _q = new THREE.Quaternion(), _qy = new THREE.Quaternion();
  const _e = new THREE.Euler(), _v = new THREE.Vector3();
  const headAt = (f) => {
    _e.set(data[f * nCh + hm.Xrotation] * RAD, data[f * nCh + hm.Yrotation] * RAD,
      data[f * nCh + hm.Zrotation] * RAD, 'ZYX');
    _q.setFromEuler(_e);
    _v.set(0, 0, 1).applyQuaternion(_q);
    return Math.atan2(_v.x, _v.z);
  };
  let phi;
  if (cfg.loop) {
    let sx = 0, sz = 0;
    for (let f = 0; f < frames; f++) { const h = headAt(f); sx += Math.sin(h); sz += Math.cos(h); }
    phi = Math.atan2(sx, sz);
  } else {
    phi = headAt(0);
  }
  const yaw = -phi;
  if (Math.abs(yaw) > 0.02) {
    _qy.setFromAxisAngle(_v.set(0, 1, 0), yaw);
    for (let f = 0; f < frames; f++) {
      _e.set(data[f * nCh + hm.Xrotation] * RAD, data[f * nCh + hm.Yrotation] * RAD,
        data[f * nCh + hm.Zrotation] * RAD, 'ZYX');
      _q.setFromEuler(_e).premultiply(_qy);
      _e.setFromQuaternion(_q, 'ZYX');
      data[f * nCh + hm.Zrotation] = _e.z / RAD;
      data[f * nCh + hm.Yrotation] = _e.y / RAD;
      data[f * nCh + hm.Xrotation] = _e.x / RAD;
    }
  }
  const yawC = Math.cos(yaw), yawS = Math.sin(yaw);

  // --- Retargeting de la raíz -------------------------------------------------
  // El actor capturado tiene OTRAS proporciones (en CMU las piernas son mucho
  // más largas que las de nuestro esqueleto), así que no podemos copiar la
  // altura de su cadera tal cual: el personaje flotaría.
  //
  // Lo que hacemos:
  //   1. medimos el nivel del suelo como el pie más bajo de todo el clip;
  //   2. tomamos como referencia la altura de cadera en un fotograma apoyado;
  //   3. guardamos solo la VARIACIÓN respecto de esa referencia, reescalada a
  //      la longitud de pierna de nuestro esqueleto.
  // El juego suma esa variación a su propia altura de cadera, así los
  // agachados, saltos y zancadas se conservan pero los pies tocan el suelo.
  const footIdx = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']
    .map((n) => bvh.names.get(n)).filter((v) => v !== undefined);
  const hipsAbove = new Array(frames);
  const ratio = (1 / bvh.frameTime) / OUT_FPS;   // fotogramas origen por fotograma de salida
  for (let f = 0; f < frames; f++) {
    const a = Math.min(bvh.nFrames - 1, Math.round(from + f * ratio));
    // OJO: jointWorldPos no incluye la traslación de la raíz, devuelve las
    // posiciones relativas a la cadera. El pie está en -h, así que la altura
    // de la cadera sobre el suelo es precisamente -Y.
    let low = Infinity;
    for (const j of footIdx) low = Math.min(low, jointWorldPos(bvh, j, a)[1]);
    hipsAbove[f] = -low;
  }
  // Altura de cadera "de pie" del actor: percentil 90 (evita tanto los picos de
  // despegue como los fotogramas agachados). Sirve de referencia y de escala.
  const sorted = [...hipsAbove].sort((a, b) => a - b);
  const rootRef = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const actorHip = rootRef * UNIT;
  const legRatio = actorHip > 1e-4 ? RIG_HIPS / actorHip : 1;
  const stride = 3 + keepIdx.length * 3;
  const buf = new Int16Array(frames * stride);

  for (let f = 0; f < frames; f++) {
    const o = f * stride;
    // El desplazamiento horizontal de la raíz gira con el mismo yaw.
    const rx0 = data[f * nCh + posCh[0]] - p0[0];
    const rz0 = data[f * nCh + posCh[2]] - p0[2];
    for (let k = 0; k < 3; k++) {
      let rel;
      if (k === 1) {
        rel = (hipsAbove[f] - rootRef) * UNIT * legRatio;   // unidades BVH -> mundo, reescalado a nuestra pierna
      } else if (k === 0) {
        rel = (rx0 * yawC + rz0 * yawS) * UNIT;
      } else {
        rel = (-rx0 * yawS + rz0 * yawC) * UNIT;
      }
      buf[o + k] = Math.round(rel * POS_SCALE);
    }
    for (let j = 0; j < keepIdx.length; j++) {
      const m = rotCh[j];
      buf[o + 3 + j * 3 + 0] = Math.round(data[f * bvh.nChannels + m.Zrotation] * ROT_SCALE);
      buf[o + 3 + j * 3 + 1] = Math.round(data[f * bvh.nChannels + m.Yrotation] * ROT_SCALE);
      buf[o + 3 + j * 3 + 2] = Math.round(data[f * bvh.nChannels + m.Xrotation] * ROT_SCALE);
    }
  }

  // Fotograma de impacto dentro del clip ya re-muestreado.
  const impact = peakSrc < 0
    ? -1
    : Math.max(0, Math.min(frames - 1, Math.round((peakSrc - from) * bvh.frameTime * OUT_FPS)));
  baked[name] = {
    f: frames,
    loop: cfg.loop ? 1 : 0,
    impact,
    src: `${cfg.file}:${from}-${to}`,
    d: Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength).toString('base64')
  };
}

const header = `/**
 * Animaciones horneadas desde el CMU Motion Capture Database (mocap.cs.cmu.edu).
 * GENERADO por tools/build-anim.mjs — no editar a mano.
 *
 * Licencia de los datos: uso libre, incluido comercial, con atribución:
 *   "The data used in this project was obtained from mocap.cs.cmu.edu.
 *    The database was created with funding from NSF EIA-0196217."
 *
 * Formato: ${OUT_FPS} fps, ${keepIdx.length} articulaciones.
 * Por fotograma: 3 Int16 de posición de la raíz (mm, relativa al frame 0)
 * y 3 Int16 por articulación (rotación Z,Y,X en 1/${ROT_SCALE} de grado).
 */
export const ANIM_FPS = ${OUT_FPS};
export const ANIM_ROT_SCALE = ${ROT_SCALE};
export const ANIM_POS_SCALE = ${POS_SCALE};
export const ANIM_JOINTS = ${JSON.stringify(keepIdx)};
`;

const body = Object.entries(baked)
  .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
  .join(',\n');

fs.mkdirSync(path.dirname(new URL('../src/data/anims.js', import.meta.url).pathname), { recursive: true });
fs.writeFileSync(
  new URL('../src/data/anims.js', import.meta.url),
  `${header}\nexport const ANIM_CLIPS = {\n${body}\n};\n`
);

const kb = (fs.statSync(new URL('../src/data/anims.js', import.meta.url)).size / 1024).toFixed(0);
console.log(`✓ src/data/anims.js — ${Object.keys(baked).length} clips, ${totalFrames} fotogramas, ${kb} KB`);
for (const [k, v] of Object.entries(baked)) {
  console.log(`   ${k.padEnd(12)} ${String(v.f).padStart(4)}f  impact=${String(v.impact).padStart(3)}  ${v.loop ? 'loop' : '    '}  (${v.src})`);
}

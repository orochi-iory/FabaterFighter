/**
 * Parser de BVH (formato de motion capture de Biovision).
 * Solo se usa en tiempo de compilación (tools/build-anim.mjs).
 *
 * Un BVH tiene dos secciones:
 *   HIERARCHY  -> árbol de articulaciones con OFFSET (posición en reposo) y CHANNELS
 *   MOTION     -> Frames, Frame Time y una línea por fotograma con todos los canales
 *
 * Las rotaciones llegan como ángulos de Euler en el orden declarado en CHANNELS
 * (en CMU siempre "Zrotation Yrotation Xrotation").
 */

/** @typedef {{name:string, parent:number, depth:number, offset:[number,number,number], channels:string[], start:number}} Joint */

export function parseBVH(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && !/^(ROOT|JOINT)\s/.test(lines[i].trim())) i++;  // salta "HIERARCHY"

  /** @type {Joint[]} */
  const joints = [];
  const names = new Map();

  const skipWS = () => { while (i < lines.length && lines[i].trim() === '') i++; };

  function parseJoint(parent, depth) {
    skipWS();
    const line = lines[i].trim();
    const m = /^(ROOT|JOINT)\s+(\S+)/.exec(line);
    if (!m) throw new Error(`se esperaba ROOT/JOINT en la línea ${i + 1}: "${line}"`);
    const name = m[2];
    i++;

    skipWS();
    if (lines[i].trim() !== '{') throw new Error(`se esperaba "{" tras ${name}`);
    i++;

    skipWS();
    const off = /^OFFSET\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/.exec(lines[i].trim());
    if (!off) throw new Error(`OFFSET inválido en ${name}`);
    i++;

    skipWS();
    const ch = /^CHANNELS\s+(\d+)\s+(.*)$/.exec(lines[i].trim());
    if (!ch) throw new Error(`CHANNELS inválido en ${name}`);
    const channels = ch[2].trim().split(/\s+/);
    i++;

    const joint = {
      name,
      parent,
      depth,
      offset: [+off[1], +off[2], +off[3]],
      channels,
      start: 0
    };
    joints.push(joint);
    const myIndex = joints.length - 1;
    names.set(name, myIndex);

    // Hijos y End Sites
    for (;;) {
      skipWS();
      const l = lines[i].trim();
      if (l === '}') { i++; break; }
      if (/^(ROOT|JOINT)\s/.test(l)) { parseJoint(myIndex, depth + 1); continue; }
      if (l === 'End Site') {
        // No aporta canales: solo la longitud del hueso terminal.
        i++;
        skipWS();
        if (lines[i].trim() === '{') i++;
        skipWS();
        const e = /^OFFSET\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/.exec(lines[i].trim());
        if (e) joint.endOffset = [+e[1], +e[2], +e[3]];
        i++;
        skipWS();
        if (lines[i].trim() === '}') i++;
        continue;
      }
      throw new Error(`token inesperado "${l}" dentro de ${name}`);
    }
    return joint;
  }

  parseJoint(-1, 0);

  // Offset de cada canal dentro del fotograma
  let cursor = 0;
  for (const j of joints) {
    j.start = cursor;
    cursor += j.channels.length;
  }
  const nChannels = cursor;

  // --- MOTION ---
  while (i < lines.length && !/^MOTION/.test(lines[i].trim())) i++;
  if (i >= lines.length) throw new Error('falta la sección MOTION');
  i++;
  skipWS();
  const nf = /Frames:\s*(\d+)/.exec(lines[i].trim());
  i++;
  skipWS();
  const ft = /Frame Time:\s*([\d.eE+-]+)/.exec(lines[i].trim());
  i++;

  const nFrames = +nf[1];
  const frameTime = +ft[1];
  const frames = new Float32Array(nFrames * nChannels);

  let f = 0;
  for (; i < lines.length && f < nFrames; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    const parts = l.split(/\s+/);
    if (parts.length < nChannels) continue;
    for (let c = 0; c < nChannels; c++) frames[f * nChannels + c] = parseFloat(parts[c]);
    f++;
  }
  if (f !== nFrames) throw new Error(`esperados ${nFrames} fotogramas, leídos ${f}`);

  return { joints, names, nChannels, nFrames, frameTime, frames };
}

/** Posición mundial de una articulación en el fotograma `f` (unidades del BVH). */
export function jointWorldPos(bvh, index, f) {
  const { joints, frames, nChannels } = bvh;
  const j = joints[index];
  const p = parentTransform(bvh, index, f);
  return applyTransform(p, j.offset, localRotation(bvh, index, f));
}

/** Matriz 4x4 (column-major) acumulada hasta el padre de `index`. */
function parentTransform(bvh, index, f) {
  const { joints } = bvh;
  const chain = [];
  for (let k = index; k >= 0; k = joints[k].parent) chain.unshift(k);
  let m = identity();
  for (const k of chain.slice(0, -1)) {
    m = multiply(m, compose(joints[k].offset, localRotation(bvh, k, f)));
  }
  return m;
}

function localRotation(bvh, index, f) {
  const j = bvh.joints[index];
  const base = f * bvh.nChannels + j.start;
  let zx = 0, ry = 0, rx = 0;
  for (let c = 0; c < j.channels.length; c++) {
    const name = j.channels[c];
    const v = bvh.frames[base + c];
    if (name === 'Zrotation') zx = v;
    else if (name === 'Yrotation') ry = v;
    else if (name === 'Xrotation') rx = v;
  }
  return [zx, ry, rx];
}

/* --- utilidades de matriz mínimas (solo para análisis) --- */
function identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

function compose(off, [rz, ry, rx]) {
  const cz = Math.cos(rz * D), sz = Math.sin(rz * D);
  const cy = Math.cos(ry * D), sy = Math.sin(ry * D);
  const cx = Math.cos(rx * D), sx = Math.sin(rx * D);
  // Z * Y * X (orden intrínseco del BVH de CMU)
  const m = [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx, 0,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx, 0,
    -sy, cy * sx, cy * cx, 0,
    off[0], off[1], off[2], 1
  ];
  return m;
}
const D = Math.PI / 180;

function multiply(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

function applyTransform(m, off, rot) {
  const t = multiply(m, compose(off, rot));
  return [t[12], t[13], t[14]];
}

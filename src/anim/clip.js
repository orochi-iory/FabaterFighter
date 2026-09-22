/**
 * Reproductor de los clips horneados por tools/build-anim.mjs.
 *
 * Cada fotograma guarda 3 Int16 con la posición de la raíz (mm) y 3 Int16 por
 * articulación con su rotación (Z, Y, X) en 1/20 de grado. Aquí se decodifica,
 * se interpola entre fotogramas y se mezcla entre dos clips.
 *
 * Las mezclas se hacen en espacio de cuaterniones: interpolar ángulos de Euler
 * a pelo rompe en los giros (salto de ±180º).
 */
import * as THREE from '../../vendor/three.module.min.js';
import { ANIM_CLIPS, ANIM_FPS, ANIM_ROT_SCALE, ANIM_POS_SCALE, ANIM_JOINTS } from '../data/anims.js';
import { JOINTS } from './skeleton-def.js';

const DEG = Math.PI / 180;
const NJ = ANIM_JOINTS.length;
const STRIDE = 3 + NJ * 3;

/** Índice de cada articulación del clip dentro del esqueleto canónico. */
export const CLIP_TO_RIG = ANIM_JOINTS.map((n) => JOINTS.findIndex((j) => j.name === n));

const decoded = new Map();

function decode(name) {
  let c = decoded.get(name);
  if (c) return c;
  const meta = ANIM_CLIPS[name];
  if (!meta) return null;
  // base64 -> Int16Array (sin depender de Buffer, que no existe en el navegador)
  const bin = atob(meta.d);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  c = {
    frames: meta.f,
    loop: !!meta.loop,
    impact: meta.impact,
    data: new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
  };
  decoded.set(name, c);
  return c;
}

export function hasClip(name) { return !!ANIM_CLIPS[name]; }
export function clipFrames(name) { const c = decode(name); return c ? c.frames : 0; }
export function clipIsLoop(name) { const c = decode(name); return c ? c.loop : false; }
/** Fotograma de impacto (máxima velocidad de mano/pie) o -1 si no aplica. */
export function clipImpact(name) { const c = decode(name); return c ? c.impact : -1; }
export function clipDuration(name) { return clipFrames(name) / ANIM_FPS; }

/** Envuelve o recorta un índice de fotograma según el clip sea un bucle. */
function wrap(c, f) {
  if (c.loop) {
    const n = ((f % c.frames) + c.frames) % c.frames;
    return n;
  }
  return Math.max(0, Math.min(c.frames - 1, f));
}

/**
 * Muestrea un clip.
 * @param rot   Float32Array(NJ*3) de salida, en GRADOS y en orden (Z, Y, X)
 * @param root  Float32Array(3) de salida con el desplazamiento de la raíz en metros
 */
export function sampleClip(name, frame, rot, root) {
  const c = decode(name);
  if (!c) return false;
  const f = wrap(c, frame);
  const i0 = Math.floor(f);
  const i1 = c.loop ? (i0 + 1) % c.frames : Math.min(c.frames - 1, i0 + 1);
  const k = f - i0;
  const d = c.data;
  const a = i0 * STRIDE, b = i1 * STRIDE;

  if (root) {
    for (let i = 0; i < 3; i++) {
      root[i] = ((d[a + i] + (d[b + i] - d[a + i]) * k) / POS_SCALE_M);
    }
  }
  const s = 1 / ANIM_ROT_SCALE;
  for (let j = 0; j < NJ * 3; j++) {
    const va = d[a + 3 + j], vb = d[b + 3 + j];
    rot[j] = (va + (vb - va) * k) * s;
  }
  return true;
}
const POS_SCALE_M = ANIM_POS_SCALE;

/* --- mezcla de dos clips ------------------------------------------------ */

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _eA = new THREE.Euler();
const _eB = new THREE.Euler();

/** Rellena `quats` (array de THREE.Quaternion) a partir de un array de grados. */
export function rotationsToQuats(rot, quats) {
  for (let j = 0; j < NJ; j++) {
    // BVH aplica Z, luego Y, luego X => orden 'ZYX'
    _eA.set(rot[j * 3 + 2] * DEG, rot[j * 3 + 1] * DEG, rot[j * 3 + 0] * DEG, 'ZYX');
    quats[j].setFromEuler(_eA);
  }
}

/**
 * Mezcla dos clips ya muestreados (en grados) y deja el resultado en `quats`.
 * `w` = peso del clip B (0 = solo A, 1 = solo B).
 */
export function blendToQuats(rotA, rotB, w, quats) {
  if (w <= 0.001) return rotationsToQuats(rotA, quats);
  if (w >= 0.999) return rotationsToQuats(rotB, quats);
  for (let j = 0; j < NJ; j++) {
    _eA.set(rotA[j * 3 + 2] * DEG, rotA[j * 3 + 1] * DEG, rotA[j * 3 + 0] * DEG, 'ZYX');
    _eB.set(rotB[j * 3 + 2] * DEG, rotB[j * 3 + 1] * DEG, rotB[j * 3 + 0] * DEG, 'ZYX');
    _qA.setFromEuler(_eA);
    _qB.setFromEuler(_eB);
    quats[j].copy(_qA).slerp(_qB, w);
  }
}

/** Interpolación suave (suavizado de Hermite) para los fundidos entre clips. */
export function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Fundido más enérgico: arranca rápido y asienta despacio (más "marcial"). */
export function easeOutBack(t) {
  const x = Math.max(0, Math.min(1, t));
  const c = 1.2;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

export { ANIM_FPS, ANIM_JOINTS, NJ };

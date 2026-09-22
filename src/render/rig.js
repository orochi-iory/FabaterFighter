/**
 * Rig procedural de luchador.
 *
 * Cada personaje se construye con primitivas (cajas/cápsulas) y se anima con
 * poses definidas como ángulos de articulación. No hay modelos externos: todo
 * se genera en tiempo de ejecución a partir de la definición del luchador
 * (proporciones, colores y accesorios).
 *
 * Este módulo no crea WebGLRenderer, así que se puede ejercitar en Node.
 */

import * as THREE from '../../vendor/three.module.min.js';

/* ------------------------------------------------------------------ */
/* Poses                                                               */
/* ------------------------------------------------------------------ */

/**
 * Claves de una pose:
 *  ry/rx/rz : offset/rotación de la raíz
 *  hy/hx/hz : cadera, sx : pecho, hx/hy : cabeza
 *  lSx.. lEx : hombro/ codo izquierdo   (r = derecho)
 *  lHx.. lKx : cadera-rodilla izquierda (r = derecha)
 */
const IDLE = {
  ry: -0.32, rx: 0, rz: 0,
  hy: 0,
  sx: -0.06, hdx: 0.02, hdy: 0.3,
  lSx: -0.85, lSy: 0.1, lSz: 0.35, lEx: 1.15,
  rSx: -1.15, rSy: -0.1, rSz: -0.3, rEx: 1.35,
  lHx: 0.16, lHy: 0.05, lHz: 0.06, lKx: 0.3,
  rHx: -0.22, rHy: -0.08, rHz: -0.1, rKx: 0.42,
  ry2: 0
};

const P = (o) => o;

const CROUCH = P({
  ...IDLE, hy: -0.42, lHx: 0.95, lKx: 1.5, rHx: -0.9, rKx: 1.55,
  lSx: -0.9, rSx: -1.2, sx: 0.18
});

const FALL = P({ ...IDLE, lHx: 0.4, lKx: 0.8, rHx: -0.2, rKx: 0.5, lSx: -1.9, rSx: -2.0, lEx: 0.4, rEx: 0.4 });

export const POSES = {
  idle: IDLE,
  intro: P({ ...IDLE, lSx: -0.3, lEx: 0.3, rSx: -0.3, rEx: 0.3, hy: -0.06 }),
  win: P({ ...IDLE, lSx: -2.6, lEx: 0.2, rSx: -2.5, rEx: 0.2, hy: -0.08, hdx: -0.1 }),
  walkF: P({ ...IDLE, lHx: 0.5, lKx: 0.2, rHx: -0.45, rKx: 0.6, lSx: -0.7, rSx: -1.2, hy: -0.02 }),
  walkB: P({ ...IDLE, lHx: -0.4, lKx: 0.55, rHx: 0.42, rKx: 0.2, lSx: -0.95, rSx: -1.0, hy: -0.02 }),
  crouch: CROUCH,
  jump: P({ ...IDLE, hy: 0.02, lHx: 0.7, lKx: 1.3, rHx: -0.35, rKx: 0.9, lSx: -1.6, rSx: -1.7, lEx: 0.6, rEx: 0.6 }),
  fall: FALL,
  hop: P({ ...IDLE, hy: 0, lHx: 0.5, lKx: 1.1, rHx: -0.3, rKx: 0.8 }),
  superjump: P({ ...IDLE, hy: 0.06, lHx: 0.9, lKx: 1.4, rHx: -0.5, rKx: 1.0, lSx: -2.2, rSx: -2.3 }),
  land: P({ ...IDLE, hy: -0.25, lHx: 0.6, lKx: 1.0, rHx: -0.5, rKx: 1.0, sx: 0.12 }),
  dashF: P({ ...IDLE, rx: 0.16, hy: -0.12, lSx: -1.9, rSx: -0.5, lEx: 0.5, lHx: 0.6, rHx: -0.5, rKx: 0.9 }),
  dashB: P({ ...IDLE, rx: -0.16, hy: -0.1, lSx: -0.6, rSx: -1.6, rEx: 0.6, lHx: -0.3, rHx: 0.4 }),
  airdash: P({ ...IDLE, rx: 0.2, lHx: 0.5, lKx: 1.0, rHx: -0.3, lSx: -1.8, rSx: -0.7 }),
  roll: P({ rx: 1.6, hy: -0.5, lHx: 1.4, lKx: 2.0, rHx: 1.2, rKx: 2.0, lSx: -2.4, rSx: -2.4, lEx: 1.6, rEx: 1.6 }),
  blockHigh: P({
    ...IDLE, lSx: -1.5, lSz: 0.9, lEx: 1.9, rSx: -1.4, rSz: -0.7, rEx: 1.9,
    sx: 0.1, hy: -0.05, lHx: 0.25, rHx: -0.3, lKx: 0.5, rKx: 0.55
  }),
  blockLow: P({
    ...IDLE, hy: -0.4, lSx: -1.3, lSz: 0.9, lEx: 2.0, rSx: -1.2, rSz: -0.7, rEx: 2.0,
    sx: 0.28, lHx: 0.9, lKx: 1.5, rHx: -0.85, rKx: 1.5
  }),
  hitHigh: P({ ...IDLE, rx: -0.22, hdx: -0.35, lSx: -1.9, rSx: -1.6, lEx: 0.5, rEx: 0.4, sx: -0.1, hy: 0.02 }),
  hitLow: P({ ...IDLE, hy: -0.35, rx: -0.16, hdx: -0.2, lSx: -1.6, rSx: -1.4, sx: 0.2 }),
  launched: P({ rx: -0.7, hy: 0.1, lHx: -0.5, rHx: 0.3, lKx: 1.2, rKx: 0.6, lSx: -2.4, rSx: -2.2, lEx: 0.4, rEx: 0.4, hdx: -0.3 }),
  knockdown: P({ rx: -1.45, hy: -0.72, lHx: -0.2, rHx: 0.1, lKx: 0.5, rKx: 0.3, lSx: -2.2, rSx: -2.0, hdx: -0.4 }),
  getup: P({ rx: -0.7, hy: -0.4, lHx: 0.6, lKx: 1.2, rHx: -0.3, rKx: 0.8, lSx: -1.2, rSx: -1.0 }),
  dizzy: P({ ...IDLE, rx: -0.1, hy: -0.18, hdx: -0.3, lSx: -1.3, rSx: -1.3, lEx: 0.7, rEx: 0.7, lHx: 0.3, rHx: -0.3, lKx: 0.7, rKx: 0.7 }),
  guardcrush: P({ ...IDLE, rx: -0.35, hy: -0.2, hdx: -0.5, lSx: -2.3, rSx: -2.3, lEx: 0.3, rEx: 0.3, lKx: 0.6, rKx: 0.6 }),
  ko: P({ rx: -1.5, hy: -0.75, lHx: -0.3, rHx: 0.2, lKx: 0.4, rKx: 0.2, lSx: -2.4, rSx: -2.1, hdx: -0.5 }),
  maxactivate: P({ ...IDLE, hy: -0.1, lSx: -2.5, rSx: -2.5, lEx: 0.5, rEx: 0.5, lHz: 0.5, rHz: -0.5, hdx: -0.2, lKx: 0.5, rKx: 0.5 }),
  parry: P({ ...IDLE, lSx: -1.9, lSz: 0.5, lEx: 0.6, rSx: -1.2, rEx: 1.4, rx: 0.08, sx: 0.06 }),
  grab: P({ ...IDLE, lSx: -1.7, rSx: -1.7, lEx: 0.3, rEx: 0.3, lSz: 0.3, rSz: -0.3, rx: 0.1 }),
  thrown: P({ rx: -0.6, hy: -0.2, lSx: -2.3, rSx: -2.3, lEx: 0.4, rEx: 0.4, lHx: 0.4, rHx: -0.2, lKx: 1.0, rKx: 0.6, hdx: -0.35 }),

  /* --- Ataques --- */
  jab: {
    startup: P({ ...IDLE, rSx: -1.5, rEx: 1.9, rx: -0.06 }),
    active: P({ ...IDLE, rSx: -1.62, rSz: -0.12, rEx: 0.05, rx: 0.16, lSx: -0.6, hy: 0.02 }),
    recovery: P({ ...IDLE, rSx: -1.35, rEx: 1.2, rx: 0.04 })
  },
  cjab: {
    startup: P({ ...CROUCH, rSx: -1.3, rEx: 1.8 }),
    active: P({ ...CROUCH, rSx: -1.5, rEx: 0.1, rx: 0.1 }),
    recovery: P({ ...CROUCH, rSx: -1.2, rEx: 1.2 })
  },
  strong: {
    startup: P({ ...IDLE, rSx: -0.4, rEx: 2.1, rx: -0.24, hy: -0.04, rHz: -0.4 }),
    active: P({ ...IDLE, rSx: -1.7, rSz: -0.2, rEx: 0.02, rx: 0.3, lSx: -0.5, lEx: 1.6, hy: 0.04 }),
    recovery: P({ ...IDLE, rSx: -1.4, rEx: 1.0, rx: 0.1 })
  },
  kickL: {
    startup: P({ ...IDLE, rHx: -0.4, rKx: 0.9, hy: -0.05 }),
    active: P({ ...IDLE, rHx: -1.55, rKx: 0.1, rx: -0.14, lSx: -1.4, rSx: -0.5, hy: -0.06 }),
    recovery: P({ ...IDLE, rHx: -0.6, rKx: 0.6 })
  },
  kickH: {
    startup: P({ ...IDLE, rHx: -0.5, rKx: 1.1, rx: -0.2, hy: -0.08 }),
    active: P({ ...IDLE, rHx: -1.85, rKx: 0.05, rx: -0.34, lSx: -1.6, rSx: 0.3, hy: -0.1 }),
    recovery: P({ ...IDLE, rHx: -0.7, rKx: 0.7, rx: -0.1 })
  },
  ckick: {
    startup: P({ ...CROUCH, rHx: -0.5, rKx: 1.2 }),
    active: P({ ...CROUCH, rHx: -1.6, rKx: 0.1, rx: -0.1 }),
    recovery: P({ ...CROUCH, rHx: -0.6, rKx: 0.9 })
  },
  sweep: {
    startup: P({ ...CROUCH, rHx: -0.6, rKx: 1.3, rx: -0.1 }),
    active: P({ rx: -0.5, hy: -0.62, ry: -0.5, rHx: -1.75, rKx: 0.05, lHx: 1.1, lKx: 1.7, lSx: -0.6, rSx: -1.9, sx: 0.3 }),
    recovery: P({ ...CROUCH, rHx: -0.5, rKx: 1.1 })
  },
  launcher: {
    startup: P({ ...IDLE, hy: -0.3, rSx: -0.2, rEx: 2.0, lHx: 0.7, lKx: 1.2 }),
    active: P({ ...IDLE, rSx: -2.7, rSz: -0.15, rEx: 0.1, rx: -0.16, hy: 0.06, lSx: -0.5, lEx: 1.4 }),
    recovery: P({ ...IDLE, rSx: -2.1, rEx: 0.5 })
  },
  overhead: {
    startup: P({ ...IDLE, rSx: -2.7, rEx: 1.3, rx: -0.2, hy: 0.02 }),
    active: P({ ...IDLE, rSx: -0.9, rEx: 0.15, rx: 0.28, hy: -0.12, lSx: -0.5 }),
    recovery: P({ ...IDLE, rSx: -1.1, rEx: 0.8 })
  },
  cmdkick: {
    startup: P({ ...IDLE, rHx: -0.6, rKx: 1.2, hy: -0.1 }),
    active: P({ ...IDLE, rHx: -1.2, rKx: 0.5, rx: 0.1, hy: -0.14, rSx: -0.4 }),
    recovery: P({ ...IDLE, rHx: -0.5, rKx: 0.7 })
  },
  airpunch: {
    startup: P({ ...FALL, rSx: -1.2, rEx: 1.8 }),
    active: P({ ...FALL, rSx: -1.7, rEx: 0.1, rx: 0.1 }),
    recovery: P({ ...FALL, rSx: -1.4, rEx: 1.0 })
  },
  airkick: {
    startup: P({ ...FALL, rHx: -0.6, rKx: 1.2 }),
    active: P({ ...FALL, rHx: -1.7, rKx: 0.1, rx: -0.2, lHx: 0.4 }),
    recovery: P({ ...FALL, rHx: -0.7, rKx: 0.7 })
  },
  cast: {
    startup: P({ ...IDLE, lSx: -0.5, lEx: 1.8, rSx: -0.4, rEx: 1.9, rx: -0.14, hy: -0.06 }),
    active: P({ ...IDLE, lSx: -1.65, rSx: -1.65, lSz: 0.25, rSz: -0.25, lEx: 0.1, rEx: 0.1, rx: 0.2, hy: 0.04 }),
    recovery: P({ ...IDLE, lSx: -1.2, rSx: -1.2, lEx: 0.6, rEx: 0.6 })
  },
  uppercut: {
    startup: P({ ...IDLE, hy: -0.28, rSx: -0.2, rEx: 2.0, lHx: 0.6, lKx: 1.1, rx: -0.2 }),
    active: P({ ...IDLE, rSx: -2.9, rSz: -0.2, rEx: 0.15, rx: -0.1, hy: 0.1, lSx: -0.7, lEx: 1.6, lHx: 0.3, rHx: -0.4, rKx: 1.3 }),
    recovery: P({ ...IDLE, rSx: -2.3, rEx: 0.5 })
  },
  spin: {
    startup: P({ ...IDLE, ry: -1.1, rHx: -0.8, rKx: 0.7 }),
    active: P({ ry: -2.6, rx: 0.1, rHx: -1.7, rKx: 0.1, lSx: -1.6, rSx: -1.6, lEx: 0.5, rEx: 0.5, hy: -0.06 }),
    recovery: P({ ...IDLE, ry: -1.2, rHx: -0.6, rKx: 0.6 })
  },
  spinkick: {
    startup: P({ ...IDLE, ry: -1.0, lHx: 0.6, lKx: 1.1 }),
    active: P({ ry: -2.8, rx: 0.6, lHx: -1.8, lKx: 0.1, rHx: 0.3, rKx: 0.4, lSx: -2.0, rSx: -2.0, lEx: 0.4, rEx: 0.4 }),
    recovery: P({ ...IDLE, ry: -1.1 })
  },
  barrage: {
    startup: P({ ...IDLE, rHx: -0.5, rKx: 0.9 }),
    active: P({ ...IDLE, ry: -0.9, rHx: -1.6, rKx: 0.2, lHx: 0.3, lKx: 0.6, rx: -0.1, lSx: -1.5, rSx: -1.0 }),
    recovery: P({ ...IDLE, rHx: -0.5, rKx: 0.7 })
  },
  rush: {
    startup: P({ ...IDLE, rSx: -0.3, rEx: 2.1, rx: -0.2 }),
    active: P({ ...IDLE, rSx: -1.75, rEx: 0.05, rx: 0.28, lSx: -0.4, lEx: 1.7, hy: 0.03, lHx: 0.4, rHx: -0.4 }),
    recovery: P({ ...IDLE, rSx: -1.3, rEx: 1.0 })
  },
  slash: {
    startup: P({ ...IDLE, rSx: -2.6, rSz: -0.6, rEx: 0.6, rx: -0.2 }),
    active: P({ ...IDLE, rSx: -1.1, rSz: 0.4, rEx: 0.1, rx: 0.3, hy: -0.05 }),
    recovery: P({ ...IDLE, rSx: -1.2, rEx: 0.9 })
  },
  throwobj: {
    startup: P({ ...IDLE, rSx: -2.4, rEx: 1.4, rx: -0.14 }),
    active: P({ ...IDLE, rSx: -1.5, rEx: 0.05, rx: 0.22, lSx: -0.6 }),
    recovery: P({ ...IDLE, rSx: -1.3, rEx: 0.9 })
  },
  teleport: {
    startup: P({ ...IDLE, hy: -0.1, lSx: -1.9, rSx: -1.9, lEx: 0.7, rEx: 0.7, rx: 0.1 }),
    active: P({ ...IDLE, hy: -0.05, rx: 0.2, lSx: -2.2, rSx: -2.2 }),
    recovery: P({ ...IDLE, rx: 0.05 })
  },
  counter: {
    startup: P({ ...IDLE, lSx: -1.3, lSz: 0.7, lEx: 1.3, rSx: -1.1, rEx: 1.5, hy: -0.08, rx: -0.06 }),
    active: P({ ...IDLE, lSx: -1.45, lSz: 0.8, lEx: 1.1, rSx: -1.2, rEx: 1.3, hy: -0.1 }),
    recovery: P({ ...IDLE, lSx: -1.0, rSx: -1.0 })
  },
  divekick: {
    startup: P({ ...FALL, rHx: -1.2, rKx: 0.5, rx: 0.3 }),
    active: P({ rx: 0.55, rHx: -1.95, rKx: 0.05, lHx: 0.9, lKx: 1.5, lSx: -2.3, rSx: -1.0, hy: 0.05 }),
    recovery: P({ ...FALL, rHx: -0.8, rKx: 0.6 })
  },
  press: {
    startup: P({ ...IDLE, lSx: -2.3, rSx: -2.3, lEx: 0.6, rEx: 0.6, lHx: 0.5, lKx: 1.0, rHx: -0.3, rKx: 0.8 }),
    active: P({ rx: 1.2, hy: -0.15, lHx: 0.5, lKx: 1.4, rHx: 0.4, rKx: 1.4, lSx: -2.6, rSx: -2.6, lEx: 0.3, rEx: 0.3 }),
    recovery: P({ ...IDLE, hy: -0.3, lHx: 0.8, lKx: 1.3, rHx: -0.6, rKx: 1.2 })
  },
  lariat: {
    startup: P({ ...IDLE, lSx: -1.7, rSx: -1.7, lSz: 1.3, rSz: -1.3, lEx: 0.15, rEx: 0.15 }),
    active: P({ ry: -2.4, lSx: -1.62, rSx: -1.62, lSz: 1.45, rSz: -1.45, lEx: 0.05, rEx: 0.05, hy: -0.04 }),
    recovery: P({ ...IDLE, lSz: 0.8, rSz: -0.8, lEx: 0.5, rEx: 0.5 })
  },
  stomp: {
    startup: P({ ...IDLE, lHx: 1.1, lKx: 1.6, hy: 0.06, lSx: -2.0, rSx: -2.0, lEx: 0.6, rEx: 0.6 }),
    active: P({ ...IDLE, lHx: -0.15, lKx: 0.1, hy: -0.3, rx: 0.24, lSx: -1.2, rSx: -1.2, rHx: -0.3, rKx: 0.6 }),
    recovery: P({ ...IDLE, hy: -0.16, lHx: 0.2, lKx: 0.4 })
  },
  breath: {
    startup: P({ ...IDLE, hdx: 0.3, sx: -0.16, lSx: -0.7, rSx: -0.7, hy: -0.05 }),
    active: P({ ...IDLE, hdx: -0.3, sx: 0.24, rx: 0.14, lSx: -1.1, rSx: -1.1, lEx: 0.9, rEx: 0.9 }),
    recovery: P({ ...IDLE, hdx: 0.05 })
  },
  stretch: {
    startup: P({ ...IDLE, rSx: -0.5, rEx: 2.2, rx: -0.2 }),
    active: P({ ...IDLE, rSx: -1.62, rSz: -0.05, rEx: 0.0, rx: 0.24, lSx: -0.5, lEx: 1.7, hy: 0.04 }),
    recovery: P({ ...IDLE, rSx: -1.3, rEx: 1.1 })
  },
  beam: {
    startup: P({ ...IDLE, lSx: -0.6, rSx: -0.6, lEx: 1.9, rEx: 1.9, rx: -0.16, hy: -0.08 }),
    active: P({ ...IDLE, lSx: -1.7, rSx: -1.7, lSz: 0.3, rSz: -0.3, lEx: 0.05, rEx: 0.05, rx: 0.22, hy: 0.05 }),
    recovery: P({ ...IDLE, lSx: -1.2, rSx: -1.2, lEx: 0.7, rEx: 0.7 })
  },
  aura: {
    startup: P({ ...IDLE, lSx: -2.2, rSx: -2.2, lSz: 0.5, rSz: -0.5, lEx: 0.6, rEx: 0.6, hy: -0.1 }),
    active: P({ ...IDLE, lSx: -2.6, rSx: -2.6, lSz: 0.7, rSz: -0.7, lEx: 0.3, rEx: 0.3, hy: -0.14, hdx: -0.2 }),
    recovery: P({ ...IDLE, lSx: -1.4, rSx: -1.4 })
  },
  float: {
    startup: P({ ...IDLE, hy: 0.1, lSx: -2.1, rSx: -2.1, lEx: 0.7, rEx: 0.7, lHx: 0.4, lKx: 1.0, rHx: -0.3, rKx: 0.7 }),
    active: P({ ...IDLE, hy: 0.18, lSx: -2.4, rSx: -2.4, lEx: 0.4, rEx: 0.4, lHx: 0.5, lKx: 1.1, rHx: -0.4, rKx: 0.8 }),
    recovery: P({ ...IDLE, hy: 0.06 })
  },
  storm: {
    startup: P({ ...IDLE, lSx: -2.3, rSx: -2.3, lSz: 0.6, rSz: -0.6, hy: -0.08 }),
    active: P({ ry: -2.2, rx: 0.12, lHx: -1.6, lKx: 0.15, rHx: 0.3, rKx: 0.5, lSx: -1.9, rSx: -1.9, lEx: 0.4, rEx: 0.4 }),
    recovery: P({ ...IDLE, ry: -1.0 })
  },
  grabair: {
    startup: P({ ...FALL, lSx: -2.4, rSx: -2.4, lEx: 0.3, rEx: 0.3 }),
    active: P({ ...FALL, lSx: -1.9, rSx: -1.9, lEx: 0.2, rEx: 0.2 }),
    recovery: P({ ...FALL })
  }
};

/* ------------------------------------------------------------------ */
/* Construcción del muñeco                                             */
/* ------------------------------------------------------------------ */

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.rough ?? 0.62,
    metalness: opts.metal ?? 0.12,
    flatShading: !!opts.flat,
    emissive: new THREE.Color(opts.emissive || '#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 1
  });
}

/** Segmento (extremidad) que cuelga hacia -Y y rota por su extremo superior. */
function segment(len, w, d, material, taper = 1) {
  const g = new THREE.Group();
  const geo = taper === 1
    ? new THREE.BoxGeometry(w, len, d)
    : new THREE.CylinderGeometry(w * 0.5 * taper, w * 0.5, len, 8);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = -len / 2;
  mesh.castShadow = true;
  g.add(mesh);
  g.userData.mesh = mesh;
  return g;
}

function ball(r, material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), material);
  m.castShadow = true;
  return m;
}

export class Rig {
  constructor(def) {
    this.def = def;
    this.c = def.colors;
    this.b = def.body;
    this.root = new THREE.Group();
    this.body = new THREE.Group();     // gira según el facing
    this.root.add(this.body);
    this.pose = { ...POSES.idle };
    this.target = { ...POSES.idle };
    this.build();
    this.setFacing(1);
    this.breath = Math.random() * 6.28;
  }

  build() {
    const c = this.c, b = this.b;
    const H = 1.86 * (b.height || 1);
    const bulk = b.bulk || 1;
    const armLen = (b.armLen || 1);
    const legLen = (b.legLen || 1);

    const skin = mat(c.skin, { rough: 0.7 });
    const gi = mat(c.gi, { rough: 0.78 });
    const trim = mat(c.trim, { rough: 0.5, metal: 0.2 });
    const glove = mat(c.glove || c.trim, { rough: 0.55 });
    const boot = mat(c.boot || c.trim, { rough: 0.6 });
    const hair = mat(c.hair, { rough: 0.85 });

    const legH = H * 0.46 * legLen;
    const torsoH = H * 0.34;
    const headR = 0.145 * (b.head || 1);

    // --- Cadera / torso ---
    this.hips = new THREE.Group();
    this.hips.position.y = legH;
    this.body.add(this.hips);

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34 * bulk, 0.2, 0.24 * bulk), gi);
    pelvis.position.y = 0.02;
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    this.spine = new THREE.Group();
    this.spine.position.y = 0.1;
    this.hips.add(this.spine);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46 * bulk, torsoH, 0.28 * bulk), gi);
    chest.position.y = torsoH / 2;
    chest.castShadow = true;
    this.spine.add(chest);
    this.chestMesh = chest;

    // Cinturón / detalle
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4 * bulk, 0.07, 0.3 * bulk), mat(c.belt || c.trim));
    belt.position.y = 0.03;
    this.hips.add(belt);

    // Detalle del pecho (banda / emblema)
    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.3 * bulk, 0.09, 0.02), trim);
    emblem.position.set(0, torsoH * 0.72, 0.15 * bulk);
    this.spine.add(emblem);

    // --- Cabeza ---
    this.neck = new THREE.Group();
    this.neck.position.y = torsoH;
    this.spine.add(this.neck);
    this.head = new THREE.Group();
    this.head.position.y = headR * 0.9;
    this.neck.add(this.head);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(headR * 2, headR * 2.15, headR * 1.95), skin);
    skull.castShadow = true;
    this.head.add(skull);
    // Cara (mira a +Z en espacio local)
    const face = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.3, headR * 0.5, 0.02), mat('#20242b', { rough: 0.4 }));
    face.position.set(0, headR * 0.25, headR * 1.0);
    this.head.add(face);
    this.buildHair(hair, headR, bulk);

    // --- Brazos ---
    const armUp = H * 0.19 * armLen;
    const armLo = H * 0.17 * armLen;
    const makeArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0.25 * bulk * side, torsoH * 0.92, 0);
      this.spine.add(sh);
      const pad = ball(0.085 * bulk, gi);
      sh.add(pad);
      const up = segment(armUp, 0.1 * bulk, 0.1 * bulk, skin);
      sh.add(up);
      const el = new THREE.Group();
      el.position.y = -armUp;
      up.add(el);
      const lo = segment(armLo, 0.09 * bulk, 0.09 * bulk, skin);
      el.add(lo);
      const hand = ball(0.075 * bulk, glove);
      hand.position.y = -armLo;
      el.add(hand);
      // Guantaje / venda
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.115 * bulk, 0.06, 0.115 * bulk), glove);
      cuff.position.y = -armLo * 0.55;
      el.add(cuff);
      return { sh, el };
    };
    const L = makeArm(1), R = makeArm(-1);
    this.armL = L; this.armR = R;

    // --- Piernas ---
    const thigh = legH * 0.55, shin = legH * 0.5;
    const makeLeg = (side) => {
      const hp = new THREE.Group();
      hp.position.set(0.11 * bulk * side, -0.04, 0);
      this.hips.add(hp);
      const up = segment(thigh, 0.135 * bulk, 0.135 * bulk, gi);
      hp.add(up);
      const kn = new THREE.Group();
      kn.position.y = -thigh;
      up.add(kn);
      const lo = segment(shin, 0.115 * bulk, 0.115 * bulk, skin);
      kn.add(lo);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13 * bulk, 0.07, 0.26), boot);
      foot.position.set(0, -shin, 0.05);
      foot.castShadow = true;
      kn.add(foot);
      return { hp, kn };
    };
    const LL = makeLeg(1), RL = makeLeg(-1);
    this.legL = LL; this.legR = RL;

    // --- Sombra ---
    const shGeo = new THREE.CircleGeometry(0.42 * bulk, 20);
    this.shadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false
    }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);

    // --- Aura (modo MAX / supers) ---
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.95 * bulk, 16, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.def.fx || '#ffffff'), transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    this.aura.position.y = 0.95 * (b.height || 1);
    this.aura.scale.set(1, 1.35, 1);
    this.root.add(this.aura);

    this.height = H;
  }

  buildHair(hairMat, r, bulk) {
    const b = this.b, c = this.c;
    const g = new THREE.Group();
    this.head.add(g);
    const style = b.hair || 'short';
    const addBox = (w, h, d, x, y, z, m = hairMat, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, 0, rz);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    if (style === 'spiky') {
      addBox(r * 2.05, r * 0.5, r * 2.0, 0, r * 1.05, 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        addBox(r * 0.28, r * 0.95, r * 0.28, Math.cos(a) * r * 0.75, r * 1.45, Math.sin(a) * r * 0.75, hairMat, Math.sin(a) * 0.3, Math.cos(a) * 0.3);
      }
    } else if (style === 'ponytail') {
      addBox(r * 2.05, r * 0.55, r * 2.0, 0, r * 1.02, 0);
      addBox(r * 0.5, r * 2.4, r * 0.5, 0, r * 0.2, -r * 1.15, hairMat, 0.22);
    } else if (style === 'long') {
      addBox(r * 2.15, r * 0.6, r * 2.1, 0, r * 1.0, 0);
      addBox(r * 2.0, r * 2.8, r * 0.5, 0, -r * 0.3, -r * 1.0, hairMat, 0.12);
      addBox(r * 0.45, r * 1.6, r * 0.45, r * 1.0, r * 0.1, r * 0.2);
      addBox(r * 0.45, r * 1.6, r * 0.45, -r * 1.0, r * 0.1, r * 0.2);
    } else if (style === 'mohawk') {
      for (let i = 0; i < 5; i++) addBox(r * 0.35, r * (0.6 + (i % 2) * 0.5), r * 0.4, 0, r * 1.3, -r * 0.8 + i * r * 0.4, mat(c.hair));
    } else if (style === 'flame') {
      addBox(r * 2.05, r * 0.5, r * 2.0, 0, r * 1.05, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        addBox(r * 0.32, r * 1.1, r * 0.32, Math.cos(a) * r * 0.7, r * 1.5, Math.sin(a) * r * 0.7,
          mat(c.hair, { emissive: c.accent, emissiveIntensity: 0.7 }), Math.sin(a) * 0.25, Math.cos(a) * 0.25);
      }
    } else if (style === 'mask') {
      const mask = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 1.6, r * 2.05), mat(c.gi, { rough: 0.7 }));
      mask.position.y = r * 0.35;
      g.add(mask);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, r * 0.28, 0.02), mat(c.accent, { emissive: c.accent, emissiveIntensity: 1.2 }));
      eye.position.set(0, r * 0.45, r * 1.04);
      g.add(eye);
    } else if (style === 'flat') {
      addBox(r * 2.05, r * 0.42, r * 2.0, 0, r * 1.02, 0);
    } else if (style === 'bald') {
      // sin pelo
    } else {
      addBox(r * 2.05, r * 0.55, r * 2.0, 0, r * 1.02, 0);
    }
    if (b.band === 'headband') {
      const band = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, r * 0.32, r * 2.15), mat(c.trim));
      band.position.y = r * 0.85;
      g.add(band);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(r * 0.28, r * 1.3, r * 0.1), mat(c.trim));
      tail.position.set(r * 0.5, r * 0.4, -r * 1.15);
      tail.rotation.x = 0.3;
      g.add(tail);
    }
    if (b.beard) {
      const beard = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 0.8, r * 1.2), mat(c.hair));
      beard.position.set(0, -r * 0.55, r * 0.35);
      g.add(beard);
    }
    if (b.scarf) {
      const scarf = new THREE.Mesh(new THREE.BoxGeometry(r * 2.3, r * 0.45, r * 2.2), mat(c.trim));
      scarf.position.y = -r * 1.3;
      g.add(scarf);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 1.8, r * 0.12), mat(c.trim));
      tail.position.set(r * 0.4, -r * 2.1, -r * 1.0);
      tail.rotation.x = 0.35;
      g.add(tail);
      this.scarfTail = tail;
    }
    if (b.cap) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.15, r * 0.5, r * 2.1), mat(c.trim));
      cap.position.y = r * 1.05;
      g.add(cap);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.12, r * 1.1), mat(c.trim));
      visor.position.set(0, r * 0.95, r * 1.2);
      g.add(visor);
    }
    if (b.turban) {
      const t = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 12, 8), mat(c.trim));
      t.position.y = r * 1.15;
      t.scale.y = 0.75;
      g.add(t);
      const gem = new THREE.Mesh(new THREE.BoxGeometry(r * 0.4, r * 0.4, r * 0.2), mat(c.accent, { emissive: c.accent, emissiveIntensity: 0.8 }));
      gem.position.set(0, r * 1.35, r * 1.05);
      g.add(gem);
    }
    if (b.visor) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, r * 0.42, r * 0.2), mat(c.accent, { emissive: c.accent, emissiveIntensity: 1.4, rough: 0.2 }));
      v.position.set(0, r * 0.35, r * 1.0);
      g.add(v);
    }
    this.hairGroup = g;
  }

  setFacing(f) {
    this.body.rotation.y = f > 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  /** Elige la pose objetivo según el estado del luchador. */
  poseFor(anim, fighter) {
    if (anim.state === 'attack' && anim.move) {
      const p = POSES[anim.pose] || POSES.jab;
      if (p.startup) return p[anim.phase] || p.active;
      return p;
    }
    return POSES[anim.pose] || POSES.idle;
  }

  update(fighter, dt) {
    const anim = fighter.anim;
    const target = this.poseFor(anim, fighter);

    // Velocidad de interpolación: instantáneo en golpes, suave en idle.
    const snappy = anim.state === 'attack' || anim.state === 'hitstun' || anim.state === 'airhit';
    const k = snappy ? 0.55 : 0.22;

    for (const key in target) {
      const cur = this.pose[key] ?? 0;
      this.pose[key] = cur + (target[key] - cur) * k;
    }
    for (const key in this.pose) {
      if (!(key in target)) this.pose[key] += (0 - this.pose[key]) * k;
    }

    // Respiración / bamboleo idle
    this.breath += dt * 2.2;
    const breathing = (anim.pose === 'idle') ? Math.sin(this.breath) * 0.03 : 0;

    const p = this.pose;
    this.root.position.set(fighter.x, fighter.y, 0);
    this.setFacing(fighter.facing);
    this.root.rotation.set(p.rx || 0, 0, p.rz || 0);
    this.hips.position.y = 1.86 * (this.b.height || 1) * 0.46 * (this.b.legLen || 1) + (p.hy || 0) + breathing;
    this.hips.rotation.set(0, 0, 0);
    this.spine.rotation.set(p.sx || 0, 0, 0);
    this.head.rotation.set(-(p.hdx || 0) * 0.6, p.hdy || 0, 0);
    this.armL.sh.rotation.set(p.lSx || 0, p.lSy || 0, p.lSz || 0);
    this.armL.el.rotation.set(p.lEx || 0, 0, 0);
    this.armR.sh.rotation.set(p.rSx || 0, p.rSy || 0, p.rSz || 0);
    this.armR.el.rotation.set(p.rEx || 0, 0, 0);
    this.legL.hp.rotation.set(p.lHx || 0, p.lHy || 0, p.lHz || 0);
    this.legL.kn.rotation.set(p.lKx || 0, 0, 0);
    this.legR.hp.rotation.set(p.rHx || 0, p.rHy || 0, p.rHz || 0);
    this.legR.kn.rotation.set(p.rKx || 0, 0, 0);

    // Giro completo del cuerpo para movimientos "ry"
    this.body.rotation.y += (p.ry || 0);

    // Sombra
    const h = Math.max(0, fighter.y);
    this.shadow.position.set(fighter.x, 0.012, 0);
    this.shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.12));
    this.shadow.material.opacity = Math.max(0.1, 0.35 - h * 0.04);

    // Aura
    const auraOn = fighter.maxMode > 0 ? 0.22 + Math.sin(this.breath * 4) * 0.06 : 0;
    this.aura.material.opacity += (auraOn - this.aura.material.opacity) * 0.2;
    this.aura.position.set(fighter.x, 0.95 * (this.b.height || 1) + fighter.y, 0);

    // Parpadeo al recibir daño
    if (fighter.hitFlash > 0 && fighter.hitFlash % 2 === 0) {
      this.body.visible = false;
    } else {
      this.body.visible = true;
    }
  }
}

export { mat, segment, ball };

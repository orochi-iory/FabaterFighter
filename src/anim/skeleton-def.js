/**
 * Esqueleto humanoide canónico del juego.
 *
 * Convención (idéntica al BVH de CMU, para que las rotaciones se puedan
 * reutilizar directamente):
 *   +Y arriba · +Z hacia donde mira el personaje · +X a la izquierda del personaje
 *   pose de reposo = T-pose (brazos extendidos a lo largo de ±X)
 *
 * Las medidas están en metros para un humano de 1.75 m; el rig las escala por
 * luchador (stats.height, bulk, reach...). Las longitudes de hueso son NUESTRAS:
 * del mocap solo se aprovechan las rotaciones (retargeting), así cada personaje
 * conserva su propia constitución.
 */

/** Articulación: nombre, índice del padre y desplazamiento en reposo (m). */
function J(name, parent, offset, extra = {}) {
  return { name, parent, offset, ...extra };
}

export const JOINTS = [
  /*  0 */ J('Hips', -1, [0, 0.95, 0], { root: true }),
  /*  1 */ J('LHipJoint', 0, [0, 0, 0]),
  /*  2 */ J('LeftUpLeg', 1, [0.09, -0.04, 0]),
  /*  3 */ J('LeftLeg', 2, [0, -0.44, 0]),
  /*  4 */ J('LeftFoot', 3, [0, -0.40, 0]),
  /*  5 */ J('LeftToeBase', 4, [0, -0.03, 0.13], { end: [0, 0, 0.07] }),
  /*  6 */ J('RHipJoint', 0, [0, 0, 0]),
  /*  7 */ J('RightUpLeg', 6, [-0.09, -0.04, 0]),
  /*  8 */ J('RightLeg', 7, [0, -0.44, 0]),
  /*  9 */ J('RightFoot', 8, [0, -0.40, 0]),
  /* 10 */ J('RightToeBase', 9, [0, -0.03, 0.13], { end: [0, 0, 0.07] }),
  /* 11 */ J('LowerBack', 0, [0, 0.05, 0]),
  /* 12 */ J('Spine', 11, [0, 0.11, 0]),
  /* 13 */ J('Spine1', 12, [0, 0.13, 0]),
  /* 14 */ J('Neck', 13, [0, 0.19, 0]),
  /* 15 */ J('Head', 14, [0, 0.10, 0], { end: [0, 0.21, 0] }),
  /* 16 */ J('LeftShoulder', 13, [0.03, 0.15, 0]),
  /* 17 */ J('LeftArm', 16, [0.14, 0, 0]),
  /* 18 */ J('LeftForeArm', 17, [0.29, 0, 0]),
  /* 19 */ J('LeftHand', 18, [0.26, 0, 0], { end: [0.10, 0, 0] }),
  /* 20 */ J('RightShoulder', 13, [-0.03, 0.15, 0]),
  /* 21 */ J('RightArm', 20, [-0.14, 0, 0]),
  /* 22 */ J('RightForeArm', 21, [-0.29, 0, 0]),
  /* 23 */ J('RightHand', 22, [-0.26, 0, 0], { end: [-0.10, 0, 0] })
];

export const JOINT_INDEX = Object.fromEntries(JOINTS.map((j, i) => [j.name, i]));

/** Índice del padre de cada articulación (-1 = raíz). */
export const JOINT_PARENTS = JOINTS.map((j) => j.parent);

/** Longitud de cada hueso en metros (0 en la raíz y en las articulaciones auxiliares). */
export function boneLength(i) {
  const j = JOINTS[i];
  if (j.parent < 0) return 0;
  return Math.hypot(j.offset[0], j.offset[1], j.offset[2]);
}

/**
 * Ejes de cada cadena: en CMU las piernas cuelgan a lo largo de -Y y los brazos
 * se extienden a lo largo de ±X. El constructor de malla lo necesita para orientar
 * cada segmento.
 */
export const LIMB_AXIS = {
  LeftUpLeg: 'y', LeftLeg: 'y', LeftFoot: 'z',
  RightUpLeg: 'y', RightLeg: 'y', RightFoot: 'z',
  LeftArm: 'x', LeftForeArm: 'x', RightArm: '-x', RightForeArm: '-x'
};

/** Altura total del esqueleto canónico (suela -> coronilla), en metros. */
export const RIG_HEIGHT = 0.95 + 0.05 + 0.11 + 0.13 + 0.19 + 0.10 + 0.21;

/** Puntos de referencia que usa el rig para encuadrar y para el IK. */
export const KEY_JOINTS = {
  hips: 'Hips',
  chest: 'Spine1',
  head: 'Head',
  handL: 'LeftHand',
  handR: 'RightHand',
  elbowL: 'LeftForeArm',
  elbowR: 'RightForeArm',
  shoulderL: 'LeftArm',
  shoulderR: 'RightArm',
  footL: 'LeftFoot',
  footR: 'RightFoot',
  kneeL: 'LeftLeg',
  kneeR: 'RightLeg'
};

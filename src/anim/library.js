/**
 * Decide qué clip de mocap reproduce cada luchador y en qué fotograma.
 *
 * La clave para que los golpes se sientan conectados es la sincronización: el
 * fotograma de impacto del clip (máxima velocidad de mano/pie en la captura) se
 * hace coincidir EXACTAMENTE con el primer fotograma activo del golpe. Para eso
 * el clip se reproduce a dos velocidades:
 *
 *    [0 .. impacto]   ->  [0 .. startup]              (armado del golpe)
 *    [impacto .. fin] ->  [startup .. fin del golpe]   (extensión y recogida)
 *
 * Así un golpe de 6f de arranque usa un armado rápido y uno de 14f lo alarga,
 * pero el momento del contacto siempre cae donde dice la frame data.
 */
import { clipFrames, clipImpact, hasClip } from './clip.js';

/** Pose de la definición del golpe -> clip de mocap. */
export const POSE_CLIP = {
  uppercut: 'uppercut',
  cast: 'jab',
  rush: 'punchCombo',
  storm: 'kickCombo',
  teleport: 'spin',
  strong: 'cross',
  stretch: 'punchLunge',
  stomp: 'kickLow',
  spinkick: 'kickSpin',
  spin: 'spin',
  grab: 'lunge',
  divekick: 'kickFront',
  throwobj: 'cross',
  press: 'kickMid',
  overhead: 'kickHigh',
  lariat: 'spin',
  kickH: 'kickHigh',
  float: 'salute',
  counter: 'blockHigh',
  breath: 'cross',
  beam: 'cross',
  barrage: 'punchCombo',
  aura: 'salute'
};

/** Pose de estado (sin golpe) -> clip. */
export const STATE_CLIP = {
  idle: 'idle',
  jump: 'jump',
  fall: 'jump',
  blockHigh: 'blockHigh',
  blockLow: 'blockLow',
  hitHigh: 'hitReact',
  hitLow: 'hitReact',
  launched: 'hitReact',
  knockdown: 'knockdown',
  ko: 'knockdown',
  getup: 'wakeup',
  wakeup: 'wakeup',
  dizzy: 'idle',
  guardcrush: 'hitReact',
  grab: 'lunge',
  thrown: 'hitReact',
  maxactivate: 'salute',
  win: 'salute',
  intro: 'bow',
  parry: 'blockHigh'
};

/** Peso de la guardia (manos arriba) por estado: 1 = postura de combate plena. */
export const GUARD_WEIGHT = {
  idle: 1,
  walkF: 1, walkB: 1, walkSide: 1, run: 0.75,
  blockHigh: 1, blockLow: 1, parry: 1,
  dizzy: 0.35,
  intro: 0.5,
  win: 0, salute: 0,
  jump: 0.25, fall: 0.25
};

function fallbackForMove(move) {
  const kick = move.input && move.input.button === 'K';
  if (move.level === 'SU') return 'punchCombo';
  if (move.kind === 'grab') return 'lunge';
  if (move.kind === 'projectile') return 'jab';
  if (move.level === 'L') return kick ? 'kickLow' : 'jab';
  if (move.level === 'M') return kick ? 'kickMid' : 'cross';
  if (move.level === 'H') return kick ? 'kickHigh' : 'hookR';
  return kick ? 'kickMid' : 'cross';
}

/** Clip que corresponde a un golpe. */
export function clipForMove(move) {
  if (!move) return 'jab';
  if (move.clip && hasClip(move.clip)) return move.clip;
  const byPose = POSE_CLIP[move.pose];
  if (byPose && hasClip(byPose)) return byPose;
  return fallbackForMove(move);
}

/**
 * Fotograma del clip para un golpe en curso.
 * Devuelve también `impactT` (0..1) para saber cuánto "snap" aplicar.
 */
export function attackFrame(move, moveFrame) {
  const name = clipForMove(move);
  const len = clipFrames(name);
  const imp = clipImpact(name);
  const total = Math.max(1, move.startup + move.active + move.recovery);
  if (imp <= 0 || len < 3) {
    return { name, frame: Math.min(len - 1, (moveFrame / total) * (len - 1)) };
  }
  if (moveFrame < move.startup) {
    const t = move.startup > 0 ? moveFrame / move.startup : 1;
    return { name, frame: t * imp };
  }
  const rest = moveFrame - move.startup;
  const restTotal = move.active + move.recovery;
  // Se permite rebasar un poco el final: el golpe puede seguir sonando tras el recovery.
  const t = restTotal > 0 ? Math.min(1.15, rest / restTotal) : 1;
  return { name, frame: Math.min(len - 1, imp + t * (len - 1 - imp)) };
}

/** Velocidad de avance (unidades/frame) a partir de la cual se considera andando. */
const WALK_MIN = 0.012;
const WALK_REF = 0.052;

/**
 * Plan de animación completo para un luchador en este frame.
 * @returns {{clip:string, frame:number, rate:number, guard:number, loop:boolean}}
 */
export function planAnimation(fighter, clock = 0) {
  const a = fighter.anim || { state: 'idle', pose: 'idle', frame: 0 };

  if (a.state === 'attack' && fighter.move) {
    const { name, frame } = attackFrame(fighter.move, a.frame || 0);
    return { clip: name, frame, rate: 1, guard: 0, loop: false, attack: true };
  }

  let pose = a.pose || 'idle';
  let rate = 1;
  let frame = a.frame || 0;

  // Locomoción: el motor no distingue andar, se deduce de la velocidad.
  const grounded = !fighter.airborne;
  const spd = Math.abs(fighter.vx || 0);
  if (grounded && spd > WALK_MIN && (pose === 'idle' || pose === 'walkF' || pose === 'walkB')) {
    const forward = (fighter.vx || 0) * (fighter.facing || 1) > 0;
    pose = forward ? 'walkF' : 'walkB';
    rate = Math.max(0.5, Math.min(1.9, spd / WALK_REF));
  }

  let clip = STATE_CLIP[pose] || 'idle';
  if (!hasClip(clip)) clip = 'idle';

  const len = clipFrames(clip);
  // Los bucles avanzan con `rate`; lo demás se mide en fotogramas de estado.
  const isLoop = clip === 'idle' || clip === 'walkF' || clip === 'walkB' ||
    clip === 'walkSide' || clip === 'run';

  if (isLoop) {
    frame = clock;
  } else if (pose === 'jump' || pose === 'fall') {
    // El salto ocupa todo el vuelo: se reparte entre despegue y caída.
    const JUMP_V = 0.3;
    const vy = fighter.vy || 0;
    const t = vy >= 0
      ? 0.5 * (1 - Math.min(1, vy / JUMP_V))
      : 0.5 + 0.5 * Math.min(1, -vy / JUMP_V);
    frame = Math.max(0, Math.min(len - 1, t * (len - 1)));
  } else if (pose === 'knockdown' || pose === 'ko') {
    frame = Math.min(len - 1, (a.frame || 0) * 1.1);
  } else if (pose === 'getup' || pose === 'wakeup') {
    frame = Math.min(len - 1, (a.frame || 0) * 1.2);
  } else if (pose === 'intro' || pose === 'win' || pose === 'maxactivate') {
    frame = Math.min(len - 1, (a.frame || 0) * 0.85);
  } else {
    // Golpes defensivos/reacciones: reproducir una vez y aguantar el final.
    frame = Math.min(len - 1, (a.frame || 0) * 1.25);
  }

  return {
    clip,
    frame,
    rate: isLoop ? rate : 1,
    guard: GUARD_WEIGHT[pose] ?? (GUARD_WEIGHT[clip] ?? 0),
    loop: isLoop,
    attack: false
  };
}

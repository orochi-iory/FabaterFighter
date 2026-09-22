/**
 * FabaterFighter - Constantes globales y sistema de "frame data".
 *
 * Todo el motor de lucha corre a 60 FPS lógicos (como los arcades de Capcom/SNK).
 * Cada valor de "frames" de este archivo es 1/60 de segundo.
 *
 * Referencias de diseño:
 *  - Street Fighter III: 3rd Strike  -> parry, stun bar, guard, cancel windows.
 *  - The King of Fighters '98        -> power gauge con stocks, MAX mode,
 *                                       guard cancel roll, guard crush, hop/super jump.
 */

export const FPS = 60;
export const FRAME_MS = 1000 / FPS;

/** Mitad del ancho útil del escenario (en unidades de mundo). */
export const STAGE_HALF = 7.6;
/** Pared invisible: los luchadores no pasan de aquí. */
export const WALL_LIMIT = STAGE_HALF - 0.45;

export const GRAVITY = 0.0145;

/** Salud máxima por luchador. */
export const MAX_HEALTH = 1000;

/** Barra de super: 1000 puntos = 1 stock. Máximo 3 stocks (KOF98 Advanced). */
export const METER_PER_STOCK = 1000;
export const MAX_STOCKS = 3;

/** Duración del modo MAX (KOF98: 20 s). */
export const MAX_MODE_FRAMES = 1200;
export const MAX_MODE_DAMAGE_MUL = 1.25;

/** Barra de stun (SF3). */
export const MAX_STUN = 100;
export const STUN_DECAY = 0.055;        // por frame, fuera de combo
export const DIZZY_FRAMES = 150;

/** Barra de guardia / guard crush. */
export const MAX_GUARD = 100;
export const GUARD_DECAY = 0.16;        // por frame sin bloquear
export const GUARD_CRUSH_FRAMES = 90;

/** Duración de la ronda en "ticks" de HUD y frames por tick. */
export const ROUND_TIME = 99;
export const FRAMES_PER_TICK = 36;      // 99 * 36 / 60 = 59.4 s
export const ROUNDS_TO_WIN = 2;

/** Escalado de daño por combo (proration). */
export const COMBO_SCALING = [1.0, 0.9, 0.8, 0.68, 0.56, 0.46, 0.38, 0.32, 0.26, 0.22];
export const MIN_SCALING = 0.15;

/** Juggle: puntos disponibles cuando el rival está en el aire. */
export const JUGGLE_POINTS = 5;

/** Chip damage (daño al bloquear especiales/supers). */
export const CHIP_SPECIAL = 0.07;
export const CHIP_SUPER = 0.13;

/** Parry (SF3 3rd Strike). */
export const PARRY_WINDOW_TAP = 10;     // frames si sueltas la dirección
export const PARRY_WINDOW_HOLD = 6;     // frames si mantienes la dirección
export const PARRY_WINDOW_AIR = 7;
export const PARRY_COOLDOWN = 23;       // penalización si fallas el parry
export const PARRY_FREEZE = 16;         // freeze global al parar
export const PARRY_METER = 95;
/** Frames extra de freeze según el nivel del ataque parado. */
export const PARRY_EXTRA_FREEZE = { L: 4, M: 3, H: 2, SP: 0, SU: 0 };

/** Ventanas de cancel: normal -> especial -> super. */
export const CANCEL_WINDOW = 10;        // frames de recovery cancelables

/** Ventana de tech (escapar de un throw). */
export const TECH_WINDOW = 9;

/** Invulnerabilidad al levantarse (wakeup). */
export const WAKEUP_INVULN = 5;

/** Ganancia de barra de super. */
export const METER_ON_DAMAGE_DEALT = 0.34;
export const METER_ON_DAMAGE_TAKEN = 0.5;
export const METER_ON_BLOCK = 1.05;      // por frame de blockstun
export const METER_ON_WHIFF_SPECIAL = 22;
export const METER_ON_HIT_NORMAL = 9;
export const METER_ON_BLOCK_NORMAL = 5;
export const METER_ON_WHIFF_NORMAL = 3;

/** Niveles de ataque -> hitstun / blockstun / hitstop base. */
export const LEVEL_DATA = {
  L:  { hitstun: 14, blockstun: 9,  hitstop: 6,  stun: 6,  push: 0.055 },
  M:  { hitstun: 18, blockstun: 12, hitstop: 8,  stun: 9,  push: 0.075 },
  H:  { hitstun: 23, blockstun: 15, hitstop: 10, stun: 13, push: 0.1   },
  SP: { hitstun: 26, blockstun: 17, hitstop: 12, stun: 15, push: 0.12  },
  SU: { hitstun: 32, blockstun: 22, hitstop: 14, stun: 25, push: 0.14  }
};

/** Física de salto. */
export const JUMP_FORCE = 0.3;
export const HOP_FORCE = 0.215;
export const SUPER_JUMP_FORCE = 0.4;
export const JUMP_FORWARD_SPEED = 0.072;

/** Dash / roll. */
export const DASH_FRAMES = 15;
export const DASH_SPEED = 0.165;
export const BACKDASH_FRAMES = 18;
export const BACKDASH_SPEED = 0.135;
export const ROLL_FRAMES = 24;
export const ROLL_SPEED = 0.135;
export const ROLL_INVULN = [4, 17];

/** Distancia máxima de throw. */
export const THROW_RANGE = 1.35;

/** Notación numérica (numpad) para inputs. */
export const DIR_NAMES = {
  1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '·', 6: '→', 7: '↖', 8: '↑', 9: '↗'
};

/** Botones lógicos. */
export const BUTTONS = ['LP', 'LK', 'HP', 'HK'];

export const STATE = {
  IDLE: 'idle',
  ATTACK: 'attack',
  BLOCKSTUN: 'blockstun',
  HITSTUN: 'hitstun',
  AIRHIT: 'airhit',
  KNOCKDOWN: 'knockdown',
  WAKEUP: 'wakeup',
  DIZZY: 'dizzy',
  THROW: 'throw',
  THROWN: 'thrown',
  PARRY: 'parry',
  GUARDCRUSH: 'guardcrush',
  MAXACTIVATE: 'maxactivate',
  KO: 'ko',
  WIN: 'win',
  INTRO: 'intro'
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v < 0 ? -1 : 1);

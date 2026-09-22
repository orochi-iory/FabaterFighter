/**
 * Sistema de entrada: teclado, gamepad y buffer de comandos.
 *
 * `InputBuffer` es lógica pura (sin DOM) y es la que detecta los comandos
 * tipo "236P" (quarter circle forward + punch), cargas "4~6P", dobles taps
 * para dash, etc. Está separada a propósito para poder testearla en Node.
 */

/* ------------------------------------------------------------------ */
/* Mapeos de teclado                                                   */
/* ------------------------------------------------------------------ */

export const KEYMAP = {
  p1: {
    left: ['KeyA'],
    right: ['KeyD'],
    down: ['KeyS'],
    up: ['KeyW'],
    LP: ['KeyJ'],
    LK: ['KeyK'],
    HP: ['KeyL'],
    HK: ['Semicolon'],
    SP1: ['KeyU'],
    SP2: ['KeyI'],
    SUPER: ['KeyO'],
    MAX: ['KeyP'],
    GC: ['BracketLeft'],
    pause: ['Escape'],
    f1: ['F1'],
    f2: ['F2']
  },
  p2: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    down: ['ArrowDown'],
    up: ['ArrowUp'],
    LP: ['Numpad1', 'Digit7'],
    LK: ['Numpad2', 'Digit8'],
    HP: ['Numpad3', 'Digit9'],
    HK: ['Numpad4', 'Digit0'],
    SP1: ['Numpad7', 'Minus'],
    SP2: ['Numpad8', 'Equal'],
    SUPER: ['Numpad9', 'Backslash'],
    MAX: ['Numpad5', 'Backspace'],
    GC: ['Numpad6', 'Backquote'],
    pause: ['Escape'],
    f1: ['F1'],
    f2: ['F2']
  }
};

/** Gamepad estándar: botones -> acción. */
export const GAMEPAD_MAP = {
  buttons: {
    0: 'LP', 1: 'LK', 2: 'HP', 3: 'HK',
    4: 'SP1', 5: 'SP2', 6: 'MAX', 7: 'SUPER', 8: 'GC',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
    9: 'pause'
  },
  axes: { x: 0, y: 1 }
};

/* ------------------------------------------------------------------ */
/* Utilidades de dirección (notación numpad)                           */
/* ------------------------------------------------------------------ */

const DIR_TABLE = {
  // [left][right][down][up] -> numpad
  '0000': 5,
  '1000': 4, '0100': 6, '0010': 2, '0001': 8,
  '1010': 1, '0110': 3, '1001': 7, '0101': 9
};

export function bitsToDir(left, right, down, up) {
  const key = `${left ? 1 : 0}${right ? 1 : 0}${down ? 1 : 0}${up ? 1 : 0}`;
  return DIR_TABLE[key] ?? 5;
}

/** Convierte una dirección absoluta a relativa al luchador (6 = adelante). */
export function toRelative(dir, facing) {
  if (facing >= 0) return dir;
  const swap = { 1: 3, 3: 1, 4: 6, 6: 4, 7: 9, 9: 7 };
  return swap[dir] ?? dir;
}

/** true si la dirección incluye "adelante". */
export const isForward = (dir) => dir === 6 || dir === 3 || dir === 9;
/** true si la dirección incluye "atrás". */
export const isBack = (dir) => dir === 4 || dir === 1 || dir === 7;
export const isDown = (dir) => dir === 2 || dir === 1 || dir === 3;

/* ------------------------------------------------------------------ */
/* Parser de comandos                                                  */
/* ------------------------------------------------------------------ */

/**
 * Convierte una cadena de notación en una estructura de pasos.
 *  '236'        -> [{dir:2},{dir:3},{dir:6}]
 *  '4~6'        -> [{charge:4, frames:45},{dir:6}]
 *  '2~8'        -> [{charge:2, frames:45},{dir:8}]
 *  '2141236'    -> pasos de "pretzel motion"
 */
export function parseMotion(str) {
  const out = { steps: [], str };
  const parts = String(str).split('~');
  if (parts.length === 2) {
    out.steps.push({ charge: parseInt(parts[0], 10), frames: 45 });
    for (const ch of parts[1]) out.steps.push({ dir: parseInt(ch, 10) });
  } else {
    for (const ch of parts[0]) out.steps.push({ dir: parseInt(ch, 10) });
  }
  return out;
}

const motionCache = new Map();
export function motion(str) {
  if (!motionCache.has(str)) motionCache.set(str, parseMotion(str));
  return motionCache.get(str);
}

/* ------------------------------------------------------------------ */
/* InputBuffer                                                         */
/* ------------------------------------------------------------------ */

/** Ventana total (frames) en la que un comando sigue siendo válido. */
export const MOTION_WINDOW = 26;
/** Frames máximos entre el último paso del comando y la pulsación del botón. */
export const MOTION_TAIL = 9;
/** Frames de buffer de botones (para links/cancels). */
export const BUTTON_BUFFER = 7;

export class InputBuffer {
  constructor() {
    this.history = [];       // { frame, dir, buttons }
    this.maxHistory = 90;
    this.buttonBuffer = {};  // action -> frame en el que se pulsó
    this.taps = {};          // dir -> últimos frames en los que se "tapeó"
    this.lastDir = 5;
  }

  reset() {
    this.history.length = 0;
    this.buttonBuffer = {};
    this.taps = {};
  }

  /** Registra el frame actual. `dir` ya debe venir relativo al luchador. */
  push(frame, dir, buttons) {
    this.history.push({ frame, dir, buttons });
    if (this.history.length > this.maxHistory) this.history.shift();

    for (const k in buttons) {
      if (buttons[k] && !(this.prevButtons && this.prevButtons[k])) {
        this.buttonBuffer[k] = frame;
      }
    }
    // Un "tap" es un cambio de dirección: garantiza una dirección distinta en medio.
    if (dir !== this.lastDir && dir !== 5) {
      const list = this.taps[dir] || (this.taps[dir] = []);
      list.push(frame);
      if (list.length > 3) list.shift();
    }
    this.lastDir = dir;
    this.prevButtons = { ...buttons };
  }

  /** ¿Se pulsó `action` en los últimos `BUTTON_BUFFER` frames? */
  pressed(action, frame, window = BUTTON_BUFFER) {
    const f = this.buttonBuffer[action];
    return f !== undefined && frame - f <= window;
  }

  exactPressed(action, frame) {
    return this.buttonBuffer[action] === frame;
  }

  consume(action) { delete this.buttonBuffer[action]; }

  /** Doble tap de la misma dirección dentro de `window` frames (dash). */
  doubleTap(dir, frame, window = 16) {
    const list = this.taps[dir];
    if (!list || list.length < 2) return false;
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    return frame - last <= 3 && last - prev <= window;
  }

  /**
   * Comprueba si el comando está completo.
   * @param {object} m     motion() parseada
   * @param {number} frame frame actual
   * @param {boolean} strictLastDir el último paso debe ser reciente
   */
  match(m, frame, strictLastDir = true) {
    const steps = m.steps;
    const h = this.history;
    if (!h.length) return false;
    let cursor = h.length - 1;

    // El último paso debe ser reciente respecto al botón pulsado.
    if (strictLastDir) {
      const last = steps[steps.length - 1];
      if (last.dir !== undefined) {
        let found = -1;
        for (let i = h.length - 1; i >= 0; i--) {
          if (h[i].dir === last.dir) { found = i; break; }
          if (frame - h[i].frame > MOTION_TAIL) break;
        }
        if (found < 0) return false;
        cursor = found - 1;
      }
    }

    for (let s = steps.length - 2; s >= 0; s--) {
      const step = steps[s];
      let matched = false;
      if (step.charge !== undefined) {
        // La dirección de carga debe mantenerse `frames` antes del paso siguiente.
        const held = this._chargeFrames(step.charge, cursor);
        if (held >= step.frames) matched = true;
        else return false;
      } else {
        for (let i = cursor; i >= 0; i--) {
          if (frame - h[i].frame > MOTION_WINDOW) break;
          if (h[i].dir === step.dir) { cursor = i - 1; matched = true; break; }
        }
        if (!matched) return false;
      }
    }

    // El comando completo no puede ser demasiado antiguo.
    const oldest = h[Math.max(0, cursor + 1)];
    return frame - oldest.frame <= MOTION_WINDOW + 10;
  }

  _chargeFrames(dir, cursorIdx) {
    let n = 0;
    for (let i = Math.min(cursorIdx, this.history.length - 1); i >= 0; i--) {
      if (this.history[i].dir === dir) n++;
      else if (n > 0) break;
    }
    return n;
  }
}

/* ------------------------------------------------------------------ */
/* Fuentes de entrada (DOM)                                            */
/* ------------------------------------------------------------------ */

export class KeyboardInput {
  constructor(playerKey) {
    this.map = KEYMAP[playerKey];
    this.down = new Set();
    this._onDown = (e) => {
      if (this.map.left.includes(e.code) || this.map.right.includes(e.code) ||
          this.map.down.includes(e.code) || this.map.up.includes(e.code)) {
        e.preventDefault();
      }
      this.down.add(e.code);
    };
    this._onUp = (e) => this.down.delete(e.code);
  }
  attach() {
    window.addEventListener('keydown', this._onDown);
    window.addEventListener('keyup', this._onUp);
    window.addEventListener('blur', () => this.down.clear());
  }
  detach() {
    window.removeEventListener('keydown', this._onDown);
    window.removeEventListener('keyup', this._onUp);
  }
  read() {
    const any = (list) => (list || []).some((c) => this.down.has(c));
    return {
      left: any(this.map.left), right: any(this.map.right),
      down: any(this.map.down), up: any(this.map.up),
      LP: any(this.map.LP), LK: any(this.map.LK),
      HP: any(this.map.HP), HK: any(this.map.HK),
      SP1: any(this.map.SP1), SP2: any(this.map.SP2),
      SUPER: any(this.map.SUPER), MAX: any(this.map.MAX), GC: any(this.map.GC),
      pause: any(this.map.pause)
    };
  }
  /** Botones "sistema" genéricos (F1/F2). */
  system(code) { return this.down.has(code); }
}

export class GamepadInput {
  constructor(index) { this.index = index; this.prev = {}; }
  pad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    return pads[this.index] || null;
  }
  read() {
    const p = this.pad();
    if (!p) return null;
    const b = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
    const ax = (i) => (p.axes[i] || 0);
    const AX = 0.45;
    const out = {
      left: b(GAMEPAD_MAP.buttons.left) || ax(0) < -AX,
      right: b(GAMEPAD_MAP.buttons.right) || ax(0) > AX,
      down: b(GAMEPAD_MAP.buttons.down) || ax(1) > AX,
      up: b(GAMEPAD_MAP.buttons.up) || ax(1) < -AX,
      LP: false, LK: false, HP: false, HK: false,
      SP1: false, SP2: false, SUPER: false, MAX: false, GC: false, pause: false
    };
    for (const k in GAMEPAD_MAP.buttons) {
      const action = GAMEPAD_MAP.buttons[k];
      if (action in out) out[action] = out[action] || b(+k);
    }
    return out;
  }
}

/** Combinador de varias fuentes (teclado + gamepad + táctil). */
export class CompositeInput {
  constructor() { this.sources = []; }
  add(src) { this.sources.push(src); return this; }
  read() {
    const acc = {
      left: false, right: false, down: false, up: false,
      LP: false, LK: false, HP: false, HK: false,
      SP1: false, SP2: false, SUPER: false, MAX: false, GC: false, pause: false
    };
    for (const s of this.sources) {
      const r = s.read ? s.read() : s;
      if (!r) continue;
      for (const k in acc) acc[k] = acc[k] || !!r[k];
    }
    return acc;
  }
}

/** Entrada "virtual" usada por la CPU y por los tests. */
export class VirtualInput {
  constructor() { this.state = {}; }
  set(patch) { Object.assign(this.state, patch); }
  clear() { this.state = {}; }
  read() { return { ...this.state }; }
}

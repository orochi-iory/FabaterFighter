/**
 * Fábrica de golpes y frame data.
 *
 * Cada golpe se describe como: startup -> active -> recovery (en frames).
 * Los hitboxes son cajas locales {x,y,w,h} donde +x es "hacia delante"
 * (se espeja según el facing del luchador) e y se mide desde el suelo.
 */

import { CANCEL_WINDOW, LEVEL_DATA } from '../game/constants.js';

export const box = (x, y, w, h) => ({ x, y, w, h });

/** Hurtboxes estándar por postura (locales, simétricas). */
export const HURTBOX = {
  stand: box(0, 1.05, 0.82, 1.72),
  crouch: box(0, 0.62, 0.88, 1.06),
  air: box(0, 1.0, 0.86, 1.5)
};

export const PUSHBOX = { half: 0.44, height: 1.85 };

/** Rellena los valores por defecto de un golpe. */
export function M(o) {
  const level = o.level || 'M';
  const mv = {
    id: o.id,
    name: o.name || o.id,
    jp: o.jp || '',
    level,
    kind: o.kind || 'melee',        // melee | projectile | grab | counter | buff | teleport | multi
    input: o.input || {},
    startup: o.startup ?? 8,
    active: o.active ?? 4,
    recovery: o.recovery ?? 16,
    hits: o.hits || [],
    projectile: o.projectile || null,
    motion: o.motion || null,       // desplazamiento del luchador
    invuln: o.invuln || null,
    armor: o.armor || null,
    grab: o.grab || null,
    counter: o.counter || null,
    buff: o.buff || null,
    teleport: o.teleport || null,
    chain: o.chain || null,         // rekka / follow-up
    cancel: o.cancel !== undefined ? o.cancel : true,
    cancelTo: o.cancelTo || ['special', 'super'],
    cancelWindow: o.cancelWindow ?? CANCEL_WINDOW,
    meter: o.meter || null,         // coste de stock
    meterGain: o.meterGain ?? 0,    // barra al usar el movimiento
    super: o.super || null,         // {flash, cinematic, cost}
    pose: o.pose || 'jab',
    push: o.push ?? (LEVEL_DATA[level] ? LEVEL_DATA[level].push : 0.08),
    hitstop: o.hitstop,
    air: !!o.air,
    groundOnly: !!o.groundOnly,
    sound: o.sound || (level === 'L' ? 'hitL' : 'hitH'),
    fx: o.fx || 'impact',
    fxColor: o.fxColor || '#ffffff',
    whiffMeter: o.whiffMeter ?? 0,
    tags: o.tags || []
  };
  mv.total = mv.startup + mv.active + mv.recovery;
  return mv;
}

/** Crea un hitbox con datos de daño dentro de la ventana activa. */
export function hit(o) {
  return {
    from: o.from ?? 0,
    to: o.to ?? 999,
    box: o.box,
    damage: o.damage ?? 50,
    level: o.level || 'M',
    launch: o.launch || null,       // {x,y} lanza al aire (juggle)
    knockdown: !!o.knockdown,
    juggle: o.juggle ?? 1,
    hitstun: o.hitstun,
    blockstun: o.blockstun,
    hitstop: o.hitstop,
    stun: o.stun,
    push: o.push,
    low: !!o.low,
    overhead: !!o.overhead,
    unblockable: !!o.unblockable,
    wallbounce: !!o.wallbounce,
    crumple: !!o.crumple,
    pull: o.pull || null,           // acerca al rival (command grabs)
    id: o.id || null
  };
}

/* ------------------------------------------------------------------ */
/* Normales estándar (se generan por luchador con ajustes propios)      */
/* ------------------------------------------------------------------ */

/**
 * Plantilla de golpes normales al estilo SF2/KOF:
 * LP LK HP HK de pie, agachado, en el aire, más un overhead (6HP),
 * un comando (3HK) y el throw.
 */
export function buildNormals(def) {
  const p = def.power ?? 1;       // multiplicador de daño
  const sp = def.speed ?? 1;      // multiplicador de velocidad (menos frames)
  const S = (n, min = 2) => Math.max(min, Math.round(n / sp));
  const dmg = (n) => Math.round(n * p);
  const reach = def.reach ?? 1;   // longitud de brazos/piernas
  const out = [];

  const add = (o) => out.push(M(o));

  // --- De pie -------------------------------------------------------
  add({
    id: '5LP', name: 'Jab', level: 'L', pose: 'jab',
    input: { button: 'LP', dir: '5' },
    startup: S(3), active: 2, recovery: S(7),
    hits: [hit({ box: box(0.72 * reach, 1.36, 0.78 * reach, 0.34), damage: dmg(34), level: 'L' })],
    cancelWindow: 12, fxColor: def.fx, sound: 'hitL'
  });
  add({
    id: '5LK', name: 'Short Kick', level: 'L', pose: 'kickL',
    input: { button: 'LK', dir: '5' },
    startup: S(4), active: 2, recovery: S(8),
    hits: [hit({ box: box(0.78 * reach, 0.95, 0.9 * reach, 0.36), damage: dmg(38), level: 'L' })],
    cancelWindow: 12, fxColor: def.fx, sound: 'hitL'
  });
  add({
    id: '5HP', name: 'Strong Punch', level: 'H', pose: 'strong',
    input: { button: 'HP', dir: '5' },
    startup: S(12), active: 3, recovery: S(22),
    hits: [hit({ box: box(0.95 * reach, 1.38, 1.15 * reach, 0.46), damage: dmg(78), level: 'H' })],
    fxColor: def.fx, sound: 'hitH'
  });
  add({
    id: '5HK', name: 'Roundhouse', level: 'H', pose: 'kickH',
    input: { button: 'HK', dir: '5' },
    startup: S(14), active: 4, recovery: S(26),
    hits: [hit({
      box: box(1.05 * reach, 1.42, 1.35 * reach, 0.5), damage: dmg(92), level: 'H',
      launch: { x: 0.06, y: 0.19 }, juggle: 2
    })],
    fxColor: def.fx, sound: 'hitH'
  });

  // --- Agachado -----------------------------------------------------
  add({
    id: '2LP', name: 'Crouch Jab', level: 'L', pose: 'cjab',
    input: { button: 'LP', dir: '2' },
    startup: S(3), active: 2, recovery: S(7),
    hits: [hit({ box: box(0.68 * reach, 0.92, 0.8 * reach, 0.34), damage: dmg(32), level: 'L', low: true })],
    cancelWindow: 14, fxColor: def.fx, sound: 'hitL'
  });
  add({
    id: '2LK', name: 'Crouch Short', level: 'L', pose: 'ckick',
    input: { button: 'LK', dir: '2' },
    startup: S(4), active: 2, recovery: S(9),
    hits: [hit({ box: box(0.75 * reach, 0.42, 0.95 * reach, 0.34), damage: dmg(36), level: 'L', low: true })],
    cancelWindow: 14, fxColor: def.fx, sound: 'hitL'
  });
  add({
    id: '2HP', name: 'Launcher', level: 'H', pose: 'launcher',
    input: { button: 'HP', dir: '2' },
    startup: S(9), active: 3, recovery: S(26),
    hits: [hit({
      box: box(0.6 * reach, 1.3, 0.9 * reach, 1.5), damage: dmg(72), level: 'H',
      launch: { x: 0.05, y: 0.245 }, juggle: 1
    })],
    fxColor: def.fx, sound: 'hitH'
  });
  add({
    id: '2HK', name: 'Sweep', level: 'H', pose: 'sweep',
    input: { button: 'HK', dir: '2' },
    startup: S(11), active: 3, recovery: S(28),
    hits: [hit({
      box: box(1.0 * reach, 0.3, 1.5 * reach, 0.42), damage: dmg(74), level: 'H',
      low: true, knockdown: true, juggle: 0
    })],
    fxColor: def.fx, sound: 'sweep'
  });

  // --- Command normals ---------------------------------------------
  add({
    id: '6HP', name: 'Overhead', level: 'M', pose: 'overhead',
    input: { button: 'HP', dir: '6' },
    startup: S(18), active: 3, recovery: S(22),
    hits: [hit({
      box: box(0.8 * reach, 1.55, 1.0 * reach, 0.7), damage: dmg(82), level: 'M', overhead: true
    })],
    fxColor: def.fx, sound: 'hitH'
  });
  add({
    id: '3HK', name: 'Command Kick', level: 'H', pose: 'cmdkick',
    input: { button: 'HK', dir: '3' },
    startup: S(14), active: 4, recovery: S(24),
    hits: [hit({
      box: box(0.9 * reach, 0.75, 1.25 * reach, 0.7), damage: dmg(86), level: 'H',
      launch: { x: 0.08, y: 0.2 }, juggle: 2
    })],
    fxColor: def.fx, sound: 'hitH'
  });

  // --- Embestidas (66+fuerte): derriban, absorben débil de pie, --------
  // --- pero un golpe agachado las desestabiliza. Con estilo por luchador.
  const chg = def.chargeStyle || {};
  add({
    id: '66HP', name: chg.pName || 'Charging Blow', level: 'H', pose: 'chargeP',
    input: { button: 'HP', dir: '66' },
    startup: S(chg.pStartup ?? 11), active: 4, recovery: S(chg.pRecovery ?? 22),
    motion: { type: 'lunge', start: 2, frames: S(chg.pStartup ?? 11) + 4, speed: chg.pSpeed ?? 0.22 },
    hits: [hit({
      box: box(0.9 * reach, 1.3, 1.1 * reach, 0.5), damage: dmg(chg.pDmg ?? 72), level: 'H',
      launch: { x: 0.08, y: 0.17 }, juggle: 1
    })],
    tags: ['charge'], cancel: false, fxColor: def.fx, sound: 'hitH'
  });
  add({
    id: '66HK', name: chg.kName || 'Charging Kick', level: 'H', pose: 'chargeK',
    input: { button: 'HK', dir: '66' },
    startup: S(chg.kStartup ?? 13), active: 4, recovery: S(chg.kRecovery ?? 26),
    motion: { type: 'lunge', start: 2, frames: S(chg.kStartup ?? 13) + 4, speed: chg.kSpeed ?? 0.24 },
    hits: [hit({
      box: box(1.0 * reach, 0.8, 1.3 * reach, 0.6), damage: dmg(chg.kDmg ?? 84), level: 'H',
      launch: { x: 0.1, y: 0.14 }, juggle: 1
    })],
    tags: ['charge'], cancel: false, fxColor: def.fx, sound: 'hitH'
  });

  // --- Aéreos -------------------------------------------------------
  const airHits = [
    ['jLP', 'LP', box(0.62 * reach, 1.15, 0.8 * reach, 0.4), dmg(38), 'L', null],
    ['jLK', 'LK', box(0.68 * reach, 0.8, 0.95 * reach, 0.45), dmg(42), 'L', null],
    ['jHP', 'HP', box(0.6 * reach, 1.2, 0.9 * reach, 0.55), dmg(76), 'H', null],
    ['jHK', 'HK', box(0.75 * reach, 0.85, 1.1 * reach, 0.6), dmg(84), 'H', null]
  ];
  for (const [id, btn, bx, d, lv] of airHits) {
    add({
      id, name: 'Air ' + btn, level: lv, pose: id === 'jHP' || id === 'jLP' ? 'airpunch' : 'airkick',
      input: { button: btn, air: true }, air: true, cancel: false,
      startup: S(id === 'jLP' || id === 'jLK' ? 5 : 8), active: 6, recovery: 6,
      hits: [hit({ box: bx, damage: d, level: lv })],
      fxColor: def.fx, sound: 'hitH'
    });
  }

  // --- Throw --------------------------------------------------------
  out.push({
    id: 'throw', name: def.throwName || 'Throw', level: 'H', kind: 'grab', pose: 'grab',
    input: { button: 'LP+LK', dir: '5' },
    startup: 3, active: 2, recovery: 34, total: 39,
    grab: {
      range: def.throwRange ?? 1.35, damage: dmg(def.throwDamage ?? 110),
      hitstun: 40, knockdown: true, whiff: 'throwWhiff'
    },
    cancel: false, fxColor: def.fx, sound: 'throw', tags: ['throw']
  });

  // Aplicar overrides específicos del luchador.
  const mods = def.normalMods || {};
  for (const mv of out) {
    const mod = mods[mv.id];
    if (!mod) continue;
    Object.assign(mv, mod);
    if (mod.hits) mv.hits = mod.hits;
    mv.total = mv.startup + mv.active + mv.recovery;
  }
  return out;
}

/** Busca el golpe normal adecuado según dirección + botón. */
export function selectNormal(moves, dir, button, airborne) {
  const has = (id) => moves.find((m) => m.id === id);
  if (airborne) return has('j' + button);
  const down = dir === 2 || dir === 1 || dir === 3;
  const fwd = dir === 6 || dir === 9 || dir === 3;
  if (down && fwd && button === 'HK') return has('3HK') || has('2HK');
  if (down) return has('2' + button) || has('5' + button);
  if (fwd && button === 'HP') return has('6HP') || has('5HP');
  return has('5' + button);
}

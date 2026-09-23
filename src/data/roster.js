/**
 * ROSTER — 10 luchadores, cada uno con arquetipo, gimmick y frame data propios.
 *
 * Notación de comandos (numpad, relativa al luchador; 6 = adelante):
 *   236P  = cuarto de círculo adelante + puño      (Hadouken)
 *   623P  = adelante, abajo, abajo-adelante + puño (Shoryuken)
 *   214K  = cuarto de círculo atrás + pierna
 *   4~6P  = cargar atrás (45f) y adelante + puño    (estilo Guile / KOF charge)
 *   236236P / 2141236P = super
 */

import { M, hit, box, buildNormals } from './moves.js';

/* ------------------------------------------------------------------ */
/* 1. KENJI ARASHI — shotokan equilibrado                              */
/* ------------------------------------------------------------------ */
const KENJI = {
  id: 'kenji',
  name: 'KENJI ARASHI',
  title: 'El Puño del Viento',
  style: 'Arashi-Ryu Karate',
  country: 'Japón',
  archetype: 'Equilibrado / Shotokan',
  bio: 'Heredero de un dojo centenario. Busca al guerrero que derrotó a su maestro.',
  winQuote: 'El viento no se detiene. Yo tampoco.',
  colors: {
    gi: '#e9e6da', trim: '#b71c1c', skin: '#e7b189', hair: '#241d1a',
    belt: '#141414', accent: '#ff5252', aura: '#7fd4ff', glove: '#c62828', boot: '#2b2b2b'
  },
  body: { height: 1.02, bulk: 1.0, armLen: 1.0, legLen: 1.0, head: 1.0, hair: 'spiky', band: 'headband', sweepStyle: 'sweep', chargeStyle: { pName: 'Arashi Rush', kName: 'Arashi Drive', pSpeed: 0.24, kSpeed: 0.26 } },
  stats: { health: 1000, walk: 0.062, back: 0.052, power: 1.0, speed: 1.0, reach: 1.0, defense: 1.0, jump: 1.0, weight: 1.0 },
  fx: '#8fd8ff',
  specials: [
    M({
      id: 'kenji_wave', name: 'Seiken Ha', jp: '正拳波', level: 'SP', kind: 'projectile', pose: 'cast',
      input: { motion: '236', button: 'P' },
      startup: 14, active: 3, recovery: 34,
      projectile: {
        frame: 15, y: 1.25, speed: 0.155, box: { w: 0.72, h: 0.72 },
        damage: 72, level: 'SP', life: 200, color: '#8fd8ff', sound: 'fire', fx: 'orb',
        byButton: { LP: { speed: 0.125 }, HP: { speed: 0.21 } }
      },
      meterGain: 26, whiffMeter: 26, fxColor: '#8fd8ff'
    }),
    M({
      id: 'kenji_upper', name: 'Shouryuu Ken', jp: '昇竜拳', level: 'SP', pose: 'uppercut',
      input: { motion: '623', button: 'P' },
      startup: 3, active: 14, recovery: 36, invuln: [0, 8],
      motion: { type: 'rise', vy: 0.235, vx: 0.045, frames: 20 },
      hits: [
        hit({ from: 0, to: 5, box: box(0.5, 1.9, 0.85, 1.9), damage: 62, level: 'H', launch: { x: 0.03, y: 0.26 }, juggle: 2 }),
        hit({ from: 6, to: 14, box: box(0.45, 2.2, 0.8, 1.9), damage: 44, level: 'H', launch: { x: 0.05, y: 0.2 }, juggle: 2 })
      ],
      cancel: false, meterGain: 30, whiffMeter: 30, fxColor: '#8fd8ff', tags: ['reversal']
    }),
    M({
      id: 'kenji_tatsu', name: 'Tatsumaki Geri', jp: '竜巻蹴り', level: 'SP', pose: 'spin',
      input: { motion: '214', button: 'K' },
      startup: 11, active: 16, recovery: 26,
      motion: { type: 'lunge', speed: 0.13, frames: 22, start: 10 },
      hits: [
        hit({ from: 0, to: 7, box: box(0.9, 1.25, 1.3, 0.8), damage: 48, level: 'M' }),
        hit({ from: 8, to: 16, box: box(0.9, 1.25, 1.3, 0.8), damage: 52, level: 'M', launch: { x: 0.06, y: 0.16 }, juggle: 1 })
      ],
      cancelWindow: 6, meterGain: 26, whiffMeter: 26, fxColor: '#8fd8ff'
    })
  ],
  supers: [
    M({
      id: 'kenji_super', name: 'Arashi Senretsu Ken', jp: '嵐千裂拳', level: 'SU', pose: 'rush',
      input: { motion: '236236', button: 'P' },
      super: { flash: 42, cinematic: true, cost: 1 },
      startup: 8, active: 52, recovery: 34,
      motion: { type: 'lunge', speed: 0.22, frames: 16, start: 6 },
      invuln: [0, 10],
      hits: [
        hit({ from: 6, to: 10, box: box(0.9, 1.3, 1.2, 0.6), damage: 46, level: 'H' }),
        hit({ from: 14, to: 18, box: box(0.9, 1.3, 1.2, 0.6), damage: 42, level: 'H' }),
        hit({ from: 22, to: 26, box: box(0.9, 1.3, 1.2, 0.6), damage: 42, level: 'H' }),
        hit({ from: 30, to: 34, box: box(0.9, 1.3, 1.2, 0.6), damage: 42, level: 'H' }),
        hit({ from: 40, to: 52, box: box(0.6, 2.0, 1.0, 2.0), damage: 96, level: 'SU', launch: { x: 0.1, y: 0.3 }, juggle: 3, knockdown: true })
      ],
      cancel: false, meter: { cost: 1 }, fxColor: '#8fd8ff'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 2. VALERIA SANTIAGO — velocidad y piernas                           */
/* ------------------------------------------------------------------ */
const VALERIA = {
  id: 'valeria',
  name: 'VALERIA SANTIAGO',
  title: 'La Tormenta Bailarina',
  style: 'Capoeira de Combate',
  country: 'Brasil',
  archetype: 'Rushdown / Velocidad',
  bio: 'Bailarina y luchadora callejera. Nadie ha visto dos veces su mismo paso.',
  winQuote: '¿Ya? Y yo apenas calentaba.',
  colors: {
    gi: '#ffd54f', trim: '#00897b', skin: '#c68642', hair: '#3e2723',
    belt: '#00695c', accent: '#00e5ff', aura: '#ffd54f', glove: '#ff7043', boot: '#ffffff'
  },
  body: { height: 0.96, bulk: 0.82, armLen: 0.98, legLen: 1.12, head: 0.95, hair: 'ponytail', female: true, top: 'tank', bottom: 'shorts', sweepStyle: 'slide', chargeStyle: { pName: 'Vendaval', kName: 'Tijera Voladora', pStartup: 9, kStartup: 11, pSpeed: 0.28, kSpeed: 0.3, pDmg: 64, kDmg: 74 } },
  stats: { health: 900, walk: 0.078, back: 0.064, power: 0.9, speed: 1.16, reach: 1.02, defense: 0.9, jump: 1.05, weight: 0.9 },
  fx: '#ffe082',
  specials: [
    M({
      id: 'val_thunder', name: 'Thunder Heel', jp: '雷踵', level: 'SP', pose: 'barrage',
      input: { motion: '214', button: 'K' },
      startup: 9, active: 30, recovery: 24,
      motion: { type: 'lunge', speed: 0.1, frames: 14, start: 8 },
      hits: [
        hit({ from: 0, to: 6, box: box(0.95, 1.3, 1.2, 0.5), damage: 30, level: 'M' }),
        hit({ from: 8, to: 14, box: box(0.95, 1.3, 1.2, 0.5), damage: 28, level: 'M' }),
        hit({ from: 16, to: 22, box: box(0.95, 1.3, 1.2, 0.5), damage: 28, level: 'M' }),
        hit({ from: 24, to: 30, box: box(0.95, 1.3, 1.2, 0.5), damage: 34, level: 'M', launch: { x: 0.05, y: 0.14 }, juggle: 1 })
      ],
      cancelWindow: 8, meterGain: 30, whiffMeter: 30, fxColor: '#ffe082'
    }),
    M({
      id: 'val_cyclone', name: 'Cyclone Fan', jp: '旋風扇', level: 'SP', pose: 'spinkick',
      input: { motion: '236', button: 'K' },
      startup: 6, active: 26, recovery: 20,
      motion: { type: 'rise', vy: 0.17, vx: 0.06, frames: 26 },
      invuln: [0, 4],
      hits: [
        hit({ from: 0, to: 12, box: box(0.35, 1.7, 1.7, 1.7), damage: 34, level: 'M', launch: { x: 0.04, y: 0.2 }, juggle: 2 }),
        hit({ from: 14, to: 26, box: box(0.35, 1.7, 1.7, 1.7), damage: 30, level: 'M', juggle: 1 })
      ],
      cancel: false, meterGain: 28, whiffMeter: 28, fxColor: '#ffe082', tags: ['reversal']
    }),
    M({
      id: 'val_dive', name: 'Talon Dive', jp: '鷹爪', level: 'SP', pose: 'divekick', air: true,
      input: { motion: '214', button: 'K', air: true },
      startup: 5, active: 30, recovery: 12,
      motion: { type: 'dive', vx: 0.11, vy: -0.115 },
      hits: [hit({ from: 0, to: 30, box: box(0.6, 0.55, 1.0, 0.8), damage: 66, level: 'M', juggle: 1 })],
      cancel: false, meterGain: 26, whiffMeter: 26, fxColor: '#ffe082'
    })
  ],
  supers: [
    M({
      id: 'val_super', name: 'Danza del Huracán', jp: '颶風の舞', level: 'SU', pose: 'storm',
      input: { motion: '2363214', button: 'K' },
      super: { flash: 42, cinematic: true, cost: 1 },
      startup: 7, active: 76, recovery: 28,
      motion: { type: 'lunge', speed: 0.19, frames: 22, start: 5 },
      invuln: [0, 8],
      hits: [
        hit({ from: 4, to: 8, box: box(1.0, 1.3, 1.3, 0.6), damage: 32, level: 'H' }),
        hit({ from: 12, to: 16, box: box(1.0, 1.3, 1.3, 0.6), damage: 30, level: 'H' }),
        hit({ from: 20, to: 24, box: box(1.0, 1.3, 1.3, 0.6), damage: 30, level: 'H' }),
        hit({ from: 28, to: 32, box: box(1.0, 1.3, 1.3, 0.6), damage: 30, level: 'H' }),
        hit({ from: 36, to: 40, box: box(1.0, 1.3, 1.3, 0.6), damage: 30, level: 'H' }),
        hit({ from: 44, to: 48, box: box(1.0, 1.3, 1.3, 0.6), damage: 30, level: 'H' }),
        hit({ from: 56, to: 76, box: box(0.5, 2.0, 1.5, 2.2), damage: 92, level: 'SU', launch: { x: 0.08, y: 0.32 }, juggle: 3, knockdown: true })
      ],
      cancel: false, meter: { cost: 1 }, fxColor: '#ffe082'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 3. BRUTUS KANE — grappler con armadura                              */
/* ------------------------------------------------------------------ */
const BRUTUS = {
  id: 'brutus',
  name: 'BRUTUS KANE',
  title: 'La Montaña de Hierro',
  style: 'Wrestling de Demolición',
  country: 'Australia',
  archetype: 'Grappler / Armadura',
  bio: 'Ex minero. Levanta vagones por diversión y abraza a la gente hasta que cruje.',
  winQuote: 'Demasiado pequeño para esta mina.',
  colors: {
    gi: '#5d4037', trim: '#ff8f00', skin: '#e0a075', hair: '#c62828',
    belt: '#3e2723', accent: '#ffb300', aura: '#ff7043', glove: '#4e342e', boot: '#263238'
  },
  body: { height: 1.16, bulk: 1.42, armLen: 1.05, legLen: 0.9, head: 1.05, hair: 'mohawk', beard: true, top: 'bare', sweepStyle: 'both', chargeStyle: { pName: 'Bulldozer', kName: 'Tronco', pStartup: 14, kStartup: 16, pSpeed: 0.18, kSpeed: 0.2, pDmg: 92, kDmg: 102 } },
  stats: { health: 1180, walk: 0.046, back: 0.038, power: 1.24, speed: 0.82, reach: 1.02, defense: 1.22, jump: 0.82, weight: 1.3 },
  fx: '#ff8a65',
  throwRange: 1.55, throwDamage: 130,
  specials: [
    M({
      id: 'bru_suplex', name: 'Titan Suplex', jp: '巨神投げ', level: 'SP', kind: 'grab', pose: 'grab',
      input: { motion: '63214', button: 'P' },
      startup: 4, active: 3, recovery: 40,
      grab: { range: 1.75, damage: 175, hitstun: 46, knockdown: true, pull: 0.6 },
      cancel: false, meterGain: 30, whiffMeter: 18, fxColor: '#ff8a65', tags: ['commandGrab']
    }),
    M({
      id: 'bru_press', name: 'Meteor Press', jp: '隕石圧', level: 'SP', pose: 'press',
      input: { motion: '22', button: 'P' },
      startup: 8, active: 40, recovery: 22,
      motion: { type: 'jump', vy: 0.26, vx: 0.085, start: 6 },
      armor: { from: 6, to: 40, hits: 2 },
      hits: [hit({ from: 0, to: 40, box: box(0.25, 0.5, 1.7, 1.0), damage: 110, level: 'H', knockdown: true, juggle: 2 })],
      cancel: false, meterGain: 28, whiffMeter: 28, fxColor: '#ff8a65'
    }),
    M({
      id: 'bru_lariat', name: 'Iron Lariat', jp: '鉄のラリアット', level: 'SP', pose: 'lariat',
      input: { motion: '41236', button: 'P' },
      startup: 10, active: 26, recovery: 24,
      motion: { type: 'lunge', speed: 0.115, frames: 24, start: 9 },
      armor: { from: 8, to: 30, hits: 1 },
      hits: [
        hit({ from: 0, to: 12, box: box(0.85, 1.35, 1.4, 0.7), damage: 62, level: 'H' }),
        hit({ from: 14, to: 26, box: box(0.85, 1.35, 1.4, 0.7), damage: 58, level: 'H', launch: { x: 0.08, y: 0.2 }, juggle: 2 })
      ],
      cancelWindow: 6, meterGain: 30, whiffMeter: 30, fxColor: '#ff8a65'
    })
  ],
  supers: [
    M({
      id: 'bru_super', name: 'Atomic Piledriver', jp: '原子パイルドライバー', level: 'SU', kind: 'grab', pose: 'grab',
      input: { motion: '6321463214', button: 'P' },
      super: { flash: 46, cinematic: true, cost: 1 },
      startup: 5, active: 4, recovery: 60, invuln: [0, 12],
      grab: { range: 1.9, damage: 385, hitstun: 60, knockdown: true, pull: 0.5, cinematic: true },
      cancel: false, meter: { cost: 1 }, fxColor: '#ff8a65'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 4. KAGEROU — ninja con teletransporte                               */
/* ------------------------------------------------------------------ */
const KAGEROU = {
  id: 'kagerou',
  name: 'KAGEROU',
  title: 'La Sombra que Corta',
  style: 'Ninjutsu Iga-Ryu',
  country: 'Japón',
  archetype: 'Mixup / Teletransporte',
  bio: 'Nadie conoce su rostro. Sus víctimas tampoco llegaron a verlo.',
  winQuote: 'Ya estabas muerto al parpadear.',
  colors: {
    gi: '#263238', trim: '#7b1fa2', skin: '#d8a173', hair: '#121212',
    belt: '#4a148c', accent: '#e040fb', aura: '#b388ff', glove: '#1a1a1a', boot: '#37474f'
  },
  body: { height: 0.94, bulk: 0.8, armLen: 0.95, legLen: 1.05, head: 0.92, hair: 'mask', scarf: true, sweepStyle: 'slide', chargeStyle: { pName: 'Paso Fantasma', kName: 'Guadaña', pStartup: 8, kStartup: 10, pSpeed: 0.3, kSpeed: 0.3, pDmg: 58, kDmg: 68 } },
  stats: { health: 880, walk: 0.086, back: 0.072, power: 0.86, speed: 1.22, reach: 0.94, defense: 0.88, jump: 1.12, weight: 0.85 },
  fx: '#ce93d8',
  specials: [
    M({
      id: 'kag_step', name: 'Shadow Step', jp: '影移り', level: 'SP', kind: 'teleport', pose: 'teleport',
      input: { motion: '236', button: 'K' },
      startup: 8, active: 2, recovery: 14,
      teleport: { frame: 8, target: 'behind', offset: 1.1 },
      invuln: [4, 12], cancel: false, meterGain: 20, whiffMeter: 20, fxColor: '#ce93d8'
    }),
    M({
      id: 'kag_kunai', name: 'Kunai Flurry', jp: '苦無連撃', level: 'SP', kind: 'projectile', pose: 'throwobj',
      input: { motion: '214', button: 'P' },
      startup: 11, active: 4, recovery: 26,
      projectile: {
        frame: 12, y: 1.3, speed: 0.26, box: { w: 0.5, h: 0.28 },
        damage: 44, level: 'M', life: 150, color: '#e1bee7', sound: 'kunai', fx: 'kunai',
        count: 1, byButton: { HP: { count: 3, interval: 8, damage: 38 } }
      },
      meterGain: 24, whiffMeter: 24, fxColor: '#ce93d8'
    }),
    M({
      id: 'kag_fang', name: 'Crescent Fang', jp: '三日月牙', level: 'SP', pose: 'uppercut',
      input: { motion: '623', button: 'K' },
      startup: 4, active: 16, recovery: 32, invuln: [0, 9],
      motion: { type: 'rise', vy: 0.25, vx: 0.05, frames: 20 },
      hits: [
        hit({ from: 0, to: 8, box: box(0.45, 1.8, 0.9, 2.0), damage: 58, level: 'H', launch: { x: 0.03, y: 0.27 }, juggle: 2 }),
        hit({ from: 9, to: 16, box: box(0.45, 2.1, 0.9, 2.0), damage: 40, level: 'H', juggle: 2 })
      ],
      cancel: false, meterGain: 28, whiffMeter: 28, fxColor: '#ce93d8', tags: ['reversal']
    })
  ],
  supers: [
    M({
      id: 'kag_super', name: 'Phantom Requiem', jp: '幻影鎮魂歌', level: 'SU', pose: 'rush',
      input: { motion: '2141236', button: 'P' },
      super: { flash: 44, cinematic: true, cost: 1 },
      startup: 6, active: 70, recovery: 30, invuln: [0, 70],
      motion: { type: 'lunge', speed: 0.14, frames: 60, start: 6 },
      hits: [
        hit({ from: 4, to: 8, box: box(0.8, 1.3, 1.1, 0.6), damage: 30, level: 'H' }),
        hit({ from: 12, to: 16, box: box(0.8, 1.3, 1.1, 0.6), damage: 28, level: 'H' }),
        hit({ from: 20, to: 24, box: box(0.8, 1.3, 1.1, 0.6), damage: 28, level: 'H' }),
        hit({ from: 28, to: 32, box: box(0.8, 1.3, 1.1, 0.6), damage: 28, level: 'H' }),
        hit({ from: 36, to: 40, box: box(0.8, 1.3, 1.1, 0.6), damage: 28, level: 'H' }),
        hit({ from: 44, to: 48, box: box(0.8, 1.3, 1.1, 0.6), damage: 28, level: 'H' }),
        hit({ from: 56, to: 70, box: box(0.7, 1.5, 1.3, 1.2), damage: 88, level: 'SU', launch: { x: 0.09, y: 0.28 }, juggle: 3, knockdown: true })
      ],
      cancel: false, meter: { cost: 1 }, fxColor: '#ce93d8'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 5. MAGNUS VOSS — zoner de extremidades elásticas                    */
/* ------------------------------------------------------------------ */
const MAGNUS = {
  id: 'magnus',
  name: 'MAGNUS VOSS',
  title: 'El Alquimista Elástico',
  style: 'Yoga de Combate',
  country: 'Alemania',
  archetype: 'Zoner / Largo alcance',
  bio: 'Un experimento genético salió mal. Ahora su cuerpo es una cuerda letal.',
  winQuote: 'La distancia es solo una sugerencia.',
  colors: {
    gi: '#ff7043', trim: '#4527a0', skin: '#f0c8a0', hair: '#eceff1',
    belt: '#311b92', accent: '#ffab40', aura: '#ff6e40', glove: '#ede7f6', boot: '#ffab40'
  },
  body: { height: 1.1, bulk: 0.74, armLen: 1.5, legLen: 1.2, head: 0.9, hair: 'bald', turban: true, sweepStyle: 'sweep', chargeStyle: { pName: 'Lanza del Dawn', kName: 'Media Luna', pSpeed: 0.2, kSpeed: 0.22 } },
  stats: { health: 920, walk: 0.048, back: 0.042, power: 1.05, speed: 0.9, reach: 1.55, defense: 1.0, jump: 0.95, weight: 1.0 },
  fx: '#ff8a65',
  specials: [
    M({
      id: 'mag_fist', name: 'Elastic Fist', jp: '伸縮拳', level: 'SP', pose: 'stretch',
      input: { motion: '236', button: 'P' },
      startup: 12, active: 10, recovery: 26,
      hits: [hit({
        from: 0, to: 10, box: box(1.9, 1.32, 3.2, 0.42), damage: 78, level: 'SP'
      })],
      cancelWindow: 8, meterGain: 28, whiffMeter: 28, fxColor: '#ff8a65'
    }),
    M({
      id: 'mag_fire', name: 'Inferno Breath', jp: '地獄の息', level: 'SP', kind: 'projectile', pose: 'breath',
      input: { motion: '214', button: 'P' },
      startup: 15, active: 6, recovery: 32,
      projectile: {
        frame: 16, y: 1.15, speed: 0.085, box: { w: 1.5, h: 0.9 },
        damage: 26, level: 'M', life: 46, color: '#ff7043', sound: 'flame', fx: 'flame',
        hits: 3, interval: 10, ground: true
      },
      meterGain: 28, whiffMeter: 28, fxColor: '#ff7043'
    }),
    M({
      id: 'mag_blink', name: 'Blink Shift', jp: '瞬移', level: 'SP', kind: 'teleport', pose: 'teleport',
      input: { motion: '22', button: 'K' },
      startup: 9, active: 2, recovery: 16,
      teleport: { frame: 9, target: 'swap', offset: 1.3 },
      invuln: [5, 13], cancel: false, meterGain: 18, whiffMeter: 18, fxColor: '#ff8a65'
    })
  ],
  supers: [
    M({
      id: 'mag_super', name: 'Infinite Reach', jp: '無限到達', level: 'SU', pose: 'stretch',
      input: { motion: '236236', button: 'P' },
      super: { flash: 42, cinematic: true, cost: 1 },
      startup: 10, active: 62, recovery: 32,
      hits: [
        hit({ from: 4, to: 10, box: box(2.2, 1.35, 4.0, 0.5), damage: 40, level: 'H' }),
        hit({ from: 16, to: 22, box: box(2.2, 1.35, 4.0, 0.5), damage: 38, level: 'H' }),
        hit({ from: 28, to: 34, box: box(2.2, 1.35, 4.0, 0.5), damage: 38, level: 'H' }),
        hit({ from: 40, to: 46, box: box(2.2, 1.35, 4.0, 0.5), damage: 38, level: 'H' }),
        hit({ from: 52, to: 62, box: box(1.6, 1.1, 3.2, 1.0), damage: 92, level: 'SU', launch: { x: 0.09, y: 0.26 }, juggle: 3, knockdown: true })
      ],
      cancel: false, meter: { cost: 1 }, fxColor: '#ff8a65'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 6. REX COLTON — charge character                                    */
/* ------------------------------------------------------------------ */
const REX = {
  id: 'rex',
  name: 'REX COLTON',
  title: 'El Cañón del Desierto',
  style: 'Combate Táctico "Blade"',
  country: 'EE. UU.',
  archetype: 'Charge / Zoner defensivo',
  bio: 'Sargento retirado. Sus "hojas sónicas" todavía están clasificadas.',
  winQuote: 'Objetivo neutralizado. Cambio.',
  colors: {
    gi: '#37474f', trim: '#fdd835', skin: '#e8b98f', hair: '#8d6e63',
    belt: '#263238', accent: '#40c4ff', aura: '#80d8ff', glove: '#1b5e20', boot: '#212121'
  },
  body: { height: 1.08, bulk: 1.14, armLen: 1.06, legLen: 1.0, head: 1.0, hair: 'flat', cap: true, sweepStyle: 'both', chargeStyle: { pName: 'Shoulder Ram', kName: 'Boot Hill', pStartup: 12, kStartup: 13, pSpeed: 0.22, pDmg: 80 } },
  stats: { health: 1020, walk: 0.056, back: 0.052, power: 1.06, speed: 0.94, reach: 1.06, defense: 1.1, jump: 0.96, weight: 1.1 },
  fx: '#80d8ff',
  specials: [
    M({
      id: 'rex_blade', name: 'Sonic Blade', jp: '音速刃', level: 'SP', kind: 'projectile', pose: 'cast',
      input: { motion: '4~6', button: 'P' },
      startup: 12, active: 3, recovery: 32,
      projectile: {
        frame: 13, y: 1.2, speed: 0.2, box: { w: 1.1, h: 0.6 },
        damage: 76, level: 'SP', life: 190, color: '#80d8ff', sound: 'blade', fx: 'blade',
        byButton: { HP: { speed: 0.28, damage: 84 } }
      },
      meterGain: 26, whiffMeter: 26, fxColor: '#80d8ff'
    }),
    M({
      id: 'rex_flash', name: 'Flash Kick', jp: '閃光蹴り', level: 'SP', pose: 'uppercut',
      input: { motion: '2~8', button: 'K' },
      startup: 3, active: 15, recovery: 34, invuln: [0, 10],
      motion: { type: 'rise', vy: 0.24, vx: 0.03, frames: 20 },
      hits: [
        hit({ from: 0, to: 6, box: box(0.4, 1.7, 0.9, 2.1), damage: 66, level: 'H', launch: { x: 0.03, y: 0.27 }, juggle: 2 }),
        hit({ from: 7, to: 15, box: box(0.4, 2.0, 0.9, 2.1), damage: 44, level: 'H', juggle: 2 })
      ],
      cancel: false, meterGain: 30, whiffMeter: 30, fxColor: '#80d8ff', tags: ['reversal']
    }),
    M({
      id: 'rex_charge', name: 'Bayonet Rush', jp: '銃剣突進', level: 'SP', pose: 'rush',
      input: { motion: '4~6', button: 'K' },
      startup: 12, active: 14, recovery: 26,
      motion: { type: 'lunge', speed: 0.185, frames: 18, start: 10 },
      armor: { from: 10, to: 22, hits: 1 },
      hits: [
        hit({ from: 0, to: 6, box: box(0.95, 1.25, 1.3, 0.7), damage: 52, level: 'M' }),
        hit({ from: 8, to: 14, box: box(0.95, 1.25, 1.3, 0.7), damage: 58, level: 'H', launch: { x: 0.08, y: 0.18 }, juggle: 2 })
      ],
      cancelWindow: 8, meterGain: 28, whiffMeter: 28, fxColor: '#80d8ff'
    })
  ],
  supers: [
    M({
      id: 'rex_super', name: 'Double Sonic Blade', jp: '二重音速刃', level: 'SU', kind: 'projectile', pose: 'cast',
      input: { motion: '4123641236', button: 'P' },
      super: { flash: 44, cinematic: true, cost: 1 },
      startup: 12, active: 40, recovery: 34,
      projectile: {
        frame: 12, y: 1.2, speed: 0.19, box: { w: 1.2, h: 0.7 },
        damage: 52, level: 'SU', life: 200, color: '#80d8ff', sound: 'blade', fx: 'blade',
        count: 5, interval: 8, super: true
      },
      cancel: false, meter: { cost: 1 }, fxColor: '#80d8ff'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 7. ORION VEX — rushdown de fuego con rekkas                         */
/* ------------------------------------------------------------------ */
const ORION = {
  id: 'orion',
  name: 'ORION VEX',
  title: 'La Llama Insaciable',
  style: 'Kagutsuchi Kenpo',
  country: 'Desconocido',
  archetype: 'Rushdown / Rekka / Quemadura',
  bio: 'Quemó su propio dojo para sentir algo. Todavía lo está buscando.',
  winQuote: 'Arde. Todo arde.',
  colors: {
    gi: '#212121', trim: '#d50000', skin: '#d9a066', hair: '#ff5722',
    belt: '#b71c1c', accent: '#ff6d00', aura: '#ff3d00', glove: '#d50000', boot: '#1b1b1b'
  },
  body: { height: 1.0, bulk: 0.96, armLen: 1.02, legLen: 1.0, head: 0.98, hair: 'flame', scarf: true, top: 'tank', sweepStyle: 'slide', chargeStyle: { pName: 'Llamarada', kName: 'Cometa', pSpeed: 0.26, kSpeed: 0.28, pDmg: 76 } },
  stats: { health: 980, walk: 0.07, back: 0.056, power: 1.08, speed: 1.06, reach: 1.0, defense: 0.98, jump: 1.0, weight: 1.0 },
  fx: '#ff5722',
  specials: [
    M({
      id: 'ori_fist1', name: 'Ember Fist I', jp: '紅蓮拳 壱', level: 'SP', pose: 'strong',
      input: { motion: '236', button: 'P' },
      startup: 11, active: 5, recovery: 20,
      motion: { type: 'lunge', speed: 0.12, frames: 10, start: 9 },
      hits: [hit({ from: 0, to: 5, box: box(1.0, 1.35, 1.3, 0.55), damage: 56, level: 'SP', dot: { damage: 5, frames: 90, interval: 12 } })],
      chain: { to: 'ori_fist2', window: [12, 40], button: 'P' },
      cancelWindow: 8, meterGain: 24, whiffMeter: 24, fxColor: '#ff5722'
    }),
    M({
      id: 'ori_fist2', name: 'Ember Fist II', jp: '紅蓮拳 弐', level: 'SP', pose: 'strong',
      input: { rekka: true }, hidden: true,
      startup: 8, active: 5, recovery: 20,
      motion: { type: 'lunge', speed: 0.13, frames: 10, start: 6 },
      hits: [hit({ from: 0, to: 5, box: box(1.0, 1.2, 1.3, 0.6), damage: 54, level: 'SP', dot: { damage: 5, frames: 90, interval: 12 } })],
      chain: { to: 'ori_fist3', window: [10, 38], button: 'P' },
      cancelWindow: 8, meterGain: 20, fxColor: '#ff5722'
    }),
    M({
      id: 'ori_fist3', name: 'Ember Fist III', jp: '紅蓮拳 参', level: 'SP', pose: 'kickH',
      input: { rekka: true }, hidden: true,
      startup: 10, active: 6, recovery: 28,
      motion: { type: 'lunge', speed: 0.16, frames: 12, start: 8 },
      hits: [hit({
        from: 0, to: 6, box: box(1.05, 1.3, 1.4, 0.7), damage: 74, level: 'SP',
        launch: { x: 0.07, y: 0.24 }, juggle: 2, dot: { damage: 7, frames: 120, interval: 12 }
      })],
      cancelWindow: 10, meterGain: 20, fxColor: '#ff5722'
    }),
    M({
      id: 'ori_cinder', name: 'Rising Cinder', jp: '昇る残火', level: 'SP', pose: 'uppercut',
      input: { motion: '623', button: 'P' },
      startup: 4, active: 15, recovery: 34, invuln: [0, 8],
      motion: { type: 'rise', vy: 0.245, vx: 0.04, frames: 20 },
      hits: [
        hit({ from: 0, to: 7, box: box(0.5, 1.8, 1.0, 2.0), damage: 60, level: 'H', launch: { x: 0.03, y: 0.27 }, juggle: 2, dot: { damage: 5, frames: 90, interval: 12 } }),
        hit({ from: 8, to: 15, box: box(0.5, 2.1, 1.0, 2.0), damage: 42, level: 'H', juggle: 2 })
      ],
      cancel: false, meterGain: 30, whiffMeter: 30, fxColor: '#ff5722', tags: ['reversal']
    }),
    M({
      id: 'ori_spiral1', name: 'Blaze Spiral I', jp: '炎渦 壱', level: 'SP', pose: 'spin',
      input: { motion: '214', button: 'P' },
      startup: 12, active: 8, recovery: 18,
      motion: { type: 'lunge', speed: 0.1, frames: 10, start: 10 },
      hits: [hit({ from: 0, to: 8, box: box(0.9, 1.1, 1.35, 0.9), damage: 50, level: 'M', dot: { damage: 4, frames: 70, interval: 14 } })],
      chain: { to: 'ori_spiral2', window: [12, 40], button: 'P' },
      cancelWindow: 8, meterGain: 22, whiffMeter: 22, fxColor: '#ff5722'
    }),
    M({
      id: 'ori_spiral2', name: 'Blaze Spiral II', jp: '炎渦 弐', level: 'SP', pose: 'spinkick',
      input: { rekka: true }, hidden: true,
      startup: 9, active: 10, recovery: 26,
      hits: [hit({
        from: 0, to: 10, box: box(0.9, 1.4, 1.4, 1.0), damage: 66, level: 'SP',
        launch: { x: 0.06, y: 0.25 }, juggle: 2, dot: { damage: 6, frames: 100, interval: 12 }
      })],
      cancelWindow: 10, meterGain: 20, fxColor: '#ff5722'
    })
  ],
  supers: [
    M({
      id: 'ori_super', name: 'Inferno Requiem', jp: '煉獄鎮魂歌', level: 'SU', pose: 'storm',
      input: { motion: '2141236', button: 'P' },
      super: { flash: 44, cinematic: true, cost: 1 },
      startup: 8, active: 66, recovery: 30,
      motion: { type: 'lunge', speed: 0.2, frames: 18, start: 6 },
      invuln: [0, 10],
      hits: [
        hit({ from: 5, to: 9, box: box(0.95, 1.3, 1.3, 0.7), damage: 38, level: 'H' }),
        hit({ from: 13, to: 17, box: box(0.95, 1.3, 1.3, 0.7), damage: 36, level: 'H' }),
        hit({ from: 21, to: 25, box: box(0.95, 1.3, 1.3, 0.7), damage: 36, level: 'H' }),
        hit({ from: 29, to: 33, box: box(0.95, 1.3, 1.3, 0.7), damage: 36, level: 'H' }),
        hit({ from: 37, to: 41, box: box(0.95, 1.3, 1.3, 0.7), damage: 36, level: 'H' }),
        hit({
          from: 52, to: 66, box: box(0.6, 1.2, 1.6, 2.0), damage: 88, level: 'SU',
          launch: { x: 0.1, y: 0.3 }, juggle: 3, knockdown: true, dot: { damage: 9, frames: 150, interval: 12 }
        })
      ],
      cancel: false, meter: { cost: 1 }, fxColor: '#ff5722'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 8. SERA LUMEN — psíquica con reflector                              */
/* ------------------------------------------------------------------ */
const SERA = {
  id: 'sera',
  name: 'SERA LUMEN',
  title: 'La Luz que Juzga',
  style: 'Psicokinesis Aplicada',
  country: 'Grecia',
  archetype: 'Zoner / Reflector',
  bio: 'Vio el futuro una vez y decidió que no le gustaba. Ahora lo reescribe a golpes.',
  winQuote: 'La luz siempre encuentra la grieta.',
  colors: {
    gi: '#e1f5fe', trim: '#0288d1', skin: '#f2cdb0', hair: '#7e57c2',
    belt: '#4fc3f7', accent: '#00e5ff', aura: '#80deea', glove: '#ffffff', boot: '#b39ddb'
  },
  body: { height: 0.92, bulk: 0.76, armLen: 0.94, legLen: 1.06, head: 0.94, hair: 'long', female: true, top: 'tank', sweepStyle: 'sweep', chargeStyle: { pName: 'Vals de Hielo', kName: 'Aurora', pSpeed: 0.22, kSpeed: 0.24, pDmg: 66 } },
  stats: { health: 880, walk: 0.058, back: 0.052, power: 0.92, speed: 1.04, reach: 0.96, defense: 0.92, jump: 1.08, weight: 0.88 },
  fx: '#80deea',
  specials: [
    M({
      id: 'sera_ball', name: 'Psycho Ball', jp: 'サイコボール', level: 'SP', kind: 'projectile', pose: 'cast',
      input: { motion: '236', button: 'P' },
      startup: 16, active: 3, recovery: 32,
      projectile: {
        frame: 17, y: 1.3, speed: 0.105, box: { w: 1.0, h: 1.0 },
        damage: 82, level: 'SP', life: 230, color: '#80deea', sound: 'psycho', fx: 'orb',
        homing: 0.0016, byButton: { HP: { speed: 0.15, damage: 92 } }
      },
      meterGain: 26, whiffMeter: 26, fxColor: '#80deea'
    }),
    M({
      id: 'sera_sword', name: 'Psycho Sword', jp: 'サイコソード', level: 'SP', pose: 'uppercut',
      input: { motion: '623', button: 'K' },
      startup: 5, active: 16, recovery: 32, invuln: [0, 9],
      motion: { type: 'rise', vy: 0.22, vx: 0.04, frames: 19 },
      hits: [
        hit({ from: 0, to: 8, box: box(0.5, 1.7, 1.0, 2.2), damage: 62, level: 'H', launch: { x: 0.03, y: 0.26 }, juggle: 2 }),
        hit({ from: 9, to: 16, box: box(0.5, 2.0, 1.0, 2.2), damage: 40, level: 'H', juggle: 2 })
      ],
      cancel: false, meterGain: 30, whiffMeter: 30, fxColor: '#80deea', tags: ['reversal']
    }),
    M({
      id: 'sera_prism', name: 'Prism Reflector', jp: 'プリズム反射', level: 'SP', kind: 'counter', pose: 'counter',
      input: { motion: '214', button: 'P' },
      startup: 6, active: 40, recovery: 20,
      counter: { from: 0, to: 40, reflect: true, damage: 70, level: 'SP', launch: { x: 0.06, y: 0.2 }, juggle: 2 },
      cancel: false, meterGain: 24, whiffMeter: 12, fxColor: '#80deea', tags: ['counter']
    }),
    M({
      id: 'sera_levitate', name: 'Levitate', jp: '浮遊', level: 'SP', kind: 'buff', pose: 'float',
      input: { motion: '22', button: 'K' },
      startup: 8, active: 2, recovery: 12,
      buff: { frames: 240, hover: true, airDash: true },
      cancel: false, meterGain: 12, whiffMeter: 12, fxColor: '#80deea'
    })
  ],
  supers: [
    M({
      id: 'sera_super', name: 'Shining Psychic Burst', jp: 'シャイニングバースト', level: 'SU', kind: 'projectile', pose: 'beam',
      input: { motion: '2363214', button: 'P' },
      super: { flash: 46, cinematic: true, cost: 1 },
      startup: 20, active: 60, recovery: 34,
      projectile: {
        frame: 20, y: 1.25, speed: 0.34, box: { w: 3.0, h: 1.5 },
        damage: 34, level: 'SU', life: 90, color: '#e0f7fa', sound: 'beam', fx: 'beam',
        hits: 8, interval: 7, super: true
      },
      cancel: false, meter: { cost: 1 }, fxColor: '#e0f7fa'
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 9. GORAN MILOV — terremoto y armor                                  */
/* ------------------------------------------------------------------ */
const GORAN = {
  id: 'goran',
  name: 'GORAN MILOV',
  title: 'El Quebrantatierras',
  style: 'Pankration Pesado',
  country: 'Serbia',
  archetype: 'Peso pesado / Quake',
  bio: 'Dicen que causó un seísmo al aterrizar. Él dice que solo fue un paso.',
  winQuote: 'El suelo también te ha golpeado.',
  colors: {
    gi: '#795548', trim: '#558b2f', skin: '#dba87e', hair: '#4e342e',
    belt: '#33691e', accent: '#aed581', aura: '#a1887f', glove: '#6d4c41', boot: '#3e2723'
  },
  body: { height: 1.2, bulk: 1.5, armLen: 1.1, legLen: 0.88, head: 1.06, hair: 'bald', beard: true, top: 'bare', sweepStyle: 'both', chargeStyle: { pName: 'Seismo', kName: 'Avalancha', pStartup: 15, kStartup: 17, pSpeed: 0.16, kSpeed: 0.18, pDmg: 96, kDmg: 106 } },
  stats: { health: 1240, walk: 0.042, back: 0.036, power: 1.32, speed: 0.76, reach: 1.05, defense: 1.3, jump: 0.76, weight: 1.4 },
  fx: '#a1887f',
  throwRange: 1.6, throwDamage: 135,
  specials: [
    M({
      id: 'gor_quake', name: 'Tectonic Stomp', jp: '地殻踏み', level: 'SP', pose: 'stomp',
      input: { motion: '28', button: 'K' },
      startup: 16, active: 8, recovery: 34,
      hits: [hit({ from: 0, to: 8, box: box(0.1, 0.28, 5.2, 0.55), damage: 92, level: 'H', knockdown: true, low: true, juggle: 1 })],
      cancel: false, meterGain: 30, whiffMeter: 30, fxColor: '#a1887f', tags: ['ground']
    }),
    M({
      id: 'gor_shoulder', name: 'Boulder Rush', jp: '巨岩突進', level: 'SP', pose: 'rush',
      input: { motion: '63214', button: 'P' },
      startup: 13, active: 14, recovery: 30,
      motion: { type: 'lunge', speed: 0.2, frames: 16, start: 11 },
      armor: { from: 10, to: 26, hits: 2 },
      hits: [hit({
        from: 0, to: 14, box: box(0.9, 1.3, 1.5, 0.8), damage: 104, level: 'H',
        launch: { x: 0.1, y: 0.22 }, juggle: 2, wallbounce: true
      })],
      cancel: false, meterGain: 32, whiffMeter: 32, fxColor: '#a1887f'
    }),
    M({
      id: 'gor_hammer', name: 'Anvil Hammer', jp: '金床槌', level: 'SP', pose: 'overhead',
      input: { motion: '214', button: 'P' },
      startup: 20, active: 6, recovery: 30,
      hits: [hit({
        from: 0, to: 6, box: box(0.85, 1.1, 1.4, 1.2), damage: 116, level: 'H', overhead: true,
        knockdown: true, crumple: true
      })],
      cancel: false, meterGain: 28, whiffMeter: 28, fxColor: '#a1887f'
    })
  ],
  supers: [
    M({
      id: 'gor_super', name: 'Continental Split', jp: '大陸断裂', level: 'SU', pose: 'stomp',
      input: { motion: '6321463214', button: 'P' },
      super: { flash: 46, cinematic: true, cost: 1 },
      startup: 14, active: 20, recovery: 40, invuln: [0, 14],
      hits: [hit({
        from: 0, to: 20, box: box(0.1, 0.4, 12.0, 1.4), damage: 340, level: 'SU',
        knockdown: true, unblockable: false, juggle: 3
      })],
      cancel: false, meter: { cost: 1 }, fxColor: '#a1887f', tags: ['ground']
    })
  ]
};

/* ------------------------------------------------------------------ */
/* 10. VESPER LYNX — eléctrica, dive kick                              */
/* ------------------------------------------------------------------ */
const VESPER = {
  id: 'vesper',
  name: 'VESPER LYNX',
  title: 'El Relámpago Azul',
  style: 'Kickboxing Voltaico',
  country: 'Canadá',
  archetype: 'Rushdown aéreo / Eléctrica',
  bio: 'Campeona de kickboxing y pararrayos humano. Nunca usa protección.',
  winQuote: '¡Demasiado lento! ¡Zap!',
  colors: {
    gi: '#1a237e', trim: '#ffee58', skin: '#f0c9a8', hair: '#ffee58',
    belt: '#fdd835', accent: '#ffff00', aura: '#40c4ff', glove: '#283593', boot: '#fdd835'
  },
  body: { height: 0.98, bulk: 0.88, armLen: 1.0, legLen: 1.1, head: 0.96, hair: 'spiky', visor: true, female: true, top: 'tank', bottom: 'shorts', sweepStyle: 'slide', chargeStyle: { pName: 'Sprint Volt', kName: 'Patada Tesla', pStartup: 8, kStartup: 10, pSpeed: 0.3, pDmg: 60, kDmg: 70 } },
  stats: { health: 940, walk: 0.08, back: 0.066, power: 0.98, speed: 1.14, reach: 1.0, defense: 0.94, jump: 1.14, weight: 0.92 },
  fx: '#40c4ff',
  specials: [
    M({
      id: 'ves_bolt', name: 'Volt Bolt', jp: '電光弾', level: 'SP', kind: 'projectile', pose: 'cast',
      input: { motion: '236', button: 'P' },
      startup: 13, active: 3, recovery: 30,
      projectile: {
        frame: 14, y: 1.3, speed: 0.22, box: { w: 0.85, h: 0.6 },
        damage: 66, level: 'SP', life: 170, color: '#40c4ff', sound: 'zap', fx: 'bolt',
        byButton: { HP: { speed: 0.3, damage: 74 } }
      },
      meterGain: 24, whiffMeter: 24, fxColor: '#40c4ff'
    }),
    M({
      id: 'ves_dive', name: 'Thunder Dive', jp: '雷撃降下', level: 'SP', pose: 'divekick', air: true,
      input: { motion: '236', button: 'K', air: true },
      startup: 6, active: 34, recovery: 10,
      motion: { type: 'dive', vx: 0.13, vy: -0.13 },
      hits: [hit({ from: 0, to: 34, box: box(0.55, 0.5, 1.0, 0.9), damage: 78, level: 'M', juggle: 2 })],
      cancel: false, meterGain: 28, whiffMeter: 28, fxColor: '#40c4ff'
    }),
    M({
      id: 'ves_field', name: 'Static Field', jp: '静電場', level: 'SP', kind: 'buff', pose: 'aura',
      input: { motion: '214', button: 'P' },
      startup: 12, active: 4, recovery: 20,
      buff: { frames: 480, damageMul: 1.15, speedMul: 1.12, aura: true },
      hits: [hit({ from: 0, to: 4, box: box(0.1, 1.1, 2.2, 1.9), damage: 40, level: 'M', launch: { x: 0.05, y: 0.18 }, juggle: 1 })],
      cancel: false, meterGain: 16, whiffMeter: 16, fxColor: '#40c4ff'
    })
  ],
  supers: [
    M({
      id: 'ves_super', name: 'Plasma Storm', jp: 'プラズマストーム', level: 'SU', pose: 'storm',
      input: { motion: '2141236', button: 'K' },
      super: { flash: 42, cinematic: true, cost: 1 },
      startup: 10, active: 70, recovery: 28,
      motion: { type: 'lunge', speed: 0.21, frames: 20, start: 8 },
      invuln: [0, 8],
      hits: [
        hit({ from: 4, to: 8, box: box(0.9, 1.3, 1.3, 0.8), damage: 34, level: 'H' }),
        hit({ from: 12, to: 16, box: box(0.9, 1.3, 1.3, 0.8), damage: 32, level: 'H' }),
        hit({ from: 20, to: 24, box: box(0.9, 1.3, 1.3, 0.8), damage: 32, level: 'H' }),
        hit({ from: 28, to: 32, box: box(0.9, 1.3, 1.3, 0.8), damage: 32, level: 'H' }),
        hit({ from: 36, to: 40, box: box(0.9, 1.3, 1.3, 0.8), damage: 32, level: 'H' }),
        hit({ from: 44, to: 48, box: box(0.9, 1.3, 1.3, 0.8), damage: 32, level: 'H' }),
        hit({ from: 56, to: 70, box: box(0.5, 1.6, 1.6, 2.2), damage: 96, level: 'SU', launch: { x: 0.08, y: 0.3 }, juggle: 3, knockdown: true })
      ],
      cancel: false, meter: { cost: 1 }, fxColor: '#40c4ff'
    })
  ]
};

/* ------------------------------------------------------------------ */

export const ROSTER_DEFS = [KENJI, VALERIA, BRUTUS, KAGEROU, MAGNUS, REX, ORION, SERA, GORAN, VESPER];

/** Construye el roster completo con su lista de golpes ya compilada. */
export function buildRoster(defs = ROSTER_DEFS) {
  return defs.map((def) => {
    const normals = buildNormals(def);
    const specials = (def.specials || []).map((m) => ({ ...m, category: 'special' }));
    const supers = (def.supers || []).map((m) => ({ ...m, category: 'super' }));
    const moves = [...normals, ...specials, ...supers];
    for (const m of moves) {
      if (m.category === undefined) m.category = m.tags && m.tags.includes('throw') ? 'throw' : 'normal';
    }
    return {
      ...def,
      moves,
      normals,
      specials,
      supers,
      moveById: Object.fromEntries(moves.map((m) => [m.id, m])),
      health: def.stats.health
    };
  });
}

export const ROSTER = buildRoster();

export const getFighter = (id) => ROSTER.find((f) => f.id === id);

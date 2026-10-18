/* Ficha de Voltia. El motor no conoce estos nombres: lee normales, comandos y golpes.
   Otro personaje es otro archivo que se registra en window.ROSTER.
   Los tiempos de golpe van en fotogramas de 60 Hz; el motor los pasa a segundos. */
(function () {
  window.ROSTER = window.ROSTER || {};
  window.ROSTER.voltia = {
    id: 'voltia',
    name: 'VOLTIA',
    sheet: '../voltia/sheet.json',
    scale: 0.5,
    pivot: [175, 324],
    maxHp: 700,
    physics: {
      walkF: 2.85,
      walkB: 2.15,
      dash: 6.2,
      jumpV: -9.3,
      jumpX: 2.3,
      gravity: 0.42,
      airAccel: 0.06,
      airMax: 3.1
    },
    hurt: {
      stand: { x: -22, y: -138, w: 46, h: 134 },
      crouch: { x: -26, y: -64, w: 52, h: 60 },
      air: { x: -20, y: -112, w: 42, h: 100 },
      down: { x: -44, y: -28, w: 88, h: 26 }
    },
    voiceDir: '../voltia/voices/',
    voices: {
      uppercut: 'voltia_uppercut',
      spinkick: 'voltia_spinkick',
      rayo: 'voltia_rayo_throw',
      rayoProj: 'voltia_rayo_proj',
      knockdown: 'voltia_knockdown',
      ko: 'voltia_ko',
      victory1: 'voltia_victory1',
      victory2: 'voltia_victory2',
      jump: 'grunt_jump'
    },
    normals: {
      stand: { lp: 'punch_weak', hp: 'punch_strong', lk: 'kick_weak_stand', hk: 'kick_strong' },
      crouch: { lp: 'crouch_punch', hp: 'crouch_punch', lk: 'kick_weak', hk: 'kick_weak' },
      air: { lp: 'jump_kick', hp: 'jump_kick', lk: 'jump_kick', hk: 'jump_kick' }
    },
    commands: [
      { type: 'motion', move: 'uppercut', btn: 'punch', window: 0.55, seq: [6, 2, 3], alt: [[6, 3]], release: [5, 6], releaseTime: 0.5, tapGap: 0.42 },
      { type: 'motion', move: 'spinkick', btn: 'kick', window: 0.55, seq: [2, 1, 4], alt: [[2, 4], [1, 4]], release: [5], releaseTime: 0.16 },
      { type: 'motion', move: 'rayo', btn: 'punch', window: 0.55, seq: [2, 3, 6], release: [5], releaseTime: 0.14 }
    ],
    moves: {
      punch_weak: {
        anim: 'punch_weak', ai: 'light',
        hits: [{ active: [1], damage: 28, stun: 12, block: 7, weight: 1, slide: 2.15, stop: 6, shake: 2.2, level: 'mid', box: { x: 16, y: -90, w: 38, h: 22 } }]
      },
      punch_strong: {
        anim: 'punch_strong', ai: 'heavy', zoom: 0.55,
        hits: [{ active: [2, 3], damage: 68, stun: 20, block: 11, weight: 3, slide: 4.6, stop: 12, shake: 6.2, level: 'mid', box: { x: 18, y: -92, w: 54, h: 26 } }]
      },
      kick_weak_stand: {
        anim: 'kick_weak_stand', ai: 'light',
        hits: [{ active: [1], damage: 36, stun: 14, block: 8, weight: 2, slide: 3.0, stop: 8, shake: 3.6, level: 'mid', box: { x: 18, y: -64, w: 52, h: 24 } }]
      },
      kick_weak: {
        anim: 'kick_weak', ai: 'low',
        hits: [{ active: [1], damage: 52, stun: 10, block: 10, weight: 3, slide: 3.4, stop: 10, shake: 5.2, level: 'low', knockdown: true, box: { x: 12, y: -30, w: 66, h: 22 } }]
      },
      kick_strong: {
        anim: 'kick_strong', ai: 'heavy', zoom: 0.7,
        hits: [{ active: [2, 3], damage: 82, stun: 22, block: 12, weight: 4, slide: 5.8, stop: 14, shake: 7.4, level: 'mid', box: { x: 20, y: -108, w: 68, h: 30 } }]
      },
      crouch_punch: {
        anim: 'crouch_punch', ai: 'low', pose: 'crouch',
        hits: [{ active: [1], damage: 24, stun: 13, block: 7, weight: 1, slide: 1.9, stop: 6, shake: 2, level: 'low', box: { x: 14, y: -42, w: 42, h: 18 } }]
      },
      jump_kick: {
        anim: 'jump_kick', ai: 'air',
        hits: [{ active: [1], damage: 58, stun: 16, block: 10, weight: 3, slide: 3.2, stop: 11, shake: 5.6, level: 'overhead', box: { x: 14, y: -58, w: 58, h: 26 } }]
      },
      uppercut: {
        anim: 'uppercut', ai: 'special', voice: 'uppercut', zoom: 1.35,
        hits: [
          { active: [1], damage: 34, stun: 16, block: 10, weight: 3, slide: 0.45, stop: 8, shake: 4, level: 'mid', box: { x: -2, y: -124, w: 54, h: 78 } },
          { active: [3], damage: 56, stun: 8, block: 12, weight: 5, slide: 2.4, stop: 14, shake: 8, level: 'mid', knockdown: true, requiresPrev: true, box: { x: -4, y: -136, w: 58, h: 86 } }
        ]
      },
      spinkick: {
        anim: 'spinkick', ai: 'special', voice: 'spinkick', zoom: 1.5,
        hits: [
          { active: [2], damage: 38, stun: 14, block: 12, weight: 3, slide: 0.5, stop: 8, shake: 4.5, level: 'mid', box: { x: 2, y: -100, w: 74, h: 46 } },
          { active: [4], damage: 64, stun: 8, block: 14, weight: 5, slide: 4.2, stop: 14, shake: 9, level: 'mid', knockdown: true, requiresPrev: true, box: { x: 0, y: -104, w: 82, h: 52 } }
        ]
      },
      rayo: {
        anim: 'rayo_throw', ai: 'projectile', voice: 'rayo', kind: 'projectile', limit: 1, spawn: 2,
        hits: [],
        projectile: {
          anim: 'rayo_proj',
          pivot: [174, 154],
          scale: 0.42,
          offset: { x: 48, y: -78 },
          speeds: { weak: 3.0, strong: 5.4 },
          range: 640,
          life: 120,
          voice: 'rayoProj',
          box: { x: -18, y: -12, w: 36, h: 22 },
          hit: { damage: 64, stun: 16, block: 10, weight: 4, slide: 4.4, stop: 12, shake: 6.4, level: 'mid', zoom: 0.8 }
        }
      }
    }
  };
})();

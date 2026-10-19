/* Ficha de Chun-Li. El motor no la conoce: lee esta ficha igual que la de Voltia.
   Arte: voltia/nuevo/chunli/game/sheet.png + sheet.json, sacados de las 24 filas
   de su hoja (rows/) sin repintar nada.

   Altura: medida, no supuesta. Voltia mide 294 px de tinta en su hoja x 0.5 de
   scale = 147 px de mundo. Chun-Li mide 60 px de tinta de stance (sin la sombra
   del suelo) y va horneada a 2.45x = 147 px de mundo. Misma altura que Voltia.

   Los frames activos y los alcances de las cajas salen de medirlos en la hoja
   (tools/chunli_hitboxes.py y rows.json), no de copiarlos de Voltia.
   Los daños y la velocidad de los golpes son decision de juego. */
(function () {
  window.ROSTER = window.ROSTER || {};
  window.ROSTER.chunli = {
    id: 'chunli',
    name: 'CHUN-LI',
    sheet: '../voltia/nuevo/chunli/game/sheet.json',
    scale: 1,
    pivot: [141, 196],
    maxHp: 680,
    physics: {
      walkF: 3.3,
      walkB: 2.5,
      dash: 6.6,
      run: 5.4,
      jumpV: -9.4,
      jumpX: 2.4,
      gravity: 0.42,
      airAccel: 0.06,
      airMax: 3.2,
      backHopV: -5.2,
      backHopX: 3.3
    },
    hurt: {
      // medido sobre la hoja ya horneada: stance 152 px de alto, crouch 113,
      // block 164, derribo 147 (tumbada). La caja es el torso, no el dibujo entero.
      stand: { x: -20, y: -138, w: 40, h: 136 },
      crouch: { x: -22, y: -108, w: 44, h: 104 },
      air: { x: -18, y: -120, w: 36, h: 112 },
      down: { x: -44, y: -30, w: 88, h: 28 }
    },
    normals: {
      stand: { lp: 'punch_weak', hp: 'punch_strong', lk: 'kick_weak', hk: 'kick_strong' },
      crouch: { lp: 'crouch_punch_weak', hp: 'crouch_punch_strong', lk: 'crouch_kick_weak', hk: 'crouch_kick_strong' },
      // la patada en el aire es SIEMPRE la fila 17 (salto + patada). La fila 15
      // no es un salto: empieza y acaba de pie, es el comando de abajo.
      air: { lp: 'jump_punch', hp: 'jump_punch', lk: 'jump_kick', hk: 'jump_kick' }
    },
    commands: [
      // patada giratoria: ↓ ↙ ← + patada
      { type: 'motion', move: 'special_dd_k', btn: 'kick', window: 0.6, seq: [2, 1, 4], alt: [[2, 4], [1, 4]], release: [5], releaseTime: 0.18 },
      // speed kick: ↓ ↘ → + patada
      { type: 'motion', move: 'speed_kick', btn: 'kick', window: 0.55, seq: [2, 3, 6], release: [5], releaseTime: 0.16 },
      // patada adelante-abajo (fila 15): se mantiene ↘ (abajo + adelante) y se
      // pulsa patada FUERTE. `need` obliga a que sea la fuerte.
      { type: 'motion', move: 'kick_fwd_down', btn: 'kick', need: 'hk', window: 0.4, seq: [3] },
      // kikoken: ↓ ↘ → + puño
      { type: 'motion', move: 'kikoken', btn: 'punch', window: 0.55, seq: [2, 3, 6], release: [5], releaseTime: 0.14 }
    ],
    moves: {
      // activos: frames donde la medicion ve el brazo/pierna extendidos
      punch_weak: {
        anim: 'punch_weak', ai: 'light',
        hits: [
          { active: [1], damage: 18, stun: 11, block: 6, weight: 1, slide: 1.9, stop: 5, shake: 2, level: 'mid', box: { x: 22, y: -110, w: 54, h: 26 } },
          { active: [3], damage: 18, stun: 12, block: 6, weight: 1, slide: 2.2, stop: 6, shake: 2.2, level: 'mid', requiresPrev: true, box: { x: 22, y: -112, w: 54, h: 26 } }
        ]
      },
      punch_strong: {
        anim: 'punch_strong', ai: 'heavy', zoom: 0.55,
        hits: [{ active: [2], damage: 62, stun: 20, block: 11, weight: 3, slide: 4.6, stop: 12, shake: 6.2, level: 'mid', box: { x: 24, y: -104, w: 58, h: 28 } }]
      },
      kick_weak: {
        anim: 'kick_weak', ai: 'light',
        hits: [{ active: [2], damage: 34, stun: 14, block: 8, weight: 2, slide: 3.0, stop: 8, shake: 3.6, level: 'mid', box: { x: 20, y: -92, w: 50, h: 24 } }]
      },
      kick_strong: {
        anim: 'kick_strong', ai: 'heavy', zoom: 0.7,
        hits: [
          { active: [2], damage: 40, stun: 18, block: 11, weight: 3, slide: 3.2, stop: 10, shake: 5.4, level: 'mid', box: { x: 22, y: -118, w: 50, h: 26 } },
          { active: [4], damage: 46, stun: 10, block: 12, weight: 4, slide: 5.4, stop: 13, shake: 7.2, level: 'mid', requiresPrev: true, box: { x: 24, y: -96, w: 54, h: 28 } }
        ]
      },
      crouch_punch_weak: {
        anim: 'crouch_punch_weak', ai: 'low', pose: 'crouch',
        hits: [{ active: [2], damage: 22, stun: 13, block: 7, weight: 1, slide: 1.9, stop: 6, shake: 2, level: 'low', box: { x: 20, y: -74, w: 50, h: 22 } }]
      },
      crouch_punch_strong: {
        anim: 'crouch_punch_strong', ai: 'low', pose: 'crouch', zoom: 0.5,
        hits: [{ active: [5], damage: 54, stun: 18, block: 11, weight: 3, slide: 4.2, stop: 11, shake: 5.6, level: 'low', box: { x: 26, y: -76, w: 64, h: 24 } }]
      },
      crouch_kick_weak: {
        anim: 'crouch_kick_weak', ai: 'low', pose: 'crouch',
        hits: [{ active: [1], damage: 26, stun: 12, block: 8, weight: 2, slide: 2.6, stop: 7, shake: 3, level: 'low', box: { x: 26, y: -40, w: 48, h: 20 } }]
      },
      crouch_kick_strong: {
        anim: 'crouch_kick_strong', ai: 'low', pose: 'crouch', zoom: 0.6,
        hits: [{ active: [2], damage: 52, stun: 10, block: 11, weight: 3, slide: 3.4, stop: 11, shake: 5.4, level: 'low', knockdown: true, box: { x: 28, y: -44, w: 56, h: 22 } }]
      },
      jump_punch: {
        // start 2: se salta el frameo de subida de la hoja y pega a los 0,19 s
        anim: 'jump_punch', ai: 'air', start: 2,
        hits: [{ active: [5], damage: 46, stun: 15, block: 9, weight: 2, slide: 3.0, stop: 9, shake: 4.4, level: 'overhead', box: { x: 14, y: -92, w: 40, h: 30 } }]
      },
      jump_kick: {
        anim: 'jump_kick', ai: 'air', start: 3,
        hits: [{ active: [6], damage: 58, stun: 16, block: 10, weight: 3, slide: 3.2, stop: 11, shake: 5.6, level: 'overhead', box: { x: 18, y: -80, w: 48, h: 28 } }]
      },
      kick_fwd_down: {
        // fila 15: patada adelante-abajo y voltereta atras. Es de suelo, no de
        // salto. start 3 se come el paso de entrada para que entre rapido.
        anim: 'kick_fwd_down', ai: 'heavy', start: 3, zoom: 0.6,
        hits: [{ active: [7, 8, 9], damage: 74, stun: 12, block: 12, weight: 4, slide: 4.8, stop: 13, shake: 7, level: 'mid', knockdown: true, box: { x: 18, y: -60, w: 54, h: 38 } }]
      },
      special_dd_k: {
        anim: 'special_dd_k', ai: 'special', zoom: 1.2,
        hits: [
          { active: [4], damage: 34, stun: 15, block: 10, weight: 3, slide: 0.5, stop: 8, shake: 4, level: 'mid', box: { x: 12, y: -104, w: 46, h: 34 } },
          { active: [6], damage: 56, stun: 8, block: 12, weight: 5, slide: 2.6, stop: 14, shake: 8, level: 'mid', knockdown: true, requiresPrev: true, box: { x: 14, y: -100, w: 52, h: 38 } }
        ]
      },
      speed_kick: {
        anim: 'speed_kick', ai: 'special', zoom: 0.9,
        hits: [{ active: [4], damage: 54, stun: 14, block: 12, weight: 4, slide: 4.2, stop: 12, shake: 6.2, level: 'mid', box: { x: 30, y: -96, w: 66, h: 30 } }]
      },
      kikoken: {
        anim: 'rayo_throw', ai: 'projectile', kind: 'projectile', limit: 1, spawn: 1,
        hits: [],
        projectile: {
          anim: 'rayo_proj',
          // el mismo pivote (pies) que la celda de la hoja: la chispa queda a la
          // altura del pecho con offset.y = -84
          pivot: [141, 196],
          scale: 1,
          offset: { x: 46, y: -84 },
          speeds: { weak: 2.6, strong: 4.9 },
          range: 380,
          life: 110,
          box: { x: -30, y: -16, w: 60, h: 34 },
          hit: { damage: 56, stun: 16, block: 10, weight: 4, slide: 4.2, stop: 12, shake: 6.2, level: 'mid', zoom: 0.7 }
        }
      }
    }
  };
})();

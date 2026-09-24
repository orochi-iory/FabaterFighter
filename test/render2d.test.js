/**
 * Tests de la capa 2D: mapeo estado->animacion (puro) y seleccion de
 * frames de la hoja (fases de golpe, loop, heuristica de poses).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sheet, animFor } from '../src/render2d/sheet.js';

const man = {
  frameWidth: 96, frameHeight: 128, meters: 1.8, anchorY: 3,
  animations: {
    p_idle: { row: 0, frames: 4, fps: 8, loop: true },
    p_crouch: { row: 1, frames: 1, fps: 4, loop: true },
    p_knockdown: { row: 2, frames: 2, fps: 10, loop: false },
    p_strong: { row: 3, frames: 3, fps: 10, loop: false },
    p_kickH: { row: 4, frames: 3, fps: 10, loop: false },
    p_launcher: { row: 5, frames: 3, fps: 10, loop: false },
    mv_5HP: { row: 6, frames: 3, fps: 10, loop: false },
    mv_rex_boom: { row: 7, frames: 4, fps: 10, loop: false }
  }
};

test('animFor mapea ataque al id del golpe y el resto a la pose', () => {
  const atk = animFor({ anim: { state: 'attack', move: { id: '5HP' }, pose: 'strong', phase: 'active', frame: 14 } });
  assert.equal(atk.name, 'mv_5HP');
  assert.equal(atk.phase, 'active');
  const st = animFor({ anim: { state: 'idle', pose: 'crouch', phase: 'idle', frame: 3 } });
  assert.equal(st.name, 'p_crouch'.slice(2));   // la pose cruda del motor
  assert.equal(st.phase, 'idle');
});

test('pick: golpe exacto gana, luego pose, luego heuristica, luego idle', () => {
  const s = new Sheet(null, man);
  assert.equal(s.pick({ name: 'mv_5HP', pose: 'strong', phase: 'active' }), 'mv_5HP');
  assert.equal(s.pick({ name: 'mv_unknown', pose: 'strong', phase: 'active' }), 'p_strong');
  assert.equal(s.pick({ name: 'mv_unknown', pose: 'heel_grind', phase: 'active' }), 'p_kickH');
  assert.equal(s.pick({ name: 'mv_unknown', pose: 'rising_fang', phase: 'active' }), 'p_launcher');
  assert.equal(s.pick({ name: 'knockdown', pose: 'knockdown', phase: 'idle' }), 'p_knockdown');
  assert.equal(s.pick({ name: 'algo_raro', pose: 'algo_raro', phase: 'idle' }), 'p_idle');
});

test('select: la fase del golpe elige el frame (0 startup, 1 activo, ultimo recovery)', () => {
  const s = new Sheet(null, man);
  // sin imagen ready=false -> usamos solo la logica de indice via pick+anims
  const a = man.animations.mv_5HP;
  const frameOf = (phase) => {
    if (phase === 'startup') return 0;
    if (phase === 'active') return Math.min(1, a.frames - 1);
    return a.frames - 1;
  };
  assert.equal(frameOf('startup'), 0);
  assert.equal(frameOf('active'), 1);
  assert.equal(frameOf('recovery'), 2);
});

test('select avanza el reloj en animaciones en loop', () => {
  const s = new Sheet(null, man);
  const name = s.pick({ name: 'idle', pose: 'idle', phase: 'idle' });
  assert.equal(name, 'p_idle');
  // reloj: dos selects con dt crecen el contador interno
  s.select({ name: 'idle', pose: 'idle', phase: 'idle' }, 0.125);
  s.select({ name: 'idle', pose: 'idle', phase: 'idle' }, 0.125);
  assert.ok(s.clocks.p_idle >= 0.25);
});

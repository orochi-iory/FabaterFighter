/**
 * Tests de la lógica de combate (sin DOM, sin WebGL).
 * Se ejecutan con: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROSTER, buildRoster } from '../src/data/roster.js';
import { Match } from '../src/game/match.js';
import { Fighter, applyHit, scaleFor, boxesOverlap } from '../src/game/fighter.js';
import { InputBuffer, motion, bitsToDir, toRelative, parseMotion } from '../src/game/input.js';
import { STATE, METER_PER_STOCK, MAX_STOCKS, MAX_GUARD, MAX_STUN, COMBO_SCALING } from '../src/game/constants.js';
import { AI, commandToSteps, commandFor } from '../src/game/ai.js';

const get = (id) => ROSTER.find((f) => f.id === id);

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */

test('el roster tiene al menos 8 luchadores y todos son distintos', () => {
  assert.ok(ROSTER.length >= 8, `roster = ${ROSTER.length}`);
  const ids = new Set(ROSTER.map((f) => f.id));
  assert.equal(ids.size, ROSTER.length, 'ids duplicados');
  const names = new Set(ROSTER.map((f) => f.name));
  assert.equal(names.size, ROSTER.length, 'nombres duplicados');
});

test('cada luchador tiene 2+ especiales y 1 super con frame data completo', () => {
  for (const f of ROSTER) {
    assert.ok(f.specials.length >= 2, `${f.id}: solo ${f.specials.length} especiales`);
    assert.ok(f.supers.length >= 1, `${f.id}: sin super`);
    for (const m of [...f.specials, ...f.supers]) {
      assert.ok(m.startup >= 1, `${f.id}/${m.id}: startup`);
      assert.ok(m.recovery >= 1, `${f.id}/${m.id}: recovery`);
      assert.ok(m.input.motion || m.input.rekka, `${f.id}/${m.id}: sin comando`);
      assert.equal(m.total, m.startup + m.active + m.recovery, `${f.id}/${m.id}: total`);
      const needsBoxes = !m.projectile && !m.teleport && !m.buff && m.kind !== 'grab' && m.kind !== 'counter';
      if (needsBoxes) assert.ok(m.hits.length >= 1, `${f.id}/${m.id}: sin hitbox`);
      for (const h of m.hits) assert.ok(h.box && h.box.w > 0 && h.box.h > 0, `${f.id}/${m.id}: caja inválida`);
    }
    for (const s of f.supers) {
      assert.ok(s.super && s.super.cost >= 1, `${f.id}/${s.id}: el super debe costar stock`);
      assert.ok(s.super.flash > 0, `${f.id}/${s.id}: sin super flash`);
    }
  }
});

test('cada luchador tiene normales, throw y estadísticas propias', () => {
  for (const f of ROSTER) {
    for (const id of ['5LP', '5HP', '5LK', '5HK', '2LP', '2HK', '2HP', 'jHP', 'throw']) {
      assert.ok(f.moveById[id], `${f.id}: falta ${id}`);
    }
    assert.ok(f.stats.walk > 0.03 && f.stats.walk < 0.12, `${f.id}: walk ${f.stats.walk}`);
    assert.ok(f.stats.health >= 800 && f.stats.health <= 1400, `${f.id}: health`);
  }
  // Debe haber variedad real entre luchadores.
  const walks = new Set(ROSTER.map((f) => f.stats.walk));
  const hps = new Set(ROSTER.map((f) => f.stats.health));
  assert.ok(walks.size >= 6, 'poca variedad de velocidad');
  assert.ok(hps.size >= 5, 'poca variedad de vida');
});

/* ------------------------------------------------------------------ */
/* Parser de inputs                                                    */
/* ------------------------------------------------------------------ */

test('bitsToDir / toRelative usan notación numpad', () => {
  assert.equal(bitsToDir(false, false, false, false), 5);
  assert.equal(bitsToDir(false, true, true, false), 3);
  assert.equal(bitsToDir(true, false, false, true), 7);
  assert.equal(toRelative(4, 1), 4);
  assert.equal(toRelative(4, -1), 6, 'mirando a la izquierda, "atrás absoluto" es adelante');
  assert.equal(toRelative(1, -1), 3);
});

test('el buffer detecta 236P (cuarto de círculo adelante)', () => {
  const b = new InputBuffer();
  let f = 0;
  b.push(f++, 2, {});
  b.push(f++, 3, {});
  b.push(f++, 6, {});
  assert.ok(b.match(motion('236'), f), '236 debería estar completo');
  assert.ok(!b.match(motion('623'), f), '623 no debería coincidir');
});

test('el buffer rechaza un comando demasiado antiguo', () => {
  const b = new InputBuffer();
  let f = 0;
  b.push(f++, 2, {}); b.push(f++, 3, {}); b.push(f++, 6, {});
  for (let i = 0; i < 60; i++) b.push(f++, 5, {});
  assert.ok(!b.match(motion('236'), f), 'comando caducado');
});

test('el buffer detecta cargas 4~6 (estilo Guile/KOF)', () => {
  const b = new InputBuffer();
  let f = 0;
  for (let i = 0; i < 60; i++) b.push(f++, 4, {});
  b.push(f++, 6, {});
  assert.ok(b.match(motion('4~6'), f), 'carga atrás->adelante');
  const b2 = new InputBuffer();
  f = 0;
  for (let i = 0; i < 10; i++) b2.push(f++, 4, {});
  b2.push(f++, 6, {});
  assert.ok(!b2.match(motion('4~6'), f), 'carga insuficiente (10f < 45f)');
});

test('parseMotion separa pasos y cargas', () => {
  assert.deepEqual(parseMotion('236').steps, [{ dir: 2 }, { dir: 3 }, { dir: 6 }]);
  const charge = parseMotion('2~8').steps;
  assert.equal(charge[0].charge, 2);
  assert.equal(charge[0].frames, 45);
  assert.equal(charge[1].dir, 8);
});

test('el doble tap se registra para el dash', () => {
  const b = new InputBuffer();
  let f = 0;
  b.push(f++, 5, {}); b.push(f++, 6, {}); b.push(f++, 5, {}); b.push(f++, 6, {});
  assert.ok(b.doubleTap(6, f), 'doble tap adelante');
  const b2 = new InputBuffer();
  f = 0;
  for (let i = 0; i < 30; i++) b2.push(f++, 6, {});
  assert.ok(!b2.doubleTap(6, f), 'mantener adelante no es doble tap');
});

/* ------------------------------------------------------------------ */
/* Helpers de test                                                     */
/* ------------------------------------------------------------------ */

function makeMatch(a = 'kenji', b = 'valeria', opts = {}) {
  const fa = new Fighter(get(a), 0, 1);
  const fb = new Fighter(get(b), 1, -1);
  const m = new Match(fa, fb, opts);
  m.phase = 'fight';   // salta la intro para los tests
  m.phaseTimer = 0;
  return { m, fa, fb };
}

/** Ejecuta una secuencia de entradas en P1 durante N frames. */
function run(m, fa, fb, seq1, frames, seq2) {
  for (let i = 0; i < frames; i++) {
    const i1 = typeof seq1 === 'function' ? seq1(i) : (seq1[i] || {});
    const i2 = typeof seq2 === 'function' ? seq2(i) : ((seq2 && seq2[i]) || {});
    m.step(i1, i2);
  }
}

const H = (right = false) => (right ? { right: true } : { left: true });

/* ------------------------------------------------------------------ */
/* Mecánicas                                                           */
/* ------------------------------------------------------------------ */

test('un 236P real saca el proyectil de Kenji', () => {
  const { m, fa } = makeMatch();
  run(m, fa, null, [
    { down: true }, { down: true, right: true }, { right: true }, { right: true, LP: true }
  ], 4);
  assert.equal(fa.state, STATE.ATTACK, 'debe estar atacando');
  assert.equal(fa.move.id, 'kenji_wave');
  run(m, fa, null, () => ({}), 20);
  assert.equal(m.projectiles.length, 1, 'debe haber un proyectil');
  assert.ok(m.projectiles[0].vx > 0);
});

test('un 623P saca el uppercut invulnerable', () => {
  const { m, fa } = makeMatch();
  run(m, fa, null, [
    { right: true }, { down: true, right: true }, { down: true }, { down: true, right: true, HP: true }
  ], 4);
  assert.equal(fa.state, STATE.ATTACK);
  assert.equal(fa.move.id, 'kenji_upper');
  run(m, fa, null, () => ({}), 2);
  assert.ok(fa.invuln > 0, 'el reversal da invulnerabilidad en el arranque');
});

test('el daño escala dentro de un combo', () => {
  assert.equal(scaleFor(0), 1);
  assert.ok(scaleFor(1) < scaleFor(0));
  assert.ok(scaleFor(9) >= 0.15, 'suelo de escalado');
  assert.equal(COMBO_SCALING.length, 10);
});

test('bloqueo alto: anula el daño de un golpe medio y da barra al defensor', () => {
  const { m, fa, fb } = makeMatch();
  fb.x = fa.x + 1.2;
  const meterBefore = fb.meter;
  const healthBefore = fb.health;
  fb.blocking = true;
  fb.blockType = 'high';
  const h = fa.moveById['5HP'].hits[0];
  const res = applyHit(fa, fb, h, fa.moveById['5HP'], m, { hitKey: 'k' });
  assert.equal(res.result, 'block');
  assert.equal(fb.health, healthBefore, 'un normal bloqueado no hace chip');
  assert.equal(fb.state, STATE.BLOCKSTUN);
  assert.ok(fb.meter > meterBefore, 'bloquear carga la barra de super');
});

test('el chip de un especial no puede matar, el de un super sí', () => {
  {
    const { m, fa, fb } = makeMatch();
    fb.health = 5;
    fb.blocking = true; fb.blockType = 'high';
    const mv = fa.moveById['kenji_wave'];
    applyHit(fa, fb, { box: { x: 1, y: 1, w: 1, h: 1 }, damage: 72, level: 'SP' }, mv, m, { hitKey: 'c' });
    assert.ok(fb.health > 0, 'el chip de especial no mata');
  }
  {
    const { m, fa, fb } = makeMatch();
    fb.health = 5;
    fb.blocking = true; fb.blockType = 'high';
    const mv = fa.def.supers[0];
    applyHit(fa, fb, { box: { x: 1, y: 1, w: 1, h: 1 }, damage: 200, level: 'SU' }, mv, m, { hitKey: 'c2' });
    assert.equal(fb.health, 0);
    assert.equal(fb.state, STATE.KO);
  }
});

test('un golpe bajo debe bloquearse agachado', () => {
  const { m, fa, fb } = makeMatch();
  const sweep = fa.moveById['2HK'].hits[0];
  assert.ok(sweep.low, 'el sweep es low');
  fb.blocking = true; fb.blockType = 'high';
  const h1 = fb.health;
  let res = applyHit(fa, fb, sweep, fa.moveById['2HK'], m, { hitKey: 's1' });
  assert.equal(res.result, 'hit', 'bloquear alto no para un low');
  assert.ok(fb.health < h1);

  const { m: m2, fa: fa2, fb: fb2 } = makeMatch();
  fb2.blocking = true; fb2.blockType = 'low'; fb2.crouching = true;
  res = applyHit(fa2, fb2, sweep, fa2.moveById['2HK'], m2, { hitKey: 's2' });
  assert.equal(res.result, 'block', 'agachado sí lo para');
});

test('un overhead (6HP) no se puede bloquear agachado', () => {
  const { m, fa, fb } = makeMatch();
  const oh = fa.moveById['6HP'].hits[0];
  assert.ok(oh.overhead);
  fb.blocking = true; fb.blockType = 'low'; fb.crouching = true;
  const res = applyHit(fa, fb, oh, fa.moveById['6HP'], m, { hitKey: 'o' });
  assert.equal(res.result, 'hit');
});

test('el PARRY (SF3) anula el daño, da ventaja y carga barra', () => {
  const { m, fa, fb } = makeMatch();
  fb.parryActive = 8;
  fb.parryDir = 'high';
  const healthBefore = fb.health;
  const meterBefore = fb.meter;
  const mv = fa.moveById['5HP'];
  const res = applyHit(fa, fb, mv.hits[0], mv, m, { hitKey: 'p' });
  assert.equal(res.result, 'parry');
  assert.equal(fb.health, healthBefore, 'el parry no recibe daño');
  assert.equal(fb.state, STATE.IDLE, 'el que para puede actuar ya');
  assert.ok(fb.meter > meterBefore, 'el parry da barra');
  assert.ok(m.hitstop >= 16, 'freeze de parry');
});

test('un parry bajo no para un golpe medio, y un parry alto no para un low', () => {
  const { m, fa, fb } = makeMatch();
  fb.parryActive = 8; fb.parryDir = 'low';
  const mv = fa.moveById['5HP'];
  const res = applyHit(fa, fb, mv.hits[0], mv, m, { hitKey: 'p2' });
  assert.equal(res.result, 'hit', 'parry bajo contra golpe medio = golpe');

  const { m: m2, fa: fa2, fb: fb2 } = makeMatch();
  fb2.parryActive = 8; fb2.parryDir = 'high';
  const sweep = fa2.moveById['2HK'];
  const res2 = applyHit(fa2, fb2, sweep.hits[0], sweep, m2, { hitKey: 'p3' });
  assert.equal(res2.result, 'hit', 'parry alto contra sweep = golpe');
});

test('la barra de super sube al hacer daño y al recibirlo, y forma stocks', () => {
  const { m, fa, fb } = makeMatch();
  const mv = fa.moveById['5HP'];
  for (let i = 0; i < 40; i++) {
    fb.state = STATE.IDLE; fb.hitstun = 0; fb.airborne = false;
    fb.invuln = 0; fb.blocking = false; fb.dead = false; fb.health = fb.maxHealth;
    applyHit(fa, fb, mv.hits[0], mv, m, { hitKey: 'loop' + i });
  }
  assert.ok(fa.stocks >= 1, `atacante stocks=${fa.stocks} meter=${fa.meter}`);
  assert.ok(fb.meter > 0 || fb.stocks > 0, 'el defensor también carga barra');
  assert.ok(fa.stocks <= MAX_STOCKS);
});

test('un super consume 1 stock y congela la pantalla', () => {
  const { m, fa } = makeMatch();
  fa.stocks = 1; fa.meter = 0;
  const superMove = fa.def.supers[0];
  const seq = [
    { down: true }, { down: true, right: true }, { right: true },
    { down: true }, { down: true, right: true }, { right: true }, { right: true, HP: true }
  ];
  run(m, fa, null, seq, 7);
  assert.equal(fa.state, STATE.ATTACK, `estado=${fa.state}`);
  assert.equal(fa.move.id, superMove.id);
  assert.equal(fa.stocks, 0, 'el super gasta el stock');
  assert.ok(m.hitstop >= superMove.super.flash, 'super flash');
  assert.ok(fa.superFlashLock > 0);
});

test('sin stock no sale el super', () => {
  const { m, fa } = makeMatch();
  fa.stocks = 0;
  const seq = [
    { down: true }, { down: true, right: true }, { right: true },
    { down: true }, { down: true, right: true }, { right: true }, { right: true, HP: true }
  ];
  run(m, fa, null, seq, 7);
  assert.notEqual(fa.move && fa.move.id, 'kenji_super');
});

test('el modo MAX (KOF98) gasta 1 stock y sube el daño un 25%', () => {
  const { m, fa, fb } = makeMatch();
  fa.stocks = 2;
  run(m, fa, null, [{ MAX: true }], 1);
  assert.equal(fa.maxMode, 1200, 'MAX activo');
  assert.equal(fa.stocks, 1);
  assert.ok(Math.abs(fa.damageMul - 1.25) < 1e-9);

  const mv = fa.moveById['5HP'];
  fb.state = STATE.IDLE;
  const hp0 = fb.health;
  applyHit(fa, fb, mv.hits[0], mv, m, { hitKey: 'max1' });
  const withMax = hp0 - fb.health;

  const { m: m2, fa: fa2, fb: fb2 } = makeMatch();
  applyHit(fa2, fb2, mv.hits[0], mv, m2, { hitKey: 'nomax' });
  const withoutMax = fb2.maxHealth - fb2.health;
  assert.ok(withMax > withoutMax, `MAX ${withMax} vs normal ${withoutMax}`);
});

test('el guard crush salta al bloquear demasiado', () => {
  const { m, fa, fb } = makeMatch();
  const mv = fa.moveById['5HP'];
  fb.blocking = true; fb.blockType = 'high';
  let broken = false;
  for (let i = 0; i < 40; i++) {
    fb.state = STATE.BLOCKSTUN; fb.health = fb.maxHealth;
    applyHit(fa, fb, mv.hits[0], mv, m, { hitKey: 'g' + i });
    if (fb.state === STATE.GUARDCRUSH) { broken = true; break; }
  }
  assert.ok(broken, 'guard crush no activado');
  assert.equal(fb.guard, MAX_GUARD);
});

test('la barra de stun provoca dizzy', () => {
  const { m, fa, fb } = makeMatch();
  const mv = fa.moveById['5HP'];
  let dizzy = false;
  for (let i = 0; i < 30; i++) {
    fb.state = STATE.IDLE; fb.hitstun = 0; fb.airborne = false; fb.invuln = 0;
    fb.blocking = false; fb.health = fb.maxHealth;
    applyHit(fa, fb, mv.hits[0], mv, m, { hitKey: 'st' + i });
    if (fb.state === STATE.DIZZY) { dizzy = true; break; }
  }
  assert.ok(dizzy, 'dizzy no activado');
  assert.ok(fb.stun >= MAX_STUN);
});

test('el throw conecta de cerca, hace daño y se puede techear', () => {
  // Sin tech: el throw hace daño.
  {
    const { m, fa, fb } = makeMatch();
    fb.x = fa.x + 1.0;
    m.step({ LP: true, LK: true }, {});
    assert.equal(fa.state, STATE.THROW);
    assert.equal(fb.state, STATE.THROWN);
    const h0 = fb.health;
    for (let i = 0; i < 12; i++) m.step({}, {});
    assert.ok(fb.health < h0, 'el throw debe hacer daño si no se techa');
    assert.ok(fb.airborne || fb.state === STATE.AIRHIT || fb.state === STATE.KNOCKDOWN);
  }
  // Con tech: sin daño y separación.
  {
    const { m, fa, fb } = makeMatch();
    fb.x = fa.x + 1.0;
    const h0 = fb.health;
    m.step({ LP: true, LK: true }, {});
    assert.equal(fb.state, STATE.THROWN);
    m.step({}, {});
    m.step({}, { HP: true });           // el defensor pulsa dentro de la ventana
    assert.equal(fb.state, STATE.IDLE, 'tech conseguido');
    assert.equal(fb.health, h0, 'el tech no recibe daño');
    assert.ok(Math.abs(fb.x - fa.x) > 1.2, 'el tech separa');
    assert.equal(fa.state, STATE.IDLE);
  }
  // De lejos no agarra.
  {
    const { m, fa, fb } = makeMatch();
    fb.x = fa.x + 3.5;
    m.step({ LP: true, LK: true }, {});
    assert.notEqual(fa.state, STATE.THROW, 'fuera de rango no hay throw');
  }
});

test('el command grab de Brutus no se puede bloquear', () => {
  const { m, fa, fb } = makeMatch('brutus', 'kenji');
  const grab = fa.def.specials.find((s) => s.kind === 'grab');
  assert.ok(grab, 'Brutus necesita un command grab');
  fb.x = fa.x + 1.4;
  fb.blocking = true; fb.blockType = 'high';
  const h0 = fb.health;
  run(m, fa, null, commandToSteps(commandFor(grab, 'HP'), { holdEach: 2, charge: 50 }).map((s) => stepToInput(s, true)), 30);
  assert.ok(fb.health < h0, 'el command grab hace daño a través del bloqueo');
});

test('las pushboxes impiden que los luchadores se atraviesen', () => {
  const { m, fa, fb } = makeMatch();
  fa.x = 0; fb.x = 0.2;
  m.step({}, {});
  assert.ok(Math.abs(fb.x - fa.x) > 0.8, `distancia ${Math.abs(fb.x - fa.x)}`);
});

test('nadie sale del escenario', () => {
  const { m, fa, fb } = makeMatch();
  for (let i = 0; i < 200; i++) {
    fa.x = 100; fb.x = -100;
    m.step({}, {});
    assert.ok(Math.abs(fa.x) <= 7.2 && Math.abs(fb.x) <= 7.2);
  }
});

test('el reflector de Sera devuelve los proyectiles', () => {
  const { m, fa, fb } = makeMatch('sera', 'kenji');
  // Kenji lanza un fireball.
  const shooter = fb, reflector = fa;
  shooter.x = -3; reflector.x = 3;
  const mv = shooter.moveById['kenji_wave'];
  m.spawnProjectile(shooter, mv, 0);
  assert.equal(m.projectiles.length, 1);
  reflector.state = STATE.ATTACK;
  reflector.move = reflector.moveById['sera_prism'];
  reflector.moveFrame = reflector.move.startup + 5;
  reflector.superFlashLock = 0;
  const p = m.projectiles[0];
  p.x = reflector.x - 0.3;
  m.updateProjectiles();
  assert.equal(p.owner, reflector, 'el proyectil cambia de dueño');
  assert.ok(p.facing === reflector.facing);
});

/* ------------------------------------------------------------------ */
/* Partida completa con IA                                             */
/* ------------------------------------------------------------------ */

function stepToInput(step, facingRight) {
  const keys = { 1: { left: true, down: true }, 2: { down: true }, 3: { right: true, down: true }, 4: { left: true }, 5: {}, 6: { right: true }, 7: { left: true, up: true }, 8: { up: true }, 9: { right: true, up: true } }[step.dir] || {};
  const out = { ...(step.buttons || {}) };
  if (facingRight) Object.assign(out, keys);
  else Object.assign(out, { left: keys.right, right: keys.left, down: keys.down, up: keys.up });
  return out;
}

test('una partida IA vs IA termina con ganador y sin excepciones', () => {
  const { m, fa, fb } = makeMatch('kenji', 'orion');
  const ai1 = new AI(fa, fb, 3);
  const ai2 = new AI(fb, fa, 3);
  ai1.match = m; ai2.match = m;
  let ko = false;
  for (let i = 0; i < 60 * 180 && !m.over; i++) {
    m.step(ai1.think(), ai2.think());
    if (m.wins[0] + m.wins[1] > 0) ko = true;
  }
  assert.ok(m.over, 'la partida no terminó en 3 minutos');
  const w = m.winnerIndex;
  assert.ok(w === 0 || w === 1, 'sin ganador');
  assert.equal(m.wins[w], 2, 'se gana al mejor de 3');
  assert.ok(ko, 'ninguna ronda llegó a resolverse');
});

test('la IA saca supers cuando tiene barra', () => {
  const { m, fa, fb } = makeMatch('rex', 'goran');
  const ai = new AI(fa, fb, 4);
  ai.match = m;
  ai.rng = () => 0.05;      // determinista: siempre toma la rama "agresiva"
  fa.stocks = 3;
  fb.x = fa.x + 2;
  let usedSuper = false;
  for (let i = 0; i < 900; i++) {
    m.step(ai.think(), {});
    if (fa.state === STATE.ATTACK && fa.move && fa.move.super) usedSuper = true;
    if (usedSuper) break;
  }
  assert.ok(usedSuper, 'la IA nunca usó su super');
});

test('todos los luchadores pueden ejecutar al menos un especial por comando', () => {
  for (const def of ROSTER) {
    const f = new Fighter(def, 0, 1);
    const foe = new Fighter(get('kenji'), 1, -1);
    const m = new Match(f, foe, {});
    m.phase = 'fight';
    const special = def.specials.find((s) => s.input.motion && !s.input.air);
    assert.ok(special, `${def.id} sin especial terrestre con comando`);
    const cmd = commandFor(special);
    const steps = commandToSteps(cmd, { holdEach: 3, charge: 52 });
    let done = false;
    for (const s of steps) {
      for (let k = 0; k < s.frames; k++) {
        m.step(stepToInput(s, true), {});
        if (f.state === STATE.ATTACK && f.move && f.move.id === special.id) done = true;
      }
      if (done) break;
    }
    assert.ok(done, `${def.id}: no salió ${special.id} con ${cmd}`);
  }
});

test('todos los luchadores pueden ejecutar su super con barra llena', () => {
  for (const def of ROSTER) {
    const f = new Fighter(def, 0, 1);
    const foe = new Fighter(get('kenji'), 1, -1);
    const m = new Match(f, foe, {});
    m.phase = 'fight';
    f.stocks = MAX_STOCKS;
    const sup = def.supers[0];
    const cmd = commandFor(sup);
    const steps = commandToSteps(cmd, { holdEach: 3, charge: 52 });
    let done = false;
    for (const s of steps) {
      for (let k = 0; k < s.frames; k++) {
        m.step(stepToInput(s, true), {});
        if (f.state === STATE.ATTACK && f.move && f.move.id === sup.id) done = true;
      }
      if (done) break;
    }
    assert.ok(done, `${def.id}: no salió el super ${sup.id} (${cmd})`);
  }
});

test('boxesOverlap funciona en 1D y 2D', () => {
  assert.ok(boxesOverlap({ x0: 0, x1: 2, y0: 0, y1: 2 }, { x0: 1, x1: 3, y0: 1, y1: 3 }));
  assert.ok(!boxesOverlap({ x0: 0, x1: 1, y0: 0, y1: 1 }, { x0: 2, x1: 3, y0: 0, y1: 1 }));
  assert.ok(!boxesOverlap({ x0: 0, x1: 2, y0: 0, y1: 1 }, { x0: 0, x1: 2, y0: 5, y1: 6 }));
});

test('buildRoster es idempotente y no comparte objetos entre luchadores', () => {
  const a = buildRoster();
  assert.equal(a.length, ROSTER.length);
  assert.notEqual(a[0].moveById['5LP'], a[1].moveById['5LP'], 'los normales deben ser instancias propias');
});

test('los 100 cruces del roster terminan sin excepciones (IA nivel 3)', () => {
  let draws = 0;
  for (const A of ROSTER) {
    for (const B of ROSTER) {
      const fa = new Fighter(A, 0, 1);
      const fb = new Fighter(B, 1, -1);
      const m = new Match(fa, fb, {});
      const a1 = new AI(fa, fb, 3);
      const a2 = new AI(fb, fa, 3);
      a1.match = m; a2.match = m;
      let guard = 0;
      while (!m.over && guard++ < 60 * 240) m.step(a1.think(), a2.think());
      assert.ok(m.over, `${A.id} vs ${B.id} no terminó en 240 s`);
      assert.ok(m.wins[0] + m.wins[1] >= 2, `${A.id} vs ${B.id}: ${m.wins}`);
      assert.ok(m.frame > 0 && Number.isFinite(m.p1.x) && Number.isFinite(m.p2.x),
        `${A.id} vs ${B.id}: estado corrupto`);
      if (m.wins[0] === m.wins[1]) draws++;
    }
  }
  assert.equal(draws, 0, 'ningún combate debe acabar en empate de rondas');
});

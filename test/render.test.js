/**
 * Tests de la capa visual/UI sobre jsdom (sin WebGL real).
 * Se inyecta un renderer stub para poder ejercitar GameView completo.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import * as THREE from '../vendor/three.module.min.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.ResizeObserver = class { observe() {} disconnect() {} };
if (!global.performance) global.performance = { now: () => Date.now() };

const { ROSTER } = await import('../src/data/roster.js');
const { Fighter } = await import('../src/game/fighter.js');
const { Match } = await import('../src/game/match.js');
const { AI } = await import('../src/game/ai.js');
const { Rig } = await import('../src/render/rig.js');
const { Humanoid } = await import('../src/render/humanoid.js');
const { ANIM_CLIPS, ANIM_JOINTS } = await import('../src/data/anims.js');
const { planAnimation, attackFrame, clipForMove } = await import('../src/anim/library.js');
const { clipImpact } = await import('../src/anim/clip.js');
const { Stage } = await import('../src/render/stage.js');
const { FX } = await import('../src/render/fx.js');
const { GameView } = await import('../src/render/renderer.js');
const { HUD } = await import('../src/ui/hud.js');
const { Screens } = await import('../src/ui/screens.js');
const { drawPortrait } = await import('../src/ui/portrait.js');

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function stubRenderer() {
  const calls = { setSize: 0, render: 0 };
  return {
    calls,
    setPixelRatio() {},
    setSize() { calls.setSize++; },
    render() { calls.render++; },
    outputColorSpace: null,
    toneMapping: null,
    toneMappingExposure: 1,
    domElement: dom.window.document.getElementById('gl')
  };
}

function mockCtx() {
  const calls = [];
  const gradient = { addColorStop: (o, c) => calls.push(['addColorStop', o, c]) };
  const target = {
    createLinearGradient: (...a) => { calls.push(['createLinearGradient', ...a]); return gradient; },
    createRadialGradient: (...a) => { calls.push(['createRadialGradient', ...a]); return gradient; }
  };
  const proxy = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return { width: 128, height: 128 };
      return (...a) => { calls.push([String(k), ...a]); };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { ctx: proxy, calls };
}

function liveMatch(a = 'kenji', b = 'orion', aiLevel = 3) {
  const fa = new Fighter(ROSTER.find((f) => f.id === a), 0, 1);
  const fb = new Fighter(ROSTER.find((f) => f.id === b), 1, -1);
  const m = new Match(fa, fb, {});
  const a1 = new AI(fa, fb, aiLevel);
  const a2 = new AI(fb, fa, aiLevel);
  a1.match = m; a2.match = m;
  a1.rng = () => 0.3;            // determinista: los tests no pueden ser aleatorios
  a2.rng = () => 0.62;
  return { m, fa, fb, a1, a2 };
}

/* ------------------------------------------------------------------ */
/* Rig                                                                 */
/* ------------------------------------------------------------------ */

test('el rig se construye para los 10 luchadores con su jerarquía', () => {
  for (const def of ROSTER) {
    const rig = new Rig(def);
    assert.ok(rig.root instanceof THREE.Group, `${def.id}: root`);
    assert.ok(rig.armL && rig.armR && rig.legL && rig.legR, `${def.id}: extremidades`);
    assert.ok(rig.head && rig.spine && rig.hips, `${def.id}: torso`);
    assert.ok(rig.height > 1.4 && rig.height < 2.6, `${def.id}: altura ${rig.height}`);
    // Una única malla skinneada: los huesos deforman la geometría.
    assert.ok(rig.mesh && rig.mesh.isSkinnedMesh, `${def.id}: falta el SkinnedMesh`);
    const geo = rig.mesh.geometry;
    assert.ok(geo.getAttribute('skinIndex'), `${def.id}: sin skinIndex`);
    assert.ok(geo.getAttribute('skinWeight'), `${def.id}: sin skinWeight`);
    assert.equal(rig.skeleton.bones.length, ANIM_JOINTS.length, `${def.id}: nº de huesos`);
    // Pesos normalizados (si no, la malla se estira o desaparece)
    const sw = geo.getAttribute('skinWeight');
    for (let i = 0; i < sw.count; i++) {
      const sum = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      assert.ok(Math.abs(sum - 1) < 0.02, `${def.id}: pesos ${sum}`);
    }
    // La cabeza queda por encima de la cadera y los pies en el suelo
    rig.root.updateMatrixWorld(true);
    assert.ok(rig.bp.Head[1] > rig.bp.Hips[1] + 0.4, `${def.id}: cabeza bajo la cadera`);
    assert.ok(rig.bp.LeftFoot[1] < 0.15, `${def.id}: pie a ${rig.bp.LeftFoot[1]}`);
  }
});

test('los luchadores son visualmente distinguibles (mallas distintas)', () => {
  const counts = new Set();
  const heights = new Set();
  for (const def of ROSTER) {
    const rig = new Rig(def);
    let n = 0;
    rig.root.traverse((o) => { if (o.isMesh) n++; });
    counts.add(n);
    heights.add(Math.round(rig.height * 100));
  }
  assert.ok(heights.size >= 6, `alturas distintas: ${heights.size}`);
  assert.ok(counts.size >= 3, `variedad de accesorios: ${counts.size}`);
});

test('todos los clips de mocap se reproducen sin producir NaN', () => {
  const def = ROSTER[0];
  const rig = new Rig(def);
  const fighter = new Fighter(def, 0, 1);
  const names = Object.keys(ANIM_CLIPS);
  assert.ok(names.length >= 25, `solo ${names.length} clips`);
  for (const name of names) {
    for (const phase of ['startup', 'active', 'recovery']) {
      fighter.anim = {
        state: 'attack', pose: 'x', phase,
        frame: phase === 'startup' ? 1 : phase === 'active' ? 8 : 20,
        move: { startup: 6, active: 4, recovery: 12, pose: 'jab', level: 'M', kind: 'melee', input: { button: 'P' } }
      };
      fighter.move = fighter.anim.move;
      rig.cur.clip = name;
      rig.prev = null;
      for (let i = 0; i < 6; i++) rig.update(fighter, 1 / 60);
      const bad = [];
      rig.root.traverse((o) => {
        if (!Number.isFinite(o.position.x + o.position.y + o.position.z)) bad.push(o.name + ' pos');
        if (!Number.isFinite(o.quaternion.x + o.quaternion.y + o.quaternion.z + o.quaternion.w)) bad.push(o.name + ' quat');
      });
      assert.equal(bad.length, 0, `clip ${name}/${phase}: ${bad.join(',')}`);
    }
  }
});

test('cada golpe del roster tiene clip y su impacto se alinea con los frames activos', () => {
  for (const def of ROSTER) {
    for (const mv of [...def.specials, ...def.supers]) {
      const name = clipForMove(mv);
      assert.ok(ANIM_CLIPS[name], `${def.id}/${mv.id}: clip ${name} inexistente`);
      const imp = clipImpact(name);
      // En el primer frame activo el clip debe estar justo en su impacto.
      const at = attackFrame(mv, mv.startup);
      assert.equal(at.name, name);
      if (imp >= 0) {
        assert.ok(Math.abs(at.frame - imp) < 0.5,
          `${def.id}/${mv.id}: en el frame activo el clip está en ${at.frame} y el impacto es ${imp}`);
      }
      // Y durante el arranque no debe haber pasado todavía el impacto.
      const before = attackFrame(mv, Math.max(0, mv.startup - 1));
      if (imp > 0) assert.ok(before.frame <= imp + 0.001, `${def.id}/${mv.id}: se adelanta al impacto`);
    }
  }
});

test('la guardia coloca las manos arriba y el golpe extiende el brazo', () => {
  const def = ROSTER[0];
  const rig = new Rig(def);
  const f = new Fighter(def, 0, 1);
  const opp = { x: 2.2, y: 0 };
  f.x = -2.2; f.facing = 1;
  const inv = new THREE.Matrix4();
  const local = (n) => {
    const v = new THREE.Vector3();
    rig.bones[n].getWorldPosition(v);
    inv.copy(rig.body.matrixWorld).invert();
    return v.applyMatrix4(inv);
  };

  for (let i = 0; i < 120; i++) { f.stateFrame = i; f.updateAnim(); rig.update(f, 1 / 60, opp); }
  const guardL = local('LeftHand'), guardR = local('RightHand');
  assert.ok(guardL.y > 1.25 && guardR.y > 1.25, `manos bajas: ${guardL.y} / ${guardR.y}`);
  assert.ok(guardL.z > 0.12 && guardR.z > 0.12, 'las manos no están delante del cuerpo');
  const guardReach = Math.max(guardL.z, guardR.z);

  // Un golpe debe llevar una mano claramente más adelante que la guardia.
  const mv = def.specials[0];
  f.state = 'attack'; f.move = mv; f.moveFrame = mv.startup + 1; f.updateAnim();
  for (let i = 0; i < 8; i++) rig.update(f, 1 / 60, opp);
  const punch = Math.max(local('LeftHand').z, local('RightHand').z);
  assert.ok(punch > guardReach + 0.2, `el golpe no extiende: guardia ${guardReach} golpe ${punch}`);
  assert.ok(punch > 0.5, `alcance del golpe ${punch}`);
});

test('el rig sigue la posición y el facing del luchador', () => {
  const rig = new Rig(ROSTER[0]);
  const f = new Fighter(ROSTER[0], 0, 1);
  f.x = 3.2; f.y = 1.1; f.facing = -1;
  f.updateAnim();
  rig.update(f, 1 / 60);
  assert.equal(rig.root.position.x, 3.2);
  assert.equal(rig.root.position.y, 1.1);
  const back = rig.body.rotation.y;
  f.facing = 1;
  rig.update(f, 1 / 60);
  const front = rig.body.rotation.y;
  // El cuerpo gira 180° entre un facing y el otro (más el giro propio de la guardia).
  assert.ok(Math.abs(Math.abs(front - back) - Math.PI) < 1e-6, `front=${front} back=${back}`);
  // La sombra se queda en el suelo aunque el luchador salte (compensa el y del root).
  assert.ok(Math.abs(rig.shadow.position.y + f.y - 0.012) < 1e-9, `sombra en ${rig.shadow.position.y}`);
});

/* ------------------------------------------------------------------ */
/* Stage / FX                                                          */
/* ------------------------------------------------------------------ */

test('el escenario y el sistema de partículas se construyen y actualizan', () => {
  const scene = new THREE.Scene();
  const stage = new Stage(scene);
  assert.ok(stage.torches.length >= 8, 'antorchas');
  let meshes = 0;
  scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes++; });
  assert.ok(meshes > 25, `mallas del escenario: ${meshes}`);
  const { m } = liveMatch();
  for (let i = 0; i < 30; i++) stage.update(1 / 60, m);
  stage.setSuperMood(1, '#ff00ff');
  assert.ok(stage.sky.material.uniforms.top.value instanceof THREE.Color);

  const fx = new FX(scene);
  fx.burst(0, 1, 0, '#ff0000', 1.4);
  fx.parry(1, 1, 0);
  fx.dust(0, 0, 0);
  fx.slash(0, 1, 0, '#ffffff', 1);
  for (let i = 0; i < 40; i++) fx.update(1 / 60);
  assert.ok(fx.decals.length >= 0);
  fx.clear();
});

test('los proyectiles tienen malla y se liberan al morir', () => {
  const scene = new THREE.Scene();
  const fx = new FX(scene);
  const { m, fa } = liveMatch('kenji', 'valeria');
  m.spawnProjectile(fa, fa.moveById['kenji_wave'], 0);
  assert.equal(m.projectiles.length, 1);
  fx.syncProjectiles(m.projectiles);
  assert.equal(fx.projectileMeshes.size, 1);
  m.projectiles.length = 0;
  fx.syncProjectiles(m.projectiles);
  assert.equal(fx.projectileMeshes.size, 0, 'la malla debe liberarse');
});

/* ------------------------------------------------------------------ */
/* GameView                                                            */
/* ------------------------------------------------------------------ */

test('GameView renderiza un combate completo sin errores', () => {
  const canvas = dom.window.document.getElementById('gl');
  const renderer = stubRenderer();
  const view = new GameView(canvas, { renderer });
  const { m, a1, a2 } = liveMatch();
  view.setFighters([m.p1.def, m.p2.def]);
  const seen = new Set();
  for (let i = 0; i < 60 * 40 && !m.over; i++) {
    m.step(a1.think(), a2.think());
    for (const e of m.events) { seen.add(e.type); view.handleEvent(e, m); }
    view.frame(m, 1 / 60);
  }
  assert.ok(renderer.calls.render > 100, `renders: ${renderer.calls.render}`);
  assert.ok(seen.has('hit'), 'debe haber impactos');
  // Cámara finita y dentro de límites razonables
  for (const k of ['x', 'y', 'z']) {
    assert.ok(Number.isFinite(view.camera.position[k]), `cámara ${k}`);
  }
  assert.ok(view.camera.position.z > 3 && view.camera.position.z < 20, `z=${view.camera.position.z}`);
  const dmg = m.totalDamage[0] + m.totalDamage[1];
  assert.ok(dmg > 100, `el combate progresa (daño total ${Math.round(dmg)})`);
  assert.ok(m.p1.health < m.p1.maxHealth || m.p2.health < m.p2.maxHealth, 'alguien pierde vida');
  // La cámara encuadra a los dos luchadores.
  const mid = (m.p1.x + m.p2.x) / 2;
  assert.ok(Math.abs(view.camTarget.x - mid * 0.85) < 1.5, 'la cámara sigue la acción');
});

test('GameView cubre todos los tipos de evento sin lanzar', () => {
  const canvas = dom.window.document.getElementById('gl');
  const view = new GameView(canvas, { renderer: stubRenderer() });
  const { m } = liveMatch('sera', 'magnus');
  view.setFighters([m.p1.def, m.p2.def]);
  const events = [
    { type: 'hit', x: 0, y: 1, damage: 50, color: '#fff', player: 0 },
    { type: 'counter', x: 0, y: 1, damage: 50, player: 0 },
    { type: 'block', x: 0, y: 1, player: 1 },
    { type: 'parry', x: 0, y: 1, player: 1 },
    { type: 'parryProjectile', x: 0, y: 1, player: 1 },
    { type: 'projectileSpawn', x: 0, y: 1, color: '#fff', fx: 'orb', player: 0 },
    { type: 'projectileHit', x: 0, y: 1, color: '#fff', result: 'hit' },
    { type: 'superFlash', player: 0, move: m.p1.def.supers[0] },
    { type: 'land', player: 0, hard: true },
    { type: 'dash', player: 0 }, { type: 'roll', player: 0 }, { type: 'jump', player: 0 },
    { type: 'teleport', from: -1, to: 1, player: 0 },
    { type: 'maxActivate', player: 1 },
    { type: 'ko', winner: 0, loser: 1 },
    { type: 'guardCrush', player: 1 }, { type: 'dizzy', player: 1 },
    { type: 'reflect', x: 0, y: 1 }, { type: 'thrown', x: 0, y: 1, damage: 100 },
    { type: 'dot', player: 1 }, { type: 'stock', player: 0 }, { type: 'nada', player: 0 }
  ];
  for (const e of events) {
    assert.doesNotThrow(() => view.handleEvent(e, m), `evento ${e.type}`);
  }
  view.frame(m, 1 / 60);
});

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

test('el HUD refleja vida, stocks, combo y tiempo', () => {
  const root = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(root);
  const hud = new HUD(root);
  const { m, fa, fb, a1, a2 } = liveMatch();
  hud.setNames(fa, fb);
  assert.equal(hud.el.p1.name.textContent, 'KENJI ARASHI');
  assert.equal(hud.el.p2.name.textContent, 'ORION VEX');

  for (let i = 0; i < 60 * 20; i++) {
    m.step(a1.think(), a2.think());
    hud.update(m, 1 / 60);
  }
  const w1 = hud.el.p1.hp.style.width;
  const w2 = hud.el.p2.hp.style.width;
  assert.match(w1, /%$/);
  assert.match(w2, /%$/);
  assert.ok(w1 !== '100%' || w2 !== '100%', 'alguien debe haber perdido vida');
  assert.equal(hud.el.timer.textContent.length, 2, 'timer con 2 dígitos');
  assert.ok(hud.el.p1.stocks.textContent.includes('◆') || hud.el.p1.stocks.textContent.includes('◇'));
  hud.announce('K.O.', '', 'big');
  assert.equal(hud.el.announce.textContent, 'K.O.');
  hud.show(false);
  assert.equal(hud.el.wrap.style.display, 'none');
});

/* ------------------------------------------------------------------ */
/* Pantallas                                                           */
/* ------------------------------------------------------------------ */

test('el flujo de pantallas llega al combate', async () => {
  const root = dom.window.document.getElementById('screen-layer');
  let started = null;
  const screens = new Screens(root, {
    onStart: (a, b, mode) => { started = { a, b, mode }; }
  });
  screens.show('title');
  assert.equal(screens.current, 'title');
  screens.action('cpu');
  assert.equal(screens.current, 'select');
  assert.equal(screens.cells.length, ROSTER.length);

  screens.moveCursor(0, 1, 0);
  screens.moveCursor(0, 0, 1);
  screens.confirm(0);
  assert.equal(screens.locked[0], true);
  await new Promise((r) => setTimeout(r, 500));   // la pantalla VS entra con retardo
  assert.equal(screens.current, 'vs');

  screens.buildMoveList();
  const cols = screens.screens.moves.querySelector('#ml-cols');
  assert.equal(cols.childElementCount, ROSTER.length, 'una columna por luchador');
  assert.ok(cols.textContent.includes('236'), 'notación presente');

  // Espera el timeout del VS
  await new Promise((r) => setTimeout(r, 2200));
  assert.ok(started, 'onStart debe dispararse');
  assert.equal(started.mode, 'cpu');
  assert.ok(ROSTER.includes(started.a));

  screens.action('controls');
  assert.equal(screens.current, 'controls');
  screens.action('back');
});

/* ------------------------------------------------------------------ */
/* Retratos                                                            */
/* ------------------------------------------------------------------ */

test('los retratos se dibujan para todos los luchadores', () => {
  for (const def of ROSTER) {
    const { ctx, calls } = mockCtx();
    drawPortrait({ width: 128, height: 128 }, def, { ctx });
    assert.ok(calls.length > 40, `${def.id}: solo ${calls.length} operaciones de dibujo`);
    const names = new Set(calls.map((c) => c[0]));
    assert.ok(names.has('fill'), `${def.id}: sin rellenos`);
    assert.ok(names.has('fillRect'), `${def.id}: sin fondo`);
  }
  // Los accesorios deben generar dibujos distintos entre luchadores.
  const sig = new Set();
  for (const def of ROSTER) {
    const { ctx, calls } = mockCtx();
    drawPortrait({ width: 128, height: 128 }, def, { ctx });
    sig.add(calls.map((c) => c[0]).join(','));
  }
  assert.ok(sig.size >= 5, `solo ${sig.size} patrones de dibujo distintos`);
});

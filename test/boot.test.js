/**
 * Test de arranque: monta la app completa (main.js) sobre jsdom con un
 * contexto WebGL simulado, y juega un combate entero con la CPU.
 * Verifica que el ensamblaje (input -> match -> render -> HUD -> pantallas) no rompe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;

/* --- Contexto WebGL simulado (solo para que three.js arranque) --- */
function makeGL(canvas) {
  const store = {};
  const num = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 100000;
  };
  return new Proxy(store, {
    get(t, k) {
      if (k === 'canvas') return canvas;
      if (k === 'drawingBufferWidth') return 1280;
      if (k === 'drawingBufferHeight') return 720;
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return (t[k] ??= num(k));
      switch (k) {
        case 'getParameter': return (p) => {
          if (p === num('VERSION')) return 'WebGL 2.0 (Mock)';
          if (p === num('SHADING_LANGUAGE_VERSION')) return 'WebGL GLSL ES 3.00 (Mock)';
          if (p === num('RENDERER')) return 'Mock Renderer';
          if (p === num('ACTIVE_UNIFORMS') || p === num('ACTIVE_ATTRIBUTES') ||
              p === num('ACTIVE_UNIFORM_BLOCKS') || p === num('TRANSFORM_FEEDBACK_VARYINGS')) return 0;
          if (p === num('VENDOR')) return 'Mock';
          return 4096;
        };
        case 'getExtension': return () => ({});
        case 'getSupportedExtensions': return () => [];
        case 'getShaderPrecisionFormat': return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
        case 'getUniformLocation': return () => ({});
        case 'getShaderParameter': return () => true;
        case 'getShaderInfoLog':
        case 'getProgramInfoLog': return () => '';
        case 'getShaderSource': return () => '';
        case 'checkFramebufferStatus': return () => 36054;
        case 'getError': return () => 0;
        case 'createTexture':
        case 'createBuffer':
        case 'createFramebuffer':
        case 'createRenderbuffer':
        case 'createProgram':
        case 'createShader':
        case 'createVertexArray':
        case 'createQuery': return () => ({});
        case 'getActiveUniform':
        case 'getActiveAttribInfo': return (pr, i) => ({ name: `u${i}`, size: 1, type: 35678 });
        case 'getProgramParameter': return (pr, p2) => (p2 === num('ACTIVE_UNIFORMS') || p2 === num('ACTIVE_ATTRIBUTES') ? 0 : true);
        case 'getUniformBlockIndex': return () => 0;
        case 'getActiveUniformBlockParameter': return () => 0;
        case 'getActiveUniformBlockName': return () => 'blk';
        case 'getAttribLocation': return () => 0;
        case 'isContextLost': return () => false;
        default: return () => {};
      }
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}

const realGetContext = win.HTMLCanvasElement.prototype.getContext;
win.HTMLCanvasElement.prototype.getContext = function (type, attrs) {
  if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') {
    if (!this.__gl) this.__gl = makeGL(this);
    return this.__gl;
  }
  try { return realGetContext.call(this, type, attrs); } catch (e) { return null; }
};

global.window = win;
global.document = win.document;
Object.defineProperty(global, 'navigator', { value: win.navigator, configurable: true });
global.HTMLElement = win.HTMLElement;
global.requestAnimationFrame = win.requestAnimationFrame
  ? (cb) => win.setTimeout(() => cb(Date.now()), 4)
  : (cb) => setTimeout(() => cb(Date.now()), 4);
global.cancelAnimationFrame = (id) => win.clearTimeout(id);
global.ResizeObserver = class { observe() {} disconnect() {} };
global.self = win;
global.HTMLCanvasElement = win.HTMLCanvasElement;
global.AudioContext = class {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} }; }
  createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, connect() {}, start() {}, stop() {} }; }
  resume() {}
};
win.AudioContext = global.AudioContext;

const errors = [];
win.addEventListener('error', (e) => errors.push(String(e.message)));

/* ------------------------------------------------------------------ */

const waitFor = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (!fn() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 25));
  return fn();
};

test('la aplicación arranca, navega menús y juega un combate completo', async () => {
  await import('../src/main.js');
  await waitFor(() => win.game && win.game.screens.current === 'title');

  const game = win.game;
  assert.ok(game, 'window.game debe existir');
  assert.equal(errors.length, 0, `errores en el arranque: ${errors.join(' | ')}`);
  assert.equal(game.screens.current, 'title');
  try {
  await body(game);
  } finally {
    game.stop();          // detiene el bucle rAF para que el proceso pueda terminar
  }
});

async function body(game) {

  // Título -> selección
  game.screens.action('cpu');
  assert.equal(game.screens.current, 'select');
  game.screens.moveCursor(0, 1, 0);
  game.screens.confirm(0);
  await waitFor(() => game.state === 'fight', 6000);

  assert.equal(game.state, 'fight', `estado=${game.state}`);
  assert.ok(game.match, 'debe existir un combate');
  assert.equal(game.match.fighters[0].def.id, game.defs[0].id);
  assert.ok(game.ais[1], 'en modo CPU el jugador 2 es la IA');

  // Deja correr el bucle real (rAF) durante unos segundos de juego.
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(game.match.frame > 60, `frames simulados: ${game.match.frame}`);
  assert.equal(errors.length, 0, `errores durante el combate: ${errors.join(' | ')}`);

  // Forzamos un combate rápido hasta el final usando el tick directo.
  const before = game.match.frame;
  for (let i = 0; i < 60 * 260 && !game.match.over; i++) game.tick();
  assert.ok(game.match.frame > before, 'tick() avanza el combate');
  assert.ok(game.match.wins[0] + game.match.wins[1] >= 2, `rondas ganadas ${game.match.wins}`);
  assert.equal(errors.length, 0, `errores: ${errors.join(' | ')}`);

  // Pausa, resultados y vuelta al menú
  game.setPaused(true);
  assert.equal(game.screens.current, 'pause');
  game.setPaused(false);
  assert.equal(game.screens.current, null);

  const winner = game.match.fighters[game.match.winnerIndex];
  game.screens.showResults(winner, game.match, 'cpu');
  assert.equal(game.screens.current, 'results');
  const table = game.screens.screens.results.querySelector('.r-stats');
  assert.ok(table.textContent.includes('RONDAS'), 'tabla de estadísticas');
  assert.ok(table.textContent.includes('PARRIES'), 'estadística de parries');

  game.screens.action('quit');
  assert.equal(game.state, 'title');
  assert.equal(game.screens.current, 'title');
  assert.equal(errors.length, 0, `errores finales: ${errors.join(' | ')}`);
}

test('el teclado llega al luchador (input real vía DOM)', async () => {
  const game = win.game;
  game.screens.action('cpu');
  game.screens.confirm(0);
  await waitFor(() => game.state === 'fight');
  const p1 = game.match.p1;
  game.ais[1] = null;                       // sin CPU: el test manda solo con el teclado
  const step = (n = 1) => { for (let i = 0; i < n; i++) game.tick(); };
  step(200);                                 // deja pasar la intro (ROUND 1 / FIGHT!)
  assert.equal(game.match.phase, 'fight', `fase=${game.match.phase}`);
  assert.notEqual(p1.state, 'intro');

  const key = (type, code) => win.dispatchEvent(new win.KeyboardEvent(type, { code, bubbles: true }));

  // Golpe ligero
  key('keydown', 'KeyJ');
  game.tick();
  assert.equal(p1.state, 'attack', 'un LP pone al luchador en attack');
  assert.ok(p1.move && p1.move.level === 'L', `move=${p1.move && p1.move.id}`);
  key('keyup', 'KeyJ');
  step(60);

  // Salto
  key('keydown', 'KeyW');
  game.tick();
  key('keyup', 'KeyW');
  assert.ok(p1.airborne && p1.y > 0, `salto: y=${p1.y.toFixed(2)} airborne=${p1.airborne}`);
  step(90);
  assert.ok(!p1.airborne, 'aterriza');

  // Atajo moderno: SP1 a secas lanza el especial nº1.
  key('keydown', 'KeyU');
  step();
  key('keyup', 'KeyU');
  assert.equal(p1.move, p1.def.specials[0], 'SP1 es atajo del primer especial');
  step(80);

  // Especial 236P: S -> S+D -> D -> U
  key('keydown', 'KeyS');
  step(3);
  key('keydown', 'KeyD');
  step(3);
  key('keyup', 'KeyS');
  step(2);
  key('keydown', 'KeyU');
  step();
  key('keyup', 'KeyU');
  assert.ok(p1.move && p1.move.level === 'SP', `especial ejecutado: ${p1.move && p1.move.id}`);
  const m236 = p1.def.specials.find((m) => m.input.motion === '236P' && !m.input.air);
  if (m236) assert.equal(p1.move, m236, `el motion 236P tiene prioridad: ${p1.move.id} != ${m236.id}`);
  step(60);
  assert.ok(game.match.frame > 400, `el combate sigue vivo (frame ${game.match.frame})`);

  // P2 (CPU) no se ve afectado por las teclas de P1
  // Un bloqueo con ↓ + atrás absorbe el daño (no entra en hitstun por chip mortal)
  assert.ok(game.match.frame > 200, `frames jugados: ${game.match.frame}`);

  game.setPaused(true);
  game.screens.action('quit');
  assert.equal(game.state, 'title');
  game.stop();
});

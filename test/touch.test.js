/**
 * Test de controles táctiles: pulsar/soltar escribe en el estado de entrada,
 * la pausa es acción de flanco y deslizar sobre el d-pad cambia de dirección
 * sin levantar el dedo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { touchAvailable, bindTouchLayer } from '../src/input/touch.js';

const dom = new JSDOM(`<!doctype html><html><body>
<div id="touch">
  <div class="pad-left">
    <button data-k="left" class="tbtn">L</button>
    <button data-k="down" class="tbtn">D</button>
  </div>
  <div class="pad-right">
    <button data-k="LP" class="tbtn">LP</button>
    <button data-k="pause" class="tbtn pz">II</button>
  </div>
</div></body></html>`);
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;

const ev = (type) => new dom.window.Event(type, { cancelable: true });

test('touchAvailable devuelve booleano coherente con el dispositivo', () => {
  assert.equal(typeof touchAvailable(), 'boolean');
});

test('pulsar/soltar un botón escribe y borra su tecla del estado', () => {
  const state = {};
  const layer = document.getElementById('touch');
  let resumes = 0;
  bindTouchLayer(layer, { state, onResume: () => resumes++, onPause: () => {} });
  const lp = layer.querySelector('[data-k="LP"]');
  lp.dispatchEvent(ev('pointerdown'));
  assert.equal(state.LP, true);
  assert.ok(resumes >= 1);
  lp.dispatchEvent(ev('pointerup'));
  assert.equal(state.LP, false);
});

test('la pausa es acción directa, no tecla mantenida', () => {
  const state = {};
  const layer = document.getElementById('touch');
  let pauses = 0;
  bindTouchLayer(layer, { state, onResume: () => {}, onPause: () => pauses++ });
  const pz = layer.querySelector('[data-k="pause"]');
  pz.dispatchEvent(ev('pointerdown'));
  pz.dispatchEvent(ev('pointerup'));
  assert.equal(pauses, 1);
  assert.equal(state.pause, undefined);
});

test('deslizar del d-pad cambia de dirección sin levantar el dedo', () => {
  const state = {};
  const layer = document.getElementById('touch');
  bindTouchLayer(layer, { state, onResume: () => {}, onPause: () => {} });
  const left = layer.querySelector('[data-k="left"]');
  const down = layer.querySelector('[data-k="down"]');
  document.elementFromPoint = () => down;
  left.dispatchEvent(ev('pointerdown'));
  assert.equal(state.left, true);
  left.dispatchEvent(ev('pointermove'));
  assert.equal(state.left, false);
  assert.equal(state.down, true);
  // soltar el dedo (el pointer vive ahora en "down" tras la transferencia)
  left.dispatchEvent(ev('pointerup'));
  assert.equal(state.down, true, 'la transferencia no debe soltar por el botón viejo');
  down.dispatchEvent(ev('pointerup'));
  assert.equal(state.down, false);
});

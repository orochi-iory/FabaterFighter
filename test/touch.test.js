/**
 * Test de controles táctiles: pulsar/soltar escribe en el estado de entrada,
 * la pausa es acción de flanco y el pad izquierdo es analógico de 8
 * direcciones (diagonales sin levantar el dedo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { touchAvailable, bindTouchLayer } from '../src/input/touch.js';

const dom = new JSDOM(`<!doctype html><html><body>
<div id="touch">
  <div class="pad-left">
    <button data-k="left" class="tbtn">L</button>
    <button data-k="up" class="tbtn">U</button>
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
const mev = (type, x, y) => new dom.window.MouseEvent(type, { clientX: x, clientY: y, cancelable: true });

test('touchAvailable devuelve booleano coherente con el dispositivo', () => {
  assert.equal(typeof touchAvailable(), 'boolean');
});

test('pulsar/soltar un botón escribe y borra su tecla del estado', () => {
  const state = {};
  const layer = document.getElementById('touch');
  let resumes = 0;
  bindTouchLayer(layer, { state, onResume: () => resumes++, onPause: () => {} });
  const lp = layer.querySelector('[data-k="LP"]');
  lp.dispatchEvent(mev('pointerdown', 300, 300));
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

test('el pad izquierdo es analógico: neutro, dirección y DIAGONAL', () => {
  const state = {};
  const layer = document.getElementById('touch');
  bindTouchLayer(layer, { state, onResume: () => {}, onPause: () => {} });
  const pad = layer.querySelector('.pad-left');
  // origen del toque (centro del pad en coordenadas locales)
  pad.dispatchEvent(mev('pointerdown', 75, 75));
  assert.equal(state.left, false);
  assert.equal(state.up, false);
  // deslizar a la izquierda: left
  pad.dispatchEvent(mev('pointermove', 30, 75));
  assert.equal(state.left, true);
  assert.equal(state.up, false);
  // deslizar a la izquierda-ARRIBA: diagonal (salto en retroceso)
  pad.dispatchEvent(mev('pointermove', 30, 30));
  assert.equal(state.left, true);
  assert.equal(state.up, true);
  // soltar: todo a cero
  pad.dispatchEvent(ev('pointerup'));
  assert.equal(state.left, false);
  assert.equal(state.up, false);
  // vertical puro: down
  pad.dispatchEvent(mev('pointerdown', 75, 75));
  pad.dispatchEvent(mev('pointermove', 75, 120));
  assert.equal(state.down, true);
  assert.equal(state.left, false);
  pad.dispatchEvent(ev('pointercancel'));
  assert.equal(state.down, false);
});

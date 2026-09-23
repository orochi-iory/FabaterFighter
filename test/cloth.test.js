/**
 * Regresión del cuelgue de arranque en navegador: clothTexture() pintaba las
 * arrugas con ctx.ellipse(...) de 6 argumentos (falta endAngle). En Node/jsdom
 * no se veía porque allí no hay contexto 2D real; en el navegador reviente el
 * boot. Este test instala un contexto 2D ESTRICTO (exige >= 7 argumentos como
 * el spec) y construye un humanoide completo: si alguien vuelve a llamar
 * ellipse corto, el test falla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const win = dom.window;

const ellipseCalls = [];
function strict2D() {
  return {
    canvas: null,
    fillStyle: '',
    fillRect() {},
    beginPath() {},
    fill() {},
    ellipse(...args) {
      // Como el spec del navegador: x, y, radiusX, radiusY, rotation,
      // startAngle y endAngle obligatorios.
      if (args.length < 7) {
        throw new TypeError(
          `Failed to execute 'ellipse' on 'CanvasRenderingContext2D': 7 arguments required, but only ${args.length} present.`
        );
      }
      ellipseCalls.push(args);
    }
  };
}
win.HTMLCanvasElement.prototype.getContext = function () { return strict2D(); };

global.window = win;
global.document = win.document;
Object.defineProperty(global, 'navigator', { value: win.navigator, configurable: true });

const { ROSTER } = await import('../src/data/roster.js');
const { Humanoid, clothTexture } = await import('../src/render/humanoid.js');

test('clothTexture usa ctx.ellipse con los 7 argumentos del spec', () => {
  clothTexture();   // la trama se pinta contra el contexto estricto
  const h = new Humanoid(ROSTER.find((f) => f.id === 'kenji'));
  assert.ok(h.mesh, 'el humanoide se construye con contexto 2D estricto');
  assert.ok(ellipseCalls.length >= 46, `se pintaron arrugas (${ellipseCalls.length}) sin reviente`);
  for (const a of ellipseCalls) {
    assert.ok(Number.isFinite(a[5]) && Number.isFinite(a[6]), 'startAngle y endAngle finitos');
  }
});

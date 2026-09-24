/**
 * Controles táctiles: d-pad + botones de ataque multi-touch.
 *
 * Problemas que este módulo resuelve respecto a un addEventListener suelto:
 *  - La capa ocupa toda la pantalla: con pointer-events en los hijos y nada
 *    en la capa, los toques de los menús llegan a sus botones.
 *  - Sin touch-action:none el navegador convierte el primer toque en scroll
 *    y manda pointercancel al instante (los botones "no funcionan").
 *  - Multi-touch real: cada dedo queda asociado a su botón por pointerId,
 *    con captura de puntero para que soltar fuera del botón también suelte.
 *  - Deslizar sobre el d-pad cambia de dirección sin levantar el dedo
 *    (down-back para defender, como en KOF).
 *  - La pausa es una ACCIÓN de flanco, no una tecla mantenida.
 */

/** ¿El dispositivo tiene pantalla táctil (y no manda un ratón)? */
export function touchAvailable() {
  if (typeof window === 'undefined') return false;
  const touch = ('ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  if (!touch) return false;
  // Portátil con pantalla táctil + raton: mandan teclado y raton, sin overlay.
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches) return false;
  return true;
}

/**
 * Cablea todos los .tbtn de la capa.
 * opts.state    — objeto donde escribir las teclas (left/right/up/down/LP/LK/HP/HK/SP1/SP2/SUPER/MAX/GC)
 * opts.onResume — llamado en cada pulsación (desbloqueo de audio)
 * opts.onPause  — acción directa del botón pausa
 */
export function bindTouchLayer(layer, opts = {}) {
  const state = opts.state || {};
  const pid = (e) => (e.pointerId === undefined ? 0 : e.pointerId);
  const active = new Map();                       // pointerId -> { btn, key }

  const press = (btn) => {
    const k = btn.dataset.k;
    if (k === 'pause') { if (opts.onPause) opts.onPause(); return; }
    state[k] = true;
    if (opts.onResume) opts.onResume();
  };
  const release = (entry) => {
    if (!entry || entry.key === 'pause') return;
    state[entry.key] = false;
    entry.btn.classList.remove('tdown');
  };
  const capture = (btn, e) => {
    if (btn.setPointerCapture && e.pointerId !== undefined) {
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    }
  };

  layer.querySelectorAll('.tbtn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(btn, e);
      btn.classList.add('tdown');
      active.set(pid(e), { btn, key: btn.dataset.k });
      press(btn);
    });
    // Deslizar: si el dedo acaba sobre otro botón (d-pad), transfiere la pulsación.
    btn.addEventListener('pointermove', (e) => {
      const entry = active.get(pid(e));
      if (!entry || entry.btn !== btn || !document.elementFromPoint) return;
      const el = document.elementFromPoint(e.clientX || 0, e.clientY || 0);
      const over = el && el.closest ? el.closest('.tbtn') : null;
      if (over && over !== btn) {
        release(entry);
        capture(over, e);
        over.classList.add('tdown');
        active.set(pid(e), { btn: over, key: over.dataset.k });
        press(over);
      }
    });
    const off = (e) => {
      const entry = active.get(pid(e));
      if (!entry || entry.btn !== btn) return;    // el puntero ya es de otro botón
      release(entry);
      active.delete(pid(e));
    };
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  });

  // El navegador no roba el gesto (scroll, pull-to-refresh, zoom) mientras
  // se toca un control: los touch sobre la capa jamás desplazan la página.
  const noGesture = (e) => e.preventDefault();
  layer.addEventListener('touchstart', noGesture, { passive: false });
  layer.addEventListener('touchmove', noGesture, { passive: false });
  layer.addEventListener('contextmenu', noGesture);
}

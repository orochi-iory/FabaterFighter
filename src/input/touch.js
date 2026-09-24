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
 * Cablea la capa: el pad izquierdo es una ZONA ANALOGICA de 8 direcciones
 * (diagonales incluidas: salto en avance/retroceso) y los botones derechos
 * son pulsaciones independientes multi-touch.
 * opts.state    — objeto donde escribir las teclas (left/right/up/down/LP/LK/HP/HK/SP1/SP2/SUPER/MAX/GC)
 * opts.onResume — llamado en cada pulsación (desbloqueo de audio)
 * opts.onPause  — acción directa del botón pausa
 */
export function bindTouchLayer(layer, opts = {}) {
  const state = opts.state || {};
  const pid = (e) => (e.pointerId === undefined ? 0 : e.pointerId);
  const active = new Map();                       // pointerId -> { btn, key }
  const pad = layer.querySelector('.pad-left');
  const THRESH = 14;                              // px hasta considerar dirección
  const padPtr = new Map();                       // pointerId -> {x0, y0}

  /* --- zona analógica (d-pad) -------------------------------------- */
  const applyStick = (id) => {
    const p = padPtr.get(id);
    if (!p) return;
    const dx = p.x - p.x0, dy = p.y - p.y0;
    const set = (k, v) => { state[k] = v; if (v) if (opts.onResume) opts.onResume(); };
    set('left', dx < -THRESH);
    set('right', dx > THRESH);
    set('up', dy < -THRESH);
    set('down', dy > THRESH);
    // resalte visual de las flechas activas
    if (pad) {
      pad.querySelectorAll('.tbtn').forEach((b) => {
        const k = b.dataset.k;
        b.classList.toggle('tdown', !!state[k]);
      });
    }
  };
  const localXY = (e) => {
    const r = pad ? pad.getBoundingClientRect() : { left: 0, top: 0 };
    return [e.clientX - r.left, e.clientY - r.top];
  };
  if (pad) {
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pad.setPointerCapture && e.pointerId !== undefined) {
        try { pad.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      }
      const [x, y] = localXY(e);
      padPtr.set(pid(e), { x0: x, y0: y, x, y });
      applyStick(pid(e));
    });
    pad.addEventListener('pointermove', (e) => {
      const p = padPtr.get(pid(e));
      if (!p) return;
      const [x, y] = localXY(e);
      p.x = x; p.y = y;
      applyStick(pid(e));
    });
    const padOff = (e) => {
      if (!padPtr.has(pid(e))) return;
      padPtr.delete(pid(e));
      ['left', 'right', 'up', 'down'].forEach((k) => { state[k] = false; });
      if (pad) pad.querySelectorAll('.tbtn').forEach((b) => b.classList.remove('tdown'));
    };
    pad.addEventListener('pointerup', padOff);
    pad.addEventListener('pointercancel', padOff);
    pad.addEventListener('lostpointercapture', padOff);
  }

  /* --- botones discretos (ataques, sistema) ------------------------ */
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

  layer.querySelectorAll('.pad-right .tbtn, .tbtn.pz').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      capture(btn, e);
      btn.classList.add('tdown');
      active.set(pid(e), { btn, key: btn.dataset.k });
      press(btn);
    });
    const off = (e) => {
      const entry = active.get(pid(e));
      if (!entry || entry.btn !== btn) return;
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

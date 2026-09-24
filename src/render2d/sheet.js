/**
 * Tilesheets 2D: atlas + manifiesto y seleccion de animacion.
 *
 * Contrato (docs/tilesheets.md): sheets/<id>/sheet.png + sheet.json
 *   { "image": "sheet.png", "frameWidth": 96, "frameHeight": 128,
 *     "meters": 1.8, "anchorY": 2,
 *     "animations": { "p_idle": {"row":0,"frames":4,"fps":8,"loop":true}, ... } }
 *
 * Los nombres de animacion: "p_<pose>" para locomocion/estados y "mv_<id>"
 * para golpes (5HP, 2LK, jHK, especiales...). Mirando SIEMPRE a la derecha,
 * pies del personaje en anchorY pixeles sobre el borde inferior del frame.
 */

import * as THREE from '../../vendor/three.module.min.js';

/** Estado del motor -> nombre de animacion (puro, testeable). */
export function animFor(f) {
  const a = (f && f.anim) || {};
  if (a.state === 'attack' && a.move) {
    return {
      name: 'mv_' + (a.move.id || a.pose || 'X'),
      pose: a.pose || 'jab',
      phase: a.phase || 'recovery',
      t: a.frame || 0
    };
  }
  return { name: a.pose || 'idle', pose: a.pose || 'idle', phase: 'idle', t: a.frame || 0 };
}

const KICK_RE = /kick|heel|sole|roundhouse|sweep|thrust/i;
const UPPER_RE = /upper|shoryu|rising|launcher|palm|dragon/i;

export class Sheet {
  constructor(image, manifest) {
    this.image = image || null;
    this.man = manifest || {};
    this.fw = this.man.frameWidth || 96;
    this.fh = this.man.frameHeight || 128;
    this.meters = this.man.meters || 1.8;
    this.anchorY = this.man.anchorY != null ? this.man.anchorY : 2;
    this.anims = this.man.animations || {};
    this.ready = !!this.image;
    this.clocks = {};
    this.current = '';
    this.texCache = new Map();
  }

  has(name) { return !!this.anims[name]; }

  /** Elige la animacion: golpe exacto -> pose -> heuristica -> idle. */
  pick(sel) {
    if (sel.phase !== 'idle' && sel.name.startsWith('mv_')) {
      if (this.has(sel.name)) return sel.name;
    }
    if (this.has('p_' + sel.pose)) return 'p_' + sel.pose;
    if (UPPER_RE.test(sel.pose) && this.has('p_launcher')) return 'p_launcher';
    if (KICK_RE.test(sel.pose)) return this.has('p_kickH') ? 'p_kickH' : (this.has('p_kickL') ? 'p_kickL' : 'p_idle');
    if (this.has('p_' + sel.name)) return 'p_' + sel.name;
    return 'p_idle';
  }

  /** Textura del frame (name, idx) con offset de atlas. Cacheada. */
  texFor(name, idx) {
    const a = this.anims[name];
    if (!a || !this.ready) return null;
    const fi = ((idx % a.frames) + a.frames) % a.frames;
    const key = name + ':' + fi;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const tex = new THREE.Texture(this.image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;          // pixel-art nítido
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const imgW = this.image.width || this.fw;
    const imgH = this.image.height || this.fh * 32;
    const perRow = Math.max(1, Math.floor(imgW / this.fw));
    tex.repeat.set(this.fw / imgW, this.fh / imgH);
    tex.offset.set(
      ((fi % perRow) * this.fw) / imgW,
      1 - (a.row + Math.floor(fi / perRow) + 1) * (this.fh / imgH)
    );
    tex.needsUpdate = true;
    this.texCache.set(key, tex);
    return tex;
  }

  /**
   * Avanza el reloj y devuelve el frame actual.
   * sel = {name, phase}: en ataques la fase manda (0 startup, 1 active, 2 recovery).
   */
  select(sel, dt) {
    const name = this.pick(sel);
    const a = this.anims[name];
    if (!a) return null;
    if (name !== this.current) { this.current = name; this.clocks[name] = 0; }
    this.clocks[name] = (this.clocks[name] || 0) + (dt || 0);
    let idx;
    if (sel.phase !== 'idle' && !a.loop) {
      const frames = a.frames;
      idx = sel.phase === 'startup' ? 0
        : sel.phase === 'active' ? Math.min(1, frames - 1)
        : frames - 1;
    } else {
      idx = Math.floor(this.clocks[name] * (a.fps || 8));
    }
    const tex = this.texFor(name, idx);
    if (!tex) return null;
    const hM = this.meters;
    const wM = (this.fw / this.fh) * hM;
    return { tex, wM, hM, anchorM: (this.anchorY / this.fh) * hM };
  }
}

/** Carga el sheet real del personaje si existe (null si no). */
export async function loadSheet(id) {
  if (typeof fetch === 'undefined' || typeof Image === 'undefined') return null;
  try {
    const res = await fetch('sheets/' + id + '/sheet.json');
    if (!res.ok) return null;
    const man = await res.json();
    const img = new Image();
    img.src = 'sheets/' + id + '/' + (man.image || 'sheet.png');
    if (img.decode) await img.decode(); else await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; });
    return new Sheet(img, man);
  } catch (e) {
    return null;
  }
}

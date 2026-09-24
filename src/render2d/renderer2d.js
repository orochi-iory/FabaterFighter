/**
 * Renderer 2D: sprites estilo tilesheet sobre el mismo escenario, camara,
 * FX y HUD del juego (estilo KOF XIII / SFZ: personajes 2D, mundo con
 * profundidad). Envuelve GameView y sustituye los cuerpos riggeados por
 * planos con el frame de animacion correspondiente.
 *
 * Hoja del personaje: sheets/<id>/sheet.png + sheet.json (docs/tilesheets.md);
 * si no existe, se genera una hoja provisional con la paleta del personaje.
 *
 * Activalo con ?render=2d en la URL.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { GameView } from '../render/renderer.js';
import { Sheet, loadSheet, animFor } from './sheet.js';
import { placeholderSheet } from './placeholder.js';

export class Renderer2D {
  constructor(canvas, opts = {}) {
    this.kind = '2d';
    this.base = new GameView(canvas, opts);
    this.views = [];
  }

  /* --- pasarela de la API de GameView ------------------------------ */
  get canvas() { return this.base.canvas; }
  get renderer() { return this.base.renderer; }
  get scene() { return this.base.scene; }
  get camera() { return this.base.camera; }
  get fx() { return this.base.fx; }
  get stage() { return this.base.stage; }
  get debugBoxes() { return this.base.debugBoxes; }
  set debugBoxes(v) { this.base.debugBoxes = v; }
  get superMood() { return this.base.superMood; }
  set superMood(v) { this.base.superMood = v; }
  get overlayColor() { return this.base.overlayColor; }
  resize() { this.base.resize(); }
  setStage(theme) { this.base.setStage(theme); }
  makeDebugBoxes() { return this.base.makeDebugBoxes(); }
  handleEvent(e, match) { this.base.handleEvent(e, match); }

  /* --- luchadores: rig oculto + sprite ------------------------------ */
  setFighters(defs) {
    this.base.setFighters(defs);
    for (const rig of this.base.rigs) rig.root.visible = false;   // sin cuerpo 3D
    for (const v of this.views) {
      this.base.scene.remove(v.plane);
      this.base.scene.remove(v.shadow);
      if (v.plane.geometry) v.plane.geometry.dispose();
      v.plane.material.dispose();
    }
    this.views = defs.map((def, idx) => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide })
      );
      plane.visible = false;
      plane.renderOrder = 6 + idx;
      this.base.scene.add(plane);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.34, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.013;
      shadow.scale.x = 1.35;
      this.base.scene.add(shadow);
      const view = { def, idx, plane, shadow, sheet: null, facing: 1 };
      // hoja provisional inmediata; la real (si existe) llega en cuanto cargue
      view.sheet = placeholderSheet(def);
      loadSheet(def.id).then((real) => {
        if (real) view.sheet = real;
      });
      return view;
    });
  }

  /* --- bucle --------------------------------------------------------- */
  frame(match, dt) {
    const b = this.base;
    if (match && match.fighters) {
      b.fx.syncProjectiles(match.projectiles);
      b.updateCamera(match, dt);
      b.stage.setSuperMood(b.superMood, b.overlayColor.getStyle());
      this.updateSprites(match.fighters, dt);
    } else {
      this.updateSprites(null, dt);
    }
    b.superMood = Math.max(0, b.superMood - dt * 1.6);
    b.stage.update(dt, match);
    b.fx.update(dt);
    if (b.debugBoxes && match) b.updateDebug(match);
    b.renderer.render(b.scene, b.camera);
  }

  updateSprites(fighters, dt) {
    for (const v of this.views) {
      const f = fighters ? fighters[v.idx] : null;
      if (!f || !v.sheet || !v.sheet.ready) {
        v.plane.visible = false;
        v.shadow.visible = !!f;
        if (f) v.shadow.position.set(f.x, 0.013, 0);
        continue;
      }
      const sel = v.sheet.select(animFor(f), dt);
      if (!sel) { v.plane.visible = false; continue; }
      v.plane.visible = true;
      const mat = v.plane.material;
      if (mat.map !== sel.tex) { mat.map = sel.tex; mat.needsUpdate = true; }
      if (v.plane.geometry.parameters.width !== sel.wM) {
        v.plane.geometry.dispose();
        v.plane.geometry = new THREE.PlaneGeometry(sel.wM, sel.hM);
      }
      const feet = f.y - sel.anchorM;
      v.plane.position.set(f.x, feet + sel.hM / 2, 0.08 + v.idx * 0.05);
      const face = (f.facing || 1) < 0 ? -1 : 1;
      if (face !== v.facing) { v.facing = face; }
      v.plane.scale.x = face;
      // sombra: mas pequena cuanto mas alto salte
      const h = Math.max(0, f.y || 0);
      v.shadow.visible = true;
      v.shadow.position.set(f.x, 0.013, 0);
      const s = Math.max(0.45, 1 - h * 0.22);
      v.shadow.scale.set(1.35 * s, s, 1);
      v.shadow.material.opacity = Math.max(0.08, 0.3 - h * 0.06);
    }
  }
}

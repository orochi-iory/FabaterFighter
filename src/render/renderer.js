/**
 * Capa de render: Three.js, cámara dinámica y conexión con el motor.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { Stage } from './stage.js';
import { FX } from './fx.js';
import { Rig } from './rig.js';
import { STAGE_HALF } from '../game/constants.js';

export class GameView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.renderer = opts.renderer || new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
    this.camera.position.set(0, 2.6, 10);
    this.camera.lookAt(0, 1.3, 0);

    this.stage = new Stage(this.scene);
    this.fx = new FX(this.scene);
    this.rigs = [];
    this.overlayColor = new THREE.Color('#220033');
    this.superMood = 0;
    this.camTarget = new THREE.Vector3(0, 1.3, 0);
    this.camPos = new THREE.Vector3(0, 2.6, 10);
    this.shakeT = 0;
    this.zoomBoost = 1;
    this.debugBoxes = opts.debug ? this.makeDebugBoxes() : null;
    this.resize();
  }

  makeDebugBoxes() {
    const mk = (color) => {
      const m = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.LineBasicMaterial({ color })
      );
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    return {
      hurt: [mk(0x33ff66), mk(0x33ff66)],
      hit: [mk(0xff3355), mk(0xff3355)]
    };
  }

  /** Cambia de escenario (un tema aleatorio por combate). */
  setStage(theme) {
    if (this.stage) {
      this.scene.remove(this.stage.group);
      this.stage.group.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isSprite) {
          if (o.geometry) o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else if (m) { if (m.map) m.map.dispose(); m.dispose(); }
        }
      });
    }
    this.stage = new Stage(this.scene, { theme });
  }

  setFighters(defs) {
    for (const r of this.rigs) this.scene.remove(r.root);
    this.rigs = defs.map((d) => {
      const rig = new Rig(d);
      this.scene.add(rig.root);
      return rig;
    });
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- */
  frame(match, dt) {
    if (match) {
      for (let i = 0; i < this.rigs.length && i < match.fighters.length; i++) {
        this.rigs[i].update(match.fighters[i], dt, match.fighters[1 - i]);
      }
      this.fx.syncProjectiles(match.projectiles);
      this.updateCamera(match, dt);
      this.stage.setSuperMood(this.superMood, this.overlayColor.getStyle());
    } else {
      for (const r of this.rigs) {
        r.update({ x: r.root.position.x, y: 0, vx: 0, vy: 0, facing: 1, airborne: false, anim: { state: 'idle', pose: 'idle', frame: 0 }, maxMode: 0, hitFlash: 0 }, dt);
      }
    }
    this.superMood = Math.max(0, this.superMood - dt * 1.6);
    this.stage.update(dt, match);
    this.fx.update(dt);
    if (this.debugBoxes && match) this.updateDebug(match);
    this.renderer.render(this.scene, this.camera);
  }

  updateDebug(match) {
    const db = this.debugBoxes;
    for (let i = 0; i < 2; i++) {
      const f = match.fighters[i];
      const hb = f.hurtbox();
      const m = db.hurt[i];
      m.visible = true;
      m.position.set((hb.x0 + hb.x1) / 2, (hb.y0 + hb.y1) / 2, 0);
      m.scale.set(hb.x1 - hb.x0, hb.y1 - hb.y0, 0.5);
      const boxes = f.activeHitboxes();
      const hm = db.hit[i];
      if (boxes.length) {
        const b = boxes[0].box;
        hm.visible = true;
        hm.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0);
        hm.scale.set(b.x1 - b.x0, b.y1 - b.y0, 0.5);
      } else hm.visible = false;
    }
  }

  updateCamera(match, dt) {
    const [a, b] = match.fighters;
    const mid = (a.x + b.x) / 2;
    const sep = Math.abs(a.x - b.x);
    const topY = Math.max(a.y, b.y);

    let dist = 6.0 + sep * 0.72;
    dist = Math.max(6.4, Math.min(13.5, dist));
    if (match.hitstop > 0 && match.superFlash) dist *= 0.78;
    if (match.slowmo > 0) dist *= 0.9;
    dist *= this.zoomBoost;

    const height = 2.35 + topY * 0.42 + Math.max(0, sep - 6) * 0.1;
    const targetX = mid * 0.78;
    const maxShift = Math.max(0, STAGE_HALF - dist * 0.42);
    const cx = Math.max(-maxShift, Math.min(maxShift, targetX));

    this.camPos.x += (cx - this.camPos.x) * Math.min(1, dt * 6);
    this.camPos.y += (height - this.camPos.y) * Math.min(1, dt * 6);
    this.camPos.z += (dist - this.camPos.z) * Math.min(1, dt * 4);

    this.camTarget.x += (mid * 0.85 - this.camTarget.x) * Math.min(1, dt * 7);
    this.camTarget.y += (1.25 + topY * 0.35 - this.camTarget.y) * Math.min(1, dt * 6);

    // Sacudida
    if (match.shake > 0.01) {
      this.shakeT += dt * 60;
      const s = match.shake * 0.16;
      this.camera.position.set(
        this.camPos.x + Math.sin(this.shakeT * 1.7) * s,
        this.camPos.y + Math.cos(this.shakeT * 2.3) * s,
        this.camPos.z
      );
    } else {
      this.camera.position.copy(this.camPos);
    }
    this.camera.lookAt(this.camTarget);

    // Zoom adicional con el fov para los supers
    const fov = match.superFlash ? 34 : 40;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  }

  /* ---------------------------------------------------------------- */
  /** Reacciona a los eventos del motor. */
  handleEvent(e, match) {
    const f = match ? match.fighters[e.player ?? 0] : null;
    switch (e.type) {
      case 'hit':
      case 'counter':
        this.fx.burst(e.x, e.y, 0.1, e.color || '#ffd166', e.counter ? 1.6 : 1);
        if (e.counter) this.fx.slash(e.x, e.y, 0.1, '#ff5555', 1);
        break;
      case 'block':
        this.fx.block(e.x, e.y, 0.1);
        break;
      case 'parry':
      case 'parryProjectile':
        this.fx.parry(e.x, e.y, 0.15);
        this.superMood = Math.max(this.superMood, 0.5);
        break;
      case 'projectileSpawn':
        this.fx.emit(e.x, e.y, 0, { count: 14, speed: 0.08, color: e.color, size: 0.22, life: 20, gravity: 0 });
        break;
      case 'projectileHit':
        this.fx.burst(e.x, e.y, 0.1, e.color || '#ffffff', e.result === 'block' ? 0.6 : 1.1);
        break;
      case 'superFlash':
        this.superMood = 1;
        this.overlayColor.set(e.move.fxColor || '#ff2288');
        this.fx.emit(f ? f.x : 0, 1.2, 0.2, { count: 90, speed: 0.3, color: e.move.fxColor || '#ffffff', size: 0.3, life: 46, gravity: 0 });
        this.fx.ring(f ? f.x : 0, 1.2, 0.2, e.move.fxColor || '#ffffff', 2.4);
        break;
      case 'land':
        if (f && e.hard) this.fx.dust(f.x, 0.05, 0, 16);
        break;
      case 'dash':
      case 'roll':
        if (f) this.fx.dust(f.x, 0.05, 0, 10);
        break;
      case 'jump':
        if (f) this.fx.dust(f.x, 0.05, 0, 6);
        break;
      case 'teleport':
        this.fx.emit(e.from, 1.1, 0, { count: 34, speed: 0.14, color: f ? f.def.fx : '#aa88ff', size: 0.24, life: 26, gravity: 0 });
        this.fx.emit(e.to, 1.1, 0, { count: 34, speed: 0.14, color: f ? f.def.fx : '#aa88ff', size: 0.24, life: 26, gravity: 0 });
        break;
      case 'maxActivate':
        if (f) {
          this.superMood = Math.max(this.superMood, 0.7);
          this.overlayColor.set(f.def.fx);
          for (let i = 0; i < 5; i++) {
            this.fx.emit(f.x, 0.2 + i * 0.35, 0, { count: 16, speed: 0.12, color: f.def.fx, size: 0.24, life: 34, gravity: -0.001 });
          }
          this.fx.ring(f.x, 1.0, 0.1, f.def.fx, 1.8);
        }
        break;
      case 'ko':
        this.fx.burst(match.fighters[e.loser].x, 1.2, 0.1, '#ffffff', 2.2);
        this.superMood = 1;
        break;
      case 'guardCrush':
        if (f) this.fx.burst(f.x, 1.3, 0.1, '#ffcc33', 1.4);
        break;
      case 'dizzy':
        if (f) this.fx.emit(f.x, 2.0, 0, { count: 20, speed: 0.06, color: '#ffee55', size: 0.2, life: 40, gravity: -0.0008 });
        break;
      case 'reflect':
      case 'counter':
        this.fx.ring(e.x, e.y, 0.1, '#aef7ff', 1.4);
        break;
      case 'throwHit':
      case 'thrown':
        if (e.x !== undefined) this.fx.burst(e.x, e.y, 0.1, '#ff9955', 1.3);
        break;
      case 'dot':
        if (f) this.fx.emit(f.x, 1.2, 0, { count: 6, speed: 0.04, color: '#ff6633', size: 0.2, life: 20 });
        break;
      default: break;
    }
  }
}

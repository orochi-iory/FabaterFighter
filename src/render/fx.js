/**
 * Efectos visuales: sistema de partículas, proyectiles y destellos.
 */

import * as THREE from '../../vendor/three.module.min.js';

const MAX_PARTICLES = 2600;

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 pcolor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = pcolor;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (340.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.count = MAX_PARTICLES;
    this.cursor = 0;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.col = new Float32Array(this.count * 3);
    this.siz = new Float32Array(this.count);
    this.alp = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    this.maxLife = new Float32Array(this.count);
    this.grav = new Float32Array(this.count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.siz, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.projectileMeshes = new Map();
    this.decals = [];
    this.tmpColor = new THREE.Color();
  }

  /* ---------------------------------------------------------------- */
  emit(x, y, z, opts = {}) {
    const n = opts.count ?? 12;
    const speed = opts.speed ?? 0.09;
    const spread = opts.spread ?? 1;
    const life = opts.life ?? 26;
    const size = opts.size ?? 0.16;
    const gravity = opts.gravity ?? 0.0016;
    const color = this.tmpColor.set(opts.color || '#ffffff');
    for (let i = 0; i < n; i++) {
      const idx = this.cursor = (this.cursor + 1) % this.count;
      const i3 = idx * 3;
      this.pos[i3] = x + (Math.random() - 0.5) * 0.1;
      this.pos[i3 + 1] = y + (Math.random() - 0.5) * 0.1;
      this.pos[i3 + 2] = z + (Math.random() - 0.5) * 0.1;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.35 + Math.random());
      this.vel[i3] = Math.cos(a) * Math.cos(b) * s * (opts.dirX !== undefined ? Math.sign(opts.dirX || 1) * 1.2 : 1);
      this.vel[i3 + 1] = Math.sin(b) * s + (opts.up ?? 0.02);
      this.vel[i3 + 2] = Math.sin(a) * Math.cos(b) * s * 0.5;
      this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
      this.siz[idx] = size * (0.6 + Math.random() * 0.9);
      this.life[idx] = life * (0.6 + Math.random() * 0.6);
      this.maxLife[idx] = this.life[idx];
      this.alp[idx] = 1;
      this.grav[idx] = gravity;
    }
  }

  burst(x, y, z, color, power = 1) {
    this.emit(x, y, z, { count: Math.round(20 * power), speed: 0.16 * power, color, size: 0.2, life: 24 });
    this.emit(x, y, z, { count: Math.round(8 * power), speed: 0.05, color: '#ffffff', size: 0.34, life: 12, gravity: 0 });
    this.ring(x, y, z, color);
  }

  block(x, y, z, color) {
    this.emit(x, y, z, { count: 14, speed: 0.08, color: '#9fd8ff', size: 0.16, life: 16, spread: 0.4 });
    this.ring(x, y, z, '#bfe6ff', 0.7);
  }

  parry(x, y, z) {
    this.emit(x, y, z, { count: 26, speed: 0.13, color: '#ffffff', size: 0.2, life: 22, gravity: 0 });
    this.emit(x, y, z, { count: 12, speed: 0.05, color: '#8fe9ff', size: 0.42, life: 18, gravity: 0 });
    this.ring(x, y, z, '#ffffff', 1.5);
  }

  dust(x, y, z, n = 8) {
    this.emit(x, y + 0.05, z, { count: n, speed: 0.05, color: '#c9b9a0', size: 0.22, life: 22, gravity: 0.0006, up: 0.02 });
  }

  ring(x, y, z, color, scale = 1) {
    const geo = new THREE.RingGeometry(0.25, 0.42, 24);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.95,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    m.position.set(x, y, z + 0.05);
    m.scale.setScalar(scale);
    this.group.add(m);
    this.decals.push({ mesh: m, life: 16, max: 16, grow: 0.22 * scale, spin: 0.12 });
  }

  slash(x, y, z, color, dir = 1) {
    const geo = new THREE.RingGeometry(0.5, 0.72, 20, 1, -0.9, 1.8);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    m.position.set(x, y, z + 0.08);
    m.rotation.z = Math.random() * 3.14;
    m.scale.x = dir;
    this.group.add(m);
    this.decals.push({ mesh: m, life: 12, max: 12, grow: 0.16, spin: 0.3 });
  }

  /* ---------------------------------------------------------------- */
  /** Crea/actualiza la malla de un proyectil. */
  syncProjectile(p) {
    let entry = this.projectileMeshes.get(p);
    if (!entry) {
      entry = { group: this.makeProjectileMesh(p), trail: 0 };
      this.projectileMeshes.set(p, entry);
      this.group.add(entry.group);
    }
    entry.group.position.set(p.x, p.y, 0);
    entry.group.rotation.z += 0.25;
    entry.group.scale.setScalar(1 + Math.sin(performance.now() * 0.02) * 0.06);
    // Estela
    entry.trail++;
    if (entry.trail % 2 === 0) {
      this.emit(p.x, p.y, 0, {
        count: 3, speed: 0.02, color: p.color, size: 0.2, life: 16, gravity: 0
      });
    }
  }

  makeProjectileMesh(p) {
    const g = new THREE.Group();
    const c = new THREE.Color(p.color);
    const core = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    const w = p.box.w, h = p.box.h;
    switch (p.fx) {
      case 'flame': {
        for (let i = 0; i < 5; i++) {
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.2 + Math.random() * 0.16, 8, 6), i % 2 ? core : glow);
          s.position.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.4, 0);
          g.add(s);
        }
        break;
      }
      case 'blade': {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w * 1.2, 0.1, 0.05), core);
        g.add(b);
        const halo = new THREE.Mesh(new THREE.BoxGeometry(w * 1.4, 0.3, 0.04), glow);
        g.add(halo);
        break;
      }
      case 'bolt': {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.16, w, 6), core);
        b.rotation.z = -Math.PI / 2 * (p.facing || 1);
        g.add(b);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), glow));
        break;
      }
      case 'beam': {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.5, 0.2), core);
        g.add(b);
        const halo = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h, 0.15), glow);
        g.add(halo);
        break;
      }
      case 'kunai': {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.8, roughness: 0.3 }));
        g.add(b);
        break;
      }
      default: {
        const s = new THREE.Mesh(new THREE.SphereGeometry(Math.max(w, h) * 0.5, 12, 10), core);
        g.add(s);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(Math.max(w, h) * 0.8, 12, 10), glow);
        g.add(halo);
      }
    }
    return g;
  }

  removeProjectile(p) {
    const e = this.projectileMeshes.get(p);
    if (!e) return;
    this.group.remove(e.group);
    e.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.projectileMeshes.delete(p);
  }

  syncProjectiles(list) {
    for (const p of list) this.syncProjectile(p);
    for (const [key] of [...this.projectileMeshes]) {
      if (!list.includes(key)) this.removeProjectile(key);
    }
  }

  /* ---------------------------------------------------------------- */
  update(dt) {
    const step = dt * 60;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { if (this.alp[i] !== 0) this.alp[i] = 0; continue; }
      this.life[i] -= step;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * step;
      this.pos[i3] += this.vel[i3] * step;
      this.pos[i3 + 1] += this.vel[i3 + 1] * step;
      this.pos[i3 + 2] += this.vel[i3 + 2] * step;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alp[i] = t;
      this.siz[i] *= (1 - 0.008 * step);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= step;
      const t = d.life / d.max;
      d.mesh.scale.multiplyScalar(1 + d.grow * step * 0.4);
      d.mesh.rotation.z += d.spin * step * 0.1;
      d.mesh.material.opacity = Math.max(0, t);
      if (d.life <= 0) {
        this.group.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        this.decals.splice(i, 1);
      }
    }
  }

  clear() {
    for (const [k] of [...this.projectileMeshes]) this.removeProjectile(k);
    this.life.fill(0);
    this.alp.fill(0);
  }
}

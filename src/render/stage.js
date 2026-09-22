/**
 * Escenario 3D: templo nocturno con gradas, antorchas y cielo procedural.
 * Todo se genera con primitivas y texturas creadas en un canvas 2D.
 */

import * as THREE from '../../vendor/three.module.min.js';

function canvasTexture(size, draw) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return null;
  c.width = size; c.height = size;
  let ctx = null;
  try { ctx = typeof c.getContext === 'function' ? c.getContext('2d') : null; } catch (e) { ctx = null; }
  if (!ctx) return null;                 // entornos sin canvas 2D (tests en Node)
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stage {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.torches = [];
    this.time = 0;
    this.build(opts);
  }

  build(opts) {
    const g = this.group;

    // --- Cielo degradado ---
    const skyGeo = new THREE.SphereGeometry(60, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#0a0f2b') },
        mid: { value: new THREE.Color('#3b1d52') },
        bot: { value: new THREE.Color('#c2452d') }
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
        void main(){
          float h = normalize(vP).y;
          vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid, bot, smoothstep(0.0, -0.35, h));
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(skyGeo, skyMat);
    g.add(this.sky);

    // --- Luna ---
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.9, fog: false }));
    moon.position.set(-14, 17, -40);
    g.add(moon);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, fog: false }));
    halo.position.set(-14, 17, -40.1);
    g.add(halo);

    // --- Suelo ---
    const floorTex = canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = '#2b2536';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo((i * s) / 8, 0); ctx.lineTo((i * s) / 8, s); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (i * s) / 8); ctx.lineTo(s, (i * s) / 8); ctx.stroke();
      }
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    });
    if (floorTex) { floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 6); }
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a3f5c, roughness: 0.85, metalness: 0.05 });
    if (floorTex) floorMat.map = floorTex;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    g.add(floor);

    // Zona de combate (tarima)
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.18, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.7 })
    );
    platform.position.set(0, 0.09, 0);
    g.add(platform);
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(18.3, 0.08, 6.3),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6, emissive: 0x332200 })
    );
    edge.position.set(0, 0.02, 0);
    g.add(edge);

    // --- Muro del fondo ---
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(44, 16, 1),
      new THREE.MeshStandardMaterial({ color: 0x241c33, roughness: 0.95 })
    );
    wall.position.set(0, 7, -9);
    g.add(wall);

    // Columnas
    const colMat = new THREE.MeshStandardMaterial({ color: 0x8d2f2f, roughness: 0.6 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.4, metalness: 0.5 });
    for (let i = -3; i <= 3; i++) {
      const x = i * 5.6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 9, 12), colMat);
      col.position.set(x, 4.5, -7.6);
      g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), capMat);
      cap.position.set(x, 9.1, -7.6);
      g.add(cap);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), capMat);
      base.position.set(x, 0.25, -7.6);
      g.add(base);
    }

    // Tejado
    const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x1b1526, roughness: 0.9 }));
    roof.position.set(0, 9.8, -7.6);
    g.add(roof);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(48, 0.6, 3),
      new THREE.MeshStandardMaterial({ color: 0x2a2038 }));
    roof2.position.set(0, 10.6, -7.0);
    roof2.rotation.x = -0.12;
    g.add(roof2);

    // Farolillos colgantes
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xff8844, emissive: 0xff5522, emissiveIntensity: 1.4, roughness: 0.4
    });
    for (let i = -4; i <= 4; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lanternMat);
      l.position.set(i * 3.6, 8.2 - Math.abs(i) * 0.12, -6.2);
      l.scale.y = 1.25;
      g.add(l);
      const light = new THREE.PointLight(0xff7733, 6, 9, 2);
      light.position.copy(l.position);
      g.add(light);
      this.torches.push({ light, base: 6, phase: Math.random() * 6.28, mesh: l });
    }

    // Banderas
    const flagColors = [0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.2),
        new THREE.MeshStandardMaterial({
          color: flagColors[i], side: THREE.DoubleSide, roughness: 0.9,
          emissive: flagColors[i], emissiveIntensity: 0.12
        }));
      f.position.set(-10.5 + i * 7, 5.6, -8.4);
      g.add(f);
    }

    // --- Público (instanciado) ---
    const crowdGeo = new THREE.BoxGeometry(0.42, 0.72, 0.34);
    const crowdMat = new THREE.MeshStandardMaterial({ color: 0x14121f, roughness: 1 });
    const N = 260;
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, N);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / 26);
      const col = i % 26;
      dummy.position.set(-12.5 + col * 1.0 + Math.random() * 0.3, 0.5 + row * 0.75, -5.5 - row * 1.1);
      dummy.rotation.y = Math.random() * 0.6 - 0.3;
      dummy.scale.setScalar(0.9 + Math.random() * 0.3);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true;
    g.add(crowd);
    this.crowd = crowd;
    this.crowdBase = [];
    for (let i = 0; i < N; i++) this.crowdBase.push(0.5 + Math.floor(i / 26) * 0.75);

    // Vallas laterales
    for (const s of [-1, 1]) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x2d2440, roughness: 0.9 }));
      fence.position.set(s * 13.5, 1.7, -2);
      g.add(fence);
    }

    // --- Luces ---
    const amb = new THREE.AmbientLight(0x7f88c9, 0.85);
    g.add(amb);
    const hemi = new THREE.HemisphereLight(0x9fb4ff, 0x3a2a44, 0.9);
    g.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
    key.position.set(4, 10, 8);
    g.add(key);
    const rim = new THREE.DirectionalLight(0x66aaff, 0.9);
    rim.position.set(-6, 5, -6);
    g.add(rim);
    const spot = new THREE.SpotLight(0xffffff, 60, 40, 0.7, 0.5, 1.4);
    spot.position.set(0, 12, 6);
    spot.target.position.set(0, 1, 0);
    g.add(spot);
    g.add(spot.target);
    this.spot = spot;
    this.ambient = amb;

    // Niebla
    this.scene.fog = new THREE.Fog(0x1a1430, 16, 52);
    this.baseFog = this.scene.fog.color.clone();
  }

  /** Fondo dramático durante los supers. */
  setSuperMood(t, color) {
    if (!this.sky) return;
    const u = this.sky.material.uniforms;
    const k = Math.min(1, t);
    u.top.value.set('#0a0f2b').lerp(new THREE.Color(color || '#2a0040'), k * 0.8);
    u.mid.value.set('#3b1d52').lerp(new THREE.Color(color || '#550066'), k * 0.85);
    this.ambient.intensity = 0.85 + k * 0.6;
  }

  update(dt, match) {
    this.time += dt;
    for (const t of this.torches) {
      const f = 0.75 + Math.sin(this.time * 7 + t.phase) * 0.14 + Math.sin(this.time * 13 + t.phase * 2) * 0.09;
      t.light.intensity = t.base * f;
    }
    // Público que salta cuando pasa algo importante.
    const hype = match ? Math.min(1, match.shake * 0.8 + (match.slowmo > 0 ? 0.7 : 0)) : 0;
    if (this.crowd) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.crowd.count; i += 3) {
        const row = Math.floor(i / 26);
        const col = i % 26;
        const bounce = Math.sin(this.time * 5 + i) * 0.06 * (0.3 + hype);
        dummy.position.set(-12.5 + col * 1.0, this.crowdBase[i] + bounce, -5.5 - row * 1.1);
        dummy.rotation.y = Math.sin(this.time * 2 + i) * 0.2;
        dummy.scale.setScalar(0.95);
        dummy.updateMatrix();
        this.crowd.setMatrixAt(i, dummy.matrix);
      }
      this.crowd.instanceMatrix.needsUpdate = true;
    }
  }
}

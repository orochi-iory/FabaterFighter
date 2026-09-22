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
    floor.position.set(0, -0.18, 0);   // el suelo exterior queda bajo la tarima
    floor.receiveShadow = true;
    g.add(floor);

    // Zona de combate (tarima de madera con emblema del torneo)
    const woodTex = canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = '#6b4f3a';
      ctx.fillRect(0, 0, s, s);
      const plank = s / 8;
      for (let p = 0; p < 8; p++) {
        const y = p * plank;
        const tone = 0.85 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(${Math.round(107 * tone)},${Math.round(79 * tone)},${Math.round(58 * tone)},1)`;
        ctx.fillRect(0, y + 2, s, plank - 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,170,0.08)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, y + 4); ctx.lineTo(s, y + 4); ctx.stroke();
        for (let gr = 0; gr < 14; gr++) {         // vetas
          ctx.strokeStyle = `rgba(40,25,12,${0.06 + Math.random() * 0.10})`;
          ctx.lineWidth = 1 + Math.random() * 2;
          const gy = y + 6 + Math.random() * (plank - 12);
          ctx.beginPath();
          ctx.moveTo(Math.random() * s * 0.3, gy);
          ctx.bezierCurveTo(s * 0.4, gy + (Math.random() - 0.5) * 8, s * 0.7, gy + (Math.random() - 0.5) * 8, s, gy + (Math.random() - 0.5) * 6);
          ctx.stroke();
        }
      }
    });
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4e, roughness: 0.72 });
    if (woodTex) platformMat.map = woodTex;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(18, 0.18, 6), platformMat);
    platform.position.set(0, -0.09, 0);  // superficie de combate en y=0
    platform.receiveShadow = true;
    g.add(platform);
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(18.3, 0.08, 6.3),
      new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.6, emissive: 0x332200 })
    );
    edge.position.set(0, -0.05, 0);
    g.add(edge);
    // Emblema pintado en el centro del tatami
    const emblemTex = canvasTexture(256, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const c = s / 2;
      ctx.strokeStyle = 'rgba(212,175,55,0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(c, c, s * 0.44, 0, 6.283); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c, c, s * 0.36, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(212,175,55,0.85)';
      ctx.beginPath();                              // estrella de 8 puntas
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? s * 0.26 : s * 0.10;
        const a = (i * Math.PI) / 8 - Math.PI / 2;
        ctx[i === 0 ? 'moveTo' : 'lineTo'](c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(c, c, s * 0.48, 0.35, 1.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, s * 0.48, 3.5, 4.35); ctx.stroke();
    });
    if (emblemTex) {
      const emblem = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2),
        new THREE.MeshStandardMaterial({
          map: emblemTex, transparent: true, roughness: 0.5,
          depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3
        }));
      emblem.rotation.x = -Math.PI / 2;
      emblem.position.set(0, 0.006, 0);
      emblem.renderOrder = 1;
      g.add(emblem);
    }

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
      col.position.set(x, 4.32, -7.6);
      g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), capMat);
      cap.position.set(x, 8.92, -7.6);
      g.add(cap);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), capMat);
      base.position.set(x, 0.07, -7.6);
      g.add(base);
    }

    // Tejado
    const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x1b1526, roughness: 0.9 }));
    roof.position.set(0, 9.62, -7.6);
    g.add(roof);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(48, 0.6, 3),
      new THREE.MeshStandardMaterial({ color: 0x2a2038 }));
    roof2.position.set(0, 10.42, -7.0);
    roof2.rotation.x = -0.12;
    g.add(roof2);

    // Estrellas en el cielo (solo hemisferio superior, parpadean suaves)
    {
      const SN = 240;
      const sp = new Float32Array(SN * 3);
      for (let i = 0; i < SN; i++) {
        const a = Math.random() * Math.PI * 2;
        const el = 0.12 + Math.random() * 1.25;     // cerca del cénit
        const r = 52;
        sp[i * 3] = Math.cos(a) * Math.cos(el) * r;
        sp[i * 3 + 1] = Math.sin(el) * r;
        sp[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0xdde6ff, size: 0.35, sizeAttenuation: true,
        transparent: true, opacity: 0.8, fog: false, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      g.add(this.stars);
    }

    // Farolillos colgantes con halo luminoso
    const glowTex = canvasTexture(64, (ctx, s) => {
      const grd = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,200,120,0.9)');
      grd.addColorStop(0.4, 'rgba(255,140,60,0.35)');
      grd.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, s, s);
    });
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xff8844, emissive: 0xff5522, emissiveIntensity: 1.4, roughness: 0.4
    });
    for (let i = -4; i <= 4; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lanternMat);
      l.position.set(i * 3.6, 8.2 - Math.abs(i) * 0.12, -6.2);
      l.scale.y = 1.25;
      g.add(l);
      if (glowTex) {
        const haloS = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false, opacity: 0.8
        }));
        haloS.scale.setScalar(1.9);
        haloS.position.copy(l.position);
        g.add(haloS);
      }
      const light = new THREE.PointLight(0xff7733, 6, 9, 2);
      light.position.copy(l.position);
      g.add(light);
      this.torches.push({ light, base: 6, phase: Math.random() * 6.28, mesh: l });
    }

    // Banderas con degradado y emblema (ondean en update)
    const flagColors = [0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32];
    this.flags = [];
    for (let i = 0; i < 4; i++) {
      const ftex = canvasTexture(128, (ctx, s) => {
        const hex = flagColors[i];
        const r = (hex >> 16) & 255, gg = (hex >> 8) & 255, b = hex & 255;
        const grd = ctx.createLinearGradient(0, 0, 0, s);
        grd.addColorStop(0, `rgb(${r},${gg},${b})`);
        grd.addColorStop(1, `rgb(${(r * 0.45) | 0},${(gg * 0.45) | 0},${(b * 0.45) | 0})`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(255,215,120,0.9)';
        ctx.lineWidth = 5;
        ctx.strokeRect(6, 6, s - 12, s - 12);
        ctx.beginPath(); ctx.arc(s / 2, s * 0.34, s * 0.2, 0, 6.283); ctx.stroke();
        ctx.beginPath();                          // rombo interior
        ctx.moveTo(s / 2, s * 0.22); ctx.lineTo(s * 0.6, s * 0.34);
        ctx.lineTo(s / 2, s * 0.46); ctx.lineTo(s * 0.4, s * 0.34);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,160,0.85)';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,215,120,0.75)';
        for (let k = 0; k < 3; k++) ctx.fillRect(s * 0.3, s * (0.62 + k * 0.09), s * 0.4, 6);
      });
      const fmat = new THREE.MeshStandardMaterial({
        color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9,
        emissive: flagColors[i], emissiveIntensity: 0.12
      });
      if (ftex) fmat.map = ftex; else fmat.color.setHex(flagColors[i]);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.2), fmat);
      f.position.set(-10.5 + i * 7, 5.6, -8.4);
      g.add(f);
      this.flags.push(f);
    }

    // --- Público (instanciado: torsos de colores variados + cabezas) ---
    const crowdGeo = new THREE.BoxGeometry(0.42, 0.72, 0.34);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 1 });
    const N = 260;
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, N);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const dummy = new THREE.Object3D();
    const cCol = new THREE.Color();
    const clothTones = ['#231d33', '#1c2740', '#3a1c2a', '#26331f', '#33241c', '#1f2c30', '#2b2138', '#3d2b4f'];
    const skinTones = ['#c68642', '#f2cdb0', '#8d5524', '#e0ac69', '#5c3a21', '#ffdbac', '#a9714b'];
    this.crowdData = [];
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / 26);
      const col = i % 26;
      const d = {
        x: -12.5 + col * 1.0 + Math.random() * 0.3,
        y: 0.18 + row * 0.75,
        z: -5.5 - row * 1.1,
        rot: Math.random() * 0.6 - 0.3,
        sc: 0.9 + Math.random() * 0.3
      };
      this.crowdData.push(d);
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.setScalar(d.sc);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      dummy.position.y = d.y + 0.48 * d.sc;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      cCol.set(clothTones[(i * 5 + row) % clothTones.length]).multiplyScalar(0.55 + Math.random() * 0.6);
      crowd.setColorAt(i, cCol);
      cCol.set(skinTones[(i * 7) % skinTones.length]).multiplyScalar(0.8 + Math.random() * 0.25);
      heads.setColorAt(i, cCol);
    }
    crowd.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    g.add(crowd);
    g.add(heads);
    this.crowd = crowd;
    this.crowdHeads = heads;

    // Vallas laterales
    for (const s of [-1, 1]) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x2d2440, roughness: 0.9 }));
      fence.position.set(s * 13.5, 1.52, -2);
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
    if (this.stars) this.stars.material.opacity = 0.7 + Math.sin(this.time * 0.9) * 0.15;
    if (this.flags) {
      for (let i = 0; i < this.flags.length; i++) {
        this.flags[i].rotation.y = Math.sin(this.time * 1.4 + i * 2.1) * 0.09;
      }
    }
    // Público que salta cuando pasa algo importante.
    const hype = match ? Math.min(1, match.shake * 0.8 + (match.slowmo > 0 ? 0.7 : 0)) : 0;
    if (this.crowd) {
      const dummy = new THREE.Object3D();
      const data = this.crowdData;
      for (let i = 0; i < this.crowd.count; i += 2) {
        const d = data[i];
        const bounce = Math.sin(this.time * 5 + i) * 0.06 * (0.3 + hype);
        dummy.position.set(d.x, d.y + bounce, d.z);
        dummy.rotation.set(0, d.rot + Math.sin(this.time * 2 + i) * 0.2, 0);
        dummy.scale.setScalar(d.sc);
        dummy.updateMatrix();
        this.crowd.setMatrixAt(i, dummy.matrix);
        if (this.crowdHeads) {
          dummy.position.y = d.y + bounce + 0.48 * d.sc;
          dummy.updateMatrix();
          this.crowdHeads.setMatrixAt(i, dummy.matrix);
        }
      }
      this.crowd.instanceMatrix.needsUpdate = true;
      if (this.crowdHeads) this.crowdHeads.instanceMatrix.needsUpdate = true;
    }
  }
}

/**
 * Escenarios 3D con tres temas: 'temple' (templo nocturno), 'city' (azotea
 * urbana al anochecer) y 'beach' (playa al atardecer). Todo se genera con
 * primitivas y texturas de canvas 2D.
 *
 * El público son figuras humanas low-poly instanciadas (torso con hombros y
 * brazos, piernas y cabeza esférica de tono de piel propio), no cubos con
 * pelota: dos InstancedMesh (cuerpo y cabeza) comparten transformaciones.
 */

import * as THREE from '../../vendor/three.module.min.js';

export const STAGE_THEMES = ['temple', 'city', 'beach'];

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

/* ------------------------------------------------------------------ */
/* Geometría del espectador: torso+brazos+piernas en una malla         */
/* ------------------------------------------------------------------ */

function mergeBoxes(parts) {
  // parts: [{w,h,d,x,y,z,ry,rz, col:[r,g,b]}]
  const pos = [], nrm = [], col = [], idx = [];
  for (const p of parts) {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, p.ry || 0, p.rz || 0));
    m.setPosition(p.x, p.y, p.z);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    g.applyMatrix4(m);
    const gp = g.getAttribute('position'), gn = g.getAttribute('normal'), gi = g.getIndex();
    const base = pos.length / 3;
    for (let i = 0; i < gp.count; i++) {
      pos.push(gp.getX(i), gp.getY(i), gp.getZ(i));
      const n = new THREE.Vector3(gn.getX(i), gn.getY(i), gn.getZ(i)).applyMatrix3(nm).normalize();
      nrm.push(n.x, n.y, n.z);
      col.push(p.col[0], p.col[1], p.col[2]);
    }
    for (let i = 0; i < gi.count; i++) idx.push(gi.getX(i) + base);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

/** Cuerpo de espectador: camiseta blanca (la tiñe instanceColor), piernas fijas. */
function crowdBodyGeo() {
  const W = [1, 1, 1];             // camiseta/brazos: multiplicado por el color de instancia
  const P = [0.42, 0.42, 0.48];    // pantalón: queda oscuro al teñir
  return mergeBoxes([
    { w: 0.40, h: 0.58, d: 0.24, x: 0, y: 0.62, z: 0, col: W },          // torso
    { w: 0.34, h: 0.14, d: 0.22, x: 0, y: 0.92, z: 0, col: W },          // hombros
    { w: 0.10, h: 0.52, d: 0.12, x: -0.26, y: 0.62, z: 0, rz: 0.14, col: W },  // brazo izq
    { w: 0.10, h: 0.52, d: 0.12, x: 0.26, y: 0.62, z: 0, rz: -0.14, col: W },  // brazo der
    { w: 0.13, h: 0.46, d: 0.15, x: -0.10, y: 0.12, z: 0, col: P },      // pierna izq
    { w: 0.13, h: 0.46, d: 0.15, x: 0.10, y: 0.12, z: 0, col: P }        // pierna der
  ]);
}

/* ------------------------------------------------------------------ */

export class Stage {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.torches = [];
    this.time = 0;
    this.theme = opts.theme || 'temple';
    this.build();
  }

  build() {
    const g = this.group;
    const theme = this.theme;

    const skies = {
      temple: ['#0a0f2b', '#3b1d52', '#c2452d'],
      city: ['#05070f', '#1a2340', '#b3502a'],
      beach: ['#2b1a4a', '#c2452d', '#ffb347']
    };
    const [topC, midC, botC] = skies[theme] || skies.temple;

    // --- Cielo degradado ---
    const skyGeo = new THREE.SphereGeometry(60, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(topC) },
        mid: { value: new THREE.Color(midC) },
        bot: { value: new THREE.Color(botC) }
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

    // --- Astro (luna o sol poniente) ---
    if (theme === 'beach') {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32),
        new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.95, fog: false }));
      sun.position.set(6, 4.5, -45);
      g.add(sun);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(8, 32),
        new THREE.MeshBasicMaterial({ color: 0xff9944, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, fog: false }));
      halo.position.set(6, 4.5, -45.1);
      g.add(halo);
    } else {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32),
        new THREE.MeshBasicMaterial({ color: theme === 'city' ? 0xe8ecff : 0xfff3d0, transparent: true, opacity: 0.9, fog: false }));
      moon.position.set(-14, 17, -40);
      g.add(moon);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(5.5, 32),
        new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, fog: false }));
      halo.position.set(-14, 17, -40.1);
      g.add(halo);
    }

    // --- Suelo ---
    const floorTex = canvasTexture(512, (ctx, s) => {
      if (theme === 'city') {
        ctx.fillStyle = '#23262e';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 400; i++) {           // asfalto moteado
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
          ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        for (let i = 0; i <= 4; i++) {            // juntas del hormigón
          ctx.beginPath(); ctx.moveTo((i * s) / 4, 0); ctx.lineTo((i * s) / 4, s); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, (i * s) / 4); ctx.lineTo(s, (i * s) / 4); ctx.stroke();
        }
      } else if (theme === 'beach') {
        ctx.fillStyle = '#c9a06a';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 1600; i++) {
          ctx.fillStyle = `rgba(${120 + Math.random() * 80 | 0},${90 + Math.random() * 60 | 0},50,${0.08 + Math.random() * 0.1})`;
          ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
        }
      } else {
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
      }
    });
    if (floorTex) { floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 6); }
    const floorCol = theme === 'city' ? 0x3a3d46 : theme === 'beach' ? 0xb98d5f : 0x4a3f5c;
    const floorMat = new THREE.MeshStandardMaterial({ color: floorCol, roughness: theme === 'beach' ? 0.95 : 0.85, metalness: 0.05 });
    if (floorTex) floorMat.map = floorTex;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.18, 0);
    floor.receiveShadow = true;
    g.add(floor);

    // Zona de combate (tarima con emblema del torneo)
    const woodTex = canvasTexture(512, (ctx, s) => {
      ctx.fillStyle = theme === 'city' ? '#3d4148' : '#6b4f3a';
      ctx.fillRect(0, 0, s, s);
      const plank = s / 8;
      for (let p = 0; p < 8; p++) {
        const y = p * plank;
        const tone = 0.85 + Math.random() * 0.3;
        ctx.fillStyle = `rgba(${Math.round(107 * tone)},${Math.round(79 * tone)},${Math.round(58 * tone)},1)`;
        if (theme !== 'city') ctx.fillRect(0, y + 2, s, plank - 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
        for (let gr = 0; gr < 10; gr++) {
          ctx.strokeStyle = `rgba(20,15,8,${0.06 + Math.random() * 0.10})`;
          ctx.lineWidth = 1 + Math.random() * 2;
          const gy = y + 6 + Math.random() * (plank - 12);
          ctx.beginPath();
          ctx.moveTo(Math.random() * s * 0.3, gy);
          ctx.bezierCurveTo(s * 0.4, gy + (Math.random() - 0.5) * 8, s * 0.7, gy + (Math.random() - 0.5) * 8, s, gy + (Math.random() - 0.5) * 6);
          ctx.stroke();
        }
      }
    });
    const platformMat = new THREE.MeshStandardMaterial({ color: theme === 'city' ? 0x565b64 : 0x8a6a4e, roughness: 0.72 });
    if (woodTex && theme !== 'city') platformMat.map = woodTex;
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

    // --- Fondo según tema ---
    if (theme === 'temple') this.buildTemple(g);
    else if (theme === 'city') this.buildCity(g);
    else this.buildBeach(g);

    // Estrellas (noche)
    if (theme !== 'beach') {
      const SN = 240;
      const sp = new Float32Array(SN * 3);
      for (let i = 0; i < SN; i++) {
        const a = Math.random() * Math.PI * 2;
        const el = 0.12 + Math.random() * 1.25;
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

    // --- Público humano instanciado ---
    this.buildCrowd(g);

    // Vallas laterales
    for (const s of [-1, 1]) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 12),
        new THREE.MeshStandardMaterial({ color: theme === 'city' ? 0x2c3038 : 0x2d2440, roughness: 0.9 }));
      fence.position.set(s * 13.5, 1.52, -2);
      g.add(fence);
    }

    // --- Luces ---
    const lights = {
      temple: { amb: 0x7f88c9, hemi: [0x9fb4ff, 0x3a2a44], key: 0xfff0d8, rim: 0x66aaff, fog: 0x1a1430 },
      city: { amb: 0x5d6a8c, hemi: [0x7d8fc9, 0x2a2030], key: 0xffd9a0, rim: 0x4488ff, fog: 0x101426 },
      beach: { amb: 0xc98d6f, hemi: [0xffc9a0, 0x5a3a30], key: 0xffb060, rim: 0xff6644, fog: 0x3a2030 }
    };
    const L = lights[theme] || lights.temple;
    const amb = new THREE.AmbientLight(L.amb, 0.85);
    g.add(amb);
    const hemi = new THREE.HemisphereLight(L.hemi[0], L.hemi[1], 0.9);
    g.add(hemi);
    const key = new THREE.DirectionalLight(L.key, 1.5);
    key.position.set(4, 10, 8);
    g.add(key);
    const rim = new THREE.DirectionalLight(L.rim, 0.9);
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
    this.scene.fog = new THREE.Fog(L.fog, 16, 52);
    this.baseFog = this.scene.fog.color.clone();
  }

  /* --- decorados por tema ------------------------------------------- */

  buildTemple(g) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(44, 16, 1),
      new THREE.MeshStandardMaterial({ color: 0x241c33, roughness: 0.95 })
    );
    wall.position.set(0, 7, -9);
    g.add(wall);

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

    const roof = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x1b1526, roughness: 0.9 }));
    roof.position.set(0, 9.62, -7.6);
    g.add(roof);
    const roof2 = new THREE.Mesh(new THREE.BoxGeometry(48, 0.6, 3),
      new THREE.MeshStandardMaterial({ color: 0x2a2038 }));
    roof2.position.set(0, 10.42, -7.0);
    roof2.rotation.x = -0.12;
    g.add(roof2);

    // Farolillos colgantes con halo luminoso
    const glowTex = radialGlow();
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xff8844, emissive: 0xff5522, emissiveIntensity: 1.4, roughness: 0.4
    });
    for (let i = -4; i <= 4; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), lanternMat);
      l.position.set(i * 3.6, 8.2 - Math.abs(i) * 0.12, -6.2);
      l.scale.y = 1.25;
      g.add(l);
      addGlow(g, glowTex, l.position, 1.9);
      const light = new THREE.PointLight(0xff7733, 6, 9, 2);
      light.position.copy(l.position);
      g.add(light);
      this.torches.push({ light, base: 6, phase: Math.random() * 6.28, mesh: l });
    }

    // Banderas ondeantes
    const flagColors = [0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32];
    this.flags = [];
    for (let i = 0; i < 4; i++) {
      const ftex = bannerTexture(flagColors[i]);
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
  }

  buildCity(g) {
    // Silueta de edificios con ventanas encendidas
    const winTex = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#0b0e18';
      ctx.fillRect(0, 0, s, s);
      for (let y = 8; y < s - 8; y += 18) {
        for (let x = 8; x < s - 8; x += 16) {
          const on = Math.random() < 0.4;
          ctx.fillStyle = on
            ? `rgba(${200 + Math.random() * 55 | 0},${170 + Math.random() * 60 | 0},${90 + Math.random() * 80 | 0},${0.5 + Math.random() * 0.5})`
            : 'rgba(20,26,44,1)';
          ctx.fillRect(x, y, 9, 11);
        }
      }
    });
    if (winTex) { winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping; }
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const w = 4 + rnd() * 5, h = 8 + rnd() * 14;
      const mat = new THREE.MeshStandardMaterial({ color: 0x141a2c, roughness: 0.9 });
      if (winTex) {
        const t = winTex.clone(); t.needsUpdate = true; t.repeat.set(w / 4, h / 6);
        mat.map = t; mat.emissiveMap = t; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 0.55;
      }
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), mat);
      b.position.set(-20 + i * 5 + rnd() * 2, h / 2 - 1, -12 - rnd() * 6);
      g.add(b);
    }
    // Letrero de neón del torneo
    const neonTex = canvasTexture(256, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(10,0,20,0.8)';
      ctx.fillRect(0, s * 0.3, s, s * 0.4);
      ctx.fillStyle = '#ff2d95';
      ctx.font = 'bold 60px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FABATER', s / 2, s * 0.58);
      ctx.strokeStyle = '#22e5ff';
      ctx.lineWidth = 6;
      ctx.strokeRect(6, s * 0.32, s - 12, s * 0.36);
    });
    if (neonTex) {
      const neon = new THREE.Mesh(new THREE.PlaneGeometry(9, 3),
        new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, fog: false }));
      neon.position.set(0, 9.5, -11);
      g.add(neon);
      this.neon = neon;
    }
    // Farolas: las "antorchas" urbanas
    const glowTex = radialGlow();
    for (let i = -4; i <= 4; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.7 }));
      pole.position.set(i * 3.6, 3, -6.4);
      g.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x9fd8ff, emissiveIntensity: 1.6 }));
      lamp.position.set(i * 3.6, 6.1, -6.4);
      g.add(lamp);
      addGlow(g, glowTex, lamp.position, 1.6);
      const light = new THREE.PointLight(0x9fc8ff, 5, 9, 2);
      light.position.copy(lamp.position);
      g.add(light);
      this.torches.push({ light, base: 5, phase: Math.random() * 6.28, mesh: lamp });
    }
  }

  buildBeach(g) {
    // Mar con brillo del atardecer
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(80, 30),
      new THREE.MeshStandardMaterial({ color: 0x1c4d6b, roughness: 0.25, metalness: 0.5 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.3, -22);
    g.add(sea);
    // Palmeras sencillas a los lados
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6b34, roughness: 0.8, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const x = sx * (10 + k * 4), z = -8 - k * 2;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 5.4, 7), trunkMat);
        trunk.position.set(x, 2.5, z);
        trunk.rotation.z = sx * 0.14;
        g.add(trunk);
        for (let l = 0; l < 6; l++) {
          const a = (l / 6) * Math.PI * 2;
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4), leafMat);
          leaf.position.set(x + Math.cos(a) * 0.9, 5.3, z + Math.sin(a) * 0.5);
          leaf.rotation.set(Math.sin(a) * 0.5 + 0.9, 0, -Math.cos(a) * 0.9);
          g.add(leaf);
        }
      }
    }
    // Antorchas tiki en la orilla de la tarima
    const glowTex = radialGlow();
    for (let i = -4; i <= 4; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), trunkMat);
      pole.position.set(i * 3.6, 1.3, -6.4);
      g.add(pole);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 6),
        new THREE.MeshStandardMaterial({ color: 0xff9933, emissive: 0xff6600, emissiveIntensity: 2 }));
      flame.position.set(i * 3.6, 2.85, -6.4);
      g.add(flame);
      addGlow(g, glowTex, flame.position, 1.7);
      const light = new THREE.PointLight(0xff8833, 6, 9, 2);
      light.position.copy(flame.position);
      g.add(light);
      this.torches.push({ light, base: 6, phase: Math.random() * 6.28, mesh: flame });
    }
    // Banderolas entre palmeras
    const flagColors = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5];
    this.flags = [];
    for (let i = 0; i < 4; i++) {
      const ftex = bannerTexture(flagColors[i]);
      const fmat = new THREE.MeshStandardMaterial({
        color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9, emissive: flagColors[i], emissiveIntensity: 0.15
      });
      if (ftex) fmat.map = ftex;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), fmat);
      f.position.set(-10.5 + i * 7, 4.6, -8.6);
      g.add(f);
      this.flags.push(f);
    }
  }

  /* --- público ------------------------------------------------------- */

  buildCrowd(g) {
    const bodyGeo = crowdBodyGeo();
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true });
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const N = 260;
    const crowd = new THREE.InstancedMesh(bodyGeo, bodyMat, N);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 8, 6), headMat, N);
    const dummy = new THREE.Object3D();
    const cCol = new THREE.Color();
    const clothTones = ['#c62828', '#1565c0', '#f9a825', '#2e7d32', '#6a1b9a', '#e0e0e0', '#ef6c00', '#00838f', '#ad1457', '#455a64'];
    const skinTones = ['#c68642', '#f2cdb0', '#8d5524', '#e0ac69', '#5c3a21', '#ffdbac', '#a9714b'];
    this.crowdData = [];
    for (let i = 0; i < N; i++) {
      const row = Math.floor(i / 26);
      const col = i % 26;
      const d = {
        x: -12.5 + col * 1.0 + Math.random() * 0.3,
        y: 0.32 + row * 0.78,
        z: -5.6 - row * 1.1,
        rot: Math.random() * 0.6 - 0.3,
        sc: 0.9 + Math.random() * 0.3,
        phase: Math.random() * 6.28
      };
      this.crowdData.push(d);
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.setScalar(d.sc);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      dummy.position.y = d.y + 1.10 * d.sc;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      cCol.set(clothTones[(i * 5 + row) % clothTones.length]).multiplyScalar(0.5 + Math.random() * 0.6);
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
  }

  /** Fondo dramático durante los supers. */
  setSuperMood(t, color) {
    if (!this.sky) return;
    const u = this.sky.material.uniforms;
    const k = Math.min(1, t);
    u.top.value.set(this.theme === 'city' ? '#05070f' : this.theme === 'beach' ? '#2b1a4a' : '#0a0f2b')
      .lerp(new THREE.Color(color || '#2a0040'), k * 0.8);
    u.mid.value.set(this.theme === 'city' ? '#1a2340' : this.theme === 'beach' ? '#c2452d' : '#3b1d52')
      .lerp(new THREE.Color(color || '#550066'), k * 0.85);
    this.ambient.intensity = 0.85 + k * 0.6;
  }

  update(dt, match) {
    this.time += dt;
    for (const t of this.torches) {
      const f = 0.75 + Math.sin(this.time * 7 + t.phase) * 0.14 + Math.sin(this.time * 13 + t.phase * 2) * 0.09;
      t.light.intensity = t.base * f;
      if (this.theme === 'beach' && t.mesh) t.mesh.scale.y = 1 + Math.sin(this.time * 11 + t.phase) * 0.25;
    }
    if (this.stars) this.stars.material.opacity = 0.7 + Math.sin(this.time * 0.9) * 0.15;
    if (this.flags) {
      for (let i = 0; i < this.flags.length; i++) {
        this.flags[i].rotation.y = Math.sin(this.time * 1.4 + i * 2.1) * 0.09;
      }
    }
    if (this.neon) this.neon.material.opacity = 0.85 + Math.sin(this.time * 17) * 0.1 + Math.sin(this.time * 3.1) * 0.05;
    // Público humano: balanceo_idle y salto colectivo cuando pasa algo importante.
    const hype = match ? Math.min(1, match.shake * 0.8 + (match.slowmo > 0 ? 0.7 : 0)) : 0;
    if (this.crowd) {
      const dummy = new THREE.Object3D();
      const data = this.crowdData;
      for (let i = 0; i < this.crowd.count; i += 2) {
        const d = data[i];
        const bounce = Math.sin(this.time * 5 + d.phase) * 0.05 * (0.3 + hype)
          + hype * Math.abs(Math.sin(this.time * 9 + d.phase)) * 0.22;
        dummy.position.set(d.x, d.y + bounce, d.z);
        dummy.rotation.set(0, d.rot + Math.sin(this.time * 2 + d.phase) * 0.15, 0);
        dummy.scale.setScalar(d.sc);
        dummy.updateMatrix();
        this.crowd.setMatrixAt(i, dummy.matrix);
        if (this.crowdHeads) {
          dummy.position.y = d.y + bounce + 1.10 * d.sc;
          dummy.updateMatrix();
          this.crowdHeads.setMatrixAt(i, dummy.matrix);
        }
      }
      this.crowd.instanceMatrix.needsUpdate = true;
      if (this.crowdHeads) this.crowdHeads.instanceMatrix.needsUpdate = true;
    }
  }
}

/* ------------------------------------------------------------------ */

function radialGlow() {
  return canvasTexture(64, (ctx, s) => {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,200,120,0.9)');
    grd.addColorStop(0.4, 'rgba(255,140,60,0.35)');
    grd.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  });
}

function addGlow(g, glowTex, pos, size) {
  if (!glowTex) return;
  const haloS = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.8
  }));
  haloS.scale.setScalar(size);
  haloS.position.copy(pos);
  g.add(haloS);
}

function bannerTexture(hex) {
  return canvasTexture(128, (ctx, s) => {
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
    ctx.beginPath();
    ctx.moveTo(s / 2, s * 0.22); ctx.lineTo(s * 0.6, s * 0.34);
    ctx.lineTo(s / 2, s * 0.46); ctx.lineTo(s * 0.4, s * 0.34);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,230,160,0.85)';
    ctx.fill();
  });
}

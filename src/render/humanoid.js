/**
 * Humanoide procedural con malla skinneada.
 *
 * v0.20: el cuerpo ya no se compone de "cáscaras" que se intersecan (tubos +
 * esferas sueltas cuyo cruce se ve como sopa de polígonos). Ahora el cuerpo se
 * define como un campo implícito (SDF): una lista de primitivas (elipsoides y
 * cápsulas cónicas elípticas) que se funden con un mínimo suave, y de ahí se
 * extrae UNA sola superficie continua y estanca con marching tetrahedra.
 * El resultado es un modelo "esculpido": hombros, caderas, pecho y gemelos
 * fluyen de una pieza, sin aristas de intersección ni tapas que asoman.
 *
 * El skinning no cambia: cada vértice recibe índices/pesos de hueso herencia-
 * dos de las primitivas que lo dominan (mezclados en los bordes), así el mismo
 * esqueleto y el mismo rig posan esta malla sin tocar nada más.
 *
 * Las proporciones salen de skeleton-def.js (humano de 1.75 m) escaladas por
 * luchador con body.{height,bulk,armLen,legLen,head}.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { faceTexture } from './facepaint.js';
import { JOINTS, RIG_HEIGHT } from '../anim/skeleton-def.js';

/** Altura en unidades de mundo de un luchador de proporciones estándar. */
export const WORLD_HEIGHT = 1.86;
const UNIT = WORLD_HEIGHT / RIG_HEIGHT;
const TAU = Math.PI * 2;

/** Superficie extraída por personaje (la extracción SDF es lo caro). */
const SURF_CACHE = new Map();

/* ------------------------------------------------------------------ */
/* Campo implícito: primitivas que se funden                           */
/* ------------------------------------------------------------------ */

/**
 * Primitiva del campo: cápsula cónica de sección elíptica entre `a` y `b`
 * (radios rx/rz en cada extremo). Con a==b y rx==rz queda un elipsoide.
 * `col` es el color lineal, `mat` 0=tela/equipo 1=piel, `b`/`w` los huesos.
 */
class Field {
  constructor() {
    this.prims = [];
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
  }

  add(a, b, r0x, r0z, r1x, r1z, col, mat, bones, weights) {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
    const L = Math.hypot(ax, ay, az);
    const A = L > 1e-9 ? [ax / L, ay / L, az / L] : [0, 1, 0];
    const ref = Math.abs(A[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    // U = A x ref, V = A x U (marco perpendicular estable)
    let U = [
      A[1] * ref[2] - A[2] * ref[1],
      A[2] * ref[0] - A[0] * ref[2],
      A[0] * ref[1] - A[1] * ref[0]
    ];
    const ul = Math.hypot(...U) || 1; U = U.map((v) => v / ul);
    const V = [
      A[1] * U[2] - A[2] * U[1],
      A[2] * U[0] - A[0] * U[2],
      A[0] * U[1] - A[1] * U[0]
    ];
    const bc = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const bd = L / 2 + Math.max(r0x, r0z, r1x, r1z);
    const mr = Math.max(r0x, r0z, r1x, r1z);
    // AABB ceñida (rechazo barato por eje antes del SDF completo)
    const ex = Math.abs(A[0]) * L / 2 + (Math.abs(U[0]) + Math.abs(V[0])) * mr;
    const ey = Math.abs(A[1]) * L / 2 + (Math.abs(U[1]) + Math.abs(V[1])) * mr;
    const ez = Math.abs(A[2]) * L / 2 + (Math.abs(U[2]) + Math.abs(V[2])) * mr;
    this.prims.push({ a, b, L, A, U, V, r0x, r0z, r1x, r1z, col, mat, bones, weights, bc, bd, ex, ey, ez });
    const m = bd;
    for (const p of [a, b]) {
      for (let k = 0; k < 3; k++) {
        this.min[k] = Math.min(this.min[k], p[k] - m);
        this.max[k] = Math.max(this.max[k], p[k] + m);
      }
    }
  }

  /** Elipsoide de radios (sx,sy,sz) en `c`. */
  ball(c, sx, sy, sz, col, mat, bones, weights) {
    this.add(c, c, sx, sz, sx, sz, col, mat, bones, weights);
    const pr = this.prims[this.prims.length - 1];
    pr.ry = sy;
    pr.bd = Math.max(pr.bd, sy);
    pr.ex = sx; pr.ey = sy; pr.ez = sz;
    for (let k = 0; k < 3; k++) {
      this.min[k] = Math.min(this.min[k], c[k] - pr.bd);
      this.max[k] = Math.max(this.max[k], c[k] + pr.bd);
    }
  }

  /** Distancia con signo al primitiva (fuera > 0). Aproximación estable. */
  sdPrim(p, pr) {
    const dx = p[0] - pr.a[0], dy = p[1] - pr.a[1], dz = p[2] - pr.a[2];
    if (pr.L < 1e-9) {                       // elipsoide
      const ry = pr.ry || pr.r0x;
      const q = Math.hypot(dx / pr.r0x, dy / ry, dz / pr.r0z);
      return (q - 1) * Math.min(pr.r0x, ry, pr.r0z);
    }
    const u = dx * pr.A[0] + dy * pr.A[1] + dz * pr.A[2];
    const e1 = dx * pr.U[0] + dy * pr.U[1] + dz * pr.U[2];
    const e2 = dx * pr.V[0] + dy * pr.V[1] + dz * pr.V[2];
    const t = Math.max(0, Math.min(1, u / pr.L));
    const rx = pr.r0x + (pr.r1x - pr.r0x) * t;
    const rz = pr.r0z + (pr.r1z - pr.r0z) * t;
    const m = Math.min(rx, rz);
    const w = Math.sqrt((e1 / rx) * (e1 / rx) + (e2 / rz) * (e2 / rz));
    let d = (w - 1) * m;
    const c0 = Math.hypot(e1, e2, u) - pr.r0z;      // tapa esférica en a
    const c1 = Math.hypot(e1, e2, u - pr.L) - pr.r1z; // y en b
    if (u < 0) d = c0; else if (u > pr.L) d = c1; else d = Math.min(d, c0, c1);
    return d;
  }

  /** Los dos primitivas más cercanos en p: [d0,i0,d1,i1]. */
  nearest2(p) {
    let d0 = Infinity, i0 = 0, d1 = Infinity, i1 = 0;
    const P = this.prims;
    for (let i = 0; i < P.length; i++) {
      const pr = P[i];
      // rechazo barato por AABB antes del SDF completo
      const qx = p[0] - pr.bc[0], qy = p[1] - pr.bc[1], qz = p[2] - pr.bc[2];
      if (qx > pr.ex || qx < -pr.ex || qy > pr.ey || qy < -pr.ey || qz > pr.ez || qz < -pr.ez) {
        // fuera de la caja: distancia mínima estimada por si aun compite
        const ox = Math.max(Math.abs(qx) - pr.ex, 0), oy = Math.max(Math.abs(qy) - pr.ey, 0), oz = Math.max(Math.abs(qz) - pr.ez, 0);
        if (ox * ox + oy * oy + oz * oz > d1 * d1 && d1 !== Infinity) continue;
      }
      const d = this.sdPrim(p, pr);
      if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = i; }
      else if (d < d1) { d1 = d; i1 = i; }
    }
    return [d0, i0, d1, i1];
  }

}

/* ------------------------------------------------------------------ */

export class Humanoid {
  constructor(def) {
    this.def = def || {};
    this.body = this.def.body || {};
    this.colors = this.def.colors || {};
    this.build();
  }

  /* --- preparación ------------------------------------------------- */

  build() {
    const b = this.body;
    this.heightMul = this.body.height || 1;
    this.palette = [];
    this.bulk = b.bulk || 1;
    this.legLen = b.legLen || 1;
    this.armLen = b.armLen || 1;
    this.s = UNIT * this.heightMul;

    // Posiciones en reposo de cada articulación (espacio común de skinning).
    this.bp = {};
    for (const j of JOINTS) {
      const o = this.offsetFor(j);
      const p = j.parent >= 0 ? this.bp[JOINTS[j.parent].name] : [0, 0, 0];
      this.bp[j.name] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    }

    // Huesos
    this.bones = {};
    this.boneList = [];
    for (const j of JOINTS) {
      const bone = new THREE.Bone();
      bone.name = j.name;
      const o = this.offsetFor(j);
      bone.position.set(o[0], o[1], o[2]);
      this.bones[j.name] = bone;
      this.boneList.push(bone);
    }
    for (const j of JOINTS) {
      if (j.parent >= 0) this.bones[JOINTS[j.parent].name].add(this.bones[j.name]);
    }
    this.boneIndex = Object.fromEntries(JOINTS.map((j, i) => [j.name, i]));

    const F = new Field();
    this.buildLegs(F);
    this.buildTorso(F);
    this.buildArms(F);
    this.buildHead(F);
    this.field = F;

    // La extracción SDF domina el coste de construcción; el selector y el
    // combate reconstruyen los mismos luchadores, así se cachea por personaje.
    let surf = SURF_CACHE.get(this.def.id);
    if (!surf) {
      const raw = extractSurface(F, this.s);
      // Relieve de valor: oscurece suavemente la parte baja para quebrar el
      // tono plano (sin ruido por vértice: eso delataba cada triángulo).
      let hRef = 0;
      for (let i = 1; i < raw.positions.length; i += 3) hRef = Math.max(hRef, raw.positions[i]);
      for (let i = 0; i < raw.colors.length; i += 3) {
        const f = 0.86 + 0.20 * Math.min(1, Math.max(0, raw.positions[i + 1] / (hRef * 0.95)));
        raw.colors[i] *= f; raw.colors[i + 1] *= f; raw.colors[i + 2] *= f;
      }
      // Normales analíticas del campo: gradiente por diferencias finitas,
      // siempre hacia fuera (el campo crece al alejarse del cuerpo).
      const pos = raw.positions;
      const nrm = new Float32Array((pos.length / 3) * 3);
      const e = 0.012 * this.s;
      const pA = [0, 0, 0];
      for (let i = 0; i < pos.length / 3; i++) {
        pA[0] = pos[i * 3]; pA[1] = pos[i * 3 + 1]; pA[2] = pos[i * 3 + 2];
        const f0 = fieldVal(F, pA);
        pA[0] += e; const gx = fieldVal(F, pA) - f0; pA[0] -= e;
        pA[1] += e; const gy = fieldVal(F, pA) - f0; pA[1] -= e;
        pA[2] += e; const gz = fieldVal(F, pA) - f0; pA[2] -= e;
        const l = Math.hypot(gx, gy, gz) || 1;
        nrm[i * 3] = gx / l; nrm[i * 3 + 1] = gy / l; nrm[i * 3 + 2] = gz / l;
      }
      surf = { ...raw, nrm };
      SURF_CACHE.set(this.def.id, surf);
    }
    const { positions, colors, mats, uvs, sis, sws, indices, nrm } = surf;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sis, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sws, 4));
    geo.setIndex(indices);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.computeBoundingSphere();

    // Dos grupos de material (tela / piel) según el atributo `mat`.
    const cloth = clothTexture();
    const clothMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.04,
      side: THREE.DoubleSide,
      map: cloth || null,
      bumpMap: cloth || null,
      bumpScale: 0.18
    });
    const skinMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.02,
      side: THREE.DoubleSide
    });
    splitGroupsByMat(geo, mats);
    this.mesh = new THREE.SkinnedMesh(geo, [clothMat, skinMat]);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.buildFaceDecal();
    this.mesh.add(this.bones.Hips);
    this.skeleton = new THREE.Skeleton(this.boneList);
    this.mesh.bind(this.skeleton);

    this.root = new THREE.Group();
    this.root.add(this.mesh);

    this.extras = new THREE.Group();     // pelo, pañuelos, aura: siguen a huesos concretos
    this.root.add(this.extras);
    this.buildExtras();

    this.height = WORLD_HEIGHT * this.heightMul;
  }

  /** Desplazamiento en reposo de una articulación, ya escalado por luchador. */
  offsetFor(j) {
    const b = this.body;
    const s = this.s;
    const [x, y, z] = j.offset;
    const leg = b.legLen || 1;
    const arm = b.armLen || 1;
    switch (j.name) {
      case 'Hips':
        // La cadera se coloca a la altura que permiten las piernas: muslo + tibia
        // (escalados por legLen) + el tobillo. Si no, un luchador patizambo
        // como Brutus se quedaría flotando con los pies en el aire.
        return [0, (0.44 + 0.40) * leg * s + 0.11 * s, 0];
      case 'LeftUpLeg': case 'RightUpLeg':
        return [x * s * (0.9 + 0.1 * this.bulk), y * s, z * s];
      case 'LeftLeg': case 'RightLeg':
        return [0, y * s * leg, 0];
      case 'LeftFoot': case 'RightFoot':
        return [0, y * s * leg, 0];
      case 'LeftToeBase': case 'RightToeBase':
        return [0, y * s, z * s];
      case 'LeftShoulder': case 'RightShoulder':
        return [x * s * (0.9 + 0.1 * this.bulk), y * s, z * s];
      case 'LeftArm': case 'RightArm':
        return [x * s * (0.92 + 0.08 * this.bulk), y * s, z * s];
      case 'LeftForeArm': case 'RightForeArm':
        return [x * s * arm, 0, 0];
      case 'LeftHand': case 'RightHand':
        return [x * s * arm, 0, 0];
      case 'Head':
        return [0, y * s * (b.head || 1), 0];
      default:
        return [x * s, y * s, z * s];
    }
  }

  /* --- utilidades de modelado -------------------------------------- */

  col(hex, mat = 0) {
    const c = new THREE.Color(hex || '#888888');
    c.convertSRGBToLinear();
    this.palette.push({ r: c.r, g: c.g, b: c.b, mat });
    return { c: [c.r, c.g, c.b], mat };
  }

  blend2(A, B, t) {
    const ia = this.boneIndex[A], ib = this.boneIndex[B];
    if (t <= 0.001) return { b: [ia], w: [1] };
    if (t >= 0.999) return { b: [ib], w: [1] };
    return { b: [ia, ib], w: [1 - t, t] };
  }

  /** Reparte el peso entre varios huesos según la altura (para el torso). */
  byHeight(y, stops) {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (y <= b.y) {
        const t = Math.max(0, Math.min(1, (y - a.y) / Math.max(1e-6, b.y - a.y)));
        return this.blend2(a.name, b.name, t);
      }
    }
    const last = stops[stops.length - 1];
    return { b: [this.boneIndex[last.name]], w: [1] };
  }

  /** Cápsula cónica elíptica entre dos anillos (sustituye al loft antiguo). */
  tube(F, a, b, r0x, r0z, r1x, r1z, paint, bw) {
    F.add(a, b, r0x, r0z, r1x, r1z, paint.c, paint.mat, bw.b, bw.w);
  }

  /* --- piernas ------------------------------------------------------ */

  buildLegs(F) {
    const C = this.colors;
    const bulk = this.bulk;
    const skin = this.col(C.skin, 1);
    const pants = this.col(C.gi);
    const boot = this.col(C.boot);

    for (const side of ['Left', 'Right']) {
      const hip = this.bp[`${side}UpLeg`];
      const knee = this.bp[`${side}Leg`];
      const ankle = this.bp[`${side}Foot`];
      const toe = this.bp[`${side}ToeBase`];
      const thighLen = Math.hypot(knee[1] - hip[1], knee[0] - hip[0]);
      const shinLen = Math.hypot(ankle[1] - knee[1], ankle[0] - knee[0]);

      const female = !!this.body.female;
      const wide = (0.052 + 0.030 * (bulk - 1) + 0.010) * this.s * Math.sqrt(this.legLen) * (female ? 1 : 1.12);
      const dirK = [(knee[0] - hip[0]) / thighLen, (knee[1] - hip[1]) / thighLen, 0];
      // Muslo: grueso arriba, más fino en la rodilla (tres tramos)
      const thigh = [
        { d: 0.0, rx: wide * 1.25, rz: wide * 1.20, paint: pants, bw: this.legW(side, 0) },
        { d: thighLen * 0.35, rx: wide * 1.12, rz: wide * 1.08, paint: pants, bw: this.legW(side, 0.1) },
        { d: thighLen * 0.55, rx: wide * 1.06, rz: wide * 1.12, paint: pants, bw: this.legW(side, 0.2) },
        { d: thighLen * 0.75, rx: wide * 0.86, rz: wide * 0.84, paint: pants, bw: this.legW(side, 0.35) },
        { d: thighLen, rx: wide * 0.72, rz: wide * 0.72, paint: pants, bw: this.legW(side, 0.72) }
      ];
      for (let i = 0; i < thigh.length - 1; i++) {
        const a = [hip[0] + dirK[0] * thigh[i].d, hip[1] + dirK[1] * thigh[i].d, hip[2]];
        const b = [hip[0] + dirK[0] * thigh[i + 1].d, hip[1] + dirK[1] * thigh[i + 1].d, hip[2]];
        this.tube(F, a, b, thigh[i].rx, thigh[i].rz, thigh[i + 1].rx, thigh[i + 1].rz, thigh[i].paint, thigh[i].bw);
      }

      // Rodilla + gemelo: la pantorrilla tiene su volumen máximo arriba
      const shinC = (this.body.bottom || 'pants') === 'shorts' ? skin : pants;
      const dirA = [(ankle[0] - knee[0]) / shinLen, (ankle[1] - knee[1]) / shinLen, 0];
      const shin = [
        { d: 0.0, rx: wide * 0.74, rz: wide * 0.76, paint: shinC, bw: this.legW(side, 0.72) },
        { d: shinLen * 0.22, rx: wide * 0.70, rz: wide * 0.94, paint: shinC, bw: this.legW(side, 0.85) },
        { d: shinLen * 0.60, rx: wide * 0.52, rz: wide * 0.62, paint: shinC, bw: this.legW(side, 0.96) },
        { d: shinLen * 0.86, rx: wide * 0.40, rz: wide * 0.44, paint: boot, bw: this.legW(side, 1) },
        { d: shinLen, rx: wide * 0.40, rz: wide * 0.46, paint: boot, bw: this.footW(side, 0) }
      ];
      for (let i = 0; i < shin.length - 1; i++) {
        const a = [knee[0] + dirA[0] * shin[i].d, knee[1] + dirA[1] * shin[i].d, knee[2]];
        const b = [knee[0] + dirA[0] * shin[i + 1].d, knee[1] + dirA[1] * shin[i + 1].d, knee[2]];
        this.tube(F, a, b, shin[i].rx, shin[i].rz, shin[i + 1].rx, shin[i + 1].rz, shin[i].paint, shin[i].bw);
      }

      // Pie: cuña hacia los dedos
      const fwd = [toe[0] - ankle[0], 0, toe[2] - ankle[2]];
      const fl = Math.hypot(fwd[0], fwd[2]) || 1; fwd[0] /= fl; fwd[2] /= fl;
      const fa = [ankle[0] - fwd[0] * 0.02 * this.s, ankle[1] - 0.012 * this.s, ankle[2] - fwd[2] * 0.02 * this.s];
      const foot = [
        { d: 0.0, rx: wide * 0.44, rz: wide * 0.40, paint: boot, bw: this.footW(side, 0) },
        { d: 0.05 * this.s, rx: wide * 0.52, rz: wide * 0.46, paint: boot, bw: this.footW(side, 0.2) },
        { d: 0.13 * this.s, rx: wide * 0.48, rz: wide * 0.34, paint: boot, bw: this.footW(side, 0.7) },
        { d: 0.19 * this.s, rx: wide * 0.36, rz: wide * 0.20, paint: boot, bw: this.footW(side, 1) }
      ];
      for (let i = 0; i < foot.length - 1; i++) {
        const a = [fa[0] + fwd[0] * foot[i].d, fa[1], fa[2] + fwd[2] * foot[i].d];
        const b = [fa[0] + fwd[0] * foot[i + 1].d, fa[1], fa[2] + fwd[2] * foot[i + 1].d];
        this.tube(F, a, b, foot[i].rz, foot[i].rx, foot[i + 1].rz, foot[i + 1].rx, foot[i].paint, foot[i].bw);
      }
    }
  }

  legW(side, t) {
    const a = `${side}UpLeg`, b = `${side}Leg`;
    const k = t <= 0.72 ? 0 : (t - 0.72) / 0.28;
    return this.blend2(a, b, k * k * (3 - 2 * k) * 0.85);
  }

  footW(side, t) {
    const a = `${side}Foot`, b = `${side}ToeBase`;
    return this.blend2(a, b, t * 0.6);
  }

  /* --- torso -------------------------------------------------------- */

  buildTorso(F) {
    const C = this.colors;
    const bulk = this.bulk;
    const gi = this.col(C.gi);
    const belt = this.col(C.belt || C.trim);
    const skin = this.col(C.skin, 1);

    const hips = this.bp.Hips;
    const spine = this.bp.Spine;
    const spine1 = this.bp.Spine1;
    const neck = this.bp.Neck;
    const stops = [
      { name: 'Hips', y: hips[1] },
      { name: 'LowerBack', y: this.bp.LowerBack[1] },
      { name: 'Spine', y: spine[1] },
      { name: 'Spine1', y: spine1[1] },
      { name: 'Neck', y: neck[1] }
    ];
    const W = (y) => this.byHeight(y, stops);

    const female = !!this.body.female;
    const chestX = (0.155 + 0.030 * (bulk - 1)) * this.s * 1.06;
    const chestZ = (0.105 + 0.018 * (bulk - 1)) * this.s * 1.06;
    const waistX = chestX * (female ? 0.70 : 0.78), waistZ = chestZ * (female ? 0.82 : 0.86);
    const pelvisX = chestX * (female ? 1.06 : 0.92), pelvisZ = chestZ * (female ? 1.02 : 0.95);

    const yHips = hips[1];
    const profile = [
      { y: yHips - 0.055 * this.s, rx: pelvisX * 0.94, rz: pelvisZ * 0.94, paint: gi },
      { y: yHips + 0.010 * this.s, rx: pelvisX, rz: pelvisZ, paint: gi },
      { y: yHips + 0.055 * this.s, rx: waistX * 1.02, rz: waistZ * 1.0, paint: gi },
      { y: this.bp.LowerBack[1] + 0.03 * this.s, rx: waistX, rz: waistZ, paint: gi },
      { y: spine[1] + 0.02 * this.s, rx: chestX * (female ? 0.97 : 0.92), rz: chestZ * (female ? 1.02 : 0.95), paint: gi },
      { y: spine1[1] - 0.03 * this.s, rx: chestX * (female ? 0.88 : 1), rz: chestZ * (female ? 0.94 : 1), paint: gi },
      { y: spine1[1] + 0.05 * this.s, rx: chestX * 0.94, rz: chestZ * 0.9, paint: gi },
      { y: neck[1] - 0.02 * this.s, rx: chestX * 0.62, rz: chestZ * 0.66, paint: gi }
    ];

    // Ropa por personaje: sin kimono uniforme. tank = hombros/pecho al
    // descubierto; bare = torso entero de piel.
    const top = this.body.top || 'gi';
    if (top === 'tank') profile.forEach((p, i) => { if (i >= 4) p.paint = skin; });
    if (top === 'bare') profile.forEach((p, i) => { p.paint = i < 2 ? gi : skin; });
    const topC = top === 'gi' ? gi : skin;

    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i], b = profile[i + 1];
      const ym = (a.y + b.y) / 2;
      this.tube(F, [0, a.y, 0], [0, b.y, 0], a.rx, a.rz, b.rx, b.rz, a.paint, W(ym));
    }

    // Cinturón: anillo ligeramente mayor que funde con la cadera
    const beltY = yHips + 0.045 * this.s;
    this.tube(F, [0, beltY - 0.028 * this.s, 0], [0, beltY + 0.022 * this.s, 0],
      waistX * 1.07, waistZ * 1.07, waistX * 1.07, waistZ * 1.07, belt, W(beltY));

    // Cuello
    this.tube(F, [0, neck[1] - 0.03 * this.s, 0], [0, neck[1] + 0.08 * this.s, 0],
      0.052 * this.s, 0.055 * this.s, 0.047 * this.s, 0.049 * this.s, skin, W(neck[1]));

    // Trapecios / deltoides: volumen sobre los hombros (más sutiles en ellas)
    for (const side of ['Left', 'Right']) {
      const sh = this.bp[`${side}Arm`];
      const dScale = female ? 0.82 : 1.18;
      F.ball([sh[0] * 0.55, sh[1] + 0.015 * this.s, 0],
        0.068 * this.s * (0.9 + 0.15 * bulk) * dScale * 1.1,
        0.068 * this.s * (0.9 + 0.15 * bulk) * dScale * 0.8,
        0.068 * this.s * (0.9 + 0.15 * bulk) * dScale,
        (top === 'gi' ? gi : skin).c, (top === 'gi' ? gi : skin).mat,
        [this.boneIndex.Spine1, this.boneIndex[`${side}Shoulder`]], [0.55, 0.45]);
      F.ball(sh, 0.062 * this.s * (0.95 + 0.18 * bulk) * dScale,
        0.062 * this.s * (0.95 + 0.18 * bulk) * dScale,
        0.062 * this.s * (0.95 + 0.18 * bulk) * dScale,
        (top === 'gi' ? gi : skin).c, (top === 'gi' ? gi : skin).mat,
        [this.boneIndex[`${side}Arm`]], [1]);
      if (!female) {
        // Trapecio: llena el hueco cuello-hombro (silueta de potencia)
        F.ball([sh[0] * 0.35, sh[1] + 0.045 * this.s, -0.012 * this.s],
          0.055 * this.s * (0.9 + 0.15 * bulk), 0.045 * this.s, 0.05 * this.s,
          (top === 'gi' ? gi : skin).c, (top === 'gi' ? gi : skin).mat,
          [this.boneIndex.Spine1, this.boneIndex[`${side}Shoulder`]], [0.6, 0.4]);
        // Dorsal: la espalda en V también de perfil
        F.ball([sh[0] * 0.55, spine[1] + 0.01 * this.s, -chestZ * 0.55],
          chestX * 0.30, chestX * 0.36, chestX * 0.26,
          (top === 'gi' ? gi : skin).c, (top === 'gi' ? gi : skin).mat,
          [this.boneIndex.Spine], [1]);
      }
    }

    // Busto femenino: dos volúmenes que el mínimo suave funde con el pecho
    // (silueta legible, transición continua, sin esferas que asoman).
    if (female) {
      const pecY = spine1[1] - 0.01 * this.s;
      for (const dx of [-1, 1]) {
        F.ball([dx * chestX * 0.40, pecY - 0.015 * this.s, chestZ * 0.78],
          chestX * 0.34, chestX * 0.30, chestX * 0.30,
          topC.c, topC.mat, [this.boneIndex.Spine1], [1]);
      }
    }
  }

  /* --- brazos ------------------------------------------------------- */

  buildArms(F) {
    const C = this.colors;
    const bulk = this.bulk;
    const gi = this.col(C.gi);
    const skin = this.col(C.skin, 1);
    const glove = this.col(C.glove || C.trim);
    const trim = this.col(C.trim);

    for (const side of ['Left', 'Right']) {
      const sh = this.bp[`${side}Arm`];
      const el = this.bp[`${side}ForeArm`];
      const wr = this.bp[`${side}Hand`];
      const dir = Math.sign(el[0] - sh[0]) || 1;
      const upLen = Math.abs(el[0] - sh[0]);
      const foreLen = Math.abs(wr[0] - el[0]);
      const female = !!this.body.female;
      const rUp = (0.050 + 0.016 * (bulk - 1)) * this.s * Math.sqrt(this.armLen) * (female ? 0.92 : 1.16);
      const rFore = rUp * (female ? 0.82 : 0.90);

      const sleeve = (this.body.top || 'gi') === 'gi' ? gi : skin;
      // Bíceps con pico al 45 % y codo estrecho: el brazo masculino no es un fideo
      const mid = [sh[0] + (el[0] - sh[0]) * 0.45, sh[1] + (el[1] - sh[1]) * 0.45, sh[2]];
      this.tube(F, sh, mid, rUp * 1.10, rUp * 1.06, rUp * 1.24, rUp * 1.20, sleeve, this.armW(side, 0.1));
      this.tube(F, mid, el, rUp * 1.24, rUp * 1.20, rUp * 0.80, rUp * 0.80, sleeve, this.armW(side, 0.5));
      // Antebrazo: gemelo del brazo, muñeca fina
      this.tube(F, el, [wr[0], wr[1], wr[2]], rFore * 1.18, rFore * 1.10, rFore * 0.66, rFore * 0.62, skin, this.armW(side, 0.9));
      // Puño cerrado alineado con el antebrazo
      const handLen = 0.10 * this.s;
      this.tube(F, [wr[0] + dir * 0.012 * this.s, wr[1], wr[2]],
        [wr[0] + dir * (0.012 * this.s + handLen), wr[1], wr[2]],
        rFore * 0.80, rFore * 0.92, rFore * 0.78, rFore * 0.86, glove, this.handW(side));
      // Pulgar
      F.ball([wr[0] + dir * handLen * 0.35, wr[1] - rFore * 0.55, wr[2] + 0.028 * this.s],
        rFore * 0.55, rFore * 0.34, rFore * 0.4, glove.c, glove.mat, [this.boneIndex[`${side}Hand`]], [1]);
    }
  }

  armW(side, t) {
    const a = `${side}Arm`, b = `${side}ForeArm`;
    const k = t <= 0.75 ? 0 : (t - 0.75) / 0.25;
    return this.blend2(a, b, k * k * (3 - 2 * k) * 0.9);
  }

  handW(side) {
    return { b: [this.boneIndex[`${side}Hand`]], w: [1] };
  }

  /* --- cabeza ------------------------------------------------------- */

  buildHead(F) {
    const C = this.colors;
    const b = this.body;
    const skin = this.col(C.skin, 1);
    const hs = (b.head || 1) * this.s;
    const headBase = this.bp.Head;
    const cy = headBase[1] + 0.105 * hs;   // centro del cráneo
    const cz = headBase[2];
    const headBone = [this.boneIndex.Head];

    // Cráneo: más alto que ancho, con la nuca prominente
    F.ball([0, cy, cz - 0.004 * hs], 0.098 * hs * 0.86, 0.098 * hs * 1.08, 0.098 * hs * 0.98,
      skin.c, skin.mat, headBone, [1]);
    // Cara / maxilar: se estrecha hacia la barbilla (tubo hacia abajo)
    const jaw = [
      { d: 0.0, rx: 0.072 * hs, rz: 0.078 * hs },
      { d: 0.045 * hs, rx: 0.064 * hs, rz: 0.070 * hs },
      { d: 0.085 * hs, rx: 0.048 * hs, rz: 0.056 * hs },
      { d: 0.105 * hs, rx: 0.030 * hs, rz: 0.038 * hs }
    ];
    for (let i = 0; i < jaw.length - 1; i++) {
      this.tube(F, [0, cy - 0.012 * hs - jaw[i].d, cz + 0.012 * hs],
        [0, cy - 0.012 * hs - jaw[i + 1].d, cz + 0.012 * hs],
        jaw[i].rx, jaw[i].rz, jaw[i + 1].rx, jaw[i + 1].rz, skin, { b: headBone, w: [1] });
    }
    // Nariz recogida: da perfil sin atravesar el calco de la cara
    this.tube(F, [0, cy - 0.012 * hs, cz + 0.058 * hs], [0, cy - 0.021 * hs, cz + 0.094 * hs],
      0.016 * hs, 0.016 * hs, 0.006 * hs, 0.006 * hs, skin, { b: headBone, w: [1] });
    // Orejas
    for (const dx of [-1, 1]) {
      F.ball([dx * 0.084 * hs, cy - 0.012 * hs, cz - 0.006 * hs],
        0.024 * hs * 0.42, 0.024 * hs * 1.1, 0.024 * hs * 0.8,
        skin.c, skin.mat, headBone, [1]);
    }
    // Ceja: arco sobre los ojos (el mínimo suave la funde con la frente)
    F.ball([0, cy + 0.028 * hs, cz + 0.060 * hs], 0.062 * hs, 0.017 * hs, 0.018 * hs,
      skin.c, skin.mat, headBone, [1]);
    // Pómulos: plano lateral de la cara
    for (const dx of [-1, 1]) {
      F.ball([dx * 0.058 * hs, cy - 0.008 * hs, cz + 0.052 * hs],
        0.018 * hs, 0.020 * hs, 0.018 * hs, skin.c, skin.mat, headBone, [1]);
    }
  }

  /* --- cara con textura ---------------------------------------------- */

  /**
   * Calco curvado con la cara pintada (cejas, boca, barba, pintura...) delante
   * de la cara geométrica. Sigue al hueso Head, así gesticula con el mocap.
   */
  buildFaceDecal() {
    const hs = (this.body.head || 1) * this.s;
    const headBase = this.bp.Head;
    const cy = headBase[1] + 0.105 * hs;
    const cz = headBase[2];
    const C = [0, cy - 0.012 * hs, cz - 0.006 * hs];
    const cols = 12, rows = 14;
    // El arte de 96x128 representa la cabeza entera (coronilla a barbilla):
    // el arco del calco debe abarcar lo mismo o los rasgos salen aplastados.
    const a0 = -0.90, a1 = 0.90;      // horizontal: cara + tres cuartos
    const b0 = -1.35, b1 = 1.05;      // vertical: coronilla a bajo-barbilla
    // Shrinkwrap: cada vértice del calco se apoya a 4 mm de la superficie real
    // del campo (bisección sobre el SDF), así ni flota ni se entierra aunque
    // la fusión de cejas/pómulos engorde la cara.
    const F = this.field;
    const pos = [], uv = [], idx = [];
    const q = [0, 0, 0];
    for (let r = 0; r <= rows; r++) {
      const beta = b1 + (b0 - b1) * (r / rows);   // r=0 arriba (frente)
      for (let c = 0; c <= cols; c++) {
        const alpha = a0 + (a1 - a0) * (c / cols);
        const cb = Math.cos(beta);
        const dx = Math.sin(alpha) * cb, dy = Math.sin(beta), dz = Math.cos(alpha) * cb;
        let lo = 0.02 * hs, hi = 0.22 * hs;      // dentro / fuera de la cabeza
        for (let k = 0; k < 14; k++) {
          const mid = (lo + hi) / 2;
          q[0] = C[0] + dx * mid; q[1] = C[1] + dy * mid; q[2] = C[2] + dz * mid;
          if (fieldVal(F, q) < 0) lo = mid; else hi = mid;
        }
        const rr = (lo + hi) / 2 + 0.012 * hs;
        pos.push(C[0] + dx * rr, C[1] + dy * rr, C[2] + dz * rr);
        uv.push(c / cols, r / rows);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i0 = r * (cols + 1) + c, i1 = i0 + 1, i2 = i0 + cols + 1, i3 = i2 + 1;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const tex = faceTexture(this.def);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.55, metalness: 0,
      side: THREE.FrontSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 2;
    mesh.position.set(-headBase[0], -headBase[1], -headBase[2]);  // local al hueso Head
    this.bones.Head.add(mesh);
    this.faceDecal = mesh;
  }

  /* --- pelo y accesorios (mallas sueltas ancladas a huesos) --------- */

  buildExtras() {
    const b = this.body;
    const C = this.colors;
    const hs = (b.head || 1) * this.s;
    const head = this.bones.Head;
    const headLocal = new THREE.Vector3(0, 0.105 * hs, 0);

    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 0.62, metalness: 0.05, ...extra
    });
    const hairMat = mat(new THREE.Color(C.hair || '#222').convertSRGBToLinear());

    // Casco de pelo: copia el elipsoide del cráneo unos mm por fuera, para
    // que ni se meta dentro (parches por z-fighting) ni tape la cara.
    // El cráneo SDF fundido asoma hasta ~1 cm más que el elipsoide base, así
    // el casco va holgado (sin z-fighting) y se inclina hacia atrás: la
    // abertura mira a la cara y la nuca queda cubierta.
    const hairCap = (theta = 0.5, tilt = 0.35) => {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(hs, 16, 12, 0, TAU, 0, Math.PI * theta), hairMat);
      cap.scale.set(0.110, 0.130, 0.120);
      cap.rotation.x = -tilt;
      cap.position.set(0, 0.020 * hs, -0.022 * hs);
      return cap;
    };

    const add = (mesh, bone = head, pos = headLocal) => {
      mesh.position.copy(pos);
      bone.add(mesh);
      return mesh;
    };

    switch (b.hair) {
      case 'bald':
        break;
      case 'spiky': {
        const grp = new THREE.Group();
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * TAU;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.026 * hs, 0.12 * hs, 5), hairMat);
          spike.position.set(Math.cos(a) * 0.062 * hs, 0.092 * hs + Math.sin(i * 2.1) * 0.010 * hs, Math.sin(a) * 0.062 * hs - 0.012 * hs);
          spike.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
          grp.add(spike);
        }
        const cap = hairCap(0.42, 0.62);
        grp.add(cap);
        add(grp);
        break;
      }
      case 'mohawk': {
        const grp = new THREE.Group();
        for (let i = 0; i < 7; i++) {
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.020 * hs, 0.11 * hs, 4), hairMat);
          f.position.set(0, 0.075 * hs, (0.06 - i * 0.022) * hs);
          f.rotation.x = -0.25 + i * 0.05;
          grp.add(f);
        }
        add(grp);
        break;
      }
      case 'long': {
        const grp = new THREE.Group();
        const cap = hairCap(0.46, 0.60);
        grp.add(cap);
        // Melena: cae por la espalda (se ancla al cuello para que acompañe)
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.062 * hs, 0.030 * hs, 0.30 * hs, 10), hairMat);
        tail.position.set(0, -0.10 * hs, -0.055 * hs);
        tail.rotation.x = 0.18;
        grp.add(tail);
        this.hairTail = tail;
        add(grp);
        break;
      }
      case 'ponytail': {
        const grp = new THREE.Group();
        const cap = hairCap(0.44, 0.62);
        grp.add(cap);
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * hs, 0.014 * hs, 0.26 * hs, 8), hairMat);
        tail.position.set(0, -0.10 * hs, -0.075 * hs);
        tail.rotation.x = 0.35;
        grp.add(tail);
        this.hairTail = tail;
        add(grp);
        break;
      }
      case 'flat': {
        const cap = hairCap(0.42, 0.58);
        add(cap);
        break;
      }
      case 'mask': {
        const cap = hairCap(1.05, 0.05);
        add(cap);
        // Abertura de los ojos
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.14 * hs, 0.026 * hs, 0.02 * hs),
          mat(new THREE.Color(C.skin || '#c68642').convertSRGBToLinear()));
        slit.position.set(0, 0.012 * hs, 0.104 * hs);
        add(slit);
        break;
      }
      case 'flame': {
        const grp = new THREE.Group();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU;
          const f = new THREE.Mesh(new THREE.ConeGeometry(0.030 * hs, 0.16 * hs, 5),
            mat(new THREE.Color(C.accent || '#ff7043').convertSRGBToLinear(), {
              emissive: new THREE.Color(C.accent || '#ff7043').convertSRGBToLinear(),
              emissiveIntensity: 0.7
            }));
          f.position.set(Math.cos(a) * 0.045 * hs, 0.09 * hs, Math.sin(a) * 0.045 * hs);
          f.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45);
          grp.add(f);
        }
        add(grp);
        break;
      }
      default: {
        const cap = hairCap(0.42, 0.62);
        add(cap);
      }
    }

    // Cinta en la frente
    if (b.band) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.098 * hs, 0.013 * hs, 6, 18),
        mat(new THREE.Color(C.trim || '#c62828').convertSRGBToLinear()));
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.152 * hs, -0.006 * hs);
      head.add(band);
      const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.022 * hs, 0.13 * hs, 0.006 * hs),
        mat(new THREE.Color(C.trim || '#c62828').convertSRGBToLinear()));
      tailL.position.set(0.03 * hs, 0.145 * hs, -0.095 * hs);
      head.add(tailL);
      this.bandTail = tailL;
    }
    if (b.cap) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.112 * hs, 14, 8, 0, TAU, 0, Math.PI * 0.55),
        mat(new THREE.Color(C.trim).convertSRGBToLinear()));
      cap.position.set(0, 0.108 * hs, -0.004 * hs);
      head.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * hs, 0.095 * hs, 0.012 * hs, 14, 1, false, -0.9, 1.8),
        mat(new THREE.Color(C.trim).convertSRGBToLinear()));
      brim.position.set(0, 0.110 * hs, 0.070 * hs);
      head.add(brim);
    }
    if (b.turban) {
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry((0.098 - i * 0.008) * hs, 0.022 * hs, 6, 18),
          mat(new THREE.Color(C.gi).convertSRGBToLinear()));
        ring.rotation.set(Math.PI / 2 + i * 0.22, i * 0.4, 0);
        ring.position.set(0, (0.118 + i * 0.028) * hs, -0.004 * hs);
        head.add(ring);
      }
    }
    if (b.visor) {
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.092 * hs, 14, 8, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.28, Math.PI * 0.3),
        mat(new THREE.Color(C.accent || '#4fc3f7').convertSRGBToLinear(), {
          emissive: new THREE.Color(C.accent || '#4fc3f7').convertSRGBToLinear(),
          emissiveIntensity: 0.5, transparent: true, opacity: 0.75
        }));
      visor.position.set(0, 0.112 * hs, 0.012 * hs);
      head.add(visor);
    }
    if (b.beard) {
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.070 * hs, 12, 8, 0, TAU, Math.PI * 0.45, Math.PI * 0.5),
        mat(new THREE.Color(C.hair).convertSRGBToLinear()));
      beard.position.set(0, 0.050 * hs, 0.052 * hs);
      beard.scale.set(1.0, 1.15, 1.0);
      head.add(beard);
    }

    // Pañuelo / bufanda: cadena de segmentos con física propia
    if (b.scarf) {
      const scarfMat = mat(new THREE.Color(C.scarf === true ? (C.accent || '#e53935') : C.scarf).convertSRGBToLinear());
      this.scarf = [];
      let parent = this.bones.Neck;
      const baseY = 0.02 * this.s;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.10 * this.s * (1 - i * 0.09), 0.075 * this.s, 0.035 * this.s), scarfMat);
        seg.position.set(0, i === 0 ? baseY : -0.062 * this.s, i === 0 ? 0 : -0.02 * this.s);
        parent.add(seg);
        this.scarf.push(seg);
        parent = seg;
      }
      this.scarfVel = this.scarf.map(() => 0);
    }

    // Aura del modo MAX
    const auraMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(C.aura || C.accent || '#ffd54f').convertSRGBToLinear(),
      transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(0.62 * this.s, 18, 14), auraMat);
    this.aura.scale.set(0.72, 1.5, 0.72);
    this.aura.position.y = 0.92 * this.s;
    this.root.add(this.aura);
  }

  /* --- mantenimiento ------------------------------------------------ */

  /** Fuerza el cálculo de las matrices de hueso (útil tras teletransportar). */
  updateMatrices() {
    this.root.updateMatrixWorld(true);
    this.skeleton.update();
  }

  dispose() {
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) this.mesh.material.forEach((m) => m.dispose());
    else this.mesh.material.dispose();
    if (this.faceDecal) {
      this.faceDecal.geometry.dispose();
      this.faceDecal.material.map && this.faceDecal.material.map.dispose();
      this.faceDecal.material.dispose();
    }
    this.root.traverse((o) => {
      if (o.isMesh && o !== this.mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}

/* ------------------------------------------------------------------ */
/* Extracción de superficie: marching tetrahedra sobre el campo        */
/* ------------------------------------------------------------------ */

function fieldVal(F, p) {
  const [d0, , d1] = F.nearest2(p);
  return smoothMin(d0, d1, 0.018);
}

function smoothMin(d0, d1, h) {
  if (d1 - d0 >= h) return d0;
  const t = (d1 - d0) / h;
  return d0 - 0.25 * h * (1 - t) * (1 - t);
}

/**
 * Extrae la superficie (valor 0 del campo) con marching tetrahedra: cada celda
 * de la rejilla se parte en 6 tetraedros y cada tetraedro se triangula según
 * los signos de sus esquinas. Los vértices se comparten por arista (cache),
 * así la malla sale estanca y las normales por gradiente, siempre hacia fuera.
 */
function extractSurface(F, s) {
  const H_G = 0.018;             // suavidad geométrica (funde sin aristas ni anillos)
  const H_A = 0.02;              // suavidad de atributos (ropa casi nítida)
  const cell = 0.024 * s;
  const pad = cell * 1.5;
  const min = F.min.map((v) => v - pad), max = F.max.map((v) => v + pad);
  const nx = Math.min(110, Math.ceil((max[0] - min[0]) / cell));
  const ny = Math.min(130, Math.ceil((max[1] - min[1]) / cell));
  const nz = Math.min(60, Math.ceil((max[2] - min[2]) / cell));

  // Binning espacial: cada primitiva se registra en las celdas que cubre su
  // AABB (margen de 1 celda). Cada esquina evalúa solo su cubo: un punto
  // dentro de una primitiva siempre cae en su AABB, así el signo del campo
  // (lo único que importa al extraer la superficie) sigue siendo exacto.
  const P = F.prims;
  const bw0 = (max[0] - min[0]) / nx, bw1 = (max[1] - min[1]) / ny, bw2 = (max[2] - min[2]) / nz;
  const buckets = new Array(nx * ny * nz);
  for (let i = 0; i < P.length; i++) {
    const pr = P[i];
    const x0 = Math.max(0, Math.floor((pr.bc[0] - pr.ex - bw0 - min[0]) / bw0));
    const x1 = Math.min(nx - 1, Math.floor((pr.bc[0] + pr.ex + bw0 - min[0]) / bw0));
    const y0 = Math.max(0, Math.floor((pr.bc[1] - pr.ey - bw1 - min[1]) / bw1));
    const y1 = Math.min(ny - 1, Math.floor((pr.bc[1] + pr.ey + bw1 - min[1]) / bw1));
    const z0 = Math.max(0, Math.floor((pr.bc[2] - pr.ez - bw2 - min[2]) / bw2));
    const z1 = Math.min(nz - 1, Math.floor((pr.bc[2] + pr.ez + bw2 - min[2]) / bw2));
    for (let zz = z0; zz <= z1; zz++)
      for (let yy = y0; yy <= y1; yy++)
        for (let xx = x0; xx <= x1; xx++) {
          const bi = (zz * ny + yy) * nx + xx;
          (buckets[bi] || (buckets[bi] = [])).push(i);
        }
  }

  // Esquinas: valor + atributos mezclados (color, mat, huesos)
  const NC = (nx + 1) * (ny + 1) * (nz + 1);
  const val = new Float32Array(NC);
  const colA = new Float32Array(NC * 3);
  const matA = new Float32Array(NC);
  const siA = new Uint16Array(NC * 4);
  const swA = new Float32Array(NC * 4);
  const p = [0, 0, 0];
  const EMPTY = [];
  let ci = 0;
  for (let z = 0; z <= nz; z++) {
    p[2] = min[2] + (z * (max[2] - min[2])) / nz;
    const bz = Math.min(nz - 1, z);
    for (let y = 0; y <= ny; y++) {
      p[1] = min[1] + (y * (max[1] - min[1])) / ny;
      const byy = Math.min(ny - 1, y);
      for (let x = 0; x <= nx; x++, ci++) {
        p[0] = min[0] + (x * (max[0] - min[0])) / nx;
        const list = buckets[(bz * ny + byy) * nx + Math.min(nx - 1, x)] || EMPTY;
        let d0 = Infinity, i0 = 0, d1 = Infinity, i1 = 0;
        for (let li = 0; li < list.length; li++) {
          const i = list[li];
          const d = F.sdPrim(p, P[i]);
          if (d < d0) { d1 = d0; i1 = i0; d0 = d; i0 = i; }
          else if (d < d1) { d1 = d; i1 = i; }
        }
        if (d0 === Infinity) { val[ci] = 1; continue; }   // celda vacía: fuera
        val[ci] = smoothMin(d0, d1, H_G);
        // atributos: mezcla de los dos primitivas dominantes
        const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (d0 - d1) / H_A)); // peso de i1
        const pa = P[i0], pb = P[i1];
        colA[ci * 3] = pa.col[0] + (pb.col[0] - pa.col[0]) * t;
        colA[ci * 3 + 1] = pa.col[1] + (pb.col[1] - pa.col[1]) * t;
        colA[ci * 3 + 2] = pa.col[2] + (pb.col[2] - pa.col[2]) * t;
        matA[ci] = pa.mat + (pb.mat - pa.mat) * t;
        // huesos: unión de los dos conjuntos, pesos mezclado-normalizados
        const bw = {};
        for (let k = 0; k < pa.bones.length; k++) bw[pa.bones[k]] = (bw[pa.bones[k]] || 0) + pa.weights[k] * (1 - t);
        for (let k = 0; k < pb.bones.length; k++) bw[pb.bones[k]] = (bw[pb.bones[k]] || 0) + pb.weights[k] * t;
        const entries = Object.entries(bw).sort((a, b2) => b2[1] - a[1]).slice(0, 4);
        let sum = 0;
        for (const [, w] of entries) sum += w;
        for (let k = 0; k < 4; k++) {
          siA[ci * 4 + k] = entries[k] ? +entries[k][0] : 0;
          swA[ci * 4 + k] = entries[k] ? entries[k][1] / (sum || 1) : 0;
        }
      }
    }
  }

  const cidx = (x, y, z) => (z * (ny + 1) + y) * (nx + 1) + x;

  // Vértices compartidos por arista de rejilla
  const vMap = new Map();
  const positions = [], colors = [], mats = [], uvs = [], sis = [], sws = [];
  const indices = [];
  const K = 3;

  function vertOnEdge(a, b) {
    const key = a < b ? a * NC + b : b * NC + a;
    let v = vMap.get(key);
    if (v !== undefined) return v;
    const fa = val[a], fb = val[b];
    const t = fa / (fa - fb);
    const ax = a % (nx + 1), ay = Math.floor(a / (nx + 1)) % (ny + 1), az = Math.floor(a / ((nx + 1) * (ny + 1)));
    const bx = b % (nx + 1), by = Math.floor(b / (nx + 1)) % (ny + 1), bz = Math.floor(b / ((nx + 1) * (ny + 1)));
    const px = min[0] + ((ax + (bx - ax) * t) * (max[0] - min[0])) / nx;
    const py = min[1] + ((ay + (by - ay) * t) * (max[1] - min[1])) / ny;
    const pz = min[2] + ((az + (bz - az) * t) * (max[2] - min[2])) / nz;
    v = positions.length / 3;
    positions.push(px, py, pz);
    colors.push(
      colA[a * 3] + (colA[b * 3] - colA[a * 3]) * t,
      colA[a * 3 + 1] + (colA[b * 3 + 1] - colA[a * 3 + 1]) * t,
      colA[a * 3 + 2] + (colA[b * 3 + 2] - colA[a * 3 + 2]) * t
    );
    mats.push(matA[a] + (matA[b] - matA[a]) * t);
    uvs.push((px + pz) * K, py * K);
    // huesos del vértice: unión con lerp (nunca interpolar índices sueltos)
    const bw = {};
    for (let k = 0; k < 4; k++) {
      if (swA[a * 4 + k] > 0) bw[siA[a * 4 + k]] = (bw[siA[a * 4 + k]] || 0) + swA[a * 4 + k] * (1 - t);
      if (swA[b * 4 + k] > 0) bw[siA[b * 4 + k]] = (bw[siA[b * 4 + k]] || 0) + swA[b * 4 + k] * t;
    }
    const entries = Object.entries(bw).sort((q, w) => w[1] - q[1]).slice(0, 4);
    let sum = 0;
    for (const [, w] of entries) sum += w;
    for (let k = 0; k < 4; k++) {
      sis.push(entries[k] ? +entries[k][0] : 0);
      sws.push(entries[k] ? entries[k][1] / (sum || 1) : 0);
    }
    vMap.set(key, v);
    return v;
  }

  // 6 tetraedros por celda (esquinas en orden binario estándar)
  const TETS = [
    [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6],
    [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]
  ];
  const OFF = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const c = new Array(8);
        const f = new Array(8);
        for (let k = 0; k < 8; k++) {
          c[k] = cidx(x + OFF[k][0], y + OFF[k][1], z + OFF[k][2]);
          f[k] = val[c[k]];
        }
        for (const tet of TETS) {
          const inside = [];
          const outside = [];
          for (const k of tet) (f[k] < 0 ? inside : outside).push(k);
          if (inside.length === 0 || outside.length === 0) continue;
          if (inside.length === 1 || inside.length === 3) {
            const odd = inside.length === 1 ? inside : outside;
            const o = odd[0];
            const others = tet.filter((k) => k !== o);
            const v0 = vertOnEdge(c[o], c[others[0]]);
            const v1 = vertOnEdge(c[o], c[others[1]]);
            const v2 = vertOnEdge(c[o], c[others[2]]);
            if (v0 !== v1 && v1 !== v2 && v0 !== v2) indices.push(v0, v1, v2);
          } else {
            const [a, b] = inside;
            const [cc2, d] = outside;
            const vac = vertOnEdge(c[a], c[cc2]);
            const vbc = vertOnEdge(c[b], c[cc2]);
            const vbd = vertOnEdge(c[b], c[d]);
            const vad = vertOnEdge(c[a], c[d]);
            if (vac !== vbc && vbc !== vbd && vac !== vbd) indices.push(vac, vbc, vbd);
            if (vac !== vbd && vbd !== vad && vac !== vad) indices.push(vac, vbd, vad);
          }
        }
      }
    }
  }

  return { positions, colors, mats, uvs, sis, sws, indices };
}

/** Dos grupos de material (0 tela, 1 piel) según el atributo mat por triángulo. */
function splitGroupsByMat(geo, mats) {
  const idx = geo.getIndex();
  const order = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    const m = (mats[a] + mats[b] + mats[c]) >= 1.5 ? 1 : 0;
    order.push([m, a, b, c]);
  }
  order.sort((x, y) => x[0] - y[0]);
  const ni = [];
  let split = 0;
  for (const [m, a, b, c] of order) {
    ni.push(a, b, c);
    if (m === 0) split += 3;
  }
  geo.setIndex(ni);
  geo.clearGroups();
  if (split > 0) geo.addGroup(0, split, 0);
  if (split < ni.length) geo.addGroup(split, ni.length - split, 1);
}

/**
 * Trama de tela procedural (tejido + arrugas) en un canvas pequeño y tileable.
 * Es gris: el color lo ponen los vertexColors de cada parte del cuerpo, así
 * una misma textura viste el gi, el pantalón, los guantes y la piel de los
 * diez luchadores. Sin contexto 2D (tests en Node) devuelve null y el
 * material queda liso.
 */
function clothTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#e8e8e8';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) {
    x.fillStyle = 'rgba(0,0,0,0.14)';
    x.fillRect(0, i, 128, 2);
    x.fillRect(i, 0, 2, 128);
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.fillRect(0, i + 2, 128, 1);
    x.fillRect(i + 2, 0, 1, 128);
  }
  for (let i = 0; i < 46; i++) {
    const a = 0.04 + Math.random() * 0.06;
    x.fillStyle = `rgba(0,0,0,${a})`;
    x.beginPath();
    x.ellipse(Math.random() * 128, Math.random() * 128,
      5 + Math.random() * 16, 2 + Math.random() * 6, Math.random() * 3.1, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

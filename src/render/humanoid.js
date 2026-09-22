/**
 * Humanoide procedural con malla skinneada.
 *
 * A diferencia de un muñeco de cajas, aquí hay UN solo SkinnedMesh: cada vértice
 * lleva índices y pesos de hueso, así que codos, rodillas, cintura y cuello se
 * doblan de forma continua en lugar de abrir huecos entre piezas.
 *
 * Todas las posiciones de vértice se generan en el espacio de la pose de reposo
 * (T-pose), que es el espacio que espera el skinning; los pesos reparten cada
 * vértice entre los dos huesos que se encuentran en esa articulación.
 *
 * Las proporciones salen de skeleton-def.js (humano de 1.75 m) escaladas por
 * luchador con body.{height,bulk,armLen,legLen,head}.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { JOINTS, RIG_HEIGHT } from '../anim/skeleton-def.js';

/** Altura en unidades de mundo de un luchador de proporciones estándar. */
export const WORLD_HEIGHT = 1.86;
const UNIT = WORLD_HEIGHT / RIG_HEIGHT;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Acumulador de geometría                                             */
/* ------------------------------------------------------------------ */

class Geo {
  constructor() {
    this.pos = [];
    this.col = [];
    this.idx = [];
    this.si = [];
    this.sw = [];
    this.uv = [];
  }

  vert(x, y, z, color, bones, weights, u = 0, v = 0) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.col.push(color.r, color.g, color.b);
    this.uv.push(u, v);
    const b = [0, 0, 0, 0], w = [0, 0, 0, 0];
    let sum = 0;
    for (let k = 0; k < bones.length && k < 4; k++) {
      b[k] = bones[k];
      w[k] = weights[k];
      sum += weights[k];
    }
    if (sum <= 0) { b[0] = bones[0] || 0; w[0] = 1; sum = 1; }
    for (let k = 0; k < 4; k++) this.sw.push(w[k] / sum);
    this.si.push(b[0], b[1], b[2], b[3]);
    return i;
  }

  /**
   * Une dos anillos consecutivos. `a` y `b` son los ARRAYS de índices devueltos
   * al generar cada anillo (no su índice base): así no dependemos de que los
   * vértices sean contiguos y no hay riesgo de concatenar strings por error.
   */
  stitch(a, b) {
    // Anillos "abiertos": el último vértice duplica el primero con la UV de
    // costura completa, así la textura no da la vuelta entera en un triángulo.
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n - 1; i++) {
      const i2 = i + 1;
      this.idx.push(a[i], b[i2], b[i], a[i], a[i2], b[i2]);
    }
  }

  /** Tapa un anillo con un abanico de triángulos hacia el vértice `center`. */
  cap(ring, center, flip = false) {
    for (let i = 0; i < ring.length - 1; i++) {
      const i2 = i + 1;
      if (flip) this.idx.push(center, ring[i], ring[i2]);
      else this.idx.push(center, ring[i2], ring[i]);
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
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

    const g = new Geo();
    this.buildLegs(g);
    this.buildTorso(g);
    this.buildArms(g);
    this.buildHead(g);

    // Doble cara: con geometría procedural el sentido de los índices puede variar
    // por tramo; three.js invierte la normal en las caras traseras, así la
    // iluminación sigue siendo correcta y no aparecen piezas invisibles.
    const cloth = clothTexture();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
      map: cloth || null,
      bumpMap: cloth || null,
      bumpScale: 0.35
    });
    this.mesh = new THREE.SkinnedMesh(g.toGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
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

  col(hex) {
    const c = new THREE.Color(hex || '#888888');
    c.convertSRGBToLinear();
    return c;
  }

  mix(a, b, t) {
    const c = this.col(a);
    c.lerp(this.col(b), t);
    return c;
  }

  /** Peso lineal entre dos huesos según `t` (0 = todo A, 1 = todo B). */
  blend2(A, B, t) {
    const ia = this.boneIndex[A], ib = this.boneIndex[B];
    if (t <= 0.001) return { b: [ia], w: [1] };
    if (t >= 0.999) return { b: [ib], w: [1] };
    return { b: [ia, ib], w: [1 - t, t] };
  }

  /** Reparte el peso entre varios huesos según la altura (para el torso). */
  byHeight(y, stops) {
    // stops: [{name, y}] ordenados por y
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

  /**
   * Superficie de revolución: anillos elípticos a lo largo de un eje.
   * points: [{d, rx, rz, color, b:[], w:[], oy?, oz?}]
   */
  loft(g, origin, axis, points, radial = 14, capEnds = true) {
    const A = new THREE.Vector3(...axis).normalize();
    // Dos vectores perpendiculares estables
    const ref = Math.abs(A.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const U = new THREE.Vector3().crossVectors(A, ref).normalize();
    const V = new THREE.Vector3().crossVectors(A, U).normalize();
    const O = new THREE.Vector3(...origin);

    const K = 3;   // repeticiones de textura por metro
    const rings = [];
    let vAcc = 0;
    let prevD = null;
    for (const p of points) {
      if (prevD !== null) vAcc += Math.abs(p.d - prevD) * K;
      prevD = p.d;
      const c = O.clone().addScaledVector(A, p.d)
        .addScaledVector(U, p.ou || 0).addScaledVector(V, p.ov || 0);
      const circ = TAU * (p.rx + p.rz) * 0.5 * K;
      const ring = [];
      for (let i = 0; i <= radial; i++) {   // <= : duplica la costura con u completa
        const a = ((i % radial) / radial) * TAU;
        const ca = Math.cos(a), sa = Math.sin(a);
        const x = c.x + U.x * ca * p.rx + V.x * sa * p.rz;
        const y = c.y + U.y * ca * p.rx + V.y * sa * p.rz;
        const z = c.z + U.z * ca * p.rx + V.z * sa * p.rz;
        ring.push(g.vert(x, y, z, p.color, p.b, p.w, (i / radial) * circ, vAcc));
      }
      rings.push(ring);
    }
    for (let k = 0; k < rings.length - 1; k++) g.stitch(rings[k], rings[k + 1]);
    if (capEnds) {
      const first = points[0], last = points[points.length - 1];
      const c0 = g.vert(...O.clone().addScaledVector(A, first.d)
        .addScaledVector(U, first.ou || 0).addScaledVector(V, first.ov || 0).toArray(),
        first.color, first.b, first.w);
      g.cap(rings[0], c0, true);
      const Oe = O.clone().addScaledVector(A, last.d);
      const c1 = g.vert(...Oe.addScaledVector(U, last.ou || 0).addScaledVector(V, last.ov || 0).toArray(),
        last.color, last.b, last.w);
      g.cap(rings[rings.length - 1], c1, false);
    }
    return rings;
  }

  /** Esfera/elipsoide con pesos constantes. */
  ball(g, center, r, color, bones, weights, squash = [1, 1, 1], seg = 12) {
    const rings = Math.max(4, Math.round(seg * 0.7));
    const ringIdx = [];
    const K = 3;
    for (let j = 1; j < rings; j++) {
      const phi = (j / rings) * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      const circ = TAU * r * sp * K;
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const th = ((i % seg) / seg) * TAU;
        ring.push(g.vert(
          center[0] + r * sp * Math.cos(th) * squash[0],
          center[1] + r * cp * squash[1],
          center[2] + r * sp * Math.sin(th) * squash[2],
          color, bones, weights, (i / seg) * circ, phi * r * K
        ));
      }
      ringIdx.push(ring);
    }
    for (let k = 0; k < ringIdx.length - 1; k++) g.stitch(ringIdx[k], ringIdx[k + 1]);
    const top = g.vert(center[0], center[1] + r * squash[1], center[2], color, bones, weights);
    g.cap(ringIdx[0], top, true);
    const bot = g.vert(center[0], center[1] - r * squash[1], center[2], color, bones, weights);
    g.cap(ringIdx[ringIdx.length - 1], bot, false);
  }

  /* --- piernas ------------------------------------------------------ */

  buildLegs(g) {
    const C = this.colors;
    const bulk = this.bulk;
    const skin = this.col(C.skin);
    const pants = this.col(C.gi);
    const trim = this.col(C.trim);
    const boot = this.col(C.boot);

    for (const side of ['Left', 'Right']) {
      const hip = this.bp[`${side}UpLeg`];
      const knee = this.bp[`${side}Leg`];
      const ankle = this.bp[`${side}Foot`];
      const toe = this.bp[`${side}ToeBase`];
      const thighLen = Math.hypot(knee[1] - hip[1], knee[0] - hip[0]);
      const shinLen = Math.hypot(ankle[1] - knee[1], ankle[0] - knee[0]);

      // El grosor crece con el tamaño y con la longitud de pierna: una pierna
      // un 20 % más larga con el mismo radio parecería un fideo.
      const wide = (0.052 + 0.030 * (bulk - 1) + 0.010) * this.s * Math.sqrt(this.legLen);
      // Muslo: grueso arriba, más fino en la rodilla
      this.loft(g, hip, [knee[0] - hip[0], knee[1] - hip[1], 0], [
        { d: 0.00, rx: wide * 1.25, rz: wide * 1.20, color: pants, ...this.legW(side, 0) },
        { d: thighLen * 0.35, rx: wide * 1.10, rz: wide * 1.05, color: pants, ...this.legW(side, 0.1) },
        { d: thighLen * 0.75, rx: wide * 0.86, rz: wide * 0.84, color: pants, ...this.legW(side, 0.35) },
        { d: thighLen, rx: wide * 0.72, rz: wide * 0.72, color: pants, ...this.legW(side, 0.72) }
      ], 12, false);

      // Rodilla + gemelo: la pantorrilla tiene su volumen máximo arriba
      this.loft(g, knee, [ankle[0] - knee[0], ankle[1] - knee[1], 0], [
        { d: 0.00, rx: wide * 0.72, rz: wide * 0.74, color: pants, ...this.legW(side, 0.72) },
        { d: shinLen * 0.22, rx: wide * 0.70, rz: wide * 0.86, color: pants, ...this.legW(side, 0.85) },
        { d: shinLen * 0.60, rx: wide * 0.52, rz: wide * 0.62, color: pants, ...this.legW(side, 0.96) },
        { d: shinLen * 0.86, rx: wide * 0.40, rz: wide * 0.44, color: boot, ...this.legW(side, 1) },
        { d: shinLen, rx: wide * 0.40, rz: wide * 0.46, color: boot, ...this.footW(side, 0) }
      ], 12, false);

      // Pie: cuña hacia los dedos
      const fwd = [toe[0] - ankle[0], 0, toe[2] - ankle[2]];
      this.loft(g, [ankle[0], ankle[1] - 0.012 * this.s, ankle[2]], fwd, [
        { d: -0.02 * this.s, rx: wide * 0.44, rz: wide * 0.40, color: boot, ...this.footW(side, 0) },
        { d: 0.03 * this.s, rx: wide * 0.52, rz: wide * 0.46, color: boot, ...this.footW(side, 0.2) },
        { d: 0.11 * this.s, rx: wide * 0.48, rz: wide * 0.34, color: boot, ...this.footW(side, 0.7) },
        { d: 0.17 * this.s, rx: wide * 0.36, rz: wide * 0.20, color: boot, ...this.footW(side, 1) }
      ], 10);

      // Rótula y tobillo: esferas que tapan las uniones
      this.ball(g, knee, wide * 0.74, pants,
        [this.boneIndex[`${side}Leg`]], [1], [1, 1, 1], 10);
      this.ball(g, ankle, wide * 0.44, boot,
        [this.boneIndex[`${side}Foot`]], [1], [1, 0.8, 1], 10);
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

  buildTorso(g) {
    const C = this.colors;
    const bulk = this.bulk;
    const gi = this.col(C.gi);
    const trim = this.col(C.trim);
    const belt = this.col(C.belt || C.trim);
    const skin = this.col(C.skin);

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

    // Ancho de hombros y caja torácica según constitución
    const chestX = (0.155 + 0.030 * (bulk - 1)) * this.s * 1.06;
    const chestZ = (0.105 + 0.018 * (bulk - 1)) * this.s * 1.06;
    const waistX = chestX * 0.78, waistZ = chestZ * 0.86;
    const pelvisX = chestX * 0.92, pelvisZ = chestZ * 0.95;

    const yHips = hips[1];
    const profile = [
      { y: yHips - 0.055 * this.s, rx: pelvisX * 0.94, rz: pelvisZ * 0.94, color: gi },
      { y: yHips + 0.010 * this.s, rx: pelvisX, rz: pelvisZ, color: gi },
      { y: yHips + 0.055 * this.s, rx: waistX * 1.02, rz: waistZ * 1.0, color: gi },
      { y: this.bp.LowerBack[1] + 0.03 * this.s, rx: waistX, rz: waistZ, color: gi },
      { y: spine[1] + 0.02 * this.s, rx: chestX * 0.92, rz: chestZ * 0.95, color: gi },
      { y: spine1[1] - 0.03 * this.s, rx: chestX, rz: chestZ, color: gi },
      { y: spine1[1] + 0.05 * this.s, rx: chestX * 0.94, rz: chestZ * 0.9, color: gi },
      { y: neck[1] - 0.02 * this.s, rx: chestX * 0.62, rz: chestZ * 0.66, color: gi }
    ].map((p) => ({ d: p.y, rx: p.rx, rz: p.rz, color: p.color, ...W(p.y) }));

    this.loft(g, [0, 0, 0], [0, 1, 0], profile, 16, true);

    // Cinturón
    const beltY = yHips + 0.045 * this.s;
    this.loft(g, [0, beltY - 0.028 * this.s, 0], [0, 1, 0], [
      { d: 0, rx: waistX * 1.07, rz: waistZ * 1.07, color: belt, ...W(beltY) },
      { d: 0.05 * this.s, rx: waistX * 1.07, rz: waistZ * 1.07, color: belt, ...W(beltY + 0.04) }
    ], 16, false);

    // Cuello
    this.loft(g, [0, neck[1] - 0.03 * this.s, 0], [0, 1, 0], [
      { d: 0, rx: 0.052 * this.s, rz: 0.055 * this.s, color: gi, ...W(neck[1] - 0.03 * this.s) },
      { d: 0.07 * this.s, rx: 0.048 * this.s, rz: 0.050 * this.s, color: skin, ...W(neck[1] + 0.03 * this.s) },
      { d: 0.11 * this.s, rx: 0.047 * this.s, rz: 0.049 * this.s, color: skin, ...W(neck[1] + 0.07 * this.s) }
    ], 12, false);

    // Trapecios / deltoides: volumen sobre los hombros
    for (const side of ['Left', 'Right']) {
      const sh = this.bp[`${side}Arm`];
      const dir = Math.sign(sh[0]) || 1;
      this.ball(g, [sh[0] * 0.55, sh[1] + 0.015 * this.s, 0], 0.062 * this.s * (0.9 + 0.15 * bulk), gi,
        [this.boneIndex.Spine1, this.boneIndex[`${side}Shoulder`]], [0.55, 0.45], [1.1, 0.8, 1.0], 10);
      this.ball(g, sh, 0.062 * this.s * (0.95 + 0.18 * bulk), gi,
        [this.boneIndex[`${side}Arm`]], [1], [1, 1, 1], 10);
    }

    // Pectorales (apenas insinuados: dan volumen sin romper la silueta)
    const pecY = spine1[1] - 0.01 * this.s;
    for (const dx of [-1, 1]) {
      this.ball(g, [dx * chestX * 0.45, pecY, chestZ * 0.62], chestX * 0.42, gi,
        [this.boneIndex.Spine1], [1], [1, 0.72, 0.72], 10);
    }
  }

  /* --- brazos ------------------------------------------------------- */

  buildArms(g) {
    const C = this.colors;
    const bulk = this.bulk;
    const gi = this.col(C.gi);
    const skin = this.col(C.skin);
    const glove = this.col(C.glove || C.trim);
    const trim = this.col(C.trim);

    for (const side of ['Left', 'Right']) {
      const sh = this.bp[`${side}Arm`];
      const el = this.bp[`${side}ForeArm`];
      const wr = this.bp[`${side}Hand`];
      const dir = Math.sign(el[0] - sh[0]) || 1;
      const upLen = Math.abs(el[0] - sh[0]);
      const foreLen = Math.abs(wr[0] - el[0]);
      const rUp = (0.050 + 0.016 * (bulk - 1)) * this.s * Math.sqrt(this.armLen);
      const rFore = rUp * 0.82;

      // Brazo: bíceps lleno, codo más estrecho
      this.loft(g, sh, [dir, 0, 0], [
        { d: 0, rx: rUp * 1.12, rz: rUp * 1.08, color: gi, ...this.armW(side, 0) },
        { d: upLen * 0.4, rx: rUp * 1.02, rz: rUp * 0.98, color: gi, ...this.armW(side, 0.2) },
        { d: upLen, rx: rUp * 0.80, rz: rUp * 0.80, color: gi, ...this.armW(side, 0.75) }
      ], 12, false);

      // Antebrazo: musculoso arriba, muñeca fina
      this.loft(g, el, [dir, 0, 0], [
        { d: 0, rx: rFore * 1.05, rz: rFore * 1.0, color: skin, ...this.armW(side, 0.75) },
        { d: foreLen * 0.35, rx: rFore * 0.94, rz: rFore * 0.88, color: skin, ...this.armW(side, 0.9) },
        { d: foreLen * 0.86, rx: rFore * 0.68, rz: rFore * 0.66, color: skin, ...this.armW(side, 1) },
        { d: foreLen, rx: rFore * 0.66, rz: rFore * 0.62, color: trim, ...this.handW(side, 0) }
      ], 12, false);

      // Puño cerrado: caja redondeada alineada con el antebrazo
      const handLen = 0.10 * this.s;
      this.loft(g, [wr[0] + dir * 0.012 * this.s, wr[1], wr[2]], [dir, 0, 0], [
        { d: 0, rx: rFore * 0.80, rz: rFore * 0.92, color: glove, ...this.handW(side, 0.2) },
        { d: handLen * 0.55, rx: rFore * 0.92, rz: rFore * 1.00, color: glove, ...this.handW(side, 0.8) },
        { d: handLen, rx: rFore * 0.78, rz: rFore * 0.86, color: glove, ...this.handW(side, 1) }
      ], 10);
      // Pulgar
      this.ball(g, [wr[0] + dir * handLen * 0.35, wr[1] - rFore * 0.55, wr[2] + 0.028 * this.s],
        rFore * 0.42, glove, [this.boneIndex[`${side}Hand`]], [1], [1.4, 0.8, 0.9], 8);

      this.ball(g, el, rFore * 0.82, skin, [this.boneIndex[`${side}ForeArm`]], [1], [1, 1, 1], 10);
    }
  }

  armW(side, t) {
    const a = `${side}Arm`, b = `${side}ForeArm`;
    const k = t <= 0.75 ? 0 : (t - 0.75) / 0.25;
    return this.blend2(a, b, k * k * (3 - 2 * k) * 0.9);
  }

  handW(side, t) {
    return { b: [this.boneIndex[`${side}Hand`]], w: [1] };
  }

  /* --- cabeza ------------------------------------------------------- */

  buildHead(g) {
    const C = this.colors;
    const b = this.body;
    const skin = this.col(C.skin);
    const hairC = this.col(C.hair);
    const hs = (b.head || 1) * this.s;
    const headBase = this.bp.Head;
    const cy = headBase[1] + 0.105 * hs;   // centro del cráneo
    const cz = headBase[2];
    const headBone = [this.boneIndex.Head];

    // Cráneo: más alto que ancho, con la nuca prominente
    this.ball(g, [0, cy, cz - 0.004 * hs], 0.098 * hs, skin, headBone, [1], [0.86, 1.08, 0.98], 16);
    // Cara / maxilar: se estrecha hacia la barbilla
    this.loft(g, [0, cy - 0.012 * hs, cz + 0.012 * hs], [0, -1, 0], [
      { d: 0, rx: 0.072 * hs, rz: 0.078 * hs, color: skin, b: headBone, w: [1] },
      { d: 0.045 * hs, rx: 0.064 * hs, rz: 0.070 * hs, color: skin, b: headBone, w: [1] },
      { d: 0.085 * hs, rx: 0.048 * hs, rz: 0.056 * hs, color: skin, b: headBone, w: [1] },
      { d: 0.105 * hs, rx: 0.030 * hs, rz: 0.038 * hs, color: skin, b: headBone, w: [1] }
    ], 14);
    // Nariz
    this.loft(g, [0, cy - 0.012 * hs, cz + 0.082 * hs], [0, -0.25, 1], [
      { d: 0, rx: 0.016 * hs, rz: 0.016 * hs, color: skin, b: headBone, w: [1] },
      { d: 0.030 * hs, rx: 0.013 * hs, rz: 0.014 * hs, color: skin, b: headBone, w: [1] },
      { d: 0.042 * hs, rx: 0.005 * hs, rz: 0.006 * hs, color: skin, b: headBone, w: [1] }
    ], 8);
    // Orejas
    for (const dx of [-1, 1]) {
      this.ball(g, [dx * 0.084 * hs, cy - 0.012 * hs, cz - 0.006 * hs], 0.024 * hs, skin,
        headBone, [1], [0.42, 1.1, 0.8], 8);
    }
    // Ojos (ligeramente hundidos) y cejas
    const dark = this.col('#1a1418');
    const white = this.col('#e8e2dc');
    for (const dx of [-1, 1]) {
      this.ball(g, [dx * 0.034 * hs, cy + 0.008 * hs, cz + 0.078 * hs], 0.0135 * hs, white,
        headBone, [1], [1, 0.72, 0.5], 8);
      this.ball(g, [dx * 0.034 * hs, cy + 0.008 * hs, cz + 0.086 * hs], 0.0072 * hs, dark,
        headBone, [1], [1, 1, 0.6], 8);
      this.ball(g, [dx * 0.036 * hs, cy + 0.032 * hs, cz + 0.074 * hs], 0.014 * hs,
        this.col(C.hair), headBone, [1], [1.3, 0.35, 0.5], 8);
    }
    // Boca
    this.ball(g, [0, cy - 0.052 * hs, cz + 0.070 * hs], 0.017 * hs, this.col('#5d2b2b'),
      headBone, [1], [1.5, 0.28, 0.4], 8);
  }

  /* --- pelo y accesorios (mallas sueltas ancladas a huesos) --------- */

  buildExtras() {
    const b = this.body;
    const C = this.colors;
    const hairC = this.col(C.hair);
    const hs = (b.head || 1) * this.s;
    const head = this.bones.Head;
    const headLocal = new THREE.Vector3(0, 0.105 * hs, 0);

    const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 0.62, metalness: 0.05, ...extra
    });
    const hairMat = mat(new THREE.Color(C.hair || '#222').convertSRGBToLinear());

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
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.026 * hs, 0.10 * hs, 5), hairMat);
          spike.position.set(Math.cos(a) * 0.062 * hs, 0.055 * hs + Math.sin(i * 2.1) * 0.012 * hs, Math.sin(a) * 0.062 * hs);
          spike.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
          grp.add(spike);
        }
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.094 * hs, 14, 10, 0, TAU, 0, Math.PI * 0.62), hairMat);
        cap.scale.set(0.9, 1.05, 1.0);
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
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.099 * hs, 14, 10, 0, TAU, 0, Math.PI * 0.66), hairMat);
        cap.scale.set(0.95, 1.05, 1.02);
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
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.096 * hs, 14, 10, 0, TAU, 0, Math.PI * 0.64), hairMat);
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
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.097 * hs, 14, 8, 0, TAU, 0, Math.PI * 0.55), hairMat);
        cap.scale.set(0.98, 0.82, 1.0);
        add(cap);
        break;
      }
      case 'mask': {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.100 * hs, 16, 12), hairMat);
        cap.scale.set(0.9, 1.06, 0.98);
        add(cap);
        // Abertura de los ojos
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.14 * hs, 0.026 * hs, 0.02 * hs),
          mat(this.col(C.skin)));
        slit.position.set(0, 0.010 * hs, 0.076 * hs);
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
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.097 * hs, 14, 10, 0, TAU, 0, Math.PI * 0.6), hairMat);
        add(cap);
      }
    }

    // Cinta en la frente
    if (b.band) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.088 * hs, 0.013 * hs, 6, 18),
        mat(new THREE.Color(C.trim || '#c62828').convertSRGBToLinear()));
      band.rotation.x = Math.PI / 2;
      band.position.set(0, 0.028 * hs, 0);
      head.add(band);
      const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.022 * hs, 0.13 * hs, 0.006 * hs),
        mat(new THREE.Color(C.trim || '#c62828').convertSRGBToLinear()));
      tailL.position.set(0.02 * hs, 0.02 * hs, -0.085 * hs);
      head.add(tailL);
      this.bandTail = tailL;
    }
    if (b.cap) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.100 * hs, 14, 8, 0, TAU, 0, Math.PI * 0.55),
        mat(new THREE.Color(C.trim).convertSRGBToLinear()));
      cap.position.set(0, 0.105 * hs, 0);
      head.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085 * hs, 0.095 * hs, 0.012 * hs, 14, 1, false, -0.9, 1.8),
        mat(new THREE.Color(C.trim).convertSRGBToLinear()));
      brim.position.set(0, 0.108 * hs, 0.055 * hs);
      head.add(brim);
    }
    if (b.turban) {
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry((0.088 - i * 0.008) * hs, 0.022 * hs, 6, 18),
          mat(new THREE.Color(C.gi).convertSRGBToLinear()));
        ring.rotation.set(Math.PI / 2 + i * 0.22, i * 0.4, 0);
        ring.position.set(0, (0.115 + i * 0.028) * hs, 0);
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
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.062 * hs, 12, 8, 0, TAU, Math.PI * 0.45, Math.PI * 0.5),
        mat(new THREE.Color(C.hair).convertSRGBToLinear()));
      beard.position.set(0, 0.055 * hs, 0.028 * hs);
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
    this.mesh.material.dispose();
    this.root.traverse((o) => {
      if (o.isMesh && o !== this.mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
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
      5 + Math.random() * 16, 2 + Math.random() * 6, Math.random() * 3.1, 0, 7);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

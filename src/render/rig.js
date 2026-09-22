/**
 * Rig: conduce el humanoide con las animaciones de mocap.
 *
 * Pipeline de cada fotograma:
 *   1. planAnimation() decide clip, fotograma y peso de guardia,
 *   2. se muestrean el clip actual y el anterior y se funden (slerp),
 *   3. se aplican los cuaterniones a los huesos,
 *   4. capas procedurales por encima: guardia con IK de dos huesos, mirada al
 *      rival, respiración, retroceso al recibir, y física de pelo/pañuelo.
 *
 * El IK se aplica DESPUÉS del mocap y mezclando el objetivo (no la solución),
 * así la transición entre "manos del mocap" y "manos en guardia" es continua.
 */
import * as THREE from '../../vendor/three.module.min.js';
import { Humanoid, WORLD_HEIGHT } from './humanoid.js';
import { JOINTS } from '../anim/skeleton-def.js';
import { NJ, sampleClip, blendToQuats, rotationsToQuats, smoothstep, ANIM_JOINTS } from '../anim/clip.js';
import { planAnimation } from '../anim/library.js';

const IDQ = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* vectores reutilizables (evitan reservar memoria cada frame) */
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _qId = new THREE.Quaternion();

/* Atenuación de columna por clip: el retroceso capturado encorva demasiado
 * el torso con nuestras proporciones y los brazos salen disparados atrás.
 * Se escala la rotación muestreada antes de convertirla a cuaterniones. */
const CLIP_SPINE_DAMP = {
  hitReact: { LowerBack: 0.45, Spine: 0.4, Spine1: 0.4, Neck: 0.6, Head: 0.55 }
};
const dampIdx = {};
function dampRot(rot, clip) {
  const t = CLIP_SPINE_DAMP[clip];
  if (!t) return;
  for (const name in t) {
    let i = dampIdx[name];
    if (i === undefined) i = dampIdx[name] = ANIM_JOINTS.indexOf(name);
    if (i < 0) continue;
    const k = t[name];
    rot[i * 3] *= k; rot[i * 3 + 1] *= k; rot[i * 3 + 2] *= k;
  }
}
const _pole = new THREE.Vector3();
/* Scratch exclusivo del IK: no comparte vectores con el resto del rig. */
const _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _aA = new THREE.Vector3(), _aB = new THREE.Vector3(), _aC = new THREE.Vector3();
const _aDir = new THREE.Vector3(), _aPole = new THREE.Vector3(), _aMid = new THREE.Vector3();
const _sO = new THREE.Vector3(), _sA = new THREE.Vector3(), _sB = new THREE.Vector3();
const _sQ = new THREE.Quaternion(), _sP = new THREE.Quaternion(), _sP2 = new THREE.Quaternion();

/**
 * Pose de guardia adaptada al cuerpo de cada luchador: las manos van a la
 * barbilla y los codos al pecho, leídos del propio esqueleto en reposo (bp),
 * para que funcione igual en Sera (1.71 m) que en Magnus (2.05 m).
 */
function guardFor(rig) {
  const s = rig.height / WORLD_HEIGHT;
  const chin = rig.bp.Head[1] - 0.06 * s;
  const chest = rig.bp.Spine1[1];
  return {
    // Manos por delante de la barbilla pero separadas de la cara, codos
    // cerrados abajo: guardia de boxeo legible, no "sujetándose la cabeza".
    handL: [0.19 * s, chin - 0.06 * s, 0.30 * s],
    handR: [-0.17 * s, chin - 0.09 * s, 0.32 * s],
    elbowL: [0.24 * s, chest - 0.02 * s, 0.09 * s],
    elbowR: [-0.23 * s, chest - 0.04 * s, 0.10 * s]
  };
}

export class Rig {
  constructor(def) {
    this.def = def || {};
    this.humanoid = new Humanoid(this.def);
    this.bones = this.humanoid.bones;
    this.bp = this.humanoid.bp;
    this.mesh = this.humanoid.mesh;
    this.skeleton = this.humanoid.skeleton;
    this.aura = this.humanoid.aura;
    this.height = this.humanoid.height;

    // root = posición mundial; body = orientación (yaw) del luchador
    this.body = this.humanoid.root;
    this.root = new THREE.Group();
    this.root.add(this.body);

    // Alias con los nombres que ya usaba el resto del código
    this.hips = this.bones.Hips;
    this.spine = this.bones.Spine;
    this.head = this.bones.Head;
    this.armL = this.bones.LeftArm;
    this.armR = this.bones.RightArm;
    this.legL = this.bones.LeftUpLeg;
    this.legR = this.bones.RightUpLeg;

    // Sombra proyectada
    const shMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.46, 22), shMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);

    // Estado de reproducción
    this.quats = JOINTS.map(() => new THREE.Quaternion());
    this.rotA = new Float32Array(NJ * 3);
    this.rotB = new Float32Array(NJ * 3);
    this.rootA = new Float32Array(3);
    this.rootB = new Float32Array(3);
    this.cur = { clip: 'idle', frame: 0 };
    this.prev = null;
    this.fade = 0;
    this.clock = Math.random() * 200;   // desincroniza los dos luchadores
    this.time = 0;
    this.recoil = 0;
    this.scarfVel = this.humanoid.scarf ? this.humanoid.scarf.map(() => 0) : null;
    this.hairVel = 0;
  }

  setFacing(f) { this.body.rotation.y = f > 0 ? Math.PI / 2 : -Math.PI / 2; }

  /* ---------------------------------------------------------------- */

  update(fighter, dt, opponent) {
    const f = fighter || {};
    const plan = planAnimation(f, this.clock);
    this.time += dt;
    this.clock += dt * 60 * (plan.rate || 1);

    // --- fundido entre clips ---
    if (plan.clip !== this.cur.clip) {
      this.prev = { clip: this.cur.clip, frame: this.cur.frame };
      this.cur.clip = plan.clip;
      this.fade = 0;
      // Fundidos más largos en transiciones de estado (evitan el "pop"
      // entre poses); los golpes mantienen el corte seco de 0.07 s.
      this.fadeDur = plan.attack ? 0.07 : 0.22;
    }
    this.cur.frame = plan.frame;
    let w = 1;
    if (this.prev) {
      this.prev.frame += dt * 60;
      this.fade += dt;
      w = smoothstep(clamp(this.fade / this.fadeDur, 0, 1));
      if (w >= 1) this.prev = null;
    }

    const okA = sampleClip(this.cur.clip, this.cur.frame, this.rotA, this.rootA);
    if (okA) dampRot(this.rotA, this.cur.clip);
    if (okA && this.prev) {
      if (sampleClip(this.prev.clip, this.prev.frame, this.rotB, this.rootB)) {
        dampRot(this.rotB, this.prev.clip);
        blendToQuats(this.rotB, this.rotA, w, this.quats);
        for (let i = 0; i < 3; i++) this.rootB[i] = this.rootB[i] + (this.rootA[i] - this.rootB[i]) * w;
        this.rootA.set(this.rootB);
      } else {
        rotationsToQuats(this.rotA, this.quats);
      }
    } else if (okA) {
      rotationsToQuats(this.rotA, this.quats);
    }

    // --- aplicar a los huesos ---
    for (let i = 0; i < JOINTS.length; i++) {
      this.bones[JOINTS[i].name].quaternion.copy(this.quats[i]);
    }

    // --- raíz: altura de cadera propia + variación capturada ---
    const hipsY = this.bp.Hips[1] + this.rootA[1];
    this.hips.position.y = hipsY;
    // El desplazamiento horizontal del mocap solo se usa en golpes (con moderación);
    // en los bucles lo manda el motor, si no el luchador derivaría.
    const drift = plan.loop ? 0 : 0.45;
    this.hips.position.x = this.rootA[0] * drift;
    this.hips.position.z = this.rootA[2] * drift;

    // --- posición y orientación ---
    this.root.position.set(f.x || 0, f.y || 0, 0);
    this.setFacing(f.facing === undefined ? 1 : f.facing);

    // --- capas procedurales ---
    this.body.updateMatrixWorld(true);
    this.applyBreathing(f);
    this.applyIntroBow(f);
    this.applyRecoil(f, dt);
    this.applyGuard(f, plan, dt);
    this.applyHitPose(f, plan, dt);
    this.applyLocomotionPolish(f, plan, dt);
    this.applyStance(f, plan);
    this.applyLookAt(f, opponent);
    this.fixGround();

    this.body.updateMatrixWorld(true);
    this.updateSecondary(f, dt);

    // --- sombra y aura ---
    const h = Math.max(0, f.y || 0);
    this.shadow.position.set(0, 0.012 - (f.y || 0), 0);
    this.shadow.scale.setScalar(clamp(1 - h * 0.16, 0.45, 1.15));
    this.shadow.material.opacity = clamp(0.34 - h * 0.05, 0.08, 0.34);
    const maxMode = f.maxMode || 0;
    if (this.aura) {
      this.aura.material.opacity = maxMode > 0 ? 0.10 + 0.06 * Math.sin(this.time * 9) : 0;
      this.aura.visible = maxMode > 0;
      const s = 1 + 0.05 * Math.sin(this.time * 7);
      this.aura.scale.set(0.72 * s, 1.5, 0.72 * s);
    }
    if (this.mesh && f.hitFlash > 0) {
      this.mesh.material.emissive = this.mesh.material.emissive || new THREE.Color();
      this.mesh.material.emissive.setRGB(f.hitFlash * 0.8, f.hitFlash * 0.25, f.hitFlash * 0.25);
      this.mesh.material.emissiveIntensity = 1;
    } else if (this.mesh && this.mesh.material.emissiveIntensity) {
      this.mesh.material.emissiveIntensity = 0;
    }
  }

  /* --- respiración y peso ------------------------------------------- */

  applyBreathing(f) {
    const t = this.time;
    const breathe = Math.sin(t * 2.1) * 0.016 + Math.sin(t * 0.9) * 0.008;
    const idle = f.anim && (f.anim.pose === 'idle' || f.anim.state === 'idle');
    const k = idle ? 1 : 0.45;
    this.bones.Spine.rotateX(breathe * k);
    this.bones.Spine1.rotateX(breathe * 0.7 * k);
    this.bones.Neck.rotateX(-breathe * 0.5 * k);
    this.hips.position.y += Math.sin(t * 2.1) * 0.006 * k;
    // Ligero balanceo lateral: nadie está perfectamente quieto
    this.bones.LowerBack.rotateZ(Math.sin(t * 1.3) * 0.012 * k);
  }

  /* --- reverencia de inicio (rei) ------------------------------------- */

  /**
   * El "bow" capturado en CMU es teatral (pierna atrás, torsión), así que la
   * reverencia de inicio es procedural: sobre el idle, el torso baja y vuelve
   * a subir con una curva suave, brazos colgando como en un rei de karate.
   */
  applyIntroBow(f) {
    const a = f.anim;
    if (!a || a.pose !== 'intro') return;
    const t = a.frame || 0;
    let k = 0;
    if (t < 25) k = smoothstep(t / 25);
    else if (t < 60) k = 1;
    else if (t < 100) k = 1 - smoothstep((t - 60) / 40);
    if (k <= 0.001) return;
    const b = 0.42 * k;
    this.bones.Spine.rotateX(b * 0.45);
    this.bones.Spine1.rotateX(b * 0.30);
    this.bones.Neck.rotateX(b * 0.15);
    this.bones.Head.rotateX(b * 0.10);
    this.bones.LeftUpLeg.rotateX(-b * 0.12);
    this.bones.RightUpLeg.rotateX(-b * 0.12);
  }

  /* --- retroceso al recibir ------------------------------------------ */

  applyRecoil(f, dt) {
    const flash = f.hitFlash || 0;
    this.recoil += ((flash > 0 ? 1 : 0) - this.recoil) * Math.min(1, dt * 16);
    const r = this.recoil;
    if (r > 0.001) {
      const jolt = Math.sin(this.time * 46) * 0.06 * r;
      this.bones.Spine.rotateX(-0.16 * r + jolt);
      this.bones.Spine1.rotateX(-0.10 * r);
      this.bones.Neck.rotateX(0.22 * r - jolt * 0.6);
    }
  }

  /* --- guardia con IK ------------------------------------------------ */

  applyGuard(f, plan, dt) {
    let gw = plan.guard || 0;
    if (f.airborne) gw *= 0.4;
    if (f.maxMode > 0) gw = Math.max(gw, 0.6);
    if (gw <= 0.01) return;

    const s = this.height / WORLD_HEIGHT;
    const GUARD = guardFor(this);
    // Objetivo: mezcla entre la mano del mocap y la mano en guardia
    for (const side of ['L', 'R']) {
      const shoulder = this.bones[side === 'L' ? 'LeftArm' : 'RightArm'];
      const elbow = this.bones[side === 'L' ? 'LeftForeArm' : 'RightForeArm'];
      const hand = this.bones[side === 'L' ? 'LeftHand' : 'RightHand'];
      if (!hand) continue;

      const g = GUARD[`hand${side}`];
      const pe = GUARD[`elbow${side}`];
      _v1.set(g[0], g[1], g[2]);
      this.body.localToWorld(_v1);
      _v2.set(pe[0], pe[1], pe[2]);
      this.body.localToWorld(_v2);

      hand.getWorldPosition(_v3);
      // Mezcla de objetivos => mezcla de resultados, sin saltos.
      _v1.lerp(_v3, 1 - gw);
      _pole.copy(_v2).lerp(_v3, (1 - gw) * 0.6);

      this.aimChain(shoulder, elbow, hand, _v1, _pole, gw);
      this.body.updateMatrixWorld(true);
    }
  }

  /* --- hitstun: torso erguido y brazos en guardia --------------------- */

  /**
   * El recoil capturado deja la columna doblada y los brazos volando hacia
   * atrás (postura "de pollo"). Además del damp de columna aplicado al
   * muestrear, recolocamos los brazos en guardia con el mismo IK de dos
   * huesos que usa la defensa, para que el daño se lea humano y marcial.
   */
  applyHitPose(f, plan, dt) {
    if (plan.clip !== 'hitReact') return;
    this.bones.LowerBack.quaternion.slerp(_qId, 0.25);
    this.bones.Spine.quaternion.slerp(_qId, 0.30);
    this.bones.Neck.quaternion.slerp(_qId, 0.25);
    // Guardia con IK de polo PURO en el pecho: el mocap de dolor abre los
    // brazos, y si el pole se mezcla con la mano actual el codo se va por
    // fuera y la guardia no cierra.
    const gw = Math.max(plan.guard || 0, 0.9);
    const GUARD = guardFor(this);
    for (const side of ['L', 'R']) {
      const shoulder = this.bones[side === 'L' ? 'LeftArm' : 'RightArm'];
      const elbow = this.bones[side === 'L' ? 'LeftForeArm' : 'RightForeArm'];
      const hand = this.bones[side === 'L' ? 'LeftHand' : 'RightHand'];
      if (!hand) continue;
      const g = GUARD[`hand${side}`];
      const pe = GUARD[`elbow${side}`];
      _v1.set(g[0], g[1], g[2]);
      this.body.localToWorld(_v1);
      _pole.set(pe[0], pe[1], pe[2]);     // pole puro: codo pegado al costado
      this.body.localToWorld(_pole);
      this.aimChain(shoulder, elbow, hand, _v1, _pole, gw);
      this.body.updateMatrixWorld(true);
    }
  }

  /* --- pulido de locomoción (lean + sway pélvico) --------------------- */

  /**
   * Capas procedurales de secundaria sobre el mocap retargetado:
   *  - inclinación del torso en el sentido de la marcha (se entra en la
   *    zancada "cayendo" adelante), suavizada ~0.25 s;
   *  - rotación y balanceo de la pelvis a media frecuencia de paso, el
   *    cadence izquierda-derecha de la marcha humana.
   */
  applyLocomotionPolish(f, plan, dt) {
    const pose = f.anim ? f.anim.pose : 'idle';
    const localVel = (f.vx || 0) * (f.facing || 1);   // + = avanza
    const moving = ['walkF', 'walkB', 'run'].includes(pose) || Math.abs(localVel) > 0.015;
    const leanTarget = moving ? Math.max(-0.16, Math.min(0.22, localVel * 2.2)) : 0;
    this.leanCur = (this.leanCur || 0) + (leanTarget - (this.leanCur || 0)) * Math.min(1, dt * 8);
    if (Math.abs(this.leanCur) > 0.002) {
      this.bones.Spine.rotateX(this.leanCur * 0.55);
      this.bones.Spine1.rotateX(this.leanCur * 0.35);
    }
    if (moving) {
      const cadence = this.clock * (4 + Math.abs(localVel) * 60);
      this.bones.Hips.rotateY(Math.sin(cadence) * 0.05);
      this.bones.Hips.rotateZ(Math.sin(cadence * 0.5) * 0.028);
      this.bones.Spine1.rotateY(-Math.sin(cadence) * 0.03);  // contra-rotación del torso
    }
  }

  /* --- anchura de postura -------------------------------------------- */

  /**
   * Los actores capturados suelen apoyar los pies en una línea (paso de
   * modelo). Una postura de combate necesita anchura lateral: desplazamos cada
   * pie hacia su lado con el mismo IK de dos huesos, partiendo de la posición
   * que ya trae el mocap para no romper la zancada al andar.
   */
  applyStance(f, plan) {
    const pose = f.anim ? f.anim.pose : 'idle';
    // Solo en estados de pie: tumbado o volando el IK de pies estorbaría.
    const up = ['idle', 'dizzy', 'blockHigh', 'blockLow', 'parry', 'hitHigh', 'hitLow',
      'walkF', 'walkB', 'walkSide', 'run'];
    let w = 0;
    if (up.includes(pose)) {
      w = pose === 'idle' || pose === 'dizzy' || pose.startsWith('block') || pose === 'parry'
        ? 0.9 : pose.startsWith('hit') ? 0.85 : 0.6;
    }
    if (w <= 0.01 || f.airborne) return;

    const s = this.height / WORLD_HEIGHT;
    const widen = 0.12 * s * (0.5 + 0.5 * (this.legLen || 1));
    for (const side of ['L', 'R']) {
      const upleg = this.bones[side === 'L' ? 'LeftUpLeg' : 'RightUpLeg'];
      const leg = this.bones[side === 'L' ? 'LeftLeg' : 'RightLeg'];
      const foot = this.bones[side === 'L' ? 'LeftFoot' : 'RightFoot'];
      if (!foot) continue;
      foot.getWorldPosition(_v1);
      this.body.worldToLocal(_v1);
      _v1.x += side === 'L' ? widen : -widen;          // ensanche lateral local
      this.body.localToWorld(_v1);
      // rodilla mirando al frente
      _v2.set(side === 'L' ? 0.12 * s : -0.12 * s, 0.55 * s, 0.3 * s);
      this.body.localToWorld(_v2);
      this.aimChain(upleg, leg, foot, _v1, _v2, w);
      this.body.updateMatrixWorld(true);
    }
  }

  /* --- mirar al rival ------------------------------------------------ */

  applyLookAt(f, opponent) {
    if (!opponent) return;
    // El giro horizontal ya lo hace `body`; aquí solo cabecea arriba/abajo.
    const myEye = (f.y || 0) + this.height * 0.88;
    const theirEye = (opponent.y || 0) + this.height * 0.84;
    const horiz = Math.max(0.5, Math.abs((opponent.x || 0) - (f.x || 0)));
    const pitch = clamp(Math.atan2(theirEye - myEye, horiz), -0.4, 0.4);
    this.bones.Head.rotateX(-pitch * 0.55);
    this.bones.Neck.rotateX(-pitch * 0.3);
  }

  /* --- que los pies no atraviesen el suelo --------------------------- */

  fixGround() {
    let lowest = Infinity;
    for (const n of ['LeftFoot', 'RightFoot']) {
      const b = this.bones[n];
      if (!b) continue;
      b.getWorldPosition(_v1);
      if (_v1.y < lowest) lowest = _v1.y;
    }
    if (!Number.isFinite(lowest)) return;
    const sink = -lowest;              // cuánto hay que subir para apoyar
    if (sink > 0.0005 && sink < 0.22) {
      this.hips.position.y += sink;
      this.body.updateMatrixWorld(true);
    }
  }

  /* --- pelo y pañuelo ------------------------------------------------ */

  updateSecondary(f, dt) {
    const vx = f.vx || 0;
    const vy = f.vy || 0;
    // Pañuelo: péndulo amortiguado arrastrado por la velocidad
    if (this.humanoid.scarf && this.scarfVel) {
      const drive = clamp(-vx * 6 + (f.anim && f.anim.state === 'attack' ? 0.4 : 0), -1.2, 1.2);
      for (let i = 0; i < this.humanoid.scarf.length; i++) {
        const seg = this.humanoid.scarf[i];
        this.scarfVel[i] += (drive * 0.55 - seg.rotation.z * 3.4 - this.scarfVel[i] * 2.6) * Math.min(1, dt * 60);
        this.scarfVel[i] += Math.sin(this.time * 6 + i) * 0.012;
        seg.rotation.z += this.scarfVel[i] * dt * 8;
        seg.rotation.z = clamp(seg.rotation.z, -1.1, 1.1);
      }
    }
    // Coleta / melena
    if (this.humanoid.hairTail) {
      this.hairVel += ((-vx * 3.2 - vy * 1.6) - this.humanoid.hairTail.rotation.z * 5 - this.hairVel * 3) * Math.min(1, dt * 60);
      this.humanoid.hairTail.rotation.z = clamp(this.humanoid.hairTail.rotation.z + this.hairVel * dt * 6, -0.9, 0.9);
    }
    if (this.humanoid.bandTail) {
      this.humanoid.bandTail.rotation.x = clamp(-vx * 2.2, -0.9, 0.9);
    }
  }

  /* --- IK analítico de dos huesos ------------------------------------- */

  /**
   * Coloca el efector final en `target` doblando la cadena root->mid->end.
   * Usa la ley de los cosenos (solución cerrada, sin iteraciones) y convierte
   * los giros de espacio mundial a espacio local de cada hueso.
   * @param weight 0..1 para mezclar con la pose actual
   */
  aimChain(rootBone, midBone, endBone, target, pole, weight = 1) {
    if (!rootBone || !midBone || !endBone) return;
    // Copiamos los objetivos a scratch propios: los argumentos pueden ser los
    // mismos vectores reutilizables que usan las funciones auxiliares.
    _t.copy(target);
    _p.copy(pole);

    rootBone.getWorldPosition(_aA);
    midBone.getWorldPosition(_aB);
    endBone.getWorldPosition(_aC);
    const upper = _aA.distanceTo(_aB);
    const lower = _aB.distanceTo(_aC);
    if (upper < 1e-4 || lower < 1e-4) return;

    const maxLen = (upper + lower) * 0.9995;
    _aDir.copy(_t).sub(_aA);
    let dist = _aDir.length();
    if (dist > maxLen) { _aDir.multiplyScalar(maxLen / dist); dist = maxLen; }
    if (dist < 1e-4) return;
    _aDir.divideScalar(dist);

    // Plano de flexión: componente del "pole" perpendicular a la dirección.
    _aPole.copy(_p).sub(_aA);
    _aPole.addScaledVector(_aDir, -_aDir.dot(_aPole));
    if (_aPole.lengthSq() < 1e-8) _aPole.set(0, 1, 0).addScaledVector(_aDir, -_aDir.y);
    if (_aPole.lengthSq() < 1e-8) _aPole.set(1, 0, 0);
    _aPole.normalize();

    const cosA = clamp((dist * dist + upper * upper - lower * lower) / (2 * upper * dist), -1, 1);
    const ang = Math.acos(cosA);
    _aMid.copy(_aA)
      .addScaledVector(_aDir, upper * Math.cos(ang))
      .addScaledVector(_aPole, upper * Math.sin(ang));

    this.swing(rootBone, _aB, _aMid, weight);
    this.body.updateMatrixWorld(true);

    midBone.getWorldPosition(_aB);
    endBone.getWorldPosition(_aC);
    this.swing(midBone, _aC, _t, weight);
  }

  /** Gira `bone` para que su hijo pase de `from` a `to` (posiciones mundiales). */
  swing(bone, from, to, weight) {
    bone.getWorldPosition(_sO);
    _sA.copy(from).sub(_sO);
    _sB.copy(to).sub(_sO);
    if (_sA.lengthSq() < 1e-10 || _sB.lengthSq() < 1e-10) return;
    _sA.normalize(); _sB.normalize();
    _sQ.setFromUnitVectors(_sA, _sB);
    if (weight < 1) _sQ.slerp(IDQ, 1 - weight);
    const parent = bone.parent;
    if (parent) {
      parent.getWorldQuaternion(_sP);
      _sP2.copy(_sP).invert().multiply(_sQ).multiply(_sP);
    } else {
      _sP2.copy(_sQ);
    }
    bone.quaternion.premultiply(_sP2);
  }

  dispose() {
    this.humanoid.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }
}

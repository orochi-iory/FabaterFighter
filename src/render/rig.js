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
  hitReact: { LowerBack: 0.45, Spine: 0.4, Spine1: 0.4, Neck: 0.6, Head: 0.55 },
  // El salto capturado abre los brazos en cruz y retuerce los hombros: con eso
  // en el suelo (aterrizajes, caidas) el luchador se ve "resetado" en T.
  jump: { LeftShoulder: 0.45, RightShoulder: 0.45, LeftArm: 0.5, RightArm: 0.5,
    LeftForeArm: 0.6, RightForeArm: 0.6, Spine1: 0.7, LowerBack: 0.7 }
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
    // Semilla de estilo por personaje: pequenas variaciones de angulo/altura
    // sobre la base comun derivada de las laminas = personalidad visual.
    const id = (this.def && this.def.id) || 'zz';
    this.styleSeed = ((id.charCodeAt(0) * 7 + id.charCodeAt(1) * 13) % 100) / 100;
    // Sesgos de estilo: postura base y guardia propias de cada luchador,
    // aplican a todo (normales, especiales, supers) sobre la base comun.
    this.leanBias = (this.styleSeed - 0.5) * 0.14;      // tronco +/- adelantado
    this.guardBias = (this.styleSeed - 0.5) * 0.10;     // guardia mas alta/metros

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
    // Signos de flexión calibrados midiendo el rig: en este bind, rotateX +
    // en el muslo lleva el pie ATRÁS; rotateX - en LowerBack tumba el torso ATRÁS.
    this.crouchSign = -1;   // muslo adelante
    this.fallSign = 1;      // torso atrás; las piernas usan el signo opuesto
    this.kickSign = -1;     // chamber = muslo atrás
    this.restPos = {};
    for (const n in this.bones) {
      const b = this.bones[n];
      this.restPos[n] = [b.position.x, b.position.y, b.position.z];
    }
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

    let okA = sampleClip(this.cur.clip, this.cur.frame, this.rotA, this.rootA);
    if (!okA) {
      // Pose sin clip (crouch, knockdown...): partimos del pose de reposo,
      // si no los huesos conservarían la rotación del frame anterior y las
      // capas procedurales se acumularían frame a frame.
      this.rotA.fill(0);
      this.rootA.fill(0);
      okA = true;
    }
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
    // en los bucles lo manda el motor, si no el luchador derivaría. El salto y las
    // reacciones capturadas arrastran la cadera medio metro: también a cero.
    const drift = (plan.loop || plan.clip === 'jump' || plan.clip === 'hitReact') ? 0 : 0.45;
    this.hips.position.x = this.rootA[0] * drift;
    this.hips.position.z = this.rootA[2] * drift;
    // En ataques aereos el root del clip (y su fundido desde el salto) tira
    // del cuerpo atras: el "amago" de recular. Se anula por completo.
    if (plan.attack && f.airborne) {
      this.hips.position.x = 0;
      this.hips.position.z = 0;
    }

    // --- posición y orientación ---
    this.root.position.set(f.x || 0, f.y || 0, 0);
    this.setFacing(f.facing === undefined ? 1 : f.facing);

    // --- capas procedurales ---
    this.body.updateMatrixWorld(true);
    this.applyBreathing(f);
    this.applyIntroBow(f);
    this.applyRecoil(f, dt);
    this.applyCrouch(f);          // baja la cadera ANTES del IK de pies y de la guardia
    this.applyGuard(f, plan, dt); // tras el crouch: los brazos son hijos del torso
    this.applyHitPose(f, plan, dt);
    this.applyArmSafety(f, plan);
    this.applyLocomotionPolish(f, plan, dt);
    this.applyStance(f, plan);
    this.applyProceduralWalk(f, plan, dt);
    this.applyAttackPose(f, plan);
    this.applyLookAt(f, opponent);
    this.applyKnockdown(f);
    this.fixGround(f);

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
    // Postura base propia del personaje (tronco mas o menos adelantado).
    if (this.leanBias) this.bones.Spine.rotateX(this.leanBias * 0.5);
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
      // Agachado: la guardia baja con la cadera, no se queda a altura de pie.
      // Manos pegadas delante de la cara y codos BELOW (nada de brazos en jarra).
      const crouchG = f.anim && f.anim.pose === 'crouch';
      const drop = crouchG ? 0.42 * s : 0;
      // guardBias: cada luchador lleva las manos mas largas/cortas o altas.
      _v1.set(g[0] * (crouchG ? 0.7 : 1), g[1] - drop + (this.guardBias || 0) * 0.3 * s,
        (g[2] + drop * 0.3) * (crouchG ? 0.85 : 1) + (this.guardBias || 0) * 0.5 * s);
      this.body.localToWorld(_v1);
      _v2.set(pe[0] * (crouchG ? 0.6 : 1), pe[1] - drop * (crouchG ? 1.1 : 0.6), pe[2]);
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
    // Como en las láminas: el impacto arquea torso y cabeza atrás; el arco
    // decae con el hitstun restante.
    const h = Math.min(1, (f.hitstun || 0) / 14);
    this.bones.LowerBack.rotateX(-0.32 * h);
    this.bones.Neck.rotateX(-0.35 * h);
    // Guardia con IK de polo PURO en el pecho: el mocap de dolor abre los
    // brazos, y si el pole se mezcla con la mano actual el codo se va por
    // fuera y la guardia no cierra. En el primer impacto los brazos no están
    // cerrados aún (gw moderado), se cierran al recuperar.
    const gw = Math.max(plan.guard || 0, 0.6 + 0.3 * (1 - h));
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

  /* --- red de seguridad: ningún brazo en T sobre el suelo -------------- */

  /** Clips de salto/caída llevan los brazos abiertos en cruz; al tocar el
   * suelo con ese clip (aterrizajes, lanzamientos) el luchador se ve "en T".
   * Si el brazo queda casi horizontal sin estar atacando ni en el aire, lo
   * cerramos a guardia con el mismo IK de dos huesos. */
  applyArmSafety(f, plan) {
    if (plan.attack || f.airborne) return;
    const pose = f.anim ? f.anim.pose : 'idle';
    if (['knockdown', 'ko', 'win', 'maxactivate', 'crouch'].includes(pose)) return;
    this.bones.LeftArm.getWorldPosition(_v1);
    this.bones.LeftForeArm.getWorldPosition(_v2);
    const down = _v2.sub(_v1).normalize().y;
    if (down < -0.18) return;
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
      _v2.set(pe[0], pe[1], pe[2]);
      this.body.localToWorld(_v2);
      this.aimChain(shoulder, elbow, hand, _v1, _v2, 0.7);
      this.body.updateMatrixWorld(true);
    }
  }

  /* --- agachado procedural -------------------------------------------- */

  /** Agacharse de verdad: cadera abajo, muslos adelante, rodillas dobladas. */
  applyCrouch(f) {
    const pose = f.anim ? f.anim.pose : '';
    // Los normales agachados (2X) se lanzan DESDE la postura de crouch,
    // como en los juegos de referencia: no se golpea de pie con hitbox baja.
    const crouchAtk = !!(f.move && f.move.input && f.move.input.dir === '2' && !f.airborne);
    const target = (pose === 'crouch' || crouchAtk) ? 1 : 0;
    this.crouchCur = (this.crouchCur || 0) + (target - (this.crouchCur || 0)) * 0.30;
    const k = this.crouchCur;
    if (k < 0.01) return;
    const s = this.height / WORLD_HEIGHT;
    // Guardia agachada a fondo; los normales agachados usan un crouch mas
    // alto (muslo ~45 grados, como en las laminas) para no quedar clavados
    // ni convertir el muslo en una tabla horizontal.
    const deep = pose === 'crouch' ? 1 : 0.62;
    this.hips.position.y -= 0.50 * s * k * deep;
    // ~30 grados de inclinacion, como en las laminas (no volcado)
    this.bones.LowerBack.rotateX(-this.crouchSign * 0.15 * k * deep); // tronco adelante
    this.bones.Spine.rotateX(-this.crouchSign * 0.15 * k * deep);
    this.bones.Neck.rotateX(this.crouchSign * 0.24 * k * deep);      // compensa: mira al frente
  }

  /* --- caída al suelo procedural -------------------------------------- */

  /** Knockdown/KO: vuelca atrás sobre el suelo en ~0.45 s, piernas al aire. */
  applyKnockdown(f) {
    const pose = f.anim ? f.anim.pose : '';
    const on = pose === 'knockdown' || pose === 'ko';
    if (!on) { this.kdCur = 0; return; }
    const t = Math.min(1, (f.anim.frame || 0) / 26);
    const k = smoothstep(t);
    this.kdCur = k;
    if (k < 0.01) return;
    const s = this.height / WORLD_HEIGHT;
    // Apaga el clip: la caída la manda esta capa (el dive capturado flotaba).
    // Hips incluido: el dive capturado rueda sobre la espalda y su rotación
    // de raíz levantaría el torso otra vez.
    for (const n of ['Hips', 'LowerBack', 'Spine', 'Spine1', 'Neck', 'Head',
      'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
      'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) {
      this.bones[n].quaternion.slerp(_qId, Math.min(1, k * 1.6));
    }
    const g = this.fallSign;
    // Pelvis tumbada: el pitch va en la raiz de la pierna para que el cuerpo
    // entero quede plano boca arriba (antes solo arqueaba el torso, la
    // pelvis seguia vertical y las piernas se hundian en el suelo).
    this.bones.Hips.rotateX(-g * 1.42 * k);
    this.bones.LowerBack.rotateX(-g * 0.10 * k);
    this.bones.Spine.rotateX(-g * 0.08 * k);
    this.bones.Head.rotateX(g * 0.30 * k);          // barbilla al pecho
    const settle = smoothstep(Math.max(0, Math.min(1, (t - 0.5) / 0.5)));
    const wob = Math.sin(f.anim.frame * 0.4) * 0.10 * (1 - settle);
    // piernas medio recogidas: rodillas y talones visibles fuera del suelo
    this.bones.LeftUpLeg.rotateX(-g * (0.22 + wob) * k);
    this.bones.RightUpLeg.rotateX(-g * 0.14 * k);
    this.bones.LeftLeg.rotateX(g * 0.25 * k);
    this.bones.RightLeg.rotateX(g * 0.20 * k);
    this.bones.LeftArm.rotateX(g * 0.5 * k);
    this.bones.RightArm.rotateX(g * 0.5 * k);
    // Cadera al suelo interpolada (no de golpe).
    const groundY = 0.17 * s;
    this.hips.position.y = this.hips.position.y * (1 - k) + groundY * k;
  }

  /* --- caminar procedural con IK de pies ------------------------------- */

  /**
   * Zancada generada: cada pie recorre su ciclo (apoyo + swing con lift),
   * resuelto con el IK de dos huesos; brazos en contrafase y bob de cadera.
   * Sustituye las piernas del clip de mocap (paso de modelo, pies en línea).
   */
  applyProceduralWalk(f, plan, dt) {
    const pose = f.anim ? f.anim.pose : '';
    let mode = 0;
    if (pose === 'walkF') mode = 1;
    else if (pose === 'walkB') mode = -0.55;
    else if (pose === 'run') mode = 1.7;
    this.walkW = (this.walkW || 0) + ((mode !== 0 ? 1 : 0) - (this.walkW || 0)) * Math.min(1, dt * 10);
    if (this.walkW < 0.02) return;
    const s = this.height / WORLD_HEIGHT;
    const speed = Math.max(0.03, Math.abs(f.vx || 0));
    const dir = mode < 0 ? -1 : 1;
    this.walkPhase = (this.walkPhase || 0) + dt * (3.0 + speed * 60) * dir;
    const ph = this.walkPhase;
    const stride = 0.15 * s * (mode === 1.7 ? 1.45 : 1) * Math.min(1.5, speed / 0.065);
    const lift = (mode === 1.7 ? 0.075 : 0.045) * s;
    for (const [side, off] of [['Left', 0], ['Right', Math.PI]]) {
      const a = ph + off;
      const foot = this.bones[`${side}Foot`];
      const leg = this.bones[`${side}Leg`];
      const up = this.bones[`${side}UpLeg`];
      const swing = Math.cos(a);                       // >0 = pie en el aire
      _v1.set(0, 0.02 * s + Math.max(0, swing) * lift, Math.sin(a) * stride);
      this.body.localToWorld(_v1);
      _v2.set(0, 0.55 * s, 0.35 * s);                  // rodilla al frente
      this.body.localToWorld(_v2);
      this.aimChain(up, leg, foot, _v1, _v2, this.walkW * 0.95);
      this.body.updateMatrixWorld(true);
    }
    // Brazos en contrafase y cadera viva.
    const sw = Math.sin(ph) * (mode === 1.7 ? 0.55 : 0.35) * this.walkW;
    this.bones.LeftArm.rotateX(sw);
    this.bones.RightArm.rotateX(-sw);
    this.bones.LeftForeArm.rotateX(0.4 * this.walkW);
    this.bones.RightForeArm.rotateX(0.4 * this.walkW);
    this.hips.position.y += Math.abs(Math.cos(ph)) * 0.016 * s * this.walkW;
  }

  /* --- pose de ataque alineada con el golpe ---------------------------- */

  /**
   * El miembro que golpea apunta a la altura real del hitbox (box.y del
   * golpe): un alto sube a la cara, un bajo a las piernas. Extensión con
   * windup -> snap -> retorno para que el golpe se LEA.
   */
  /* --- ataques elásticos (Magnus): el brazo TELESPIZA de verdad ------- */
  // El hitbox de sus especiales llega a 3+ m: si el brazo solo mide 0.9,
  // "golpea de forma invisible". Estiramos los huesos (separando codo y
  // muneca de su reposo) para que la superficie se alargue como goma y el
  // golpe SE VEA tan lejos como alcanza.
  resetLimbStretch() {
    if (!this.restPos) return;
    for (const n of ['LeftForeArm', 'LeftHand', 'RightForeArm', 'RightHand']) {
      const b = this.bones[n];
      if (!b || !this.restPos[n]) continue;
      b.position.set(this.restPos[n][0], this.restPos[n][1], this.restPos[n][2]);
    }
  }

  /** Cantidad de estiramiento elastico del golpe (0 si no es elastico). */
  stretchAmt(mv, s) {
    const isStretch = mv && (mv.pose === 'stretch' ||
      (mv.tags && (mv.tags.includes('stretch') || mv.tags.includes('stretchHalf'))));
    if (!isStretch) return 0;
    const hb = mv.hits && mv.hits[0] && mv.hits[0].box;
    if (!hb) return 0;
    const half = mv.tags && mv.tags.includes('stretchHalf') ? 0.55 : 1;
    // fondo del hitbox: box = {x (inicio), y, w (ancho), h} en metros
    const sh = this.bones.RightArm, el = this.bones.RightForeArm, ha = this.bones.RightHand;
    sh.getWorldPosition(_aA);
    el.getWorldPosition(_aB);
    ha.getWorldPosition(_aC);
    const armLen = _aA.distanceTo(_aB) + _aB.distanceTo(_aC);
    if (!(armLen > 0.05)) return 0;
    // hasta el fondo del hitbox, tope x2.2 del brazo en reposo (Dhalsim, no goma infinita)
    const reachX = (hb.x + hb.w) * s;
    return Math.max(0, Math.min(reachX * 0.95, armLen * 2.2) - armLen) * half;
  }

  /** Desplaza codo/muneca a lo largo del eje del brazo (local T-pose). */
  applyLimbStretch(side, amt) {
    const restEl = this.restPos[`${side}ForeArm`];
    const restHa = this.restPos[`${side}Hand`];
    if (!restEl || !restHa || !(amt > 0.001)) return;
    const ax = side === 'Right' ? -1 : 1;      // eje del hueso en local (T-pose)
    this.bones[`${side}ForeArm`].position.set(restEl[0] + ax * amt * 0.45, restEl[1], restEl[2]);
    this.bones[`${side}Hand`].position.set(restHa[0] + ax * amt, restHa[1], restHa[2]);
    this.body.updateMatrixWorld(true);
  }

  applyAttackPose(f, plan) {
    if (!plan.attack || !f.move) return;
    const mv = f.move;
    const hb = mv.hits && mv.hits[0] && mv.hits[0].box;
    if (!hb) return;
    const t = f.moveFrame || 0;
    let e;
    if (t < mv.startup) e = -(t / Math.max(1, mv.startup)) * 0.3;      // chamber
    else if (t < mv.startup + mv.active) e = 1;                         // snap
    else e = Math.max(0, 1 - (t - mv.startup - mv.active) / Math.max(1, mv.recovery));
    const s = this.height / WORLD_HEIGHT;
    const hT = hb.y * s;
    const btn = (mv.input && mv.input.button) || mv.id || '';
    const isKick = /K/.test(btn) && !/P/.test(btn);
    const w = e > 0 ? Math.min(0.95, e * 1.4) : 0;
    if (f.airborne) { this.applyAirAttack(f, isKick, e, s, w); return; }
    if (isKick) {
      const up = this.bones.RightUpLeg, leg = this.bones.RightLeg, foot = this.bones.RightFoot;
      // Apaga el clip capturado: la patada la manda esta capa, al estilo de las
      // láminas 2D (pierna extendida, apoyo pivotado, tronco atrás, brazos en tijera).
      for (const n of ['Hips', 'LowerBack', 'Spine', 'Spine1',
        'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot',
        'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) {
        this.bones[n].quaternion.slerp(_qId, 0.85);
      }
      if (e < 0) { this.bones.RightUpLeg.rotateX(this.kickSign * e * 1.4); return; }
      const sweep = mv.input && mv.input.dir === '2';
      const sweepStyle = sweep ? (this.def.sweepStyle || (this.def.body || {}).sweepStyle || 'sweep') : 'sweep';
      const charge = (mv.tags || []).includes('charge');
      const seed = this.styleSeed;
      // Barrido/segada: ras de suelo. Embestida: media y contundente. El resto,
      // a la altura del hitbox con matiz por personaje.
      const yKick = sweep ? (sweepStyle === 'both' ? 0.16 * s : 0.12 * s)
        : (charge ? hT * 0.8 : hT * (0.88 + 0.06 * seed));
      const legLen = up.getWorldPosition(_aA).distanceTo(leg.getWorldPosition(_aB))
        + leg.getWorldPosition(_aB).distanceTo(foot.getWorldPosition(_aC));
      // Pierna de pateo PLENA hacia la altura del golpe
      _v1.set(0, yKick, legLen * 0.99 * (0.35 + 0.65 * e));
      this.body.localToWorld(_v1);
      _v2.set(0, Math.max(yKick, hT * 0.5) + 0.15 * s, 0.6 * s);  // rodilla arriba-adelante
      this.body.localToWorld(_v2);
      this.aimChain(up, leg, foot, _v1, _v2, w);
      this.body.updateMatrixWorld(true);
      if (sweep && sweepStyle === 'slide') {
        // Segada de futbol: apoyo plegado bajo el cuerpo, ras de suelo y
        // deslizamiento (el lunge del move), tronco atrás.
        this.bones.LeftUpLeg.rotateX(0.90 * e);
        this.bones.LeftLeg.rotateX(1.30 * e);
        this.bones.LeftFoot.rotateY(-0.4 * e);
        this.hips.position.y -= 0.10 * s * e;
        this.bones.LowerBack.rotateX(-0.34 * e);
        this.bones.Spine.rotateX(-0.14 * e);
      } else if (sweep && sweepStyle === 'both') {
        // Mole de poder: entra con las dos piernas extendidas delante.
        // aimChain (no rotaciones sueltas): el IK de postura ya doblo la
        // pierna de apoyo y solo un objetivo absoluto la estira.
        _v1.set(0.07 * s, 0.20 * s, legLen * 0.88 * (0.35 + 0.65 * e));
        this.body.localToWorld(_v1);
        _v2.set(0.10 * s, 0.45 * s, 0.30 * s);
        this.body.localToWorld(_v2);
        this.aimChain(this.bones.LeftUpLeg, this.bones.LeftLeg, this.bones.LeftFoot, _v1, _v2, w);
        this.body.updateMatrixWorld(true);
        this.bones.LowerBack.rotateX(-0.30 * e);
        this.bones.Spine.rotateX(-0.12 * e);
      } else if (sweep) {
        // Barrido clasico: apoyo casi recto y pie pivotado (talon al rival)
        this.bones.LeftUpLeg.rotateX(0.10 * e);
        this.bones.LeftFoot.rotateY(-1.0 * e);
        this.bones.LowerBack.rotateX(-0.30 * e);
        this.bones.Spine.rotateX(-0.12 * e);
      } else if (charge) {
        // Embestida: el cuerpo entra detrás de la patada
        this.bones.LowerBack.rotateX(0.22 * e);
        this.bones.Spine.rotateX(0.18 * e);
      } else {
        // Tronco atrás ~20°: la lamina compensa la altura de la patada
        // inclinandose, no apuntando la pierna al cielo
        this.bones.LowerBack.rotateX(this.kickSign * 0.30 * e);
        this.bones.Spine.rotateX(this.kickSign * 0.34 * e);
      }
      // PIES en espacio mundo (la garra leia como rodilla dislocada):
      //  - apoyo: planta horizontal (el dedo a la altura del tobillo),
      //    porque hereda el pitch de cadera/pantorrilla y apuntaba al suelo;
      //  - pateo: los dedos siguen la linea de la espinilla (extension
      //    natural, como el pie del sheet).
      const bothStyle = sweep && sweepStyle === 'both';
      const supFootB = bothStyle ? this.bones.RightFoot : this.bones.LeftFoot;
      const supToeB = bothStyle ? this.bones.RightToeBase : this.bones.LeftToeBase;
      const kFootB = bothStyle ? this.bones.LeftFoot : this.bones.RightFoot;
      const kToeB = bothStyle ? this.bones.LeftToeBase : this.bones.RightToeBase;
      const kLegB = bothStyle ? this.bones.LeftLeg : this.bones.RightLeg;
      if (!sweep) {
        this.bones.LeftUpLeg.quaternion.slerp(_qId, 0.30);
        this.bones.LeftLeg.quaternion.slerp(_qId, 0.22);
      }
      this.body.updateMatrixWorld(true);
      supFootB.getWorldPosition(_aB);
      supToeB.getWorldPosition(_aC);
      _v1.copy(_aC); _v1.y = _aB.y + 0.02 * s;       // planta horizontal
      this.swing(supFootB, _aC, _v1, 0.9);
      this.body.updateMatrixWorld(true);
      kFootB.getWorldPosition(_aB);
      kToeB.getWorldPosition(_aC);
      kLegB.getWorldPosition(_aA);
      _v1.copy(_aB).sub(_aA).normalize();
      _v1.multiplyScalar(_aB.distanceTo(_aC)).add(_aB);
      this.swing(kFootB, _aC, _v1, 0.9);
      this.body.updateMatrixWorld(true);
      // Brazos en tijera: contrario adelanta a la cara, homólogo atrás-abajo
      _v1.set(0.12 * s, 1.30 * s, 0.55 * s); this.body.localToWorld(_v1);
      _v2.set(0.20 * s, 1.10 * s, 0.10 * s); this.body.localToWorld(_v2);
      this.aimChain(this.bones.LeftArm, this.bones.LeftForeArm, this.bones.LeftHand, _v1, _v2, 0.9);
      this.body.updateMatrixWorld(true);
      _v1.set(-0.18 * s, 1.05 * s, -0.35 * s); this.body.localToWorld(_v1);
      _v2.set(-0.25 * s, 1.10 * s, -0.10 * s); this.body.localToWorld(_v2);
      this.aimChain(this.bones.RightArm, this.bones.RightForeArm, this.bones.RightHand, _v1, _v2, 0.9);
      this.body.updateMatrixWorld(true);
    } else {
      this.resetLimbStretch();
      // El clip "strong" extiende el brazo derecho: el IK debe mandar ese
      // mismo brazo (y el jab, el izquierdo).
      const leftish = /LP/.test(mv.id || '');
      const side = leftish ? 'Left' : 'Right';
      const charge = (mv.tags || []).includes('charge');
      const seed = this.styleSeed;
      const sh = this.bones[`${side}Arm`], el = this.bones[`${side}ForeArm`], ha = this.bones[`${side}Hand`];
      if (e < 0) { sh.rotateX(-e * 1.2); return; }     // recoge el puño
      // Magnus: estirar ANTES del IK (el IK de abajo apunta la cadena ya
      // estirada hacia el objetivo, asi el golpe se ve tan lejos como llega)
      const stAmt = this.stretchAmt(mv, s) * Math.max(0, e);
      if (stAmt > 0.001) this.applyLimbStretch(side, stAmt);
      // El objetivo se mide DESDE EL HOMBRO en mundo: el clip lanza el torso
      // adelante y, medido desde el cuerpo, el objetivo le quedaba al hombro
      // "al lado" (el brazo se doblaba para alcanzarlo = puño junto a la
      // cabeza). Adelante = +Z local de la raiz (convencion BVH).
      const armLen = sh.getWorldPosition(_aA).distanceTo(el.getWorldPosition(_aB))
        + el.getWorldPosition(_aB).distanceTo(ha.getWorldPosition(_aC));
      const lat = side === 'Left' ? 0.10 * s : -0.10 * s;
      const yPunch = charge ? hT * 0.95 : hT * (0.97 + 0.06 * seed);
      this.root.getWorldQuaternion(_sP);
      _v3.set(0, 0, 1).applyQuaternion(_sP);            // adelante en mundo
      const reach = armLen * 0.97 * (0.35 + 0.65 * e);
      _v1.copy(_aA).addScaledVector(_v3, reach);
      _v1.y = yPunch;
      _v2.copy(_aA).addScaledVector(_v3, reach * 0.12);
      _v2.y = yPunch - 0.20 * s;                        // codo bajo
      this.aimChain(sh, el, ha, _v1, _v2, w);
      this.body.updateMatrixWorld(true);
      this.body.updateMatrixWorld(true);
      const other = side === 'Left' ? 'Right' : 'Left';
      if (charge) {
        // El cuerpo entra detrás del puño y el brazo contrario rema atrás
        this.bones.LowerBack.rotateX(0.20 * e);
        this.bones.Spine.rotateX(0.26 * e);
        const oSh = this.bones[`${other}Arm`];
        oSh.getWorldPosition(_aA);
        _v1.copy(_aA).addScaledVector(_v3, -0.30 * s);
        _v1.y = 1.05 * s;
        _v2.copy(_aA).addScaledVector(_v3, -0.05 * s);
        _v2.y = 1.15 * s;
        this.aimChain(this.bones[`${other}Arm`], this.bones[`${other}ForeArm`],
          this.bones[`${other}Hand`], _v1, _v2, 0.85);
      } else {
        this.bones[`${other}Arm`].rotateX(0.35 * e);   // mano contraria en guardia
      }
    }
  }

  /* --- ataques aéreos al estilo lámina 2D ---------------------------- */

  /**
   * En las láminas, la patada de salto es una diagonal: pierna de pateo
   * extendida abajo-adelante, la otra plegada con rodilla arriba, tronco
   * levemente atrás y brazos abiertos para equilibrar. El puño de salto
   * hunde el brazo abajo-adelante con las rodillas recogidas.
   */
  applyAirAttack(f, isKick, e, s, w) {
    for (const n of ['LowerBack', 'Spine', 'Spine1',
      'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg',
      'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm']) {
      this.bones[n].quaternion.slerp(_qId, 0.6);
    }
    if (e < 0) { this.bones.RightUpLeg.rotateX(-e * 0.8); return; }
    const up = this.bones.RightUpLeg, leg = this.bones.RightLeg, foot = this.bones.RightFoot;
    if (isKick) {
      const legLen = up.getWorldPosition(_aA).distanceTo(leg.getWorldPosition(_aB))
        + leg.getWorldPosition(_aB).distanceTo(foot.getWorldPosition(_aC));
      _v1.set(0, 0.50 * s, legLen * 0.97 * (0.4 + 0.6 * e));   // diagonal abajo-adelante
      this.body.localToWorld(_v1);
      _v2.set(0, 0.8 * s, 0.5 * s);                            // rodilla sobre la línea
      this.body.localToWorld(_v2);
      this.aimChain(up, leg, foot, _v1, _v2, w);
      this.body.updateMatrixWorld(true);
      // Pierna libre plegada: rodilla arriba, talón atrás
      this.bones.LeftUpLeg.rotateX(-1.0 * e);
      this.bones.LeftLeg.rotateX(1.5 * e);
      // Brazos equilibrando: contrario arriba-adelante, homólogo atrás
      _v1.set(0.15 * s, 1.50 * s, 0.30 * s); this.body.localToWorld(_v1);
      _v2.set(0.25 * s, 1.30 * s, 0.10 * s); this.body.localToWorld(_v2);
      this.aimChain(this.bones.LeftArm, this.bones.LeftForeArm, this.bones.LeftHand, _v1, _v2, 0.8);
      this.body.updateMatrixWorld(true);
      _v1.set(-0.20 * s, 1.20 * s, -0.30 * s); this.body.localToWorld(_v1);
      _v2.set(-0.30 * s, 1.30 * s, -0.10 * s); this.body.localToWorld(_v2);
      this.aimChain(this.bones.RightArm, this.bones.RightForeArm, this.bones.RightHand, _v1, _v2, 0.8);
    } else {
      const leftish = /LP/.test(f.move.id || '');
      const side = leftish ? 'Left' : 'Right';
      const sh = this.bones[`${side}Arm`], el = this.bones[`${side}ForeArm`], ha = this.bones[`${side}Hand`];
      const armLen = sh.getWorldPosition(_aA).distanceTo(el.getWorldPosition(_aB))
        + el.getWorldPosition(_aB).distanceTo(ha.getWorldPosition(_aC));
      const lat = side === 'Left' ? 0.08 * s : -0.08 * s;
      _v1.set(lat, 1.00 * s, armLen * 0.95 * (0.35 + 0.65 * e));  // hunde el puño
      this.body.localToWorld(_v1);
      _v2.set(lat * 1.5, 1.25 * s, 0.10 * s); this.body.localToWorld(_v2);
      this.aimChain(sh, el, ha, _v1, _v2, w);
      this.body.updateMatrixWorld(true);
      // Rodillas recogidas en el salto
      this.bones.LeftUpLeg.rotateX(-0.85 * e);
      this.bones.LeftLeg.rotateX(1.20 * e);
      this.bones.RightUpLeg.rotateX(-0.55 * e);
      this.bones.RightLeg.rotateX(0.90 * e);
      const other = side === 'Left' ? 'Right' : 'Left';
      this.bones[`${other}Arm`].rotateX(0.4 * e);   // contraria en guardia alta
    }
    this.body.updateMatrixWorld(true);
    this.bones.LowerBack.rotateX(this.kickSign * 0.12 * e);  // tronco levemente atrás
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
    // Incluye los normales agachados: sin IK de pies, bajar la cadera los
    // hundiría en el suelo.
    const crouchPose = pose === 'crouch' ||
      !!(f.move && f.move.input && f.move.input.dir === '2' && !f.airborne);
    // Solo en estados de pie: tumbado o volando el IK de pies estorbaría.
    const up = ['idle', 'dizzy', 'blockHigh', 'blockLow', 'parry', 'hitHigh', 'hitLow',
      'walkF', 'walkB', 'walkSide', 'run'];
    let w = 0;
    if (crouchPose || up.includes(pose)) {
      w = pose === 'idle' || pose === 'dizzy' || pose.startsWith('block') || pose === 'parry' || crouchPose
        ? 0.9 : pose.startsWith('hit') ? 0.85 : 0.6;
    }
    if (w <= 0.01 || f.airborne) return;

    const s = this.height / WORLD_HEIGHT;
    const widen = (crouchPose ? 0.055 : 0.12) * s * (0.5 + 0.5 * (this.legLen || 1));
    for (const side of ['L', 'R']) {
      const upleg = this.bones[side === 'L' ? 'LeftUpLeg' : 'RightUpLeg'];
      const leg = this.bones[side === 'L' ? 'LeftLeg' : 'RightLeg'];
      const foot = this.bones[side === 'L' ? 'LeftFoot' : 'RightFoot'];
      if (!foot) continue;
      if (crouchPose) {
        // Objetivo absoluto: pies plantados bajo el cuerpo, un poco adelante;
        // la cadera ya bajó, así que las rodillas se doblan solas.
        _v1.set(side === 'L' ? widen : -widen, 0.02 * s, 0.10 * s);
        this.body.localToWorld(_v1);
      } else {
        foot.getWorldPosition(_v1);
        this.body.worldToLocal(_v1);
        _v1.x += side === 'L' ? widen : -widen;        // ensanche lateral local
        this.body.localToWorld(_v1);
        // Si la cadera bajó, el pie no puede hundirse: el objetivo del IK es
        // el suelo y las rodillas absorben la diferencia.
        _v1.y = Math.max(_v1.y, 0.02 * s);
      }
      // rodilla mirando al frente (en crouch el eje cadera-pie es casi
      // vertical y el polo debe empujar la rodilla bien adelante)
      // espinilla vertical: rodilla sobre el pie, como en las laminas
      if (crouchPose) _v2.set(side === 'L' ? 0.05 * s : -0.05 * s, 0.45 * s, 0.22 * s);
      else _v2.set(side === 'L' ? 0.12 * s : -0.12 * s, 0.55 * s, 0.3 * s);
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

  fixGround(f) {
    const pose = f && f.anim ? f.anim.pose : '';
    const lying = pose === 'knockdown' || pose === 'ko';
    // Tumbado el punto mas bajo es la espalda/cadera/cabeza, no el pie:
    // sondeamos esos nodos con el radio de superficie bajo cada hueso.
    const probes = lying
      ? [['LeftFoot', 0.05], ['RightFoot', 0.05], ['LeftToeBase', 0.03], ['RightToeBase', 0.03],
         ['Head', 0.10], ['Hips', 0.12], ['Spine1', 0.13], ['Spine', 0.12]]
      : [['LeftFoot', 0], ['RightFoot', 0], ['LeftToeBase', 0], ['RightToeBase', 0]];
    let lowest = Infinity;
    for (const [n, r] of probes) {
      const b = this.bones[n];
      if (!b) continue;
      b.getWorldPosition(_v1);
      const y = _v1.y - r;
      if (y < lowest) lowest = y;
    }
    if (!Number.isFinite(lowest)) return;
    const sink = -lowest;              // cuánto hay que subir para apoyar
    if (sink > 0.0005 && sink < 0.8) {
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

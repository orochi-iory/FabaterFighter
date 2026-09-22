/**
 * IA de la CPU.
 *
 * La CPU no hace trampas: genera la misma entrada "cruda" que un teclado,
 * incluyendo las secuencias de direcciones de los comandos especiales
 * (236P, 623P, 4~6P...). Así el parser de inputs se ejercita de verdad.
 */

import { STATE, THROW_RANGE, WALL_LIMIT, clamp } from './constants.js';

const DIR_KEYS = {
  1: { left: true, down: true }, 2: { down: true }, 3: { right: true, down: true },
  4: { left: true }, 5: {}, 6: { right: true },
  7: { left: true, up: true }, 8: { up: true }, 9: { right: true, up: true }
};

/** Convierte un comando ("236P") en una lista de pasos de entrada. */
export function commandToSteps(command, opts = {}) {
  const steps = [];
  const hold = opts.holdEach ?? 3;
  const m = /^([0-9~]+)(.*)$/.exec(command);
  const dirs = m ? m[1] : '';
  const btn = m ? m[2] : '';
  const parts = dirs.split('~');
  // 'P' y 'K' son genéricos: se traducen a un botón real (por defecto HP / HK).
  const buttonObj = {};
  const resolved = opts.button || (btn.endsWith('K') ? 'HK' : btn.endsWith('P') ? 'HP' : null);
  if (resolved) buttonObj[resolved] = true;

  if (parts.length === 2) {
    // Carga: mantiene la dirección y luego avanza.
    steps.push({ dir: +parts[0], frames: opts.charge ?? 50, buttons: {} });
    for (const ch of parts[1]) steps.push({ dir: +ch, frames: hold, buttons: {} });
    steps[steps.length - 1].buttons = { ...buttonObj };
    steps.push({ dir: +parts[1][parts[1].length - 1], frames: 6, buttons: { ...buttonObj } });
    return steps;
  }
  for (const ch of parts[0]) steps.push({ dir: +ch, frames: hold, buttons: {} });
  steps[steps.length - 1].buttons = { ...buttonObj };
  steps.push({ dir: +parts[0][parts[0].length - 1], frames: 8, buttons: { ...buttonObj } });
  steps.push({ dir: 5, frames: 4, buttons: {} });
  return steps;
}

export class AI {
  /**
   * @param {Fighter} me
   * @param {Fighter} foe
   * @param {number} difficulty 1..4
   */
  constructor(me, foe, difficulty = 2) {
    this.me = me;
    this.foe = foe;
    this.setDifficulty(difficulty);
    this.plan = [];
    this.decideIn = 0;
    this.blockFrames = 0;
    this.blockLow = false;
    this.mode = 'neutral';
    this.rng = Math.random;
    this.projectile = (me.def.specials || []).find((m) => m.kind === 'projectile' && m.input.motion) || null;
    this.reversal = (me.def.specials || []).find((m) => m.tags && m.tags.includes('reversal')) || null;
    this.grab = (me.def.specials || []).find((m) => m.kind === 'grab') || null;
    this.teleport = (me.def.specials || []).find((m) => m.kind === 'teleport') || null;
    this.counterMove = (me.def.specials || []).find((m) => m.kind === 'counter') || null;
    this.superMove = (me.def.supers || [])[0] || null;
    this.rushSpecial = (me.def.specials || []).find((m) => m.motion && m.motion.type === 'lunge') || null;
    this.antiAir = this.reversal || me.moveById['2HP'];
  }

  setDifficulty(d) {
    this.difficulty = d;
    const t = [
      { reaction: 26, blockChance: 0.28, aggression: 0.35, superSkill: 0.25, parryChance: 0.02, mistake: 0.35 },
      { reaction: 16, blockChance: 0.52, aggression: 0.55, superSkill: 0.5, parryChance: 0.08, mistake: 0.2 },
      { reaction: 9, blockChance: 0.74, aggression: 0.7, superSkill: 0.75, parryChance: 0.18, mistake: 0.1 },
      { reaction: 4, blockChance: 0.9, aggression: 0.82, superSkill: 0.95, parryChance: 0.35, mistake: 0.04 }
    ][clamp(d - 1, 0, 3)];
    Object.assign(this, t);
  }

  reset() { this.plan.length = 0; this.decideIn = 0; this.blockFrames = 0; }

  /* ---------------------------------------------------------------- */
  think() {
    const me = this.me, foe = this.foe;
    if (!foe) return {};

    // Ejecuta el plan en curso.
    if (this.plan.length) return this.consumePlan();

    const facingRight = foe.x >= me.x;

    // Mantiene la guardia mientras dura la amenaza.
    if (this.blockFrames > 0 && me.actionable) {
      this.blockFrames--;
      return this.blockInput(this.blockLow, facingRight);
    }

    // Mientras está bloqueando/aturdido no decide.
    if (me.state === STATE.THROWN || me.state === STATE.KNOCKDOWN || me.state === STATE.WAKEUP ||
        me.state === STATE.DIZZY || me.state === STATE.GUARDCRUSH || me.state === STATE.MAXACTIVATE) {
      return {};
    }

    const dist = Math.abs(foe.x - me.x);

    // --- Defensa reactiva ---
    const foeAttacking = foe.state === STATE.ATTACK && foe.move;
    const incoming = this.incomingThreat();
    if (incoming && me.actionable) {
      if (this.rng() < this.parryChance && this.parryWindowOk(incoming)) {
        this.plan = [{ dir: incoming.low ? 2 : 6, frames: 2, buttons: {} }, { dir: 5, frames: 8, buttons: {} }];
        return this.consumePlan();
      }
      if (this.rng() < this.blockChance) {
        // Anti-aéreo con reversal si viene por arriba.
        if (foe.airborne && dist < 2.2 && this.antiAir && this.rng() < 0.55) {
          this.queueCommand(commandFor(this.antiAir), this.antiAir);
          return this.consumePlan();
        }
        this.blockLow = !!incoming.low;
        this.blockFrames = Math.min(40, (incoming.frames || 6) + 10);
        return this.blockInput(this.blockLow, facingRight);
      }
    }
    if (me.state === STATE.BLOCKSTUN) {
      // Guard cancel roll ocasional.
      if (me.stocks > 0 && this.rng() < 0.02 * this.difficulty) return { GC: true };
      return this.blockInput(false, facingRight);
    }

    if (this.decideIn > 0) {
      this.decideIn--;
      if (this.rng() < 0.5) return this.blockInput(false, facingRight);
      return {};
    }

    if (!me.actionable) return {};

    this.decideIn = Math.round(this.reaction * (0.6 + this.rng() * 0.8));
    this.chooseAction(dist, facingRight, foeAttacking);
    return this.consumePlan();
  }

  /** Detecta si hay un golpe/proyectil a punto de llegar. */
  incomingThreat() {
    const foe = this.foe, me = this.me;
    const dist = Math.abs(foe.x - me.x);
    if (foe.state === STATE.ATTACK && foe.move) {
      const m = foe.move;
      const remaining = m.startup - foe.moveFrame;
      const reach = this.estimateReach(m);
      if (remaining >= 0 && remaining < 16 && dist < reach + 0.6) {
        const low = (m.hits || []).some((h) => h.low);
        return { low, frames: remaining, kind: 'melee' };
      }
    }
    for (const p of (this.match ? this.match.projectiles : [])) {
      if (p.owner === me) continue;
      const dx = (p.x - me.x) * me.facing;
      if (dx > 0 && dx < 4.5 && Math.sign(p.vx * p.facing) === 1) {
        return { low: false, frames: Math.max(1, Math.round(dx / Math.max(0.05, p.vx))), kind: 'projectile' };
      }
    }
    if (foe.airborne && dist < 2.6 && foe.state === STATE.ATTACK) return { low: false, frames: 8, kind: 'air' };
    return null;
  }

  estimateReach(m) {
    let r = 1.1;
    for (const h of m.hits || []) r = Math.max(r, h.box.x + h.box.w / 2);
    if (m.grab) r = Math.max(r, m.grab.range);
    return r;
  }

  parryWindowOk(threat) {
    return threat.frames > 2 && threat.frames < 12 && this.me.parryCooldown <= 0;
  }

  blockInput(low, facingRight) {
    const dir = low ? 1 : 4;
    const keys = DIR_KEYS[dir];
    return { ...(facingRight ? {} : { left: false, right: false }), ...mirror(keys, facingRight), down: low };
  }

  /* ---------------------------------------------------------------- */
  chooseAction(dist, facingRight, foeAttacking) {
    const me = this.me, foe = this.foe;
    const r = this.rng();
    const cornered = Math.abs(me.x) > WALL_LIMIT - 1.2;

    // Super cuando hay stock y oportunidad.
    if (this.superMove && me.stocks >= 1 && r < this.superSkill * 0.5) {
      const foeVulnerable = foe.state === STATE.HITSTUN || foe.state === STATE.AIRHIT ||
                            foe.state === STATE.DIZZY || foe.state === STATE.GUARDCRUSH;
      const closeEnough = dist < (this.superMove.kind === 'projectile' ? 7 : 2.4);
      if ((foeVulnerable && dist < 3.2) || (closeEnough && r < 0.3)) {
        this.queueCommand(commandFor(this.superMove), this.superMove);
        return;
      }
    }
    // MAX mode con vida baja o mucha ventaja.
    if (me.stocks >= 1 && me.maxMode <= 0 && (me.health < me.maxHealth * 0.35 || foe.health < foe.maxHealth * 0.25) && r < 0.4) {
      this.plan = [{ dir: 5, frames: 2, buttons: { MAX: true } }, { dir: 5, frames: 4, buttons: {} }];
      return;
    }

    // Zoner: proyectil a media/larga distancia.
    if (this.projectile && dist > 3.2 && r < 0.5) {
      this.queueCommand(commandFor(this.projectile, 'HP'), this.projectile, 'HP');
      return;
    }
    // Grappler: se acerca y busca el command grab.
    if (this.grab && dist < (this.grab.grab?.range ?? 1.8) && r < 0.55) {
      this.queueCommand(commandFor(this.grab, 'HP'), this.grab, 'HP');
      return;
    }
    if (this.grab && dist > 2.0 && r < 0.5) { this.plan = this.walkSteps(6, 18); return; }

    // Castigo: el rival está en recovery.
    const foeRecovering = foe.state === STATE.ATTACK && foe.move &&
      foe.moveFrame > foe.move.startup + foe.move.active;
    if (foeRecovering && dist < 2.0 && r < 0.8) {
      this.queueNormal(dist < 1.3 ? '5HP' : '5HK');
      return;
    }

    // Throw de cerca.
    if (dist < (me.def.throwRange ?? THROW_RANGE) && (foe.actionable || foe.state === STATE.BLOCKSTUN) && r < 0.22 * this.aggression) {
      this.plan = [{ dir: 5, frames: 2, buttons: { LP: true, LK: true } }, { dir: 5, frames: 6, buttons: {} }];
      return;
    }

    if (dist > 4.5) {
      if (this.teleport && r < 0.25) { this.queueCommand(commandFor(this.teleport), this.teleport); return; }
      if (this.projectile && r < 0.6) { this.queueCommand(commandFor(this.projectile, 'LP'), this.projectile, 'LP'); return; }
      this.plan = this.walkSteps(6, 20);
      return;
    }

    if (dist > 1.9) {
      // Presión: especial que avanza o caminar.
      if (this.rushSpecial && r < 0.4 * this.aggression) {
        this.queueCommand(commandFor(this.rushSpecial, 'HP'), this.rushSpecial, 'HP');
        return;
      }
      if (r < 0.5) { this.plan = this.walkSteps(6, 12); return; }
      this.queueNormal('5HK');
      return;
    }

    // Corta distancia.
    if (foe.airborne && this.antiAir && r < 0.6) {
      this.queueCommand(commandFor(this.antiAir, 'HP'), this.antiAir, 'HP');
      return;
    }
    const roll = r;
    if (roll < 0.3 * this.aggression) { this.queueNormal('2LP'); return; }
    if (roll < 0.5 * this.aggression) { this.queueNormal('5HP'); return; }
    if (roll < 0.62 * this.aggression) { this.queueNormal('2HK'); return; }
    if (roll < 0.72 * this.aggression) { this.queueNormal('6HP'); return; }
    if (roll < 0.8 * this.aggression && this.reversal) {
      this.queueCommand(commandFor(this.reversal, 'HP'), this.reversal, 'HP');
      return;
    }
    // Combo: launcher + juggle.
    if (roll < 0.9 && me.moveById['2HP']) { this.queueNormal('2HP'); return; }
    this.plan = this.walkSteps(cornered ? 4 : 6, 10);
  }

  queueNormal(id) {
    const btn = { '5LP': 'LP', '5LK': 'LK', '5HP': 'HP', '5HK': 'HK', '2LP': 'LP', '2LK': 'LK', '2HP': 'HP', '2HK': 'HK', '6HP': 'HP', '3HK': 'HK' }[id] || 'HP';
    const dir = id.startsWith('2') ? 2 : id.startsWith('6') ? 6 : id.startsWith('3') ? 3 : 5;
    this.plan = [
      { dir, frames: 2, buttons: {} },
      { dir, frames: 3, buttons: { [btn]: true } },
      { dir, frames: 8, buttons: {} }
    ];
    // Cancel básico: especial tras el normal.
    if (this.rushSpecial && Math.random() < 0.35) {
      this.plan.push(...commandToSteps(commandFor(this.rushSpecial), { holdEach: 2 }));
    }
  }

  queueCommand(command, move, button = null) {
    if (!command) { this.plan = [{ dir: 5, frames: 6, buttons: {} }]; return; }
    this.plan = commandToSteps(command, {
      holdEach: 2 + Math.round(this.rng() * 2),
      charge: 52,
      button: button || (command.endsWith('K') ? 'HK' : 'HP')
    });
  }

  walkSteps(dir, frames) {
    return [{ dir, frames, buttons: {} }, { dir: 5, frames: 4, buttons: {} }];
  }

  consumePlan() {
    const step = this.plan[0];
    if (!step) return {};
    step.frames--;
    if (step.frames <= 0) this.plan.shift();
    const facingRight = this.foe ? this.foe.x >= this.me.x : true;
    const keys = mirror(DIR_KEYS[step.dir] || {}, facingRight);
    return { ...keys, ...(step.buttons || {}) };
  }
}

/** Las direcciones del comando son relativas al luchador; aquí las pasamos a absolutas. */
function mirror(keys, facingRight) {
  if (facingRight) return { ...keys };
  const out = { ...keys };
  const l = keys.left, r = keys.right;
  out.left = r; out.right = l;
  return out;
}

/** Extrae el comando (notación numpad + botón) de un golpe. */
export function commandFor(move, buttonOverride = null) {
  const inp = move.input || {};
  if (!inp.motion) return null;
  const btn = buttonOverride ? (buttonOverride === 'LP' || buttonOverride === 'HP' ? 'P' : 'K') : (inp.button || 'P');
  return inp.motion + btn.replace('P+K', 'P');
}

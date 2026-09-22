/**
 * Match — orquesta la ronda: orden de actualización, hitstop, proyectiles,
 * rondas al mejor de 3, tiempo, KO y eventos para la capa audiovisual.
 */

import {
  STATE, ROUND_TIME, FRAMES_PER_TICK, ROUNDS_TO_WIN, STAGE_HALF, WALL_LIMIT,
  LEVEL_DATA, clamp
} from './constants.js';
import { applyHit, boxesOverlap, separateFighters, resolveThrow } from './fighter.js';

export class Projectile {
  constructor(owner, move, def, opts = {}) {
    this.owner = owner;
    this.move = move;
    this.def = def;
    this.facing = owner.facing;
    this.x = owner.x + (def.spawnX ?? 0.7) * this.facing;
    this.y = owner.y + (def.y ?? 1.25);
    this.vx = def.speed;
    this.vy = def.vy || 0;
    this.gravity = def.gravity || 0;
    this.box = def.box;
    this.damage = def.damage;
    this.level = def.super ? 'SU' : (def.level || 'SP');
    this.life = def.life || 180;
    this.maxHits = def.hits || 1;
    this.hitsLanded = 0;
    this.hitCooldown = 0;
    this.interval = def.interval || 0;
    this.color = def.color || '#ffffff';
    this.fx = def.fx || 'orb';
    this.homing = def.homing || 0;
    this.reflectable = def.reflectable !== false;
    this.dead = false;
    this.spin = 0;
    this.index = opts.index || 0;
  }

  get hitbox() {
    return {
      x0: this.x - this.box.w / 2, x1: this.x + this.box.w / 2,
      y0: this.y - this.box.h / 2, y1: this.y + this.box.h / 2
    };
  }

  update(match, target) {
    this.life--;
    if (this.homing && target && !target.dead) {
      const dy = (target.y + 1.1) - this.y;
      this.vy += clamp(dy * this.homing, -0.01, 0.01);
    }
    this.vy += this.gravity;
    this.x += this.vx * this.facing;
    this.y += this.vy;
    this.spin += 0.35;
    if (this.def.ground && this.y < this.def.y) { this.y = this.def.y; this.vy = 0; }
    if (this.life <= 0 || Math.abs(this.x) > STAGE_HALF + 2 || this.y < -1) this.dead = true;
    if (this.hitCooldown > 0) this.hitCooldown--;
  }
}

export class Match {
  constructor(f1, f2, opts = {}) {
    this.p1 = f1;
    this.p2 = f2;
    this.fighters = [f1, f2];
    this.opts = {
      rounds: opts.rounds ?? ROUNDS_TO_WIN,
      training: !!opts.training,
      infiniteHealth: !!opts.infiniteHealth,
      onEvent: opts.onEvent || (() => {}),
      ...opts
    };
    this.events = [];
    this.frame = 0;
    this.reset();
  }

  reset() {
    this.frame = 0;
    this.round = 1;
    this.wins = [0, 0];
    this.timer = ROUND_TIME;
    this.tickAcc = 0;
    this.hitstop = 0;
    this.superFlash = null;
    this.parryFreeze = false;
    this.projectiles = [];
    this.phase = 'intro';
    this.phaseTimer = 0;
    this.announce = null;
    this.slowmo = 0;
    this.shake = 0;
    this.zoom = 1;
    this.maxCombo = [0, 0];
    this.totalDamage = [0, 0];
    this.parryCount = [0, 0];
    this.startRound(true);
  }

  /* ---------------------------------------------------------------- */
  startRound(first = false) {
    const p1WonLast = this.lastWinner === 0;
    const p2WonLast = this.lastWinner === 1;
    // KOF98: si ganaste la ronda conservas la barra; si la perdiste se vacía.
    this.p1.reset(-2.2, 1, p1WonLast);
    this.p2.reset(2.2, -1, p2WonLast);
    this.projectiles.length = 0;
    this.timer = ROUND_TIME;
    this.tickAcc = 0;
    this.hitstop = 0;
    this.phase = 'intro';
    this.phaseTimer = first ? 150 : 130;
    this.announce = { text: `ROUND ${this.round}`, sub: '', timer: 90 };
    this.emit({ type: 'roundStart', round: this.round });
  }

  emit(e) {
    this.events.push(e);
    this.opts.onEvent(e);
  }

  get over() { return this.phase === 'matchEnd'; }
  get winnerIndex() {
    if (this.wins[0] >= this.opts.rounds) return 0;
    if (this.wins[1] >= this.opts.rounds) return 1;
    return -1;
  }

  /* ---------------------------------------------------------------- */
  step(input1, input2) {
    this.frame++;
    this.events.length = 0;

    // Recoge los eventos generados por los luchadores.
    for (const f of this.fighters) {
      for (const e of f.events) this.emit(e);
      f.events.length = 0;
    }

    if (this.shake > 0) this.shake *= 0.86;
    if (this.slowmo > 0) this.slowmo--;

    if (this.phase === 'matchEnd') {
      for (const f of this.fighters) f.update(emptyInput(), this.other(f), this);
      return;
    }

    // Intro de ronda.
    if (this.phase === 'intro') {
      this.phaseTimer--;
      if (this.phaseTimer === 60) this.announce = { text: 'FIGHT!', sub: '', timer: 45 };
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
        for (const f of this.fighters) {
          f.state = STATE.IDLE;
          f.stateFrame = 0;
        }
        this.emit({ type: 'fight' });
        // continúa con la actualización normal en este mismo frame
      } else {
        for (const f of this.fighters) {
          f.state = STATE.INTRO;
          f.stateFrame++;
          f.updateAnim();
          f.applyPhysics(this);
        }
        return;
      }
    }

    // Hitstop (congelación de impacto / super flash).
    if (this.hitstop > 0) {
      this.hitstop--;
      if (this.hitstop === 0) { this.parryFreeze = false; this.superFlash = null; }
      for (const f of this.fighters) { f.updateAnim(); }
      this.updateProjectilesVisualOnly();
      return;
    }

    // KO: el combate se detiene tras el golpe final.
    if (this.phase === 'ko') {
      this.phaseTimer--;
      for (const f of this.fighters) f.update(emptyInput(), this.other(f), this);
      this.updateProjectiles();
      if (this.phaseTimer <= 0) this.endRound();
      return;
    }

    // --- Combate normal ---
    if (this.opts.training) this.reviveIfNeeded();
    const a = this.p1, b = this.p2;
    a.update(input1, b, this);
    b.update(input2, a, this);

    this.resolveGrabs();
    this.resolveAttacks();
    this.updateProjectiles();
    separateFighters(a, b);
    this.updateTimer();
    this.updateCombos();
    this.checkRoundEnd();
  }

  other(f) { return f === this.p1 ? this.p2 : this.p1; }

  /** En entrenamiento la vida se restaura y nadie queda KO. */
  reviveIfNeeded() {
    for (const f of this.fighters) {
      if (f.dead || f.health <= 0) {
        f.dead = false;
        f.health = f.maxHealth;
        f.state = STATE.IDLE;
        f.stateFrame = 0;
        f.hitstun = 0;
        f.stun = 0;
        f.guard = 0;
        f.dot = null;
        f.airborne = false;
        f.y = 0; f.vy = 0; f.vx = 0;
        f.x = f.index === 0 ? -2.2 : 2.2;
      }
    }
    if (this.phase === 'ko') { this.phase = 'fight'; this.phaseTimer = 0; }
  }

  emptyInput() { return {}; }

  updateProjectilesVisualOnly() {
    for (const p of this.projectiles) p.spin += 0.35;
  }

  updateProjectiles() {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = this.other(p.owner);
      p.update(this, target);
      if (p.dead) { this.projectiles.splice(i, 1); continue; }
      if (target.dead || target.state === STATE.KO) continue;
      if (p.hitCooldown > 0) continue;
      const tb = target.hurtbox();
      if (!boxesOverlap(p.hitbox, tb)) continue;

      // Reflector (Sera).
      const counter = target.activeCounter();
      if (counter && counter.reflect && p.reflectable) {
        p.owner = target;
        p.facing = target.facing;
        p.vx = Math.abs(p.vx) * 1.15;
        p.damage = Math.round(p.damage * 1.2);
        p.color = target.def.fx;
        p.hitCooldown = 6;
        target.emit('reflect');
        p.owner.emit('reflected');
        this.emit({ type: 'reflect', x: p.x, y: p.y });
        continue;
      }
      const res = applyHit(p.owner, target, {
        box: p.box, damage: p.damage, level: p.level, hitstun: 24, blockstun: 16,
        push: 0.11, ...(p.def.hitMod || {})
      }, p.move, this, { hitKey: 'proj', ignoreJuggle: false, projectile: true });
      if (!res) continue;
      if (res.result === 'parry') {
        p.dead = true;
        this.parryCount[target.index]++;
        this.emit({ type: 'parryProjectile', x: p.x, y: p.y });
        this.projectiles.splice(i, 1);
        continue;
      }
      p.hitsLanded++;
      if (res.result === 'hit' || res.result === 'counter') {
        this.totalDamage[p.owner.index] += res.damage || 0;
        this.shake = Math.min(1.2, this.shake + 0.3);
      }
      p.hitCooldown = p.interval > 0 ? p.interval : 999;
      this.emit({ type: 'projectileHit', x: p.x, y: p.y, result: res.result, color: p.color });
      if (p.hitsLanded >= p.maxHits || p.hitCooldown >= 999) {
        p.dead = true;
        this.projectiles.splice(i, 1);
      }
    }
  }

  resolveAttacks() {
    for (const attacker of this.fighters) {
      const defender = this.other(attacker);
      const boxes = attacker.activeHitboxes();
      for (const hb of boxes) {
        if (defender.dead || defender.state === STATE.KO) continue;
        if (!boxesOverlap(hb.box, defender.hurtbox())) continue;

        // Counter (Prism Reflector).
        const counter = defender.activeCounter();
        if (counter) {
          attacker.hitDone.add(hb.key);
          this.doCounter(defender, attacker, counter);
          continue;
        }
        const res = applyHit(attacker, defender, hb.hit, hb.move, this, { hitKey: hb.key });
        if (!res) continue;
        this.emit({
          type: res.result === 'parry' ? 'parry' : res.result === 'block' ? 'block' : 'hit',
          x: (hb.box.x0 + hb.box.x1) / 2,
          y: (hb.box.y0 + hb.box.y1) / 2,
          damage: res.damage || 0,
          counter: res.result === 'counter',
          color: hb.move.fxColor,
          attacker: attacker.index
        });
        if (res.result === 'parry') this.parryCount[defender.index]++;
        if (res.result === 'hit' || res.result === 'counter') {
          this.shake = Math.min(1.2, this.shake + (hb.hit.level === 'SU' ? 0.9 : 0.35));
          this.totalDamage[attacker.index] += res.damage;
        }
      }
    }
  }

  doCounter(counterOwner, attacker, counter) {
    if (counter.reflect) {
      // Contraataque melee.
      const dmg = counter.damage || 60;
      attacker.health = Math.max(0, attacker.health - dmg);
      attacker.hitFlash = 12;
      attacker.state = STATE.AIRHIT;
      attacker.stateFrame = 0;
      attacker.airborne = true;
      attacker.gravityOn = true;
      attacker.vy = counter.launch ? counter.launch.y : 0.2;
      attacker.vx = counterOwner.facing * 0.09;
      attacker.hitstun = 30;
      attacker.move = null;
      counterOwner.addMeter(140);
      attacker.addMeter(60);
      this.hitstop = Math.max(this.hitstop, 14);
      counterOwner.emit('counterHit', { damage: dmg });
      this.emit({ type: 'counter', x: attacker.x, y: attacker.y + 1.2, damage: dmg });
      if (attacker.health <= 0) {
        attacker.dead = true;
        attacker.state = STATE.KO;
        this.onKO(attacker, counterOwner);
      }
    }
    counterOwner.state = STATE.IDLE;
    counterOwner.stateFrame = 0;
    counterOwner.move = null;
  }

  resolveGrabs() {
    for (const attacker of this.fighters) {
      const m = attacker.activeGrab();
      if (!m) continue;
      const defender = this.other(attacker);
      const g = m.grab;
      if (defender.dead || defender.airborne || defender.state === STATE.KO) continue;
      if (defender.invuln > 0) continue;
      if (Math.abs(defender.x - attacker.x) > g.range) continue;
      attacker.hitDone.add('grab');
      attacker.startThrow(m, defender, this);
      this.emit({ type: 'grab', x: defender.x, y: defender.y + 1.2 });
    }
  }

  updateTimer() {
    if (this.opts.training) return;
    this.tickAcc++;
    if (this.tickAcc >= FRAMES_PER_TICK) {
      this.tickAcc = 0;
      if (this.timer > 0) {
        this.timer--;
        if (this.timer === 0) this.timeOver();
      }
    }
  }

  updateCombos() {
    for (const f of this.fighters) {
      const d = this.other(f);
      if (f.combo.active) {
        this.maxCombo[f.index] = Math.max(this.maxCombo[f.index], f.combo.count);
        const neutral = d.state === STATE.IDLE && !d.airborne;
        if (neutral) {
          if (f.combo.count >= 2) {
            this.emit({ type: 'comboEnd', player: f.index, count: f.combo.count, damage: f.combo.damage });
          }
          f.combo.active = false;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  startSuperFlash(fighter, move) {
    this.superFlash = { fighter, move, frames: move.super.flash };
    this.hitstop = Math.max(this.hitstop, move.super.flash);
    this.zoom = 1.25;
    this.emit({ type: 'superFlash', player: fighter.index, move });
  }

  spawnProjectile(owner, move, index = 0) {
    const def = move.projectile;
    let d = { ...def };
    // Variantes por botón (LP/HP).
    if (def.byButton) {
      for (const btn of ['LP', 'HP', 'LK', 'HK']) {
        if (def.byButton[btn] && owner.lastButton === btn) Object.assign(d, def.byButton[btn]);
      }
    }
    const p = new Projectile(owner, move, d, { index });
    p.def = d;
    this.projectiles.push(p);
    this.emit({ type: 'projectileSpawn', x: p.x, y: p.y, color: d.color, fx: d.fx, player: owner.index });
  }

  onKO(loser, winner) {
    if (this.phase !== 'fight') return;
    this.phase = 'ko';
    this.phaseTimer = 150;
    this.slowmo = 90;
    this.shake = 1.4;
    this.lastWinner = winner.index;
    this.announce = { text: 'K.O.', sub: '', timer: 120 };
    this.emit({ type: 'ko', winner: winner.index, loser: loser.index });
  }

  timeOver() {
    const h1 = this.p1.health / this.p1.maxHealth;
    const h2 = this.p2.health / this.p2.maxHealth;
    this.phase = 'ko';
    this.phaseTimer = 140;
    this.announce = { text: 'TIME OVER', sub: '', timer: 110 };
    if (Math.abs(h1 - h2) < 0.001) {
      this.drawRound = true;
      this.emit({ type: 'timeOver', draw: true });
    } else {
      const w = h1 > h2 ? this.p1 : this.p2;
      const l = h1 > h2 ? this.p2 : this.p1;
      this.lastWinner = w.index;
      l.state = STATE.KO;
      l.dead = true;
      this.emit({ type: 'timeOver', winner: w.index });
    }
  }

  endRound() {
    if (this.drawRound) {
      this.drawRound = false;
      this.emit({ type: 'draw' });
    } else {
      this.wins[this.lastWinner]++;
      const w = this.fighters[this.lastWinner];
      w.state = STATE.WIN;
      w.stateFrame = 0;
      w.vx = 0;
      w.emit('winPose');
      this.emit({ type: 'roundWin', winner: this.lastWinner, wins: [...this.wins] });
    }
    const w = this.winnerIndex;
    if (w >= 0) {
      this.phase = 'matchEnd';
      this.emit({ type: 'matchEnd', winner: w, maxCombo: [...this.maxCombo], damage: [...this.totalDamage] });
    } else {
      this.round++;
      this.startRound();
    }
  }

  checkRoundEnd() {
    // Doble KO.
    if (this.p1.dead && this.p2.dead && this.phase === 'fight') {
      this.phase = 'ko';
      this.phaseTimer = 160;
      this.drawRound = true;
      this.announce = { text: 'DOUBLE K.O.', sub: '', timer: 120 };
    }
  }

  /* ---------------------------------------------------------------- */
  /** Estado legible para HUD/IA. */
  snapshot() {
    return {
      frame: this.frame,
      phase: this.phase,
      round: this.round,
      timer: this.timer,
      wins: [...this.wins],
      hitstop: this.hitstop,
      p1: fighterSnapshot(this.p1),
      p2: fighterSnapshot(this.p2)
    };
  }
}

export function fighterSnapshot(f) {
  return {
    id: f.id, name: f.name, health: f.health, maxHealth: f.maxHealth,
    meter: f.meter, stocks: f.stocks, maxMode: f.maxMode,
    stun: f.stun, guard: f.guard, state: f.state, x: f.x, y: f.y,
    facing: f.facing, airborne: f.airborne, combo: f.combo.count, dead: f.dead
  };
}

export function emptyInput() { return {}; }
export { STAGE_HALF, WALL_LIMIT, clamp, LEVEL_DATA };

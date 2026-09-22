/**
 * Fighter — máquina de estados de un luchador.
 *
 * Módulo de lógica pura (no importa Three.js ni toca el DOM) para poder
 * simular combates completos en tests de Node.
 *
 * Ciclo de un golpe: startup -> active -> recovery, medido en frames (1/60 s).
 */

import {
  GRAVITY, MAX_STUN, MAX_GUARD, METER_PER_STOCK, MAX_STOCKS,
  MAX_MODE_FRAMES, MAX_MODE_DAMAGE_MUL, STUN_DECAY, GUARD_DECAY, DIZZY_FRAMES,
  GUARD_CRUSH_FRAMES, COMBO_SCALING, MIN_SCALING, JUGGLE_POINTS, CHIP_SPECIAL,
  CHIP_SUPER, PARRY_WINDOW_TAP, PARRY_WINDOW_HOLD, PARRY_WINDOW_AIR, PARRY_COOLDOWN,
  PARRY_FREEZE, PARRY_METER, PARRY_EXTRA_FREEZE, WAKEUP_INVULN, TECH_WINDOW,
  METER_ON_DAMAGE_DEALT, METER_ON_DAMAGE_TAKEN, METER_ON_BLOCK, METER_ON_HIT_NORMAL,
  METER_ON_BLOCK_NORMAL, LEVEL_DATA, JUMP_FORCE, HOP_FORCE,
  SUPER_JUMP_FORCE, JUMP_FORWARD_SPEED, DASH_FRAMES, DASH_SPEED, BACKDASH_FRAMES,
  BACKDASH_SPEED, ROLL_FRAMES, ROLL_SPEED, ROLL_INVULN, THROW_RANGE,
  WALL_LIMIT, STATE, clamp
} from './constants.js';
import { bitsToDir, toRelative, isForward, isBack, isDown, InputBuffer, motion } from './input.js';
import { HURTBOX, PUSHBOX, selectNormal } from '../data/moves.js';

export class Fighter {
  constructor(def, index, facing = 1) {
    this.def = def;
    this.index = index;
    this.id = def.id;
    this.name = def.name;
    this.maxHealth = def.stats.health;
    this.stats = def.stats;
    this.moves = def.moves;
    this.moveById = def.moveById;
    this.colors = def.colors;
    this.body = def.body;
    this.initialFacing = facing;
    this.startX = facing > 0 ? -2.2 : 2.2;
    this.meter = 0;
    this.stocks = 0;
    this.events = [];
    this.buffer = new InputBuffer();
    this.reset(this.startX, facing);
  }

  /* ---------------------------------------------------------------- */
  reset(x = this.startX, facing = this.initialFacing, keepMeter = false) {
    const stocks = keepMeter ? this.stocks : 0;
    const meter = keepMeter ? this.meter : 0;
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.health = this.maxHealth;
    this.state = STATE.IDLE;
    this.stateFrame = 0;
    this.move = null;
    this.moveFrame = 0;
    this.hitDone = new Set();
    this.airborne = false;
    this.gravityOn = true;
    this.crouching = false;
    this.wasCrouching = false;
    this.hitstun = 0;
    this.blockstun = 0;
    this.landingLag = 0;
    this.invuln = 0;
    this.armor = null;
    this.juggle = 0;
    this.stun = 0;
    this.guard = 0;
    this.stunDecayLock = 0;
    this.meter = meter;
    this.stocks = stocks;
    this.maxMode = 0;
    this.parryActive = 0;
    this.parryDir = null;
    this.parryCooldown = 0;
    this.parryHeld = false;
    this.parryFlash = 0;
    this.blocking = false;
    this.blockType = null;
    this.dot = null;
    this.buffs = [];
    this.cancelWindowLeft = 0;
    this.combo = { count: 0, damage: 0, active: false, lastMove: null, maxCount: 0 };
    this.comboDropped = false;
    this.dash = null;
    this.roll = null;
    this.superFlashLock = 0;
    this.airAttackPending = false;
    this.knockdownTimer = 42;
    this.throwTarget = null;
    this.throwDamageDone = false;
    this.thrownBy = null;
    this.throwTimer = 0;
    this.techWindow = 0;
    this.grabbed = false;
    this.techPending = false;
    this.dizzyTimer = 0;
    this.guardCrushTimer = 0;
    this.maxActivateFrames = 26;
    this.lastDir = 5;
    this.lastButton = 'HP';
    this.prevButtons = {};
    this.animPose = 'idle';
    this.anim = { state: 'idle', pose: 'idle', move: null, phase: 'idle', t: 0, frame: 0 };
    this.dead = false;
    this.cornered = false;
    this.hitFlash = 0;
    this.blockFlash = 0;
    this.buffer.reset();
  }

  /* ---------------------------------------------------------------- */
  get actionable() { return this.state === STATE.IDLE && !this.airborne; }
  get isAttacking() { return this.state === STATE.ATTACK; }
  get pushbox() { return PUSHBOX; }
  get damageMul() {
    let m = 1;
    if (this.maxMode > 0) m *= MAX_MODE_DAMAGE_MUL;
    for (const b of this.buffs) if (b.damageMul) m *= b.damageMul;
    return m;
  }
  get speedMul() {
    let m = 1;
    for (const b of this.buffs) if (b.speedMul) m *= b.speedMul;
    return m;
  }

  hurtbox() {
    const hb = this.airborne ? HURTBOX.air : (this.crouching ? HURTBOX.crouch : HURTBOX.stand);
    const s = this.def.body.height;
    return {
      x0: this.x + hb.x - hb.w / 2,
      x1: this.x + hb.x + hb.w / 2,
      y0: this.y + hb.y - (hb.h / 2) * s,
      y1: this.y + hb.y + (hb.h / 2) * s
    };
  }

  worldBox(b) {
    const cx = this.x + b.x * this.facing;
    return { x0: cx - b.w / 2, x1: cx + b.w / 2, y0: this.y + b.y - b.h / 2, y1: this.y + b.y + b.h / 2 };
  }

  addMeter(v) {
    if (v <= 0) return;
    this.meter += v;
    while (this.meter >= METER_PER_STOCK && this.stocks < MAX_STOCKS) {
      this.meter -= METER_PER_STOCK;
      this.stocks++;
      this.emit('stock');
    }
    if (this.stocks >= MAX_STOCKS) this.meter = METER_PER_STOCK;
  }

  spendStocks(n) {
    if (this.stocks < n) return false;
    this.stocks -= n;
    return true;
  }

  emit(type, data = {}) { this.events.push({ type, player: this.index, ...data }); }

  /* ---------------------------------------------------------------- */
  update(rawInput, opponent, match) {
    this.stateFrame++;
    if (this.hitFlash > 0) this.hitFlash--;
    if (this.blockFlash > 0) this.blockFlash--;
    if (this.parryFlash > 0) this.parryFlash--;
    if (this.parryCooldown > 0) this.parryCooldown--;
    if (this.invuln > 0) this.invuln--;
    if (this.landingLag > 0) this.landingLag--;
    if (this.cancelWindowLeft > 0) this.cancelWindowLeft--;
    if (this.superFlashLock > 0) this.superFlashLock--;
    if (this.maxMode > 0) {
      this.maxMode--;
      if (this.maxMode === 0) this.emit('maxEnd');
    }

    if (this.stunDecayLock > 0) this.stunDecayLock--;
    else if (this.stun > 0) this.stun = Math.max(0, this.stun - STUN_DECAY);
    if (this.state !== STATE.BLOCKSTUN && this.guard > 0) {
      this.guard = Math.max(0, this.guard - GUARD_DECAY);
    }
    if (this.dot) this.tickDot();
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      if (--this.buffs[i].frames <= 0) this.buffs.splice(i, 1);
    }

    // Encarar al rival (solo cuando se puede actuar en el suelo).
    if (this.actionable && opponent) {
      this.facing = opponent.x >= this.x ? 1 : -1;
    }

    const intent = this.readIntent(rawInput, match.frame);

    // Ventana de parry armada.
    if (this.parryActive > 0) {
      this.parryActive--;
      if (this.parryHeld && this.parryActive > PARRY_WINDOW_HOLD && !this.airborne) {
        this.parryActive = PARRY_WINDOW_HOLD;
      }
      if (this.parryActive === 0) {
        this.parryCooldown = PARRY_COOLDOWN;
        this.parryDir = null;
      }
    }

    switch (this.state) {
      case STATE.IDLE:
        if (this.airborne) this.updateAir(intent, opponent, match);
        else this.updateIdle(intent, opponent, match);
        break;
      case STATE.ATTACK: this.updateAttack(intent, opponent, match); break;
      case STATE.BLOCKSTUN: this.updateBlockstun(intent); break;
      case STATE.HITSTUN: this.updateHitstun(); break;
      case STATE.AIRHIT: this.updateAirhit(); break;
      case STATE.KNOCKDOWN: this.updateKnockdown(); break;
      case STATE.WAKEUP: this.updateWakeup(); break;
      case STATE.DIZZY: this.updateDizzy(intent); break;
      case STATE.GUARDCRUSH: this.updateGuardCrush(); break;
      case STATE.THROW: this.updateThrowing(match); break;
      case STATE.THROWN: this.updateThrown(intent); break;
      case STATE.MAXACTIVATE: this.updateMaxActivate(); break;
      case STATE.KO: this.updateKO(); break;
      default: break;
    }

    this.applyPhysics(match);
    this.updateAnim();
  }

  readIntent(raw, frame) {
    const absDir = bitsToDir(!!raw.left, !!raw.right, !!raw.down, !!raw.up);
    const dir = toRelative(absDir, this.facing);
    const buttons = {
      LP: !!raw.LP, LK: !!raw.LK, HP: !!raw.HP, HK: !!raw.HK,
      SP1: !!raw.SP1, SP2: !!raw.SP2, SUPER: !!raw.SUPER, MAX: !!raw.MAX, GC: !!raw.GC
    };
    const prev = this.prevButtons;
    this.buffer.push(frame, dir, buttons);
    const intent = {
      dir, absDir, buttons, frame,
      pressed: (b) => buttons[b] && !prev[b],
      freshDir: dir !== this.lastDir,
      forward: isForward(dir), back: isBack(dir), down: isDown(dir)
    };
    this.lastDir = dir;
    this.prevButtons = buttons;
    return intent;
  }

  /* ---------------------------------------------------------------- */
  updateIdle(intent, opp, match) {
    this.wasCrouching = this.crouching;
    if (this.landingLag > 0) {
      this.blocking = false;
      this.vx = 0;
      this.setAnim('land');
      return;
    }

    // 1) Parry (SF3): tap adelante = alto, tap abajo = bajo.
    this.parryHeld = intent.dir === 6 || intent.dir === 2;
    if (this.parryCooldown <= 0 && intent.freshDir) {
      if (intent.dir === 6) this.armParry('high');
      else if (intent.dir === 2) this.armParry('low');
    }

    // 2) Modo MAX (KOF98).
    if (this.tryActivateMax(intent)) return;

    // 3) Throw (LP+LK).
    if ((intent.pressed('LP') && intent.buttons.LK) || (intent.pressed('LK') && intent.buttons.LP)) {
      if (this.tryThrow(opp, match)) return;
    }

    // 4) Ataques.
    const move = this.findMove(intent, opp, match);
    if (move) { this.startMove(move, intent, match); return; }

    // 5) Roll activo (invulnerable) bloquea el resto de acciones.
    if (this.roll) { this.setAnim('roll'); return; }

    // 6) Salto / dash / caminar.
    if (intent.dir === 8 || intent.dir === 7 || intent.dir === 9) { this.startJump(intent); return; }
    if (!this.dash && intent.freshDir && intent.dir === 6 && this.buffer.doubleTap(6, intent.frame)) {
      this.startDash(1); return;
    }
    if (!this.dash && intent.freshDir && intent.dir === 4 && this.buffer.doubleTap(4, intent.frame)) {
      this.startDash(-1); return;
    }
    if (this.dash) { this.setAnim(this.dash.speed > 0 ? 'dashF' : 'dashB'); this.vx = 0; return; }

    this.crouching = intent.down;
    this.blocking = intent.back;
    this.blockType = intent.down ? 'low' : 'high';

    const s = this.stats;
    const sm = this.speedMul;
    if (intent.forward) { this.vx = s.walk * sm; this.setAnim('walkF'); }
    else if (intent.back) { this.vx = -s.back * sm; this.setAnim('walkB'); }
    else { this.vx = 0; this.setAnim(intent.down ? 'crouch' : 'idle'); }
  }

  updateAir(intent, opp, match) {
    // Parry aéreo (SF3): tap adelante en el aire.
    this.parryHeld = intent.dir === 6;
    if (this.parryCooldown <= 0 && intent.freshDir && intent.dir === 6) this.armParry('high');

    // Air block.
    this.blocking = intent.back;
    this.blockType = 'high';
    this.crouching = false;

    const move = this.findMove(intent, opp, match);
    if (move) { this.startMove(move, intent, match); return; }

    if (this.dash) { this.setAnim('airdash'); return; }
    this.setAnim(this.vy > 0 ? 'jump' : 'fall');
  }

  armParry(dir) {
    this.parryActive = this.airborne ? PARRY_WINDOW_AIR : PARRY_WINDOW_TAP;
    this.parryDir = dir;
    this.parryFlash = 6;
    this.emit('parryArm', { dir });
  }

  startJump(intent) {
    let force = JUMP_FORCE;
    let type = 'jump';
    if (intent.down) { force = SUPER_JUMP_FORCE; type = 'superjump'; }
    else if (this.wasCrouching) { force = HOP_FORCE; type = 'hop'; }
    this.airborne = true;
    this.gravityOn = true;
    this.vy = force * (this.stats.jump || 1);
    this.vx = intent.dir === 9 ? JUMP_FORWARD_SPEED : intent.dir === 7 ? -JUMP_FORWARD_SPEED : 0;
    this.crouching = false;
    this.blocking = false;
    this.setAnim(type);
    this.emit('jump', { type });
  }

  startDash(dir) {
    const f = dir > 0 ? DASH_FRAMES : BACKDASH_FRAMES;
    const sp = dir > 0 ? DASH_SPEED : BACKDASH_SPEED;
    this.dash = { frames: f, total: f, speed: sp * dir };
    if (dir < 0) this.invuln = Math.max(this.invuln, 9);
    this.setAnim(dir > 0 ? 'dashF' : 'dashB');
    this.emit('dash', { dir });
  }

  startRoll(dir) {
    this.roll = { frames: ROLL_FRAMES, total: ROLL_FRAMES, speed: ROLL_SPEED * dir };
    this.invuln = Math.max(this.invuln, ROLL_INVULN[1]);
    this.setAnim('roll');
    this.emit('roll', { dir });
  }

  tryActivateMax(intent) {
    const threeButtons =
      (intent.pressed('LP') && intent.buttons.LK && intent.buttons.HP) ||
      (intent.pressed('LK') && intent.buttons.LP && intent.buttons.HP) ||
      (intent.pressed('HP') && intent.buttons.LP && intent.buttons.LK);
    if (!intent.pressed('MAX') && !threeButtons) return false;
    if (this.maxMode > 0 || this.stocks < 1) return false;
    this.spendStocks(1);
    this.maxMode = MAX_MODE_FRAMES;
    this.state = STATE.MAXACTIVATE;
    this.stateFrame = 0;
    this.vx = 0;
    this.emit('maxActivate');
    return true;
  }

  updateMaxActivate() {
    this.vx = 0;
    if (this.stateFrame >= this.maxActivateFrames) this.setState(STATE.IDLE);
  }

  /* ---------------------------------------------------------------- */
  findMove(intent, opp, match) {
    // a) Rekka / follow-up.
    if (this.move && this.move.chain) {
      const c = this.move.chain;
      if (this.moveFrame >= c.window[0] && this.moveFrame <= c.window[1] && this.anyPressed(intent, c.button)) {
        const next = this.moveById[c.to];
        if (next) return next;
      }
    }
    // b) Botón SUPER dedicado.
    if (intent.pressed('SUPER')) {
      for (const m of this.def.supers || []) if (this.canUse(m, intent, true)) return m;
    }
    // c) Supers por comando.
    for (const m of this.def.supers || []) {
      if (this.matchesInput(m, intent) && this.canUse(m, intent)) return m;
    }
    // d) Especiales por comando (el motion manda sobre los atajos).
    for (const m of this.def.specials || []) {
      if (m.input.rekka) continue;
      if (this.matchesInput(m, intent) && this.canUse(m, intent)) return m;
    }
    // e) Atajos SP1 / SP2 (controles modernos y táctil).
    if (intent.pressed('SP1') && this.def.specials[0] && this.canUse(this.def.specials[0], intent, true)) return this.def.specials[0];
    if (intent.pressed('SP2') && this.def.specials[1] && this.canUse(this.def.specials[1], intent, true)) return this.def.specials[1];
    // e) Normales.
    const btn = ['LP', 'LK', 'HP', 'HK'].find((b) => intent.pressed(b));
    if (btn) {
      const mv = selectNormal(this.moves, intent.dir, btn, this.airborne);
      if (mv && this.canUse(mv, intent)) return mv;
    }
    return null;
  }

  anyPressed(intent, button) {
    if (button === 'P') return intent.pressed('LP') || intent.pressed('HP');
    if (button === 'K') return intent.pressed('LK') || intent.pressed('HK');
    return intent.pressed(button);
  }

  matchesInput(m, intent) {
    const inp = m.input || {};
    if (inp.rekka) return false;
    if (inp.air && !this.airborne) return false;
    if (!inp.air && this.airborne) return false;
    if (inp.motion && !this.buffer.match(motion(inp.motion), intent.frame)) return false;
    if (inp.button === 'P+K') {
      const p = intent.pressed('LP') || intent.pressed('HP');
      const k = intent.pressed('LK') || intent.pressed('HK');
      if (!(p || k)) return false;
    } else if (inp.button && !this.anyPressed(intent, inp.button)) return false;
    return true;
  }

  canUse(m, intent, viaShortcut = false) {
    if (!viaShortcut && !this.matchesInput(m, intent)) return false;
    if (m.air && !this.airborne) return false;
    if (!m.air && this.airborne) return false;
    const cost = m.super ? m.super.cost : (m.meter ? m.meter.cost : 0);
    if (cost && this.stocks < cost) return false;
    return true;
  }

  /* ---------------------------------------------------------------- */
  startMove(m, intent, match) {
    const cost = m.super ? m.super.cost : (m.meter ? m.meter.cost : 0);
    if (cost && !this.spendStocks(cost)) return;
    const btn = ['LP', 'HP', 'LK', 'HK'].find((b) => intent.pressed(b));
    if (btn) this.lastButton = btn;

    this.state = STATE.ATTACK;
    this.stateFrame = 0;
    this.move = m;
    this.moveFrame = 0;
    this.hitDone = new Set();
    this.moveHitConnected = false;
    this.blocking = false;
    this.vx = 0;
    this.addMeter(m.meterGain || 0);

    if (m.super && m.super.flash) {
      this.superFlashLock = m.super.flash;
      match.startSuperFlash(this, m);
    }
    this.applyMotion(m, true);
    this.setAnim('attack');
    this.emit('moveStart', { move: m });
    if (m.tags && m.tags.includes('reversal')) this.emit('reversal', { move: m });
  }

  applyMotion(m, initial = false) {
    const mo = m.motion;
    if (!mo) return;
    const f = this.moveFrame;
    if (mo.type === 'lunge') {
      if (f >= mo.start && f < mo.start + mo.frames && !this.airborne) {
        const k = 1 - Math.abs((f - mo.start) / mo.frames - 0.5) * 0.6;
        this.vx = mo.speed * this.facing * k * this.speedMul;
      } else if (f >= mo.start + mo.frames) this.vx = 0;
    } else if (mo.type === 'rise' && initial) {
      this.airborne = true; this.gravityOn = true;
      this.vy = mo.vy; this.vx = (mo.vx || 0) * this.facing;
    } else if (mo.type === 'jump' && f === (mo.start || 0)) {
      this.airborne = true; this.gravityOn = true;
      this.vy = mo.vy; this.vx = (mo.vx || 0) * this.facing;
    } else if (mo.type === 'dive' && initial) {
      this.airborne = true; this.gravityOn = false;
      this.vy = mo.vy; this.vx = mo.vx * this.facing;
    }
  }

  updateAttack(intent, opp, match) {
    const m = this.move;
    if (this.superFlashLock > 0) return;   // congelación dramática del super
    this.moveFrame++;
    this.applyMotion(m);

    if (m.invuln) {
      const [a, b] = m.invuln;
      if (this.moveFrame >= a && this.moveFrame <= b) this.invuln = Math.max(this.invuln, 1);
    }
    if (m.armor) {
      if (this.moveFrame >= m.armor.from && this.moveFrame <= m.armor.to) this.armor = { hits: m.armor.hits };
      else this.armor = null;
    }
    if (m.teleport && this.moveFrame === m.teleport.frame) this.doTeleport(m.teleport, opp);

    if (m.projectile && m.projectile.frame !== undefined) {
      const p = m.projectile;
      const count = p.count || 1;
      const interval = p.interval || 0;
      for (let i = 0; i < count; i++) {
        if (this.moveFrame === p.frame + i * interval) match.spawnProjectile(this, m, i);
      }
    }
    if (m.buff && this.moveFrame === m.startup) {
      this.buffs.push({ ...m.buff });
      this.emit('buff', { buff: m.buff });
    }

    if (m.chain) {
      const c = m.chain;
      if (this.moveFrame >= c.window[0] && this.moveFrame <= c.window[1] && this.anyPressed(intent, c.button)) {
        const next = this.moveById[c.to];
        if (next) { this.startMove(next, intent, match); return; }
      }
    }

    const total = m.total || (m.startup + m.active + m.recovery);
    if (this.moveFrame >= total) {
      if (this.airborne) this.airAttackPending = true;
      else this.finishMove();
    }
  }

  finishMove() {
    this.state = STATE.IDLE;
    this.stateFrame = 0;
    this.move = null;
    this.moveFrame = 0;
    this.armor = null;
    this.airAttackPending = false;
  }

  doTeleport(t, opp) {
    const before = this.x;
    if (t.target === 'behind') {
      this.x = clamp(opp.x - this.facing * (t.offset || 1.1), -WALL_LIMIT, WALL_LIMIT);
      this.facing = -this.facing;
    } else if (t.target === 'swap') {
      const other = opp.x;
      this.x = clamp(other + this.facing * (t.offset || 1.2), -WALL_LIMIT, WALL_LIMIT);
      this.facing = -this.facing;
    } else {
      this.x = clamp(this.x + this.facing * (t.offset || 2), -WALL_LIMIT, WALL_LIMIT);
    }
    this.emit('teleport', { from: before, to: this.x });
  }

  /* ---------------------------------------------------------------- */
  tryThrow(opp, match) {
    const tm = this.moveById['throw'];
    if (!tm || !opp || opp.airborne || opp.state === STATE.KO) return false;
    if (Math.abs(opp.x - this.x) > (this.def.throwRange ?? THROW_RANGE)) return false;
    const vulnerable = opp.actionable || opp.blocking || opp.state === STATE.BLOCKSTUN ||
                       opp.state === STATE.WAKEUP || opp.state === STATE.DIZZY;
    if (!vulnerable) return false;
    this.startThrow(tm, opp, match);
    return true;
  }

  startThrow(move, target, match) {
    this.state = STATE.THROW;
    this.stateFrame = 0;
    this.move = move;
    this.moveFrame = 0;
    this.throwTarget = target;
    this.throwDamageDone = false;
    this.vx = 0;
    this.facing = target.x >= this.x ? 1 : -1;
    target.state = STATE.THROWN;
    target.stateFrame = 0;
    target.thrownBy = this;
    target.throwTimer = 0;
    target.techWindow = TECH_WINDOW;
    target.grabbed = true;
    target.blocking = false;
    target.vx = 0;
    target.x = this.x + this.facing * 0.9;
    this.emit('throwStart', { move });
  }

  updateThrowing(match) {
    const m = this.move;
    this.vx = 0;
    const damageFrame = (m.grab && m.grab.damageFrame) || (m.startup || 3) + 4;
    if (this.stateFrame === damageFrame && this.throwTarget && !this.throwDamageDone) {
      this.throwDamageDone = true;
      resolveThrow(this, this.throwTarget, m, match);
    }
    const total = m.total || (m.startup + m.active + m.recovery);
    if (this.stateFrame >= total) {
      this.state = STATE.IDLE;
      this.stateFrame = 0;
      this.throwTarget = null;
      this.move = null;
    }
  }

  updateThrown(intent) {
    this.throwTimer++;
    if (this.techWindow > 0) {
      this.techWindow--;
      if (intent.pressed('LP') || intent.pressed('LK') || intent.pressed('HP') || intent.pressed('HK')) {
        this.techPending = true;
        this.techThrow();     // rompe la animación al instante
        return;
      }
    }
    if (this.throwTimer > 46) {
      this.grabbed = false;
      this.state = STATE.KNOCKDOWN;
      this.stateFrame = 0;
      this.knockdownTimer = 40;
    }
  }

  techThrow() {
    const attacker = this.thrownBy;
    this.grabbed = false;
    this.state = STATE.IDLE;
    this.stateFrame = 0;
    this.invuln = 10;
    const dir = this.x >= attacker.x ? 1 : -1;
    this.x = clamp(this.x + dir * 1.5, -WALL_LIMIT, WALL_LIMIT);
    attacker.x = clamp(attacker.x - dir * 1.5, -WALL_LIMIT, WALL_LIMIT);
    attacker.state = STATE.IDLE;
    attacker.stateFrame = 0;
    attacker.throwTarget = null;
    attacker.move = null;
    attacker.vx = 0;
    this.addMeter(70);
    attacker.addMeter(20);
    this.emit('tech');
    attacker.emit('tech');
  }

  /* ---------------------------------------------------------------- */
  updateHitstun() {
    this.hitstun--;
    this.vx *= 0.9;
    if (this.hitstun <= 0) this.setState(STATE.IDLE);
  }

  updateAirhit() {
    this.hitstun--;
    if (this.y <= 0 && this.vy <= 0) {
      this.y = 0; this.vy = 0; this.vx = 0;
      this.airborne = false;
      this.juggle = 0;
      this.state = STATE.KNOCKDOWN;
      this.stateFrame = 0;
      this.knockdownTimer = 42;
      this.hitstun = 0;
      this.emit('land', { hard: true });
    }
  }

  updateKnockdown() {
    this.vx *= 0.85;
    if (this.stateFrame >= this.knockdownTimer) {
      this.state = STATE.WAKEUP;
      this.stateFrame = 0;
      this.invuln = WAKEUP_INVULN;
    }
  }

  updateWakeup() {
    this.vx = 0;
    if (this.stateFrame >= 12) this.setState(STATE.IDLE);
  }

  updateBlockstun(intent) {
    this.blockstun--;
    this.vx *= 0.88;
    // Guard Cancel Roll (KOF98): cuesta 1 stock mientras bloqueas.
    const gcBtn = intent.pressed('GC') ||
      (intent.pressed('LP') && intent.buttons.LK) ||
      (intent.pressed('LK') && intent.buttons.LP);
    if (gcBtn && this.stocks >= 1) {
      this.spendStocks(1);
      this.state = STATE.IDLE;
      this.stateFrame = 0;
      this.blockstun = 0;
      this.blocking = false;
      this.startRoll(-this.facing);
      this.emit('guardCancelRoll');
      return;
    }
    // Red parry (SF3): ventana muy estrecha durante el blockstun.
    if (this.parryCooldown <= 0 && intent.freshDir && (intent.dir === 6 || intent.dir === 2)) {
      this.parryActive = 3;
      this.parryDir = intent.dir === 6 ? 'high' : 'low';
      this.parryFlash = 6;
      this.emit('redParry');
    }
    if (this.blockstun <= 0) this.setState(STATE.IDLE);
  }

  updateDizzy(intent) {
    this.dizzyTimer--;
    if (intent.pressed('LP') || intent.pressed('LK') || intent.pressed('HP') ||
        intent.pressed('HK') || intent.freshDir) {
      this.dizzyTimer -= 3;
    }
    if (this.dizzyTimer <= 0) {
      this.stun = 0;
      this.setState(STATE.IDLE);
    }
  }

  updateGuardCrush() {
    this.guardCrushTimer--;
    if (this.guardCrushTimer <= 0) { this.guard = 0; this.setState(STATE.IDLE); }
  }

  updateKO() {
    this.vx *= 0.9;
    if (this.airborne && this.y <= 0 && this.vy <= 0) {
      this.y = 0; this.airborne = false; this.vy = 0; this.vx = 0;
      this.emit('land', { hard: true });
    }
  }

  tickDot() {
    const d = this.dot;
    d.timer--; d.tick--;
    if (d.tick <= 0) {
      d.tick = d.interval;
      const before = this.health;
      this.health = Math.max(0, this.health - d.damage);
      this.hitFlash = 4;
      this.emit('dot', { damage: before - this.health });
    }
    if (d.timer <= 0) this.dot = null;
  }

  setState(s) {
    if (this.state !== s) { this.state = s; this.stateFrame = 0; }
  }

  /* ---------------------------------------------------------------- */
  applyPhysics(match) {
    if (this.airborne) {
      if (this.gravityOn !== false) this.vy -= GRAVITY;
      this.y += this.vy;
      this.x += this.vx;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0; this.vx = 0;
        this.airborne = false;
        this.gravityOn = true;
        this.juggle = 0;
        if (this.state === STATE.ATTACK) {
          this.landingLag = this.move && this.move.air ? 8 : 6;
          this.finishMove();
        } else if (this.state === STATE.IDLE) {
          this.landingLag = 3;
        } else if (this.state === STATE.BLOCKSTUN) {
          this.state = STATE.IDLE;
          this.stateFrame = 0;
          this.blockstun = 0;
        }
        if (this.state !== STATE.KO) this.emit('land');
      }
    } else {
      this.x += this.vx;
      if (this.state !== STATE.IDLE && this.state !== STATE.ATTACK) this.vx *= 0.82;
    }
    if (this.dash) {
      this.dash.frames--;
      this.x += this.dash.speed * (0.35 + 0.65 * (this.dash.frames / this.dash.total));
      if (this.dash.frames <= 0) this.dash = null;
    }
    if (this.roll) {
      this.roll.frames--;
      this.x += this.roll.speed;
      if (this.roll.frames <= 0) { this.roll = null; this.invuln = 0; }
    }
    this.x = clamp(this.x, -WALL_LIMIT, WALL_LIMIT);
    this.cornered = Math.abs(this.x) >= WALL_LIMIT - 0.01;
  }

  /* ---------------------------------------------------------------- */
  setAnim(pose) { this.animPose = pose; }

  updateAnim() {
    const a = this.anim;
    a.move = this.move;
    a.t = this.stateFrame;
    if (this.state === STATE.ATTACK && this.move) {
      const m = this.move;
      a.state = 'attack';
      a.pose = m.pose || 'jab';
      a.phase = this.moveFrame < m.startup ? 'startup'
        : this.moveFrame < m.startup + m.active ? 'active' : 'recovery';
      a.frame = this.moveFrame;
      return;
    }
    const map = {
      [STATE.IDLE]: this.airborne ? (this.vy > 0 ? 'jump' : 'fall') : (this.animPose || 'idle'),
      [STATE.BLOCKSTUN]: this.crouching ? 'blockLow' : 'blockHigh',
      [STATE.HITSTUN]: this.crouching ? 'hitLow' : 'hitHigh',
      [STATE.AIRHIT]: 'launched',
      [STATE.KNOCKDOWN]: 'knockdown',
      [STATE.WAKEUP]: 'getup',
      [STATE.DIZZY]: 'dizzy',
      [STATE.GUARDCRUSH]: 'guardcrush',
      [STATE.THROW]: 'grab',
      [STATE.THROWN]: 'thrown',
      [STATE.MAXACTIVATE]: 'maxactivate',
      [STATE.KO]: 'ko',
      [STATE.WIN]: 'win',
      [STATE.INTRO]: 'intro'
    };
    a.state = this.state;
    a.pose = map[this.state] || 'idle';
    a.phase = 'idle';
    a.frame = this.stateFrame;
    if (this.blocking && this.state === STATE.IDLE) a.pose = this.crouching ? 'blockLow' : 'blockHigh';
    if (this.parryActive > 0) a.pose = 'parry';
  }

  /* ---------------------------------------------------------------- */
  activeHitboxes() {
    if (this.state !== STATE.ATTACK || !this.move || this.superFlashLock > 0) return [];
    const m = this.move;
    if (this.moveFrame < m.startup) return [];
    const local = this.moveFrame - m.startup;
    if (local >= m.active) return [];
    const out = [];
    for (const h of m.hits || []) {
      if (local >= (h.from || 0) && local <= (h.to ?? 999)) {
        const key = h.id || `${h.from}-${h.box.x}-${h.box.y}`;
        if (this.hitDone.has(key)) continue;
        out.push({ move: m, hit: h, key, box: this.worldBox(h.box) });
      }
    }
    return out;
  }

  activeGrab() {
    if (this.state !== STATE.ATTACK || !this.move || this.superFlashLock > 0) return null;
    const m = this.move;
    if (!m.grab || m.kind !== 'grab') return null;
    if (this.moveFrame < m.startup || this.moveFrame >= m.startup + m.active) return null;
    if (this.hitDone.has('grab')) return null;
    return m;
  }

  activeCounter() {
    if (this.state !== STATE.ATTACK || !this.move || !this.move.counter) return null;
    const c = this.move.counter;
    if (this.moveFrame < this.move.startup + (c.from || 0)) return null;
    if (this.moveFrame > this.move.startup + (c.to ?? 999)) return null;
    return c;
  }
}

/* ------------------------------------------------------------------ */
/* Resolución de impactos                                              */
/* ------------------------------------------------------------------ */

export function boxesOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function parryMatches(defender, h) {
  if (!defender.parryActive || !defender.parryDir) return false;
  if (h.unblockable) return false;
  if (defender.airborne) return true;
  if (defender.parryDir === 'low') return !!h.low;
  return !h.low;
}

function canBlock(defender, h) {
  if (h.unblockable) return false;
  if (!defender.blocking) return false;
  if (defender.airborne) return true;
  if (h.low && defender.blockType !== 'low') return false;
  if (h.overhead && defender.blockType === 'low') return false;
  return true;
}

export function scaleFor(comboIndex) {
  const i = Math.min(comboIndex, COMBO_SCALING.length - 1);
  return Math.max(MIN_SCALING, COMBO_SCALING[i]);
}

export function applyHit(attacker, defender, h, move, match, opts = {}) {
  if (defender.dead || defender.state === STATE.KO) return null;
  if (defender.invuln > 0 && !opts.ignoreInvuln) return null;
  if (defender.state === STATE.THROWN) return null;
  if (!opts.ignoreJuggle && defender.airborne && defender.juggle <= 0) {
    attacker.comboDropped = true;
    return null;
  }
  const lvlData = LEVEL_DATA[h.level] || LEVEL_DATA.M;

  if (!opts.noParry && parryMatches(defender, h)) {
    doParry(attacker, defender, h, move, match, opts);
    return { result: 'parry' };
  }
  if (defender.armor && defender.armor.hits > 0 && !h.unblockable) {
    defender.armor.hits--;
    if (defender.armor.hits <= 0) defender.armor = null;
    defender.hitFlash = 8;
    defender.addMeter(30);
    match.hitstop = Math.max(match.hitstop, 6);
    attacker.hitDone.add(opts.hitKey);
    defender.emit('armor');
    return { result: 'armor' };
  }
  if (canBlock(defender, h)) return doBlock(attacker, defender, h, move, match, opts);

  const counterHit = defender.state === STATE.ATTACK && defender.move &&
                     defender.moveFrame < defender.move.startup;
  return doDamage(attacker, defender, h, move, match, { ...opts, counterHit });
}

function doParry(attacker, defender, h, move, match, opts) {
  defender.parryActive = 0;
  defender.parryCooldown = 0;
  defender.parryDir = null;
  defender.addMeter(PARRY_METER);
  attacker.addMeter(18);
  const extra = PARRY_EXTRA_FREEZE[move.level] ?? 0;
  match.hitstop = Math.max(match.hitstop, PARRY_FREEZE + extra);
  match.parryFreeze = true;
  defender.parryFlash = 14;
  attacker.hitDone.add(opts.hitKey);
  if (defender.airborne) defender.juggle = JUGGLE_POINTS;
  defender.emit('parry');
  attacker.emit('parried');
}

function doBlock(attacker, defender, h, move, match, opts) {
  const lvl = h.level || 'M';
  const isSpecial = lvl === 'SP' || lvl === 'SU';
  let chip = 0;
  if (isSpecial) {
    chip = Math.max(4, Math.round(h.damage * (lvl === 'SU' ? CHIP_SUPER : CHIP_SPECIAL)));
    if (lvl !== 'SU' && defender.health - chip <= 0) chip = Math.max(0, defender.health - 1);
  }
  defender.health = Math.max(0, defender.health - chip);
  const blockstun = h.blockstun ?? (LEVEL_DATA[lvl]?.blockstun ?? 12);
  defender.blockstun = Math.max(defender.blockstun, blockstun);
  defender.state = STATE.BLOCKSTUN;
  defender.stateFrame = 0;
  defender.blockFlash = 8;
  defender.vx = -defender.facing * ((h.push ?? 0.08) * 1.35);
  attacker.vx = -attacker.facing * 0.025;
  defender.guard += blockstun * 0.9 * (lvl === 'SU' ? 1.6 : 1);
  defender.addMeter(blockstun * METER_ON_BLOCK * 0.55 + chip * 0.5);
  attacker.addMeter(METER_ON_BLOCK_NORMAL);
  match.hitstop = Math.max(match.hitstop, Math.max(4, (h.hitstop ?? lvlDataHitstop(lvl)) - 3));
  attacker.hitDone.add(opts.hitKey);
  if (move.cancel) attacker.cancelWindowLeft = Math.max(attacker.cancelWindowLeft, move.cancelWindow);
  attacker.moveHitConnected = true;
  defender.emit('block', { chip, level: lvl });

  if (defender.health <= 0) {
    defender.dead = true;
    defender.state = STATE.KO;
    defender.stateFrame = 0;
    match.onKO(defender, attacker);
    return { result: 'block', chip };
  }
  if (defender.guard >= MAX_GUARD) {
    defender.state = STATE.GUARDCRUSH;
    defender.stateFrame = 0;
    defender.guardCrushTimer = GUARD_CRUSH_FRAMES;
    defender.guard = MAX_GUARD;
    defender.blockstun = 0;
    defender.emit('guardCrush');
  }
  return { result: 'block', chip };
}

const lvlDataHitstop = (lvl) => (LEVEL_DATA[lvl] ? LEVEL_DATA[lvl].hitstop : 8);

function doDamage(attacker, defender, h, move, match, opts) {
  const lvl = h.level || 'M';
  const lvlData = LEVEL_DATA[lvl] || LEVEL_DATA.M;

  const inCombo = defender.state === STATE.HITSTUN || defender.state === STATE.AIRHIT ||
                  (defender.airborne && defender.state !== STATE.IDLE);
  if (!inCombo) attacker.combo = { count: 0, damage: 0, active: true, lastMove: move, maxCount: 0 };
  attacker.combo.count++;
  attacker.combo.maxCount = Math.max(attacker.combo.maxCount, attacker.combo.count);

  const scale = scaleFor(attacker.combo.count - 1);
  let dmg = h.damage * scale;
  if (lvl !== 'SU') dmg *= attacker.damageMul;
  dmg /= (defender.stats.defense || 1);
  if (opts.counterHit) dmg *= 1.25;
  dmg = Math.max(1, Math.round(dmg));

  defender.health = Math.max(0, defender.health - dmg);
  attacker.combo.damage += dmg;
  attacker.combo.lastMove = move;

  defender.stun += (h.stun ?? lvlData.stun) * (opts.counterHit ? 1.3 : 1);
  defender.stunDecayLock = 60;

  const hitstop = h.hitstop ?? lvlData.hitstop;
  match.hitstop = Math.max(match.hitstop, hitstop);
  const hitstun = h.hitstun ?? lvlData.hitstun;
  defender.hitFlash = 10;
  attacker.hitDone.add(opts.hitKey);
  attacker.moveHitConnected = true;

  attacker.addMeter(dmg * METER_ON_DAMAGE_DEALT + (move.category === 'normal' ? METER_ON_HIT_NORMAL : 0));
  defender.addMeter(dmg * METER_ON_DAMAGE_TAKEN);

  if (h.dot) {
    defender.dot = {
      damage: h.dot.damage, frames: h.dot.frames, interval: h.dot.interval,
      timer: h.dot.frames, tick: h.dot.interval
    };
  }

  const dir = attacker.facing;
  if (h.launch) {
    defender.airborne = true;
    defender.gravityOn = true;
    defender.vy = h.launch.y;
    defender.vx = h.launch.x * dir * (attacker.maxMode > 0 ? 1.2 : 1);
    defender.juggle = defender.juggle > 0 ? defender.juggle - (h.juggle || 1) : JUGGLE_POINTS - (h.juggle || 1);
    defender.state = STATE.AIRHIT;
    defender.stateFrame = 0;
    defender.hitstun = Math.max(hitstun, 26);
    defender.crouching = false;
  } else if (h.crumple) {
    defender.state = STATE.DIZZY;
    defender.stateFrame = 0;
    defender.dizzyTimer = 70;
    defender.vx = 0;
  } else if (h.knockdown) {
    defender.state = STATE.AIRHIT;
    defender.airborne = true;
    defender.gravityOn = true;
    defender.vy = 0.15;
    defender.vx = dir * 0.085;
    defender.hitstun = 30;
  } else {
    defender.state = STATE.HITSTUN;
    defender.stateFrame = 0;
    defender.hitstun = hitstun;
    defender.vx = -dir * (h.push ?? lvlData.push);
  }
  defender.blocking = false;
  defender.move = null;
  defender.moveFrame = 0;
  defender.armor = null;
  defender.parryActive = 0;
  defender.parryDir = null;

  if (move.cancel) attacker.cancelWindowLeft = Math.max(attacker.cancelWindowLeft, move.cancelWindow);

  defender.emit('hit', { damage: dmg, level: lvl, counter: !!opts.counterHit });
  attacker.emit('hitLanded', { damage: dmg });

  if (defender.health <= 0) {
    defender.dead = true;
    defender.state = STATE.KO;
    defender.stateFrame = 0;
    defender.airborne = true;
    defender.gravityOn = true;
    defender.vy = 0.21;
    defender.vx = -dir * 0.11;
    match.onKO(defender, attacker);
  } else if (defender.stun >= MAX_STUN && defender.state !== STATE.DIZZY) {
    defender.state = STATE.DIZZY;
    defender.stateFrame = 0;
    defender.dizzyTimer = DIZZY_FRAMES;
    defender.emit('dizzy');
  }
  return { result: opts.counterHit ? 'counter' : 'hit', damage: dmg };
}

export function resolveThrow(attacker, defender, move, match) {
  const g = move.grab;
  attacker.hitDone.add('grab');
  if (defender.techPending) {           // escapó dentro de la ventana
    defender.techPending = false;
    defender.techThrow();
    return;
  }
  let dmg = g.damage / (defender.stats.defense || 1);
  if (attacker.maxMode > 0) dmg *= MAX_MODE_DAMAGE_MUL;
  dmg = Math.round(dmg);
  defender.health = Math.max(0, defender.health - dmg);
  attacker.addMeter(dmg * METER_ON_DAMAGE_DEALT + 20);
  defender.addMeter(dmg * METER_ON_DAMAGE_TAKEN);
  defender.stun += 12;
  defender.stunDecayLock = 60;
  match.hitstop = Math.max(match.hitstop, g.cinematic ? 26 : 12);
  defender.hitFlash = 14;
  defender.state = STATE.AIRHIT;
  defender.stateFrame = 0;
  defender.airborne = true;
  defender.gravityOn = true;
  defender.vy = 0.22;
  defender.vx = attacker.facing * 0.1;
  defender.hitstun = g.hitstun || 40;
  defender.grabbed = false;
  defender.thrownBy = null;
  defender.juggle = 0;
  attacker.combo = { count: 1, damage: dmg, active: true, lastMove: move, maxCount: 1 };
  defender.emit('thrown', { damage: dmg });
  attacker.emit('throwHit', { damage: dmg });
  if (defender.health <= 0) {
    defender.dead = true;
    defender.state = STATE.KO;
    defender.stateFrame = 0;
    defender.vy = 0.2;
    match.onKO(defender, attacker);
  }
}

/** Empuje entre cuerpos: los luchadores no se atraviesan. */
export function separateFighters(a, b) {
  const minDist = (a.pushbox.half + b.pushbox.half) * 0.98;
  const d = b.x - a.x;
  const abs = Math.abs(d);
  if (abs >= minDist) return;
  const push = (minDist - abs) / 2;
  const dir = d >= 0 ? 1 : -1;
  const na = a.x - dir * push;
  const nb = b.x + dir * push;
  const aOk = na > -WALL_LIMIT && na < WALL_LIMIT;
  const bOk = nb > -WALL_LIMIT && nb < WALL_LIMIT;
  if (aOk && bOk) { a.x = na; b.x = nb; }
  else if (bOk) b.x = clamp(b.x + dir * push * 2, -WALL_LIMIT, WALL_LIMIT);
  else if (aOk) a.x = clamp(a.x - dir * push * 2, -WALL_LIMIT, WALL_LIMIT);
  a.x = clamp(a.x, -WALL_LIMIT, WALL_LIMIT);
  b.x = clamp(b.x, -WALL_LIMIT, WALL_LIMIT);
}

/**
 * FABATER FIGHTER — punto de entrada.
 *
 * Bucle a 60 FPS lógicos (frame data exacta) con render desacoplado.
 */

import { ROSTER } from './data/roster.js';
import { Fighter } from './game/fighter.js';
import { Match } from './game/match.js';
import { AI } from './game/ai.js';
import { KeyboardInput, GamepadInput, CompositeInput } from './game/input.js';
import { GameView } from './render/renderer.js';
import { STAGE_THEMES } from './render/stage.js';
import { HUD } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { sfx } from './audio/sfx.js';

const STEP = 1000 / 60;

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.view = new GameView(this.canvas, { debug: false });
    this.hud = new HUD(document.getElementById('hud-layer'));
    this.state = 'boot';
    this.mode = 'cpu';
    this.match = null;
    this.ais = [null, null];
    this.paused = false;
    this.slowmoScale = 1;
    this.touchState = {};
    this.resultShown = false;

    this.p1Input = new CompositeInput();
    this.p2Input = new CompositeInput();
    this.kb1 = new KeyboardInput('p1');
    this.kb2 = new KeyboardInput('p2');
    this.kb1.attach();
    this.kb2.attach();
    this.p1Input.add(this.kb1).add(new GamepadInput(0)).add({ read: () => this.touchState });
    this.p2Input.add(this.kb2).add(new GamepadInput(1));

    this.screens = new Screens(document.getElementById('screen-layer'), {
      onStart: (a, b, mode) => this.startFight(a, b, mode),
      onResume: () => this.setPaused(false),
      onRestart: () => this.startFight(this.defs[0], this.defs[1], this.mode),
      onRematch: () => this.startFight(this.defs[0], this.defs[1], this.mode),
      onQuit: () => this.toTitle(),
      onEvent: null
    });

    this.bindKeys();
    this.bindTouch();
    this.bindResize();

    this.demoRigs();
    this.hud.show(false);

    // Arranque
    requestAnimationFrame((t) => {
      this.last = t;
      this.loop(t);
    });
    setTimeout(() => {
      document.getElementById('boot').classList.add('gone');
      this.screens.show('title');
      this.state = 'title';
    }, 600);
  }

  /* ---------------------------------------------------------------- */
  bindResize() {
    const doResize = () => this.view.resize();
    window.addEventListener('resize', doResize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(doResize).observe(this.canvas);
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      sfx.resume();
      if (e.code === 'F1') {
        e.preventDefault();
        if (this.screens.current === 'moves') {
          this.screens.show(this.paused ? 'pause' : (this.state === 'fight' ? null : this.prevScreen || 'title'));
        } else {
          this.prevScreen = this.screens.current || 'title';
          this.screens.prev = this.prevScreen;
          this.screens.show('moves');
        }
        return;
      }
      if (e.code === 'F2') {
        e.preventDefault();
        this.view.debugBoxes = this.view.debugBoxes || this.view.makeDebugBoxes();
        for (const k in this.view.debugBoxes) {
          for (const m of this.view.debugBoxes[k]) m.visible = !m.visible;
        }
        this.debugOn = !this.debugOn;
        if (!this.debugOn) for (const k in this.view.debugBoxes) for (const m of this.view.debugBoxes[k]) m.visible = false;
        return;
      }
      if (e.code === 'Escape') {
        if (this.state === 'fight') this.setPaused(!this.paused);
        else if (this.screens.current === 'moves' || this.screens.current === 'controls') this.screens.action('back');
        return;
      }
      if (this.screens.current === 'title') {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') this.screens.action('cpu');
        return;
      }
      if (this.screens.current === 'select') {
        const P1 = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', ok: 'KeyJ' };
        const P2 = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', ok: 'Numpad1' };
        if (e.code === P1.left) this.screens.moveCursor(0, -1, 0);
        if (e.code === P1.right) this.screens.moveCursor(0, 1, 0);
        if (e.code === P1.up) this.screens.moveCursor(0, 0, -1);
        if (e.code === P1.down) this.screens.moveCursor(0, 0, 1);
        if (e.code === P1.ok) this.screens.confirm(0);
        if (this.mode === '2p') {
          if (e.code === P2.left) this.screens.moveCursor(1, -1, 0);
          if (e.code === P2.right) this.screens.moveCursor(1, 1, 0);
          if (e.code === P2.up) this.screens.moveCursor(1, 0, -1);
          if (e.code === P2.down) this.screens.moveCursor(1, 0, 1);
          if (e.code === P2.ok || e.code === 'Digit7') this.screens.confirm(1);
        }
        if (e.code === 'Enter') this.screens.confirm(this.screens.locked[0] ? 1 : 0);
      }
    });
  }

  bindTouch() {
    const layer = document.getElementById('touch');
    if (!('ontouchstart' in window)) { layer.classList.add('hidden'); return; }
    layer.classList.remove('hidden');
    const setKey = (k, v) => { this.touchState[k] = v; };
    layer.querySelectorAll('.tbtn').forEach((btn) => {
      const k = btn.dataset.k;
      const on = (e) => { e.preventDefault(); sfx.resume(); setKey(k, true); };
      const off = (e) => { e.preventDefault(); setKey(k, false); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  }

  /* ---------------------------------------------------------------- */
  demoRigs() {
    const a = ROSTER[Math.floor(Math.random() * ROSTER.length)];
    let b = ROSTER[Math.floor(Math.random() * ROSTER.length)];
    if (b === a) b = ROSTER[(ROSTER.indexOf(a) + 1) % ROSTER.length];
    this.view.setFighters([a, b]);
    const f1 = new Fighter(a, 0, 1);
    const f2 = new Fighter(b, 1, -1);
    f1.x = -2.2; f2.x = 2.2;
    f1.updateAnim(); f2.updateAnim();
    this.demo = { fighters: [f1, f2], projectiles: [], shake: 0, slowmo: 0, hitstop: 0, superFlash: null, opts: { rounds: 2 } };
  }

  toTitle() {
    this.state = 'title';
    this.match = null;
    this.paused = false;
    this.hud.show(false);
    this.demoRigs();
    this.screens.show('title');
  }

  startFight(def1, def2, mode) {
    sfx.resume();
    this.defs = [def1, def2];
    this.mode = mode;
    this.resultShown = false;
    const f1 = new Fighter(def1, 0, 1);
    const f2 = new Fighter(def2, 1, -1);
    this.match = new Match(f1, f2, {
      training: mode === 'training',
      onEvent: () => {}
    });
    this.ais = [
      null,
      mode === 'cpu' || mode === 'training' ? new AI(f2, f1, mode === 'training' ? 2 : 3) : null
    ];
    if (this.ais[1]) this.ais[1].match = this.match;
    // Escenario aleatorio por combate (el templo, la ciudad o la playa)
    this.view.setStage(STAGE_THEMES[Math.floor(Math.random() * STAGE_THEMES.length)]);
    this.view.setFighters([def1, def2]);
    this.view.fx.clear();
    this.hud.setNames(f1, f2);
    this.hud.show(true);
    this.hud.clearAnnounce();
    this.paused = false;
    this.state = 'fight';
    this.screens.hide();
    document.getElementById('hud-layer').style.display = '';
  }

  setPaused(v) {
    this.paused = v;
    if (v) this.screens.show('pause');
    else this.screens.hide();
  }

  /* ---------------------------------------------------------------- */
  tick() {
    if (this.state !== 'fight' || !this.match) return;
    if (this.paused) return;

    const in1 = this.p1Input.read();
    const in2 = this.ais[1] ? this.ais[1].think() : this.p2Input.read();

    this.match.step(in1, in2);

    // Eventos -> FX / HUD / sonido
    for (const e of this.match.events) {
      this.view.handleEvent(e, this.match);
      this.playSfx(e);
    }

    if (this.match.over && !this.resultShown) {
      this.resultShown = true;
      const ended = this.match;
      setTimeout(() => {
        // Puede que ya estemos en otro combate o en el menú: no tocar nada.
        if (this.state !== 'fight' || this.match !== ended) return;
        const w = ended.winnerIndex >= 0 ? ended.fighters[ended.winnerIndex] : null;
        this.screens.showResults(w, ended, this.mode);
        this.state = 'results';
      }, 2200);
    }
  }

  playSfx(e) {
    switch (e.type) {
      case 'hit': sfx.play(e.damage > 55 ? 'hitH' : 'hitL', { vol: 0.9 }); break;
      case 'counter': sfx.play('counter'); break;
      case 'block': sfx.play('block'); break;
      case 'parry':
      case 'parryProjectile': sfx.play('parry'); this.flash(); break;
      case 'projectileSpawn': {
        const map = { orb: 'fire', flame: 'flame', blade: 'blade', bolt: 'zap', beam: 'beam', kunai: 'kunai' };
        sfx.play(map[e.fx] || 'fire');
        break;
      }
      case 'projectileHit': sfx.play('hitL', { vol: 0.7 }); break;
      case 'superFlash': sfx.play('super'); this.flash(); break;
      case 'maxActivate': sfx.play('max'); this.flash(); break;
      case 'ko': sfx.play('ko'); break;
      case 'jump': sfx.play('jump', { vol: 0.6 }); break;
      case 'land': if (e.hard) sfx.play('land'); break;
      case 'dash': case 'roll': sfx.play('dash', { vol: 0.6 }); break;
      case 'guardCrush': sfx.play('guardCrush'); this.flash(); break;
      case 'throwStart': sfx.play('whoosh', { vol: 0.8 }); break;
      case 'throwHit': case 'thrown': sfx.play('throw'); break;
      case 'moveStart': if (e.move && e.move.level !== 'L') sfx.play('whoosh', { vol: 0.45 }); break;
      case 'roundStart': sfx.play('bell'); break;
      default: break;
    }
  }

  flash() {
    let f = document.querySelector('.flash');
    if (!f) {
      f = document.createElement('div');
      f.className = 'flash';
      document.getElementById('fx-layer').appendChild(f);
    }
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  /* ---------------------------------------------------------------- */
  stop() { this.stopped = true; }

  loop(now) {
    if (this.stopped) return;
    const dt = Math.min(120, now - (this.last || now));
    this.last = now;
    this.acc = (this.acc || 0) + dt;

    // Slow-motion en el KO
    const scale = this.match && this.match.slowmo > 0 ? 0.45 : 1;
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      if (scale === 1 || (steps % 2 === 0)) this.tick();
      this.acc -= STEP * (scale === 1 ? 1 : 0.5);
      steps++;
    }

    // Animación de fondo en menús
    if (this.state !== 'fight') {
      const m = this.demo;
      if (m) for (const f of m.fighters) { f.stateFrame++; f.updateAnim(); }
      this.view.frame(m, dt / 1000);
      // En la selección, muestra los luchadores elegidos
      if (this.screens.current === 'select') {
        const a = ROSTER[this.screens.sel[0]];
        const b = ROSTER[this.screens.sel[1]];
        if (this._lastSel !== a.id + b.id) {
          this._lastSel = a.id + b.id;
          this.view.setFighters([a, b]);
          const f1 = new Fighter(a, 0, 1), f2 = new Fighter(b, 1, -1);
          f1.x = -2.2; f2.x = 2.2;
          f1.updateAnim(); f2.updateAnim();
          this.demo.fighters = [f1, f2];
        }
      }
    } else {
      this.view.frame(this.match, dt / 1000);
      this.hud.update(this.match, dt / 1000);
      if (this.match.announce && this.match.announce.timer > 0) this.match.announce.timer--;
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

/* ------------------------------------------------------------------ */
function boot() {
  const vig = document.createElement('div');
  vig.className = 'vignette';
  document.getElementById('fx-layer').appendChild(vig);
  window.game = new Game();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

/* Cyber Fist. El reloj es de segundos reales: el salto y el paso son los de antes,
   expresados en px/s para que un monitor a 120 Hz no acelere la pelea.
   Los niveles de IA viven en AI_LEVELS: añadir uno es añadir una ficha. */
(function () {
  const HZ = 60;
  const STEP = 1 / HZ;
  const sec = (frames) => frames / HZ;
  const spd = (pxPerFrame) => pxPerFrame * HZ;
  const acc = (pxPerFrame) => pxPerFrame * HZ * HZ;

  const FLOOR = 408;
  const WALL_L = 452;
  const WALL_R = 892;
  const SCALE = 0.5;
  const PIVOT_X = 175;
  const PIVOT_Y = 324;
  const CELL_W = 350;
  const CELL_H = 332;
  const CAM = { x: 352, y: 149, w: 640, h: 360 };
  const MAX_HP = 700;
  const ROUND_TIME = 60;
  const WALK_F = spd(2.85);
  const WALK_B = spd(2.15);
  const DASH_V = spd(6.2);
  const JUMP_V = spd(-9.3);
  const JUMP_G = acc(0.42);
  const AIR_A = acc(0.06);
  const AIR_MAX = spd(3.1);
  const JUMP_X = spd(2.3);
  const BOLT_V = spd(5.4);
  const KB_DECAY = 0.86;

  const MOVES = {
    punch_weak: {
      anim: 'punch_weak', active: [1], damage: 28, stun: sec(12), block: sec(7),
      weight: 1, slide: spd(2.15), stop: sec(6), shake: 2.2, level: 'mid',
      box: { x: 16, y: -90, w: 38, h: 22 }
    },
    punch_strong: {
      anim: 'punch_strong', active: [2, 3], damage: 68, stun: sec(20), block: sec(11),
      weight: 3, slide: spd(4.6), stop: sec(12), shake: 6.2, level: 'mid',
      box: { x: 18, y: -92, w: 54, h: 26 }
    },
    kick_weak_stand: {
      anim: 'kick_weak_stand', active: [1], damage: 36, stun: sec(14), block: sec(8),
      weight: 2, slide: spd(3.0), stop: sec(8), shake: 3.6, level: 'mid',
      box: { x: 18, y: -64, w: 52, h: 24 }
    },
    kick_weak: {
      anim: 'kick_weak', active: [1], damage: 52, stun: sec(10), block: sec(10),
      weight: 3, slide: spd(3.4), stop: sec(10), shake: 5.2, level: 'low', knockdown: true,
      box: { x: 12, y: -30, w: 66, h: 22 }
    },
    kick_strong: {
      anim: 'kick_strong', active: [2, 3], damage: 82, stun: sec(22), block: sec(12),
      weight: 4, slide: spd(5.8), stop: sec(14), shake: 7.4, level: 'mid',
      box: { x: 20, y: -108, w: 68, h: 30 }
    },
    crouch_punch: {
      anim: 'crouch_punch', active: [1], damage: 24, stun: sec(13), block: sec(7),
      weight: 1, slide: spd(1.9), stop: sec(6), shake: 2, level: 'low',
      box: { x: 14, y: -42, w: 42, h: 18 }
    },
    jump_kick: {
      anim: 'jump_kick', active: [1], damage: 58, stun: sec(16), block: sec(10),
      weight: 3, slide: spd(3.2), stop: sec(11), shake: 5.6, level: 'overhead',
      box: { x: 14, y: -58, w: 58, h: 26 }
    },
    uppercut: {
      anim: 'uppercut', active: [1, 2], damage: 90, stun: sec(8), block: sec(12),
      weight: 4, slide: spd(2.4), stop: sec(15), shake: 8, level: 'mid', launch: true,
      box: { x: 2, y: -128, w: 42, h: 86 }
    },
    spinkick: {
      anim: 'spinkick', active: [2, 3, 4], damage: 102, stun: sec(8), block: sec(14),
      weight: 5, slide: spd(6.6), stop: sec(16), shake: 9, level: 'mid', knockdown: true,
      box: { x: 6, y: -98, w: 72, h: 42 }
    },
    rayo_throw: {
      anim: 'rayo_throw', active: [], damage: 0, stun: 0, block: 0,
      weight: 1, slide: 0, stop: 0, shake: 0, level: 'mid', spawn: 2, box: null
    }
  };

  const AI_LEVELS = {
    facil: {
      id: 'facil', name: 'Fácil',
      line: 'Se queda, se acerca poco y solo tira golpes leves.',
      think: [1.35, 2.4], engage: 246, step: 0.3, range: 104,
      light: 0.36, heavy: 0, special: 0, block: 0.05, blockTime: 0.22,
      jump: 0, retreat: 0, punish: 0
    },
    normal: {
      id: 'normal', name: 'Normal',
      line: 'Camina al rival, bloquea a ratos y mete algún fuerte.',
      think: [0.55, 1.05], engage: 186, step: 0.46, range: 116,
      light: 0.46, heavy: 0.22, special: 0.06, block: 0.3, blockTime: 0.28,
      jump: 0.07, retreat: 0.1, punish: 0
    },
    dificil: {
      id: 'dificil', name: 'Difícil',
      line: 'Cierra, bloquea y usa el rayo y los especiales.',
      think: [0.28, 0.52], engage: 148, step: 0.55, range: 130,
      light: 0.34, heavy: 0.32, special: 0.16, block: 0.52, blockTime: 0.34,
      jump: 0.1, retreat: 0.14, punish: 0.42
    }
  };
  const LEVEL_ORDER = ['facil', 'normal', 'dificil'];

  const P1K = {
    left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
    lp: 'KeyF', hp: 'KeyG', lk: 'KeyR', hk: 'KeyT'
  };
  const P2K = {
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    lp: 'KeyK', hp: 'KeyL', lk: 'KeyO', hk: 'KeyP'
  };
  const MENU_ACTS = ['fight', 'train', 'versus', 'music'];

  const down = new Set();
  const pressed = new Set();
  const holdKeys = new Set([
    'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Space', 'Enter'
  ]);
  window.addEventListener('keydown', (e) => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (holdKeys.has(e.code)) e.preventDefault();
    resumeAudio();
    if (phase === 'menu') { onMenuKey(e.code); return; }
    if (e.code === 'Escape') {
      if (phase === 'end') toMenu();
      else togglePause();
      return;
    }
    if (e.code === 'Enter' && phase === 'end') again();
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); pressed.clear(); });

  const cv = document.getElementById('fight');
  const ctx = cv.getContext('2d');
  const banner = document.getElementById('banner');
  let sheet, bg, ring, spec, crowd = [], led = [];
  let AN = {};
  let phase = 'load';
  let paused = false;
  let mode = 'fight';
  let levelId = 'normal';
  let menuIndex = 0;
  let time = 0;
  let worldTime = 0;
  let hitstop = 0;
  let shake = 0;
  let hitKick = 0;
  let shx = 0;
  let shy = 0;
  let flashScreen = 0;
  let timer = ROUND_TIME;
  let showBoxes = false;
  let wins = [0, 0];
  let matchNote = '';
  let impacts = [];
  let bolts = [];
  let floaters = [];
  let actx = null;
  let music = null;
  let lastStamp = 0;
  let simAcc = 0;

  function cpuOn() { return mode !== 'versus'; }
  function trainOn() { return mode === 'train'; }
  function aiLevel() { return AI_LEVELS[levelId] || AI_LEVELS.normal; }

  function resumeAudio() {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  }

  function tone(freq, dur, gain, type) {
    resumeAudio();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(Math.max(0.001, gain), actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur);
  }

  function impactSound(weight, blocked) {
    try { impactSoundRaw(weight, blocked); } catch (err) {}
  }

  function impactSoundRaw(weight, blocked) {
    const w = Math.max(1, Math.min(5, weight || 1));
    const dur = blocked ? 0.04 : 0.045 + w * 0.016;
    resumeAudio();
    const n = Math.max(1, Math.floor(actx.sampleRate * dur));
    const buffer = actx.createBuffer(1, n, actx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, blocked ? 1.8 : 1.15);
    }
    const src = actx.createBufferSource();
    src.buffer = buffer;
    const filter = actx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = blocked ? 1600 : Math.max(320, 2400 - w * 380);
    const g = actx.createGain();
    g.gain.value = blocked ? 0.05 : 0.06 + w * 0.028;
    src.connect(filter);
    filter.connect(g);
    g.connect(actx.destination);
    src.start();
    tone(blocked ? 620 : Math.max(110, 460 - w * 68), dur + 0.03, blocked ? 0.02 : 0.025 + w * 0.008, 'triangle');
    if (!blocked && w >= 3) tone(78 - w * 4, 0.14, 0.04 + w * 0.008, 'sine');
  }

  function voice(file) {
    const a = new Audio('../voltia/voices/' + file + '.mp3');
    a.volume = 0.75;
    a.play().catch(() => {});
  }

  function makeFighter(id, x) {
    return {
      id, x, y: FLOOR, vx: 0, vy: 0, face: id === 0 ? 1 : -1,
      hp: MAX_HP, trail: MAX_HP,
      state: 'idle', anim: 'stance', frame: 0, animAcc: 0, animDone: false,
      move: null, didHit: false, spawned: false, airUsed: false,
      stun: 0, invuln: 0, flash: 0, combo: 0, comboTimer: 0, comboAge: 0, regenWait: 0,
      kb: 0, dirs: [], lastFwd: -99, buffer: null,
      blockFor: 0, blockLow: false, aiCd: 0.4, aiStep: 0, aiQueue: null
    };
  }

  const P = [makeFighter(0, 530), makeFighter(1, 810)];

  function opp(p) { return P[1 - p.id]; }

  function clamp(p) {
    if (p.x < WALL_L) p.x = WALL_L;
    if (p.x > WALL_R) p.x = WALL_R;
  }

  function setAnim(p, id, restart) {
    if (p.anim !== id || restart) {
      p.anim = id;
      p.frame = 0;
      p.animAcc = 0;
      p.animDone = false;
    }
  }

  function canAct(p) {
    return phase === 'fight' && !paused && p.stun <= 0 &&
      (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch');
  }

  function startMove(p, id) {
    const m = MOVES[id];
    if (!m) return;
    const air = p.y < FLOOR - 1;
    const avx = p.vx;
    p.state = 'attack';
    p.move = id;
    p.didHit = false;
    p.spawned = false;
    p.buffer = null;
    p.aiQueue = null;
    p.vx = air ? avx : 0;
    setAnim(p, m.anim, true);
    if (id === 'uppercut') voice('voltia_uppercut');
    if (id === 'spinkick') voice('voltia_spinkick');
    if (id === 'rayo_throw') voice('voltia_rayo_throw');
  }

  function relDir(p, inp) {
    const rel = inp.x * p.face;
    const vert = inp.down ? 1 : inp.up ? -1 : 0;
    if (vert > 0 && rel > 0) return 3;
    if (vert > 0 && rel < 0) return 1;
    if (vert < 0 && rel > 0) return 9;
    if (vert < 0 && rel < 0) return 7;
    if (vert > 0) return 2;
    if (vert < 0) return 8;
    if (rel > 0) return 6;
    if (rel < 0) return 4;
    return 5;
  }

  function rememberDir(p, d) {
    const last = p.dirs[p.dirs.length - 1];
    if (!last || last.d !== d) p.dirs.push({ d, t: time });
    if (p.dirs.length > 14) p.dirs.shift();
  }

  function motion(p, seq) {
    let i = p.dirs.length - 1;
    for (let s = seq.length - 1; s >= 0; s--) {
      let found = false;
      while (i >= 0) {
        if (time - p.dirs[i].t > 0.55) return false;
        if (p.dirs[i].d === seq[s]) { found = true; i--; break; }
        i--;
      }
      if (!found) return false;
    }
    return true;
  }

  function humanInput(map) {
    const left = down.has(map.left);
    const right = down.has(map.right);
    return {
      x: (right ? 1 : 0) - (left ? 1 : 0),
      up: down.has(map.up),
      down: down.has(map.down),
      lp: pressed.has(map.lp),
      hp: pressed.has(map.hp),
      lk: pressed.has(map.lk),
      hk: pressed.has(map.hk),
      holdL: left,
      holdR: right
    };
  }

  function emptyInput() {
    return {
      x: 0, up: false, down: false,
      lp: false, hp: false, lk: false, hk: false,
      holdL: false, holdR: false
    };
  }

  function packAi(ai) {
    return {
      x: (ai.right ? 1 : 0) - (ai.left ? 1 : 0),
      up: ai.up, down: ai.down,
      lp: ai.lp, hp: ai.hp, lk: ai.lk, hk: ai.hk,
      holdL: ai.left, holdR: ai.right
    };
  }

  function thinkTime(level) {
    return level.think[0] + Math.random() * (level.think[1] - level.think[0]);
  }

  function cpuInput(me, dt) {
    const level = aiLevel();
    const other = opp(me);
    const dist = Math.abs(other.x - me.x);
    const toward = other.x >= me.x ? 1 : -1;
    const ai = { left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false };
    if (me.blockFor > 0) {
      me.blockFor -= dt;
      if (me.face > 0) ai.left = true;
      else ai.right = true;
      if (me.blockLow) ai.down = true;
      return packAi(ai);
    }
    me.blockLow = false;
    if (phase !== 'fight' || (me.state !== 'idle' && me.state !== 'walk' && me.state !== 'crouch')) return packAi(ai);
    if (me.aiQueue) {
      const q = me.aiQueue;
      me.aiQueue = null;
      if (q === 'up') ai.up = true;
      else ai[q] = true;
      return packAi(ai);
    }
    if (me.aiCd > 0) {
      me.aiCd -= dt;
      if (me.aiStep > 0 && dist > 72) {
        me.aiStep -= dt;
        if (toward > 0) ai.right = true;
        else ai.left = true;
      } else me.aiStep = 0;
      return packAi(ai);
    }
    if (dist > level.engage) {
      if (level.special && dist < 250 && dist > 150 && Math.random() < level.special * 0.45) {
        startMove(me, 'rayo_throw');
        me.aiCd = thinkTime(level);
        return packAi(ai);
      }
      me.aiCd = 0.22;
      me.aiStep = level.step;
      return packAi(ai);
    }
    me.aiCd = thinkTime(level);
    me.aiStep = 0;
    const attacking = other.state === 'attack';
    if (attacking && dist < 132 && Math.random() < level.block) {
      me.blockFor = level.blockTime;
      const low = other.move && MOVES[other.move] && MOVES[other.move].level === 'low';
      if (low && level.block > 0.25 && Math.random() < 0.6) me.blockLow = true;
      return packAi(ai);
    }
    if (level.punish && attacking && !other.didHit && other.frame >= 2 && dist < 102 && Math.random() < level.punish) {
      me.aiQueue = Math.random() < 0.6 ? 'lp' : 'lk';
      return packAi(ai);
    }
    if (dist < 52 && Math.random() < level.retreat) {
      if (toward > 0) ai.left = true;
      else ai.right = true;
      me.aiStep = 0.18;
      return packAi(ai);
    }
    const roll = Math.random();
    if (roll < level.special && dist > 64 && dist < 250) {
      if (dist > 132) startMove(me, 'rayo_throw');
      else if (Math.random() < 0.55) startMove(me, 'uppercut');
      else startMove(me, 'spinkick');
      return packAi(ai);
    }
    if (dist < level.range && roll < level.special + level.heavy) {
      me.aiQueue = Math.random() < 0.5 ? 'hp' : 'hk';
      return packAi(ai);
    }
    if (dist < level.range + 14 && roll < level.special + level.heavy + level.light) {
      me.aiQueue = Math.random() < 0.55 ? 'lp' : 'lk';
      return packAi(ai);
    }
    if (Math.random() < level.jump && dist > 78 && dist < 168) me.aiQueue = 'up';
    return packAi(ai);
  }

  function holdingBack(p, inp) {
    return (p.face > 0 && inp.holdL) || (p.face < 0 && inp.holdR);
  }

  function tryAttack(p, inp) {
    const punch = inp.lp || inp.hp;
    const kick = inp.lk || inp.hk;
    const strongP = inp.hp;
    const strongK = inp.hk;
    if (p.state === 'jump') {
      if ((punch || kick) && !p.airUsed) {
        p.airUsed = true;
        startMove(p, 'jump_kick');
      }
      return;
    }
    if (!canAct(p)) {
      if (punch || kick) p.buffer = { inp: { lp: inp.lp, hp: inp.hp, lk: inp.lk, hk: inp.hk, down: inp.down, x: inp.x }, until: time + 0.17 };
      return;
    }
    if (punch && motion(p, [2, 3, 6])) { startMove(p, 'rayo_throw'); return; }
    if (strongP && (inp.down || motion(p, [6, 2, 3]))) { startMove(p, 'uppercut'); return; }
    if (strongK && holdingBack(p, inp)) { startMove(p, 'spinkick'); return; }
    if (inp.down && inp.lp) { startMove(p, 'crouch_punch'); return; }
    if (inp.down && (inp.lk || inp.hk)) { startMove(p, 'kick_weak'); return; }
    if (inp.lp) { startMove(p, 'punch_weak'); return; }
    if (strongP) { startMove(p, 'punch_strong'); return; }
    if (inp.lk) { startMove(p, 'kick_weak_stand'); return; }
    if (strongK) { startMove(p, 'kick_strong'); return; }
  }

  function tickAnim(p, dt) {
    if (p.state === 'jump' || p.state === 'launch') {
      const n = (AN[p.anim] || AN.stance).frames;
      if (p.vy < spd(-2.2)) p.frame = Math.min(1, n - 1);
      else if (p.vy < spd(2.4)) p.frame = Math.min(2, n - 1);
      else p.frame = n - 1;
      return;
    }
    if (p.state === 'idle') setAnim(p, 'stance');
    if (p.state === 'walk' || p.state === 'dash') setAnim(p, p.state === 'dash' ? 'dash' : 'walk');
    const a = AN[p.anim];
    if (!a) return;
    if ((p.state === 'crouch' || (p.state === 'attack' && (p.move === 'crouch_punch' || p.move === 'kick_weak'))) && p.anim === 'crouch') {
      p.frame = Math.min(2, a.frames - 1);
      return;
    }
    const dur = 1 / a.fps;
    p.animAcc += dt;
    while (p.animAcc >= dur) {
      p.animAcc -= dur;
      p.frame++;
      if (p.frame >= a.frames) {
        if (a.loop && (p.state === 'idle' || p.state === 'walk' || p.state === 'block' || p.state === 'dizzy' || p.state === 'victory')) {
          p.frame = 0;
        } else {
          p.frame = a.frames - 1;
          p.animDone = true;
        }
      }
    }
  }

  function hurtbox(p) {
    if (p.state === 'knockdown' || p.state === 'ko') return { x: p.x - 44, y: p.y - 28, w: 88, h: 26 };
    if (p.y < FLOOR - 6) return { x: p.x - 20, y: p.y - 112, w: 42, h: 100 };
    if (p.state === 'crouch' || p.move === 'crouch_punch' || p.move === 'kick_weak') return { x: p.x - 26, y: p.y - 64, w: 52, h: 60 };
    return { x: p.x - 22, y: p.y - 138, w: 46, h: 134 };
  }

  function attackBox(p) {
    const m = MOVES[p.move];
    if (!m || !m.box || p.didHit) return null;
    if (m.active.indexOf(p.frame) < 0) return null;
    const b = m.box;
    const x = p.face > 0 ? p.x + b.x : p.x - b.x - b.w;
    return { x, y: p.y + b.y, w: b.w, h: b.h };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function blocking(defender, move, inp) {
    if (defender.invuln > 0) return false;
    if (defender.state === 'jump' || defender.state === 'launch' || defender.state === 'knockdown' || defender.state === 'ko' || defender.state === 'attack' || defender.state === 'hit') return false;
    if (!holdingBack(defender, inp)) return false;
    if (move.level === 'low' && !inp.down) return false;
    if (move.level === 'overhead' && inp.down) return false;
    return true;
  }

  function sparkPalette(weight, blocked) {
    if (blocked) return ['#96ffeb', '#e7fff8', '#7fd0ff'];
    if (weight <= 1) return ['#fff6d0', '#ffcb3d'];
    if (weight === 2) return ['#fff6d0', '#ffcb3d', '#ffe08a'];
    if (weight === 3) return ['#fff', '#ffcb3d', '#ff9a3c'];
    if (weight === 4) return ['#fff', '#ffcb3d', '#ff8ad4', '#96ffeb'];
    return ['#fff', '#ff8ad4', '#96ffeb', '#ffcb3d', '#d45cff'];
  }

  function spawnImpact(x, y, weight, blocked, dir, feetX, feetY) {
    const w = Math.max(1, weight || 1);
    const colors = sparkPalette(w, blocked);
    const bits = [];
    const n = blocked ? 5 : 6 + w * 3;
    for (let i = 0; i < n; i++) {
      bits.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: spd(dir * (0.28 + Math.random() * (0.35 + w * 0.28)) + (Math.random() - 0.5) * 1.1),
        vy: spd(-0.25 - Math.random() * (0.35 + w * 0.22)),
        w: w >= 4 && i % 4 === 0 ? 4 : 2,
        h: 2,
        color: colors[i % colors.length]
      });
    }
    if (!blocked && w >= 2) {
      for (let i = 0; i < w; i++) {
        bits.push({
          x, y,
          vx: spd(dir * (1.1 + w * 0.35 + Math.random() * 0.6)),
          vy: spd((Math.random() - 0.5) * 0.35),
          w: 5 + w, h: 2,
          color: i % 2 ? '#fff' : colors[0]
        });
      }
    }
    if (!blocked && feetX != null) {
      for (let i = 0; i < 2 + w; i++) {
        bits.push({
          x: feetX + (Math.random() - 0.5) * 12,
          y: feetY - 1,
          vx: spd(dir * (0.15 + Math.random() * (0.35 + w * 0.12)) + (Math.random() - 0.5) * 0.5),
          vy: spd(-0.12 - Math.random() * 0.4),
          w: 3, h: 2,
          color: i % 2 ? '#e7d3a1' : '#ffcb3d'
        });
      }
    }
    const life = sec(16 + w * 4);
    impacts.push({ x, y, dir, weight: w, blocked, life, max: life, bits });
  }

  function applyHit(attacker, defender, move, blocked, point) {
    const box = attackBox(attacker);
    attacker.didHit = true;
    const w = move.weight || 1;
    const dir = attacker.face || 1;
    const scale = attacker.combo <= 1 ? 1 : Math.max(0.55, 1 - (attacker.combo - 1) * 0.08);
    const dmg = Math.round((move.damage || 0) * (blocked ? 0 : scale));
    if (!trainOn()) defender.hp = Math.max(0, defender.hp - dmg);
    else if (dmg > 0) {
      defender.hp = Math.max(1, defender.hp - dmg);
      defender.regenWait = sec(22 + w * 6);
    }
    defender.flash = blocked ? sec(2) : sec(2 + Math.min(4, w));
    const stop = blocked ? Math.max(sec(3), (move.stop || sec(4)) - sec(3)) : (move.stop || sec(4));
    hitstop = Math.max(hitstop, stop);
    shake = Math.max(shake, blocked ? 1.4 : (move.shake || 2));
    hitKick = dir * (blocked ? 1.4 : 1.8 + w * 1.05);
    if (!blocked && w >= 4) flashScreen = Math.max(flashScreen, w >= 5 ? sec(3) : sec(2));
    const slide = (move.slide || 0) * (blocked ? 0.38 : 1);
    defender.kb = dir * slide;
    defender.vx = 0;
    const pt = point || (box
      ? { x: box.x + box.w / 2, y: box.y + box.h / 2 }
      : { x: defender.x - dir * 18, y: defender.y - 80 });
    spawnImpact(pt.x, pt.y, w, blocked, dir, defender.x, defender.y);
    impactSound(w, blocked);
    const col = blocked ? '#96ffeb' : ['#fff4c2', '#ffe08a', '#ffcb3d', '#ff9a3c', '#ff6b3d'][Math.min(4, w - 1)];
    if (blocked) {
      defender.state = 'block';
      defender.stun = move.block || sec(8);
      setAnim(defender, defender.inpDown ? 'crouch' : 'block', true);
      floaters.push({ x: defender.x, y: defender.y - 108, text: 'bloqueo', life: sec(26), max: sec(26), vy: spd(-0.28), color: '#96ffeb', size: 15 });
      attacker.combo = 0;
      attacker.comboTimer = 0;
      return;
    }
    attacker.combo = (attacker.comboTimer > 0 ? attacker.combo : 0) + 1;
    attacker.comboTimer = sec(72) + (move.stun || sec(12));
    attacker.comboAge = 0;
    defender.combo = 0;
    defender.comboTimer = 0;
    const life = sec(30 + w * 4);
    floaters.push({
      x: defender.x, y: defender.y - 118, text: String(dmg),
      life, max: life, vy: spd(-0.22 - w * 0.03), color: col, size: 14 + w * 4
    });
    if (defender.hp <= 0 && !trainOn()) {
      defender.state = 'ko';
      defender.stun = 99;
      defender.kb = dir * Math.max(slide, spd(3.2));
      setAnim(defender, 'ko', true);
      voice('voltia_ko');
      endRound(attacker);
      return;
    }
    if (move.launch) {
      defender.state = 'launch';
      defender.vy = spd(-8.6);
      defender.vx = dir * spd(1.6);
      defender.kb = dir * slide * 0.45;
      defender.y -= 2;
      setAnim(defender, 'hit', true);
      return;
    }
    if (move.knockdown) {
      defender.state = 'knockdown';
      defender.stun = sec(40);
      defender.kb = dir * Math.max(slide, spd(3.2));
      setAnim(defender, 'knockdown', true);
      voice('voltia_knockdown');
      return;
    }
    defender.state = 'hit';
    defender.stun = move.stun || sec(12);
    setAnim(defender, defender.inpDown ? 'crouch_hit' : 'hit', true);
  }

  function endRound(winner) {
    phase = 'end';
    if (winner) {
      wins[winner.id]++;
      winner.state = 'victory';
      setAnim(winner, wins[winner.id] % 2 ? 'victory1' : 'victory2', true);
      voice(winner.anim === 'victory1' ? 'voltia_victory1' : 'voltia_victory2');
      matchNote = wins[winner.id] >= 2 ? 'Gana la pelea' : 'Ronda';
    } else {
      matchNote = 'Tiempo';
      const a = P[0].hp, b = P[1].hp;
      if (a !== b) {
        const w = a > b ? P[0] : P[1];
        wins[w.id]++;
        w.state = 'victory';
        setAnim(w, 'victory1', true);
      }
    }
    banner.innerHTML = winner
      ? `VOLTIA ${winner.id + 1}<small>${matchNote}</small>`
      : (P[0].hp === P[1].hp ? 'Empate' : `VOLTIA ${P[0].hp > P[1].hp ? 1 : 2}<small>por tiempo</small>`);
    syncUi();
  }

  function resolveHits(inputs) {
    for (const p of P) {
      if (p.state !== 'attack') continue;
      const m = MOVES[p.move];
      if (!m) continue;
      if (m.spawn != null && !p.spawned && p.frame >= m.spawn) {
        p.spawned = true;
        bolts.push({
          owner: p.id, x: p.x + p.face * 48, y: p.y - 78, vx: p.face * BOLT_V,
          frame: 0, acc: 0, life: sec(100)
        });
        voice('voltia_rayo_proj');
      }
      const box = attackBox(p);
      if (!box) continue;
      const other = opp(p);
      if (other.invuln > 0 || other.state === 'ko') continue;
      if (!overlap(box, hurtbox(other))) continue;
      applyHit(p, other, m, blocking(other, m, inputs[other.id]));
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const owner = P[b.owner];
      const other = opp(owner);
      const box = { x: b.x - 18, y: b.y - 12, w: 36, h: 22 };
      if (other.invuln <= 0 && other.state !== 'ko' && overlap(box, hurtbox(other))) {
        const move = {
          damage: 64, stun: sec(16), block: sec(10), slide: spd(4.4), stop: sec(12), shake: 6.4,
          weight: 4, level: 'mid'
        };
        const prevHit = owner.didHit;
        applyHit(owner, other, move, blocking(other, move, inputs[other.id]), { x: b.x, y: b.y });
        owner.didHit = prevHit;
        bolts.splice(i, 1);
      }
    }
  }

  function physics(p, dt) {
    if (p.state === 'jump' || p.state === 'launch' || p.y < FLOOR) {
      p.vy += JUMP_G * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y >= FLOOR) {
        p.y = FLOOR;
        p.vy = 0;
        p.vx = 0;
        p.airUsed = false;
        if (p.state === 'launch' || p.state === 'knockdown') {
          p.state = 'knockdown';
          p.stun = Math.max(p.stun, sec(32));
          setAnim(p, 'knockdown', true);
        } else if (p.state !== 'ko' && p.state !== 'attack') {
          p.state = p._down ? 'crouch' : 'idle';
        } else if (p.state === 'attack' && p.animDone) {
          p.state = 'idle';
        }
      }
    }
    clamp(p);
  }

  function control(p, inp, dt) {
    p._down = inp.down;
    p.inpDown = inp.down;
    if (phase !== 'fight' || paused) {
      if (phase === 'end') tickAnim(p, dt);
      return;
    }
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);
    if (p.stun > 0) {
      p.stun = Math.max(0, p.stun - dt);
      if (p.stun === 0 && (p.state === 'hit' || p.state === 'block')) {
        p.state = inp.down ? 'crouch' : 'idle';
        p.move = null;
      }
      if (p.state === 'knockdown' && p.stun <= 0) {
        p.state = 'idle';
        p.invuln = sec(16);
        p.move = null;
      }
      tickAnim(p, dt);
      physics(p, dt);
      return;
    }
    if (p.state === 'ko' || p.state === 'victory') { tickAnim(p, dt); return; }
    if (p.state === 'launch') { tickAnim(p, dt); physics(p, dt); return; }

    rememberDir(p, relDir(p, inp));
    if (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch') {
      if (opp(p).x !== p.x) p.face = opp(p).x > p.x ? 1 : -1;
    }

    if (p.buffer && time <= p.buffer.until && canAct(p)) {
      const b = p.buffer.inp;
      p.buffer = null;
      tryAttack(p, Object.assign({ holdL: inp.holdL, holdR: inp.holdR, x: inp.x, up: false }, b));
    }
    tryAttack(p, inp);

    if (p.state === 'attack') {
      tickAnim(p, dt);
      if (p.animDone) {
        p.move = null;
        p.state = p.y < FLOOR - 1 ? 'jump' : (inp.down ? 'crouch' : 'idle');
      }
      physics(p, dt);
      return;
    }

    if (p.state === 'jump') {
      p.vx += inp.x * AIR_A * dt;
      p.vx = Math.max(-AIR_MAX, Math.min(AIR_MAX, p.vx));
      tickAnim(p, dt);
      physics(p, dt);
      return;
    }

    if (inp.up && (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch')) {
      p.state = 'jump';
      p.vy = JUMP_V;
      p.vx = inp.x * JUMP_X;
      p.airUsed = false;
      setAnim(p, inp.x ? 'fwdjump' : 'jump', true);
      voice('grunt_jump');
      tickAnim(p, dt);
      physics(p, dt);
      return;
    }

    if (fwdEdge(p, inp)) {
      p.state = 'dash';
      p.vx = 0;
      setAnim(p, 'dash', true);
    }

    if (p.state === 'dash') {
      p.x += p.face * DASH_V * dt;
      tickAnim(p, dt);
      if (p.animDone) p.state = 'idle';
      clamp(p);
      return;
    }

    if (inp.down) {
      p.state = 'crouch';
      setAnim(p, 'crouch');
      p.frame = Math.min(2, (AN.crouch.frames || 3) - 1);
      p.vx = 0;
      return;
    }

    if (inp.x) {
      const back = inp.x !== p.face;
      p.state = 'walk';
      p.vx = inp.x * (back ? WALK_B : WALK_F);
      p.x += p.vx * dt;
      setAnim(p, 'walk');
      tickAnim(p, dt);
      clamp(p);
      return;
    }

    p.vx = 0;
    p.state = 'idle';
    p.move = null;
    tickAnim(p, dt);
  }

  function fwdEdge(p, inp) {
    if (p.id === 1 && cpuOn()) return false;
    const forward = inp.x === p.face && (
      (p.face > 0 && ((p.id === 0 && pressed.has('KeyD')) || (p.id === 1 && pressed.has('ArrowRight')))) ||
      (p.face < 0 && ((p.id === 0 && pressed.has('KeyA')) || (p.id === 1 && pressed.has('ArrowLeft'))))
    );
    if (!forward) return false;
    const gap = time - p.lastFwd;
    const ok = gap <= sec(18) && gap >= sec(3);
    p.lastFwd = time;
    return ok && (p.state === 'idle' || p.state === 'walk');
  }

  function separate() {
    const a = P[0], b = P[1];
    if (a.y < FLOOR - 8 || b.y < FLOOR - 8) return;
    if (a.state === 'ko' || b.state === 'ko') return;
    const gap = 50;
    if (Math.abs(b.x - a.x) < gap) {
      const mid = (a.x + b.x) / 2;
      const s = b.x >= a.x ? 1 : -1;
      a.x = mid - s * gap / 2;
      b.x = mid + s * gap / 2;
      clamp(a);
      clamp(b);
    }
  }

  function slideAll(dt) {
    const decay = Math.pow(KB_DECAY, dt * HZ);
    for (const p of P) {
      if (!p.kb) continue;
      const before = p.x;
      p.x += p.kb * dt;
      clamp(p);
      if ((p.x === WALL_L || p.x === WALL_R) && Math.abs(p.x - before) + 0.15 < Math.abs(p.kb * dt)) {
        const o = opp(p);
        o.kb = (o.kb || 0) - p.kb * 0.55;
        p.kb = 0;
        continue;
      }
      p.kb *= decay;
      if (Math.abs(p.kb) < 8) p.kb = 0;
    }
  }

  function updateBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * dt;
      b.life -= dt;
      b.acc += dt;
      if (b.acc >= sec(5)) { b.acc = 0; b.frame = (b.frame + 1) % 3; }
      if (b.life <= 0 || b.x < WALL_L - 40 || b.x > WALL_R + 40) bolts.splice(i, 1);
    }
  }

  function tickImpacts(dt) {
    const drag = Math.pow(0.97, dt * HZ);
    for (let i = impacts.length - 1; i >= 0; i--) {
      const s = impacts[i];
      s.life -= dt;
      for (const b of s.bits) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy += acc(0.09) * dt;
        b.vx *= drag;
      }
      if (s.life <= 0) impacts.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life -= dt;
      floaters[i].y += floaters[i].vy * dt;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
  }

  function tickCombos(dt) {
    for (const p of P) {
      if (p.comboTimer > 0) {
        p.comboTimer -= dt;
        p.comboAge += dt;
        if (p.comboTimer <= 0) {
          p.combo = 0;
          p.comboAge = 0;
        }
      }
    }
  }

  function decayShake(dt, frozen) {
    const k = dt * HZ;
    shake *= Math.pow(frozen ? 0.93 : 0.84, k);
    if (shake < 0.3) shake = 0;
    hitKick *= Math.pow(frozen ? 0.86 : 0.78, k);
    if (Math.abs(hitKick) < 0.15) hitKick = 0;
    if (flashScreen > 0) flashScreen = Math.max(0, flashScreen - dt);
  }

  function step(dt) {
    if (paused || phase === 'load') return;
    if (hitstop > 0) {
      hitstop = Math.max(0, hitstop - dt);
      tickImpacts(dt);
      decayShake(dt, true);
      return;
    }
    worldTime += dt;
    time += dt;
    if (phase === 'menu') {
      for (const p of P) tickAnim(p, dt);
      return;
    }
    if (phase === 'intro') {
      if (time > 1.05) { phase = 'fight'; banner.textContent = ''; }
      else banner.innerHTML = time > 0.65 ? '¡YA!' : 'Preparados';
      for (const p of P) tickAnim(p, dt);
      pressed.clear();
      return;
    }
    if (phase === 'fight' && !trainOn()) {
      timer = Math.max(0, timer - dt);
      if (timer <= 0) endRound(null);
    }
    const inputs = [
      humanInput(P1K),
      (trainOn() && cpuOn()) ? emptyInput() : (cpuOn() ? cpuInput(P[1], dt) : humanInput(P2K))
    ];
    for (let i = 0; i < 2; i++) control(P[i], inputs[i], dt);
    if (phase === 'fight') resolveHits(inputs);
    if (hitstop <= 0) slideAll(dt);
    separate();
    updateBolts(dt);
    for (const p of P) {
      if (trainOn()) {
        if (p.regenWait > 0) p.regenWait = Math.max(0, p.regenWait - dt);
        else if (p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + 51 * dt);
      }
      const follow = 1 - Math.pow(0.94, dt * HZ);
      p.trail += (p.hp - p.trail) * follow;
      if (Math.abs(p.trail - p.hp) < 0.4) p.trail = p.hp;
    }
    tickImpacts(dt);
    tickCombos(dt);
    decayShake(dt, false);
    pressed.clear();
  }

  function worldToScreen(x, y) {
    const sx = cv.width / CAM.w;
    const sy = cv.height / CAM.h;
    return [(x - CAM.x) * sx + shx, (y - CAM.y) * sy + shy, sx, sy];
  }

  function drawSheet(img, col, row, x, y, face, pivotX, pivotY, scale) {
    const [sx, sy, scx, scy] = worldToScreen(x, y);
    const dw = CELL_W * scale * scx;
    const dh = CELL_H * scale * scy;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(face, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, col * CELL_W, row * CELL_H, CELL_W, CELL_H,
      -pivotX * scale * scx, -pivotY * scale * scy, dw, dh);
    ctx.restore();
  }

  function drawFighter(p) {
    if (p.flash > 0 && Math.floor(worldTime * 12) % 2 === 0) return;
    const a = AN[p.anim] || AN.stance;
    const frame = Math.max(0, Math.min(a.frames - 1, p.frame || 0));
    const [fx, fy, scx, scy] = worldToScreen(p.x, p.y);
    ctx.save();
    ctx.fillStyle = p.id === 0 ? 'rgba(80,220,220,0.35)' : 'rgba(220,80,180,0.35)';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 28 * scx, 8 * scy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawSheet(sheet, frame, a.row, p.x, p.y, p.face, PIVOT_X, PIVOT_Y, SCALE);
  }

  function drawImpacts() {
    for (const s of impacts) {
      const [sx, sy, kx] = worldToScreen(s.x, s.y);
      const age = 1 - s.life / s.max;
      const alpha = Math.max(0, s.life / s.max);
      const col = s.blocked ? '#96ffeb' : (s.weight >= 4 ? '#fff1b0' : '#ffcb3d');
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'square';
      ctx.strokeStyle = col;
      ctx.lineWidth = s.weight >= 3 ? 3 : 2;
      const ringR = (5 + s.weight * 4 + age * (10 + s.weight * 8)) * kx;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(3, ringR), 0, Math.PI * 2);
      ctx.stroke();
      if (s.weight >= 4) {
        ctx.strokeStyle = s.weight >= 5 ? '#ff8ad4' : '#96ffeb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(3, ringR * 0.62), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (age < 0.34) {
        ctx.globalAlpha = (1 - age / 0.34) * 0.95;
        ctx.fillStyle = '#fff';
        const core = (3 + s.weight * 2) * kx;
        ctx.fillRect(sx - core / 2, sy - core / 2, core, core);
      }
      ctx.globalAlpha = alpha;
      const rays = s.blocked ? 4 : 4 + s.weight * 2;
      const reach = (7 + s.weight * 5) * (1 - age * 0.45) * kx;
      ctx.lineWidth = s.weight >= 4 ? 3 : 2;
      for (let i = 0; i < rays; i++) {
        const spread = (i - (rays - 1) / 2) * (0.55 - Math.min(0.22, s.weight * 0.04));
        const ang = Math.atan2(-0.42, s.dir || 1) + spread;
        ctx.strokeStyle = i % 2 ? '#fff' : col;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * reach, sy + Math.sin(ang) * reach * 0.72);
        ctx.stroke();
      }
      const slash = (12 + s.weight * 8) * (1 - age * 0.25) * kx;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = s.weight >= 3 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(sx - s.dir * slash * 0.7, sy - slash * 0.22);
      ctx.lineTo(sx + s.dir * slash * 0.4, sy + slash * 0.1);
      ctx.stroke();
      for (const b of s.bits) {
        const [px, py, bkx, bky] = worldToScreen(b.x, b.y);
        ctx.fillStyle = b.color;
        ctx.fillRect(px, py, Math.max(2, b.w * bkx), Math.max(2, b.h * bky));
      }
      ctx.restore();
    }
  }

  function drawFloaters() {
    ctx.textAlign = 'center';
    for (const t of floaters) {
      const [sx, sy] = worldToScreen(t.x, t.y);
      ctx.font = '800 ' + (t.size || 16) + 'px system-ui, sans-serif';
      ctx.globalAlpha = Math.max(0, Math.min(1, t.life / (t.max || 0.4)));
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#181624';
      ctx.strokeText(t.text, sx, sy);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx, sy);
      ctx.globalAlpha = 1;
    }
  }

  function drawCombo() {
    if (phase !== 'fight' || paused) return;
    let best = null;
    for (const p of P) {
      if (p.combo < 2 || p.comboTimer <= 0) continue;
      if (!best || p.combo > best.combo || (p.combo === best.combo && p.comboAge < best.comboAge)) best = p;
    }
    if (!best) return;
    const pop = best.comboAge < 0.12 ? 1.2 - best.comboAge * 1.4 : 1;
    const alpha = best.comboTimer < 0.3 ? best.comboTimer / 0.3 : 1;
    const col = best.combo >= 6 ? '#ff8ad4' : best.combo >= 4 ? '#ff9a3c' : '#ffcb3d';
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(cv.width / 2, 104);
    ctx.scale(pop, pop);
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#181624';
    ctx.fillStyle = col;
    ctx.font = '800 52px system-ui, sans-serif';
    ctx.strokeText(String(best.combo), 0, 0);
    ctx.fillText(String(best.combo), 0, 0);
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = '#96ffeb';
    ctx.lineWidth = 5;
    ctx.strokeText('GOLPES', 0, 28);
    ctx.fillText('GOLPES', 0, 28);
    ctx.restore();
  }

  function drawWorld() {
    ctx.imageSmoothingEnabled = false;
    shx = (shake ? (Math.random() - 0.5) * shake * 1.25 : 0) + hitKick;
    shy = shake ? (Math.random() - 0.5) * shake * 0.65 : 0;
    ctx.drawImage(bg, CAM.x, CAM.y, CAM.w, CAM.h, 0, 0, cv.width, cv.height);
    if (led.length && spec && spec.screens) {
      const f = led[Math.floor(worldTime * (HZ / 10)) % led.length];
      for (const s of spec.screens) {
        const [sx, sy, kx, ky] = worldToScreen(s.x, s.y);
        ctx.drawImage(f, sx, sy, f.width * kx, f.height * ky);
      }
    }
    if (crowd.length && spec) {
      const tick = Math.floor(worldTime * (HZ / 9));
      for (const band of spec.rows || []) {
        const stepX = band.step || crowd[0].width;
        let i = 0;
        for (let x = band.x0; x + stepX <= band.x1 + 8; x += stepX, i++) {
          const f = crowd[(tick + i + (band.phase || 0)) % crowd.length];
          let sw = f.width;
          const limit = band.xMax != null ? band.xMax : 1344;
          if (x >= limit) continue;
          if (x + sw > limit) sw = limit - x;
          if (sw < 12) continue;
          const [sx, sy, kx, ky] = worldToScreen(x, band.feet - f.height);
          ctx.drawImage(f, 0, 0, sw, f.height, sx, sy, sw * kx, f.height * ky);
        }
      }
      if (spec.sides && spec.figs) {
        for (const s of spec.sides) {
          const fi = (tick + (s.phase || 0)) % crowd.length;
          const box = spec.figs[fi][s.slot % spec.figs[fi].length];
          const f = crowd[fi];
          const dw = box[1] * (s.scale || 1);
          const dh = f.height * (s.scale || 1);
          const [sx, sy, kx, ky] = worldToScreen(s.x, s.feet - dh);
          ctx.drawImage(f, box[0], 0, box[1], f.height, sx, sy, dw * kx, dh * ky);
        }
      }
    }
    if (ring) ctx.drawImage(ring, CAM.x, CAM.y, CAM.w, CAM.h, 0, 0, cv.width, cv.height);
    for (const p of P) drawFighter(p);
    if (AN.rayo_proj) {
      for (const b of bolts) {
        drawSheet(sheet, b.frame, AN.rayo_proj.row, b.x, b.y, b.vx > 0 ? 1 : -1, 174, 154, 0.42);
      }
    }
    drawImpacts();
    drawFloaters();
    if (flashScreen > 0) {
      ctx.fillStyle = 'rgba(255,246,220,' + Math.min(0.16, flashScreen * 2.2) + ')';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    if (showBoxes) {
      ctx.strokeStyle = '#7dff7d';
      for (const p of P) {
        const h = hurtbox(p);
        const [sx, sy, kx, ky] = worldToScreen(h.x, h.y);
        ctx.strokeRect(sx, sy, h.w * kx, h.h * ky);
        const ab = attackBox(p);
        if (ab) {
          ctx.strokeStyle = '#ff5b6a';
          const [ax, ay, akx, aky] = worldToScreen(ab.x, ab.y);
          ctx.strokeRect(ax, ay, ab.w * akx, ab.h * aky);
          ctx.strokeStyle = '#7dff7d';
        }
      }
    }
    drawCombo();
  }

  function drawHud() {
    const set = (id, hp, trail) => {
      document.getElementById(id).style.width = Math.max(0, hp / MAX_HP * 100) + '%';
      document.getElementById(id === 'h1' ? 't1' : 't2').style.width = Math.max(0, trail / MAX_HP * 100) + '%';
    };
    set('h1', P[0].hp, P[0].trail);
    set('h2', P[1].hp, P[1].trail);
    document.getElementById('timer').textContent = trainOn() && phase !== 'menu' ? '∞' : String(Math.ceil(timer - 1e-6));
    for (let i = 0; i < 2; i++) {
      const el = document.getElementById(i === 0 ? 'w1' : 'w2');
      el.innerHTML = '<i class="' + (wins[i] > 0 ? 'on' : '') + '"></i><i class="' + (wins[i] > 1 ? 'on' : '') + '"></i>';
    }
  }

  function syncUi() {
    const menu = document.getElementById('menu');
    const pauseEl = document.getElementById('pause');
    const end = document.getElementById('endcard');
    const hud = document.getElementById('hud');
    if (menu) menu.hidden = phase !== 'menu';
    if (pauseEl) pauseEl.hidden = !paused || phase === 'menu' || phase === 'load' || phase === 'end';
    if (end) end.hidden = phase !== 'end';
    if (hud) hud.classList.toggle('dim', phase === 'menu' || phase === 'load');
    const n2 = document.getElementById('n2');
    if (n2) {
      if (phase === 'menu' || phase === 'load') n2.textContent = 'VOLTIA';
      else if (trainOn()) n2.textContent = 'MUÑECO';
      else if (!cpuOn()) n2.textContent = 'VOLTIA 2';
      else n2.textContent = 'CPU · ' + aiLevel().name.toUpperCase();
    }
    const pauseLine = document.getElementById('pause-line');
    if (pauseLine) {
      pauseLine.textContent = trainOn() ? 'Entrenamiento' : (cpuOn() ? 'Pelea · ' + aiLevel().name : 'Versus');
    }
    paintMenu();
    paintMusic();
  }

  function paintMenu() {
    document.querySelectorAll('#menu-nav .item').forEach((el, i) => {
      el.classList.toggle('on', i === menuIndex);
    });
    const levels = document.getElementById('levels');
    if (levels) levels.classList.toggle('dim', menuIndex !== 0);
    document.querySelectorAll('#levels button').forEach((el) => {
      el.classList.toggle('pick', el.getAttribute('data-level') === levelId);
    });
    const line = document.getElementById('ai-line');
    if (line) line.textContent = aiLevel().line;
  }

  function paintMusic() {
    const on = !!(music && !music.paused);
    document.querySelectorAll('[data-music]').forEach((el) => {
      el.textContent = on ? 'Música: on' : 'Música';
      if (!el.classList.contains('item')) el.classList.toggle('on', on);
    });
  }

  function onMenuKey(code) {
    if (code === 'ArrowUp') menuIndex = (menuIndex + MENU_ACTS.length - 1) % MENU_ACTS.length;
    else if (code === 'ArrowDown') menuIndex = (menuIndex + 1) % MENU_ACTS.length;
    else if ((code === 'ArrowLeft' || code === 'ArrowRight') && menuIndex === 0) {
      const i = LEVEL_ORDER.indexOf(levelId);
      const d = code === 'ArrowRight' ? 1 : -1;
      levelId = LEVEL_ORDER[(i + d + LEVEL_ORDER.length) % LEVEL_ORDER.length];
    } else if (code === 'Enter') {
      activateMenu();
      return;
    } else return;
    paintMenu();
  }

  function activateMenu() {
    const act = MENU_ACTS[menuIndex];
    if (act === 'music') toggleMusic();
    else startMatch(act);
  }

  function frame(stamp) {
    if (!lastStamp) lastStamp = stamp;
    let dt = (stamp - lastStamp) / 1000;
    lastStamp = stamp;
    if (dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    simAcc += dt;
    let guard = 0;
    while (simAcc >= STEP && guard < 4) {
      step(STEP);
      simAcc -= STEP;
      guard++;
    }
    if (sheet) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawWorld();
      drawHud();
      syncUi();
    }
    requestAnimationFrame(frame);
  }

  function clearFx() {
    bolts = [];
    impacts = [];
    floaters = [];
    hitstop = 0;
    shake = 0;
    hitKick = 0;
    flashScreen = 0;
  }

  function resetRound(clearWins) {
    if (clearWins) wins = [0, 0];
    P[0] = makeFighter(0, 530);
    P[1] = makeFighter(1, 810);
    if (cpuOn() && !trainOn()) P[1].aiCd = aiLevel().think[0];
    clearFx();
    timer = ROUND_TIME;
    time = 0;
    phase = 'intro';
    paused = false;
    banner.textContent = 'Preparados';
    matchNote = '';
    pressed.clear();
    syncUi();
  }

  function startMatch(kind) {
    mode = kind;
    wins = [0, 0];
    resetRound(true);
  }

  function again() {
    paused = false;
    resetRound(wins[0] >= 2 || wins[1] >= 2);
  }

  function toMenu() {
    paused = false;
    phase = 'menu';
    P[0] = makeFighter(0, 530);
    P[1] = makeFighter(1, 810);
    clearFx();
    timer = ROUND_TIME;
    time = 0;
    wins = [0, 0];
    banner.textContent = '';
    pressed.clear();
    syncUi();
  }

  function togglePause() {
    if (phase === 'load' || phase === 'menu' || phase === 'end') return;
    paused = !paused;
    banner.innerHTML = paused ? '' : (phase === 'intro' ? 'Preparados' : '');
    syncUi();
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(src));
      img.src = src;
    });
  }

  async function toggleMusic() {
    resumeAudio();
    if (music && !music.paused) {
      music.pause();
      paintMusic();
      return;
    }
    if (!music) {
      music = new Audio('../voltia/theme.wav?v=3');
      music.loop = true;
      music.volume = 0.45;
    }
    try {
      await music.play();
      paintMusic();
    } catch (err) {
      document.getElementById('status').textContent = 'No se pudo poner la música.';
    }
  }

  document.querySelectorAll('#menu-nav .item').forEach((el, i) => {
    el.addEventListener('click', () => {
      menuIndex = i;
      el.blur();
      activateMenu();
    });
  });
  document.querySelectorAll('#levels button').forEach((el) => {
    el.addEventListener('click', () => {
      levelId = el.getAttribute('data-level');
      menuIndex = 0;
      el.blur();
      startMatch('fight');
    });
  });
  document.getElementById('resume').onclick = () => { togglePause(); };
  document.getElementById('pause-menu').onclick = () => toMenu();
  document.getElementById('pause-music').onclick = () => toggleMusic();
  document.getElementById('rematch').onclick = () => again();
  document.getElementById('to-menu').onclick = () => toMenu();
  paintMenu();

  (async () => {
    try {
      const meta = await (await fetch('../voltia/sheet.json', { cache: 'no-store' })).json();
      spec = await (await fetch('../voltia/stage/stage.json', { cache: 'no-store' })).json();
      for (const a of meta.animations) AN[a.id] = a;
      sheet = await loadImage('../voltia/' + meta.sprite);
      bg = await loadImage('../voltia/stage/bg.png');
      ring = await loadImage('../voltia/stage/ring.png');
      for (let i = 0; i < 4; i++) {
        crowd.push(await loadImage('../voltia/stage/crowd/f' + i + '.png'));
        led.push(await loadImage('../voltia/stage/led/f' + i + '.png'));
      }
      phase = 'menu';
      syncUi();
      requestAnimationFrame(frame);
    } catch (err) {
      document.getElementById('status').textContent = 'No se pudo cargar la pelea: ' + err.message;
    }
  })();
})();

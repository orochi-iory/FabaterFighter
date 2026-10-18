/* Motor de Cyber Fist. No conoce los golpes de Voltia: los lee de window.ROSTER.
   El reloj es de segundos reales. La cámara recorre el ring y acerca el zoom
   cuando se juntan o cuando un golpe pide zoom. */
(function () {
  const HZ = 60;
  const STEP = 1 / HZ;
  const sec = (frames) => frames / HZ;
  const spd = (pxPerFrame) => pxPerFrame * HZ;
  const accel = (pxPerFrame) => pxPerFrame * HZ * HZ;

  const FLOOR = 408;
  const WALL_L = 286;
  const WALL_R = 1058;
  const STAGE_W = 1344;
  const STAGE_H = 604;
  const ROUND_TIME = 60;
  const KB_DECAY = 0.86;
  const ASPECT = 540 / 960;

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
  const SIDE = ['rgba(80,220,220,0.38)', 'rgba(220,80,180,0.38)'];

  const down = new Set();
  const pressed = new Set();
  const holdKeys = new Set([
    'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Space', 'Enter'
  ]);

  const cv = document.getElementById('fight');
  const ctx = cv.getContext('2d');
  const banner = document.getElementById('banner');
  let sheetReady = false;
  let bg, ring, spec;
  let crowd = [], led = [], smoke = [];
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
  let zoomPunch = 0;
  let flashScreen = 0;
  let timer = ROUND_TIME;
  let showBoxes = false;
  let wins = [0, 0];
  let impacts = [];
  let bolts = [];
  let floaters = [];
  let actx = null;
  let music = null;
  let lastStamp = 0;
  let simAcc = 0;
  let cam = { x: 360, y: 150, w: 720, h: 405 };
  let view = { x: 360, y: 150, w: 720, h: 405 };
  let fxCanvas = null;
  const MATCH = ['voltia', 'voltia'];
  const chars = {};
  const artCache = {};

  function cpuOn() { return mode !== 'versus'; }
  function trainOn() { return mode === 'train'; }
  function aiLevel() { return AI_LEVELS[levelId] || AI_LEVELS.normal; }

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

  function resumeAudio() {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  }

  const HIT_SFX = {
    weak: ['sfx/hit_weak_1.wav?v=1', 'sfx/hit_weak_2.wav?v=1', 'sfx/hit_weak_3.wav?v=1', 'sfx/hit_weak_4.wav?v=1'],
    strong: ['sfx/hit_strong_1.wav?v=1', 'sfx/hit_strong_2.wav?v=1', 'sfx/hit_strong_3.wav?v=1', 'sfx/hit_strong_4.wav?v=1']
  };
  let lastSfx = '';

  function impactSound(weight, blocked) {
    const kind = (!blocked && (weight || 1) >= 3) ? 'strong' : 'weak';
    const list = HIT_SFX[kind];
    let i = Math.floor(Math.random() * list.length);
    if (list[i] === lastSfx) i = (i + 1) % list.length;
    lastSfx = list[i];
    const a = new Audio(list[i]);
    a.volume = blocked ? 0.42 : (kind === 'strong' ? 0.8 : 0.62);
    a.play().catch(() => {});
  }

  function voice(def, key) {
    const file = def && def.voices && def.voices[key];
    if (!file) return;
    const a = new Audio((def.voiceDir || '../voltia/voices/') + file + '.mp3');
    a.volume = 0.75;
    a.play().catch(() => {});
  }

  function compileChar(raw) {
    const moves = {};
    const byAi = {};
    Object.keys(raw.moves).forEach((id) => {
      const m = raw.moves[id];
      const hits = (m.hits || []).map((h) => ({
        ...h,
        stun: sec(h.stun || 0),
        block: sec(h.block || 0),
        slide: spd(h.slide || 0),
        stop: sec(h.stop || 0)
      }));
      let projectile = null;
      if (m.projectile) {
        const pr = m.projectile;
        projectile = {
          ...pr,
          speeds: { weak: spd(pr.speeds.weak), strong: spd(pr.speeds.strong) },
          life: sec(pr.life || 100),
          hit: {
            ...pr.hit,
            stun: sec(pr.hit.stun || 0),
            block: sec(pr.hit.block || 0),
            slide: spd(pr.hit.slide || 0),
            stop: sec(pr.hit.stop || 0)
          }
        };
      }
      moves[id] = Object.assign({}, m, { id, hits, projectile });
      if (m.ai) {
        if (!byAi[m.ai]) byAi[m.ai] = [];
        byAi[m.ai].push(id);
      }
    });
    const ph = raw.physics;
    return Object.assign({}, raw, {
      moves,
      byAi,
      phys: {
        walkF: spd(ph.walkF),
        walkB: spd(ph.walkB),
        dash: spd(ph.dash),
        jumpV: spd(ph.jumpV),
        jumpX: spd(ph.jumpX),
        gravity: accel(ph.gravity),
        airAccel: accel(ph.airAccel),
        airMax: spd(ph.airMax)
      }
    });
  }

  function makeFighter(id, x, charId) {
    const def = chars[charId];
    return {
      id, x, y: FLOOR, vx: 0, vy: 0, face: id === 0 ? 1 : -1,
      def, charId,
      hp: def.maxHp, trail: def.maxHp,
      state: 'idle', anim: 'stance', frame: 0, animAcc: 0, animDone: false,
      move: null, strength: 'strong', landed: [], didHit: false, spawned: false, airUsed: false,
      stun: 0, invuln: 0, flash: 0, combo: 0, comboTimer: 0, comboAge: 0, regenWait: 0,
      kb: 0, dirs: [], lastFwd: -99, buffer: null, bolt: null, btnAt: { punch: -9, kick: -9 },
      blockFor: 0, blockLow: false, aiCd: 0.4, aiStep: 0, aiQueue: null
    };
  }

  const P = [null, null];

  function opp(p) { return P[1 - p.id]; }
  function clampX(p) {
    if (p.x < WALL_L) p.x = WALL_L;
    if (p.x > WALL_R) p.x = WALL_R;
  }
  function moveOf(p) { return p.move ? p.def.moves[p.move] : null; }
  function animOf(p) { return p.def.art.anims[p.anim] || p.def.art.anims.stance; }

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

  function limited(p, m) {
    return m && m.kind === 'projectile' && m.limit && p.bolt;
  }

  function startMove(p, id, strength) {
    const m = p.def.moves[id];
    if (!m || limited(p, m)) return false;
    const air = p.y < FLOOR - 1;
    const avx = p.vx;
    p.state = 'attack';
    p.move = id;
    p.strength = strength || 'strong';
    p.didHit = false;
    p.spawned = false;
    p.landed = m.hits.map(() => false);
    p.buffer = null;
    p.aiQueue = null;
    p.vx = air ? avx : 0;
    setAnim(p, m.anim, true);
    if (m.voice) voice(p.def, m.voice);
    return true;
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
    if (p.dirs.length > 16) p.dirs.shift();
  }

  function motion(p, seq, window, opts) {
    const limit = window || 0.5;
    const release = (opts && opts.release) || [5];
    const releaseTime = opts && opts.releaseTime != null ? opts.releaseTime : 0.14;
    const tapGap = opts && opts.tapGap;
    const dirs = p.dirs;
    if (!seq.length || !dirs.length) return false;
    const ends = [dirs.length - 1];
    const lastI = dirs.length - 1;
    if (release.indexOf(dirs[lastI].d) !== -1) {
      for (let i = lastI - 1; i >= 0; i--) {
        if (time - dirs[i + 1].t > releaseTime) break;
        if (release.indexOf(dirs[i].d) === -1) { ends.push(i); break; }
      }
    }
    for (let e = 0; e < ends.length; e++) {
      const end = ends[e];
      if (time - dirs[end].t > limit || dirs[end].d !== seq[seq.length - 1]) continue;
      let s = seq.length - 2;
      let prevT = dirs[end].t;
      let ok = s < 0;
      for (let i = end - 1; i >= 0 && s >= 0; i--) {
        if (time - dirs[i].t > limit) { ok = false; break; }
        const d = dirs[i].d;
        if (d === 5) continue;
        if (d === seq[s + 1]) continue;
        if (d !== seq[s]) { ok = false; break; }
        if (tapGap && s === 0 && prevT - dirs[i].t > tapGap) { ok = false; break; }
        prevT = dirs[i].t;
        s--;
        ok = s < 0;
      }
      if (ok && s < 0) return true;
    }
    return false;
  }

  function commandMatches(p, cmd) {
    if (motion(p, cmd.seq, cmd.window, cmd)) return true;
    const alt = cmd.alt || [];
    for (let i = 0; i < alt.length; i++) if (motion(p, alt[i], cmd.window, cmd)) return true;
    return false;
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
      holdL: left, holdR: right
    };
  }

  function emptyInput() {
    return { x: 0, up: false, down: false, lp: false, hp: false, lk: false, hk: false, holdL: false, holdR: false };
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

  function aiSpecial(me, tag, strength) {
    const list = me.def.byAi[tag];
    if (!list || !list.length) return false;
    const id = list[Math.floor(Math.random() * list.length)];
    return startMove(me, id, strength || 'strong');
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
    const strength = level.special > 0.1 ? 'strong' : 'weak';
    if (dist > level.engage) {
      if (level.special && dist > 160 && dist < 320 && Math.random() < level.special * 0.45 && aiSpecial(me, 'projectile', strength)) {
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
    const om = other.move && other.def.moves[other.move];
    if (attacking && dist < 132 && Math.random() < level.block) {
      me.blockFor = level.blockTime;
      if (om && om.hits[0] && om.hits[0].level === 'low' && level.block > 0.25 && Math.random() < 0.6) me.blockLow = true;
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
    if (roll < level.special && dist > 64 && dist < 280) {
      const tag = dist > 150 ? 'projectile' : 'special';
      if (aiSpecial(me, tag, strength)) return packAi(ai);
    }
    if (dist < level.range && roll < level.special + level.heavy) {
      me.aiQueue = Math.random() < 0.5 ? 'hp' : 'hk';
      return packAi(ai);
    }
    if (dist < level.range + 14 && roll < level.special + level.heavy + level.light) {
      me.aiQueue = Math.random() < 0.55 ? 'lp' : 'lk';
      return packAi(ai);
    }
    if (Math.random() < level.jump && dist > 78 && dist < 200) me.aiQueue = 'up';
    return packAi(ai);
  }

  function holdingBack(p, inp) {
    return (p.face > 0 && inp.holdL) || (p.face < 0 && inp.holdR);
  }

  function noteButtons(p, inp) {
    if (inp.lp || inp.hp) {
      p.btnAt.punch = time;
      p.btnAt.punchStrong = !!inp.hp;
    }
    if (inp.lk || inp.hk) {
      p.btnAt.kick = time;
      p.btnAt.kickStrong = !!inp.hk;
    }
  }

  function btnRecent(p, kind) {
    const at = kind === 'kick' ? p.btnAt.kick : p.btnAt.punch;
    return time - at <= 0.16;
  }

  function strengthOf(inp, kind) {
    if (kind === 'kick') return inp.hk ? 'strong' : 'weak';
    return inp.hp ? 'strong' : 'weak';
  }

  function cmdStrength(p, inp, kind) {
    if (kind === 'kick') {
      if (inp.hk) return 'strong';
      if (inp.lk) return 'weak';
      return p.btnAt.kickStrong ? 'strong' : 'weak';
    }
    if (inp.hp) return 'strong';
    if (inp.lp) return 'weak';
    return p.btnAt.punchStrong ? 'strong' : 'weak';
  }

  function tryAttack(p, inp) {
    const punch = inp.lp || inp.hp;
    const kick = inp.lk || inp.hk;
    if (p.state === 'jump') {
      if ((punch || kick) && !p.airUsed) {
        p.airUsed = true;
        const air = p.def.normals.air;
        const id = (inp.hk && air.hk) || (inp.hp && air.hp) || (inp.lk && air.lk) || air.lp;
        if (id) startMove(p, id, strengthOf(inp, kick ? 'kick' : 'punch'));
      }
      return;
    }
    if (!canAct(p)) {
      if (punch || kick) p.buffer = { inp: { lp: inp.lp, hp: inp.hp, lk: inp.lk, hk: inp.hk, down: inp.down, x: inp.x }, until: time + 0.17 };
      return;
    }
    const cmds = p.def.commands || [];
    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      if (cmd.type !== 'motion' || !btnRecent(p, cmd.btn)) continue;
      if (!commandMatches(p, cmd)) continue;
      startMove(p, cmd.move, cmdStrength(p, inp, cmd.btn));
      return;
    }
    const table = inp.down ? p.def.normals.crouch : p.def.normals.stand;
    const id = (inp.hp && table.hp) || (inp.lp && table.lp) || (inp.hk && table.hk) || (inp.lk && table.lk);
    if (id) startMove(p, id, (inp.hp || inp.hk) ? 'strong' : 'weak');
  }

  function tickAnim(p, dt) {
    if (p.state === 'jump' || p.state === 'launch') {
      const n = animOf(p).frames;
      const jv = p.def.phys.jumpV;
      if (p.vy < jv * 0.24) p.frame = Math.min(1, n - 1);
      else if (p.vy < -jv * 0.26) p.frame = Math.min(2, n - 1);
      else p.frame = n - 1;
      return;
    }
    if (p.state === 'idle') setAnim(p, 'stance');
    if (p.state === 'walk' || p.state === 'dash') setAnim(p, p.state === 'dash' ? 'dash' : 'walk');
    const a = animOf(p);
    if (!a) return;
    const mv = moveOf(p);
    if ((p.state === 'crouch' || (p.state === 'attack' && mv && mv.pose === 'crouch')) && p.anim === 'crouch') {
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
    const h = p.def.hurt;
    const box = (p.state === 'knockdown' || p.state === 'ko') ? h.down
      : (p.y < FLOOR - 6) ? h.air
      : (p.state === 'crouch' || (moveOf(p) && moveOf(p).pose === 'crouch')) ? h.crouch
      : h.stand;
    return { x: p.x + box.x, y: p.y + box.y, w: box.w, h: box.h };
  }

  function liveHit(p) {
    const m = moveOf(p);
    if (!m || p.state !== 'attack') return null;
    for (let i = 0; i < m.hits.length; i++) {
      if (p.landed[i]) continue;
      if (m.hits[i].active.indexOf(p.frame) >= 0) return { i, hit: m.hits[i], move: m };
    }
    return null;
  }

  function attackBox(p) {
    const live = liveHit(p);
    if (!live || !live.hit.box) return null;
    const b = live.hit.box;
    const x = p.face > 0 ? p.x + b.x : p.x - b.x - b.w;
    return { x, y: p.y + b.y, w: b.w, h: b.h, live };
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function blocking(defender, hit, inp) {
    if (defender.invuln > 0) return false;
    if (defender.state === 'jump' || defender.state === 'launch' || defender.state === 'knockdown' || defender.state === 'ko' || defender.state === 'attack' || defender.state === 'hit') return false;
    if (!holdingBack(defender, inp)) return false;
    if (hit.level === 'low' && !inp.down) return false;
    if (hit.level === 'overhead' && inp.down) return false;
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
        w: w >= 4 && i % 4 === 0 ? 4 : 2, h: 2,
        color: colors[i % colors.length]
      });
    }
    if (!blocked && feetX != null) {
      for (let i = 0; i < 2 + w; i++) {
        bits.push({
          x: feetX + (Math.random() - 0.5) * 12, y: feetY - 1,
          vx: spd(dir * (0.15 + Math.random() * (0.35 + w * 0.12))),
          vy: spd(-0.12 - Math.random() * 0.4),
          w: 3, h: 2, color: i % 2 ? '#e7d3a1' : '#ffcb3d'
        });
      }
    }
    const life = sec(16 + w * 4);
    impacts.push({ x, y, dir, weight: w, blocked, life, max: life, bits });
  }

  function applyHit(attacker, defender, hit, move, blocked, point, hitIndex) {
    const dir = attacker.face || 1;
    const w = hit.weight || 1;
    let prevClean = hitIndex > 0;
    if (hitIndex != null) {
      for (let k = 0; k < hitIndex; k++) if (attacker.landed[k] !== 'hit') prevClean = false;
      attacker.landed[hitIndex] = blocked ? 'block' : 'hit';
    }
    const cleanBoth = !blocked && hit.knockdown && (!hit.requiresPrev || prevClean);
    const scale = attacker.combo <= 1 ? 1 : Math.max(0.55, 1 - (attacker.combo - 1) * 0.08);
    const dmg = Math.round((hit.damage || 0) * (blocked ? 0 : scale));
    if (!trainOn()) defender.hp = Math.max(0, defender.hp - dmg);
    else if (dmg > 0) {
      defender.hp = Math.max(1, defender.hp - dmg);
      defender.regenWait = sec(22 + w * 6);
    }
    defender.flash = blocked ? sec(2) : sec(2 + Math.min(4, w));
    hitstop = Math.max(hitstop, blocked ? Math.max(sec(3), (hit.stop || sec(4)) - sec(3)) : (hit.stop || sec(4)));
    shake = Math.max(shake, blocked ? 1.4 : (hit.shake || 2));
    hitKick = dir * (blocked ? 1.4 : 1.8 + w * 1.05);
    const zoom = !blocked && (hit.zoom || move.zoom || (w >= 4 ? 0.45 : 0));
    if (zoom) zoomPunch = Math.max(zoomPunch, zoom);
    if (!blocked && w >= 4) flashScreen = Math.max(flashScreen, sec(w >= 5 ? 3 : 2));
    const slide = (hit.slide || 0) * (blocked ? 0.38 : 1);
    defender.kb = dir * slide;
    if (!hit.keepAir) defender.vx = 0;
    const pt = point || { x: defender.x - dir * 18, y: defender.y - 80 };
    spawnImpact(pt.x, pt.y, w, blocked, dir, defender.x, defender.y);
    impactSound(w, blocked);
    const col = blocked ? '#96ffeb' : ['#fff4c2', '#ffe08a', '#ffcb3d', '#ff9a3c', '#ff6b3d'][Math.min(4, w - 1)];
    if (blocked) {
      defender.state = 'block';
      defender.stun = hit.block || sec(8);
      setAnim(defender, defender.inpDown ? 'crouch' : 'block', true);
      floaters.push({ x: defender.x, y: defender.y - 108, text: 'bloqueo', life: sec(26), max: sec(26), vy: spd(-0.28), color: '#96ffeb', size: 15 });
      attacker.combo = 0;
      attacker.comboTimer = 0;
      return;
    }
    attacker.didHit = true;
    attacker.combo = (attacker.comboTimer > 0 ? attacker.combo : 0) + 1;
    attacker.comboTimer = sec(72) + (hit.stun || sec(12));
    attacker.comboAge = 0;
    defender.combo = 0;
    defender.comboTimer = 0;
    const life = sec(30 + w * 4);
    floaters.push({ x: defender.x, y: defender.y - 118, text: String(dmg), life, max: life, vy: spd(-0.22 - w * 0.03), color: col, size: 14 + w * 4 });
    if (defender.hp <= 0 && !trainOn()) {
      defender.state = 'ko';
      defender.stun = 99;
      defender.kb = dir * Math.max(slide, spd(3.2));
      setAnim(defender, 'ko', true);
      voice(defender.def, 'ko');
      endRound(attacker);
      return;
    }
    if (hit.launch) {
      defender.state = 'launch';
      defender.vy = spd(-8.6);
      defender.vx = dir * spd(1.6);
      defender.kb = dir * slide * 0.45;
      defender.y -= 2;
      setAnim(defender, 'hit', true);
      return;
    }
    if (cleanBoth || (hit.knockdown && !hit.requiresPrev)) {
      defender.state = 'knockdown';
      defender.stun = sec(40);
      defender.kb = dir * Math.max(slide, spd(3.2));
      setAnim(defender, 'knockdown', true);
      voice(defender.def, 'knockdown');
      return;
    }
    defender.state = 'hit';
    defender.stun = hit.stun || sec(12);
    setAnim(defender, defender.inpDown ? 'crouch_hit' : 'hit', true);
  }

  function endRound(winner) {
    phase = 'end';
    let note = 'Tiempo';
    if (winner) {
      wins[winner.id]++;
      winner.state = 'victory';
      const which = wins[winner.id] % 2 ? 'victory1' : 'victory2';
      setAnim(winner, which, true);
      voice(winner.def, which);
      note = wins[winner.id] >= 2 ? 'Gana la pelea' : 'Ronda';
      banner.innerHTML = `VOLTIA ${winner.id + 1}<small>${note}</small>`;
    } else {
      const a = P[0].hp, b = P[1].hp;
      if (a !== b) {
        const w = a > b ? P[0] : P[1];
        wins[w.id]++;
        w.state = 'victory';
        setAnim(w, 'victory1', true);
        voice(w.def, 'victory1');
      }
      banner.innerHTML = a === b ? 'Empate' : `VOLTIA ${a > b ? 1 : 2}<small>por tiempo</small>`;
    }
    syncUi();
  }

  function spawnBolt(p, m) {
    if (p.bolt || !m.projectile) return;
    const pr = m.projectile;
    const speed = pr.speeds[p.strength] || pr.speeds.strong;
    const bolt = {
      owner: p.id,
      x: p.x + p.face * pr.offset.x,
      y: p.y + pr.offset.y,
      vx: p.face * speed,
      frame: 0, acc: 0, life: pr.range ? pr.range / speed : pr.life,
      def: pr, face: p.face
    };
    p.bolt = bolt;
    p.spawned = true;
    bolts.push(bolt);
    if (pr.voice) voice(p.def, pr.voice);
  }

  function resolveHits(inputs) {
    for (let n = 0; n < 2; n++) {
      const p = P[n];
      if (p.state !== 'attack') continue;
      const m = moveOf(p);
      if (!m) continue;
      if (m.spawn != null && !p.spawned && p.frame >= m.spawn) spawnBolt(p, m);
      const box = attackBox(p);
      if (!box) continue;
      const other = opp(p);
      if (other.invuln > 0 || other.state === 'ko') continue;
      if (!overlap(box, hurtbox(other))) continue;
      const blocked = blocking(other, box.live.hit, inputs[other.id]);
      const pt = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      applyHit(p, other, box.live.hit, m, blocked, pt, box.live.i);
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const owner = P[b.owner];
      const other = opp(owner);
      const box = { x: b.x + b.def.box.x, y: b.y + b.def.box.y, w: b.def.box.w, h: b.def.box.h };
      if (other.invuln <= 0 && other.state !== 'ko' && overlap(box, hurtbox(other))) {
        const prev = owner.didHit;
        applyHit(owner, other, b.def.hit, { zoom: b.def.hit.zoom }, blocking(other, b.def.hit, inputs[other.id]), { x: b.x, y: b.y }, null);
        owner.didHit = prev;
        if (owner.bolt === b) owner.bolt = null;
        bolts.splice(i, 1);
      }
    }
  }

  function physics(p, dt) {
    if (p.state === 'jump' || p.state === 'launch' || p.y < FLOOR) {
      p.vy += p.def.phys.gravity * dt;
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
        } else if (p.state === 'attack' && p.animDone) p.state = 'idle';
      }
    }
    clampX(p);
  }

  function control(p, inp, dt) {
    p._down = inp.down;
    p.inpDown = inp.down;
    if (phase === 'fight' && !paused) noteButtons(p, inp);
    if (phase !== 'fight' || paused) {
      if (phase === 'end') tickAnim(p, dt);
      return;
    }
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);
    if (p.stun > 0) {
      p.stun = Math.max(0, p.stun - dt);
      if (p.stun <= 0 && (p.state === 'hit' || p.state === 'block')) {
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
      p.vx += inp.x * p.def.phys.airAccel * dt;
      const cap = p.def.phys.airMax;
      if (p.vx > cap) p.vx = cap;
      if (p.vx < -cap) p.vx = -cap;
      tickAnim(p, dt);
      physics(p, dt);
      return;
    }
    if (inp.up && (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch')) {
      p.state = 'jump';
      p.vy = p.def.phys.jumpV;
      p.vx = inp.x * p.def.phys.jumpX;
      p.airUsed = false;
      setAnim(p, inp.x ? 'fwdjump' : 'jump', true);
      voice(p.def, 'jump');
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
      p.x += p.face * p.def.phys.dash * dt;
      tickAnim(p, dt);
      if (p.animDone) p.state = 'idle';
      clampX(p);
      return;
    }
    if (inp.down) {
      p.state = 'crouch';
      setAnim(p, 'crouch');
      p.frame = Math.min(2, (animOf(p).frames || 3) - 1);
      p.vx = 0;
      return;
    }
    if (inp.x) {
      const back = inp.x !== p.face;
      p.state = 'walk';
      p.vx = inp.x * (back ? p.def.phys.walkB : p.def.phys.walkF);
      p.x += p.vx * dt;
      setAnim(p, 'walk');
      tickAnim(p, dt);
      clampX(p);
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
    if (!a || !b) return;
    if (a.y < FLOOR - 8 || b.y < FLOOR - 8) return;
    if (a.state === 'ko' || b.state === 'ko') return;
    const gap = 50;
    if (Math.abs(b.x - a.x) < gap) {
      const mid = (a.x + b.x) / 2;
      const s = b.x >= a.x ? 1 : -1;
      a.x = mid - s * gap / 2;
      b.x = mid + s * gap / 2;
      clampX(a);
      clampX(b);
    }
  }

  function slideAll(dt) {
    const decay = Math.pow(KB_DECAY, dt * HZ);
    for (let i = 0; i < 2; i++) {
      const p = P[i];
      if (!p.kb) continue;
      const before = p.x;
      p.x += p.kb * dt;
      clampX(p);
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
      if (b.life <= 0 || b.x < WALL_L - 80 || b.x > WALL_R + 80) {
        if (P[b.owner] && P[b.owner].bolt === b) P[b.owner].bolt = null;
        bolts.splice(i, 1);
      }
    }
  }

  function tickImpacts(dt) {
    const drag = Math.pow(0.97, dt * HZ);
    for (let i = impacts.length - 1; i >= 0; i--) {
      const s = impacts[i];
      s.life -= dt;
      for (let k = 0; k < s.bits.length; k++) {
        const b = s.bits[k];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy += accel(0.09) * dt;
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
    for (let i = 0; i < 2; i++) {
      const p = P[i];
      if (p.comboTimer > 0) {
        p.comboTimer -= dt;
        p.comboAge += dt;
        if (p.comboTimer <= 0) { p.combo = 0; p.comboAge = 0; }
      }
    }
  }

  function updateCamera(dt, snap) {
    if (!P[0] || !P[1]) return;
    const dist = Math.abs(P[0].x - P[1].x);
    const mid = (P[0].x + P[1].x) / 2;
    const t = Math.max(0, Math.min(1, (dist - 70) / 460));
    let wantW = 620 + t * 360;
    wantW *= 1 - Math.min(0.16, 0.1 * zoomPunch);
    let wantH = wantW * ASPECT;
    if (wantH > STAGE_H) { wantH = STAGE_H; wantW = wantH / ASPECT; }
    if (wantW > STAGE_W) { wantW = STAGE_W; wantH = wantW * ASPECT; }
    const floorBias = Math.min(0.86, 0.78 - t * 0.08 + Math.min(0.08, zoomPunch * 0.05));
    let x = mid - wantW / 2;
    let y = FLOOR - wantH * floorBias;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + wantW > STAGE_W) x = STAGE_W - wantW;
    if (y + wantH > STAGE_H) y = STAGE_H - wantH;
    const k = snap ? 1 : Math.min(1, dt * 5.5);
    cam.x += (x - cam.x) * k;
    cam.y += (y - cam.y) * k;
    cam.w += (wantW - cam.w) * k;
    cam.h += (wantH - cam.h) * k;
  }

  function step(dt) {
    if (paused || phase === 'load' || !P[0]) return;
    if (hitstop > 0) {
      hitstop = Math.max(0, hitstop - dt);
      tickImpacts(dt);
      updateCamera(dt, false);
      shake *= Math.pow(0.93, dt * HZ);
      if (shake < 0.3) shake = 0;
      return;
    }
    if (zoomPunch > 0) zoomPunch = Math.max(0, zoomPunch - dt * 2.4);
    worldTime += dt;
    time += dt;
    updateCamera(dt, false);
    if (phase === 'menu') {
      for (let i = 0; i < 2; i++) tickAnim(P[i], dt);
      return;
    }
    if (phase === 'intro') {
      if (time > 1.05) { phase = 'fight'; banner.textContent = ''; }
      else banner.innerHTML = time > 0.65 ? '¡YA!' : 'Preparados';
      for (let i = 0; i < 2; i++) tickAnim(P[i], dt);
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
    for (let i = 0; i < 2; i++) {
      const p = P[i];
      if (trainOn()) {
        if (p.regenWait > 0) p.regenWait = Math.max(0, p.regenWait - dt);
        else if (p.hp < p.def.maxHp) p.hp = Math.min(p.def.maxHp, p.hp + 51 * dt);
      }
      const follow = 1 - Math.pow(0.94, dt * HZ);
      p.trail += (p.hp - p.trail) * follow;
      if (Math.abs(p.trail - p.hp) < 0.4) p.trail = p.hp;
    }
    tickImpacts(dt);
    tickCombos(dt);
    shake *= Math.pow(0.84, dt * HZ);
    if (shake < 0.3) shake = 0;
    hitKick *= Math.pow(0.78, dt * HZ);
    if (Math.abs(hitKick) < 0.15) hitKick = 0;
    if (flashScreen > 0) flashScreen = Math.max(0, flashScreen - dt);
    pressed.clear();
  }

  function worldToScreen(x, y) {
    const sx = cv.width / view.w;
    const sy = cv.height / view.h;
    return [(x - view.x) * sx, (y - view.y) * sy, sx, sy];
  }

  function drawSheet(p, col, row, x, y, face, pivotX, pivotY, scale) {
    const art = p.def.art;
    const [sx, sy, scx, scy] = worldToScreen(x, y);
    const cw = art.cell[0], ch = art.cell[1];
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(face, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.img, col * cw, row * ch, cw, ch,
      -pivotX * scale * scx, -pivotY * scale * scy, cw * scale * scx, ch * scale * scy);
    ctx.restore();
  }

  function drawShadow(p) {
    const lift = Math.max(0, FLOOR - p.y);
    const grow = 1 + Math.min(0.42, lift / 230);
    const [fx, fy, scx, scy] = worldToScreen(p.x, FLOOR);
    ctx.fillStyle = SIDE[p.id];
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 22 * grow * scx, 7 * grow * scy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFighter(p) {
    // El destello ilumina. No se oculta el sprite: en el freeze del golpe se quedaba invisible.
    const a = animOf(p);
    const frame = Math.max(0, Math.min(a.frames - 1, p.frame || 0));
    drawSheet(p, frame, a.row, p.x, p.y, p.face, p.def.pivot[0], p.def.pivot[1], p.def.scale);
    if (p.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7;
      drawSheet(p, frame, a.row, p.x, p.y, p.face, p.def.pivot[0], p.def.pivot[1], p.def.scale);
      ctx.restore();
    }
  }

  function drawImpacts() {
    for (let n = 0; n < impacts.length; n++) {
      const s = impacts[n];
      const [sx, sy, kx] = worldToScreen(s.x, s.y);
      const age = 1 - s.life / s.max;
      const alpha = Math.max(0, s.life / s.max);
      const col = s.blocked ? '#96ffeb' : (s.weight >= 4 ? '#fff1b0' : '#ffcb3d');
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.lineWidth = s.weight >= 3 ? 3 : 2;
      const ringR = (5 + s.weight * 4 + age * (10 + s.weight * 8)) * kx;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(3, ringR), 0, Math.PI * 2);
      ctx.stroke();
      const rays = s.blocked ? 4 : 4 + s.weight * 2;
      const reach = (7 + s.weight * 5) * (1 - age * 0.45) * kx;
      for (let i = 0; i < rays; i++) {
        const spread = (i - (rays - 1) / 2) * 0.42;
        const ang = Math.atan2(-0.42, s.dir || 1) + spread;
        ctx.strokeStyle = i % 2 ? '#fff' : col;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(ang) * reach, sy + Math.sin(ang) * reach * 0.72);
        ctx.stroke();
      }
      for (let i = 0; i < s.bits.length; i++) {
        const b = s.bits[i];
        const [px, py, bkx, bky] = worldToScreen(b.x, b.y);
        ctx.fillStyle = b.color;
        ctx.fillRect(px, py, Math.max(2, b.w * bkx), Math.max(2, b.h * bky));
      }
      ctx.restore();
    }
  }

  function paintBeam(fxx, lampX, lampY, floorX, floorY, w0, w1, rgb, alpha) {
    const y0 = lampY - view.y;
    const y1 = floorY - view.y;
    const span = y1 - y0;
    if (span <= 1) return;
    fxx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
    const yStart = Math.max(0, y0 | 0);
    const yEnd = Math.min(fxx.canvas.height - 1, y1 | 0);
    for (let y = yStart; y <= yEnd; y++) {
      const t = (y - y0) / span;
      const cxw = lampX + (floorX - lampX) * t - view.x;
      const half = w0 + (w1 - w0) * t;
      const left = Math.max(0, Math.round(cxw - half));
      const right = Math.min(fxx.canvas.width, Math.round(cxw + half));
      if (right > left) fxx.fillRect(left, y, right - left, 1);
    }
  }

  function drawSpots() {
    if (!spec || !spec.spots) return;
    if (!fxCanvas) fxCanvas = document.createElement('canvas');
    const cw = Math.max(1, view.w | 0);
    const ch = Math.max(1, view.h | 0);
    if (fxCanvas.width !== cw || fxCanvas.height !== ch) {
      fxCanvas.width = cw;
      fxCanvas.height = ch;
    }
    const fxx = fxCanvas.getContext('2d');
    fxx.imageSmoothingEnabled = false;
    fxx.clearRect(0, 0, cw, ch);
    const t = performance.now() / 1000;
    for (let i = 0; i < spec.spots.length; i++) {
      const s = spec.spots[i];
      const wobble = 0.85 + 0.15 * Math.sin(t * 7 + s.phase);
      const swing = Math.sin(t * s.speed + s.phase) * s.amp;
      const floorX = s.x + swing;
      paintBeam(fxx, s.x, s.y, floorX, s.y1, 1, s.wide, s.color, s.alpha * wobble);
      paintBeam(fxx, s.x, s.y, floorX, s.y1, 1, s.wide * 0.35, s.color, s.alpha * 1.6 * wobble);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(fxCanvas, 0, 0, cv.width, cv.height);
    ctx.restore();
  }

  function drawSmoke() {
    if (!smoke.length || !spec || !spec.smoke) return;
    const now = performance.now();
    for (let i = 0; i < spec.smoke.length; i++) {
      const s = spec.smoke[i];
      const cycle = s.cycle || 20000;
      const puff = s.puff || 2400;
      const u = (now + (s.delay || 0)) % cycle;
      if (u >= puff) continue;
      const fi = Math.min(smoke.length - 1, Math.floor(u / puff * smoke.length));
      const f = smoke[fi];
      const sc = s.scale || 1;
      const dw = f.width * sc;
      const dh = f.height * sc;
      const [sx, sy, kx, ky] = worldToScreen(s.x - dw / 2, s.y - dh);
      ctx.save();
      ctx.globalAlpha = s.alpha != null ? s.alpha : 0.5;
      if (s.flip) {
        ctx.translate(sx + dw * kx, sy);
        ctx.scale(-1, 1);
        ctx.drawImage(f, 0, 0, dw * kx, dh * ky);
      } else {
        ctx.drawImage(f, sx, sy, dw * kx, dh * ky);
      }
      ctx.restore();
    }
  }

  function drawCombo() {
    if (phase !== 'fight' || paused) return;
    let best = null;
    for (let i = 0; i < 2; i++) {
      const p = P[i];
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
    const w = Math.max(1, Math.round(cam.w));
    const h = Math.max(1, Math.round(cam.h));
    const jx = ((shake ? (Math.random() - 0.5) * shake * 1.25 : 0) + hitKick) * w / cv.width;
    const jy = (shake ? (Math.random() - 0.5) * shake * 0.65 : 0) * h / cv.height;
    let x = Math.round(cam.x + jx);
    let y = Math.round(cam.y + jy);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > STAGE_W) x = Math.max(0, STAGE_W - w);
    if (y + h > STAGE_H) y = Math.max(0, STAGE_H - h);
    view = { x, y, w, h };
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bg, view.x, view.y, view.w, view.h, 0, 0, cv.width, cv.height);
    if (led.length && spec && spec.screens) {
      const f = led[Math.floor(worldTime * (HZ / 10)) % led.length];
      for (let i = 0; i < spec.screens.length; i++) {
        const s = spec.screens[i];
        const [sx, sy, kx, ky] = worldToScreen(s.x, s.y);
        ctx.drawImage(f, sx, sy, f.width * kx, f.height * ky);
      }
    }
    if (crowd.length && spec) {
      const tick = Math.floor(worldTime * (HZ / 9));
      const rows = spec.rows || [];
      for (let r = 0; r < rows.length; r++) {
        const band = rows[r];
        const stepX = band.step || crowd[0].width;
        let i = 0;
        for (let x = band.x0; x + stepX <= band.x1 + 8; x += stepX, i++) {
          const f = crowd[(tick + i + (band.phase || 0)) % crowd.length];
          let sw = f.width;
          const limit = band.xMax != null ? band.xMax : STAGE_W;
          if (x >= limit) continue;
          if (x + sw > limit) sw = limit - x;
          if (sw < 12) continue;
          const [sx, sy, kx, ky] = worldToScreen(x, band.feet - f.height);
          ctx.drawImage(f, 0, 0, sw, f.height, sx, sy, sw * kx, f.height * ky);
        }
      }
      if (spec.sides && spec.figs) {
        for (let i = 0; i < spec.sides.length; i++) {
          const s = spec.sides[i];
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
    if (ring) ctx.drawImage(ring, view.x, view.y, view.w, view.h, 0, 0, cv.width, cv.height);
    drawSmoke();
    for (let i = 0; i < 2; i++) drawShadow(P[i]);
    for (let i = 0; i < 2; i++) drawFighter(P[i]);
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      const owner = P[b.owner];
      const row = owner.def.art.anims[b.def.anim];
      if (!row) continue;
      drawSheet(owner, b.frame, row.row, b.x, b.y, b.vx > 0 ? 1 : -1, b.def.pivot[0], b.def.pivot[1], b.def.scale);
    }
    drawImpacts();
    drawSpots();
    ctx.textAlign = 'center';
    for (let i = 0; i < floaters.length; i++) {
      const t = floaters[i];
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
    if (flashScreen > 0) {
      ctx.fillStyle = 'rgba(255,246,220,' + Math.min(0.16, flashScreen * 2.2) + ')';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    if (showBoxes) {
      ctx.strokeStyle = '#7dff7d';
      for (let i = 0; i < 2; i++) {
        const h = hurtbox(P[i]);
        const [sx, sy, kx, ky] = worldToScreen(h.x, h.y);
        ctx.strokeRect(sx, sy, h.w * kx, h.h * ky);
        const ab = attackBox(P[i]);
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
    const max0 = P[0].def.maxHp, max1 = P[1].def.maxHp;
    document.getElementById('h1').style.width = Math.max(0, P[0].hp / max0 * 100) + '%';
    document.getElementById('t1').style.width = Math.max(0, P[0].trail / max0 * 100) + '%';
    document.getElementById('h2').style.width = Math.max(0, P[1].hp / max1 * 100) + '%';
    document.getElementById('t2').style.width = Math.max(0, P[1].trail / max1 * 100) + '%';
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
    const n1 = document.getElementById('n1');
    const n2 = document.getElementById('n2');
    if (n1 && P[0]) n1.textContent = P[0].def.name;
    if (n2 && P[1]) {
      if (phase === 'menu' || phase === 'load') n2.textContent = P[1].def.name;
      else if (trainOn()) n2.textContent = 'MUÑECO';
      else if (!cpuOn()) n2.textContent = P[1].def.name + ' 2';
      else n2.textContent = 'CPU · ' + aiLevel().name.toUpperCase();
    }
    const pauseLine = document.getElementById('pause-line');
    if (pauseLine) pauseLine.textContent = trainOn() ? 'Entrenamiento' : (cpuOn() ? 'Pelea · ' + aiLevel().name : 'Versus');
    paintMenu();
    paintMusic();
  }

  function paintMenu() {
    document.querySelectorAll('#menu-nav .item').forEach((el, i) => el.classList.toggle('on', i === menuIndex));
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
      levelId = LEVEL_ORDER[(i + (code === 'ArrowRight' ? 1 : -1) + LEVEL_ORDER.length) % LEVEL_ORDER.length];
    } else if (code === 'Enter') { activateMenu(); return; }
    else return;
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
    if (sheetReady && P[0]) {
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
    if (P[0]) P[0].bolt = null;
    if (P[1]) P[1].bolt = null;
  }

  function placeFighters() {
    P[0] = makeFighter(0, 500, MATCH[0]);
    P[1] = makeFighter(1, 844, MATCH[1]);
    if (cpuOn() && !trainOn()) P[1].aiCd = aiLevel().think[0];
  }

  function resetRound(clearWins) {
    if (clearWins) wins = [0, 0];
    placeFighters();
    clearFx();
    timer = ROUND_TIME;
    time = 0;
    zoomPunch = 0;
    phase = 'intro';
    paused = false;
    banner.textContent = 'Preparados';
    pressed.clear();
    updateCamera(1, true);
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
    placeFighters();
    clearFx();
    timer = ROUND_TIME;
    time = 0;
    zoomPunch = 0;
    wins = [0, 0];
    banner.textContent = '';
    pressed.clear();
    updateCamera(1, true);
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
    if (music && !music.paused) { music.pause(); paintMusic(); return; }
    if (!music) {
      music = new Audio('../voltia/theme.wav?v=3');
      music.loop = true;
      music.volume = 0.45;
    }
    try { await music.play(); paintMusic(); }
    catch (err) { document.getElementById('status').textContent = 'No se pudo poner la música.'; }
  }

  document.querySelectorAll('#menu-nav .item').forEach((el, i) => {
    el.addEventListener('click', () => { menuIndex = i; el.blur(); activateMenu(); });
  });
  document.querySelectorAll('#levels button').forEach((el) => {
    el.addEventListener('click', () => {
      levelId = el.getAttribute('data-level');
      menuIndex = 0;
      el.blur();
      startMatch('fight');
    });
  });
  document.getElementById('resume').onclick = () => togglePause();
  document.getElementById('pause-menu').onclick = () => toMenu();
  document.getElementById('pause-music').onclick = () => toggleMusic();
  document.getElementById('rematch').onclick = () => again();
  document.getElementById('to-menu').onclick = () => toMenu();
  paintMenu();

  async function loadChar(id) {
    if (chars[id]) return;
    const raw = window.ROSTER && window.ROSTER[id];
    if (!raw) throw new Error('falta la ficha de ' + id);
    const compiled = compileChar(raw);
    if (!artCache[raw.sheet]) {
      const sheetUrl = new URL(raw.sheet, location.href);
      const meta = await (await fetch(sheetUrl.href, { cache: 'no-store' })).json();
      const img = await loadImage(new URL(meta.sprite, sheetUrl).href);
      const anims = {};
      for (let i = 0; i < meta.animations.length; i++) anims[meta.animations[i].id] = meta.animations[i];
      artCache[raw.sheet] = { img, anims, cell: [meta.cell.w, meta.cell.h] };
    }
    compiled.art = artCache[raw.sheet];
    chars[id] = compiled;
  }

  (async () => {
    try {
      for (let i = 0; i < MATCH.length; i++) await loadChar(MATCH[i]);
      const sfxAll = HIT_SFX.weak.concat(HIT_SFX.strong);
      for (let i = 0; i < sfxAll.length; i++) new Audio(sfxAll[i]);
      spec = await (await fetch('../voltia/stage/stage.json', { cache: 'no-store' })).json();
      bg = await loadImage('../voltia/stage/' + spec.active);
      ring = await loadImage('../voltia/stage/' + spec.ring);
      for (let i = 0; i < 4; i++) {
        crowd.push(await loadImage('../voltia/stage/crowd/f' + i + '.png'));
        led.push(await loadImage('../voltia/stage/led/f' + i + '.png'));
      }
      for (let i = 0; i < 8; i++) smoke.push(await loadImage('../voltia/stage/fx/smoke_f' + i + '.png'));
      placeFighters();
      updateCamera(1, true);
      sheetReady = true;
      phase = 'menu';
      syncUi();
      requestAnimationFrame(frame);
    } catch (err) {
      document.getElementById('status').textContent = 'No se pudo cargar la pelea: ' + err.message;
    }
  })();
})();

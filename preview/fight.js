/* Motor de pelea v0. Voltia contra Voltia, para probar el tacto.
   El visor no se toca: esto vive en preview/fight.html. */
(function () {
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

  const MOVES = {
    punch_weak: {
      anim: 'punch_weak', active: [1], damage: 40, stun: 14, block: 9,
      push: 28, stop: 5, level: 'mid', box: { x: 16, y: -90, w: 38, h: 22 }
    },
    punch_strong: {
      anim: 'punch_strong', active: [2, 3], damage: 72, stun: 18, block: 12,
      push: 46, stop: 7, level: 'mid', box: { x: 18, y: -92, w: 54, h: 26 }
    },
    kick_weak_stand: {
      anim: 'kick_weak_stand', active: [1], damage: 46, stun: 15, block: 10,
      push: 32, stop: 5, level: 'mid', box: { x: 18, y: -64, w: 52, h: 24 }
    },
    kick_weak: {
      anim: 'kick_weak', active: [1], damage: 62, stun: 8, block: 12,
      push: 40, stop: 6, level: 'low', knockdown: true, box: { x: 12, y: -30, w: 66, h: 22 }
    },
    kick_strong: {
      anim: 'kick_strong', active: [2, 3], damage: 84, stun: 20, block: 13,
      push: 54, stop: 7, level: 'mid', box: { x: 20, y: -108, w: 68, h: 30 }
    },
    crouch_punch: {
      anim: 'crouch_punch', active: [1], damage: 36, stun: 16, block: 10,
      push: 22, stop: 4, level: 'low', box: { x: 14, y: -42, w: 42, h: 18 }
    },
    jump_kick: {
      anim: 'jump_kick', active: [1], damage: 64, stun: 16, block: 12,
      push: 36, stop: 6, level: 'overhead', box: { x: 14, y: -58, w: 58, h: 26 }
    },
    uppercut: {
      anim: 'uppercut', active: [1, 2], damage: 100, stun: 8, block: 14,
      push: 20, stop: 9, level: 'mid', launch: true, box: { x: 2, y: -128, w: 42, h: 86 }
    },
    spinkick: {
      anim: 'spinkick', active: [2, 3, 4], damage: 108, stun: 8, block: 16,
      push: 60, stop: 8, level: 'mid', knockdown: true, box: { x: 6, y: -98, w: 72, h: 42 }
    },
    rayo_throw: {
      anim: 'rayo_throw', active: [], damage: 0, stun: 0, block: 0,
      push: 0, stop: 0, level: 'mid', spawn: 2, box: null
    }
  };

  const P1K = {
    left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
    lp: 'KeyF', hp: 'KeyG', lk: 'KeyR', hk: 'KeyT'
  };
  const P2K = {
    left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
    lp: 'KeyK', hp: 'KeyL', lk: 'KeyO', hk: 'KeyP'
  };

  const down = new Set();
  const pressed = new Set();
  const holdKeys = new Set([
    'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Space'
  ]);
  window.addEventListener('keydown', (e) => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (holdKeys.has(e.code)) e.preventDefault();
    if (e.code === 'Escape') togglePause();
    if (e.code === 'Enter' && (phase === 'end' || phase === 'intro')) again();
    resumeAudio();
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
  let clock = 0;
  let hitstop = 0;
  let shake = 0;
  let shx = 0;
  let shy = 0;
  let timer = ROUND_TIME;
  let timerAcc = 0;
  let showBoxes = false;
  let cpuOn = true;
  let train = false;
  let wins = [0, 0];
  let matchNote = '';
  let sparks = [];
  let bolts = [];
  let floaters = [];
  let actx = null;
  let music = null;

  function resumeAudio() {
    if (!actx) actx = new AudioContext();
    if (actx.state === 'suspended') actx.resume();
  }

  function blip(freq, dur, gain) {
    resumeAudio();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur);
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
      stun: 0, invuln: 0, flash: 0, combo: 0, comboClock: 0,
      dirs: [], lastFwd: -99, buffer: null,
      blockFor: 0, aiCd: 0
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
    return phase === 'fight' && !paused && p.stun <= 0 && p.invuln >= 0 &&
      (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch');
  }

  function startMove(p, id) {
    const m = MOVES[id];
    if (!m) return;
    p.state = 'attack';
    p.move = id;
    p.didHit = false;
    p.spawned = false;
    p.buffer = null;
    p.vx = 0;
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
    if (!last || last.d !== d) p.dirs.push({ d, f: clock });
    if (p.dirs.length > 14) p.dirs.shift();
  }

  function motion(p, seq) {
    let i = p.dirs.length - 1;
    for (let s = seq.length - 1; s >= 0; s--) {
      let found = false;
      while (i >= 0) {
        if (clock - p.dirs[i].f > 32) return false;
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

  function cpuInput(me) {
    const other = opp(me);
    const dist = Math.abs(other.x - me.x);
    const ai = { left: false, right: false, up: false, down: false, lp: false, hp: false, lk: false, hk: false };
    if (me.blockFor > 0) {
      me.blockFor--;
      if (me.face > 0) ai.left = true;
      else ai.right = true;
      if (other.move && MOVES[other.move] && MOVES[other.move].level === 'low' && Math.random() < 0.65) ai.down = true;
    } else if (phase === 'fight' && (me.state === 'idle' || me.state === 'walk' || me.state === 'crouch')) {
      const attacking = other.state === 'attack' && dist < 130;
      if (attacking && Math.random() < 0.08) me.blockFor = 18;
      else if (dist > 170) {
        if (me.face > 0) ai.right = true;
        else ai.left = true;
        if (Math.random() < 0.004) startMove(me, 'rayo_throw');
      } else if (dist < 48 && Math.random() < 0.04) {
        if (me.face > 0) ai.left = true;
        else ai.right = true;
      } else if (Math.random() < 0.02) ai.lp = true;
      else if (Math.random() < 0.012) ai.lk = true;
      else if (Math.random() < 0.008) ai.hp = true;
      else if (Math.random() < 0.007) ai.hk = true;
      else if (Math.random() < 0.004) ai.up = true;
      else if (dist < 90 && Math.random() < 0.006) { ai.down = true; ai.hp = true; }
      else if (me.face > 0) ai.right = true;
      else ai.left = true;
    }
    return {
      x: (ai.right ? 1 : 0) - (ai.left ? 1 : 0),
      up: ai.up, down: ai.down,
      lp: ai.lp, hp: ai.hp, lk: ai.lk, hk: ai.hk,
      holdL: ai.left, holdR: ai.right
    };
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
      if (punch || kick) p.buffer = { inp: { lp: inp.lp, hp: inp.hp, lk: inp.lk, hk: inp.hk, down: inp.down, x: inp.x }, until: clock + 10 };
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

  function tickAnim(p) {
    if (p.state === 'jump' || p.state === 'launch') {
      const n = AN[p.anim].frames;
      if (p.vy < -2.2) p.frame = Math.min(1, n - 1);
      else if (p.vy < 2.4) p.frame = Math.min(2, n - 1);
      else p.frame = n - 1;
      return;
    }
    if (p.state === 'idle') { setAnim(p, 'stance'); }
    if (p.state === 'walk' || p.state === 'dash') { setAnim(p, p.state === 'dash' ? 'dash' : 'walk'); }
    const a = AN[p.anim];
    if (!a) return;
    if ((p.state === 'crouch' || (p.state === 'attack' && (p.move === 'crouch_punch' || p.move === 'kick_weak'))) && p.anim === 'crouch') {
      p.frame = Math.min(2, a.frames - 1);
      return;
    }
    const dur = 60 / a.fps;
    p.animAcc += 1;
    while (p.animAcc >= dur) {
      p.animAcc -= dur;
      p.frame++;
      if (p.frame >= a.frames) {
        if (a.loop && (p.state === 'idle' || p.state === 'walk' || p.state === 'block' || p.state === 'dizzy')) {
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

  function applyHit(attacker, defender, move, blocked) {
    attacker.didHit = true;
    const scale = attacker.combo <= 1 ? 1 : Math.max(0.5, 1 - (attacker.combo - 1) * 0.12);
    const dmg = Math.round(move.damage * (blocked ? 0 : scale));
    if (!train) defender.hp = Math.max(0, defender.hp - dmg);
    defender.flash = 8;
    hitstop = Math.max(hitstop, move.stop || 4);
    shake = blocked ? 2 : (move.launch || move.knockdown ? 7 : 4);
    const dir = attacker.face || 1;
    let push = (blocked ? move.push * 0.45 : move.push) * dir;
    defender.x += push;
    clamp(defender);
    if (defender.x === WALL_L || defender.x === WALL_R) attacker.x -= push * 0.65;
    clamp(attacker);
    const hx = (attackBox(attacker) || hurtbox(defender));
    sparks.push({ x: hx.x + hx.w / 2, y: hx.y + hx.h / 2, life: 12, blocked });
    if (blocked) {
      defender.state = 'block';
      defender.stun = move.block;
      setAnim(defender, inpDown(defender) ? 'crouch' : 'block', true);
      blip(520, 0.04, 0.04);
      floaters.push({ x: defender.x, y: defender.y - 110, text: 'bloqueo', life: 28, vy: -0.35, color: '#96ffeb' });
      attacker.combo = 0;
      return;
    }
    attacker.combo = (defender.comboClock > 0 ? attacker.combo : 0) + 1;
    defender.comboClock = (move.stun || 12) + 12;
    blip(move.launch ? 140 : 210, 0.06, 0.06);
    floaters.push({ x: defender.x, y: defender.y - 120, text: String(dmg), life: 36, vy: -0.45, color: '#ffcb3d' });
    if (defender.hp <= 0 && !train) {
      defender.state = 'ko';
      defender.stun = 999;
      setAnim(defender, 'ko', true);
      voice('voltia_ko');
      endRound(attacker);
      return;
    }
    if (move.launch) {
      defender.state = 'launch';
      defender.vy = -8.6;
      defender.vx = dir * 1.6;
      defender.y -= 2;
      setAnim(defender, 'hit', true);
      return;
    }
    if (move.knockdown) {
      defender.state = 'knockdown';
      defender.stun = 36;
      defender.vx = dir * 1.4;
      setAnim(defender, 'knockdown', true);
      voice('voltia_knockdown');
      return;
    }
    defender.state = 'hit';
    defender.stun = move.stun;
    setAnim(defender, defender.inpDown ? 'crouch_hit' : 'hit', true);
  }

  function inpDown(p) { return p._down; }

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
  }

  function resolveHits(inputs) {
    for (const p of P) {
      if (p.state !== 'attack') continue;
      const m = MOVES[p.move];
      if (!m) continue;
      if (m.spawn != null && !p.spawned && p.frame >= m.spawn) {
        p.spawned = true;
        bolts.push({
          owner: p.id, x: p.x + p.face * 48, y: p.y - 78, vx: p.face * 5.4,
          frame: 0, acc: 0, life: 100
        });
        voice('voltia_rayo_proj');
      }
      const box = attackBox(p);
      if (!box) continue;
      const other = opp(p);
      if (other.invuln > 0 || other.state === 'ko') continue;
      if (!overlap(box, hurtbox(other))) continue;
      const blocked = blocking(other, m, inputs[other.id]);
      applyHit(p, other, m, blocked);
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const owner = P[b.owner];
      const other = opp(owner);
      const box = { x: b.x - 18, y: b.y - 12, w: 36, h: 22 };
      if (other.invuln <= 0 && other.state !== 'ko' && overlap(box, hurtbox(other))) {
        const move = { damage: 74, stun: 16, block: 10, push: 30, stop: 6, level: 'mid' };
        const prevHit = owner.didHit;
        owner.combo = owner.combo || 0;
        applyHit(owner, other, move, blocking(other, move, inputs[other.id]));
        owner.didHit = prevHit;
        bolts.splice(i, 1);
      }
    }
  }

  function physics(p) {
    if (p.state === 'jump' || p.state === 'launch' || p.y < FLOOR) {
      p.vy += 0.42;
      p.x += p.vx;
      p.y += p.vy;
      if (p.y >= FLOOR) {
        p.y = FLOOR;
        p.vy = 0;
        p.vx = 0;
        p.airUsed = false;
        if (p.state === 'launch' || p.state === 'knockdown') {
          p.state = 'knockdown';
          p.stun = Math.max(p.stun, 28);
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

  function control(p, inp) {
    p._down = inp.down;
    p.inpDown = inp.down;
    if (phase !== 'fight' || paused) {
      if (phase === 'end') tickAnim(p);
      return;
    }
    if (p.invuln > 0) p.invuln--;
    if (p.flash > 0) p.flash--;
    if (p.comboClock > 0) p.comboClock--;
    else p.combo = 0;
    if (p.stun > 0) {
      p.stun--;
      if (p.stun === 0 && (p.state === 'hit' || p.state === 'block')) {
        p.state = inp.down ? 'crouch' : 'idle';
        p.move = null;
      }
      if (p.state === 'knockdown' && p.stun === 0) {
        p.state = 'idle';
        p.invuln = 14;
        p.move = null;
      }
      tickAnim(p);
      physics(p);
      return;
    }
    if (p.state === 'ko' || p.state === 'victory') { tickAnim(p); return; }
    if (p.state === 'launch') { tickAnim(p); physics(p); return; }

    rememberDir(p, relDir(p, inp));
    const fwdPress = (p.face > 0 && pressed.has(p.id === 0 ? P1K.right : (cpuOn && p.id === 1 ? '' : P2K.right)))
      || (p.face < 0 && pressed.has(p.id === 0 ? P1K.left : (cpuOn && p.id === 1 ? '' : P2K.left)));
    if (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch') {
      if (opp(p).x !== p.x) p.face = opp(p).x > p.x ? 1 : -1;
    }

    if (p.buffer && clock <= p.buffer.until && canAct(p)) {
      const b = p.buffer.inp;
      p.buffer = null;
      tryAttack(p, Object.assign({ holdL: inp.holdL, holdR: inp.holdR, x: inp.x, up: false }, b));
    }
    tryAttack(p, inp);

    if (p.state === 'attack') {
      tickAnim(p);
      if (p.animDone) {
        p.move = null;
        p.state = p.y < FLOOR - 1 ? 'jump' : (inp.down ? 'crouch' : 'idle');
      }
      physics(p);
      return;
    }

    if (p.state === 'jump') {
      p.vx += inp.x * 0.06;
      p.vx = Math.max(-3.1, Math.min(3.1, p.vx));
      tickAnim(p);
      physics(p);
      return;
    }

    if (inp.up && (p.state === 'idle' || p.state === 'walk' || p.state === 'crouch')) {
      p.state = 'jump';
      p.vy = -9.3;
      p.vx = inp.x * 2.3;
      p.airUsed = false;
      setAnim(p, inp.x ? 'fwdjump' : 'jump', true);
      voice('grunt_jump');
      tickAnim(p);
      physics(p);
      return;
    }

    if (fwdEdge(p, inp)) {
      p.state = 'dash';
      p.stun = 0;
      p.vx = p.face * 6.4;
      setAnim(p, 'dash', true);
    }

    if (p.state === 'dash') {
      p.x += p.face * 6.2;
      tickAnim(p);
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
      p.x += inp.x * (back ? 2.15 : 2.85);
      setAnim(p, 'walk');
      tickAnim(p);
      clamp(p);
      return;
    }

    p.state = 'idle';
    p.move = null;
    tickAnim(p);
  }

  function fwdEdge(p, inp) {
    const forward = inp.x === p.face && (
      (p.face > 0 && ((p.id === 0 && pressed.has('KeyD')) || (p.id === 1 && !cpuOn && pressed.has('ArrowRight')))) ||
      (p.face < 0 && ((p.id === 0 && pressed.has('KeyA')) || (p.id === 1 && !cpuOn && pressed.has('ArrowLeft'))))
    );
    if (!forward) return false;
    const ok = clock - p.lastFwd <= 16 && clock - p.lastFwd >= 3;
    p.lastFwd = clock;
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

  function updateBolts() {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx;
      b.life--;
      b.acc++;
      if (b.acc >= 5) { b.acc = 0; b.frame = (b.frame + 1) % 3; }
      if (b.life <= 0 || b.x < WALL_L - 40 || b.x > WALL_R + 40) bolts.splice(i, 1);
    }
  }

  function update() {
    if (paused || phase === 'load') return;
    clock++;
    if (hitstop > 0) { hitstop--; return; }
    const inputs = [
      humanInput(P1K),
      cpuOn ? cpuInput(P[1]) : humanInput(P2K)
    ];
    if (phase === 'intro') {
      if (clock > 40) { phase = 'fight'; banner.textContent = ''; }
      else banner.innerHTML = clock > 24 ? '¡YA!' : 'Preparados';
      for (const p of P) tickAnim(p);
      return;
    }
    if (phase === 'fight') {
      timerAcc++;
      if (timerAcc >= 60) {
        timerAcc = 0;
        timer--;
        if (timer <= 0) {
          if (train) timer = ROUND_TIME;
          else endRound(null);
        }
      }
    }
    for (let i = 0; i < 2; i++) control(P[i], inputs[i]);
    if (phase === 'fight') resolveHits(inputs);
    separate();
    updateBolts();
    for (const p of P) {
      p.trail += (p.hp - p.trail) * 0.08;
      if (Math.abs(p.trail - p.hp) < 0.4) p.trail = p.hp;
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      sparks[i].life--;
      if (sparks[i].life <= 0) sparks.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life--;
      floaters[i].y += floaters[i].vy;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
    if (shake > 0) shake--;
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
    if (p.flash > 0 && (p.flash % 2 === 0)) return;
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
    if (p.combo > 1 && p.comboClock > 0) {
      ctx.fillStyle = '#96ffeb';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const [cx] = worldToScreen(p.x, p.y - 150);
      ctx.fillText(p.combo + ' golpes', cx, worldToScreen(p.x, p.y - 150)[1]);
    }
  }

  function drawWorld() {
    ctx.imageSmoothingEnabled = false;
    shx = shake ? (Math.random() - 0.5) * shake * 2 : 0;
    shy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.drawImage(bg, CAM.x, CAM.y, CAM.w, CAM.h, 0, 0, cv.width, cv.height);
    if (led.length && spec && spec.screens) {
      const f = led[Math.floor(clock / 10) % led.length];
      for (const s of spec.screens) {
        const [sx, sy, kx, ky] = worldToScreen(s.x, s.y);
        ctx.drawImage(f, sx, sy, f.width * kx, f.height * ky);
      }
    }
    if (crowd.length && spec) {
      const tick = Math.floor(clock / 9);
      for (const band of spec.rows || []) {
        const step = band.step || crowd[0].width;
        let i = 0;
        for (let x = band.x0; x + step <= band.x1 + 8; x += step, i++) {
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
    for (const s of sparks) {
      const [sx, sy, kx] = worldToScreen(s.x, s.y);
      ctx.strokeStyle = s.blocked ? '#96ffeb' : '#ffcb3d';
      ctx.lineWidth = 2;
      const r = (12 - s.life) * 1.6 * kx + 6;
      ctx.beginPath();
      ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
      ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
      ctx.stroke();
    }
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const t of floaters) {
      const [sx, sy] = worldToScreen(t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.globalAlpha = Math.max(0, t.life / 28);
      ctx.fillText(t.text, sx, sy);
      ctx.globalAlpha = 1;
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
  }

  function drawHud() {
    const set = (id, hp, trail) => {
      document.getElementById(id).style.width = Math.max(0, hp / MAX_HP * 100) + '%';
      document.getElementById(id === 'h1' ? 't1' : 't2').style.width = Math.max(0, trail / MAX_HP * 100) + '%';
    };
    set('h1', P[0].hp, P[0].trail);
    set('h2', P[1].hp, P[1].trail);
    document.getElementById('timer').textContent = String(Math.max(0, timer));
    for (let i = 0; i < 2; i++) {
      const el = document.getElementById(i === 0 ? 'w1' : 'w2');
      el.innerHTML = '<i class="' + (wins[i] > 0 ? 'on' : '') + '"></i><i class="' + (wins[i] > 1 ? 'on' : '') + '"></i>';
    }
  }

  function frame() {
    if (phase !== 'load') update();
    if (sheet) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawWorld();
      drawHud();
    }
    requestAnimationFrame(frame);
  }

  function resetRound(clearWins) {
    if (clearWins) wins = [0, 0];
    P[0] = makeFighter(0, 530);
    P[1] = makeFighter(1, 810);
    bolts = [];
    sparks = [];
    floaters = [];
    timer = ROUND_TIME;
    timerAcc = 0;
    clock = 0;
    hitstop = 0;
    phase = 'intro';
    banner.textContent = 'Preparados';
    matchNote = '';
  }

  function again() {
    paused = false;
    resetRound(wins[0] >= 2 || wins[1] >= 2);
  }

  function togglePause() {
    if (phase === 'load' || phase === 'end') return;
    paused = !paused;
    banner.innerHTML = paused ? 'Pausa<small>Esc para seguir</small>' : '';
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(src));
      img.src = src;
    });
  }

  document.getElementById('cpu').onclick = (e) => {
    cpuOn = !cpuOn;
    e.target.classList.toggle('on', cpuOn);
    e.target.textContent = cpuOn ? 'P2: CPU' : 'P2: teclado';
  };
  document.getElementById('train').onclick = (e) => {
    train = !train;
    e.target.classList.toggle('on', train);
    e.target.textContent = train ? 'Entrenamiento: on' : 'Entrenamiento';
    if (train) { P[0].hp = P[1].hp = MAX_HP; }
  };
  document.getElementById('again').onclick = again;
  document.getElementById('boxes').onclick = (e) => {
    showBoxes = !showBoxes;
    e.target.classList.toggle('on', showBoxes);
  };
  document.getElementById('music').onclick = async (e) => {
    resumeAudio();
    if (music && !music.paused) {
      music.pause();
      e.target.textContent = '▶ Música';
      e.target.classList.remove('on');
      return;
    }
    if (!music) {
      music = new Audio('../voltia/theme.wav?v=3');
      music.loop = true;
      music.volume = 0.45;
    }
    try {
      await music.play();
      e.target.textContent = '⏸ Música';
      e.target.classList.add('on');
    } catch (err) {
      document.getElementById('status').textContent = 'No se pudo poner la música.';
    }
  };

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
      resetRound(true);
      requestAnimationFrame(frame);
    } catch (err) {
      document.getElementById('status').textContent = 'No se pudo cargar la pelea: ' + err.message;
    }
  })();
})();

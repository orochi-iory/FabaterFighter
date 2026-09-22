/**
 * Flujo de pantallas: título, modo, selección, VS, pausa, resultados y lista de golpes.
 */

import { ROSTER } from '../data/roster.js';
import { drawPortrait } from './portrait.js';
import { sfx } from '../audio/sfx.js';

export class Screens {
  constructor(root, hooks = {}) {
    this.root = root;
    this.hooks = hooks;
    this.current = null;
    this.screens = {};
    this.mode = 'cpu';
    this.sel = [0, 1];
    this.locked = [false, false];
    this.cursor = 0;
    this.build();
  }

  /* ---------------------------------------------------------------- */
  build() {
    // Título
    this.screens.title = this.make(`
      <div class="logo"><span class="l1">FABATER</span><span class="l2">FIGHTER</span></div>
      <div class="subtitle">VS Arcade · 10 luchadores · 3rd Strike × KOF '98</div>
      <div class="menu">
        <button class="btn" data-act="cpu">ARCADE VS CPU<small>Un jugador contra la máquina</small></button>
        <button class="btn" data-act="2p">VERSUS 2 JUGADORES<small>Mismo teclado o dos mandos</small></button>
        <button class="btn" data-act="training">ENTRENAMIENTO<small>Sin tiempo, dummy configurable</small></button>
        <button class="btn" data-act="moves">LISTA DE GOLPES<small>Comandos y frame data</small></button>
        <button class="btn" data-act="controls">CONTROLES<small>Teclado, mando y táctil</small></button>
      </div>
      <div class="hint">Pulsa <b>ENTER</b> o haz clic para empezar · <b>F1</b> lista de golpes durante el combate</div>
    `);

    // Selección
    const sel = this.make(`
      <div class="select-wrap">
        <div class="select-title">SELECT YOUR FIGHTER</div>
        <div class="cursors">
          <span class="c1">1P <b class="c1name">—</b></span>
          <span class="c2">2P <b class="c2name">—</b></span>
        </div>
        <div class="grid"></div>
        <div class="info-panel">
          <canvas width="128" height="128"></canvas>
          <div>
            <h3 class="i-name">—</h3>
            <div class="arch i-arch"></div>
            <div class="i-bio" style="font-size:12px;opacity:.8;line-height:1.5"></div>
            <div class="stats"></div>
            <div class="moves"></div>
          </div>
        </div>
        <div class="hint">P1: <b>A/D</b> mover · <b>J</b> elegir · <b>W/S</b> fila &nbsp;|&nbsp; P2: <b>←/→</b> · <b>Numpad1</b><br/>También puedes hacer clic en el retrato.</div>
      </div>
    `);
    this.screens.select = sel;
    this.selGrid = sel.querySelector('.grid');
    this.cells = [];
    ROSTER.forEach((f, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 128;
      cell.appendChild(cv);
      const nm = document.createElement('div');
      nm.className = 'cname';
      nm.textContent = f.name.split(' ')[0];
      cell.appendChild(nm);
      cell.addEventListener('click', () => this.clickCell(i));
      this.selGrid.appendChild(cell);
      this.cells.push(cell);
      drawPortrait(cv, f);
    });

    // VS
    const vs = this.make(`
      <div class="side l"><canvas width="256" height="256"></canvas><div class="nm n1"></div></div>
      <div class="big">VS</div>
      <div class="side r"><canvas width="256" height="256"></canvas><div class="nm n2"></div></div>
    `);
    vs.classList.add('vs');
    this.screens.vs = vs;

    // Pausa
    this.screens.pause = this.make(`
      <div class="pause-box">
        <h2>PAUSA</h2>
        <div class="menu">
          <button class="btn" data-act="resume">CONTINUAR</button>
          <button class="btn" data-act="moves">LISTA DE GOLPES</button>
          <button class="btn" data-act="restart">REINICIAR COMBATE</button>
          <button class="btn danger" data-act="quit">SALIR AL MENÚ</button>
        </div>
      </div>
    `);

    // Resultados
    this.screens.results = this.make(`
      <div class="results">
        <h2 class="r-title">YOU WIN</h2>
        <div class="r-quote" style="opacity:.8;font-style:italic;margin-bottom:8px"></div>
        <table class="stats-table r-stats"></table>
        <div class="menu" style="margin-top:14px">
          <button class="btn" data-act="rematch">REVANCHA</button>
          <button class="btn" data-act="select">CAMBIAR LUCHADOR</button>
          <button class="btn danger" data-act="quit">MENÚ PRINCIPAL</button>
        </div>
      </div>
    `);

    // Controles
    this.screens.controls = this.make(`
      <h2 style="font-family:'Arial Black',Impact;font-style:italic;letter-spacing:3px">CONTROLES</h2>
      <div class="movelist"><div class="cols">${controlsHTML()}</div></div>
      <div class="menu" style="margin-top:14px"><button class="btn" data-act="back">VOLVER</button></div>
    `);

    // Lista de golpes
    const ml = this.make(`
      <div class="movelist">
        <h2>LISTA DE GOLPES <small style="font-size:12px;opacity:.6;font-family:inherit">notación numpad · 6 = adelante · S=arranque A=activo R=recuperación</small></h2>
        <div class="cols" id="ml-cols"></div>
      </div>
      <div class="menu" style="margin-top:12px"><button class="btn" data-act="back">VOLVER</button></div>
    `);
    this.screens.moves = ml;

    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.action(b.dataset.act);
    });
  }

  make(html) {
    const d = document.createElement('div');
    d.className = 'screen';
    d.innerHTML = html;
    this.root.appendChild(d);
    return d;
  }

  /* ---------------------------------------------------------------- */
  show(name) {
    for (const k in this.screens) this.screens[k].classList.remove('active');
    this.current = name;
    if (name && this.screens[name]) this.screens[name].classList.add('active');
    if (name === 'select') this.refreshSelect();
    if (name === 'moves') this.buildMoveList();
  }

  hide() { this.show(null); }

  action(act) {
    sfx.resume();
    switch (act) {
      case 'cpu': this.mode = 'cpu'; this.startSelect(); break;
      case '2p': this.mode = '2p'; this.startSelect(); break;
      case 'training': this.mode = 'training'; this.startSelect(); break;
      case 'moves': this.prev = this.prev || 'title'; this.show('moves'); break;
      case 'controls': this.prev = 'title'; this.show('controls'); break;
      case 'back': this.show(this.prev || 'title'); break;
      case 'resume': this.hooks.onResume && this.hooks.onResume(); break;
      case 'restart': this.hooks.onRestart && this.hooks.onRestart(); break;
      case 'quit': this.show('title'); this.hooks.onQuit && this.hooks.onQuit(); break;
      case 'rematch': this.hooks.onRematch && this.hooks.onRematch(); break;
      case 'select': this.startSelect(); break;
      default: break;
    }
    sfx.play('select');
  }

  startSelect() {
    this.sel = [Math.floor(Math.random() * ROSTER.length), (Math.floor(Math.random() * ROSTER.length) + 3) % ROSTER.length];
    this.locked = [false, false];
    this.cursor = 0;
    this.show('select');
  }

  clickCell(i) {
    const p = this.locked[0] ? 1 : 0;
    if (this.mode !== '2p' && p === 1) return;
    this.sel[p] = i;
    this.lock(p);
  }

  lock(p) {
    this.locked[p] = true;
    sfx.play('select');
    this.refreshSelect();
    if (this.locked[0] && (this.mode !== '2p' || this.locked[1])) {
      if (this.mode !== '2p') this.sel[1] = Math.floor(Math.random() * ROSTER.length);
      setTimeout(() => this.goVS(), 320);
    }
  }

  goVS() {
    const a = ROSTER[this.sel[0]], b = ROSTER[this.sel[1]];
    const vs = this.screens.vs;
    drawPortrait(vs.querySelector('.side.l canvas'), a);
    drawPortrait(vs.querySelector('.side.r canvas'), b);
    vs.querySelector('.n1').textContent = a.name;
    vs.querySelector('.n2').textContent = b.name;
    vs.querySelector('.n1').style.color = a.colors.accent;
    vs.querySelector('.n2').style.color = b.colors.accent;
    this.show('vs');
    sfx.play('bell');
    setTimeout(() => {
      this.hide();
      this.hooks.onStart && this.hooks.onStart(a, b, this.mode);
    }, 1700);
  }

  /* ---------------------------------------------------------------- */
  moveCursor(p, dx, dy) {
    if (this.current !== 'select' || this.locked[p]) return;
    const cols = this.gridCols();
    let i = this.sel[p] + dx + dy * cols;
    i = ((i % ROSTER.length) + ROSTER.length) % ROSTER.length;
    this.sel[p] = i;
    sfx.play('move');
    this.refreshSelect();
  }

  gridCols() {
    const w = this.selGrid.clientWidth;
    return w < 560 ? 4 : 5;
  }

  confirm(p) {
    if (this.current !== 'select' || this.locked[p]) return;
    this.lock(p);
  }

  refreshSelect() {
    const a = ROSTER[this.sel[0]], b = ROSTER[this.sel[1]];
    this.screens.select.querySelector('.c1name').textContent = a.name;
    this.screens.select.querySelector('.c2name').textContent = this.mode === '2p' ? b.name : 'CPU';
    this.cells.forEach((c, i) => {
      c.classList.toggle('p1', this.sel[0] === i);
      c.classList.toggle('p2', this.mode === '2p' && this.sel[1] === i && this.sel[0] !== i);
      c.classList.toggle('both', this.sel[0] === i && this.sel[1] === i);
      c.classList.toggle('locked', this.locked[0] && this.mode !== '2p' && i !== this.sel[0]);
    });
    const f = this.locked[0] && this.mode === '2p' ? b : a;
    const panel = this.screens.select.querySelector('.info-panel');
    drawPortrait(panel.querySelector('canvas'), f);
    panel.querySelector('.i-name').textContent = f.name;
    panel.querySelector('.i-name').style.color = f.colors.accent;
    panel.querySelector('.i-arch').textContent = `${f.archetype} · ${f.style} · ${f.country}`;
    panel.querySelector('.i-bio').textContent = f.bio;
    const s = f.stats;
    const bar = (label, v, max) => `<span>${label}<i><b style="width:${Math.min(100, (v / max) * 100)}%"></b></i></span>`;
    panel.querySelector('.stats').innerHTML =
      bar('VIDA', s.health, 1300) + bar('VELOCIDAD', s.walk, 0.09) +
      bar('POTENCIA', s.power, 1.35) + bar('DEFENSA', s.defense, 1.35) +
      bar('SALTO', s.jump, 1.15) + bar('ALCANCE', s.reach, 1.6);
    panel.querySelector('.moves').innerHTML = [
      ...f.specials.filter((m) => !m.input.rekka).map((m) => `<div class="mv"><b>${m.input.motion || '—'}${m.input.button || ''}</b> ${m.name}</div>`),
      ...f.supers.map((m) => `<div class="mv su"><b>${m.input.motion}${m.input.button}</b> ${m.name}</div>`)
    ].join('');
  }

  /* ---------------------------------------------------------------- */
  buildMoveList() {
    const cols = this.screens.moves.querySelector('#ml-cols');
    if (cols.childElementCount) return;
    for (const f of ROSTER) {
      const d = document.createElement('div');
      const row = (m, cls = '') => {
        const cmd = m.input.motion ? `${m.input.motion}${m.input.button || ''}` : (m.input.button || '—');
        return `<tr class="${cls}"><td class="cmd">${cmd}</td><td>${m.name}</td><td class="fd">${m.startup}/${m.active}/${m.recovery}</td></tr>`;
      };
      d.innerHTML = `
        <h2 style="color:${f.colors.accent};font-size:16px">${f.name}</h2>
        <div style="font-size:11px;opacity:.65;letter-spacing:1px">${f.archetype}</div>
        <h4>NORMALES</h4>
        <table>
          <tr><td class="cmd">LP / LK / HP / HK</td><td>Golpes de pie</td><td class="fd">—</td></tr>
          <tr><td class="cmd">↓ + botón</td><td>Agachado (2HP lanza)</td><td class="fd">—</td></tr>
          <tr><td class="cmd">→ + HP</td><td>Overhead (bloqueo alto)</td><td class="fd">${f.moveById['6HP'].startup}/${f.moveById['6HP'].active}/${f.moveById['6HP'].recovery}</td></tr>
          <tr><td class="cmd">LP+LK</td><td>${f.throwName || 'Throw'} (se techa)</td><td class="fd">3/2/34</td></tr>
        </table>
        <h4>ESPECIALES</h4>
        <table>${f.specials.filter((m) => !m.input.rekka).map((m) => row(m)).join('')}</table>
        <h4>SUPER (1 stock)</h4>
        <table>${f.supers.map((m) => row(m, 'su')).join('')}</table>
      `;
      cols.appendChild(d);
    }
  }

  /* ---------------------------------------------------------------- */
  showResults(winner, match, mode) {
    const r = this.screens.results;
    const title = r.querySelector('.r-title');
    if (!winner) {
      title.textContent = 'DRAW GAME';
      title.style.color = '#c9c2ff';
      r.querySelector('.r-quote').textContent = '"Nadie cede un palmo."';
    } else {
      if (mode === '2p') title.textContent = `${winner.name} WINS`;
      else title.textContent = winner.index === 0 ? 'YOU WIN' : 'YOU LOSE';
      title.style.color = winner.colors.accent;
      r.querySelector('.r-quote').textContent = `"${winner.winQuote}"`;
    }
    const [a, b] = match.fighters;
    r.querySelector('.r-stats').innerHTML = `
      <tr><th></th><th>${a.name}</th><th>${b.name}</th></tr>
      <tr><th>RONDAS</th><td>${match.wins[0]}</td><td>${match.wins[1]}</td></tr>
      <tr><th>DAÑO INFLIGIDO</th><td>${Math.round(match.totalDamage[0])}</td><td>${Math.round(match.totalDamage[1])}</td></tr>
      <tr><th>COMBO MÁXIMO</th><td>${match.maxCombo[0]}</td><td>${match.maxCombo[1]}</td></tr>
      <tr><th>PARRIES</th><td>${match.parryCount[0]}</td><td>${match.parryCount[1]}</td></tr>
    `;
    this.show('results');
  }
}

function controlsHTML() {
  return `
  <div>
    <h4>JUGADOR 1</h4>
    <table>
      <tr><td class="cmd">W A S D</td><td>Moverse / saltar / agacharse</td></tr>
      <tr><td class="cmd">J K L ;</td><td>LP · LK · HP · HK</td></tr>
      <tr><td class="cmd">U / I</td><td>Especial 1 / Especial 2</td></tr>
      <tr><td class="cmd">O</td><td>SUPER (gasta 1 stock)</td></tr>
      <tr><td class="cmd">P</td><td>Activar modo MAX (1 stock)</td></tr>
      <tr><td class="cmd">[</td><td>Guard Cancel Roll (bloqueando)</td></tr>
      <tr><td class="cmd">→ (tap)</td><td>PARRY alto · ↓ (tap) = PARRY bajo</td></tr>
      <tr><td class="cmd">→ →</td><td>Dash adelante · ← ← = dash atrás</td></tr>
      <tr><td class="cmd">↓ ↑</td><td>Super jump · ↓ + ↑ rápido = hop</td></tr>
      <tr><td class="cmd">ESC / F1</td><td>Pausa / lista de golpes</td></tr>
    </table>
  </div>
  <div>
    <h4>JUGADOR 2</h4>
    <table>
      <tr><td class="cmd">FLECHAS</td><td>Moverse</td></tr>
      <tr><td class="cmd">7 8 9 0</td><td>LP · LK · HP · HK (o Numpad 1-4)</td></tr>
      <tr><td class="cmd">- / =</td><td>Especial 1 / Especial 2 (o Numpad 7-8)</td></tr>
      <tr><td class="cmd">\\</td><td>SUPER (o Numpad 9)</td></tr>
      <tr><td class="cmd">BACKSPACE</td><td>Modo MAX (o Numpad 5)</td></tr>
      <tr><td class="cmd">\`</td><td>Guard Cancel Roll (o Numpad 6)</td></tr>
    </table>
    <h4>MANDO</h4>
    <table>
      <tr><td class="cmd">Stick / cruceta</td><td>Moverse</td></tr>
      <tr><td class="cmd">◻ ✕ ◯ △</td><td>LP LK HP HK</td></tr>
      <tr><td class="cmd">L1 / R1</td><td>Especial 1 / 2</td></tr>
      <tr><td class="cmd">R2 / L2 / OPTIONS</td><td>SUPER / MAX / Pausa</td></tr>
    </table>
  </div>
  <div>
    <h4>SISTEMAS</h4>
    <table>
      <tr><td class="cmd">BARRA</td><td>Se llena haciendo daño, recibiendo daño, bloqueando y con parries. Cada 1000 pts = 1 ◆ (máx. 3).</td></tr>
      <tr><td class="cmd">PARRY</td><td>Toca ←/→ justo antes del impacto: sin daño, sin blockstun y con ventaja (SF3).</td></tr>
      <tr><td class="cmd">MAX</td><td>Gasta 1 ◆: +25% de daño durante 20 s.</td></tr>
      <tr><td class="cmd">GC ROLL</td><td>Mientras bloqueas, gasta 1 ◆ para rodar y escapar de la presión.</td></tr>
      <tr><td class="cmd">GUARD</td><td>La barra azul sube al bloquear; si se llena = GUARD CRUSH.</td></tr>
      <tr><td class="cmd">STUN</td><td>La barra naranja sube al recibir golpes; llena = DIZZY (machaca para salir).</td></tr>
    </table>
  </div>`;
}

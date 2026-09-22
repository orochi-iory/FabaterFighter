/**
 * HUD: barras de vida, tiempo, stocks de super, stun/guardia, combos y avisos.
 * Todo es DOM/CSS para que escale bien y se vea nítido.
 */

import { MAX_STUN, MAX_GUARD, METER_PER_STOCK, MAX_STOCKS } from '../game/constants.js';

const SIDES = ['p1', 'p2'];

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = {};
    this.trail = [1, 1];
    this.comboTimer = [0, 0];
    this.comboValue = [0, 0];
    this.announceTimer = 0;
    this.build();
  }

  build() {
    const wrap = document.createElement('div');
    wrap.className = 'hud';
    wrap.innerHTML = `
      ${sideHTML('p1')}
      <div class="hud-center">
        <div class="round-pips"><span class="pips p1"></span><span class="tick"></span><span class="pips p2"></span></div>
        <div class="timer">99</div>
        <div class="round-label">ROUND 1</div>
      </div>
      ${sideHTML('p2')}
    `;
    this.root.appendChild(wrap);
    this.el.wrap = wrap;
    for (const s of SIDES) {
      this.el[s] = {
        name: wrap.querySelector(`.${s} .pname`),
        hp: wrap.querySelector(`.${s} .hp-fill`),
        hpTrail: wrap.querySelector(`.${s} .hp-damage`),
        hpDanger: wrap.querySelector(`.${s} .health`),
        stun: wrap.querySelector(`.${s} .stun-fill`),
        guard: wrap.querySelector(`.${s} .guard-fill`),
        meter: wrap.querySelector(`.${s} .meter-fill`),
        stocks: wrap.querySelector(`.${s} .stocks`),
        maxbar: wrap.querySelector(`.${s} .max-timer`),
        pips: wrap.querySelector(`.pips.${s}`),
        combo: wrap.querySelector(`.combo.${s}`)
      };
    }
    this.el.timer = wrap.querySelector('.timer');
    this.el.roundLabel = wrap.querySelector('.round-label');

    const combo = document.createElement('div');
    combo.className = 'combos';
    combo.innerHTML = '<div class="combo p1"></div><div class="combo p2"></div>';
    this.root.appendChild(combo);
    for (const s of SIDES) this.el[s].combo = combo.querySelector(`.combo.${s}`);

    const ann = document.createElement('div');
    ann.className = 'announce';
    this.root.appendChild(ann);
    this.el.announce = ann;
  }

  setNames(f1, f2) {
    this.el.p1.name.textContent = f1.name;
    this.el.p2.name.textContent = f2.name;
    this.el.p1.name.style.color = f1.colors.accent;
    this.el.p2.name.style.color = f2.colors.accent;
    this.el.p1.hp.style.background = `linear-gradient(180deg,#fff59d,${f1.colors.accent} 60%,#c62828)`;
    this.el.p2.hp.style.background = `linear-gradient(180deg,#fff59d,${f2.colors.accent} 60%,#c62828)`;
  }

  update(match, dt) {
    if (!match) return;
    const fs = match.fighters;
    for (let i = 0; i < 2; i++) {
      const f = fs[i];
      const e = this.el[SIDES[i]];
      const pct = Math.max(0, f.health / f.maxHealth);
      e.hp.style.width = `${pct * 100}%`;
      // barra de daño retardada
      this.trail[i] += (pct - this.trail[i]) * (pct < this.trail[i] ? Math.min(1, dt * 1.6) : 1);
      e.hpTrail.style.width = `${Math.max(pct, this.trail[i]) * 100}%`;
      e.hpDanger.classList.toggle('danger', pct < 0.25);

      e.stun.style.width = `${Math.min(100, (f.stun / MAX_STUN) * 100)}%`;
      e.stun.classList.toggle('full', f.stun >= MAX_STUN * 0.85);
      e.guard.style.width = `${Math.min(100, (f.guard / MAX_GUARD) * 100)}%`;
      e.guard.classList.toggle('full', f.guard >= MAX_GUARD * 0.8);

      const mPct = f.stocks >= MAX_STOCKS ? 100 : (f.meter / METER_PER_STOCK) * 100;
      e.meter.style.width = `${mPct}%`;
      e.meter.classList.toggle('ready', f.stocks > 0);
      e.stocks.textContent = '◆'.repeat(f.stocks) + '◇'.repeat(Math.max(0, MAX_STOCKS - f.stocks));
      e.stocks.classList.toggle('full', f.stocks >= MAX_STOCKS);
      e.maxbar.style.width = f.maxMode > 0 ? `${(f.maxMode / 1200) * 100}%` : '0%';
      e.maxbar.parentElement.classList.toggle('maxing', f.maxMode > 0);

      // Combos (se muestran en el lado de quien los ejecuta)
      if (f.combo.active && f.combo.count >= 2) {
        this.comboValue[i] = f.combo.count;
        this.comboTimer[i] = 1.4;
        e.combo.innerHTML = `<b>${f.combo.count}</b> HITS<span>${Math.round(f.combo.damage)} DMG</span>`;
        e.combo.classList.add('show');
      } else {
        this.comboTimer[i] -= dt;
        if (this.comboTimer[i] <= 0) e.combo.classList.remove('show');
      }

      // Pips de ronda
      e.pips.innerHTML = '';
      for (let r = 0; r < match.opts.rounds; r++) {
        const d = document.createElement('i');
        if (match.wins[i] > r) d.className = 'on';
        e.pips.appendChild(d);
      }
    }
    this.el.timer.textContent = String(match.timer).padStart(2, '0');
    this.el.timer.classList.toggle('urgent', match.timer <= 10);
    this.el.roundLabel.textContent = `ROUND ${match.round}`;

    if (match.announce) {
      if (this._annText !== match.announce.text) {
        this._annText = match.announce.text;
        this.el.announce.textContent = match.announce.text;
        this.el.announce.classList.remove('play');
        void this.el.announce.offsetWidth;
        this.el.announce.classList.add('play');
      }
    }
  }

  announce(text, sub = '', cls = '') {
    this._annText = text;
    this.el.announce.innerHTML = `${text}${sub ? `<em>${sub}</em>` : ''}`;
    this.el.announce.className = `announce play ${cls}`;
  }

  clearAnnounce() {
    this._annText = null;
    this.el.announce.className = 'announce';
    this.el.announce.textContent = '';
  }

  show(v) { this.el.wrap.style.display = v ? '' : 'none'; }
}

function sideHTML(side) {
  return `
  <div class="hud-side ${side}">
    <div class="nameplate">
      <span class="pname">---</span>
      <span class="tag">${side.toUpperCase()}</span>
    </div>
    <div class="health">
      <div class="hp-damage"></div>
      <div class="hp-fill"></div>
      <div class="hp-gloss"></div>
    </div>
    <div class="subbars">
      <div class="bar stun"><i class="stun-fill"></i></div>
      <div class="bar guard"><i class="guard-fill"></i></div>
    </div>
    <div class="meter-wrap">
      <div class="meter"><i class="meter-fill"></i></div>
      <div class="stocks">◇◇◇</div>
      <div class="maxwrap"><i class="max-timer"></i></div>
    </div>
  </div>`;
}

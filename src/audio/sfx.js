/**
 * Sonido procedural con WebAudio (sin ficheros externos).
 */

export class SFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.noiseBuf = null;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Ruido blanco reutilizable
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(v) {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.5 : 0;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  noise(dur, freq, q, gain, type = 'bandpass', when = 0) {
    if (!this.ctx || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    const t0 = this.t + when;
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  tone(freq, dur, gain, type = 'sine', slideTo = null, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    const t0 = this.t + when;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'hitL':
        this.noise(0.09, 1500, 1.2, 0.35 * v);
        this.tone(160, 0.1, 0.25 * v, 'sine', 70);
        break;
      case 'hitH':
        this.noise(0.16, 900, 0.9, 0.5 * v);
        this.tone(110, 0.22, 0.4 * v, 'sine', 45);
        this.tone(320, 0.08, 0.15 * v, 'square', 120);
        break;
      case 'counter':
        this.noise(0.2, 2400, 2.5, 0.5 * v);
        this.tone(520, 0.3, 0.3 * v, 'sawtooth', 90);
        break;
      case 'block':
        this.noise(0.07, 3200, 4, 0.3 * v, 'highpass');
        this.tone(880, 0.06, 0.12 * v, 'square');
        break;
      case 'parry':
        this.tone(1400, 0.22, 0.3 * v, 'sine', 2600);
        this.tone(2100, 0.3, 0.18 * v, 'triangle', 3200, 0.02);
        this.noise(0.12, 5000, 6, 0.2 * v, 'highpass');
        break;
      case 'fire':
        this.noise(0.35, 700, 0.7, 0.35 * v, 'lowpass');
        this.tone(220, 0.3, 0.18 * v, 'sawtooth', 90);
        break;
      case 'blade':
        this.noise(0.25, 2600, 3, 0.3 * v, 'bandpass');
        this.tone(700, 0.25, 0.16 * v, 'sawtooth', 220);
        break;
      case 'zap':
        this.tone(1200, 0.14, 0.25 * v, 'square', 300);
        this.noise(0.1, 4000, 2, 0.2 * v, 'highpass');
        break;
      case 'flame':
        this.noise(0.5, 500, 0.5, 0.3 * v, 'lowpass');
        break;
      case 'psycho':
        this.tone(440, 0.4, 0.2 * v, 'sine', 880);
        this.tone(660, 0.4, 0.12 * v, 'triangle', 1320);
        break;
      case 'beam':
        this.tone(180, 0.7, 0.3 * v, 'sawtooth', 1400);
        this.noise(0.7, 1800, 1, 0.25 * v);
        break;
      case 'kunai':
        this.noise(0.06, 5200, 6, 0.22 * v, 'highpass');
        break;
      case 'whoosh':
        this.noise(0.16, 900, 0.8, 0.16 * v, 'bandpass');
        break;
      case 'jump':
        this.tone(300, 0.1, 0.1 * v, 'sine', 600);
        break;
      case 'land':
        this.noise(0.1, 320, 0.7, 0.22 * v, 'lowpass');
        break;
      case 'throw':
        this.tone(140, 0.25, 0.3 * v, 'sine', 60);
        this.noise(0.2, 600, 0.8, 0.3 * v);
        break;
      case 'dash':
        this.noise(0.14, 1400, 1.2, 0.14 * v);
        break;
      case 'super':
        this.tone(120, 0.9, 0.35 * v, 'sawtooth', 900);
        this.tone(180, 0.9, 0.25 * v, 'square', 1400, 0.03);
        this.noise(0.9, 1200, 0.6, 0.25 * v);
        break;
      case 'max':
        this.tone(200, 0.7, 0.3 * v, 'sawtooth', 1200);
        this.noise(0.6, 2000, 1.5, 0.2 * v);
        break;
      case 'ko':
        this.tone(90, 1.2, 0.5 * v, 'sine', 30);
        this.noise(1.0, 400, 0.5, 0.45 * v, 'lowpass');
        this.tone(300, 0.8, 0.2 * v, 'sawtooth', 60, 0.05);
        break;
      case 'bell':
        this.tone(880, 0.5, 0.3 * v, 'triangle');
        this.tone(1320, 0.5, 0.2 * v, 'triangle', 1320, 0.06);
        break;
      case 'select':
        this.tone(660, 0.07, 0.16 * v, 'square');
        break;
      case 'move':
        this.tone(420, 0.05, 0.1 * v, 'square');
        break;
      case 'deny':
        this.tone(160, 0.12, 0.16 * v, 'square', 90);
        break;
      case 'guardCrush':
        this.noise(0.5, 700, 0.6, 0.4 * v, 'lowpass');
        this.tone(200, 0.5, 0.3 * v, 'sawtooth', 60);
        break;
      default:
        break;
    }
  }
}

export const sfx = new SFX();

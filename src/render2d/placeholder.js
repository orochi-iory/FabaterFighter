/**
 * Sprites provisionales por procedimiento (mientras llegan los tilesheets
 * de verdad). Dibuja cada personaje en canvas con SU paleta, complexion y
 * peinado: no es pixel-art final, pero conserva la identidad (colores del
 * gi, piel, pelo, guantes, cinturon) y todas las animaciones que el motor
 * necesita. Sin canvas 2D (tests en Node) devuelve null.
 *
 * Layout: rejilla de 8 columnas x 96x128 px por celda, pies en anchorY=3.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { Sheet } from './sheet.js';

const FW = 96, FH = 128, COLS = 8, ANCHOR = 3;
const FEET = FH - ANCHOR;

/* ------------------------------------------------------------------ */
/* utilidades de dibujo                                                */

function limb(x, x1, y1, ang, len, w, color) {
  const r = (ang * Math.PI) / 180;
  const x2 = x1 + Math.sin(r) * len;
  const y2 = y1 + Math.cos(r) * len;
  x.strokeStyle = color; x.lineWidth = w; x.lineCap = 'round';
  x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
  return [x2, y2];
}
function dot(x, cx, cy, r, color) {
  x.fillStyle = color; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
}

/* poses: angulos en grados (0 = colgando, + = hacia delante) ---------- */
function poseOf(name, i, n) {
  const t = n <= 1 ? 0 : i / (n - 1);
  const sway = Math.sin((i / n) * Math.PI * 2);
  const P = {
    lean: 6, hip: 0, aL: [25, 95], aR: [35, 110], lL: [4, 6], lR: [-8, 10], flat: false, air: false
  };
  switch (name) {
    case 'idle': P.lean = 8; P.hip = (i % 2); P.aL = [30 + sway * 4, 100]; P.aR = [40 + sway * 4, 115]; break;
    case 'walk': {
      const s = Math.sin((i / n) * Math.PI * 2);
      P.lean = 10; P.lL = [s * 26, 8]; P.lR = [-s * 26, 14]; P.aL = [-s * 20 + 25, 90]; P.aR = [s * 20 + 40, 105];
      break;
    }
    case 'crouch': P.hip = 22; P.lean = 14; P.lL = [34, 95]; P.lR = [-26, 110]; P.aL = [40, 105]; P.aR = [50, 115]; break;
    case 'jump': P.air = true; P.hip = -4; P.lL = [-38, 105]; P.lR = [-24, 96]; P.aL = [-30, 70]; P.aR = [-46, 80]; break;
    case 'fall': P.air = true; P.lL = [-16, 40]; P.lR = [10, 22]; P.aL = [-40, 40]; P.aR = [-56, 50]; break;
    case 'blockHigh': P.lean = -2; P.aL = [80, 120]; P.aR = [70, 130]; break;
    case 'blockLow': P.hip = 20; P.lean = 8; P.lL = [34, 95]; P.lR = [-26, 110]; P.aL = [70, 115]; P.aR = [60, 125]; break;
    case 'hitHigh': P.lean = -18 - t * 8; P.aL = [-35, 30]; P.aR = [-50, 25]; P.head = -1; break;
    case 'hitLow': P.hip = 16; P.lean = -22; P.lL = [30, 90]; P.lR = [-20, 100]; P.aL = [-30, 30]; P.aR = [-44, 26]; break;
    case 'launched': P.lean = -50; P.aL = [-60, 20]; P.aR = [-80, 15]; P.lL = [-30, 30]; P.lR = [20, 20]; break;
    case 'knockdown': P.flat = i >= Math.floor(n * 0.5); P.lean = -60; P.aL = [-70, 20]; P.aR = [-85, 15]; break;
    case 'getup': P.flat = i === 0; P.hip = i ? 20 : 0; P.lean = i ? 16 : -50; break;
    case 'dizzy': P.lean = sway * 14; P.aL = [10, 20]; P.aR = [16, 22]; P.head = sway; break;
    case 'guardcrush': P.lean = -14; P.aL = [-20, 12]; P.aR = [-28, 10]; break;
    case 'grab': P.lean = 12; P.aL = [86, 4]; P.aR = [82, 4]; break;
    case 'thrown': P.lean = -70; P.aL = [-40, 10]; P.aR = [-60, 12]; P.lL = [-40, 60]; P.lR = [0, 40]; break;
    case 'maxactivate': P.lean = 0; P.aL = [55, 140]; P.aR = [-55, 140]; P.lL = [16, 10]; P.lR = [-16, 10]; P.glow = true; break;
    case 'ko': P.flat = true; break;
    case 'win': P.lean = 2; P.aR = [170 + sway * 14, 20]; P.aL = [20, 100]; break;
    case 'intro': P.lean = i ? 8 : 38; P.aL = i ? [30, 100] : [10, 30]; P.aR = i ? [40, 115] : [12, 28]; break;
    case 'parry': P.lean = 4; P.aL = [88, 2]; P.aR = [92, 2]; P.glow = true; break;
    default: break;
  }
  return P;
}

/* plantillas de golpes: devuelven la pose por fase -------------------- */
function attackPose(poseName, phase, frames, accent) {
  const kick = /kick|heel|sole|roundhouse|sweep|thrust|scissors|guadana|cometa|media/i.test(poseName);
  const upper = /upper|shoryu|rising|launcher|palm|dragon|lanza/i.test(poseName);
  const low = /crouch|cj|ck|sweep|slide|low/i.test(poseName);
  const air = /^j|^air/i.test(poseName);
  const ext = phase === 'active' ? 1 : phase === 'startup' ? 0.28 : 0.62;
  const P = poseOf(low ? 'crouch' : air ? 'jump' : 'idle', 0, 1);
  P.streak = phase === 'active';
  if (kick) {
    const high = /hk|high|round|heel|heel|cometa|tijera/i.test(poseName) && !low;
    const ang = high ? 95 : low ? 88 : 70;
    P.lean = high ? -16 : low ? 22 : -6;
    P.hip = low ? 18 : P.hip;
    P.lR = [-14, 8];
    P.lL = [ang * ext + (high ? -10 : 0), low ? 6 : 4];
    P.aL = [30, 100]; P.aR = [-30, 40];
  } else if (upper) {
    P.lean = -8 + 10 * ext;
    P.aR = [150 * ext + 10, 8];
    P.aL = [30, 110];
    P.lL = [14, 10]; P.lR = [-14, 14];
  } else {
    P.lean = 10 + 8 * ext;
    P.aR = [92 * ext + 6, 6];
    P.aL = [36, 120];
    P.lL = [18, 10]; P.lR = [-20, 16];
  }
  if (air) { P.lL = [-40, 100]; P.lR = [-26, 92]; }
  return P;
}

/* ------------------------------------------------------------------ */
/* dibujo del luchador en una celda                                    */

function drawFighter(x, def, P, ox) {
  const B = def.body || {}, C = def.colors || {};
  const bulk = B.bulk || 1;
  const skin = C.skin || '#e0ac69', hair = C.hair || '#222';
  const top = C.gi || '#ccc', pants = C.pants || C.belt || '#333';
  const boot = C.boot || '#222', glove = C.glove || C.accent || '#c22';
  const bare = B.top === 'bare';
  const female = !!B.female;

  if (P.flat) {
    // tumbado boca arriba (SF2): cabeza a la izquierda del frame, pies arriba
    const y = FEET - 8;
    limb(x, ox + 30, y + 2, 96, 30, 15 * bulk, bare ? skin : top);      // torso
    limb(x, ox + 60, y + 1, 60, 15, 7, skin);                            // brazo trasero
    limb(x, ox + 58, y + 6, 75, 15, 7, skin);
    limb(x, ox + 58, y + 2, 40, 17, 8, pants);                           // muslos
    limb(x, ox + 72, y + 12, 20, 15, 7, pants);
    dot(x, ox + 74, y - 2, 4, boot); dot(x, ox + 82, y + 2, 4, boot);    // pies
    dot(x, ox + 22, y - 3, 9, skin);                                     // cabeza
    x.fillStyle = hair; x.fillRect(ox + 13, y - 14, 18, 7);
    dot(x, ox + 26, y - 4, 1.6, '#141414');
    return;
  }

  const cx = ox + FW / 2;
  const leanR = ((P.lean || 0) * Math.PI) / 180;
  const hipY = FEET - 33 + (P.hip || 0) - (P.air ? 6 : 0);
  const neckY = hipY - 27;
  const hx = cx + Math.sin(leanR) * 0 + (P.head || 0) * 3;

  // pierna trasera
  const lk = pt2(cx - 4, hipY, P.lR);
  limb(x, cx - 4, hipY, P.lR[0], 17, 8, shade(pants, 0.82));
  limb(x, lk[0], lk[1], P.lR[0] + P.lR[1], 15, 7, shade(pants, 0.82));
  dot(x, lk[0] + Math.sin((P.lR[0] + P.lR[1]) * Math.PI / 180) * 3, lk[1] + 13, 4, shade(boot, 0.85));
  // brazo trasero
  const ak = pt2(cx + 4, neckY + 4, P.aR);
  limb(x, cx + 4, neckY + 4, P.aR[0], 12, 7, shade(bare ? skin : top, 0.85));
  limb(x, ak[0], ak[1], P.aR[0] + P.aR[1], 11, 6, shade(skin, 0.85));
  dot(x, ak[0] + Math.sin((P.aR[0] + P.aR[1]) * Math.PI / 180) * 3, ak[1] + 12 * Math.cos((P.aR[0] + P.aR[1]) * Math.PI / 180), 4, shade(glove, 0.85));
  // torso
  x.save();
  x.translate(cx, hipY); x.rotate(-leanR);
  x.fillStyle = bare ? skin : top;
  x.beginPath();
  const tw = 9 * bulk + (female ? -1 : 2);
  x.roundRect ? x.roundRect(-tw, -27, tw * 2, 28, 5) : x.rect(-tw, -27, tw * 2, 28);
  x.fill();
  if (B.top === 'tank') { x.fillStyle = skin; x.fillRect(-3, -27, 6, 8); }
  if (B.top === 'bare') { x.strokeStyle = shade(skin, 0.7); x.lineWidth = 1.5; x.beginPath(); x.moveTo(-tw + 2, -16); x.lineTo(tw - 2, -16); x.stroke(); }
  x.fillStyle = C.belt || '#222'; x.fillRect(-tw, -3, tw * 2, 4);        // cinturon
  x.restore();
  // pierna delantera
  const lk2 = pt2(cx + 3, hipY, P.lL);
  limb(x, cx + 3, hipY, P.lL[0], 17, 8, pants);
  limb(x, lk2[0], lk2[1], P.lL[0] + P.lL[1], 15, 7, pants);
  dot(x, lk2[0] + Math.sin((P.lL[0] + P.lL[1]) * Math.PI / 180) * 3, lk2[1] + 13, 4.5, boot);
  // cabeza
  const hcy = neckY - 9 + (P.head || 0) * 2;
  dot(x, hx, hcy, 9.5 * (B.head || 1), skin);
  drawHair(x, hx, hcy, B, C, female, -leanR);
  // cara (mirando a +x)
  dot(x, hx + 4, hcy - 1, 1.7, '#181818');
  x.strokeStyle = hair; x.lineWidth = 1.6;
  x.beginPath(); x.moveTo(hx + 1.5, hcy - 4); x.lineTo(hx + 6.5, hcy - 4); x.stroke();
  // brazo delantero
  const ak2 = pt2(cx + 4, neckY + 4, P.aL);
  limb(x, cx + 4, neckY + 4, P.aL[0], 12, 7, bare ? skin : top);
  limb(x, ak2[0], ak2[1], P.aL[0] + P.aL[1], 11, 6, skin);
  dot(x, ak2[0] + Math.sin((P.aL[0] + P.aL[1]) * Math.PI / 180) * 3, ak2[1] + 12 * Math.cos((P.aL[0] + P.aL[1]) * Math.PI / 180), 4.5, glove);
  // estela del golpe activo
  if (P.streak) {
    x.strokeStyle = C.accent || '#ffd166'; x.globalAlpha = 0.75; x.lineWidth = 3;
    x.beginPath();
    x.arc(cx + 6, hipY - 10, 26, -1.1, 0.7);
    x.stroke();
    x.globalAlpha = 1;
  }
  if (P.glow) {
    x.strokeStyle = C.aura || C.accent || '#7fd4ff'; x.globalAlpha = 0.6; x.lineWidth = 2.5;
    x.beginPath(); x.arc(cx, hipY - 14, 30, 0, Math.PI * 2); x.stroke();
    x.globalAlpha = 1;
  }
}

function pt2(px, py, seg) {
  const r = (seg[0] * Math.PI) / 180;
  return [px + Math.sin(r) * 17, py + Math.cos(r) * 17];
}

function drawHair(x, hx, hy, B, C, female, tilt) {
  const hair = C.hair || '#222';
  x.save(); x.translate(hx, hy); x.rotate(tilt * 0.4);
  x.fillStyle = hair;
  const h = B.hair || 'flat';
  if (h === 'bald') { x.restore(); return; }
  if (h === 'mohawk') { x.fillRect(-2, -14, 4, 8); x.restore(); return; }
  x.beginPath(); x.arc(0, -2, 10, Math.PI * 1.02, Math.PI * 2.05); x.fill(); // casquete
  if (h === 'spiky') { for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(i * 5 - 2, -9); x.lineTo(i * 5, -15); x.lineTo(i * 5 + 3, -8); x.fill(); } }
  if (h === 'ponytail') { limb(x, -9, -2, 115, 16, 5, hair); }
  if (h === 'flame') { limb(x, -8, 0, 130, 14, 5, hair); x.fillRect(-10, -10, 5, 10); }
  if (h === 'mask') { x.fillStyle = C.gi || '#263238'; x.fillRect(-9, -3, 18, 12); }
  if (female) { x.fillRect(-12, -6, 4, 16); }                            // melena lateral
  if (B.band === 'headband') { x.fillStyle = C.trim || '#c22'; x.fillRect(-9, -7, 18, 3); }
  if (B.cap) { x.fillStyle = C.trim || '#37474f'; x.fillRect(-9, -13, 18, 5); x.fillRect(2, -9, 10, 2.5); }
  if (B.turban) { x.fillStyle = C.gi || '#ff7043'; x.fillRect(-9, -12, 18, 7); }
  x.restore();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ------------------------------------------------------------------ */
/* hoja completa                                                       */

const LOCO = [
  ['p_idle', 4, 7, true], ['p_walk', 6, 10, true], ['p_crouch', 1, 4, true],
  ['p_jump', 1, 4, false], ['p_fall', 1, 4, false], ['p_blockHigh', 1, 4, true],
  ['p_blockLow', 1, 4, true], ['p_hitHigh', 2, 12, false], ['p_hitLow', 2, 12, false],
  ['p_launched', 1, 6, false], ['p_knockdown', 2, 10, false], ['p_getup', 2, 8, false],
  ['p_dizzy', 2, 4, true], ['p_guardcrush', 1, 4, false], ['p_grab', 1, 4, false],
  ['p_thrown', 1, 6, false], ['p_maxactivate', 2, 6, false], ['p_ko', 1, 4, false],
  ['p_win', 4, 6, true], ['p_intro', 2, 5, false], ['p_parry', 1, 4, false]
];

export function placeholderSheet(def) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  if (!c || !c.getContext) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  // filas: locomocion + una fila por golpe (mv_<id>)
  const moves = [];
  const byId = def.moveById || {};
  const superIds = new Set((def.supers || []).map((m) => m.id));
  for (const id in byId) {
    if (byId[id] && byId[id].pose) moves.push(byId[id]);
  }
  moves.sort((a, b) => (a.id < b.id ? -1 : 1));

  const rows = [];
  for (const [name, frames, fps, loop] of LOCO) rows.push({ name, frames, fps, loop, poses: null });
  for (const m of moves) {
    const frames = superIds.has(m.id) ? 4 : 3;
    rows.push({ name: 'mv_' + m.id, frames, fps: 10, loop: false, poses: m.pose });
  }
  // Empaquetado en bandas de 12 celdas: varias animaciones comparten fila
  // para que la textura quepa en los 4096px de las GPU moviles.
  const PER = 12;
  // pre-paso: contar bandas ANTES de dibujar (asignar height despues de
  // dibujar borraria el canvas)
  let bands = 1, cur = 0;
  for (const r of rows) {
    if (cur + r.frames > PER) { bands++; cur = 0; }
    cur += r.frames;
  }
  c.width = PER * FW;
  c.height = bands * FH;
  let band = 0, cursor = 0;
  const anims = {};
  for (const r of rows) {
    if (cursor + r.frames > PER) { band++; cursor = 0; }
    anims[r.name] = { row: band, frames: r.frames, fps: r.fps, loop: r.loop };
    ctx.save();
    ctx.translate(0, band * FH);                 // cada banda en su fila
    for (let i = 0; i < r.frames; i++) {
      const P = r.poses
        ? attackPose(r.poses, i === 0 ? 'startup' : i === 1 ? 'active' : 'recovery', r.frames)
        : poseOf(r.name.slice(2), i, r.frames);
      ctx.save();
      ctx.beginPath();
      ctx.rect((cursor + i) * FW, 0, FW, FH);
      ctx.clip();                                  // los arcos no sangran a la celda vecina
      drawFighter(ctx, def, P, (cursor + i) * FW);
      ctx.restore();
    }
    ctx.restore();
    cursor += r.frames;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let b = 0; b < bands; b++) ctx.fillRect(0, b * FH + FEET, c.width, 1);  // suelo por banda
  return new Sheet(c, {
    frameWidth: FW, frameHeight: FH, meters: 1.8 * ((def.body && def.body.height) || 1), anchorY: ANCHOR, animations: anims
  });
}

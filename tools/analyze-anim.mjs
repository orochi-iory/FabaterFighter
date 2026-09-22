/**
 * Herramienta de desarrollo: analiza los BVH descargados y dibuja el perfil de
 * velocidad de manos y pies para localizar los fotogramas de impacto y decidir
 * las ventanas de recorte que usa tools/build-anim.mjs.
 *
 *   node tools/analyze-anim.mjs [directorio]   (por defecto /tmp/mocap)
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseBVH, jointWorldPos } from './bvh.js';

const dir = process.argv[2] || '/tmp/mocap';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.bvh')).sort();

const HANDS = ['LeftHand', 'RightHand'];
const FEET = ['LeftFoot', 'RightFoot'];
const BUCKET = 10;

for (const file of files) {
  const bvh = parseBVH(fs.readFileSync(path.join(dir, file), 'utf8'));
  const idx = (n) => bvh.names.get(n);
  const handIdx = HANDS.map(idx).filter((v) => v !== undefined);
  const footIdx = FEET.map(idx).filter((v) => v !== undefined);

  // Velocidad por fotograma (unidades/segundo) de manos y pies.
  const handSpd = new Array(bvh.nFrames).fill(0);
  const footSpd = new Array(bvh.nFrames).fill(0);
  let prev = null;
  const dt = bvh.frameTime;
  // El fotograma 0 de CMU es la T-pose (rotaciones a cero): descartamos el salto inicial.
  const FIRST = 3;
  for (let f = FIRST; f < bvh.nFrames; f++) {
    const pos = [...handIdx, ...footIdx].map((j) => jointWorldPos(bvh, j, f));
    if (prev) {
      for (let k = 0; k < handIdx.length; k++) {
        handSpd[f] = Math.max(handSpd[f], dist(prev[k], pos[k]) / dt);
      }
      for (let k = 0; k < footIdx.length; k++) {
        footSpd[f] = Math.max(footSpd[f], dist(prev[handIdx.length + k], pos[handIdx.length + k]) / dt);
      }
    }
    prev = pos;
  }

  const dur = (bvh.nFrames * dt).toFixed(2);
  const maxH = Math.max(...handSpd.slice(FIRST)), maxF = Math.max(...footSpd.slice(FIRST));
  const peakH = handSpd.indexOf(maxH), peakF = footSpd.indexOf(maxF);
  console.log(`\n### ${file}  ${bvh.nFrames}f @${(1 / dt).toFixed(0)}fps = ${dur}s  ` +
    `(juntas ${bvh.joints.length}, canales ${bvh.nChannels})`);
  console.log(`    pico mano ${maxH.toFixed(0)} u/s en f=${peakH} (${(peakH * dt).toFixed(2)}s) · ` +
    `pie ${maxF.toFixed(0)} u/s en f=${peakF} (${(peakF * dt).toFixed(2)}s)`);

  // Perfil por bloques: M = mano, P = pie, altura según intensidad.
  const n = Math.ceil(bvh.nFrames / BUCKET);
  for (const [label, arr, max] of [['mano', handSpd, maxH], ['pie ', footSpd, maxF]]) {
    let line = `    ${label} |`;
    for (let b = 0; b < n; b++) {
      let v = 0;
      for (let f = b * BUCKET; f < Math.min((b + 1) * BUCKET, bvh.nFrames); f++) v = Math.max(v, arr[f]);
      line += ' ▁▂▃▄▅▆▇█'[Math.min(7, Math.round((v / max) * 7))] + (b % 10 === 9 ? '|' : '');
    }
    console.log(line);
  }
  console.log(`         ${'0'.padEnd(n + Math.floor(n / 10))}` +
    ` (cada bloque = ${BUCKET}f = ${(BUCKET * dt * 1000).toFixed(0)}ms)`);
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

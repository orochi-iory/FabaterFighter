/**
 * Sella src/version.js con el commit HEAD y la fecha actuales.
 * Uso: node tools/stamp-build.mjs [tag] [notas]
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
// Fecha en la zona del proyecto (Europe/Madrid), no UTC.
const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const tag = process.argv[2] || 'v0.9';
const notes = process.argv[3] || '';

writeFileSync(path.join(root, 'src/version.js'), `/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con \`node tools/stamp-build.mjs\`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: '${tag}',
  commit: '${commit}',
  date: '${date}',
  notes: '${notes.replace(/'/g, "\\'")}'
};
`);
console.log(`src/version.js sellado: ${tag} · ${commit} · ${date}`);

/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.11',
  commit: '66865f2',
  date: '2026-09-23',
  notes: 'Cross-up aéreo, suelo corregido, pecho plano, retiming de golpes con anticipacion y follow-through'
};

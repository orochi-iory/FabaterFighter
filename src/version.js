/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.24',
  commit: '4ef0318',
  date: '2026-09-24',
  notes: 'Normales de campo continuo (fin del diamante), publico 16 caras con gafas/gorras/barbas/peinados, velo y niebla reforzados'
};

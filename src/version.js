/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.25',
  commit: '1d5ad12',
  date: '2026-09-24',
  notes: 'Geometria suavizada (adios diamante de verdad), caida plana con los pies fuera del suelo, bruma clara detras del ring'
};

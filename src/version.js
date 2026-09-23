/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.20',
  commit: '7cc221b',
  date: '2026-09-23',
  notes: 'Modelado SDF de una sola superficie (marching tetrahedra) con cache por personaje, calco de cara shrinkwrap, 3 escenarios (templo/ciudad/playa) aleatorios por combate y publico humano instanciado'
};

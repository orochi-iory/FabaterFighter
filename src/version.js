/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.31',
  commit: '4323c28',
  date: '2026-09-24',
  notes: 'Camino 2D: carga de tilesheets con contrato documentado, sprites provisionales por personaje (paleta y compleccion propias), mismo motor/escenario/HUD. Pruebalo con ?render=2d'
};

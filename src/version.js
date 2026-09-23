/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.15',
  commit: '7b4e01c',
  date: '2026-09-23',
  notes: 'Patadas y golpes reconstruidos segun tilesheets 2D: pierna plena, apoyo pivotado, tronco atras, brazos en tijera'
};

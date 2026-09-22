/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.12',
  commit: '670b724',
  date: '2026-09-23',
  notes: 'Controles absolutos tras cross-up, defensa mantenida, retratos con cara texturizada, ojos en el calco, pulido de locomocion'
};

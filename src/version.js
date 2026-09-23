/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.21',
  commit: 'a0df821',
  date: '2026-09-23',
  notes: 'Sin T-pose ni deslizamientos tras golpes, masculinos musculosos, caras 2x legibles y arranque a prueba de cuelgues'
};

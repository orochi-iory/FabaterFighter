/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.22',
  commit: '1a0fd8d',
  date: '2026-09-23',
  notes: 'Arranque a prueba de errores, sin marcas de tela, brazos cerrados en intro, antorchas/barriles/cajas, publico 156 con velo de fondo y niebla'
};

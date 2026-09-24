/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.28',
  commit: 'fb9e92c',
  date: '2026-09-24',
  notes: 'Controles tactiles arreglados: multi-touch real, deslizar en el pad, sin robo de gesto, pausa y GC; pista de rotacion'
};

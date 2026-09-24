/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.30',
  commit: 'ac4f297',
  date: '2026-09-24',
  notes: 'El damero por fin identificado al 100%: winding mezclado del marching (37% de aristas); ahora girado en los indices reales (0 inconsistentes)'
};

/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.27',
  commit: '81128b0',
  date: '2026-09-24',
  notes: 'Pesos de skinning por distancia al hueso (campo continuo, sin oscilaciones): ultimo mecanismo posible del damero eliminado'
};

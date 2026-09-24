/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.26',
  commit: 'b2f5405',
  date: '2026-09-24',
  notes: 'Causa del damero encontrada: la pertenencia a cubo oscilaba por celda; union de 8 celdas + kernel compacto = mezcla estable. Fronteras piel/venda suaves.'
};

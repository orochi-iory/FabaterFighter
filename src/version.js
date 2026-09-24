/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.23',
  commit: '2b1ffb4',
  date: '2026-09-24',
  notes: 'Pesos de skinning IDW (adios damero en el cuerpo), publico con 10 caras hombre/mujer al azar'
};

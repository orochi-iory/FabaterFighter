/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.29',
  commit: '4185cfd',
  date: '2026-09-24',
  notes: 'Pad tactil analogico de 8 direcciones (diagonales), y el lote anti-parpadeo: FrontSide, camara de precision, calco y pelo separados del z'
};

/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.33',
  commit: 'ec6e842',
  date: '2026-09-24',
  notes: 'Skinning afinado: dominio claro de cada hueso (pliegues que no colapsan) sin bultos; ingle sin competir con el muslo'
};

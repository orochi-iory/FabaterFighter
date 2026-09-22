/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.10',
  commit: '7879d1e',
  date: '2026-09-23',
  notes: 'Caras limpias, pelo sin z-fighting, mocap sin joroba, guardia en hitstun, sello de build en HUD'
};

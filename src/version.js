/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.13',
  commit: 'a1b17ad',
  date: '2026-09-23',
  notes: 'Pecho masculino sin tetillas; caminar y golpes generados por IK; golpes altos a la altura del hitbox; agachado y caida al suelo procedurales'
};

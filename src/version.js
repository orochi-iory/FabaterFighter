/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.18',
  commit: '0b7f873',
  date: '2026-09-23',
  notes: 'Crouch-attacks sin hundido ni tabla horizontal (pesos de hueso corregidos en densify); golpe aereo conserva momento del salto; cejas/pomulos de perfil; sesgos de estilo en guardia y tronco'
};

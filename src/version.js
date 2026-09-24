/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.32',
  commit: '2ab2b41',
  date: '2026-09-24',
  notes: 'Auditoria de animaciones contra la lamina SF2: pies plantados (fin de la garra que leia como rodilla dislocada), tronco 20 atras en patada, punetazo fuerte medido desde el hombro (brazo extendido de verdad)'
};

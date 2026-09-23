/**
 * Sello de build. El HUD lo muestra en pantalla para saber siempre qué
 * versión se está probando. Se regenera con `node tools/stamp-build.mjs`
 * (lo rellena con el commit HEAD y la fecha actuales) antes de cada entrega.
 */
export const BUILD = {
  tag: 'v0.16',
  commit: '2262da3',
  date: '2026-09-23',
  notes: 'Fuertes mucho mas lentos y largos que debiles; ataques aereos con pose de lamina (diagonal de pierna, puno hundido); encaje con arco atras'
};

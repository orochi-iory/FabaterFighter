# Guía · modelo nuevo de Voltia

> Sección propia y limpia. El modelo original tiene **su** guía en
> `preview/guia-vieja.html` (datos en `voltia/guide/vieja.json`) y aquí no se
> toca. Todo lo intentado antes de esta fecha está descartado y borrado.

## Estado

| pieza | estado |
|---|---|
| Modelo original + pelea Voltia vs Voltia | intacto, publicado |
| Guía del modelo original | intacta |
| Modelo nuevo | **empieza de cero aquí** |

## Referencias

- `ref/rmika_pose_ref.png` — pose de guardia de R. Mika, 85×112 px, 17 colores.
  Se usa **solo** para las **botas** (caña alta, vuelta en el borde, panel
  delantero más claro, banda en el empeine, suela blanca) y la **coleta**
  (una sola, gruesa, en arco largo que pasa de la cadera).
- `ref/rmika_sheet.png` — hoja completa de R. Mika (1910×3887, fondo magenta
  puro). Tiene dos coletas: la pequeña se ignora.

## Medidas que manda el objetivo

Del frame de referencia de Voltia (30×64 px, 21 colores):

| métrica | objetivo | banda admitida |
|---|---|---|
| alto | 64 px | ±20 % |
| ancho | 30 px | ±25 % |
| tinta | 940 px | ±30 % |
| contorno | 7,1 % | ±50 % |
| colores | 21 | ±30 % |
| pelo (coleta) | 31,2 % | ±25 % |
| ancho de cabeza | 27 px | ±25 % |

`tools/fingerprint.py <referencia> <frames...>` lo comprueba.

## Pipeline (lo único que se usa)

1. Generar la hoja **grande**, con la referencia como imagen 1 y 2.
2. `tools/pixelate.py --block 4 --palette "…"` → pixelado por **color
   dominante**, nunca promediando. El bloque se elige por *altura de origen ÷
   bloque ≈ 64*.
3. `tools/cut_native.py` → recorte a tamaño **nativo**, sin reescalar.
4. `tools/fingerprint.py` → si falla, se regenera.
5. `tools/make_gif.py --zoom 4 --fps 8` → **revisión en movimiento**. Un fallo
   de tamaño o de pose repetida se ve en el GIF al instante.

## Reglas que no se negocian

- **Sin suavizado en ningún paso.** Nada de LANCZOS ni bilinear sobre el sprite.
- **La paleta se fija a la de la referencia** (21 colores + verde de fondo).
- **El rayo del pecho se estampa** (`tools/stamp_design.py`), no se pide.
- **La coleta cambia de posición en cada frame** y su peso se mide (26–36 %).
- **Las 8 o 18 poses son distintas**: si dos celdas se parecen, la hoja está mal.

## Bitácora

- 2026-10-19 · limpieza total de lo anterior; queda el modelo original con su
  guía y su pelea. Se abre esta sección.
- 2026-10-19 · primer stance con la referencia de R. Mika (8 frames, GIF).
  Medido: alto 79–91, ancho 59–77, tinta 2 535–2 820, contorno 18 %, pelo 18–26 %.
  **Fuera de banda en todo menos la paleta.** Ancho y contorno son el doble del
  objetivo: el dibujo es demasiado «carne» y el traje demasiado corto.

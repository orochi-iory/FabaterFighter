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

## Separar animaciones de una hoja sin rejilla (R. Mika)

La hoja de R. Mika (1910×3887) no tiene celdas: las figuras están empaquetadas a
mano. Método que funciona, en `tools/sheet_bands.py`:

1. **Bandas**: filas 100 % magenta separan secuencias. Salen 30.
2. **Trozos**: componentes conexas por tramos (sin numpy, union-find sobre
   run-length). 525 trozos → 327 figuras.
3. **Unir**: un trozo solo se pega a una figura si es **pequeño** (< 35 % de su
   área) y está a menos de **6 px**. Con 10 px o sin el límite de tamaño se
   fusionan dos frames vecinos y sale uno de 180 px de ancho que rompe el lienzo
   común del GIF.
4. **Orden**: izquierda → derecha.
5. **Recorte**: fondo magenta → transparente; nunca se reescala.
6. **GIF** por banda con `tools/make_gif.py --zoom 2 --fps 12`, que alinea por
   los pies en un lienzo común.

Límite conocido: si una banda lleva dos animaciones seguidas, salen juntas; y
una coleta muy separada puede contarse como frame. Los nombres no están en la
hoja: se ponen mirando la postura y con columna de confianza.

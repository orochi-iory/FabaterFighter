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

- `ref/chunli_sheet.png` — hoja de Chun-Li, 700×2443, fondo liso (144,200,232).
  Es la referencia viva del proyecto y está separada por animaciones en
  `chunli/` (23 filas, 485 frames). Ver `preview/chunli.html`.

## Separar una hoja por animaciones (`tools/sheet_cut.py`)

1. **Fondo**: color de la esquina → transparente con tolerancia 24. Nunca se
   reescala nada.
2. **Filas**: franjas totalmente fondo marcan el corte entre animaciones.
3. **Figuras**: componentes conexas por tramos. Un trozo pequeño (sombra,
   mechón, efecto) se pega a su figura si es < 35 % del área y está a < 8 px.
4. **Frames**: se guardan recortados y en orden izquierda → derecha.
5. **GIF** con `tools/make_gif.py` a 12 fps, lienzo común alineado por pies.

`tools/anim_data.py` mide cada frame (alto, ancho, base de apoyo, alcance del
brazo y de la pierna), localiza los **frames activos** de un golpe por alcance y
genera el GIF.

### Trampas ya pagadas

- **El lienzo del GIF debe ser CW×CH**, no el tamaño del frame. Si se crea del
  tamaño de cada frame, las figuras se recortan contra su propio borde y parece
  que el sprite está cortado. Solo se nota cuando los frames tienen anchos
  distintos.
- No reutilizar el nombre `d` para una distancia dentro de una función cuyo
  parámetro se llama `d`: el bucle revienta en la segunda vuelta.
- Un retrato dentro de una fila de animación hay que sacarlo del GIF
  (se detecta por altura > 1,8 × la mediana de la fila).

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

## Lecciones de trocear hojas ajenas

Lo comprobado, con número:

1. **La forma de la hoja manda.** R. Mika: figuras sueltas, sin rejilla, con
   otro personaje y objetos mezclados → el troceado por bandas es lo mejor que
   se puede hacer y los nombres son casi adivinanza. Chun-Li: fondo liso y una
   animación por fila → el troceado sale limpio. Antes de prometer nada hay que
   mirar la hoja.
2. **El corte es fiable; el nombre no.** Separar 485 frames no falla. Decir
   «esto es un puñetazo débil y no fuerte» sí: los píxeles no lo distinguen.
3. **El frame data medible existe.** El alcance (distancia máxima de la tinta al
   centro de los pies) localiza la extensión del brazo o la pierna, y de ahí
   salen arranque / activo / recuperación. Ej.: patada alta 7 frames →
   1 / 1 / 5.
4. **Los frames repetidos son información, no error.** Un golpe vuelve a la
   pose de guardia: el frame 1 y el 5 pueden ser idénticos (banda 7 de Chun-Li).
5. **El IoU no prueba que el orden esté bien.** Un salto mortal baja a 0,17
   porque el cuerpo gira 360°, y está en orden. Alinear por los pies solo vale
   cuando hay contacto con el suelo; en el aire hay que alinear por la caja.
   Conclusión: el IoU sirve para detectar saltos, no para validar secuencias.
6. **La velocidad no está en el PNG.** Cualquier fps que pongamos es propuesta.

Lo que sigue sin resolverse: filas con dos animaciones seguidas, y los golpes
que se diferencian solo por la intención (débil/fuerte). Para eso hace falta el
juego y la lista de movimientos del personaje, no el dibujo.

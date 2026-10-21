# Guía · cómo está hecho esto

Documento de trabajo. Solo lo que está **en uso hoy**. Lo que se probó y se descartó no
vive aquí: vive en el historial de git, que es donde se busca si hace falta.

## Estado

- **Voltia**: hoja oficial `voltia/sheet_uniform.png` (5250 × 8300, celdas 350 × 332,
  25 animaciones, 102 frames). Bordes verdes, contorno comido −1 px de arte, grano
  limpiado. Genera la hoja `tools/voltia_reconstruir.py`.
- **Chun-Li**: personaje completo, 22 animaciones, a la altura de Voltia (147 px de
  mundo). Hoja de juego en `voltia/nuevo/chunli/game/`.
- **Visor**: `preview/index.html` (frames, tira, escenario, manual). Sin secciones de
  pruebas: el modelo que se ve es el que se juega.

## Medidas de referencia

| | valor |
|---|---|
| celda de la hoja | 350 × 332 px de hoja |
| rejilla de la hoja | **2 px de hoja por px de arte** |
| rejilla de `voltia/frames/` | **4 px por px de arte** (0,00 % de bloques 4×4 sucios) |
| altura de Voltia | 147 px de mundo (tinta 300 px de hoja ≈ 150 px de arte) |
| altura de Chun-Li | 147 px de mundo, medida, nunca deducida |
| paleta | 18 colores opacos + blanco; no se añaden colores al limpiar |
| escalas de exportación | 4× frames · 2× hoja · 1× arte |

## La regla del píxel

**Nunca interpolar pixel art.** Nada de LANCZOS ni BILINEAR, y nada de factores
fraccionarios. Si hay que cambiar de rejilla: bajar con **NEAREST a un divisor entero** y,
si hace falta, volver a subir con **NEAREST**. Y al pegar en una hoja, **alinear el
pegado al bloque** (coordenadas pares si la rejilla es 2×).

Esto no es teoría: `normalize.py` reescalaba con LANCZOS y un factor no entero (el que
igualaba la altura de la cabeza), y el resultado medido fue **52,85 % de bloques 2×2 no
uniformes** en la hoja: color a medio píxel, cuadrados sueltos y el morado de la cara
donde el azul se mezclaba con el rosa. Todas las hojas entregadas antes de arreglarlo
estaban entre el **48 % y el 55 %**. Ahora `normalize.py` y `build_sheet.py` usan solo
NEAREST.

## El grano está en el dibujo, no en el escalado

Medido en `voltia/frames/voltia_stance_0.png` («grano» = píxeles cuyo color no aparece en
ninguno de sus 8 vecinos):

| | grano |
|---|---|
| nativo a 4× | **0,00 %** |
| el mismo, a 1× de arte (97 × 153) | **7,13 %** |

O sea: la rejilla 4× es perfecta, pero un nivel por debajo el dibujo ya trae color suelto.
**Ese color suelto es dibujo, no un fallo del proceso**, y por eso el modelo oficial no lo
toca: se entrega el nativo tal cual (`--filtros 0`).

## Pipeline oficial de Voltia

```bash
python3 tools/voltia_reconstruir.py
```

Por frame, cero LANCZOS:

1. **÷4 NEAREST** del nativo → 1× de arte (el píxel real del dibujo);
2. **×2 NEAREST** a la hoja, pegado alineado a par.

**Eso es todo.** Ni limpieza, ni islas, ni silueta, ni erosión: **0 filtros de
reconstrucción**. Los frames nativos son un ×4 exacto (0,00 % de bloques 4×4 no uniformes),
así que ÷4 NEAREST recupera el píxel original y el sprite es **el dibujo nativo tal cual**.

Comprobado frame a frame: los 102 frames de la hoja son **idénticos píxel a píxel** al nativo
÷4 (0 diferencias visibles; solo cambia el RGB de los píxeles con alfa 0, que no se ven).

### Lo que ya no se hace, y por qué

Las versiones anteriores pasaban tres filtros (masa local, islas de color, silueta de 1 px) y
luego comían 1 px de arte del contorno. Bajaban el «grano» medido de 7,13 % a 0,45 %, pero
**borraban dibujo**: el brillo del ojo, el tono de la nariz, la punta de la coleta y 949
píxeles del solo stance. Ese número bajo no era calidad, era detalle perdido. Se quedan en el
código detrás de `--filtros 1` solo para poder comparar; **el modelo oficial se hace con
`--filtros 0`**, que es el valor por defecto.

### Las medidas, sin maquillar

| stance a 1× de arte | nativo | con filtros (`--filtros 1`) | **oficial (0 filtros)** |
|---|---|---|---|
| «grano» (aislados) | 7,13 % | 0,45 % | **7,13 %** |
| islas de color ≤ 4 px | 876 | 115 | **876** |
| bloques 2×2 sucios | — | 0,00 % | **0,00 %** |
| colores opacos | 18 | 18 | **18** |
| píxeles inventados | — | 949 | **0** |

El «grano» de 7,13 % es del dibujo, no del proceso: a 4× es 0,00 % porque cada píxel de arte
ocupa un bloque 4×4. Referencia de arte real en el repo (Chun-Li, SF2): 2,85 %. Es decir,
Voltia dibuja más suelto que el arte original de SF2; eso solo se arregla redibujando el
nativo, no con filtros.

Tamaño medido del stance: **94 × 151 px de arte** (antes, con la erosión, 95 × 150).

## Regla de oro 5 · quitar el velo rojo (2026-10-20)

**Por qué salía borde rojo aunque el fondo se hiciera transparente:** no era rojo puro. La IA
antialiasa el personaje contra el fondo, y deja **bandas de 2-4 px** de mezcla. Medido en el filo:

| color de filo | qué es |
|---|---|
| `(68,0,0)`, `(53,0,1)`, `(40,0,0)` | negro de la silueta mezclado con rojo: **83 % del filo** |
| `(255,0,0)` puro | fondo, ese sí se eliminaba |

Mi umbral pedía `r > 215` para considerar «rojo»; las mezclas tienen r entre 40 y 110, así que
ninguna pasaba el filtro y se quedaban ahí.

**Arreglo** (`desmatar` en `trocear.py`): la mezcla cumple

```
p = a·color_real + (1−a)·rojo   →   exceso = p.r − máx(p.g, p.b) = 255·(1−a)
                                →   a = 1 − exceso/255
```

Si `a ≥ 0,5` el píxel es del personaje y se le pone **el color del interior más cercano**
(propagación BFS desde el dibujo limpio); si no, era fondo y se descarta. **0 píxeles rojizos en
el filo**, antes 83 %.

## Llevar al tamaño del modelo original

`encajar.py` reduce los sprites nativos (285-308 px) a la rejilla oficial **96 × 152** con anclaje
de cabeza (48, 26) y pies en 146. Aquí **sí** se reduce, y con filtro promediado a propósito: el
dibujo de la IA es una ilustración con antialias, y promediada queda limpia; reducida con NEAREST
a factor fraccionario se rompe (eso era el aspecto sucio). Resultado en `voltia/nuevo/creador/oficial/`.

## Regla de oro 6 · no escalar por CSS (2026-10-20)

**Síntoma:** rayas horizontales dentro del sprite, sobre todo en la piel (zona lisa).

**Causa:** el `<canvas>` medía 1140 px (285 × 4) y no cabía en la columna, así que el CSS lo
encogía a ~1080 por `max-width:100%`. Con `image-rendering:pixelated` y un factor **fraccionario**
el navegador se salta filas de forma irregular. Medido:

| versión | series de filas idénticas |
|---|---|
| 4× exacto | `{4: 501}` — todas de 4 filas |
| encogido por CSS | `{3: 106, 4: 395}` — mezcla |

Cada serie de 3 es una fila perdida: eso son las rayas.

**Arreglo:**
- los canvas **nunca** se escalan por CSS (`max-width` fuera); la escala es **siempre entera** y se
  elige la mayor que quepa (botón «Ajustar a la ventana»), con scroll horizontal si hace falta;
- las miniaturas y las hojas de referencia se dejan **suavizar** (sin `pixelated`): al reducirlas a
  una altura fija el factor no es entero y `pixelated` produce el mismo defecto;
- aplicado a los tres visores: `index.html`, `nuevo.html` y `chunli.html`.

## Regla de oro 7 · la hoja NO cuantiza: se midió (2026-10-20)

La duda era razonable —«la hoja se ve cuantizada»— así que se midió en vez de opinar.
`tools/voltia_nativo_coloc.py` baja cada frame nativo ÷4 y busca su sitio dentro de la
celda oficial, y después **compara píxel a píxel**:

| comprobación | resultado |
|---|---|
| frames nativos ÷4 colocados en la celda vs. celda de la hoja | **102 de 102 idénticos**, 0 px distintos |
| colores del dibujo (frame nativo opaco) | **18** |
| colores del dibujo (celda de la hoja) | **18** |

O sea: los 18 colores son del dibujo, no de un paso de conversión. La hoja es un
**reempaquetado** (×2 NEAREST) de los mismos píxeles, no un filtro. Lo que cambia el
aspecto no es la hoja: es cómo lo pinta la pantalla.

## Regla de oro 8 · escalar en píxeles de PANTALLA, no de CSS (2026-10-20)

La regla 6 (escala entera en CSS) **no bastaba**. En una pantalla con
`devicePixelRatio` 1,25 —lo normal en Windows— un canvas de 700 px CSS ocupa 875 px
reales, y el navegador lo reescala por 1,25: otra vez filas perdidas y colores
mezclados, con el canvas «bien» dimensionado.

Medido, contando series de filas idénticas en una zona lisa:

| cómo se pinta | series |
|---|---|
| 4× exacto en píxeles reales | `{4: 501}` |
| escalado a 0,8× (no cabía) | `{3: 106, 4: 395}` |
| escala CSS entera × 1,25 de densidad | mezcla equivalente |

**Cómo se pinta ahora (los tres visores):**

- el canvas se mide en **píxeles de dispositivo**: `ancho = W·M`, con `M` entero;
- el CSS se pone a `W·M / devicePixelRatio` px, aunque salga decimal: así 1 px de
  lienzo = `M` px reales y el navegador **no toca nada**;
- `imageSmoothingEnabled = false` y ninguna regla `max-width` sobre el canvas (si no
  cabe, scroll horizontal);
- `M` se elige por «Ajustar a la ventana» con el ancho **y el alto** de la ventana.

**Comprobación en la propia página:** el botón *🔍 Comprobar píxeles* lee el canvas con
`getImageData`, lo compara con el PNG de origen píxel a píxel y escribe el resultado:
`0 de N px de pantalla distintos (0,00 %) · DPR · escala · tamaño CSS`.

Con `devicePixelRatio` 1,25 y escala 1×: canvas **700×664** px de dispositivo = **560×531,2**
px CSS. Antes: canvas 700 px CSS → 875 px reales → reescalado.

**El visor del modelo original** ahora abre con la fuente **frames nativos 4×** (el PNG tal
cual, sin escalar) y deja la hoja de juego como segunda fuente, avisando de que es el mismo
dibujo. La tira de frames y el escenario (`960×540` → CSS `768×432` a DPR 1,25) van igual.

**Chun-Li:** las tiras ya no se estiran con `width:100%` (van a tamaño nativo con scroll) y
las miniaturas dejaron de usar `image-rendering:pixelated`, que a altura fija producía el
mismo defecto.

## Regla de oro 9 · el visor no se reconstruye 10 veces por segundo (2026-10-21)

Lo que se veía como «el visor está roto y el selector se ha vuelto loco» eran **cuatro
fallos de maqueta**, ninguno del sprite:

| síntoma | causa medida | arreglo |
|---|---|---|
| una fila de 6 sprites gigantes que se corta | la tira era un **canvas de 2304 px** (8 sprite × 288) dentro de un contenedor de ~600 px: desbordaba y se recortaba | la tira ahora son `<img>` de 84 px en una fila con scroll |
| fichas vacías en la secuencia | el `<img>` de cada ficha **no tenía caja reservada**: ancho 0 hasta que la imagen cargaba, y cada carga recolocaba la fila | `width`/`height` por atributo + `aspect-ratio` + fondo visible + marca si no carga |
| la secuencia «salta» | `pintar()` (que se llama **en cada frame**) terminaba con `dibujarSecuencia()`, que vaciaba y reconstruía el DOM de las fichas: 10 veces por segundo | el DOM se reconstruye solo cuando cambia la lista; el bucle solo repinta el canvas. `drawImage` por ejecución: **130 → 10** (modelo original) y **72 → 8** (creador) |
| el canvas sale a una escala falsa | la escala se medía con `parentElement.clientWidth` en el primer pintado, que en móvil vale **0** antes de maquetar, y no se recalculaba | `ResizeObserver` sobre el hueco + respaldo por `window.innerWidth` |

Detalle de la escala, para que no se repita: **M es el número de píxeles REALES de pantalla
por píxel del sprite**. El canvas se dimensiona `W·M` y el CSS va a `W·M / devicePixelRatio`,
así que el navegador no reescala nada. Las miniaturas (fichas, tira, galería) van al revés a
propósito: **se dejan suavizar**, porque se reducen a una altura fija y ese factor nunca es
entero.

Las guías (línea roja en el eje de la cabeza) venían **activadas por defecto** y se confundían
con una raya del dibujo: ahora están apagadas.

**Medido sobre el dibujo, para separar sprite de visor** (filas sueltas en la piel: un píxel
distinto de sus dos vecinos verticales, que sí son iguales entre sí):

| sprite | px de piel | filas sueltas |
|---|---|---|
| nativo nuevo (`creador/sprites/stance/f00`, 285×524) | 2 855 | **0 (0,0 %)** |
| oficial nuevo (`oficial/stance/f00`, 96×152) | 211 | **0 (0,0 %)** |
| celda de la hoja original (`sheet_uniform`, stance 0) | 723 | **54 (7,5 %)** |

O sea: las rayas de la piel están en el **arte original**, no en el creador ni en el visor.

## Regla de oro 10 · el velo rojo comía la PIEL (2026-10-21)

Síntoma, con captura: en la hoja de la IA el brazo es piel limpia y en el visor sale con
**manchas marrones de bordes rectos** (brazos, muslo y manos).

Causa medida. `desmatar()` aplicaba la regla del velo a **todo píxel opaco**:

    exceso = r − máx(g, b)          → si exceso > 45, se considera «mezcla con el rojo»

La piel de Voltia tiene exceso alto:

| color de piel | exceso | qué hacía el filtro |
|---|---|---|
| `(242, 173, 127)` | **69** | la daba por velo, `a = 1 − 69/255 = 0,73` |
| `(223, 156, 119)` | **104** | `a = 0,59` → al corte 0,5 pasaba, pero con el color del vecino |
| `(140, 78, 60)` | **80** | idem |

O sea: la piel se detectaba como «mezcla de rojo», se le bajaba la opacidad y se le pegaba
el color limpio más cercano (pelo morado, negro de la línea). De ahí los parches con
bordes rectos. Los tonos de esos parches aparecían **172 veces** en nuestro sprite y solo
**12** en la hoja original de la IA: **las manchas las metía el filtro**.

Arreglo: el velo solo puede existir en una **banda pegada al fondo**. Se mide la distancia
de cada píxel opaco al fondo (BFS desde lo transparente) y **solo se toca lo que está a
6 px o menos del filo**. El interior del dibujo queda intacto, sea del color que sea.

Medido en `stance/f00`, con el mismo contador (no-piel rodeado de piel por los cuatro lados):

| imagen | px de piel | no-piel dentro de piel |
|---|---|---|
| hoja original de la IA | 4 122 | 579 (14,0 %) |
| **después del arreglo** | 3 966 | 586 (**14,8 %**) |
| antes del arreglo | 3 051 | 744 (24,4 %) |

El 14,8 % que queda es el del dibujo (los dedos del guante, la sombra del hombro): está
igual en el original. Lo que sobraba era nuestro.

Comparativa guardada, dos filas antes y dos después (stance y walk):
`voltia/nuevo/creador/antes_despues_piel.png`.

## Regla de oro 11 · ningún canvas con `image-rendering:pixelated` (2026-10-21)

Con `pixelated`, si el reparto entre píxeles del canvas y píxeles reales de pantalla **no es
exacto** (dpr 2,75 en el móvil, o una columna de ancho fraccionario), el navegador se salta
filas y salen rayas. Y con un canvas enorme dentro de una columna estrecha, el navegador lo
reduce: es lo que se veía como «una fila de 6 sprites gigantes cortada».

Ahora:

- el canvas se mide **en píxeles reales de pantalla** (`W × M`, M entero) y el CSS va a
  `W·M / dpr`, aunque salga decimal;
- **sin `image-rendering:pixelated`**: si el reparto no es exacto, el navegador remuestrea
  suave en vez de saltarse filas;
- la tira de frames es una fila de `<img>` con scroll, no un canvas gigante.

## Regla de oro 12 · el velo rojo, versión que funciona (v5) (2026-10-21)

Hubo que corregirlo **cuatro veces**. Copio las cuatro con el fallo de cada una, porque la
lección no es el código: es que cada versión se validaba con una métrica que no miraba
donde estaba el problema.

| versión | qué hacía | por qué fallaba | medido |
|---|---|---|---|
| v1 | umbral `r > 215` | el antialias deja `(40,0,0)`…`(110,0,0)`, ninguno pasaba | 83 % del filo seguía rojo |
| v2 | `a = 1 − exceso/255` sobre **todo** lo opaco | la piel tiene exceso alto por sí misma | 744 px de mancha en el brazo |
| v3 | banda de 6 px + prueba por canales verde/azul | con referencia casi negra el verde es ~0 y el rojo previsto sale 255 | filo rojizo 19 → **858** |
| v4 | banda + ajuste por mínimos cuadrados | se aplicaba al **recorte**, cuyos bordes no son fondo | 220 px de filo rojizo en walk |
| **v5** | lo mismo, aplicado **al lienzo** ya compuesto | — | filo rojo puro ≤ 3 px por frame |

**La prueba de mezcla (esto es lo que hay que conservar).** Si un píxel es mezcla de un
color limpio C y rojo puro R=(255,0,0), entonces `p − R = a·(C − R)` y `a` sale de golpe por
mínimos cuadrados en los tres canales:

    a = ((p−R)·(C−R)) / |C−R|²        y se exige |p − (R + a·(C−R))| ≤ 85

Dos descartes que salvan la piel: si `a > 1,02` el píxel es **más claro** que su interior y
no puede ser mezcla con rojo (mezclar con rojo solo quita); y si el residuo es grande es una
sombra, una línea o un brillo, no una mezcla. Barrido de 12 combinaciones (radio 4/6, tol
30…85, corte 0,45/0,50): sin desmatar quedaban **2 439** px de filo rojizo; con
radio 6 · tol 85 · corte 0,45, **42**, y las manchas dentro de la piel no suben.

**El error de la v4, que costó otra vuelta:** el filtro corría sobre el **recorte** de cada
sprite. El recorte no tiene fondo alrededor —sus bordes son el corte—, así que su filo
quedaba a distancia `-1` (interior) y el velo de arriba sobrevivía: una línea roja en el
borde superior de varios frames de walk. Se mueve al **lienzo**, que sí tiene su
transparencia de verdad.

Estado final medido en los 14 sprites (2 855-5 220 px de piel por frame): **0-3 px de rojo
puro** en el filo, y el 100 % de las manchas que quedan dentro de la piel son píxeles
**idénticos** a la hoja original de la IA (sombra del hombro, dedos enguantados, brillo).
Un filtro ya no puede quitar eso: es dibujo.

Pruebas guardadas: `antes_despues_piel.png` (las manchas de brazos y muslo) y
`estado_brazos.png` (los 14 frames, brazo y boca limpios).

## Ancla de cuatro vistas (2026-10-21)

Referencia única para generar: **`voltia/nuevo/creador/ancla/ANCLA_voltia_4_vistas.png`**,
**1408×768** (el mismo formato que la imagen de referencia que pasó el usuario), con las
cuatro vistas a la misma altura de tinta, la misma línea de pies y su etiqueta debajo:
`FRENTE · DERECHA · IZQUIERDA · TRASERA`.

Se monta con `PYTHONPATH=tools/pylibs python3 tools/creador_ancla.py` a partir de las cuatro
imágenes de `creador/ancla/`. La banda blanca de las etiquetas no forma parte del sprite: si
se usa la hoja como material para trocear, hay que recortar antes de `y=690`.

**Trampa medida:** al pedir «mirando a la derecha» o «de espaldas», el modelo devolvió
**de frente** las dos veces. Lo que sí funciona es describir la dirección respecto al **borde
de la imagen**: «her chin, nose, chest, belt buckle and both boot toes point toward the RIGHT
edge of the image; the ponytail is on the LEFT side». Con esa formulación salieron bien.

De la hoja que pasó el usuario se descartó el **quinto sprite por la izquierda** (está a otra
escala). Por eso el ancla se genera de cero: cuatro figuras y ninguna dudosa.

## Gestor de sprites: borrar y añadir sin salir del visor (2026-10-21)

En el creador, sección **«Sprites del movimiento · borrar y añadir»**:

- **Marcar y borrar.** Se marcan los sprites que no sirven y el visor descarga
  `borrar_<mov>_<resol>.txt` con la lista exacta. En el repo:
  `PYTHONPATH=tools/pylibs python3 tools/papelera.py --lista ~/Downloads/papelera_stance.txt`
  Mueve el PNG nativo **y** su versión oficial a `creador/papelera/`, **renumera** lo que queda
  (`f00, f01…`) y apunta en cada frame su índice `original`. No toca `sheet_*.png`.
  Probado de punta a punta: mover los índices 2 y 5 deja 6 frames; `--restaurar` devuelve los
  8 **byte a byte idénticos** (0 diferencias comprobadas con PIL); `--vaciar` borra de verdad.
- **Estados.** Aprobar / pendiente / descartar se guardan en `datos.json` (`estado`):
  `python3 tools/estado_sprites.py --estado aprobado --lista ...` y `--ver stance` resume.
  Descartar **no borra**: es una marca. Para sacar el fichero, la papelera.
- **Añadir.** Se eligen PNG en el visor y se suben a `creador/nuevos/` con un `POST /subir`
  que añade `tools/serve.py` (no escribe nunca en `sprites/` ni en `oficial/`). Después:
  `python3 tools/aniadir_sprites.py --mov stance`. Valida antes de aceptar: cabecera PNG de
  verdad, alto mínimo 200 px, y borde **rojo puro o transparente** (si el fondo es blanco, se
  rechaza, porque el pipeline no sabría separar la figura). Probado: acepta un sprite con
  fondo transparente, rechaza un PNG blanco y rechaza un icono de 40×40.

Lo que entra por el navegador entra **en bruto**: ni se reduce ni se recolorea. Para el tamaño
del modelo original, después `encajar.py`.

## Chun-Li

- Las **filas 1, 2 y 3 de la hoja original son el mismo stance**: van juntas en **una**
  animación, orden `1 → 2 → 1 → 3`, 10 + 6 + 10 + 7 = 33 figuras, se descarta **1** por ser
  el mismo píxel que la anterior en la costura 1→2 → **32 frames a 10 fps = 3,2 s**.
- El resto de filas (4–24) van **crudas**: todas las figuras, sin recortar ciclos.
- **22 animaciones** en total, no 24.
- **Altura**: se mide la tinta del stance y se escala a la de Voltia. La escala y el pivote
  los manda `sheet.json`, y `loadChar()` los sobrescribe al cargar: si se regenera la hoja,
  la ficha no se queda vieja.
- **Salto**: 176 px de mundo medidos con sonda; Voltia salta ~103. `jumpV -14.2`,
  `gravity 0.55`.
- **Filas de aire**: se ancla por centro de masa, no por los pies, o el salto tira.
- **Comandos**: fila 15 = ↓↘ + patada fuerte; patada aérea = fila 17; speed kick = fila 12
  con sus estelas dentro del frame; filas 22–23 = una sola animación de defensa + super.
- **Reloj**: 99 s (`ROUND_TIME`). **Cajas de golpe**: tecla **H** o botón en la pausa.

## Trampas que ya nos costaron una tarde

- **Caché**: un `?v=` escrito a mano en el HTML sirve JS viejo para siempre. El `rev` sale
  del **md5 de la hoja** y el servidor manda `no-store`.
- **Pivote y escala**: si están escritos a mano en la ficha, quedan viejos al regenerar la
  hoja. Los manda `sheet.json`.
- **`str.replace` de Python no falla** si el texto no coincide: no hace nada en silencio.
  Después de reescribir constantes, comprobar con `grep`.
- **Medir, no deducir**: la altura, el salto y el grosor del contorno se miden. Todas las
  veces que se dieron por supuestos, estaban mal.

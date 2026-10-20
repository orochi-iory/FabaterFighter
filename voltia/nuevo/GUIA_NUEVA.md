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

## Chun-Li: mapa real de filas (dado por el usuario)

La hoja tiene **24 filas**. El corte por huecos daba 23 porque **la banda 0 lleva
dos filas superpuestas** (bordes inferiores a y≈76 y a y≈145), además del retrato.
Se separan por la **línea de suelo** —el borde inferior de la figura—, nunca por el
borde superior: un salto cambia el alto del dibujo pero no la fila.

Error anterior, para no repetirlo: partir una fila de 12 frames en dos mitades
suponiendo que eran «caminar adelante» y «caminar atrás». Son **filas distintas**.
Y el «stance completo» metía la fila 4, que es caminar: el stance son solo las
filas 1, 2 y 3, unidas en una única animación.

### El stance: filas 1, 2 y 3 son un solo bucle

No son tres animaciones ni tres partes: es **un bucle** que la hoja reparte en
tres franjas. En el entregable **nunca** salen separadas: un directorio
(`rows/01_stance`), un GIF (`gif/01_stance.gif`) y una animación en el juego
(`stance`). El orden que se reproduce es **2 → 1 → 2 → 2 → 3 → 2** y vuelta a
empezar (escrito seguido: 2-1-2-2-3-2-2-1-2-2…). La fila 2 hace de respiración
entre la 1 y la 3 y va dos veces en la unión.

| tramo del bucle | figuras | x en la hoja | y en la hoja |
|---|---|---|---|
| fila 2 | 6 | 82–404 | 85–145 |
| fila 1 | 10 | 97–545 | 7–76 |
| fila 2 | 6 | 82–404 | 85–145 |
| fila 2 (otra vez) | 6 | 82–404 | 85–145 |
| fila 3 | 7 | 12–347 | 152–219 |
| fila 2 | 6 | 82–404 | 85–145 |
| **total** | **41 figuras** (23 distintas) | | |

De esas 41 figuras salen **39 frames a 10 fps** (3,9 s por vuelta). Se descartan
**dos**, y no por criterio propio: la figura 1 de la fila 2 es **idéntica píxel a
píxel** a la figura 10 de la fila 1 (mismo md5, `3ee56306`), y la primera figura
de la fila 2 tras la fila 3 también. Son las dos costuras. Si se dejan, el bucle
se para dos ticks en cada unión.

El resto de repeticiones **se quedan**, porque son del dibujo original y están
separadas en el bucle, no pegadas: `8d17596f` en 4 y 6 · `ba6e66c1` en 5 y 7 ·
`3ee56306` en 10, 13 y 23 · `9f4fa603` en 12, 14 y 16 · `130461bd` en 17 y 21.
En total 15 frames distintos de 23 figuras.

Los 12 fps de la primera versión se leían como «muy acelerado»: el bucle va a
**10 fps**, que es lo que se publica y lo que lleva la hoja de juego.

Los frames se publican en un lienzo único de **54×70 px**: pies en la misma
línea (no bota) y eje de la cabeza al centro (no se va de lado). Cada figura de
la hoja está en una x distinta, así que sin esto el GIF se mueve aunque el dibujo
esté bien.

El **speed kick** (fila 12) tiene 9 poses y estelas amarillas dibujadas aparte.
La estela tiene que ir **dentro del frame, a la derecha del sprite**, en el mismo
desfase que en la hoja; no es una capa de efectos suelta ni se descarta.

Cómo se separa cuerpo de estela, sin mirar el dibujo:

- Por columna se cuenta tinta total y tinta amarilla (`r>200, g>150, b<130`).
- Una columna es **estela** si el 60 % o más de su tinta es amarilla. El corte
  cuerpo/estela de un tramo es la primera de esas columnas (y solo si deja al
  menos 5 columnas de cuerpo).
- Un tramo con menos de **420 px de tinta** es una estela suelta: se pega a la
  pose de su **izquierda**, que es la que la genera.

Tramos de la fila 12 y a quién va cada estela:

| pose | cuerpo | estela | cómo |
|---|---|---|---|
| 1 | 20–51 | — | sin estela |
| 2 | 65–107 | 108–132 | pegada |
| 3 | 138–180 | 181–196 | pegada |
| 4 | 206–248 | 254–276 | suelta (185 px), se pega |
| 5 | 286–328 | 339–359 | suelta (199 px), se pega |
| 6 | 373–417 | 418–425 | pegada |
| 7 | 433–479 | 480–490 | pegada |
| 8 | 500–544 | 545–556 | pegada |
| 9 | 568–610 | 611–635 | pegada |

Montaje: el cuerpo se ancla como el stance (pies en la misma línea, eje de la
cabeza al centro) y la estela se pega con su desfase exacto respecto al cuerpo.
El lienzo se calcula con lo que sobresale: si una estela sube por encima de la
cabeza o baja por debajo de los pies, el lienzo crece. Resultado: 9 frames de
92×87 px, con la misma cantidad de amarillo que la hoja y sin recortes.

**Filas 22 y 23 son una sola animación** (defensa / onda de choque + arranque del
super): 8 + 6 = **14 frames, todos**, sin quitar repetidos. Van en el orden de la
hoja, con los pies en la misma línea y el eje de la cabeza al centro.

| Filas | Qué es |
|---|---|
| 1-3 | el bucle del stance, uno solo: 23 figuras → 22 frames |
| 4 / 5 | caminar adelante / atrás |
| 6 / 7 / 8 / 9 | patada fuerte, puño fuerte, puño débil, patada débil |
| 10 | especial ↓ ↓↘ → + patada |
| 11 | especial proyectil (proyectil sin dibujar → chispa de Voltia) |
| 12 | speed kick |
| 13 / 14 | salto en el sitio / salto adelante (invertido = atrás) |
| 15 | patada adelante-abajo + voltereta atrás |
| 16 / 17 | salto + puño / salto + patada (misma animación para débil y fuerte) |
| 18 | puño fuerte agachada (los frames de pie sirven de transición) |
| 19 / 20 / 21 | patada fuerte, patada débil y puño débil agachada |
| 22-23 | defensa / onda de choque + super, una sola animación (14 frames) |
| 24 | derribo y recuperación (frames según la altura) |

Regla que se queda: **cuando una hoja tiene dos animaciones en la misma franja,
el único corte fiable es el que da el que conoce el juego**, no el hueco de
píxeles.

### Los caminar de esta hoja traen ida y vuelta

Cada fila de caminar de Chun-Li lleva **el ciclo y su vuelta espejada**:
`A B C D E F G F E D C B` en 12 frames. Reproduciéndolos todos, los dos caminar
se ven iguales (un paseo de ida y vuelta) y parece que se está usando la misma
fila. Hay que **cortar en el primer frame repetido**: quedan 7 frames de ciclo
por caminar.

Para distinguir adelante de atrás, el criterio del usuario: **el torso**. Se mide
como el adelanto del centro de la mitad alta respecto al de la mitad baja.

| fila | torso | lectura |
|---|---|---|
| 4 | +3,8 px | inclinado adelante |
| 5 | 0,0 px | recto |

## Chun-Li jugable: altura y hoja de juego

**La altura se mide, no se supone.** Voltia mide **294 px de tinta** en su stance de
`voltia/sheet_uniform.png` y se dibuja con `scale 0.5` → **147 px de mundo**. Chun-Li
mide **60 px de tinta** de stance (mediana de sus 22 frames, **sin la sombra del
suelo**) → va horneada a **×2,45** → **147 px de mundo**. Los 200 px de otras veces
no salen de ninguna medición: no se usan.

| | Voltia | Chun-Li |
|---|---|---|
| tinta en la hoja | 294 px | 60 px |
| escala | ×0,5 (la aplica el motor) | ×2,45 (horneada en el PNG) |
| altura en el juego | 147 px | 147 px |
| px de canvas por px de hoja | 0,67 | 1,33 |

Consecuencia que hay que decir: a la misma altura, Chun-Li se ve **más gruesa**.
Voltia sale de una hoja de 294 px reducida a la mitad; Chun-Li de una de 60 px
subida 2,45 veces. Eso no lo arregla el montaje, lo arreglaría un dibujo de origen
más grande.

**Cómo se arma la hoja** (`tools/chunli_sheet_game.py` → `game/sheet.png` + `sheet.json`,
29 animaciones, celda 284×198, pivote (141, 196), scale 1):

1. La sombra negra del suelo que trae el dibujo **se quita**. Es una mancha de negro
   puro ancha y baja (≥10 px de ancho, ≤7 de alto, ancho ≥ 2,5× alto, relleno ≥ 50 %),
   separada del cuerpo. Si se queda, al saltar la sombra salta con ella y además el
   motor dibuja la suya.
2. **Anclaje por los pies, no por la caja del dibujo ni por la sombra**: la altura del
   salto y del derribo la mueve el motor con `p.y`, así que el sprite va con los pies
   en el pivote. Dejando cada frame a la altura que tiene en la hoja, el salto sale doble.
3. Eje horizontal: centro de la tinta de la cabeza (el 20 % de arriba), y el centro de
   la caja si la figura va tumbada. El amarillo de las estelas **no cuenta** para el eje.
4. Todo va en una celda común y se escala de una vez con NEAREST: así la escala queda
   horneada y el navegador no reescala al dibujar.

**Lo que la hoja no trae y se reutiliza, marcado en `preview/chars/chunli.js`:** no hay
animación de daño (`hit` y `crouch_hit` usan la guardia), ni de victoria propia
(`victory1` usa la aurora del super, `victory2` la patada) y el proyectil usa la chispa
de Voltia, que es lo que se acordó. Los frames activos y los alcances de las cajas
salen de medirlos (`tools/chunli_hitboxes.py`), no de copiarlos de Voltia.

**Motor:** el personaje se elige en el menú (P1 y P2) y el motor ya no tiene un rival
fijo. Se añadió `walk_back` como animación propia: si el personaje la tiene, andar hacia
atrás usa su fila (Chun-Li la tiene; Voltia no y sigue con `walk`).

## Chun-Li en el motor: tiempos, comando de la fila 15 y reloj

**Lo que estaba mal y por qué.** El salto + patada estaba apuntando a la fila 15
(voltereta). La fila 17 es la patada de salto y es la que va en los dos botones
del aire: `air: { lp: jump_punch, hp: jump_punch, lk: jump_kick, hk: jump_kick }`.
La fila 15 pasa a ser un comando de suelo.

**El ataque en el aire salía medio segundo tarde** por dos cosas sumadas:

1. El fps de la fila: `jump_punch` y `jump_kick` iban a 10 y 12 fps. Van a **16**.
2. El frameo de entrada de la hoja (agacharse, cargar). `startMove` acepta ahora
   `start: N`: salta los N primeros frames de la animación al arrancar el move.
   `jump_punch` → `start 2`, `jump_kick` → `start 3`, `kick_fwd_down` → `start 3`.

| move | antes | ahora |
|---|---|---|
| `jump_punch` (activo en el frame 5) | 5/10 fps = 0,50 s | (5−2)/16 = **0,19 s** |
| `jump_kick` (activo en el frame 6) | 6/12 fps = 0,50 s | (6−3)/16 = **0,19 s** |
| `kick_fwd_down` (activos 7-9) | 7/10 fps = 0,70 s | (7−3)/18 = **0,22 s** |

Medido en el arnés `node /tmp/smoke/run.js` con un sondeo aparte: el salto sale
en el **mismo frame** en que se pulsa arriba (`p.y` cambia y el estado pasa a
`jump`), y el frame activo del aire llega a los **10 frames** de 60 Hz (0,17 s)
tras pulsar el botón.

**El salto de las filas largas.** `tickAnim` sólo usaba 3 frames (0, 1, 2 y el
último) para el salto, que es como está dibujado Voltia (4 frames). Chun-Li trae
10 y 11, así que con esa regla el dibujo se quedaba congelado y el salto parecía
empezar tarde. Ahora, si la fila tiene más de 4 frames, el frame se reparte por
la velocidad vertical: `u = (vy − jumpV) / (−2·jumpV)`, `frame = round(u·(n−1))`.
Voltia (4 frames) sigue con la regla de siempre, sin tocarla.

**Comando de la fila 15:** adelante + abajo a la vez (↘) **y patada fuerte**.
En la ficha es `{ type: 'motion', move: 'kick_fwd_down', btn: 'kick', need: 'hk',
window: 0.4, seq: [3] }`. El campo `need` es nuevo en el motor: el comando no
sale con patada débil (verificado: abajo + LK saca `crouch_kick_weak`).
La animación se ancla con la **sombra** como línea de suelo, no con los pies:
la voltereta va en el aire y aplanarla al suelo la hundía.

**Reloj: 99 segundos** (`ROUND_TIME = 99` en `preview/fight.js` y el `99` del HUD
en `preview/fight.html`). Antes eran 60.

**Nombres del HUD:** `placeFighters()` escribe en `#n1` / `#n2` el `def.name` del
personaje elegido y los carteles de fin de ronda usan también ese nombre; antes
ponían VOLTIA aunque jugaras con Chun-Li.

## Saltos de Chun-Li: el arco ya estaba dibujado (y por eso saltaba bajo)

**El fallo.** En las cuatro filas de salto (13, 14, 16 y 17) el dibujo **ya trae
el arco**: el cuerpo sube hasta **85 px** sobre el suelo de su franja (medido en
`bandas.json`: fondo 0 → 47 → 72 → 80 → 84 → 85 → 79 → 60 → 37 → 0). Al anclar
cada frame por los pies, ese arco se aplastaba contra el suelo y el sprite pegaba
tirones: en una voltereta el «pie» de un frame es la cabeza del siguiente.

**El arreglo.** Esas filas se anclan por el **centro del cuerpo** (`ancla =
'centro'` en `tools/chunli_sheet_game.py`): el centro cae siempre a la altura que
tiene en el frame de despegue (26,5 px), así la voltereta gira sobre sí misma y
la altura la manda el motor con `p.y`, que es lo que mueve también la hurtbox.

**Altura.** Con el arco fuera del sprite, la altura es sólo física:

| | jumpV | gravity | subida (v²/2g) | aire |
|---|---|---|---|---|
| Voltia (sin tocar) | 9,3 | 0,42 | 103 px | 44 frames |
| Chun-Li antes | 9,4 | 0,42 | 105 px | 45 frames |
| Chun-Li ahora | 12,3 | 0,44 | **172 px** | 56 frames |

Medido en el arnés: altura máxima real **165,8 px** y **53 frames** en el aire
(el pico teórico no llega entero porque `pullDown` acota la caída).

**Dos cosas más que se veían mal en la imagen:**

1. **Trozos de la figura vecina.** El corte de esas filas va por columnas, así que
   un frame se traía una mano o una cabeza flotando al lado. Ahora se quitan los
   trozos sueltos que miden menos del 18 % del mayor (`quitar_fragmentos`), sólo
   en las filas de salto y en la voltereta: en el speed kick los trozos pequeños
   son las estelas y ahí no se toca.
2. **Sombra pegada al pie.** La sombra que toca el zapato se funde con el
   contorno negro del dibujo y no la detecta el filtro por forma. Se quita por
   **distancia**: el contorno siempre está a 1 px de un píxel con color, la
   sombra no. Se borra el negro que está a 2 px o más de cualquier color (en las
   205 figuras quedan 306 px negros sueltos, todos de 1-3 px y dentro del dibujo).

## Cajas de golpe (tecla H o botón «Cajas» en la pausa)

`showBoxes` existía en el motor pero no había forma de encenderlo. Ahora:

- botón **Cajas** en el cartel de pausa (se queda encendido y se recuerda en
  `localStorage`, clave `fabater_cajas`) y tecla **H** en cualquier momento;
- verde = hurtbox (lo que le pueden tocar), rojo = caja del golpe activo en ese
  frame, amarillo = proyectil en el aire, y una cruz blanca en el **pivote**
  (los pies), que es el punto que da la altura real;
- se dibuja en las mismas coordenadas que las colisiones (`hurtbox`, `attackBox`,
  `b.def.box`), no en una capa aparte: lo que se ve es lo que pega.

## La hoja servida de cache (por qué se rompió Chun-Li en Pelea)

**Síntoma:** en Pelea, un personaje sale a trozos: medio cuerpo, una pierna
suelta, pedazos de la celda de al lado. Sólo a algunos frames y sólo a veces.

**Causa:** la hoja se pedía con `sheet.png?v=6`, un número **fijo**. El
`sheet.json` sí se pedía sin cache. Al cambiar la celda de 284×216 a 294×223, el
navegador siguió sirviendo el PNG viejo y el motor cortó un PNG de 284×216 con
una rejilla de 294×223:

| | PNG viejo | rejilla nueva |
|---|---|---|
| celda | 284×216 | 294×223 |
| deriva por columna | +10 px | |
| deriva por fila | +7 px | |

En la fila 0 casi no se nota (10 px de deriva por frame); en la fila 24
(derribo) la deriva ya es de **168 px** y el sprite sale de otra fila entera.

**Arreglo, en dos capas:**

1. `tools/chunli_sheet_game.py` escribe en `sheet.json` un campo `rev` con el
   **md5 del PNG** (y `cols`/`rows`). El motor pide la imagen con
   `?v=<rev>`: si la hoja cambia, cambia la URL y no hay cache vieja posible.
2. Aunque un proxy cachee de más, `loadChar` comprueba la medida al cargar
   (`cell.w × cols`, `cell.h × rows`). Si no cuadra, avisa por consola y vuelve a
   pedir la hoja saltándose la cache (`&r=<ms>`).

**Regla para la próxima:** nunca poner una versión fija en la URL de una imagen
generada. O sale del propio fichero (rev/hash), o se comprueba la medida.

## Quitar el contorno negro de Voltia (prueba, sólo fila 0 del stance)

Voltia viene con un aro negro alrededor de la silueta. Medido en el frame 0 del
stance de `voltia/sheet_uniform.png` (celda 350×332):

| medida | valor |
|---|---|
| px casi negros (`max(r,g,b) ≤ 6`) | **9388 de 32644 opacos (29 %)** |
| grosor del aro | 1-2 px en la cara, **hasta 10-12 px en la cola** |
| px negros a más de 6 px del borde | **2124** → dentro del negro también hay líneas de dibujo |

Ese 2124 es lo que hunde los atajos. Probado y descartado:

1. **Rellenar todo el negro con el color de al lado, y volver a poner borde.**
   Se van las líneas internas (brazo sobre torso, rodilla) y queda pegatina.
2. **Relleno por difusión (BFS) desde el borde.** La onda corre *por dentro* del
   aro, que es un tubo: el primer color que entra lo inunda. En la prueba el cian
   del traje se comió la cola entera y salió un halo.
3. **Relleno en línea recta (8 direcciones) desde el aro.** El color es el
   correcto, pero salta de un trozo a otro: moteado.

Lo que funciona es separar el negro **por topología, no por grosor**:

- `externo` = negro **conectado con la transparencia** (el aro). Se borra.
- `interno` = negro **encerrado por color** (líneas de dibujo). Se queda intacto.

Después, 1 px de borde oscurecido al 55 % sobre la silueta que queda (si no, el
personaje flota) y se tiran las islas de menos de 12 px que deja el corte.

Resultado en la fila 0 (15 frames), medido:

| | original | sin el aro |
|---|---|---|
| px negros | 143 371 | **0** |
| px opacos | 486 676 | 328 615 (**−32,5 %**) |
| alto de tinta (mediana) | 294 px | **287 px** (−7) |
| ancho de tinta | 186-240 px | **158-228 px** (hasta −26) |

El precio, dicho claro: **el personaje adelgaza** exactamente lo que medía el
aro (7 px de alto, hasta 26 de ancho), y las piezas que sólo estaban separadas
por negro quedan con 1 px de aire (la zapatilla se separa un poco de la pierna).
No se inventa dibujo: lo que se ve es el sprite original sin el aro.

    PYTHONPATH=tools/pylibs python3 tools/voltia_outline.py --celdas 0   # fila 0
    PYTHONPATH=tools/pylibs python3 tools/voltia_outline.py              # hoja entera

Escribe `voltia/outline_fila0.png` (+ `.gif` y `outline_comparacion.png`). La
hoja original **no se toca**.

## Chun-Li: el salto que se aplastaba, la altura y el stance

**Síntoma:** los frames de salto "pegaban tirones" y el salto se veía corto.

**Causa, medida en la hoja de origen:** la fila 14 (salto adelante) **no está dibujada
con los pies en el suelo**. Cada figura sube dentro de la franja:

| frame | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| alto sobre el suelo de la franja | 1 | 1 | 47 | 72 | 80 | 84 | 85 | 79 | 60 | 37 | 1 |

Es decir, el artista ya dibujó el arco (hasta **85 px**, que a escala 2,53 son 215 px
de mundo). Al cortar cada figura a su caja y clavarle los pies en el pivote, esa
información se tira y la voltereta gira **alrededor del pie equivocado**: el cuerpo
salta de postura en postura.

**Arreglo:** en las filas de aire (`jump`, `fwdjump`, `jump_punch`, `jump_kick`) el
punto que se clava en el pivote es el **centro de masa de la tinta**, a la altura que
tiene en el primer frame (el de despegue, con los pies en el suelo). Así el giro es
sobre el cuerpo y la altura la pone el motor con `p.y`, como en Voltia. Efecto
secundario: la celda pasa de **294×223 a 294×231** (pivote igual, (146, 203)) porque
hace falta sitio por debajo.

Antes de eso se probaron dos cosas y se descartaron: anclar por el **centro de la
caja** (la caja cambia cuando las piernas salen y la cabeza entra: sigue bailando) y
dejar la altura de la hoja tal cual (el salto se duplica: sube el sprite y sube `p.y`).

**Altura del salto, medida con sonda en el motor** (no calculada): `jumpV -14.2`,
`gravity 0.55` → **176 px** de mundo, **51 frames** de aire. Voltia: `-9.3` / `0.42`
→ **103 px**. El salto de Chun-Li es **1,7 veces** el de Voltia.

## El stance: 2-1-2-2-3-2, en el visor y en la hoja de juego

Las tres franjas de stance (filas 1, 2 y 3) son **un solo bucle**, en el orden
`2 1 2 2 3 2` y vuelta a empezar: 6 + 10 + 6 + 6 + 7 + 6 = **41 figuras**. Se quitan
**2**, y solo porque están repetidas píxel a píxel justo en las costuras (mismo md5:
la primera de la fila 2 tras la fila 1, y la última de la fila 3 con la primera de la
fila 2) → **39 frames a 10 fps** (3,9 s por vuelta). Es **una** animación: una entrada
en la tabla, un GIF y una fila de la hoja de juego.

## Ver las cajas de golpe

Botón fijo **«Cajas (H)»** abajo a la izquierda (no hay que pausar) y tecla **H**.
Verde = caja de daño recibido, rojo = caja del golpe activo en ese frame, amarillo =
proyectil, cruz blanca = pivote (los pies). Se recuerda entre partidas.

## Por qué los cambios de Chun-Li "no llegaban"

**Síntoma:** se arregla algo en `preview/chars/chunli.js` o en `preview/fight.js` y en el
navegador sigue saliendo el comportamiento viejo (patada de salto equivocada, reloj de
60 s, stance rápido, sin selector de personajes).

**Causa:** los `<script>` llevaban una versión **fija** (`chars/chunli.js?v=3`,
`fight.js?v=14`). Si el fichero cambia pero la versión no, el navegador sigue usando la
copia que tiene en memoria: el `?v` es la clave de caché.

**Regla:** cada vez que se toca un `.js` de `preview/`, **se sube su `?v` en
`preview/fight.html`**. Ahora mismo: `voltiа.js?v=5`, `chunli.js?v=5`, `fight.js?v=15`
(y el servidor de pruebas manda `Cache-Control: no-store`). En la página de pelea hay una
línea `build 2026-10-20c` en el menú: si no la ves, estás viendo una versión vieja.

**Segunda trampa, del mismo tipo:** el **pivote y la escala** estaban escritos a mano en
`chars/chunli.js` (146, 203). Al regenerar la hoja, la celda pasó de 294×231 a 284×223 y
el pivote a (141, 196): la ficha se quedó vieja y el personaje salía desplazado. Ahora
`loadChar()` **sobrescribe `pivot` y `scale` con los de `sheet.json`** (y el pivote del
proyectil). La hoja es la única fuente de verdad.

## Chun-Li: patadas, stance y reloj (estado actual)

- **Patada en el aire = fila 17** para los dos botones (débil y fuerte). La fila 15 no es
  un salto: empieza y acaba de pie.
- **Fila 15 = ↓↘ + patada FUERTE** (mantener abajo+adelante y pulsar fuerte). Es un
  comando de suelo (`need: 'hk'`, `seq: [3]`), con `start: 3` para que el golpe no llegue
  tarde.
- **Patada adelante-abajo = fila 15**, con derribo.
- **Salto + puño**: `start: 2` y 16 fps → el frame activo entra a **0,19 s**.
- **Salto + patada**: `start: 3` y 16 fps → **0,19 s**.
- **Stance**: filas 1, 2 y 3 en **un solo bucle** `1 → 2 → 1 → 3` (la fila 1 va entre la 2
  y la 3 para que no se repita igual). 33 figuras, se descarta **1** repetida exacta en la
  costura 1→2 → **32 frames a 10 fps = 3,2 s** por vuelta.
- **Salto**: 176 px de mundo medidos con sonda (Voltia salta 103).
- **Reloj: 99 s** (`ROUND_TIME = 99`, y el marcador del HTML arranca en 99).
- **Cajas de golpe**: botón fijo **«Cajas (H)»** abajo a la izquierda, tecla **H**, y el
  botón «Cajas» de la pausa. Verde = caja de daño recibido, rojo = golpe activo, amarillo
  = proyectil. Se recuerda entre partidas.

## El stance, otra vez: una animación, no tres (2026-10-20)

Lo que se entrega: **una** entrada, **un** GIF y **una** animación en el juego. Los
números, medidos sobre `voltia/nuevo/chunli/rows/01_stance` y `raw/fila_0{1,2,3}.png`:

| franja de la hoja | y en la hoja | figuras | x |
|---|---|---|---|
| fila 1 | 0–74 | **10** | 97–545 |
| fila 2 | 85–145 | **6** | 85–330 |
| fila 3 | 154–216 | **7** | 85–330 |
| **total** | | **23** | |

- Corte **por la altura del suelo** de cada figura (`runs_columna` mide el borde inferior
  de la tinta en cada columna), no por los huecos de fondo.
- Orden del bucle: **1 → 2 → 1 → 3** y vuelta a la 1: **10 + 6 + 10 + 7 = 33 figuras**.
- De esas 33, **una** es el mismo píxel que la anterior: en la costura 1→2 la primera
  figura de la fila 2 es idéntica a la última de la fila 1 (`3ee56306`). Se descarta
  → **32 frames**.
- Las demás repeticiones **se quedan** (son del dibujo): `8d17` en 4 y 6, `ba6e` en 5 y 7,
  `3ee5` en 10, 13 y 23, `9f4f` en 12, 14 y 16, `1304` en 17 y 21. De las 23 figuras de la
  hoja solo hay **15 distintas**; por eso no se puede "quitar las repetidas" sin cargarse
  el ciclo.
- Lienzo único **54 × 70 px**: los pies en la misma línea y el eje de la cabeza al centro,
  para que el bucle no bote ni se vaya de lado.
- Reproducción: **10 fps → 3,2 s** por vuelta.

Imagen de control: `voltia/nuevo/chunli/stance_un_bucle.png` (los 32 frames, cada uno con
la franja de la que sale) y `raw/hoja_animaciones.png` (**22 filas = 22 animaciones**, el
stance es la primera y ocupa las tres franjas). Generador: `tools/chunli_hoja.py`.

## Aro negro de Voltia: separar aro de dibujo, no borrar (2026-10-20)

Medido en la celda 350×332 del stance (`tools/voltia_outline.py`, fila 0):

- píxeles casi negros (`max(r,g,b) ≤ 6`): **143 371** en los 15 frames → **3 308**.
- píxeles opacos: **486 676** antes y después (**idéntico**). Alto × ancho de tinta del
  frame 0: **302 × 188** antes y después. Alto mediano de los 15: **294** antes y después.
- El aro no tiene grosor fijo: **1–2 px** en la cara, **10–12 px** en la coleta.

El truco que funciona es **topológico**, no de color:

1. negro **conectado con la transparencia** = aro; negro **encerrado por color** = dibujo
   (2124 px por celda). Solo se toca el aro.
2. el aro toma el **color del trozo de dibujo más cercano** por distancia de chamfer
   (1 / 1,4). No se difunde: una difusión por vecinos inunda la coleta entera con un color.
3. el **borde de fuera (2 px)** se deja a **×0,32** de ese color: contorno fino del tono del
   dibujo, que es lo que hace falta para que la silueta se lea sobre el fondo.
4. los trazos de dentro **no se tocan**: siguen negros.

Descartado con números: **borrar todo el negro** deja la silueta en **328 615 px opacos
(−32,5 %)** y el alto mediano en **287 (−7 px)**, y despieza el dibujo (mano separada del
brazo, cinturón y bota partidos). **Pintar el aro de un color plano** deja un halo de 10 px.

## El modelo entero sin el aro negro (2026-10-20, definitivo)

Lo que se entrega es **la hoja completa**, no solo el stance: `voltia/sheet_sin_aro.png` +
`sheet_sin_aro.json`, generados con `tools/voltia_outline.py` (sin argumentos, 375 celdas,
~17 s). Medido:

| | original | sin el aro |
|---|---|---|
| píxeles casi negros (`max(r,g,b) ≤ 6`) | **958 595** | **24 602** (2,6 %) |
| píxeles opacos | **3 107 116** | **3 107 116** (idéntico) |
| canal alfa | — | **idéntico byte a byte** en las 375 celdas |
| alto × ancho de tinta (stance f0) | 302 × 188 | 302 × 188 |

- **Ninguna fila se despieza**: revisadas las 25 a ojo (`voltia/outline_hoja_completa.png`) y
  los frames con más tinta de las filas 1, 4, 7, 10, 13, 14, 17, 22 y 24.
- Los **24 602 px negros** que quedan son todos trazos de dentro. La fila 16 (el rayo) pasa de
  1 960 a 0 px negros y aun así conserva su filo oscuro: el borde exterior al 32 % basta.
- **El original no se toca**: `voltia/sheet_uniform.png` y `sheet.json` siguen como estaban.
- El visor (`preview/index.html`) carga **la versión limpia por defecto** leyendo
  `sheet_sin_aro.json`; con **`?aro=0`** (botón «Ver la hoja CON el aro negro») vuelve a la
  original sin tocar ficheros. El juego (`fight.js` → `chars/voltia.js`) **sigue usando la
  original** hasta que se pida el cambio.
- Comprobación de sincronía: `needW = 15 × 350 = 5250`, `needH = 25 × 332 = 8300`, y la hoja
  mide exactamente 5250 × 8300, así que el guardia del visor no salta.

## Vuelta al borde verde (2026-10-20, decisión del usuario)

«Cada cambio hecho ha ido ensuciando los sprites para mal.» Medido, tenía razón: el
contorno **solo engordó**.

| commit | qué hizo | opacos f0 | casi negros | borde |
|---|---|---|---|---|
| `fff5dc0` | *Voltia pierde el contorno* | 31 301 | 7 236 | 969 negro fino + 396 cian + 379 azul |
| `35b40ca` | *«El borde verde pasa a negro con silueta gruesa»* | 32 644 | 9 388 | 1 612 todo negro |
| `24ecf51` | contorno = trazo original | 32 644 | 9 388 | 1 612 todo negro |
| `3dba241` | quita el filete cian (**todo** el cian) | 32 644 | 9 388 | 1 612 todo negro |

**Lo que se sirve ahora**: `fff5dc0` + el filete cian quitado, con este criterio:

- cian `5,176,157` que **toca la transparencia** = borde → se queda: **29 176 px** en la hoja;
- cian **rodeado de dibujo** = filete → se pinta con el color del trazo más cercano
  (chamfer 1 / 1,4): **31 277 px** sustituidos, **0** quedan dentro de una celda;
- **alfa idéntico byte a byte** en las 375 celdas.

Efecto en la silueta: tinta del frame 0 **188 × 302 → 188 × 300** (−2 px de alto: el negro
grueso metía 1 px por arriba y por abajo). La altura del arte no cambia, así que la escala
del juego sigue igual.

**Aplicado a los tres sitios**: visor (`preview/index.html`), pelea (`⚔ Pelea`: lee
`voltia/sheet.json` → `sheet_uniform.png`, con `rev` = md5 de la hoja) y escenario
(`voltia/stage/fighter.png`, rehecho con la receta exacta del original: recorte
(78,19)–(272,325) del frame 0 reducido a la mitad → 97 × 153).

**Trampa propia, para no repetirla**: `op − crecer(op)` sale **vacío** por construcción; el
filo se saca **erosionando** (`op − MinFilter(op)`). Con la versión mala se comieron los
60 453 px de cian, borde incluido.

Versiones guardadas: `voltia/versions/sheet_negro_grueso.png` (+ `.json`),
`sheet_verde.png` (= `fff5dc0` puro, con filete), `stage_fighter_negro.png`,
`linea_evolucion.png` y `hoja_verde_completa.png`. En el visor: `?aro=0` negro grueso,
`?aro=1` el aro quitado.

## Contorno fuera: −2 px de hoja (2026-10-20, elegido por el usuario)

El usuario vio el borde verde y pidió «quitarle 3 o 4 px a todo el contorno». Medido antes de
tocarlo: **el contorno mide 1-2 px de hoja** (el dibujo va a 2 px de hoja por px de arte) y el
negro grueso 3-4. Por eso «3-4 px» era comerse el contorno y parte del dibujo.

Barrido sobre el frame 0 (celda 350×332, 31 301 px opacos, alto 300):

| px de hoja | = px de arte | opacos | alto | qué pasa |
|---|---|---|---|---|
| 1 | 0,5 | 29 347 (−6,2 %) | 298 | contorno a medias |
| **2** | **1** | **27 567 (−11,9 %)** | **296** | **contorno fuera; el azul del traje hace de borde** |
| 4 | 2 | 24 151 (−22,8 %) | 292 | agujero en la axila |
| 6 | 3 | 20 857 (−33,4 %) | 288 | hueco entre brazo y costado |
| 8 | 4 | 17 649 (−43,6 %) | 284 | el brazo se despega |

**Elegido 2 px de hoja.** Se erosiona **solo el alfa** (MinFilter 3 × 2): no se recolorea nada y
el dibujo de dentro no se mueve. Por filas, la silueta baja entre **−11,1 % y −15,8 %**.

- **Sin despieces:** 1 pieza por celda en 22 de las 25 filas; la fila 3 da 4 (el rayo y su sombra,
  que ya venían sueltos) y la 17 da 2. Los **36 puntitos** sueltos del original desaparecen.
- Los huecos «de dentro» que cuenta el medidor son las ventanas de la coleta (1058 px ya en el
  original, 1480 px ahora): se agrandan porque el dibujo está a 2 px por px de arte, no son roturas.
- Alto **300 → 296** px de hoja. No rompe nada: escala y pivote los manda `sheet.json`.
- Aplicado a **visor, pelea y escenario**. Herramienta: `tools/voltia_contorno.py --px 2`
  (`--solo-ver` para comparar sin escribir). Respaldo del estado anterior:
  `voltia/versions/sheet_borde_verde.png`.

## Píxel saneado a resolución de arte (2026-10-20)

El usuario pidió «limpiar todos los sprites y quitar los artefactos, sobre todo en la cara,
con colores mezclados». Medido antes de tocar nada:

- la hoja **ya tenía solo 18 colores**: la paleta estaba bien;
- **7** píxeles aislados de verdad (ningún vecino de su color) → ahí no estaba el problema;
- **el 52,85 % de los bloques 2×2 no eran uniformes**. La hoja va a **2 px de hoja por px de
  arte**, así que medio píxel de color distinto es exactamente «mezclado y poco definido»;
- a 1×, el **5,21 % (33 714 px)** no tenía ni un vecino de su color: ruido de generación.

**Lo que se hace** (`tools/voltia_limpieza.py`), sin IA y sin redibujar:

1. bajar a 1× tomando por cada bloque 2×2 el color **mayoritario**;
2. **proteger los tonos oscuros** (`1,1,2`, `37,5,42`, `18,19,63`, `47,10,84`): si un bloque
   lleva uno aunque sea minoría, gana el. Sin esto la cara pierde el ojo y la boca (probado:
   con mayoría simple la cara se emborrona);
3. filtro de ruido a 1×: el píxel sin vecino de su color pasa al mayoritario de al lado;
4. volver a 2× con NEAREST.

Resultado en la hoja entera:

| | antes | después |
|---|---|---|
| bloques 2×2 no uniformes | 52,85 % | **0,00 %** |
| ruido a 1× | 33 714 px (5,21 %) | **0** |
| colores opacos | 18 | **18** (no se toca la paleta) |
| píxeles opacos a 1× | 646 711 | 667 656 (**+3,2 %**) |

El **+3,2 % de silueta** es el umbral de alfa (2 de 4): el bloque sigue opaco si la mitad de sus
píxeles lo estaban, así que se rellenan las esquinas. Es lo que deja el contorno macizo. Con
`--alfa 3` la silueta adelgaza en vez de engordar; no se ha probado en producción.

Respaldo del estado anterior: `voltia/versions/sheet_contorno2.png` (borde verde + contorno
fuera, sin sanear). Control: `hoja_saneada.png`, `limpieza_cara.png`, `limpieza_cuerpo.png`,
`limpieza_antes_despues.png`.

## La causa de los artefactos: LANCZOS con factor no entero (2026-10-20)

El usuario, mirando la cara al 800 %: «los bordes no son lisos, hay cuadrados sueltos, el azul se
diluye con el rosa en morado… juraría que en algún momento estuvo todo bien». **Tenía razón.**

Medido sobre todas las versiones históricas de la hoja (5250×8300, rejilla 2×):

| versión | bloques 2×2 no uniformes |
|---|---|
| `4e0f930` | 54,38 % |
| `fff5dc0` (borde verde) | 53,56 % |
| `35b40ca` | 48,30 % |
| `24ecf51` / `3dba241` | 54,55 % / 53,93 % |

**Ninguna** hoja entregada estuvo limpia. No fue un cambio nuestro reciente: venía del montaje.

**El origen**: `voltia/frames/voltia_<anim>_<i>.png` tiene **rejilla de píxel exacta de 4×**
(0,00 % de bloques 4×4 sucios, comprobado en los 105 frames). `voltia/normalize.py → art_image()`
los reescalaba con **`Image.LANCZOS` y un factor no entero** (`scale` que iguala la altura de la
cabeza). LANCZOS sobre pixel art **inventa medios píxeles**: de ahí el morado (azul + rosa
mezclados), los cuadrados sueltos y los bordes poco lisos.

**El arreglo** (`tools/voltia_rebuild.py`): reconstruir la hoja desde los nativos bajando
**÷2 exacto con NEAREST** (4× → 2×), alineando cada pegado a coordenada **par** (si se pega en
impar, el bloque 2×2 cae a caballo y vuelve el ruido: pasó, y dio 23,19 % hasta corregirlo).
Después, los dos arreglos que ya teníamos, porque **los nativos traen el filete cian sin quitar**:
quitar el cian de dentro y comer 2 px de hoja de contorno.

| | hoja vieja (LANCZOS) | reconstruida |
|---|---|---|
| bloques 2×2 no uniformes | 52,85 % | **0,50 %** |
| colores opacos | 17 | **17** |
| tinta del stance (frame 0) | 180 × 298 | **184 × 298** |

El 0,50 % que queda es de la erosión del contorno en los bordes de celda, no del montaje.

**Regla para no repetirlo:** si un sprite nace en rejilla N×, para pasarlo a otra rejilla se baja
con **NEAREST a un divisor entero**. Nunca LANCZOS, nunca un factor fraccionario. Y el pegado en la
hoja va **alineado al bloque**.

## Reconstrucción desde cero: limpiar el grano en la resolución real (2026-10-20)

Después de reconstruir desde los nativos, el usuario seguía viéndolo sucio. Se buscó algo mejor
que rescatar y **no hay nada**:

| fuente | tamaño | grano (color sin vecino de su color) |
|---|---|---|
| `voltia/frames/*.png` (nativo) | 4× | **0,00 %** |
| el mismo, a 1× de arte | 97 × 153 | **7,13 %** |
| `assets/voltia_spritesheet.png` | 64 × 64 | 0,54 % — **otro diseño, 48 colores: no sirve** |
| `voltia/cells/*.png` | 154 × 153 | 62,79 % |
| `voltia/newref/src/master_*.png` | 1024² | 38-45 % |

Conclusión: **el grano no lo metió el reescalado, está dentro del dibujo**, un nivel por debajo
de la rejilla 4×. Por eso ninguna reconstrucción «tal cual» lo puede quitar.

**`tools/voltia_reconstruir.py`** (por frame, cero LANCZOS):

1. **÷4 NEAREST** a 1× de arte (el píxel real del dibujo);
2. **limpieza por masa local**: si el color de un píxel aparece **3 veces o menos** en su entorno
   5×5, pasa al color mayoritario de sus 8 vecinos. Se **protegen** el negro de línea `(1,1,2)` y
   el cian del borde `(5,176,157)`, que son trazos finos de verdad (sin protegerlos se borraba el
   borde verde, que es justo lo que el usuario quería conservar);
3. **−1 px de arte de contorno** (`--comer 1`): además de ajustar el grosor, quita la dentadura
   que deja la protección del cian (puntos y huecos en el filo);
4. **×2 NEAREST** a la hoja (bloques 2×2 uniformes por construcción) y pegado **alineado a par**.

| | antes (LANCZOS) | reconstruida |
|---|---|---|
| grano del stance a 1× | 5,51 % | **1,47 %** |
| bloques 2×2 no uniformes | 52,85 % | **0,00 %** |
| colores opacos | 18 | **18** |

Respaldo del paso anterior: `voltia/versions/sheet_nativa_sin_limpiar.png`.
Controles: `rebuild_cara.png` (8×), `rebuild_cuerpo.png`, `hoja_reconstruida.png`.

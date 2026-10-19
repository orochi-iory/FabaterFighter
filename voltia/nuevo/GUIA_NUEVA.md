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

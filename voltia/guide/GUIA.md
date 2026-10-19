# Guía de estilo — modelo nuevo

Página `preview/guia.html`. Solo información para generar, y el prompt.
No reproduce frames. El sprite se mira en `preview/nueva.html`.

El personaje de la pelea tiene su propia guía, `preview/guia-vieja.html`,
por si este estilismo no sobrevive al recorte.

La pelea no usa estos sprites.

## Dónde está

Un solo sprite de referencia, todavía sin aprobar: `voltia/newref/ref_stand.png`,
**1024 × 1024**, que es exactamente el tamaño al que lo generó el modelo.
No está recortado, no está escalado y no está cuantizado. Solo se le ha quitado
el verde del fondo.

No hay idle. El idle de veinte frames anterior está borrado, con su recorte.

## La escala

Esta es la regla que costó el modelo anterior. **El archivo no se reduce. Nunca.**

- Se guarda a la resolución con la que sale el modelo: 1024 × 1024.
- La resolución nativa del dibujo es **su rejilla de bloques**: 8 píxeles por
  bloque. El dibujo mide 1014 píxeles de alto, o sea **126,8 bloques ≈ 127
  píxeles de sprite**. Eso ya es escala de juego (la pelea usa 120, el escenario
  153).
- El zoom es cosa de la vista. El PNG no se toca.
- Si el motor necesita 127 de alto, **dibuja** el archivo a un píxel por bloque
  con el suavizado apagado. Eso no cambia el archivo ni inventa colores.

**El error que se repitió:** leer 1022 como si fueran 1022 píxeles de sprite y
bajarlos a 120. Eso es un remuestreo por 0,117: cada píxel del dibujo cae en una
fracción de píxel, y el detalle se muere. Después se llegó a bajar por bloques a
95 × 126: menos malo, pero seguía siendo reducir el archivo. Prohibido.

## REGLA DE ORO

> **170 cm de personaje, con la coleta incluida, son 200 píxeles de imagen.**
> Se dibuja en **bloques de 5**: 200 píxeles × 5 = 1000 píxeles de lienzo.
> 1,176 cm por píxel. 160 cm = 188 px; 150 cm = 128 px; 190 cm = 224 px.
> El alto se mide de la suela más baja a la punta del pelo.
> El sprite de juego mide 200 px y se dibuja **1:1**; el maestro a 1024 se
> conserva, no se entrega.

Con bloques de 5 el recorte sale perfecto: 200 nativos y el escenario lo pinta
sin deformar. Con bloques de 8, 200 px obligaban a un ×1,57 y no cuadraba.

## Zoom del escenario

La escala se redondea a un **número entero** (1:1, 2:1, 3:1…). Si el mundo no
cabe un número exacto de veces en el lienzo, cada píxel del escenario cae en una
fracción y se deforma. El letrero del escenario dice la escala que está usando.

**Regla de escala del proyecto: 170 cm, con la coleta, son 200 píxeles.**
Un píxel son 1,176 cm. Un personaje de 160 cm son 188 px; uno de 190, 224 px. El
alto se cuenta siempre con el pelo o el accesorio incluido, y el sprite se dibuja
1:1 en el escenario.

El sprite de juego es `voltia/newref/ref_stand_200.png`, **150 × 200**. Sale del
maestro de 1024 fijado a 200 de alto por muestreo al centro; el maestro se
conserva en `voltia/newref/ref_stand.png`, sin tocar.

**Altura de ring: 200 px.** Elegida por el usuario después de probar 254 y 300.
Ocupa el 33% de la placa de 604 y deja 226 px sobre la cabeza. 127 ocupaba el
21% y se veía pequeño.

**Suelo: 426, no 408.** El 408 era el borde trasero del ring y la figura parecía
quedar detrás del rombo. El rombo pintado va de 405 a 445; su centro es 426, y
ahí pisan los pies. Se cambia por página con `window.STAGE_FLOOR_Y`, así el
visor viejo se queda como estaba.

**El techo del generador es ~127 nativos.** Siete tiradas lo confirman: 300 con
bloques de 3, lienzo pequeño de 320, 960 explícito, 200 con bloques de 5, «zoom
×5 de un sprite de 200», figura pequeña a 1 píxel por píxel, y la referencia ya
dibujada con bloques de 5. Todas devuelven 1024 × 1024, bloques de 8, figura de
1014. No se puede sacar 200 ni 300 nativos de este modelo.

Así que la altura del ring se consigue con un **múltiplo entero** de los 127
nativos: **254 (×2)** o 381 (×3). A 300 son ×2,37 y los bloques salen de 2 y de 3
píxeles mezclados. En el escenario están los cinco modos para comparar: 127, 153,
254, 300 y 381.

**Comprobación antes de aprobar un sprite:** el archivo del visor y el generado
tienen que tener el mismo tamaño en píxeles, y el bloque tiene que medir lo
mismo. Si no coinciden, se empieza otra vez.

En el visor, `preview/nueva.html`, hay tres modos de escenario para verlo: nativo
1:1 (se sale de la placa, porque mide 1024), un bloque = un píxel de juego, y alto
153 como la figura vieja. Ahí se ve que el bueno es el segundo.

## Las dos referencias

Siempre van las dos, y cada una para lo suyo:

| Imagen | Para qué | Qué no se copia |
|---|---|---|
| Hoja de Chun-Li de SF2 (`voltia/ref/chunli_sf2_sheet.png`) | Dibujo: píxel gordo, contorno grueso, tonos planos, 16 colores | Su ropa, sus muslos desnudos, su anatomía |
| `voltia/ref_stance.png` | Diseño: máscara, visor, boca, coleta, traje teal, rayo, cinturón, botas | Su factura: está a 324 × 560 y no es SF2 |

`assets/voltia_concept.png` no se usa para generar.

La hoja de Chun-Li no se versiona: es local, para mirarla al generar.

## Consistencia

Siempre que haya un sprite bueno, ese es la referencia. En cuanto exista uno
aprobado, cada prompt lo nombra como imagen 1 y pide no cambiar ni los píxeles
ni los colores, solo la pose. Mientras empecemos de cero no hay referencia
buena, y se dice así.

Si el resultado no se parece a esta guía, se para la generación y se vuelve al
punto de partida con aprobación. No se sigue tirando imágenes a ver si una sale.

## Orden de trabajo

1. Un sprite de referencia, de pie. Se aprueba o se tira.
2. Solo con el sprite aprobado se generan las demás poses, una a una.
3. El idle de veinte: saltito doble y, después, atusarse las piernas.
4. Nada de esto entra en la pelea hasta que el ciclo entero se acepte.

## Prompt

Está en `voltia/guide/style.json`, campo `prompt`, y es el que funcionó en la
cuarta tirada: hoja como estilo, diseño aparte, un solo sprite, margen de
fondo en píxeles, guardia SF2.

Tres cosas que el prompt arregla y que hay que mantener:

- **Sin muslos desnudos.** El traje teal cubre hasta la bota. Los muslos
  desnudos son el diseño de Chun-Li y fue el fallo de la tercera tirada.
- **Margen de fondo**, mínimo 80 px de verde en los cuatro lados. El modelo no
  obedece «hazte más pequeño»; la reducción se hace en código.
- **Puños con nudillos** y línea del pulgar. Si no, son manchas.

## Técnica de la hoja (la que funciona)

El recorte se ensucia cuando la hoja sale con el dibujo pequeño. La stance se
generó con la figura **grande** y aguantó; las dos tiradas de 20 poses en 5 × 4
salieron con la figura a la mitad de tamaño y el contorno de un píxel de
pantalla, y al bajarlas a 200 px el NEAREST se comía justo ese contorno.

La hoja que aguanta, y que hay que pedir siempre:

- **4 columnas × 2 filas** (8 poses), lienzo **1024 × 1024**.
- **Bloques de 6 px de pantalla** por píxel de sprite, y figura de **110 px de
  sprite = 660 px de pantalla** de la suela a la punta del pelo.
- Imagen 1 = **la hoja ya aprobada**; imagen 2 = **el mismo sprite ampliado ×4**
  (`voltia/guide/ref/stance_x4.png`) para que copie la factura del contorno.
- Los 8 poses van nombradas una a una en el prompt (contacto, abajo, paso,
  arriba, y lo mismo con la otra pierna). Así no se inventa el ciclo.

Antes de recortar, se mide: **el borde de la silueta tiene que dar 78–83 % de
píxeles de contorno**, como la stance (80 %). Si da menos del 70 %, esa hoja no
sirve y se tira: es exactamente el defecto que se ve como «recorte sucio».

El corte, siempre con el mismo comando y el mismo lienzo:

```
PYTHONPATH=tools/pylibs python3 tools/build_sheet.py <hoja> <salida> 200 240 238 3 2 30
PYTHONPATH=tools/pylibs python3 tools/centre_by_head.py <salida> --target 128
```

El último número (**30**) es el **alto de la máscara en píxeles del frame final**,
o sea la talla de la cabeza. Es la escala que comparten todas las hojas: el alto
total de la figura cambia con la pose (piernas abiertas, rodilla arriba) y la
cabeza no. La stance aprobada tiene la máscara a 30 px; cualquier hoja nueva se
corta con esa misma medida y así no hay deriva de tamaño entre animaciones.

El corte, además, hace dos cosas que costaron su intento:

- **Tira el antialias del borde** (`strip_fringe`): esos píxeles son mezcla de
  tinta con el verde, no son de la paleta, y al llevarlos al color más cercano
  caían en el teal del traje. Ese era el «ruido verde» pegado a la coleta.
- **Cierra el contorno** (`close_outline`, opcional con `--close`): todo píxel opaco que toca el fondo
  pasa a contorno. Regla de siempre, ahora en el script y no a mano.

## Una pose por imagen (lo que funciona para las animaciones)

La rejilla de 5 × 4 se usó para la stance y salió bien, pero **para el walk el
generador no sabe ordenar las poses**: en siete formas de hoja distintas
(3 × 2, 4 × 2, 4 celdas, 5 poses, dos poses sueltas, 3 × 2 espejada y 2 × 2)
repite siempre la misma pierna delante. Así que las animaciones que necesitan
poses distintas se hacen **una pose por imagen**, grande, y se recortan con
`tools/build_pose.py`.

```
PYTHONPATH=tools/pylibs python3 tools/build_pose.py <pose.png> <salida.png> \
    [--head 30] [--axis 128] [--ground 238] [--canvas 200 240] [--pick L|R]
```

Hace lo mismo que la hoja, pero para una figura sola:

- verde → transparente y se queda la **masa conectada mayor**;
- **una sola escala**: la máscara a `--head`, la talla de la stance,
  independiente de lo grande que salga el dibujo;
- suelo en `--ground` y **eje de la cabeza en `--axis`** (x=128);
- `strip_fringe()` retira el antialias del borde;
- **`seal_teal_edge()`**: los píxeles de traje que ya tocan el aire pasan a
  contorno. No engorda nada, cierra la silueta y deja el borde en 71-82 % de
  contorno, como la stance.

`--pick L|R` separa dos figuras que compartan imagen, por si el modelo dibuja
dos poses en una.

### La paleta se mide, no se mira

Medido: una pose generada de cero llega con **~105 000 colores** distintos;
la stance aprobada tiene **15**. El generador sombrea con ruido, y al forzar la
paleta ese ruido se reparte de otra manera: la proporción de tonos cambia y se
nota a simple vista («algo ha pasado con la paleta»). Por eso se comprueba
**antes** de dar nada por bueno:

```
PYTHONPATH=tools/pylibs python3 tools/palette_report.py voltia/nueva/walk
```

Tiene que dar **15 colores, 0 % fuera de paleta** y ningún tono alejado más de
~1,5 puntos de la stance. La huella buena del walk nuevo: contorno 9,9 % (stance
9,0), traje sombra 13,0 (11,4), traje 8,2 (9,6), pelo 11,6 (13,3).

`close_outline()` **no** es el corte estándar: engorda la figura y sube el
contorno del 8,9 % al 14,5 %. Queda detrás de `--close` en `build_sheet.py` y
solo se usa si el corte limpio es imposible.

### Escala exacta: la máscara siempre a 30

`build_pose.py` reescala hasta que la máscara mide **exactamente** 30 px. Antes
se calculaba el factor una sola vez y el redondeo del remuestreo dejaba la
cabeza en 28 o 29: el personaje cambiaba de tamaño sin tocar nada más. Ahora el
corte itera (`mascara 174 px -> 30 px (real 30)`).

### Reparto de trabajo que ha funcionado

1. Un sprite aprobado (hoy `nueva/stance/00.png`) es la imagen 1 de todo.
2. Para cada pose nueva se pide **una sola figura**, nombrando el sprite aprobado
   como referencia y enumerando lo que NO se toca (máscara, visor, boca, coleta,
   traje, cinturón, rayo, guantes, botas, 16 colores, grosor de línea).
3. Se describe **solo** lo que cambia (las piernas) y se dice dónde queda todo lo
   demás («misma altura de cabeza, misma línea de suelo, brazos colgando»).
4. Nunca se pide «la otra mitad», ni espejar, ni cambiar tonos: eso ya se probó
   y sale una figura distinta que además invierte la paleta.

## Cómo camina un personaje (referencia fija)

La referencia de animación está en el repo y no se toca:

- `ref/chunli_sf2_sheet.png` — hoja de Chun-Li de SF2 (dibujo y animación).
- `ref/blue_mary_sheet.png` — hoja de Blue Mary de KOF (misma lectura, otro juego).
- `ref/cammy_sf2_sheet.png` — hoja de Cammy de SF2. Su fila Walking es la que
  mejor resuelve el paso: **corto, cruzado y con las piernas juntas**.
- `ref/walk_ref.png` — las filas Walking de Cammy y de Chun-Li recortadas, al
  lado de la stance aprobada de Voltia. Esta es la que se mira antes de generar
  un walk.

Lo que dicen esas tres filas, y lo que hay que copiar (sin plagiar el dibujo):

1. **Se anda en guardia.** Los puños siguen arriba, a la altura de la barbilla,
   los codos recogidos. Nunca los brazos colgando: eso convierte el walk en un
   paseo de pasarela, que es justo el desastre de la primera prueba.
2. **Pasos cortos y cruzados.** Las piernas se quedan juntas y un pie pasa por
   delante del otro; el talón de atrás se levanta y el de delante apoya plano.
   Con la zancada abierta la silueta se ensancha y el paso se ve tosco; con el
   paso cruzado el ciclo aguanta con cuatro poses.
3. **Ningún pie se levanta más que su propia bota.** Nada de rodilla al pecho.
4. **La cabeza no sube ni baja.** El torso va erguido y la línea del pelo se
   mantiene: si la cabeza baila, parece que salta, no que anda.
5. **Vista de lado, piernas cruzadas.** La pierna cercana tapa a la lejana y del
   pie de atrás solo asoma la bota. Es la vista lateral la que disimula el
   cambio de pierna y la que aguanta un ciclo corto.
6. **Cuatro poses por ciclo** (las cuatro de la fila de SF2): contacto, paso,
   contacto contrario, paso. La coleta va un pelo por detrás del cuerpo.
7. **Nada de frames achatados ni ensanchados.** Todos los frames tienen que
   conservar el mismo ancho de cuerpo y la misma silueta de coleta; si al cruzar
   las piernas uno se estrecha, se tira.

Con esto, la alternancia ya no se pide como un truco de tonos: se pide como una
pose más, con la pierna contraria delante y el mismo puño arriba.

## REGLA DE ORO: la coleta se mueve

La coleta es el 35 % de la tinta del personaje. Si se queda tiesa, la animación
se lee como un recorte que se desplaza. Vale para todo lo que se anime:

| Movimiento | Qué hace la coleta |
| --- | --- |
| Andar hacia adelante | Se separa de la espalda y se abre hacia atrás, la punta retrasada. |
| Andar hacia atrás | Se pega al cuerpo y se comprime contra la espalda. |
| Salto ascendente | Sube retrasada, arrastrada por debajo del cuerpo. |
| Caída | Flota por encima y por detrás, más suelta. |
| Aterrizaje | Cae después que el cuerpo, con un frame de retraso. |
| Paso lateral | Bascula al lado contrario al que se desplaza el cuerpo. |

Reglas de ejecución:

1. La coleta va **uno o dos frames por detrás** del cuerpo: cuando el cuerpo ya
   está en el contacto, la coleta sigue en el frame anterior.
2. **Nunca la misma silueta** de coleta en todos los frames de una animación.
   Si el set sale con la coleta idéntica, está mal aunque el cuerpo esté bien.
3. El dibujo se mantiene: arco grande, cuatro o cinco líneas de mechón con el
   tono de sombra y punta definida. Si sale una mancha lisa, se repite la pose.

## La plantilla de prompt (rocosa)

Todas las poses se piden con la misma plantilla; solo cambia `{POSE}`. Está
guardada tal cual en `style.json` → `promptTemplate`.

```
Copy this sprite EXACTLY. Same character, same colours, same 16 flat inks, same
thick dark outline, same torso, head, arms, guard, mask, visor, mouth, belt,
bolt, gloves and ponytail.

SIZE IS LOCKED. The new drawing must be the same size as the reference and stand
in the same place: the top of the ponytail at the same height, the chin at the
same height, the belt at the same height, the soles on the same ground line, the
left edge of the ponytail at the same distance from the left, and the SAME width
across the shoulders and the chest. Keep the ponytail FULL LENGTH and FULL
THICKNESS: its tip level with the middle of the thigh. Do not slim the body, do
not narrow the hips, do not shorten the ponytail, do not make the figure smaller
or taller. Everything except {WHAT MOVES} stays pixel for pixel as it is.

CHANGE ONLY {WHAT MOVES}: {POSE}.

One single sprite, side view facing right, alone on flat bright green with
plenty of green all around, no second figure, no floor, no shadow, no text, no
border, no dithering, no gradients, no anti-aliasing.
```

Los cinco anclajes (arriba de la coleta, barbilla, cinturón, suelas, borde
izquierdo de la coleta) son lo que impide que el personaje cambie de tamaño
aunque la cabeza mida igual. La frase de la coleta va aparte porque es lo
primero que el modelo acorta cuando se despista.

**Una pose por imagen.** `{POSE}` describe solo las piernas y, si toca, los
brazos; el resto lo arrastra la referencia.

## Comprobar el tamaño antes de mirarlo

```
PYTHONPATH=tools/pylibs python3 tools/consistency.py voltia/nueva/walk
```

Compara cada frame con `stance/00.png`: máscara, alto total, coleta, tinta y
ancho del torso a ±5 %; el ancho de las piernas (2/3) solo se informa, porque en
un paso cambia de verdad. Si algún frame se sale, se regenera ESA pose, no se
reescala: reescalar por frame es justo lo que descuadraba el idle.

Fallo real que cazó esto: el walk anterior tenía la cabeza a 29 px (bien) pero el
torso un 11 % más estrecho y un 12 % menos de tinta que la stance. El personaje
parecía más pequeño sin cambiar la cabeza.

## Recorte y reducción

El verde se mide en el borde de la imagen. Esta tirada dio `(28, 221, 8)`.
Un píxel es fondo solo si está más cerca de ese verde que de la paleta, con
umbral 60 sobre la imagen grande. Nada de rosa: era el color de la máscara.

Después se recorta a la caja del dibujo y se reduce a 120 de alto con NEAREST.
Nunca LANCZOS: emborrona y saca tres mil tonos.

Los píxeles de borde que salen verdosos se tapan con el contorno. Cero halo.

No se cuantiza a ciegas. Probado: 20 colores matan el magenta de la máscara y
el oro del cinturón. El sprite de referencia se guarda sin cuantizar; la
reducción de paleta, cuando toque, se revisa color a color.

## Lo que ya se sabe

- El modelo no hace zoom hacia atrás si se le pide con palabras, y no clava una
  rejilla de 8 al píxel aunque se la pida. Sirve igual: el bloque mide ~8 y esa
  es su resolución nativa. Lo que no se hace es reducir el archivo.
- El recorte por mayoría de ocho comía píxeles de dentro. Más nunca.
- Reutilizar es el frame entero en otro momento, no recortar un brazo.
- La máscara lleva boca: abertura oscura y labio de piel, bajo el visor.
  Sin boca el frame no entra.
- Bajar la figura con NEAREST es lo que rompe el contorno cuando el factor es
  pequeño (0,70). Con la hoja 4 × 2 el factor es 0,30 y el contorno viene ya
  grueso, así que el NEAREST no tiene que «adivinar» nada.

## Historial

- 2026-10-19. Walk de 6 poses con la hoja 3 × 2: escala por la máscara (30 px),
  segunda mitad por cambio de tonos, corte con `strip_fringe` y
  `close_outline`. Se tiran el walk de 20, el de 8 y las pruebas de pose única.
- 2026-10-19. Se apunta la técnica de la hoja 4 × 2: 1024 × 1024, bloques de 6,
  figura de 660 px de pantalla, imagen 1 la hoja aprobada e imagen 2 el sprite
  ampliado ×4. Medida de control: 78–83 % de contorno en el borde. El walk de
  20 poses se tira y se rehace con 8 poses reales (contacto, abajo, paso, arriba
  por cada pierna).
- 2026-10-19. Se deja de reducir. El sprite de referencia es el PNG de 1024 × 1024
  tal cual, solo con el verde quitado. La resolución nativa se mide por bloques:
  ~127 de alto, ya en escala de juego.
- 2026-10-19. Quinta tirada. Rejilla exigida en el prompt, tirada a 1024 con
  bloques de 8. El modelo no la clava, pero los bloques son de 8: se corta ÷8
  entero a 95 × 126, sin escalar. La escala pasa a ser regla de primera.
- 2026-10-19. Cuarta tirada. El pixelado es el de la hoja, el traje es teal
  entero y hay margen. Se corta y se reduce en código a 67 × 120. Queda como
  sprite de referencia, sin aprobar.
- 2026-10-19. Se borra el idle de veinte y su recorte. Se borra el script que
  comía píxeles. Se empieza por un solo sprite.
- 2026-10-19. La hoja de Chun-Li entra como referencia de dibujo, separada de
  la referencia de diseño.

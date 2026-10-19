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

## Historial

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

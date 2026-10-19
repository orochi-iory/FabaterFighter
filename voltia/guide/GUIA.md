# Guía de estilo — modelo nuevo

Página `preview/guia.html`. Solo información para generar, y el prompt.
No reproduce frames. El sprite se mira en `preview/nueva.html`.

El personaje de la pelea tiene su propia guía, `preview/guia-vieja.html`,
por si este estilismo no sobrevive al recorte.

La pelea no usa estos sprites.

## Dónde está

Un solo sprite de referencia, todavía sin aprobar: `voltia/newref/ref_stand.png`,
95 × 126 píxeles. De pie, guardia de Street Fighter II.

El recorte sin tocar, tal cual sale del modelo, está en
`voltia/newref/ref_stand_native.png`, 567 × 1022, y se mira en la prueba
`preview/nueva.html?mode=native`.

No hay idle. El idle de veinte frames anterior está borrado, con su recorte.

## La escala

Esta es la regla importante, la que costó el modelo anterior.

- La imagen se genera a **1024 × 1024** con **bloques de 8** píxeles de lado:
  cada píxel del sprite es un cuadrado de 8, y nada puede ser más fino.
- La figura mide **120 bloques** de alto, 960 píxeles de pantalla.
- Para bajarla a tamaño de juego **se divide por el tamaño del bloque**: ÷8,
  entero. Nunca LANCZOS, nunca una escala fraccionaria.
- Reducir a 120 de alto lo que mide 1022 ponía cada píxel en una fracción de
  píxel: 3000 tonos y el detalle muerto. Eso era el modelo feo.

Lo que se midió en la tirada de la rejilla: el modelo **no clava la rejilla**
aunque se le pida. Los escalones no caen en múltiplos de 8 y la figura salió de
1014 píxeles, no 960. Pero los bloques sí son de ~8, así que la división entera
funciona: 95 × 126, sin interpolar y sin mezclar un solo color.

Encaje en el escenario: la figura que ya juega mide 153 de alto. Esta mide 126,
así que entra sin reescalar. Si algún día hay que igualarla a 120, se genera a
120 bloques de 8 y se corta ÷8 exacto.

Lo que se probó y no vale: usar el recorte nativo sin escalar. Mide 567 × 1022,
con los pies en el suelo deja la cabeza 614 píxeles por encima de la placa del
ring. No cabe. Se mira en `preview/nueva.html?mode=native`.

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
  rejilla de 8 aunque se la pida. La imagen sale con margen y con bloques de ~8;
  el ajuste fino se hace cortando por bloques enteros.
- El recorte por mayoría de ocho comía píxeles de dentro. Más nunca.
- Reutilizar es el frame entero en otro momento, no recortar un brazo.
- La máscara lleva boca: abertura oscura y labio de piel, bajo el visor.
  Sin boca el frame no entra.

## Historial

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

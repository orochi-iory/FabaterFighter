# Guía de estilo — Voltia

Apartado **Guía de estilo** del visor. Si un frame sale mal, la regla se anota
aquí antes de seguir.

La pelea no usa estos frames.

## Qué se borró

La versión nueva anterior no sirve. El recorte inicial era rosa, el mismo tono
de la máscara: se comía un trozo de la cara y dejaba rosa pegado al personaje.
Recortar un brazo del frame y pegarlo no es reutilizar. Eso también se borró.

Reutilizar es el dibujo completo, en otro momento. El saltito reutiliza el de
pie entero, colocado más alto.

## Recorte

El fondo de las tiras es verde brillante, nunca rosa ni magenta.

En cada imagen se mide el verde del borde. En esta tirada salió `#11EF06`
(17, 239, 6). No hace falta que sea `#00FF00` exacto: el modelo no lo clava.
Lo que no puede ser es un tono de la máscara.

Un píxel es fondo solo si está más cerca de ese verde que de la paleta.
No se recorta por «canal verde alto» ni por rosa.

| Tinta | RGB | Al verde |
|---|---|---|
| máscara | 152, 40, 104 | 260 |
| máscara sombra | 112, 24, 80 | 246 |
| visor | 40, 168, 168 | 178 |
| traje sombra | 16, 72, 80 | 183 |

La más cercana es el visor, a 178. La máscara está a 260. No se sacrifica.
Se sacrifica el rosa como color de fondo.

Si una tinta nueva cae a menos de 120 del verde medido, se mueve esa tinta.
No se mueve el recorte y no se toca la máscara.

## Idle

20 pasos, 8 fps. En `voltia/nueva/`.

1. De pie.
2. Saltito: el mismo de pie, más alto.
3. Pico: rodilla arriba.
4. Cae y pisa.
5. Segundo saltito, igual de forma, un poco más bajo.
6. Baja las manos y se atusa las piernas, del muslo a la caña, y vuelve.

Sprites clave: `00_stand` (de pie), `02_hop1_peak` (rodilla arriba),
`13_stroke_low` (manos en la caña).

## Boca

La máscara lleva boca. Abertura oscura y labio de piel, bajo el visor,
mirando a la derecha. Está en los 20 frames, también con la cabeza inclinada.
Sin boca el frame no entra. No se redibuja el cuerpo para ponerla.

## Huecos del recorte

El recorte por mayoría se comió píxeles de dentro. Se cierran los huecos
encerrados de hasta 40 px, con el color de alrededor. El lazo de la coleta
no se cierra: es hueco de verdad, no un mordisco.

En el pico del saltito el visor tenía un bocado de 42 px. Ese sí se cierra,
creciendo desde el borde, para no tapar el ojo con un solo tono. El hueco
entre el brazo y el pecho no se toca.

## Historial

- 2026-10-19. Borrada la versión nueva anterior. Idle de 20 desde cero.
  Recorte verde medido en el borde. Máscara entera.
- 2026-10-19. El cuerpo se queda. Se cierran los píxeles que se comió el
  recorte y vuelve la boca: abertura y labio, bajo el visor.

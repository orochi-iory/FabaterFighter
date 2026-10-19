# Guía de estilo — Voltia

Se corrige desde el visor, apartado **Guía de estilo**.
Este archivo es la copia de trabajo. Si una generación sale mal, la regla nueva
se anota aquí y en `style.json` antes de seguir. No se añade una regla que no
hayamos visto fallar.

La pelea no usa estos frames. La hoja vieja sigue donde estaba.

## Ancla

`voltia/sf2/idle_0.png`. Primer frame de la última tirada. 89×120, 18 tintas.
Todo el ciclo nuevo sale de ese dibujo. No se regenera el personaje para
hacer otro frame si el ancla se puede mover.

Mira a la derecha. El juego espeja. Altura de pie del ancla: 120 px de arte.
No se reescala a otro alto hasta que esta guía lo cambie.

## Recorte

Fondo de las tiras: **#00FF00** exacto, plano, de borde a borde. PNG. Sin JPEG,
sin sombra, sin línea de suelo.

Se midió la distancia de las 18 tintas a los recortes de siempre. El verde
puro es el más lejos.

| Recorte | Tinta más cercana | Distancia |
|---|---|---|
| #00FF00 | teal claro (14, 108, 108), 20 px | 183 |
| #0000FF | coleta | 164 |
| #FF00FF | coleta | 173 |
| #FF0000 | máscara | 143 |
| #00FFFF | visor | 113 |
| #FFFF00 | rayo | 72 |

El visor (40, 176, 184) está a 204 del verde. No está cerca.

El fallo anterior no era que el verde estuviera en la paleta. Era recortar
por «canal verde alto», que se come el teal, y dejar el borde verde del
antialias. La regla nueva no mira el canal:

1. Si el píxel está a 60 o menos de #00FF00, es fondo.
2. Si está más cerca del recorte que de cualquier tinta, es fondo.
3. Lo que queda se encaja en la tinta más cercana.
4. Una mota de menos de 8 px se borra.

Lo hace `voltia/guide/extract.py`. No se recorta a mano.

### Si hay que sacrificar una tinta

Bola de exclusión: 100 alrededor de #00FF00. Ninguna tinta de Voltia entra.
No se sacrifica ninguna.

Si un personaje nuevo necesita un color dentro de esa bola, se mueve el color
del personaje y se anota en el historial. No se mueve el recorte, y no se
cambia el visor de Voltia para ampliar el hueco: no hace falta.

## Tintas

Solo estas. Un frame con un color nuevo no entra.

| Tinta | RGB | Al recorte |
|---|---|---|
| perfil | 0, 0, 0 | 255 |
| coleta sombra | 76, 36, 114 | 258 |
| navy sombra | 16, 18, 46 | 242 |
| coleta | 128, 70, 160 | 276 |
| navy | 30, 34, 78 | 236 |
| visor y teal | 40, 176, 184 | 204 |
| traje sombra | 8, 72, 80 | 200 |
| sombra morada | 42, 18, 70 | 251 |
| máscara | 156, 28, 100 | 293 |
| traje profundo | 6, 44, 54 | 218 |
| máscara sombra | 96, 14, 68 | 268 |
| piel | 236, 184, 142 | 284 |
| piel media | 200, 132, 92 | 252 |
| piel sombra | 148, 88, 60 | 231 |
| cinturón | 188, 140, 28 | 222 |
| rayo | 250, 210, 56 | 260 |
| rayo sombra | 228, 184, 52 | 244 |
| teal claro | 14, 108, 108 | 183 |

La sombra morada es pelo y también sombra del traje. No se usa sola para
localizar la coleta.

## Cómo se hace un frame

1. Si sale del ancla moviendo partes, se mueve. No se regenera.
2. Si hay que generar, una figura sola, con el ancla de referencia y el
   bloque de abajo, sobre #00FF00. Margen de 16 px. Nada toca el borde.
3. `python3 voltia/guide/extract.py entrada.png salida.png`
4. Tiene que quedar en una sola pieza. Si se parte, no se entrega.
5. Se mira al lado del ancla, a tamaño de juego, antes de hacer la tira.
6. Una tira solo cuando el frame suelto ya coincide. Hueco verde de medio
   cuerpo entre figuras. El mismo recorte. Varias tiras si no caben.

Bloque de prompt, literal:

> One fighting-game pixel sprite of the reference character, full body, facing right. Match the reference exactly: same chunky pixels, same magenta mask, same teal visor, same long violet ponytail, same fat yellow lightning bolt, same proportions, same flat colors. No anti-aliasing, no gradients, no soft shadows. Background is exactly flat pure green #00FF00 edge to edge. No floor, no shadow, no green on the character. Keep the teal visor teal. At least 16 pixels of pure #00FF00 margin on every side. Nothing touches the edge. No text, no numbers, no border.

## Sprites clave

Se reutilizan. No se redibujan para cada animación.

| Id | Frame | Sirve para |
|---|---|---|
| stand | `canon/00_stand.png` | Aterrizaje, contacto del paso, fin de los golpes, inicio del bloqueo |
| squash | `canon/04_squash.png` | Anticipación del salto, entrada al agachado |
| hop | `canon/06_hop1_peak.png` | Saltito en el aire, salto corto atrás |
| thighs | `canon/14_thighs.png` | Manos en los muslos. Calentamiento, y un taunt si aguanta |

El de pie es el ancla colocado en el lienzo común. El ovillo del salto y el
resto de ataques todavía no son clave: no se marcan hasta que existan.

## Idle

19 dibujos, 8 fps. El de pie cierra el bucle, así que se ven 20 pasos.

1. De pie, respira (el torso sube 3 px, los pies no).
2. Saltito doble: se agacha, sube 12 px, cae, y lo repite un poco más bajo.
3. Baja las manos y se sacude los muslos dos veces.
4. Vuelve a la guardia.

Los brazos del calentamiento son la primera construcción a partir del puño
del ancla. No están dados por buenos. Se corrigen desde el visor.

## Historial

- 2026-10-19. Primera guía. Recorte medido. Idle nuevo desde el ancla.
  La pelea no se toca. El calentamiento de muslos queda pendiente de corrección.

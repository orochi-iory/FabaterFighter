# Contrato de tilesheets para FabaterFighter 2D

Guía para generar hojas de sprites que el juego carga **tal cual**, sin tocar
código. Si un personaje no tiene hoja, el juego usa una hoja provisional
procedural con su paleta, así que puedes entregar personaje a personaje.

## Entregable por personaje

```
sheets/<id>/sheet.png     # atlas PNG con transparencia
sheets/<id>/sheet.json    # manifiesto (abajo)
```

`<id>` = kenji, valeria, brutus, kagerou, magnus, rex, orion, sera, goran, vesper.

## Manifiesto (sheet.json)

```json
{
  "image": "sheet.png",
  "frameWidth": 96,
  "frameHeight": 128,
  "meters": 1.8,
  "anchorY": 3,
  "animations": {
    "p_idle":   { "row": 0, "frames": 4, "fps": 8,  "loop": true },
    "mv_5HP":   { "row": 20, "frames": 3, "fps": 10, "loop": false }
  }
}
```

- Celdas de `frameWidth x frameHeight`; `row` = fila del atlas (de arriba a
  abajo); los frames van de izquierda a derecha (si pasan de 12, continúan en
  la fila siguiente; el cargador lo resuelve solo).
- `meters`: altura "real" del frame en metros del juego (1.8 por defecto).
- `anchorY`: píxeles desde el borde INFERIOR del frame hasta los pies (3 por
  defecto). La celda puede tener aire por arriba.
- **Orientación: el personaje mira SIEMPRE a la DERECHA.** El juego voltea
  para el lado contrario.

## Animaciones requeridas (nombres exactos)

Locomoción y estados (`p_*`):

| nombre | frames | contenido |
|---|---|---|
| p_idle | 4 | guardia respirando (loop) |
| p_walk | 6 | caminar hacia delante (loop) |
| p_crouch | 1 | agachado (defensa baja, postura Chun-Li) |
| p_jump | 1 | salto: subida, rodillas arriba |
| p_fall | 1 | caída: piernas extendidas |
| p_blockHigh | 1 | guardia alta, puños al centro (ref. Kyo) |
| p_blockLow | 1 | guardia baja agachado |
| p_hitHigh | 2 | golpeado alto: torso atrás |
| p_hitLow | 2 | golpeado bajo |
| p_launched | 1 | lanzado al aire (arco atrás) |
| p_knockdown | 2 | caída: f0 cayendo, f1 tumbado (SF2: espalda, pies arriba) |
| p_getup | 2 | levantarse: f0 tumbado, f1 agachado |
| p_dizzy | 2 | aturdido, tambaleo (loop) |
| p_guardcrush | 1 | guardia rota, brazos abiertos |
| p_grab | 1 | agarrando, brazos al frente |
| p_thrown | 1 | siendo lanzado |
| p_maxactivate | 2 | activación MAX (pose poder + aura) |
| p_ko | 1 | K.O. tumbado |
| p_win | 4 | victoria (loop) |
| p_intro | 2 | f0 reverencia, f1 guardia |
| p_parry | 1 | parry (palmas al frente) |

Golpes (`mv_<id>`): una animación por golpe del personaje, 3 frames
(windup / impacto / recuperación) — 4 para supers. IDs de los normales
comunes a todos: `5LP 5LK 5HP 5HK 2LP 2LK 2HP 2HK jLP jLK jHP jHK`
(más los especiales/supers de cada personaje: mira `src/data/roster.js`,
campo `specials`/`supers` de cada uno — sus `id` y `pose`).

Si un `mv_<id>` no existe, el juego cae a la pose genérica
(`p_jab`, `p_strong`, `p_kickH`, `p_launcher`… por el campo `pose` del golpe),
así que puedes priorizar: locomoción → 5HP/5HK/2HK → especiales → supers.

## Estilo y paleta por personaje

Referencia: SF2 CE / KOF 98 (silueta clara, lectura al instante).
Paleta canónica de cada personaje (campo `colors` en `src/data/roster.js`):

| id | gi/top | trim | piel | pelo | notas |
|---|---|---|---|---|---|
| kenji | #e9e6da | #b71c1c | #e7b189 | #241d1a | headband, spiky |
| valeria | #ffd54f | #00897b | #c68642 | #3e2723 | mujer, coleta, tank+shorts |
| brutus | #5d4037 | #ff8f00 | #e0a075 | #c62828 | mohawk, barba, torso desnudo, mazudo |
| kagerou | #263238 | #7b1fa2 | #d8a173 | #121212 | ninja, máscara, bufanda |
| magnus | #ff7043 | #4527a0 | #f0c8a0 | #eceff1 | calvo, turban, brazos largos |
| rex | #37474f | #fdd835 | #e8b98f | #8d6e63 | gorra, sheriff |
| orion | #212121 | #d50000 | #d9a066 | #ff5722 | flame hair, tank |
| sera | (ver roster) | | | | mujer |
| goran | (ver roster) | | | | |
| vesper | (ver roster) | | | | mujer |

(El resto de paletas están en `src/data/roster.js` — fuente de verdad.)

## Notas de lectura en pantalla

- El sprite se dibuja con `NearestFilter` (pixel-art nítido); escala libre.
- El escenario y efectos siguen siendo los actuales; el sprite planea sobre
  la línea de suelo del ring a `f.x` (metros) — usa `anchorY` para asentar.
- Cualquier tamaño de frame vale si el manifiesto lo declara; 96x128 o
  128x192 son cómodos.

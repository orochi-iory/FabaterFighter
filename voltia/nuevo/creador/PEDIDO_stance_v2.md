# Pedido · stance completo v2 (palmadas en los muslos)

**Qué adjuntar** (dos imágenes, ninguna más — no promediar tres o más):

1. `voltia/nuevo/creador/ref_stance_diseno.png` — el diseño aprobado, un frame grande y limpio.
   Es el ancla de identidad: mismo casco, mismo rayo, mismo cinturón, mismos guantes, misma
   coleta, mismas proporciones.
2. `voltia/nuevo/creador/ref_stance_actual_8f.png` — los 8 frames del stance actual. Sirve solo
   para el **rango** de movimiento (cuánto sube y baja el torso), no para copiar poses.

---

## El gesto, frame a frame

Ocho figuras, **una sola fila**, con el gesto cerrado y el bucle limpio. El 8 enlaza con el 1.

| # | Pose |
|---|---|
| 1 | Guardia alta, de pie, rodillas algo flexionadas. El bucle empieza aquí. |
| 2 | Empieza a bajar: rodillas se flexionan más, manos abren y bajan hacia los muslos. |
| 3 | Agachada: las manos ya tocan los muslos, justo encima de las rodillas. |
| 4 | **Palmada 1**: contacto firme en los muslos, rodillas dobladas al máximo, torso ligeramente hacia delante. |
| 5 | Las manos se levantan 2-3 px de los muslos (rebote de la palmada), rodillas siguen flexionadas. |
| 6 | **Palmada 2**: segundo contacto, rodillas un poco más altas que en 4 (sube del impulso). |
| 7 | Se endereza: manos suben de vuelta hacia la guardia, rodillas extendiéndose. |
| 8 | Casi en guardia, un pelín más baja que el 1 para que el bucle no dé un tirón. |

Reglas del gesto:

- **Las dos manos a la vez**, planas (dedos juntos, no puño), golpeando la parte delantera de
  los muslos, por encima de las rodillas y por debajo del cinturón.
- **Las rodillas se flexionan** de verdad: en el frame 4 la cadera baja 6-10 px respecto al 1.
  No es un salto: los pies **no** se despegan del suelo en ningún frame.
- El torso solo sube y baja unos píxeles; el peso está en las piernas.
- La coleta va **un frame por detrás** del cuerpo (baja cuando ella sube).
- **Las 8 poses distintas**: nada repetido, reflejado ni casi igual. Y el frame 1 no puede ser
  igual al 8.

---

## Prompt (copiar tal cual, en inglés)

```
Single sprite sheet, ONE horizontal row of EXACTLY 8 figures, 8 separate frames of the SAME
character doing a short idle loop: she claps her own thighs twice with both hands while
bending her knees. Arranged left to right, evenly spaced, big empty gaps between figures
(at least half a figure wide). Nothing touches the edges of the image.

CHARACTER (identical in all 8, do not redesign — copy the attached reference exactly): masked
luchadora, full-face magenta mask with teal eye patches and one white eye visible, extremely
long thick violet ponytail flowing behind her, teal bodysuit with a LARGE FAT chunky zigzag
yellow lightning bolt across the chest, thin gold belt with a square V buckle, bare muscular
arms, long dark-navy gauntlet gloves, dark-navy boots with knee pads and thin teal trim lines.
Slender, about seven heads tall. She faces RIGHT in profile.

THE ACTION, frame by frame:
1 high guard, standing, knees slightly bent.
2 starts to sink, knees bending more, hands opening and dropping toward her thighs.
3 crouched, both hands reach the tops of her thighs just above the knees.
4 FIRST CLAP: both flat hands strike her thighs, knees deeply bent, torso leaning slightly
   forward. Hips 6-10 px lower than in frame 1.
5 hands bounce up 2-3 px off the thighs, knees still bent.
6 SECOND CLAP: both hands strike the thighs again, knees a little higher than frame 4.
7 she straightens up, hands rising back toward the guard, knees extending.
8 nearly back to the high guard, slightly lower than frame 1 so the loop does not jump.

Both hands move together and are FLAT (fingers together, not fists). They hit the front of her
thighs, above the knees and below the belt. The knees really bend. The feet NEVER leave the
ground: this is not a jump. Only the torso rises and falls a few pixels. The ponytail lags one
frame behind the body.

Each of the 8 frames must be a DIFFERENT pose — no repeated, duplicated, mirrored or
near-identical frames anywhere in the row. All 8 figures the same size, heads at the same
height, feet on the SAME ground line, same character design in all of them.

STYLE: pixel-art fighting-game sprite in the exact style of the attached reference, chunky
large pixels, simple bold shapes, thick dark outlines, FLAT solid color fills, absolutely no
gradients, no blended shading, no fine detail, no anti-aliasing haze, at most one hard-edged
shadow shape per area.

BACKGROUND: pure flat red #FF0000, perfectly uniform, covering the whole image edge to edge.
No floor line, no ground shadow, no glow, no vignette, no checkerboard, no gradient anywhere.

Image is WIDE and SHORT (single row). Do not add any text, numbers, labels, grid lines,
borders, props, weapons, extra characters or watermark. Only the 8 figures on red.
```

---

## Qué comprobar cuando llegue (antes de trocear)

1. **8 figuras, ninguna repetida.** Dos iguales paran el bucle dos ticks.
2. **Fondo rojo plano** de borde a borde: ni degradado, ni sombra de suelo, ni rejilla.
3. **Figuras separadas** (medio cuerpo de hueco mínimo).
4. **Nada toca el borde** de la imagen.
5. **Mismo diseño en las 8** (rayo gordo, cinturón, casco, guantes, coleta).
6. **El gesto se ve**: las manos tocan los muslos en los frames 4 y 6, y las rodillas están
   claramente más dobladas que en el 1. Si las 8 figuras están de pie con los puños arriba, la
   IA ignoró el gesto y se pide otra vez.
7. **Los pies no se despegan** en ningún frame.

## Después, en el repo

```
PYTHONPATH=tools/pylibs python3 voltia/nuevo/creador/trocear.py   # rojo → transparencia + reparto por cabeza
PYTHONPATH=tools/pylibs python3 voltia/nuevo/creador/encajar.py   # a 96×152 (tamaño del modelo original)
```

`trocear.py` lee `sheet_stance.png` y espera **8** cabezas; si llegan otras, avisa antes de
escribir nada.

## Guardar la animación ya montada

En el visor del creador, con el orden que quieras en la secuencia: **💾 Guardar animación** →
`<mov>_<resol>_<n>f_<fps>fps.png` (la tira, píxeles tal cual) + `.json` (orden, fps, loop,
lienzo, ancla). El orden queda escrito en la página para poder repetirlo a mano.

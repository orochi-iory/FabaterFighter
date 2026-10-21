# Pedido · stance completo v2 (diseño actual, peso en los muslos, un saltito)

**Qué adjuntar como referencia** (una sola imagen de diseño, no promediar varias):

- `voltia/nuevo/creador/sprites/stance/f00.png` — el stance actual que está aprobado.
- Si el modelo admite una segunda: `voltia/nuevo/creador/ref_estilo_detalle.png`, solo para el
  grosor de línea y los colores planos.

Nada más. El arte conceptual arrastra el estilo de presentación y estropea la hoja.

---

## Prompt (copiar tal cual, en inglés)

```
Single sprite sheet, ONE horizontal row of EXACTLY 8 figures, 8 separate frames of the SAME
character in the SAME idle fighting stance, arranged left to right, evenly spaced, big empty
gaps between figures (at least half a figure wide). Nothing touches the edges of the image.

CHARACTER (identical in all 8, do not redesign): masked luchadora, full-face magenta mask with
teal eye patches and one white eye visible, extremely long thick violet ponytail flowing
behind her, teal bodysuit with a LARGE FAT chunky zigzag yellow lightning bolt across the
chest, thin gold belt with a square V buckle, bare muscular arms, long dark-navy gauntlet
gloves, dark-navy boots with knee pads and thin teal trim lines. Slender, about seven heads
tall. She faces RIGHT in profile, guard up, both fists near her chest.

MOTION — this is the important part: an idle "breathing" bounce with the weight LOW on her
thighs. Knees are bent, hips sit low, the thighs take all the weight and compress. Over the
8 frames she sinks a little, pushes up, and does ONE SMALL HOP: at the top of the bounce both
boots leave the ground by just 2-3 px, then she lands, absorbs by bending the knees deeper,
and comes back. The torso only rises and falls a few pixels; the ponytail lags one frame
behind (it keeps going up when she lands, and falls when she rises).

Each of the 8 frames must be a DIFFERENT pose — no repeated, duplicated, mirrored or
near-identical frames anywhere in the row. Frame 8 must flow back into frame 1 without a
jump, and frame 1 must not be equal to frame 8. All 8 figures on the SAME ground line and
the same size, heads at the same height, feet at the same level except in the airborne
frames.

STYLE: pixel-art fighting-game sprite, chunky large pixels, simple bold shapes, thick dark
outlines, FLAT solid color fills, absolutely no gradients, no blended shading, no fine
detail, no anti-aliasing haze, at most one hard-edged shadow shape per area.

BACKGROUND: pure flat red #FF0000, perfectly uniform, covering the whole image edge to edge.
No floor line, no ground shadow, no glow, no vignette, no checkerboard, no gradient anywhere.

Image is WIDE and SHORT (single row). Do not add any text, numbers, labels, grid lines,
borders, props, weapons, extra characters or watermark. Only the 8 figures on red.
```

---

## Qué comprobar cuando llegue (antes de trocear)

1. **8 figuras y ninguna repetida.** Si hay dos iguales, se pide otra vez: el bucle se para
   dos ticks en esa pose.
2. **Fondo rojo plano de borde a borde.** Si hay degradado, rosa, sombra de suelo o rejilla,
   no sirve: el recorte necesita `255,0,0` puro fuera de la paleta del personaje.
3. **Figuras separadas** (medio cuerpo de hueco mínimo). Si se tocan, el reparto por cabeza
   no puede separarlas sin cortar a nadie.
4. **Nada toca el borde** de la imagen.
5. **Mismo diseño en las 8**: rayo gordo amarillo, cinturón, guantes, coletas. Si un frame
   pierde el rayo o cambia el casco, se descarta.
6. **El salto se nota**: en el frame más alto las botas están despegadas 2-3 px. Si las 8
   figuras están a la misma altura, la IA ignoró el salto y se pide otra vez.

## Después, en el repo

```
PYTHONPATH=tools/pylibs python3 voltia/nuevo/creador/trocear.py   # rojo → transparencia + reparto por cabeza
PYTHONPATH=tools/pylibs python3 voltia/nuevo/creador/encajar.py   # a 96×152 (tamaño del modelo original)
```

`trocear.py` lee `sheet_stance.png` y espera **8** cabezas. Si llegan 9 o 10, el aviso sale en
consola antes de escribir nada.

## Cómo se guarda la animación ya montada

En el visor del creador, con la secuencia en el orden que quieras:

**💾 Guardar animación** → descarga

- `<mov>_<resol>_<n>f_<fps>fps.png` — la tira con los frames **tal cual**, sin escalar ni
  filtrar (nativo 285×524 o oficial 96×152 por frame);
- `<mov>_<resol>_<n>f_<fps>fps.json` — orden exacto, fps, loop, lienzo, ancla y ficheros.

El orden queda escrito en la página (`Orden guardado: 1 · 4 · 2 · …`) para poder repetirlo a
mano. El GIF se monta aparte, que es donde toca bajar a 256 colores:

```
python3 tools/make_gif.py <carpeta_de_frames> stance_v2.gif --fps 10 --zoom 4
```

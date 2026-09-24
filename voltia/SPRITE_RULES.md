# Reglas de coherencia de sprites — VOLTIA (canon v1)

> Sin reglas, cada tira generada por IA sale con distinta altura, distinto
> "píxel" y distinta paleta. Este documento fija el sistema para que eso no
> vuelva a pasar. **Ninguna tira entra en el montaje sin pasar la puerta QA.**

## 1. El problema, medido (10 primeras tiras)

| Medida | Resultado |
|---|---|
| Altura de personaje | **373–647 px** según la tira (walk ≈ 58 % de block) |
| Cuadrícula de píxel | **Ninguna**: la IA dibuja arte suavizado con *aspecto* pixel-art (píxel detectado = 1 en las 10) |
| Fondo | No es magenta puro: varía **(185–204, 63–86, 146–172)** por tira |
| Paleta | El teal del traje varía entre `(0,128,128)` y `(0,176,160)`; el rosa entre `(176,64,144)` y `(192,64,160)` |
| Defectos | `jump.png` trae **botas cortadas** por el borde (detectado por QA, excluida) |

Veredicto: el estilo es el aprobado ✅, pero hacían falta resolución fija,
paleta fija y puerta de calidad. Eso es este sistema.

## 2. Canon v1 (fijo, en `voltia/spec.json`)

| Regla | Valor | Por qué |
|---|---|---|
| Ancla de estilo | `raw/block.png` | Decisión del proyecto: ese tamaño/estilo es el objetivo |
| Altura canónica | **160 px-arte** | Luchador detallado estilo SF (Ryu en SFA3 ≈ 100 px); a 4x = 640 px ≈ tamaño del ancla |
| Escalas (enteras) | frames **4x** (640 px), hoja uniforme **2x**, hoja referencia y preview **1x** | Solo factores enteros con NEAREST: el píxel nunca se deforma |
| Paleta maestra | **v1, 48 colores** (`master_palette.png`) | Median-cut de 7 tiras (incluye efectos como la chispa) |
| Fondo futuro | **Verde puro `#00FF00`**, plano | El rosa actual está a ~50 niveles del rosa de la máscara (peligroso); nada de la paleta se acerca al verde |
| Retratos | 120 px-arte de alto | Altura propia fija, mismo píxel y paleta |

## 3. Reglas de generación (toda tira nueva)

1. **Referencia obligatoria**: cada generación se hace pasando el ancla
   (`block.png`) como imagen de referencia + este bloque de personaje fijo.
2. **Cambiar una sola variable**: mismo personaje, estilo y fondo; solo cambia la acción.
3. **Primero UNA tira de prueba** → QA → si pasa, el lote. Nunca lotes a ciegas.
4. **Composición obligatoria** (en el prompt): cuerpo entero visible con margen
   por los 4 lados, nada cortado; pies sobre la misma línea base; el personaje
   llena ~80 % de la altura de cada frame; N frames exactos en una fila.
5. **Prohibido**: texto, marcas, bordes, sombras, otros personajes, detalles de fondo.

### Plantilla de prompt (bloques fijos, solo cambia `{N}` y `{acción}`)

```
Sprite animation strip, exactly {N} frames in a single horizontal row from
left to right, evenly spaced with clear gaps between frames, same character
with identical design, size and colors in every frame, showing: {acción}.
Full body visible with clear margin on all sides, nothing cropped. Feet
aligned on the same baseline. Character fills ~80% of each frame height.
Character: Voltia, an original female cyber luchadora wrestler:
magenta-pink wrestling mask with a cyan lightning-bolt emblem, long flowing
dark-purple ponytail, teal wrestling bodysuit with a yellow belt and a yellow
lightning emblem on the chest, navy-blue gloves, navy-blue boots and navy
knee pads. Match the attached reference image: same design, same
proportions, same pixel size. Style: 2D fighting game sprite, 1990s Capcom
arcade pixel-art style like Super Street Fighter 2, clean pixels, side view,
full body, facing right. Background: plain flat solid pure green (#00FF00),
no text, no watermark, no logo, no border, no floor shadow, no other
characters, no background details.
```

## 4. Puerta QA (automática, `normalize.qa_check`)

| Chequeo | Regla | Si falla |
|---|---|---|
| Nº de frames | == esperado | 🔴 RECHAZAR (regenerar) |
| Figura tocando el borde | margen ≥ 4 px | 🔴 RECHAZAR (posible recorte) |
| Tira vacía tras chroma | — | 🔴 RECHAZAR |
| Altura vs canon | ±15 % | 🟡 AVISO (la normalización lo corrige) |
| Tamaño de píxel vs ancla | igual | 🟡 AVISO (se corrige) |
| Contenido (pose, facing, dedos…) | contacto `raw_contact.png` | 👁 revisión humana obligatoria |

Lo 🔴 **se excluye del montaje automáticamente**.

## 5. Pipeline

```
raw/*.png ──chroma+split──▶ QA ──normalizar──▶ frames/ (4x, alfa dura, paleta v1)
(verdes o rosas)              │                        ├──▶ sheet.png (1x, estilo Ryu)
                         🔴 fuera                      ├──▶ sheet_uniform.png (2x) + sheet.json
                                                       └──▶ preview.png (1x)
```

Comandos:

```bash
python3 voltia/analyze.py            # informe de coherencia -> qa_report.txt
python3 voltia/analyze.py --freeze   # (re)congela spec.json + paleta maestra
python3 voltia/build_sheet.py        # QA + normaliza + monta todo
```

## 6. Versionado

- **Reglas v1** = este documento. Si cambian (p. ej. H distinto), sube versión y
  se regeneran **todos** los derivados con un solo comando (no cuesta imágenes).
- **Paleta v1** = 48 colores. Si un efecto nuevo trae colores ausentes
  (p. ej. el proyectil), se amplía a v2 y se re-mapea todo.

## 7. Estado actual

- ✅ 9/25 tiras aceptadas y normalizadas (idle, walk, fwdjump, crouch, block,
  punch_l, punch_mh, kick_lm, kick_h).
- 🔴 `jump.png` rechazada (botas cortadas) → **regenerar con reglas v1**.
- ⏳ 16 tiras pendientes (con fondo verde + referencia a partir de ahora).

## 8. Base teórica (investigado en la red)

- Fijar **una sola referencia maestra**, un "contrato de personaje" (altura en
  píxeles, paleta, cámara) y cambiar una variable por generación; medir la
  coherencia a tamaño de juego y escala entera [4](https://spritefy.com/blog/consistent-ai-pixel-art-characters).
- Bloquear modelo/prompts/paleta en todos los assets; normalizar altura y
  pivotes entre frames; checklist de calidad [1](https://www.seeles.ai/resources/blogs/ai-generate-pixel-art-game-assets) [3](https://www.seeles.ai/resources/blogs/ai-pixel-art-generator-create-game-assets).
- Generar cada animación **a partir de la imagen de referencia** para preservar
  estilo y paleta [2](https://www.pixelcut.ai/create/isometric-sprite-sheet-generator).
- Escalas enteras sobre lienzos estándar (320x180, 640x360…) [3](https://screwloose-games.github.io/documentation/content/guides/art/pixel_art/pixel_art_guide.html).
- Los luchadores de la era SF medían ~70–100 px de alto [1](https://steamcommunity.com/app/431730/discussions/0/4411921001873602095/); 160 px nos da el punto "detallado" manteniendo proporción creíble.

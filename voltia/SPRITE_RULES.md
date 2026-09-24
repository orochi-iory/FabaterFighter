# Reglas de coherencia de sprites — VOLTIA (canon v1.1)

> Sin reglas, cada tira generada por IA sale con distinta altura, distinto
> "píxel" y distinta paleta. Este documento fija el sistema para que eso no
> vuelva a pasar. **Ninguna tira entra en el montaje sin pasar la puerta QA.**

## 1. El problema, medido (tiras originales)

| Medida | Resultado |
|---|---|
| Altura de personaje | **373–647 px** según la tira (walk ≈ 58 % de block) |
| Cuadrícula de píxel | La IA dibuja arte **suavizado** con *aspecto* pixel-art (píxel detectado = 1) |
| Fondo | No era magenta puro: variaba **(185–204, 63–86, 146–172)** por tira |
| Paleta | El teal iba de `(0,128,128)` a `(0,176,160)`; el rosa de `(176,64,144)` a `(192,64,160)` |
| Riesgo máscara/fondo | El rosa de la máscara está a ~50 niveles del rosa de fondo → el chroma podía comerse píxeles de la máscara |
| Piel | Sin restricción, las sombras de piel podían mapear a verdes/azules/rojos exagerados |
| Defectos | `jump.png` original traía **botas cortadas** (detectado por QA, regenerada) |

## 2. Canon v1.1 (fijo, en `voltia/spec.json`)

| Regla | Valor | Por qué |
|---|---|---|
| Ancla de estilo | `raw/block.png` | Decisión del proyecto: ese tamaño/estilo es el objetivo |
| Altura canónica | **160 px-arte** | Luchador detallado estilo SF (Ryu en SFA3 ≈ 100 px); a 4x = 640 px ≈ tamaño del ancla |
| Escalas (enteras) | frames **4x** (640 px), hoja uniforme **2x**, hoja referencia y preview **1x** | Solo factores enteros con NEAREST: el píxel nunca se deforma |
| Paleta maestra | **v1, 48 colores** (`master_palette.png`) | Median-cut de 7 tiras (incluye efectos) |
| Subpaleta de piel | **v1, 8 tonos humanos** (`skin_palette.png`) | La piel SOLO puede mapear a estos 8 cálidos; nada de verdes/azules/rojos |
| Fondo | **Verde puro `#00FF00`**, plano | Nada de la paleta (máscara, traje, piel, efectos) se acerca al verde |
| Retratos | 120 px-arte de alto | Altura propia fija, mismo píxel y paleta |

## 3. Reglas de generación (toda tira nueva)

1. **Referencia obligatoria**: cada generación pasa el ancla (`block.png`) como
   imagen de referencia + el bloque de personaje fijo.
2. **Píxel grueso real exigido**: el prompt pide cuadrícula visible sin
   antialiasing; si la tira trae píxel `s>1` se extrae por división entera
   (cero interpolación); si viene suavizada se impone el canon 160 en post.
3. **Piel humana viable**: el prompt restringe la piel a tonos cálidos y el
   protector de piel lo garantiza en el mapeo.
4. **Cambiar una sola variable**: mismo personaje, estilo y fondo; solo cambia la acción.
5. **Primero UNA tira de prueba** → QA → si pasa, el lote. Nunca lotes a ciegas.
6. **Composición obligatoria**: cuerpo entero visible con margen por los 4 lados,
   nada cortado; pies sobre la misma línea base; el personaje llena ~80 % de la
   altura; N frames exactos en una fila.
7. **Prohibido**: texto, marcas, bordes, sombras, otros personajes, detalles de fondo.

### Plantilla de prompt v1.1 (bloques fijos, solo cambia `{N}` y `{acción}`)

```
Using the attached reference image as the exact character design to match
(same luchadora, same mask, suit, colors and proportions): sprite animation
strip, exactly {N} frames in a single horizontal row from left to right,
evenly spaced with clear gaps, identical design size and colors in every
frame, showing: {acción}. Full body visible with clear margin on all sides,
nothing cropped. Feet aligned on the same baseline. Character fills ~80% of
each frame height. Character: Voltia, an original female cyber luchadora
wrestler: magenta-pink wrestling mask with cyan lightning-bolt emblem, long
flowing dark-purple ponytail, teal wrestling bodysuit with yellow belt and
yellow lightning emblem on chest, navy-blue gloves, boots and knee pads,
natural human skin tones on visible face and arms (warm tan and peach shades
only). Style: TRUE 1990s Capcom arcade pixel art like Super Street Fighter 2:
large chunky square pixels clearly visible, every pixel a flat solid color,
absolutely no anti-aliasing, no gradients, no smooth shading, no blur,
limited 16-bit console palette, side view, full body, facing right.
Background: plain flat solid pure green (#00FF00), no text, no watermark, no
logo, no border, no floor shadow, no other characters, no background details.
```

## 4. Puerta QA (automática, `normalize.qa_check`)

| Chequeo | Regla | Si falla |
|---|---|---|
| Nº de frames | == esperado | 🔴 RECHAZAR (regenerar) |
| Figura tocando el borde | margen ≥ 4 px | 🔴 RECHAZAR (posible recorte) |
| Tira vacía tras chroma | — | 🔴 RECHAZAR |
| Altura vs canon | ±15 % | 🟡 AVISO (la normalización lo corrige) |
| Tamaño de píxel vs ancla | igual | 🟡 AVISO (se corrige) |
| Proporción de piel vs ref | ×0.3 – ×3 | 🟡 AVISO (revisar tonos) |
| Contenido (pose, facing, dedos…) | contacto `raw_contact.png` | 👁 revisión humana obligatoria |

Lo 🔴 **se excluye del montaje automáticamente**. La prueba v1.1
(`qa_v2proof.png`) documenta el flujo aceptado.

## 5. Pipeline

```
raw/*.png ──chroma+split──▶ QA ──normalizar──▶ frames/ (4x, alfa dura, paleta v1 + piel)
(verdes v1.1)                 │                        ├──▶ sheet.png (1x, estilo Ryu)
                         🔴 fuera                      ├──▶ sheet_uniform.png (2x) + sheet.json
                                                       └──▶ preview.png (1x)
```

Comandos:

```bash
python3 voltia/analyze.py            # informe de coherencia -> qa_report.txt
python3 voltia/analyze.py --freeze   # (re)congela spec.json + paletas
python3 voltia/build_sheet.py        # QA + normaliza + monta todo
```

## 6. Versionado

- **Reglas v1.1** = este documento (v1 + fondo verde, protector de piel,
  píxel grueso exigido). Si cambian, sube versión y se regeneran **todos** los
  derivados con un solo comando (no cuesta imágenes).
- **Paleta v1** = 48 colores + 8 de piel. Si un efecto nuevo trae colores
  ausentes (p. ej. el proyectil), se amplía a v2 y se re-mapea todo.

## 7. Estado actual

- ✅ 11/25 tiras aceptadas: 9 originales normalizadas + `jump` rehecha y `dash`
  nueva en v1.1 (verdes, con referencia).
- 🔁 Pendiente de aprobación: **rehacer de cero las 9 originales** en v1.1 +
  generar las 14 restantes + retrato (= 24 imágenes, ~3 turnos).
- ⏳ Tras el OK: hoja final estilo Ryu completa + limpieza de assets viejos +
  visor actualizado.

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

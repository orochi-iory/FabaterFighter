# Reglas de coherencia de sprites — VOLTIA (canon v1.2)

> Sin reglas, cada tira generada por IA sale con distinta altura, distinto
> "píxel" y distinta paleta. Este documento fija el sistema para que eso no
> vuelva a pasar. **Ninguna tira entra en el montaje sin pasar la puerta QA.**

## 1. Problemas medidos (y su solución)

| Medida | Resultado | Solución (v1.2) |
|---|---|---|
| Altura de personaje | 373–647 px según tira | Ancla de **cabeza** (ver §2) |
| Cuadrícula de píxel | Arte suavizado (píxel = 1) | Se impone el canon en post; si llega cuadrícula real se extrae entera |
| Fondo | Rosa variable, a ~50 niveles del rosa de máscara | **Verde puro `#00FF00`** |
| Paleta a la deriva | Teal `(0,128,128)`–`(0,176,160)` | Paleta maestra congelada (49 tintas) |
| Sombras inconsistentes | dash 3 tonos, jump 2 (técnicamente 11 tintas dispersas por mapeo libre) | **Rampas fijas por material** + histogram matching (§2) |
| Piel con tonos imposibles | Sombras mapeaban a verdes/azules/rojos | Subpaleta de 8 tonos humanos + protector |
| Proporciones variables | 6.0–8.3 cabezas según tira (idle/kick_h alargados) | Puerta QA de proporción (§4); el rehacer de cero lo corrige |
| 160 fijos deformaban poses | Forzar 160 por frame hinchaba el agachado | La altura de pie **emerge** (~160); cada pose conserva su altura relativa |

## 2. Canon v1.2 (fijo, en `voltia/spec.json`)

| Regla | Valor | Por qué |
|---|---|---|
| Ancla de estilo | `raw/block.png` | Decisión del proyecto |
| Ancla de escala | **Cabeza = 23.0 px-arte** (medida en el ancla) | La cabeza no cambia con la pose: agachado/tumbado heredan la escala correcta sin hincharse |
| Altura de pie | **~160 px-arte (emergente)** | No se impone: resulta de la cabeza. Desvíos >12 % = AVISO |
| Rampas de sombra | traje/navy/piel/máscara/pelo **3 tonos** (estilo dash); amarillo 2; perfilado/blanco 1 | Toda tira sombrea idéntico por construcción |
| Matching | Histogram matching de luminancia por material al ancla | Misma estructura de contraste en todo el set |
| Escalas (enteras) | frames **4x**, hoja uniforme **2x**, referencia/preview **1x** | NEAREST: el píxel nunca se deforma |
| Paleta maestra | **Congelada v1: 49 tintas** (48 + blanco) | Los índices etiquetan materiales; solo cambia con `--repalette` + re-etiquetado |
| Piel | **8 tonos humanos**; mapeo exclusivo | Cero verdes/azules/rojos |
| Retratos / proyectil | 120 / 64 px-arte fijos | Sin cabeza que anclar: altura propia fija |

## 3. Reglas de generación (toda tira nueva)

1. **Referencia obligatoria**: el ancla (`block.png`) como imagen de referencia.
2. **Proporciones explícitas**: el prompt exige `7 heads tall, heroic
   proportions, consistent head size across all frames` (la puerta QA lo verifica).
3. **Píxel grueso real exigido**: cuadrícula visible sin antialiasing; si la
   tira trae píxel `s>1` se extrae por división entera.
4. **Piel humana viable** en prompt + protector en mapeo.
5. **Cambiar una sola variable**; **una tira de prueba primero**; nunca lotes a ciegas.
6. **Composición**: cuerpo entero con margen, nada cortado; pies en la misma
   base; ~80 % de altura; N frames exactos en fila; fondo verde plano.
7. **Prohibido**: texto, marcas, bordes, sombras, otros personajes, detalles de fondo.

(Plantilla de prompt completa: ver §3 de la v1.1 + las cláusulas 2–3 de arriba.)

## 4. Puerta QA (automática)

| Chequeo | Regla | Si falla |
|---|---|---|
| Nº de frames | == esperado | 🔴 RECHAZAR |
| Figura tocando el borde | margen ≥ 4 px | 🔴 RECHAZAR |
| Tira vacía tras chroma | — | 🔴 RECHAZAR |
| Cabezas detectadas | ≥ mitad de frames | 🟡 AVISO (fallback por altura) |
| Cabeza inconsistente en tira | cv ≤ 12 % | 🟡 AVISO |
| De pie emergente | 160 ± 12 % | 🟡 AVISO (proporción sospechosa → regenerar) |
| Agachado pleno | 85–130 px-arte | 🟡 AVISO |
| Piel vs referencia | ×0.3 – ×3 | 🟡 AVISO |
| Contenido (pose, facing, dedos…) | `raw_contact.png` | 👁 revisión humana obligatoria |

Pruebas: `qa_v12proof.png` (alturas + cabezas 23px + rampas 3 tonos),
`qa_v2proof.png` (flujo v1.1), `qa_skin.png` (piel), `qa_lineup.png` (v1).

## 5. Pipeline

```
raw/*.png ──chroma+split──▶ QA ──escala por cabeza + rampas──▶ frames/ (4x)
(verdes v1.1+)                │                                    ├──▶ sheet.png (1x, estilo Ryu)
                         🔴 fuera                                  ├──▶ sheet_uniform.png (2x) + sheet.json
                                                                   └──▶ preview.png (1x)
```

```bash
python3 voltia/analyze.py                 # informe -> qa_report.txt
python3 voltia/analyze.py --freeze        # (re)congela spec (paleta congelada salvo --repalette)
python3 voltia/build_sheet.py             # QA + normaliza + monta todo
```

## 6. Versionado

- **Reglas v1.2** = v1.1 + ancla de cabeza + rampas con matching + paleta
  congelada + puerta de proporción. Todo derivado se regenera con un comando.
- **Paleta v1** = 49 tintas. `--repalette` solo si un efecto trae colores
  ausentes (entonces se re-etiquetan materiales manualmente).

## 7. Estado actual

- ✅ 11 tiras de prueba normalizadas; rampas 3 tonos en las 11; cabezas 23px en las 11.
- 🟡 `idle` (192) y `kick_h` (189) alargados, `crouch` (de pie 140) achaparrado:
  proporciones de origen, **se corrigen en el rehacer de cero**.
- 🔁 Pendiente de aprobación: **rehacer completo en v1.2** (26 tiras verdes con
  referencia + cláusula de proporciones) → hoja final estilo Ryu + visor.

## 8. Base teórica (investigado en la red)

- Una sola referencia maestra, "contrato de personaje" (altura, paleta, cámara),
  una variable por generación, medir a tamaño de juego y escala entera [4](https://spritefy.com/blog/consistent-ai-pixel-art-characters).
- Bloquear modelo/prompts/paleta; normalizar altura y pivotes; checklist [1](https://www.seeles.ai/resources/blogs/ai-generate-pixel-art-game-assets) [3](https://www.seeles.ai/resources/blogs/ai-pixel-art-generator-create-game-assets).
- Generar cada animación **desde la imagen de referencia** [2](https://www.pixelcut.ai/create/isometric-sprite-sheet-generator).
- Escalas enteras sobre lienzos estándar [3](https://screwloose-games.github.io/documentation/content/guides/art/pixel_art/pixel_art_guide.html).
- Luchadores SF ≈ 70–100 px [1](https://steamcommunity.com/app/431730/discussions/0/4411921001873602095/); 160 px = punto "detallado".

# FabaterFighter

Juego de peleas 2D. Personajes jugables: **VOLTIA** (la luchadora voltaje ⚡) y **CHUN-LI**.

![Concepto de Voltia](assets/voltia_concept.png)

## Arrancar

```bash
pip install -r tools/requirements.txt        # Pillow, solo para los scripts
python3 tools/serve.py                       # http://localhost:8080
```

`tools/serve.py` sirve el repositorio con **`Cache-Control: no-store`**: el visor cambia
mucho y el navegador cacheando HTML/PNG ya nos costó tres veces «los cambios no llegan».

- `/` → redirige al visor.
- `/preview/index.html` → visor de Voltia: frame a frame, tira de la animación, escala
  1×/2×/4×, fondos de chroma, escenario y manual de movimientos.
- `/preview/fight.html` → el juego (selector de personaje, cajas de golpe con **H**).
- `/preview/chunli.html` → ficha de Chun-Li: las 22 animaciones con sus números.
- `/preview/nuevo.html` → el modelo nuevo (experimental, no entra en el juego).
- `/preview/guia-vieja.html` → guía de estilo del modelo original.

## Voltia: lo que se sirve

| | |
|---|---|
| hoja | `voltia/sheet_uniform.png` (5250 × 8300, 15 × 25 celdas de 350 × 332) |
| datos | `voltia/sheet.json` (fila, frames, fps, loop, `rev` = md5 de la hoja) |
| ajustes | `rev` obliga al navegador a pedir la hoja nueva; `pivot` y `scale` los manda `sheet.json` |
| fuente | `voltia/frames/voltia_<anim>_<n>.png`, **rejilla de píxel exacta de 4×** |
| animaciones | **25** · **102** frames |

El modelo oficial es **borde verde + contorno comido −1 px de arte + grano limpiado**.
La hoja se genera entera con:

```bash
python3 tools/voltia_reconstruir.py            # hoja + sheet.json + fighter del escenario
python3 tools/voltia_reconstruir.py --solo-ver # solo comparaciones, no escribe
```

Pipeline, por frame: `÷4 NEAREST` a 1× de arte → limpieza de grano por masa local
(protegiendo el negro de línea y el cian del borde) → `−1 px` de arte de contorno →
`×2 NEAREST` a la hoja, pegado alineado a par.

> **Regla que no se negocia:** al pixel art **nunca** se le aplica un reescalado con
> interpolación (LANCZOS/BILINEAR) ni un factor fraccionario. Eso inventa medios píxeles,
> y de ahí salieron el 52 % de bloques 2×2 sucios, los cuadrados sueltos y el morado de la
> cara. Si hay que cambiar de rejilla, se baja con NEAREST a un divisor entero.

## Chun-Li

Personaje completo en el motor, con la misma altura que Voltia (147 px de mundo).

| | |
|---|---|
| filas de origen | 24, pero **1–3 son el mismo stance** → **22 animaciones** |
| stance | un solo bucle `1 → 2 → 1 → 3`, 32 frames a 10 fps = 3,2 s |
| hoja del juego | `voltia/nuevo/chunli/game/sheet.png` + `sheet.json` (celda 284 × 223, pivote 141,196) |
| regenerar | `tools/chunli_rows.py` → `tools/chunli_sheet_game.py` → `tools/chunli_page.py` |

## Herramientas

| script | para qué |
|---|---|
| `tools/serve.py` | servidor local sin caché |
| `tools/voltia_reconstruir.py` | hoja oficial de Voltia desde los frames nativos |
| `tools/make_gif.py` | GIF desde una carpeta de frames |
| `tools/chunli_rows.py` | corta las 24 filas y monta las 22 animaciones de Chun-Li |
| `tools/chunli_sheet_game.py` | hoja de juego (altura, pivote, celda) |
| `tools/chunli_page.py` | genera `preview/chunli.html` |
| `tools/chunli_hoja.py` | hoja de referencia: una fila por animación |
| `tools/chunli_hitboxes.py` | cajas de golpe |

Generación del arte (Voltia): `voltia/build_sheet.py` + `voltia/normalize.py`
(`python3 voltia/analyze.py --freeze` congela el canon en `spec.json`). Ambos usan ya
**solo NEAREST**: el LANCZOS que ensuciaba las hojas está eliminado.

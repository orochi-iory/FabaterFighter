# Guía · cómo está hecho esto

Documento de trabajo. Solo lo que está **en uso hoy**. Lo que se probó y se descartó no
vive aquí: vive en el historial de git, que es donde se busca si hace falta.

## Estado

- **Voltia**: hoja oficial `voltia/sheet_uniform.png` (5250 × 8300, celdas 350 × 332,
  25 animaciones, 102 frames). Bordes verdes, contorno comido −1 px de arte, grano
  limpiado. Genera la hoja `tools/voltia_reconstruir.py`.
- **Chun-Li**: personaje completo, 22 animaciones, a la altura de Voltia (147 px de
  mundo). Hoja de juego en `voltia/nuevo/chunli/game/`.
- **Visor**: `preview/index.html` (frames, tira, escenario, manual). Sin secciones de
  pruebas: el modelo que se ve es el que se juega.

## Medidas de referencia

| | valor |
|---|---|
| celda de la hoja | 350 × 332 px de hoja |
| rejilla de la hoja | **2 px de hoja por px de arte** |
| rejilla de `voltia/frames/` | **4 px por px de arte** (0,00 % de bloques 4×4 sucios) |
| altura de Voltia | 147 px de mundo (tinta 300 px de hoja ≈ 150 px de arte) |
| altura de Chun-Li | 147 px de mundo, medida, nunca deducida |
| paleta | 18 colores opacos + blanco; no se añaden colores al limpiar |
| escalas de exportación | 4× frames · 2× hoja · 1× arte |

## La regla del píxel

**Nunca interpolar pixel art.** Nada de LANCZOS ni BILINEAR, y nada de factores
fraccionarios. Si hay que cambiar de rejilla: bajar con **NEAREST a un divisor entero** y,
si hace falta, volver a subir con **NEAREST**. Y al pegar en una hoja, **alinear el
pegado al bloque** (coordenadas pares si la rejilla es 2×).

Esto no es teoría: `normalize.py` reescalaba con LANCZOS y un factor no entero (el que
igualaba la altura de la cabeza), y el resultado medido fue **52,85 % de bloques 2×2 no
uniformes** en la hoja: color a medio píxel, cuadrados sueltos y el morado de la cara
donde el azul se mezclaba con el rosa. Todas las hojas entregadas antes de arreglarlo
estaban entre el **48 % y el 55 %**. Ahora `normalize.py` y `build_sheet.py` usan solo
NEAREST.

## El grano está en el dibujo, no en el escalado

Medido en `voltia/frames/voltia_stance_0.png` («grano» = píxeles cuyo color no aparece en
ninguno de sus 8 vecinos):

| | grano |
|---|---|
| nativo a 4× | **0,00 %** |
| el mismo, a 1× de arte (97 × 153) | **7,13 %** |

O sea: la rejilla 4× es perfecta, pero un nivel por debajo el dibujo ya trae color suelto.
**Ese color suelto es dibujo, no un fallo del proceso**, y por eso el modelo oficial no lo
toca: se entrega el nativo tal cual (`--filtros 0`).

## Pipeline oficial de Voltia

```bash
python3 tools/voltia_reconstruir.py
```

Por frame, cero LANCZOS:

1. **÷4 NEAREST** del nativo → 1× de arte (el píxel real del dibujo);
2. **×2 NEAREST** a la hoja, pegado alineado a par.

**Eso es todo.** Ni limpieza, ni islas, ni silueta, ni erosión: **0 filtros de
reconstrucción**. Los frames nativos son un ×4 exacto (0,00 % de bloques 4×4 no uniformes),
así que ÷4 NEAREST recupera el píxel original y el sprite es **el dibujo nativo tal cual**.

Comprobado frame a frame: los 102 frames de la hoja son **idénticos píxel a píxel** al nativo
÷4 (0 diferencias visibles; solo cambia el RGB de los píxeles con alfa 0, que no se ven).

### Lo que ya no se hace, y por qué

Las versiones anteriores pasaban tres filtros (masa local, islas de color, silueta de 1 px) y
luego comían 1 px de arte del contorno. Bajaban el «grano» medido de 7,13 % a 0,45 %, pero
**borraban dibujo**: el brillo del ojo, el tono de la nariz, la punta de la coleta y 949
píxeles del solo stance. Ese número bajo no era calidad, era detalle perdido. Se quedan en el
código detrás de `--filtros 1` solo para poder comparar; **el modelo oficial se hace con
`--filtros 0`**, que es el valor por defecto.

### Las medidas, sin maquillar

| stance a 1× de arte | nativo | con filtros (`--filtros 1`) | **oficial (0 filtros)** |
|---|---|---|---|
| «grano» (aislados) | 7,13 % | 0,45 % | **7,13 %** |
| islas de color ≤ 4 px | 876 | 115 | **876** |
| bloques 2×2 sucios | — | 0,00 % | **0,00 %** |
| colores opacos | 18 | 18 | **18** |
| píxeles inventados | — | 949 | **0** |

El «grano» de 7,13 % es del dibujo, no del proceso: a 4× es 0,00 % porque cada píxel de arte
ocupa un bloque 4×4. Referencia de arte real en el repo (Chun-Li, SF2): 2,85 %. Es decir,
Voltia dibuja más suelto que el arte original de SF2; eso solo se arregla redibujando el
nativo, no con filtros.

Tamaño medido del stance: **94 × 151 px de arte** (antes, con la erosión, 95 × 150).

## Prueba de reconstrucción por IA (2026-10-20)

Se le pasó la hoja a un modelo de imagen pidiendo la misma rejilla, las mismas poses y
colores planos. Resultado medido, no opinado:

| | original | IA · media hoja (1 312 × 1 079) | IA · bloque 4×4 (2 px por píxel de arte) | IA + paleta |
|---|---|---|---|---|
| colores distintos | **20** | 86 163 | 157 466 | **19** |
| colores con ≤ 20 px | **0** | 85 751 | 156 258 | **0** |
| transiciones suaves | 6,9 % | 91,7 % | 82,0 % | plano |
| rejilla | exacta | conservada | conservada | exacta |
| poses | las 25 | reconocibles | **inventadas** | inventadas |
| tamaño del sprite | 94 × 151 px de arte | ~40 × 65 px | 145 × 230 px | 145 × 230 px |

Conclusiones:
- La IA **no devuelve píxeles planos**: 86 000–157 000 colores y 82–92 % de transiciones
  suaves. Lo parece a tamaño pequeño, pero no lo es.
- Aplanar a la paleta sí funciona (`quantize` sin dither, cada píxel al color más cercano):
  19 colores, ninguna mezcla. Pero **aplanar no devuelve las poses**.
- A escala de media hoja pierde resolución (40 px por personaje): no sirve para recortar.
- A 2 px por píxel de arte sí es nítido, pero **redibuja** (la última fila pasa de caminar a
  correr). Habría que ir bloque a bloque y validar pose por pose, y aun así la IA decide.

Todo esto está en el visor: `preview/nuevo.html` (visor de frames + hoja de la IA).
El modelo oficial (`--filtros 0`) sigue intacto; la prueba vive en `voltia/nuevo/ia/`.

## Chun-Li

- Las **filas 1, 2 y 3 de la hoja original son el mismo stance**: van juntas en **una**
  animación, orden `1 → 2 → 1 → 3`, 10 + 6 + 10 + 7 = 33 figuras, se descarta **1** por ser
  el mismo píxel que la anterior en la costura 1→2 → **32 frames a 10 fps = 3,2 s**.
- El resto de filas (4–24) van **crudas**: todas las figuras, sin recortar ciclos.
- **22 animaciones** en total, no 24.
- **Altura**: se mide la tinta del stance y se escala a la de Voltia. La escala y el pivote
  los manda `sheet.json`, y `loadChar()` los sobrescribe al cargar: si se regenera la hoja,
  la ficha no se queda vieja.
- **Salto**: 176 px de mundo medidos con sonda; Voltia salta ~103. `jumpV -14.2`,
  `gravity 0.55`.
- **Filas de aire**: se ancla por centro de masa, no por los pies, o el salto tira.
- **Comandos**: fila 15 = ↓↘ + patada fuerte; patada aérea = fila 17; speed kick = fila 12
  con sus estelas dentro del frame; filas 22–23 = una sola animación de defensa + super.
- **Reloj**: 99 s (`ROUND_TIME`). **Cajas de golpe**: tecla **H** o botón en la pausa.

## Trampas que ya nos costaron una tarde

- **Caché**: un `?v=` escrito a mano en el HTML sirve JS viejo para siempre. El `rev` sale
  del **md5 de la hoja** y el servidor manda `no-store`.
- **Pivote y escala**: si están escritos a mano en la ficha, quedan viejos al regenerar la
  hoja. Los manda `sheet.json`.
- **`str.replace` de Python no falla** si el texto no coincide: no hace nada en silencio.
  Después de reescribir constantes, comprobar con `grep`.
- **Medir, no deducir**: la altura, el salto y el grosor del contorno se miden. Todas las
  veces que se dieron por supuestos, estaban mal.

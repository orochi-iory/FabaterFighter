# Laboratorio IA de Voltia (prueba aislada)

Abre `/creator/pruebas-ia/` para revisar las secuencias reconocibles de las nueve hojas de Voltia en un visor animado con selector, controles de reproducción y tira de cuadros. Este laboratorio está separado de la biblioteca oficial.

## Catálogo importado

Hay **50 secuencias de movimiento y 345 cuadros numerados**, más un extra estático de cuatro retratos. Las fases rotuladas por separado se mantienen separadas; por ejemplo, `JUMP (START)`, `JUMP (LOOP)` y `JUMP (LAND)`, así como `SPECIAL ATTACK (CHARGE)` y `SPECIAL ATTACK (RELEASE)`. Las hojas alternativas Part 5/6 y Part 6/6 se identifican por archivo y letra de lámina: no se mezclan sus diseños ni sus cuadros.

| Fuente | Secuencias | Cuadros de movimiento |
|---|---|---:|
| Parte 1/6 · `part-01-intro-crouch.png` | Intro (6), agachada (20); retratos (4, estáticos) | 26 |
| Parte 2/6 · `part-02-run-jump.png` | Run (8), Jump (7), Attacks (8), Electric Dash (6), Thunder Slam (7) | 36 |
| Parte 3/6 · `part-03-hit-fall-idle.png` | Hit (4), Knockdown (6), Get Up (7), Idle/Breathing (8), Taunt/Victory (6), Defeat (6) | 37 |
| Parte 4/6 · `part-04-jump-dash.png` | Jump Start (6), Jump Loop (6), Jump Land (6), Dash/Run (8), Dash Attack (6), Dash Stop (6) | 38 |
| Parte 5/6 · lámina A · `part-05-basic-attacks-fall.png` | Punch (8), Kick (8), Aerial Attack (6), Hurt (6), Knockdown (6), Get Up (8) | 42 |
| Parte 5/6 · lámina B · `part-05-jump-hurt.png` | Jump Attack (6), Air Dash (6), Hurt (6), Knockdown (6), Get Up (6), Idle Alt (6) | 36 |
| Parte 6/6 · lámina A · `part-06-dash-specials.png` | Dash/Run (8), Dash Attack (6), Energy Blast (8), Rising Upper (7), Aerial Slam (7), Taunt/Idle Alt (6), Victory (6) | 48 |
| Parte 6/6 · lámina B · `part-06-death-block-taunt.png` | Death (6), Charge (6), Release (6), Block (6), Taunt (6), Win Pose (6) | 36 |
| Parte 6/6 · lámina C · `part-06-specials-idle.png` | Special 1–4 (8 cada uno), Win Pose (6), Idle/Breathing (8) | 46 |

Los cuatro retratos de la parte 1 se ofrecen como una secuencia estática de inspección y no se cuentan como movimiento. En la hoja `part-01-intro-crouch.png`, el cuadro 4 de Intro tiene un recorte vertical especial; también se revisa un salto alto de la parte 2. En esos casos, una pequeña zona del número impreso se excluye solo del resultado procesado para probar el encuadre; no se toca el RGB del resto. Algunos efectos altos de la lámina 6/6 C se dejan visibles junto a la banda de números cuando se superponen, para que puedan valorarse en el visor.

## Fuentes y catálogo

- `fuentes/` guarda copias locales de los nueve PNG fuente; el visor solo las lee. No se sobrescriben, recortan ni recolorean en disco.
- `catalogo.json` registra el nombre de archivo, la suma SHA-256, la etiqueta original de cada animación, los rectángulos iniciales y, cuando la cabeza es visible, un punto `head` medido en coordenadas absolutas de la hoja. El campo `center` legado (posición aproximada de columna/rótulo) solo se usa como fallback o modo de comparación; **no se considera ancla**.
- Los límites de cada cuadro son una primera revisión visual, no un atlas final. Se arrastra la imagen fuente para mover el recorte (X/Y); ancho y alto se ajustan con sus controles. Las modificaciones de recorte, ancla y zonas de exclusión manual se guardan automáticamente en `localStorage` de este navegador; también hay botones para guardar ahora, descargar un respaldo JSON e importarlo después. El respaldo se comprueba contra la firma del catálogo y las nueve fuentes antes de aplicarse. Esto no escribe sobre PNG, `catalogo.json` ni la biblioteca oficial.

### Exclusión manual rectangular

En **Comparación del fotograma**, activa **Seleccionar zona a eliminar** y arrastra un rectángulo sobre **Fuente · recorte sin alterar**. La zona se marca en magenta y queda asociada solo al cuadro seleccionado; en **Procesado**, sus píxeles se ponen a alfa 0 sin alterar el RGB ni el PNG original. Puedes retirar la última zona con **Deshacer última zona** o limpiar todas las de ese cuadro con **Quitar zonas de este cuadro**. **Restaurar este cuadro** y **Restaurar toda la secuencia** también limpian sus exclusiones manuales. Las coordenadas se guardan en el respaldo JSON y se validan al importarlo; son metadatos de trabajo del laboratorio, no una exportación de imagen.

## Alineación por cabeza

El visor inicia con **cabeza/casco medido**: traslada cada recorte para que el punto de cabeza quede en la misma posición, sin cambiar su tamaño ni su proporción. De los 345 cuadros de movimiento, **336** tienen punto: 324 centroides de componentes de color del casco y 12 mediciones manuales revisadas para cascos pequeños, parcialmente ocultos o de otro color. Los otros **9** no muestran una cabeza medible (cinco cuadros de efectos sin personaje y cuatro poses con la cabeza oculta); conservan el encuadre previo por columna y el visor lo etiqueta como fallback. No se interpolan ni inventan pivotes.

La detección reutiliza la regla `es_casco` de `voltia/nuevo/creador/trocear.py` (componentes conexos de los píxeles de casco magenta) sobre cada recorte individual. En vez de imponer una altura fija —que falla en poses tumbadas— calcula el centroide de componentes compactos. El cabello magenta puede confundirse con el casco: se marcaron para revisión los candidatos con densidad menor que 0,22 o ancho superior a 30 px. Se revisaron **24 casos**: 14 se corrigieron usando otro componente compacto del casco, uno usó un componente pequeño visible, 6 se midieron manualmente y 3 quedaron como fallback porque solo se veía el cabello. Esos seis puntos, más otros seis medidos manualmente en la inspección individual, forman los **12 puntos manuales** indicados arriba. El marcador muestra el punto seleccionado y permite corregirlo en el visor. Estas técnicas solo pertenecen al catálogo de pruebas; no copian ni cambian anclas de la biblioteca oficial.

El marcador de inspección aparece en el recorte fuente, el procesado y el visor. Para corregirlo, haz clic en la cabeza del recorte fuente, escribe X/Y locales o arrastra la cruz amarilla en la vista previa de cuadros válidos; al soltar, el cuadro se recentra. El arrastre del recorte mueve X/Y, mientras ancho y alto se editan por separado. **Restaurar medición inicial** recupera el dato del catálogo y **Quitar punto** activa el fallback explícito. Las correcciones quedan guardadas en el trabajo local del laboratorio, sin alterar el catálogo base.

## Guardar y validar una animación

1. Ajusta el recorte/ancla de cada cuadro. El laboratorio guarda cada cambio automáticamente en el almacenamiento local del navegador; **Guardar cambios ahora** fuerza un guardado. Para conservar el trabajo fuera de ese navegador, usa **Descargar respaldo JSON**. **Importar respaldo JSON** lo restaura y reemplaza el trabajo local; solo acepta archivos del mismo catálogo y las mismas fuentes.
2. En la tira, selecciona cada cuadro y pulsa **Marcar cuadro actual como válido**. La marca queda visible como `✓ válido`; los cuadros sin marcar se excluyen de esta versión final. El orden original de la secuencia se conserva.
3. Comprueba la **Vista previa de los cuadros válidos** y pulsa **Validar animación completa**. Se guarda la selección validada y la fecha. Si después editas un cuadro o cambias cuáles están marcados como válidos, la animación vuelve a pendiente; se conserva la selección para que puedas revisarla y validarla otra vez.
4. Una vez validada, usa **Revisar en el Creador** para abrirla en una pestaña nueva. El panel del Creador lee la validación local y muestra la misma animación en su lienzo nativo, sin escalarla. Si ya tenías abierto el Creador mientras validabas, pulsa **Actualizar lista**.
5. Pulsa **Importar Nativo · sin escala · pendiente**. El navegador exporta solo los cuadros válidos alineados por sus puntos de cabeza medidos; la API local conserva las dimensiones y los colores visibles en `voltia/nuevo/creador/pruebas-ia-pendientes/<lote>/`, sin escalar ni recolorear. Es una bandeja Nativa separada —no se inserta en `sprites/`, porque su lienzo puede diferir del movimiento existente— y tampoco toca `oficial/` ni el modelo del juego. El lote y cada cuadro quedan en estado `pendiente`; repetir la misma petición no sobrescribe ni duplica el lote.
6. Revisa otra vez la secuencia nativa completa y pulsa **Aprobar animación en el Creador**. La segunda aprobación queda guardada en el lote local del Creador y ligada a la validación exacta. Si editas o vuelves a validar la secuencia, se crea una versión nativa pendiente nueva y hay que revisarla otra vez.
7. Solo tras esa aprobación se habilita **Preparar candidatos 96×152 · pendientes**. Es una acción separada: la API local lee los PNG nativos guardados y aplica la reducción uniforme del proceso existente de `voltia/nuevo/creador/encajar.py` (LANCZOS con alfa premultiplicado para evitar halos de RGB transparente, lienzo 96×152 y referencias de cabeza/pies del perfil). Si algún cuadro no tiene una cabeza medida dentro del recorte, la conversión se bloquea; no se inventa un ancla. Los nuevos PNG se agregan como `pendiente` a la biblioteca de trabajo del Creador bajo el movimiento elegido. No se sobrescribe ningún cuadro ni se modifica `voltia/sheet_uniform.png`, `voltia/sheet.json`, las fuentes ni los datos del juego.
8. En la biblioteca del Creador, selecciona los candidatos de Pruebas IA, revísalos y pulsa **Aprobar**. Mientras sigan pendientes no se pueden añadir a la secuencia ni con clic ni con «Cargar orden disponible». Después usa **Añadir aprobados de Pruebas IA a la secuencia** y, si el orden queda bien, **Guardar animación** exporta una tira PNG y un manifiesto JSON con la procedencia. Ese guardado final descarga archivos; no escribe la hoja oficial del juego.

Cada panel de Pruebas IA se puede plegar desde su encabezado; la hoja fuente y el alcance/máscara empiezan plegados. La validación del laboratorio no genera archivos por sí sola; solo **Importar Nativo** escribe los PNG en la bandeja local separada y pendiente. La aprobación del Creador y la conversión son acciones explícitas, y los candidatos oficiales siguen fuera de la animación del juego hasta que se integren manualmente. Los retratos estáticos no participan en este flujo.

## Máscara de fondo

El visor empieza con el umbral **10**, como base aceptada para revisión. El modo seguro considera casi negro un píxel cuyo máximo entre R, G y B no supera el umbral; solo elimina por alfa los píxeles que estén conectados al borde del recorte con vecindad de ocho píxeles. El RGB original de todo lo que se conserva permanece intacto. Se aceptan por ahora pequeños residuos o píxeles transparentes en los contornos para poder valorar el efecto en el visor antes de hacer ajustes adicionales.

El modo `Umbral global` se mantiene como diagnóstico destructivo y puede borrar tonos oscuros del personaje. El respaldo JSON contiene solo metadatos de recorte, anclas y validación. No se guarda ninguna imagen al validar en el laboratorio. Al pulsar **Importar Nativo**, los PNG se transmiten únicamente al servidor local `tools/serve.py` y se escriben en la bandeja ignorada de revisión; solo tras la aprobación del Creador se leen para crear candidatos oficiales pendientes. No se llaman servicios externos.

## Visor y navegación

- Reproducción, pausa, cuadro anterior/siguiente, velocidad, fondo de contraste y ampliación entera de 1×–4×.
- Mientras arranca el visor hay un cuadro de respaldo tomado directamente del PNG; si ocurre un error de carga o de JavaScript, el mensaje se muestra junto a los controles.
- El escalado de pantalla usa valores enteros y renderizado pixelado; las tiras largas tienen desplazamiento horizontal y el diseño móvil usa una columna.
- La navegación conserva enlaces al juego y a las páginas existentes del creador.
- Para revisar el laboratorio de forma aislada, sirve el repositorio desde un servidor estático y abre `/creator/pruebas-ia/`. Para usar la bandeja Nativa, la aprobación del Creador y la conversión separada, inicia la API con `python3 tools/serve.py --puerto 8000` (con Pillow instalado según `tools/requirements.txt`) y abre `/creator/` desde ese mismo origen; el servidor estático por sí solo no implementa esas operaciones.

# Candado de estilo — VOLTIA (obligatorio en cada generación)

## Ancla única
- `voltia/frames/voltia_stance_0.png` — único referente de identidad.
- Como máximo, UN segundo frame de la hoja como referencia de POSE, o un
  recorte ampliado del ancla para fijar un detalle (misma imagen: no
  promedia). `voltia/ref_torso.png` fija el rayo gordo.
- **Prohibido**: el arte conceptual como referencia (arrastra al estilo
  "bonito" de presentación y rompe la hoja). Prohibido promediar 3+ refs.

## Bloque de identidad (literal en cada prompt)
> masked luchadora with full-face magenta mask with teal eye patches,
> extremely long thick violet ponytail flowing behind, teal bodysuit with
> a LARGE FAT chunky zigzag yellow lightning bolt across the chest and
> thin gold belt, bare arms, long dark-navy gauntlet gloves, dark-navy
> boots with knee pads. Slender, about seven heads tall.

## Bloque de estilo (literal en cada prompt)
> Pixel-art fighting-game sprite in the EXACT style of the reference
> frame: chunky large pixels, simple bold shapes, minimal detail, thick
> dark outlines, FLAT solid color fills, absolutely no gradients or
> blended shading, at most one hard-edged shadow shape per area, no fine
> detail.

## Reglas de hoja completa (canon v2 — VIGENTE)
Una animacion NO se genera en tiras: se genera una **hoja completa en UNA
sola imagen** para que la coherencia se mantenga entre todos los frames.

- Rejilla: **8 columnas x 5 filas (40 celdas)**. Cada celda = un frame.
- Fondo: verde puro `#00FF00` en TODO el lienzo.
- Gutters: **hueco verde amplio entre celdas, en horizontal Y en vertical**
  (al menos media figura). Sin sombra de suelo ni linea de suelo: cada
  figura flota en verde. Nada toca el borde de su celda.
- Orden: **lectura (izq->der, arriba->abajo)**; el frame 1 va arriba-izq.
  El layout vive en `voltia/sheets.json` y el prompt se **genera** con
  `python3 voltia/gen_sheet.py <hoja>` (nunca a mano: una descripcion
  pegada de otra animacion arruino el lote 2 fuerte).
- El rayo amarillo gordo del pecho **en todas las celdas, sin excepcion**.
- Alineacion que hace el modelo (medida): los **pies en el borde inferior de
  la celda** (hueco 0-2 px); las figuras aereas se quedan flotando. Por eso
  el frame conserva el alto completo de la celda y solo se recorta en
  horizontal: la linea de suelo es comun y los saltos siguen en el aire.
- Limite medido del modelo: **~1,06 Mpx por imagen** (1584x672 / 672x1584).
  Con 40 celdas sale la figura a ~150 px, que es la nueva altura de pie.

Pipeline (determinista, sin heuristica de separacion de figuras):
1. `python3 voltia/fit_grid.py voltia/raw/sheet_<hoja>_cN.png --out voltia/cells/<...>`
   corta por gutters (o `--cols/--rows --uniform`).
2. `python3 voltia/install_sheet.py <hoja> --variant cN` -> informe QA.
3. `... --apply` instala en `voltia/frames/` (chroma + paleta congelada +
   escala unica de hoja).
4. `python3 voltia/build_sheet.py --from-frames` recompone hoja y preview.

## Reglas de tira (LEGADO: solo para las animaciones aun no pasadas a hoja)
- Panorámica apaisada explícita; EXACTAMENTE N figuras en UNA fila
  (una por tiempo descrito: N tiempos = N figuras, ni una más ni una
  menos); separadas por GRANDES huecos verdes vacíos (medio cuerpo
  mínimo; las siluetas jamás se tocan entre sí); todas sobre la MISMA
  línea de suelo; figura ≤2/3 del alto + 40 px de margen; extremidades
  contenidas.
- Fondo: verde puro plano y uniforme #00FF00 en TODO el lienzo de
  borde a borde, completamente liso, sin nada más.
- Planitud radical: cada zona de color es UN solo tono plano (sin
  degradados ni sombreados suaves de ningún tipo); sombras solo como
  formas duras contadas.
- Dirección: Voltia mira y golpea hacia la DERECHA.
- Jamás prohibir "grid" en negativo (efecto contrario).

## Protocolo de lote numerado
1. Generar 3 variantes (`<tira>_c1/c2/c3.png`) con el prompt candado.
2. Hoja de contacto numerada: ancla + TODOS los frames de cada
   candidata (los recortes f1/medio/fin esconden rebanados).
   Juzgar SIEMPRE la comparación NORMALIZADA (a tamaño de juego),
   nunca el raw: el detalle fino funde al normalizar.
3. El usuario elige número (o ninguna). Solo la elegida se instala.
4. Las perdedoras se borran antes del commit.

## Historial de lotes
- `kick_weak_stand` lote 2 C1 (elegida; QA OK head).
- `crouch_punch` lote 1 C1 (elegida).
- `jump_kick` lote 1 C2 (elegida).
- Lote 1 fuerte 0/3 (conteos, fondos exóticos, rebanados).
- Lote 2 fuerte 0/3 (mecánica 6/9 OK; estilo/acción rechazados).

- **Hoja `golpes` C2 instalada** (38 frames en una imagen: punch_weak,
  punch_strong, kick_weak, kick_weak_stand, kick_strong, crouch_punch,
  jump_kick, uppercut, spinkick). Rejilla 8x5 detectada limpia; rayo
  presente en las 38; orden de lectura verificado por alturas (patada baja
  agachada 124/114/111 px-arte, uppercut 122->152). C1 descartada: figuras
  empaquetadas sin gutters, imposible de cortar.

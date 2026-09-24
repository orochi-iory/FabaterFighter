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

## Reglas de tira
- Panorámica apaisada explícita; EXACTAMENTE N figuras en UNA fila;
  todas sobre la MISMA línea de suelo; figura ≤2/3 del alto + 40 px
  de margen; extremidades contenidas; fondo verde plano #00FF00.
- Dirección: Voltia mira y golpea hacia la DERECHA.
- Jamás prohibir "grid" en negativo (efecto contrario).

## Protocolo de lote numerado
1. Generar 3 variantes (`<tira>_c1/c2/c3.png`) con el prompt candado.
2. Hoja de contacto numerada: ancla + tira actual + candidatas.
   Juzgar SIEMPRE la comparación NORMALIZADA (a tamaño de juego),
   nunca el raw: el detalle fino funde al normalizar.
3. El usuario elige número (o ninguna). Solo la elegida se instala.
4. Las perdedoras se borran antes del commit.

## Validado en
- `kick_weak_stand` lote 2 C1 (elegida por usuario; QA OK head).
- `crouch_punch` lote 1 C1 (elegida por usuario).
- `jump_kick` lote 1 C2 (elegida por usuario).

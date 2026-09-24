# FabaterFighter

Juego de peleas 2D. Primer personaje jugable: **VOLTIA**, la luchadora voltaje. ⚡🦹‍♀️

![Concepto de Voltia](assets/voltia_concept.png)

## Sprites de Voltia (canon v1.2)

- Arte generada por IA y normalizada: de pie **~160 px-arte**, cabeza **23 px**,
  paleta congelada de **49 tintas**, rampas fijas de **3 tonos** por material.
- Hoja uniforme: `voltia/sheet_uniform.png` + `voltia/sheet.json` (fila, nº de
  frames, fps y loop por animación; incluye `version`, `canon` y `notes`).
- Frames sueltos 4x: `voltia/frames/voltia_<anim>_<n>.png`.
- Reglas de coherencia: `voltia/SPRITE_RULES.md`. Versión actual: `voltia/VERSION`.

### Movimientos incluidos (9 de 25)

| # | Animación | Frames | FPS | Loop |
|---|-----------|--------|-----|------|
| 01 | Stance | 15 | 10 | sí |
| 02 | Walking | 6 | 10 | sí |
| 03 | Jump | 4 | 9 | no |
| 04 | Forward Jump | 4 | 9 | no |
| 05 | Crouch | 3 | 8 | sí |
| 06 | Blocking | 2 | 8 | sí |
| 07 | Weak Punch | 3 | 14 | no |
| 08 | Weak Kick | 3 | 13 | no |
| 09 | Dash | 3 | 14 | sí |

### Visor animado (con versiones)

Sirve la raíz (`python3 -m http.server` en la raíz y visita `/preview/`) para
ver cada animación, cambiar la escala (1x/2x/4x de arte) y comprobar
transparencia y chroma (fondos magenta y verde). La cabecera muestra la
**versión** (v0.2.0), el canon y el contenido incluido; cada lote nuevo sube
versión en `voltia/VERSION` y regenera la hoja.

### Regenerar / modificar

```bash
pip install pillow
python3 voltia/analyze.py --freeze   # (re)congela el canon en spec.json
python3 voltia/build_sheet.py        # QA + normaliza + hojas + JSON del visor
```

Toda tira nueva pasa la puerta QA (`voltia/SPRITE_RULES.md` §4) antes de
entrar en la hoja. El generador procedural antiguo (`tools/`,
`assets/voltia_spritesheet.*`) está obsoleto: de `assets/` solo se conserva
`voltia_concept.png` como referencia de diseño.

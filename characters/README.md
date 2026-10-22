# Organización del plantel

`characters/roster.json` es el registro de las fichas públicas que consume `preview/personajes.html` y la configuración de perfiles del creador. Para añadir una tarjeta, añade una entrada con `id`, nombre, retrato, descripción y acciones; no hace falta copiar ni editar la plantilla HTML. Cada retrato vive en `characters/<id>/portrait.png`.

## Límites actuales entre código y datos

- `creator/` contiene la interfaz; `tools/` contiene el servidor y sus operaciones.
- `preview/fight.js` es el motor; `preview/chars/*.js` contiene solo las fichas de combate que el motor carga.
- `characters/roster.json` contiene metadatos de presentación y perfiles independientes de datos para Voltia y Chun-Li. El selector del creador usa esos perfiles.
- Las nuevas subidas de Chun-Li van a `characters/chunli/creator/`; las de Voltia continúan en su banco editable existente.
- Se conservan las hojas históricas en sus rutas originales: Voltia en `voltia/` y la hoja de Chun-Li en `voltia/nuevo/chunli/`. `voltia/sheet_uniform.png` no se mueve ni se escribe.

Así se separan la interfaz, el motor, las fichas de combate, el catálogo público, los retratos y los bancos editables sin duplicar hojas originales ni romper herramientas existentes. Una entrada nueva en el registro crea una tarjeta pública; para que el personaje sea jugable hacen falta además su ficha de combate y los recursos/mediciones correspondientes.

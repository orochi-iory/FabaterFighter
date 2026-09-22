# FABATER FIGHTER

Juego de lucha 1 contra 1 en **Three.js**, sin assets externos: los luchadores, el escenario,
los retratos y el sonido se generan por código. La mecánica replica dos referencias concretas:

- **Street Fighter III** → el **parry** como defensa activa (y el *red parry* saliendo del blockstun).
- **The King of Fighters '98** → la **barra de power de 3 stocks**, el **modo MAX** y el
  **Guard Cancel Roll**.

---

## Puesta en marcha

```bash
npm install      # solo instala jsdom (devDep para los tests)
npm start        # http://localhost:8080
npm test         # 51 tests (lógica + render/UI + arranque completo)
```

No hace falta compilar nada: `index.html` carga módulos ES nativos y Three.js va
*vendored* en `vendor/three.module.min.js` (r169). También sirve cualquier servidor estático.

## Controles

| Acción | Jugador 1 | Jugador 2 | Gamepad |
|---|---|---|---|
| Moverse / saltar / agacharse | `W A S D` | Flechas | Cruceta / stick |
| LP · LK · HP · HK | `J` `K` `L` `;` | `7 8 9 0` (o Numpad 1-4) | A B X Y |
| Especial 1 / Especial 2 | `U` / `I` | `-` / `=` | RB / RT |
| SUPER (gasta 1 stock) | `O` | `\` | START+ |
| Modo MAX (gasta 1 stock) | `P` | `Backspace` | LT |
| Guard Cancel Roll (bloqueando) | `[` | `` ` `` | LB |
| Parry alto / bajo | tap `→` / tap `↓` | tap `→` / tap `↓` | tap cruceta |
| Dash / backdash | `→ →` / `← ←` | igual | doble tap |
| Pausa / lista de golpes / hitboxes | `Esc` / `F1` / `F2` | igual | Start |

**Notación de comandos** (numpad, relativa al luchador): `236P` = cuarto de vuelta adelante +
puño, `623P` = *shoryuken*, `214K`, `63214P` = command grab, `4~6P` = carga, `236236P` = super.
Los botones `SP1`/`SP2` son atajos "modernos" que lanzan directamente el especial nº1/nº2
(útiles con gamepad o táctil); si haces el motion completo, **el motion tiene prioridad**.

En móvil aparecen controles táctiles (`#touch` en `index.html`).

## Sistemas

### Barra de power (KOF '98, modo Advanced)

Hasta **3 stocks** (◆◆◆). Se carga:

- **restando vida al rival** — el medidor sube en proporción al daño que haces;
- **bloqueando** — cada golpe defendido (y el chip recibido) alimenta la barra;
- ejecutando especiales, haciendo parry (`PARRY_METER`) y recibiendo daño.

Un stock compra:

| Gasto | Efecto |
|---|---|
| **SUPER** | Especial de nivel SU con flash cinematográfico y cámara cerrada. |
| **Modo MAX** (tecla MAX) | ~20 s: +25 % de daño, más empuje y aura. Mientras dura, los normales ya no dan barra. |
| **Guard Cancel Roll** (LP+LK o GC bloqueando) | Cancela el blockstun con un rodaje invulnerable hacia atrás. |

La barra **no se pierde entre rondas**, como en KOF '98.

### Parry (Street Fighter III)

| | Ventana | Enfriamiento |
|---|---|---|
| Parry alto/medio (tap adelante) | 10 f (6 f si mantienes la dirección) | 23 f |
| Parry bajo (tap abajo) | 10 f | 23 f |
| Parry aéreo | 7 f | 20 f |
| Red parry (durante el blockstun) | 3 f | — |

El parry congela a ambos 16 f (el atacante añade +4/+3/+2/+0 según el nivel del golpe),
**no hace chip**, da medidor, reinicia el contador de juggle y la escala de daño, y cancela
el blockstun. Los lanzamientos no se pueden parar.

### Resto del motor

- **Best of 3**, 99 segundos por ronda, doble KO y *time over* por vida restante.
- Frame data completo: `startup → active → recovery`, hitstun/blockstun por nivel,
  hitstop, ventajas reales y *whiff punish*.
- **Stun/mareo** (barra bajo la vida), **guard crush**, **juggle** con puntos y
  **escala de daño** hasta un mínimo del 15 %.
- Lanzamientos con *tech* en 9 f, invulnerabilidad de 5 f al levantarse.
- Overheads, golpes bajos, proyectiles reflejables, armadura, contra-golpes y
  daño continuo (*burn*) según el luchador.
- Modo **Entrenamiento** (el muñeco no muere) y modo **2 jugadores** local.

## Roster (10 luchadores)

### KENJI ARASHI — *Arashi-Ryu Karate* (Equilibrado / Shotokan)
> Heredero de un dojo centenario. Busca al guerrero que derrotó a su maestro.

- **Especiales:** `236P` Seiken Ha · `623P` Shouryuu Ken · `214K` Tatsumaki Geri
- **SUPER:** `236236P` Arashi Senretsu Ken
- **Perfil:** vida 1000 · potencia ×1 · defensa ×1 · velocidad ×1 · alcance ×1 · peso ×1

### VALERIA SANTIAGO — *Capoeira de Combate* (Rushdown / Velocidad)
> Bailarina y luchadora callejera. Nadie ha visto dos veces su mismo paso.

- **Especiales:** `214K` Thunder Heel · `236K` Cyclone Fan · `214K` Talon Dive
- **SUPER:** `2363214K` Danza del Huracán
- **Perfil:** vida 900 · potencia ×0.9 · defensa ×0.9 · velocidad ×1.16 · alcance ×1.02 · peso ×0.9

### BRUTUS KANE — *Wrestling de Demolición* (Grappler / Armadura)
> Ex minero. Levanta vagones por diversión y abraza a la gente hasta que cruje.

- **Especiales:** `63214P` Titan Suplex · `22P` Meteor Press · `41236P` Iron Lariat
- **SUPER:** `6321463214P` Atomic Piledriver
- **Perfil:** vida 1180 · potencia ×1.24 · defensa ×1.22 · velocidad ×0.82 · alcance ×1.02 · peso ×1.3

### KAGEROU — *Ninjutsu Iga-Ryu* (Mixup / Teletransporte)
> Nadie conoce su rostro. Sus víctimas tampoco llegaron a verlo.

- **Especiales:** `236K` Shadow Step · `214P` Kunai Flurry · `623K` Crescent Fang
- **SUPER:** `2141236P` Phantom Requiem
- **Perfil:** vida 880 · potencia ×0.86 · defensa ×0.88 · velocidad ×1.22 · alcance ×0.94 · peso ×0.85

### MAGNUS VOSS — *Yoga de Combate* (Zoner / Largo alcance)
> Un experimento genético salió mal. Ahora su cuerpo es una cuerda letal.

- **Especiales:** `236P` Elastic Fist · `214P` Inferno Breath · `22K` Blink Shift
- **SUPER:** `236236P` Infinite Reach
- **Perfil:** vida 920 · potencia ×1.05 · defensa ×1 · velocidad ×0.9 · alcance ×1.55 · peso ×1

### REX COLTON — *Combate Táctico "Blade"* (Charge / Zoner defensivo)
> Sargento retirado. Sus "hojas sónicas" todavía están clasificadas.

- **Especiales:** `4~6P` Sonic Blade · `2~8K` Flash Kick · `4~6K` Bayonet Rush
- **SUPER:** `4123641236P` Double Sonic Blade
- **Perfil:** vida 1020 · potencia ×1.06 · defensa ×1.1 · velocidad ×0.94 · alcance ×1.06 · peso ×1.1

### ORION VEX — *Kagutsuchi Kenpo* (Rushdown / Rekka / Quemadura)
> Quemó su propio dojo para sentir algo. Todavía lo está buscando.

- **Especiales:** `236P` Ember Fist I · `—undefined` Ember Fist II · `—undefined` Ember Fist III · `623P` Rising Cinder · `214P` Blaze Spiral I · `—undefined` Blaze Spiral II
- **SUPER:** `2141236P` Inferno Requiem
- **Perfil:** vida 980 · potencia ×1.08 · defensa ×0.98 · velocidad ×1.06 · alcance ×1 · peso ×1

### SERA LUMEN — *Psicokinesis Aplicada* (Zoner / Reflector)
> Vio el futuro una vez y decidió que no le gustaba. Ahora lo reescribe a golpes.

- **Especiales:** `236P` Psycho Ball · `623K` Psycho Sword · `214P` Prism Reflector · `22K` Levitate
- **SUPER:** `2363214P` Shining Psychic Burst
- **Perfil:** vida 880 · potencia ×0.92 · defensa ×0.92 · velocidad ×1.04 · alcance ×0.96 · peso ×0.88

### GORAN MILOV — *Pankration Pesado* (Peso pesado / Quake)
> Dicen que causó un seísmo al aterrizar. Él dice que solo fue un paso.

- **Especiales:** `28K` Tectonic Stomp · `63214P` Boulder Rush · `214P` Anvil Hammer
- **SUPER:** `6321463214P` Continental Split
- **Perfil:** vida 1240 · potencia ×1.32 · defensa ×1.3 · velocidad ×0.76 · alcance ×1.05 · peso ×1.4

### VESPER LYNX — *Kickboxing Voltaico* (Rushdown aéreo / Eléctrica)
> Campeona de kickboxing y pararrayos humano. Nunca usa protección.

- **Especiales:** `236P` Volt Bolt · `236K` Thunder Dive · `214P` Static Field
- **SUPER:** `2141236K` Plasma Storm
- **Perfil:** vida 940 · potencia ×0.98 · defensa ×0.94 · velocidad ×1.14 · alcance ×1 · peso ×0.92

---

## Animación y modelado

Los personajes **no están animados a mano**: se mueven con captura de movimiento real.

**Datos.** 31 clips del [CMU Motion Capture Database](http://mocap.cs.cmu.edu/) —
puñetazos, patadas, bloqueos, caídas, caminar, correr, saltar y reverencias — descargados
en BVH con `tools/fetch-mocap.sh` y horneados a `src/data/anims.js` (422 KB) con
`tools/build-anim.mjs`, que recorta cada acción por picos de velocidad, remuestrea de
120 a 60 fps, descarta los dedos y cuantiza rotaciones a Int16.

**Retargeting.** Del mocap solo se aprovechan las **rotaciones**; las longitudes de hueso
las pone `src/anim/skeleton-def.js` (esqueleto humano de 1.75 m con proporciones reales:
cadera al 54 % de la altura, envergadura ≈ altura). Como el actor capturado tiene otras
proporciones, la raíz no se copia tal cual: se guarda solo la variación de altura de
cadera, reescalada a la longitud de pierna de cada luchador. Por eso Brutus (piernas
cortas y 1.5 de corpulencia) apoya los pies en el suelo igual que Sera (1.71 m).

**Sincronización.** El fotograma de mayor velocidad de mano/pie de cada captura es el
impacto, y el juego lo hace coincidir **exactamente** con el primer fotograma activo del
golpe. Un golpe de 6 frames de arranque acelera el armado; uno de 14 lo alarga. Así la
animación nunca miente sobre cuándo pega el golpe.

**Modelo.** Un único `SkinnedMesh` por luchador (`src/render/humanoid.js`): torso loftado
con perfil anatómico (pelvis, cintura, caja torácica, trapecios, pectorales), extremidades
con bíceps y gemelos, puños, cara con mandíbula, nariz, orejas y ojos, más pelo y
accesorios (cinta, barba, turbante, visera, pañuelo) según el personaje. Al estar
skinneado, codos, rodillas y cintura se doblan de forma continua.

**Capas procedurales** por encima del mocap (`src/render/rig.js`):
- **Guardia con IK analítico de dos huesos** (ley de los cosenos): las manos suben a la
  cara y se mezclan con la posición capturada, sin saltos.
- **Mirada al rival**, respiración, balanceo de peso y retroceso al recibir.
- **Física de pelo y pañuelo** arrastrada por la velocidad.
- Corrección de suelo para que los pies no atraviesen la tarima.

## Arquitectura

```
index.html / styles.css        shell de la app + estilos arcade
vendor/three.module.min.js     Three.js r169 (vendored, sin CDN)
tools/serve.js                 servidor estático de 0 dependencias
tools/fetch-mocap.sh           descarga los BVH de CMU (solo para regenerar anims)
tools/build-anim.mjs           BVH -> src/data/anims.js
src/
  game/      constants · input · fighter · match · ai      (motor puro, sin DOM ni Three)
  data/      moves · roster · anims                        (frame data, personajes, anim)
  anim/      skeleton-def · clip · library                 (esqueleto, muestreo, qué clip toca)
  render/    humanoid · rig · stage · fx · renderer        (malla skinneada + IK + escenario)
  ui/        hud · screens · portrait                      (DOM + canvas 2D)
  audio/     sfx                                           (síntesis WebAudio)
  main.js    bucle a 60 Hz fijos con acumulador y cámara lenta en el KO
test/        logic · render · boot                         (node:test + jsdom)
```

El motor (`src/game/`) no conoce el DOM: `Match.step(input1, input2)` avanza un frame y
devuelve eventos que la capa visual traduce a partículas, sonido y HUD. Eso permite simular
combates completos en Node (los tests juegan los 100 cruces del roster sin errores).

## Tests

```bash
npm test
```

- `test/logic.test.js` — frame data, comandos, parry, guard, stocks/MAX, lanzamientos, rondas, IA.
- `test/render.test.js` — rigs de los 10 luchadores, escenario, FX, `GameView` con un
  renderer inyectado, HUD, pantallas y retratos.
- `test/boot.test.js` — arranca `main.js` completo sobre jsdom con un contexto WebGL
  simulado, navega los menús, juega un combate entero y verifica que el teclado llega
  al luchador (incluido un `236P` real).

Los shaders y el `WebGLRenderer` real no se ejercitan en CI (no hay GPU ni navegador aquí):
esa parte se valida abriendo la app.

## Créditos de los datos de movimiento

> The data used in this project was obtained from mocap.cs.cmu.edu.
> The database was created with funding from NSF EIA-0196217.

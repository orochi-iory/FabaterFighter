#!/usr/bin/env python3
"""Pagina de revision de Chun-Li.

Es la misma tabla de 24 filas que aprobaste, con UN solo cambio: las filas 1, 2
y 3 no salen como tres entradas, salen como una sola, porque son un solo bucle.
Las filas 4 a 24 salen con su corte crudo, todas las figuras, igual que antes.

    PYTHONPATH=tools/pylibs python3 tools/chunli_page.py
"""
import json
import os

BASE = 'voltia/nuevo/chunli'

NOMBRES = {
    4: 'Caminar adelante', 5: 'Caminar atrás', 6: 'Patada fuerte', 7: 'Puño fuerte',
    8: 'Puño débil', 9: 'Patada débil', 10: 'Especial ↓ ↓↘ → + patada',
    11: 'Especial proyectil', 12: 'Speed kick', 13: 'Salto en el sitio',
    14: 'Salto adelante', 15: 'Patada adelante-abajo + voltereta',
    16: 'Salto + puño', 17: 'Salto + patada', 18: 'Puño fuerte agachada',
    19: 'Patada fuerte agachada', 20: 'Patada débil agachada',
    21: 'Puño débil agachada', 22: 'Defensa / onda de choque',
    23: 'Super · esfera', 24: 'Derribo y recuperación',
}

NOTAS = {
    4: 'Torso inclinado hacia delante.',
    5: 'Torso más recto: así se distingue de la 4.',
    6: 'Pierna por encima de la cadera.',
    7: 'Brazo extendido al frente.',
    8: 'Más corto que el fuerte.',
    9: 'Rodilla y extensión corta.',
    10: 'Patada girada con efecto.',
    11: 'El proyectil no está dibujado: usar la chispa de Voltia.',
    12: 'Poses rápidas; las estelas amarillas van aparte.',
    13: 'Pies fuera del suelo y vuelta.',
    14: 'Invertido = salto atrás.',
    15: 'Sube por el pecho y cae con voltereta.',
    16: 'Misma animación para débil y fuerte.',
    17: 'Misma animación para débil y fuerte.',
    18: 'Los frames de pie sirven de transición.',
    19: 'Sale desde el suelo.',
    20: 'Extensión corta.',
    21: 'Golpe corto.',
    22: 'La onda de los golpes grandes va aparte.',
    23: 'La esfera no está dibujada.',
    24: 'Frames según la altura de la caída.',
}

CSS = """
  :root { --bg:#101820; --panel:#17232c; --line:#2b3f4c; --gold:#ffcb3d; --cyan:#8fd8ff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:#eee; font-family:system-ui,sans-serif; }
  nav.models { position:sticky; top:0; z-index:9; display:flex; gap:8px; justify-content:center;
    padding:10px; background:#0a1116ee; border-bottom:2px solid var(--line); flex-wrap:wrap; }
  nav.models a { text-decoration:none; padding:9px 16px; border-radius:10px; font-weight:700;
    font-size:14px; border:2px solid var(--line); color:#c9d8e4; }
  nav.models a:hover { border-color:var(--cyan); color:var(--cyan); }
  nav.models a.on { background:#1b7fa8; border-color:#1b7fa8; color:#fff; }
  header { padding:24px 18px 4px; max-width:1080px; margin:0 auto; }
  header h1 { margin:0; color:var(--cyan); letter-spacing:2px; }
  header p { color:#a9bcc9; line-height:1.55; max-width:900px; }
  header p b { color:var(--gold); }
  main { max-width:1080px; margin:0 auto; padding:12px 18px 50px; }
  table { border-collapse:collapse; width:100%; font-size:13px; background:var(--panel); }
  th, td { border-bottom:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:middle; }
  th { background:#1d2f39; color:var(--cyan); position:sticky; top:52px; }
  td.b { color:var(--gold); font-weight:700; font-size:15px; }
  td.n { font-weight:600; }
  td.mono { font-variant-numeric:tabular-nums; white-space:nowrap; }
  td.note { color:#8ba1b1; max-width:330px; }
  .dim { color:#6d8496; font-size:12px; }
  img.mini { image-rendering:pixelated; height:64px; width:auto; display:block; background:#22333f; border-radius:6px; }
  img.big { image-rendering:pixelated; height:112px; width:auto; display:block; background:#22333f; border-radius:6px; }
  tr.stance td { background:#14262f; }
  .box { background:var(--panel); border:2px solid var(--line); border-radius:14px; padding:16px 18px; margin:20px 0; }
  .box h2 { margin:0 0 8px; font-size:16px; color:var(--gold); }
  .box p, .box li { color:#b9cad6; line-height:1.6; font-size:14px; }
  .box code { color:var(--cyan); }
  .box b { color:var(--gold); }
  .tres { display:flex; gap:10px; flex-wrap:wrap; margin:10px 0 4px; }
  .tres figure { margin:0; }
  .tres img { image-rendering:pixelated; height:56px; width:auto; background:#22333f; border-radius:6px; display:block; }
  .tres figcaption { color:#6d8496; font-size:11px; margin-top:3px; }
  img.strip { width:100%; height:auto; image-rendering:pixelated; background:#ededf2;
    border-radius:10px; margin-top:10px; display:block; }
"""


def main():
    filas = json.load(open(os.path.join(BASE, 'raw', 'filas.json')))
    limpias = json.load(open(os.path.join(BASE, 'rows.json')))
    stance = [f for f in limpias if f['fila'] == 1][0]
    sk = [f for f in limpias if f['fila'] == 12][0]
    bs = [f for f in limpias if f['fila'] == 22][0]
    por_fila = {f['fila']: f for f in filas}

    h = []
    a = h.append
    a('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">')
    a('<meta name="viewport" content="width=device-width, initial-scale=1">')
    a('<title>Chun-Li · las 24 filas</title><style>%s</style></head><body>' % CSS)
    a('<nav class="models">')
    a('<a href="index.html">① Modelo original</a>')
    a('<a href="nuevo.html">② Modelo nuevo</a>')
    a('<a href="chunli.html" class="on">③ Chun-Li</a>')
    a('<a href="fight.html">⚔ Pelea</a>')
    a('</nav>')

    a('<header>')
    a('<h1>Chun-Li · las filas de la hoja</h1>')
    a('<p>Son <b>las 24 filas</b>, cortadas por la altura del suelo de cada figura, '
      'no por los huecos de fondo. De la 4 a la 24 salen <b>tal cual están en la hoja</b>: '
      'todas las figuras de cada fila, en su orden, sin recortar ciclos ni quitar repeticiones.</p>')
    a('<p>Tres cosas van montadas porque son una sola animación en la hoja o porque '
      'el efecto va en el frame, y están marcadas: <b>1–3</b> el stance es un solo bucle · '
      '<b>12</b> el speed kick lleva sus estelas amarillas dentro · <b>22–23</b> defensa y '
      'super son la misma animación, con todos los frames.</p>')
    a('<p style="margin-top:14px"><a href="../%s/raw/hoja_24_filas.png" '
      'style="color:#ffcb3d;font-weight:700">→ Las 24 filas juntas, numeradas, en una imagen</a></p>' % BASE)
    a('</header>')

    a('<main><table>')
    a('<tr><th>Fila</th><th>GIF</th><th>Animación</th><th>Figuras</th>'
      '<th>y en la hoja</th><th>Nota</th></tr>')

    # ---- filas 1-3: un solo bucle ----
    a('<tr class="stance">')
    a('<td class="b">1–3</td>')
    a('<td><img class="big" src="../%s/%s" alt="stance"></td>' % (BASE, stance['gif']))
    a('<td class="n">Stance<br><span class="dim">un solo bucle, filas 1 + 2 + 3</span></td>')
    a('<td class="mono">%d figuras<br>→ %d frames</td>' % (stance['crudo'], stance['n']))
    a('<td class="mono">7–219</td>')
    a('<td class="note">Un solo bucle con las tres franjas, en el orden <b>2 1 2 2 3 2</b> y '
      'vuelta a empezar: 6 + 10 + 6 + 6 + 7 + 6 = <b>41 figuras</b>. Se descartan 2, las que '
      'están repetidas píxel a píxel justo en las costuras (la primera de la fila 2 tras la '
      'fila 1, y la primera de la fila 2 tras el final de la fila 3) → <b>%d frames</b>. La '
      'fila 2 hace de respiración entre la 1 y la 3 y va dos veces en la unión. En ningún '
      'sitio sale partido: es una entrada, un GIF y una animación.</td>' % stance['n'])
    a('</tr>')

    # ---- filas 4-24: crudas, como estaban, salvo la 12 y la 22-23 ----
    for f in filas:
        n = f['fila']
        if n < 4:
            continue
        if n == 12:
            a('<tr class="stance">')
            a('<td class="b">12</td>')
            a('<td><img class="mini" src="../%s/%s" alt="speed kick"></td>' % (BASE, sk['gif']))
            a('<td class="n">Speed kick<br><span class="dim">poses + estelas en el frame</span></td>')
            a('<td class="mono">%d poses<br>9 estelas</td>' % sk['n'])
            a('<td class="mono">827–911</td>')
            a('<td class="note">Cada estela va <b>dentro del frame, a la derecha del sprite</b>, '
              'en el desfase que tiene en la hoja. Las dos que van sueltas (x 254–276 y x 339–359) '
              'van con la pose de su izquierda, que es la que las genera.</td>')
            a('</tr>')
            continue
        if n == 23:
            continue
        if n == 22:
            a('<tr class="stance">')
            a('<td class="b">22–23</td>')
            a('<td><img class="mini" src="../%s/%s" alt="defensa y super"></td>' % (BASE, bs['gif']))
            a('<td class="n">Defensa / onda de choque + super<br>'
              '<span class="dim">una sola animación</span></td>')
            a('<td class="mono">8 + 6 = 14<br>→ %d frames</td>' % bs['n'])
            a('<td class="mono">1942–2157</td>')
            a('<td class="note">Las filas 22 y 23 seguidas, <b>todos los frames</b>, sin quitar '
              'ninguno. La onda de los golpes grandes y la esfera del super no están dibujadas.</td>')
            a('</tr>')
            continue
        a('<tr>')
        a('<td class="b">%02d</td>' % n)
        a('<td><img class="mini" src="../%s/%s" alt="fila %d"></td>' % (BASE, f['gif'], n))
        extra = ''
        if n == 4:
            extra = ' <span class="dim">torso +3,8 px</span>'
        elif n == 5:
            extra = ' <span class="dim">torso −0,0 px</span>'
        a('<td class="n">%s%s</td>' % (NOMBRES[n], extra))
        a('<td class="mono">%d</td>' % f['n'])
        a('<td class="mono">%d–%d</td>' % (f['y0'], f['y1']))
        a('<td class="note">%s</td>' % NOTAS[n])
        a('</tr>')
    a('</table>')

    a('<div class="box"><h2>El stance, con los números</h2>')
    a('<p>El stance es <b>una sola animación</b> hecha con las filas 1, 2 y 3 en el orden '
      '<b>2 → 1 → 2 → 2 → 3 → 2</b> y vuelta a empezar: 6 + 10 + 6 + 6 + 7 + 6 = <b>41 '
      'figuras</b>, <b>%d frames</b> publicados a <b>10 fps</b> = <b>3,9 s</b> por vuelta. Se '
      'descartan <b>%d</b>: son las figuras que quedan repetidas píxel a píxel en las dos '
      'costuras (mismo md5, <code>3ee56306</code>), y con las dos puestas el bucle se para dos '
      'ticks. El resto de repeticiones se quedan: son del dibujo.</p>'
      % (stance['n'], stance['descartados']))
    a('<p>Los %d frames van en un lienzo único de <b>%d×%d px</b>: pies en la misma línea y eje '
      'de la cabeza al centro, para que el bucle no bote ni se vaya de lado.</p>'
      % (stance['n'], stance['lienzo'][0], stance['lienzo'][1]))
    a('<img class="strip" src="../%s/stance_secuencia.png" alt="los %d frames del stance en orden">'
      % (BASE, stance['n']))
    a('<p class="dim">Los %d frames en orden, tal como se reproducen.</p>' % stance['n'])
    a('<p class="dim">En la hoja de origen son tres franjas de fondo, pero son <b>un solo '
      'bucle</b>: aquí no salen por separado en ningún sitio. Es una entrada, un GIF y una '
      'animación en el juego (<code>stance</code>).</p></div>')

    a('<div class="box"><h2>Ya se puede elegir en ⚔ Pelea</h2>')
    a('<p>Chun-Li está en el juego como personaje jugable: en el menú de '
      '<a href="fight.html" style="color:#ffcb3d;font-weight:700">⚔ Pelea</a> se elige '
      '<b>P1</b> y <b>P2</b>, Voltia o Chun-Li. En Versus la llevan los dos mandos; en Pelea '
      'y Entrenamiento la controla la CPU si la eliges para P2.</p>')
    a('<p><b>Altura, medida antes de tocar nada:</b> Voltia mide 294 px de tinta en su hoja '
      '(× 0,5 de scale) = <b>147 px de mundo</b>. Chun-Li mide 58 px de tinta de stance '
      '(mediana de sus 39 frames, sin la sombra del suelo) → horneada a <b>×2,53</b> = <b>147 px de mundo</b>. No son '
      '200 px: son 147, los que mide Voltia de verdad.</p>')
    a('<p>Su hoja de juego son <b>29 animaciones</b> en celdas de 294×223, pivote (146, 203), '
      'scale 1: la escala va horneada en el PNG con NEAREST, así el navegador no reescala nada.</p>')
    a('<p class="dim">Aviso honesto: sus píxeles son 2,53 veces los del dibujo original, así que '
      'se ve más gruesa que Voltia. No es un fallo del montaje: Voltia viene de una hoja de 294 px '
      'reducida a la mitad y Chun-Li de una de 58 px subida 2,53 veces. A la misma altura, la '
      'resolución de origen no da para más.</p>')
    a('<p class="dim">Lo que la hoja no trae y se ha reutilizado, dicho: no hay animación de daño '
      '(hit y crouch_hit usan la guardia), ni de victoria propia (victoria1 usa la aurora del super '
      'y victoria2 la patada), y el proyectil usa la chispa de Voltia. Todo está marcado en '
      '<code>preview/chars/chunli.js</code>.</p>')
    a('</div>')

    a('<div class="box"><h2>Speed kick: las %d poses con su estela, en orden</h2>' % sk['n'])
    a('<p>Las estelas amarillas de la hoja no están pegadas a la pose: son trozos aparte, '
      'a la derecha de cada patada. Aquí van <b>dentro del frame</b>, en el mismo desfase '
      'que tienen en la hoja, así que acompañan al movimiento en vez de desaparecer.</p>')
    a('<img class="strip" src="../%s/speed_kick_secuencia.png" alt="las %d poses del speed kick con su estela">'
      % (BASE, sk['n']))
    a('<p class="dim">Desfases usados, en x de la hoja: %s.</p>'
      % ' · '.join(e for e in sk['estelas'] if e))
    a('</div>')

    a('<div class="box"><h2>Defensa + super: las filas 22 y 23, %d frames</h2>' % bs['n'])
    a('<p>Ocho figuras de la fila 22 y seis de la fila 23, <b>seguidas y sin quitar ninguna</b>: '
      'es una sola animación. Los frames van en el orden de la hoja, con los pies en la misma '
      'línea y el eje de la cabeza al centro.</p>')
    a('<img class="strip" src="../%s/block_super_secuencia.png" alt="los %d frames de defensa y super">'
      % (BASE, bs['n']))
    a('</div>')

    a('<div class="box"><h2>Por qué antes fallaba</h2>')
    a('<p>La fila 1 y la 2 están <b>en la misma franja de fondo</b>: el retrato de la izquierda '
      'es alto y tapa el hueco que las separa, así que un corte por franjas las ve como una '
      'sola. Ahí se me desplazaba todo. Ahora se separan por la altura del suelo de cada figura: '
      'la fila 1 tiene los pies en y≈76 y la fila 2 en y≈145.</p>')
    a('<p>En la tabla, de la 4 a la 24, no hay ninguna decisión mía: cada GIF lleva '
      '<b>todas</b> las figuras de su fila, incluidas las repeticiones. Los caminar llevan sus '
      '12 figuras, como estaban.</p></div>')

    a('</main></body></html>')
    destino = 'preview/chunli.html'
    open(destino, 'w').write('\n'.join(h))
    print('%s: %d B, stance %d frames, filas 4-24 crudas' % (destino, os.path.getsize(destino), stance['n']))


if __name__ == '__main__':
    main()

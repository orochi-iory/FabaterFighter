#!/usr/bin/env python3
"""Pagina de revision de Chun-Li: el set final arriba y la hoja cruda abajo.

El stance son las filas 1, 2 y 3 de la hoja jugadas como UN solo bucle, asi que
en la pagina aparece una vez, con un unico GIF. Las 24 filas de la hoja siguen
visibles al final, plegadas, solo para comprobar el recuento.

    PYTHONPATH=tools/pylibs python3 tools/chunli_page.py
"""
import json
import os

BASE = 'voltia/nuevo/chunli'

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
  header p b, .box b { color:var(--gold); }
  main { max-width:1080px; margin:0 auto; padding:12px 18px 50px; }
  table { border-collapse:collapse; width:100%; font-size:13px; background:var(--panel); }
  th, td { border-bottom:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:middle; }
  th { background:#1d2f39; color:var(--cyan); }
  td.b { color:var(--gold); font-weight:700; font-size:15px; }
  td.n { font-weight:600; }
  td.mono { font-variant-numeric:tabular-nums; white-space:nowrap; }
  td.note { color:#8ba1b1; max-width:330px; }
  .dim { color:#6d8496; font-size:12px; }
  img.mini { image-rendering:pixelated; height:64px; width:auto; display:block; background:#22333f; border-radius:6px; }
  .box { background:var(--panel); border:2px solid var(--line); border-radius:14px; padding:16px 18px; margin:20px 0; }
  .box h2 { margin:0 0 10px; font-size:16px; color:var(--gold); }
  .box p, .box li { color:#b9cad6; line-height:1.6; font-size:14px; }
  .box code { color:var(--cyan); }
  .stance { display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap; }
  .stance img { image-rendering:pixelated; background:#22333f; border-radius:10px; }
  .stance .big { height:224px; width:auto; }
  .stance .txt { flex:1 1 380px; min-width:300px; }
  .stance h2 { margin:0 0 6px; color:var(--cyan); font-size:20px; }
  .stance ul { margin:8px 0 0; padding-left:20px; }
  .strip { width:100%; height:auto; image-rendering:pixelated; background:#ededf2;
    border-radius:10px; margin-top:10px; display:block; }
  details { margin-top:26px; }
  details summary { cursor:pointer; color:var(--cyan); font-weight:700; padding:10px 0; font-size:15px; }
  .tag { display:inline-block; background:#1b7fa8; color:#fff; border-radius:6px;
    padding:1px 6px; font-size:11px; font-weight:700; margin-left:6px; }
"""


def cargar():
    filas = json.load(open(os.path.join(BASE, 'rows.json')))
    crudo = json.load(open(os.path.join(BASE, 'raw', 'filas.json')))
    return filas, crudo


def data_fila(f):
    """Ficha corta: frames activos / en el aire / alto-ancho."""
    trozos = ['%d frames' % f['n'],
              'alto %d px' % f['alto'][1],
              'ancho %d px' % f['ancho'][1]]
    if f.get('bucle'):
        trozos.append('bucle')
    if f.get('activos'):
        trozos.append('%s: %s' % (f.get('extension') or 'activo',
                                  ', '.join('#%d' % i for i in f['activos'])))
    if f.get('aire'):
        trozos.append('en el aire: %s' % ', '.join('#%d' % i for i in f['aire']))
    return ' · '.join(trozos)


def main():
    filas, crudo = cargar()
    stance = [f for f in filas if f['fila'] == 1][0]
    resto = [f for f in filas if f['fila'] != 1]
    origen = stance.get('origen') or []
    reparto = {}
    for o in origen:
        reparto[o] = reparto.get(o, 0) + 1
    rep = ' + '.join('%d' % reparto.get(k, 0) for k in sorted(reparto))

    h = []
    a = h.append
    a('<!DOCTYPE html>')
    a('<html lang="es"><head><meta charset="utf-8">')
    a('<meta name="viewport" content="width=device-width, initial-scale=1">')
    a('<title>Chun-Li · animaciones</title><style>%s</style></head><body>' % CSS)
    a('<nav class="models">')
    a('  <a href="index.html">① Modelo original</a>')
    a('  <a href="nuevo.html">② Modelo nuevo</a>')
    a('  <a href="chunli.html" class="on">③ Chun-Li</a>')
    a('  <a href="fight.html">⚔ Pelea</a>')
    a('</nav>')
    a('<header>')
    a('<h1>Chun-Li · animaciones</h1>')
    a('<p>%d animaciones: el stance y las filas 4 a 24. Nombres y orden, los tuyos.</p>'
      % len(filas))
    a('</header><main>')

    # ---------- stance: un solo bucle ----------
    a('<div class="box stance">')
    a('<img class="big" src="../%s/%s" alt="stance">' % (BASE, stance['gif']))
    a('<div class="txt">')
    a('<h2>Stance <span class="tag">filas 1 + 2 + 3</span></h2>')
    a('<p>Las tres filas son <b>un solo bucle</b>, tal y como dijiste: van unidas y '
      'se reproducen como una única animación en bucle. No hay stance partido.</p>')
    a('<ul>')
    a('<li>En la hoja: <b>%d</b> figuras (fila 1 = 10, fila 2 = 6, fila 3 = 7).</li>' % stance['crudo'])
    a('<li>Publicadas: <b>%d</b> frames (%s por fila).</li>' % (stance['n'], rep))
    a('<li>Se descarta <b>%d</b> frame, y no por criterio mío: la figura 1 de la fila 2 '
      'es idéntica píxel a píxel a la figura 10 de la fila 1 (misma costura de la hoja). '
      'Dejando las dos, el bucle se queda parado dos ticks.</li>' % stance['descartados'])
    a('<li>Todas las repeticiones del resto del bucle se quedan: son del dibujo original.</li>')
    a('<li>Lienzo único de %d×%d px: pies en la misma línea y eje de la cabeza al centro, '
      'así el bucle no bota ni se va de lado.</li>' % tuple(stance['lienzo']))
    a('</ul>')
    a('<img class="strip" src="../%s/stance_secuencia.png" alt="los %d frames del stance en orden">'
      % (BASE, stance['n']))
    a('<p class="dim">Los %d frames en orden, tal como se reproducen. Cada uno lleva la cabeza en el '
      'mismo eje y los pies en la misma línea.</p>' % stance['n'])
    a('</div></div>')

    # ---------- tabla de animaciones ----------
    a('<table>')
    a('<tr><th>Fila</th><th>GIF</th><th>Animación</th><th>Frames</th><th>Datos de los frames</th></tr>')
    a('<tr><td class="b">1–3</td>')
    a('<td><img class="mini" src="../%s/%s" alt="stance"></td>' % (BASE, stance['gif']))
    a('<td class="n">Stance<br><span class="dim">un solo bucle</span></td>')
    a('<td class="mono">%d</td><td class="note">%s</td></tr>'
      % (stance['n'], data_fila(stance) + ' · inclinación %.1f px' % (stance.get('inclinacion') or 0)))
    for f in resto:
        nota = f['nota']
        if f['fila'] in (4, 5):
            nota = nota + ' · inclinación %.1f px' % (f.get('inclinacion') or 0)
        a('<tr>')
        a('<td class="b">%02d</td>' % f['fila'])
        a('<td><img class="mini" src="../%s/%s" alt="%s"></td>' % (BASE, f['gif'], f['slug']))
        a('<td class="n">%s%s</td>' % (f['nombre'], '' if f.get('bucle') else ''))
        a('<td class="mono">%d</td>' % f['n'])
        a('<td class="note">%s<br><span class="dim">%s</span></td>' % (nota, data_fila(f)))
        a('</tr>')
    a('</table>')

    # ---------- hoja cruda, para comprobar el recuento ----------
    a('<details><summary>Las 24 filas de la hoja, crudas y numeradas '
      '(solo para comprobar el recuento)</summary>')
    a('<p class="dim" style="color:#8ba1b1">Aquí no hay ninguna decisión mía: cada GIF lleva todas las '
      'figuras de su fila, en el orden en que están. Las filas 1, 2 y 3 aparecen separadas porque '
      'así están en la hoja; en el juego son el único stance de arriba. '
      '<a href="../%s/raw/hoja_24_filas.png" style="color:#ffcb3d;font-weight:700">'
      '→ Las 24 filas juntas en una imagen</a></p>' % BASE)
    a('<table>')
    a('<tr><th>Fila</th><th>GIF</th><th>y en la hoja</th><th>Figuras</th><th>Qué es</th></tr>')
    por_fila = {f['fila']: f for f in filas}
    for r in crudo:
        n = r['fila']
        if n in (1, 2, 3):
            que = ('Stance · parte %d de 3 del mismo bucle' % n)
        else:
            que = por_fila[n]['nombre'] if n in por_fila else ''
        a('<tr><td class="b">%02d</td>' % n)
        a('<td><img class="mini" src="../%s/%s" alt="fila %d"></td>' % (BASE, r['gif'], n))
        a('<td class="mono">%d–%d</td>' % (r['y0'], r['y1']))
        a('<td class="mono">%d</td>' % r['n'])
        a('<td class="note">%s</td></tr>' % que)
    a('</table></details>')

    # ---------- notas ----------
    a('<div class="box"><h2>Lo que no está dibujado en la hoja</h2><ul>')
    filas_nd = [f for f in filas if 'no esta dibujad' in f['nota'].lower() or 'no está dibujad' in f['nota'].lower()]
    for f in filas_nd:
        a('<li><b>%s</b> (fila %d): %s</li>' % (f['nombre'], f['fila'], f['nota']))
    a('<li><b>Speed kick</b> (fila 12): las estelas amarillas van dibujadas aparte en la hoja; '
      'las poses que se usan son las 9 que salen.</li>')
    a('</ul>')
    a('<p>Los nombres y el orden son los de tu lista. Donde el efecto no está dibujado, lo dice: '
      'no lo he inventado.</p></div>')

    a('</main></body></html>')

    destino = 'preview/chunli.html'
    open(destino, 'w').write('\n'.join(h))
    print('%s: %d B, %d animaciones, stance %d frames (filas 1-3)'
          % (destino, os.path.getsize(destino), len(filas), stance['n']))


if __name__ == '__main__':
    main()

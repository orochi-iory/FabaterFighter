"""Lleva sprites nativos al tamaño del modelo original (96×152), sin tocar el modelo.

La escala se calcula una vez por animación a partir del ancla de cabeza ya medida y de los
pies. No se inventa un ancla: si un movimiento nuevo no tiene `ancla`, se conserva sin encajar
y el script avisa.

Al regenerar, preserva IDs/estados de aprobación y los frames oficiales que solo existan en
`oficial/` (por ejemplo, un PNG 96×152 añadido desde el creador). No borra variantes aceptadas.
"""
import copy
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ORIGEN = os.path.join(BASE, 'voltia/nuevo/creador/sprites')
SALIDA = os.path.join(BASE, 'voltia/nuevo/creador/oficial')

LIENZO = (96, 152)
CABEZA_Y = 26
PIES_Y = 146
CABEZA_X = 48
MARGEN_X = 2
CAMPOS_ESTABLES = ('id', 'estado', 'subido', 'copiado_de', 'original', 'restaurado')


def fid(anim, frame):
    return frame.get('id') or 'legacy-%s-%02d' % (anim, frame['i'])


def cargar_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def main():
    datos = cargar_json(os.path.join(ORIGEN, 'datos.json'), {'anims': {}})
    viejo = cargar_json(os.path.join(SALIDA, 'datos.json'), {'anims': {}})
    # Captura los PNG oficiales antes de escribir archivos con nombres f00..; podrían colisionar.
    bytes_viejos = {}
    for anim, v in viejo.get('anims', {}).items():
        for f in v.get('frames', []):
            p = os.path.join(SALIDA, f.get('fichero', '%s/f%02d.png' % (anim, f['i'])))
            if os.path.isfile(p):
                bytes_viejos[(anim, fid(anim, f))] = (copy.deepcopy(f), open(p, 'rb').read())

    salida = {}
    for anim, v in datos.get('anims', {}).items():
        frames_nativos = v.get('frames', [])
        if not frames_nativos:
            continue
        ancla = v.get('ancla')
        if not ancla or len(ancla) < 2:
            print('%-16s sin ancla de cabeza medida: no se escala' % anim)
            continue

        alto_cab = PIES_Y - CABEZA_Y
        anchos, alturas = [], []
        for f in frames_nativos:
            with Image.open(os.path.join(ORIGEN, f['fichero'])) as src:
                sp = src.convert('RGBA')
            bb = sp.getbbox()
            if not bb:
                alturas.append(1)
            else:
                alturas.append(max(1, bb[3] - ancla[1]))
            anchos.append(sp.size[0])
        e_alto = alto_cab / max(1, max(alturas))
        e_ancho = (LIENZO[0] - 2 * MARGEN_X) / max(1, max(anchos))
        escala = min(e_alto, e_ancho)
        destino = os.path.join(SALIDA, anim)
        os.makedirs(destino, exist_ok=True)
        oficiales = []
        ids_nativos = set()
        for f in frames_nativos:
            source_id = fid(anim, f)
            ids_nativos.add(source_id)
            with Image.open(os.path.join(ORIGEN, f['fichero'])) as src:
                sp = src.convert('RGBA')
            w = max(1, round(sp.size[0] * escala))
            h = max(1, round(sp.size[1] * escala))
            chico = sp.resize((w, h), Image.LANCZOS)
            dx = MARGEN_X
            bb = sp.getbbox()
            dy = int(round(PIES_Y - (bb[3] if bb else 0) * escala))
            lienzo = Image.new('RGBA', LIENZO, (0, 0, 0, 0))
            lienzo.alpha_composite(chico, (dx, dy))
            i = int(f['i'])
            p = os.path.join(destino, 'f%02d.png' % i)
            lienzo.save(p)
            box = lienzo.getbbox()
            entry = {'i': i, 'fichero': '%s/f%02d.png' % (anim, i),
                     'escala': round(escala, 3), 'sprite': [w, h],
                     'cortado': bool(box and (box[0] <= 0 or box[1] <= 0
                                              or box[2] >= LIENZO[0] or box[3] >= LIENZO[1])),
                     'cabeza_x': round(dx + ancla[0] * escala, 1),
                     'bbox': list(box) if box else None,
                     'id': source_id}
            for key in CAMPOS_ESTABLES:
                if key in f:
                    entry[key] = copy.deepcopy(f[key])
            oficiales.append(entry)

        # Mantener variantes oficiales-only. Si su ID ya tiene variante nativa, la imagen
        # oficial se regenera desde esa fuente; de lo contrario se conserva byte a byte.
        for old_frame in viejo.get('anims', {}).get(anim, {}).get('frames', []):
            # Solo conservar variantes oficiales con origen explícito de usuario/copia.
            # Los antiguos frames derivados de una hoja IA se regeneran junto al nativo.
            if not (old_frame.get('subido') or old_frame.get('copiado_de')):
                continue
            old_id = fid(anim, old_frame)
            if old_id in ids_nativos or (anim, old_id) not in bytes_viejos:
                continue
            record, blob = bytes_viejos[(anim, old_id)]
            i = len(oficiales)
            name = 'f%02d.png' % i
            with open(os.path.join(destino, name), 'wb') as out:
                out.write(blob)
            record['id'] = old_id
            record['i'] = i
            record['fichero'] = '%s/%s' % (anim, name)
            oficiales.append(record)

        salida[anim] = {'lienzo': list(LIENZO), 'ancla': [CABEZA_X, CABEZA_Y],
                        'pies_y': PIES_Y, 'escala': round(escala, 3), 'frames': oficiales}
        print('%-16s %d frames -> %dx%d | escala %.3f (alto %.3f, ancho %.3f) | cortados %d'
              % (anim, len(oficiales), LIENZO[0], LIENZO[1], escala, e_alto, e_ancho,
                 sum(1 for f in oficiales if f.get('cortado'))))

    # Animaciones que por ahora solo tienen una variante oficial (no se pierden al encajar).
    for anim, old_anim in viejo.get('anims', {}).items():
        if anim in salida:
            continue
        record = copy.deepcopy(old_anim)
        for f in record.get('frames', []):
            f['id'] = fid(anim, f)
        salida[anim] = record

    os.makedirs(SALIDA, exist_ok=True)
    with open(os.path.join(SALIDA, 'datos.json'), 'w', encoding='utf-8') as f:
        json.dump({'lienzo': list(LIENZO), 'filtro': 'LANCZOS (reducción de ilustración)',
                   'anims': salida}, f, indent=1, ensure_ascii=False)
        f.write('\n')


if __name__ == '__main__':
    main()

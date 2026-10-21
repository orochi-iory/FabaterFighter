#!/usr/bin/env python3
"""Operaciones seguras para el gestor del creador de personajes.

No toca voltia/sheet_uniform.png ni el modelo original. Mantiene sprites nativos y oficiales
separados, identifica cada sprite con un id estable, y centraliza los cambios que usa tanto
el visor web como los comandos de consola.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import shutil
import struct
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CREATOR = ROOT / 'voltia/nuevo/creador'
MODEL_JSON = ROOT / 'voltia/sheet.json'
BASES = {
    'nativo': CREATOR / 'sprites',
    'oficial': CREATOR / 'oficial',
}
TRASH = CREATOR / 'papelera'
TRASH_INDEX = TRASH / 'papelera.json'
VALID_STATES = {'aprobado', 'pendiente', 'descartado'}
MAX_UPLOAD_BYTES = 32 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MIN_IMAGE_SIZE = (40, 60)


def model():
    with MODEL_JSON.open(encoding='utf-8') as f:
        return json.load(f)


def movements():
    return model()['animations']


def movement_by_id(mov):
    for item in movements():
        if item['id'] == mov:
            return item
    raise ValueError('movimiento desconocido: %s' % mov)


def safe_id(value):
    return bool(re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', str(value or '')))


def data_path(base):
    return BASES[base] / 'datos.json'


def read_data(base):
    p = data_path(base)
    if p.exists():
        with p.open(encoding='utf-8') as f:
            return json.load(f)
    return {'anims': {}}


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(value, f, indent=1, ensure_ascii=False)
            f.write('\n')
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def image_id(mov, frame):
    return str(frame.get('id') or ('legacy-%s-%02d' % (mov, int(frame['i']))))


def ensure_ids(write=True):
    """Da IDs estables a los frames existentes (mismo índice = pareja nativo/oficial)."""
    datasets = {name: read_data(name) for name in BASES}
    changed = {name: False for name in BASES}
    anim_ids = {a['id'] for a in movements()}
    anim_ids.update(k for d in datasets.values() for k in d.get('anims', {}))
    for mov in anim_ids:
        for name, data in datasets.items():
            v = data.get('anims', {}).get(mov)
            if not v:
                continue
            for frame in v.get('frames', []):
                if not frame.get('id'):
                    frame['id'] = 'legacy-%s-%02d' % (mov, int(frame['i']))
                    changed[name] = True
    if write:
        for name, data in datasets.items():
            if changed[name]:
                write_json(data_path(name), data)
    return datasets


def blank_anim(mov, base, width=None, height=None):
    spec = movement_by_id(mov)
    if base == 'oficial':
        return {'lienzo': [96, 152], 'ancla': [48, 26], 'pies_y': 146,
                'escala': 1, 'esperado': spec['frames'], 'fps': spec['fps'],
                'loop': spec['loop'], 'frames': []}
    lienzo = [int(width), int(height)] if width is not None and height is not None else None
    return {'lienzo': lienzo, 'ancla': None,
            'escala': 1, 'esperado': spec['frames'], 'fps': spec['fps'],
            'loop': spec['loop'], 'frames': []}


def ensure_anim(data, mov, base, width=None, height=None):
    anims = data.setdefault('anims', {})
    if mov not in anims:
        anims[mov] = blank_anim(mov, base, width, height)
    return anims[mov]


def _frame_path(base, mov, frame):
    rel = frame.get('fichero') or '%s/f%02d.png' % (mov, frame['i'])
    p = (BASES[base] / rel).resolve()
    root = BASES[base].resolve()
    if root not in p.parents or p.suffix.lower() != '.png':
        raise ValueError('ruta de frame fuera de la carpeta esperada')
    return p


def _rel_url(path):
    return '../' + path.relative_to(ROOT).as_posix()


def reference_png(mov):
    """Recorta en memoria solo la fila del modelo original (el navegador no carga 174 MiB)."""
    spec = movement_by_id(mov)
    try:
        from PIL import Image
        from io import BytesIO
    except ImportError as e:
        raise ValueError('falta Pillow para servir la referencia original') from e
    meta = model()
    cell = meta['cell']
    path = ROOT / 'voltia' / meta['sprite']
    with Image.open(path) as sheet_image:
        left = 0
        top = int(spec['row']) * int(cell['h'])
        right = min(int(spec['frames']) * int(cell['w']), sheet_image.width)
        bottom = top + int(cell['h'])
        row = sheet_image.crop((left, top, right, bottom))
        output = BytesIO()
        row.save(output, format='PNG')
    return output.getvalue()


def catalog():
    datasets = ensure_ids(write=True)
    library = {}
    for base, data in datasets.items():
        for mov, anim in data.get('anims', {}).items():
            for frame in anim.get('frames', []):
                fid = image_id(mov, frame)
                entry = library.setdefault((mov, fid), {
                    'mov': mov, 'id': fid, 'indices': {}, 'urls': {},
                    'estado': frame.get('estado', 'pendiente'),
                    'copiado_de': frame.get('copiado_de'),
                })
                entry['indices'][base] = int(frame['i'])
                p = _frame_path(base, mov, frame)
                if p.exists():
                    entry['urls'][base] = _rel_url(p)
                if frame.get('estado') == 'aprobado' or entry['estado'] == 'aprobado':
                    entry['estado'] = 'aprobado'
                elif frame.get('estado') == 'descartado' or entry['estado'] == 'descartado':
                    entry['estado'] = 'descartado'
                else:
                    entry['estado'] = 'pendiente'
    return {
        'movimientos': movements(),
        'native': datasets['nativo'],
        'official': datasets['oficial'],
        'library': sorted(library.values(), key=lambda x: (x['mov'], min(x['indices'].values()), x['id'])),
    }


def _selected_ids(items):
    out = []
    seen = set()
    for item in items or []:
        mov = str(item.get('mov', ''))
        if not safe_id(mov):
            raise ValueError('movimiento no válido')
        movement_by_id(mov)
        fid = str(item.get('id', ''))
        if not fid or len(fid) > 100:
            raise ValueError('id de sprite no válido')
        key = (mov, fid)
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def set_state(items, state):
    if state not in VALID_STATES:
        raise ValueError('estado no válido')
    selected = _selected_ids(items)
    datasets = ensure_ids(write=True)
    updated = 0
    for base, data in datasets.items():
        dirty = False
        for mov, fid in selected:
            anim = data.get('anims', {}).get(mov, {})
            for frame in anim.get('frames', []):
                if image_id(mov, frame) == fid:
                    frame['estado'] = state
                    updated += 1
                    dirty = True
        if dirty:
            write_json(data_path(base), data)
    return {'ok': True, 'estado': state, 'archivos_actualizados': updated}


def _load_trash():
    if not TRASH_INDEX.exists():
        return []
    with TRASH_INDEX.open(encoding='utf-8') as f:
        return json.load(f)


def _save_trash(items):
    TRASH.mkdir(parents=True, exist_ok=True)
    write_json(TRASH_INDEX, items)


def send_to_trash(items):
    selected = _selected_ids(items)
    if not selected:
        raise ValueError('no hay sprites seleccionados')
    datasets = ensure_ids(write=True)
    trash = _load_trash()
    trash_ids = {x['trash_id'] for x in trash}
    moved = []
    selected_by_mov = {}
    for mov, fid in selected:
        selected_by_mov.setdefault(mov, set()).add(fid)

    # Prevalidar seleccionados y guardar los bytes de los que se quedan antes de mover
    # ningún archivo. Así f00.. se renumeran físicamente, no solo en datos.json.
    plans = []
    quedan_bytes = {}
    found_ids = set()
    for base, data in datasets.items():
        for mov, ids in selected_by_mov.items():
            anim = data.get('anims', {}).get(mov)
            if not anim:
                continue
            for frame in anim.get('frames', []):
                fid = image_id(mov, frame)
                src = _frame_path(base, mov, frame)
                if fid in ids:
                    if not src.exists():
                        raise ValueError('no existe el PNG de %s/%s' % (mov, frame['fichero']))
                    plans.append((base, mov, fid, copy.deepcopy(frame), src,
                                  copy.deepcopy(anim.get('lienzo'))))
                    found_ids.add((mov, fid))
                else:
                    if not src.exists():
                        raise ValueError('falta un frame que se iba a conservar: %s' % src)
                    quedan_bytes[(base, mov, fid)] = src.read_bytes()
    for mov, fid in selected:
        if (mov, fid) not in found_ids:
            raise ValueError('no se encuentra el sprite %s en %s' % (fid, mov))

    # El mismo ID puede tener variante nativa y oficial; cada PNG va a la papelera.
    for base, mov, fid, frame, src, canvas in plans:
        trash_id = uuid.uuid4().hex
        while trash_id in trash_ids:
            trash_id = uuid.uuid4().hex
        trash_ids.add(trash_id)
        dest_dir = TRASH / mov / base
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / (trash_id + '.png')
        index = int(frame['i'])
        shutil.move(str(src), str(dest))
        trash.append({'trash_id': trash_id, 'id': fid, 'mov': mov, 'base': base,
                      'indice_original': index, 'record': frame, 'lienzo': canvas,
                      'fichero': dest.relative_to(CREATOR).as_posix()})
        moved.append({'id': fid, 'mov': mov, 'base': base, 'indice_original': index})

    # Eliminar seleccionados, reescribir los restantes contiguos y actualizar metadatos.
    for base, data in datasets.items():
        dirty = False
        for mov, ids in selected_by_mov.items():
            anim = data.get('anims', {}).get(mov)
            if not anim:
                continue
            original = anim.get('frames', [])
            keep = [f for f in original if image_id(mov, f) not in ids]
            if len(keep) == len(original):
                continue
            folder = BASES[base] / mov
            for p in folder.glob('f[0-9][0-9]*.png'):
                p.unlink()
            for i, frame in enumerate(keep):
                fid = image_id(mov, frame)
                frame['i'] = i
                frame['fichero'] = '%s/f%02d.png' % (mov, i)
                (folder / ('f%02d.png' % i)).write_bytes(quedan_bytes[(base, mov, fid)])
            anim['frames'] = keep
            dirty = True
        if dirty:
            write_json(data_path(base), data)
    _save_trash(trash)
    return {'ok': True, 'movidos': moved, 'papelera': len(trash)}

def trash_catalog():
    items = _load_trash()
    grouped = {}
    for item in items:
        key = (item['mov'], item['id'])
        e = grouped.setdefault(key, {'id': item['id'], 'mov': item['mov'],
                                     'items': [], 'indices': {}, 'urls': {},
                                     'estado': item.get('record', {}).get('estado', 'pendiente')})
        p = CREATOR / item['fichero']
        e['items'].append(item['trash_id'])
        e['indices'][item['base']] = item['indice_original']
        if p.exists():
            e['urls'][item['base']] = _rel_url(p)
    return sorted(grouped.values(), key=lambda x: (x['mov'], min(x['indices'].values())))


def restore_trash(ids=None):
    trash = _load_trash()
    selected = set([x['trash_id'] for x in trash] if ids is None else ids)
    if not selected:
        return {'ok': True, 'restaurados': 0}
    found = [x for x in trash if x['trash_id'] in selected]
    if len(found) != len(selected):
        raise ValueError('uno o más elementos de papelera no existen')
    datasets = ensure_ids(write=True)
    # Validar antes de mover cualquier fichero.
    for item in found:
        if item['base'] not in BASES or not safe_id(item['mov']):
            raise ValueError('entrada inválida en la papelera')
        source = CREATOR / item['fichero']
        if not source.exists():
            raise ValueError('falta el archivo de papelera ' + item['fichero'])
    restore_groups = {}
    for item in found:
        restore_groups.setdefault((item['base'], item['mov']), []).append(item)
    for (base, mov), group in restore_groups.items():
        data = datasets[base]
        anim = data.get('anims', {}).get(mov)
        if anim is None:
            first = group[0]
            if base == 'oficial':
                anim = ensure_anim(data, mov, base)
            else:
                w, h = _png_size((CREATOR / first['fichero']).read_bytes())
                anim = ensure_anim(data, mov, base, w, h)
        folder = BASES[base] / mov
        folder.mkdir(parents=True, exist_ok=True)
        frames = anim.setdefault('frames', [])
        # Captura bytes actuales; los archivos se reescriben secuencialmente sin colisiones.
        existing = []
        for frame in frames:
            path = _frame_path(base, mov, frame)
            if not path.exists():
                raise ValueError('falta el frame existente %s' % path)
            existing.append((copy.deepcopy(frame), path.read_bytes()))
        combined = []
        for f, b in existing:
            combined.append((int(f['i']), 1, f, b))
        for item in group:
            rec = copy.deepcopy(item['record'])
            rec['id'] = item['id']
            rec.pop('i', None)
            b = (CREATOR / item['fichero']).read_bytes()
            combined.append((int(item['indice_original']), 0, rec, b))
        # insertion stable: restored material precedes a new sprite at exactly the same slot
        combined.sort(key=lambda x: (x[0], x[1]))
        new_frames = []
        for i, (_, _, frame, blob) in enumerate(combined):
            frame['i'] = i
            frame['fichero'] = '%s/f%02d.png' % (mov, i)
            new_frames.append(frame)
            (folder / ('f%02d.png' % i)).write_bytes(blob)
        # Remove stale PNGs after writing the contiguous set.
        valid = {f'f{i:02d}.png' for i in range(len(new_frames))}
        for p in folder.glob('*.png'):
            if p.name not in valid:
                p.unlink()
        anim['frames'] = new_frames
        write_json(data_path(base), data)
    for item in found:
        (CREATOR / item['fichero']).unlink(missing_ok=True)
    _save_trash([x for x in trash if x['trash_id'] not in selected])
    return {'ok': True, 'restaurados': len(found), 'ids': list(selected)}


def empty_trash():
    trash = _load_trash()
    removed = 0
    for item in trash:
        p = CREATOR / item['fichero']
        if p.exists():
            p.unlink()
            removed += 1
    _save_trash([])
    # limpia solo subdirectorios vacíos de la papelera; mantiene el índice.
    if TRASH.exists():
        for root, dirs, files in os.walk(TRASH, topdown=False):
            path = Path(root)
            if path == TRASH:
                continue
            if not dirs and not files:
                path.rmdir()
    return {'ok': True, 'eliminados': removed}


def _png_size(blob):
    if len(blob) < 24 or blob[:8] != b'\x89PNG\r\n\x1a\n' or blob[12:16] != b'IHDR':
        raise ValueError('no es un PNG válido (firma/IHDR)')
    return struct.unpack('>II', blob[16:24])


def _pixel_hash(blob):
    from io import BytesIO
    from PIL import Image
    im = Image.open(BytesIO(blob)).convert('RGBA')
    w, h = im.size
    shape = struct.pack('>II', w, h)
    pixels = bytearray(im.tobytes())
    for i in range(3, len(pixels), 4):
        if pixels[i] == 0:
            pixels[i - 3:i] = b'\\0\\0\\0'
    return hashlib.sha256(shape + pixels).hexdigest()


def _prepare_upload(blob, resolution):
    if len(blob) > MAX_UPLOAD_BYTES:
        raise ValueError('el PNG supera el límite de 32 MiB')
    width, height = _png_size(blob)
    if width < MIN_IMAGE_SIZE[0] or height < MIN_IMAGE_SIZE[1]:
        raise ValueError('demasiado pequeño: mínimo %d×%d px' % MIN_IMAGE_SIZE)
    if width * height > MAX_IMAGE_PIXELS:
        raise ValueError('la imagen supera 16 megapíxeles')
    if resolution == 'oficial' and (width, height) != (96, 152):
        raise ValueError('para la resolución oficial el PNG debe medir exactamente 96×152; no se escala')
    try:
        from PIL import Image
        from io import BytesIO
    except ImportError as e:
        raise ValueError('falta Pillow para validar el PNG: python3 -m pip install -r tools/requirements.txt') from e
    try:
        im = Image.open(BytesIO(blob)).convert('RGBA')
    except Exception as e:
        raise ValueError('PNG dañado o no decodificable') from e
    px = im.load()
    w, h = im.size
    perimeter = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)]
    perimeter += [(0, y) for y in range(0, h, 3)] + [(w - 1, y) for y in range(0, h, 3)]
    transparent = red = 0
    for x, y in perimeter:
        r, g, b, a = px[x, y]
        if a < 16:
            transparent += 1
        elif r == 255 and g == 0 and b == 0:
            red += 1
    total = len(perimeter)
    if transparent / total < .60 and red / total < .60:
        raise ValueError('el borde debe ser ≥60 % transparente o rojo puro #ff0000')
    if transparent / total >= .60:
        return blob, (w, h)
    # Solo se borra el rojo puro exacto. No se cuantiza ni se toca otro tono.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and (r, g, b) == (255, 0, 0):
                px[x, y] = (0, 0, 0, 0)
    out = BytesIO()
    im.save(out, format='PNG')
    return out.getvalue(), (w, h)


def add_upload(mov, resolution, filename, blob):
    movement_by_id(mov)
    if resolution not in BASES:
        raise ValueError('resolución no válida')
    safe_name = Path(filename or 'sprite.png').name
    if not safe_name.lower().endswith('.png'):
        raise ValueError('elige un PNG')
    data_bytes, (width, height) = _prepare_upload(blob, resolution)
    datasets = ensure_ids(write=True)
    base = resolution
    data = datasets[base]
    anim = data.get('anims', {}).get(mov)
    if anim is None:
        anim = ensure_anim(data, mov, base,
                           width if base == 'nativo' else 96,
                           height if base == 'nativo' else 152)
    if not anim.get('frames') and anim.get('lienzo') is None:
        anim['lienzo'] = [width, height]
    expected_canvas = tuple(anim.get('lienzo') or (96, 152))
    if tuple((width, height)) != expected_canvas:
        raise ValueError('este movimiento usa lienzo %d×%d; el PNG mide %d×%d. No lo escalo.'
                         % (*expected_canvas, width, height))
    frames = anim.setdefault('frames', [])
    digest = _pixel_hash(data_bytes)
    for frame in frames:
        p = _frame_path(base, mov, frame)
        if p.exists() and _pixel_hash(p.read_bytes()) == digest:
            raise ValueError('ese PNG ya existe en este movimiento; no se añade duplicado')
    index = max([int(f['i']) for f in frames], default=-1) + 1
    folder = BASES[base] / mov
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / ('f%02d.png' % index)
    target.write_bytes(data_bytes)
    frame = {'id': uuid.uuid4().hex, 'i': index,
             'fichero': '%s/f%02d.png' % (mov, index),
             'nativo': [width, height] if base == 'nativo' else None,
             'cortado': False, 'subido': True, 'estado': 'pendiente'}
    frames.append(frame)
    if base == 'oficial':
        anim.setdefault('lienzo', [96, 152])
        anim.setdefault('ancla', [48, 26])
        anim.setdefault('pies_y', 146)
    write_json(data_path(base), data)
    return {'ok': True, 'mov': mov, 'resolucion': resolution, 'fichero': frame['fichero'],
            'id': frame['id'], 'dimensiones': [width, height], 'estado': 'pendiente'}


def copy_approved(items, target_mov):
    movement_by_id(target_mov)
    selected = _selected_ids(items)
    if not selected:
        raise ValueError('marca al menos un sprite aprobado en la biblioteca')
    datasets = ensure_ids(write=True)
    results = []
    touched = set()
    for source_mov, fid in selected:
        source_frames = {}
        for base, data in datasets.items():
            anim = data.get('anims', {}).get(source_mov, {})
            for frame in anim.get('frames', []):
                if image_id(source_mov, frame) == fid and frame.get('estado') == 'aprobado':
                    path = _frame_path(base, source_mov, frame)
                    if path.exists():
                        source_frames[base] = (anim, frame, path)
        if not source_frames:
            results.append({'mov': source_mov, 'id': fid, 'ok': False,
                            'error': 'solo se pueden copiar sprites aprobados'})
            continue
        new_id = uuid.uuid4().hex
        copied = []
        skipped = []
        for base, (source_anim, frame, source_path) in source_frames.items():
            data = datasets[base]
            target_anim = data.get('anims', {}).get(target_mov)
            if target_anim is None:
                if base == 'nativo':
                    size = tuple(source_anim.get('lienzo') or _png_size(source_path.read_bytes()))
                    target_anim = ensure_anim(data, target_mov, base, *size)
                else:
                    target_anim = ensure_anim(data, target_mov, base)
            if base == 'nativo':
                src_canvas = tuple(source_anim.get('lienzo') or _png_size(source_path.read_bytes()))
                dst_canvas = tuple(target_anim.get('lienzo') or ())
                if src_canvas and dst_canvas and src_canvas != dst_canvas:
                    skipped.append('nativo: lienzo fuente %s ≠ destino %s' % (src_canvas, dst_canvas))
                    continue
                if src_canvas and not dst_canvas:
                    target_anim['lienzo'] = list(src_canvas)
            dest_folder = BASES[base] / target_mov
            dest_folder.mkdir(parents=True, exist_ok=True)
            blob = source_path.read_bytes()
            digest = _pixel_hash(blob)
            duplicate = False
            for old in target_anim.get('frames', []):
                old_path = _frame_path(base, target_mov, old)
                if old_path.exists() and _pixel_hash(old_path.read_bytes()) == digest:
                    duplicate = True
                    break
            if duplicate:
                skipped.append('%s: ya existe (duplicado)' % base)
                continue
            index = max([int(f['i']) for f in target_anim.get('frames', [])], default=-1) + 1
            target_path = dest_folder / ('f%02d.png' % index)
            shutil.copy2(source_path, target_path)
            new_frame = copy.deepcopy(frame)
            new_frame.update({'id': new_id, 'i': index,
                              'fichero': '%s/f%02d.png' % (target_mov, index),
                              'estado': 'aprobado',
                              'copiado_de': {'mov': source_mov, 'id': fid}})
            new_frame.pop('original', None)
            target_anim.setdefault('frames', []).append(new_frame)
            touched.add(base)
            copied.append(base)
        results.append({'mov': source_mov, 'id': fid, 'nuevo_id': new_id,
                        'ok': bool(copied), 'copiado_en': copied, 'omitido': skipped})
    for base in touched:
        write_json(data_path(base), datasets[base])
    return {'ok': True, 'destino': target_mov,
            'resultados': results}


def summary():
    c = catalog()
    states = {s: 0 for s in VALID_STATES}
    for item in c['library']:
        states[item['estado']] = states.get(item['estado'], 0) + 1
    return {'total': len(c['library']), 'estados': states,
            'movimientos': len(c['movimientos']), 'papelera': len(_load_trash())}

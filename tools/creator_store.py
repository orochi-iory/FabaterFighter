#!/usr/bin/env python3
"""Operaciones seguras para el gestor del creador de personajes.

No escribe las hojas fuente ni los modelos originales. Mantiene sprites nativos, oficiales y
lotes Nativos pendientes de Pruebas IA separados por perfil, identifica cada sprite con un id
estable y centraliza las operaciones del visor web y la API local.
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
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER_JSON = ROOT / 'characters/roster.json'


def _creator_profile(character_id=None):
    """Resuelve las rutas de un perfil desde el registro, no desde el código del servicio."""
    character_id = character_id or os.environ.get('FABATER_CREATOR_CHARACTER', 'voltia')
    with ROSTER_JSON.open(encoding='utf-8') as f:
        roster = json.load(f)
    character = next((x for x in roster.get('characters', [])
                      if x.get('id') == character_id), None)
    config = character.get('creator_profile') if character else None
    if not isinstance(config, dict):
        raise ValueError('el personaje %r no tiene creator_profile en characters/roster.json' % character_id)
    repo = ROOT.resolve()

    def path_for(key):
        value = config.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError('falta %s en creator_profile de %s' % (key, character_id))
        path = (ROOT / value).resolve()
        if path == repo or repo not in path.parents:
            raise ValueError('ruta %s fuera del repositorio para %s' % (key, character_id))
        return path

    return character_id, path_for('storage_root'), path_for('model_json'), path_for('reference_sheet'), config


_CREATOR_LOCK = threading.RLock()


def _set_profile(character_id=None):
    global CREATOR_CHARACTER, CREATOR, MODEL_JSON, REFERENCE_SHEET, CREATOR_PROFILE_CONFIG
    global BASES, TRASH, TRASH_INDEX
    (CREATOR_CHARACTER, CREATOR, MODEL_JSON, REFERENCE_SHEET,
     CREATOR_PROFILE_CONFIG) = _creator_profile(character_id)
    BASES = {'nativo': CREATOR / 'sprites', 'oficial': CREATOR / 'oficial'}
    TRASH = CREATOR / 'papelera'
    TRASH_INDEX = TRASH / 'papelera.json'


_set_profile()


@contextmanager
def use_profile(character_id=None):
    """Selecciona rutas aisladas para una operación completa y las restaura al salir."""
    global CREATOR_CHARACTER, CREATOR, MODEL_JSON, REFERENCE_SHEET, CREATOR_PROFILE_CONFIG
    global BASES, TRASH, TRASH_INDEX
    with _CREATOR_LOCK:
        previous = (CREATOR_CHARACTER, CREATOR, MODEL_JSON, REFERENCE_SHEET,
                    CREATOR_PROFILE_CONFIG, BASES, TRASH, TRASH_INDEX)
        if character_id:
            _set_profile(character_id)
        try:
            yield CREATOR_CHARACTER
        finally:
            (CREATOR_CHARACTER, CREATOR, MODEL_JSON, REFERENCE_SHEET,
             CREATOR_PROFILE_CONFIG, BASES, TRASH, TRASH_INDEX) = previous
VALID_STATES = {'aprobado', 'pendiente', 'descartado'}
MAX_UPLOAD_BYTES = 32 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MAX_SHEET_PIXELS = 64_000_000
MAX_SHEET_FRAMES = 1024
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
        return {'lienzo': [96, 152],
                'ancla': CREATOR_PROFILE_CONFIG.get('official_anchor'),
                'pies_y': CREATOR_PROFILE_CONFIG.get('official_feet_y'),
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
    path = REFERENCE_SHEET
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
                    'origen_laboratorio': frame.get('origen_laboratorio'),
                })
                if frame.get('origen_laboratorio'):
                    entry['origen_laboratorio'] = frame['origen_laboratorio']
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
        'personaje': CREATOR_CHARACTER,
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
            pixels[i - 3:i] = b'\0\0\0'
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
        from PIL import Image, ImageDraw
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
    # Solo se elimina el rojo puro exacto conectado con el borde; otros colores y
    # componentes rojos aislados del dibujo se conservan sin tocar.
    for x, y in perimeter:
        r, g, b, a = px[x, y]
        if a >= 16 and (r, g, b) == (255, 0, 0):
            ImageDraw.floodfill(im, (x, y), (0, 0, 0, 0), thresh=0)
    out = BytesIO()
    im.save(out, format='PNG')
    return out.getvalue(), (w, h)


def add_upload(mov, resolution, filename, blob, hash_cache=None):
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
    if hash_cache is not None:
        if digest in hash_cache:
            raise ValueError('ese PNG ya existe en este movimiento; no se añade duplicado')
    else:
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
        anchor = CREATOR_PROFILE_CONFIG.get('official_anchor')
        feet_y = CREATOR_PROFILE_CONFIG.get('official_feet_y')
        if anchor is not None:
            anim.setdefault('ancla', anchor)
        if feet_y is not None:
            anim.setdefault('pies_y', feet_y)
    write_json(data_path(base), data)
    if hash_cache is not None:
        hash_cache.add(digest)
    return {'ok': True, 'personaje': CREATOR_CHARACTER, 'mov': mov, 'resolucion': resolution,
            'fichero': frame['fichero'], 'id': frame['id'],
            'dimensiones': [width, height], 'estado': 'pendiente'}


def add_sheet_upload(mov, resolution, filename, blob, cell_width, cell_height,
                     columns=0, rows=1, gap_x=0, gap_y=0, offset_x=0, offset_y=0,
                     start_row=1):
    """Corta una hoja PNG en celdas exactas y añade cada celda válida como pendiente.

    No escala ni recolorea. Las separaciones/desplazamientos solo definen la rejilla de
    recorte; cada celda conserva sus dimensiones y pasa por la validación normal de PNG.
    """
    movement_by_id(mov)
    if resolution not in BASES:
        raise ValueError('resolución no válida')
    safe_name = Path(filename or 'hoja.png').name
    if not safe_name.lower().endswith('.png'):
        raise ValueError('elige una hoja PNG')
    if len(blob) > MAX_UPLOAD_BYTES:
        raise ValueError('la hoja supera el límite de 32 MiB')
    source_width, source_height = _png_size(blob)
    if source_width * source_height > MAX_SHEET_PIXELS:
        raise ValueError('la hoja supera 64 megapíxeles')
    try:
        from io import BytesIO
        from PIL import Image
        image = Image.open(BytesIO(blob))
        if image.format != 'PNG':
            raise ValueError('la hoja debe ser PNG')
        image = image.convert('RGBA')
    except ValueError:
        raise
    except Exception as e:
        raise ValueError('PNG dañado o no decodificable') from e

    try:
        cell_width, cell_height = int(cell_width), int(cell_height)
        columns, rows = int(columns or 0), int(rows or 1)
        gap_x, gap_y = int(gap_x or 0), int(gap_y or 0)
        offset_x, offset_y = int(offset_x or 0), int(offset_y or 0)
        start_row = int(start_row or 1)
    except (TypeError, ValueError) as e:
        raise ValueError('las medidas de la rejilla deben ser números enteros') from e
    if cell_width < MIN_IMAGE_SIZE[0] or cell_height < MIN_IMAGE_SIZE[1]:
        raise ValueError('la celda debe medir al menos 40×60 px')
    if cell_width * cell_height > MAX_IMAGE_PIXELS:
        raise ValueError('cada celda supera 16 megapíxeles')
    if min(columns, rows, gap_x, gap_y, offset_x, offset_y) < 0:
        raise ValueError('columnas, filas, separaciones y márgenes no pueden ser negativos')
    if start_row < 1:
        raise ValueError('la fila inicial se cuenta desde 1')
    grid_y = offset_y + (start_row - 1) * (cell_height + gap_y)
    if resolution == 'oficial' and (cell_width, cell_height) != (96, 152):
        raise ValueError('la rejilla oficial debe usar celdas exactas de 96×152; no se escala')

    def count_fit(total, offset, cell, gap):
        available = total - offset
        return 0 if available < cell else (available + gap) // (cell + gap)

    if columns == 0:
        columns = count_fit(source_width, offset_x, cell_width, gap_x)
    if rows == 0:
        rows = count_fit(source_height, grid_y, cell_height, gap_y)
    if columns < 1 or rows < 1:
        raise ValueError('la rejilla no contiene ninguna celda completa')
    if columns * rows > MAX_SHEET_FRAMES:
        raise ValueError('la rejilla supera el máximo de 1024 celdas')
    if offset_x + (columns - 1) * (cell_width + gap_x) + cell_width > source_width:
        raise ValueError('las columnas no caben en el ancho de la hoja')
    if grid_y + (rows - 1) * (cell_height + gap_y) + cell_height > source_height:
        raise ValueError('las filas no caben en el alto de la hoja')

    results = []
    stem = Path(safe_name).stem
    hash_cache = set()
    existing_anim = read_data(resolution).get('anims', {}).get(mov, {})
    for old_frame in existing_anim.get('frames', []):
        old_path = _frame_path(resolution, mov, old_frame)
        if old_path.exists():
            hash_cache.add(_pixel_hash(old_path.read_bytes()))
    for row in range(rows):
        for col in range(columns):
            x = offset_x + col * (cell_width + gap_x)
            y = grid_y + row * (cell_height + gap_y)
            crop = image.crop((x, y, x + cell_width, y + cell_height))
            alpha_max = crop.getchannel('A').getextrema()[1]
            colors = crop.getcolors(maxcolors=4096) if alpha_max >= 16 else []
            has_art = alpha_max >= 16 and (colors is None or any(
                amount and a >= 16 and (r, g, b) != (255, 0, 0)
                for amount, (r, g, b, a) in (colors or [])))
            if not has_art:
                results.append({'ok': False, 'omitido': True, 'fila': start_row + row,
                                'columna': col + 1, 'error': 'celda vacía'})
                continue
            output = BytesIO()
            crop.save(output, format='PNG')
            name = '%s_f%02d_r%02d_c%02d.png' % (stem, len(results) + 1, start_row + row, col + 1)
            try:
                item = add_upload(mov, resolution, name, output.getvalue(), hash_cache=hash_cache)
                results.append({'ok': True, 'fila': start_row + row, 'columna': col + 1,
                                'fichero': item['fichero'], 'id': item['id'],
                                'dimensiones': item['dimensiones'], 'estado': item['estado']})
            except (ValueError, KeyError, TypeError) as e:
                results.append({'ok': False, 'fila': start_row + row, 'columna': col + 1,
                                'error': str(e)})

    añadidos = sum(1 for item in results if item.get('ok'))
    return {'ok': True, 'personaje': CREATOR_CHARACTER, 'mov': mov, 'resolucion': resolution,
            'hoja': [source_width, source_height], 'celda': [cell_width, cell_height],
            'columnas': columns, 'fila_inicio': start_row, 'filas': rows,
            'añadidos': añadidos, 'resultados': results}


def _validated_timestamp(value, label):
    if not isinstance(value, str) or not value or len(value) > 64:
        raise ValueError('%s no es una fecha válida' % label)
    try:
        datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as e:
        raise ValueError('%s no es una fecha ISO válida' % label) from e
    return value


def import_lab_sequence_official(mov, strip_blob, frame_width, frame_height,
                                 frame_numbers, sequence_id, validated_at,
                                 creator_reviewed_at, native_batch_id=None):
    """Convierte una secuencia revisada en Pruebas IA a candidatos oficiales pendientes.

    La tira recibida conserva el lienzo nativo y los píxeles de origen. La conversión
    se limita a un único movimiento y reutiliza el ajuste uniforme del proceso de
    encajar.py: ancla de cabeza/pies del perfil, margen lateral, LANCZOS y lienzo 96×152.
    No toca la hoja del juego ni los sprites nativos/oficiales preexistentes.
    """
    if CREATOR_CHARACTER != 'voltia':
        raise ValueError('la importación de Pruebas IA está habilitada solo para Voltia')
    movement_by_id(mov)
    if not safe_id(sequence_id):
        raise ValueError('identificador de secuencia no válido')
    validated_at = _validated_timestamp(validated_at, 'la validación de Pruebas IA')
    creator_reviewed_at = _validated_timestamp(creator_reviewed_at, 'la aprobación del Creador')
    try:
        frame_width, frame_height = int(frame_width), int(frame_height)
    except (TypeError, ValueError) as e:
        raise ValueError('el lienzo nativo debe tener medidas enteras') from e
    if frame_width < MIN_IMAGE_SIZE[0] or frame_height < MIN_IMAGE_SIZE[1]:
        raise ValueError('el cuadro nativo debe medir al menos 40×60 px')
    if frame_width * frame_height > MAX_IMAGE_PIXELS:
        raise ValueError('cada cuadro nativo supera 16 megapíxeles')
    if not isinstance(frame_numbers, list) or not 1 <= len(frame_numbers) <= MAX_SHEET_FRAMES:
        raise ValueError('la secuencia debe contener entre 1 y 1024 cuadros validados')
    if any(not isinstance(n, int) or isinstance(n, bool) or n < 0 for n in frame_numbers):
        raise ValueError('los números de cuadro de Pruebas IA deben ser enteros no negativos')
    if len(set(frame_numbers)) != len(frame_numbers) or frame_numbers != sorted(frame_numbers):
        raise ValueError('los cuadros deben estar en orden y no repetirse')
    if len(strip_blob) > MAX_UPLOAD_BYTES:
        raise ValueError('la tira nativa supera el límite de 32 MiB')
    strip_width, strip_height = _png_size(strip_blob)
    if (strip_width, strip_height) != (frame_width * len(frame_numbers), frame_height):
        raise ValueError('la tira nativa no coincide con el número y tamaño de cuadros validados')
    if strip_width * strip_height > MAX_SHEET_PIXELS:
        raise ValueError('la tira nativa supera 64 megapíxeles')

    try:
        from io import BytesIO
        from PIL import Image
        strip = Image.open(BytesIO(strip_blob))
        if strip.format != 'PNG':
            raise ValueError('la tira nativa debe ser PNG')
        strip = strip.convert('RGBA')
    except ValueError:
        raise
    except Exception as e:
        raise ValueError('la tira nativa está dañada o no se puede decodificar') from e

    source_images = []
    source_boxes = []
    for order, source_number in enumerate(frame_numbers):
        cell = strip.crop((order * frame_width, 0, (order + 1) * frame_width, frame_height))
        # Es una tira rasterizada por el laboratorio tras revisión humana. No se escala,
        # recolorea ni se vuelve a filtrar con las reglas de una carga manual genérica.
        image = cell.convert('RGBA')
        # El RGB de un píxel transparente puede conservar color. Medimos solo alfa para
        # no confundirlo con arte ni incluir residuos invisibles en el encuadre.
        bbox = image.getchannel('A').getbbox()
        if not bbox:
            raise ValueError('el cuadro de Pruebas IA %d está vacío tras la limpieza' % source_number)
        source_images.append(image)
        source_boxes.append(bbox)

    config = CREATOR_PROFILE_CONFIG
    official_anchor = config.get('official_anchor')
    feet_y = config.get('official_feet_y')
    if not isinstance(official_anchor, list) or len(official_anchor) != 2 or feet_y is None:
        raise ValueError('el perfil no define el ancla de cabeza y pies del proceso aprobado')
    target_width, target_height = 96, 152
    anchor_x, anchor_y = int(official_anchor[0]), int(official_anchor[1])
    feet_y = int(feet_y)
    source_anchor_x, source_anchor_y = frame_width // 2, frame_height // 2
    below_head = max(max(1, box[3] - source_anchor_y) for box in source_boxes)
    scale_by_height = (feet_y - anchor_y) / below_head
    scale_by_width = (target_width - 4) / frame_width
    scale = min(1.0, scale_by_height, scale_by_width)
    if scale <= 0:
        raise ValueError('no se pudo calcular una reducción uniforme válida')

    from io import BytesIO
    from PIL import Image
    resampling = getattr(Image, 'Resampling', Image).LANCZOS
    converted = []
    seen_hashes = set()
    existing_anim = read_data('oficial').get('anims', {}).get(mov, {})
    if tuple(existing_anim.get('lienzo') or (96, 152)) != (96, 152):
        raise ValueError('el movimiento oficial no usa el lienzo 96×152; no se modifica')
    for order, (image, source_number) in enumerate(zip(source_images, frame_numbers)):
        resized_width = max(1, round(frame_width * scale))
        resized_height = max(1, round(frame_height * scale))
        # Filtra en alfa premultiplicado: los PNG del laboratorio pueden conservar RGB
        # oculto en píxeles transparentes y no debe producir un halo rojo/negro al reducir.
        resized = image.convert('RGBa').resize((resized_width, resized_height), resampling).convert('RGBA')
        resized_bbox = resized.getchannel('A').getbbox()
        if not resized_bbox:
            raise ValueError('el cuadro %d quedó vacío al reducirse' % source_number)
        x = 2
        y = round(feet_y - source_boxes[order][3] * scale)
        placed = (x + resized_bbox[0], y + resized_bbox[1],
                  x + resized_bbox[2], y + resized_bbox[3])
        if placed[0] < 0 or placed[1] < 0 or placed[2] > target_width or placed[3] > target_height:
            raise ValueError('el cuadro %d no cabe en 96×152 con el proceso aprobado; no se recorta' % source_number)
        output = Image.new('RGBA', (target_width, target_height), (0, 0, 0, 0))
        output.alpha_composite(resized, (x, y))
        output_bbox = output.getchannel('A').getbbox()
        encoded = BytesIO()
        output.save(encoded, format='PNG')
        blob = encoded.getvalue()
        digest = _pixel_hash(blob)
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        for old in existing_anim.get('frames', []):
            old_path = _frame_path('oficial', mov, old)
            if old_path.exists() and _pixel_hash(old_path.read_bytes()) == digest:
                break
        else:
            converted.append({
                'blob': blob,
                'source_number': source_number,
                'bbox': list(output_bbox) if output_bbox else None,
                'cabeza_x': round(x + source_anchor_x * scale, 1),
                'sprite': [resized_width, resized_height],
                'cortado': bool(output_bbox and (output_bbox[0] <= 0 or output_bbox[1] <= 0 or
                                                  output_bbox[2] >= target_width or output_bbox[3] >= target_height)),
                'scale': scale,
                'order': order,
            })

    if not converted:
        raise ValueError('no hay cuadros nuevos: la conversión quedó vacía o ya existe sin duplicados')

    datasets = ensure_ids(write=True)
    data = datasets['oficial']
    anim = ensure_anim(data, mov, 'oficial')
    if tuple(anim.get('lienzo') or (96, 152)) != (96, 152):
        raise ValueError('el movimiento oficial no usa el lienzo 96×152; no se modifica')
    anim.setdefault('ancla', list(official_anchor))
    anim.setdefault('pies_y', feet_y)
    frames = anim.setdefault('frames', [])
    next_index = max([int(frame['i']) for frame in frames], default=-1) + 1
    target_folder = BASES['oficial'] / mov
    target_folder.mkdir(parents=True, exist_ok=True)
    staged, installed = [], []
    results = []
    try:
        for item in converted:
            while (target_folder / ('f%02d.png' % next_index)).exists():
                next_index += 1
            index = next_index
            next_index += 1
            filename = 'f%02d.png' % index
            final_path = target_folder / filename
            fd, temporary = tempfile.mkstemp(prefix=filename + '.', suffix='.tmp', dir=str(target_folder))
            with os.fdopen(fd, 'wb') as output:
                output.write(item['blob'])
            staged.append((temporary, final_path))
            frame_id = uuid.uuid4().hex
            source = {
                'secuencia': sequence_id,
                'lote_nativo': native_batch_id,
                'validada_en': validated_at,
                'aprobada_en_creador': creator_reviewed_at,
                'cuadro_fuente': item['source_number'],
                'resolucion_fuente': 'nativo',
                'lienzo_fuente': [frame_width, frame_height],
                'ancla_fuente': [source_anchor_x, source_anchor_y],
                'proceso': 'encajar.py · reducción uniforme LANCZOS con alfa premultiplicado',
                'escala': round(item['scale'], 6),
                'cabeza_x': item['cabeza_x'],
                'bbox': item['bbox'],
            }
            frame = {
                'id': frame_id, 'i': index, 'fichero': '%s/%s' % (mov, filename),
                'nativo': None, 'cortado': item['cortado'], 'subido': True,
                'estado': 'pendiente', 'escala': round(item['scale'], 3),
                'sprite': item['sprite'], 'cabeza_x': item['cabeza_x'],
                'bbox': item['bbox'], 'origen_laboratorio': source,
            }
            frames.append(frame)
            results.append({'id': frame_id, 'i': index, 'fichero': frame['fichero'],
                            'cuadro_fuente': item['source_number'], 'estado': 'pendiente'})
        for temporary, final_path in staged:
            os.replace(temporary, final_path)
            installed.append(final_path)
        write_json(data_path('oficial'), data)
    except Exception:
        for temporary, _ in staged:
            try:
                os.unlink(temporary)
            except OSError:
                pass
        for path in installed:
            try:
                path.unlink()
            except OSError:
                pass
        raise
    return {
        'ok': True, 'personaje': CREATOR_CHARACTER, 'mov': mov,
        'resolucion': 'oficial', 'lienzo_fuente': [frame_width, frame_height],
        'escala': round(scale, 6), 'añadidos': len(results),
        'duplicados_omitidos': len(frame_numbers) - len(results), 'resultados': results,
    }


def revisar_alineacion_voltia(mov, componente, ancla=None, pies_y=None, desplazamiento=None):
    """Guarda revisiones manuales independientes de cabeza, suelo o posición del sprite.

    Los valores base heredados no cuentan como revisión: cada componente se marca solo
    tras una acción explícita desde el Creador. No modifica ningún PNG.
    """
    if CREATOR_CHARACTER != 'voltia':
        raise ValueError('la calibración final está habilitada solo para el perfil Voltia')
    movement_by_id(mov)
    data = read_data('oficial')
    anim = ensure_anim(data, mov, 'oficial')
    if tuple(anim.get('lienzo') or ()) != (96, 152):
        raise ValueError('la alineación final requiere el lienzo oficial 96×152')
    revisions = anim.setdefault('revision_alineacion', {})
    if not isinstance(revisions, dict):
        revisions = anim['revision_alineacion'] = {}
    reviewed_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

    if componente == 'cabeza':
        if (not isinstance(ancla, list) or len(ancla) != 2 or
                any(type(value) is not int for value in ancla)):
            raise ValueError('el ancla de cabeza debe contener X e Y enteros')
        x, y = ancla
        if not (0 <= x < 96 and 0 <= y < 152):
            raise ValueError('el ancla debe quedar dentro del lienzo 96×152')
        anim['ancla'] = [x, y]
        revisions['cabeza'] = {
            'revisada': True, 'ancla': [x, y], 'revisada_en': reviewed_at,
        }
    elif componente == 'suelo':
        if type(pies_y) is not int or not 0 <= pies_y <= 152:
            raise ValueError('la línea de suelo debe ser un entero entre 0 y 152')
        anim['pies_y'] = pies_y
        revisions['suelo'] = {
            'revisada': True, 'pies_y': pies_y, 'revisada_en': reviewed_at,
        }
    elif componente == 'sprite':
        if (not isinstance(desplazamiento, list) or len(desplazamiento) != 2 or
                any(type(value) is not int for value in desplazamiento)):
            raise ValueError('el desplazamiento del sprite debe contener X e Y enteros')
        dx, dy = desplazamiento
        if not (-96 <= dx <= 96 and -152 <= dy <= 152):
            raise ValueError('el desplazamiento debe estar entre −96..96 px en X y −152..152 px en Y')
        anim['desplazamiento_sprite'] = [dx, dy]
        revisions['sprite'] = {
            'revisada': True, 'desplazamiento': [dx, dy], 'revisada_en': reviewed_at,
        }
    else:
        raise ValueError('el componente debe ser cabeza, suelo o sprite')

    write_json(data_path('oficial'), data)
    return {
        'ok': True, 'mov': mov, 'componente': componente,
        'ancla': copy.deepcopy(anim.get('ancla')),
        'pies_y': anim.get('pies_y'),
        'desplazamiento_sprite': copy.deepcopy(anim.get('desplazamiento_sprite', [0, 0])),
        'revision_alineacion': copy.deepcopy(revisions),
    }


def _voltia_final_root():
    """Banco de publicación de Voltia Final; nunca comparte la hoja original."""
    return ROOT / 'voltia/nuevo/voltia-final'


def _read_voltia_final_data():
    path = _voltia_final_root() / 'datos.json'
    if not path.exists():
        return {'format': 'FabaterFighter-VoltiaFinal', 'version': 1, 'anims': {}}
    with path.open(encoding='utf-8') as source:
        data = json.load(source)
    if data.get('format') != 'FabaterFighter-VoltiaFinal' or data.get('version') != 1 or not isinstance(data.get('anims'), dict):
        raise ValueError('el catálogo de Voltia Final tiene un formato no reconocido')
    return data


def voltia_final_catalog():
    """Lista las últimas animaciones publicadas y verifica sus rutas dentro del banco final."""
    data = _read_voltia_final_data()
    root = _voltia_final_root().resolve()
    by_id = {item['id']: item for item in movements()}
    animations_list = []
    for mov, record in data.get('anims', {}).items():
        if not safe_id(mov) or mov not in by_id or not isinstance(record, dict):
            continue
        item = copy.deepcopy(record)
        item['mov'] = mov
        item['label'] = by_id[mov].get('label', mov)
        valid_frames = []
        for frame in item.get('frames', []):
            if not isinstance(frame, dict):
                continue
            relative = Path(str(frame.get('fichero', '')))
            path = (root / relative).resolve()
            if path.suffix.lower() != '.png' or root not in path.parents:
                continue
            if path.is_file():
                frame['url'] = _rel_url(path)
                valid_frames.append(frame)
        item['frames'] = valid_frames
        animations_list.append(item)
    order = {item['id']: index for index, item in enumerate(movements())}
    animations_list.sort(key=lambda item: order.get(item['mov'], 10**6))
    return {'ok': True, 'character': 'voltia-final', 'animations': animations_list}


def publish_voltia_final_animation(mov, frame_ids, fps_value, loop):
    """Publica una secuencia oficial aprobada en un banco aparte, conservando cada PNG byte a byte."""
    if CREATOR_CHARACTER != 'voltia':
        raise ValueError('solo se pueden publicar animaciones del perfil Voltia')
    spec = movement_by_id(mov)
    if not isinstance(frame_ids, list) or not 1 <= len(frame_ids) <= MAX_SHEET_FRAMES:
        raise ValueError('la animación debe incluir entre 1 y 1024 cuadros')
    selected_ids = [str(value) for value in frame_ids]
    if any(not value or len(value) > 100 for value in selected_ids) or len(set(selected_ids)) != len(selected_ids):
        raise ValueError('los IDs de cuadros no son válidos o se repiten')
    try:
        fps_value = int(fps_value)
    except (TypeError, ValueError) as error:
        raise ValueError('los fps deben ser un número entero') from error
    if not 1 <= fps_value <= 60:
        raise ValueError('los fps deben estar entre 1 y 60')
    if not isinstance(loop, bool):
        raise ValueError('el modo de bucle debe ser verdadero o falso')

    data = read_data('oficial')
    anim = data.get('anims', {}).get(mov)
    if not isinstance(anim, dict) or tuple(anim.get('lienzo') or ()) != (96, 152):
        raise ValueError('el movimiento no tiene lienzo oficial 96×152')
    alignment = anim.get('revision_alineacion')
    head_review = alignment.get('cabeza') if isinstance(alignment, dict) else None
    floor_review = alignment.get('suelo') if isinstance(alignment, dict) else None
    if (not isinstance(head_review, dict) or head_review.get('revisada') is not True or
            head_review.get('ancla') != anim.get('ancla')):
        raise ValueError('revisa y guarda manualmente el ancla de cabeza de este movimiento antes de publicar')
    if (not isinstance(floor_review, dict) or floor_review.get('revisada') is not True or
            floor_review.get('pies_y') != anim.get('pies_y')):
        raise ValueError('revisa y guarda manualmente la línea de suelo de este movimiento antes de publicar')
    sprite_offset = anim.get('desplazamiento_sprite', [0, 0])
    if (not isinstance(sprite_offset, list) or len(sprite_offset) != 2 or
            any(type(value) is not int for value in sprite_offset) or
            not (-96 <= sprite_offset[0] <= 96 and -152 <= sprite_offset[1] <= 152)):
        raise ValueError('el desplazamiento manual del sprite no es válido')
    sprite_review = alignment.get('sprite') if isinstance(alignment, dict) else None
    if (not isinstance(sprite_review, dict) or sprite_review.get('revisada') is not True or
            sprite_review.get('desplazamiento') != sprite_offset):
        raise ValueError('revisa y guarda manualmente la posición del sprite antes de publicar')
    indexed = {image_id(mov, frame): frame for frame in anim.get('frames', [])}
    if any(frame_id not in indexed for frame_id in selected_ids):
        raise ValueError('la secuencia contiene cuadros que ya no están en la biblioteca')
    selected = [indexed[frame_id] for frame_id in selected_ids]
    if any(frame.get('estado') != 'aprobado' for frame in selected):
        raise ValueError('solo se envían a Voltia Final cuadros aprobados en el Creador')

    source_blobs = []
    for frame in selected:
        path = _frame_path('oficial', mov, frame)
        if not path.is_file():
            raise ValueError('falta un PNG oficial de la secuencia')
        blob = path.read_bytes()
        if _png_size(blob) != (96, 152):
            raise ValueError('un PNG de la secuencia no conserva el lienzo 96×152')
        source_blobs.append(blob)

    version_id = uuid.uuid4().hex
    relative_dir = Path('animaciones') / mov / version_id
    root = _voltia_final_root()
    destination = root / relative_dir
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.' + version_id + '.', dir=str(destination.parent)))
    published_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    published_frames = []
    try:
        for index, (source, blob) in enumerate(zip(selected, source_blobs)):
            filename = 'f%02d.png' % index
            (temporary / filename).write_bytes(blob)
            published_frames.append({
                'id': image_id(mov, source), 'i': index,
                'source_i': int(source['i']),
                'fichero': (relative_dir / filename).as_posix(),
                'estado': 'aprobado',
            })
        manifest = {
            'format': 'FabaterFighter-VoltiaFinalAnimation', 'version': 1,
            'mov': mov, 'label': spec.get('label', mov), 'canvas': [96, 152],
            'fps': fps_value, 'loop': loop, 'published_at': published_at,
            'creator_resolution': 'oficial',
            'anchor': copy.deepcopy(anim.get('ancla') or CREATOR_PROFILE_CONFIG.get('official_anchor')),
            'feet_y': anim.get('pies_y', CREATOR_PROFILE_CONFIG.get('official_feet_y')),
            'sprite_offset': copy.deepcopy(sprite_offset),
            'alignment_review': copy.deepcopy(alignment),
            'source_frame_ids': selected_ids, 'frames': published_frames,
            'version_id': version_id,
        }
        write_json(temporary / 'manifest.json', manifest)
        os.replace(temporary, destination)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    catalog = _read_voltia_final_data()
    catalog.setdefault('anims', {})[mov] = manifest
    write_json(root / 'datos.json', catalog)
    published = voltia_final_catalog()
    item = next(entry for entry in published['animations'] if entry['mov'] == mov)
    return {'ok': True, 'animation': item, 'catalog': published}


def _lab_native_root():
    return CREATOR / 'pruebas-ia-pendientes'


def _lab_native_batch_dir(batch_id):
    if not safe_id(batch_id):
        raise ValueError('identificador de importación nativa no válido')
    root = _lab_native_root().resolve()
    folder = (root / batch_id).resolve()
    if root not in folder.parents:
        raise ValueError('ruta de importación nativa fuera de la bandeja')
    return folder


def _read_lab_native_batch(batch_id):
    path = _lab_native_batch_dir(batch_id) / 'datos.json'
    if not path.exists():
        raise ValueError('no se encuentra la importación nativa solicitada')
    with path.open(encoding='utf-8') as source:
        record = json.load(source)
    if record.get('format') != 'FabaterFighter-LabNative' or record.get('version') != 1:
        raise ValueError('la importación nativa no tiene un formato reconocido')
    return record


def lab_native_catalog():
    root = _lab_native_root()
    result = []
    if not root.exists():
        return result
    for path in root.glob('*/datos.json'):
        try:
            with path.open(encoding='utf-8') as source:
                record = json.load(source)
            if record.get('format') == 'FabaterFighter-LabNative' and record.get('version') == 1:
                result.append(record)
        except (OSError, ValueError, json.JSONDecodeError):
            continue
    return sorted(result, key=lambda item: (item.get('importada_en', ''), item.get('batch_id', '')))


def import_lab_sequence_native(strip_blob, frame_width, frame_height, frame_numbers,
                               sequence_id, validated_at, frame_blobs=None):
    """Persiste PNG nativos como lote aislado; acepta tira histórica o PNG individuales sin Pillow."""
    if CREATOR_CHARACTER != 'voltia':
        raise ValueError('la importación de Pruebas IA está habilitada solo para Voltia')
    if not safe_id(sequence_id):
        raise ValueError('identificador de secuencia no válido')
    validated_at = _validated_timestamp(validated_at, 'la validación de Pruebas IA')
    try:
        frame_width, frame_height = int(frame_width), int(frame_height)
    except (TypeError, ValueError) as e:
        raise ValueError('el lienzo nativo debe tener medidas enteras') from e
    # El laboratorio conserva también los recortes pequeños tal cual; el mínimo de 40×60
    # se reserva para cargas manuales generales, no para secuencias ya validadas.
    if frame_width < 1 or frame_height < 1:
        raise ValueError('el cuadro nativo debe medir al menos 1×1 px')
    if frame_width * frame_height > MAX_IMAGE_PIXELS:
        raise ValueError('cada cuadro nativo supera 16 megapíxeles')
    if not isinstance(frame_numbers, list) or not 1 <= len(frame_numbers) <= MAX_SHEET_FRAMES:
        raise ValueError('la secuencia debe contener entre 1 y 1024 cuadros validados')
    if any(not isinstance(n, int) or isinstance(n, bool) or n < 0 for n in frame_numbers):
        raise ValueError('los números de cuadro de Pruebas IA deben ser enteros no negativos')
    if len(set(frame_numbers)) != len(frame_numbers) or frame_numbers != sorted(frame_numbers):
        raise ValueError('los cuadros deben estar en orden y no repetirse')
    if frame_width * frame_height * len(frame_numbers) > MAX_SHEET_PIXELS:
        raise ValueError('la secuencia nativa supera 64 megapíxeles')
    if frame_blobs is not None:
        if not isinstance(frame_blobs, list) or len(frame_blobs) != len(frame_numbers):
            raise ValueError('la lista de PNG nativos no coincide con los cuadros validados')
        total_bytes = 0
        for index, blob in enumerate(frame_blobs):
            if not isinstance(blob, bytes) or not blob:
                raise ValueError('falta el PNG nativo del cuadro %d' % frame_numbers[index])
            if _png_size(blob) != (frame_width, frame_height):
                raise ValueError('el PNG nativo del cuadro %d no conserva el tamaño real %d×%d' %
                                 (frame_numbers[index], frame_width, frame_height))
            total_bytes += len(blob)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise ValueError('los PNG nativos superan el límite total de 32 MiB')
        strip = None
    else:
        if not isinstance(strip_blob, bytes) or len(strip_blob) > MAX_UPLOAD_BYTES:
            raise ValueError('la tira nativa supera el límite de 32 MiB')
        strip_width, strip_height = _png_size(strip_blob)
        if (strip_width, strip_height) != (frame_width * len(frame_numbers), frame_height):
            raise ValueError('la tira nativa no coincide con el número y tamaño de cuadros validados')
        if strip_width * strip_height > MAX_SHEET_PIXELS:
            raise ValueError('la tira nativa supera 64 megapíxeles')
        try:
            from io import BytesIO
            from PIL import Image
            strip = Image.open(BytesIO(strip_blob))
            if strip.format != 'PNG':
                raise ValueError('la tira nativa debe ser PNG')
            strip = strip.convert('RGBA')
        except ValueError:
            raise
        except Exception as e:
            raise ValueError('la tira nativa está dañada o no se puede decodificar') from e

    # El identificador es estable para la misma versión validada. Una repetición de la
    # petición devuelve el lote existente y nunca sobrescribe sus PNG.
    digest = hashlib.sha256((sequence_id + '\0' + validated_at).encode('utf-8')).hexdigest()[:24]
    batch_id = 'lab-' + digest
    target = _lab_native_batch_dir(batch_id)
    if target.exists():
        return {'ok': True, 'ya_existia': True, 'batch': _read_lab_native_batch(batch_id)}

    root = _lab_native_root()
    root.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.' + batch_id + '.', dir=str(root)))
    frames = []
    imported_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    try:
        for index, source_number in enumerate(frame_numbers):
            if frame_blobs is not None:
                png_blob = frame_blobs[index]
            else:
                cell = strip.crop((index * frame_width, 0, (index + 1) * frame_width, frame_height))
                output = BytesIO()
                cell.save(output, format='PNG')
                png_blob = output.getvalue()
            filename = 'f%02d.png' % index
            (temporary / filename).write_bytes(png_blob)
            frames.append({
                'id': uuid.uuid4().hex, 'i': index,
                'cuadro_fuente': source_number,
                'fichero': '%s/%s' % (batch_id, filename),
                'lienzo': [frame_width, frame_height], 'estado': 'pendiente',
            })
        record = {
            'format': 'FabaterFighter-LabNative', 'version': 1,
            'batch_id': batch_id, 'secuencia': sequence_id,
            'validada_en': validated_at, 'importada_en': imported_at,
            'estado': 'pendiente', 'aprobada_en_creador': None,
            'resolucion': 'nativo', 'lienzo': [frame_width, frame_height],
            'ancla_nativa': [frame_width // 2, frame_height // 2],
            'alineacion': 'cabeza medida',
            'cuadros_fuente': list(frame_numbers),
            'proceso_importacion': 'PNG nativo; sin escala ni recolor',
            'conversiones': {}, 'frames': frames,
        }
        write_json(temporary / 'datos.json', record)
        try:
            os.replace(temporary, target)
        except FileExistsError:
            shutil.rmtree(temporary, ignore_errors=True)
            return {'ok': True, 'ya_existia': True, 'batch': _read_lab_native_batch(batch_id)}
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {'ok': True, 'ya_existia': False, 'batch': record}


def set_lab_native_state(batch_id, state):
    if state not in {'pendiente', 'aprobado', 'descartado'}:
        raise ValueError('estado de revisión nativa no válido')
    record = _read_lab_native_batch(batch_id)
    if record.get('conversiones'):
        if state == record.get('estado'):
            return {'ok': True, 'batch': record}
        raise ValueError('no se puede cambiar el estado después de preparar una variante oficial')
    if state == record.get('estado'):
        return {'ok': True, 'batch': record}
    record['estado'] = state
    if state == 'aprobado':
        record['aprobada_en_creador'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    elif state != 'aprobado':
        record['aprobada_en_creador'] = None
    for frame in record.get('frames', []):
        frame['estado'] = state
    write_json(_lab_native_batch_dir(batch_id) / 'datos.json', record)
    return {'ok': True, 'batch': record}


def convert_lab_native_official(batch_id, mov):
    record = _read_lab_native_batch(batch_id)
    if record.get('estado') != 'aprobado' or not record.get('aprobada_en_creador'):
        raise ValueError('la secuencia debe aprobarse en el Creador antes de convertirla')
    movement_by_id(mov)
    previous = record.get('conversiones', {}).get(mov)
    if previous:
        return {'ok': True, 'ya_convertida': True, **previous, 'batch': record}
    folder = _lab_native_batch_dir(batch_id)
    width, height = record.get('lienzo', [0, 0])
    source_frames = sorted(record.get('frames', []), key=lambda frame: int(frame.get('i', -1)))
    if len(source_frames) != len(record.get('cuadros_fuente', [])) or not source_frames:
        raise ValueError('la bandeja nativa está incompleta')
    from io import BytesIO
    from PIL import Image
    strip = Image.new('RGBA', (int(width) * len(source_frames), int(height)), (0, 0, 0, 0))
    for index, frame in enumerate(source_frames):
        filename = Path(str(frame.get('fichero', ''))).name
        if filename != 'f%02d.png' % index:
            raise ValueError('el orden de cuadros nativos no es válido')
        path = folder / filename
        if not path.is_file():
            raise ValueError('falta un cuadro nativo de la bandeja')
        blob = path.read_bytes()
        if len(blob) > MAX_UPLOAD_BYTES:
            raise ValueError('un cuadro nativo supera el límite de 32 MiB')
        try:
            image = Image.open(BytesIO(blob))
            if image.format != 'PNG' or image.size != (int(width), int(height)):
                raise ValueError('un PNG nativo no conserva el lienzo importado')
            strip.paste(image.convert('RGBA'), (index * int(width), 0))
        except ValueError:
            raise
        except Exception as e:
            raise ValueError('no se pudo leer un PNG nativo de la bandeja') from e
    output = BytesIO()
    strip.save(output, format='PNG')
    result = import_lab_sequence_official(
        mov, output.getvalue(), width, height, list(record['cuadros_fuente']),
        record['secuencia'], record['validada_en'], record['aprobada_en_creador'], batch_id)
    converted_at = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
    summary = {
        'convertida_en': converted_at,
        'resolucion': 'oficial', 'mov': mov,
        'añadidos': result['añadidos'],
        'duplicados_omitidos': result['duplicados_omitidos'],
        'escala': result['escala'], 'resultados': result['resultados'],
    }
    record.setdefault('conversiones', {})[mov] = summary
    write_json(folder / 'datos.json', record)
    return {'ok': True, **result, 'convertida_en': converted_at, 'batch': record}


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

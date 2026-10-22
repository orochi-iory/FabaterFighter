#!/usr/bin/env python3
"""Servidor de desarrollo para los visores y el creador de personajes.

    python3 tools/serve.py            # 0.0.0.0:8080, raíz = el repositorio
    python3 tools/serve.py --puerto 9000

El creador expone una API local para aprobar/copiar sprites y mantener el flujo aislado de
Pruebas IA: bandeja Nativa pendiente, aprobación explícita y conversión oficial por movimiento.
Las operaciones usan tools/creator_store.py y nunca modifican el modelo original ni la hoja del juego.
"""
import argparse
import base64
import functools
import http.server
import json
import os
import socketserver
import sys
from urllib.parse import parse_qs, urlsplit

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.dirname(os.path.abspath(__file__))
if TOOLS not in sys.path:
    sys.path.insert(0, TOOLS)

import creator_store  # noqa: E402

TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.md': 'text/markdown; charset=utf-8', '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TIPOS}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def _json(self, value, status=200):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _binary(self, body, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self, max_bytes=creator_store.MAX_UPLOAD_BYTES * 2):
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            raise ValueError('Content-Length no válido')
        if n <= 0 or n > max_bytes:
            raise ValueError('tamaño de petición no válido')
        raw = self.rfile.read(n)
        try:
            return json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise ValueError('el cuerpo debe ser JSON válido') from e

    @staticmethod
    def _decode_data_url(value):
        if not isinstance(value, str) or ',' not in value:
            raise ValueError('falta el PNG en formato data URL')
        header, encoded = value.split(',', 1)
        if 'base64' not in header.lower():
            raise ValueError('el PNG debe venir codificado en base64')
        try:
            blob = base64.b64decode(encoded, validate=True)
        except Exception as e:
            raise ValueError('base64 inválido') from e
        return blob

    def do_GET(self):
        parsed = urlsplit(self.path)
        route = parsed.path
        character = parse_qs(parsed.query).get('character', [None])[0]
        try:
            if route.startswith('/api/reference/') and route.endswith('.png'):
                mov = route.rsplit('/', 1)[-1][:-4]
                with creator_store.use_profile(character):
                    image = creator_store.reference_png(mov)
                return self._binary(image, 'image/png')
            if route == '/api/sprites':
                with creator_store.use_profile(character):
                    catalog = creator_store.catalog()
                return self._json(catalog)
            if route == '/api/sprites/lab-native':
                with creator_store.use_profile(character):
                    items = creator_store.lab_native_catalog()
                return self._json({'items': items})
            if route == '/api/voltia-final':
                with creator_store.use_profile('voltia'):
                    result = creator_store.voltia_final_catalog()
                return self._json(result)
            if route == '/api/trash':
                with creator_store.use_profile(character):
                    items = creator_store.trash_catalog()
                return self._json({'items': items})
        except ValueError as e:
            return self._json({'ok': False, 'error': str(e)}, 400)
        except Exception as e:  # return a readable error to the creator UI
            return self._json({'ok': False, 'error': str(e)}, 500)
        return super().do_GET()

    def do_POST(self):
        route = urlsplit(self.path).path
        try:
            if route == '/api/sprites/state':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.set_state(p.get('items'), p.get('estado'))
                return self._json(result)
            if route == '/api/sprites/alignment':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.revisar_alineacion_voltia(
                        p.get('mov'), p.get('componente'), p.get('ancla'), p.get('pies_y'),
                        p.get('desplazamiento'))
                return self._json(result)
            if route == '/api/voltia-final/publish':
                p = self._body(1024 * 1024)
                with creator_store.use_profile('voltia'):
                    result = creator_store.publish_voltia_final_animation(
                        p.get('mov'), p.get('frame_ids'), p.get('fps'), p.get('loop'))
                return self._json(result)
            if route == '/api/sprites/trash':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.send_to_trash(p.get('items'))
                return self._json(result)
            if route == '/api/sprites/copy-approved':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.copy_approved(p.get('items'), p.get('destino'))
                return self._json(result)
            if route == '/api/trash/restore':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.restore_trash(p.get('ids'))
                return self._json(result)
            if route == '/api/trash/empty':
                p = self._body(1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.empty_trash()
                return self._json(result)
            if route == '/api/sprites/add':
                p = self._body()
                blob = self._decode_data_url(p.get('png'))
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.add_upload(p.get('mov'), p.get('resol'),
                                                      p.get('nombre'), blob)
                return self._json(result)
            if route == '/api/sprites/add-sheet':
                p = self._body()
                blob = self._decode_data_url(p.get('png'))
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.add_sheet_upload(
                        p.get('mov'), p.get('resol'), p.get('nombre'), blob,
                        p.get('celda_ancho'), p.get('celda_alto'),
                        p.get('columnas', 0), p.get('filas', 1),
                        p.get('gap_x', 0), p.get('gap_y', 0),
                        p.get('offset_x', 0), p.get('offset_y', 0),
                        p.get('fila_inicio', 1))
                return self._json(result)
            if route == '/api/sprites/lab-native/import':
                p = self._body()
                encoded_frames = p.get('frames_png')
                if encoded_frames is not None:
                    if not isinstance(encoded_frames, list) or len(encoded_frames) > creator_store.MAX_SHEET_FRAMES:
                        raise ValueError('la lista de PNG nativos no es válida')
                    frame_blobs = [self._decode_data_url(value) for value in encoded_frames]
                    blob = None
                else:
                    frame_blobs = None
                    blob = self._decode_data_url(p.get('png'))
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.import_lab_sequence_native(
                        blob, p.get('celda_ancho'), p.get('celda_alto'),
                        p.get('cuadros_fuente'), p.get('secuencia'), p.get('validada_en'),
                        frame_blobs=frame_blobs)
                return self._json(result)
            if route == '/api/sprites/lab-native/state':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.set_lab_native_state(p.get('batch_id'), p.get('estado'))
                return self._json(result)
            if route == '/api/sprites/lab-native/convert':
                p = self._body(1024 * 1024)
                with creator_store.use_profile(p.get('character')):
                    result = creator_store.convert_lab_native_official(p.get('batch_id'), p.get('mov'))
                return self._json(result)
            # Compatibilidad con la bandeja original: solo almacena el PNG en bruto.
            if route == '/subir':
                p = self._body()
                blob = self._decode_data_url(p.get('png'))
                if len(blob) > creator_store.MAX_UPLOAD_BYTES:
                    raise ValueError('el PNG supera el límite de 32 MiB')
                creator_store._png_size(blob)
                nombre = os.path.basename(str(p.get('nombre') or 'nuevo.png'))
                if not nombre.lower().endswith('.png'):
                    nombre += '.png'
                with creator_store.use_profile(p.get('character')):
                    destino = str(creator_store.CREATOR / 'nuevos')
                    os.makedirs(destino, exist_ok=True)
                    path = os.path.join(destino, nombre)
                    if os.path.exists(path):
                        stem, ext = os.path.splitext(nombre)
                        n = 2
                        while os.path.exists(os.path.join(destino, '%s_%02d%s' % (stem, n, ext))):
                            n += 1
                        nombre = '%s_%02d%s' % (stem, n, ext)
                    with open(os.path.join(destino, nombre), 'wb') as f:
                        f.write(blob)
                return self._json({'ok': True, 'fichero': 'nuevos/' + nombre,
                                   'bytes': len(blob)})
        except (ValueError, KeyError, TypeError) as e:
            return self._json({'ok': False, 'error': str(e)}, 400)
        except Exception as e:  # unexpected server error; keep response in JSON for the UI
            return self._json({'ok': False, 'error': str(e)}, 500)
        return self.send_error(404)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s  %s\n' % (self.address_string(), fmt % args))

    def copyfile(self, source, outputfile):
        try:
            super().copyfile(source, outputfile)
        except (ConnectionResetError, BrokenPipeError):
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--puerto', type=int, default=int(os.environ.get('PORT', 8080)))
    ap.add_argument('--host', default='0.0.0.0')
    args = ap.parse_args()
    handler = functools.partial(Handler, directory=RAIZ)
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.puerto), handler) as httpd:
        httpd.daemon_threads = True
        print('sirviendo %s en http://%s:%d/  (raíz: %s)'
              % (RAIZ, args.host, args.puerto, RAIZ), flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Servidor estatico del visor, para desarrollo local.

Por que existe: el visor se sirve muchas veces al dia y el navegador cachea el
HTML y los PNG. Eso ya nos ha costado tres veces "los cambios no llegan". Este
servidor manda **no-store** en todo, asi que lo que se ve es siempre el fichero
del disco.

    python3 tools/serve.py            # 0.0.0.0:8080, raiz = el repositorio
    python3 tools/serve.py --puerto 9000

Se sirve desde la raiz del repositorio porque `preview/index.html` referencia
`../voltia/...` y las imagenes de la hoja.
"""
import argparse
import functools
import http.server
import os
import posixpath
import socketserver
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.md': 'text/markdown; charset=utf-8',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.woff2': 'font/woff2',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TIPOS}

    def end_headers(self):
        # sin cache, nunca: ni HTML ni imagenes ni JS
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s  %s\n' % (self.address_string(), fmt % args))

    def copyfile(self, source, outputfile):
        # El navegador corta la descarga de la hoja (1,4 MB) cuando ya la tiene: eso es
        # normal y no es un fallo. Sin esto, cada corte imprime un traceback de
        # ConnectionResetError en el log y tapa los avisos que si importan.
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
        print('sirviendo %s en http://%s:%d/  (raiz: %s)'
              % (RAIZ, args.host, args.puerto, RAIZ), flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()

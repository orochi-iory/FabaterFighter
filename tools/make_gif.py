#!/usr/bin/env python3
"""Monta un GIF animado a partir de una carpeta de frames.

No genera dibujos: solo encadena los PNG que ya existen. El GIF es de 256
colores, y como los sprites usan ~22 colores planos, la perdida es cero; el
unico riesgo es el suavizado al redimensionar, por eso se amplia con NEAREST
y se guarda sin dithering.

    PYTHONPATH=tools/pylibs python3 tools/make_gif.py <dir_frames> <salida.gif> \
        [--fps 8] [--zoom 4] [--bg FFFFFF|transparente] [--once]
"""
import argparse
import os

from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('srcdir')
    ap.add_argument('out')
    ap.add_argument('--fps', type=float, default=8)
    ap.add_argument('--zoom', type=int, default=4)
    ap.add_argument('--bg', default='FFFFFF')
    ap.add_argument('--once', action='store_true')
    ap.add_argument('--pad', type=int, default=0)
    a = ap.parse_args()

    files = sorted(f for f in os.listdir(a.srcdir) if f.endswith('.png'))
    if not files:
        raise SystemExit('no hay PNG en ' + a.srcdir)

    ims = [Image.open(os.path.join(a.srcdir, f)).convert('RGBA') for f in files]
    # lienzo comun: el mayor ancho y alto, y cada figura alineada por los PIES
    # en el centro. Si no, el personaje sube y baja entre frames y el GIF baila.
    CW = max(i.size[0] for i in ims) + 2 + 2 * a.pad
    CH = max(i.size[1] for i in ims) + 2

    frames = []
    for im in ims:
        w, h = im.size
        # el lienzo es SIEMPRE CW x CH: si se crea del tamano del frame, cada
        # figura se recorta contra su propio borde (bug visto con frames de
        # anchos distintos).
        if a.bg.lower() == 'transparent':
            canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        else:
            bg = tuple(int(a.bg[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
            canvas = Image.new('RGBA', (CW, CH), bg)
        canvas.alpha_composite(im, ((CW - w) // 2, CH - h - 1))
        w, h = CW, CH
        if a.zoom > 1:
            canvas = canvas.resize((w * a.zoom, h * a.zoom), Image.NEAREST)
        frames.append(canvas.convert('P', palette=Image.ADAPTIVE,
                                    colors=256, dither=Image.NONE))

    delay = int(round(1000 / a.fps))
    frames[0].save(a.out, save_all=True, append_images=frames[1:],
                   duration=delay, loop=0 if not a.once else 1,
                   optimize=False, disposal=2)
    print('%s: %d frames, %dtms (%g fps), %dx (NEAREST), %s' %
          (a.out, len(frames), delay, a.fps, a.zoom, os.path.getsize(a.out) and
           '%d KB' % (os.path.getsize(a.out) // 1024)))


if __name__ == '__main__':
    main()

"""Lleva los sprites nuevos al tamano del modelo original, para verlos en el visor.

Los sprites nativos miden 285-308 px de ancho: son la resolucion real a la que los dibuja
la IA. Para compararlos con el modelo oficial hay que llevarlos a su rejilla de arte
(96 x 152, la misma que usa el juego) anclando la cabeza.

Aqui SI se reduce, y con filtro suave a proposito: el dibujo de la IA es una ilustracion
con antialias, no pixel art. Al reducirlo con NEAREST se rompen las lineas y sale sucio;
con un filtro promediado el antialias se convierte en un borde limpio y el ruido de color
desaparece. Es el mismo motivo por el que una foto se ve mejor reducida con promedio.
"""
import json
import os

from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
ORIGEN = os.path.join(BASE, 'voltia/nuevo/creador/sprites')
SALIDA = os.path.join(BASE, 'voltia/nuevo/creador/oficial')

# Rejilla del modelo oficial: 96 x 152 px de arte, pies en 146, cabeza en 26.
LIENZO = (96, 152)
CABEZA_Y = 26
PIES_Y = 146
CABEZA_X = 48


def main():
    datos = json.load(open(os.path.join(ORIGEN, 'datos.json')))
    salida = {}
    for anim, v in datos['anims'].items():
        os.makedirs(os.path.join(SALIDA, anim), exist_ok=True)
        ancla = v['ancla']
        frames = []
        for f in v['frames']:
            with Image.open(os.path.join(ORIGEN, f['fichero'])) as src:
                sp = src.convert('RGBA')
            # alto de cabeza a pies en el sprite nativo: se lleva a 120 px de arte
            bb = sp.getbbox()
            alto_cab = PIES_Y - CABEZA_Y
            escala = alto_cab / max(1, (bb[3] - ancla[1]))
            w = max(1, round(sp.size[0] * escala))
            h = max(1, round(sp.size[1] * escala))
            chico = sp.resize((w, h), Image.LANCZOS)   # promedio: disuelve el antialias
            lienzo = Image.new('RGBA', LIENZO, (0, 0, 0, 0))
            lienzo.alpha_composite(chico, (int(round(CABEZA_X - ancla[0] * escala)),
                                           int(round(CABEZA_Y - ancla[1] * escala))))
            p = os.path.join(SALIDA, anim, 'f%02d.png' % f['i'])
            lienzo.save(p)
            box = lienzo.getbbox()
            frames.append({'i': f['i'], 'fichero': '%s/f%02d.png' % (anim, f['i']),
                           'escala': round(escala, 3), 'sprite': [w, h],
                           'bbox': list(box) if box else None,
                           'cortado': bool(box and (box[0] <= 0 or box[1] <= 0
                                                    or box[2] >= LIENZO[0] or box[3] >= LIENZO[1]))})
        salida[anim] = {'lienzo': list(LIENZO), 'ancla': [CABEZA_X, CABEZA_Y],
                        'pies_y': PIES_Y, 'frames': frames}
        print('%-7s %d frames -> %dx%d | escala %.3f | cortados %d'
              % (anim, len(frames), LIENZO[0], LIENZO[1], frames[0]['escala'],
                 sum(1 for f in frames if f['cortado'])))
    with open(os.path.join(SALIDA, 'datos.json'), 'w') as fh:
        json.dump({'lienzo': list(LIENZO), 'filtro': 'LANCZOS (reduccion de ilustracion)',
                   'anims': salida}, fh, indent=1)


if __name__ == '__main__':
    main()

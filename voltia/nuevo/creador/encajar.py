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


MARGEN_X = 2      # px de aire a cada lado


def main():
    datos = json.load(open(os.path.join(ORIGEN, 'datos.json')))
    salida = {}
    for anim, v in datos['anims'].items():
        os.makedirs(os.path.join(SALIDA, anim), exist_ok=True)
        ancla = v['ancla']
        frames = []
        # Escala UNICA por animacion, la menor de:
        #   - la del alto cabeza-pies (misma altura que el modelo oficial),
        #   - la que hace que la figura ENTERA quepa a lo ancho (coleta incluida).
        # Una sola escala para todos los frames: si cada frame se escalara por su cuenta,
        # la figura cambiaria de tamano y la animacion botaria.
        #
        # Antes se anclaba la cabeza en x=48 y, con el cuerpo agachado y la coleta abierta
        # (405 px de ancho), 15 px de coleta se salian del lienzo en los 8 frames. Se
        # prefiere bajar la escala un poco (0,227 en vez de 0,244) y que no se corte nada:
        # la coleta es parte del diseno aprobado.
        alto_cab = PIES_Y - CABEZA_Y
        anchos, alturas = [], []
        for f in v['frames']:
            with Image.open(os.path.join(ORIGEN, f['fichero'])) as src:
                sp = src.convert('RGBA')
            bb = sp.getbbox()
            anchos.append(sp.size[0])      # el lienzo entero se escala, no solo la tinta
            alturas.append(bb[3] - ancla[1])
        e_alto = alto_cab / max(1, max(alturas))
        e_ancho = (LIENZO[0] - 2 * MARGEN_X) / max(1, max(anchos))
        escala = min(e_alto, e_ancho)
        for f in v['frames']:
            with Image.open(os.path.join(ORIGEN, f['fichero'])) as src:
                sp = src.convert('RGBA')
            w = max(1, round(sp.size[0] * escala))
            h = max(1, round(sp.size[1] * escala))
            chico = sp.resize((w, h), Image.LANCZOS)   # promedio: disuelve el antialias
            dx = MARGEN_X                             # izquierda fija: nada se sale
            # Se ancla por los PIES (PIES_Y=146), no por la cabeza: es lo que hace que el
            # personaje quede de pie en el suelo del juego y lo que evita que la coleta se
            # salga por arriba cuando la pose es mas alta que el ancla escalada.
            bb = sp.getbbox()
            dy = int(round(PIES_Y - bb[3] * escala))
            lienzo = Image.new('RGBA', LIENZO, (0, 0, 0, 0))
            lienzo.alpha_composite(chico, (dx, dy))
            p = os.path.join(SALIDA, anim, 'f%02d.png' % f['i'])
            lienzo.save(p)
            box = lienzo.getbbox()
            frames.append({'i': f['i'], 'fichero': '%s/f%02d.png' % (anim, f['i']),
                           'escala': round(escala, 3), 'sprite': [w, h],
                           'cortado': bool(box and (box[0] <= 0 or box[1] <= 0
                                                    or box[2] >= LIENZO[0] or box[3] >= LIENZO[1])),
                           'cabeza_x': round(dx + ancla[0] * escala, 1),
                           'bbox': list(box) if box else None})
        salida[anim] = {'lienzo': list(LIENZO), 'ancla': [CABEZA_X, CABEZA_Y],
                        'pies_y': PIES_Y, 'escala': round(escala, 3), 'frames': frames}
        print('%-7s %d frames -> %dx%d | escala %.3f (alto %.3f, ancho %.3f) | cortados %d'
              % (anim, len(frames), LIENZO[0], LIENZO[1], escala, e_alto, e_ancho,
                 sum(1 for f in frames if f['cortado'])))
    with open(os.path.join(SALIDA, 'datos.json'), 'w') as fh:
        json.dump({'lienzo': list(LIENZO), 'filtro': 'LANCZOS (reduccion de ilustracion)',
                   'anims': salida}, fh, indent=1)


if __name__ == '__main__':
    main()

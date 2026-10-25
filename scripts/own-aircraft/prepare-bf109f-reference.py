"""Extracts the Bf 109 F reference views from the user's PDF (export of the German Wikipedia
article "Messerschmitt Bf 109", 2010-02-24, 51 pages) without altering any pixel:
  page 16 image 0  "Abb. 16: Bf 109 F-2"  = Bf109F_3Seiten_neu.jpg, B. Huber, CC BY-SA 2.0
  page 44 image 1  "Abb. 53: Bf 109 F-2, Stab/JG 51, Moelders, Juni 1941"
                   = Bf109F-2_Moelders_JG51_kl96.jpg, Herbert Ringlstetter, CC BY-SA 2.5
Writes app/model-candidates/references/bf109f2/{side,top,front,livery}.png (crops; the plan
view rotated a quarter turn so the nose points up) and reports the measured extents used for
calibration.  python3 -I scripts/own-aircraft/prepare-bf109f-reference.py Me_109.pdf
"""
import sys, hashlib, json
from pathlib import Path
import numpy as np
import pymupdf
from PIL import Image

PDF_SHA256 = '8d336841232d394f96ac883270ad0f9157dd7466297754fa5c91f78ef0ee33d6'
OUT = Path(__file__).resolve().parents[2] / 'app/model-candidates/references/bf109f2'
pdf = Path(sys.argv[1])
digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
if digest != PDF_SHA256:
    sys.exit(f'unexpected PDF {digest}')
doc = pymupdf.open(pdf)

def image(page, index):
    xref = doc[page - 1].get_images(full=True)[index][0]
    pix = pymupdf.Pixmap(doc, xref)
    if pix.n - pix.alpha > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)

three = image(16, 0)
OUT.mkdir(parents=True, exist_ok=True)
# The three views share one sheet: side view top right, plan view left (nose left), front view
# bottom right. Plan view pixels inside the other views' rectangles are left white.
side = three.crop((285, 20, 760, 190))
plan = three.copy()
plan.paste((255, 255, 255), (255, 0, 800, 200))
plan.paste((255, 255, 255), (240, 360, 800, 558))
plan = plan.crop((5, 10, 470, 555)).rotate(-90, expand=True)   # nose up, starboard right
front = three.crop((240, 370, 790, 545))
livery = image(44, 1)
for name, im in [('side', side), ('top', plan), ('front', front), ('livery', livery)]:
    im.save(OUT / f'{name}.png', optimize=True)

def extent(im, thr=215):
    a = np.asarray(im.convert('L')) < thr
    ys, xs = np.nonzero(a)
    return dict(x=[int(xs.min()), int(xs.max())], y=[int(ys.min()), int(ys.max())])
print(json.dumps({n: extent(Image.open(OUT / f'{n}.png')) for n in ['side', 'top', 'front']}))
print(json.dumps({n: hashlib.sha256((OUT / f'{n}.png').read_bytes()).hexdigest() for n in ['side', 'top', 'front', 'livery']}))

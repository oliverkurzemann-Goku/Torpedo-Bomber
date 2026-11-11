"""Rebuild the original ground scenery with Blender 4.3+.

blender -b -t 4 --python scripts/build-ground-models.py -- --preview /tmp/ground-review
Blender coordinates: +Y rear, +Z up. GLB: +Z forward, +Y up.
"""
import argparse
import json
import math
from pathlib import Path
import random
import struct
import sys
import tempfile

import bpy
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OPTIONS = argparse.ArgumentParser()
OPTIONS.add_argument("--preview", type=Path)
OPTIONS.add_argument("--only", nargs="+")
ARGS = OPTIONS.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
TILE = 128
FINISHES = ("body", "trim", "rubber", "iron", "wood", "black", "glass", "mark",
            "earth", "brick", "roof", "plaster", "stone", "rust", "canvas", "lamp")
COMMON = ("55514a", "252525", "393a37", "6b5140", "222a27", "566d6c", "e4dcc1",
          "665642", "904839", "684032", "c4b99d", "858177", "83412f", "827958", "ccb074")
METRIC_UV = {"roof": 1.8, "brick": 1.6, "plaster": 3.6, "stone": 2.7, "wood": 1.5,
             "earth": 2.9, "rust": 2.4, "rubber": 1.9, "iron": 2.1}
parts = []


def shape(vertices, faces, finish, name="Panel"):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [tuple(face) for face in faces])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    parts.append((obj, finish))
    return obj


def ring(points, bottom, top, finish, name="Hull"):
    n = len(points)
    return shape([(x, y, z) for z in (bottom, top) for x, y in points],
                 [tuple(reversed(range(n))), tuple(range(n, n * 2))]
                 + [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)], finish, name)


def rounded(w, length, corner, x=0, y=0):
    a, b = w / 2, length / 2
    return [(x + u, y + v) for u, v in [(-a + corner, -b), (a - corner, -b),
            (a, -b + corner), (a, b - corner), (a - corner, b), (-a + corner, b),
            (-a, b - corner), (-a, -b + corner)]]


def bevel(w, length, h, x, y, z, r, finish, name="Casting"):
    return sections([(z - h / 2, w - 2*r, length - 2*r, r/2, x, y),
                     (z - h / 2 + r, w, length, r, x, y),
                     (z + h / 2 - r, w, length, r, x, y),
                     (z + h / 2, w - 2*r, length - 2*r, r/2, x, y)], finish, name)


def sections(rows, finish, name="Shell"):
    vertices = [(x, y, z) for z, w, length, corner, cx, cy in rows
                for x, y in rounded(w, length, corner, cx, cy)]
    return shape(vertices, [tuple(reversed(range(8))),
                 tuple(range(len(vertices)-8, len(vertices)))] +
                 [(i+j, i+(j+1)%8, i+(j+1)%8+8, i+j+8)
                  for i in range(0, len(vertices)-8, 8) for j in range(8)], finish, name)


def box(w, length, h, x, y, z, finish, name="Panel"):
    a,b=w/2,length/2
    return ring([(x-a,y-b),(x+a,y-b),(x+a,y+b),(x-a,y+b)],z-h/2,z+h/2,finish,name)


def prism(points, near, far, finish, name="Profile"):
    # Polygon points in (x, z) ordered counterclockwise in that plane.
    n = len(points)
    return shape([(x, y, z) for y in (near, far) for x, z in points],
                 [tuple(range(n)), tuple(reversed(range(n, 2*n)))] +
                 [(i, i+n, (i+1)%n+n, (i+1)%n) for i in range(n)], finish, name)


def tube(a, b, r, finish, radius_end=None, sides=12, name="Tube"):
    a, b = Vector(a), Vector(b)
    axis = (b-a).normalized()
    u = axis.cross(Vector((0, 0, 1)))
    if u.length < .01:
        u = axis.cross(Vector((1, 0, 0)))
    u.normalize()
    v = axis.cross(u)
    points = [math.cos(2*math.pi*i/sides)*u + math.sin(2*math.pi*i/sides)*v for i in range(sides)]
    obj = shape([tuple(p + q * radius) for p, radius in [(a,r), (b,r if radius_end is None else radius_end)]
                 for q in points], [tuple(reversed(range(sides))), tuple(range(sides,2*sides))] +
                 [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)], finish, name)
    for face in obj.data.polygons[2:]:
        face.use_smooth = True
    return obj


def wheel(x, y, z, r, width, finish="body", tire="rubber", hub=True):
    tube((x-width/2,y,z),(x+width/2,y,z),r,tire,sides=16,name="Tyre or roadwheel rim")
    if hub:
        tube((x-width/2-.013,y,z),(x+width/2+.013,y,z),r*.82,finish,sides=16,name="Pressed hub")
        tube((x-width/2-.032,y,z),(x+width/2+.032,y,z),r*.24,"iron",sides=8,name="Hub cap")


def track(x, front, rear, radius, width, count, offset=0):
    path = []
    steps = 7
    for i in range(steps+1):
        a = math.pi*i/steps
        path.append((rear+radius*math.sin(a), radius+radius*math.cos(a)))
    for i in range(steps+1):
        a = math.pi+math.pi*i/steps
        path.append((front+radius*math.sin(a), radius+radius*math.cos(a)))
    n = len(path)
    points = [(x+s*width/2, y, z) for s in (-1,1) for y,z in path]
    points += [(x+s*width/2, y+(front+rear-2*y)*.012, radius+(z-radius)*.85)
               for s in (-1,1) for y,z in path]
    faces = []
    for i in range(n):
        j = (i+1)%n
        faces += [(i,j,j+n,i+n),(2*n+i,3*n+i,3*n+j,2*n+j),
                  (i,2*n+i,2*n+j,j),(i+n,j+n,3*n+j,3*n+i)]
    shape(points, [tuple(reversed(face)) for face in faces], "iron", "Continuous track")
    for centre, angle0 in ((rear,0),(front,math.pi)):
        for j in range(1,7):
            angle=angle0+j*math.pi/7
            mark=box(width+.021,.066,.028,0,0,0,"trim","Bent track shoe")
            mark.location=(x,centre+radius*math.sin(angle),radius+radius*math.cos(angle))
            mark.rotation_euler.x=-angle
    for end in (0, 2*radius):
        for i in range(count):
            y = front+(rear-front)*(i+.3)/(count-.4)
            box(width+.018,.049,.028,x,y,max(.015,end),"earth" if (i+offset)%5==0 else "trim","Tread bar")


def tank_running(length, width, radius, wheel_count, interleaved=False, sherman=False):
    front, rear = -length/2+radius, length/2-radius
    tw = .43 if sherman else width*.19
    for side in (-1,1):
        x = side*(width/2-tw/2)
        track(x, front, rear, radius, tw, 23 if length<7 else 28, side)
        for i in range(wheel_count):
            y = front + (i+1)/(wheel_count+1)*(rear-front)
            wheel(x + (side*.06 if interleaved and i%2 else 0),y,radius*.74,radius*.72,tw*.62)
            if sherman and i%2==0:
                bevel(.20,.58,.29,x+side*.115,y+.18,.71,.065,"body","Suspension bogie")
                wheel(x,y+.14,.87,.115,tw*.49)
        for y in (front,rear):
            wheel(x,y,radius,radius*.87,tw*.72,"trim","iron")


def hatch(x,y,z,r=.29,finish="trim"):
    tube((x,y,z),(x,y,z+.077),r,finish,sides=12,name="Hatch")
    box(.10,.20,.044,x,y,z+.09,"iron","Hatch handle")


def stars(x,y,z,r):
    pts = [(x+math.sin(i*math.pi/5)*r*(1 if i%2==0 else .42),
            y+math.cos(i*math.pi/5)*r*(1 if i%2==0 else .42),z) for i in range(10)]
    shape(pts,[tuple(reversed(range(10)))],"mark","Painted star")


def deck_vents(x,y,z,w,n=8):
    for i in range(n):
        box(w,.039,.024,x,y+i*.079,z,"black","Vent slot")


def shovel(x,y,z):
    tube((x,y,z),(x,y+.8,z+.04),.023,"wood",sides=6,name="Tool handle")
    bevel(.19,.27,.054,x,y+.84,z+.03,.022,"iron","Tool blade")


def tank_details(w,l,z,headlight=None):
    nose,base_z=headlight or (-l*.47,z)
    for x in (-w*.38,w*.38):
        bevel(.27,.35,.18,x,nose,base_z+.085,.052,"trim","Headlight shell")
        tube((x,nose-.18,base_z+.08),(x,nose-.195,base_z+.08),.067,"lamp",sides=10)
        box(.40,.52,.075,x,nose,base_z-.095,"trim","Mudguard")
        shovel(x,l*.26,z+.02)
        for y in (-l*.32,l*.33):
            tube((x,y,z),(x,y,z+.07),.062,"iron",sides=8,name="Lifting eye")
    for x in (-w*.30,w*.30):
        deck_vents(x,l*.33,z+.014,w*.24,6)
    for x in (-w*.32,w*.32):
        box(.38,.40,.37,x,l*.445,z-.16,"trim","Rear stowage")


def barrel(z,y,rear,front,r,brake=True,x=0):
    tube((x,y,z),(x,rear,z),r*1.34,"trim",sides=12,name="Gun collar")
    tube((x,rear,z),(x,front,z),r,"body",r*.73,sides=12,name="Exterior gun tube")
    if brake:
        bevel(r*2.65,.33,r*2.30,x,front+.04,z,.043,"trim","Muzzle silhouette")
        box(r*2.69,.13,r*.63,x,front+.04,z,"black","Brake slot")
    tube((x,front-.118,z),(x,front-.127,z),r*.55,"black",sides=10,name="Shadowed end")


def stencil(x,y,z,side):
    glyphs=["111 001 111 100 111","010 110 010 010 111","101 101 111 001 001"]
    vertices,faces=[],[]
    for n,glyph in enumerate(glyphs if side>0 else reversed(glyphs)):
        for row,line in enumerate(glyph.split()):
            for col,ink in enumerate(line if side>0 else reversed(line)):
                if ink=="0":
                    continue
                a=y+(.052*(4*n+col))
                b=z+.052*(4-row)
                offset=len(vertices)
                vertices += [(x,a,b),(x,a+.052,b),(x,a+.052,b+.052),(x,a,b+.052)]
                faces.append(tuple(range(offset,offset+4)) if side>0 else tuple(reversed(range(offset,offset+4))))
    shape(vertices,faces,"mark","Period-inspired tactical stencil")


def tiger():
    w,l=3.55,6.30
    tank_running(l,w,.55,8,True)
    sections([(.63,2.70,5.90,.14,0,0),(1.18,2.87,6.14,.14,0,0),
              (1.30,3.51,6.18,.13,0,0),(2.03,3.49,5.99,.15,0,.05)],"body","Tiger vertical hull")
    for x in (-1.69,1.69):
        box(.24,5.78,.09,x,0,1.25,"trim","Full-length side skirts")
    turret=[(-1.04,-1.18),(1.04,-1.18),(1.21,-.55),(1.21,.59),(.94,1.03),(.51,1.18),
            (-.55,1.18),(-.97,1.02),(-1.21,.60),(-1.21,-.55)]
    ring(turret,2.02,2.82,"body","Tiger horseshoe turret")
    bevel(1.27,.35,.64,0,-1.23,2.43,.12,"body","Rounded mantlet")
    bevel(1.60,.45,.44,0,1.37,2.43,.075,"trim","Turret stowage bin")
    tube((-.62,.38,2.80),(-.62,.38,2.99),.325,"body",sides=16,name="Raised commander's cupola")
    hatch(-.62,.38,2.98,.29)
    hatch(.52,.19,2.81,.26)
    bevel(.36,.25,.30,.66,-2.96,1.62,.07,"body","Bow ball mount")
    tube((.66,-3.06,1.62),(.66,-3.29,1.62),.027,"iron",sides=9)
    box(.47,.09,.17,-.62,-2.96,1.72,"trim","Driver's visor")
    box(.32,.10,.044,-.62,-2.986,1.72,"black","Visor slit")
    for side in (-1,1):
        stencil(side*1.212,-.48,2.33,side)
        for i in range(5):
            x=side*1.66
            box(.10,.51,.046,x,-1.20+i*.53,1.34,"iron","Spare track links on skirt")
    barrel(2.43,-1.30,-1.75,-4.88,.10)
    tank_details(w,l,2.03)
    for x in (-.52,.52):
        tube((x,3.01,1.16),(x,3.01,1.83),.14,"rust",sides=9,name="Vertical rear exhaust")


def sherman():
    w,l=2.65,5.84
    tank_running(l,w,.43,6,sherman=True)
    sections([(.53,1.96,5.45,.29,0,.02),(.86,2.46,5.67,.47,0,.02),
              (1.26,2.65,5.81,.53,0,.02),(1.68,2.58,5.52,.67,0,.13),
              (1.92,2.29,4.96,.55,0,.26)],"body","Rounded cast M4A1 hull")
    sections([(1.88,1.74,2.12,.42,0,-.11),(2.10,2.03,2.42,.63,0,-.06),
              (2.60,1.89,2.26,.57,0,.02),(2.77,1.57,1.97,.48,0,.12)],
             "body","T23 turret and bustle")
    bevel(.92,.44,.48,0,-1.26,2.33,.15,"body","M62 exterior mantlet")
    hatch(.47,.16,2.77,.24);hatch(-.45,.30,2.77,.31)
    hatch(-.48,-1.53,1.92,.25);hatch(.48,-1.53,1.92,.25)
    barrel(2.34,-1.34,-1.68,-4.58,.079,False)
    stars(0,.82,2.774,.43);tank_details(w,l,1.92,(-2.47,1.45))
    for x in (-.83,.83):
        bevel(.39,.63,.34,x,1.73,2.06,.087,"canvas","Canvas stowage bundle")
        box(.33,.46,.32,x,2.23,2.06,"wood","Rear crate")


def jagdpanther():
    w,l=3.31,6.71
    tank_running(l,w,.47,8,True)
    sections([(.55,2.49,6.12,.13,0,.02),(1.02,2.62,6.52,.18,0,0),
              (1.17,3.31,6.62,.13,0,0),(1.55,3.21,6.45,.18,0,.02),
              (2.62,2.07,3.40,.22,0,.02)],"body","Unified sloped fighting compartment")
    bevel(.69,.34,.57,0,-2.35,1.93,.09,"body","Armoured gun surround")
    barrel(1.98,-2.30,-2.63,-6.46,.105)
    hatch(.58,.22,2.62,.28);hatch(-.49,.19,2.62,.26)
    box(.70,.91,.06,-.55,.68,2.66,"trim","Rear roof access panel")
    for s in (-1,1):
        for j in range(6):
            box(.065,.67,.34,s*1.66,-2.03+j*.72,1.03,"trim","Individual side skirt")
        box(.28,.96,.31,s*1.05,2.58,1.46,"wood","Rear gear chest")
    tank_details(w,l,1.60)


def maus():
    w,l=3.68,9.04
    tank_running(l,w,.52,12)
    sections([(.53,3.34,8.27,.16,0,.08),(1.09,3.62,9.00,.12,0,0),
              (1.79,3.67,8.97,.11,0,0),(2.09,3.59,8.28,.17,0,.19)],
             "body","Long super-heavy chassis")
    for x in (-1.81,1.81):
        for i in range(6):
            box(.09,1.32,.77,x,-3.52+1.39*i,1.08,"body","Full-height track armour")
    sections([(2.08,3.05,3.71,.38,0,.91),(2.37,3.23,3.81,.40,0,.91),
              (3.45,3.12,3.52,.34,0,1.04),(3.59,2.87,3.27,.33,0,1.04)],
             "body","Tall rear turret")
    bevel(1.63,.41,.86,0,-1.03,2.84,.15,"body","Broad curved mantlet")
    barrel(2.86,-1.03,-1.49,-5.66,.142,False)
    barrel(2.84,-1.11,-1.37,-2.63,.069,False,x=.48)
    hatch(-.74,1.03,3.58,.32);hatch(.62,1.66,3.58,.31)
    tank_details(w,l,2.11)
    for x in (-.95,.95):
        deck_vents(x,-2.95,2.12,1.20,13)


def halftrack(m16):
    w,l=(2.18,6.45) if m16 else (2.64,8.70)
    fr,rr=-l*.36,l*.42
    body_z=1.09 if m16 else 1.36
    for s in (-1,1):
        x=s*w*.36
        wheel(x,fr,.48 if m16 else .63,.48 if m16 else .63,w*.17,"body")
        radius=.385 if m16 else .53
        front=-l*.02 if m16 else -l*.10
        track(x,front,rr,radius,w*.205,13 if m16 else 19)
        for j in range(4 if m16 else 7):
            y=front+(rr-front)*(j+1)/(5 if m16 else 8)
            wheel(x,y,radius*.80,radius*.72,w*.134)
        for y in (front,rr):
            wheel(x,y,radius,radius*.86,w*.144,"trim","iron")
        bevel(w*.26,l*.22,.15,s*w*.40,fr,body_z,.06,"body","Front mudguard")
    bevel(w*.78,l*.91,.44,0,0,body_z,.08,"body","Lower chassis")
    hood_y=-l*.34
    bevel(w*.57,l*.26,.58,0,hood_y,body_z+.38,.085,"body","Bonnet")
    for x in (-w*.30,w*.30):
        for j in range(5):
            box(.034,.047,.17,x,hood_y-.40+j*.12,body_z+.38,"black","Bonnet louver")
    cab_y=-l*.126
    bevel(w*.83,l*.17,.48,0,cab_y,body_z+.34,.08,"body","Cab doors and cowl")
    for x in (-w*.30,w*.30):
        box(w*.23,.47,.21,x,cab_y+.20,body_z+.55,"canvas","Cab seat")
    glass_z=body_z+.78
    for x in (-w*.19,w*.19):
        box(w*.37,.10,.40,x,cab_y-l*.063,glass_z,"trim","Armoured windscreen surround")
        box(w*.32,.12,.24,x,cab_y-l*.064,glass_z,"glass" if m16 else "black","Vision inset")
    if not m16:
        bevel(w*.82,l*.17,.13,0,cab_y,glass_z+.30,.05,"body","Armoured cab roof")
        for s in (-1,1):
            box(.09,l*.12,.38,s*w*.389,cab_y,glass_z,"body","Armoured cab side")
    for x in (-w*.40,w*.40):
        tube((x,-l*.431,body_z+.16),(x,-l*.47,body_z+.16),.105,"lamp",sides=12,name="Headlight")
    box(w*.60,.10,.33,0,-l*.475,body_z+.29,"black","Radiator recess")
    for j in range(9):
        box(.024,.042,.29,-w*.26+j*w*.065,-l*.529,body_z+.29,"trim","Grille bar")
    box(w*.90,.18,.13,0,-l*.487,body_z-.09,"iron","Front bumper")
    deck=body_z+.24
    box(w*.94,l*.53,.11,0,l*.223,deck,"iron","Open rear floor")
    for s in (-1,1):
        box(.085,l*.52,.46 if m16 else .28,s*w*.46,l*.223,deck+.23,"body","Folded rear side plate")
        box(.17,.63,.28,s*w*.36,l*.405,deck+.24,"wood","Rear storage box")
    box(w*.94,.13,.40,0,l*.475,deck+.23,"body","Tailgate")
    mount_y=l*.22
    tube((0,mount_y,deck),(0,mount_y,deck+.53),.41,"trim",sides=14,name="Display turret base")
    if m16:
        bevel(1.01,.85,.37,0,mount_y,deck+.65,.12,"body","M45 mount exterior")
        bevel(.61,.36,.71,0,mount_y-.35,deck+.79,.08,"body","Rounded centre shield")
        for s in (-1,1):
            for j in (0,1):
                x=s*(.52+.10*j); z=deck+.62+.33*j
                bevel(.25,.52,.22,x,mount_y,z,.052,"trim","Outer gun cover")
                tube((x,mount_y-.16,z),(x,mount_y-1.08,z+.18),.035,"iron",sides=10)
            bevel(.29,.52,.36,s*.61,mount_y+.22,deck+.56,.045,"canvas","Side box")
        stars(0,hood_y,body_z+.674,.37)
    else:
        bevel(1.42,.30,.90,0,mount_y-.50,deck+1.03,.085,"body","High clipped gun shield")
        bevel(.49,.74,.49,0,mount_y,deck+1.03,.08,"iron","Gun exterior cradle")
        tube((0,mount_y+.10,deck+1.00),(0,mount_y-2.45,deck+1.69),.105,"body",.074)
        tube((0,mount_y-2.40,deck+1.68),(0,mount_y-2.50,deck+1.71),.054,"black")
        for x in (-.66,.66):
            box(.30,.82,.28,x,mount_y+.75,deck+.18,"trim","Platform bracing")


def ford():
    for x in (-.80,.80):
        for y in (-1.42,1.39):
            wheel(x,y,.36,.36,.174,"trim","rubber",False)
            tube((x-.102,y,.36),(x+.102,y,.36),.19,"iron",sides=16,name="Painted wheel disc")
            tube((x-.113,y,.36),(x+.113,y,.36),.107,"mark",sides=14,name="Hubcap")
    sections([(.34,1.56,4.34,.26,0,.01),(.57,1.76,4.67,.36,0,0),
              (.89,1.77,4.69,.44,0,.04),(1.04,1.57,4.30,.55,0,.03)],"body","Rounded sedan body")
    sections([(.92,1.48,2.50,.32,0,.24),(1.31,1.40,1.92,.31,0,.17),
              (1.62,1.25,1.43,.30,0,.18),(1.68,1.12,1.19,.22,0,.18)],"body","Swept roof")
    for s in (-1,1):
        for y in (-1.42,1.37):
            bevel(.45,1.26,.44,s*.73,y,.75,.159,"body","Pontoon fender")
        for y in (-.20,.53):
            face=[(s*.751,y-.33,1.04),(s*.751,y+.33,1.04),
                  (s*.680,y+.27,1.49),(s*.680,y-.25,1.49)]
            shape(face,[tuple(range(4)) if s==1 else (3,2,1,0)],"glass","Side glass")
        for y in (-.08,.64):
            box(.028,.11,.027,s*.887,y,.91,"mark","Door handle")
        tube((s*.892,-1.19,.57),(s*.892,1.11,.57),.029,"trim",sides=8,name="Running board trim")
        tube((s*.64,-2.003,.77),(s*.64,-2.106,.77),.134,"lamp",sides=14,name="Teardrop headlamp")
        box(.11,.055,.13,s*.61,2.16,.70,"rust","Tail lamp")
    for y,top,sign in [(-1.012,-.684,1),(1.463,1.037,-1)]:
        face=[(-.54,y,.995),(.54,y,.995),(.48,top,1.49),(-.48,top,1.49)]
        shape(face,[(0,1,2,3) if sign>0 else (3,2,1,0)],"glass","Raked windshield")
    bevel(.54,1.13,.34,0,-1.69,.97,.143,"body","Long tapered bonnet")
    bevel(.52,.26,.50,0,-2.21,.69,.115,"trim","Central grille")
    for j in range(9):
        x=(j-4)*.047
        box(.018,.025,.36,x,-2.328+.28*abs(x),.68,"mark","Grille brightwork")
    for y in (-2.32,2.29):
        bevel(1.59,.13,.10,0,y,.42,.04,"mark","Chromed bumper")
    box(.27,.029,.095,0,2.364,.60,"mark","Number plate")


def train():
    length=14.25
    box(2.65,length-.55,.44,0,-4.55,1.29,"rust","Locomotive running plate")
    for s in (-1,1):
        for y,r in [(-10.4,.43),(-9.14,.43),(-6.86,.99),(-4.78,.99),(-2.70,.99),(-.56,.51)]:
            wheel(s*.81,y,r,r,.22,"rust","iron",False)
            for i in range(10):
                a=i*math.tau/10
                tube((s*.945,y,r),(s*.945,y+math.cos(a)*r*.90,r+math.sin(a)*r*.90),.029,"rust",sides=5)
        tube((s*1.02,-6.9,.72),(s*1.02,-2.6,.72),.064,"iron",sides=7,name="Connecting rod silhouette")
        tube((s*1.07,-8.82,.80),(s*1.07,-5.82,1.13),.046,"iron",sides=7)
        bevel(.48,1.43,.58,s*1.13,-8.2,1.02,.06,"body","Cylinder casing")
    tube((0,-10.77,2.64),(0,-1.50,2.64),1.04,"body",sides=24,name="Locomotive boiler")
    tube((0,-11.34,2.64),(0,-10.64,2.64),1.04,"black",sides=24,name="Smokebox")
    tube((0,-11.41,2.64),(0,-11.32,2.64),.85,"iron",sides=24,name="Smokebox door")
    tube((0,-10.47,3.56),(0,-10.47,4.33),.244,"body",.178,sides=16,name="Stack")
    tube((0,-10.47,4.25),(0,-10.47,4.36),.235,"black",sides=16)
    for y, r in [(-6.49,.28),(-4.29,.32),(-2.72,.21)]:
        tube((0,y,3.53),(0,y,4.02),r,"body",r*.83,sides=16,name="Boiler dome")
    for y in (-8.9,-7.2,-5.2,-3.4):
        tube((0,y,2.64),(0,y+.059,2.64),1.047,"trim",sides=24,name="Boiler band")
    for s in (-1,1):
        box(.11,2.46,2.27,s*1.26,-.42,2.62,"body","Cab side")
        box(.028,1.13,.75,s*1.327,-.53,3.16,"glass","Cab glazing")
        tube((s*1.11,-10.95,1.77),(s*1.11,-.30,1.77),.032,"iron",sides=7)
        for y in (-11.64,11.85):
            tube((s*.75,y,1.13),(s*.75,y+.20,1.13),.155,"trim",sides=12,name="Buffer")
            if y<0:
                tube((s*.68,y,1.72),(s*.68,y+.15,1.72),.12,"lamp",sides=12)
    bevel(2.80,2.77,.31,0,-.40,3.97,.14,"body","Curved cab roof")
    bevel(2.69,9.68,.44,0,6.79,1.25,.09,"rust","Tender underframe")
    bevel(2.80,9.38,1.50,0,6.81,2.19,.15,"body","Long separate tender")
    bevel(2.46,5.29,.33,0,5.07,2.98,.13,"black","Coal bunker")
    rng=random.Random(30)
    for _ in range(100):
        x,y=rng.uniform(-1.10,1.10),rng.uniform(2.62,7.52)
        r=rng.uniform(.075,.16)
        ring(rounded(r*2,r*1.7,r*.32,x,y),3.06,3.11+r*.77,"black","Coal lump")
    for s in (-1,1):
        for y in (3.28,4.55,8.93,10.21):
            wheel(s*.84,y,.52,.52,.24,"rust","iron")
    box(1.21,.05,.24,0,-11.48,2.30,"trim","Front plate")
    # A partial period-inspired fairing frames the running gear and boiler.
    for side in (-1,1):
        x=side*1.08
        box(.26,8.95,.34,x,-5.95,1.58,"body","Side streamlining")
        box(.11,7.82,.39,x,-5.71,3.22,"body","Upper fairing lip")
    bevel(2.53,.73,.39,0,-10.86,1.64,.11,"body","Tapered apron")


def gable(w,d,eaves,rise,x=0,y=0,finish="roof"):
    a,b=w/2,d/2
    v=[(x+i,y+j,z) for j in (-b,b) for i,z in [(-a,eaves),(0,eaves+rise),(a,eaves)]]
    shape(v,[(0,1,4,3),(1,2,5,4)],finish,"Roof pitches")
    tube((x,y-b,eaves+rise),(x,y+b,eaves+rise),.078,finish,sides=8,name="Ridge cap")
    for j in (-b,b):
        prism([(x-a,eaves-.10),(x+a,eaves-.10),(x,eaves+rise-.06)],
              y+j-.055,y+j+.055,"wood","Gable verge")


def facade(w,d,x,y,z0,z1,finish,opening_list=()):
    """Front wall openings as actual holes, with adjacent masonry piers."""
    levels=sorted(set([z0,z1]+[z for _,_,lo,hi in opening_list for z in (lo,hi)]))
    for lo,hi in zip(levels,levels[1:]):
        ends=[(x-w/2,x+w/2)]
        for left,right,bottom,top in sorted(opening_list):
            if lo < bottom or hi > top:
                continue
            ends=[interval for a,b in ends for interval in
                  ([(a,left),(right,b)] if a < right and b > left else [(a,b)]) if interval[1]>interval[0]+.002]
        for a,b in ends:
            box(b-a,d,hi-lo,(a+b)/2,y,(lo+hi)/2,finish,"Masonry between openings")


def window(x,y,z,w=.78,h=1.05,depth=.18,finish="wood",pane="glass",shutters=False):
    box(w,depth,h,x,y+.035,z,"black","Window reveal")
    if pane:
        box(w*.88,.024,h*.86,x,y-depth*.44,z,pane,"Recessed glazing")
    for side in (-1,1):
        box(.067,.10,h,x+side*w/2,y-.077,z,finish,"Jamb")
        box(w+.13,.13,.080,x,y-.10,z+side*h/2,finish,"Lintel and sill")
        if shutters:
            box(.28,.068,h*.93,x+side*(w*.5+.18),y-.10,z,"trim","Shutter")
    box(.048,.07,h,x,y-.11,z,finish,"Mullion")
    box(w,.072,.047,x,y-.11,z,finish,"Transom")


def house():
    w,d,h=7.6,10.2,4.64
    box(w+.24,d+.24,.29,0,0,.145,"stone","Foundation")
    for y in (-d/2,d/2):
        facade(w,.30,0,y,.27,h,"plaster",[(x-.43,x+.43,z-.56,z+.56) for x in (-2.30,0,2.30) for z in (1.36,3.58) if (x,z)!=(0,1.36)]+[(-.59,.59,.27,2.15)])
        for x in (-2.3,0,2.3):
            for z in (1.36,3.58):
                if x or z>2:
                    window(x,y-math.copysign(-.03,y),z,shutters=True)
        box(1.13,.18,1.89,0,y,1.21,"wood","Boarded entrance")
        box(1.50,.40,.15,0,y*1.045,.075,"stone","Entrance step")
    for s in (-1,1):
        x=s*(w/2-.15)
        box(.30,d-.30,h-.27,x,0,(h+.27)/2,"plaster","Side wall")
        for y in (-2.56,1.88):
            for z in (1.5,3.62):
                at=len(parts);window(0,0,z,shutters=True)
                for obj,_ in parts[at:]:
                    obj.rotation_euler.z=s*math.pi/2
                    obj.location.x=s*w/2
                    obj.location.y=y
    for y in (-d/2,d/2):
        prism([(-w/2,h),(w/2,h),(0,h+2.67)],y-.14,y+.14,"plaster","Rendered gable")
        if y<0:
            window(0,y-.18,h+.94,.58,.63)
    gable(w+.58,d+.55,h+.09,2.72)
    for x,y in [(1.61,-1.91),(-1.28,3.42)]:
        box(.55,.64,1.33,x,y,6.88,"brick","Chimney")
        box(.68,.75,.11,x,y,7.56,"stone","Chimney cap")


def rubble(x,y,amount,seed,finish):
    rng=random.Random(seed)
    for i in range(amount):
        xx,yy=x+rng.uniform(-1.21,1.21),y+rng.uniform(-.85,.85)
        w,d,h=rng.uniform(.09,.39),rng.uniform(.12,.47),rng.uniform(.06,.28)
        piece=bevel(w,d,h,0,0,h/2,min(w,d,h)*.24,finish if i%3 else "earth","Rubble")
        piece.location=(xx,yy,0)
        piece.rotation_euler.z=rng.uniform(-math.pi,math.pi)


def jagged_wall(w,d,x,y,heights,finish):
    n=len(heights)
    xs=[x-w/2+w*i/(n-1) for i in range(n)]
    profile=[(xs[0],.16),(xs[-1],.16)]+list(reversed(list(zip(xs,heights))))
    return prism(profile,y-d/2,y+d/2,finish,"Broken wall crest")


def farm_ruin():
    box(10.1,12.1,.16,0,0,.08,"earth","Debris foundation")
    jagged_wall(9.3,.41,0,5.45,[2.22,3.42,4.11,5.01,4.02,3.42,2.1,2.91,2.63],"stone")
    facade(9.3,.41,0,-5.45,.16,2.79,"stone",[(-3.17,-2.18,1.15,2.27),(.19,2.27,.16,2.56)])
    for s in (-1,1):
        obj=jagged_wall(10.6,.39,0,0,[2.79,2.98,2.50,2.81,1.02,1.33,1.79,2.42,2.22],"stone")
        obj.rotation_euler.z=s*math.pi/2
        obj.location.x=s*4.48
    window(-2.67,-5.67,1.71,.97,1.08,pane=None)
    box(2.24,.49,.20,1.24,-5.47,2.63,"wood","Barn-door beam")
    for y in (2.30,3.27,4.18,5.45):
        tube((-4.64,y,2.84),(0,y,5.02),.096,"wood",sides=5,name="Broken rafter")
        tube((0,y,5.02),(2.3,y,3.91),.095,"wood",sides=5)
    shape([(-4.87,2.63,2.85),(-4.87,5.71,2.85),(.05,5.71,5.10),(-.97,3.35,4.60)],
          [(0,3,2,1)],"roof","Surviving roof patch")
    for x,y,seed in [(-2.4,-4.7,48),(3.5,-4.8,52),(-1.0,1.5,97),(3.2,4.9,5)]:
        rubble(x,y,15,seed,"stone")


def town_ruin():
    w,d,h=7.7,9.1,6.45
    box(w+.6,d+.6,.20,0,0,.10,"stone","Cellar plinth")
    facade(w,.34,0,-d/2,.18,4.72,"brick",[(-3.06,-2.09,1.05,2.36),(-.53,.64,.18,2.50),
                                           (2.06,3.05,1.05,2.36),(-3.06,-2.09,3.15,4.36),
                                           (-.50,.50,3.15,4.36),(2.06,3.05,3.15,4.36)])
    for x in (-2.58,2.56,0):
        for z in (1.71,3.76):
            if x or z>2:
                window(x,-d/2-.18,z,.91,1.17,finish="stone",pane=None)
    crest=jagged_wall(w,.34,0,-d/2,[6.45,6.65,6.16,5.20,5.61,5.12,4.92,5.51,5.12],"brick")
    for v in crest.data.vertices:
        if v.co.z<1:
            v.co.z=4.70
    for s in (-1,1):
        obj=jagged_wall(d,.34,0,0,[5.72,4.62,3.38,4.34,2.29,2.91,1.11,2.42] if s>0 else [2.23,2.52,2.95,4.81,5.35,5.85,6.41,6.45],"plaster")
        obj.rotation_euler.z=s*math.pi/2
        obj.location.x=s*(w/2-.12)
    jagged_wall(w,.31,0,d/2,[1.21,1.42,2.40,2.65,1.54,1.23,1.41],"brick")
    for i in range(8):
        x=-3.37+i*.91
        tube((x,-4.44,2.85),(x,-.90-((i*7)%4)*.51,2.85),.079,"wood",sides=6,name="Exposed floor joist")
    for x,y,seed in [(-2.1,-3.7,43),(2.8,1.7,81),(2.5,-3.5,92),(-2.1,3.6,9)]:
        rubble(x,y,20,seed,"brick")


def hangar():
    w,d=29.0,42.0
    profile=[(-14.5,0),(-14.5,6.35),(-13.8,7.55),(-9.3,10.13),(0,13.08),(9.3,10.13),
             (13.8,7.55),(14.5,6.35),(14.5,0)]
    vertices=[(x,y,z) for y in (-d/2,d/2) for x,z in profile]
    n=len(profile)
    shape(vertices,[(i,i+1,i+1+n,i+n) for i in range(n-1)],"body","Segmented corrugated shell")
    shape(vertices,[(n+i for i in reversed(range(n)))],"body","Rear wall")
    y=-d/2
    facade(w,.29,0,y,.08,6.32,"body",[(-9.2,9.2,.08,5.75)])
    prism([(-14.5,6.32),(14.5,6.32),(13.8,7.55),(9.3,10.13),(0,13.08),(-9.3,10.13),(-13.8,7.55)],y-.13,y+.11,"body","Upper face")
    box(18.65,.42,.39,0,y-.20,5.83,"trim","Hangar door track")
    for x in (-8.14,-6.02,-3.9,-1.78,1.78,3.90,6.02,8.14):
        box(2.04,.13,5.53,x,y-.18,2.87,"trim","Sliding shutter segment")
        box(.086,.09,5.45,x+.95,y-.29,2.85,"iron","Door frame rail")
    box(2.60,.1,5.54,0,y+.33,2.85,"black","Dark inner bay")
    box(w+.18,d+.24,.11,0,0,.055,"stone","Concrete slab")
    for s in (-1,1):
        for y in (-15,-8,-1,6,13):
            box(.10,3.43,1.18,s*(w/2+.017),y,4.80,"glass","High side windows")
            for i in range(5):
                box(.13,.045,1.19,s*(w/2+.052),y-1.7+i*.85,4.80,"trim","Window vertical frames")
        for y in range(-20,21,4):
            box(.14,.16,6.3,s*14.51,y,3.19,"trim","External steel ribs")
    for x in (-11.8,11.8):
        box(.95,.14,2.15,x,-d/2-.22,1.19,"iron","Personnel door")


def bunker():
    footprint=[(-4.68,-2.27),(-3.90,-3.15),(-1.59,-3.15),(-1.35,-2.77),(1.57,-2.77),
               (1.90,-3.15),(3.69,-3.15),(4.60,-2.36),(4.46,2.26),(3.60,3.30),
               (-2.93,3.30),(-4.26,2.63)]
    ring(footprint,.06,.83,"stone","Lower concrete skirt")
    ring([(x*.95,y*.96) for x,y in footprint],.82,1.47,"body","Chamfered lower embrasure")
    ring([(x*.975,y*.973) for x,y in footprint],1.83,2.48,"body","Reinforced roof slab")
    ring([(x*.925,y*.92) for x,y in footprint],2.47,2.67,"body","Weathered concrete roof")
    for x in (-3.0,-1.0,1.0,3.0):
        box(.75,5.35,.43,x,0,1.64,"body","Embrasure separation")
    box(6.5,.23,.54,0,1.70,1.62,"black","Dark recessed interior")
    for x in (-4.21,4.20):
        box(.48,1.74,.42,x,0,1.64,"body","Thick end wall")
    box(6.91,.44,.42,0,-1.48,1.64,"black","Slit backing")
    box(2.40,1.57,.82,2.05,2.98,.51,"body","Offset access hood")
    box(1.11,.05,.76,2.10,3.77,.48,"black","Entrance shadow")
    bevel(2.4,.51,.14,2.06,3.61,.07,.06,"stone","Entrance threshold")


def post():
    w,d=6.55,4.98
    box(w+.32,d+.23,.27,0,0,.135,"stone","Rocky base")
    box(w,d,1.05,0,0,.78,"body","Pillbox lower wall")
    for y in (-d/2,d/2):
        facade(w,.46,0,y,1.30,2.37,"body",[(-2.61,-1.12,1.51,2.05),(-.79,.79,1.51,2.05),(1.12,2.61,1.51,2.05)])
        for x in (-1.86,0,1.86):
            box(1.48,.11,.12,x,y*.92,1.52,"stone","Sloped observation sill")
    for x in (-3.05,3.05):
        box(.45,4.64,1.10,x,0,1.84,"body","Short concrete wall")
    box(5.9,.17,.86,0,.57,1.74,"black","Shadow interior")
    bevel(w+.43,d+.52,.34,0,0,2.49,.145,"body","Overhanging flat roof")
    box(1.00,.91,1.63,-1.79,2.68,.815,"body","Rear access")
    box(.63,.06,1.34,-1.78,3.17,.75,"wood","Weathered door")
    for x in (-2.29,-1.29):
        box(.10,.11,1.60,x,3.14,.80,"stone","Entrance surround")


def warehouse():
    w,d,h=12.5,20,5.0
    box(w+.36,d+.38,.20,0,0,.10,"stone","Warehouse foundation")
    for s in (-1,1):
        box(.34,d,h,s*w/2,0,h/2,"brick","Brick side elevation")
        for y in (-7.5,-2.5,2.5,7.5):
            at=len(parts);window(0,0,3.78,1.59,1.36,finish="stone")
            for obj,_ in parts[at:]:
                obj.rotation_euler.z=s*math.pi/2
                obj.location.x=s*(w/2+.17)
                obj.location.y=y
    facade(w,.38,0,-d/2,.16,h,"brick",[(-3.06,3.06,.16,3.94)])
    box(w,.38,h,0,d/2,h/2,"brick","Solid rear wall")
    for x in (-2.31,-.77,.77,2.31):
        box(1.49,.18,3.74,x,-d/2-.18,2.01,"wood","Loading door")
        box(1.40,.22,.12,x,-d/2-.29,1.44,"iron","Door brace")
    for y in (-d/2,d/2):
        prism([(-w/2,h),(w/2,h),(0,h+3.09)],y-.17,y+.17,"brick","Brick gable")
    gable(w+.45,d+.45,h+.08,3.13)
    box(6.67,1.75,.22,0,-d/2-.83,.11,"stone","Loading apron")


def room_building():
    w,d,h=9.5,6.5,2.65
    box(w+.26,d+.26,.24,0,0,.12,"stone","Low foundation")
    openings=[(-3.53,-2.30,.91,2.14),(-.58,.55,.24,2.16),(1.48,2.71,.91,2.14)]
    facade(w,.28,0,-d/2,.24,h,"plaster",openings)
    for x in (-2.91,2.09):
        window(x,-d/2-.11,1.51,1.19,1.20,shutters=True)
    box(1.09,.19,1.91,-.01,-d/2-.12,1.20,"wood","Timber entrance")
    for x in (-w/2,w/2):
        box(.29,d,h-.24,x,0,(h+.24)/2,"plaster","Side wall")
    box(w,.30,h-.24,0,d/2,(h+.24)/2,"plaster","Rear wall")
    box(w+.36,d+.38,.23,0,0,h+.105,"roof","Low roof")
    box(.54,.75,.45,w*.34,d*.31,h+.44,"brick","Vent stack")


def carentan():
    for i,(x,w,d,h,rise,finish) in enumerate([(-6.42,5.6,7.1,5.4,2.0,"plaster"),
            (0,6.0,7.6,6.72,2.35,"stone"),(6.77,6.2,7.9,4.78,2.65,"brick")]):
        box(w+.13,d+.16,.24,x,0,.12,"stone","Street foundation")
        levels=[1.53,3.57]+([5.48] if i==1 else [])
        opening_list=[(x-.52,x+.52,.24,2.23)]
        for z in levels:
            for dx in (-w*.30,w*.30):
                opening_list.append((x+dx-.46,x+dx+.46,z-.54,z+.54))
                window(x+dx,-d/2-.17,z,.9,1.06,shutters=i!=2)
        facade(w,.31,x,-d/2,.24,h,finish,opening_list)
        box(1.02,.16,1.96,x,-d/2-.15,1.21,"wood","Townhouse entrance")
        box(w,.31,h-.24,x,d/2,(h+.24)/2,finish,"Rear wall")
        for side in (-1,1):
            box(.28,d,h-.24,x+side*w/2,0,(h+.24)/2,finish,"Side wall")
        for y in (-d/2,d/2):
            prism([(x-w/2,h),(x+w/2,h),(x,h+rise)],y-.13,y+.13,finish,"Street gable")
        gable(w+.30,d+.39,h+.08,rise,x=x,finish="roof" if i!=1 else "trim")
        box(.55,.63,1.40,x+w*.23,.68,h+rise*.73,"brick","Chimney")


def rgb(hex_color):
    return np.array([int(hex_color[i:i+2],16) for i in (0,2,4)], dtype=np.float32)/255


def noise(rng, grid, size=TILE):
    cells=rng.uniform(-1,1,(grid,grid))
    pos=np.arange(size)*grid/size
    index=pos.astype(int)
    t=(pos-index)
    t=t*t*(3-2*t)
    rows=cells[index,:]*(1-t[:,None])+cells[(index+1)%grid,:]*t[:,None]
    return rows[:,index]*(1-t[None,:])+rows[:,(index+1)%grid]*t[None,:]


def paint_atlas(spec):
    rng=np.random.default_rng(spec.seed)
    u,v=np.meshgrid(np.arange(TILE)/TILE,np.arange(TILE)/TILE)
    atlas=np.ones((4*TILE,4*TILE,4),dtype=np.float32)
    palette=dict(zip(FINISHES,(spec.paint[0],)+COMMON))
    palette.update(spec.finishes)
    for index,finish in enumerate(FINISHES):
        low,medium,grain=[noise(rng,n) for n in (5,16,64)]
        fleck=rng.uniform(0,1,(TILE,TILE))
        base=np.broadcast_to(rgb(palette[finish]),(TILE,TILE,3)).copy()
        if finish=="body" and len(spec.paint)>1:
            field=noise(rng,4)+.19*noise(rng,8)
            base[field>.04]=rgb(spec.paint[1])
            if len(spec.paint)>2:
                accents=noise(rng,4)+.16*noise(rng,9)
                base[accents>.19]=rgb(spec.paint[2])
            if spec.seed==21:
                for mask,colour in ((field>.04,spec.paint[0]),(field<=.04,spec.paint[1])):
                    base[(fleck>.982)&mask]=rgb(colour)
        weather=.12*low+.075*medium+.03*grain+(fleck-.5)*.035
        if finish in ("body","trim","plaster") and spec.seed!=46:
            run=noise(rng,32)[5,:]
            stain=np.maximum(run-.47,0)[None,:]*(.22+.46*np.maximum(low,0))
            weather-=stain
            weather+=(fleck>.987)*.075-(fleck<.012)*.083
        if finish=="body" and spec.seed==46:
            weather+=.085*np.cos(2*np.pi*u*18)+.019*np.cos(2*np.pi*u*36)
        if finish in ("brick","stone","roof"):
            rows,cols={"brick":(14,7),"stone":(6,5),"roof":(9,10)}[finish]
            warp=.12*low if finish=="stone" else .017*medium
            row=np.floor(v*rows+warp)
            col=np.floor(u*cols+(row%2)*.5+warp)
            gap=(np.mod(v*rows+warp,1)<.095)|(np.mod(u*cols+(row%2)*.5+warp,1)<.052)
            mortar={"brick":"a48d76","stone":"655e52","roof":"342622"}[finish]
            base[gap]=rgb(mortar)
            weather+=.11*np.sin(row*18.1+col*8.99)
        if finish=="wood":
            weather+=.085*np.sin(u*math.tau*27+1.7*low)
            weather-=.21*(np.mod(u*7,1)<.045)
        if finish=="glass":
            weather+=.26*(v-.6)+.12*np.cos((u+v)*math.tau)
        if finish=="rubber":
            weather+=.08*np.cos((u+v)*math.tau*16)
        base=np.clip(base*(1+weather[...,None]),0,1)
        x,y=index%4*TILE,index//4*TILE
        atlas[y:y+TILE,x:x+TILE,:3]=base
    image=bpy.data.images.new("Original 512px finish atlas", width=4*TILE,height=4*TILE,alpha=False)
    image.pixels.foreach_set(atlas.ravel())
    with tempfile.TemporaryDirectory() as tmp:
        image.filepath_raw=str(Path(tmp)/"paint.png")
        image.file_format="PNG"
        image.save()
        image.pack()
    return image


def mesh_with_uv(spec):
    bpy.context.view_layer.update()
    low=Vector(tuple(min((obj.matrix_world@v.co)[i] for obj,_ in parts for v in obj.data.vertices) for i in range(3)))
    high=Vector(tuple(max((obj.matrix_world@v.co)[i] for obj,_ in parts for v in obj.data.vertices) for i in range(3)))
    shift=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
    size=high-low
    vertices,faces,finish_ids,smooth=[],[],[],[]
    for obj,finish in parts:
        start=len(vertices)
        vertices.extend([tuple(obj.matrix_world@v.co-shift) for v in obj.data.vertices])
        faces.extend([tuple(start+j for j in p.vertices) for p in obj.data.polygons])
        finish_ids.extend([FINISHES.index(finish)]*len(obj.data.polygons))
        smooth.extend([p.use_smooth for p in obj.data.polygons])
        bpy.data.objects.remove(obj,do_unlink=True)
    parts.clear()
    obj=shape(vertices,faces,"body",spec.label)
    parts.clear()
    mesh=obj.data
    uv=mesh.uv_layers.new(name="Atlas")
    for face,index,shade in zip(mesh.polygons,finish_ids,smooth):
        face.use_smooth=shade
        normal=face.normal
        facing=max(range(3),key=lambda i:abs(normal[i]))
        axes=((1,2),(0,2),(0,1))[facing]
        grid=METRIC_UV.get(FINISHES[index])
        projected=[(vertices[mesh.loops[i].vertex_index][axes[0]],vertices[mesh.loops[i].vertex_index][axes[1]]) for i in face.loop_indices]
        # Keep every polygon inside one atlas tile. Repeated surface materials
        # use their own metric density while long structural panels fit one tile.
        offsets=[min(c[k] for c in projected) for k in range(2)]
        spans=[max(c[k] for c in projected)-offsets[k] for k in range(2)]
        for i,p in zip(face.loop_indices,projected):
            coords=[((p[k]-offsets[k])/max(spans[k],grid)) if grid else
                    ((p[k]+(size[axes[k]]/2 if axes[k]<2 else 0))/size[axes[k]])
                    for k in range(2)]
            uv.data[i].uv=((index%4 + .02+.96*coords[0])/4,(index//4 + .02+.96*coords[1])/4)
    material=bpy.data.materials.new(spec.label+" · original finishes")
    material.use_nodes=True
    shader=material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value=.76
    tex=material.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=paint_atlas(spec)
    material.node_tree.links.new(tex.outputs["Color"],shader.inputs["Base Color"])
    mesh.materials.append(material)
    return obj, size


class Model:
    def __init__(self, path, label, builder, paint, seed, finishes=None):
        self.path=path
        self.label=label
        self.builder=builder
        self.paint=paint.split()
        self.seed=seed
        self.finishes=finishes or {}


VEHICLE="assets/ground-vehicles/"
BUILDING="assets/buildings/"
MODELS=[
    Model(VEHICLE+"tiger-i.glb","Tiger I",tiger,"bd9a59 59603a 8f5040",21,{"trim":"635841"}),
    Model(VEHICLE+"tiger-i-field-grey.glb","Tiger I | Feldgrau",tiger,"535960",22,{"trim":"464849","earth":"695c50"}),
    Model(VEHICLE+"jagdpanther.glb","Jagdpanther",jagdpanther,"a49868 495341 635746",23,{"trim":"51573e"}),
    Model(VEHICLE+"sherman-m4a1.glb","M4A1 (76) W Sherman",sherman,"626744",24,{"trim":"444b37","canvas":"a08b61"}),
    Model(VEHICLE+"m16-mgmc.glb","M16 MGMC",lambda:halftrack(True),"434b36",25,{"trim":"51573f","canvas":"a78b58","mark":"e4e4d0"}),
    Model(VEHICLE+"flak37-halftrack.glb","Sd.Kfz. 9 | Flak 37",lambda:halftrack(False),"a28d66 77654c",26,{"trim":"655744","iron":"4f4941"}),
    Model(VEHICLE+"source/maus.glb","Panzer VIII Maus | Prototyp",maus,"814c38 505345 8b7856",27,{"trim":"65564d","earth":"53453c"}),
    Model(VEHICLE+"ford-v8.glb","Ford V8 | Weinrot",ford,"65303b",31,{"trim":"77726d","mark":"b6b3a7"}),
    Model(VEHICLE+"ford-v8-cream.glb","Ford V8 | Elfenbein",ford,"afaa8c",32,{"trim":"858078","mark":"c8c8bc","rubber":"333332"}),
    Model(VEHICLE+"drb-01-10.glb","DRB Baureihe 01.10",train,"333533",33,{"rust":"934335","iron":"474442","trim":"4b4943"}),
    Model(BUILDING+"house.glb","Rheinhaus",house,"b9a889",41,{"roof":"845443","trim":"54654f","stone":"807569"}),
    Model(BUILDING+"farm-ruin.glb","Hofruine",farm_ruin,"93816d",42,{"stone":"9c8a71","roof":"69473b","wood":"5b4534"}),
    Model(BUILDING+"town-ruin.glb","Stadtruine",town_ruin,"9e7a64",43,{"plaster":"b19a7c","brick":"a75c4c","stone":"777266"}),
    Model(BUILDING+"bunker.glb","Betonbunker",bunker,"8e8d7c 787f62",44,{"stone":"757368"}),
    Model(BUILDING+"observation-post.glb","Küstenbeobachtungsposten",post,"a8a191",45,{"stone":"858376","wood":"635549"}),
    Model(BUILDING+"hangar.glb","Stahlhangar",hangar,"666e6a",46,{"trim":"525e5e","iron":"363b3c","glass":"82938d"}),
    Model(BUILDING+"source/warehouse.glb","Backsteinlager",warehouse,"81705f",47,{"brick":"855047","roof":"4d504c","wood":"615a4a"}),
    Model(BUILDING+"source/two-room-building.glb","Zweiraumgebäude",room_building,"a59574",48,{"plaster":"b29b74","trim":"5d6a56","roof":"564d44"}),
    Model(BUILDING+"source/carentan-row.glb","Normannische Häuserzeile",carentan,"9e9480",49,{"plaster":"b8ae8c","stone":"919083","brick":"a36350","roof":"835449","trim":"505b59"}),
]


def export(obj,spec, size):
    path=ROOT/spec.path
    path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                             export_image_format="JPEG", export_jpeg_quality=88,
                             export_animations=False, export_cameras=False, export_lights=False)
    raw=path.read_bytes()
    end=20+struct.unpack_from("<I",raw,12)[0]
    data=json.loads(raw[20:end])
    data["asset"]["extras"]={
        "title":spec.label, "author":"Torpedo Carrier project",
        "license":"project-own", "source":"GROUND-MODELS.md",
        "processing":"Original geometry and procedural paint atlas, built without imported meshes or textures.",
        "dimensionsMetres":[round(v,3) for v in (size.x,size.z,size.y)],
    }
    header=json.dumps(data,ensure_ascii=False,separators=(",",":")).encode("utf-8")
    header+=b" "*(-len(header)%4)
    path.write_bytes(struct.pack("<4sIIII",b"glTF",2,20+len(header)+len(raw)-end,len(header),0x4e4f534a)+header+raw[end:])
    return path


def studio(path,spec,size):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=[obj for obj in bpy.context.scene.objects if obj.type=="MESH"]
    width,length,height=size
    diameter=max(width,length)
    centre=Vector((0,0,height*.43))
    bpy.ops.mesh.primitive_plane_add(size=diameter*100,location=(0,0,-.012))
    ground=bpy.data.materials.new("Studio floor")
    ground.use_nodes=True
    ground.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(.18,.20,.19,1)
    bpy.context.object.data.materials.append(ground)
    scene=bpy.context.scene
    scene.world=bpy.data.worlds.new("Studio world")
    scene.world.color=(.32,.32,.32)
    scene.render.engine="CYCLES"
    scene.cycles.samples=24
    scene.cycles.use_denoising=False
    scene.cycles.adaptive_threshold=.10
    scene.cycles.max_bounces=3
    scene.view_settings.view_transform="AgX"
    scene.render.resolution_x=744
    scene.render.resolution_y=496
    scene.render.resolution_percentage=100
    for name, where, power, spread, color in [
        ("Key",(4,-6,8),42,6,(1,.89,.76)),
        ("Fill",(-6,-2,4),24,7,(.77,.88,1)),
        ("Rim",(2,6,6),31,5,(1,.95,.86)),
    ]:
        lamp=bpy.data.lights.new(name,"AREA")
        lamp.energy=power*diameter**2
        lamp.shape="DISK"
        lamp.size=spread*diameter/5
        lamp.color=color
        light=bpy.data.objects.new(name,lamp)
        bpy.context.collection.objects.link(light)
        light.location=Vector(where)*diameter/5
        light.rotation_euler=(centre-light.location).to_track_quat("-Z","Y").to_euler()
    camera=bpy.data.cameras.new("Review camera")
    camera.type="ORTHO"
    obj=bpy.data.objects.new("Review camera",camera)
    bpy.context.collection.objects.link(obj)
    obj.location=Vector((1,-1.23,.84))*diameter+centre
    obj.rotation_euler=(centre-obj.location).to_track_quat("-Z","Y").to_euler()
    rotation=obj.rotation_euler.to_matrix()
    inverse=rotation.transposed()
    points=[inverse@(mesh.matrix_world@vertex.co-centre) for mesh in imported for vertex in mesh.data.vertices]
    low=[min(point[i] for point in points) for i in (0,1)]
    high=[max(point[i] for point in points) for i in (0,1)]
    obj.location+=rotation@Vector(((low[0]+high[0])/2,(low[1]+high[1])/2,0))
    camera.ortho_scale=1.14*max(high[0]-low[0],1.5*(high[1]-low[1]))
    scene.camera=obj
    scene.render.image_settings.file_format="PNG"
    scene.render.filepath=str(ARGS.preview/(path.stem+".png"))
    bpy.ops.render.render(write_still=True)


if ARGS.preview:
    ARGS.preview.mkdir(parents=True,exist_ok=True)
exports=[]
for spec in MODELS:
    if ARGS.only and Path(spec.path).stem not in ARGS.only:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec.builder()
    obj,size=mesh_with_uv(spec)
    exports.append((export(obj,spec,size),spec,size))
if ARGS.preview:
    for path,spec,size in exports:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        studio(path,spec,size)

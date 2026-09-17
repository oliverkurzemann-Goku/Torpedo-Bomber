#!/usr/bin/env python3
"""Build a water-only overlay; preserve all other shipped OSM tile data.

Requires the same pyproj/shapely/pyarrow/fsspec dependencies as fetch_overture.py.
Default: fetch the pinned Overture water release. --cache is a trusted LOCAL
pickle of fetch_rows output for development; never load an untrusted pickle.
Widths are visual estimates by subtype, not measured/source width attributes.
"""
import argparse, collections, json, pickle
from pathlib import Path
from shapely.geometry import Point
from shapely.strtree import STRtree
import fetch_overture as f

def build(rows):
    lines=[r for r in rows if r['geom'].geom_type=='LineString' and r['subtype'] in ('river','canal','stream')]
    if len(lines)<1000: raise RuntimeError('Incomplete water fetch: refusing to replace the shipped network')
    tiles={f'{x},{z}':{'rivers':[],'riverWidths':[],'riverEnds':[]} for x in range(f.GRID_W) for z in range(f.GRID_H)}
    counts=collections.Counter()
    for r in lines:
        for tx in range(f.GRID_W):
            for tz in range(f.GRID_H):
                if not r['geom'].intersects(f.tile_box(tx,tz)):continue
                for line in f.line_segments_in_tile(r['geom'],tx,tz):
                    if len(line)<2:continue
                    t=tiles[f'{tx},{tz}'];t['rivers'].append([[round(x,3),round(z,3)] for x,z in line])
                    t['riverWidths'].append({'river':12,'canal':6,'stream':2.4}[r['subtype']]);counts[r['subtype']]+=1
    # Nodes shared by clipped pieces or by a tributary's endpoint are not springs.
    nodes=collections.Counter()
    for key,t in tiles.items():
        tx,tz=map(int,key.split(','))
        for line in t['rivers']:
            for x,z in line:nodes[(round(x+tx*4000,1),round(z+tz*4000,1))]+=1
    polys=[r['geom'] for r in rows if r['geom'].geom_type in ('Polygon','MultiPolygon')]
    tree=STRtree(polys)
    terminal=0
    for key,t in tiles.items():
        tx,tz=map(int,key.split(','))
        for line in t['rivers']:
            ends=[]
            for x,z in (line[0],line[-1]):
                world=(x+tx*4000,z+tz*4000)
                p=Point(world[0]+f.ORIGIN_X,world[1]+f.ORIGIN_Y)
                in_water=any(polys[int(i)].distance(p)<4 for i in tree.query(p.buffer(4)))
                at_edge=min(x,z,4000-x,4000-z)<.01
                end=nodes[(round(world[0],1),round(world[1],1))]==1 and not in_water and not at_edge
                ends.append(end);terminal+=end
            t['riverEnds'].append(ends)
    return {'source':'Overture Maps '+f.RELEASE,'bboxLonLat':f.BBOX,'widths':'Inferred metres: river 12, canal 6, stream 2.4',
            'counts':dict(counts),'terminalEnds':terminal,'tiles':tiles}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--cache');args=parser.parse_args()
    rows=pickle.loads(Path(args.cache).read_bytes()) if args.cache else f.fetch_rows('theme=base/type=water')
    result=build(rows)
    out=Path(__file__).resolve().parents[1]/'data'/'waterways.json'
    out.write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(json.dumps({'file':str(out),'bytes':out.stat().st_size,'counts':result['counts'],'terminalEnds':result['terminalEnds']}))

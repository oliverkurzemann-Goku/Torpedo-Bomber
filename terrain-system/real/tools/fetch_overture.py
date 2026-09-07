#!/usr/bin/env python3
# ============================================================
#  fetch_overture.py -- REAL-DATA conversion tool (Python, offline, never
#  loaded by the browser), sibling to the synthetic ../../tools/
#  convert_osm_tile.js it deliberately mirrors: SAME per-tile JSON format
#  (roads/rails/rivers/lakes/farmland/forests/airfields/buildings, tile-local
#  metres) -- OSMManager.js needs ZERO changes to read this tool's output.
#  Only the DATA SOURCE changes: this reads real Overture Maps features
#  (roads, water, land use/cover, buildings -- themselves largely OpenStreetMap-
#  derived, see https://overturemaps.org) for the Remagen/Rhine working area
#  (real/config.json) instead of one hand-authored parametric curve.
#
#  Fetching technique: see overture_lib.py's own header -- row-group bbox
#  statistics let this read only the handful of files/row-groups that
#  actually cover this small working area, not the full ~400-700MB-per-file,
#  whole-planet dataset.
#
#  Category mapping, decided from an ad-hoc inspection of the REAL data for
#  this exact bbox before writing this script (not assumed from Overture's
#  general docs, since a schema's stated categories and what's ACTUALLY
#  populated for one small area can differ -- see the session's own
#  discovery that "forest" lives in theme=base/type=land_cover, not
#  type=land_use, only found by querying and looking):
#    roads    <- theme=transportation/type=segment, subtype='road',
#                class NOT footway/path/steps/pedestrian/cycleway/bridleway
#                (vehicle-relevant roads only -- the excluded classes exist
#                in real numbers here, 10k+ footways alone, and would just
#                be visual clutter at flight-sim altitude)
#    rails    <- theme=transportation/type=segment, subtype='rail'
#    rivers   <- theme=base/type=water, geometry=LineString,
#                subtype in (river, canal) -- 'stream' (3908 features in
#                this bbox alone) deliberately excluded, too dense/minor to
#                be individually meaningful from the air
#    lakes    <- theme=base/type=water, geometry=Polygon/MultiPolygon,
#                area > MIN_WATER_POLY_M2 -- this is how the actual Rhine
#                channel itself comes through (subtype='river' but mapped
#                as an AREA, not a line, confirmed directly: several large
#                polygon pieces spanning most of the bbox's north-south
#                extent) plus real lakes/ponds/marinas; the area filter
#                drops tiny mapped features like private swimming pools
#    forests  <- theme=base/type=land_cover, subtype in (forest, shrub)
#    farmland <- theme=base/type=land_use, subtype in (agriculture, horticulture)
#                (farmland/meadow/orchard/farmyard/vineyard/allotments/garden)
#    airfields <- left empty; the historical layer (real/tools/fetch_historical.py)
#                places one illustrative airfield instead, same as the
#                synthetic prototype's own historical layer already does
#    buildings <- theme=buildings/type=building, ANY subtype. 177,514 real
#                footprints fall inside this one bbox -- far more than any
#                tile can render individually, so kept only the
#                MAX_BUILDINGS_PER_TILE largest-footprint buildings per
#                tile (area descending), which keeps real town/village
#                SHAPE and density variation intact while bounding the
#                total instance count.
# ============================================================

import json, math, os, struct, sys

import numpy as np
from pyproj import Transformer
from shapely.geometry import box as shapely_box
from shapely.ops import transform as shapely_transform
from shapely.strtree import STRtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overture_lib import collect_theme_rows, wkb_to_shape, bbox_polygon

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, '..', 'config.json')))

RELEASE = 'release/2026-08-19.0'
BUCKET = 'overturemaps-us-west-2'
OUT_DIR = os.path.join(HERE, '..', 'data', 'osm')

TILE_SIZE = CFG['tileSize']
GRID_W, GRID_H = CFG['gridW'], CFG['gridH']
ORIGIN_X, ORIGIN_Y = CFG['originUTM']['x'], CFG['originUTM']['y']

BBOX_LL = CFG['bboxLonLat']
BBOX = (BBOX_LL['lonMin'], BBOX_LL['latMin'], BBOX_LL['lonMax'], BBOX_LL['latMax'])

MIN_WATER_POLY_M2 = 150          # drops private swimming pools etc, keeps ponds/marinas/the Rhine
MAX_BUILDINGS_PER_TILE = 400     # see file header -- real count (177,514) is far beyond what any tile should render

_to_utm = Transformer.from_crs('EPSG:4326', CFG['crs'], always_xy=True)


def project(geom):
    return shapely_transform(lambda x, y: _to_utm.transform(x, y), geom)


def fetch_rows(theme_type, exclude_classes=None):
    """Fetches every row of one Overture theme/type that ACTUALLY intersects
    the working bbox (row-group bbox filter first, then exact per-row
    geometry check, matching the same two-stage approach already validated
    interactively for buildings/transportation/water/land_use/land_cover
    before this script was written)."""
    bpoly = bbox_polygon(BBOX)
    table = collect_theme_rows(BUCKET, f'{RELEASE}/{theme_type}/', BBOX)
    if table is None:
        return []
    geoms = table.column('geometry').to_pylist()
    subtypes = table.column('subtype').to_pylist() if 'subtype' in table.column_names else [None] * len(geoms)
    classes = table.column('class').to_pylist() if 'class' in table.column_names else [None] * len(geoms)
    out = []
    for i in range(len(geoms)):
        g = wkb_to_shape(geoms[i])
        if exclude_classes and classes[i] in exclude_classes:
            continue
        if not g.intersects(bpoly):
            continue
        out.append({'geom': project(g), 'subtype': subtypes[i], 'class': classes[i]})
    return out


def tile_box(tx, tz):
    x0 = ORIGIN_X + tx * TILE_SIZE
    y0 = ORIGIN_Y + tz * TILE_SIZE
    return shapely_box(x0, y0, x0 + TILE_SIZE, y0 + TILE_SIZE)


def to_local(pt, tx, tz):
    x0 = ORIGIN_X + tx * TILE_SIZE
    y0 = ORIGIN_Y + tz * TILE_SIZE
    return [pt[0] - x0, pt[1] - y0]


def line_segments_in_tile(geom, tx, tz):
    """Clips one projected LineString feature against tile (tx,tz)'s box and
    returns a list of tile-local point-list segments (0, 1, or several --
    a real road can legitimately cross the same tile's boundary more than
    once)."""
    clipped = geom.intersection(tile_box(tx, tz))
    if clipped.is_empty:
        return []
    parts = list(clipped.geoms) if hasattr(clipped, 'geoms') else [clipped]
    segs = []
    for part in parts:
        if part.geom_type != 'LineString':
            continue
        coords = list(part.coords)
        if len(coords) < 2:
            continue
        segs.append([to_local(c, tx, tz) for c in coords])
    return segs


def polygon_rings_in_tile(geom, tx, tz):
    """Clips one projected Polygon/MultiPolygon feature against tile
    (tx,tz)'s box and returns a list of tile-local CLOSED rings (exterior
    only -- holes dropped, an accepted simplification matching
    _buildFlatPolygon's own single-ring rendering)."""
    clipped = geom.intersection(tile_box(tx, tz))
    if clipped.is_empty:
        return []
    parts = list(clipped.geoms) if hasattr(clipped, 'geoms') else [clipped]
    rings = []
    for part in parts:
        if part.geom_type != 'Polygon':
            continue
        coords = list(part.exterior.coords)
        if len(coords) < 4:   # a real ring: at least 3 distinct points + closing point
            continue
        rings.append([to_local(c, tx, tz) for c in coords])
    return rings


def build_index(features):
    geoms = [f['geom'] for f in features]
    tree = STRtree(geoms)
    return tree, features


def query_tile(tree, features, tx, tz):
    box = tile_box(tx, tz)
    idx = tree.query(box)
    return [features[i] for i in idx if features[i]['geom'].intersects(box)]


def main():
    print('=== fetching roads/rails ===')
    EXCLUDE_ROAD_CLASSES = {'footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway'}
    transport = fetch_rows('theme=transportation/type=segment')
    roads = [f for f in transport if f['subtype'] == 'road' and f['class'] not in EXCLUDE_ROAD_CLASSES]
    rails = [f for f in transport if f['subtype'] == 'rail']
    print(f'  roads: {len(roads)}, rails: {len(rails)} (of {len(transport)} total segments)')

    print('=== fetching water ===')
    water = fetch_rows('theme=base/type=water')
    rivers = [f for f in water if f['geom'].geom_type == 'LineString' and f['subtype'] in ('river', 'canal')]
    lake_polys = [f for f in water if f['geom'].geom_type in ('Polygon', 'MultiPolygon') and f['geom'].area > MIN_WATER_POLY_M2]
    print(f'  river/canal lines: {len(rivers)}, water polygons > {MIN_WATER_POLY_M2}m2: {len(lake_polys)}')

    print('=== fetching land cover (forests) ===')
    land_cover = fetch_rows('theme=base/type=land_cover')
    forests = [f for f in land_cover if f['subtype'] in ('forest', 'shrub')]
    print(f'  forest/shrub polygons: {len(forests)}')

    print('=== fetching land use (farmland) ===')
    land_use = fetch_rows('theme=base/type=land_use')
    farmland = [f for f in land_use if f['subtype'] in ('agriculture', 'horticulture')]
    print(f'  agriculture/horticulture polygons: {len(farmland)}')

    print('=== fetching buildings ===')
    buildings = fetch_rows('theme=buildings/type=building')
    print(f'  buildings: {len(buildings)}')

    print('=== building spatial indices ===')
    roads_idx = build_index(roads) if roads else None
    rails_idx = build_index(rails) if rails else None
    rivers_idx = build_index(rivers) if rivers else None
    lakes_idx = build_index(lake_polys) if lake_polys else None
    forests_idx = build_index(forests) if forests else None
    farmland_idx = build_index(farmland) if farmland else None
    buildings_idx = build_index(buildings) if buildings else None

    os.makedirs(OUT_DIR, exist_ok=True)
    totals = {'roads': 0, 'rails': 0, 'rivers': 0, 'lakes': 0, 'forests': 0, 'farmland': 0, 'buildings': 0}
    for tz in range(GRID_H):
        for tx in range(GRID_W):
            data = {
                'roads': [], 'rails': [], 'rivers': [], 'lakes': [],
                'forests': [], 'farmland': [], 'airfields': [], 'buildings': [],
            }
            if roads_idx:
                for f in query_tile(*roads_idx, tx, tz):
                    data['roads'].extend(line_segments_in_tile(f['geom'], tx, tz))
            if rails_idx:
                for f in query_tile(*rails_idx, tx, tz):
                    data['rails'].extend(line_segments_in_tile(f['geom'], tx, tz))
            if rivers_idx:
                for f in query_tile(*rivers_idx, tx, tz):
                    data['rivers'].extend(line_segments_in_tile(f['geom'], tx, tz))
            if lakes_idx:
                for f in query_tile(*lakes_idx, tx, tz):
                    data['lakes'].extend(polygon_rings_in_tile(f['geom'], tx, tz))
            if forests_idx:
                for f in query_tile(*forests_idx, tx, tz):
                    data['forests'].extend(polygon_rings_in_tile(f['geom'], tx, tz))
            if farmland_idx:
                for f in query_tile(*farmland_idx, tx, tz):
                    data['farmland'].extend(polygon_rings_in_tile(f['geom'], tx, tz))
            if buildings_idx:
                cand = query_tile(*buildings_idx, tx, tz)
                sized = []
                for f in cand:
                    g = f['geom']
                    c = g.centroid
                    lx, lz = to_local((c.x, c.y), tx, tz)
                    if not (0 <= lx <= TILE_SIZE and 0 <= lz <= TILE_SIZE):
                        continue   # centroid outside this tile -- belongs to a neighbour, skip here to avoid double-counting
                    rect = g.minimum_rotated_rectangle
                    rc = list(rect.exterior.coords)[:4]
                    d01 = math.hypot(rc[1][0]-rc[0][0], rc[1][1]-rc[0][1])
                    d12 = math.hypot(rc[2][0]-rc[1][0], rc[2][1]-rc[1][1])
                    w, d = max(d01, d12), min(d01, d12)
                    ang = math.atan2(rc[1][1]-rc[0][1], rc[1][0]-rc[0][0]) if d01 >= d12 else math.atan2(rc[2][1]-rc[1][1], rc[2][0]-rc[1][0])
                    sized.append((g.area, {'x': round(lx, 2), 'z': round(lz, 2), 'w': round(max(w, 3), 2), 'd': round(max(d, 3), 2), 'rotY': round(-ang, 4)}))
                sized.sort(key=lambda t: -t[0])
                data['buildings'] = [b for _, b in sized[:MAX_BUILDINGS_PER_TILE]]

            for k in totals:
                totals[k] += len(data[k])
            out_path = os.path.join(OUT_DIR, f'{tx}_{tz}.json')
            with open(out_path, 'w') as f:
                json.dump(data, f)

    print(f'\n{GRID_W*GRID_H} real OSM tiles written to {OUT_DIR}.')
    print('totals across the grid:', totals)


if __name__ == '__main__':
    main()

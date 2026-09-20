#!/usr/bin/env python3
# ============================================================
#  fetch_historical_pacific.py -- REAL-DATA historical/ground-target layer
#  for the Okinawa testbed region (terrain-system/real-pacific/), sibling to
#  fetch_historical.py (the Remagen version). SAME per-tile JSON format
#  (airfields/flak/factories/bridges/ports, tile-local metres) --
#  HistoricalObjectManager.js needs ZERO changes to read this.
#
#  A separate file rather than reusing fetch_historical.py directly: that
#  script's own logic (snap_bridge_to_river, flak-near-bridge placement) is
#  bridge-centric, built for a river crossing -- there is no equivalent
#  single "crossing" landmark here, and forcing this region's airfield/port/
#  coastal-defence targets through bridge-shaped code would obscure more
#  than it would share. The generic helpers (loading a tile's own already-
#  fetched water polygons, point-in-polygon validation, push-away-from-water)
#  ARE the same idea and are reimplemented here at the same standard, not
#  skipped.
#
#  Honesty about what's real here vs illustrative (same standard as
#  fetch_historical.py's own header):
#  - Kadena airfield and Naha port sit at REAL, currently existing named
#    sites (still-active USAF airfield / commercial port respectively) --
#    real locations, no claim that this exact 1945 combat footprint is
#    documented.
#  - The Yomitan/Hagushi coastal-defence position is placed near the REAL
#    1 April 1945 invasion beach coordinates, but the specific gun
#    position itself is illustrative (no verified WW2 battery position
#    data available), exactly like Remagen's flak placements.
# ============================================================

import json, math, os

from pyproj import Transformer
from shapely.geometry import Point, Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('TERRAIN_ROOT', os.path.join(HERE, '..', '..', 'real-pacific'))
CFG = json.load(open(os.path.join(ROOT, 'config.json')))
OUT_DIR = os.path.join(ROOT, 'data', 'historical')
OSM_DIR = os.path.join(ROOT, 'data', 'osm')

TILE_SIZE = CFG['tileSize']
ORIGIN_X, ORIGIN_Y = CFG['originUTM']['x'], CFG['originUTM']['y']
_to_utm = Transformer.from_crs('EPSG:4326', CFG['crs'], always_xy=True)


def to_local(lon, lat):
    x, y = _to_utm.transform(lon, lat)
    return x - ORIGIN_X, y - ORIGIN_Y


def tile_of(wx, wy):
    return int(wx // TILE_SIZE), int(wy // TILE_SIZE)


def add(tiles, tx, tz, key, obj):
    k = (tx, tz)
    if k not in tiles:
        tiles[k] = {'airfields': [], 'flak': [], 'factories': [], 'bridges': [], 'ports': []}
    tiles[k][key].append(obj)


def _nearby_water_polygons(wx, wy):
    """Loads real water polygons (the ocean/coastline, see fetch_overture.py's
    own 'lakes' comment -- this is how the sea itself comes through) from the
    already-fetched tile JSONs covering (wx,wy) and its 8 neighbours, in
    WORLD-local metres -- same source OSMManager.js renders from, per the
    placement checklist in CLAUDE.md ('jede automatisch platzierte Position
    gegen die ECHTEN geladenen Daten validieren')."""
    tx0, tz0 = tile_of(wx, wy)
    polys = []
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            path = os.path.join(OSM_DIR, f'{tx0+dx}_{tz0+dz}.json')
            if not os.path.exists(path):
                continue
            d = json.load(open(path))
            ox, oz = (tx0+dx) * TILE_SIZE, (tz0+dz) * TILE_SIZE
            for ring in d.get('lakes', []):
                if len(ring) < 4:
                    continue
                pts = [(ox+px, oz+pz) for px, pz in ring]
                try:
                    polys.append(Polygon(pts))
                except Exception:
                    continue
    return polys


def on_water(x, z, polys):
    p = Point(x, z)
    return any(poly.is_valid and poly.contains(p) for poly in polys)


def push_off_water(x, z, push_dir, label, step=20, max_steps=25):
    """Same idea as Remagen's place_flak_on_land(): validate against the
    real fetched water polygons, and if the point lands in water, push it
    along push_dir until it doesn't -- warn rather than silently ship an
    unvalidated position (placement checklist item 3)."""
    polys = _nearby_water_polygons(x, z)
    if not on_water(x, z, polys):
        return x, z
    for i in range(1, max_steps+1):
        nx, nz = x + push_dir[0]*step*i, z + push_dir[1]*step*i
        if not on_water(nx, nz, polys):
            print(f'  {label}: original point was in water, pushed {step*i}m -> ({nx:.1f},{nz:.1f})')
            return nx, nz
    print(f'  WARNING: {label}: still in water after {max_steps*step}m push, keeping original')
    return x, z


def dem_height(x, z):
    """Bilinear sample of the just-written real DEM1 tiles at world (x,z) --
    same binary format DEMHeightProvider.js reads (see that file's header),
    read directly here so placement can be validated against real relief
    (checklist item 1) without needing a browser."""
    import struct
    tx, tz = tile_of(x, z)
    path = os.path.join(ROOT, 'data', 'dem', f'{tx}_{tz}.bin')
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        magic, grid, mps = struct.unpack('<4sHf', f.read(10))
        f.read(6)
        heights = struct.unpack(f'<{grid*grid}f', f.read(4*grid*grid))
    lx, lz = x - tx*TILE_SIZE, z - tz*TILE_SIZE
    fx, fz = lx/mps, lz/mps
    ix0, iz0 = min(grid-2, max(0, int(fx))), min(grid-2, max(0, int(fz)))
    tx_, tz_ = fx-ix0, fz-iz0
    def h(ix, iz): return heights[ix + grid*iz]
    h00, h10, h01, h11 = h(ix0,iz0), h(ix0+1,iz0), h(ix0,iz0+1), h(ix0+1,iz0+1)
    h0 = h00 + (h10-h00)*tx_
    h1 = h01 + (h11-h01)*tx_
    return h0 + (h1-h0)*tz_


def best_runway_heading(cx, cz, length, width):
    """Tries a spread of headings and picks the one whose full runway
    footprint (both ends + centre, both edges) is measured, not assumed, to
    be driest (fewest sampled points landing in real water) and flattest
    (smallest real DEM relief across the footprint) -- the placement
    checklist's own 'nie eine einzelne Hoehe fuer eine Flaeche annehmen'
    applied to picking an ORIENTATION, not just a height."""
    polys = _nearby_water_polygons(cx, cz)
    best = None
    for deg in range(0, 180, 10):
        rot = math.radians(deg)
        ux, uz = math.cos(rot), math.sin(rot)
        px, pz = -uz, ux
        pts = []
        for t in (-0.5, -0.25, 0, 0.25, 0.5):
            for s in (-0.5, 0.5):
                pts.append((cx + ux*length*t + px*width*s, cz + uz*length*t + pz*width*s))
        wet = sum(1 for (x, z) in pts if on_water(x, z, polys))
        heights = [dem_height(x, z) for (x, z) in pts]
        heights = [h for h in heights if h is not None]
        relief = (max(heights)-min(heights)) if heights else 999
        score = wet*1000 + relief   # dry land dominates the score, flatness is the tiebreaker
        if best is None or score < best[0]:
            best = (score, deg, wet, relief)
    return best  # (score, deg, wetCount, reliefMetres)


def main():
    tiles = {}

    # ---- Kadena airfield: real runway footprint, orientation measured against real data ----
    ax, az = to_local(CFG['landmarks']['kadenaAirfield']['lon'], CFG['landmarks']['kadenaAirfield']['lat'])
    RWY_LEN, RWY_W = 900.0, 45.0   # matches the scale every other game's own AF_* runway footprint uses
    score, deg, wet, relief = best_runway_heading(ax, az, RWY_LEN, RWY_W)
    print(f'kadena airfield: best heading {deg} deg, {wet} wet sample points, {relief:.1f}m relief across footprint')
    atx, atz = tile_of(ax, az)
    add(tiles, atx, atz, 'airfields', {
        'x': round(ax - atx*TILE_SIZE, 1), 'z': round(az - atz*TILE_SIZE, 1),
        'length': RWY_LEN, 'width': RWY_W, 'rotY': round(math.radians(deg), 4),
    })

    # ---- Naha port: dock oriented along the measured driest/flattest heading too ----
    px_, pz_ = to_local(CFG['landmarks']['nahaPort']['lon'], CFG['landmarks']['nahaPort']['lat'])
    px_, pz_ = push_off_water(px_, pz_, (1, 0), 'naha port')
    pscore, pdeg, pwet, prelief = best_runway_heading(px_, pz_, 220.0, 30.0)
    print(f'naha port: best heading {pdeg} deg, {pwet} wet sample points, {prelief:.1f}m relief')
    ptx, ptz = tile_of(px_, pz_)
    add(tiles, ptx, ptz, 'ports', {
        'x': round(px_ - ptx*TILE_SIZE, 1), 'z': round(pz_ - ptz*TILE_SIZE, 1),
        'length': 220.0, 'rotY': round(math.radians(pdeg), 4),
    })

    # ---- Yomitan/Hagushi coastal defence: real beach coordinate, pushed onto real dry land ----
    fx, fz = to_local(CFG['landmarks']['yomitanBeach']['lon'], CFG['landmarks']['yomitanBeach']['lat'])
    fx, fz = push_off_water(fx, fz, (0, 1), 'yomitan coastal defence')
    ftx, ftz = tile_of(fx, fz)
    add(tiles, ftx, ftz, 'flak', {
        'x': round(fx - ftx*TILE_SIZE, 1), 'z': round(fz - ftz*TILE_SIZE, 1),
    })

    os.makedirs(OUT_DIR, exist_ok=True)
    for (tx, tz), data in tiles.items():
        with open(os.path.join(OUT_DIR, f'{tx}_{tz}.json'), 'w') as f:
            json.dump(data, f)
    print(f'{len(tiles)} historical tile(s) written to {OUT_DIR}: {list(tiles.keys())}')


if __name__ == '__main__':
    main()

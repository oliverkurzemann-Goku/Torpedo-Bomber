#!/usr/bin/env python3
# ============================================================
#  fetch_historical.py -- REAL-DATA historical/WW2 layer for the Remagen
#  working area, sibling to ../../tools/convert_historical_tile.js. SAME
#  per-tile JSON format (airfields/flak/factories/bridges/ports, tile-local
#  metres) -- HistoricalObjectManager.js needs ZERO changes to read this.
#
#  Honesty about what's real here vs illustrative (same caveat the
#  synthetic tool's own file header already carries -- "No real
#  orders-of-battle/target-list source is available in this environment"):
#
#  - The BRIDGE position is REAL: config.json's landmarks are the Ludendorff
#    Bridge's actual west (Remagen) and east (Erpel) bridgehead coordinates,
#    projected through the same pyproj UTM32N transform every other real-data
#    tool in this pipeline uses. Captured intact by US 9th Armored Division
#    troops on 7 March 1945 -- the actual historical event this campaign's
#    premise is built on -- then collapsed on 17 March 1945 under the strain
#    of the traffic that had crossed it in the meantime; it no longer exists
#    today, which is exactly why this position had to come from a
#    hand-verified real-world coordinate rather than from Overture's
#    present-day data (no bridge is mapped there now).
#  - The FACTORY sits at "Industriegebiet Maarweg", a REAL, currently
#    existing named industrial zone a few km from the bridge (found by
#    querying Overture's own land_use/industrial features for this bbox,
#    see the session's own exploration) -- real location, but no claim that
#    THIS specific site was a wartime target; it just reads as a plausible
#    one, the same honest gap the synthetic tool's factory placement always had.
#  - The AIRFIELD sits on a REAL, genuinely flat farmland parcel (the
#    largest in the bbox, DEM-checked: <5m of relief over a 400m span) near
#    Sinzig -- a plausible site for a forward strip, not a documented one.
#  - FLAK positions are illustrative placements near the bridge approaches
#    (no verified WW2 flak-battery position data available), same as the
#    synthetic tool's own flak placements always were.
# ============================================================

import json, math, os

from pyproj import Transformer
from shapely.geometry import Point, Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, '..', 'config.json')))
OUT_DIR = os.path.join(HERE, '..', 'data', 'historical')
OSM_DIR = os.path.join(HERE, '..', 'data', 'osm')

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


def _tile_water_polygons(tx, tz):
    """Loads one tile's already-fetched real water polygons (fetch_overture.py's own comment:
    'lakes' is how the actual Rhine channel itself comes through, not a line) in WORLD-local
    metres — the exact same source OSMManager.js renders the river from, so a bridge snapped
    onto these polygons is guaranteed to cross what the game actually shows, not just what an
    independently-projected landmark coordinate SHOULD line up with."""
    path = os.path.join(OSM_DIR, f'{tx}_{tz}.json')
    if not os.path.exists(path):
        return []
    d = json.load(open(path))
    ox, oz = tx * TILE_SIZE, tz * TILE_SIZE
    polys = []
    for ring in d.get('lakes', []):
        if len(ring) < 4:
            continue
        world = [(p[0] + ox, p[1] + oz) for p in ring]
        poly = Polygon(world)
        if not poly.is_valid:
            poly = poly.buffer(0)
        polys.append(poly)
    return polys


def snap_bridge_to_river(wx1, wy1, wx2, wy2):
    """Reported (real iPad, screenshot): "Die Bruecke ist im nirgendwo" -- measured, not
    guessed: the raw geocoded bridge line above sits ~370m from the nearest water polygon
    fetch_overture.py's own output has for this tile (checked directly: at the bridge's own x
    range, the real river polygon's z-extent doesn't even overlap the bridge's z-extent) --
    more than the Rhine's own real width here, not a rounding error. Same lesson this project
    already learned once for thunderbolt-europe.html's synthetic bridge (CLAUDE.md 4.30/Lesson
    18): a crossing's position has to come from the SAME data the renderer actually draws the
    river from, not an independently-derived value that merely SHOULD line up with it -- doesn't
    matter here whether the landmark lon/lat or Overture's own water polygon is the less precise
    of the two, snapping onto what OSMManager actually renders is correct either way. Translates
    BOTH endpoints by the same vector (bridge length/width/orientation unchanged, only where it
    sits moves) so the span's own midpoint lands just inside the nearest real water polygon this
    tile (or an immediate neighbour, in case the true crossing sits right at a tile seam)
    actually has.
    """
    tx, tz = tile_of((wx1 + wx2) / 2, (wy1 + wy2) / 2)
    candidates = []
    for cand_tx, cand_tz in {(tx, tz), (tx - 1, tz), (tx + 1, tz), (tx, tz - 1), (tx, tz + 1)}:
        candidates.extend(_tile_water_polygons(cand_tx, cand_tz))
    if not candidates:
        print('  WARNING: no water polygon data found near the bridge -- left at raw geocoded position')
        return wx1, wy1, wx2, wy2

    mid = Point((wx1 + wx2) / 2, (wy1 + wy2) / 2)
    best_poly, best_dist = None, None
    for poly in candidates:
        d = mid.distance(poly)
        if best_dist is None or d < best_dist:
            best_poly, best_dist = poly, d

    if best_dist <= 1:   # already sits on/inside real water -- nothing to correct
        return wx1, wy1, wx2, wy2

    nearest_on_boundary = best_poly.exterior.interpolate(best_poly.exterior.project(mid))
    dx, dy = nearest_on_boundary.x - mid.x, nearest_on_boundary.y - mid.y
    # step 30m PAST the boundary (continuing the same direction) so the new midpoint sits
    # genuinely inside the water, not just grazing its edge
    step = (best_dist + 30) / best_dist
    dx, dy = dx * step, dy * step
    print(f'  snapping bridge onto real river data: was {best_dist:.1f}m from nearest mapped water, shifting ({dx:.1f},{dy:.1f})')
    return wx1 + dx, wy1 + dy, wx2 + dx, wy2 + dy


def main():
    tiles = {}

    # ---- The bridge, real coordinates, snapped onto the actually-mapped river ----
    wx1, wy1 = to_local(CFG['landmarks']['ludendorffBridgeWest']['lon'], CFG['landmarks']['ludendorffBridgeWest']['lat'])
    wx2, wy2 = to_local(CFG['landmarks']['ludendorffBridgeEast']['lon'], CFG['landmarks']['ludendorffBridgeEast']['lat'])
    wx1, wy1, wx2, wy2 = snap_bridge_to_river(wx1, wy1, wx2, wy2)
    tx, tz = tile_of((wx1 + wx2) / 2, (wy1 + wy2) / 2)
    assert tile_of(wx1, wy1) == tile_of(wx2, wy2) == (tx, tz), 'bridge endpoints must share one tile -- span is short relative to tile size, checked directly rather than assumed'
    lx1, lz1 = wx1 - tx * TILE_SIZE, wy1 - tz * TILE_SIZE
    lx2, lz2 = wx2 - tx * TILE_SIZE, wy2 - tz * TILE_SIZE
    add(tiles, tx, tz, 'bridges', {'x1': round(lx1, 1), 'z1': round(lz1, 1), 'x2': round(lx2, 1), 'z2': round(lz2, 1), 'width': 14})
    print(f'bridge: tile ({tx},{tz}) local ({lx1:.1f},{lz1:.1f}) -> ({lx2:.1f},{lz2:.1f})')

    # ---- Illustrative flak, guarding both bridge approaches ----
    bridge_mid = ((wx1 + wx2) / 2, (wy1 + wy2) / 2)
    dx, dz = wx2 - wx1, wy2 - wy1
    length = math.hypot(dx, dz)
    perp = (-dz / length, dx / length)
    for sign, label in [(1, 'west overlook'), (-1, 'east overlook')]:
        fx = bridge_mid[0] + perp[0] * 220 * sign
        fy = bridge_mid[1] + perp[1] * 220 * sign
        ftx, ftz = tile_of(fx, fy)
        add(tiles, ftx, ftz, 'flak', {'x': round(fx - ftx * TILE_SIZE, 1), 'z': round(fy - ftz * TILE_SIZE, 1)})
        print(f'flak ({label}): tile ({ftx},{ftz})')

    # ---- Factory: real "Industriegebiet Maarweg" location ----
    fx, fy = to_local(7.2215, 50.6237)
    ftx, ftz = tile_of(fx, fy)
    add(tiles, ftx, ftz, 'factories', {'x': round(fx - ftx * TILE_SIZE, 1), 'z': round(fy - ftz * TILE_SIZE, 1), 'rotY': 0.2})
    print(f'factory: tile ({ftx},{ftz})')

    # ---- Airfield: real, genuinely flat farmland parcel near Sinzig ----
    ax, ay = to_local(7.0470, 50.5993)
    atx, atz = tile_of(ax, ay)
    add(tiles, atx, atz, 'airfields', {'x': round(ax - atx * TILE_SIZE, 1), 'z': round(ay - atz * TILE_SIZE, 1), 'rotY': 0.3, 'length': 900, 'width': 40})
    print(f'airfield: tile ({atx},{atz})')

    os.makedirs(OUT_DIR, exist_ok=True)
    for (tx, tz), data in tiles.items():
        out_path = os.path.join(OUT_DIR, f'{tx}_{tz}.json')
        with open(out_path, 'w') as f:
            json.dump(data, f)
        print(f'wrote {out_path}')
    print(f'\n{len(tiles)} historical tiles written (of the {CFG["gridW"]}x{CFG["gridH"]} grid) -- the rest deliberately have none.')


if __name__ == '__main__':
    main()

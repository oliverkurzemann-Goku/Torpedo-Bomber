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
from shapely.geometry import Point, Polygon, LineString

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
    """Reported TWICE on the real iPad, two different symptoms from two different bugs in this
    one function:

    Round 1 ("Die Bruecke ist im nirgendwo"): the raw geocoded bridge line sat ~370m from the
    nearest water polygon fetch_overture.py's own output has for this tile -- more than the
    Rhine's own real width here, not a rounding error. Same lesson this project already learned
    once for thunderbolt-europe.html's synthetic bridge (CLAUDE.md 4.30/Lesson 18): a crossing's
    position has to come from the SAME data the renderer actually draws the river from. Fixed by
    translating the endpoints toward the nearest real water polygon -- but a pure translation
    preserves the ORIGINAL line's orientation, which is what caused round 2.

    Round 2 ("Die Bruecke steht laengs im Fluss", confirmed on a screenshot): measured, not
    guessed -- the original geocoded bridge direction (0.886,-0.464) has a dot product of only
    0.21 against the local river-flow-perpendicular at the crossing point (1.0 would mean
    "exactly across the river", 0 would mean "exactly along the river bank"). 0.21 means the
    round-1 fix moved the bridge INTO the water, correctly, but left it running almost parallel
    to the bank rather than across it -- exactly what "steht laengs im Fluss" describes. A pure
    translation can only ever fix WHERE a line sits, never WHICH WAY it points, so round 1 could
    never have caught this on its own.

    Round-2 fix, orientation-aware: measures the water polygon's local boundary tangent at the
    crossing (two points +-8m apart along the polygon's own exterior ring, interpolated by arc
    length -- the ring IS the riverbank here, so its tangent IS the local flow direction) and
    forces the new bridge to run PERPENDICULAR to that, not whatever the original geocoded line
    happened to point. Position comes from actually measuring the water body's width at that
    cross-section (a ray cast along the perpendicular, intersected with the polygon) rather than
    reusing the original span length, which was never guaranteed to reach both banks once the
    orientation changed -- the real historical span length is not reused, only the fact that a
    bridge is a straight line between two riverbanks.
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

    ring = best_poly.exterior
    proj = ring.project(mid)
    eps = 8.0
    p_before = ring.interpolate((proj - eps) % ring.length)
    p_after = ring.interpolate((proj + eps) % ring.length)
    tangent_len = math.hypot(p_after.x - p_before.x, p_after.y - p_before.y)
    tangent = ((p_after.x - p_before.x) / tangent_len, (p_after.y - p_before.y) / tangent_len)
    perp = (-tangent[1], tangent[0])   # perpendicular to local flow -- the way a bridge must run

    # seed point to cast the cross-section ray from: the boundary point nearest the original
    # midpoint if that midpoint isn't already inside the water, otherwise the midpoint itself
    seed = mid if best_dist <= 1 else ring.interpolate(proj)

    max_reach = 1500  # metres each way -- generous, real river crossings here are a few hundred m
    ray = LineString([(seed.x - perp[0] * max_reach, seed.y - perp[1] * max_reach),
                       (seed.x + perp[0] * max_reach, seed.y + perp[1] * max_reach)])
    inter = ray.intersection(best_poly)
    segs = list(inter.geoms) if hasattr(inter, 'geoms') else ([inter] if not inter.is_empty else [])
    segs = [g for g in segs if g.geom_type == 'LineString' and g.length > 1]
    if not segs:
        print('  WARNING: could not measure a river crossing width near the bridge -- left at raw geocoded position')
        return wx1, wy1, wx2, wy2
    # the crossing nearest the original bridge, in case the ray clips more than one water body
    crossing = min(segs, key=lambda g: g.distance(seed))

    c0, c1 = crossing.coords[0], crossing.coords[-1]
    width = math.hypot(c1[0] - c0[0], c1[1] - c0[1])
    center = ((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2)
    margin = 25   # metres of overhang past each bank, so the deck clearly lands on dry ground
    half = width / 2 + margin
    nx1, nz1 = center[0] - perp[0] * half, center[1] - perp[1] * half
    nx2, nz2 = center[0] + perp[0] * half, center[1] + perp[1] * half
    print(f'  snapping bridge onto real river data: crossing width {width:.1f}m at ({center[0]:.1f},{center[1]:.1f}), '
          f'orientation now perpendicular to local flow (was {abs((wx2-wx1)*perp[0]+(wy2-wy1)*perp[1])/math.hypot(wx2-wx1,wy2-wy1):.2f} aligned, 1.0=across)')
    return nx1, nz1, nx2, nz2


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

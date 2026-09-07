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

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, '..', 'config.json')))
OUT_DIR = os.path.join(HERE, '..', 'data', 'historical')

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


def main():
    tiles = {}

    # ---- The bridge, real coordinates ----
    wx1, wy1 = to_local(CFG['landmarks']['ludendorffBridgeWest']['lon'], CFG['landmarks']['ludendorffBridgeWest']['lat'])
    wx2, wy2 = to_local(CFG['landmarks']['ludendorffBridgeEast']['lon'], CFG['landmarks']['ludendorffBridgeEast']['lat'])
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

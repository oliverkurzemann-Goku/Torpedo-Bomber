#!/usr/bin/env python3
# ============================================================
#  fetch_dem.py -- REAL-DATA conversion tool (Python, offline, never loaded
#  by the browser), sibling to the synthetic ../../tools/convert_dem_tile.js
#  it deliberately mirrors: same DEM1 binary format, same tileSize/gridSize
#  convention -- DEMHeightProvider.js (terrain-system/HeightProvider.js)
#  needs ZERO changes to read this tool's output. Only the DATA SOURCE
#  changes: this reads real elevation instead of a hand-authored formula.
#
#  Source: Copernicus DEM GLO-30 (ESA/Airbus, ~30m posting, public, no API
#  key), served as Cloud-Optimized GeoTIFFs from a public AWS S3 bucket --
#  see https://registry.opendata.aws/copernicus-dem/. One 1x1-degree tile
#  (Copernicus_DSM_COG_10_N50_00_E007_00_DEM.tif, ~40MB) covers this
#  project's ENTIRE working area (see config.json's bboxLonLat), confirmed
#  by direct computation before writing this script -- no tile-mosaicking
#  logic needed for this particular region.
#
#  Real elevations verified directly against known geography before this
#  tool existed (ad-hoc check, see the session's own commit message): the
#  Rhine valley floor near Remagen reads ~60-70m, the surrounding
#  Westerwald/Eifel hills read several hundred metres higher -- consistent
#  with real maps, not garbage.
#
#  Pipeline: download the one source tile (EPSG:4326) -> reproject once into
#  a local UTM32N raster covering exactly this project's working area (see
#  config.json's originUTM/tileSize/gridW/gridH) -> for every terrain tile,
#  bilinearly resample a 65x65 grid from that local raster and write the
#  existing DEM1 format.
# ============================================================

import json, math, os, struct, sys
from urllib.request import urlretrieve

import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, '..', 'config.json')))

DEM_TILE_NAME = 'Copernicus_DSM_COG_10_N50_00_E007_00_DEM'
DEM_URL = f'https://copernicus-dem-30m.s3.amazonaws.com/{DEM_TILE_NAME}/{DEM_TILE_NAME}.tif'
CACHE_DIR = os.path.join(HERE, '_cache')
OUT_DIR = os.path.join(HERE, '..', 'data', 'dem')

GRID_SIZE = CFG['gridSizeDem']          # 65 samples per side, matches TerrainTile.js's PlaneGeometry
TILE_SIZE = CFG['tileSize']             # 4000 m
GRID_W, GRID_H = CFG['gridW'], CFG['gridH']
ORIGIN_X, ORIGIN_Y = CFG['originUTM']['x'], CFG['originUTM']['y']
METRES_PER_SAMPLE = TILE_SIZE / (GRID_SIZE - 1)
DST_CRS = CFG['crs']                    # EPSG:32632
LOCAL_RES = 30.0                        # metres/pixel for the intermediate UTM raster -- matches the source's own ~30m posting, no invented precision


def download_source_tile():
    os.makedirs(CACHE_DIR, exist_ok=True)
    dest = os.path.join(CACHE_DIR, f'{DEM_TILE_NAME}.tif')
    if os.path.exists(dest):
        print(f'source tile already cached: {dest} ({os.path.getsize(dest)} bytes)')
        return dest
    print(f'downloading {DEM_URL} ...')
    urlretrieve(DEM_URL, dest)
    print(f'downloaded {dest} ({os.path.getsize(dest)} bytes)')
    return dest


def reproject_to_local_utm(src_path):
    """Reprojects the one EPSG:4326 source tile into a single UTM32N raster
    covering exactly this project's working area (origin..origin+grid*tileSize
    on both axes), at LOCAL_RES metres/pixel. Doing this ONCE, rather than
    per-output-tile, means the resampling filter sees the same neighbourhood
    of source pixels consistently across every terrain tile's shared edges --
    avoids the kind of per-tile-independent-reset seam bug the SYNTHETIC
    tool's own history warns about (convert_dem_tile.js's file header)."""
    width_m = GRID_W * TILE_SIZE
    height_m = GRID_H * TILE_SIZE
    dst_width = int(math.ceil(width_m / LOCAL_RES))
    dst_height = int(math.ceil(height_m / LOCAL_RES))
    # north-up raster: row 0 is the NORTH edge (origin_y + height_m), transform
    # maps pixel (col,row) -> (originX + col*res, originY + height_m - row*res)
    dst_transform = rasterio.transform.from_origin(ORIGIN_X, ORIGIN_Y + height_m, LOCAL_RES, LOCAL_RES)

    with rasterio.open(src_path) as src:
        dst = np.zeros((dst_height, dst_width), dtype=np.float32)
        reproject(
            source=rasterio.band(src, 1),
            destination=dst,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs=DST_CRS,
            resampling=Resampling.bilinear,
        )
    return dst, dst_transform, dst_width, dst_height


def bilinear_sample(raster, transform, world_x, world_y):
    """Samples `raster` (north-up, given `transform`) at one UTM (world_x,
    world_y) point via manual bilinear interpolation -- avoids re-invoking
    rasterio's own (heavier, file-oriented) sampling API once per one of the
    ~254,800 points this script ends up needing (56 tiles * 65 * 65)."""
    inv = ~transform
    col, row = inv * (world_x, world_y)
    h, w = raster.shape
    col = min(max(col, 0.0), w - 1.0001)
    row = min(max(row, 0.0), h - 1.0001)
    c0, r0 = int(col), int(row)
    tc, tr = col - c0, row - r0
    v00 = raster[r0, c0]; v10 = raster[r0, c0 + 1]
    v01 = raster[r0 + 1, c0]; v11 = raster[r0 + 1, c0 + 1]
    v0 = v00 + (v10 - v00) * tc
    v1 = v01 + (v11 - v01) * tc
    return float(v0 + (v1 - v0) * tr)


def write_dem1(path, heights):
    header = struct.pack('<4sHf6x', b'DEM1', GRID_SIZE, METRES_PER_SAMPLE)
    with open(path, 'wb') as f:
        f.write(header)
        f.write(heights.astype('<f4').tobytes())


def main():
    src_path = download_source_tile()
    print('reprojecting source tile into local UTM32N working raster...')
    raster, transform, w, h = reproject_to_local_utm(src_path)
    print(f'local raster: {w}x{h} px @ {LOCAL_RES}m -- covers '
          f'UTM X {ORIGIN_X}..{ORIGIN_X+GRID_W*TILE_SIZE}, Y {ORIGIN_Y}..{ORIGIN_Y+GRID_H*TILE_SIZE}')
    print(f'local raster stats: min={raster.min():.1f} max={raster.max():.1f} mean={raster.mean():.1f} m')

    os.makedirs(OUT_DIR, exist_ok=True)
    count = 0
    for tz in range(GRID_H):
        for tx in range(GRID_W):
            tile_origin_x = ORIGIN_X + tx * TILE_SIZE
            tile_origin_y = ORIGIN_Y + tz * TILE_SIZE
            # DEM1's own convention is flat index = ix + gridSize*iz
            # (ix=west->east fastest, iz=south->north) -- a numpy array
            # shaped (GRID_SIZE_iz, GRID_SIZE_ix) reshaped row-major (numpy's
            # default) gives EXACTLY that layout, so heights[iz,ix] below is
            # the right assignment, not heights[ix,iz].
            heights = np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)
            for iz in range(GRID_SIZE):
                wy = tile_origin_y + iz * METRES_PER_SAMPLE
                for ix in range(GRID_SIZE):
                    wx = tile_origin_x + ix * METRES_PER_SAMPLE
                    heights[iz, ix] = bilinear_sample(raster, transform, wx, wy)
            flat = heights.reshape(-1)
            out_path = os.path.join(OUT_DIR, f'{tx}_{tz}.bin')
            write_dem1(out_path, flat)
            count += 1
    print(f'{count} real DEM tiles written to {OUT_DIR} ({GRID_W}x{GRID_H} grid).')


if __name__ == '__main__':
    main()

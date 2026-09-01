#!/usr/bin/env node
// ============================================================
//  convert_dem_tile.js — OFFLINE conversion tool (Node, never loaded by the
//  browser). This is the "DEM data -> offline conversion -> compact tile
//  file" half of the pipeline the landscape spec asked for: real elevation
//  data (a GeoTIFF or ASCII-grid DEM export, say) never belongs in the
//  browser bundle — it gets converted ONCE, offline, into small per-tile
//  binary files that DEMHeightProvider (HeightProvider.js) can fetch.
//
//  No real DEM source is available in this environment, so this script
//  authors ONE small, clearly hand-made sample tile (a hill with a river
//  valley cut through it — deliberately structured/legible, nothing like
//  the procedural noise terrain, so it's obviously test data, not a claim of
//  real Germany elevation) — proving the FORMAT and the LOADER work end to
//  end. Swapping in a real DEM parser later means rewriting the sampleHeight
//  function below to read a real raster instead of this hand-authored shape;
//  everything downstream (the binary format, DEMHeightProvider, the tile
//  streaming it eventually plugs into) does not change.
//
//  BINARY FORMAT ("DEM1"), little-endian, one file per terrain tile:
//    offset  0..3   magic bytes 'D','E','M','1' (ASCII)
//    offset  4..5   uint16  gridSize        -- samples per side (a gridSize x
//                                               gridSize grid, e.g. 65)
//    offset  6..9   float32 metresPerSample -- world metres between samples
//    offset 10..15  (reserved, zero)          -- padding to a 16-byte header
//    offset 16..    float32[gridSize*gridSize] heights, in metres, row-major,
//                    index = ix + gridSize*iz (ix=west->east, iz=south->north)
//                    -- SAME row-major convention TerrainTile.js's own PlaneGeometry
//                    vertex layout uses (see its own header comment), so a
//                    reader never has to reconcile two different orderings.
// ============================================================

const fs = require('fs');
const path = require('path');

const GRID_SIZE = 65;             // matches TERRAIN_LOD_SEGMENTS[0]+1 (64 segments) in TerrainTile.js
const TILE_SIZE = 4000;           // metres — must match the running game's own tileSize
const METRES_PER_SAMPLE = TILE_SIZE / (GRID_SIZE - 1);

// Stands in for "read one real DEM raster cell" -- a hand-authored hill with
// a river valley, in LOCAL tile coordinates (0,0) = tile's own south-west
// corner, (TILE_SIZE,TILE_SIZE) = north-east corner.
function sampleHeight(localX, localZ){
  const cx = TILE_SIZE / 2, cz = TILE_SIZE / 2;
  const dx = localX - cx, dz = localZ - cz;
  const dist = Math.hypot(dx, dz);
  const hill = Math.max(0, 260 - dist * 0.09);                 // a gentle hill toward the tile centre
  const valley = Math.max(0, 1 - Math.abs(dx - 600) / 500) * 90; // a river valley notch, off-centre
  return Math.max(0, hill - valley);
}

function buildTile(tx, tz){
  const originX = tx * TILE_SIZE, originZ = tz * TILE_SIZE;
  const heights = new Float32Array(GRID_SIZE * GRID_SIZE);
  for(let iz = 0; iz < GRID_SIZE; iz++){
    for(let ix = 0; ix < GRID_SIZE; ix++){
      const localX = ix * METRES_PER_SAMPLE, localZ = iz * METRES_PER_SAMPLE;
      heights[ix + GRID_SIZE*iz] = sampleHeight(localX, localZ);
    }
  }

  const header = Buffer.alloc(16);
  header.write('DEM1', 0, 'ascii');
  header.writeUInt16LE(GRID_SIZE, 4);
  header.writeFloatLE(METRES_PER_SAMPLE, 6);
  // bytes 10-15 stay zero (reserved)

  const body = Buffer.from(heights.buffer);
  const out = Buffer.concat([header, body]);

  const outDir = path.join(__dirname, '..', 'data', 'dem');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${tx}_${tz}.bin`);
  fs.writeFileSync(outPath, out);
  console.log(`Wrote ${outPath} (${out.length} bytes, ${GRID_SIZE}x${GRID_SIZE} samples, origin ${originX},${originZ})`);
  return outPath;
}

// Only the one sample tile the Step 6 prototype actually loads.
buildTile(0, 0);

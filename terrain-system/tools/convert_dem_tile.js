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
//  authors a hand-made sample landscape (a broad hill with a winding river
//  valley cut through it — deliberately structured/legible, nothing like
//  the procedural noise terrain, so it's obviously test data, not a claim of
//  real Germany elevation) — proving the FORMAT and the LOADER work end to
//  end. Swapping in a real DEM parser later means rewriting sampleHeight()
//  below to read a real raster instead of this hand-authored shape;
//  everything downstream (the binary format, DEMHeightProvider, the tile
//  streaming it plugs into) does not change.
//
//  Was originally ONE hand-made tile at (0,0), with sampleHeight() taking
//  TILE-LOCAL coordinates -- fine for a single isolated tile, but that
//  reset-every-tile shape would have produced a hard, visible seam at every
//  tile boundary the moment more than one tile exists side by side (each
//  tile would re-center its own hill on itself). Now generates a GRID of
//  tiles and sampleHeight() takes WORLD coordinates instead, exactly the
//  same "pure function of world position, no per-tile reset" contract
//  ProceduralHeightProvider (HeightProvider.js) already uses -- continuity
//  across tile edges is then automatic, not something each tile has to get
//  right on its own.
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

// The grid this tool generates -- exported so convert_osm_tile.js and
// convert_historical_tile.js build data for the exact same footprint
// without a second, easily-out-of-sync copy of these numbers.
const GRID_RANGE = 2;   // tx,tz each run -GRID_RANGE..+GRID_RANGE -> 5x5 = 25 tiles

// A continuous river-valley centreline, in WORLD metres -- winds slowly
// along X. convert_osm_tile.js samples this SAME function so its river
// polyline visually lines up with the valley cut into the terrain instead
// of being an independently-guessed path.
function riverCenterZ(worldX){
  return 2000 + Math.sin(worldX * 0.00035) * 2200 + Math.sin(worldX * 0.0011) * 500;
}

// Stands in for "read one real DEM raster cell" -- a hand-authored hill
// range with a river valley cut through it, now a pure function of WORLD
// position (see file header for why that matters once more than one tile
// exists).
function sampleHeight(worldX, worldZ){
  const dist = Math.hypot(worldX, worldZ);
  const hill = Math.max(0, 320 - dist * 0.022);                       // broad hill centred on the world origin
  const distToRiver = Math.abs(worldZ - riverCenterZ(worldX));
  const valley = Math.max(0, 1 - distToRiver / 550) * 100;            // valley notch following the winding river
  return Math.max(0, hill - valley);
}

function buildTile(tx, tz){
  const originX = tx * TILE_SIZE, originZ = tz * TILE_SIZE;
  const heights = new Float32Array(GRID_SIZE * GRID_SIZE);
  for(let iz = 0; iz < GRID_SIZE; iz++){
    for(let ix = 0; ix < GRID_SIZE; ix++){
      const worldX = originX + ix * METRES_PER_SAMPLE, worldZ = originZ + iz * METRES_PER_SAMPLE;
      heights[ix + GRID_SIZE*iz] = sampleHeight(worldX, worldZ);
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
  return { outPath, size: out.length };
}

if(require.main === module){
  let count = 0;
  for(let tx = -GRID_RANGE; tx <= GRID_RANGE; tx++){
    for(let tz = -GRID_RANGE; tz <= GRID_RANGE; tz++){
      const { outPath, size } = buildTile(tx, tz);
      console.log(`Wrote ${outPath} (${size} bytes, ${GRID_SIZE}x${GRID_SIZE} samples)`);
      count++;
    }
  }
  console.log(`${count} DEM tiles written, grid (${-GRID_RANGE}..${GRID_RANGE}) x (${-GRID_RANGE}..${GRID_RANGE}).`);
}

module.exports = { buildTile, sampleHeight, riverCenterZ, TILE_SIZE, GRID_SIZE, GRID_RANGE, METRES_PER_SAMPLE };
